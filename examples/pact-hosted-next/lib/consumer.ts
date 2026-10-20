import 'server-only';
import {createPactClient} from '@pact/hosted-client';
import {createConsumerApp, readConsumerConfig} from '@pact/hosted-example-server';
import {normalizeConsumerRequest} from './request.mjs';

// One persistent Node process only. No shared/distributed session-store claim.
let consumer: ReturnType<typeof createConsumerApp> | undefined;
export function getConsumer() {
  if (!consumer) {
    const config = readConsumerConfig();
    const client = createPactClient({origin: config.pactOrigin, apiKey: config.apiKey, appId: config.appId});
    const engine = createConsumerApp({...config, client});
    consumer = Object.freeze({handle: (request: Request) => engine.handle(normalizeConsumerRequest(request, config.origin)), diagnostics: engine.diagnostics});
  }
  return consumer;
}
