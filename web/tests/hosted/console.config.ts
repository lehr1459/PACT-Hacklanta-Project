import path from 'node:path';
import {defineConfig,devices} from '@playwright/test';

// The pinned runner otherwise captures ARIA page snapshots on errors, even with trace off.
process.env.PLAYWRIGHT_NO_COPY_PROMPT='1';
export default defineConfig({
 testDir:'.',testMatch:'console.spec.ts',workers:1,fullyParallel:false,timeout:60000,expect:{timeout:12000},
 outputDir:'../../test-results/hosted-console',reporter:[['./console-reporter.ts',{outputFile:path.resolve(__dirname,'../../test-results/hosted-console/results.json')}]],
 use:{baseURL:'http://127.0.0.1:3112',trace:'off',video:'off',screenshot:'off',actionTimeout:15000},
 projects:[{name:'desktop-console',use:{...devices['Desktop Chrome']}},{name:'narrow-console',use:{...devices['Desktop Chrome'],viewport:{width:320,height:740}}}],
 webServer:{cwd:path.resolve(__dirname,'../..'),command:'node tests/hosted/start-server.mjs',url:'http://127.0.0.1:3113/qa/ready',
  reuseExistingServer:false,timeout:120000,env:{PACT_HOSTED_QA_CLEAN:'1',PLAYWRIGHT_NO_COPY_PROMPT:'1'}},
});
