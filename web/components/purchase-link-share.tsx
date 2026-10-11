'use client';

import { useEffect, useRef, useState } from 'react';
import { metadataMatches, metadataWithinLimit, parsePublicKey, type SolanaOffer } from '../lib/solana/protocol';
import { encodePurchaseLink, PURCHASE_LINK_MAX_LENGTH, PURCHASE_LINK_METADATA_MAX_BYTES } from '../lib/solana/purchase-link';

type Feedback = { scope: string; epoch: number; message: string; fallback?: 'metadata' | 'link' };

export function MetadataCopy({ metadata, busy }: { metadata: string; busy: boolean }) {
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const text = useRef<HTMLTextAreaElement>(null);
  const epoch = useRef(0);
  const scope = `${busy}:${metadata}`;
  useEffect(() => { epoch.current++; }, [scope]);
  const current = feedback?.scope === scope && feedback.epoch === epoch.current ? feedback : null;
  async function copy() {
    if (busy || !metadataWithinLimit(metadata)) return;
    const capturedEpoch = ++epoch.current;
    setFeedback(null);
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(metadata);
      if (capturedEpoch === epoch.current) setFeedback({ scope, epoch: capturedEpoch, message: 'Metadata JSON copied. Preserve these exact bytes.' });
    } catch {
      if (capturedEpoch === epoch.current) setFeedback({ scope, epoch: capturedEpoch, message: 'Clipboard unavailable. Select the exact metadata below and copy it manually.', fallback: 'metadata' });
    }
  }
  useEffect(() => { if (current?.fallback === 'metadata') { text.current?.focus(); text.current?.select(); } }, [current]);
  return <div className="metadata-copy">
    <button type="button" className="button subtle" disabled={busy || !metadataWithinLimit(metadata)} onClick={() => void copy()}>Copy Metadata JSON</button>
    <p className="copy-feedback fine" role="status">{current?.message}</p>
    {current?.fallback ? <label>Exact metadata JSON<textarea aria-label="Exact metadata JSON" ref={text} readOnly value={metadata} rows={4} spellCheck={false} /></label> : null}
  </div>;
}

export function PurchaseLinkSharing({ offer, offerAddress, metadata, approved, fresh, busy, connected, address, connectedAddress }: {
  offer?: SolanaOffer;
  offerAddress: string;
  metadata: string;
  approved: boolean;
  fresh: boolean;
  busy: boolean;
  connected: boolean;
  address?: string;
  connectedAddress: () => string | undefined;
}) {
  const [origin, setOrigin] = useState('');
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const text = useRef<HTMLTextAreaElement>(null);
  const epoch = useRef(0);
  useEffect(() => setOrigin(window.location.origin), []);
  const result = origin ? encodePurchaseLink({ origin, offer: offerAddress, metadata }) : null;
  const eligible = Boolean(approved && fresh && !busy && connected && address && offer?.active && offer.seller.toBase58() === address && offer.address.toBase58() === offerAddress && parsePublicKey(offerAddress) && metadataMatches(metadata, offer));
  const link = eligible && result?.ok ? result.url : '';
  const scope = `${origin}:${offerAddress}:${address ?? ''}:${approved}:${fresh}:${busy}:${connected}:${eligible}:${link}:${metadata}`;
  useEffect(() => { epoch.current++; }, [scope]);
  const current = feedback?.scope === scope && feedback.epoch === epoch.current ? feedback : null;
  async function copy() {
    if (!eligible || !address) return;
    try { if (connectedAddress() !== address) return; } catch { return; }
    const capturedEpoch = ++epoch.current;
    setFeedback(null);
    const captured = encodePurchaseLink({ origin, offer: offerAddress, metadata });
    if (!captured.ok) { setFeedback({ scope, epoch: capturedEpoch, message: captured.error }); return; }
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(captured.url);
      if (capturedEpoch === epoch.current && connectedAddress() === address) setFeedback({ scope, epoch: capturedEpoch, message: 'Buyer link copied. Share it with the buyer.' });
    } catch {
      if (capturedEpoch !== epoch.current) return;
      try { if (connectedAddress() !== address) return; } catch { return; }
      if (text.current?.value === captured.url) { text.current.focus(); text.current.select(); }
      setFeedback({ scope, epoch: capturedEpoch, message: 'Clipboard unavailable. The buyer link is selected; copy it manually.', fallback: 'link' });
    }
  }
  return <section className="purchase-link-sharing" aria-labelledby="purchase-link-sharing-title">
    <p className="eyebrow">ONE LINK / EXACT PUBLIC TERMS</p>
    <h3 id="purchase-link-sharing-title">Share Purchase Link</h3>
    <p className="muted">Send your buyer the offer and its exact metadata in one link. They review the on-chain match and approve the terms before purchasing.</p>
    <p className="share-public-warning">Everything in this link is public to anyone who receives it. Share only public license terms; never include credentials, private keys, or personal information.</p>
    {approved && parsePublicKey(offerAddress) && result && !result.ok ? <p className="notice error" role="alert">{result.error} Download or copy the exact metadata JSON and use the manual purchase workflow.</p> : null}
    <label>Buyer purchase link<textarea aria-label="Buyer purchase link" ref={text} readOnly value={link} rows={3} spellCheck={false} placeholder="Approve matching terms for your active offer to prepare a link." /></label>
    <button type="button" className="button dark wide" disabled={!link} onClick={() => void copy()}>Copy Buyer Link</button>
    <p className="copy-feedback fine" role="status">{current?.message}</p>
    <p className="fine share-guidance">{!eligible ? 'Connect the offer’s seller wallet, load a fresh active offer, and approve its matching metadata to share a buyer link.' : null}</p>
    <p className="fine">Link limit: {PURCHASE_LINK_MAX_LENGTH.toLocaleString('en-US')} characters and {PURCHASE_LINK_METADATA_MAX_BYTES.toLocaleString('en-US')} metadata bytes. Larger metadata stays available through the existing JSON workflow.</p>
  </section>;
}
