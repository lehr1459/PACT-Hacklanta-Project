import { PublicKey, type VersionedTransaction } from '@solana/web3.js';
import { PactError } from './index.js';
export interface WalletAdapter {
    connect(): Promise<string>;
    disconnect(): Promise<void>;
    getPublicKey(): string | null;
    signTransaction(transaction: VersionedTransaction): Promise<VersionedTransaction>;
    subscribe(listener: (wallet: string | null) => void): () => void;
    destroy(): void;
}
export function canonicalWallet(value: unknown): string | null { try {
    const text = typeof value === 'string' ? value : (value as {
        toBase58(): string;
    })?.toBase58();
    const key = new PublicKey(text);
    return key.toBase58() === text ? text : null;
}
catch {
    return null;
} }
type Provider = {
    isPhantom?: boolean;
    publicKey?: unknown;
    connect(): Promise<unknown>;
    disconnect(): Promise<void>;
    signTransaction?(tx: VersionedTransaction): Promise<VersionedTransaction>;
    on?(event: string, listener: (value?: unknown) => void): void;
    removeListener?(event: string, listener: (value?: unknown) => void): void;
};
export function createPhantomAdapter(): WalletAdapter {
    let provider: Provider | undefined, connected: string | null = null, disposed = false, operation = 0;
    const listeners = new Set<(wallet: string | null) => void>();
    const readKey = (p: {
        publicKey?: unknown;
    } | undefined) => { try {
        return canonicalWallet(p?.publicKey);
    }
    catch {
        return null;
    } };
    const emit = () => { for (const fn of listeners)
        try {
            fn(connected);
        }
        catch { } };
    const changed = (value?: unknown) => { operation++; connected = connected ? canonicalWallet(value) : null; emit(); };
    const disconnected = () => { operation++; connected = null; emit(); };
    function detect() { if (disposed)
        throw new PactError('INVALID_INPUT', 'Wallet adapter was destroyed.'); if (!provider) {
        const root = globalThis as unknown as {
            phantom?: {
                solana?: Provider;
            };
            solana?: Provider;
        };
        const p = root.phantom?.solana ?? root.solana;
        if (!p?.isPhantom || typeof p.signTransaction !== 'function' || typeof p.on !== 'function' || typeof p.removeListener !== 'function')
            throw new PactError('INVALID_INPUT', 'Phantom with sign-only and account events is required.');
        provider = p;
        p.on('accountChanged', changed);
        p.on('disconnect', disconnected);
    } return provider; }
    return { async connect() { const p = detect(); const token = ++operation; const response = await p.connect() as {
            publicKey?: unknown;
        }; if (disposed || token !== operation)
            throw new PactError('INVALID_INPUT', 'Wallet connection changed.'); connected = readKey(p); if (!connected || readKey(response) !== connected) {
            connected = null;
            throw new PactError('INVALID_INPUT', 'Wallet connection identity is inconsistent.');
        } if (!connected)
            throw new PactError('INVALID_INPUT', 'Wallet returned an invalid address.'); emit(); return connected; }, async disconnect() { const p = detect(); operation++; connected = null; emit(); await p.disconnect(); }, getPublicKey() { if (disposed)
            return null; if (connected && readKey(provider) !== connected) {
            operation++;
            connected = null;
            emit();
        } return connected; }, async signTransaction(tx) { const p = detect(); if (!connected || readKey(p) !== connected)
            throw new PactError('INVALID_INPUT', 'Connect the current wallet first.'); return await p.signTransaction!(tx); }, subscribe(fn) { if (disposed)
            return () => { }; listeners.add(fn); return () => listeners.delete(fn); }, destroy() { disposed = true; operation++; connected = null; provider?.removeListener?.('accountChanged', changed); provider?.removeListener?.('disconnect', disconnected); listeners.clear(); } };
}
