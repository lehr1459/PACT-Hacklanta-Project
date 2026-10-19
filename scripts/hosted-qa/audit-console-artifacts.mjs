import {readFile,readdir} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';

const directory=path.resolve(process.argv[2]??'web/test-results/hosted-console');
const allowedRoot=path.resolve(process.cwd(),'web/test-results');
if(directory!==allowedRoot&&!directory.startsWith(allowedRoot+path.sep))throw Error('Audit requires a test-results directory in the selected checkout');
const files=[];
async function walk(dir){for(const entry of await readdir(dir,{withFileTypes:true})){const p=path.join(dir,entry.name);if(entry.isDirectory())await walk(p);else files.push(p);}}
await walk(directory);
const hashes=new Set();
for(const file of files.filter(f=>f.endsWith('-proof-hashes.json'))){for(const hash of JSON.parse(await readFile(file,'utf8')).hashes)hashes.add(hash);}
let scanned=0;
for(const file of files){
 if(/\.(?:zip|har|webm|mp4)$/i.test(file))throw Error('Sensitive console recording artifact exists');
 const buffer=await readFile(file),text=buffer.toString('utf8');scanned++;
 if(/pact_sk_dev_key_[a-f0-9]{32}_[A-Za-z0-9_-]{43}/.test(text)||/Browser\/session binding: [a-f0-9]{64}/.test(text))throw Error('Sensitive console material found in an artifact');
 for(const match of text.matchAll(/[A-Za-z0-9+/]{86}==/g))if(hashes.has(createHash('sha256').update(match[0]).digest('hex')))throw Error('Wallet proof signature found in an artifact');
}
console.log(JSON.stringify({kind:'console-artifact-redaction-check',status:'passed',filesScanned:scanned,knownProofHashes:hashes.size,rawSecretsRecorded:false}));
