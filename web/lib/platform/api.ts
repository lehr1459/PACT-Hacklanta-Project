import 'server-only';
import {createPactApiHandler,resolvePactEnvironment} from '@pact/sdk/server';

// Next inlines this intentionally public binding. Private RPC remains runtime-only.
const binding=process.env.PACT_BUILD_BINDING_JSON;
const configuration=resolvePactEnvironment({application:'marketplace',environment:process.env,
 phase:process.env.NODE_ENV==='development'?'development':'start',...(binding?{expectedBinding:JSON.parse(binding)}:{})});
export const platformApi=createPactApiHandler({origin:configuration.server.origin,authMode:configuration.server.authMode,
 protectedOffer:configuration.server.policy==='licensed-demo-v1'?configuration.server.protectedOffer??undefined:undefined,
 rpcUrls:configuration.server.rpcUrls,diagnostics:{onEvent:event=>{console.info(JSON.stringify(event));}}});
