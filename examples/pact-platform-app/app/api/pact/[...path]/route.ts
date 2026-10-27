import 'server-only';
import {createHash} from 'node:crypto';
import {createPactApiHandler,resolvePactEnvironment} from '@pact/sdk/server';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const binding=process.env.PACT_BUILD_BINDING_JSON;
const configuration=resolvePactEnvironment({application:'platform',environment:process.env,
 phase:process.env.NODE_ENV==='development'?'development':'start',...(binding?{expectedBinding:JSON.parse(binding)}:{})});
const offer=configuration.server.protectedOffer;
// This asset belongs to the customer server. Never import this module in a client component.
const privateAsset='CANVAS_PRIVATE_LICENSED_ASSET_V1\nLicensed sample: the private brush recipe uses violet, ochre and graphite.\n';
let completedOperations=0;
const handler=createPactApiHandler({
 prefix:'/api/pact',origin:configuration.server.origin,rpcUrls:configuration.server.rpcUrls,
 authMode:configuration.server.authMode,protectedOffer:configuration.server.policy==='licensed-demo-v1'?offer??undefined:undefined,
 diagnostics:{onEvent:event=>{console.info(JSON.stringify(event));}},
 resources:configuration.server.policy==='licensed-demo-v1'&&offer?{
  'licensed-asset':{offer,prepare:()=>({body:privateAsset,contentType:'text/plain; charset=utf-8'})},
  'render-receipt':{offer,method:'POST',prepare:({walletAddress,offerAddress})=>{
   // Bounded, side-effect-free preparation. A real renderer would receive the same abort signal.
   const digest=createHash('sha256').update(privateAsset).update(walletAddress).update(offerAddress).digest('hex');
   return{body:JSON.stringify({walletAddress,offerAddress,digest}),contentType:'application/json',commit:()=>{completedOperations++;return undefined;}};
  }}
 }:undefined
});
export const GET=handler;
export const POST=handler;
