'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useConnect, useConnection, useDisconnect, useSwitchChain, useWalletClient } from 'wagmi';
import { baseSepolia } from 'viem/chains';
import { decodeEventLog, formatEther, isAddress, keccak256, parseEther, toBytes, type Address, type Hash } from 'viem';
import { assertContract, errorText, pactAbi, pactAddress, publicClient, readOffer, shortAddress } from '../../lib/chain';
import { useLicenseSnapshot } from '../../lib/use-license';
import { formatExpiry, METADATA_MAX_BYTES, metadataBytesWithinLimit, metadataMatchesOffer, parseLicenseMetadata, validOfferId } from '../../lib/license';

type Section = 'Buy a license' | 'Seller studio' | 'Verify access';
const sections: Section[] = ['Buy a license', 'Seller studio', 'Verify access'];
const validId = validOfferId;

export default function Home() {
  const [section, setSection] = useState<Section>('Buy a license');
  const [offerId, setOfferId] = useState('0');
  const [holder, setHolder] = useState('');
  const [lookup, setLookup] = useState<{id: string; address: Address} | null>(null);
  const [title, setTitle] = useState('Studio toolkit');
  const [terms, setTerms] = useState('Personal use of the demo toolkit. One wallet. No redistribution. This entitlement does not transfer copyright.');
  const [price, setPrice] = useState('0.001');
  const [duration, setDuration] = useState('3600');
  const [approved, setApproved] = useState(false);
  const [buyerMetadata, setBuyerMetadata] = useState('');
  const [buyerApproved, setBuyerApproved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [failure, setFailure] = useState('');
  const [txHash, setTxHash] = useState<Hash>();
  const [transactionActor, setTransactionActor] = useState<Address>();
  const {address, chainId, isConnected} = useConnection();
  const {connectAsync, connectors, error: connectError} = useConnect();
  const {disconnect} = useDisconnect();
  const {switchChainAsync} = useSwitchChain();
  const {data: wallet} = useWalletClient();
  const queries = useQueryClient();
  const currentIdentity = useRef({address, chainId, offerId});
  useEffect(() => {currentIdentity.current = {address, chainId, offerId};}, [address, chainId, offerId]);
  const correctChain = chainId === baseSepolia.id;
  const canWrite = Boolean(pactAddress && isConnected && correctChain && wallet && !busy);
  const metadata = JSON.stringify({schema: 'pact-license-v1', title: title.trim(), terms: terms.trim(), priceWei: safePrice(price)?.toString() ?? '', durationSeconds: duration});
  const termsHash = keccak256(toBytes(metadata));

  const offer = useQuery({queryKey: ['offer', pactAddress, offerId], enabled: Boolean(pactAddress && validId(offerId)), queryFn: () => readOffer(BigInt(offerId)), refetchInterval: 10000});
  const buyerTerms = parseLicenseMetadata(buyerMetadata);
  const metadataMatches = metadataMatchesOffer(buyerMetadata, offer.isError ? undefined : offer.data);
  const balance = useQuery({queryKey: ['balance', pactAddress, address], enabled: Boolean(pactAddress && address), queryFn: async () => publicClient.readContract({address: await assertContract(), abi: pactAbi, functionName: 'pendingWithdrawals', args: [address!]}) as Promise<bigint>});
  const personalLicense = useLicenseSnapshot(offerId, address, correctChain && isConnected);
  const verification = useLicenseSnapshot(lookup?.id ?? '', lookup?.address, Boolean(lookup));
  const gateOpen = personalLicense.valid;

  async function transact(functionName: string, args: readonly unknown[] = [], value?: bigint) {
    setFailure(''); setMessage(''); setTxHash(undefined);
    if (!wallet || !address || !correctChain) {setFailure('Connect a wallet on Base Sepolia before continuing.'); return;}
    const actor = address;
    const initiatingOfferId = offerId;
    setTransactionActor(actor); setBusy(true);
    let submittedHash: Hash | undefined;
    let receiptResolved = false;
    const stillSameWallet = () => currentIdentity.current.address?.toLowerCase() === actor.toLowerCase() && currentIdentity.current.chainId === baseSepolia.id;
    try {
      const contract = await assertContract();
      setMessage(`Preparing ${functionName} for ${shortAddress(actor)} on Base Sepolia.`);
      const simulation = await publicClient.simulateContract({address: contract, abi: pactAbi, functionName, args, account: actor, value});
      const [liveChain, accounts] = await Promise.all([wallet.getChainId(), wallet.getAddresses()]);
      if (!stillSameWallet() || liveChain !== baseSepolia.id || !accounts.some(account => account.toLowerCase() === actor.toLowerCase())) throw new Error('Wallet or network changed before signing. Start the action again for the intended wallet.');
      if (functionName === 'buyLicense' && currentIdentity.current.offerId !== initiatingOfferId) throw new Error('Selected offer changed before signing. Review the intended offer again.');
      setMessage(`Confirm ${functionName} for ${shortAddress(actor)} in your wallet.`);
      const hash = await wallet.writeContract(simulation.request);
      submittedHash = hash; setTxHash(hash); setMessage(`Submitted for ${shortAddress(actor)} on Base Sepolia. Waiting up to 120 seconds for the receipt…`);
      const receipt = await publicClient.waitForTransactionReceipt({hash, timeout: 120000, retryCount: 0});
      receiptResolved = true;
      if (receipt.status !== 'success') throw new Error('Transaction reverted. No successful action was recorded.');
      const receiptActorMatches = receipt.from.toLowerCase() === actor.toLowerCase();
      let confirmedMessage = `Confirmed on Base Sepolia for ${shortAddress(receipt.from)}. Chain data refreshed.`;
      if (functionName === 'createOffer') {
        for (const log of receipt.logs) {
          if (log.address.toLowerCase() !== contract.toLowerCase()) continue;
          try {
            const decoded = decodeEventLog({abi: pactAbi, data: log.data, topics: log.topics});
            if (decoded.eventName === 'OfferCreated') {
              const createdId = (decoded.args as unknown as {offerId: bigint}).offerId.toString();
              if (stillSameWallet() && receiptActorMatches && currentIdentity.current.offerId === initiatingOfferId) {setOfferId(createdId); setBuyerApproved(false); setLookup(null);}
              confirmedMessage = `Offer #${createdId} confirmed on Base Sepolia for ${shortAddress(receipt.from)}.`; break;
            }
          } catch { /* Other receipt events are not offer creation. */ }
        }
      }
      if (!stillSameWallet() || !receiptActorMatches) confirmedMessage += ' Your connected wallet changed; the receipt belongs to the displayed sender.';
      setMessage(confirmedMessage);
      await queries.invalidateQueries();
    } catch (error) {setFailure(submittedHash && !receiptResolved ? 'Confirmation unknown. The transaction may still confirm. Inspect the explorer link; no automatic retry will occur.' : errorText(error)); setMessage('');} finally {setBusy(false);}
  }
  function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const wei = safePrice(price);
    if (!metadataBytesWithinLimit(metadata)) {setFailure('Metadata exceeds the shared 64 KiB UTF-8 limit. Shorten the terms before creating an offer.'); return;}
    if (!approved || !title.trim() || !terms.trim() || !wei || !/^\d+$/.test(duration) || BigInt(duration) < 1n || BigInt(duration) > 18446744073709551615n) {setFailure('Approve complete terms, a positive ETH price, and a duration from 1 to 18446744073709551615 seconds.'); return;}
    void transact('createOffer', [wei, BigInt(duration), termsHash]);
  }
  function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setFailure('');
    if (!validId(offerId) || !isAddress(holder)) {setFailure('Enter an existing offer ID and a valid wallet address.'); return;}
    setLookup({id: offerId, address: holder});
  }
  const expiry = personalLicense.snapshot?.expiry;

  return <main>
    <header className="topbar"><a className="brand" href="/" aria-label="PACT home"><span className="brand-mark">P</span>PACT<span className="brand-sub">License protocol</span></a><div className="wallet-tools"><span className="network"><i/>Base Sepolia · 84532</span>{isConnected ? <button className="button subtle" onClick={() => disconnect()}>{shortAddress(address!)} · Disconnect</button> : <button className="button dark" disabled={busy || !connectors.length} onClick={() => {setFailure(''); const connector = connectors[0]; if (connector) void connectAsync({connector}).catch(e => setFailure(errorText(e)));}}>Connect wallet ↗</button>}</div></header>
    <section className="hero"><div><p className="eyebrow">DIGITAL LICENSING / TESTNET DEMO</p><h1>Clear terms.<br/><span>Verifiable access.</span></h1><p className="hero-copy">Create a license offer, purchase a time-limited entitlement, and let your app verify access directly on chain.</p></div><aside className="hero-note"><span className="small-label">THE PACT FLOW</span><div><b>01</b> Define immutable terms</div><div><b>02</b> Purchase with test ETH</div><div><b>03</b> Verify wallet entitlement</div><p>Nontransferable access. No copyright transfer.</p></aside></section>
    {!pactAddress ? <div className="notice setup"><b>Local build ready · contract setup pending</b><p>No Base Sepolia contract address is configured. Add the approved deployment address to <code>NEXT_PUBLIC_PACT_CONTRACT_ADDRESS</code> and restart. Purchases and verification become available after deployment.</p></div> : <div className="contract-line">CONTRACT <a href={`https://sepolia.basescan.org/address/${pactAddress}`} target="_blank" rel="noreferrer">{shortAddress(pactAddress)} ↗</a><span>Base Sepolia test ETH only</span></div>}
    {isConnected && !correctChain ? <div className="notice"><b>Switch networks to continue</b><p>Your wallet is on chain {chainId}. PACT writes require Base Sepolia.</p><button className="button dark" onClick={() => void switchChainAsync({chainId: baseSepolia.id}).catch(e => setFailure(errorText(e)))}>Switch to Base Sepolia</button></div> : null}
    <nav className="tabs" aria-label="License tools">{sections.map(item => <button key={item} aria-current={section === item ? 'page' : undefined} className={section === item ? 'selected' : ''} onClick={() => setSection(item)}>{item}<span>↗</span></button>)}</nav>
    <div role="status" aria-live="polite">{message ? <p className="notice success">{message}</p> : null}{txHash ? <p className="transaction">Transaction {transactionActor ? 'for ' + shortAddress(transactionActor) + ' ' : ''}<a href={`https://sepolia.basescan.org/tx/${txHash}`} target="_blank" rel="noreferrer">{shortAddress(txHash)} ↗</a></p> : null}</div>
    {failure || connectError ? <p className="notice error" role="alert">{failure || errorText(connectError)}</p> : null}
    {!isConnected && !connectors.length ? <p className="muted">Install an injected browser wallet to connect. Public verification works without connecting a wallet once a contract is configured.</p> : null}
    <section className="workspace">
      <article className="card main-card">
        <div className="card-heading"><span className="eyebrow">{section === 'Seller studio' ? 'FOR CREATORS' : section === 'Verify access' ? 'PUBLIC VERIFICATION' : 'FOR LICENSE HOLDERS'}</span><span className="pill">TESTNET</span></div>
        <h2>{section === 'Seller studio' ? 'Publish your license.' : section === 'Verify access' ? 'Check an entitlement.' : 'Your next tool, licensed.'}</h2>
        <p className="muted">{section === 'Seller studio' ? 'Approve your off-chain terms. Only their hash, price, and duration are recorded on chain.' : section === 'Verify access' ? 'Anyone can query a wallet. A valid entitlement grants access until the chain-recorded expiry.' : 'Enter an offer ID to read its immutable price, duration, and terms hash, then purchase with the exact test ETH price.'}</p>
        {section === 'Seller studio' ? <form onSubmit={create} className="form">
          <label>License title<input value={title} maxLength={160} onChange={e => {setTitle(e.target.value); setApproved(false);}} required/></label>
          <label>Terms preview<textarea value={terms} rows={4} maxLength={10000} onChange={e => {setTerms(e.target.value); setApproved(false);}} required/></label>
          <div className="field-row"><label>Price in test ETH<input value={price} inputMode="decimal" onChange={e => {setPrice(e.target.value); setApproved(false);}} required/></label><label>Duration in seconds<input value={duration} inputMode="numeric" onChange={e => {setDuration(e.target.value); setApproved(false);}} required/></label></div>
          <details className="hash-preview"><summary>Review deterministic terms hash</summary><code>{termsHash}</code><pre>{metadata}</pre><button type="button" className="button subtle" onClick={() => {const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([metadata], {type: 'application/json'})); link.download = 'pact-terms.json'; link.click(); URL.revokeObjectURL(link.href);}}>Download metadata preview</button></details>
          <label className="check"><input type="checkbox" checked={approved} onChange={e => setApproved(e.target.checked)}/>I have reviewed and approve these terms, price, and duration.</label>
          <button className="button dark wide" disabled={!canWrite || !approved || !metadataBytesWithinLimit(metadata)}>Create offer ↗</button>
        </form> : section === 'Verify access' ? <form className="form" onSubmit={verify}><label>Offer ID<input value={offerId} inputMode="numeric" onChange={e => {setOfferId(e.target.value); setBuyerApproved(false); setLookup(null);}} required/></label><label>Wallet address<input placeholder="0x…" value={holder} onChange={e => {setHolder(e.target.value); setLookup(null);}} required/></label><button className="button dark wide" disabled={!pactAddress}>Verify on chain ↗</button><div className="field-feedback-slot query-feedback-slot">{verification.isFetching ? <p className="muted">Reading Base Sepolia…</p> : null}{verification.error ? <p className="notice error" role="alert">{errorText(verification.error)}</p> : null}{!(verification.fresh && verification.snapshot) && lookup && !verification.isFetching && !verification.error ? <p className="muted">Verification paused or stale. A fresh chain snapshot is required.</p> : null}</div>{verification.fresh && verification.snapshot ? <div data-testid="verification-result" className={verification.valid ? 'verification-result valid' : 'verification-result'}><b>{verification.valid ? 'Entitlement valid' : 'No active entitlement'}</b><p>Offer #{verification.snapshot.offerId} · Wallet {verification.snapshot.holder}</p><p>{verification.snapshot.expiry > 0n ? 'Chain expiry: ' + formatExpiry(verification.snapshot.expiry) : 'No license has been purchased for this wallet and offer.'}</p><small>Verified at block {verification.snapshot.blockNumber.toString()}. Same-block checks every 4 seconds.</small></div> : null}</form> : <div className="form">
          <div className="input-feedback-field"><label>Offer ID<input value={offerId} inputMode="numeric" onChange={e => {setOfferId(e.target.value); setBuyerApproved(false); setLookup(null);}}/></label><div className="field-feedback-slot">
          {!validId(offerId) ? <p className="notice error field-validation">Enter a nonnegative integer offer ID.</p> : null}
          {offer.isFetching ? <p className="muted">Reading offer from Base Sepolia…</p> : null}{offer.error ? <p className="notice error" role="alert">{errorText(offer.error)}</p> : null}</div></div>
          {offer.data && !offer.isError ? <><div className="offer-summary"><div><span>LICENSE PRICE</span><strong>{formatEther(offer.data.price)} <small>test ETH</small></strong></div><span className="pill">{offer.data.active ? 'AVAILABLE' : 'DEACTIVATED'}</span></div><dl><div><dt>Seller</dt><dd>{shortAddress(offer.data.seller)}</dd></div><div><dt>Duration</dt><dd>{offer.data.duration.toString()} seconds</dd></div><div><dt>Terms hash</dt><dd className="break-text">{offer.data.termsHash}</dd></div></dl><div className="input-feedback-field metadata-feedback-field"><label>Seller metadata JSON<textarea rows={5} placeholder="Paste the exact downloaded pact-terms.json contents" value={buyerMetadata} maxLength={METADATA_MAX_BYTES} onChange={e => {setBuyerMetadata(e.target.value); setBuyerApproved(false);}}/></label><p className="muted">The exact UTF-8 bytes are hashed; preserve whitespace. Maximum 64 KiB for seller and buyer metadata. Only the hash is stored on chain.</p>{buyerTerms ? <div className="verification-result"><b>{buyerTerms.title}</b><p>{buyerTerms.terms}</p></div> : null}<div className="field-feedback-slot">{buyerMetadata ? <p className={metadataMatches ? "notice success" : "notice error field-validation"}>{metadataMatches ? "Terms hash, price, and duration match this offer." : "Metadata is invalid or does not match this offer. Purchase is disabled."}</p> : null}</div></div><label className="check"><input type="checkbox" checked={buyerApproved} disabled={!metadataMatches} onChange={e => setBuyerApproved(e.target.checked)}/>I reviewed and approve these matching license terms.</label><button className="button dark wide" disabled={!canWrite || !metadataMatches || !buyerApproved || !offer.data.active || !personalLicense.fresh || personalLicense.valid} onClick={() => void transact('buyLicense', [offer.data!.id], offer.data!.price)}>Purchase license ↗</button></> : <div className="empty"><span>◇</span><b>Your offer will appear here</b><p>{pactAddress ? 'Select an existing offer to view its price and duration.' : 'Connect the deployed contract to load live offers.'}</p></div>}
          {personalLicense.snapshot ? <p className="muted">{personalLicense.valid ? 'Your license expires ' + formatExpiry(expiry!) + '.' : 'Your wallet has no active license for this offer.'} Verified at block {personalLicense.snapshot.blockNumber.toString()}.</p> : null}
        </div>}
      </article>
      <aside className="side-stack">
        {section === 'Seller studio' ? <article className="card"><p className="eyebrow">SELLER CONTROLS</p><h3>Manage proceeds.</h3><p className="muted">Purchases credit your withdrawable balance atomically. Funds reach your wallet through a separate withdrawal.</p><div className="balance">{balance.data !== undefined && !balance.isError ? formatEther(balance.data) : '—'} <small>test ETH</small></div>{balance.error ? <p className="notice error">{errorText(balance.error)}</p> : null}<button className="button dark wide" disabled={!canWrite || !balance.data || balance.isError} onClick={() => void transact('withdrawProceeds')}>Withdraw proceeds ↗</button><label className="management-label">Offer ID<input value={offerId} inputMode="numeric" onChange={e => {setOfferId(e.target.value); setBuyerApproved(false); setLookup(null);}}/></label><button className="button subtle wide" disabled={!canWrite || !validId(offerId)} onClick={() => void transact('deactivateOffer', [BigInt(offerId)])}>Deactivate future sales</button><p className="fine">Only the offer’s seller can deactivate it. Existing entitlements stay valid.</p></article> : <article className="card gate" data-testid="license-gate" data-state={gateOpen ? 'open' : 'closed'}><div className="gate-symbol">{gateOpen ? '↗' : '⌁'}</div><p className="eyebrow">CHAIN-VERIFIED DEMO</p><h3>{gateOpen ? 'Welcome to the studio.' : 'The studio awaits.'}</h3><p className="muted">This sample feature checks the connected wallet’s license for offer #{validId(offerId) ? offerId : '—'} directly on Base Sepolia.</p>{gateOpen ? <div className="unlocked"><b>Access granted</b><p>Try your licensed creative toolkit.</p><button className="button dark wide" onClick={() => {const blob = new Blob(['PACT studio sample: licensed demo content.'], {type: 'text/plain'}); const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = 'pact-studio-sample.txt'; link.click(); URL.revokeObjectURL(link.href);}}>Download sample ↗</button></div> : <div className="locked"><span>●</span> {personalLicense.isError ? 'Chain check failed · access closed' : !personalLicense.active ? 'Checks paused · access closed' : personalLicense.isFetching ? 'Checking chain…' : !personalLicense.fresh && address ? 'Fresh chain snapshot required' : 'License required'}</div>}<p className="fine">Client-side demo gating. Copied content cannot be remotely disabled. Access closes after 8 seconds without a fresh snapshot, 12 seconds without chain progress, on hidden/offline checks, or on expiry.</p></article>}
        <article className="card compact"><p className="eyebrow">BUILT FOR CLARITY</p><div className="principle"><span>✓</span><div><b>Immutable offer terms</b><p>Fixed price, duration, and agreement hash.</p></div></div><div className="principle"><span>✓</span><div><b>Portable verification</b><p>Read entitlement by offer and wallet.</p></div></div><div className="principle"><span>✓</span><div><b>Time-limited access</b><p>Nontransferable. Valid until expiry.</p></div></div></article>
      </aside>
    </section>
    <footer><span className="brand">PACT</span><p>Hacklanta MVP · Base Sepolia only · Test ETH has no monetary value.</p><p>Entitlements do not prove ownership, authenticity, or legal enforceability.</p></footer>
  </main>;
}
function safePrice(value: string) {if (!/^\d+(\.\d{1,18})?$/.test(value)) return undefined; try {const wei = parseEther(value); return wei > 0n && wei < 2n ** 256n ? wei : undefined;} catch {return undefined;}}
