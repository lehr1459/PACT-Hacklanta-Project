export interface PhantomProvider {
  isPhantom?: boolean;
  publicKey?: {toString(): string} | null;
  connect(): Promise<{publicKey: {toString(): string}}>;
  signMessage(message: Uint8Array, encoding?: 'utf8'): Promise<{signature: Uint8Array; publicKey?: {toString(): string}}>;
  on?(event: string, listener: (...args: unknown[]) => void): void;
  removeListener?(event: string, listener: (...args: unknown[]) => void): void;
}

export function phantomProvider(): PhantomProvider | null {
  const surface = window as unknown as {phantom?: {solana?: PhantomProvider}; solana?: PhantomProvider};
  const provider = surface.phantom?.solana ?? surface.solana;
  return provider?.isPhantom && typeof provider.connect === 'function'
    && typeof provider.signMessage === 'function' ? provider : null;
}

export function walletAddress(value: unknown): value is string {
  return typeof value === 'string' && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value);
}

export async function signExactMessage(provider: PhantomProvider, message: string, expectedWallet: string): Promise<string> {
  if (provider.publicKey?.toString() !== expectedWallet) throw new Error('Wallet changed');
  const result = await provider.signMessage(new TextEncoder().encode(message), 'utf8');
  if (provider.publicKey?.toString() !== expectedWallet
    || result.publicKey && result.publicKey.toString() !== expectedWallet
    || !(result.signature instanceof Uint8Array) || result.signature.byteLength !== 64) throw new Error('Wallet changed');
  return btoa(String.fromCharCode(...result.signature));
}
