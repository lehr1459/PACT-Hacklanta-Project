import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {nextEnvironmentConfig} from '../../scripts/validation/environment.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
/** @type {import('next').NextConfig} */
const config={turbopack:{root},outputFileTracingRoot:root};
export default async function nextConfig(phase){return {...config,...await nextEnvironmentConfig({application:'demo',directory:path.dirname(fileURLToPath(import.meta.url)),phase})};}
