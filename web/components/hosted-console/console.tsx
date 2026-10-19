'use client';

import {useCallback, useEffect, useRef, useState, type FormEvent} from 'react';
import {browserRequest, HostedError, isRecord} from './api';
import {HostedBrand} from './brand';
import {CopyText} from './copy';
import {HostedApplication} from './application';
import {clearOwnerDrafts, clearPublicDraft, readPublicDraft, writePublicDraft} from './drafts';
import {payloadDigest, validateProof, type ReviewedProof} from './proof';
import {phantomProvider, signExactMessage, walletAddress, type PhantomProvider} from './wallet-proof';
import {appPath, consoleError, dateLabel, frameworkLabels, invalid, numberValue, parseApp, parseList,
  type AdminSession, type Application, type ConsoleControl, type Framework, type SignedAction} from './types';

type Pending = {proof: ReviewedProof; wallet: string; action?: SignedAction};
type Reveal = {kind: 'secret' | 'dns'; value: string; title: string; expiresAt?: number};
const pageVisible = () => document.visibilityState !== 'hidden';
type RegistrationDraft = {name: string; description: string; framework: Framework};
const emptyDraft: RegistrationDraft = {name: '', description: '', framework: 'rest'};

export function DeveloperConsole() {
  const [session, setSession] = useState<AdminSession | null>(null);
  const [apps, setApps] = useState<Application[]>([]);
  const [selected, setSelected] = useState('');
  const [wallet, setWallet] = useState('');
  const [available, setAvailable] = useState<boolean | null>(null);
  const [busy, setBusy] = useState('');
  const [pending, setPending] = useState<Pending | null>(null);
  const [reveal, setReveal] = useState<Reveal | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [revision, setRevision] = useState(0);
  const [clock, setClock] = useState(0);
  const [registrationDraft, setRegistrationDraft] = useState<RegistrationDraft>(emptyDraft);
  const generation = useRef(0);
  const requests = useRef(new Set<AbortController>());
  const working = useRef(false);
  const csrf = useRef('');
  const sessionRef = useRef<AdminSession | null>(null);
  const selectedWallet = useRef('');
  const provider = useRef<PhantomProvider | null>(null);
  const proofHeading = useRef<HTMLHeadingElement>(null);
  const previousDraftOwner = useRef('');

  const invalidate = useCallback(() => {
    generation.current++;
    for (const controller of requests.current) controller.abort();
    requests.current.clear(); working.current = false;
    setBusy(''); setPending(null); setReveal(null);
  }, []);

  const forgetSession = useCallback(() => {
    if (sessionRef.current) clearOwnerDrafts(sessionRef.current.account.id);
    invalidate(); sessionRef.current = null; setSession(null); setApps([]); setSelected('');
  }, [invalidate]);

  const request = useCallback<ConsoleControl['request']>(async (path, options = {}) => {
    const own = generation.current;
    const controller = new AbortController(); requests.current.add(controller);
    try {
      const result = await browserRequest(path, {...options, csrf: csrf.current,
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(12000)])});
      if (own !== generation.current) throw new DOMException('Cancelled', 'AbortError');
      return result;
    } catch (failure) {
      if (own === generation.current && failure instanceof HostedError && ['AUTH_INVALID', 'AUTH_REQUIRED'].includes(failure.code)) {
        forgetSession(); setError('Your developer session expired or changed. Sign in again.');
      }
      throw failure;
    } finally { requests.current.delete(controller); }
  }, [forgetSession]);

  const reloadSession = useCallback(async () => {
    invalidate(); setLoaded(false); setError(''); setNotice('');
    // Shared cookies may now identify another account. Never display its session beside old cached app data.
    setApps([]); setSelected('');
    const own = generation.current; working.current = true; setBusy('Loading developer session…');
    try {
      const data = await request('/v1/developer/auth/session');
      if (typeof data.csrfToken !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(data.csrfToken)
        || typeof data.authenticated !== 'boolean') invalid();
      csrf.current = data.csrfToken;
      if (data.authenticated) {
        if (!isRecord(data.account) || typeof data.account.id !== 'string' || !/^dev_[a-f0-9]{32}$/.test(data.account.id)
          || !walletAddress(data.account.walletAddress) || !numberValue(data.expiresAt) || data.expiresAt <= Date.now()) invalid();
        const nextSession = {account: {id: data.account.id, walletAddress: data.account.walletAddress}, expiresAt: data.expiresAt};
        sessionRef.current = nextSession; setSession(nextSession);
        const owned = await request('/v1/developer/apps');
        if (own !== generation.current) return;
        setApps(parseList(owned.apps, parseApp));
      } else { sessionRef.current = null; setSession(null); setApps([]); setSelected(''); }
    } catch (failure) { if (own === generation.current) setError(consoleError(failure)); }
    finally { if (own === generation.current) { working.current = false; setBusy(''); setLoaded(true); } }
  }, [invalidate, request]);

  useEffect(() => {
    provider.current = phantomProvider(); setAvailable(Boolean(provider.current));
    const changed = () => {
      if (!selectedWallet.current) return;
      invalidate(); selectedWallet.current = ''; setWallet('');
      setNotice('Wallet changed. Reconnect the proven admin wallet or sign in as a different account. Pending actions and revealed values were cleared.');
    };
    const disconnected = () => {
      invalidate(); selectedWallet.current = ''; setWallet('');
      setNotice('Wallet disconnected. Pending signatures and revealed values were cleared. Your server session remains until logout or expiry.');
    };
    const hidden = () => {
      if (document.visibilityState === 'hidden') {
        invalidate(); setNotice('Sensitive views and pending operations were cleared while this page was hidden. Reload records before retrying an in-flight mutation.');
      }
    };
    provider.current?.on?.('accountChanged', changed); provider.current?.on?.('disconnect', disconnected);
    document.addEventListener('visibilitychange', hidden);
    void reloadSession();
    const timer = window.setInterval(() => {
      const now = Date.now(); setClock(now);
      if (sessionRef.current && sessionRef.current.expiresAt <= now) {
        forgetSession(); setError('Your developer session expired. Sign in again.');
      }
    }, 1000);
    return () => {
      generation.current++; for (const controller of requests.current) controller.abort(); requests.current.clear();
      provider.current?.removeListener?.('accountChanged', changed); provider.current?.removeListener?.('disconnect', disconnected);
      document.removeEventListener('visibilitychange', hidden); window.clearInterval(timer);
    };
  }, [forgetSession, invalidate, reloadSession]);

  useEffect(() => { if (pending) proofHeading.current?.focus(); }, [pending]);
  useEffect(() => {
    setRegistrationDraft(emptyDraft);
    if (previousDraftOwner.current && previousDraftOwner.current !== session?.account.id) clearOwnerDrafts(previousDraftOwner.current);
    previousDraftOwner.current = session?.account.id ?? '';
    if (!session?.account.id) return;
    const draft = readPublicDraft(session.account.id, 'new', 'registration');
    if (draft) setRegistrationDraft({...emptyDraft, ...draft} as RegistrationDraft);
  }, [session?.account.id]);

  function saveRegistrationDraft(next: RegistrationDraft) {
    setRegistrationDraft(next);
    if (!sessionRef.current) return;
    writePublicDraft(sessionRef.current.account.id, 'new', 'registration', next);
  }

  async function operate(label: string, work: (own: number) => Promise<void>) {
    if (working.current) return;
    working.current = true; const own = generation.current;
    setBusy(label); setError(''); setNotice('');
    try { await work(own); }
    catch (failure) { if (own === generation.current) { setPending(null); setError(consoleError(failure)); } }
    finally { if (own === generation.current) { working.current = false; setBusy(''); } }
  }

  async function connect() {
    if (working.current || pending) return;
    invalidate(); selectedWallet.current = ''; setWallet('');
    provider.current = phantomProvider(); setAvailable(Boolean(provider.current));
    const phantom = provider.current;
    if (!phantom) { setError('Phantom with message signing is unavailable. Enable the extension and reload. Mobile wallet support remains unverified.'); return; }
    await operate('Waiting for Phantom connection…', async own => {
      const connected = await phantom.connect();
      if (own !== generation.current || !pageVisible()) return;
      const address = connected.publicKey.toString();
      if (!walletAddress(address) || phantom.publicKey?.toString() !== address) throw new Error('Wallet changed');
      selectedWallet.current = address; setWallet(address);
      setNotice('Wallet connected. This alone does not authenticate a developer session.');
    });
  }

  async function reviewLogin() {
    if (!wallet || pending) return;
    await operate('Preparing admin sign-in message…', async own => {
      if (provider.current?.publicKey?.toString() !== wallet) throw new Error('Wallet changed');
      const data = await request('/v1/developer/auth/challenge', {body: {walletAddress: wallet}});
      const proof = validateProof(data, {wallet, purpose: 'developer-admin-login'});
      if (own === generation.current) setPending({proof, wallet});
    });
  }

  const canSign = Boolean(session && wallet && session.account.walletAddress === wallet && session.expiresAt > Date.now());
  async function review(action: SignedAction) {
    if (!canSign || pending || !sessionRef.current || action.appId !== selected) return;
    const captured = structuredClone(action);
    await operate('Preparing exact signed action…', async own => {
      if (provider.current?.publicKey?.toString() !== wallet) throw new Error('Wallet changed');
      const hash = await payloadDigest(captured.payload);
      if (own !== generation.current) return;
      const data = await request('/v1/developer/actions/challenge', {body: {
        action: captured.action, appId: captured.appId, payload: captured.payload}});
      const proof = validateProof(data, {wallet, purpose: captured.action, appId: captured.appId, payloadHash: hash});
      if (own === generation.current) setPending({proof, wallet, action: captured});
    });
  }

  async function applyProof() {
    if (!pending || !provider.current || pending.proof.expiresAt <= Date.now()) return;
    const captured = pending; const phantom = provider.current;
    await operate('Waiting for your message signature…', async own => {
      if (captured.action && (!sessionRef.current || sessionRef.current.account.walletAddress !== captured.wallet
        || sessionRef.current.expiresAt <= Date.now())) throw new HostedError('AUTH_INVALID');
      const signatureBase64 = await signExactMessage(phantom, captured.proof.message, captured.wallet);
      if (own !== generation.current || !pageVisible()) return;
      if (captured.proof.expiresAt <= Date.now()) throw new HostedError('ACTION_PROOF_INVALID');
      if (!captured.action) {
        const data = await request('/v1/developer/auth/verify', {body: {challengeId: captured.proof.challengeId, signatureBase64}});
        if (data.authenticated !== true || !isRecord(data.account) || data.account.walletAddress !== captured.wallet) invalid();
        if (own !== generation.current) return;
        setPending(null); await reloadSession(); return;
      }
      setBusy('Applying the signed action…');
      const data = await request(captured.action.path, {method: captured.action.method ?? 'POST', body: {
        payload: captured.action.payload, proof: {challengeId: captured.proof.challengeId, signatureBase64}}});
      if (own !== generation.current || !pageVisible()) return;
      setPending(null);
      if (sessionRef.current && captured.action.action === 'callback.create') clearPublicDraft(sessionRef.current.account.id, captured.action.appId, 'callback');
      if (sessionRef.current && captured.action.action === 'resource.bind') clearPublicDraft(sessionRef.current.account.id, captured.action.appId, 'resource-bind');
      if (captured.action.action === 'credential.create' || captured.action.action === 'credential.rotate') {
        if (typeof data.secret !== 'string' || !/^pact_sk_dev_key_[a-f0-9]{32}_[A-Za-z0-9_-]{43}$/.test(data.secret)) invalid();
        if (!isRecord(data.credential) || data.credential.appId !== captured.action.appId
          || typeof data.credential.id !== 'string' || !/^key_[a-f0-9]{32}$/.test(data.credential.id)
          || data.credential.prefix !== `pact_sk_dev_${data.credential.id}`
          || !data.secret.startsWith(`${data.credential.prefix}_`)) invalid();
        setReveal({kind: 'secret', title: 'Server API secret', value: data.secret});
      } else if (data.dnsToken !== undefined) {
        if (typeof data.dnsToken !== 'string' || !/^pact-domain-verification=[A-Za-z0-9_-]{43}$/.test(data.dnsToken)
          || !numberValue(data.verificationExpiresAt)) invalid();
        setReveal({kind: 'dns', title: 'DNS TXT value', value: data.dnsToken, expiresAt: data.verificationExpiresAt});
      }
      setNotice(`${captured.action.title} completed by the service. Refreshing saved records…`);
      const owned = await request('/v1/developer/apps');
      if (own !== generation.current) return;
      setApps(parseList(owned.apps, parseApp)); setRevision(value => value + 1);
      setNotice(`${captured.action.title} completed. Saved records were reloaded.`);
    });
  }

  async function logout() {
    if (sessionRef.current) clearOwnerDrafts(sessionRef.current.account.id);
    invalidate(); const own = generation.current;
    setSession(null); sessionRef.current = null; setApps([]); setSelected('');
    setError(''); setNotice(''); working.current = true; setBusy('Revoking developer session…');
    try {
      const result = await request('/v1/developer/auth/logout', {body: {}});
      if (own === generation.current) {
        if (result.authenticated !== false) invalid();
        setNotice('Developer session revoked. The connected wallet is separate from this session.');
      }
    } catch (failure) { if (own === generation.current) setError(`Local sensitive state cleared; server logout was not confirmed. ${consoleError(failure)}`); }
    finally { if (own === generation.current) { working.current = false; setBusy(''); } }
  }

  async function createApp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (pending) return;
    const form = event.currentTarget; if (!form.reportValidity()) return;
    const fields = new FormData(form);
    await operate('Creating draft application…', async own => {
      const data = await request('/v1/developer/apps', {body: {name: String(fields.get('name')).trim(),
        description: String(fields.get('description')).trim(), framework: String(fields.get('framework'))}});
      const app = parseApp(data.app);
      if (own !== generation.current) return;
      setApps(previous => [...previous, app]); setSelected(app.id); form.reset(); setRegistrationDraft(emptyDraft);
      if (sessionRef.current) clearPublicDraft(sessionRef.current.account.id, 'new', 'registration');
      setNotice('Draft application created. Register its callback, bind resources, create credentials and activate deliberately.');
    });
  }

  function navigate(appId: string) {
    invalidate(); setError(''); setNotice(''); setSelected(appId); setRevision(value => value + 1);
  }
  const app = apps.find(item => item.id === selected);
  const control: ConsoleControl = {request, review, canSign, blocked: Boolean(busy || pending), revision, draftOwner: session?.account.id ?? ''};
  return <main className="hosted-console">
    <header className="topbar"><HostedBrand /><div className="hosted-nav"><span className="network"><i />Solana Devnet</span><a href="/integrate#self-hosted" className="button subtle">Self-hosted SDK</a></div></header>
    <section className="hosted-console-hero"><p className="eyebrow">FOR BUILDERS / HOSTED API</p><h1>Connect licensing.<br />Keep your code.</h1><p>Your backend asks PACT for fresh licensing decisions and enforces protected actions. No application source upload, new contract deployment or browser API key is required.</p></section>
    <section className="card hosted-account" aria-labelledby="account-heading">
      <h2 id="account-heading">Developer account</h2>
      <dl><div><dt>Proven admin wallet</dt><dd>{session?.account.walletAddress ?? 'Not authenticated'}</dd></div><div><dt>Connected wallet</dt><dd>{wallet || 'Not connected'}</dd></div>{session ? <div><dt>Session expires</dt><dd>{dateLabel(session.expiresAt)}</dd></div> : null}</dl>
      {session && wallet && !canSign ? <p className="notice error" role="alert">The connected wallet differs from the proven admin. Reconnect the admin wallet or explicitly sign in to switch accounts.</p> : null}
      <div className="hosted-actions">
        <button type="button" className="button dark" disabled={Boolean(busy || pending) || available === false} onClick={() => void connect()}>{wallet ? 'Reconnect Phantom' : 'Connect Phantom'}</button>
        {wallet ? <button type="button" className="button subtle" disabled={Boolean(busy || pending) || !loaded} onClick={() => void reviewLogin()}>Review admin sign-in</button> : null}
        <button type="button" className="button subtle" disabled={Boolean(busy || pending)} onClick={() => void reloadSession()}>Reload developer session</button>
        {session ? <button type="button" className="button subtle" onClick={() => void logout()}>Log out developer</button> : null}
      </div>
      {available === false ? <p className="fine">Phantom with message signing is unavailable. Enable the extension, then reload. Mobile wallet support has not been verified.</p> : null}
      <p className="fine">Developer administration and buyer sign-in are separate. Signatures prove wallet control; they do not buy a license. This private-pilot protocol does not claim OAuth, OIDC or general SSO conformance.</p>
    </section>
    {error ? <p className="notice error" role="alert">{error}</p> : null}
    <p className="hosted-global-status" role="status">{busy || notice}</p>
    {pending ? <section className="card hosted-proof" aria-labelledby="proof-heading" data-testid="reviewed-proof">
      <h2 id="proof-heading" ref={proofHeading} tabIndex={-1}>{pending.action ? 'Review signed action' : 'Review admin sign-in message'}</h2>
      <p>{pending.action?.title ?? 'Authenticate this wallet as a PACT developer administrator.'}</p>
      {pending.action?.warning ? <p className="notice">{pending.action.warning}</p> : null}
      {pending.action ? <CopyText label="Exact action payload" value={JSON.stringify(pending.action.payload, null, 2)} /> : null}
      <label>Exact wallet message<textarea readOnly aria-label="Exact wallet message" value={pending.proof.message} rows={12} spellCheck={false} /></label>
      <p className="fine">Expires {dateLabel(pending.proof.expiresAt)}. Check the wallet, application, purpose and payload before signing.</p>
      {clock >= pending.proof.expiresAt ? <p role="alert">This proof expired. Cancel and review a new action.</p> : null}
      <div className="hosted-actions"><button className="button dark" type="button" disabled={Boolean(busy) || clock >= pending.proof.expiresAt} onClick={() => void applyProof()}>{pending.action ? 'Sign and apply action' : 'Sign reviewed message'}</button><button type="button" className="button subtle" onClick={() => { invalidate(); setNotice('Review cancelled locally. Reload records before retrying an in-flight mutation.'); }}>Cancel review</button></div>
    </section> : null}
    {reveal ? <section className="card hosted-once" data-testid={reveal.kind === 'secret' ? 'one-time-secret' : 'one-time-dns'} aria-labelledby="once-heading">
      <h2 id="once-heading">{reveal.kind === 'secret' ? 'Save this secret once.' : 'Save this DNS proof once.'}</h2>
      <p>{reveal.kind === 'secret' ? 'Store this API secret in your backend secret manager or private server environment. Never put it in React, NEXT_PUBLIC variables, URLs or AI prompts. It cannot be shown again after dismissal.' : 'Create the TXT record shown in Callbacks using this exact value. This value cannot be redisplayed; renewing the proof invalidates the previous token.'}</p>
      {reveal.expiresAt ? <p>Proof expires {dateLabel(reveal.expiresAt)}.</p> : null}
      <CopyText label={reveal.title} value={reveal.value} secret />
      <button type="button" className="button dark" onClick={() => setReveal(null)}>{reveal.kind === 'secret' ? 'Dismiss secret' : 'Dismiss DNS proof'}</button>
      <p className="fine">This view clears when hidden, on navigation, wallet change, logout or session expiry. Clipboard contents remain under your control.</p>
    </section> : null}
    {session ? <div className="hosted-workspace">
      <aside className="hosted-app-list card"><h2>My applications</h2>
        {apps.length ? <ul>{apps.map(item => <li key={item.id}><button type="button" disabled={Boolean(busy || pending)} aria-current={selected === item.id ? 'page' : undefined} onClick={() => navigate(item.id)}><b>{item.name}</b><span>{item.status} · Devnet</span></button></li>)}</ul> : <p className="muted">No applications yet. Create your first draft.</p>}
        <form onSubmit={event => void createApp(event)} className="form"><h3>Register application</h3><label>Application name<input name="name" required maxLength={80} value={registrationDraft.name} onChange={event => saveRegistrationDraft({...registrationDraft, name: event.target.value})} /></label><label>Description (optional)<textarea name="description" maxLength={500} rows={3} value={registrationDraft.description} onChange={event => saveRegistrationDraft({...registrationDraft, description: event.target.value})} /></label><label>Application framework<select name="framework" value={registrationDraft.framework} onChange={event => saveRegistrationDraft({...registrationDraft, framework: event.target.value as Framework})}>{Object.entries(frameworkLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><p className="fine">Public registration fields are autosaved in this tab when browser storage is available. Never enter credentials here. Created application drafts are persisted by the service.</p><button type="submit" className="button dark" disabled={control.blocked}>Create draft application</button></form>
        <button type="button" className="button subtle" disabled={control.blocked} onClick={() => {
          setRegistrationDraft(emptyDraft);
          if (sessionRef.current) clearPublicDraft(sessionRef.current.account.id, 'new', 'registration');
        }}>Clear registration draft</button>
      </aside>
      {app ? <HostedApplication key={app.id} app={app} control={control} navigate={() => { invalidate(); setError(''); setNotice(''); }} /> : <section className="card"><h2>Choose an application.</h2><p>Open an existing application or register a draft. Configuration is saved by the service, and every sensitive change requires a reviewed admin signature.</p></section>}
    </div> : loaded ? <section className="card"><h2>Start with your admin wallet.</h2><p>Connect Phantom, review the admin sign-in message, then sign it. The wallet that controls your licensing offer must match this administrator.</p></section> : null}
    <footer className="hosted-footer"><a href="/">Marketplace</a><a href="/integrate#self-hosted">Customer-hosted SDK alternative</a><p>Solana Devnet pilot · Your backend enforces access · No source upload</p></footer>
  </main>;
}
