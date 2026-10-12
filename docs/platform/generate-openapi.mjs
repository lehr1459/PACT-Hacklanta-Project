import fs from 'node:fs/promises';
const ref=name=>({$ref:`#/components/schemas/${name}`});
const string={type:'string'},address={type:'string',pattern:'^[1-9A-HJ-NP-Za-km-z]{32,44}$'},decimal={type:'string',pattern:'^(0|[1-9][0-9]*)$'},integer={type:'integer',minimum:0},network={type:'string',const:'devnet'},program={type:'string',const:'EiiiWWsW2kkqP6nugHz6iBADvhnW5xnibAtZ82ZExVqy'};
const object=(properties,required=Object.keys(properties),strict=false)=>({type:'object',properties,required,...(strict?{additionalProperties:false}:{})});
const schemas={
 Error:object({error:object({code:string,message:string})}),
 Offer:object({program,offer:address,seller:address,priceLamports:decimal,durationSeconds:decimal,termsHash:{type:'string',pattern:'^0x[0-9a-f]{64}$'},active:{type:'boolean'},contextSlot:integer,chainTimestamp:decimal,startedAtMs:integer,receivedAtMs:integer}),
 PrepareOffer:object({network,programId:program,sellerWallet:address,nonce:decimal,metadataJson:{type:'string',description:'Exact UTF-8 public metadata, maximum 64 KiB. Hashes use Keccak-256; formatting matters.'}},['network','sellerWallet','nonce','metadataJson'],true),
 PrepareCheckout:object({network,programId:program,offerAddress:address,walletAddress:address,metadataJson:string},['network','offerAddress','walletAddress','metadataJson'],true),
 PreparedOffer:object({network,programId:program,offer:address,seller:address,nonce:decimal,priceLamports:decimal,durationSeconds:decimal,termsHash:string,transactionBase64:{type:'string',contentEncoding:'base64',description:'Unsigned v0 transaction. All signatures are zero; no server broadcast.'},blockhash:address,lastValidBlockHeight:integer}),
 PreparedCheckout:object({network,programId:program,quote:ref('Offer'),buyer:address,licensePda:address,transactionBase64:{type:'string',contentEncoding:'base64'},blockhash:address,lastValidBlockHeight:integer}),
 LicenseInput:object({offerAddress:address,walletAddress:address,network},['offerAddress','walletAddress'],true),
 LicenseStatus:object({program,offer:address,wallet:address,licensePda:address,contextSlot:integer,chainTimestamp:decimal,expiry:decimal,state:{type:'string',enum:['active','expired','missing']},active:{type:'boolean'},startedAtMs:integer,receivedAtMs:integer,lastProgressAtMs:integer}),
 PublicLicense:object({network,program,offerAddress:address,walletAddress:address,valid:{type:'boolean'},state:{type:'string',enum:['active','expired','missing']},expiration:{type:['string','null']},verifiedAt:{type:'string',format:'date-time'},reason:{type:'string',enum:['VALID','EXPIRED','MISSING']},walletControlProven:{const:false},authorized:{const:false},freshness:object({verifiedAtMs:integer,maxAgeMs:{const:8000},contextSlot:integer,chainTimestamp:decimal}),status:ref('LicenseStatus')}),
 ChallengeInput:object({walletAddress:address},undefined,true),
 Challenge:object({challengeId:{type:'string',pattern:'^[A-Za-z0-9_-]{43}$'},message:{type:'string',description:'Exact eleven-line origin/network/program/wallet/browser-bound authentication message. Never a transaction.'},expiresAt:integer}),
 Proof:object({challengeId:{type:'string',pattern:'^[A-Za-z0-9_-]{43}$'},signatureBase64:{type:'string',pattern:'^[A-Za-z0-9+/]{86}==$'}},undefined,true),
 Session:{oneOf:[object({authenticated:{const:false}}),object({authenticated:{const:true},walletAddress:address,expiresAt:integer})]},
 Protected:object({authorized:{const:true},walletAddress:address,offerAddress:address,expiresAt:decimal,payload:string,verification:ref('PublicLicense')}),
 Transaction:object({network,signature:string,state:{type:'string',enum:['not-found','processed','confirmed','finalized','failed']},slot:{type:['integer','null']},error:{},contextSlot:integer}),
 Empty:object({},[],true),
};
const response=(description,schema)=>({description,content:{'application/json':{schema}}});
const failures={400:response('Invalid input or wrong requested network/program.',ref('Error')),401:response('Wallet proof/session is absent, invalid, used or expired.',ref('Error')),403:response('Origin mismatch or no fresh active entitlement.',ref('Error')),408:response('Request body exceeded the five-second deadline.',ref('Error')),409:response('Offer inactive or wallet already licensed.',ref('Error')),413:response('Body exceeds 128 KiB.',ref('Error')),429:response('Process-local rate/store capacity reached.',ref('Error')),503:response('RPC, freshness, configuration, busy reader or disabled authentication failure; fail closed.',ref('Error'))};
function operation(id,description,schema,{body,params=[],privateRoute=false,success=200}={}){return{operationId:id,description,parameters:params,...(privateRoute?{security:[{pactSession:[]}]}:{}),...(body?{requestBody:{required:true,content:{'application/json':{schema:ref(body)}}}}:{}),responses:{[success]:response('Success. Cache-Control: no-store.',ref(schema)),...failures}};}
const parameter=(name,description='Canonical public Solana address.')=>({name,in:'path',required:true,description,schema:name==='signature'?string:address});
const paths={
 '/offers/{address}':{get:operation('getOffer','Read verified public offer parameters and commitment; no metadata preimage.', 'Offer',{params:[parameter('address')]})},
 '/offers/prepare':{post:operation('prepareOffer','Prepare unsigned create-offer transaction. Seller authorization/signature happens separately in their wallet.','PreparedOffer',{body:'PrepareOffer'})},
 '/offers/{address}/metadata':{get:{operationId:'getMetadata',description:'No public metadata registry is installed. Verify the offer, then return typed METADATA_UNAVAILABLE; obtain exact JSON from the seller.',parameters:[parameter('address')],responses:{404:response('METADATA_UNAVAILABLE. A commitment cannot reconstruct metadata.',ref('Error')),400:failures[400],503:failures[503]}}},
 '/checkout/prepare':{post:operation('prepareCheckout','Validate fresh offer, buyer entitlement, exact public metadata/hash/price/duration and availability; return unsigned purchase transaction.','PreparedCheckout',{body:'PrepareCheckout'})},
 '/licenses/verify':{post:operation('verifyLicense','Public entitlement lookup only. Does not prove wallet control or authorize access.','PublicLicense',{body:'LicenseInput'})},
 '/licenses/{offer}/{wallet}':{get:operation('getLicense','Read-only public entitlement status with freshness and explicit non-authentication claims.','PublicLicense',{params:[parameter('offer'),parameter('wallet')]})},
 '/transactions/{signature}':{get:operation('getTransactionStatus','Read RPC signature status with searchTransactionHistory. not-found is uncertainty, not proof of non-submission or safe retry.','Transaction',{params:[parameter('signature','Public transaction signature; no signed wire bytes.')]})},
 '/auth/challenge':{post:operation('walletChallenge','Same-origin POST. Sets pact_binding HttpOnly cookie; returns expiring domain/network/browser-bound message. Single-process authentication must be explicitly enabled.','Challenge',{body:'ChallengeInput',privateRoute:true})},
 '/auth/verify':{post:operation('verifyWalletProof','Same-origin POST with pact_binding cookie. Atomically consumes challenge; verifies native Ed25519 signature; rotates opaque pact_session HttpOnly cookie.','Session',{body:'Proof',privateRoute:true})},
 '/auth/session':{get:operation('getWalletSession','Read session identity only; no license/access grant.','Session',{privateRoute:true})},
 '/auth/logout':{post:operation('logoutWallet','Same-origin POST; invalidate session and clear binding/session cookies.','Session',{body:'Empty',privateRoute:true})},
 '/protected':{get:operation('protectedOperation','Derive wallet from opaque session; fresh authoritative entitlement for server-configured offer; recheck session after RPC before returning demo payload.','Protected',{privateRoute:true})},
};
paths['/auth/challenge'].post.security=[];
paths['/auth/verify'].post.security=[{pactBinding:[]}];
paths['/auth/session'].get.security=[{pactSession:[]},{}];
paths['/auth/logout'].post.security=[{pactSession:[]},{}];
const spec={openapi:'3.1.0',info:{title:'PACT Developer Platform v1',version:'1.0.0',description:'Solana Devnet only. Public lookup is not authentication. No server signing/broadcast or registry. Authentication supports an explicitly opted-in single persistent Node process; multi-instance/serverless auth is unsupported.'},servers:[{url:'http://localhost:3007/api/v1',description:'PACT local API'},{url:'http://localhost:3008/api/pact',description:'Independent same-origin example API'}],paths,components:{schemas,securitySchemes:{pactSession:{type:'apiKey',in:'cookie',name:'pact_session',description:'Opaque HttpOnly SameSite=Strict session; Secure on HTTPS.'},pactBinding:{type:'apiKey',in:'cookie',name:'pact_binding',description:'Browser binding set by challenge route. Same-origin POST and exact Origin required.'}}}};
await fs.writeFile(new URL('openapi.json',import.meta.url),JSON.stringify(spec,null,2)+'\n');console.log(JSON.stringify({paths:Object.keys(paths).length,schemas:Object.keys(schemas).length}));
