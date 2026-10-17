import {PublicKey} from '@solana/web3.js';
export const PROGRAM='EiiiWWsW2kkqP6nugHz6iBADvhnW5xnibAtZ82ZExVqy',GENESIS='EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG';
export const seller=new PublicKey(new Uint8Array(32).fill(1)),wallet=new PublicKey(new Uint8Array(32).fill(2)),other=new PublicKey(new Uint8Array(32).fill(3));
const nonce=Buffer.alloc(8);nonce.writeBigUInt64LE(1n);
export const [offer,offerBump]=PublicKey.findProgramAddressSync([Buffer.from('offer'),seller.toBuffer(),nonce],new PublicKey(PROGRAM));
export const [license,licenseBump]=PublicKey.findProgramAddressSync([Buffer.from('license'),offer.toBuffer(),wallet.toBuffer()],new PublicKey(PROGRAM));
export const input={offer:offer.toBase58(),wallet:wallet.toBase58()};
export function fixture({slot=100,timestamp=1000n,expiry=1060n}={}){
 const offerData=Buffer.alloc(98);Buffer.from('d7583c47aaa249e5','hex').copy(offerData);seller.toBuffer().copy(offerData,8);nonce.copy(offerData,40);offerData.writeBigUInt64LE(1000000n,48);offerData.writeBigUInt64LE(60n,56);offerData.fill(9,64,96);offerData[96]=1;offerData[97]=offerBump;
 const licenseData=Buffer.alloc(81);Buffer.from('f898c364b96cb0e7','hex').copy(licenseData);offer.toBuffer().copy(licenseData,8);wallet.toBuffer().copy(licenseData,40);licenseData.writeBigInt64LE(expiry,72);licenseData[80]=licenseBump;
 const clock=Buffer.alloc(40);clock.writeBigUInt64LE(BigInt(slot));clock.writeBigInt64LE(timestamp,32);
 const account=(data,owner=PROGRAM)=>({data:[data.toString('base64'),'base64'],owner,executable:false,lamports:1000000});
 return{context:{slot},value:[account(offerData),account(licenseData),account(clock,'Sysvar1111111111111111111111111111111111111'),{data:['','base64'],owner:'BPFLoaderUpgradeab1e11111111111111111111111',executable:true,lamports:833120}]};
}
export function source(state={snapshot:fixture(),genesis:GENESIS}){
 const calls=[];const fetch=async(_url,init)=>{const request=JSON.parse(init.body);calls.push(request);if(!['getGenesisHash','getMultipleAccounts'].includes(request.method))throw Error('Forbidden transaction RPC');if(state.throw)throw Error('Controlled transport failure');if(state.hang)return new Promise(()=>{});if(state.bodyHang)return new Response(new ReadableStream({start(){}}));const body={jsonrpc:'2.0',id:request.id,result:request.method==='getGenesisHash'?state.genesis:state.snapshot};if(state.response)state.response(body,request);return Response.json(body,{status:state.http===false?503:200});};return{fetch,calls,state};
}
export function corrupt(snapshot,index,mutate){const data=Buffer.from(snapshot.value[index].data[0],'base64');mutate(data);snapshot.value[index].data[0]=data.toString('base64');}
