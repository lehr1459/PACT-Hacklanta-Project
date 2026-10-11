import type { Metadata } from 'next';
import { IntegrationWizard } from '../../components/integration-wizard';
import './integrate.css';

export const metadata: Metadata = {
  title: 'Integrate your app | PACT',
  description: 'Prepare a Solana Devnet PACT licensing integration for a Next.js or React application.',
};

export default function IntegratePage() {
  return <IntegrationWizard />;
}
