// Compare against the reviewed One-Link checkpoint using the existing public preservation audit.
import fs from 'node:fs/promises';
import path from 'node:path';
let source=await fs.readFile('qa/one-link/preservation.mjs','utf8');
source=source.replace("const root=path.resolve(import.meta.dirname,'../..');","const root=process.cwd();").replaceAll('26fc35e680b8c089ba3a9c0457435814447ff1b7','117b7934e1818d35942636f7f880bcff0b0d1509').replaceAll('feat/one-link-purchasing','fix/offer-refresh-stability');
const allowed=['web/components/solana-app.tsx','web/lib/solana/use-snapshot.ts','docs/DECISIONS.md','docs/STATUS.md','docs/HANDOFF.md'];
const additions=['web/tests/solana/offer-stability.spec.ts','qa/offer-stability/prepare.mjs','qa/offer-stability/run.mjs','qa/offer-stability/preservation.mjs','docs/OFFER_REFRESH_STABILITY.md','docs/OFFER_STABILITY_QA.md'];
source=source.replace(/const allowed=new Set\(\[[\s\S]*?\]\);/,`const allowed=new Set(${JSON.stringify(allowed)});`).replace(/const additions=new Set\(\[[\s\S]*?\]\);/,`const additions=new Set(${JSON.stringify(additions)});`);
const file=path.resolve('web/test-results/flicker/preservation-generated.mjs');
await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,source);
await import(new URL('file:///'+file.replaceAll('\\','/')));
