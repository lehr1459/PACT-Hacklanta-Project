import { createPactApiHandler } from '@pact/sdk/server';
// Explicit local single-process opt-in. Never enable authentication on Vercel.
export const platformApi=createPactApiHandler({origin:process.env.PACT_APP_ORIGIN??'http://localhost:3007',authMode:process.env.PACT_AUTH_MODE==='single-process'?'single-process':'disabled',protectedOffer:process.env.PACT_PROTECTED_OFFER,rpcUrl:process.env.NEXT_PUBLIC_SOLANA_RPC_URL});
