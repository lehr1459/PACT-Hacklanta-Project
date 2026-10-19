'use client';

import {useEffect, useRef, useState, type FormEvent, type ReactNode} from 'react';
import {PACT_PROGRAM_ID} from '@pact/sdk';
import {isRecord} from './api';
import {CopyText} from './copy';
import {usePublicDraft} from './drafts';
import {appPath, consoleError, dateLabel, frameworkLabels, invalid, numberValue, parseList,
  type Application, type Callback, type ConsoleControl, type Credential, type Framework, type Resource} from './types';

const tabs = ['Overview', 'Callbacks', 'Resources', 'Credentials', 'Integration', 'Test console', 'Usage', 'Audit', 'Settings'] as const;
type Tab = typeof tabs[number];
type Props = {app: Application; control: ConsoleControl};

function useData(path: string, control: ConsoleControl) {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [failure, setFailure] = useState('');
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let live = true; setLoading(true); setData(null); setFailure('');
    control.request(path).then(result => { if (live) setData(result); }, error => { if (live) setFailure(consoleError(error)); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [path, control.request, control.revision, retry]);
  return {data, failure, loading, reload: () => setRetry(value => value + 1)};
}

function DataState({state, children}: {state: ReturnType<typeof useData>; children(data: Record<string, unknown>): ReactNode}) {
  if (state.loading) return <p role="status">Loading saved records…</p>;
  if (state.failure) return <div><p role="alert" className="notice error">{state.failure}</p><button type="button" className="button subtle" onClick={state.reload}>Reload records</button></div>;
  if (!state.data) return null;
  // Parse failures stay inside an ordinary safe error view, not an application-wide render exception.
  try { return <>{children(state.data)}</>; }
  catch { return <div><p role="alert" className="notice error">The saved records could not be safely validated.</p><button type="button" className="button subtle" onClick={state.reload}>Reload records</button></div>; }
}

function callbackRecord(value: unknown): Callback {
  if (!isRecord(value) || typeof value.id !== 'string' || !/^cb_[a-f0-9]{32}$/.test(value.id)
    || typeof value.uri !== 'string' || value.uri.length > 2048 || typeof value.websiteOrigin !== 'string'
    || typeof value.status !== 'string' || !['pending', 'verified', 'revoked'].includes(value.status)
    || typeof value.local !== 'boolean' || value.verifiedUntil !== null && !numberValue(value.verifiedUntil)
    || value.dnsRecord !== null && typeof value.dnsRecord !== 'string') invalid();
  return value as Callback;
}
function resourceRecord(value: unknown): Resource {
  if (!isRecord(value) || typeof value.resourceKey !== 'string' || !/^[a-z][a-z0-9-]{0,63}$/.test(value.resourceKey)
    || typeof value.offerAddress !== 'string' || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value.offerAddress)
    || typeof value.enabled !== 'boolean' || !numberValue(value.version) || value.version < 1
    || !numberValue(value.createdAt) || !numberValue(value.updatedAt) || !numberValue(value.verifiedAt)
    || !numberValue(value.contextSlot)) invalid();
  return value as Resource;
}
function credentialRecord(value: unknown): Credential {
  if (!isRecord(value) || typeof value.id !== 'string' || !/^key_[a-f0-9]{32}$/.test(value.id)
    || typeof value.appId !== 'string' || typeof value.name !== 'string' || typeof value.prefix !== 'string'
    || !Array.isArray(value.scopes) || value.scopes.some(scope => !['access:check', 'connect:write'].includes(scope))
    || !numberValue(value.createdAt) || !numberValue(value.expiresAt)
    || value.lastUsedAt !== null && !numberValue(value.lastUsedAt) || value.revokedAt !== null && !numberValue(value.revokedAt)
    || value.rotatedFrom !== null && typeof value.rotatedFrom !== 'string') invalid();
  return value as Credential;
}

