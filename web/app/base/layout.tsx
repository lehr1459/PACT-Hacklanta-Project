import type { Metadata } from 'next';
import { Providers } from '../providers';
export const metadata: Metadata = {title: 'PACT | Base Sepolia fallback', description: 'Preserved Base Sepolia digital licensing demonstration'};
export default function BaseLayout({children}: {children: React.ReactNode}) {return <Providers>{children}</Providers>;}
