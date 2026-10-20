import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {random,token} from './security.mjs';
// Deliberately local-only. Never reads or modifies a user's active .env file.
try {
  if(process.env.PACT_HOSTED_PROFILE && process.env.PACT_HOSTED_PROFILE!=='local') throw Error();
  const localDirectory=fileURLToPath(new URL('../.local-db/',import.meta.url));
  await mkdir(localDirectory,{recursive:true,mode:0o700});
  await mkdir(`${localDirectory}/clock`,{recursive:true,mode:0o700});
  const pepperFile=`${localDirectory}/.pepper`;
  let pepper;
  try{pepper=await readFile(pepperFile,'utf8');}
  catch(error){if(error.code!=='ENOENT')throw error;pepper=random();await writeFile(pepperFile,pepper,{flag:'wx',mode:0o600});}
  if(!token(pepper))throw Error();
  Object.assign(process.env,{PACT_HOSTED_PROFILE:'local',PACT_HOSTED_PROCESS_MODEL:'single-persistent-process',
    PACT_HOSTED_ORIGIN:process.env.PACT_HOSTED_ORIGIN??'http://localhost:3000',PACT_HOSTED_HOST:'127.0.0.1',
    PACT_HOSTED_PEPPER:pepper,PACT_HOSTED_LOCAL_DB:`${localDirectory}/data`,PACT_HOSTED_CLOCK_DIRECTORY:`${localDirectory}/clock`});
  delete process.env.PACT_HOSTED_DATABASE_URL;
  await import('./start.mjs');
}catch{process.stderr.write('Local hosted bootstrap unavailable.\n');process.exitCode=1;}