export function HostedApplication({app, control, navigate}: Props & {navigate(): void}) {
  const [tab, setTab] = useState<Tab>('Overview');
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, [tab]);
  return <section className="hosted-app-detail card" aria-labelledby="app-heading">
    <div className="hosted-detail-heading"><div><p className="eyebrow">YOUR APPLICATION / DEVNET</p><h2 id="app-heading">{app.name}</h2><code>{app.id}</code></div><span className="pill">{app.status}</span></div>
    <nav className="hosted-tabs" aria-label="Application sections">{tabs.map(name => <button type="button" key={name} aria-current={tab === name ? 'page' : undefined} disabled={control.blocked} onClick={() => { navigate(); setTab(name); }}>{name}</button>)}</nav>
    <h3 ref={heading} tabIndex={-1}>{tab}</h3>
    {!control.canSign ? <p className="notice">Connect the proven admin wallet to make signed configuration changes. Viewing saved records remains available during this session.</p> : null}
    {tab === 'Overview' ? <Overview app={app} control={control} /> : null}
    {tab === 'Callbacks' ? <Callbacks app={app} control={control} /> : null}
    {tab === 'Resources' ? <Resources app={app} control={control} /> : null}
    {tab === 'Credentials' ? <Credentials app={app} control={control} /> : null}
    {tab === 'Integration' ? <Integration app={app} control={control} /> : null}
    {tab === 'Test console' ? <TestConsole app={app} control={control} /> : null}
    {tab === 'Usage' ? <Usage app={app} control={control} /> : null}
    {tab === 'Audit' ? <Audit app={app} control={control} /> : null}
    {tab === 'Settings' ? <Settings key={app.updatedAt} app={app} control={control} /> : null}
  </section>;
}

function Overview({app, control}: Props) {
  const callbacks = useData(`${appPath(app.id)}/callback-uris`, control);
  const resources = useData(`${appPath(app.id)}/resources`, control);
  const credentials = useData(`${appPath(app.id)}/credentials`, control);
  const usage = useData(`${appPath(app.id)}/usage`, control);
  return <><p>{app.description || 'No description saved.'}</p><dl className="hosted-record-details"><div><dt>Environment</dt><dd>Solana Devnet</dd></div><div><dt>Framework</dt><dd>{frameworkLabels[app.framework]}</dd></div><div><dt>Policy epoch</dt><dd>{app.policyEpoch}</dd></div><div><dt>Created</dt><dd>{dateLabel(app.createdAt)}</dd></div></dl>
    <section className="hosted-record"><h4>Onboarding and configuration notices</h4><p>These are actual saved configuration snapshots, not key-validation or customer-backend acceptance receipts.</p>
      <p>Application: <b>{app.status}</b>. {app.status === 'active' ? 'Backend credential requests are enabled subject to every API check.' : 'Backend credential requests are disabled until activated in Settings.'}</p>
      <DataState state={callbacks}>{data => {
        const items = parseList(data.callbacks, callbackRecord);
        const verified = items.filter(item => item.status === 'verified' && item.verifiedUntil !== null && item.verifiedUntil > Date.now());
        const expiring = verified.filter(item => item.verifiedUntil! <= Date.now() + 3600000);
        return <div><p>Callbacks: {items.length} registered · {verified.length} currently verified.</p>{!verified.length ? <p className="notice">Register and verify a callback before starting customer wallet login.</p> : null}{expiring.length ? <p className="notice">{expiring.length} callback verification(s) expire within one hour. Renew and verify the domain proof before expiry.</p> : null}</div>;
      }}</DataState>
      <DataState state={resources}>{data => {
        const items = parseList(data.resources, resourceRecord);
        return <div><p>Resources: {items.length} registered · {items.filter(item => item.enabled).length} enabled.</p>{!items.some(item => item.enabled) ? <p className="notice">Bind and enable a seller-verified resource before protected access checks.</p> : null}</div>;
      }}</DataState>
      <DataState state={credentials}>{data => {
        const items = parseList(data.credentials, credentialRecord);
        const current = items.filter(item => item.revokedAt === null && item.expiresAt > Date.now());
        const expiring = current.filter(item => item.expiresAt <= Date.now() + 86400000);
        return <div><p>Credential metadata: {current.length} unrevoked and unexpired key(s) in the returned list.</p>{!current.length ? <p className="notice">Create a server-only credential. Metadata does not test whether the key is installed or valid on your backend.</p> : null}{!current.some(item => item.scopes.includes('connect:write')) ? <p className="notice">No current listed key has the wallet-login scope.</p> : null}{!current.some(item => item.scopes.includes('access:check')) ? <p className="notice">No current listed key has the licensing-check scope.</p> : null}{expiring.length ? <p className="notice">{expiring.length} key(s) expire within 24 hours. Review rotation and deploy the new secret on your backend.</p> : null}</div>;
      }}</DataState>
      <DataState state={usage}>{data => {
        const buckets = parseList(data.buckets, value => {
          if (!isRecord(value) || !numberValue(value.bucket) || !numberValue(value.requests) || !numberValue(value.errors)) invalid();
          return value as {bucket: number; requests: number; errors: number};
        });
        const latest = buckets.reduce<{bucket: number; requests: number; errors: number} | null>((found, item) => !found || item.bucket > found.bucket ? item : found, null);
        return <div><p>Last recorded usage bucket: {latest ? `${dateLabel(latest.bucket)} · ${latest.requests} request(s)` : 'No authorization usage recorded.'}</p>{latest && latest.errors > 0 ? <p className="notice">Latest recorded bucket contains {latest.errors} error observation(s). Inspect Usage and Audit before retrying.</p> : null}</div>;
      }}</DataState>
      <p className="fine">No external incident-alert or operator feed is configured in this console. Observations may lag. Run the explicit live readiness check in Test console for current database/chain evidence.</p>
    </section>
    <ol className="hosted-checklist"><li>Register the exact callback and verify its website domain.</li><li>Bind a resource to an active offer owned by your admin wallet.</li><li>Create a scoped API credential and save it on your backend.</li><li>Review integration templates and activate your app in Settings.</li><li>Test login and license denial/allow from your own protected backend.</li></ol><p className="fine">Configuration is saved by the service after each completed action. Forms are drafts until submitted. App activation alone does not verify an end-user license or deploy any integration.</p></>;
}

