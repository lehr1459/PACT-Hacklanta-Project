import cluster from 'node:cluster';
import {isMainThread} from 'node:worker_threads';

const unsupported = ['VERCEL','AWS_LAMBDA_FUNCTION_NAME','AWS_EXECUTION_ENV','FUNCTIONS_WORKER_RUNTIME',
  'AZURE_FUNCTIONS_ENVIRONMENT','K_SERVICE','NETLIFY','NODE_UNIQUE_ID'] as const;

/** Capability guard shared by startup validation and the actual session store. */
export function supportsSingleProcessAuth(environment:Readonly<Record<string,string|undefined>>=process.env):boolean {
  return isMainThread&&!cluster.isWorker&&!unsupported.some(key=>Boolean(environment[key]))
    &&(environment.WEB_CONCURRENCY===undefined||environment.WEB_CONCURRENCY==='1');
}
