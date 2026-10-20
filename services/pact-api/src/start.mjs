import {configuration} from './config.mjs';
import {createDatabase} from './database.mjs';
import {prepareStartupDatabase} from './startup.mjs';
import {createService} from './service.mjs';
let database,service;
try{
  const config=configuration();
  database=await createDatabase(config);
  await prepareStartupDatabase(database,config.profile);
  service=await createService({...config,database});
  await service.server.listen({host:config.host,port:config.port});
  process.stdout.write('PACT hosted control plane listening on configured loopback interface.\n');
  let stopping=false;
  for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{
    if(stopping)return;stopping=true;await service.close();await database.close();process.exitCode=0;
  });
}catch(error){
  process.stderr.write(`PACT startup failed: ${/^[A-Z_]+$/.test(error?.code??'')?error.code:'SERVICE_UNAVAILABLE'}\n`);
  await service?.close().catch(()=>{});await database?.close().catch(()=>{});process.exitCode=1;
}
