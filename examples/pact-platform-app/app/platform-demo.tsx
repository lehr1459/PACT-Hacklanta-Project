'use client';

import {useEffect,useRef,useState} from 'react';
import {PACT_PROGRAM_ID,FRESHNESS_MS} from '@pact/sdk';
import {PactClient} from '@pact/sdk/v1';
import {PactCheckout} from '@pact/sdk/react';
import type {WidgetState} from '@pact/sdk/widget';

type Phantom={isPhantom?:boolean;publicKey?:{toBase58():string};signMessage?:(message:Uint8Array,encoding:'utf8')=>Promise<{signature:Uint8Array;publicKey?:{toBase58():string}}>};
function phantom(){const root=window as unknown as {phantom?:{solana?:Phantom};solana?:Phantom};const p=root.phantom?.solana??root.solana;if(!p?.isPhantom||!p.signMessage)throw Error('Phantom message signing is unavailable.');return p;}
function publicKey(p:Phantom){try{return p.publicKey?.toBase58()??null;}catch{return null;}}
function foreground(){return navigator.onLine&&document.visibilityState==='visible';}
function base64(bytes:Uint8Array){return btoa(Array.from(bytes,b=>String.fromCharCode(b)).join(''));}

export function PlatformDemo({offer,rpcUrl,metadataJson}:{offer:string;rpcUrl:string;metadataJson:string}){
  const api=useRef<PactClient|null>(null);
  const wallet=useRef<string|null>(null),epoch=useRef(0),operation=useRef(false);
  const [checkout,setCheckout]=useState<Readonly<WidgetState>|null>(null);
  const [authenticated,setAuthenticated]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState('Connect Phantom in the checkout. Prove wallet control before using the protected operation.');
  const [payload,setPayload]=useState<string|null>(null);
  const sessionDeadline=useRef(0),payloadDeadline=useRef(0);
  const pendingLogout=useRef<Promise<void>>(Promise.resolve());
  function logout(){pendingLogout.current=pendingLogout.current.catch(()=>{}).then(async()=>{await api.current?.auth.logout();}).catch(()=>{});return pendingLogout.current;}
  useEffect(()=>{
    api.current=new PactClient({network:'devnet',apiUrl:'/api/pact'});
    const close=()=>{epoch.current++;payloadDeadline.current=0;setPayload(null);setAuthenticated(false);sessionDeadline.current=0;};
    const environment=()=>{if(!foreground()){close();setMessage('Page hidden or offline. Protected access is closed; authenticate again after returning.');void logout();}};
    const timer=setInterval(()=>{const now=Date.now();if(payloadDeadline.current&&now>=payloadDeadline.current){payloadDeadline.current=0;setPayload(null);}if(sessionDeadline.current&&now>=sessionDeadline.current){close();setMessage('Wallet session expired. Authenticate again.');}},250);
    window.addEventListener('offline',environment);document.addEventListener('visibilitychange',environment);
    return()=>{epoch.current++;clearInterval(timer);window.removeEventListener('offline',environment);document.removeEventListener('visibilitychange',environment);};
  },[]);

  function observe(state:Readonly<WidgetState>){
    setCheckout(state);
    if(state.wallet!==wallet.current){epoch.current++;wallet.current=state.wallet;sessionDeadline.current=0;payloadDeadline.current=0;setAuthenticated(false);setPayload(null);setMessage(state.wallet?'Wallet connected. Sign a challenge to authenticate the protected backend.':'Wallet disconnected. Protected access is closed.');void logout();}
    if(state.access!=='active'){payloadDeadline.current=0;setPayload(null);}
  }
  async function authenticate(){
    if(operation.current||!wallet.current||!api.current)return;
    operation.current=true;setBusy(true);setPayload(null);setAuthenticated(false);
    const selected=wallet.current,token=++epoch.current;
    const current=()=>token===epoch.current&&wallet.current===selected&&foreground();
    try{
      const provider=phantom();if(publicKey(provider)!==selected||!current())throw Error('Wallet changed.');
      // Starting a new proof invalidates a previous server identity first.
      await logout();if(!current()||publicKey(provider)!==selected)throw Error('Wallet changed.');
      const challenge=await api.current.auth.challenge(selected);if(!current()||publicKey(provider)!==selected||typeof challenge.message!=='string'||new TextEncoder().encode(challenge.message).length>8192||typeof challenge.challengeId!=='string'||!Number.isFinite(challenge.expiresAt)||Date.now()>=challenge.expiresAt)throw Error('Challenge is no longer current.');
      setMessage('Review the domain-bound wallet challenge in Phantom. This message does not authorize a transaction.');
      const signed=await provider.signMessage!(new TextEncoder().encode(challenge.message),'utf8');
      if(!current()||publicKey(provider)!==selected||Date.now()>=challenge.expiresAt||!(signed.signature instanceof Uint8Array)||signed.signature.length!==64||(signed.publicKey&&publicKey({publicKey:signed.publicKey})!==selected))throw Error('Wallet proof changed.');
      const session=await api.current.auth.verify({challengeId:challenge.challengeId,signatureBase64:base64(signed.signature)});
      if(!current()||publicKey(provider)!==selected||session.authenticated!==true||session.walletAddress!==selected||!Number.isFinite(session.expiresAt)||Date.now()>=session.expiresAt)throw Error('Wallet session is no longer current.');
      sessionDeadline.current=session.expiresAt;setAuthenticated(true);setMessage('Wallet control authenticated. Each protected operation still requires a fresh server-side license check.');
    }catch{if(token===epoch.current){sessionDeadline.current=0;setAuthenticated(false);setPayload(null);setMessage('Wallet authentication was rejected, unavailable, expired, or changed. Access remains closed.');}void logout();}
    finally{operation.current=false;setBusy(false);}
  }
  async function protectedOperation(){
    if(operation.current||!api.current||!authenticated||!wallet.current)return;
    operation.current=true;setBusy(true);setPayload(null);payloadDeadline.current=0;
    const selected=wallet.current,token=epoch.current;
    try{
      const provider=phantom();if(!foreground()||publicKey(provider)!==selected)throw Error('Wallet changed.');
      const requestStarted=Date.now();
      const result=await api.current.protected.get();
      if(token!==epoch.current||wallet.current!==selected||!foreground()||publicKey(provider)!==selected||result.authorized!==true||result.walletAddress!==selected||result.offerAddress!==offer||typeof result.payload!=='string')throw Error('Authorization changed.');
      const expiresAt=Number(result.expiresAt)*1000,deadline=Math.min(requestStarted+FRESHNESS_MS,expiresAt),receivedAt=Date.now();if(!Number.isFinite(expiresAt)||!Number.isFinite(deadline)||receivedAt<requestStarted||receivedAt>=deadline)throw Error('Entitlement expired or authorization response is stale.');
      payloadDeadline.current=deadline;setPayload(result.payload);setMessage('Protected result returned only after the server authenticated your wallet and verified the current entitlement.');
    }catch{setPayload(null);setMessage('The server denied this operation: no valid authenticated license, expired entitlement, stale verification, or RPC failure. Access remains closed.');}
    finally{operation.current=false;setBusy(false);}
  }
  return <main>
    <header><a className="wordmark" href="/">CANVAS <span>LAB</span></a><span className="badge">INDEPENDENT APP / SOLANA DEVNET</span></header>
    <section className="hero"><p className="eyebrow">POWERED BY THE PACT SDK</p><h1>Your app.<br/>Its own checkout.</h1><p>Connect, review license terms, and purchase without leaving this application. Wallet authentication and entitlement authorization are separate server checks.</p></section>
    <div className="workspace"><section aria-labelledby="checkout-title"><div className="section-heading"><p className="eyebrow">01 / EMBEDDED CHECKOUT</p><h2 id="checkout-title">Review your access.</h2></div><PactCheckout offer={offer} programId={PACT_PROGRAM_ID} rpcUrl={rpcUrl} metadataJson={metadataJson} onState={observe} style={{'--pact-ink':'#17253c','--pact-accent':'#2563eb','--pact-radius':'18px','--pact-border':'#dce3ed'} as React.CSSProperties}/></section>
    <section className="server-panel" aria-labelledby="server-title"><p className="eyebrow">02 / SERVER-PROTECTED OPERATION</p><h2 id="server-title">Prove. Verify. Access.</h2><p>A public license lookup cannot prove that you own a wallet. This app uses a single-use, domain-bound signed challenge and an HttpOnly server session.</p><dl><div><dt>Connected wallet</dt><dd data-testid="platform-wallet">{checkout?.wallet??'Not connected'}</dd></div><div><dt>Wallet authentication</dt><dd data-testid="platform-auth">{authenticated?'Authenticated':'Not authenticated'}</dd></div><div><dt>Client verification</dt><dd>{checkout?.access??'disconnected'}</dd></div><div><dt>Protected operation</dt><dd data-testid="platform-protected">{payload?'Authorized result':'Locked'}</dd></div></dl>
    <div className="actions"><button onClick={()=>void authenticate()} disabled={!checkout?.wallet||busy}>Authenticate wallet</button><button className="primary" onClick={()=>void protectedOperation()} disabled={!authenticated||busy}>Run protected operation</button></div><p className="status" role="status">{busy?'Operation in progress… ':''}{message}</p>
    {payload?<pre data-testid="protected-payload">{payload}</pre>:<div className="locked" data-testid="protected-locked"><span aria-hidden="true">⌁</span><h3>Server result stays private.</h3><p>It is returned only after wallet proof and fresh on-chain entitlement authorization. Client-side state cannot authorize this route.</p></div>}
    <p className="fine">Local single-process authentication demo. Do not deploy this in a multi-instance or serverless environment without an atomic shared challenge/session store. Returned content can be copied; expiration cannot retract bytes already delivered.</p></section></div>
    <section className="configuration"><p className="eyebrow">PUBLIC DEVELOPER CONFIGURATION</p><dl><div><dt>Offer</dt><dd>{offer}</dd></div><div><dt>Program</dt><dd>{PACT_PROGRAM_ID}</dd></div><div><dt>Network</dt><dd>Solana Devnet</dd></div><div><dt>RPC</dt><dd>{rpcUrl}</dd></div></dl><p>Change the offer and its exact metadata together. The SDK validates the commitment; a metadata hash cannot reconstruct the original terms.</p></section>
    <footer>Canvas Lab / Independent PACT Developer Platform example. Testnet currency has no monetary value. No automatic signatures or transactions.</footer>
  </main>;
}
