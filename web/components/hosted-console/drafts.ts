'use client';
import {useEffect, useState} from 'react';

type DraftKind = 'registration' | 'callback' | 'resource-bind';
const schemas: Record<DraftKind, Record<string, number>> = {
  registration: {name: 80, description: 500, framework: 20},
  callback: {uri: 2048, websiteOrigin: 2048},
  'resource-bind': {resourceKey: 64, offerAddress: 44},
};
const prefix = 'pact-public-draft:';
const platformSensitive = /pact_sk_dev_key_[a-f0-9]{32}_[A-Za-z0-9_-]{43}|pact_(?:grant|code)_[A-Za-z0-9_-]{43}|pact-domain-verification=[A-Za-z0-9_-]{43}|PACT hosted wallet proof v1|Browser\/session binding:|Payload SHA256:|signatureBase64/i;
function key(owner: string, appId: string, kind: DraftKind) {
  if (!/^dev_[a-f0-9]{32}$/.test(owner) || appId !== 'new' && !/^app_[a-f0-9]{32}$/.test(appId)) return null;
  return `${prefix}${owner}:${appId}:${kind}`;
}
function checked(kind: DraftKind, value: unknown): Record<string, string> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const entries = Object.entries(value);
  if (entries.length > Object.keys(schemas[kind]).length || entries.some(([field, text]) =>
    !Object.hasOwn(schemas[kind], field) || typeof text !== 'string' || text.length > schemas[kind][field]
      || platformSensitive.test(text))) return null;
  if (kind === 'registration' && 'framework' in value
    && !['rest', 'express', 'nextjs', 'react-backend'].includes(String(value.framework))) return null;
  return value as Record<string, string>;
}
export function readPublicDraft(owner: string, appId: string, kind: DraftKind): Record<string, string> | null {
  const name = key(owner, appId, kind); if (!name) return null;
  try {
    const value = sessionStorage.getItem(name);
    if (!value) return null;
    if (value.length > 8192 || platformSensitive.test(value)) { sessionStorage.removeItem(name); return null; }
    const parsed = checked(kind, JSON.parse(value));
    if (!parsed) sessionStorage.removeItem(name);
    return parsed;
  }
  catch { return null; }
}
export function writePublicDraft(owner: string, appId: string, kind: DraftKind, value: Record<string, string>) {
  const name = key(owner, appId, kind); if (!name) return;
  if (!checked(kind, value)) { try { sessionStorage.removeItem(name); } catch { /* Optional cache. */ } return; }
  try { sessionStorage.setItem(name, JSON.stringify(value)); } catch { /* Optional public draft cache only. */ }
}
export function clearPublicDraft(owner: string, appId: string, kind: DraftKind) {
  const name = key(owner, appId, kind); if (name) try { sessionStorage.removeItem(name); } catch { /* Optional cache. */ }
}
export function clearOwnerDrafts(owner: string) {
  if (!/^dev_[a-f0-9]{32}$/.test(owner)) return;
  try {
    const names: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const name = sessionStorage.key(i);
      if (name?.startsWith(`${prefix}${owner}:`)) names.push(name);
    }
    for (const name of names) sessionStorage.removeItem(name);
  } catch { /* Storage may be unavailable; never weaken server authorization. */ }
}
export function usePublicDraft(owner: string, appId: string, kind: 'callback' | 'resource-bind', revision: number) {
  const [values, setValues] = useState<Record<string, string>>({});
  useEffect(() => { setValues(readPublicDraft(owner, appId, kind) ?? {}); }, [owner, appId, kind, revision]);
  function change(field: string, value: string) {
    const next = {...values, [field]: value};
    if (!checked(kind, next)) { setValues({}); clearPublicDraft(owner, appId, kind); return; }
    setValues(next); writePublicDraft(owner, appId, kind, next);
  }
  function reset() { setValues({}); clearPublicDraft(owner, appId, kind); }
  return {values, change, reset};
}
