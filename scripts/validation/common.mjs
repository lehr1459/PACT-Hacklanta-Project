import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

export const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
export function validationEnv(extra={}) {
  const env={...process.env};
  for(const key of Object.keys(env))if(/^(?:NODE_PATH$|NODE_OPTIONS$|NODE_TEST_CONTEXT$|PACT_|NEXT_PUBLIC_|SOLANA_|VERCEL(?:_|$)|AWS_LAMBDA_)/.test(key))delete env[key];
  return {...env,NEXT_TELEMETRY_DISABLED:'1',NEXT_PUBLIC_PACT_SOLANA_PROGRAM_ID:'',NEXT_PUBLIC_SOLANA_RPC_URL:'https://api.devnet.solana.com',NEXT_PUBLIC_PACT_CONTRACT_ADDRESS:'',NEXT_PUBLIC_RPC_URL:'https://sepolia.base.org',PACT_AUTH_MODE:'disabled',...(process.env.PACT_EXTERNAL_SATURDAY?{PACT_EXTERNAL_SATURDAY:process.env.PACT_EXTERNAL_SATURDAY}:{}),...extra};
}
export function npmCli() {
  const directory=path.dirname(process.execPath);
  const candidates=[process.env.npm_execpath,path.join(directory,'node_modules/npm/bin/npm-cli.js'),path.resolve(directory,'../lib/node_modules/npm/bin/npm-cli.js')];
  const found=candidates.find(value=>value&&value.endsWith('.js')&&existsSync(value));
  if(!found)throw Error('Cannot locate npm-cli.js beside Node. Run with the pinned Node/npm installation.');
  return found;
}
export async function execute(binary,args,{cwd=root,env={},onOutput=()=>{}}={}) {
  return new Promise((resolve,reject)=>{
    const child=spawn(binary,args,{cwd,env:validationEnv(env),stdio:['ignore','pipe','pipe'],windowsHide:true});
    const forward=(stream,chunk)=>{stream.write(chunk);onOutput(chunk);};
    child.stdout.on('data',chunk=>forward(process.stdout,chunk));
    child.stderr.on('data',chunk=>forward(process.stderr,chunk));
    child.once('error',reject);
    child.once('close',(code,signal)=>resolve({code:code??1,signal}));
  });
}
export async function npm(args,options={}) {
  const result=await execute(process.execPath,[npmCli(),...args],options);
  if(result.code!==0)throw Error(`npm ${args.join(' ')} exited ${result.code}`);
}
