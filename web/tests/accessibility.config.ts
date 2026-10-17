import path from 'node:path';
import {defineConfig,devices} from '@playwright/test';

// One fixture production build, focused tests only. Full existing lanes retain these cases.
export default defineConfig({
 testDir:'.',testMatch:['**/tests/browser.spec.ts','**/tests/solana/browser.spec.ts','**/tests/integration/wizard.spec.ts'],
 grep:/@accessibility/,workers:1,fullyParallel:false,timeout:35000,expect:{timeout:10000},
 outputDir:'../test-results/accessibility-web',reporter:[['list']],
 use:{baseURL:'http://127.0.0.1:3002',trace:'retain-on-failure',screenshot:'only-on-failure'},
 projects:[{name:'desktop-accessibility',use:{...devices['Desktop Chrome']}},{name:'mobile-accessibility',use:{...devices['Pixel 7']}}],
 webServer:{cwd:path.resolve(__dirname,'..'),command:'node tests/solana/start-server.mjs',url:'http://127.0.0.1:3002',reuseExistingServer:false,timeout:180000,
  env:{PACT_ENV_PROFILE:'test',PACT_SOLANA_QA_MODE:'mock',PACT_QA_MODE:'mock',PACT_INTEGRATION_QA_MODE:'mock',NEXT_PUBLIC_PACT_CONTRACT_ADDRESS:'0x4444444444444444444444444444444444444444',NEXT_PUBLIC_RPC_URL:'http://127.0.0.1:8547'}},
});
