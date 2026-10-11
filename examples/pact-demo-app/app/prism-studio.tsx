'use client';
import {useEffect,useRef,useState} from 'react';
import {createPactClient,isLicenseStatusFresh,PactError} from '@pact/sdk';

type LicenseStatus=Awaited<ReturnType<ReturnType<typeof createPactClient>['getLicenseStatus']>>;
type WalletKey={toBase58:()=>string};
type PhantomProvider={isPhantom:boolean;publicKey:WalletKey|null;connect:()=>Promise<{publicKey:WalletKey}>;disconnect:()=>Promise<void>;on:(event:string,listener:(key?:WalletKey|null)=>void)=>void;off?:(event:string,listener:(key?:WalletKey|null)=>void)=>void;removeListener?:(event:string,listener:(key?:WalletKey|null)=>void)=>void};
declare global{interface Window{phantom?:{solana?:PhantomProvider};}}
const DEFAULT_OFFER='7EdfowQEZyVyyp7bYdQyzmprZtVU9mVba8cysHm2Ardh';
const palettes=[['#FF8B5E','#FFCE8A','#F3ECD8','#6E8B84','#183B40'],['#C2B7FD','#8B83BA','#EBDBC5','#E79976','#31374B'],['#D2E66F','#9DAA64','#E2D8BC','#AA765D','#354746']];
const names=['Golden hour','Quiet orbit','Field notes'];
function short(value:string){return `${value.slice(0,6)}…${value.slice(-4)}`;}
function walletAddress(key:WalletKey|null|undefined){try{const value=key?.toBase58();return typeof value==='string'?value:null;}catch{return null;}}
function expiryLabel(expiry:string){try{const ms=BigInt(expiry)*1000n;return ms>8640000000000000n?`Unix ${expiry}`:new Date(Number(ms)).toLocaleTimeString();}catch{return'Unavailable';}}
function marketplaceUrl(){try{const url=new URL(process.env.NEXT_PUBLIC_PACT_MARKETPLACE_URL||'http://localhost:3003/');return ['http:','https:'].includes(url.protocol)?url.toString():'http://localhost:3003/';}catch{return'http://localhost:3003/';}}

