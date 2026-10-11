import {spawn} from 'node:child_process';
// Fixture builds intercept RPC; live mode permits public read-only smoke only.
const mode=process.env.PACT_SOLANA_QA_MODE;
const env={...process.env,NEXT_PUBLIC_PACT_SOLANA_PROGRAM_ID:mode==='setup'?'':mode==='live'?'EiiiWWsW2kkqP6nugHz6iBADvhnW5xnibAtZ82ZExVqy':'US517G5965aydkZ46HS38QLi7UQiSojurfbQfKCELFx',NEXT_PUBLIC_SOLANA_RPC_URL:mode==='live'?'https://api.devnet.solana.com':'http://127.0.0.1:8548',NEXT_TELEMETRY_DISABLED:'1'};
const run=args=>spawn(process.execPath,['node_modules/next/dist/bin/next',...args],{env,stdio:'inherit'});
run(['build']).on('exit',code=>{if(code!==0){process.exit(code??1);return;}const server=run(['start','--hostname','127.0.0.1','--port','3002']);const stop=()=>{server.kill();process.exit(0);};process.on('SIGINT',stop);process.on('SIGTERM',stop);server.on('exit',code=>process.exit(code??0));});
