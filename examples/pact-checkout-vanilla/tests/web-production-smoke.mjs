import {spawn} from 'node:child_process';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';

const repository=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const args=process.argv.slice(2);
assert.ok(args.length===0||args.length===2&&args[0]==='--port','Usage: web-production-smoke.mjs [--port port]');
const port=args.length?Number(args[1]):3006;
assert.ok(Number.isInteger(port)&&port>0&&port<=65535,'Invalid smoke-test port');
const child=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port',String(port)],{cwd:path.join(repository,'web'),stdio:['ignore','pipe','pipe'],windowsHide:true});
let stderr='',output='';
const closed=new Promise(resolve=>child.once('close',(code,signal)=>resolve({code,signal})));
const errored=new Promise((_,reject)=>child.once('error',reject));
const ready=new Promise(resolve=>child.stdout.on('data',chunk=>{output=(output+chunk.toString()).slice(-16000);if(output.includes('Ready'))resolve();}));
child.stderr.on('data',chunk=>{stderr=(stderr+chunk.toString()).slice(-16000);});
let timer;
try {
  await Promise.race([
    ready,errored,
    closed.then(({code,signal})=>{throw Error(`Next exited before readiness (${code??signal}): ${stderr}`);}),
    new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Next startup timeout '+output+stderr)),10000);}),
  ]);
  clearTimeout(timer);
  for(const route of ['/','/base','/integrate']) {
    const response=await fetch(`http://127.0.0.1:${port}${route}`,{signal:AbortSignal.timeout(5000)});
    assert.equal(response.status,200);
    const html=await response.text();
    if(route!=='/base') {
      assert.ok(html.includes('EiiiWWsW2kkqP6nugHz6iBADvhnW5xnibAtZ82ZExVqy'));
      assert.ok(!html.includes('US517G5965aydkZ46HS38QLi7UQiSojurfbQfKCELFx'));
    }
    console.log(JSON.stringify({route,status:response.status,actualConfiguration:route==='/base'?'isolated preserved Base':true,syntheticProgram:html.includes('US517G5965aydkZ46HS38QLi7UQiSojurfbQfKCELFx')}));
  }
  assert.equal(stderr,'');
  console.log('Production actual-config HTTP smoke PASS; stderr empty.');
} catch(error) {
  const diagnostics=(output+'\n'+stderr).replace(/https?:\/\/[^\s"'<>]+/g,'[redacted URL]');
  throw new Error('Production route smoke failed; bounded server diagnostics:\n'+diagnostics,{cause:error});
} finally {
  clearTimeout(timer);
  if(child.exitCode===null&&child.signalCode===null)child.kill();
  let cleanupTimer;
  try {await Promise.race([closed,new Promise((_,reject)=>{cleanupTimer=setTimeout(()=>{child.kill('SIGKILL');reject(Error('Next smoke server did not stop within five seconds.'));},5000);})]);}
  finally {clearTimeout(cleanupTimer);}
}
