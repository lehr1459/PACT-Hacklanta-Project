import {configuration} from './config.mjs';
import {createDatabase,verifySchema} from './database.mjs';
import {maintainDatabase,quarantineDeveloper,deleteDeveloper} from './maintenance.mjs';
let database;
try{
 const args=process.argv.slice(2),command=args.shift()??'retention',values=new Map();
 for(let i=0;i<args.length;i++){
  const flag=args[i];if(!['--apply','--ingress-quiesced','--account','--confirm-wallet','--batch'].includes(flag)||values.has(flag))throw Error();
  if(flag==='--apply'||flag==='--ingress-quiesced')values.set(flag,true);
  else{const value=args[++i];if(!value||value.startsWith('--'))throw Error();values.set(flag,value);}
 }
 if(!['retention','quarantine','delete'].includes(command)||command==='retention'&&(values.has('--account')||values.has('--confirm-wallet'))
  ||command!=='retention'&&values.has('--batch')||command!=='delete'&&values.has('--ingress-quiesced'))throw Error();
 // Never loads .env files, migrates, bootstraps clocks or starts a public listener.
 database=await createDatabase(configuration());await verifySchema(database);
 const apply=values.get('--apply')===true;
 const output=command==='retention'?await maintainDatabase({database,apply,batchSize:Number(values.get('--batch')??100)}):
  await(command==='quarantine'?quarantineDeveloper:deleteDeveloper)({database,apply,accountId:values.get('--account'),expectedWallet:values.get('--confirm-wallet'),ingressQuiesced:values.get('--ingress-quiesced')===true});
 process.stdout.write(JSON.stringify(output)+'\n');
}catch(error){process.stderr.write(`PACT maintenance failed: ${/^[A-Z_]+$/.test(error?.code??'')?error.code:'MAINTENANCE_CONFIGURATION_REQUIRED'}\n`);process.exitCode=1;}
finally{await database?.close().catch(()=>{});}
