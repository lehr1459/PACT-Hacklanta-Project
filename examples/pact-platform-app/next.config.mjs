import path from 'node:path';import {fileURLToPath} from 'node:url';
import {nextEnvironmentConfig} from '../../scripts/validation/environment.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
export default async function nextConfig(phase){return {turbopack:{root},outputFileTracingRoot:root,...await nextEnvironmentConfig({application:'platform',directory:path.dirname(fileURLToPath(import.meta.url)),phase})};}
