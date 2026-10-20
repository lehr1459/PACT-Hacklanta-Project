import express from 'express';
import {createServer} from 'node:http';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {Readable} from 'node:stream';
import {createPactClient} from '@pact/hosted-client';
import {createConsumerApp, readConsumerConfig} from '@pact/hosted-example-server';

/** Trusted factory options are test/operator interfaces, never HTTP parameters. */
export function createExpressExample({config, client}) {
  const consumer = createConsumerApp({...config, client});
  const app = express();
  app.disable('x-powered-by'); app.set('trust proxy', false);
  app.use((req, res, next) => {
    res.set({'cache-control': 'no-store', 'referrer-policy': 'no-referrer', 'x-content-type-options': 'nosniff',
      'x-frame-options': 'DENY', 'content-security-policy': "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'"});
    if (req.headers.host !== new URL(config.origin).host) return res.status(400).json({error: {code: 'INVALID_HOST'}});
    next();
  });
  app.use('/api', async (req, res) => {
    try {
      const target = new URL(req.originalUrl, config.origin);
      if (target.origin !== config.origin || !target.pathname.startsWith('/api/')) throw Error();
      const headers = new Headers();
      for (const name of ['cookie', 'origin', 'x-pact-csrf', 'content-type', 'content-length']) {
        if (typeof req.headers[name] === 'string') headers.set(name, req.headers[name]);
      }
      const controller = new AbortController(); req.once('aborted', () => controller.abort());
      const request = new Request(target, {method: req.method, headers, signal: controller.signal,
        ...(!['GET', 'HEAD'].includes(req.method) ? {body: Readable.toWeb(req), duplex: 'half'} : {})});
      const response = await consumer.handle(request);
      res.status(response.status);
      for (const [name, value] of response.headers) if (name !== 'set-cookie') res.set(name, value);
      for (const value of response.headers.getSetCookie()) res.append('set-cookie', value);
      if (!req.complete) {
        res.set('connection', 'close'); res.once('finish', () => req.destroy());
      }
      res.send(Buffer.from(await response.arrayBuffer()));
    } catch { res.status(503).json({error: {code: 'APP_UNAVAILABLE'}}); }
  });
  const publicDirectory = fileURLToPath(new URL('./public/', import.meta.url));
  app.use(express.static(publicDirectory, {etag: false, lastModified: false, maxAge: 0}));
  app.use((_req, res) => res.status(404).json({error: {code: 'NOT_FOUND'}}));
  app.use((_error, _req, res, _next) => res.status(400).json({error: {code: 'INVALID_BODY'}}));
  return {app, consumer};
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const config = readConsumerConfig();
    const client = createPactClient({origin: config.pactOrigin, apiKey: config.apiKey, appId: config.appId});
    const {app} = createExpressExample({config, client});
    const server = createServer({maxHeaderSize: 8192, requestTimeout: 10000, headersTimeout: 10000, keepAliveTimeout: 5000}, app);
    server.maxRequestsPerSocket = 100;
    const url = new URL(config.origin);
    server.listen(Number(url.port || (url.protocol === 'https:' ? 443 : 80)), '127.0.0.1', () => {
      process.stdout.write('PACT Express consumer started on configured loopback listener.\n');
    });
  } catch { process.stderr.write('EXAMPLE_CONFIGURATION_REQUIRED: use the README and a private server environment.\n'); process.exitCode = 1; }
}
