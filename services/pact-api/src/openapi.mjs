import {operations,schemas} from './contract.mjs';

const descriptions={
  public:'No credential. Readiness is not entitlement or deployment-custody evidence.',
  browser:'Same-origin browser only; an explicitly foreign Origin is denied. Binding/session secrets use HttpOnly cookies.',
  binding:'Exact configured Origin, admin binding cookie and matching x-pact-csrf. Sign exact issued UTF-8 bytes; no wallet transaction.',
  admin:'Owned active admin session and binding cookie. Mutations require exact Origin and matching x-pact-csrf.',
  signed:'Owned admin session, exact Origin/CSRF and fresh action-specific signature. Proof binds exact payload, app and session incarnation; consume atomically with mutation.',
  buyer:'Distinct buyer HttpOnly binding. GET atomically claims the transaction. Mutations require exact Origin and matching x-pact-csrf; explicit exact-message signature only.',
  connect:'Server-to-server Bearer key with connect:write. Every Origin header is rejected. Never send a key or wallet grant to a browser.',
  access:'Server-to-server Bearer key with access:check. Every Origin header is rejected. Key selects app; grant proves wallet; server policy selects offer. Never browser-only enforcement.',
};
const ref=name=>({$ref:`#/components/schemas/${name}`});
function translate(value){
  if(Array.isArray(value))return value.map(translate);
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,key==='$ref'?item.replace('#/definitions/','#/components/schemas/'):translate(item)]));
  return value;
}
export function generateOpenAPI(){
  const paths={};
  for(const op of operations){
    const path=op.path.replace(/:([A-Za-z]+)/g,'{$1}');
    const parameters=[...op.path.matchAll(/:([A-Za-z]+)/g)].map(([,name])=>({name,in:'path',required:true,schema:{type:'string',minLength:1,maxLength:name==='resourceKey'?64:128},description:'Exact opaque identifier; URL queries are not accepted.'}));
    const browser=!['public','connect','access'].includes(op.security);
    if(browser&&op.method!=='GET')parameters.push({name:'Origin',in:'header',required:true,schema:{type:'string'},description:'Must equal the configured issuer origin exactly.'},
      {name:'x-pact-csrf',in:'header',required:true,schema:{type:'string',pattern:'^[A-Za-z0-9_-]{43}$'},description:'Token from the matching browser binding bootstrap; never the session cookie.'});
    const response=(name,description)=>({description,headers:{'x-pact-request-id':{schema:{type:'string'},description:'Server-generated request ID; caller-supplied IDs are ignored.'},
      'Cache-Control':{schema:{const:'no-store'}}},content:{'application/json':{schema:ref(name)}}});
    const responses={'200':response(op.output,'Supported success envelope; does not by itself imply entitlement except checkAccess ALLOW.')};
    for(const status of[400,401,403,404,409,413,415,429,503])responses[status]=response('Error',({400:'Malformed or unsupported input.',401:'Missing, expired, revoked or invalid authentication/proof.',403:'Origin, CSRF, scope, application or policy denied.',404:'Unknown or unowned object.',409:'Conflict or expired domain proof.',413:'Request exceeds the 16 KiB body limit.',415:'Unsupported request content type.',429:'Bounded quota or rate limit exceeded.',503:'Database, clock, chain, capacity or schema uncertainty; deny.'})[status]);
    responses.default={description:'Deny every unsupported HTTP status, malformed body, redirect or transport failure. Infrastructure/native transport errors may not contain the JSON envelope.'};
    for(const[status,names]of Object.entries(op.responses??{}))responses[status].content['application/json'].schema={oneOf:names.map(ref)};
    const security=['connect','access'].includes(op.security)?[{AppKey:[]}]:['admin','signed'].includes(op.security)?[{AdminSession:[],AdminBinding:[]}]
      :op.security==='binding'?[{AdminBinding:[]}]:op.security==='buyer'&&op.method!=='GET'?[{BuyerBinding:[]}]:[];
    const value={operationId:op.operationId,summary:op.summary,description:descriptions[op.security],tags:[op.path.split('/')[2]],security,parameters,responses,
      'x-pact-input-order':'Authentication, semantic validation and one-use proof consumption preserve the runtime contract. Invalid signature attempts consume an identified own challenge.',
      ...(op.input?{requestBody:{required:true,content:{'application/json':{schema:ref(op.input)}}}}:{})};
    if(op.operationId==='checkAccess')value.description+=' Every protected action obtains a new decision. Deny unknown/delayed/unsupported responses; validate full identity and original read-start deadlines. No positive cache. Expected license denials use403 decision envelopes; unauthenticated failures use401 error envelopes. Marketplace purchase links still need seller exact metadata bytes.';
    if(op.operationId==='disableResource')value.description+=' DELETE accepts only enabled:false with resourceKey and expectedVersion; offerAddress is forbidden by runtime semantic validation.';
    (paths[path]??={})[op.method.toLowerCase()]=value;
  }
  return{openapi:'3.1.0',info:{title:'PACT private hosted Devnet API',version:'0.1.0',description:'Private pilot REST contract. Custom exact-message wallet protocol; no OAuth/OIDC/SIWS or copyright-transfer claim. Integer times are Unix milliseconds except decimal-string on-chain seconds. Default 16 KiB request body, no query parameters, no CORS for secrets. No deployment or public publication authorized.'},
    servers:[{url:'https://pact.example.invalid',description:'Documentation placeholder only; replace with the owner-approved exact issuer.'}],paths,
    components:{securitySchemes:{AppKey:{type:'http',scheme:'bearer',bearerFormat:'Opaque expiring app-scoped PACT API credential'},
      AdminSession:{type:'apiKey',in:'cookie',name:'__Secure-pact_hosted_session',description:'Host-only HttpOnly SameSite=Strict; local/test HTTP uses pact_hosted_session.'},
      AdminBinding:{type:'apiKey',in:'cookie',name:'__Secure-pact_hosted_binding',description:'Distinct HttpOnly admin browser binding; local/test omits __Secure-. Mutations require matching x-pact-csrf.'},
      BuyerBinding:{type:'apiKey',in:'cookie',name:'__Secure-pact_connect_binding',description:'Distinct HttpOnly buyer browser binding; local/test omits __Secure-. Never substitute admin cookie.'}},schemas:translate(schemas)},
    'x-pact-lifetimes-ms':{adminChallenge:120000,adminSession:900000,actionChallenge:120000,loginTransaction:300000,buyerChallenge:120000,code:60000,walletGrant:900000,remoteDomainProof:86400000,remoteDomainVerification:86400000},
    'x-pact-authority':'Local/test implementation only. Hosted origin/TLS/DB/pepper/private RPC/retention/legal/operator acceptance remain owner gates. Original SDK and /api/v1 remain supported.'};
}
export const serializeOpenAPI=()=>`${JSON.stringify(generateOpenAPI(),null,2)}\n`;
