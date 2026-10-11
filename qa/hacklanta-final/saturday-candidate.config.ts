import path from 'node:path';
import {defineConfig,devices} from '../../web/node_modules/@playwright/test/index.mjs';
const candidate=path.resolve(__dirname,'../../.deployment-candidates/20261010-213948-8755f031/saturday-lights');
export default defineConfig({testDir:'.',testMatch:['saturday-candidate.spec.ts','saturday-workflow.spec.ts','saturday-slip.spec.ts'],workers:1,timeout:20000,outputDir:'../../web/test-results/hacklanta-final/saturday-candidate',reporter:[['list']],use:{baseURL:'http://127.0.0.1:3011',trace:'retain-on-failure'},projects:[{name:'desktop',use:{...devices['Desktop Chrome']}},{name:'mobile',use:{...devices['Pixel 7']}}],webServer:{cwd:candidate,command:'node scripts/serve-local.mjs',env:{PORT:'3011'},url:'http://127.0.0.1:3011',reuseExistingServer:false}});
