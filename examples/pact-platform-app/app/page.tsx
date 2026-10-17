import {PlatformDemo} from './platform-demo';
export default function Page(){
 const local=process.env.PACT_ENV_PROFILE==='local'||process.env.NODE_ENV==='development'&&!process.env.PACT_ENV_PROFILE;
 return <PlatformDemo offer={process.env.NEXT_PUBLIC_PACT_OFFER??(local?'7EdfowQEZyVyyp7bYdQyzmprZtVU9mVba8cysHm2Ardh':'')} rpcUrl={process.env.NEXT_PUBLIC_SOLANA_RPC_URL??'https://api.devnet.solana.com'} metadataJson={process.env.NEXT_PUBLIC_PACT_METADATA??(local?'{"schema":"pact-solana-license-v1","title":"TEST","terms":"TEST","priceLamports":"1000000","durationSeconds":"180"}':'')}/>;
}
