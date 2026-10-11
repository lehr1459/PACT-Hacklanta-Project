import type {IntegrationFramework} from './generator';

/** A reusable component template. Dynamic operator input appears only in JSON configuration. */
export function integrationComponent(framework:IntegrationFramework):string {
  return (framework==='nextjs'?"'use client';\n":'')+String.raw`import {useEffect, useRef, useState, type ReactNode} from 'react';
import {createPactClient, isLicenseStatusFresh, PactError, PACT_PROGRAM_ID, type LicenseStatus} from '@pact/sdk';
import {pactConfig} from './pact-config';

type WalletKey = {toBase58(): string};
type Phantom = {
  isPhantom: boolean;
  publicKey: WalletKey | null;
  connect(): Promise<{publicKey: WalletKey}>;
  disconnect(): Promise<void>;
  on(event: string, listener: (key?: WalletKey | null) => void): void;
  off?(event: string, listener: (key?: WalletKey | null) => void): void;
  removeListener?(event: string, listener: (key?: WalletKey | null) => void): void;
};
type Actions = {connect(): Promise<void>; disconnect(): Promise<void>};
function readAddress(provider: Phantom | null): string | null {
  try {const value = provider?.publicKey?.toBase58(); return typeof value === 'string' && value.length ? value : null;}
  catch {return null;}
}

export default function PactLicenseGate({children}: {children: ReactNode}) {
  const [wallet, setWallet] = useState<string | null>(null);
  const [status, setStatus] = useState<LicenseStatus | null>(null);
  const [fresh, setFresh] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('Connect Phantom to check your license.');
  const actions = useRef<Actions | null>(null);

  useEffect(() => {
    // No browser access at module scope or during server rendering.
    const injected = (window as Window & {phantom?: {solana?: Phantom}}).phantom?.solana;
    const provider = injected?.isPhantom ? injected : null;
    let disposed = false, epoch = 0, operation = 0, connecting = false;
    let address: string | null = null, latest: LicenseStatus | null = null;
    let poll: ReturnType<typeof setTimeout> | undefined;
    const activePage = () => navigator.onLine && document.visibilityState === 'visible';
    const close = () => {latest = null; setStatus(null); setFresh(false);};
    const reset = (next: string | null) => {
      epoch++; clearTimeout(poll); close(); address = next; setWallet(next);
      if (!next || !activePage()) {setMessage(next ? 'Verification paused; access locked.' : 'Connect Phantom to check your license.'); return;}
      let client: ReturnType<typeof createPactClient>;
      try {
        if (pactConfig.network !== 'devnet' || pactConfig.program !== PACT_PROGRAM_ID) throw new Error('Configuration mismatch');
        client = createPactClient({rpcUrl: pactConfig.rpcUrl, now: () => performance.now()});
      } catch {setMessage('Invalid Devnet configuration; access locked.'); return;}
      const session = epoch;
      const identityMatches = () => !disposed && session === epoch && address === next && readAddress(provider) === next && activePage();
      const refresh = async () => {
        if (!identityMatches()) return;
        try {
          const result = await client.getLicenseStatus({offer: pactConfig.offer, wallet: next});
          if (!identityMatches()) return;
          latest = result; setStatus(result); setFresh(isLicenseStatusFresh(result, performance.now()));
          setMessage(result.state === 'active' ? 'License verified on Solana Devnet.' : result.state === 'expired' ? 'License expired; access locked.' : 'No license found; access locked.');
        } catch (error) {
          if (!identityMatches()) return;
          close(); setMessage(error instanceof PactError ? 'Devnet verification failed (' + error.code + '); access locked.' : 'Devnet verification unavailable; access locked.');
        } finally {
          // Sequential polling: a new read starts only after this read finishes.
          if (identityMatches()) poll = setTimeout(() => void refresh(), 4000);
        }
      };
      setMessage('Checking Solana Devnet…'); void refresh();
    };
    const changed = (key?: WalletKey | null) => {
      if (address === null && !connecting) return; // Do not adopt unsolicited wallet identity events.
      if (connecting) {
        operation++; connecting = false; setBusy(false); reset(null);
        setMessage('Wallet changed during connection; reconnect Phantom to verify access.'); return;
      }
      let next = readAddress(provider);
      if (key === null) next = null;
      else if (key !== undefined) {try {if (key.toBase58() !== next) next = null;} catch {next = null;}}
      operation++; connecting = false; setBusy(false); reset(next);
    };
    const disconnected = () => {operation++; connecting = false; setBusy(false); reset(null);};
    const environment = () => reset(address === null ? null : readAddress(provider));
    provider?.on('accountChanged', changed); provider?.on('disconnect', disconnected);
    window.addEventListener('online', environment); window.addEventListener('offline', environment);
    document.addEventListener('visibilitychange', environment);
    if (!provider) setMessage('Phantom extension not found. Install Phantom manually, then reload this app.');
    const freshness = setInterval(() => {
      if (disposed) return;
      if (address !== null && readAddress(provider) !== address) {changed(); return;}
      const valid = Boolean(address && activePage() && latest?.wallet === address && latest.offer === pactConfig.offer && isLicenseStatusFresh(latest, performance.now()));
      setFresh(valid);
      if (latest?.state === 'active' && !valid) setMessage('Fresh Devnet verification required; access locked.');
    }, 250);
    actions.current = {
      async connect() {
        if (!provider || connecting || disposed) return;
        connecting = true; setBusy(true); const request = ++operation;
        try {
          const result = await provider.connect();
          if (disposed || request !== operation) return;
          if (readAddress(provider) !== result.publicKey.toBase58()) throw new Error('Wallet changed');
          reset(readAddress(provider));
        } catch {
          if (!disposed && request === operation) {reset(null); setMessage('Phantom connection rejected or interrupted; access locked.');}
        } finally {if (!disposed && request === operation) {connecting = false; setBusy(false);}}
      },
      async disconnect() {
        const request = ++operation; connecting = false; setBusy(false); reset(null);
        try {await provider?.disconnect();}
        catch {if (!disposed && request === operation) setMessage('Disconnected locally. Check Phantom connection settings.');}
      },
    };
    return () => {
      disposed = true; epoch++; operation++; actions.current = null; clearTimeout(poll); clearInterval(freshness);
      window.removeEventListener('online', environment); window.removeEventListener('offline', environment);
      document.removeEventListener('visibilitychange', environment);
      const remove = provider?.off ?? provider?.removeListener;
      remove?.call(provider, 'accountChanged', changed); remove?.call(provider, 'disconnect', disconnected);
    };
  }, []);

  const unlocked = Boolean(wallet && fresh && status?.active && status.wallet === wallet && status.offer === pactConfig.offer);
  return <section aria-label="PACT license access" data-state={unlocked ? 'unlocked' : status?.state === 'expired' ? 'expired' : 'locked'}>
    <p>Solana Devnet · PACT license verification</p>
    {wallet ? <><p style={{overflowWrap: 'anywhere'}}>Wallet: {wallet}</p><button onClick={() => void actions.current?.disconnect()}>Disconnect Phantom</button></> : <button disabled={busy} onClick={() => void actions.current?.connect()}>{busy ? 'Connecting…' : 'Connect Phantom'}</button>}
    <p role="status">{message}</p>
    {unlocked ? children : <p>License required. Premium access is locked.</p>}
    <small>Client-side demo only. Protected resources require authenticated wallet ownership and fresh server-side authorization.</small>
  </section>;
}
`;
}
