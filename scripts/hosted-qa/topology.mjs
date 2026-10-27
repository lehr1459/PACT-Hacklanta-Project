// Disposable native equivalent of the supported same-host topology. No deployment/ACME.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import https from 'node:https';
import {createHash,randomBytes} from 'node:crypto';
import {spawn,execFileSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {createDatabase,verifySchema} from '../../services/pact-api/src/database.mjs';
import {createService} from '../../services/pact-api/src/service.mjs';
import {Browser} from './browser.mjs';
import {rpcFixture} from './rpc-fixture.mjs';
import {waitForClockCeiling} from './phase7-clock-fixture.mjs';
import {stop} from './artifact.mjs';
import {realDirectory,createKit} from '../release/staging-source.mjs';

const root=fileURLToPath(new URL('../../',import.meta.url));
const ORIGIN='https://127.0.0.1:3443',HTTP='http://127.0.0.1:3080',UPSTREAM='http://127.0.0.1:3445';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
export function argumentsFor(args){
 const result={};for(let i=0;i<args.length;i+=2){assert.ok(['--web','--database-config','--caddy','--tls-dir','--output','--revision','--caddy-sha256','--pg-bin'].includes(args[i]));assert.ok(args[i+1]&&!Object.hasOwn(result,args[i]));result[args[i]]=args[i+1];}
 for(const name of ['--web','--database-config','--caddy','--tls-dir','--output','--pg-bin'])assert.ok(path.isAbsolute(result[name]??''),'Absolute private paths required');
 assert.match(result['--revision']??'',/^[a-f0-9]{40}$/);assert.match(result['--caddy-sha256']??'',/^[a-f0-9]{64}$/);return result;
}
export async function runTopology(args){
 const config=argumentsFor(args),web=config['--web'],output=config['--output'],tls=config['--tls-dir'];
 assert.equal(process.version,'v24.22.1');assert.equal(sha(await fs.readFile(config['--caddy'])),config['--caddy-sha256']);
 assert.match(execFileSync(config['--caddy'],['version'],{encoding:'utf8',windowsHide:true}),/^v2\.11\.7\b/);
 const revision=config['--revision'],source=await createKit(root);assert.equal(source.manifest.sourceRevision,revision);
 for(const directory of [root,web])for(const name of ['.env','.env.local','.env.production','.env.production.local','.env.test','.env.test.local','.env.development','.env.development.local']){
  await assert.rejects(fs.lstat(path.join(directory,name)),{code:'ENOENT'},'Active environment file exists; contents not read');
 }
 const saved=JSON.parse(await fs.readFile(path.join(web,'.next/required-server-files.json'))),binding=JSON.parse(saved.config.env.PACT_BUILD_BINDING_JSON);
 assert.equal(binding.profile,'test');assert.equal(saved.config.env.PACT_BUILD_SOURCE_REVISION,revision);
 for(const name of ['PACT_BUILD_SOURCE_CLEAN','PACT_BUILD_ENV_FILES_ABSENT','PACT_BUILD_PUBLIC_ENV_SAFE'])assert.equal(saved.config.env[name],'true');
 await realDirectory(output,{newFinal:true});
 const privateConfig=JSON.parse(await fs.readFile(config['--database-config']));assert.deepEqual(Object.keys(privateConfig).sort(),['connectionString','migratorConnectionString','restoreConnectionString']);
 const dbUrl=new URL(privateConfig.connectionString);assert.equal(dbUrl.hostname,'127.0.0.1');assert.ok(/^\/pact_hosted_qa/.test(dbUrl.pathname));
 assert.equal(dbUrl.searchParams.get('sslmode'),'verify-full');assert.match(dbUrl.username,/^pact_topology_runtime_[a-f0-9]{8}$/);
 const ca=await fs.readFile(path.join(tls,'ca.crt')),cert=await fs.readFile(path.join(tls,'server.crt'));
 const checks=[],logs=[],clock=path.join(output,'private-clock');await fs.mkdir(clock,{mode:0o700});
 const receipt={schemaVersion:1,sourceRevision:revision,profile:'test',scope:'native-loopback-caddy-next-api-postgresql-tls',hostedApproved:false,dockerExecuted:false,
  sourceClean:true,sourceArchiveSha256:source.sha256,caddyVersion:'2.11.7',caddyExecutableSha256:config['--caddy-sha256'],gatewayCertificateSha256:sha(cert),buildId:(await fs.readFile(path.join(web,'.next/BUILD_ID'),'utf8')).trim(),checks};
 let database,rpc,service,next,gateway;
 const operating=Object.fromEntries(Object.entries(process.env).filter(([k])=>['PATH','PATHEXT','SystemRoot','SYSTEMROOT','WINDIR','TEMP','TMP','LOCALAPPDATA','APPDATA','USERPROFILE','HOME'].includes(k)));
 const env={...operating,NODE_ENV:'production',NEXT_TELEMETRY_DISABLED:'1',PACT_ENV_PROFILE:'test',PACT_NETWORK:'devnet',PACT_APP_ORIGIN:ORIGIN,PACT_AUTH_MODE:'disabled',PACT_PROCESS_MODEL:'stateless',PACT_SERVER_POLICY:'disabled',
  NEXT_PUBLIC_PACT_SOLANA_PROGRAM_ID:'EiiiWWsW2kkqP6nugHz6iBADvhnW5xnibAtZ82ZExVqy',NEXT_PUBLIC_SOLANA_RPC_URL:'https://api.devnet.solana.com',NEXT_PUBLIC_PACT_CONTRACT_ADDRESS:'',NEXT_PUBLIC_RPC_URL:'https://sepolia.base.org',PACT_HOSTED_API_INTERNAL_URL:UPSTREAM};
 async function start(binary,args,cwd){const log=await fs.open(path.join(output,'private-child-'+logs.length+'.log'),'wx',0o600);logs.push(log);const child=spawn(binary,args,{cwd,env,windowsHide:true,stdio:['ignore',log.fd,log.fd]});child.once('error',()=>{child.pactSpawnFailed=true;});return child;}
 function request(route,{method='GET',headers={},body,trust=ca}={}){return new Promise((resolve,reject)=>{
  const req=https.request(new URL(route,ORIGIN),{method,headers,ca:trust,rejectUnauthorized:true,timeout:10000},res=>{let text='';res.on('data',b=>{text+=b;if(text.length>1048576)req.destroy(Error('Bounded response exceeded'));});res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,text}));});req.on('error',()=>reject(Error('Fixture TLS request failed')));req.on('timeout',()=>req.destroy());if(body)req.write(body);req.end();
 });}
 class SecureBrowser extends Browser{async request(method,route,body,overrides={}){const headers={Origin:ORIGIN,...(body===undefined?{}:{'Content-Type':'application/json'})};if(this.jar.size)headers.Cookie=[...this.jar].map(([k,v])=>k+'='+v).join('; ');if(this.csrf)headers['x-pact-csrf']=this.csrf;for(const[k,v]of Object.entries(overrides)){if(v===null)delete headers[k];else headers[k]=v;}const r=await request(route,{method,headers,...(body===undefined?{}:{body:JSON.stringify(body)})});for(const cookie of r.headers['set-cookie']??[]){const pair=cookie.split(';')[0],i=pair.indexOf('=');this.jar.set(pair.slice(0,i),pair.slice(i+1));}const data=JSON.parse(r.text);assert.equal(data.schemaVersion,1);assert.ok(data.requestId);assert.equal(r.headers['cache-control'],'no-store');return{status:r.status,data,headers:r.headers};}}
 async function ready(child,url){for(let i=0;i<100;i++){assert.ok(!child.pactSpawnFailed,'Owned child spawn failed');assert.equal(child.exitCode,null,'Owned child exited before readiness');assert.equal(child.signalCode,null,'Owned child signaled before readiness');try{const status=url.startsWith('https:')?(await request('/integrate/developer')).status:(await fetch(url,{signal:AbortSignal.timeout(500)})).status;if(status===200)return;}catch{}await delay(150);}throw Error('Owned topology failed readiness');}
 try{
  database=await createDatabase({connectionString:privateConfig.connectionString,profile:'hosted'});await verifySchema(database);
  assert.equal((await database.query('SHOW server_version')).rows[0].server_version,'18.6');assert.equal((await database.query('SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()')).rows[0].ssl,true);
  await assert.rejects(database.query('DELETE FROM platform_migrations'),e=>e.code==='DATABASE_UNAVAILABLE');checks.push('postgres186-verified-tls-runtime-role-migration-authority-denied');
  rpc=await rpcFixture();const options={database,origin:ORIGIN,pepper:randomBytes(32).toString('base64url'),profile:'test',clockDirectory:clock,readerOptions:{rpcUrl:rpc.url}};
  service=await createService(options);await service.server.listen({host:'127.0.0.1',port:3445});
  next=await start(process.execPath,[path.join(web,'node_modules/next/dist/bin/next'),'start','--hostname','127.0.0.1','--port','3444'],web);await ready(next,'http://127.0.0.1:3444/integrate/developer');
  const template=await fs.readFile(path.join(root,'deployment/staging/Caddyfile'),'utf8');receipt.gatewayTemplateSha256=sha(template);
  const filename=p=>p.replaceAll('\\','/');
  const caddy=template.replace('http://{$PACT_STAGING_DOMAIN} {','http://127.0.0.1:3080 {\n    bind 127.0.0.1').replace('https://{$PACT_STAGING_DOMAIN} {','https://127.0.0.1:3443 {\n    bind 127.0.0.1').replace('/run/pact-gateway-tls/fullchain.pem',JSON.stringify(filename(path.join(tls,'server.crt')))).replace('/run/pact-gateway-tls/privkey.pem',JSON.stringify(filename(path.join(tls,'server.key')))).replace('127.0.0.1:3000','127.0.0.1:3444').replaceAll('{$PACT_STAGING_DOMAIN}','127.0.0.1:3443');
  await fs.writeFile(path.join(output,'Caddyfile'),caddy,{flag:'wx',mode:0o600});gateway=await start(config['--caddy'],['run','--config',path.join(output,'Caddyfile'),'--adapter','caddyfile'],output);await ready(gateway,ORIGIN);
  assert.equal((await fetch(HTTP,{redirect:'manual'})).status,426);checks.push('plain-http426-no-redirect-or-acme');
  await assert.rejects(request('/integrate/developer',{trust:Buffer.alloc(0)}));checks.push('untrusted-gateway-certificate-denied');
  assert.equal((await request('/integrate/developer')).status,200);assert.equal((await request('/connect')).status,200);assert.equal((await request('/v1/health/ready')).status,200);checks.push('verified-https-caddy-production-next-api-postgres-reader-ready');
  const admin=new SecureBrowser(ORIGIN,ORIGIN);
  let r=await admin.request('GET','/v1/developer/auth/session');assert.ok((r.headers['set-cookie']??[]).some(v=>v.includes('Secure')&&v.includes('HttpOnly')));await admin.login();checks.push('signed-admin-secure-httponly-cookies-through-https');
  r=await admin.request('POST','/v1/developer/apps',{name:'Native HTTPS topology fixture',framework:'rest'});assert.equal(r.status,200);const app=r.data.app.id,appPath='/v1/developer/apps/'+app;
  assert.equal((await admin.mutate('PATCH',appPath,app,'app.update',{status:'active'})).status,200);
  const offer=rpc.addOffer({seller:admin.wallet}),replacement=rpc.addOffer({seller:admin.wallet,nonce:2n});
  assert.equal((await admin.mutate('POST',appPath+'/resources',app,'resource.bind',{resourceKey:'premium',offerAddress:offer.address})).status,200);
  assert.equal((await admin.mutate('PATCH',appPath+'/resources/premium',app,'resource.update',{resourceKey:'premium',expectedVersion:1,offerAddress:replacement.address})).status,200);checks.push('seller-proven-resource-two-policy-versions-over-https');
  r=await admin.mutate('POST',appPath+'/credentials',app,'credential.create',{name:'Disposable topology credential',scopes:['access:check'],expiresAt:Date.now()+600000});assert.equal(r.status,200);const key=r.data.secret;assert.equal((await admin.key(key)).status,200);checks.push('runtime-role-application-and-key-over-https');
  assert.equal((await admin.request('GET','/v1/developer/apps',undefined,{Origin:'https://foreign.fixture.invalid'})).status,403);checks.push('foreign-origin403-through-gateway');
  assert.equal((await admin.request('GET',appPath,undefined,{'Forwarded':'host=evil.invalid;proto=http','X-Forwarded-Host':'evil.invalid','X-Forwarded-Proto':'http','X-Forwarded-For':'198.51.100.1'})).status,200);checks.push('spoofed-forwarding-cannot-change-host-origin-authority');
  await service.close();service=null;assert.equal((await request('/v1/health/ready')).status,503);checks.push('api-outage-gateway503');
  await waitForClockCeiling(clock);service=await createService(options);await service.server.listen({host:'127.0.0.1',port:3445});assert.equal((await admin.request('GET',appPath)).status,200);assert.equal((await admin.key(key)).status,200);checks.push('graceful-api-reopen-persists-clock-session-and-key');
  await stop(next);assert.equal((await request('/v1/health/ready')).status,502);next=await start(process.execPath,[path.join(web,'node_modules/next/dist/bin/next'),'start','--hostname','127.0.0.1','--port','3444'],web);await ready(next,'http://127.0.0.1:3444/integrate/developer');assert.equal((await admin.request('GET',appPath)).status,200);checks.push('next-outage502-restart-retains-api-authority');
  // Restore only into a pre-created, empty, distinct disposable database.
  await service.close();service=null;await database.close();database=null;
  const restoreUrl=new URL(privateConfig.restoreConnectionString),migratorUrl=new URL(privateConfig.migratorConnectionString);
  for(const u of [restoreUrl,migratorUrl]){assert.equal(u.hostname,'127.0.0.1');assert.equal(u.port,dbUrl.port);assert.match(u.pathname,/^\/pact_hosted_qa_topology_[a-f0-9]{8}(?:_restored)?$/);assert.match(u.username,/^pact_topology_migrator_[a-f0-9]{8}$/);assert.equal(u.searchParams.get('sslmode'),'verify-full');}
  assert.notEqual(restoreUrl.pathname,migratorUrl.pathname);assert.equal(migratorUrl.pathname,dbUrl.pathname);assert.equal(restoreUrl.username,migratorUrl.username);
  const pgEnv=u=>({...operating,PGHOST:u.hostname,PGPORT:u.port,PGUSER:u.username,PGPASSWORD:decodeURIComponent(u.password),PGDATABASE:u.pathname.slice(1),PGSSLMODE:'verify-full',PGSSLROOTCERT:u.searchParams.get('sslrootcert')});
  const executable=name=>path.join(config['--pg-bin'],name+(process.platform==='win32'?'.exe':''));
  for(const name of ['pg_dump','pg_restore','psql']){assert.match(execFileSync(executable(name),['--version'],{encoding:'utf8',windowsHide:true}),/\b18\.6\b/);receipt[name+'ExecutableSha256']=sha(await fs.readFile(executable(name)));}
  const offline=async(name,args,u)=>{const log=await fs.open(path.join(output,'private-'+name+'.log'),'wx',0o600);logs.push(log);await new Promise((resolve,reject)=>{const child=spawn(executable(name),args,{env:pgEnv(u),windowsHide:true,stdio:['ignore',log.fd,log.fd]});child.once('error',()=>reject(Error('Owned recovery client failed')));child.once('exit',code=>code===0?resolve():reject(Error('Owned recovery client refused operation')));});};
  const destination=await createDatabase({connectionString:restoreUrl.href,profile:'hosted'});try{assert.equal(Number((await destination.query("SELECT count(*) AS n FROM pg_tables WHERE schemaname='public'")).rows[0].n),0);}finally{await destination.close();}
  const dump=path.join(output,'private-backup.dump');await offline('pg_dump',['--format=custom','--no-owner','--no-acl','--file',dump],migratorUrl);receipt.portableBackupSha256=sha(await fs.readFile(dump));
  await offline('pg_restore',['--no-owner','--no-acl','--exit-on-error','--single-transaction','--dbname',restoreUrl.pathname.slice(1),dump],restoreUrl);
  await offline('psql',['--no-psqlrc','--set','ON_ERROR_STOP=1','--file',path.join(root,'services/pact-api/operations/restore-quarantine.sql')],restoreUrl);
  const restoredOwner=await createDatabase({connectionString:restoreUrl.href,profile:'hosted'});
  try{await restoredOwner.query('GRANT USAGE ON SCHEMA public TO '+dbUrl.username);await restoredOwner.query('GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO '+dbUrl.username);await restoredOwner.query('REVOKE ALL ON platform_migrations,clock_bindings FROM '+dbUrl.username);await restoredOwner.query('GRANT SELECT ON platform_migrations TO '+dbUrl.username);await restoredOwner.query('GRANT SELECT,INSERT ON clock_bindings TO '+dbUrl.username);
   assert.equal((await restoredOwner.query('SELECT status FROM developer_applications WHERE id=$1',[app])).rows[0].status,'paused');assert.ok(Number((await restoredOwner.query('SELECT count(*) AS n FROM admin_sessions WHERE revoked_at IS NOT NULL')).rows[0].n)>0);assert.equal(Number((await restoredOwner.query('SELECT count(*) AS n FROM resource_versions WHERE app_id=$1',[app])).rows[0].n),2);
  }finally{await restoredOwner.close();}checks.push('actual186-migrator-dump-transactional-restore-offline-quarantine');
  const restoredRuntime=new URL(dbUrl);restoredRuntime.pathname=restoreUrl.pathname;database=await createDatabase({connectionString:restoredRuntime.href,profile:'hosted'});await verifySchema(database);
  const restoredClock=path.join(output,'private-restored-clock');await fs.mkdir(restoredClock,{mode:0o700});service=await createService({...options,database,pepper:randomBytes(32).toString('base64url'),clockDirectory:restoredClock});await service.server.listen({host:'127.0.0.1',port:3445});
  assert.equal((await admin.request('GET',appPath)).status,401);assert.equal((await admin.key(key)).status,401);const fresh=new SecureBrowser(ORIGIN,ORIGIN);fresh.wallet=admin.wallet;await fresh.login();assert.equal((await fresh.request('GET',appPath)).status,200);assert.equal((await fresh.request('GET',appPath+'/resources/premium')).data.versions.length,2);checks.push('fresh-restore-epoch-denies-old-cookie-key-retains-history-allows-fresh-wallet-auth');
  // No callback URLs, proofs, grants, keys or native provider text enter the receipt.
  assert.equal((await createKit(root)).sha256,source.sha256,'Source changed during topology acceptance');
  receipt.status='passed';receipt.checkCount=checks.length;await fs.writeFile(path.join(output,'results.json'),JSON.stringify(receipt,null,2)+'\n',{flag:'wx',mode:0o600});console.log(JSON.stringify(receipt));return receipt;
 }catch(error){await fs.writeFile(path.join(output,'failure.json'),JSON.stringify({status:'failed',sourceRevision:revision,checks,errorClass:error?.name??'Error',errorCode:/^[A-Z0-9_]{1,60}$/.test(error?.code??'')?error.code:'REDACTED',hostedApproved:false},null,2)+'\n',{flag:'wx',mode:0o600});throw error;
 }finally{await stop(gateway);await stop(next);await service?.close();await database?.close();await rpc?.close();for(const log of logs)await log.close();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)runTopology(process.argv.slice(2)).catch(()=>{console.error('Native topology acceptance failed; private fixture evidence retained.');process.exitCode=1;});
