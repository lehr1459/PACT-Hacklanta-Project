export const browserFailureCodes: readonly string[];
export type BrowserFailureDiagnostics = {
 schemaVersion: 1;
 apiFailures: {entries: {code: string; status: number; count: number}[]; dropped: number};
 service: {available: false} | {
  available: true;
  clock: {available: boolean; windowMs: 100; writes: number; totalWriteMs: number; maxWriteMs: number};
  http: {active: number; access: number; auth: number; control: number};
  database: {pending: number; protectedPending: number; maxPending: number; perLaneLimit: number; closed: boolean};
 };
};
export function browserFailureDiagnostics(value: unknown): BrowserFailureDiagnostics;
