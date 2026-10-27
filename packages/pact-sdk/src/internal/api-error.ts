export class PactApiError extends Error {
  readonly name = 'PactApiError';
  constructor(public readonly code: string, message: string, public readonly status = 0) { super(message); }
}
