import {FRESHNESS_MS, isLicenseStatusFresh, type LicenseStatus} from './index.js';
import {createCheckoutClient, validateCheckoutMetadata, type CheckoutClient, type CheckoutProgress, type OfferInfo, type PurchaseResult, type WalletAdapter} from './checkout.js';

export type PurchaseAccess = {allowed:boolean;reason?:string};
export type WidgetState = {
  access:'disconnected'|'checking'|'unlicensed'|'expired'|'active'|'error'|'paused';
  wallet:string|null;
  offerInfo?:OfferInfo;
  license?:LicenseStatus;
  transaction:CheckoutProgress;
  message:string;
  purchase?:{enabled:boolean;reason:string|null};
};
export type MountCheckoutOptions = {
  element:HTMLElement|string;
  offer:string;
  programId:string;
  rpcUrl:string;
  metadataJson?:string;
  walletAdapter?:WalletAdapter;
  /** Host prerequisites only; never replaces wallet or chain security checks. */
  purchaseAccess?:PurchaseAccess;
  onState?:(state:Readonly<WidgetState>)=>void;
  onLicenseActive?:(license:Readonly<LicenseStatus>)=>void;
  /** Monotonic milliseconds; use the same clock for SDK reads and freshness. */
  now?:()=>number;
};
export type CheckoutController = {
  connect():Promise<string>;
  disconnect():Promise<void>;
  refresh():Promise<void>;
  purchase():Promise<PurchaseResult>;
  setPurchaseAccess(access?:PurchaseAccess):void;
  /** Clears unsigned diagnostics only. Signed/protected attempts must be recovered. */
  resetUnsubmittedAttempt():boolean;
  /** Clears terminal failure diagnostics only after journal protection is released. */
  resetResolvedFailure():boolean;
  getState():Readonly<WidgetState>;
  destroy():void;
};

