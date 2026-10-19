import {ApiError,token,origin} from './security.mjs';
import cluster from 'node:cluster';
import {isMainThread} from 'node:worker_threads';
export function configuration(env=process.env) {
  const profile=env.PACT_HOSTED_PROFILE ?? 'local';
  if(!['local','hosted'].includes(profile)||env.PACT_HOSTED_PROCESS_MODEL!=='single-persistent-process'
    || !isMainThread || cluster.isWorker || env.WEB_CONCURRENCY !== undefined && env.WEB_CONCURRENCY !== '1'
    || ['VERCEL','AWS_LAMBDA_FUNCTION_NAME','FUNCTIONS_WORKER_RUNTIME','CF_PAGES','NODE_UNIQUE_ID','AWS_EXECUTION_ENV','K_SERVICE','NETLIFY','AZURE_FUNCTIONS_ENVIRONMENT'].some(name=>env[name])) throw new ApiError('UNSUPPORTED_TOPOLOGY',503);
  if(!token(env.PACT_HOSTED_PEPPER))throw new ApiError('SERVICE_SECRET_REQUIRED',503);
  const publicOrigin=origin(env.PACT_HOSTED_ORIGIN);
  if(profile==='hosted'&&(!publicOrigin.startsWith('https:')||!env.PACT_HOSTED_DATABASE_URL||!env.SOLANA_RPC_URL))throw new ApiError('HOSTED_CONFIGURATION_REQUIRED',503);
  const host=env.PACT_HOSTED_HOST??'127.0.0.1',port=Number(env.PACT_HOSTED_PORT??4100);
  if(!['127.0.0.1','::1'].includes(host)||!Number.isInteger(port)||port<1024||port>65535)throw new ApiError('INVALID_LISTEN_CONFIGURATION',503);
  return{profile,origin:publicOrigin,pepper:env.PACT_HOSTED_PEPPER,host,port,connectionString:env.PACT_HOSTED_DATABASE_URL,
    localPath:env.PACT_HOSTED_LOCAL_DB,readerOptions:env.SOLANA_RPC_FALLBACK_URL?
      {rpcUrls:[env.SOLANA_RPC_URL,env.SOLANA_RPC_FALLBACK_URL]}:env.SOLANA_RPC_URL?{rpcUrl:env.SOLANA_RPC_URL}:undefined};
}
