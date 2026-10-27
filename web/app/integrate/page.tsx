import type { Metadata } from 'next';
import { IntegrationWizard } from '../../components/integration-wizard';
import './integrate.css';
import './hosted-entry.css';

export const metadata: Metadata = {
  title: 'Integrate your app | PACT',
  description: 'Prepare a Solana Devnet PACT licensing integration for a Next.js or React application.',
};

export default function IntegratePage() {
  return <><section className="hosted-entry" aria-labelledby="hosted-entry-heading"><div><p className="eyebrow">HOSTED API / RECOMMENDED</p><h2 id="hosted-entry-heading">Bring PACT licensing to your backend.</h2><p>Register an application, prove seller control, create scoped credentials and connect wallet sign-in through the developer console. Keep your source code in your own project. Your backend enforces fresh licensing decisions.</p><div className="hosted-entry-actions"><a className="button dark" href="/integrate/developer">Open hosted API console</a><a className="button subtle" href="#self-hosted">Use self-hosted SDK instead</a></div><p className="fine">Solana Devnet pilot. Hosted service configuration is required. No publication, wallet transaction or source upload occurs here.</p></div></section><div id="self-hosted"><IntegrationWizard /></div></>;
}
