'use client';
import { PactBrand } from './pact-brand';
import { useEffect,useRef,useState,type FormEvent } from 'react';
import { useQuery,useQueryClient } from '@tanstack/react-query';
import { useConnection,useWallet } from '@solana/wallet-adapter-react';
import { SolanaWallet } from './solana-wallet';
import { MetadataCopy, PurchaseLinkSharing } from './purchase-link-share';
import { parsePurchaseLink, type ParsedPurchaseLink } from '../lib/solana/purchase-link';
import { VersionedTransaction,type TransactionInstruction } from '@solana/web3.js';
import { createOfferInstruction,buyLicenseInstruction,deactivateInstruction,deriveOffer,formatExpiry,formatSol,MAX_DURATION,METADATA_MAX_BYTES,metadataHash,metadataMatches,metadataWithinLimit,parseLamports,parseMetadata,parsePublicKey } from '../lib/solana/protocol';
import { acquireSolanaSnapshot,assertDevnet,assertProgram,errorText,explorerAddress,explorerTransaction,programId,rpc,RPC_URL,shortKey } from '../lib/solana/rpc';
import { useSolanaSnapshot } from '../lib/solana/use-snapshot';
import { captureReviewedTransaction,createReviewedTransaction } from '../lib/solana/transaction';
import { attemptKey,clearPendingAttempt,isDefiniteRpcRejection,readPendingAttempt,reconcileAttempt,storePendingAttempt,transactionDiagnostic,type PendingAttempt } from '../lib/solana/transaction-state';
type Section='Buy a license'|'Seller studio'|'Verify access';
const sections:Section[]=['Buy a license','Seller studio','Verify access'];
export function SolanaApp(){
  const [section,setSection]=useState<Section>('Buy a license');
  const [offerAddress,setOfferAddress]=useState('');const [holder,setHolder]=useState('');const [lookup,setLookup]=useState<{offer:string;holder:string}|null>(null);
  const [title,setTitle]=useState('Studio toolkit');const [terms,setTerms]=useState('Personal use of the demo toolkit. One wallet. No redistribution. This entitlement does not transfer copyright.');
  const [price,setPrice]=useState('0.001');const [duration,setDuration]=useState('3600');const [approved,setApproved]=useState(false);
  const [buyerMetadata,setBuyerMetadata]=useState('');const [buyerApproved,setBuyerApproved]=useState(false);const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');const [failure,setFailure]=useState('');const [signature,setSignature]=useState('');const [actor,setActor]=useState('');
  const [purchaseLink,setPurchaseLink]=useState<ParsedPurchaseLink>({kind:'none'});
  const transactionLock=useRef(false);
  const {connection}=useConnection();const {publicKey,connected,signTransaction,wallet}=useWallet();const queries=useQueryClient();
  const address=publicKey?.toBase58();const currentIdentity=useRef({address,offerAddress});
  useEffect(()=>{currentIdentity.current={address,offerAddress};},[address,offerAddress]);
  const metadata=JSON.stringify({schema:'pact-solana-license-v1',title:title.trim(),terms:terms.trim(),priceLamports:parseLamports(price)?.toString()??'',durationSeconds:duration});
  const termsHash=metadataHash(metadata);
  // Public offer reads use a fixed public system address while disconnected. No keys are generated.
  const personal=useSolanaSnapshot(offerAddress,address??'11111111111111111111111111111111',Boolean(programId));
  const verified=useSolanaSnapshot(lookup?.offer??'',lookup?.holder,Boolean(lookup));
  const offer=personal.snapshot?.offer;const matching=metadataMatches(buyerMetadata,offer);const buyerTerms=parseMetadata(buyerMetadata);
  const completeLink=purchaseLink.kind==='complete'&&purchaseLink.offer===offerAddress&&purchaseLink.metadata===buyerMetadata;
  const network=useQuery({queryKey:['solana-devnet-genesis',RPC_URL],enabled:connected||Boolean(programId),queryFn:()=>assertDevnet(),retry:false,refetchInterval:10000});
  const gateOpen=connected&&personal.valid&&personal.snapshot?.holder===address;
  const canWrite=Boolean(programId&&connected&&publicKey&&signTransaction&&!busy&&network.isSuccess&&!network.isError);
  function changeOffer(value:string){currentIdentity.current.offerAddress=value;setOfferAddress(value);setBuyerApproved(false);setLookup(null);}
  useEffect(()=>{const params=new URLSearchParams(window.location.search);if(params.get('section')==='seller')setSection('Seller studio');const incoming=parsePurchaseLink(window.location.href);setPurchaseLink(incoming);if(incoming.kind==='complete'){changeOffer(incoming.offer);setBuyerMetadata(incoming.metadata);setBuyerApproved(false);setSection('Buy a license');}else if(incoming.kind==='offer-only'){changeOffer(incoming.offer);}else if(incoming.kind==='invalid'){if(incoming.offer)changeOffer(incoming.offer);setBuyerMetadata('');setBuyerApproved(false);setSection('Buy a license');}},[]);
  async function transact(action:string,instruction:TransactionInstruction,createdAddress?:string){
    if(transactionLock.current)return;
    if(!programId||!publicKey||!signTransaction||!connected){setFailure('Connect Phantom or Solflare before continuing.');return;}
    const currentProgram=programId;
    transactionLock.current=true;setBusy(true);setFailure('');setMessage('');
    const sender=publicKey.toBase58();const initialOffer=offerAddress;const adapter=wallet?.adapter;
    const key=attemptKey(currentProgram.toBase58(),sender,initialOffer,action);
    const identityMatches=()=>currentIdentity.current.address===sender&&adapter?.publicKey?.toBase58()===sender;
    const reconcile=async(record:PendingAttempt)=>{
      setSignature(record.signature);setActor(record.buyer);
      const result=await reconcileAttempt(record,rpc,{onObservation:observation=>{
        if(observation.state==='confirmed'){
          record={...record,state:'confirmed'};setFailure('');setMessage(`${record.action} confirmed on Solana Devnet for ${shortKey(record.buyer)}. ${observation.failed?'Execution failed; waiting for finalized failure.':'Waiting for finalization.'}${identityMatches()?'':' Your connected wallet changed; this confirmation belongs to the displayed sender.'}`);
          try{storePendingAttempt(key,record);}catch(error){setFailure(`Transaction confirmed; pending storage could not be updated. Retry protection remains active. ${transactionDiagnostic(error)}`);}
        }
      }});
      if(result.state==='finalized'){
        setFailure('');setMessage(`${record.action} finalized on Solana Devnet for ${shortKey(record.buyer)}.${identityMatches()?'':' Your connected wallet changed; this confirmation belongs to the displayed sender.'}`);
        try{clearPendingAttempt(key,record.signature);}catch(error){setFailure(`Transaction finalized; storage cleanup failed and retry protection remains active. ${transactionDiagnostic(error)}`);}
        if(record.createdOffer&&identityMatches()&&currentIdentity.current.offerAddress===initialOffer)changeOffer(record.createdOffer);
        try{await queries.invalidateQueries();}catch(error){setFailure(`Transaction finalized; account refresh failed. ${transactionDiagnostic(error)}`);}return;
      }
      if(result.state==='failed'){
        setMessage('');let diagnostic=result.diagnostic??'Transaction failed on Solana Devnet.';
        try{clearPendingAttempt(key,record.signature);}catch(error){diagnostic+=` Storage cleanup failed; retry protection remains active. ${transactionDiagnostic(error)}`;}setFailure(diagnostic);return;
      }
      if(result.state==='expired'){
        // A buyer attempt is released only after a fresh canonical absent-license
        // snapshot corroborates expiration. Never initiate another write here.
        if(record.action==='Purchase license'){
          const snapshot=await acquireSolanaSnapshot({program:currentProgram,offerAddress:record.offer,holder:record.buyer,session:0,clock:()=>performance.now()});
          if(snapshot.expiry!==0n){setFailure('Blockhash expired, but this wallet has an on-chain entitlement. The prior purchase remains protected; inspect its explorer link.');return;}
        }
        setMessage('');let diagnostic='Transaction expired with no observed confirmation. No automatic retry occurred. Review the offer before a separate manual attempt.';
        try{clearPendingAttempt(key,record.signature);}catch(error){diagnostic+=` Storage cleanup failed; retry protection remains active. ${transactionDiagnostic(error)}`;}setFailure(diagnostic);return;
      }
      let diagnostic=`${result.state==='confirmed-pending'?'Transaction confirmed; finalization is still pending.':'Confirmation unknown. The transaction may still confirm.'} Inspect the Devnet explorer link; no automatic retry will occur.${result.diagnostic?' '+result.diagnostic:''}`;
      try{storePendingAttempt(key,{...record,state:result.state==='confirmed-pending'?'confirmed':'unknown'});}catch(error){diagnostic+=` Storage update failed; retry protection remains active. ${transactionDiagnostic(error)}`;}
      setMessage('');setFailure(diagnostic);
    };
    const execute=async()=>{
      const pending=readPendingAttempt(key);
      if(pending){setMessage('An unresolved attempt is protected. Checking its existing signature only; no new wallet approval or transaction will occur.');await assertDevnet();await reconcile(pending);return;}
      setSignature('');setActor(sender);let record:PendingAttempt|undefined;let attemptedSend=false;
      try{
        await assertProgram();const latest=await connection.getLatestBlockhash('confirmed');
        if(!Number.isSafeInteger(latest.lastValidBlockHeight)||latest.lastValidBlockHeight<0)throw new Error('Invalid last valid block height. Nothing was submitted.');
        const {transaction,messageBytes}=createReviewedTransaction(publicKey,latest.blockhash,instruction);
        setMessage(`Constructed ${action} for ${shortKey(sender)} on Solana Devnet. Simulating before wallet approval.`);
        const simulation=await connection.simulateTransaction(transaction,{sigVerify:false,commitment:'confirmed'});
        if(simulation.value.err)throw {message:'Simulation failed.',detail:simulation.value.err,logs:simulation.value.logs};
        await assertDevnet();
        if(!identityMatches()||currentIdentity.current.offerAddress!==initialOffer)throw new Error('Wallet or selected offer changed before signing. Review the action again.');
        setMessage(`Confirm ${action} for ${shortKey(sender)} in your wallet. The app submits only to verified Devnet.`);
        const signed=await signTransaction(VersionedTransaction.deserialize(transaction.serialize()));
        const {wireBytes,signature:hash}=captureReviewedTransaction(messageBytes,signed);
        setSignature(hash);setMessage(`Wallet signed ${action} for ${shortKey(sender)}. Not broadcast; checking Devnet and blockhash validity.`);
        if(!identityMatches()||currentIdentity.current.offerAddress!==initialOffer)throw new Error('Wallet or selected offer changed during approval. The signed transaction was not submitted.');
        record={network:'devnet',program:currentProgram.toBase58(),buyer:sender,offer:createdAddress??initialOffer,action,signature:hash,blockhash:latest.blockhash,lastValidBlockHeight:latest.lastValidBlockHeight,state:'wallet-signed',...(createdAddress?{createdOffer:createdAddress}:{})};
        storePendingAttempt(key,record); // Persist public recovery data before further awaits.
        await assertDevnet();
        const height=await rpc('getBlockHeight',[{commitment:'confirmed'}]);
        if(typeof height!=='number'||!Number.isSafeInteger(height)||height<0)throw new Error('Invalid block height response. Nothing was submitted.');
        if(height>latest.lastValidBlockHeight)throw new Error('Transaction expired before submission. Nothing was broadcast; no replacement blockhash was signed.');
        const validity=await rpc('isBlockhashValid',[latest.blockhash,{commitment:'confirmed'}]) as {value?:unknown};
        if(validity?.value!==true)throw new Error('The transaction blockhash is invalid or could not be verified. Nothing was broadcast.');
        if(!identityMatches()||currentIdentity.current.offerAddress!==initialOffer)throw new Error('Wallet or selected offer changed before submission. The signed transaction was not submitted.');
        attemptedSend=true;
        let accepted=false;
        try{
          const returnedHash=await connection.sendRawTransaction(wireBytes,{skipPreflight:false,maxRetries:0,preflightCommitment:'confirmed'});
          if(returnedHash!==hash)throw new Error('The RPC returned a different transaction signature.');
          accepted=true;
        }catch(error){
          const diagnostic=transactionDiagnostic(error);
          if(isDefiniteRpcRejection(error)){
            let rejected=`RPC rejected the transaction before acceptance. ${diagnostic}`;
            try{clearPendingAttempt(key,record.signature);}catch(storageError){rejected+=` Storage cleanup failed; retry protection remains active. ${transactionDiagnostic(storageError)}`;}record=undefined;setMessage('');setFailure(rejected);return;
          }
          record={...record,state:'unknown'};
          let uncertain=`RPC acceptance unknown. ${diagnostic}`;
          try{storePendingAttempt(key,record);}catch(storageError){uncertain+=` Storage update failed; retry protection remains active. ${transactionDiagnostic(storageError)}`;}
          setFailure(uncertain);setMessage('Checking the existing signed signature only. No automatic resend or new approval will occur.');
        }
        if(accepted){
          record={...record,state:'rpc-accepted'};
          setMessage(`Submitted for ${shortKey(sender)} on Devnet. RPC accepted the signature; waiting for confirmation and finalization.`);
          try{storePendingAttempt(key,record);}catch(error){setFailure(`RPC accepted the transaction; pending storage could not be updated. Retry protection remains active. ${transactionDiagnostic(error)}`);}
        }
        await reconcile(record);
      }catch(error){setMessage('');setFailure(`${attemptedSend?'Confirmation unknown. The existing signature remains protected. No automatic retry will occur. ':''}${transactionDiagnostic(error)}`);}
    };
    try{
      if(!navigator.locks)throw new Error('Cross-tab transaction locking is unavailable. Use a supported Chrome localhost session; no transaction was requested.');
      await navigator.locks.request(`pact-solana-${key}`,{ifAvailable:true},async lock=>{if(!lock)throw new Error('Another tab is handling this wallet/offer transaction. No duplicate approval or submission occurred.');await execute();});
    }catch(error){setMessage('');setFailure(transactionDiagnostic(error));}
    finally{transactionLock.current=false;setBusy(false);}
  }
  function create(event:FormEvent<HTMLFormElement>){event.preventDefault();setFailure('');const lamports=parseLamports(price);
    if(!programId||!publicKey||!approved||!parseMetadata(metadata)||!lamports||!metadataWithinLimit(metadata)){setFailure('Review and approve valid metadata, a positive SOL price with at most 9 decimals, and duration from 1 to 31536000 seconds. Maximum metadata: 64 KiB UTF-8.');return;}
    // A public nonce derives an offer PDA. This is not wallet key material.
    const bytes=crypto.getRandomValues(new Uint8Array(8));let nonce=0n;for(let i=0;i<8;i++)nonce|=BigInt(bytes[i])<<BigInt(i*8);
    const [offerKey]=deriveOffer(programId,publicKey,nonce);void transact('Create offer',createOfferInstruction(programId,publicKey,nonce,lamports,BigInt(duration),termsHash),offerKey.toBase58());
  }
  function verify(event:FormEvent<HTMLFormElement>){event.preventDefault();setFailure('');if(!parsePublicKey(offerAddress)||!parsePublicKey(holder)){setFailure('Enter a canonical offer address and wallet public key.');return;}setLookup({offer:offerAddress,holder});}
  function download(content:string,name:string,type:string){const url=URL.createObjectURL(new Blob([content],{type}));const link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),0);}
  return <main>
    <header className="topbar"><PactBrand /><div className="wallet-tools"><span className="network"><i/>Solana Devnet</span><SolanaWallet onError={setFailure} busy={busy}/></div></header>
    <section className="hero"><div><p className="eyebrow">DIGITAL LICENSING / SOLANA DEVNET DEMO</p><h1>Clear terms.<br/><span>Verifiable access.</span></h1><p className="hero-copy">Create a license offer, purchase a time-limited entitlement, and let your app verify wallet access directly on Solana.</p></div><aside className="hero-note"><span className="small-label">THE PACT FLOW</span><div><b>01</b> Define immutable terms</div><div><b>02</b> Purchase with SOL</div><div><b>03</b> Verify wallet entitlement</div><p>Nontransferable access. No copyright transfer.</p></aside></section>
    {!programId?<div className="notice setup"><b>Local build ready · Solana program setup pending</b><p>No Solana Devnet program ID is configured. Set <code>NEXT_PUBLIC_PACT_SOLANA_PROGRAM_ID</code> after an explicitly approved deployment and restart. No deployment or wallet approval occurs automatically.</p></div>:<div className="contract-line">PROGRAM <a href={explorerAddress(programId.toBase58())} target="_blank" rel="noreferrer">{shortKey(programId.toBase58())} ↗</a><span>Solana Devnet · test SOL only</span></div>}
    <p className="muted">Choose Devnet in your wallet. The app verifies the RPC genesis hash, simulates, and submits signed bytes only to that Devnet endpoint. Wallet extension network settings are not always exposed.</p>
    {network.error?<p className="notice error" role="alert">{errorText(network.error)}</p>:null}
    <nav className="tabs" aria-label="License tools">{sections.map(item=><button key={item} aria-current={section===item?'page':undefined} className={section===item?'selected':''} onClick={()=>setSection(item)}>{item}<span>↗</span></button>)}</nav>
    <p className="fine"><a href={`/integrate${offerAddress?`?offer=${encodeURIComponent(offerAddress)}`:''}`}>Integrate your app ↗</a></p>
    <div role="status" aria-live="polite">{message?<p className="notice success">{message}</p>:null}{signature?<p className="transaction">Transaction for {shortKey(actor)} <a href={explorerTransaction(signature)} target="_blank" rel="noreferrer">{shortKey(signature)} ↗</a></p>:null}</div>{failure?<p className="notice error" role="alert" style={{overflowWrap:'anywhere'}}>{failure}</p>:null}
    <section className="workspace"><article className="card main-card"><div className="card-heading"><span className="eyebrow">{section==='Seller studio'?'FOR CREATORS':section==='Verify access'?'PUBLIC VERIFICATION':'FOR LICENSE HOLDERS'}</span><span className="pill">DEVNET</span></div><h2>{section==='Seller studio'?'Publish your license.':section==='Verify access'?'Check an entitlement.':'Your next tool, licensed.'}</h2><p className="muted">{section==='Seller studio'?'Approve your off-chain terms. Only the opaque hash, price, duration, and public addresses are recorded on chain.':section==='Verify access'?'Query any wallet without connecting. Offer, entitlement, and Clock are read in one context slot.':'Enter a seller’s offer address and review matching metadata before paying the exact test SOL price.'}</p>
      {section==='Seller studio'?<form className="form" onSubmit={create}>
        <label>License title<input value={title} maxLength={160} disabled={busy} onChange={e=>{setTitle(e.target.value);setApproved(false);}} required/></label><label>Terms preview<textarea rows={4} value={terms} maxLength={10000} disabled={busy} onChange={e=>{setTerms(e.target.value);setApproved(false);}} required/></label>
        <div className="field-row"><label>Price in test SOL<input value={price} inputMode="decimal" disabled={busy} onChange={e=>{setPrice(e.target.value);setApproved(false);}} required/></label><label>Duration in seconds<input value={duration} inputMode="numeric" maxLength={8} disabled={busy} onChange={e=>{setDuration(e.target.value);setApproved(false);}} required/></label></div><p className="fine">Maximum duration: {MAX_DURATION.toString()} seconds. 1 SOL = 1,000,000,000 lamports.</p>
        <details className="hash-preview"><summary>Review deterministic terms hash</summary><code>{termsHash}</code><pre>{metadata}</pre><MetadataCopy metadata={metadata} busy={busy}/><button type="button" className="button subtle" disabled={!metadataWithinLimit(metadata)} onClick={()=>download(metadata,'pact-solana-terms.json','application/json')}>Download metadata preview</button></details><label className="check"><input type="checkbox" checked={approved} disabled={busy} onChange={e=>setApproved(e.target.checked)}/>I have reviewed and approve these terms, price, and duration.</label><button className="button dark wide" disabled={!canWrite||!approved||!metadataWithinLimit(metadata)}>Create offer ↗</button>
      </form>:section==='Verify access'?<form className="form" onSubmit={verify}><label>Offer address<input value={offerAddress} placeholder="Solana offer PDA" onChange={e=>changeOffer(e.target.value)} required/></label><label>Wallet public key<input value={holder} placeholder="Base58 public key" onChange={e=>{setHolder(e.target.value);setLookup(null);}} required/></label><button className="button dark wide" disabled={!programId}>Verify on chain ↗</button><div className="field-feedback-slot query-feedback-slot">{verified.isFetching&&!verified.data?<p className="muted">Reading Solana Devnet…</p>:null}{verified.error?<p className="notice error" role="alert">{errorText(verified.error)}</p>:null}{!(verified.fresh&&verified.snapshot)&&lookup&&!verified.isFetching&&!verified.error?<p className="muted">Verification paused or stale. A fresh Devnet snapshot is required.</p>:null}</div>{verified.fresh&&verified.snapshot?<div className={verified.valid?'verification-result valid':'verification-result'} data-testid="solana-verification-result"><b>{verified.valid?'Entitlement valid':'No active entitlement'}</b><p>Offer {verified.snapshot.offerAddress}</p><p>Wallet {verified.snapshot.holder}</p><p>Chain expiry: {formatExpiry(verified.snapshot.expiry)}</p><small>Verified at context slot {verified.snapshot.slot.toString()}.</small></div>:null}</form>:<div className="form">{purchaseLink.kind==='invalid'&&!matching?<p className="notice error purchase-link-error" role="alert">{purchaseLink.error} Use the manual offer address and metadata fields below to recover. No terms have been approved.</p>:null}{completeLink?<section className={personal.fresh&&matching&&offer?.active?'notice success purchase-link-status':personal.fresh&&!matching?'notice error purchase-link-status':'notice purchase-link-status'} role={personal.fresh&&!matching?'alert':'status'}><b>{personal.isError?'Purchase link could not be verified':!personal.fresh?'Checking shared terms on Solana Devnet…':!matching?'Shared metadata does not match this offer':!offer?.active?'This offer is no longer available':'Purchase link verified'}</b><p>Shared metadata is untrusted until a fresh on-chain hash, price, and duration check succeeds. Review the result and terms, connect your wallet, and approve them before purchasing. Manual controls remain available below.</p></section>:null}{completeLink&&personal.error?<p className="notice error" role="alert">{errorText(personal.error)}</p>:null}<details className="manual-purchase-controls" open={!completeLink||(personal.fresh&&!matching)||personal.isError}><summary>Manual offer address</summary><div className="input-feedback-field"><label>Offer address<input value={offerAddress} placeholder="Paste the seller’s offer PDA" onChange={e=>changeOffer(e.target.value)}/></label><div className="field-feedback-slot">{offerAddress&&!parsePublicKey(offerAddress)?<p className="notice error field-validation">Enter a canonical Solana offer address.</p>:null}{personal.isFetching&&!personal.data?<p className="muted">Reading offer from Solana Devnet…</p>:null}{personal.error&&!completeLink?<p className="notice error" role="alert">{errorText(personal.error)}</p>:null}</div></div></details>
        {offer?<><div className="offer-summary"><div><span>LICENSE PRICE</span><strong>{formatSol(offer.priceLamports)} <small>test SOL</small></strong></div><span className="pill">{offer.active?'AVAILABLE':'DEACTIVATED'}</span></div><dl><div><dt>Seller</dt><dd>{shortKey(offer.seller.toBase58())}</dd></div><div><dt>Duration</dt><dd>{offer.durationSeconds.toString()} seconds</dd></div><div><dt>Terms hash</dt><dd className="break-text">{offer.termsHash}</dd></div></dl>{completeLink&&buyerTerms?<section className="verification-result shared-license-terms"><b>{buyerTerms.title}</b><p>{buyerTerms.terms}</p><small>{personal.fresh&&matching?'Terms match the on-chain commitment.':'Shared public terms · on-chain verification required.'}</small></section>:null}<details className="manual-purchase-controls" open={!completeLink||(personal.fresh&&!matching)||personal.isError}><summary>Manual metadata JSON</summary><div className="input-feedback-field metadata-feedback-field"><label>Seller metadata JSON<textarea rows={5} value={buyerMetadata} maxLength={METADATA_MAX_BYTES} disabled={busy} placeholder="Paste exact pact-solana-terms.json contents" onChange={e=>{setBuyerMetadata(e.target.value);setBuyerApproved(false);}}/></label><p className="muted">The exact UTF-8 bytes are hashed. Shared seller/buyer limit: 64 KiB. Preserve whitespace.</p>{!completeLink&&buyerTerms?<div className="verification-result"><b>{buyerTerms.title}</b><p>{buyerTerms.terms}</p></div>:null}<div className="field-feedback-slot">{buyerMetadata?<p className={matching?'notice success':'notice error field-validation'}>{matching?'Terms hash, lamport price, and duration match this offer.':'Metadata is invalid or does not match this offer. Purchase is disabled.'}</p>:null}</div></div></details><label className="check"><input type="checkbox" checked={buyerApproved} disabled={!matching||busy} onChange={e=>setBuyerApproved(e.target.checked)}/>I reviewed and approve these matching license terms.</label><button className="button dark wide" disabled={!canWrite||!matching||!buyerApproved||!offer.active||!personal.fresh||personal.valid} onClick={()=>{if(programId&&publicKey)void transact('Purchase license',buyLicenseInstruction(programId,publicKey,offer));}}>Purchase license ↗</button><p className="fine">Exact price settles directly to the seller in the same purchase. Buyer also pays network fees and entitlement-account rent.</p></>:<div className="empty"><span>◇</span><b>Your offer will appear here</b><p>{programId?'Paste an existing offer PDA to load a validated Devnet snapshot.':'Configure the deployed program to load live offers.'}</p></div>}{personal.snapshot&&connected?<p className="muted">{personal.valid?'Your license expires '+formatExpiry(personal.snapshot.expiry)+'.':'Your wallet has no active license for this offer.'} Verified at slot {personal.snapshot.slot.toString()}.</p>:null}
      </div>}
    </article><aside className="side-stack">{section==='Seller studio'?<article className="card"><p className="eyebrow">SELLER CONTROLS</p><h3>Direct settlement.</h3><p className="muted">A successful purchase transfers the exact lamport price directly to your wallet and records the buyer’s entitlement atomically. No withdrawal step is needed.</p><label className="management-label">Offer address<input value={offerAddress} onChange={e=>changeOffer(e.target.value)}/></label><button className="button subtle wide" disabled={!canWrite||!parsePublicKey(offerAddress)} onClick={()=>{const key=parsePublicKey(offerAddress);if(programId&&publicKey&&key)void transact('Deactivate offer',deactivateInstruction(programId,publicKey,key));}}>Deactivate future sales</button><p className="fine">Only the seller can deactivate an offer. Existing entitlements remain valid.</p><p className="break-text offer-address-echo">{parsePublicKey(offerAddress)?<a href={explorerAddress(offerAddress)} target="_blank" rel="noreferrer">Solana Explorer</a>:null}</p><PurchaseLinkSharing offer={offer} offerAddress={offerAddress} metadata={metadata} approved={approved} fresh={personal.fresh} busy={busy} connected={connected} address={address} connectedAddress={()=>wallet?.adapter.publicKey?.toBase58()}/></article>:<article className="card gate" data-testid="solana-license-gate" data-state={gateOpen?'open':'closed'}><div className="gate-symbol">{gateOpen?'↗':'⌁'}</div><p className="eyebrow">CHAIN-VERIFIED DEMO</p><h3>{gateOpen?'Welcome to the studio.':'The studio awaits.'}</h3><p className="muted">The connected public key’s entitlement is checked with the offer and Clock in one Devnet context slot.</p>{gateOpen?<div className="unlocked"><b>Access granted</b><p>Try your licensed creative toolkit.</p><button className="button dark wide" onClick={()=>download('PACT Solana studio sample: licensed demo content.','pact-studio-sample.txt','text/plain')}>Download sample ↗</button></div>:<div className="locked"><span>●</span>{personal.isError?'Chain check failed · access closed':!personal.active?'Checks paused · access closed':personal.isFetching&&!personal.data?'Checking Devnet…':connected&&!personal.fresh?'Fresh Devnet snapshot required':'License required'}</div>}<p className="fine">Client-side demo gating. Checks poll every 4 seconds; access closes on error, after 8 seconds without a fresh snapshot, 12 seconds without slot progress, offline/hidden pages, or expiry.</p></article>}<article className="card compact"><p className="eyebrow">BUILT FOR CLARITY</p><div className="principle"><span>✓</span><div><b>Immutable offer terms</b><p>Exact lamports, fixed duration, agreement hash.</p></div></div><div className="principle"><span>✓</span><div><b>Portable verification</b><p>Public-key entitlement, validated PDA.</p></div></div><div className="principle"><span>✓</span><div><b>Direct settlement</b><p>Payment and access in one transaction.</p></div></div></article></aside></section>
    <footer><PactBrand compact /><p>Hacklanta MVP · Solana Devnet only · Test SOL has no monetary value.</p><a href="/base" className="fine">Preserved Base Sepolia fallback ↗</a><p>Entitlements do not prove ownership or legal enforceability.</p></footer>
  </main>;
}
