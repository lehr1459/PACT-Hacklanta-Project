import {spawn} from 'node:child_process';
import {cp,mkdir,symlink,writeFile,access} from 'node:fs/promises';
import path from 'node:path';
import {offer} from '../../../packages/pact-sdk/tests/fixtures.mjs';
const root=process.cwd(),source=path.join(root,'examples/pact-demo-app'),consumer=path.join(root,'web/test-results/checkout-prism-consumer');
await mkdir(consumer,{recursive:true});
for(const name of ['app','package.json','tsconfig.json','next-env.d.ts'])await cp(path.join(source,name),path.join(consumer,name),{recursive:true,force:true});
try{await access(path.join(consumer,'node_modules'));}catch{await symlink(path.join(source,'node_modules'),path.join(consumer,'node_modules'),'junction');}
await writeFile(path.join(consumer,'next.config.mjs'),`export default {turbopack:{root:${JSON.stringify(root)}}};\n`);
const live=process.env.PACT_SDK_QA_MODE==='live';
const env={...process.env,NEXT_PUBLIC_SOLANA_RPC_URL:live?'https://api.devnet.solana.com':'http://127.0.0.1:8549',NEXT_PUBLIC_PACT_OFFER:live?'7EdfowQEZyVyyp7bYdQyzmprZtVU9mVba8cysHm2Ardh':offer.toBase58()};
const next=path.join(source,'node_modules/next/dist/bin/next');
const build=spawn(process.execPath,[next,'build'],{cwd:consumer,env,stdio:'inherit'});await new Promise((resolve,reject)=>build.on('exit',code=>code===0?resolve():reject(Error('Isolated Prism build exit '+code))));
const server=spawn(process.execPath,[next,'start','--hostname','127.0.0.1','--port','3009'],{cwd:consumer,env,stdio:'inherit'});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{server.kill();process.exit();});server.on('exit',code=>process.exit(code??0));
