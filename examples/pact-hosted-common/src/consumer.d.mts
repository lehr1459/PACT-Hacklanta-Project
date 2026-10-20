export interface ConsumerConfig {origin:string;pactOrigin:string;appId:string;apiKey:string;resourceKey:string;redirectUri:string}
interface Client {
 startLogin(input:{redirectUri:string;state:string;codeChallenge:string;codeChallengeMethod:'S256';purpose:string}):Promise<{loginUrl:string;expiresAt:number;issuer:string}>;
 exchangeCode(input:{code:string;redirectUri:string;state:string;codeVerifier:string;issuer:string}):Promise<{walletGrant:string;walletAddress:string;appId:string;environment:'devnet';expiresAt:number;issuer:string}>;
 revokeGrant(input:{walletGrant:string}):Promise<unknown>;
 checkAccess(input:{walletGrant:string;resourceKey:string;walletAddress:string}):Promise<{decision:'ALLOW';requestId:string;assertFresh():void}>;
}
export function readConsumerConfig(env?:Record<string,string|undefined>):ConsumerConfig;
export function createConsumerApp(options:{client:Client;origin:string;pactOrigin:string;appId:string;resourceKey:string;now?:()=>number}):Readonly<{handle(request:Request):Promise<Response>;diagnostics():{sessionEntries:number;active:number}}>;
