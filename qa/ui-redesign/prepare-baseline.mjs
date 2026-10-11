import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const repo=process.cwd(),revision='4123cc12f64f48def857f0d60c8d54d671daabd5';
const target=path.join(repo,'.deployment-candidates/ui-redesign/baseline');
await fs.mkdir(target,{recursive:true});
const files=execFileSync('git',['ls-tree','-r','--name-only',revision],{cwd:repo,encoding:'utf8'}).trim().split(/\r?\n/);
const manifest=[];
for(const relative of files){if(!/^(web|packages\/pact-sdk|examples|qa\/hacklanta-final|contracts|solana)\//.test(relative))continue;if(/(^|\/)(\.env[^/]*|signers?|keypairs?|node_modules|\.next|\.tools)(\/|$)/i.test(relative))continue;const bytes=execFileSync('git',['show',`${revision}:${relative}`],{cwd:repo,maxBuffer:20*1024*1024});const dest=path.join(target,relative);await fs.mkdir(path.dirname(dest),{recursive:true});await fs.writeFile(dest,bytes);manifest.push({file:relative,sha256:createHash('sha256').update(bytes).digest('hex')});}
await fs.writeFile(path.join(target,'baseline-source-manifest.json'),JSON.stringify({revision,files:manifest},null,2));
console.log(`Extracted ${manifest.length} immutable public files from ${revision}.`);
for(const relative of ['packages/pact-sdk/node_modules','web/node_modules','examples/pact-demo-app/node_modules','contracts/lib']){console.log('Copying existing public dependencies '+relative);await fs.cp(path.join(repo,relative),path.join(target,relative),{recursive:true,dereference:true,force:true});}
await fs.cp(path.join(repo,'packages/pact-sdk/dist'),path.join(target,'packages/pact-sdk/dist'),{recursive:true,force:true});
for(const relative of ['web/node_modules/@pact/sdk','examples/pact-demo-app/node_modules/@pact/sdk']){for(const entry of ['dist','package.json','README.md'])await fs.cp(path.join(target,'packages/pact-sdk',entry),path.join(target,relative,entry),{recursive:true,force:true});}
const saturday=path.join(target,'.deployment-candidates/20261010-213948-8755f031/saturday-lights');
await fs.cp(path.join(repo,'.deployment-candidates/20261010-213948-8755f031/saturday-lights'),saturday,{recursive:true,dereference:true,filter:source=>!source.split(path.sep).some(part=>['node_modules','.git'].includes(part))});
await fs.cp('C:/Hackathon/saturday-lights/node_modules',path.join(saturday,'node_modules'),{recursive:true,dereference:true});
console.log('Baseline prepared; serving outputs and dependency inputs untouched.');
