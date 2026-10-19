import {createServer} from 'node:http';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const sdkRequire=createRequire(new URL('../../packages/pact-sdk/package.json',import.meta.url));
const {PublicKey}=sdkRequire('@solana/web3.js');
export const PROGRAM='EiiiWWsW2kkqP6nugHz6iBADvhnW5xnibAtZ82ZExVqy';
export const GENESIS='EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG';
const CLOCK='SysvarC1ock11111111111111111111111111111111';
const SYSVAR='Sysvar1111111111111111111111111111111111111';
const LOADER='BPFLoaderUpgradeab1e11111111111111111111111';
const account=(data,owner=PROGRAM)=>({data:[data.toString('base64'),'base64'],owner,executable:false,lamports:1000000});

// Independent raw wire fixture: no PACT offer builder/reader/serializer imported.
// Standard web3 PDA derivation is used solely to construct random-wallet fixtures.
export async function rpcFixture(){
 const offers=new Map(),calls=[];
 const state={genesis:GENESIS,slot:100,fail:false,owner:PROGRAM,programExecutable:true,clockOffset:0};
 function addOffer({seller,nonce=1n,active=true}){
  const nonceBytes=Buffer.alloc(8);nonceBytes.writeBigUInt64LE(BigInt(nonce));
  const [address,bump]=PublicKey.findProgramAddressSync([Buffer.from('offer'),seller.publicKeyBytes,nonceBytes],new PublicKey(PROGRAM));
  const bytes=Buffer.alloc(98);
  Buffer.from('d7583c47aaa249e5','hex').copy(bytes,0);seller.publicKeyBytes.copy(bytes,8);nonceBytes.copy(bytes,40);
  bytes.writeBigUInt64LE(1000000n,48);bytes.writeBigUInt64LE(60n,56);bytes.fill(9,64,96);bytes[96]=active?1:0;bytes[97]=bump;
  const offer={address:address.toBase58(),bytes,active};offers.set(offer.address,offer);return offer;
 }
 const server=createServer(async(req,res)=>{
  try{
   assert.equal(req.method,'POST');let text='';for await(const chunk of req){text+=chunk;if(text.length>8192)throw Error('large fixture request');}
   const q=JSON.parse(text);calls.push(q);
   assert.ok(['getGenesisHash','getMultipleAccounts'].includes(q.method),'No transactions allowed');
   if(state.fail){res.writeHead(503);res.end('fixture unavailable');return;}
   let result=state.genesis;
   if(q.method==='getMultipleAccounts'){
    const slot=++state.slot,clock=Buffer.alloc(40);clock.writeBigUInt64LE(BigInt(slot));
    clock.writeBigInt64LE(BigInt(Math.floor(Date.now()/1000)+state.clockOffset),32);
    result={context:{slot},value:q.params[0].map(address=>{
     if(address===CLOCK)return account(clock,SYSVAR);
     if(address===PROGRAM)return {...account(Buffer.alloc(0),LOADER),executable:state.programExecutable};
     const offer=offers.get(address);if(!offer)return null;
     const bytes=Buffer.from(offer.bytes);bytes[96]=offer.active?1:0;
     return account(bytes,state.owner);
    })};
   }
   res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({jsonrpc:'2.0',id:q.id,result}));
  }catch(error){res.writeHead(500);res.end('fixture failure');}
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 const url=`http://127.0.0.1:${server.address().port}`;
 return {url,state,calls,offers,addOffer,close:()=>new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()))};
}
