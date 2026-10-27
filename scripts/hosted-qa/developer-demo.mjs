// Independent installed consumer acceptance. Synthetic messages/accounts only; no chain writes.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createHash, randomBytes} from 'node:crypto';
import {createServer} from 'node:http';
import {mkdtemp, mkdir, readFile, writeFile, rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createDatabase, migrate} from '../../services/pact-api/src/database.mjs';
import {createService} from '../../services/pact-api/src/service.mjs';
import {Browser} from './browser.mjs';
import {rpcFixture} from './rpc-fixture.mjs';
import {prepareDatabase, wallet} from './helpers.mjs';
import {npmCli} from '../validation/common.mjs';
import {createKit,materializeKit} from '../release/staging-source.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const random=()=>randomBytes(32).toString('base64url');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const check=(condition)=>assert.ok(condition,'DEVELOPER_DEMO_EXPECTATION_FAILED');
const cleanEnv=()=>{
 const env={...process.env};
 for(const name of Object.keys(env))if(/^(?:NODE_OPTIONS$|NODE_PATH$|PACT_|NEXT_PUBLIC_|VERCEL|AWS_|NETLIFY|CF_|K_SERVICE$|WEB_CONCURRENCY$|npm_config_|NPM_CONFIG_)/i.test(name))delete env[name];
 return {...env,PATH:path.dirname(process.execPath)+path.delimiter+env.PATH,NEXT_TELEMETRY_DISABLED:'1'};
};
async function command(args,cwd){
 const configDirectory=await mkdtemp(path.join(os.tmpdir(),'pact-demo-npm-'));
 const userconfig=path.join(configDirectory,'user.npmrc'),globalconfig=path.join(configDirectory,'global.npmrc');
 await writeFile(userconfig,'',{mode:0o600,flag:'wx'});await writeFile(globalconfig,'',{mode:0o600,flag:'wx'});
 try{return await new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,[npmCli(),...args],{cwd,env:{...cleanEnv(),npm_config_userconfig:userconfig,npm_config_globalconfig:globalconfig},stdio:['ignore','pipe','pipe'],windowsHide:true});
  let output='',size=0;
  for(const stream of [child.stdout,child.stderr])stream.on('data',bytes=>{size+=bytes.length;if(size>1048576)child.kill();else output+=bytes.toString();});
  child.once('error',()=>reject(Error('DEVELOPER_DEMO_PACKAGE_COMMAND_FAILED')));
  child.once('exit',code=>code===0?resolve(output):reject(Error('DEVELOPER_DEMO_PACKAGE_COMMAND_FAILED')));
 });}finally{check(path.dirname(configDirectory)===path.resolve(os.tmpdir())&&path.basename(configDirectory).startsWith('pact-demo-npm-'));await rm(configDirectory,{recursive:true,force:true});}
}
async function listen(server){await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});return `http://127.0.0.1:${server.address().port}`;}
async function close(server){if(server?.listening){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}}
async function installedConsumer(directory,config){
 const launcher=path.join(directory,'consumer.mjs');
 await writeFile(launcher,`import {createServer} from 'node:http';
import {createPactClient} from '@pact/hosted-client';
import {createExpressExample} from './node_modules/pact-hosted-express-example/server.mjs';
let input='';for await(const bytes of process.stdin){input+=bytes;if(input.length>8192)throw Error('CONFIGURATION_TOO_LARGE');}
const config=JSON.parse(input);input='';
const client=createPactClient({origin:config.pactOrigin,apiKey:config.apiKey,appId:config.appId});
const {app}=createExpressExample({config,client});delete config.apiKey;
const server=createServer({requestTimeout:10000,headersTimeout:10000},app);
server.listen(Number(new URL(config.origin).port),'127.0.0.1',()=>process.stdout.write('READY\\n'));
process.on('SIGTERM',()=>{server.closeAllConnections();server.close(()=>process.exit(0));});
`);
 const child=spawn(process.execPath,[launcher],{cwd:directory,env:cleanEnv(),stdio:['pipe','pipe','pipe'],windowsHide:true});
 const stop=async()=>{
  if(child.exitCode!==null||child.signalCode!==null)return;
  let timeout;
  try{await new Promise((resolve,reject)=>{child.once('exit',resolve);timeout=setTimeout(()=>reject(Error('DEVELOPER_DEMO_CHILD_STOP_FAILED')),10000);child.kill();});}
  finally{clearTimeout(timeout);}
 };
 // The credential is sent only through a private anonymous pipe, never argv, output or a file.
 const ready=new Promise((resolve,reject)=>{
  let output='';child.stdout.on('data',bytes=>{output+=bytes;if(output==='READY\n')resolve();else if(output.length>256)reject(Error('DEVELOPER_DEMO_UNEXPECTED_CHILD_OUTPUT'));});
  child.stderr.resume();child.once('error',()=>reject(Error('DEVELOPER_DEMO_CHILD_FAILED')));child.once('exit',()=>reject(Error('DEVELOPER_DEMO_CHILD_EXITED')));
 });
 child.stdin.end(JSON.stringify(config));
 let timer;
 try{await Promise.race([ready,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('DEVELOPER_DEMO_CHILD_START_TIMEOUT')),15000);})]);}
 catch(error){await stop();throw error;}finally{clearTimeout(timer);}
 return stop;
}
function consumerBrowser(origin){
 const jar=new Map();let csrf;
 async function request(method,route,body){
  const response=await fetch(new URL(route,origin),{method,redirect:'manual',headers:{cookie:[...jar].map(([k,v])=>k+'='+v).join('; '),...(body?{origin,'content-type':'application/json','x-pact-csrf':csrf}:{})},...(body?{body:JSON.stringify(body)}:{})});
  for(const cookie of response.headers.getSetCookie()){const pair=cookie.split(';')[0],i=pair.indexOf('=');jar.set(pair.slice(0,i),pair.slice(i+1));}
  const text=await response.text();check(!/pact_grant_|pact_sk_dev_key_/.test(text));
  return {status:response.status,data:text?JSON.parse(text):null,headers:response.headers};
 }
 return {request,async session(){const response=await request('GET','/api/session');check(response.status===200);csrf=response.data.csrfToken;return response.data;}};
}
async function prove(base,origin,loginUrl,identity){
 const transactionId=new URL(loginUrl).searchParams.get('transactionId'),buyer=new Browser(base,origin);
 let response=await buyer.request('GET','/v1/connect/transactions/'+transactionId);check(response.status===200);buyer.csrf=response.data.csrfToken;
 response=await buyer.request('POST','/v1/connect/challenge',{transactionId,walletAddress:identity.address});check(response.status===200);
 response=await buyer.request('POST','/v1/connect/verify',{transactionId,challengeId:response.data.challengeId,signatureBase64:identity.sign(response.data.message)});check(response.status===200);
 return response.data.callbackUrl;
}
export async function runDeveloperDemo(){
 const runtime=JSON.parse(await readFile(path.join(root,'scripts/validation/runtime.json'),'utf8'));
 check(process.version===`v${runtime.node}`&&(await command(['--version'],root)).trim()===runtime.npm);
 const source=await createKit(root);
 const scratch=await mkdtemp(path.join(os.tmpdir(),'pact-developer-demo-'));
 check(!scratch.toLowerCase().startsWith(root.toLowerCase()+path.sep));
 let database,rpc,service,proxy,stopConsumer;
 const receipt={schemaVersion:1,kind:'independent-packed-developer-demo',sourceRevision:source.manifest.sourceRevision,sourceArchiveSha256:source.sha256,trackedWorkingTreeClean:true,driverSha256:sha(await readFile(fileURLToPath(import.meta.url))),node:process.version,npm:runtime.npm,synthetic:true,blockchainPurchases:0,networkTransactions:0,externalPublication:false,checks:{},archives:{}};
 const pass=name=>{receipt.checks[name]='PASS';};
 try{
  const packs=path.join(scratch,'packs'),consumer=path.join(scratch,'consumer');await mkdir(packs);await mkdir(consumer);
  // Export committed blobs before packing: ignored workstation files, including
  // active credentials, must never enter even a temporary consumer archive.
  const packedSource=path.join(scratch,'source');
  await materializeKit(source.bytes,source.manifest.sourceRevision,source.sha256,packedSource);
  for(const [name,source] of [['client','packages/pact-hosted-client'],['engine','examples/pact-hosted-common'],['express','examples/pact-hosted-express']]){
   const output=JSON.parse(await command(['pack','.','--ignore-scripts','--json','--pack-destination',packs],path.join(packedSource,source)));
   const filename=output[0]?.filename;check(typeof filename==='string'&&path.basename(filename)===filename);
   receipt.archives[name]={filename,sha256:sha(await readFile(path.join(packs,filename)))};
  }
  const dependencies={'@pact/hosted-client':`file:../packs/${receipt.archives.client.filename}`,'@pact/hosted-example-server':`file:../packs/${receipt.archives.engine.filename}`,'pact-hosted-express-example':`file:../packs/${receipt.archives.express.filename}`};
  await writeFile(path.join(consumer,'package.json'),JSON.stringify({name:'pact-independent-acceptance',private:true,type:'module',dependencies,overrides:{'pact-hosted-express-example':{'@pact/hosted-client':'$@pact/hosted-client','@pact/hosted-example-server':'$@pact/hosted-example-server'}}}));
  await command(['install','--package-lock-only','--ignore-scripts','--no-audit','--no-fund'],consumer);
  const approvedLock=JSON.parse(await readFile(path.join(root,'examples/pact-hosted-express/package-lock.json'),'utf8'));
  const installedLock=JSON.parse(await readFile(path.join(consumer,'package-lock.json'),'utf8'));
  // Preserve the reviewed registry graph; packing private modules must not silently upgrade Express transitives.
  for(const [entry,item] of Object.entries(installedLock.packages))if(item.resolved?.startsWith('https:')){
   const reviewed=approvedLock.packages[entry];check(reviewed?.integrity&&reviewed.resolved?.startsWith('https:'));
   installedLock.packages[entry]=reviewed;
  }
  await writeFile(path.join(consumer,'package-lock.json'),JSON.stringify(installedLock,null,2));
  await command(['ci','--ignore-scripts','--no-audit','--no-fund'],consumer);
  const installed=JSON.parse(await command(['ls','--all','--json'],consumer));check(!installed.problems);pass('packedPackagesInstalledOutsideRepository');
  const approvedRegistry=new Set(Object.values(approvedLock.packages).filter(item=>item.integrity).map(item=>`${item.version}:${item.integrity}`));
  for(const item of Object.values(installedLock.packages))if(item.resolved?.startsWith('https:'))check(approvedRegistry.has(`${item.version}:${item.integrity}`));
  pass('installedRegistryDependenciesMatchReviewedLock');
  const host=createServer();const consumerOrigin=await listen(host);await close(host);
  let upstream;
  proxy=createServer(async(req,res)=>{try{
   let body='';for await(const bytes of req){body+=bytes;check(body.length<=16384);}
   const headers={'content-type':'application/json'};for(const name of ['authorization','cookie','origin','x-pact-csrf'])if(req.headers[name])headers[name]=req.headers[name];
   const response=await fetch(upstream+req.url,{method:req.method,headers,redirect:'manual',...(body?{body}:{})});
   res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
  }catch{res.writeHead(503,{'content-type':'application/json','cache-control':'no-store'});res.end('{}');}});
  const pactOrigin=await listen(proxy);
  database=await createDatabase({connectionString:await prepareDatabase(),profile:'test'});await migrate(database);rpc=await rpcFixture();
  await mkdir(path.join(scratch,'clock'),{mode:0o700});
  service=await createService({database,origin:pactOrigin,pepper:random(),profile:'test',clockDirectory:path.join(scratch,'clock'),rateLimit:1000,readerOptions:{rpcUrl:rpc.url}});
  upstream=await service.server.listen({port:0,host:'127.0.0.1'});
  const developer=new Browser(upstream,pactOrigin),seller=new Browser(upstream,pactOrigin),buyer=wallet();
  check(new Set([developer.wallet.address,seller.wallet.address,buyer.address]).size===3);await developer.login();await seller.login();pass('threeDistinctSyntheticWalletIdentities');
  const createApp=async(admin,name)=>{const response=await admin.request('POST','/v1/developer/apps',{name,framework:'rest'});check(response.status===200);return{id:response.data.app.id,path:'/v1/developer/apps/'+response.data.app.id};};
  const foreign=await createApp(developer,'Synthetic independent developer'),own=await createApp(seller,'Synthetic independent seller');pass('publicHttpRegistrationAndWalletAuthentication');
  const offer=rpc.addOffer({seller:seller.wallet});
  let response=await developer.mutate('POST',foreign.path+'/resources',foreign.id,'resource.bind',{resourceKey:'premium',offerAddress:offer.address});check(response.status===403&&response.data.error.code==='OFFER_OWNERSHIP_REQUIRED');pass('foreignSellerBindingDenied');
  response=await seller.mutate('POST',own.path+'/resources',own.id,'resource.bind',{resourceKey:'premium',offerAddress:offer.address});check(response.status===200);pass('sellerOwnershipVerifiedAndResourceBound');
  response=await seller.mutate('POST',own.path+'/callback-uris',own.id,'callback.create',{uri:consumerOrigin+'/api/login/callback',websiteOrigin:consumerOrigin});check(response.status===200);
  response=await seller.mutate('POST',own.path+'/credentials',own.id,'credential.create',{name:'Synthetic independent backend',scopes:['connect:write','access:check'],expiresAt:Date.now()+3600000});check(response.status===200);
  const secret=response.data.secret,credentialId=response.data.credential.id;
  response=await seller.mutate('PATCH',own.path,own.id,'app.update',{status:'active'});check(response.status===200);pass('exactCallbackScopedCredentialAndActivation');
  response=await developer.request('GET',own.path);check(response.status===404);pass('unrelatedTenantCannotReadApplication');
  stopConsumer=await installedConsumer(consumer,{origin:consumerOrigin,pactOrigin,appId:own.id,apiKey:secret,resourceKey:'premium'});
  const browser=consumerBrowser(consumerOrigin);await browser.session();check((await browser.request('GET','/api/protected')).status===401);pass('backendOperationDeniesAnonymousCaller');
  const login=async()=>{const started=await browser.request('POST','/api/login/start',{});check(started.status===200);const callback=await prove(upstream,pactOrigin,started.data.loginUrl,buyer);const completed=await browser.request('GET',callback);check(completed.status===303&&completed.headers.get('location')===consumerOrigin+'/');check((await browser.session()).authenticated);return callback;};
  const callback=await login();pass('buyerStatePkceExchangeAndBackendGrantRetention');
  response=await developer.mutate('POST',foreign.path+'/callback-uris',foreign.id,'callback.create',{uri:consumerOrigin+'/api/login/callback',websiteOrigin:consumerOrigin});check(response.status===200);
  response=await developer.mutate('POST',foreign.path+'/credentials',foreign.id,'credential.create',{name:'Synthetic unrelated app',scopes:['connect:write','access:check'],expiresAt:Date.now()+3600000});check(response.status===200);const foreignKey=response.data.secret;
  response=await developer.mutate('PATCH',foreign.path,foreign.id,'app.update',{status:'active'});check(response.status===200);
  const verifier=random(),state=random(),redirectUri=consumerOrigin+'/api/login/callback';
  response=await developer.backend('/v1/connect/transactions',foreignKey,{redirectUri,state,codeChallenge:sha(Buffer.from(verifier)),codeChallengeMethod:'S256',purpose:'Synthetic cross-application isolation'});
  // The actual protocol uses base64url SHA256, never a hex substitute.
  check(response.status===400);
  response=await developer.backend('/v1/connect/transactions',foreignKey,{redirectUri,state,codeChallenge:createHash('sha256').update(verifier,'ascii').digest('base64url'),codeChallengeMethod:'S256',purpose:'Synthetic cross-application isolation'});check(response.status===200);
  const otherCallback=new URL(await prove(upstream,pactOrigin,response.data.loginUrl,buyer));
  response=await developer.backend('/v1/connect/token',foreignKey,{code:otherCallback.searchParams.get('code'),redirectUri,state,codeVerifier:verifier,issuer:pactOrigin});check(response.status===200);
  response=await seller.backend('/v1/access/check',secret,{walletGrant:response.data.walletGrant,resourceKey:'premium'});check(response.status===401);pass('foreignApplicationWalletGrantCannotBeReused');
  check((await browser.request('GET','/api/protected')).status===403);check((await browser.request('POST','/api/action',{})).status===403);pass('authenticatedUnlicensedBackendOperationsDenied');
  rpc.addLicense({offer,buyer,expirySeconds:BigInt(Math.floor(Date.now()/1000)+120)});
  check((await browser.request('GET','/api/protected')).status===200);response=await browser.request('POST','/api/action',{});check(response.status===200&&response.data.actionCount===1);pass('syntheticEntitlementAllowsActualBackendReadAndEffect');
  check((await browser.request('GET',callback)).status===303);check((await browser.session()).authenticated);pass('authorizationCodeReplayDoesNotMintAuthority');
  response=await browser.request('POST','/api/logout',{});check(response.status===200&&response.data.grantRevocationConfirmed);check((await browser.request('GET','/api/protected')).status===401);pass('grantRevocationAndLocalInvalidationDeny');
  await browser.session();await login();check((await browser.request('GET','/api/protected')).status===200);
  response=await seller.mutate('POST',own.path+'/credentials/'+credentialId+'/revoke',own.id,'credential.revoke',{credentialId});check(response.status===200);check((await browser.request('GET','/api/protected')).status===401);pass('credentialRevocationDeniesPreviouslyLicensedConsumer');
  check(rpc.calls.every(call=>['getGenesisHash','getMultipleAccounts'].includes(call.method)));pass('readOnlySyntheticRpcNoTransactions');
  check((await createKit(root)).sha256===source.sha256);
  receipt.status='PASS';receipt.completedAt=new Date().toISOString();receipt.checkCount=Object.keys(receipt.checks).length;
  return receipt;
 }finally{
  if(stopConsumer)await stopConsumer();await close(proxy);if(service)await service.close();if(database)await database.close();if(rpc)await rpc.close();
  const resolved=path.resolve(scratch);check(path.dirname(resolved)===path.resolve(os.tmpdir())&&path.basename(resolved).startsWith('pact-developer-demo-'));
  await rm(resolved,{recursive:true,force:true});
 }
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{check(process.argv.length===2);console.log(JSON.stringify(await runDeveloperDemo(),null,2));}
 catch{console.error('DEVELOPER_DEMO_FAILED: inspect the guarded fixture/runtime and package availability; no raw diagnostic or secret was exported.');process.exitCode=1;}
}
