// TransactionError is a non-exhaustive serde enum: unit variants are strings,
// data variants are single-key objects. Keep future variants bounded, not freeform.
// https://github.com/anza-xyz/solana-sdk/blob/master/transaction-error/src/lib.rs
export function isTransactionError(value: unknown): boolean {
  const name = (text: string) => /^[A-Z][A-Za-z0-9]{0,95}$/.test(text);
  const object = (item: unknown): item is Record<string, unknown> => !!item && typeof item === 'object' && !Array.isArray(item)
    && [Object.prototype, null].includes(Object.getPrototypeOf(item));
  const unsigned = (item: unknown, maximum: number) => typeof item === 'number' && Number.isSafeInteger(item) && item >= 0 && item <= maximum;
  function bounded(item: unknown, depth: number): boolean {
    if (depth > 6) return false;
    if (item === null || typeof item === 'boolean') return true;
    if (typeof item === 'number') return Number.isSafeInteger(item) && item >= 0;
    if (typeof item === 'string') return item.length <= 512;
    if (Array.isArray(item)) return item.length <= 16 && item.every(part => bounded(part, depth + 1));
    return object(item) && Object.keys(item).length <= 16 && Object.entries(item).every(([key, part]) =>
      /^[A-Za-z_][A-Za-z0-9_]{0,95}$/.test(key) && !['__proto__', 'constructor', 'prototype'].includes(key) && bounded(part, depth + 1));
  }
  function instruction(item: unknown): boolean {
    if (typeof item === 'string') return name(item) && item !== 'Custom';
    if (!object(item) || Object.keys(item).length !== 1) return false;
    const [variant] = Object.keys(item);
    if (variant === 'Custom') return unsigned(item.Custom, 4294967295);
    return name(variant) && bounded(item[variant], 0);
  }
  try {
    if (typeof value === 'string') return name(value) && !['InstructionError','DuplicateInstruction','InsufficientFundsForRent','ProgramExecutionTemporarilyRestricted'].includes(value);
    if (!object(value)) return false;
    const keys = Object.keys(value);
    if (keys.length !== 1 || !name(keys[0]) || !bounded(value[keys[0]], 0) || new TextEncoder().encode(JSON.stringify(value)).byteLength > 4096) return false;
    const variant = keys[0], data = value[variant];
    if (variant === 'InstructionError') return Array.isArray(data) && data.length === 2 && unsigned(data[0],255) && instruction(data[1]);
    if (variant === 'DuplicateInstruction') return unsigned(data,255);
    if (variant === 'InsufficientFundsForRent' || variant === 'ProgramExecutionTemporarilyRestricted') return object(data) && Object.keys(data).length === 1 && unsigned(data.account_index,255);
    return true;
  } catch { return false; }
}