function Callbacks({app, control}: Props) {
  const state = useData(`${appPath(app.id)}/callback-uris`, control);
  const draft = usePublicDraft(control.draftOwner, app.id, 'callback', control.revision);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!event.currentTarget.reportValidity()) return;
    const fields = new FormData(event.currentTarget);
    void control.review({action: 'callback.create', appId: app.id, title: 'Register callback', path: `${appPath(app.id)}/callback-uris`,
      payload: {uri: String(fields.get('uri')).trim(), websiteOrigin: String(fields.get('websiteOrigin')).trim()},
      warning: 'Register only an exact callback controlled by your application. No wildcard, query or fragment. Nonlocal HTTPS requires a fresh DNS TXT proof.'});
  }
  function act(item: Callback, action: 'verify' | 'renew' | 'revoke') {
    const suffix = action === 'verify' ? '/verify' : `/${item.id}/${action === 'renew' ? 'renew-proof' : 'revoke'}`;
    void control.review({action: `callback.${action}`, appId: app.id, title: `${action === 'verify' ? 'Verify' : action === 'renew' ? 'Renew proof for' : 'Revoke'} callback`,
      path: `${appPath(app.id)}/callback-uris${suffix}`, payload: {callbackId: item.id},
      warning: action === 'revoke' ? 'Revoking this callback invalidates its pending login transactions and codes.' : action === 'renew' ? 'Renewal replaces the proof and invalidates older callback login transactions. Save the returned DNS token once.' : 'The service will check the exact DNS TXT proof using bounded resolution.'});
  }
  return <><p>Callback URLs and website origins must match exactly. HTTP loopback callbacks are local-development only. Domain control is not legal identity.</p>
    <DataState state={state}>{data => { const items = parseList(data.callbacks, callbackRecord); return items.length ? <div className="hosted-records">{items.map(item => <article key={item.id} className="hosted-record"><h4>{item.uri}</h4><dl><div><dt>Website origin</dt><dd>{item.websiteOrigin}</dd></div><div><dt>Status</dt><dd>{item.status}{item.verifiedUntil !== null && item.verifiedUntil <= Date.now() ? ' (verification expired)' : ''}{item.local ? ' · local loopback' : ''}</dd></div><div><dt>Verified until</dt><dd>{dateLabel(item.verifiedUntil)}</dd></div>{!item.local ? <div><dt>DNS TXT record</dt><dd>{item.dnsRecord}</dd></div> : null}</dl><div className="hosted-actions">{!item.local && item.status === 'pending' ? <button className="button subtle" type="button" disabled={control.blocked || !control.canSign} onClick={() => act(item, 'verify')}>Review verify callback {item.uri}</button> : null}<button className="button subtle" type="button" disabled={control.blocked || !control.canSign} onClick={() => act(item, 'renew')}>Review renew callback {item.uri}</button>{item.status !== 'revoked' ? <button className="button subtle" type="button" disabled={control.blocked || !control.canSign} onClick={() => act(item, 'revoke')}>Review revoke callback {item.uri}</button> : null}</div></article>)}</div> : <p className="muted">No callbacks registered.</p>; }}</DataState>
    <form className="form hosted-form" onSubmit={submit}><h4>Register exact callback</h4><label>Callback URI<input name="uri" type="url" required maxLength={2048} placeholder="http://127.0.0.1:4010/callback" autoComplete="off" value={draft.values.uri ?? ''} onChange={event => draft.change('uri', event.target.value)} /></label><label>Website origin<input name="websiteOrigin" type="url" required maxLength={2048} placeholder="http://127.0.0.1:4010" autoComplete="off" value={draft.values.websiteOrigin ?? ''} onChange={event => draft.change('websiteOrigin', event.target.value)} /></label><p className="fine">Browser draft autosaved in this tab when available. Signed submission is required before this changes the registered callback.</p><div className="hosted-actions"><button type="submit" className="button dark" disabled={control.blocked || !control.canSign}>Review register callback</button><button type="button" className="button subtle" disabled={control.blocked} onClick={draft.reset}>Clear callback draft</button></div></form>
  </>;
}

