import {getConsumer} from '../../../lib/consumer';
import {ConsumerRequestError} from '../../../lib/request.mjs';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handle(request: Request) {
  try { return await getConsumer().handle(request); }
  catch (error) {
    if (error instanceof ConsumerRequestError) return Response.json({error: {code: 'INVALID_CONSUMER_HOST'}}, {status: 400,
      headers: {'cache-control': 'no-store', 'referrer-policy': 'no-referrer', 'x-content-type-options': 'nosniff'}});
    return Response.json({error: {code: 'EXAMPLE_CONFIGURATION_REQUIRED'}}, {status: 503,
      headers: {'cache-control': 'no-store', 'referrer-policy': 'no-referrer', 'x-content-type-options': 'nosniff'}});
  }
}
export const GET = handle;
export const POST = handle;
