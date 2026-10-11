'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  generateIntegration,
  INTEGRATION_PROGRAM_ID,
  INTEGRATION_RPC_URL,
  KNOWN_DEMO_OFFER,
  validateIntegrationInput,
  validateOfferOnDevnet,
  type GeneratedIntegration,
} from '../lib/integration/generator';

type FieldErrors = Partial<Record<'appName' | 'framework' | 'offer', string>>;
type Preview = 'locked' | 'valid' | 'expired';

function CopyBlock({ title, value, filename }: { title: string; value: string; filename?: string }) {
  const [message, setMessage] = useState('');
  const text = useRef<HTMLTextAreaElement>(null);
  useEffect(() => setMessage(''), [value]);
  async function copy() {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(value);
      setMessage(`${title} copied.`);
    } catch {
      text.current?.focus();
      text.current?.select();
      setMessage('Clipboard unavailable. The text is selected; copy it manually.');
    }
  }
  return <section className="integration-code-block">
    <div className="integration-block-heading"><div><h3>{title}</h3>{filename ? <span>{filename}</span> : null}</div><button type="button" className="button subtle" onClick={() => void copy()}>Copy {title.toLowerCase()}</button></div>
    {title === 'Install command' ? <p className="muted">Prerequisite: from <code>C:/Hackathon/PACT</code>, run <code>npm --prefix packages/pact-sdk ci</code>, then <code>npm --prefix packages/pact-sdk run build</code>. Run the command below from your target app directory, where React and its TypeScript types are already installed. For another machine, build and run <code>npm pack</code> in the SDK folder, copy the resulting tarball, and install its actual local path. The SDK is unpublished.</p> : null}
    <textarea ref={text} readOnly value={value} aria-label={title} spellCheck={false} rows={Math.min(14, Math.max(3, value.split('\n').length))} />
    {message ? <p className="fine" role="status">{message}</p> : null}
  </section>;
}