function Resources({app, control}: Props) {
  const state = useData(`${appPath(app.id)}/resources`, control);
  const draft = usePublicDraft(control.draftOwner, app.id, 'resource-bind', control.revision);
  const [history, setHistory] = useState<{key: string; records: Record<string, unknown>[]} | null>(null);
  const [historyError, setHistoryError] = useState('');
  const [historyBusy, setHistoryBusy] = useState(false);
  const historyGeneration = useRef(0);
  let offerChoices: string[] = [];
  try { if (state.data) offerChoices = [...new Set(parseList(state.data.resources, resourceRecord).map(item => item.offerAddress))]; }
  catch { /* The data view below reports the invalid response without offering unverified choices. */ }
  useEffect(() => {
    historyGeneration.current++; setHistory(null); setHistoryBusy(false); setHistoryError('');
    return () => { historyGeneration.current++; };
  }, [control.revision]);
  function bind(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!event.currentTarget.reportValidity()) return;
    const fields = new FormData(event.currentTarget);
    void control.review({action: 'resource.bind', appId: app.id, title: 'Bind resource', path: `${appPath(app.id)}/resources`,
      payload: {resourceKey: String(fields.get('resourceKey')).trim(), offerAddress: String(fields.get('offerAddress')).trim()},
      warning: 'The service verifies a fresh active Devnet offer and requires its seller to match the proven admin wallet. The resource key is immutable. Policy changes invalidate previous wallet grants.'});
  }
  function update(item: Resource, event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault(); if (event && !event.currentTarget.reportValidity()) return;
    const fields = event ? new FormData(event.currentTarget) : null;
    const payload = fields ? {resourceKey: item.resourceKey, expectedVersion: item.version,
      offerAddress: String(fields.get('offerAddress')).trim(), enabled: fields.get('enabled') === 'on'}
      : {resourceKey: item.resourceKey, expectedVersion: item.version, enabled: false};
    void control.review({action: 'resource.update', appId: app.id, title: fields ? 'Update resource' : 'Disable resource',
      path: `${appPath(app.id)}/resources/${item.resourceKey}`, method: fields ? 'PATCH' : 'DELETE', payload,
      warning: 'This versioned policy change invalidates existing wallet grants. A conflict requires reloading the current version. Disable-only containment works without an RPC read.'});
  }
  async function showHistory(key: string) {
    const own = ++historyGeneration.current; setHistoryBusy(true); setHistoryError('');
    try {
      const data = await control.request(`${appPath(app.id)}/resources/${key}`);
      const records = parseList(data.versions, value => {
        if (!isRecord(value) || !numberValue(value.version) || typeof value.offerAddress !== 'string'
          || typeof value.enabled !== 'boolean' || !numberValue(value.contextSlot) || !numberValue(value.createdAt)
          || !numberValue(value.verifiedAt) || typeof value.actorWallet !== 'string') invalid();
        return value;
      });
      if (own === historyGeneration.current) setHistory({key, records});
    } catch (failure) { if (own === historyGeneration.current) setHistoryError(consoleError(failure)); }
    finally { if (own === historyGeneration.current) setHistoryBusy(false); }
  }
  return <><p>Resources map backend-selected feature names to seller-verified offers. Offer deactivation blocks new sales; it does not revoke already-issued unexpired entitlements.</p>
    <a href="/?section=seller">Create or inspect an offer in Seller studio</a>
    <DataState state={state}>{data => { const items = parseList(data.resources, resourceRecord); return items.length ? <div className="hosted-records">{items.map(item => <article className="hosted-record" key={item.resourceKey}><h4>{item.resourceKey}</h4><dl><div><dt>Saved offer</dt><dd>{item.offerAddress}</dd></div><div><dt>Policy state</dt><dd>{item.enabled ? 'Enabled' : 'Disabled'} · version {item.version}</dd></div><div><dt>Verified chain context</dt><dd>Slot {item.contextSlot} · {dateLabel(item.verifiedAt)}</dd></div></dl><form className="form hosted-form" onSubmit={event => update(item, event)}><label>Offer address for {item.resourceKey}<input name="offerAddress" defaultValue={item.offerAddress} required pattern="[1-9A-HJ-NP-Za-km-z]{32,44}" maxLength={44} /></label><label className="hosted-checkbox"><input type="checkbox" name="enabled" defaultChecked={item.enabled} />Enable {item.resourceKey}</label><button type="submit" className="button subtle" disabled={control.blocked || !control.canSign}>Review update resource {item.resourceKey}</button></form><div className="hosted-actions">{item.enabled ? <button type="button" className="button subtle" disabled={control.blocked || !control.canSign} onClick={() => update(item)}>Review disable resource {item.resourceKey}</button> : null}<button type="button" className="button subtle" disabled={control.blocked || historyBusy} onClick={() => void showHistory(item.resourceKey)}>View history {item.resourceKey}</button></div></article>)}</div> : <p className="muted">No resources bound.</p>; }}</DataState>
    {historyBusy ? <p role="status">Loading resource history…</p> : null}{historyError ? <p role="alert">{historyError}</p> : null}
    {history ? <section className="hosted-record"><h4>Version history: {history.key}</h4>{history.records.map(item => <p key={String(item.version)}>Version {String(item.version)} · {item.enabled ? 'enabled' : 'disabled'} · offer <code>{String(item.offerAddress)}</code> · actor <code>{String(item.actorWallet)}</code> · slot {String(item.contextSlot)} · {dateLabel(Number(item.createdAt))}</p>)}</section> : null}
    <form className="form hosted-form" onSubmit={bind}><h4>Bind a protected resource</h4><label>Select a saved offer<select aria-describedby="saved-offer-help" disabled={!offerChoices.length || control.blocked} value={offerChoices.includes(draft.values.offerAddress ?? '') ? draft.values.offerAddress : ''} onChange={event => draft.change('offerAddress', event.target.value)}><option value="">{offerChoices.length ? 'Enter another offer address below' : 'No saved offers ? enter an address below'}</option>{offerChoices.map(address => <option value={address} key={address}>{address}</option>)}</select></label><p className="fine" id="saved-offer-help">Choices come from this application's previously verified bindings. Every new binding still requires a fresh seller-control check. This is not chain-wide offer discovery.</p><label>Resource key<input name="resourceKey" required pattern={'[a-z][a-z0-9\\-]{0,63}'} maxLength={64} placeholder="premium-features" value={draft.values.resourceKey ?? ''} onChange={event => draft.change('resourceKey', event.target.value)} /></label><label>Offer address<input name="offerAddress" required pattern="[1-9A-HJ-NP-Za-km-z]{32,44}" maxLength={44} placeholder="Your seller-owned Devnet offer PDA" spellCheck={false} value={draft.values.offerAddress ?? ''} onChange={event => draft.change('offerAddress', event.target.value)} /></label><p className="fine">Browser draft autosaved in this tab when available. This draft does not establish seller control; a reviewed signed submission and fresh chain verification are required.</p><div className="hosted-actions"><button type="submit" className="button dark" disabled={control.blocked || !control.canSign}>Review bind resource</button><button type="button" className="button subtle" disabled={control.blocked} onClick={draft.reset}>Clear resource draft</button></div></form>
  </>;
}

