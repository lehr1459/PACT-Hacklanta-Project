import {proxyHostedRequest} from '../../../lib/hosted-gateway.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function handle(request: Request) {
  return proxyHostedRequest(request, {upstream: process.env.PACT_HOSTED_API_INTERNAL_URL});
}

export const GET = handle;
export const POST = handle;
export const PATCH = handle;
export const DELETE = handle;
export const OPTIONS = handle;
export const HEAD = handle;
