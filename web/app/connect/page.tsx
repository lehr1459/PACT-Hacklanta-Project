import type {Metadata} from 'next';
import {HostedConnect} from '../../components/hosted-console/connect';
import './connect.css';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Connect your wallet | PACT',
  description: 'Review an application request and sign in with a Solana Devnet wallet.',
  robots: {index: false, follow: false},
};

export default async function ConnectPage({searchParams}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const transactionId = typeof params.transactionId === 'string'
    && /^con_[a-f0-9]{32}$/.test(params.transactionId) ? params.transactionId : null;
  return <HostedConnect transactionId={transactionId} />;
}
