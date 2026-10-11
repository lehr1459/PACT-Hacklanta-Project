import path from 'node:path';
import {defineConfig,devices} from '@playwright/test';
const mode=process.env.PACT_INTEGRATION_QA_MODE??'mock';
export default defineConfig({testDir:'.',testIgnore:'generated.spec.ts',workers:1,timeout:45000,expect:{timeout:10000},outputDir:`../../test-results/integration-${mode}`,reporter:[['list'],['html',{open:'never',outputFolder:`../../playwright-report/integration-${mode}`}]],use:{baseURL:'http://127.0.0.1:3006',trace:'retain-on-failure',screenshot:'only-on-failure'},projects:[{name:'desktop-integration',use:{...devices['Desktop Chrome']}},{name:'mobile-integration',use:{...devices['Pixel 7']}}],webServer:{cwd:path.resolve(__dirname,'../..'),command:'node tests/integration/start-server.mjs',url:'http://127.0.0.1:3006',reuseExistingServer:false,timeout:180000}});

