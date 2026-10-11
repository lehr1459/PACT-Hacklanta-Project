// Reuse the reviewed public-source isolation recipe; no installs or serving-output writes.
import fs from 'node:fs/promises';
import path from 'node:path';
let source=await fs.readFile('qa/one-link/prepare.mjs','utf8');
source=source.replaceAll('26fc35e680b8c089ba3a9c0457435814447ff1b7','117b7934e1818d35942636f7f880bcff0b0d1509').replaceAll('/one-link','/offer-stability');
source=source.replace("entry.startsWith('purchase-link')","(entry.startsWith('purchase-link')||entry==='offer-stability.spec.ts')");
const target=path.resolve('web/test-results/flicker/prepare-generated.mjs');
await fs.mkdir(path.dirname(target),{recursive:true});
await fs.writeFile(target,source);
await import(new URL('file:///'+target.replaceAll('\\','/')));
