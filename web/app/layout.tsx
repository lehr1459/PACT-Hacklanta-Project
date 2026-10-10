import type { Metadata } from 'next';
import { Providers } from './providers';
import './globals.css';
export const metadata: Metadata = {title: 'PACT | Digital licenses, verifiable access', description: 'Base Sepolia digital licensing demonstration'};
export default function RootLayout({children}: Readonly<{children: React.ReactNode}>) {
  return <html lang="en"><body><Providers>{children}</Providers></body></html>;
}
