'use client';
import { useMemo, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { PhantomWalletAdapter } from '@solana/wallet-adapter-phantom';
import { SolflareWalletAdapter } from '@solana/wallet-adapter-solflare';
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base';
import { boundedSolanaFetch,RPC_URL } from '../lib/solana/rpc';
import type { ConnectionConfig } from '@solana/web3.js';
const connectionConfig:ConnectionConfig={commitment:'confirmed',disableRetryOnRateLimit:true,fetch:boundedSolanaFetch};
export function SolanaProviders({children}: {children: React.ReactNode}) {
  const wallets = useMemo(() => [new PhantomWalletAdapter(), new SolflareWalletAdapter({network: WalletAdapterNetwork.Devnet})], []);
  const [client] = useState(() => new QueryClient({defaultOptions: {queries: {retry: false}}}));
  return <ConnectionProvider endpoint={RPC_URL} config={connectionConfig}><WalletProvider wallets={wallets} autoConnect={false}><QueryClientProvider client={client}>{children}</QueryClientProvider></WalletProvider></ConnectionProvider>;
}
