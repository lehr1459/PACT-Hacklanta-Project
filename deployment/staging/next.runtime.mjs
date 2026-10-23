// Start-only wrapper: validate the saved hosted binding using the existing resolver.
// Never use this file to create a build or replace its saved public provenance.
import {nextEnvironmentConfig} from './scripts/validation/environment.mjs';
export default async function configuration(phase) {
  if (phase !== 'phase-production-server') throw Error('Staging runtime config is start-only');
  return nextEnvironmentConfig({application: 'marketplace', directory: process.cwd(), phase});
}
