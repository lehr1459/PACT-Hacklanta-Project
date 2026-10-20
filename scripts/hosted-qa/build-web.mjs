import {access,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {root, execute} from '../validation/common.mjs';
import {loadRuntimePolicy} from '../validation/runtime.mjs';

if (process.env.PACT_HOSTED_QA_CLEAN !== '1') throw Error('Use an explicitly isolated clean hosted-browser checkout');
for (const project of ['', 'web', 'services/pact-api']) {
  for (const name of ['.env', '.env.local', '.env.production', '.env.production.local', '.env.development', '.env.development.local', '.env.test', '.env.test.local']) {
    try { await access(path.join(root, project, name)); throw Error('Active environment file exists; contents were not read'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
}
const policy = await loadRuntimePolicy();
if (process.version !== `v${policy.node}`) throw Error('Use the reviewed pinned Node runtime');
const result = await execute(process.execPath, ['node_modules/next/dist/bin/next', 'build'], {
  cwd: path.join(root, 'web'),
  env: {PACT_ENV_PROFILE: 'test', PACT_APP_ORIGIN: 'http://127.0.0.1:3112',
    PACT_AUTH_MODE: 'disabled', PACT_SERVER_POLICY: 'disabled', PACT_PROCESS_MODEL: 'stateless',
    NEXT_PUBLIC_PACT_SOLANA_PROGRAM_ID: 'EiiiWWsW2kkqP6nugHz6iBADvhnW5xnibAtZ82ZExVqy',
    NEXT_PUBLIC_SOLANA_RPC_URL: 'https://api.devnet.solana.com', NEXT_PUBLIC_PACT_CONTRACT_ADDRESS: ''},
});
process.exitCode = result.code;
if(result.code===0&&process.env.PACT_HOSTED_QA_RUN_ID){
 if(!/^[a-f0-9-]{36}$/.test(process.env.PACT_HOSTED_QA_RUN_ID))throw Error('Invalid hosted build binding');
 const revision=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
 if(revision!==process.env.PACT_HOSTED_QA_REVISION)throw Error('Build revision mismatch');
 await writeFile(path.join(root,'web/.next/hosted-build.json'),JSON.stringify({revision,runId:process.env.PACT_HOSTED_QA_RUN_ID})+'\n');
}
