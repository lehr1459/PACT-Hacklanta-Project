'use client';

import {useCallback, useEffect, useRef, useState} from 'react';
import {DEVNET_GENESIS, PACT_PROGRAM_ID} from '@pact/sdk';
import {HostedBrand} from './brand';
import {browserRequest, friendlyConnectError, HostedError, isRecord} from './api';
import {phantomProvider, signExactMessage, walletAddress, type PhantomProvider} from './wallet-proof';

type Transaction = {id: string; app: {id: string; name: string}; purpose: string; expiresAt: number; issuer: string; websiteOrigin: string};
type Challenge = {challengeId: string; message: string; expiresAt: number; wallet: string};
const pageVisible = () => document.visibilityState !== 'hidden';

function canonicalWebsiteOrigin(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 2048) return false;
  try {
    const parsed = new URL(value);
    return parsed.origin === value && (parsed.protocol === 'https:' || parsed.protocol === 'http:'
      && ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname));
  } catch { return false; }
}

function parseTransaction(value: unknown, id: string): Transaction {
  if (!isRecord(value) || value.id !== id || !isRecord(value.app)
    || typeof value.app.id !== 'string' || !/^app_[a-f0-9]{32}$/.test(value.app.id)
    || typeof value.app.name !== 'string' || !value.app.name.length || value.app.name.length > 80
    || typeof value.purpose !== 'string' || !value.purpose.length || value.purpose.length > 200
    || typeof value.expiresAt !== 'number' || !Number.isSafeInteger(value.expiresAt) || value.expiresAt <= Date.now()
    || value.issuer !== window.location.origin || !canonicalWebsiteOrigin(value.websiteOrigin)) throw new HostedError('INVALID_RESPONSE');
  return value as Transaction;
}

