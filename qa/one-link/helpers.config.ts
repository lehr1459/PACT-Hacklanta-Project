import path from 'node:path';
import {defineConfig} from '../../web/node_modules/@playwright/test/index.mjs';
export default defineConfig({testDir:path.resolve(__dirname,'../../web/tests/solana'),testMatch:'purchase-link-helper.spec.ts',workers:1,reporter:[['list']],outputDir:'../../web/test-results/one-link/helpers',timeout:10000});
