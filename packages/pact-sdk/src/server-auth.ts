import { randomBytes, createPublicKey, verify as verifySignature } from 'node:crypto';
import { PublicKey } from '@solana/web3.js';
import cluster from 'node:cluster';
import { isMainThread } from 'node:worker_threads';
import { PACT_PROGRAM_ID, DEVNET_GENESIS } from './index.js';

export class PlatformError extends Error { constructor(public code:string, message:string, public status=400){super(message);this.name='PlatformError';} }
export function canonicalAddress(value:unknown):string {try{if(typeof value!=='string'||value.length<32||value.length>44)throw Error();const p=new PublicKey(value);if(p.toBase58()!==value)throw Error();return value;}catch{throw new PlatformError('INVALID_INPUT','Expected a canonical Solana public address.');}}
export function canonicalOrigin(value:string){try{const u=new URL(value);if(u.username||u.password||u.origin!==value||!(u.protocol==='https:'||u.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(u.hostname)))throw Error();return u.origin;}catch{throw new PlatformError('INVALID_INPUT','Configure one canonical HTTPS or loopback origin.');}}
export type WalletAuthOptions={origin:string;now?:()=>number;authMode?:'single-process'|'disabled';challengeTtlMs?:number;sessionTtlMs?:number;capacity?:number};
type Challenge={wallet:string;binding:string;message:string;expiresAt:number};
type Session={wallet:string;expiresAt:number};
/** Atomic single-use challenges in one process. Deliberately unsupported on serverless/multi-instance deployments. */
export function createWalletAuth(options:WalletAuthOptions){
 const origin=canonicalOrigin(options.origin),clock=options.now??Date.now,capacity=options.capacity??1024,challengeTtl=options.challengeTtlMs??120000,sessionTtl=options.sessionTtlMs??900000;
 if(!Number.isInteger(capacity)||capacity<1||capacity>10000||!Number.isFinite(challengeTtl)||challengeTtl<1000||challengeTtl>300000||!Number.isFinite(sessionTtl)||sessionTtl<1000||sessionTtl>3600000)throw new PlatformError('INVALID_INPUT','Invalid authentication bounds.');
 if(options.authMode!==undefined&&!['single-process','disabled'].includes(options.authMode))throw new PlatformError('INVALID_INPUT','Unsupported authentication topology.');
 const forbidden=['VERCEL','AWS_LAMBDA_FUNCTION_NAME','AWS_EXECUTION_ENV','FUNCTIONS_WORKER_RUNTIME','AZURE_FUNCTIONS_ENVIRONMENT','K_SERVICE','NETLIFY','NODE_UNIQUE_ID'];
 const enabled=options.authMode==='single-process'&&isMainThread&&!cluster.isWorker&&!forbidden.some(k=>Boolean(process.env[k]))&&(process.env.WEB_CONCURRENCY===undefined||process.env.WEB_CONCURRENCY==='1');let previous=-Infinity;
 const challenges=new Map<string,Challenge>(),sessions=new Map<string,Session>();
 const id=()=>randomBytes(32).toString('base64url');
 function time(){const t=clock();if(!Number.isFinite(t)||t<previous)throw new PlatformError('AUTH_UNAVAILABLE','Authentication clock is unavailable.',503);previous=t;return t;}
 function ready(){if(!enabled)throw new PlatformError('AUTH_UNAVAILABLE','Wallet authentication requires an explicitly configured single-process server.',503);}
 function sweep(t:number){for(const[k,v]of challenges)if(v.expiresAt<=t)challenges.delete(k);for(const[k,v]of sessions)if(v.expiresAt<=t)sessions.delete(k);}
 return {
  challenge(walletInput:string,bindingInput?:string){ready();const wallet=canonicalAddress(walletInput),t=time();sweep(t);if(challenges.size>=capacity)throw new PlatformError('RATE_LIMITED','Authentication capacity reached.',429);const binding=bindingInput&&/^[A-Za-z0-9_-]{43}$/.test(bindingInput)?bindingInput:id(),challengeId=id(),expiresAt=t+challengeTtl;
   const message=['PACT wallet authentication v1',`Origin: ${origin}`,`Network: solana-devnet`,`Genesis: ${DEVNET_GENESIS}`,`Program: ${PACT_PROGRAM_ID}`,`Wallet: ${wallet}`,`Challenge: ${challengeId}`,`Session binding: ${binding}`,`Issued at: ${t}`,`Expires at: ${expiresAt}`,'Purpose: prove wallet control; no transaction or license purchase.'].join('\n');
   challenges.set(challengeId,{wallet,binding,message,expiresAt});return{challengeId,message,expiresAt,binding};
  },
  verify(challengeId:string,signatureBase64:string,binding:string|undefined){ready();const t=time(),c=challenges.get(challengeId);if(!c||c.expiresAt<=t||!binding||binding!==c.binding)throw new PlatformError('AUTH_INVALID','Challenge is invalid or expired.',401);
   // Consume synchronously before verification or asynchronous chain work. Failed proofs cannot be retried.
   challenges.delete(challengeId);let valid=false;try{if(typeof signatureBase64!=='string'||! /^[A-Za-z0-9+/]{86}==$/.test(signatureBase64))throw Error();const sig=Buffer.from(signatureBase64,'base64');if(sig.length!==64||sig.toString('base64')!==signatureBase64)throw Error();const key=createPublicKey({key:Buffer.concat([Buffer.from('302a300506032b6570032100','hex'),new PublicKey(c.wallet).toBuffer()]),format:'der',type:'spki'});valid=verifySignature(null,Buffer.from(c.message,'utf8'),key,sig);}catch{}
   if(!valid)throw new PlatformError('AUTH_INVALID','Wallet signature verification failed.',401);sweep(t);if(sessions.size>=capacity)throw new PlatformError('RATE_LIMITED','Session capacity reached.',429);const sessionId=id(),expiresAt=t+sessionTtl;sessions.set(sessionId,{wallet:c.wallet,expiresAt});return{sessionId,walletAddress:c.wallet,authenticated:true as const,expiresAt};
  },
  session(sessionId:string|undefined){ready();const t=time();sweep(t);const s=sessionId?sessions.get(sessionId):undefined;return s?{authenticated:true as const,walletAddress:s.wallet,expiresAt:s.expiresAt}:{authenticated:false as const};},
  logout(sessionId:string|undefined){ready();if(sessionId)sessions.delete(sessionId);return{authenticated:false as const};}
 };
}
