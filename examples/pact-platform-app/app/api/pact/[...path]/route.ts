import {createPactApiHandler} from '@pact/sdk/server';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const handler=createPactApiHandler({prefix:'/api/pact',origin:process.env.PACT_APP_ORIGIN??'http://localhost:3008',rpcUrl:process.env.SOLANA_RPC_URL??process.env.NEXT_PUBLIC_SOLANA_RPC_URL??'https://api.devnet.solana.com',authMode:'single-process',protectedOffer:process.env.NEXT_PUBLIC_PACT_OFFER??'7EdfowQEZyVyyp7bYdQyzmprZtVU9mVba8cysHm2Ardh'});
export const GET=handler;
export const POST=handler;
