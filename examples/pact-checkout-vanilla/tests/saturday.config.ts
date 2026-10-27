import original from './playwright.config';

if(!process.env.PACT_EXTERNAL_SATURDAY)throw Error('This optional compatibility lane requires PACT_EXTERNAL_SATURDAY.');
export default {...original,testIgnore:[],testMatch:'saturday.spec.ts',outputDir:'../../../web/test-results/checkout-external-saturday',reporter:[['list'] as const]};
