import type { NextConfig } from 'next';
import path from 'node:path';
import {realpathSync,existsSync} from 'node:fs';
import {nextEnvironmentConfig} from '../scripts/validation/environment.mjs';

const root = realpathSync(path.resolve(process.cwd(), '..'));
const contracts = existsSync(path.join(root, 'contracts'))?realpathSync(path.join(root, 'contracts')):path.join(root,'contracts');
const relativeContracts = path.relative(root, contracts);
// Windows compatibility checkouts may junction contracts outside the source root.
// Allow only that linked tree; ordinary clones need no additional filesystem root.
const linkedContracts = relativeContracts === '..' || relativeContracts.startsWith(`..${path.sep}`) || path.isAbsolute(relativeContracts);
const config: NextConfig = {
  turbopack: {root},
  ...(linkedContracts ? {experimental: {turbopackAdditionalRoots: {contracts: {path: contracts}}}} : {}),
};
export default async function nextConfig(phase:string){return {...config,...await nextEnvironmentConfig({application:'marketplace',directory:process.cwd(),phase})};}
