import fs from 'node:fs/promises';
import path from 'node:path';
const repo=process.cwd(),base=path.join(repo,'.deployment-candidates/ui-redesign/baseline'),target=path.join(repo,'.deployment-candidates/ui-redesign/final');
await fs.mkdir(target,{recursive:true});
await fs.cp(base,target,{recursive:true,filter:source=>!source.slice(base.length).split(path.sep).some(part=>['node_modules','.next','test-results','playwright-report','out','cache','.git'].includes(part))});
async function linkedTree(source,dest){await fs.mkdir(dest,{recursive:true});const entries=await fs.readdir(source,{withFileTypes:true});for(const entry of entries){const from=path.join(source,entry.name),to=path.join(dest,entry.name);if(entry.isDirectory())await linkedTree(from,to);else {if(entry.isSymbolicLink())throw Error('Unexpected external dependency link '+from);await fs.link(from,to);}}}
for(const relative of ['web/node_modules','packages/pact-sdk/node_modules','examples/pact-demo-app/node_modules','.deployment-candidates/20261010-213948-8755f031/saturday-lights/node_modules']){console.log('Creating physical candidate file links '+relative);await linkedTree(path.join(base,relative),path.join(target,relative));}
const changed=['web/components/solana-app.tsx','web/components/solana-wallet.tsx','web/components/integration-wizard.tsx','web/app/base/page.tsx','web/app/globals.css','web/app/integrate/integrate.css'];
for(const relative of changed)await fs.copyFile(path.join(repo,relative),path.join(target,relative));
console.log('Final isolated candidate prepared from frozen baseline plus six presentation files; no outside dependency symlinks.');
