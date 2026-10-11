import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
const root=process.cwd(),target=path.join(root,'.deployment-candidates/one-link/final');
const files=['web/components/solana-app.tsx','web/app/globals.css','web/lib/solana/purchase-link.ts','web/components/purchase-link-share.tsx'];
for(const name of await fs.readdir(path.join(root,'web/tests/solana')))if(name.startsWith('purchase-link'))files.push('web/tests/solana/'+name);
const manifest=JSON.parse(await fs.readFile(path.join(target,'source-manifest.json'),'utf8'));
for(const relative of files){const bytes=await fs.readFile(path.join(root,relative)),dest=path.join(target,relative);await fs.mkdir(path.dirname(dest),{recursive:true});await fs.writeFile(dest,bytes);const record={file:relative,sha256:createHash('sha256').update(bytes).digest('hex')};const index=manifest.files.findIndex(item=>item.file===relative);if(index>=0)manifest.files[index]=record;else manifest.files.push(record);}
await fs.writeFile(path.join(target,'source-manifest.json'),JSON.stringify(manifest,null,2));
console.log(`Overlaid ${files.length} frozen feature/test sources; dependencies and serving outputs untouched.`);