export function HostedConnect({transactionId}: {transactionId: string | null}) {
  const [transaction, setTransaction] = useState<Transaction | null>(null);
  const [csrf, setCsrf] = useState('');
  const [wallet, setWallet] = useState('');
  const [available, setAvailable] = useState<boolean | null>(null);
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [cancelled, setCancelled] = useState(false);
  const [now, setNow] = useState(0);
  const generation = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const provider = useRef<PhantomProvider | null>(null);
  const selectedWallet = useRef('');
  const active = useRef(false);
  const messageView = useRef<HTMLTextAreaElement>(null);

  const invalidate = useCallback(() => {
    generation.current++;
    controller.current?.abort();
    controller.current = null;
    active.current = false;
    setBusy('');
    setChallenge(null);
  }, []);

  const load = useCallback(async () => {
    invalidate();
    setError(''); setNotice(''); setCancelled(false); setTransaction(null); setCsrf('');
    if (!transactionId) { setError('This link has no valid sign-in request. Return to the application and start again.'); return; }
    const own = generation.current;
    const abort = new AbortController(); controller.current = abort;
    active.current = true; setBusy('Loading sign-in request…');
    try {
      const data = await browserRequest(`/v1/connect/transactions/${transactionId}`, {signal: abort.signal});
      if (own !== generation.current) return;
      const checked = parseTransaction(data.transaction, transactionId);
      if (typeof data.csrfToken !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(data.csrfToken)) throw new HostedError('INVALID_RESPONSE');
      setTransaction(checked); setCsrf(data.csrfToken); setNow(Date.now());
    } catch (failure) { if (own === generation.current) setError(friendlyConnectError(failure)); }
    finally { if (own === generation.current) { active.current = false; setBusy(''); } }
  }, [invalidate, transactionId]);

  useEffect(() => {
    provider.current = phantomProvider(); setAvailable(Boolean(provider.current));
    const changed = () => {
      // Phantom can announce the initial key while connect() is resolving.
      if (!selectedWallet.current) return;
      invalidate(); setWallet(''); setError('');
      selectedWallet.current = '';
      setNotice('The wallet changed or disconnected. Connect again and review a new sign-in message.');
    };
    const disconnected = () => {
      invalidate(); selectedWallet.current = ''; setWallet(''); setError('');
      setNotice('The wallet disconnected. Connect again and review a new sign-in message.');
    };
    const hidden = () => {
      if (document.visibilityState === 'hidden') {
        invalidate(); setNotice('Sign-in paused while this page was hidden. Review a new message before signing.');
      }
    };
    provider.current?.on?.('accountChanged', changed); provider.current?.on?.('disconnect', disconnected);
    document.addEventListener('visibilitychange', hidden);
    void load();
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => {
      generation.current++; controller.current?.abort(); active.current = false;
      provider.current?.removeListener?.('accountChanged', changed); provider.current?.removeListener?.('disconnect', disconnected);
      document.removeEventListener('visibilitychange', hidden); window.clearInterval(timer);
    };
  }, [invalidate, load]);

  useEffect(() => { if (challenge) messageView.current?.focus(); }, [challenge]);

  const expired = transaction !== null && now >= transaction.expiresAt;
  const challengeExpired = challenge !== null && now >= challenge.expiresAt;

  async function run(label: string, work: (own: number, abort: AbortController) => Promise<void>) {
    if (active.current || cancelled || !transaction || transaction.expiresAt <= Date.now()) return;
    active.current = true; const own = generation.current;
    const abort = new AbortController(); controller.current = abort;
    setBusy(label); setError(''); setNotice('');
    try { await work(own, abort); }
    catch (failure) { if (own === generation.current) { setChallenge(null); setError(friendlyConnectError(failure)); } }
    finally { if (own === generation.current) { active.current = false; setBusy(''); } }
  }

  async function connectWallet() {
    if (active.current) return;
    provider.current = phantomProvider(); setAvailable(Boolean(provider.current));
    const phantom = provider.current;
    if (!phantom) { setError('Phantom with message signing is unavailable. Install or enable the extension, then reload this page.'); return; }
    selectedWallet.current = ''; setWallet(''); setChallenge(null);
    await run('Waiting for Phantom connection…', async own => {
      const result = await phantom.connect();
      if (own !== generation.current || !pageVisible()) return;
      const address = result.publicKey.toString();
      if (!walletAddress(address) || phantom.publicKey?.toString() !== address) throw new Error('Wallet changed');
      selectedWallet.current = address; setWallet(address); setChallenge(null); setNotice('Wallet connected. Review a sign-in message before signing.');
    });
  }

  async function prepare() {
    if (!transaction || !wallet) return;
    await run('Preparing the exact sign-in message…', async (own, abort) => {
      if (provider.current?.publicKey?.toString() !== wallet) throw new Error('Wallet changed');
      const data = await browserRequest('/v1/connect/challenge', {body: {transactionId, walletAddress: wallet}, csrf, signal: abort.signal});
      if (own !== generation.current) return;
      if (typeof data.challengeId !== 'string' || !/^buy_[a-f0-9]{32}$/.test(data.challengeId)
        || typeof data.message !== 'string' || data.message.length > 8192 || !data.message.length
        || typeof data.expiresAt !== 'number' || !Number.isSafeInteger(data.expiresAt)
        || data.expiresAt <= Date.now() || data.expiresAt > transaction.expiresAt
        || provider.current?.publicKey?.toString() !== wallet) throw new HostedError('INVALID_RESPONSE');
      const lines = data.message.split('\n');
      const issuedAt = /^Issued at: ([1-9][0-9]*)$/.exec(lines[12] ?? '');
      if (lines.length !== 16 || lines[0] !== 'PACT hosted wallet proof v1'
        || lines[1] !== `Issuer: ${transaction.issuer}` || lines[2] !== `Origin: ${transaction.issuer}`
        || lines[3] !== `Purpose: application-login: ${transaction.purpose}`
        || lines[4] !== `Application: ${transaction.app.id}` || lines[5] !== 'Environment: devnet'
        || lines[6] !== `Genesis: ${DEVNET_GENESIS}` || lines[7] !== `Program: ${PACT_PROGRAM_ID}`
        || lines[8] !== `Wallet: ${wallet}` || lines[9] !== `Challenge: ${data.challengeId}`
        || !/^Browser\/session binding: [a-f0-9]{64}$/.test(lines[10])
        || !/^Payload SHA256: [a-f0-9]{64}$/.test(lines[11])
        || !issuedAt || !Number.isSafeInteger(Number(issuedAt[1])) || Number(issuedAt[1]) > data.expiresAt
        || lines[13] !== `Expires at: ${data.expiresAt}`
        || lines[14] !== 'This proves wallet control for the stated purpose. No transaction or purchase.'
        || lines[15] !== `Login transaction: ${transaction.id}`) throw new HostedError('INVALID_RESPONSE');
      setChallenge({challengeId: data.challengeId, message: data.message, expiresAt: data.expiresAt, wallet});
    });
  }

  async function signIn() {
    if (!transaction || !challenge || !provider.current || challenge.expiresAt <= Date.now()) return;
    const exact = challenge; const phantom = provider.current;
    await run('Waiting for your message signature…', async (own, abort) => {
      const signatureBase64 = await signExactMessage(phantom, exact.message, exact.wallet);
      if (own !== generation.current || !pageVisible()) return;
      if (exact.expiresAt <= Date.now()) throw new HostedError('LOGIN_INVALID');
      setBusy('Verifying signature with PACT…');
      const data = await browserRequest('/v1/connect/verify', {body: {transactionId,
        challengeId: exact.challengeId, signatureBase64}, csrf, signal: abort.signal});
      if (own !== generation.current || !pageVisible()) return;
      if (typeof data.callbackUrl !== 'string' || data.callbackUrl.length > 4096) throw new HostedError('INVALID_RESPONSE');
      const destination = new URL(data.callbackUrl);
      if (transaction.id !== transactionId || transaction.issuer !== window.location.origin
        || destination.origin !== transaction.websiteOrigin
        || destination.username || destination.password || destination.hash
        || destination.protocol !== 'https:' && !(destination.protocol === 'http:'
          && ['localhost', '127.0.0.1', '[::1]'].includes(destination.hostname))
        || destination.searchParams.getAll('iss').length !== 1 || destination.searchParams.get('iss') !== transaction.issuer
        || destination.searchParams.getAll('code').length !== 1 || !/^pact_code_[A-Za-z0-9_-]{43}$/.test(destination.searchParams.get('code') ?? '')
        || destination.searchParams.getAll('state').length !== 1 || !/^[A-Za-z0-9_-]{43}$/.test(destination.searchParams.get('state') ?? '')
        || [...destination.searchParams.keys()].some(key => !['code', 'state', 'iss'].includes(key))
        || phantom.publicKey?.toString() !== exact.wallet || transaction.expiresAt <= Date.now()) throw new HostedError('INVALID_RESPONSE');
      setChallenge(null); setNotice('Signature verified. Returning to the requesting application; it will verify license access on its backend.');
      window.location.assign(destination.href);
    });
  }

  function cancel() {
    invalidate(); setCancelled(true); setError(''); selectedWallet.current = ''; setWallet('');
    setNotice('Sign-in abandoned on this page. Return to the requesting application. No license access was granted by this page.');
  }

  return <main className="hosted-connect">
    <header className="topbar"><HostedBrand /><span className="network"><i />Solana Devnet</span></header>
    <section className="card hosted-connect-card" aria-labelledby="connect-heading" aria-busy={Boolean(busy)}>
      <p className="eyebrow">PACT / APPLICATION WALLET SIGN-IN</p>
      <h1 id="connect-heading">Review before you sign.</h1>
      <p className="muted">Prove wallet control for this application with a message signature. This is not a payment or blockchain transaction. Your application checks license access separately on its backend.</p>
      {transaction ? <dl className="hosted-connect-details">
        <div><dt>Requesting application</dt><dd>{transaction.app.name}<small>{transaction.app.id}</small></dd></div>
        <div><dt>Requesting website</dt><dd>{transaction.websiteOrigin}</dd></div>
        <div><dt>Requested purpose</dt><dd>{transaction.purpose}</dd></div>
        <div><dt>PACT issuer</dt><dd>{transaction.issuer}</dd></div>
        <div><dt>Network</dt><dd>Solana Devnet</dd></div>
        <div><dt>Request expires</dt><dd>{new Date(transaction.expiresAt).toISOString().replace('T', ' ').replace('.000Z', ' UTC')}</dd></div>
        <div><dt>Selected wallet</dt><dd>{wallet || 'No wallet connected for this request'}</dd></div>
      </dl> : null}
      {expired ? <p className="notice error" role="alert">This sign-in request has expired. Return to the application and start again.</p> : null}
      {error ? <p className="notice error" role="alert">{error}</p> : null}
      <p className="hosted-connect-status" role="status">{busy || notice}</p>
      {transaction && !cancelled && !expired ? <>
        <div className="hosted-connect-actions">
          <button type="button" className="button dark" disabled={Boolean(busy) || available === false} onClick={() => void connectWallet()}>{wallet ? 'Reconnect Phantom' : 'Connect Phantom'}</button>
          {wallet ? <button type="button" className="button subtle" disabled={Boolean(busy)} onClick={() => void prepare()}>Review sign-in message</button> : null}
        </div>
        {available === false ? <p className="fine">Phantom with message signing was not detected. Install or enable the wallet extension, then reload this page. Mobile wallet support has not been verified.</p> : null}
        {challenge ? <section className="hosted-connect-message" aria-labelledby="message-heading">
          <h2 id="message-heading">Exact message to sign</h2>
          <p className="fine">Check the application, issuer, purpose and wallet in Phantom. Sign only if you intended this request. This is a custom private-pilot wallet proof, not a general SSO provider.</p>
          <textarea ref={messageView} aria-label="Exact sign-in message" readOnly value={challenge.message} rows={13} spellCheck={false} />
          <p className="fine">Message expires {new Date(challenge.expiresAt).toISOString().replace('T', ' ').replace('.000Z', ' UTC')}.</p>
          {challengeExpired ? <p role="alert">This message expired. Review a new message before signing.</p> : null}
          <button type="button" className="button dark" disabled={Boolean(busy) || challengeExpired} onClick={() => void signIn()}>Sign in with Phantom</button>
        </section> : null}
      </> : null}
      <div className="hosted-connect-actions hosted-connect-secondary">
        {!cancelled ? <button type="button" className="button subtle" onClick={cancel}>Cancel sign-in</button> : null}
        {!busy && !challenge && !expired ? <button type="button" className="button subtle" onClick={() => void load()}>{cancelled ? 'Review request again' : 'Reload request'}</button> : null}
        <a href="/" className="button subtle">PACT marketplace</a>
      </div>
      <p className="fine">Cancelling abandons this page; it does not revoke an existing application session. No API secret or wallet grant is stored in this browser.</p>
    </section>
  </main>;
}