const ownedRoots = new WeakMap<HTMLElement,ShadowRoot>();
const mounted = new WeakSet<HTMLElement>();
const style = `
:host{display:block;color:var(--pact-ink,#153b36);font:14px/1.6 var(--pact-font,Arial,sans-serif);color-scheme:light}*{box-sizing:border-box}section{background:var(--pact-background,#fff);border:1px solid var(--pact-border,#dce3db);border-radius:var(--pact-radius,16px);padding:25px;max-width:520px;margin:0 auto}header,.row,.actions{display:flex;justify-content:space-between;align-items:center;gap:12px}header{padding-bottom:18px;border-bottom:1px solid var(--pact-border,#dce3db)}.brand{display:flex;align-items:center;gap:9px;font-size:19px;font-weight:800;letter-spacing:-.5px}.mark{display:grid;place-items:center;width:28px;height:31px;background:var(--pact-ink,#153b36);color:var(--pact-accent,#d7f279);border-radius:7px;font-size:20px}.badge{font-size:9px;letter-spacing:1px;border:1px solid var(--pact-border,#dce3db);border-radius:5px;padding:4px 7px;white-space:nowrap}h2{font-size:23px;line-height:1.3;letter-spacing:-.7px;margin:21px 0 12px}h3{font-size:13px;margin:0 0 7px}.muted,.fine{color:var(--pact-muted,#657770)}.fine{font-size:10px;margin:9px 0;line-height:1.6}.wallet{font:11px/1.7 monospace;overflow-wrap:anywhere;margin:8px 0 0}.actions{margin-top:14px;justify-content:flex-start;flex-wrap:wrap}button{border:1px solid var(--pact-border,#dce3db);background:#edf1e9;color:var(--pact-ink,#153b36);border-radius:8px;padding:10px 13px;font:600 11px var(--pact-font,Arial,sans-serif);cursor:pointer}button:disabled{opacity:.45;cursor:not-allowed}button.primary{background:var(--pact-ink,#153b36);color:#fff;border-color:var(--pact-ink,#153b36);font-size:13px;padding:13px;width:100%;margin-top:16px}button:focus-visible,input:focus-visible,textarea:focus-visible,summary:focus-visible,a:focus-visible{outline:3px solid var(--pact-focus,#2563eb);outline-offset:3px}.quote{background:#f5f8ef;border-radius:9px;padding:16px;margin:19px 0;font-size:11px}.price{font-size:25px;font-weight:700;line-height:1.3}.price small{font-size:10px;font-weight:400}.public{font:10px/1.7 monospace;overflow-wrap:anywhere}.public-label{font-size:9px;color:var(--pact-muted,#657770);margin:12px 0 4px}.terms{border:1px solid var(--pact-border,#dce3db);padding:14px;border-radius:8px;margin:17px 0}.terms p{font-size:12px;white-space:pre-wrap;overflow-wrap:anywhere;max-height:180px;overflow:auto;margin:0}.metadata{margin:17px 0}summary{font-size:11px;cursor:pointer}label.metadata-label{display:block;font-size:10px;margin-top:12px}textarea{display:block;width:100%;min-height:110px;resize:vertical;background:#fafbf8;border:1px solid var(--pact-border,#dce3db);border-radius:6px;padding:10px;color:var(--pact-ink,#153b36);font:10px/1.6 monospace;margin-top:7px}.consent{display:flex;gap:9px;align-items:flex-start;font-size:11px;line-height:1.6}.consent input{width:16px;height:16px;flex-shrink:0;accent-color:var(--pact-ink,#153b36);margin:2px 0 0}.status{padding:12px 14px;border:1px solid var(--pact-border,#dce3db);border-radius:8px;background:#f4f7ee;margin:17px 0 0;font-size:11px;overflow-wrap:anywhere}.status b{display:block;font-size:12px}.status[data-access=active]{background:#eaf5db;border-color:#c2d8a5}.status[data-access=error]{background:#fff2ef;border-color:#efc6bc}.transaction{border-top:1px solid var(--pact-border,#dce3db);padding-top:14px;margin-top:16px;overflow-wrap:anywhere;font-size:11px}.transaction p{margin:5px 0}.error{color:#8d3627;overflow-wrap:anywhere}.boundary{margin:18px 0 0;border-top:1px solid var(--pact-border,#dce3db);padding-top:13px;font-size:9px;color:var(--pact-muted,#657770);line-height:1.7}a{color:inherit;overflow-wrap:anywhere}[hidden]{display:none!important}@media(max-width:400px){section{padding:19px}h2{font-size:21px}.badge{font-size:8px}.row{align-items:flex-start}.price{font-size:23px}}
`;
function publicMessage(value:unknown,fallback:string){
  try{const message=typeof value==='string'?value:(value as {message?:unknown})?.message;return typeof message==='string'&&message?message.replace(/[\u0000-\u001f\u007f]/g,' ').replace(/https?:\/\/\S+/gi,'[RPC endpoint]').replace(/\b(?:private key|seed phrase|recovery phrase|mnemonic|api[_ -]?key|authorization|bearer)\b[^.;]*/gi,'[redacted]').replace(/[A-Za-z0-9+/=_-]{100,}/g,'[encoded data omitted]').slice(0,420):fallback;}catch{return fallback;}
}
function freezeState(state:WidgetState):Readonly<WidgetState>{
  const copy:WidgetState={access:state.access,wallet:state.wallet,transaction:Object.freeze({...state.transaction}),message:state.message};
  if(state.offerInfo)copy.offerInfo=Object.freeze({...state.offerInfo});
  if(state.license)copy.license=Object.freeze({...state.license});
  if(state.purchase)copy.purchase=Object.freeze({...state.purchase});
  return Object.freeze(copy);
}
function displaySol(lamports:string){try{const value=BigInt(lamports);return `${value/1000000000n}.${(value%1000000000n).toString().padStart(9,'0').replace(/0+$/,'')||'0'}`;}catch{return'Unavailable';}}