export function PrismStudio(){
  const [wallet,setWallet]=useState<string|null>(null);const walletRef=useRef<string|null>(null);const provider=useRef<PhantomProvider|null>(null);
  const [installed,setInstalled]=useState<boolean|null>(null);const [connecting,setConnecting]=useState(false);const connectingRef=useRef(false);
  const [offer,setOffer]=useState(process.env.NEXT_PUBLIC_PACT_OFFER||DEFAULT_OFFER);
  const [status,setStatus]=useState<LicenseStatus|null>(null);const [checking,setChecking]=useState(false);const [readError,setReadError]=useState('');const [walletError,setWalletError]=useState('');
  const [activePage,setActivePage]=useState(false);const [now,setNow]=useState(0);const [sessionEpoch,setSessionEpoch]=useState(0);const generation=useRef(0);const explicitlyConnecting=useRef(false);
  const [palette,setPalette]=useState(0);
  function invalidate(restart=true){generation.current++;setStatus(null);setReadError('');if(restart)setSessionEpoch(value=>value+1);}
  function setIdentity(next:string|null){invalidate();walletRef.current=next;setWallet(next);}
  function updateIdentity(key:WalletKey|null|undefined){setIdentity(walletAddress(key));}
  function providerWallet(){try{return walletAddress(provider.current?.publicKey);}catch{return null;}}
  useEffect(()=>{
    const candidate=window.phantom?.solana;provider.current=candidate?.isPhantom?candidate:null;setInstalled(Boolean(provider.current));
    const selected=provider.current;
    const connected=(key?:WalletKey|null)=>{if(explicitlyConnecting.current)updateIdentity(key??selected?.publicKey);};
    const changed=(key?:WalletKey|null)=>{if(walletRef.current||explicitlyConnecting.current){if(!key)explicitlyConnecting.current=false;updateIdentity(key);}};
    const disconnected=()=>{explicitlyConnecting.current=false;updateIdentity(null);};
    selected?.on('connect',connected);selected?.on('accountChanged',changed);selected?.on('disconnect',disconnected);
    const environment=()=>{const active=navigator.onLine&&document.visibilityState==='visible';invalidate();setActivePage(active);setNow(performance.now());};
    environment();window.addEventListener('online',environment);window.addEventListener('offline',environment);document.addEventListener('visibilitychange',environment);
    const timer=setInterval(()=>{const current=providerWallet();if(walletRef.current!==null&&current!==walletRef.current)setIdentity(current);setNow(performance.now());},250);
    return()=>{generation.current++;clearInterval(timer);window.removeEventListener('online',environment);window.removeEventListener('offline',environment);document.removeEventListener('visibilitychange',environment);const remove=selected?.off??selected?.removeListener;if(remove){remove.call(selected,'connect',connected);remove.call(selected,'accountChanged',changed);remove.call(selected,'disconnect',disconnected);}};
  },[]);
  useEffect(()=>{
    invalidate(false);if(!wallet||!activePage){setChecking(false);return;}
    let client:ReturnType<typeof createPactClient>;
    try{client=createPactClient({rpcUrl:process.env.NEXT_PUBLIC_SOLANA_RPC_URL||'https://api.devnet.solana.com',now:()=>performance.now()});}
    catch{setChecking(false);setReadError('Devnet verification configuration is invalid. Access is locked.');return;}
    const scope=++generation.current;let cancelled=false;let inFlight=false;
    const refresh=async()=>{
      if(inFlight)return;inFlight=true;setChecking(true);
      try{const next=await client.getLicenseStatus({offer,wallet});if(!cancelled&&scope===generation.current&&walletRef.current===wallet){const current=providerWallet();if(current!==wallet){setIdentity(current);return;}setStatus(next);setReadError('');setNow(performance.now());}}
      catch(error){if(!cancelled&&scope===generation.current){setStatus(null);setReadError(error instanceof PactError?`Devnet verification failed (${error.code}). Access is locked.`:'Devnet verification is unavailable. Access is locked.');}}
      finally{inFlight=false;if(!cancelled&&scope===generation.current)setChecking(false);}
    };
    void refresh();const interval=setInterval(()=>void refresh(),4000);
    return()=>{cancelled=true;clearInterval(interval);};
  },[wallet,offer,activePage,sessionEpoch]);
  const fresh=Boolean(status&&isLicenseStatusFresh(status,now));
  const unlocked=Boolean(wallet&&activePage&&status?.wallet===wallet&&status.offer===offer&&status.active&&fresh);
  const expired=Boolean(wallet&&activePage&&status?.wallet===wallet&&status.offer===offer&&status.state==='expired');
  const gateState=unlocked?'unlocked':expired?'expired':'locked';
  const gateTitle=unlocked?'Your studio is open.':expired?'Your session has expired.':'A little color. A valid license.';
  const gateCopy=unlocked?'Remix a curated palette in your licensed workspace. Your connected wallet is verified on Solana Devnet.':expired?'This wallet’s entitlement has expired on chain. The premium workspace is locked again.':'Connect the wallet that owns this offer’s entitlement. Prism checks PACT directly before opening the workspace.';
  const statusText=!wallet?'Wallet disconnected':!activePage?'Verification paused':readError?'Chain check failed':unlocked?'License active':expired?'License expired':checking?'Checking Devnet':status?.state==='missing'?'No license found':status&&!fresh?'Fresh verification required':'License required';
  async function connect(){
    const selected=provider.current;if(!selected||connectingRef.current)return;
    connectingRef.current=true;explicitlyConnecting.current=true;setConnecting(true);setWalletError('');
    try{const result=await selected.connect();const current=selected.publicKey;if(!explicitlyConnecting.current||!current||current.toBase58()!==result.publicKey.toBase58())throw new Error('Wallet identity changed.');updateIdentity(current);}
    catch{explicitlyConnecting.current=false;updateIdentity(null);setWalletError('Phantom connection was declined or interrupted. No transaction was requested.');}
    finally{explicitlyConnecting.current=false;connectingRef.current=false;setConnecting(false);}
  }
  async function disconnect(){explicitlyConnecting.current=false;updateIdentity(null);setWalletError('');try{await provider.current?.disconnect();}catch{setWalletError('Prism disconnected locally. Review Phantom if its connection remains open.');}}
  function remix(){if(wallet&&walletRef.current===wallet&&providerWallet()===wallet&&activePage&&navigator.onLine&&document.visibilityState==='visible'&&status?.wallet===wallet&&status.offer===offer&&isLicenseStatusFresh(status,performance.now()))setPalette(value=>(value+1)%palettes.length);else invalidate();}
  return <main className="studio-shell">
    <header className="topbar"><a className="wordmark" href="/" aria-label="Prism Studio home"><span className="prism-mark" aria-hidden="true">◈</span>prism<span className="wordmark-sub">STUDIO</span></a><div className="header-right"><span className="network"><i/>Solana Devnet demo</span>{wallet?<button className="wallet-button" aria-label="Disconnect wallet" title={wallet} onClick={()=>void disconnect()}>{short(wallet)}<span>Disconnect ↗</span></button>:<button className="wallet-button" disabled={!installed||connecting} onClick={()=>void connect()}>{connecting?'Connecting…':'Connect Phantom'}<span>↗</span></button>}</div></header>
    <section className="intro"><div><p className="eyebrow">INDEPENDENT APP / POWERED BY PACT</p><h1>Make room<br/>for <em>good color.</em></h1><p className="intro-copy">A small creative workspace. A portable license.<br/>Your access lives with your wallet, verified through PACT.</p></div><div className="intro-art" aria-hidden="true"><span className="art-orbit orbit-one"/><span className="art-orbit orbit-two"/><div className="art-tile tile-one"/><div className="art-tile tile-two"/><div className="art-tile tile-three"/><span className="art-caption">COLOR IS A PRACTICE.</span></div></section>
    <section className="workspace-layout"><article className={`workspace-card ${unlocked?'is-open':''}`} data-testid="premium-gate" data-state={gateState}><div className="workspace-heading"><span className="eyebrow">01 / PALETTE WORKSPACE</span><span className={`status-chip ${unlocked?'active':''}`} role="status">{statusText}</span></div><div className="workspace-title"><h2>{gateTitle}</h2><p>{gateCopy}</p></div>
      {unlocked?<div className="premium-content" data-testid="premium-content"><div className="palette-canvas">{palettes[palette].map((color,index)=><div key={color} style={{backgroundColor:color}}><span>{String(index+1).padStart(2,'0')}</span><code>{color}</code></div>)}</div><div className="palette-footer"><div><span className="eyebrow">CURATED COLOR STUDY</span><h3>{names[palette]}</h3></div><button className="primary-button" onClick={remix}>Remix palette ↗</button></div></div>:<div className="locked-canvas"><div className="ghost-bars" aria-hidden="true"><span/><span/><span/><span/><span/></div><div className="lock-note"><span className="lock-symbol" aria-hidden="true">{expired?'◷':'⌁'}</span><b>{expired?'Good things have a time limit.':'Your next palette is waiting.'}</b><p>{expired?'Renew your access in the PACT marketplace.':'No valid entitlement, no premium workspace.'}</p><a className="primary-button" href={marketplaceUrl()} target="_blank" rel="noreferrer">{expired?'Get a new license':'Get a PACT license'} ↗</a></div></div>}
      <div className="workspace-baseline"><span><i className={unlocked?'live-dot':'muted-dot'}/>{unlocked?'Fresh chain verification':'Premium controls locked'}</span><span>Read-only integration · no transactions</span></div>
    </article><aside className="access-card"><p className="eyebrow">02 / YOUR ACCESS</p><h2>One wallet.<br/>Clear permission.</h2><div className="identity-block"><span className="field-caption">CONNECTED WALLET</span><p className="public-key" data-testid="connected-wallet">{wallet??'Connect Phantom to begin'}</p></div><label className="offer-field">PACT offer address<input value={offer} spellCheck={false} autoComplete="off" onChange={event=>{invalidate();setOffer(event.target.value);}}/></label><p className="field-note">The offer selects the license. Your connected wallet determines access.</p><div className="verification-details"><div><span>Verification</span><b>{statusText}</b></div><div><span>Chain expiry</span><b>{status?.expiry&&status.expiry!=='0'?expiryLabel(status.expiry):'—'}</b></div><div><span>Context slot</span><b>{status?.contextSlot??'—'}</b></div></div>{readError?<p className="error-note" role="alert">{readError}</p>:null}{walletError?<p className="error-note" role="alert">{walletError}</p>:null}{installed===false?<p className="field-note" role="status">Phantom extension not found. <a href="https://phantom.com/download" target="_blank" rel="noreferrer">Install Phantom manually ↗</a></p>:null}<a className="marketplace-link" href={marketplaceUrl()} target="_blank" rel="noreferrer">Visit the PACT marketplace <span>↗</span></a><p className="small-print">Select Devnet in Phantom. PACT’s SDK checks the RPC network; wallet extension network settings are not exposed reliably.</p></aside></section>
    <section className="integration-note"><span className="integration-mark" aria-hidden="true">P</span><div><p className="eyebrow">A LICENSE PROTOCOL, NOT A WALLED GARDEN</p><h3>Different app. Same verifiable access.</h3><p>Prism imports <code>@pact/sdk</code>. It reads your buyer-bound entitlement, validates the offer and expiry, and keeps access fresh.</p></div><span className="integration-code">getLicenseStatus<br/>isLicenseStatusFresh</span></section>
    <footer><span>PRISM STUDIO / PACT SDK EXAMPLE</span><p>Client-side demonstration, not production content protection. Protected backend resources require wallet authentication and server-side authorization.</p><span>DEVNET ONLY</span></footer>
  </main>;
}
