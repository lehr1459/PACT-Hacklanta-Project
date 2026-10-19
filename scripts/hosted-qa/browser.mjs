import assert from 'node:assert/strict';
import {wallet} from './helpers.mjs';
export const ORIGIN='http://localhost:3000';
export class Browser {
 constructor(base){this.base=base;this.jar=new Map();this.csrf=null;this.wallet=wallet();}
 async request(method,path,body,overrides={}){
  const headers={Origin:ORIGIN,...(body===undefined?{}:{'Content-Type':'application/json'})};
  if(this.jar.size)headers.Cookie=[...this.jar].map(([k,v])=>`${k}=${v}`).join('; ');
  if(this.csrf)headers['x-pact-csrf']=this.csrf;
  for(const [key,value]of Object.entries(overrides)){if(value===null)delete headers[key];else headers[key]=value;}
  const response=await fetch(this.base+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body),redirect:'manual'});
  for(const value of response.headers.getSetCookie()){
   const pair=value.split(';')[0],i=pair.indexOf('=');this.jar.set(pair.slice(0,i),pair.slice(i+1));
  }
  const data=await response.json();
  assert.equal(response.headers.get('cache-control'),'no-store');
  assert.equal(data.schemaVersion,1);assert.ok(data.requestId);
  return {status:response.status,data,headers:response.headers};
 }
 async login(){
  let r=await this.request('GET','/v1/developer/auth/session');assert.equal(r.status,200);this.csrf=r.data.csrfToken;
  r=await this.request('POST','/v1/developer/auth/challenge',{walletAddress:this.wallet.address});assert.equal(r.status,200);
  const proof={challengeId:r.data.challengeId,signatureBase64:this.wallet.sign(r.data.message)};
  r=await this.request('POST','/v1/developer/auth/verify',proof);assert.equal(r.status,200);
  assert.equal(r.data.account.walletAddress,this.wallet.address);return proof;
 }
 async proof(appId,action,payload){
  const r=await this.request('POST','/v1/developer/actions/challenge',{appId,action,payload});
  assert.equal(r.status,200,JSON.stringify(r.data));
  assert.ok(r.data.message.includes(`Purpose: ${action}`));
  assert.ok(r.data.message.includes(`Application: ${appId}`));
  return {challengeId:r.data.challengeId,signatureBase64:this.wallet.sign(r.data.message)};
 }
 async mutate(method,path,appId,action,payload){return this.request(method,path,{payload,proof:await this.proof(appId,action,payload)});}
 async key(secret,payload={}){return this.request('POST','/v1/credentials/validate',payload,
  {Origin:null,Cookie:null,'x-pact-csrf':null,Authorization:`Bearer ${secret}`});}
}
