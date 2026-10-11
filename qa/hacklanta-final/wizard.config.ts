import path from 'node:path';
import original from '../../web/tests/integration/playwright.config';
export default {...original,testDir:path.resolve(__dirname,'../../web/tests/integration'),outputDir:path.resolve(__dirname,'../../web/test-results/hacklanta-final/wizard'),reporter:[['list']],use:{...original.use,baseURL:'http://127.0.0.1:3010'},webServer:{...original.webServer,cwd:path.resolve(__dirname,'../../web'),command:'node ../qa/hacklanta-final/wizard-server.mjs',url:'http://127.0.0.1:3010'}};
