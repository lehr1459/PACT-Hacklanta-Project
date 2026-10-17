import { PlatformError } from '../server-auth.js';
import { READ_TIMEOUT_MS, type ReadContext } from './license-reader.js';

export type ReadOptions = { signal?: AbortSignal };
type Entry = { start(): void; cancel(error: PlatformError): void; closed: boolean };

/** Capacity covers executing work AND abandoned transports that have not settled. */
export function createReaderPool(time: () => number, activeLimit: number, queueLimit: number) {
  if (!Number.isSafeInteger(activeLimit) || activeLimit < 1 || activeLimit > 8
    || !Number.isSafeInteger(queueLimit) || queueLimit < 0 || queueLimit > 16) {
    throw new PlatformError('INVALID_INPUT', 'Invalid chain reader capacity.');
  }
  let active = 0;
  const queue: Entry[] = [];
  function pump() {
    while (active < activeLimit && queue.length) {
      const entry = queue.shift()!;
      if (!entry.closed) entry.start();
    }
  }

  return function operation<T>(fn: (context: ReadContext) => Promise<T>, options: ReadOptions = {}): Promise<T> {
    const signal = options.signal;
    if (signal?.aborted) return Promise.reject(new PlatformError('CANCELLED', 'Chain operation cancelled.', 503));
    if (active >= activeLimit && queue.length >= queueLimit) {
      return Promise.reject(new PlatformError('BUSY', 'Chain operation capacity reached.', 503));
    }
    const startedAtMs = time();
    return new Promise<T>((resolve, reject) => {
      const controller = new AbortController();
      const pending = new Set<Promise<unknown>>();
      let timer: ReturnType<typeof setTimeout>;
      let settled = false;
      const entry: Entry = { closed: false, start, cancel };
      const onAbort = () => cancel(new PlatformError('CANCELLED', 'Chain operation cancelled.', 503));
      function cleanup() { clearTimeout(timer); signal?.removeEventListener('abort', onAbort); }
      function finish(success: boolean, value: unknown) {
        if (settled) return;
        settled = true;
        entry.closed = true;
        cleanup();
        controller.abort();
        if (success) resolve(value as T); else reject(value);
      }
      function cancel(error: PlatformError) {
        const index = queue.indexOf(entry);
        if (index >= 0) queue.splice(index, 1);
        finish(false, error);
      }
      const context: ReadContext = {
        startedAtMs, signal: controller.signal,
        check() {
          if (entry.closed || controller.signal.aborted || time() - startedAtMs >= READ_TIMEOUT_MS) {
            throw new PlatformError('TIMEOUT', 'Chain operation timed out.', 503);
          }
        },
        track<P>(promise: Promise<P>): Promise<P> {
          pending.add(promise);
          void promise.then(() => pending.delete(promise), () => pending.delete(promise));
          return promise;
        },
      };
      async function start() {
        active++;
        try {
          context.check();
          const value = await fn(context);
          context.check();
          finish(true, value);
        } catch (error) {
          finish(false, error);
        } finally {
          // Cancellation settles the caller promptly. It never frees a slot while a
          // custom fetch, body read or stream cancellation still ignores abort.
          while (pending.size) await Promise.allSettled([...pending]);
          active--;
          pump();
        }
      }
      timer = setTimeout(() => cancel(new PlatformError('TIMEOUT', 'Chain operation timed out.', 503)), READ_TIMEOUT_MS);
      signal?.addEventListener('abort', onAbort, { once: true });
      if (signal?.aborted) onAbort();
      else if (active < activeLimit) void start();
      else queue.push(entry);
    });
  };
}
