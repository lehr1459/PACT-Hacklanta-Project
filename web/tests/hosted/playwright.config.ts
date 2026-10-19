import path from 'node:path';
import {defineConfig,devices} from '@playwright/test';
export default defineConfig({
 testDir:'.',testMatch:'connect.spec.ts',workers:1,fullyParallel:false,timeout:45000,expect:{timeout:12000},
 outputDir:'../../test-results/hosted-connect',reporter:[['list'],['json',{outputFile:'../../test-results/hosted-connect/results.json'}]],
 use:{baseURL:'http://127.0.0.1:3112',trace:'retain-on-failure',screenshot:'only-on-failure'},
 projects:[{name:'desktop-connect',use:{...devices['Desktop Chrome']}},{name:'narrow-connect',use:{...devices['Desktop Chrome'],viewport:{width:320,height:740}}}],
 webServer:{cwd:path.resolve(__dirname,'../..'),command:'node tests/hosted/start-server.mjs',url:'http://127.0.0.1:3113/qa/ready',
  reuseExistingServer:false,timeout:120000,env:{PACT_HOSTED_QA_CLEAN:'1'}},
});