function Credentials({app, control}: Props) {
  const state = useData(`${appPath(app.id)}/credentials`, control);
  function mint(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!event.currentTarget.reportValidity()) return;
    const fields = new FormData(event.currentTarget);
    void control.review({action: 'credential.create', appId: app.id, title: 'Create credential', path: `${appPath(app.id)}/credentials`,
      payload: {name: String(fields.get('name')).trim(), scopes: fields.getAll('scope').map(String),
        expiresAt: Date.now() + Number(fields.get('days')) * 86400000},
      warning: 'The secret is shown only once. Save it in a server secret store; never in a browser bundle or AI prompt. No current user license is established by this key.'});
  }
  function rotate(item: Credential, event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!event.currentTarget.reportValidity()) return;
    const fields = new FormData(event.currentTarget);
    void control.review({action: 'credential.rotate', appId: app.id, title: 'Rotate credential', path: `${appPath(app.id)}/credentials/${item.id}/rotate`,
      payload: {credentialId: item.id, expiresAt: Date.now() + Number(fields.get('days')) * 86400000, overlapSeconds: Number(fields.get('overlap'))},
      warning: 'A new secret is shown once. The old key expires at the earlier of its current expiry and the signed overlap deadline. Deploy the new key on your backend and revoke the old key after verification.'});
  }
  function revoke(item: Credential) {
    void control.review({action: 'credential.revoke', appId: app.id, title: 'Revoke credential', path: `${appPath(app.id)}/credentials/${item.id}/revoke`,
      payload: {credentialId: item.id}, warning: 'Revocation disables this key immediately and invalidates login transactions issued with it. It remains recorded for audit. This action is available on paused apps.'});
  }
  return <><p>API credentials authenticate your backend application. They never prove buyer wallet control or an active license. Secrets appear only in a short-lived, once-only reveal.</p>
    <DataState state={state}>{data => { const items = parseList(data.credentials, credentialRecord); return items.length ? <div className="hosted-records">{items.map(item => <article className="hosted-record" key={item.id} aria-label={`Credential ${item.name}`} data-testid={`credential-${item.id}`}><h4>{item.name}</h4><dl><div><dt>Nonsecret prefix</dt><dd><code>{item.prefix}</code></dd></div><div><dt>Scopes</dt><dd>{item.scopes.join(', ')}</dd></div><div><dt>Created</dt><dd>{dateLabel(item.createdAt)}</dd></div><div><dt>Expires</dt><dd>{dateLabel(item.expiresAt)}</dd></div><div><dt>Last used</dt><dd>{dateLabel(item.lastUsedAt)}</dd></div><div><dt>Status</dt><dd>{item.revokedAt !== null ? `Revoked ${dateLabel(item.revokedAt)}` : item.expiresAt <= Date.now() ? 'Expired' : 'Not revoked; expiry is in the future'}</dd></div>{item.rotatedFrom ? <div><dt>Rotated from</dt><dd>{item.rotatedFrom}</dd></div> : null}</dl>{item.revokedAt === null ? <><form className="form hosted-form" onSubmit={event => rotate(item, event)}><label>New lifetime in days for {item.name}<input name="days" type="number" min="1" max="90" step="1" defaultValue="30" required /></label><label>Overlap seconds for {item.name}<input name="overlap" type="number" min="0" max="86400" step="1" defaultValue="300" required /></label><button className="button subtle" type="submit" disabled={control.blocked || !control.canSign || item.expiresAt <= Date.now()}>Review rotate credential {item.name}</button></form><button className="button subtle" type="button" disabled={control.blocked || !control.canSign} onClick={() => revoke(item)}>Review revoke credential {item.name}</button></> : null}</article>)}</div> : <p className="muted">No credentials created.</p>; }}</DataState>
    <form className="form hosted-form" onSubmit={mint}><h4>Create server credential</h4><label>Credential name<input name="name" required maxLength={80} /></label><label>Credential lifetime (days)<input name="days" type="number" min="1" max="90" step="1" defaultValue="30" required /></label><fieldset><legend>Credential scopes</legend><label className="hosted-checkbox"><input name="scope" type="checkbox" value="access:check" defaultChecked />access:check — verify permissions from your backend</label><label className="hosted-checkbox"><input name="scope" type="checkbox" value="connect:write" defaultChecked />connect:write — start/exchange/revoke wallet login</label></fieldset><button type="submit" className="button dark" disabled={control.blocked || !control.canSign}>Review create credential</button></form>
  </>;
}

