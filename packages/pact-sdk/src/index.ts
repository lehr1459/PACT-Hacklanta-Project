import {
  createReadEngine, createEndpointHistory, PactError, isLicenseStatusFresh,
  READ_TIMEOUT_MS, type LicenseInput, type LicenseStatus, type PactClientOptions,
  type ReadContext,
} from './internal/license-reader.js';

export {
  PACT_PROGRAM_ID, DEVNET_GENESIS, DEFAULT_RPC_URL, FRESHNESS_MS,
  SLOT_PROGRESS_MS, READ_TIMEOUT_MS, PactError, isLicenseStatusFresh,
} from './internal/license-reader.js';
export type { PactErrorCode, LicenseInput, LicenseStatus, PactClientOptions } from './internal/license-reader.js';

export interface PactClient {
  getLicenseStatus(input: LicenseInput): Promise<LicenseStatus>;
  verifyLicense(input: LicenseInput): Promise<boolean>;
  requireLicense(input: LicenseInput): Promise<LicenseStatus>;
}

/** The browser verifier retains its single-read contract and private history. */
export function createPactClient(options: PactClientOptions = {}): PactClient {
  const engine = createReadEngine(options, createEndpointHistory(false));
  let busy = false;
  async function getLicenseStatus(input: LicenseInput): Promise<LicenseStatus> {
    const captured = { offer: input?.offer, wallet: input?.wallet };
    if (busy) throw new PactError('RPC_ERROR', 'A license read is already in progress.');
    busy = true;
    const controller = new AbortController();
    let closed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const startedAtMs = engine.time();
      const context: ReadContext = {
        startedAtMs, signal: controller.signal,
        check() {
          if (closed || controller.signal.aborted || engine.time() - startedAtMs >= READ_TIMEOUT_MS) {
            throw new PactError('TIMEOUT', 'License read timed out.');
          }
        },
        track: promise => promise,
      };
      return await Promise.race([
        engine.snapshot(context, captured).then(snapshot => snapshot.status),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            closed = true;
            controller.abort();
            reject(new PactError('TIMEOUT', 'License read timed out.'));
          }, READ_TIMEOUT_MS);
        }),
      ]);
    } catch (error) {
      if (error instanceof PactError) throw error;
      throw new PactError('RPC_ERROR', 'License read failed.');
    } finally {
      closed = true;
      clearTimeout(timer);
      controller.abort();
      busy = false;
    }
  }
  return {
    getLicenseStatus,
    async verifyLicense(input) {
      try { return isLicenseStatusFresh(await getLicenseStatus(input), engine.time()); }
      catch { return false; }
    },
    async requireLicense(input) {
      const status = await getLicenseStatus(input);
      if (!isLicenseStatusFresh(status, engine.time())) throw new PactError('LICENSE_REQUIRED', 'An active license is required.');
      return status;
    },
  };
}
