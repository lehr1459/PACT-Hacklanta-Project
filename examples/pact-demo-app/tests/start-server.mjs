import {spawn} from 'node:child_process';
import {offer} from '../../../packages/pact-sdk/tests/fixtures.mjs';
const live=process.env.PACT_SDK_QA_MODE==='live';
const env={...process.env,NEXT_PUBLIC_SOLANA_RPC_URL:live?'https://api.devnet.solana.com':'http://127.0.0.1:8549',NEXT_PUBLIC_PACT_OFFER:live?'7EdfowQEZyVyyp7bYdQyzmprZtVU9mVba8cysHm2Ardh':offer.toBase58()};
const next='node_modules/next/dist/bin/next';
const build=spawn(process.execPath,[next,'build'],{env,stdio:'inherit'});await new Promise((resolve,reject)=>{build.on('exit',code=>code===0?resolve():reject(Error(`Build exit ${code}`)));});
const server=spawn(process.execPath,[next,'start','--hostname','127.0.0.1','--port','3005'],{env,stdio:'inherit'});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{server.kill();process.exit();});server.on('exit',code=>process.exit(code??0));
