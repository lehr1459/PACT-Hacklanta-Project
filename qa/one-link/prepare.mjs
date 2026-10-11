// Export public source and physically copy existing dependencies into isolated QA workspaces.
import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const root=process.cwd(),stage=process.argv[2]??'baseline';
if(!['baseline','final'].includes(stage))throw Error('Expected baseline or final');
const revision='26fc35e680b8c089ba3a9c0457435814447ff1b7';
const target=path.join(root,'.deployment-candidates/one-link',stage);
await fs.mkdir(target,{recursive:true});
const files=execFileSync('git',['ls-tree','-r','--name-only',revision],{cwd:root,encoding:'utf8'}).trim().split(/\r?\n/);
const additions=['web/lib/solana/purchase-link.ts','web/components/purchase-link-share.tsx'];
if(stage==='final'){
 for(const entry of await fs.readdir(path.join(root,'web/tests/solana')))if(entry.startsWith('purchase-link'))additions.push('web/tests/solana/'+entry);
}
const manifest=[];
for(const relative of [...new Set([...files,...(stage==='final'?additions:[])])]){
 if(!/^(web|packages\/pact-sdk|examples|qa\/hacklanta-final|contracts|solana)\//.test(relative))continue;
 if(/(^|\/)(\.env[^/]*|signers?|keypairs?|node_modules|\.next|\.tools)(\/|$)/i.test(relative))continue;
 if(stage==='final'&&!(await fs.stat(path.join(root,relative)).catch(()=>null)))continue;
 const bytes=stage==='baseline'?execFileSync('git',['show',`${revision}:${relative}`],{cwd:root,maxBuffer:20*1024*1024}):await fs.readFile(path.join(root,relative));
 const dest=path.join(target,relative);await fs.mkdir(path.dirname(dest),{recursive:true});await fs.writeFile(dest,bytes);
 manifest.push({file:relative,sha256:createHash('sha256').update(bytes).digest('hex')});
}
await fs.writeFile(path.join(target,'source-manifest.json'),JSON.stringify({revision,stage,files:manifest},null,2));
console.log(`Exported ${manifest.length} public ${stage} sources; original private/environment/generated files excluded.`);
const dependencyRoot=stage==='baseline'?root:path.join(root,'.deployment-candidates/one-link/baseline');
const dependencies=['web/node_modules','packages/pact-sdk/node_modules','examples/pact-demo-app/node_modules','contracts/lib','packages/pact-sdk/dist'];
const copied=await Promise.allSettled(dependencies.map(async relative=>{
 await fs.cp(path.join(dependencyRoot,relative),path.join(target,relative),{recursive:true,dereference:true,force:true});
 console.log('Physically copied existing '+relative);
}));
for(const result of copied)if(result.status==='rejected')throw result.reason;
const saturdayRelative='.deployment-candidates/20261010-213948-8755f031/saturday-lights';
const saturday=path.join(target,saturdayRelative);
await fs.cp(path.join(root,saturdayRelative),saturday,{recursive:true,dereference:true,filter:source=>!source.split(path.sep).some(part=>['node_modules','.git','.next'].includes(part)||part.startsWith('.env'))});
await fs.cp(path.join('C:/Hackathon/saturday-lights','node_modules'),path.join(saturday,'node_modules'),{recursive:true,dereference:true});
console.log('Copied isolated Saturday release fixture and existing dependencies; original Saturday source and all serving outputs untouched.');
