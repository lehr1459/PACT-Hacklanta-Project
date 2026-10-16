import type { NextConfig } from 'next';
import path from 'node:path';
import {realpathSync} from 'node:fs';

const root = realpathSync(path.resolve(process.cwd(), '..'));
const contracts = realpathSync(path.join(root, 'contracts'));
const relativeContracts = path.relative(root, contracts);
// Windows compatibility checkouts may junction contracts outside the source root.
// Allow only that linked tree; ordinary clones need no additional filesystem root.
const linkedContracts = relativeContracts === '..' || relativeContracts.startsWith(`..${path.sep}`) || path.isAbsolute(relativeContracts);
const config: NextConfig = {
  turbopack: {root},
  ...(linkedContracts ? {experimental: {turbopackAdditionalRoots: {contracts: {path: contracts}}}} : {}),
};
export default config;
