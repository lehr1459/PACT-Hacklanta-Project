import 'server-only';
import {createHash} from 'node:crypto';
import {createPactApiHandler} from '@pact/sdk/server';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const offer=process.env.NEXT_PUBLIC_PACT_OFFER??'7EdfowQEZyVyyp7bYdQyzmprZtVU9mVba8cysHm2Ardh';
// This asset belongs to the customer server. Never import this module in a client component.
const privateAsset='CANVAS_PRIVATE_LICENSED_ASSET_V1\nLicensed sample: the private brush recipe uses violet, ochre and graphite.\n';
let completedOperations=0;
const handler=createPactApiHandler({
 prefix:'/api/pact',origin:process.env.PACT_APP_ORIGIN??'http://localhost:3008',
 rpcUrl:process.env.SOLANA_RPC_URL??process.env.NEXT_PUBLIC_SOLANA_RPC_URL??'https://api.devnet.solana.com',
 authMode:'single-process',protectedOffer:offer,
 resources:{
  'licensed-asset':{offer,prepare:()=>({body:privateAsset,contentType:'text/plain; charset=utf-8'})},
  'render-receipt':{offer,method:'POST',prepare:({walletAddress,offerAddress})=>{
   // Bounded, side-effect-free preparation. A real renderer would receive the same abort signal.
   const digest=createHash('sha256').update(privateAsset).update(walletAddress).update(offerAddress).digest('hex');
   return{body:JSON.stringify({walletAddress,offerAddress,digest}),contentType:'application/json',commit:()=>{completedOperations++;return undefined;}};
  }}
 }
});
export const GET=handler;
export const POST=handler;
