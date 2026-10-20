import {generateKeyPairSync,sign,randomBytes} from 'node:crypto';
import {mkdtemp,mkdir,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {createDatabase,migrate} from '../src/database.mjs';
import {createService} from '../src/service.mjs';
export function wallet(){
  const pair=generateKeyPairSync('ed25519'),bytes=pair.publicKey.export({format:'der',type:'spki'}).subarray(-32);
  const alphabet='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let n=BigInt(`0x${bytes.toString('hex')}`),address='';
  while(n){address=alphabet[Number(n%58n)]+address;n/=58n;}
  for(const byte of bytes){if(byte!==0)break;address=`1${address}`;}
  return{address,sign:message=>sign(null,Buffer.from(message),pair.privateKey).toString('base64')};
}
export async function fixture(options={}){
  const database=options.database??await createDatabase({profile:'test',localPath:options.localPath});
  await migrate(database);
  const clock=options.clockState??{value:Date.now()},pepper=options.pepper??randomBytes(32).toString('base64url');
  const temporary=!options.clockDirectory&&!options.localPath&&!options.clock;
  const clockDirectory=options.clockDirectory??(options.localPath?join(options.localPath,'.clock'):options.clock?undefined:await mkdtemp(join(tmpdir(),'pact-clock-test-')));
  if(clockDirectory){
    await mkdir(clockDirectory,{recursive:true,mode:0o700});
    if(!options.now){try{const record=await readFile(join(clockDirectory,'authority.bin'));
      const ceiling=Number(record.subarray(111,127).toString('ascii'));
      if(ceiling>Date.now())await delay(ceiling-Date.now()+2);clock.value=Date.now();
    }catch(error){if(error.code!=='ENOENT')throw error;}}
  }
  const wallNow=options.now??(()=>clock.value),monotonicNow=options.monotonicNow??wallNow;
  const service=await createService({database,profile:'test',origin:'http://localhost:3000',pepper,
    ...(options.clock?{clock:options.clock}:{clockDirectory,now:wallNow,monotonicNow}),rateLimit:10000,
    ...(!options.reader&&!options.readerOptions?{reader:{
      async readiness(){return{ready:true,network:'devnet',programId:'EiiiWWsW2kkqP6nugHz6iBADvhnW5xnibAtZ82ZExVqy',
        contextSlot:100,startedAtMs:clock.value,receivedAtMs:clock.value,chainTimestamp:String(Math.floor(clock.value/1000))};},
    }}:{}),...options});
  if(options.beforeReady)await options.beforeReady(service);
  await service.server.ready();
  return{...service,clock,pepper,async cleanup(){await service.close();if(!options.database)await database.close();if(temporary){
    if(!clockDirectory.startsWith(join(tmpdir(),'pact-clock-test-')))throw Error('unexpected disposable clock path');
    await rm(clockDirectory,{recursive:true,force:true});}}};
}
export async function client(service,identity=wallet()){
  const jar=new Map();let csrf;
  async function request(method,url,body,headers={}){
    const response=await service.server.inject({method,url,payload:body,headers:{origin:service.options.origin,
      ...(csrf?{'x-pact-csrf':csrf}:{}),cookie:[...jar].map(([k,v])=>`${k}=${v}`).join('; '),...headers}});
    for(const c of response.cookies)jar.set(c.name,c.value);
    let json;try{json=response.json();}catch{}
    if(json?.csrfToken)csrf=json.csrfToken;
    return{status:response.statusCode,json,response};
  }
  await request('GET','/v1/developer/auth/session');
  async function login(){
    const challenge=await request('POST','/v1/developer/auth/challenge',{walletAddress:identity.address});
    if(challenge.status!==200)throw Error(JSON.stringify(challenge.json));
    const result=await request('POST','/v1/developer/auth/verify',{
      challengeId:challenge.json.challengeId,signatureBase64:identity.sign(challenge.json.message)});
    if(result.status!==200)throw Error(JSON.stringify(result.json));
    return result;
  }
  await login();
  async function proof(action,appId,payload){
    const result=await request('POST','/v1/developer/actions/challenge',{action,appId,payload});
    if(result.status!==200)throw Error(JSON.stringify(result.json));
    return{challengeId:result.json.challengeId,signatureBase64:identity.sign(result.json.message)};
  }
  async function mutation(method,url,action,appId,payload){return request(method,url,{payload,proof:await proof(action,appId,payload)});}
  return{identity,request,proof,mutation,login,jar,get csrf(){return csrf;}};
}
