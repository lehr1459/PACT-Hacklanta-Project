import {spawn,execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {createHash,randomBytes} from 'node:crypto';
import {mkdir,readdir,lstat,copyFile,readFile,writeFile,open,chown} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
import net from 'node:net';
import {setTimeout as delay} from 'node:timers/promises';
import assert from 'node:assert/strict';
import {root,npmCli} from '../validation/common.mjs';
import {loadRuntimePolicy} from '../validation/runtime.mjs';
import {rpcFixture} from './rpc-fixture.mjs';
import {Browser} from './browser.mjs';

export const NODE_IMAGE='node:24.22.1-bookworm-slim@sha256:55fb5f5a527ea2c5c4a95f963e48ef90aa38c7b346054fdc8ee9957a2b55d205';
const fixed=['packages/pact-sdk/package.json','packages/pact-sdk/package-lock.json','packages/pact-sdk/build.mjs','packages/pact-sdk/tsconfig.json',
  'services/pact-api/package.json','services/pact-api/package-lock.json'];
export function artifactSourceAllowed(relative){
  if(typeof relative!=='string'||relative.includes('\\')||relative.split('/').some(part=>!part||part==='.'||part==='..'||/^\.env(?:\.|$)/i.test(part)))return false;
  return fixed.includes(relative)||/^packages\/pact-sdk\/src\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+\.ts$/.test(relative)
    ||/^services\/pact-api\/src\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+\.mjs$/.test(relative)
    ||/^services\/pact-api\/migrations\/\d{3}_[a-z_]+\.sql$/.test(relative)
    ||/^services\/pact-api\/operations\/[a-z][a-z-]+\.sql$/.test(relative);
}
async function walk(directory,prefix,accept){
  const stat=await lstat(directory);if(!stat.isDirectory()||stat.isSymbolicLink())throw Error('Artifact source directory must not be linked');
  const result=[];
  for(const entry of await readdir(directory,{withFileTypes:true})){
    const relative=`${prefix}/${entry.name}`;
    if(entry.isSymbolicLink())throw Error('Artifact source symlinks are forbidden');
    if(entry.isDirectory())result.push(...await walk(path.join(directory,entry.name),relative,accept));
    else if(entry.isFile()&&accept(relative))result.push(relative);
  }
  return result;
}
export async function artifactSources(base=root){
  const files=[...fixed];
  async function ancestors(relative){let current=base;for(const part of relative.split('/').slice(0,-1)){
    current=path.join(current,part);const stat=await lstat(current);if(!stat.isDirectory()||stat.isSymbolicLink())throw Error('Artifact source ancestor must not be linked');}}
  for(const relative of['packages/pact-sdk/src','services/pact-api/src','services/pact-api/migrations','services/pact-api/operations']){
    await ancestors(relative+'/');
    files.push(...await walk(path.join(base,relative),relative,artifactSourceAllowed));
  }
  for(const relative of files){await ancestors(relative);if(!artifactSourceAllowed(relative)||!(await lstat(path.join(base,relative))).isFile())throw Error('Invalid artifact allowlist entry');}
  return files.sort();
}
export function dockerContextText(files){
  const selected=[...files,'services/pact-api/Dockerfile','services/pact-api/Dockerfile.dockerignore'].sort(),parents=new Set();
  for(const file of selected){let parent=path.posix.dirname(file);while(parent!=='.'){parents.add(parent);parent=path.posix.dirname(parent);}}
  return['**',...[...parents].sort((a,b)=>a.split('/').length-b.split('/').length||(a<b?-1:a>b?1:0)).map(value=>'!'+value+'/'),...selected.map(value=>'!'+value),''].join('\n');
}
function environment(extra={}){
  const env={};for(const key of['PATH','PATHEXT','SystemRoot','SYSTEMROOT','WINDIR','ComSpec','COMSPEC','TEMP','TMP','HOME','USERPROFILE','LOCALAPPDATA','APPDATA','LANG','LC_ALL'])
    if(process.env[key]!==undefined)env[key]=process.env[key];
  env.PATH=path.dirname(process.execPath)+path.delimiter+(env.PATH??'');return{...env,NODE_ENV:'production',...extra};
}
async function command(binary,args,{cwd=root,env={},log,timeoutMs=180000}={}){
  const target=log?await open(log,'a'):null;
  try{return await new Promise((resolve,reject)=>{
    const child=spawn(binary,args,{cwd,env:environment(env),stdio:['ignore',target?.fd??'ignore',target?.fd??'ignore'],windowsHide:true});
    const timer=setTimeout(()=>{child.kill('SIGKILL');reject(Error('Artifact command deadline'));},timeoutMs);
    child.once('error',error=>{clearTimeout(timer);reject(error);});child.once('exit',code=>{clearTimeout(timer);code===0?resolve():reject(Error('Artifact command failed'));});
  });}finally{await target?.close();}
}
async function copy(files,source,destination){for(const relative of files){const target=path.join(destination,relative);await mkdir(path.dirname(target),{recursive:true,mode:0o700});await copyFile(path.join(source,relative),target);}}
async function freePort(){const socket=net.createServer();await new Promise((resolve,reject)=>{socket.once('error',reject);socket.listen(0,'127.0.0.1',resolve);});const port=socket.address().port;await new Promise(resolve=>socket.close(resolve));return port;}
export function artifactDatabaseUrl(value){
  const url=new URL(value);if(!['postgres:','postgresql:'].includes(url.protocol)||url.hostname!=='127.0.0.1'||url.pathname!=='/pact_hosted_qa'||url.search||url.hash)throw Error('Artifact requires exact loopback QA parent database');
  return url;
}
export async function waitReady(base,child){
  const deadline=performance.now()+15000;
  while(performance.now()<deadline){
    if(child&&(child.exitCode!==null||child.signalCode!==null))throw Error('Artifact exited before readiness');
    try{const r=await fetch(base+'/v1/health/ready',{signal:AbortSignal.timeout(1500)});if(r.status===200&&(await r.json()).ready===true)return;}catch{}
    await delay(100);
  }
  throw Error('Artifact readiness deadline');
}
export async function stop(child){
  if(!child||child.exitCode!==null||child.signalCode!==null)return;
  const exited=new Promise(resolve=>child.once('exit',resolve));
  if(child.connected)child.send({stop:true});else child.kill('SIGTERM');
  let timer;
  try{
    const graceful=await Promise.race([exited.then(()=>true),new Promise(resolve=>{timer=setTimeout(()=>resolve(false),4000);})]);
    clearTimeout(timer);
    if(!graceful){child.kill('SIGKILL');await Promise.race([exited,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Owned artifact child did not exit')),2000);})]);}
  }finally{clearTimeout(timer);}
}
async function restartDelay(directory){
  const bytes=await readFile(path.join(directory,'authority.bin'));assert.equal(bytes.length,256);
  const ceiling=Number(bytes.subarray(111,127).toString('ascii'));assert.ok(Number.isSafeInteger(ceiling));
  const wait=ceiling-Date.now();if(wait>100)throw Error('Artifact clock requires owner recovery');if(wait>=0)await delay(wait+5);
}

export async function buildProductionArtifact({directory,log}){
  const source=path.join(directory,'build'),runtime=path.join(directory,'runtime'),files=await artifactSources();
  await copy(files,root,source);
  const npmEnv={NODE_ENV:'development',npm_config_userconfig:path.join(directory,'empty-user.npmrc'),npm_config_globalconfig:path.join(directory,'empty-global.npmrc'),
    npm_config_cache:path.join(directory,'npm-cache'),npm_config_registry:'https://registry.npmjs.org/'};
  await writeFile(npmEnv.npm_config_userconfig,'');await writeFile(npmEnv.npm_config_globalconfig,'');
  const npm=async(project,args)=>command(process.execPath,[npmCli(),'--prefix',path.join(project),...args],{env:npmEnv,log});
  await npm(path.join(source,'packages/pact-sdk'),['ci','--no-audit','--fund=false']);
  await npm(path.join(source,'packages/pact-sdk'),['run','build']);
  await copy(files.filter(file=>file.startsWith('services/pact-api/')||file==='packages/pact-sdk/package.json'||file==='packages/pact-sdk/package-lock.json'),source,runtime);
  const dist=await walk(path.join(source,'packages/pact-sdk/dist'),'packages/pact-sdk/dist',file=>/\.(?:js|mjs|d\.ts)$/.test(file));
  await copy(dist,source,runtime);
  await npm(path.join(runtime,'packages/pact-sdk'),['ci','--omit=dev','--ignore-scripts','--no-audit','--fund=false']);
  await npm(path.join(runtime,'services/pact-api'),['ci','--omit=dev','--ignore-scripts','--no-audit','--fund=false']);
  // The unchanged SDK lock includes TypeScript through Solana codecs' optional
  // production peer edge (devOptional), so --omit=dev legitimately retains it.
  // Refuse the local/test SQL engine and development-only build tool instead.
  for(const file of['services/pact-api/node_modules/@electric-sql/pglite','packages/pact-sdk/node_modules/esbuild']){
    await assert.rejects(lstat(path.join(runtime,file)),error=>error.code==='ENOENT');
  }
  const manifest={schemaVersion:1,kind:'private-unpacked-production-install',node:process.version,files:[]};
  for(const relative of[...files.filter(file=>file.startsWith('services/pact-api/')||file.endsWith('/package.json')||file.endsWith('/package-lock.json')),...dist].sort())
    manifest.files.push({path:relative,sha256:createHash('sha256').update(await readFile(path.join(runtime,relative))).digest('hex')});
  await writeFile(path.join(directory,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');return{runtime,manifest};
}

async function smoke({runtime,directory,log,docker=false,image}){
  const require=createRequire(new URL('../../services/pact-api/package.json',import.meta.url)),{Client}=require('pg');
  const parent=artifactDatabaseUrl(process.env.PACT_QA_DATABASE_URL??'postgresql://pact_test:pact-local-fixture-only@127.0.0.1:55439/pact_hosted_qa');
  const databaseName=`pact_hosted_qa_artifact_${randomBytes(8).toString('hex')}`;
  assert.match(databaseName,/^pact_hosted_qa_artifact_[a-f0-9]{16}$/);
  const controlUrl=new URL(parent);controlUrl.pathname='/postgres';const control=new Client({connectionString:controlUrl.href});
  const connection=new URL(parent);connection.pathname='/'+databaseName;
  const clockDirectory=path.join(directory,docker?'docker-clock':'clock');await mkdir(clockDirectory,{mode:0o700});
  const port=await freePort(),base=`http://127.0.0.1:${port}`,rpc=await rpcFixture();
  const env={PACT_HOSTED_PROFILE:'local',PACT_HOSTED_ORIGIN:base,PACT_HOSTED_PROCESS_MODEL:'single-persistent-process',PACT_HOSTED_HOST:'127.0.0.1',PACT_HOSTED_PORT:String(port),
    PACT_HOSTED_DATABASE_URL:connection.href,PACT_HOSTED_PEPPER:randomBytes(32).toString('base64url'),PACT_HOSTED_CLOCK_DIRECTORY:clockDirectory,SOLANA_RPC_URL:rpc.url};
  let child,created=false,container;
  async function launch(){
    if(docker){
      container=`pact-artifact-${randomBytes(8).toString('hex')}`;
      const uid=process.getuid?.()||1000,gid=process.getgid?.()||1000;
      if(process.getuid?.()===0)await chown(clockDirectory,uid,gid);
      const config={...env,PACT_HOSTED_CLOCK_DIRECTORY:'/pact-clock'};
      await command('docker',['run','--detach','--name',container,'--network','host','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges',
        '--user',`${uid}:${gid}`,'--mount',`type=bind,src=${clockDirectory},dst=/pact-clock`,...Object.keys(config).flatMap(key=>['--env',key]),image],{env:config,log});
      await waitReady(base);
    }else{
      const wrapper=`await import(${JSON.stringify(pathToFileURL(path.join(runtime,'services/pact-api/src/start.mjs')).href)});if(process.exitCode)process.disconnect();else process.on('message',message=>{if(message?.stop===true){process.emit('SIGTERM');process.disconnect();}});`;
      const output=await open(log,'a');
      child=spawn(process.execPath,['--input-type=module','-e',wrapper],{cwd:path.join(runtime,'services/pact-api'),env:environment(env),windowsHide:true,stdio:['ignore',output.fd,output.fd,'ipc']});
      await output.close();await waitReady(base,child);
    }
  }
  async function halt(){if(docker&&container){
    try{await command('docker',['stop','--time','4',container],{log,timeoutMs:10000});await command('docker',['rm',container],{log});}
    catch{await command('docker',['rm','--force',container],{log,timeoutMs:10000});}container=null;
  }else{await stop(child);child=null;}}
  try{
    await control.connect();await control.query(`CREATE DATABASE "${databaseName}"`);created=true;
    await command(process.execPath,[path.join(runtime,'services/pact-api/src/migrate.mjs')],{cwd:path.join(runtime,'services/pact-api'),env,log});
    await launch();
    const live=await fetch(base+'/v1/health/live');assert.equal(live.status,200);assert.equal((await live.json()).live,true);
    const malformed=await fetch(base+'/v1/credentials/validate',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer invalid'},body:'{}'});
    assert.equal(malformed.status,401);assert.equal((await malformed.json()).error.code,'API_KEY_INVALID');
    const admin=new Browser(base,base);await admin.login();
    const registered=await admin.request('POST','/v1/developer/apps',{name:'Production artifact fixture',framework:'rest'});assert.equal(registered.status,200);
    const app=registered.data.app.id,api=`/v1/developer/apps/${app}`;
    assert.equal((await admin.mutate('PATCH',api,app,'app.update',{status:'active'})).status,200);
    const issued=await admin.mutate('POST',api+'/credentials',app,'credential.create',{name:'Artifact backend',scopes:['access:check'],expiresAt:Date.now()+3600000});assert.equal(issued.status,200);
    const secret=issued.data.secret;assert.equal((await admin.key(secret)).status,200);
    await halt();await restartDelay(clockDirectory);await launch();
    assert.equal((await admin.request('GET',api)).status,200);assert.equal((await admin.key(secret)).status,200);
    assert.equal((await admin.mutate('POST',api+'/credentials/'+issued.data.credential.id+'/revoke',app,'credential.revoke',{credentialId:issued.data.credential.id})).status,200);
    assert.equal((await admin.key(secret)).status,401);
    if(docker)await command('docker',['exec',container,'node','--input-type=module','-e',
      "import fs from 'node:fs';if(process.getuid()===0)process.exit(1);if(process.version!=='v24.22.1')process.exit(3);let denied=false;try{fs.writeFileSync('/tmp/pact-write-probe','x');}catch(error){denied=error.code==='EROFS';}if(!denied)process.exit(2);"],{log});
    assert.ok(rpc.calls.every(call=>['getGenesisHash','getMultipleAccounts'].includes(call.method)));
    return{status:'passed',transport:'actual-loopback-http',profile:'local-with-native-postgres',scope:docker?'nonroot-readonly-linux-container':'fresh-unpacked-production-install',
      checks:['ready-hardened-reader','live','malformed-key-denied','signed-admin-key-mint','valid-key','graceful-restart-preserves-session-and-key','signed-revoke-denies'],
      ...(docker?{containerUser:'nonroot',rootFilesystem:'readonly',network:'host-loopback'}:{container:'not-executed'})};
  }finally{
    let stopped=false;
    try{await halt();stopped=true;}finally{await rpc.close();
      if(created&&stopped){assert.match(databaseName,/^pact_hosted_qa_artifact_[a-f0-9]{16}$/);await control.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND pid<>pg_backend_pid()',[databaseName]);await control.query(`DROP DATABASE "${databaseName}"`);}
      await control.end();}
  }
}

export async function runArtifact({docker=false}={}){
  const runtimePolicy=await loadRuntimePolicy();if(process.version!=='v'+runtimePolicy.node)throw Error('Pinned artifact runtime required');
  const npmVersion=JSON.parse(await readFile(path.resolve(path.dirname(npmCli()),'../package.json'),'utf8')).version;
  if(npmVersion!==runtimePolicy.npm)throw Error('Pinned artifact npm required');
  if(await readFile(path.join(root,'services/pact-api/Dockerfile.dockerignore'),'utf8')!==dockerContextText(await artifactSources()))throw Error('Artifact Docker context allowlist drift');
  if(docker&&process.platform!=='linux')throw Error('Docker smoke requires Linux host networking');
  const directory=path.join(root,'web/test-results/hosted-artifact',randomBytes(8).toString('hex'));await mkdir(directory,{recursive:true,mode:0o700});
  const revision=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8',env:environment()}).trim();
  const sourceDirty=execFileSync('git',['status','--porcelain','--untracked-files=normal'],{cwd:root,encoding:'utf8',env:environment()}).trim().length>0;
  const log=path.join(directory,'private.log'),receipt={schemaVersion:1,kind:'private-production-artifact',revision,sourceDirty,
    runId:process.env.PACT_HOSTED_QA_RUN_ID??null,status:'running',container:docker?'requested':'not-executed',directory:path.relative(root,directory).replaceAll('\\','/')};
  try{
    receipt.stage='production-install';const built=await buildProductionArtifact({directory,log});receipt.files=built.manifest.files.length;
    receipt.stage='unpacked-smoke';receipt.unpacked=await smoke({runtime:built.runtime,directory,log});
    if(docker){
      const image=`pact-api-artifact:${randomBytes(8).toString('hex')}`;
      receipt.stage='docker-build';await command('docker',['build','--file','services/pact-api/Dockerfile','--tag',image,'.'],{log,timeoutMs:600000});
      try{receipt.stage='docker-smoke';receipt.docker=await smoke({runtime:built.runtime,directory,log,docker:true,image});receipt.container='passed';}
      finally{await command('docker',['image','rm',image],{log});}
    }
    receipt.status='passed';return receipt;
  }catch{receipt.status='failed';throw Error('Production artifact check failed; inspect its private local receipt.');}
  finally{await writeFile(path.join(directory,'results.json'),JSON.stringify(receipt,null,2)+'\n');process.stdout.write(JSON.stringify(receipt)+'\n');}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  if(process.argv.slice(2).some(argument=>argument!=='--docker')||process.argv.slice(2).length>1)throw Error('Usage: node artifact.mjs [--docker]');
  await runArtifact({docker:process.argv.includes('--docker')});
}
