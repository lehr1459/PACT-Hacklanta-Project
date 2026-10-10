import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {title: 'PACT | Digital licenses, verifiable access', description: 'Solana Devnet digital licensing demonstration'};
export default function RootLayout({children}: Readonly<{children: React.ReactNode}>) {
  return <html lang="en"><body>{children}</body></html>;
}
