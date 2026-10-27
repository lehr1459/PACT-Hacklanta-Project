import type {Metadata} from 'next';
import {DeveloperConsole} from '../../../components/hosted-console/console';
import './developer.css';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Developer console | PACT',
  description: 'Register applications, bind licensing resources and configure server-side PACT REST integration.',
  robots: {index: false, follow: false},
};

export default function DeveloperPage() { return <DeveloperConsole />; }
