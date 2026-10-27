import {createHash} from 'node:crypto';
import {PublicKey} from '@solana/web3.js';
import {PACT_PROGRAM_ID, DEFAULT_RPC_URL} from './internal/license-reader.js';
import {supportsSingleProcessAuth} from './internal/auth-topology.js';

export type PactEnvironmentProfile = 'local'|'test'|'ci'|'preview'|'hosted';
export type PactEnvironmentApplication = 'marketplace'|'platform'|'demo';
type PublicEnvironment = {
  network:'devnet'; programId:string; rpcUrl:string; offer:string|null;
  marketplaceUrl:string|null; metadataSha256:string|null;
  base:{chainId:84532;contractAddress:string|null;rpcUrl:string};
};
type ServerPolicy = {
  origin:string;authMode:'disabled'|'single-process';
  processModel:'stateless'|'single-persistent-process';
  policy:'disabled'|'licensed-demo-v1';protectedOffer:string|null;
};
export type PactBuildEnvironmentBinding = {
  schemaVersion:1;application:PactEnvironmentApplication;profile:PactEnvironmentProfile;
  public:PublicEnvironment;server:ServerPolicy;
};
export type ResolvedPactEnvironment = {
  application:PactEnvironmentApplication;profile:PactEnvironmentProfile;public:PublicEnvironment;
  server:ServerPolicy & {rpcUrl:string;rpcUrls:readonly string[]};
  assurance:{deployable:false;requiresHumanConfiguration:boolean};
};
export class PactEnvironmentError extends Error {
  constructor(public readonly code:'ENVIRONMENT_INVALID'|'BUILD_ENVIRONMENT_MISMATCH',public readonly variables:readonly string[]){
    super(code==='BUILD_ENVIRONMENT_MISMATCH'?'Runtime settings differ from the saved build binding.':'Invalid environment configuration: '+variables.join(', '));
    this.name='PactEnvironmentError';
  }
}
const profiles = ['local','test','ci','preview','hosted'];
const applications = ['marketplace','platform','demo'];
const fixtureOffer='7EdfowQEZyVyyp7bYdQyzmprZtVU9mVba8cysHm2Ardh';
const fixtureMetadata='{"schema":"pact-solana-license-v1","title":"TEST","terms":"TEST","priceLamports":"1000000","durationSeconds":"180"}';
const publicNames=new Set(['NEXT_PUBLIC_PACT_SOLANA_PROGRAM_ID','NEXT_PUBLIC_SOLANA_RPC_URL','NEXT_PUBLIC_PACT_OFFER','NEXT_PUBLIC_PACT_MARKETPLACE_URL','NEXT_PUBLIC_PACT_METADATA','NEXT_PUBLIC_PACT_CONTRACT_ADDRESS','NEXT_PUBLIC_RPC_URL','NEXT_PUBLIC_CHAIN_ID']);
const hostedMarkers=['VERCEL','AWS_LAMBDA_FUNCTION_NAME','AWS_EXECUTION_ENV','FUNCTIONS_WORKER_RUNTIME','AZURE_FUNCTIONS_ENVIRONMENT','K_SERVICE','NETLIFY','RENDER','FLY_APP_NAME','WEBSITE_SITE_NAME'];
const statelessMarkers=['VERCEL','AWS_LAMBDA_FUNCTION_NAME','AWS_EXECUTION_ENV','FUNCTIONS_WORKER_RUNTIME','AZURE_FUNCTIONS_ENVIRONMENT','K_SERVICE','NETLIFY','NODE_UNIQUE_ID'];
function fail(...variables:string[]):never {throw new PactEnvironmentError('ENVIRONMENT_INVALID',variables);}
function freeze<T>(value:T):T {if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;}
function canonical(value:unknown):string {
  if(value===null||typeof value!=='object')return JSON.stringify(value);
  if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
  return '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical((value as Record<string,unknown>)[key])).join(',')+'}';
}
function address(value:string,name:string,allowBlank=false):string {
  if(allowBlank&&value==='')return value;
  try{if(value.length<32||value.length>44||new PublicKey(value).toBase58()!==value)fail(name);}catch{fail(name);}
  return value;
}
function reservedHost(host:string):boolean {
  return /^(?:localhost|127\.|0\.|10\.|192\.168\.|169\.254\.|172\.(?:1[6-9]|2\d|3[01])\.|\[::|\[fc|\[fd|\[fe[89ab])/i.test(host)||/\.(?:localhost|local|test|invalid|example)$/.test(host);
}
function url(value:string,name:string,{publicUrl=false,strict=false,origin=false,allowPrivateHost=false}={}):string {
  try {
    const parsed=new URL(value);
    if(value.length>4096||value.trim()!==value||/[\u0000-\u0020\u007f]/.test(value)||!['https:','http:'].includes(parsed.protocol)||value.includes('#')||parsed.username||parsed.password)fail(name);
    if(parsed.protocol==='http:'&&!['localhost','127.0.0.1','[::1]'].includes(parsed.hostname))fail(name);
    if(publicUrl&&(value.includes('?')||parsed.pathname!=='/'))fail(name);
    if(strict&&(parsed.protocol!=='https:'||!allowPrivateHost&&reservedHost(parsed.hostname)))fail(name);
    if(origin&&(parsed.origin!==value||parsed.protocol==='http:'&&!['localhost','127.0.0.1','[::1]'].includes(parsed.hostname)))fail(name);
    return value;
  }catch{fail(name);}
}

/** Node-only configuration validation. Reads only supplied values; never opens environment files or contacts a network. */
export function resolvePactEnvironment(options:{
  environment:Readonly<Record<string,string|undefined>>;application:PactEnvironmentApplication;
  phase:'development'|'build'|'start';expectedBinding?:unknown;
}):ResolvedPactEnvironment {
  const {environment:e,application,phase}=options;
  if(!applications.includes(application))fail('application');
  if(!['development','build','start'].includes(phase))fail('phase');
  const present=(name:string)=>e[name]!==undefined;
  const get=(name:string,fallback:string):string=>{
    const value=e[name]??fallback;
    if(typeof value!=='string'||value.length>131072||value.includes('\0'))fail(name);
    return value;
  };
  let profile=get('PACT_ENV_PROFILE','');
  if(!profile){if(phase!=='development'||hostedMarkers.some(name=>Boolean(e[name])))fail('PACT_ENV_PROFILE');profile='local';}
  if(!profiles.includes(profile))fail('PACT_ENV_PROFILE');
  const strict=profile==='preview'||profile==='hosted';
  if(profile==='local'&&hostedMarkers.some(name=>Boolean(e[name])))fail('PACT_ENV_PROFILE');
  if(strict){
    for(const name of ['PACT_NETWORK','NEXT_PUBLIC_PACT_SOLANA_PROGRAM_ID','NEXT_PUBLIC_SOLANA_RPC_URL','PACT_APP_ORIGIN','SOLANA_RPC_URL','PACT_AUTH_MODE','PACT_PROCESS_MODEL','PACT_SERVER_POLICY'])if(!present(name)||e[name]==='')fail(name);
    for(const name of Object.keys(e))if(name.startsWith('NEXT_PUBLIC_')&&!publicNames.has(name))fail(name);
    for(const name of Object.keys(e))if(/^(?:PACT_.*(?:QA|FIXTURE|MOCK).*|PACT_EXTERNAL_SATURDAY)$/.test(name)&&e[name])fail(name);
  }
  if(get('PACT_NETWORK','devnet')!=='devnet')fail('PACT_NETWORK');
  const programId=address(get('NEXT_PUBLIC_PACT_SOLANA_PROGRAM_ID',application==='marketplace'?'':PACT_PROGRAM_ID),'NEXT_PUBLIC_PACT_SOLANA_PROGRAM_ID',!strict);
  if(strict&&programId!==PACT_PROGRAM_ID)fail('NEXT_PUBLIC_PACT_SOLANA_PROGRAM_ID');
  const rpcUrl=url(get('NEXT_PUBLIC_SOLANA_RPC_URL',DEFAULT_RPC_URL),'NEXT_PUBLIC_SOLANA_RPC_URL',{publicUrl:strict,strict});
  const configuredOffer=get('NEXT_PUBLIC_PACT_OFFER',application==='demo'&&!strict||application==='platform'&&profile==='local'?fixtureOffer:'');
  const offer=configuredOffer?address(configuredOffer,'NEXT_PUBLIC_PACT_OFFER'):null;
  if(strict&&offer===fixtureOffer)fail('NEXT_PUBLIC_PACT_OFFER');
  if(strict&&application!=='marketplace'&&!offer)fail('NEXT_PUBLIC_PACT_OFFER');
  const metadata=get('NEXT_PUBLIC_PACT_METADATA',application==='platform'&&profile==='local'?fixtureMetadata:'');
  const metadataBytes=Buffer.from(metadata,'utf8');
  if(metadataBytes.length>65536||metadataBytes.toString('utf8')!==metadata||strict&&metadata===fixtureMetadata)fail('NEXT_PUBLIC_PACT_METADATA');
  const metadataSha256=metadata?createHash('sha256').update(metadataBytes).digest('hex'):null;
  const configuredMarketplace=get('NEXT_PUBLIC_PACT_MARKETPLACE_URL',application==='demo'&&!strict?'http://localhost:3003/':'');
  const marketplaceUrl=configuredMarketplace?url(configuredMarketplace,'NEXT_PUBLIC_PACT_MARKETPLACE_URL',{strict}):null;
  if(strict&&application==='demo'&&!marketplaceUrl)fail('NEXT_PUBLIC_PACT_MARKETPLACE_URL');
  if(get('NEXT_PUBLIC_CHAIN_ID','84532')!=='84532')fail('NEXT_PUBLIC_CHAIN_ID');
  const contractAddress=get('NEXT_PUBLIC_PACT_CONTRACT_ADDRESS','');
  if(contractAddress&&(!/^0x[0-9a-fA-F]{40}$/.test(contractAddress)||/^0x0{40}$/i.test(contractAddress)))fail('NEXT_PUBLIC_PACT_CONTRACT_ADDRESS');
  if(strict&&contractAddress.toLowerCase()==='0x4444444444444444444444444444444444444444')fail('NEXT_PUBLIC_PACT_CONTRACT_ADDRESS');
  const baseRpc=url(get('NEXT_PUBLIC_RPC_URL','https://sepolia.base.org'),'NEXT_PUBLIC_RPC_URL',{publicUrl:strict,strict});
  const origin=url(get('PACT_APP_ORIGIN','http://localhost:'+({marketplace:3007,platform:3008,demo:3004}[application])),'PACT_APP_ORIGIN',{origin:true,strict});
  const localPlatform=profile==='local'&&application==='platform';
  const authMode=get('PACT_AUTH_MODE',localPlatform?'single-process':'disabled');
  if(!['disabled','single-process'].includes(authMode))fail('PACT_AUTH_MODE');
  const protectedValue=get('PACT_PROTECTED_OFFER',localPlatform&&authMode==='single-process'?offer??'':'');
  const protectedOffer=protectedValue?address(protectedValue,'PACT_PROTECTED_OFFER'):null;
  const processModel=get('PACT_PROCESS_MODEL',authMode==='single-process'?'single-persistent-process':'stateless');
  if(!['stateless','single-persistent-process'].includes(processModel))fail('PACT_PROCESS_MODEL');
  const policy=get('PACT_SERVER_POLICY',!strict&&authMode==='single-process'&&protectedOffer?'licensed-demo-v1':'disabled');
  if(!['disabled','licensed-demo-v1'].includes(policy))fail('PACT_SERVER_POLICY');
  if(authMode==='single-process'&&(processModel!=='single-persistent-process'||statelessMarkers.some(name=>Boolean(e[name]))||e.WEB_CONCURRENCY!==undefined&&e.WEB_CONCURRENCY!=='1'))fail('PACT_PROCESS_MODEL');
  if(authMode==='single-process'&&phase==='start'&&!supportsSingleProcessAuth(e))fail('PACT_PROCESS_MODEL');
  if(authMode==='disabled'&&(policy!=='disabled'||protectedOffer))fail('PACT_AUTH_MODE','PACT_SERVER_POLICY','PACT_PROTECTED_OFFER');
  if(policy==='licensed-demo-v1'&&(authMode!=='single-process'||!protectedOffer))fail('PACT_SERVER_POLICY','PACT_PROTECTED_OFFER');
  if(policy==='disabled'&&protectedOffer)fail('PACT_SERVER_POLICY','PACT_PROTECTED_OFFER');
  if(strict&&protectedOffer===fixtureOffer)fail('PACT_PROTECTED_OFFER');
  if(application==='platform'&&policy==='licensed-demo-v1'&&protectedOffer!==offer)fail('PACT_PROTECTED_OFFER','NEXT_PUBLIC_PACT_OFFER');
  const serverRpc=url(get('SOLANA_RPC_URL',rpcUrl),'SOLANA_RPC_URL',{strict,allowPrivateHost:true});
  const fallback=get('SOLANA_RPC_FALLBACK_URL','');
  const rpcUrls=[serverRpc];
  if(fallback){url(fallback,'SOLANA_RPC_FALLBACK_URL',{strict,allowPrivateHost:true});if(new URL(fallback).href===new URL(serverRpc).href)fail('SOLANA_RPC_FALLBACK_URL');rpcUrls.push(fallback);}
  const resolved:ResolvedPactEnvironment={application,profile:profile as PactEnvironmentProfile,
    public:{network:'devnet',programId,rpcUrl,offer,marketplaceUrl,metadataSha256,base:{chainId:84532,contractAddress:contractAddress||null,rpcUrl:baseRpc}},
    server:{origin,rpcUrl:serverRpc,rpcUrls,authMode:authMode as ServerPolicy['authMode'],processModel:processModel as ServerPolicy['processModel'],policy:policy as ServerPolicy['policy'],protectedOffer},
    assurance:{deployable:false,requiresHumanConfiguration:strict}};
  if(options.expectedBinding!==undefined){
    try{if(canonical(publicEnvironmentBinding(resolved))!==canonical(options.expectedBinding))throw Error();}
    catch{throw new PactEnvironmentError('BUILD_ENVIRONMENT_MISMATCH',[]);}
  }
  return freeze(resolved);
}

/** Intentionally public build settings only. Private primary/fallback RPC values never enter this record. */
export function publicEnvironmentBinding(resolved:ResolvedPactEnvironment):PactBuildEnvironmentBinding {
  const {origin,authMode,processModel,policy,protectedOffer}=resolved.server;
  return freeze({schemaVersion:1,application:resolved.application,profile:resolved.profile,public:resolved.public,server:{origin,authMode,processModel,policy,protectedOffer}});
}