export function IntegrationWizard() {
  const [appName, setAppName] = useState('');
  const [framework, setFramework] = useState('nextjs');
  const [offer, setOffer] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState('');
  const [generated, setGenerated] = useState<GeneratedIntegration | null>(null);
  const [checkedSlot, setCheckedSlot] = useState<number | null>(null);
  const [preview, setPreview] = useState<Preview>('locked');
  const request = useRef(0);
  const busyRef = useRef(false);

  function invalidate() {
    request.current++;
    busyRef.current = false;
    setBusy(false);
    setGenerated(null);
    setCheckedSlot(null);
    setErrors({});
    setFailure('');
  }
  useEffect(() => {
    const incoming = new URLSearchParams(window.location.search).get('offer');
    if (incoming) setOffer(incoming.slice(0, 64));
    return () => { request.current++; };
  }, []);

  async function prepare(event: FormEvent) {
    event.preventDefault();
    if (busyRef.current) return;
    const validation = validateIntegrationInput({ appName, framework, offer });
    setErrors(validation.ok ? {} : validation.errors);
    setFailure('');
    setGenerated(null);
    setCheckedSlot(null);
    if (!validation.ok) return;
    const captured = validation.value;
    const scope = ++request.current;
    busyRef.current = true;
    setBusy(true);
    try {
      const snapshot = await validateOfferOnDevnet(captured.offer);
      if (scope !== request.current) return;
      const result = generateIntegration(captured);
      setCheckedSlot(snapshot.contextSlot);
      setGenerated(result);
    } catch {
      if (scope === request.current) setFailure('Could not validate this offer on Solana Devnet. Check the offer address and RPC availability, then try again. No wallet or transaction is required.');
    } finally {
      if (scope === request.current) { busyRef.current = false; setBusy(false); }
    }
  }

  const sellerHref = `/?section=seller${offer ? `&offer=${encodeURIComponent(offer)}` : ''}`;
  return <main className="integration-wizard">
    <header className="topbar"><a className="brand" href="/" aria-label="PACT home"><span className="brand-mark">P</span>PACT<span className="brand-sub">License protocol</span></a><div className="integration-nav"><span className="network"><i />Solana Devnet</span><a href="/" className="button subtle">Back to marketplace ↗</a></div></header>
    <section className="integration-hero"><div><p className="eyebrow">FOR BUILDERS / INTEGRATION WORKSPACE</p><h1>Your app.<br /><span>Verifiable access.</span></h1><p className="hero-copy">Connect an existing PACT offer to your Next.js or React app. Get a configuration, a starting component, and an AI coding prompt you can review.</p></div><aside className="integration-hero-note"><span className="integration-icon" aria-hidden="true">↗</span><h2>A small setup.<br />A clear boundary.</h2><p>No registration or database. No wallet connection. Your app still needs to implement and test the integration.</p></aside></section>
    <ol className="integration-steps" aria-label="Integration steps"><li><b>01</b><span>Describe your app</span></li><li><b>02</b><span>Validate your offer</span></li><li className={generated ? 'is-ready' : ''}><b>03</b><span>Copy and implement</span></li></ol>
    <div className="integration-layout"><section className="card integration-form-card"><div className="card-heading"><span className="eyebrow">YOUR INTEGRATION</span><span className="pill">DEVNET ONLY</span></div><h2>Start with an offer.</h2><p className="muted">These public settings produce local instructions. They do not register your app or change anything on chain.</p>
      <form className="form" onSubmit={event => void prepare(event)} noValidate>
        <label>Application name<input value={appName} maxLength={80} placeholder="Your studio or app" aria-invalid={Boolean(errors.appName)} aria-describedby={errors.appName ? 'integration-name-error' : undefined} onChange={event => { invalidate(); setAppName(event.target.value); }} />{errors.appName ? <span id="integration-name-error" className="integration-field-error">{errors.appName}</span> : null}</label>
        <label>Framework<select value={framework} aria-invalid={Boolean(errors.framework)} aria-describedby={errors.framework ? 'integration-framework-error' : undefined} onChange={event => { invalidate(); setFramework(event.target.value); }}><option value="nextjs">Next.js App Router</option><option value="react">React (TypeScript)</option></select>{errors.framework ? <span id="integration-framework-error" className="integration-field-error">{errors.framework}</span> : null}</label>
        <label>Existing offer address<input value={offer} maxLength={64} placeholder="Solana offer PDA" spellCheck={false} autoComplete="off" aria-invalid={Boolean(errors.offer)} aria-describedby={`integration-offer-help${errors.offer ? ' integration-offer-error' : ''}`} onChange={event => { invalidate(); setOffer(event.target.value); }} />{errors.offer ? <span id="integration-offer-error" className="integration-field-error">{errors.offer}</span> : null}</label>
        <p id="integration-offer-help" className="integration-helper">Use the offer your buyers will license. Offer validation reads Devnet through the SDK; it does not prove a buyer has access.</p>
        <div className="integration-offer-actions"><button type="button" className="button subtle" onClick={() => { invalidate(); setOffer(KNOWN_DEMO_OFFER); }}>Use known demo offer</button><a href={sellerHref}>Create offer in Seller studio ↗</a></div>
        <button className="button dark wide" disabled={busy}>{busy ? 'Validating offer on Devnet…' : 'Validate offer and generate integration ↗'}</button>
        {failure ? <p className="notice error" role="alert">{failure}</p> : null}
        {checkedSlot !== null ? <p className="notice success" role="status">Offer structure validated at Devnet context slot {checkedSlot}. This is not buyer entitlement verification.</p> : null}
      </form>
    </section><aside className="integration-side-stack"><section className="card integration-preview" data-testid="integration-preview" data-state={preview}><div className="card-heading"><span className="eyebrow">SYNTHETIC UI PREVIEW</span><span className="pill">NOT CHAIN DATA</span></div><div className="integration-preview-tabs" role="group" aria-label="Synthetic entitlement state">{(['locked', 'valid', 'expired'] as const).map(state => <button type="button" key={state} aria-pressed={preview === state} onClick={() => setPreview(state)}>{state === 'valid' ? 'Valid' : state === 'expired' ? 'Expired' : 'Locked'}</button>)}</div><div className={`integration-preview-panel preview-${preview}`}><span aria-hidden="true">{preview === 'valid' ? '↗' : '⌁'}</span><h3>{preview === 'valid' ? 'Your workspace is open.' : preview === 'expired' ? 'Your license has expired.' : 'Your workspace awaits.'}</h3><p>{preview === 'valid' ? 'Example appearance for a fresh, active entitlement.' : preview === 'expired' ? 'Example appearance when access expires.' : 'Example appearance without verified access.'}</p><b>{preview === 'valid' ? 'Sample premium workspace' : 'Premium controls locked'}</b></div><p className="fine">Preview controls never verify a wallet or unlock real protected content. Your app must use fresh SDK results.</p></section><section className="card integration-network"><p className="eyebrow">FIXED PUBLIC NETWORK SETTINGS</p><dl><div><dt>Network</dt><dd>Solana Devnet</dd></div><div><dt>Program ID</dt><dd>{INTEGRATION_PROGRAM_ID}</dd></div><div><dt>RPC</dt><dd>{INTEGRATION_RPC_URL}</dd></div></dl></section></aside></div>
    {generated ? <section className="integration-output" aria-labelledby="integration-output-title" data-testid="integration-output"><div className="integration-output-heading"><div><p className="eyebrow">READY TO IMPLEMENT / NOT AUTOMATICALLY PROTECTED</p><h2 id="integration-output-title">Bring PACT into {appName.trim()}.</h2></div><span className="pill">{framework === 'nextjs' ? 'NEXT.JS' : 'REACT'}</span></div><p className="muted">The SDK is local and unpublished. Use the local-path install command or build and copy its tarball; do not assume a public npm package exists. Review the configuration and component before adding them to your app. This wizard does not publish or install anything.</p><div className="integration-public-offer"><span>SELECTED OFFER</span><code>{offer.trim()}</code></div><CopyBlock title="Install command" value={generated.installCommand} /><CopyBlock title="Configuration" value={generated.configuration} /><CopyBlock title="Integration snippet" value={generated.snippet} filename={generated.filename} /><CopyBlock title="AI coding prompt" value={generated.aiPrompt} /><section className="card integration-next-steps"><p className="eyebrow">IMPLEMENTATION CHECKLIST</p><ol>{generated.instructions.map(instruction => <li key={instruction}>{instruction}</li>)}</ol></section></section> : <section className="integration-output-placeholder"><span aria-hidden="true">◇</span><div><h3>Your integration package will appear here.</h3><p>Enter your app details and validate an existing offer to generate copyable instructions.</p></div></section>}
    <section className="notice integration-boundary"><b>Client UI gating needs a server boundary.</b><p>Client-side gating alone is not production-grade security. This setup does not automatically protect an app, establish legal ownership, or authenticate a backend session. For protected server resources, prove wallet control and enforce current license authorization on the server. Never place private keys or recovery phrases in app configuration or AI prompts.</p></section>
    <footer><span className="brand">PACT</span><p>Integration workspace · Solana Devnet only · Read-only offer validation.</p><a href="/">Return to marketplace ↗</a></footer>
  </main>;
}
