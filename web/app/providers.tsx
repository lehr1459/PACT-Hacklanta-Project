'use client';
import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider, createConfig, http } from 'wagmi';
import { injected } from 'wagmi/connectors';
import { baseSepolia } from 'wagmi/chains';
const config = createConfig({chains: [baseSepolia], connectors: [injected()], ssr: true, transports: {[baseSepolia.id]: http(process.env.NEXT_PUBLIC_RPC_URL || 'https://sepolia.base.org')}});
export function Providers({children}: {children: React.ReactNode}) {
  const [queryClient] = useState(() => new QueryClient({defaultOptions: {queries: {retry: 1, refetchOnWindowFocus: true}}}));
  return <WagmiProvider config={config}><QueryClientProvider client={queryClient}>{children}</QueryClientProvider></WagmiProvider>;
}