/** Inline, framework-free checkout. Mounting never requests wallet access or a transaction. */
export function mountCheckout(input:MountCheckoutOptions):CheckoutController {
  const options={...input};
  if(typeof document==='undefined')throw new Error('mountCheckout requires a browser document.');
  const element=typeof options.element==='string'?document.querySelector<HTMLElement>(options.element):options.element;
  if(!element||typeof element.attachShadow!=='function')throw new Error('Checkout requires a host HTMLElement.');
  if(mounted.has(element))throw new Error('This element already contains an active checkout.');
  if(element.shadowRoot&&!ownedRoots.has(element))throw new Error('Checkout will not replace an existing Shadow DOM.');
  const offer=options.offer;
  const now=options.now??(()=>performance.now());
  let disposed=false,closing=false,connecting=false,purchasing=false,reading:Promise<void>|null=null,refreshAgain=false,recovering=false;
  let epoch=0,readError='',attemptError=false,journalBlocked=false,consent=false,metadata=options.metadataJson??'',matched:{title:string;terms:string}|undefined;
  let purchaseAccess=normalizePurchaseAccess(options.purchaseAccess);
  let operationWallet:string|null=null,lastActive='',lastPublished='',publishing=false,publishAgain=false;
  const attempts=new Map<string,{progress:CheckoutProgress;protected:boolean}>();
  const state:WidgetState={access:'disconnected',wallet:null,transaction:{stage:'idle'},message:'Connect Phantom to verify access.'};
  let root:ShadowRoot;
  let client:CheckoutClient;
  const foreground=()=>navigator.onLine&&document.visibilityState==='visible';
  function normalizePurchaseAccess(access?:PurchaseAccess):PurchaseAccess|undefined{return access?{allowed:access.allowed===true,reason:access.reason?publicMessage(access.reason,'Purchase is unavailable.'):undefined}:undefined;}
  const alive=()=>{if(disposed||closing)throw new Error('Checkout was destroyed.');};
  function currentWallet(){try{return client.getWallet();}catch{return null;}}
  function identity(wallet:string|null){
    if(wallet===state.wallet)return;
    epoch++;state.wallet=wallet;state.license=undefined;consent=false;readError='';attemptError=false;
    state.transaction={...(wallet?attempts.get(wallet)?.progress:undefined)??{stage:'idle'}};
    refreshAgain=true;
  }
  function protectedAttempt(){return Boolean(state.wallet&&attempts.get(state.wallet)?.protected);}
  function inspectPending(){
    if(!state.wallet){journalBlocked=false;return;}
    try{
      const pending=client.getPendingPurchase({offer}),old=attempts.get(state.wallet);
      journalBlocked=false;
      if(pending){
        const ranks:Record<CheckoutProgress['stage'],number>={idle:0,preparing:1,'awaiting-signature':2,'wallet-signed':3,unknown:3,'rpc-accepted':4,processed:5,confirmed:6,finalized:7,rejected:0,failed:0,expired:0};
        const progress=old&&old.progress.signature===pending.signature&&ranks[old.progress.stage]>=ranks[pending.stage]?old.progress:pending;
        attempts.set(state.wallet,{progress:{...progress,buyer:state.wallet,offer},protected:true});state.transaction={...progress,buyer:state.wallet,offer};
      }else if(old?.protected)attempts.set(state.wallet,{...old,protected:false});
    }catch{journalBlocked=true;state.transaction={...state.transaction,message:'Pending purchase storage is unavailable. Purchases remain disabled.'};}
  }
  function evaluate(){
    if(disposed||closing){state.access='paused';state.license=undefined;state.message='Checkout removed. Access closed.';return;}
    identity(currentWallet());
    inspectPending();
    if(!state.wallet){state.access='disconnected';state.message=readError||'Connect Phantom to verify access.';return;}
    if(!foreground()){state.access='paused';state.license=undefined;state.message='Verification paused while this page is hidden or offline.';return;}
    if(readError){state.access='error';state.license=undefined;state.message=readError;return;}
    if(journalBlocked||protectedAttempt()){state.access='unlicensed';state.license=undefined;state.message=journalBlocked?'Pending purchase storage is unavailable. Access remains closed.':'This purchase remains protected until finalized recovery and fresh entitlement verification. Check the pending transaction; access remains closed.';return;}
    const license=state.license;
    if(license&&license.wallet===state.wallet&&license.offer===offer&&license.program===options.programId&&isLicenseStatusFresh(license,now())){state.access='active';state.message='A fresh buyer-bound entitlement is verified on Solana Devnet.';return;}
    if(license?.state==='expired'){state.access='expired';state.message='Your entitlement has expired. Premium access is closed.';return;}
    if(license?.state==='missing'){state.access='unlicensed';state.message='This wallet has no active license for this offer.';return;}
    state.access=reading?'checking':'unlicensed';state.message=license?'Fresh verification is required. Access is closed.':'A fresh entitlement check is required. Access is closed.';
  }
  function publish(force=false){
    if(disposed)return;
    evaluate();render();
    const copy=freezeState(state),key=JSON.stringify(copy);
    if(!force&&key===lastPublished)return;
    if(publishing){publishAgain=true;return;}
    lastPublished=key;
    publishing=true;
    try{try{options.onState?.(copy);}catch{}
      if(!disposed&&!closing&&state.access==='active'&&state.license){
        const activeKey=`${state.wallet}:${state.license.contextSlot}:${state.license.startedAtMs}:${state.license.expiry}`;
        if(activeKey!==lastActive&&currentWallet()===state.wallet&&foreground()&&isLicenseStatusFresh(state.license,now())){lastActive=activeKey;try{options.onLicenseActive?.(Object.freeze({...state.license}));}catch{}}
      }else lastActive='';
    }finally{publishing=false;if(publishAgain&&!disposed){publishAgain=false;publish();}}
  }
  function progress(value:CheckoutProgress){
    if(disposed||closing)return;
    const buyer=value.buyer??operationWallet??state.wallet??undefined;
    const next={...value,buyer,offer:value.offer??offer,message:value.message?publicMessage(value.message,'Checkout progress unavailable.'):undefined};
    if(buyer){const old=attempts.get(buyer);attempts.set(buyer,{progress:next,protected:old?.protected??false});}
    if(!buyer||buyer===state.wallet)state.transaction=next;
    publish(true);
  }
  client=createCheckoutClient({programId:options.programId,rpcUrl:options.rpcUrl,walletAdapter:options.walletAdapter,now,onState:progress});
  try{root=ownedRoots.get(element)??element.attachShadow({mode:'open'});ownedRoots.set(element,root);mounted.add(element);}catch(error){client.destroy();throw error;}
  root.innerHTML=`<style>${style}</style><section part="root" data-pact-widget><header part="header"><div class="brand" part="brand"><span class="mark" aria-hidden="true">P</span>PACT</div><span class="badge">SOLANA DEVNET</span></header><h2 id="title" part="title">Review this license.</h2><p class="fine">Connect your own wallet. Test SOL has no monetary value.</p><div class="wallet" id="wallet" part="wallet"></div><div class="actions"><button id="connect" type="button" part="button connect">Connect Phantom</button><button id="disconnect" type="button" part="button disconnect" hidden>Disconnect</button><button id="refresh" type="button" part="button refresh">Refresh license</button></div><div class="quote" part="quote"><div class="row"><div><div class="fine">LICENSE PRICE</div><div class="price" id="price">Loading offer…</div></div><span class="badge" id="availability">CHECKING</span></div><p class="fine" id="duration"></p><div class="public-label">PROGRAM</div><div id="program" class="public"></div><div class="public-label">OFFER</div><div id="offer" class="public"></div><div class="public-label">SELLER</div><div id="seller" class="public"></div><div class="public-label">TERMS HASH</div><div id="hash" class="public"></div></div><div class="terms" id="terms-panel" part="terms" hidden><h3>Hash-matched license terms</h3><p id="terms"></p></div><details class="metadata" part="metadata" id="metadata-panel"><summary>License metadata (exact JSON)</summary><label class="metadata-label" for="metadata">Paste the seller's exact metadata JSON</label><textarea id="metadata" aria-describedby="metadata-message" maxlength="65536" spellcheck="false"></textarea><p class="fine" id="metadata-message" role="status"></p></details><label class="consent" part="consent"><input id="consent" type="checkbox" disabled><span>I reviewed and approve these matching terms, the exact price, and the duration.</span></label><button id="purchase" class="primary" type="button" part="button purchase" aria-describedby="purchase-reason" disabled>Purchase license</button><p id="purchase-reason" class="fine" part="purchase-reason" role="status" aria-live="polite"></p><p class="fine">Purchase pays the seller directly. Your wallet also pays network fees and entitlement-account rent.</p><div id="status" class="status" part="status" role="status" aria-live="polite"><b id="access"></b><span id="message" part="message"></span></div><div id="transaction" class="transaction" part="transaction" role="status" aria-atomic="true" hidden><b>Transaction state</b><p id="transaction-stage"></p><p id="transaction-message"></p><p id="transaction-buyer" class="public"></p><a id="explorer" target="_blank" rel="noreferrer" hidden></a></div><p class="boundary">Client-side gating alone is not production-grade security. Authenticate wallet ownership and authorize protected resources on your server. Entitlements do not prove copyright ownership. Devnet only.</p></section>`;
  const node=<T extends HTMLElement>(id:string)=>root.getElementById(id) as T;
  const buttons={connect:node<HTMLButtonElement>('connect'),disconnect:node<HTMLButtonElement>('disconnect'),refresh:node<HTMLButtonElement>('refresh'),purchase:node<HTMLButtonElement>('purchase')};
  const editor=node<HTMLTextAreaElement>('metadata'),checkbox=node<HTMLInputElement>('consent');
  editor.value=metadata;node<HTMLDetailsElement>('metadata-panel').open=!metadata;
  node('offer').textContent=offer;
  node('program').textContent=options.programId;
  function quoteFresh(){const quote=state.offerInfo,t=now();return Boolean(quote&&Number.isFinite(t)&&t>=quote.receivedAtMs&&t-quote.startedAtMs>=0&&t-quote.startedAtMs<FRESHNESS_MS);}
  function purchaseReadiness():{enabled:boolean;reason:string|null}{
    let reason:string|null=null;
    if(disposed||closing)reason='Checkout is closed.';
    else if(!state.wallet)reason='Connect Phantom before purchasing.';
    else if(!foreground())reason='Return to this page and go online before purchasing.';
    else if(journalBlocked)reason='Pending purchase storage is unavailable. Purchases remain disabled.';
    else if(protectedAttempt())reason='Check the pending transaction before starting another purchase.';
    else if(connecting||purchasing||recovering)reason='Wait for the current checkout operation to finish.';
    else if(state.access==='active')reason='This wallet already has an active license.';
    else if(state.access==='error')reason='Refresh license verification before purchasing.';
    else if(purchaseAccess?.allowed===false)reason=purchaseAccess.reason||'Purchase is unavailable.';
    else if(!state.offerInfo?.active)reason='A verified, available offer is required before purchasing.';
    else if(!quoteFresh())reason='Refresh the offer before purchasing.';
    else if(!matched)reason='Supply exact matching license metadata before purchasing.';
    else if(!consent)reason='Accept the matching license terms before purchasing.';
    return {enabled:reason===null,reason};
  }
  function resetUnsubmittedAttempt():boolean{
    alive();evaluate();
    if(connecting||purchasing||recovering||journalBlocked||protectedAttempt()||state.transaction.signature||!['idle','preparing','awaiting-signature','rejected','failed','expired'].includes(state.transaction.stage))return false;
    if(state.wallet)attempts.delete(state.wallet);
    state.transaction={stage:'idle'};
    if(attemptError){readError='';attemptError=false;}
    publish(true);return true;
  }
  function resetResolvedFailure():boolean{
    alive();evaluate();
    if(connecting||purchasing||recovering||journalBlocked||protectedAttempt()||!['rejected','failed','expired'].includes(state.transaction.stage))return false;
    if(state.wallet)attempts.delete(state.wallet);
    state.transaction={stage:'idle'};
    if(attemptError){readError='';attemptError=false;}
    publish(true);return true;
  }
  function matchMetadata(){
    matched=undefined;
    if(!state.offerInfo){text('metadata-message','A verified offer is required to check metadata.');return;}
    if(!metadata){text('metadata-message','Paste exact seller metadata. Purchase remains disabled until the hash, price and duration match.');return;}
    try{matched=validateCheckoutMetadata(metadata,state.offerInfo);text('metadata-message','Exact metadata bytes match the offer hash, price and duration.');}
    catch{consent=false;text('metadata-message','Metadata is invalid, exceeds 64 KiB, or does not match this offer. Purchase is disabled.');}
  }
  let pendingWalletFocus:HTMLButtonElement|undefined;
  function text(id:string,value:string){const target=node(id);if(target.textContent!==value)target.textContent=value;}
  function render(){
    const focused=root.activeElement;
    const focusDisconnect=Boolean(state.wallet)&&focused===buttons.connect;
    const focusConnect=!state.wallet&&focused===buttons.disconnect;
    if(focusDisconnect)pendingWalletFocus=buttons.disconnect;
    else if(focusConnect)pendingWalletFocus=buttons.connect;
    text('title',matched?.title??'Review this license.');
    text('wallet',state.wallet??'Wallet disconnected');
    const quote=state.offerInfo;
    text('price',quote?`${displaySol(quote.priceLamports)} test SOL`:'Offer unavailable');
    text('availability',quote?(quoteFresh()?(quote.active?'AVAILABLE':'DEACTIVATED'):'REFRESH REQUIRED'):'UNAVAILABLE');
    text('duration',quote?`Duration: ${quote.durationSeconds} seconds`:'Waiting for a validated Devnet offer.');
    text('seller',quote?.seller??'Not verified');text('hash',quote?.termsHash??'Not verified');
    node('terms-panel').hidden=!matched;text('terms',matched?.terms??'');
    checkbox.disabled=!matched||purchasing;checkbox.checked=consent;
    buttons.connect.hidden=Boolean(state.wallet);buttons.connect.disabled=connecting||purchasing;
    buttons.disconnect.hidden=!state.wallet;buttons.refresh.disabled=Boolean(reading)||purchasing||recovering;
    text('refresh',protectedAttempt()?'Check pending transaction':'Refresh license');
    state.purchase=purchaseReadiness();buttons.purchase.disabled=!state.purchase.enabled;
    text('purchase-reason',state.purchase.reason??'');
    text('purchase',purchasing?'Purchase in progress…':state.access==='active'?'License active':'Purchase license');
    editor.disabled=purchasing;
    editor.setAttribute('aria-invalid',String(Boolean(metadata&&state.offerInfo&&!matched)));
    if(pendingWalletFocus){
      // Initial connection verification may still temporarily disable Connect.
      // Complete only the handoff from a hidden focused control, never a new focus.
      const active=root.activeElement;
      if(active&&active!==pendingWalletFocus||!active&&document.activeElement!==document.body&&document.activeElement!==element)pendingWalletFocus=undefined;
      else if(!pendingWalletFocus.hidden&&!pendingWalletFocus.disabled){pendingWalletFocus.focus();pendingWalletFocus=undefined;}
    }
    const status=node('status');status.dataset.access=state.access;
    const labels={disconnected:'Wallet disconnected',checking:'Checking Devnet',unlicensed:'License required',expired:'License expired',active:'Access verified',error:'Verification failed',paused:'Access paused'};
    text('access',labels[state.access]);text('message',state.message);
    node<HTMLElement>('transaction').hidden=state.transaction.stage==='idle'&&!state.transaction.signature&&!state.transaction.message;
    text('transaction-stage',state.transaction.stage);
    text('transaction-message',state.transaction.message??'');
    text('transaction-buyer',state.transaction.buyer?`Sender: ${state.transaction.buyer}`:'');
    const explorer=node<HTMLAnchorElement>('explorer'),signature=state.transaction.signature;
    explorer.hidden=!signature;text('explorer',signature?`View transaction ${signature}`:'');
    if(signature)explorer.href=`https://explorer.solana.com/tx/${encodeURIComponent(signature)}?cluster=devnet`;
    else explorer.removeAttribute('href');
    node<HTMLElement>('status').dataset.transaction=state.transaction.stage;
  }
  async function verify(){
    alive();
    if(purchasing||recovering){refreshAgain=true;return;}
    if(reading){refreshAgain=true;return reading;}
    if(!foreground()){publish();return;}
    identity(currentWallet());const scope=epoch,wallet=state.wallet;
    const run=async()=>{
      try{
        const quote=await client.getOffer({offer});
        if(disposed||closing||scope!==epoch)return;
        const changed=state.offerInfo?.termsHash!==quote.termsHash;
        state.offerInfo=quote;if(changed)consent=false;matchMetadata();
        if(wallet){const license=await client.getLicenseStatus({offer});if(disposed||closing||scope!==epoch||currentWallet()!==wallet)return;state.license=license;}
        readError='';
      }catch(error){if(!disposed&&!closing&&scope===epoch){state.license=undefined;state.offerInfo=undefined;matched=undefined;consent=false;readError=publicMessage(error,'Devnet verification is unavailable. Access is closed.');}}
      finally{if(!disposed&&!closing&&scope===epoch)publish(true);}
    };
    reading=run();publish();
    try{await reading;}finally{reading=null;if(!disposed&&!closing){publish();if(refreshAgain){refreshAgain=false;void verify().catch(()=>{});}}}
  }
  function acceptResult(result:PurchaseResult,buyer:string){
    const previous=attempts.get(buyer)?.progress??{stage:'idle' as const};
    const unresolved=result.outcome==='unknown'||result.outcome==='finalized-unverified';
    const stage:CheckoutProgress['stage']=result.outcome==='finalized-unverified'?'finalized':result.outcome==='unknown'?(previous.stage==='confirmed'?'confirmed':'unknown'):result.outcome==='licensed'&&result.signature?'finalized':result.outcome==='already-licensed'?'idle':result.outcome==='licensed'?'idle':result.outcome;
    const messages={licensed:'Payment finalized. Fresh entitlement verification is required for current access.','already-licensed':'An existing active license was verified. No new purchase was submitted.',rejected:'The purchase was rejected. Access remains closed.',failed:'The transaction failed. Access remains closed.',expired:'The transaction expired without observed confirmation. Access remains closed.',unknown:'Confirmation is unresolved. Check the pending transaction; do not submit another purchase.','finalized-unverified':'Payment finalized, but fresh entitlement access could not be verified. Access remains closed.'};
    const authBlocked=result.error?.code.startsWith('AUTH_')&&!result.signature;
    const resultMessage=authBlocked?'Wallet authentication blocked checkout. No transaction was submitted.':result.outcome==='rejected'&&!result.signature?'The wallet signature was rejected. No transaction was submitted.':result.outcome==='failed'&&!result.signature?'Purchase preparation or wallet signing failed. No transaction was submitted.':messages[result.outcome];
    const next:CheckoutProgress={...previous,stage,buyer,offer,code:result.error?.code,signature:result.signature??previous.signature,message:result.error?`${resultMessage} ${publicMessage(result.error,'')}`:resultMessage};
    attempts.set(buyer,{progress:next,protected:unresolved});
    if(state.wallet===buyer){state.transaction=next;state.license=undefined;
      if(result.license&&foreground()&&currentWallet()===buyer&&result.license.wallet===buyer&&result.license.offer===offer&&result.license.program===options.programId&&isLicenseStatusFresh(result.license,now())){state.license=result.license;readError='';}
      else if(result.outcome==='finalized-unverified')readError='Payment finalized, but current license access is not verified.';
    }
    publish(true);
  }
  async function refresh(){
    alive();identity(currentWallet());
    if(protectedAttempt()&&!purchasing&&!recovering&&foreground()){
      recovering=true;const buyer=state.wallet!;operationWallet=buyer;publish();
      try{if(reading)await reading;const result=await client.recoverPurchase({offer});if(!disposed&&!closing)acceptResult(result,buyer);}
      catch(error){if(!disposed&&!closing){readError=publicMessage(error,'Pending verification is unavailable. The attempt remains protected.');state.license=undefined;publish(true);}}
      finally{recovering=false;operationWallet=null;}
    }
    if(!disposed&&!closing)await verify();
  }
  const controller:CheckoutController={
    async connect(){alive();if(connecting||purchasing||recovering)throw new Error('Checkout operation is already in progress.');connecting=true;readError='';publish();try{const wallet=await client.connect();alive();identity(wallet);publish(true);await verify();return wallet;}catch(error){if(!disposed&&!closing){state.license=undefined;readError=publicMessage(error,'Phantom connection was declined or unavailable.');publish(true);}throw error;}finally{connecting=false;if(!disposed&&!closing)publish();}},
    async disconnect(){alive();epoch++;state.license=undefined;consent=false;state.wallet=null;state.transaction={stage:'idle'};readError='';publish(true);try{await client.disconnect();}finally{if(!disposed&&!closing){identity(currentWallet());publish(true);}}},
    refresh,
    async purchase(){
      alive();evaluate();
      const readiness=purchaseReadiness();if(!readiness.enabled)throw new Error(readiness.reason??'Purchase is unavailable.');
      resetUnsubmittedAttempt();
      resetResolvedFailure();
      const currentReadiness=purchaseReadiness();if(!currentReadiness.enabled)throw new Error(currentReadiness.reason??'Purchase is unavailable.');
      const buyer=state.wallet!,json=metadata;purchasing=true;operationWallet=buyer;epoch++;state.license=undefined;readError='';publish(true);
      try{if(reading)await reading;alive();if(currentWallet()!==buyer||!foreground())throw new Error('Wallet or page state changed before purchase.');const result=await client.purchaseLicense({offer,metadataJson:json,termsAccepted:true});if(!disposed&&!closing)acceptResult(result,buyer);return result;}
      catch(error){if(!disposed&&!closing){state.license=undefined;readError=publicMessage(error,'Purchase could not complete. Check transaction state before continuing.');attemptError=true;
        if(!state.transaction.signature&&!protectedAttempt()&&!journalBlocked){const unsigned=['idle','preparing'].includes(state.transaction.stage)||state.transaction.message?.includes('Nothing was signed');state.transaction={...state.transaction,stage:'failed',message:`Purchase could not complete. ${unsigned?'Nothing was signed or submitted.':'No submission was recorded. Review your wallet before continuing.'} ${readError}`};if(state.wallet)attempts.set(state.wallet,{progress:{...state.transaction},protected:false});}
        publish(true);}throw error;}
      finally{purchasing=false;operationWallet=null;if(!disposed&&!closing){consent=false;publish();void verify().catch(()=>{});}}
    },
    setPurchaseAccess(access){alive();purchaseAccess=normalizePurchaseAccess(access);publish(true);},
    resetUnsubmittedAttempt,
    resetResolvedFailure,
    getState(){if(!disposed)publish();return freezeState(state);},
    destroy(){if(disposed||closing)return;closing=true;epoch++;state.license=undefined;state.access='paused';state.message='Checkout removed. Access closed.';lastActive='';render();const closed=freezeState(state);lastPublished=JSON.stringify(closed);try{options.onState?.(closed);}catch{}disposed=true;clearInterval(poll);clearInterval(tick);unsubscribe();window.removeEventListener('online',environment);window.removeEventListener('offline',environment);document.removeEventListener('visibilitychange',environment);client.destroy();root.replaceChildren();mounted.delete(element);},
  };
  const unsubscribe=client.subscribeWallet(wallet=>{if(disposed||closing)return;identity(wallet);publish(true);void verify().catch(()=>{});});
  const environment=()=>{if(disposed||closing)return;epoch++;state.license=undefined;consent=false;readError='';publish(true);if(foreground())void verify().catch(()=>{});};
  window.addEventListener('online',environment);window.addEventListener('offline',environment);document.addEventListener('visibilitychange',environment);
  const poll=setInterval(()=>{if(!disposed&&!closing&&!purchasing&&!recovering)void verify().catch(()=>{});},4000);
  const tick=setInterval(()=>{if(disposed||closing)return;publish();if(refreshAgain&&!reading&&!purchasing&&!recovering&&foreground()){refreshAgain=false;void verify().catch(()=>{});}},250);
  buttons.connect.addEventListener('click',()=>void controller.connect().catch(()=>{}));
  buttons.disconnect.addEventListener('click',()=>void controller.disconnect().catch(()=>{}));
  buttons.refresh.addEventListener('click',()=>void refresh().catch(()=>{}));
  buttons.purchase.addEventListener('click',()=>void controller.purchase().catch(()=>{}));
  editor.addEventListener('input',()=>{metadata=editor.value;consent=false;matchMetadata();publish(true);});
  checkbox.addEventListener('change',()=>{consent=Boolean(matched&&checkbox.checked);publish(true);});
  publish(true);void verify().catch(()=>{});
  return controller;
}
