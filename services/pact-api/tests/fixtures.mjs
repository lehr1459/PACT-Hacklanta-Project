import {generateKeyPairSync,sign,randomBytes} from 'node:crypto';
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
  const clock={value:Date.now()},pepper=options.pepper??randomBytes(32).toString('base64url');
  const service=await createService({database,profile:'test',origin:'http://localhost:3000',pepper,
    now:()=>clock.value,rateLimit:10000,...options});
  await service.server.ready();
  return{...service,clock,pepper,async cleanup(){await service.close();if(!options.database)await database.close();}};
}
export async function client(service,identity=wallet()){
  const jar=new Map();let csrf;
  async function request(method,url,body,headers={}){
    const response=await service.server.inject({method,url,payload:body,headers:{origin:'http://localhost:3000',
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
