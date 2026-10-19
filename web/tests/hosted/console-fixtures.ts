import {generateKeyPairSync,sign,createHash} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {expect,type Page,type TestInfo} from '@playwright/test';

export const CONSUMER='http://127.0.0.1:3113';
export const proofHashes=new Set<string>();
export function signer(){
 const {privateKey,publicKey}=generateKeyPairSync('ed25519');
 const bytes=publicKey.export({format:'der',type:'spki'}).subarray(-32),alphabet='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
 let number=BigInt('0x'+bytes.toString('hex')),address='';
 while(number>0n){address=alphabet[Number(number%58n)]+address;number/=58n;}
 for(const byte of bytes){if(byte!==0)break;address='1'+address;}
 return{address,publicKeyBase64:bytes.toString('base64'),sign:(message:Uint8Array)=>{
  const result=sign(null,message,privateKey).toString('base64');proofHashes.add(createHash('sha256').update(result).digest('hex'));return result;
 }};
}
export async function installAdmin(page:Page,options:{rejectSign?:boolean;rejectConnect?:boolean}={}){
 const first=signer(),second=signer(),keys=new Map([[first.address,first],[second.address,second]]);
 await page.exposeFunction('__qaConsoleSign',(wallet:string,bytes:number[])=>{
  const selected=keys.get(wallet);if(!selected)throw Error('Unknown disposable signer');return [...Buffer.from(selected.sign(Buffer.from(bytes)),'base64')];
 });
 await page.addInitScript(({addresses,rejectSign,rejectConnect})=>{
  const surface=window as unknown as Record<string,any>,listeners=new Map<string,Set<(...args:any[])=>void>>();
  let current=addresses[0],connected=false;const stats={connect:0,sign:0};surface.__qaConsoleStats=stats;
  const key=()=>({toString:()=>current});
  const provider={isPhantom:true,get publicKey(){return connected?key():null;},
   async connect(){stats.connect++;if(rejectConnect)throw Error('Synthetic connection refused');connected=true;return{publicKey:key()};},
   async signMessage(bytes:Uint8Array){stats.sign++;if(rejectSign)throw Error('Synthetic signature refused');return{
    signature:new Uint8Array(await surface.__qaConsoleSign(current,[...bytes])),publicKey:key()};},
   on(event:string,callback:(...args:any[])=>void){if(!listeners.has(event))listeners.set(event,new Set());listeners.get(event)!.add(callback);},
   removeListener(event:string,callback:(...args:any[])=>void){listeners.get(event)?.delete(callback);},
  };
  surface.phantom={solana:provider};surface.__qaConsoleSwitch=()=>{current=addresses[1];connected=true;for(const fn of listeners.get('accountChanged')??[])fn(key());};
 },{addresses:[first.address,second.address],...options});
 return{first,second};
}
export const stats=(page:Page)=>page.evaluate(()=>(window as unknown as {__qaConsoleStats:{connect:number;sign:number}}).__qaConsoleStats);
export async function fixturePost(page:Page,route:string,data:Record<string,unknown>){
 const r=await page.request.post(CONSUMER+route,{data});if(!r.ok())throw Error('Fixture operation failed');return r.json();
}
export async function knownOffer(page:Page,identity:ReturnType<typeof signer>){
 const r=await fixturePost(page,'/qa/seller-offer',{walletAddress:identity.address,publicKeyBase64:identity.publicKeyBase64});return String(r.offerAddress);
}
export async function validateCredential(secret:string){
 try{
  const response=await fetch(CONSUMER+'/qa/validate-key',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({secret})});
  if(!response.ok)throw Error();return await response.json();
 }catch{throw Error('Fixture credential validation could not complete');}
}
export async function exerciseAccess(secret:string,offerAddress:string,resourceKey='premium'){
 try{
  const response=await fetch(CONSUMER+'/qa/exercise-access',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({secret,offerAddress,resourceKey})});
  if(!response.ok)throw Error();return await response.json();
 }catch{throw Error('Fixture protected access checks could not complete');}
}
export async function recordProofHashes(info:TestInfo){
 await mkdir(info.project.outputDir,{recursive:true});await writeFile(path.join(info.project.outputDir,`worker-${info.workerIndex}-proof-hashes.json`),JSON.stringify({hashes:[...proofHashes]})+'\n');
}
export async function revealedSecret(page:Page){
 const region=page.getByTestId('one-time-secret');await expect(region).toBeVisible();
 const content=await region.evaluate(el=>el.textContent+' '+[...el.querySelectorAll('input,textarea')].map(input=>(input as HTMLInputElement).value).join(' '));
 const matches=content.match(/pact_sk_dev_key_[a-f0-9]{32}_[A-Za-z0-9_-]{43}/g)??[];
 expect(matches.length>0).toBe(true);const secret=matches[0];if(!secret)throw Error('Expected once-only credential was not available');return secret;
}
export async function sanitizedScreenshot(page:Page,info:TestInfo){
 const safe=await page.evaluate(()=>{
  const text=document.body.textContent??'';return !/pact_sk_dev_key_[a-f0-9]{32}_[A-Za-z0-9_-]{43}|Browser\/session binding: [a-f0-9]{64}/.test(text)
   &&![...document.querySelectorAll('input,textarea')].some(input=>/pact_sk_dev_key_[a-f0-9]{32}_[A-Za-z0-9_-]{43}|Browser\/session binding: [a-f0-9]{64}/.test((input as HTMLInputElement).value));
 });
 expect(safe).toBe(true);await page.screenshot({path:info.outputPath('console-sanitized.png'),fullPage:true});
}
