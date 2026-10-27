import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,writeFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {assertPackageContents,runPackageCommand,verifyConsumerReceipt,REQUIRED_CONSUMER_CHECKS} from './sdk.mjs';
const manifest=JSON.parse(await readFile(new URL('../../packages/pact-sdk/package.json',import.meta.url),'utf8'));
function fixture(){
  const targets=Object.values(manifest.exports).flatMap(value=>typeof value==='string'?[value]:Object.values(value)).map(value=>value.replace(/^\.\//,''));
  return {name:'@pact/sdk',version:manifest.version,integrity:'sha512-'+'A'.repeat(86)+'==',files:[...new Set(['package.json','README.md','CHANGELOG.md','DISTRIBUTION.md',...targets])].map(path=>({path}))};
}
test('package gate rejects private/source/fixture paths, duplicate entries and incomplete exports',()=>{
  assert.doesNotThrow(()=>assertPackageContents(fixture(),manifest));
  for(const path of ['.env','private-key.json','src/index.ts','tests/fixture.js','node_modules/secret.js','dist/../.env','dist/internal/key.pem','dist/unreviewed/data.js']){
    const pack=fixture();pack.files.push({path});assert.throws(()=>assertPackageContents(pack,manifest),'Unsafe package entry '+path);
  }
  const duplicate=fixture();duplicate.files.push(duplicate.files[0]);assert.throws(()=>assertPackageContents(duplicate,manifest),/Duplicate/);
  const missing=fixture();missing.files=missing.files.filter(file=>file.path!=='dist/server.js');assert.throws(()=>assertPackageContents(missing,manifest),/Export missing/);
  const removed=structuredClone(manifest);delete removed.exports['./server'];assert.throws(()=>assertPackageContents(fixture(),removed),/public export missing/);
});
test('consumer evidence must bind the exact clean revision, runtime and package artifact',()=>{
  const candidate={revision:'a'.repeat(40),runtime:{node:process.version},package:{version:'0.2.0',filename:'pact-sdk-0.2.0.tgz',sha256:'b'.repeat(64),integrity:fixture().integrity,files:assertPackageContents(fixture(),manifest)}};
  const checks=REQUIRED_CONSUMER_CHECKS.map(name=>({name,status:'pass'}));
  const report={status:'pass',revision:candidate.revision,node:process.version,workingTreeClean:true,package:{...candidate.package},checks};
  assert.doesNotThrow(()=>verifyConsumerReceipt(report,candidate));
  for(const change of [r=>{r.revision='c'.repeat(40);},r=>{r.workingTreeClean=false;},r=>{r.package.sha256='d'.repeat(64);},r=>{r.node='v0.0.0';},r=>{r.checks[0].status='fail';},r=>{r.checks.shift();}]){
    const bad=structuredClone(report);change(bad);assert.throws(()=>verifyConsumerReceipt(bad,candidate));
  }
  for(const name of REQUIRED_CONSUMER_CHECKS){const bad=structuredClone(report);bad.checks=bad.checks.filter(check=>check.name!==name);bad.checks.push({name:'arbitrary replacement',status:'pass'});assert.throws(()=>verifyConsumerReceipt(bad,candidate),/Required consumer evidence missing/);}
  const duplicate=structuredClone(report);duplicate.checks.push(duplicate.checks[0]);assert.throws(()=>verifyConsumerReceipt(duplicate,candidate),/Duplicate/);
});
test('timed-out package command terminates its owned npm/build process tree',async()=>{
  const directory=await mkdtemp(path.join(os.tmpdir(),'pact-release-timeout-'));
  try{
    await writeFile(path.join(directory,'package.json'),JSON.stringify({private:true,scripts:{hold:'node hold.mjs'}}));
    await writeFile(path.join(directory,'hold.mjs'),`import {spawn} from 'node:child_process';import {writeFileSync} from 'node:fs';const child=spawn(process.execPath,['-e',"setInterval(()=>{},1000)"],{stdio:'inherit',windowsHide:true});writeFileSync('owned-child.pid',String(child.pid));setInterval(()=>{},1000);`);
    const environment={...process.env,PATH:path.dirname(process.execPath)+path.delimiter+process.env.PATH};
    const started=Date.now();
    await assert.rejects(runPackageCommand(['run','hold'],directory,environment,path.join(directory,'output.log'),{timeoutMs:2000}),/release command/);
    assert.ok(Date.now()-started<6000,'Timed-out command must return within a bounded grace period');
    const pid=Number(await readFile(path.join(directory,'owned-child.pid'),'utf8'));assert.ok(Number.isInteger(pid)&&pid>0);
    await new Promise(resolve=>setTimeout(resolve,150));
    let running=true;try{process.kill(pid,0);}catch(error){assert.equal(error.code,'ESRCH');running=false;}
    if(running&&process.platform==='linux'){
      try{running=!/^\d+ \(.*\) Z /.test(await readFile(`/proc/${pid}/stat`,'utf8'));}catch(error){if(error.code==='ENOENT')running=false;else throw error;}
    }
    assert.equal(running,false,'Descendant must not execute after command timeout');
  }finally{
    assert.ok(directory.startsWith(path.join(os.tmpdir(),'pact-release-timeout-')));
    await rm(directory,{recursive:true,force:true});
  }
});
