import {spawn} from 'node:child_process';
import path from 'node:path';
import assert from 'node:assert/strict';
const child=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','3006'],{cwd:path.resolve('web'),stdio:['ignore','pipe','pipe']});let stderr='';child.stderr.on('data',c=>stderr+=c);let output='';
try{await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Next startup timeout '+output+stderr)),10000);child.stdout.on('data',c=>{output+=c;if(output.includes('Ready')){clearTimeout(timer);resolve();}});child.on('exit',code=>{clearTimeout(timer);reject(Error('Next exited '+code+stderr));});});
 for(const route of ['/','/base','/integrate']){const response=await fetch('http://127.0.0.1:3006'+route);assert.equal(response.status,200);const html=await response.text();if(route!=='/base'){assert.ok(html.includes('EiiiWWsW2kkqP6nugHz6iBADvhnW5xnibAtZ82ZExVqy'));assert.ok(!html.includes('US517G5965aydkZ46HS38QLi7UQiSojurfbQfKCELFx'));}console.log(JSON.stringify({route,status:response.status,actualConfiguration:route==='/base'?'isolated preserved Base':true,syntheticProgram:html.includes('US517G5965aydkZ46HS38QLi7UQiSojurfbQfKCELFx')}));}assert.equal(stderr,'');console.log('Production actual-config HTTP smoke PASS; stderr empty.');
}finally{child.kill();await new Promise(resolve=>child.once('exit',resolve));}
