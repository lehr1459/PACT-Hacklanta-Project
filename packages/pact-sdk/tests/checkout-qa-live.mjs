import assert from 'node:assert/strict';
import {createCheckoutClient} from '@pact/sdk/checkout';
const methods=[];
const client=createCheckoutClient({programId:'EiiiWWsW2kkqP6nugHz6iBADvhnW5xnibAtZ82ZExVqy',rpcUrl:'https://api.devnet.solana.com',fetch:async(input,init)=>{const req=JSON.parse(String(init.body));assert.ok(['getGenesisHash','getMultipleAccounts'].includes(req.method));methods.push(req.method);return fetch(input,init);}});
try{const quote=await client.getOffer({offer:'7EdfowQEZyVyyp7bYdQyzmprZtVU9mVba8cysHm2Ardh'});assert.equal(quote.priceLamports,'1000000');assert.equal(quote.durationSeconds,'180');assert.equal(quote.seller,'HXmEkejco1WDhYx3j94388JUSkqL6cCyf3BxxUdQZuz2');console.log(JSON.stringify({utc:new Date().toISOString(),classification:'actual Devnet public read-only, no connected identity or transaction',methods,quote},null,2));}finally{client.destroy();}
