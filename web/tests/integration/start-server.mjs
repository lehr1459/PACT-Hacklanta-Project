import {spawn} from 'node:child_process';
const env={...process.env,NEXT_TELEMETRY_DISABLED:'1'};
const next='node_modules/next/dist/bin/next';
const build=spawn(process.execPath,[next,'build'],{env,stdio:'inherit'});
await new Promise((resolve,reject)=>build.on('exit',code=>code===0?resolve():reject(Error(`Build exit ${code}`))));
const server=spawn(process.execPath,[next,'start','--hostname','127.0.0.1','--port','3006'],{env,stdio:'inherit'});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{server.kill();process.exit();});
server.on('exit',code=>process.exit(code??0));