function Integration({app, control}: Props) {
  const [framework, setFramework] = useState<Framework>(app.framework);
  const resources = useData(`${appPath(app.id)}/resources`, control);
  const callbacks = useData(`${appPath(app.id)}/callback-uris`, control);
  return <><p>Choose a template for review. Save your preferred framework in Settings. These templates do not install code or protect your application automatically; complete runnable examples and version assumptions are a separate documentation gate.</p><label>Template framework<select value={framework} onChange={event => setFramework(event.target.value as Framework)}>{Object.entries(frameworkLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    <CopyText label="Server environment template" value={'PACT_API_BASE_URL=https://YOUR_APPROVED_PACT_ORIGIN\nPACT_API_KEY=SET_ONLY_IN_YOUR_SERVER_SECRET_STORE\n# Never prefix the API key with NEXT_PUBLIC_ or VITE_.'} />
    <CopyText label="Public application settings" value={JSON.stringify({appId: app.id, environment: 'devnet', framework}, null, 2)} />
    <DataState state={resources}>{data => <CopyText label="Saved resource settings" value={JSON.stringify(parseList(data.resources, resourceRecord).map(item => ({resourceKey: item.resourceKey, offerAddress: item.offerAddress, enabled: item.enabled, version: item.version})), null, 2)} />}</DataState>
    <DataState state={callbacks}>{data => <CopyText label="Saved callback settings" value={JSON.stringify(parseList(data.callbacks, callbackRecord).map(item => ({uri: item.uri, websiteOrigin: item.websiteOrigin, status: item.status})), null, 2)} />}</DataState>
    <CopyText label="Backend enforcement outline" value={framework === 'rest' ? 'POST /v1/access/check\nAuthorization: Bearer <SERVER_ENV_API_KEY>\nContent-Type: application/json\n\n{"resourceKey":"YOUR_SERVER_SELECTED_RESOURCE","walletGrant":"YOUR_SERVER_SESSION_GRANT"}\n\nDeny every non-ALLOW, error, unknown schema/binding or stale response.\nValidate the complete decision contract before performing the protected action.' : `// ${frameworkLabels[framework]} implementation outline, not a complete middleware.\n// 1. Load your authenticated app session on the server.\n// 2. Retrieve its PACT wallet grant from your server session store.\n// 3. Call POST /v1/access/check using your private server environment key.\n// 4. Validate schema, app/resource/wallet/network/program and freshness.\n// 5. Deny all uncertainty; perform the action only after a fresh ALLOW.\n// 6. Recheck before durable commits or long operations.\n// React calls your protected backend, never the PACT key endpoint.`} />
    <ol className="hosted-checklist"><li>Start wallet login on your backend with random session-bound state, S256 PKCE, expected issuer and exact registered callback.</li><li>Navigate to the returned PACT login URL. On callback, check state and issuer in your backend before code exchange.</li><li>Keep the wallet grant in your server session; give the browser only your own HttpOnly app cookie.</li><li>Use a server-selected resource. Do not accept arbitrary offer or wallet overrides from the browser.</li><li>On logout, revoke the grant from your backend and clear your app session.</li></ol>
    <p className="fine">An external API call is not atomic with your own database transaction and cannot retract delivered bytes. Purchases use existing PACT checkout and seller-exact metadata; uncertain purchases require read-only recovery, not blind resubmission. Hosted REST does not require SDK publication.</p>
  </>;
}

function TestConsole({app, control}: Props) {
  const [readiness, setReadiness] = useState<{slot: number; requestId: string; checkedAt: number} | null>(null);
  const [failure, setFailure] = useState('');
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState('Locked');
  const run = useRef(0);
  useEffect(() => () => { run.current++; }, []);
  async function check() {
    if (busy) return; const own = ++run.current; setBusy(true); setReadiness(null); setFailure('');
    try {
      const data = await control.request('/v1/health/ready');
      if (data.ready !== true || data.scope !== 'database-and-chain' || data.network !== 'solana-devnet'
        || data.programId !== PACT_PROGRAM_ID || !numberValue(data.contextSlot) || typeof data.requestId !== 'string') invalid();
      if (own === run.current) setReadiness({slot: data.contextSlot, requestId: data.requestId, checkedAt: Date.now()});
    } catch (error) { if (own === run.current) setFailure(consoleError(error)); }
    finally { if (own === run.current) setBusy(false); }
  }
  return <><section className="hosted-record"><h4>Live read-only service readiness</h4><p>This calls the actual database-and-chain readiness endpoint. It does not authenticate a buyer, test your key, prove a license, or certify a deployed program binary.</p><button type="button" className="button dark" disabled={busy || control.blocked} onClick={() => void check()}>{busy ? 'Checking readiness…' : 'Check live readiness'}</button>{readiness ? <p role="status">Readiness verified at {dateLabel(readiness.checkedAt)} · Devnet slot {readiness.slot} · request {readiness.requestId}. This is a point-in-time operational check.</p> : null}{failure ? <p role="alert" className="notice error">{failure}</p> : null}</section>
    <section className="hosted-record"><h4>Customer backend acceptance</h4><p>App status: <b>{app.status}</b>. No customer-backend login or entitlement receipt has been supplied to this console. Configuration metadata is not a passed integration test.</p><p>From your own backend, test key validation, wallet login/code exchange, unlicensed denial, fresh licensed allowance, exact expiry denial, logout and revoked credentials. Keep the key and wallet grant off this page.</p></section>
    <section className="hosted-record" data-testid="hosted-synthetic-preview"><h4>Synthetic UI preview — not chain data</h4><div role="group" aria-label="Synthetic developer entitlement preview" className="hosted-actions">{['Locked', 'Allowed', 'Expired'].map(value => <button type="button" className="button subtle" key={value} aria-pressed={preview === value} onClick={() => setPreview(value)}>{value}</button>)}</div><p>Example appearance: {preview}. These controls never verify identity or unlock a protected backend.</p></section>
  </>;
}

function Usage({app, control}: Props) {
  const state = useData(`${appPath(app.id)}/usage`, control);
  return <><p>Recorded authorization aggregates cover at most 30 days. Collection is asynchronous and may lag or drop observations during an outage; these figures are not billing or a complete access ledger.</p><DataState state={state}>{data => {
    const buckets = parseList(data.buckets, item => {
      if (!isRecord(item) || !['bucket', 'requests', 'allowed', 'denied', 'errors', 'latencyTotalMs', 'latencyMaxMs'].every(key => numberValue(item[key]))) invalid();
      return item as Record<string, number>;
    });
    const reasons = parseList(data.reasons, item => {
      if (!isRecord(item) || !numberValue(item.bucket) || !numberValue(item.requests) || typeof item.reason !== 'string') invalid();
      return item as {bucket: number; requests: number; reason: string};
    });
    return buckets.length ? <><div className="hosted-table-scroll"><table><caption>Recorded authorization usage</caption><thead><tr><th scope="col">UTC bucket</th><th scope="col">Requests</th><th scope="col">Allow</th><th scope="col">Deny</th><th scope="col">Error</th><th scope="col">Max latency ms</th></tr></thead><tbody>{buckets.map(row => <tr key={row.bucket}><th scope="row">{dateLabel(row.bucket)}</th><td>{row.requests}</td><td>{row.allowed}</td><td>{row.denied}</td><td>{row.errors}</td><td>{row.latencyMaxMs}</td></tr>)}</tbody></table></div><h4>Recorded reason counts</h4>{reasons.length ? <ul>{reasons.map(row => <li key={`${row.bucket}-${row.reason}`}>{dateLabel(row.bucket)} · {row.reason} · {row.requests}</li>)}</ul> : <p>No reason observations recorded.</p>}</> : <p className="muted">No authorization usage recorded.</p>;
  }}</DataState></>;
}

function Audit({app, control}: Props) {
  const state = useData(`${appPath(app.id)}/events`, control);
  return <><p>Latest 100 owner-scoped redacted events. Keys, signatures, wallet grants and agreement text are omitted.</p><DataState state={state}>{data => {
    const events = parseList(data.events, item => {
      if (!isRecord(item) || typeof item.id !== 'string' || typeof item.type !== 'string'
        || typeof item.requestId !== 'string' || typeof item.outcome !== 'string' || !numberValue(item.createdAt)) invalid();
      return item as {id: string; type: string; requestId: string; outcome: string; createdAt: number};
    });
    return events.length ? <ol className="hosted-audit">{events.map(item => <li key={item.id}><b>{item.type}</b><span>{item.outcome} · {dateLabel(item.createdAt)}</span><code>Request: {item.requestId}</code></li>)}</ol> : <p className="muted">No audit events recorded.</p>;
  }}</DataState></>;
}

function Settings({app, control}: Props) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!event.currentTarget.reportValidity()) return;
    const data = new FormData(event.currentTarget);
    void control.review({action: 'app.update', appId: app.id, title: 'Update application settings', path: appPath(app.id), method: 'PATCH',
      payload: {name: String(data.get('name')).trim(), description: String(data.get('description')).trim(),
        framework: String(data.get('framework')), status: String(data.get('status'))},
      warning: 'Active enables backend credential use; draft and paused deny it. Pausing is reversible, does not delete audit history and does not revoke existing on-chain licenses. Review the exact status before signing.'});
  }
  return <><p>All settings updates require a fresh action-specific admin signature. Network and program are fixed to the reviewed Solana Devnet environment.</p><form className="form hosted-form" onSubmit={submit}><label>Application display name<input name="name" required maxLength={80} defaultValue={app.name} /></label><label>Application description<textarea name="description" maxLength={500} rows={3} defaultValue={app.description} /></label><label>Saved framework<select name="framework" defaultValue={app.framework}>{Object.entries(frameworkLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>Application status<select name="status" defaultValue={app.status}><option value="draft">Draft — backend access disabled</option><option value="active">Active — configured backend access enabled</option><option value="paused">Paused — backend access denied</option></select></label><button type="submit" className="button dark" disabled={control.blocked || !control.canSign}>Review save settings</button></form><p className="fine">Account recovery, delegation, verified incident contacts, public hosting and distribution terms require owner decisions. No unimplemented account deletion or recovery action is offered.</p></>;
}
