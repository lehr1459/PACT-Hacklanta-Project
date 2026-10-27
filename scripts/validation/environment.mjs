// Validate supplied configuration without loading, reading or changing any .env file.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';

const repository=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const directories={marketplace:'web',platform:'examples/pact-platform-app',demo:'examples/pact-demo-app'};
export async function environmentFunctions(){
  const require=createRequire(path.join(repository,'packages/pact-sdk/package.json'));
  // Node24 supports synchronous ESM require for this no-top-level-await entry.
  // Keep a filesystem public-export require: Next's TypeScript config loader
  // rewrites dynamic import(file: URLs) into require(file: URLs) on Windows.
  return require('@pact/sdk/server');
}
async function readSavedBuild(directory){
  const manifest=JSON.parse(await fs.readFile(path.join(directory,'.next/required-server-files.json'),'utf8'));
  const encoded=manifest?.config?.env?.PACT_BUILD_BINDING_JSON;
  assert.equal(manifest.version,1,'Unsupported saved Next configuration');
  assert.ok(typeof encoded==='string'&&Buffer.byteLength(encoded)<96000,'Saved public build binding is required');
  const binding=JSON.parse(encoded);
  assert.equal(binding?.schemaVersion,1,'Unsupported saved build binding');
  return {binding,env:manifest.config.env};
}
export async function readBuildBinding(directory){return (await readSavedBuild(directory)).binding;}
export async function validateEnvironment({application,phase,environment=process.env,directory=path.join(repository,directories[application]??'INVALID'),expectedBinding}={}){
  assert.ok(Object.hasOwn(directories,application),'Unknown application');
  assert.ok(['development','build','start'].includes(phase),'Unknown validation phase');
  if(['test','ci','preview','hosted'].includes(environment.PACT_ENV_PROFILE)){
    for(const parent of [repository,directory])for(const name of ['.env','.env.local','.env.production','.env.production.local','.env.development','.env.development.local','.env.test','.env.test.local']){
      let exists=true;try{await fs.lstat(path.join(parent,name));}catch(error){if(error.code!=='ENOENT')throw Error('Environment-file metadata check failed');exists=false;}
      assert.equal(exists,false,'Active environment files are not allowed for this validation profile');
    }
  }
  const sdk=await environmentFunctions();
  const binding=expectedBinding??(phase==='start'?await readBuildBinding(directory):undefined);
  const resolved=sdk.resolvePactEnvironment({application,phase,environment,expectedBinding:binding});
  return sdk.publicEnvironmentBinding(resolved);
}

/** Next config integration. Every env field returned here is intentionally public. */
export async function nextEnvironmentConfig({application,directory,phase,environment=process.env}){
  const starting=phase==='phase-production-server',building=phase==='phase-production-build';
  const validationPhase=starting?'start':building?'build':'development';
  const saved=starting?await readSavedBuild(directory):undefined;
  const binding=await validateEnvironment({application,phase:validationPhase,directory,environment,...(saved?{expectedBinding:saved.binding}:{})});
  let provenance;
  if(starting){
    const env=saved.env;
    provenance=Object.fromEntries(['PACT_BUILD_SOURCE_REVISION','PACT_BUILD_SOURCE_CLEAN','PACT_BUILD_ENV_FILES_ABSENT','PACT_BUILD_PUBLIC_ENV_SAFE'].map(name=>[name,env[name]]));
    assert.match(provenance.PACT_BUILD_SOURCE_REVISION??'',/^[0-9a-f]{40}$/,'Saved source revision is required');
    for(const name of ['PACT_BUILD_SOURCE_CLEAN','PACT_BUILD_ENV_FILES_ABSENT','PACT_BUILD_PUBLIC_ENV_SAFE'])assert.ok(['true','false'].includes(provenance[name]),'Saved source provenance is required');
  }else{
    let revision='uncommitted',clean=false;
    try{
      revision=execFileSync('git',['--no-replace-objects','rev-parse','HEAD'],{cwd:repository,encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','ignore']}).trim();
      clean=execFileSync('git',['status','--porcelain','--untracked-files=all'],{cwd:repository,encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','ignore']}).trim()==='';
    }catch{/* A development source copy is not release evidence. */}
    let absent=true;
    for(const parent of [repository,directory])for(const name of ['.env','.env.local','.env.production','.env.production.local','.env.development','.env.development.local','.env.test','.env.test.local']){
      try{await fs.lstat(path.join(parent,name));absent=false;}catch(error){if(error.code!=='ENOENT')throw Error('Build environment-file metadata check failed');}
    }
    const allowed=new Set(['NEXT_PUBLIC_PACT_SOLANA_PROGRAM_ID','NEXT_PUBLIC_SOLANA_RPC_URL','NEXT_PUBLIC_PACT_OFFER','NEXT_PUBLIC_PACT_MARKETPLACE_URL','NEXT_PUBLIC_PACT_METADATA','NEXT_PUBLIC_PACT_CONTRACT_ADDRESS','NEXT_PUBLIC_RPC_URL','NEXT_PUBLIC_CHAIN_ID']);
    const publicSafe=Object.keys(environment).filter(name=>name.startsWith('NEXT_PUBLIC_')).every(name=>allowed.has(name));
    provenance={PACT_BUILD_SOURCE_REVISION:revision,PACT_BUILD_SOURCE_CLEAN:String(clean),PACT_BUILD_ENV_FILES_ABSENT:String(absent),PACT_BUILD_PUBLIC_ENV_SAFE:String(publicSafe)};
  }
  if(['hosted','preview'].includes(binding.profile)){
    assert.match(provenance.PACT_BUILD_SOURCE_REVISION,/^[0-9a-f]{40}$/,'Hosted builds require a committed source revision');
    for(const name of ['PACT_BUILD_SOURCE_CLEAN','PACT_BUILD_ENV_FILES_ABSENT','PACT_BUILD_PUBLIC_ENV_SAFE'])assert.equal(provenance[name],'true','Hosted builds require clean committed inputs and explicit injected configuration');
  }
  return {env:{PACT_BUILD_BINDING_JSON:JSON.stringify(binding),...provenance}};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  const args=process.argv.slice(2);
  if(args.length!==4||args[0]!=='--application'||args[2]!=='--phase'){
    console.error('Usage: node scripts/validation/environment.mjs --application marketplace|platform|demo --phase development|build|start');process.exitCode=1;
  }else validateEnvironment({application:args[1],phase:args[3]}).then(binding=>console.log(JSON.stringify({kind:'public-environment-check',binding,deployable:false}))).catch(error=>{
    // URLs, agreement text and provider exceptions never enter diagnostics.
    console.error(error?.code==='ENVIRONMENT_INVALID'||error?.code==='BUILD_ENVIRONMENT_MISMATCH'?error.message:'Environment validation failed; check profile, saved build and environment-file metadata.');process.exitCode=1;
  });
}
