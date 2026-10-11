// Read public source/artifacts only. No repository writes, builds or chain calls.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
const root=path.resolve(import.meta.dirname,'../..');
const revision='26fc35e680b8c089ba3a9c0457435814447ff1b7';
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',maxBuffer:20*1024*1024}).trimEnd();
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const allowed=new Set(['web/components/solana-app.tsx','web/app/globals.css','docs/DECISIONS.md','docs/STATUS.md','docs/HANDOFF.md']);
const additions=new Set([
 'web/lib/solana/purchase-link.ts','web/components/purchase-link-share.tsx',
 'web/tests/solana/purchase-link-browser.spec.ts','web/tests/solana/purchase-link-helper.spec.ts','web/tests/solana/purchase-link-live.spec.ts',
 'qa/one-link/build.mjs','qa/one-link/helpers.config.ts','qa/one-link/overlay.mjs','qa/one-link/prepare.mjs','qa/one-link/preservation.mjs','qa/one-link/run-acceptance.mjs',
 'docs/ONE_LINK_PURCHASING.md','docs/ONE_LINK_QA.md'
]);
const changed=git('diff','--name-only',revision).split(/\r?\n/).filter(Boolean);
const failures=changed.filter(file=>!allowed.has(file)&&!additions.has(file)).map(file=>({file,reason:'Unexpected tracked change'}));
const entries=git('ls-tree','-r',revision).split(/\r?\n/).map(line=>{const [info,file]=line.split('\t');return {file,blob:info.split(' ')[2]};});
let protectedSources=0;
for(const entry of entries){
 if(allowed.has(entry.file)||! /^(web|packages\/pact-sdk|examples|contracts|solana)\//.test(entry.file))continue;
 if(/(^|\/)(\.env[^/]*|signers?|keypairs?|node_modules|\.next|\.tools)(\/|$)/i.test(entry.file))continue;
 const file=path.join(root,entry.file);
 // Historical source blobs include both CRLF and LF. Accept exact bytes first,
 // then Git's own checkout normalization; do not flag an unchanged CRLF blob.
 if(!fs.existsSync(file)||(git('hash-object','--no-filters',file)!==entry.blob&&git('hash-object','--path='+entry.file,file)!==entry.blob))failures.push({file:entry.file,reason:'Protected source blob changed'});
 else protectedSources++;
}
const old=JSON.parse(fs.readFileSync(path.join(root,'.deployment-candidates/ui-redesign/baseline.json'),'utf8'));
const tags=git('show-ref','--tags').split(/\r?\n/);
for(const tag of old.tags)if(!tags.includes(tag))failures.push({file:'Git tags',reason:'Protected tag changed'});
let servingArtifacts=0;
for(const entry of old.servingArtifacts){
 const file=path.join(root,entry.path);
 if(!fs.existsSync(file)||sha(fs.readFileSync(file))!==entry.sha256)failures.push({file:entry.path,reason:'Protected serving artifact changed'});
 else servingArtifacts++;
}
const saturdayRoot=path.resolve('C:/Hackathon/saturday-lights');
const saturdayEntries=JSON.parse(fs.readFileSync(path.join(root,'.deployment-candidates/ui-redesign/saturday-baseline.json'),'utf8').replace(/^\uFEFF/,''));
let saturdayFiles=0;
for(const entry of saturdayEntries){
 const file=path.resolve(entry.Path);
 if(!file.toLowerCase().startsWith(saturdayRoot.toLowerCase()+path.sep)||/(?:^|[\\/])(?:\.env(?!\.example$)|[^\\/]*(?:private.?key|keypair|credentials)[^\\/]*\.(?:json|pem|key|txt|env))$/i.test(file)){
  failures.push({file:entry.Path,reason:'Outside public preservation scope'});continue;
 }
 if(!fs.existsSync(file)||sha(fs.readFileSync(file)).toLowerCase()!==entry.Sha256.toLowerCase())failures.push({file:entry.Path,reason:'Original Saturday hash changed'});
 else saturdayFiles++;
}
const artifact='solana/artifacts/pact_licensing.so';
const artifactSha256=sha(fs.readFileSync(path.join(root,artifact)));
if(artifactSha256!=='d13828b060327ef9f702b076b8681e4b9e1e8c04f961191d1df17b2babf52a62')failures.push({file:artifact,reason:'Reviewed program artifact changed'});
const branch=git('branch','--show-current');
if(branch!=='feat/one-link-purchasing')failures.push({file:'Git branch',reason:'Unexpected feature branch'});
console.log(JSON.stringify({pass:failures.length===0,revision,branch,protectedSources,protectedTags:old.tags.length,servingArtifacts:{passed:servingArtifacts,total:old.servingArtifacts.length},saturday:{passed:saturdayFiles,total:saturdayEntries.length},programArtifactSha256:artifactSha256,authorizedTrackedChanges:changed,failures,limitations:['Transaction-function and legacy control preservation require independent Backend/Reviewer source review.','Source preservation alone does not verify browser behavior or visual quality.']},null,2));
process.exitCode=failures.length?1:0;
