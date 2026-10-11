// Reviewed isolation/build recipes with a separate candidate and evidence namespace.
import fs from 'node:fs/promises';
import path from 'node:path';
const action=process.argv[2];
if(!['build','prepare-tests','acceptance'].includes(action))throw Error('Expected build, prepare-tests or acceptance');
if(action==='prepare-tests'){
 const candidate=path.resolve('.deployment-candidates/offer-stability/final');
 const files=[['web/tests/integration/generated.config.ts','3007','3012'],['web/tests/integration/generated-server.mjs','3007','3012'],['examples/pact-checkout-vanilla/tests/playwright.config.ts','3008','3015'],['examples/pact-checkout-vanilla/tests/server.mjs','3008','3015'],['examples/pact-checkout-vanilla/tests/prism.config.ts','3009','3017'],['examples/pact-checkout-vanilla/tests/prism-server.mjs','3009','3017']];
 for(const [relative,from,to] of files){const source=await fs.readFile(relative,'utf8');await fs.writeFile(path.join(candidate,relative),source.replaceAll(from,to));}
 const saturday='qa/hacklanta-final/saturday-candidate.config.ts';
 const source=await fs.readFile(saturday,'utf8');await fs.writeFile(path.join(candidate,saturday),source.replace('../../saturday-lights','../../.deployment-candidates/20261010-213948-8755f031/saturday-lights'));
 console.log('Prepared copied test paths and ports serially; existing previews unchanged.');
}else{
const original=action==='build'?'qa/one-link/build.mjs':'qa/one-link/run-acceptance.mjs';
let source=(await fs.readFile(original,'utf8')).replaceAll('/one-link','/offer-stability');
let group='';
if(action==='acceptance'){
 const candidate=path.resolve('.deployment-candidates/offer-stability/final');
 group=process.argv[3]??'web';if(!['sdk','web','other','chain'].includes(group))throw Error('Unsupported acceptance group');
 // Preparation is explicit and serial; groups never rewrite shared test configuration.
 source=source.replace(/const changes=\[[\s\S]*?let runner=/,'let runner=');
 source=source.replace('run-isolated.mjs',`run-isolated-${group}.mjs`);
 process.argv=[process.argv[0],process.argv[1],candidate,group];
}
const file=path.resolve(`web/test-results/flicker/${action}${group?'-'+group:''}-generated.mjs`);
await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,source);
await import(new URL('file:///'+file.replaceAll('\\','/')));
}
