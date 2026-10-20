import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export default {
  turbopack: {root}, outputFileTracingRoot: root,
  serverExternalPackages: ['@pact/hosted-client', '@pact/hosted-example-server'],
  logging: {incomingRequests: false, fetches: {fullUrl: false}, browserToTerminal: false, serverFunctions: false},
  async headers() { return [{source: '/:path*', headers: [
    {key: 'Cache-Control', value: 'no-store'}, {key: 'Referrer-Policy', value: 'no-referrer'},
    {key: 'X-Content-Type-Options', value: 'nosniff'}, {key: 'X-Frame-Options', value: 'DENY'},
  ]}]; },
};
