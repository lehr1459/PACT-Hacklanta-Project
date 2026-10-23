// Read only this service's operator-mounted secret file. Never logs its contents.
// This wrapper remains in the same Node process so the application's handlers own shutdown.
import {open,lstat} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const mode=process.argv[2];
try {
  if(!['api','migrate','web'].includes(mode))throw Error();
  const api=mode!=='web',file=`/run/secrets/${api?'api':'web'}-runtime.json`;
  const stat=await lstat(file);
  if(!stat.isFile()||stat.isSymbolicLink()||stat.size<2||stat.size>16384
    ||stat.uid!==process.getuid()||(stat.mode&0o077)!==0)throw Error();
  const handle=await open(file,'r');
  let values;
  try{const actual=await handle.stat();if(actual.ino!==stat.ino||actual.dev!==stat.dev)throw Error();values=JSON.parse(await handle.readFile('utf8'));}
  finally{await handle.close();}
  const required=api?['PACT_HOSTED_DATABASE_URL','PACT_HOSTED_PEPPER','SOLANA_RPC_URL']:['SOLANA_RPC_URL'];
  const allowed=[...required,'SOLANA_RPC_FALLBACK_URL'];
  if(!values||Array.isArray(values)||Object.getPrototypeOf(values)!==Object.prototype
    ||Object.keys(values).some(key=>!allowed.includes(key))||required.some(key=>!Object.hasOwn(values,key)))throw Error();
  for(const[key,value]of Object.entries(values)){
    if(typeof value!=='string'||!value||value.length>8192||/[\0\r\n]/.test(value)||/OWNER_SUPPLIED|OWNER_APPROVED|REPLACE_WITH/.test(value))throw Error();
    process.env[key]=value;
  }
  if(api){
    const url=new URL(values.PACT_HOSTED_DATABASE_URL);
    if(url.hostname!=='127.0.0.1'||url.port!=='55432'||url.pathname!=='/pact_hosted'
      ||url.username!==(mode==='migrate'?'pact_migrator':'pact_runtime')
      ||url.searchParams.get('sslmode')!=='verify-full'||url.searchParams.get('sslrootcert')!=='/run/pact-postgres-ca.crt')throw Error();
    if(!/^[A-Za-z0-9_-]{43,128}$/.test(values.PACT_HOSTED_PEPPER))throw Error();
  }
  // Existing configuration/resolver performs the complete environment checks.
  const entry=api?`/pact/services/pact-api/src/${mode==='migrate'?'migrate':'start'}.mjs`:'/pact/web/node_modules/next/dist/bin/next';
  process.argv=api?[process.execPath,entry]:[process.execPath,entry,'start','--hostname','127.0.0.1','--port','3000'];
  await import(pathToFileURL(entry).href);
}catch{process.stderr.write('PACT staging runtime configuration failed.\n');process.exitCode=1;}
