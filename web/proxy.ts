import {randomBytes} from 'node:crypto';
import {NextResponse, type NextRequest} from 'next/server';

// Only the hosted login/console HTML boundary. Existing marketplace routes retain their current behavior.
export function proxy(request: NextRequest) {
  const nonce = randomBytes(32).toString('base64');
  const development = process.env.NODE_ENV === 'development';
  const policy = [
    "default-src 'none'",
    `script-src 'nonce-${nonce}' 'strict-dynamic'${development ? " 'unsafe-eval'" : ''}`,
    `style-src 'self' 'nonce-${nonce}'`,
    `connect-src 'self'${development ? ' ws: wss:' : ''}`,
    "img-src 'self' data:", "font-src 'self'", "object-src 'none'", "base-uri 'none'",
    "form-action 'self'", "frame-ancestors 'none'",
    ...(request.nextUrl.protocol === 'https:' ? ['upgrade-insecure-requests'] : []),
  ].join('; ');
  const headers = new Headers(request.headers);
  // Replace caller-supplied nonce/CSP; Next applies this fresh nonce to dynamic framework scripts.
  headers.set('x-nonce', nonce);
  headers.set('content-security-policy', policy);
  const response = NextResponse.next({request: {headers}});
  response.headers.set('content-security-policy', policy);
  response.headers.set('cache-control', 'no-store');
  response.headers.set('referrer-policy', 'no-referrer');
  response.headers.set('x-content-type-options', 'nosniff');
  response.headers.set('x-frame-options', 'DENY');
  return response;
}

export const config = {matcher: ['/connect', '/integrate/developer/:path*']};
