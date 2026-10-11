import fs from 'node:fs/promises';import path from 'node:path';
const repo=process.cwd(),target=path.resolve(process.argv[2]??'.deployment-candidates/one-link/baseline'),group=process.argv[3]??'sdk';
if(!target.startsWith(path.join(repo,'.deployment-candidates/one-link')+path.sep))throw Error('Isolated One-Link candidate required');
const changes=[['web/tests/integration/generated.config.ts','3007','3012'],['web/tests/integration/generated-server.mjs','3007','3012'],['examples/pact-checkout-vanilla/tests/playwright.config.ts','3008','3015'],['examples/pact-checkout-vanilla/tests/server.mjs','3008','3015']];
for(const[file,from,to]of changes){const p=path.join(target,file);const source=await fs.readFile(p,'utf8');await fs.writeFile(p,source.replaceAll(from,to));}
const sat=path.join(target,'qa/hacklanta-final/saturday-candidate.config.ts');const s=await fs.readFile(sat,'utf8');await fs.writeFile(sat,s.replace('../../saturday-lights','../../.deployment-candidates/20261010-213948-8755f031/saturday-lights'));
let runner=await fs.readFile('qa/ui-redesign/run-acceptance.mjs','utf8');runner=runner.replaceAll('.deployment-candidates/ui-redesign','.deployment-candidates/one-link').replaceAll('web/test-results/ui-redesign','web/test-results/one-link');
const file=path.join(repo,'web/test-results/one-link/run-isolated.mjs');await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,runner);
process.argv=[process.argv[0],file,target,group];await import(new URL('file:///'+file.replaceAll('\\','/')));
