import {generateKeyPairSync, sign, randomBytes} from 'node:crypto';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';

const require=createRequire(new URL('../../services/pact-api/package.json',import.meta.url));
export const {Client}=require('pg');
export const TEST_DATABASE_URL=process.env.PACT_QA_DATABASE_URL??'postgresql://pact_test:pact-local-fixture-only@127.0.0.1:55439/pact_hosted_qa';

// Independent encoding: no platform wallet/signature/canonical helpers imported.
function base58(bytes){
 const alphabet='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
 let number=BigInt('0x'+bytes.toString('hex')),encoded='';
 while(number>0n){encoded=alphabet[Number(number%58n)]+encoded;number/=58n;}
 for(const byte of bytes){if(byte!==0)break;encoded='1'+encoded;}
 return encoded;
}
export function wallet(){
 const {privateKey,publicKey}=generateKeyPairSync('ed25519');
 const bytes=publicKey.export({format:'der',type:'spki'}).subarray(-32);
 return {address:base58(bytes),sign:message=>sign(null,Buffer.from(message),privateKey).toString('base64')};
}
export const nonce=()=>randomBytes(12).toString('hex');
export function cookies(response){
 const headers=response.headers?.['set-cookie']??[];
 return (Array.isArray(headers)?headers:[headers]).map(value=>value.split(';')[0]).join('; ');
}
export function assertSecretAbsent(value,secrets){
 const output=JSON.stringify(value);
 for(const secret of secrets)assert.ok(!output.includes(secret),'secret appeared in redacted output');
}
export async function prepareDatabase(connectionString=TEST_DATABASE_URL){
 const url=new URL(connectionString);
 assert.equal(url.hostname,'127.0.0.1','QA DB must be exact loopback');
 assert.equal(url.pathname,'/pact_hosted_qa','QA must use its own database');
 const controlUrl=new URL(url);controlUrl.pathname='/postgres';
 const client=new Client({connectionString:controlUrl.href});
 await client.connect();
 try{
  if(!(await client.query('SELECT 1 FROM pg_database WHERE datname=$1',['pact_hosted_qa'])).rowCount)
   await client.query('CREATE DATABASE pact_hosted_qa');
 }finally{await client.end();}
 return connectionString;
}
