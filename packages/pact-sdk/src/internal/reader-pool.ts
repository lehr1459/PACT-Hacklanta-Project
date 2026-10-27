import { PlatformError } from '../server-auth.js';
import { READ_TIMEOUT_MS, isRetryableRpcFailure, type ReadContext } from './license-reader.js';

export type ReadOptions = { signal?: AbortSignal };
type Entry = { start(): void; cancel(error: PlatformError): void; closed: boolean };

/** Retry an entire read only after every abandoned task from its prior endpoint settles. */
export async function withReadAttempts<E, T>(parent: ReadContext, endpoints: readonly E[], read: (endpoint: E, context: ReadContext) => Promise<T>): Promise<T> {
  if (endpoints.length === 1) return read(endpoints[0], parent);
  for (let index = 0; index < endpoints.length; index++) {
    parent.check();
    const controller = new AbortController(), pending = new Set<Promise<unknown>>();
    const timeout = new PlatformError('TIMEOUT', 'RPC attempt timed out.', 503);
    const deadline = performance.now() + Math.min(2000, parent.remainingMs?.() ?? READ_TIMEOUT_MS);
    let closed = false, timer: ReturnType<typeof setTimeout> | undefined;
    const abort = () => controller.abort();
    parent.signal.addEventListener('abort', abort, { once: true });
    const context: ReadContext = {
      startedAtMs: parent.startedAtMs, signal: controller.signal,
      check() {
        parent.check();
        if (closed || controller.signal.aborted || performance.now() >= deadline) throw timeout;
      },
      remainingMs: () => Math.max(0, Math.min(parent.remainingMs?.() ?? READ_TIMEOUT_MS, deadline - performance.now())),
      track<P>(promise: Promise<P>): Promise<P> {
        pending.add(promise);
        void promise.then(() => pending.delete(promise), () => pending.delete(promise));
        return parent.track(promise);
      },
    };
    try {
      const task = context.track(Promise.resolve().then(() => { context.check(); return read(endpoints[index], context); }));
      const value = await Promise.race([task, new Promise<never>((_, reject) => {
        timer = setTimeout(() => { closed = true; controller.abort(); reject(timeout); }, Math.max(1, deadline - performance.now()));
      })]);
      context.check();
      return value;
    } catch (error) {
      parent.check();
      if (index + 1 === endpoints.length || error !== timeout && !isRetryableRpcFailure(error)) throw error;
      closed = true; clearTimeout(timer); controller.abort();
      // The parent's five-second deadline still settles its caller while this
      // bounded worker remains quarantined if a provider ignores cancellation.
      while (pending.size) await Promise.allSettled([...pending]);
      parent.check();
    } finally {
      closed = true; clearTimeout(timer); controller.abort();
      parent.signal.removeEventListener('abort', abort);
    }
  }
  throw new PlatformError('RPC_ERROR', 'RPC read failed.', 503);
}

/** Capacity covers executing work AND abandoned transports that have not settled. */
export function createReaderPool(time: () => number, activeLimit: number, queueLimit: number) {
  if (!Number.isSafeInteger(activeLimit) || activeLimit < 1 || activeLimit > 8
    || !Number.isSafeInteger(queueLimit) || queueLimit < 0 || queueLimit > 16) {
    throw new PlatformError('INVALID_INPUT', 'Invalid chain reader capacity.');
  }
  let active = 0;
  const running = new Set<Entry>();
  const queue: Entry[] = [];
  function pump() {
    while (active < activeLimit && queue.length) {
      const entry = queue.shift()!;
      if (!entry.closed) entry.start();
    }
  }

  function operation<T>(fn: (context: ReadContext) => Promise<T>, options: ReadOptions = {}): Promise<T> {
    const signal = options.signal;
    if (signal?.aborted) return Promise.reject(new PlatformError('CANCELLED', 'Chain operation cancelled.', 503));
    if (active >= activeLimit && queue.length >= queueLimit) {
      return Promise.reject(new PlatformError('BUSY', 'Chain operation capacity reached.', 503));
    }
    const startedAtMs = time();
    const deadline = performance.now() + READ_TIMEOUT_MS;
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
          if (entry.closed || controller.signal.aborted || performance.now() >= deadline || time() - startedAtMs >= READ_TIMEOUT_MS) {
            throw new PlatformError('TIMEOUT', 'Chain operation timed out.', 503);
          }
        },
        remainingMs() { return Math.max(0, deadline - performance.now()); },
        track<P>(promise: Promise<P>): Promise<P> {
          pending.add(promise);
          void promise.then(() => pending.delete(promise), () => pending.delete(promise));
          return promise;
        },
      };
      async function start() {
        active++;
        running.add(entry);
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
          running.delete(entry);
          pump();
        }
      }
      timer = setTimeout(() => cancel(new PlatformError('TIMEOUT', 'Chain operation timed out.', 503)), READ_TIMEOUT_MS);
      signal?.addEventListener('abort', onAbort, { once: true });
      if (signal?.aborted) onAbort();
      else if (active < activeLimit) void start();
      else queue.push(entry);
    });
  }
  return Object.assign(operation, { diagnostics() {
    const quarantined = [...running].filter(entry => entry.closed).length;
    return Object.freeze({ inflight: active - quarantined, queued: queue.length, quarantined });
  } });
}
