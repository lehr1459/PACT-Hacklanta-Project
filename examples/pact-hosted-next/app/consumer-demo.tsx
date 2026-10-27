'use client';
import {useEffect, useRef, useState} from 'react';

export function ConsumerDemo() {
  const [csrf, setCsrf] = useState('');
  const [wallet, setWallet] = useState('');
  const [busy, setBusy] = useState(true);
  const [feedback, setFeedback] = useState('Loading app session…');
  const [result, setResult] = useState('');
  const [purchase, setPurchase] = useState('');
  const working = useRef(false);
  const generation = useRef(0);
  async function call(path: string, method = 'GET', signal?: AbortSignal) {
    const response = await fetch(path, {method, credentials: 'same-origin', cache: 'no-store', redirect: 'error', signal,
      ...(method === 'POST' ? {headers: {'content-type': 'application/json', 'x-pact-csrf': csrf}, body: '{}'} : {})});
    const data: Record<string, unknown> = await response.json();
    if (!response.ok) {
      if (data.purchase && typeof data.purchase === 'object' && 'url' in data.purchase && typeof data.purchase.url === 'string') {
        const url = new URL(data.purchase.url);
        if (url.protocol === 'https:' || url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) setPurchase(url.href);
      }
      throw Error(data.error && typeof data.error === 'object' && 'code' in data.error && typeof data.error.code === 'string' ? data.error.code : 'APP_UNAVAILABLE');
    }
    return data;
  }
  function acceptSession(data: Record<string, unknown>) {
    if (typeof data.csrfToken !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(data.csrfToken)) throw Error('APP_UNAVAILABLE');
    setCsrf(data.csrfToken); setWallet(data.authenticated && typeof data.walletAddress === 'string' ? data.walletAddress : '');
    setFeedback(typeof data.message === 'string' ? data.message : 'Licensing is checked separately on every protected request.');
  }
  useEffect(() => {
    const own = ++generation.current, controller = new AbortController();
    fetch('/api/session', {credentials: 'same-origin', cache: 'no-store', signal: controller.signal})
      .then(async response => { if (!response.ok) throw Error(); return response.json(); })
      .then(data => { if (own === generation.current) acceptSession(data); })
      .catch(() => { if (own === generation.current) setFeedback('App session unavailable. Reload before retrying.'); })
      .finally(() => { if (own === generation.current) setBusy(false); });
    return () => { generation.current++; controller.abort(); };
  }, []);
  async function perform(work: () => Promise<void>) {
    if (working.current) return;
    const own = generation.current; working.current = true; setBusy(true); setResult(''); setPurchase(''); setFeedback('');
    try { await work(); }
    catch (error) { if (own === generation.current) setFeedback(`Access remains denied: ${error instanceof Error && /^[A-Z][A-Z0-9_]{0,79}$/.test(error.message) ? error.message : 'APP_UNAVAILABLE'}.`); }
    finally { working.current = false; if (own === generation.current) setBusy(false); }
  }
  async function login() {
    const data = await call('/api/login/start', 'POST');
    if (typeof data.loginUrl !== 'string') throw Error('APP_LOGIN_INVALID');
    const url = new URL(data.loginUrl);
    if (url.pathname !== '/connect' || url.protocol !== 'https:' && !(url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname))) throw Error('APP_LOGIN_INVALID');
    window.location.assign(url.href);
  }
  return <main><p>INDEPENDENT APPLICATION / NEXT.JS 16.4 + REACT BACKEND</p><h1>Premium workspace</h1><p>React calls this app's backend. Your API key and wallet grant stay on the server. Solana Devnet only.</p><p role="status">{wallet ? `Signed in as ${wallet}` : 'Signed out. Protected access remains denied.'}</p><div className="actions"><button disabled={busy || !csrf} onClick={() => void perform(login)}>Continue with PACT</button><button disabled={busy || !csrf} onClick={() => void perform(async () => setResult(JSON.stringify(await call('/api/protected'), null, 2)))}>Read protected content</button><button disabled={busy || !csrf} onClick={() => void perform(async () => setResult(JSON.stringify(await call('/api/action', 'POST'), null, 2)))}>Perform protected action</button><button disabled={busy || !csrf} onClick={() => void perform(async () => { const data = await call('/api/logout', 'POST'); setCsrf(''); setWallet(''); acceptSession(await call('/api/session')); setFeedback(data.grantRevocationConfirmed ? 'App session cleared and PACT grant revoked.' : 'Local session cleared. Remote grant revocation was not confirmed; the grant retains its hard expiry.'); })}>Log out of this app</button></div><p role="status">{busy ? 'Working…' : feedback}</p>{purchase ? <a href={purchase} target="_blank" rel="noreferrer">Open existing PACT checkout</a> : null}<pre tabIndex={0}>{result}</pre><p>License absence, expiry or API uncertainty denies access. Checkout requires the seller's exact metadata and human wallet approval. No wallet approval happens in this example's backend.</p><p>This example uses one bounded process-local session store. Restart denies existing sessions. It is not a distributed session service or a general SSO provider.</p></main>;
}
