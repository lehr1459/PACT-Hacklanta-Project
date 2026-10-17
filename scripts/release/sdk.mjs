// Prepare a local SDK candidate from committed Git blobs. Never publishes.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync,spawn} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import os from 'node:os';
import path from 'node:path';
import {assertClean} from '../solana/provenance.mjs';
import {npmCli,root} from '../validation/common.mjs';
import {loadRuntimePolicy} from '../validation/runtime.mjs';

const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const sources=new Set(['package.json','package-lock.json','tsconfig.json','build.mjs','README.md','CHANGELOG.md','DISTRIBUTION.md']);
export function assertPackageContents(pack,manifest){
  assert.equal(pack.name,'@pact/sdk');assert.equal(pack.version,manifest.version);
  assert.match(pack.integrity,/^sha512-[A-Za-z0-9+/]{86}==$/,'Invalid package integrity');
  for(const name of ['.','./checkout','./widget','./v1','./server','./react','./pact-checkout.mjs','./pact-checkout.js'])assert.ok(Object.hasOwn(manifest.exports,name),'Compatible public export missing');
  assert.ok(Array.isArray(pack.files)&&pack.files.length>8&&pack.files.length<200);
  const entries=pack.files.map(file=>file.path);
  assert.equal(new Set(entries).size,entries.length,'Duplicate package entries');
  for(const entry of entries)assert.ok(['package.json','README.md','CHANGELOG.md','DISTRIBUTION.md'].includes(entry)||/^dist\/(?:internal\/)?[a-zA-Z0-9_-]+(?:\.d)?\.(?:js|mjs|ts)$/.test(entry),'Unexpected SDK package content');
  for(const document of ['package.json','README.md','CHANGELOG.md','DISTRIBUTION.md'])assert.ok(entries.includes(document),'Required package document missing');
  for(const target of Object.values(manifest.exports))for(const value of typeof target==='string'?[target]:Object.values(target))assert.ok(entries.includes(value.replace(/^\.\//,'')),'Export missing from SDK package');
  return entries.sort();
}
async function safeOutput(){
  const parent=path.join(root,'web/test-results/sdk-release');
  for(let cursor=parent;cursor!==root;cursor=path.dirname(cursor)){
    try{assert.equal((await fs.lstat(cursor)).isSymbolicLink(),false,'Release output must not traverse symlinks');}catch(error){if(error.code!=='ENOENT')throw error;}
  }
  await fs.mkdir(parent,{recursive:true});return fs.mkdtemp(path.join(parent,'candidate-'));
}
function git(args){return execFileSync('git',['--no-replace-objects',...args],{cwd:root,windowsHide:true,maxBuffer:20_000_000,stdio:['ignore','pipe','pipe']});}
export async function runPackageCommand(args,cwd,environment,log,{timeoutMs=180000}={}){
  assert.ok(Number.isInteger(timeoutMs)&&timeoutMs>=1&&timeoutMs<=180000,'Invalid release command deadline');
  const handle=await fs.open(log,'w');
  try{return await new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,[npmCli(),...args],{cwd,env:environment,windowsHide:true,detached:process.platform!=='win32',stdio:['ignore','pipe','pipe']});
    const chunks=[],stdout=[];let size=0,timedOut=false,overflow=false,finished=false,stopping=false,parentExited=false,hardTimer;
    const finish=async(error,code)=>{if(finished)return;finished=true;clearTimeout(timer);clearTimeout(hardTimer);try{await handle.writeFile(Buffer.concat(chunks));if(error)throw error;assert.ok(!timedOut&&!overflow&&code===0,'SDK release command failed; inspect its bounded log');resolve(Buffer.concat(stdout).toString('utf8'));}catch(failure){reject(failure);}};
    const stop=()=>{
      if(stopping)return;stopping=true;
      if(Number.isInteger(child.pid)&&child.pid>0){
        if(process.platform==='win32'){
          // Never target a PID after its owned parent has exited and could be reused.
          if(!parentExited){const killer=spawn('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});killer.on('error',()=>{try{child.kill();}catch{}});killer.unref();}
        }else{try{process.kill(-child.pid,'SIGKILL');}catch{try{child.kill();}catch{}}}
      }
      hardTimer??=setTimeout(()=>{child.stdout.destroy();child.stderr.destroy();child.unref();void finish(Error('SDK release command exceeded its bounded deadline'));},3000);
    };
    const timer=setTimeout(()=>{timedOut=true;stop();},timeoutMs);
    for(const stream of [child.stdout,child.stderr])stream.on('data',chunk=>{if(finished)return;size+=chunk.length;if(size>2_000_000){overflow=true;stop();return;}chunks.push(chunk);if(stream===child.stdout)stdout.push(chunk);});
    child.once('error',error=>{void finish(error);});
    child.once('exit',()=>{parentExited=true;});
    child.once('close',code=>{void finish(undefined,code);});
  });}finally{await handle.close();}
}
export const REQUIRED_CONSUMER_CHECKS=Object.freeze([
  'tarball contents and all compatible exports',
  'Node/vanilla JS/server behavior without React or DOM',
  'vanilla TypeScript public declarations with React absent',
  'portable documentation examples against the installed SDK tarball',
  'clean tarball installations without sibling dependency leakage',
  'React optional entrypoint and real server rendering',
  'Next production build, public types and Node server entrypoint',
  'real Next SSR and same-origin server-only route',
  'Next browser hydration, real SDK verification and React checkout',
  'React18 independent install, server render and browser StrictMode mount',
  'vanilla browser ESM and IIFE assets from the installed package',
  'server entrypoint rejected by a real Next client build',
]);
export function verifyConsumerReceipt(report,candidate){
  assert.equal(report.status,'pass','Packed consumers must pass');
  assert.equal(report.revision,candidate.revision,'Consumer receipt belongs to another source revision');
  assert.equal(report.workingTreeClean,true,'Consumer evidence requires clean source');
  assert.equal(report.node,candidate.runtime.node,'Consumer runtime must match release runtime');
  for(const key of ['version','filename','sha256','integrity'])assert.equal(report.package?.[key],candidate.package[key],'Consumer SDK artifact mismatch');
  assert.deepEqual([...report.package.files].sort(),candidate.package.files,'Consumer package content differs');
  assert.ok(Array.isArray(report.checks)&&report.checks.length>=12&&report.checks.every(check=>check.status==='pass'),'Incomplete packed consumer checks');
  const names=report.checks.map(check=>check.name);assert.equal(new Set(names).size,names.length,'Duplicate consumer check');
  for(const name of REQUIRED_CONSUMER_CHECKS)assert.ok(names.includes(name),'Required consumer evidence missing: '+name);
}
export async function prepareSdk({consumerReport}={}){
  const revision=assertClean(root);
  const runtime=await loadRuntimePolicy();
  assert.equal(process.version,'v'+runtime.node,'Use the approved SDK release runtime');
  const actualNpm=execFileSync(process.execPath,[npmCli(),'--version'],{encoding:'utf8',windowsHide:true}).trim();
  assert.equal(actualNpm,runtime.npm,'Use the approved npm version');
  const output=await safeOutput(),temporary=await fs.mkdtemp(path.join(os.tmpdir(),'pact-sdk-release-'));
  const environment={};
  for(const key of ['SystemRoot','WINDIR','ComSpec','TEMP','TMP','USERPROFILE','LOCALAPPDATA','APPDATA','HOME'])if(process.env[key])environment[key]=process.env[key];
  environment.PATH=path.dirname(process.execPath)+path.delimiter+(process.env.PATH??'');
  environment.NEXT_TELEMETRY_DISABLED='1';environment.CI='1';
  const userConfig=path.join(temporary,'npm-userconfig'),globalConfig=path.join(temporary,'npm-globalconfig');
  await fs.writeFile(userConfig,'');await fs.writeFile(globalConfig,'');
  Object.assign(environment,{NPM_CONFIG_USERCONFIG:userConfig,NPM_CONFIG_GLOBALCONFIG:globalConfig,NPM_CONFIG_CACHE:path.join(temporary,'npm-cache'),NPM_CONFIG_REGISTRY:'https://registry.npmjs.org'});
  const tracked=git(['ls-tree','-r','--name-only','-z',revision,'--','packages/pact-sdk']).toString('utf8').split('\0').filter(Boolean);
  const inputs={};let total=0;
  for(const file of tracked){
    const relative=file.slice('packages/pact-sdk/'.length);
    if(!sources.has(relative)&&!/^src\/(?:internal\/)?[a-zA-Z0-9_-]+\.ts$/.test(relative))continue;
    const blob=git(['rev-parse',`${revision}:${file}`]).toString('utf8').trim();
    const bytes=git(['cat-file','blob',blob]);total+=bytes.length;
    assert.ok(total<=10_000_000,'SDK source export exceeds limit');inputs[file]={sha256:sha(bytes),gitBlob:blob};
    for(const run of ['first','second']){const destination=path.join(temporary,run,relative);await fs.mkdir(path.dirname(destination),{recursive:true});await fs.writeFile(destination,bytes);}
  }
  for(const filename of sources)assert.ok(inputs['packages/pact-sdk/'+filename],'Required committed SDK input missing');
  const candidates=[];
  for(const run of ['first','second']){
    const directory=path.join(temporary,run),manifest=JSON.parse(await fs.readFile(path.join(directory,'package.json'),'utf8'));
    assert.equal(manifest.private,true,'Candidate must remain private until owner approval');
    for(const [label,args] of [['install',['ci','--ignore-scripts','--no-audit','--no-fund']],['build',['run','build']],['pack',['pack','--ignore-scripts','--json']]]){
      const result=await runPackageCommand(args,directory,environment,path.join(output,run+'-'+label+'.log'));
      if(label==='pack'){
        const parsed=JSON.parse(result);assert.equal(parsed.length,1);const pack=parsed[0],files=assertPackageContents(pack,manifest);
        assert.equal(pack.filename,`pact-sdk-${manifest.version}.tgz`,'Unexpected SDK archive filename');
        const bytes=await fs.readFile(path.join(directory,pack.filename));
        assert.equal(pack.integrity,'sha512-'+createHash('sha512').update(bytes).digest('base64'),'npm integrity differs from actual tarball bytes');
        candidates.push({version:manifest.version,filename:pack.filename,sha256:sha(bytes),integrity:pack.integrity,files,sizeBytes:bytes.length});
        if(run==='first')await fs.writeFile(path.join(output,pack.filename),bytes,{flag:'wx'});
      }
    }
  }
  assert.deepEqual(candidates[0],candidates[1],'Independent SDK package builds differ');
  assert.equal(assertClean(root),revision,'Source changed during package preparation');
  const receipt={schemaVersion:1,kind:'local-reproducible-sdk-candidate',revision,preparedAt:new Date().toISOString(),runtime:{node:process.version,npm:actualNpm,nodeExecutableSha256:sha(await fs.readFile(process.execPath)),npmCliSha256:sha(await fs.readFile(npmCli()))},inputs,independentBuilds:2,package:candidates[0],published:false,distributionApproved:false,consumerValidationRequired:true};
  if(consumerReport){const bytes=await fs.readFile(path.resolve(root,consumerReport));verifyConsumerReceipt(JSON.parse(bytes.toString('utf8')),receipt);receipt.consumerValidation={passed:true,reportSha256:sha(bytes)};}
  await fs.writeFile(path.join(output,'sdk-release.json'),JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});
  return {output,receipt};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  const args=process.argv.slice(2);
  if(!(args.length===0||args.length===2&&args[0]==='--consumer-report')){console.error('Usage: node scripts/release/sdk.mjs [--consumer-report <packed-report.json>]');process.exitCode=1;}
  else prepareSdk({consumerReport:args[1]}).then(result=>console.log(JSON.stringify(result,null,2))).catch(error=>{console.error(error.message);process.exitCode=1;});
}
