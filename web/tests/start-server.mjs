import {spawn} from 'node:child_process';

const env = {...process.env,
  NEXT_PUBLIC_PACT_CONTRACT_ADDRESS: process.env.PACT_QA_MODE === 'setup' ? '' : '0x4444444444444444444444444444444444444444',
  NEXT_PUBLIC_RPC_URL: 'http://127.0.0.1:8547',
  NEXT_TELEMETRY_DISABLED: '1',
};
const run = args => spawn(process.execPath, ['node_modules/next/dist/bin/next', ...args], {env, stdio: 'inherit'});
const build = run(['build']);
build.on('exit', code => {
  if (code !== 0) {process.exit(code ?? 1); return;}
  const server = run(['start', '--hostname', '127.0.0.1', '--port', '3001']);
  const stop = () => {server.kill(); process.exit(0);};
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  server.on('exit', code => process.exit(code ?? 0));
});
