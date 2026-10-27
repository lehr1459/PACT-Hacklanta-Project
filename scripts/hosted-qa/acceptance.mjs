// Exit zero alone is not acceptance: skips and stale output must fail closed.
export function nodeReceipt(output,minimum=1){
 const count=label=>{const matches=[...output.matchAll(new RegExp('[#ℹ]\\s+'+label+' (\\d+)\\b','g'))];if(matches.length!==1)throw Error('Missing or ambiguous test receipt');return Number(matches[0][1]);};
 const tests=count('tests'),passed=count('pass');
 if(tests<minimum||passed!==tests||count('fail')!==0||count('cancelled')!==0||count('skipped')!==0||count('todo')!==0)throw Error('Mandatory tests cannot be empty, skipped or incomplete');
 return{tests,passed};
}
export function browserReceipt(r,{revision,runId,lane}){
 if(r.schemaVersion!==1||r.kind!=='hosted-browser-receipt'||r.rawDiagnosticsRecorded!==false||r.revision!==revision||r.runId!==runId||r.buildRevision!==revision||r.buildRunId!==runId
  ||r.status!=='passed'||r.stats?.unexpected!==0||r.stats?.skipped!==0||r.stats?.expected!==(lane==='console'?16:12)||r.runnerErrors!==0)throw Error('Incomplete or stale browser acceptance');
 return true;
}
export const developerDemoNames=Object.freeze([
 'packedPackagesInstalledOutsideRepository','installedRegistryDependenciesMatchReviewedLock','threeDistinctSyntheticWalletIdentities',
 'publicHttpRegistrationAndWalletAuthentication','foreignSellerBindingDenied','sellerOwnershipVerifiedAndResourceBound',
 'exactCallbackScopedCredentialAndActivation','unrelatedTenantCannotReadApplication','backendOperationDeniesAnonymousCaller',
 'buyerStatePkceExchangeAndBackendGrantRetention','foreignApplicationWalletGrantCannotBeReused','authenticatedUnlicensedBackendOperationsDenied',
 'syntheticEntitlementAllowsActualBackendReadAndEffect','authorizationCodeReplayDoesNotMintAuthority','grantRevocationAndLocalInvalidationDeny',
 'credentialRevocationDeniesPreviouslyLicensedConsumer','readOnlySyntheticRpcNoTransactions']);
export function developerDemoReceipt(r,revision){
 if(r?.schemaVersion!==1||r.kind!=='independent-packed-developer-demo'||r.sourceRevision!==revision
  ||!/^[a-f0-9]{64}$/.test(r.sourceArchiveSha256??'')
  ||r.trackedWorkingTreeClean!==true||r.status!=='PASS'||r.synthetic!==true||r.blockchainPurchases!==0
  ||r.networkTransactions!==0||r.externalPublication!==false||r.checkCount!==17
  ||JSON.stringify(Object.keys(r.checks??{}).sort())!==JSON.stringify([...developerDemoNames].sort())||Object.values(r.checks).some(value=>value!=='PASS')
  ||JSON.stringify(Object.keys(r.archives??{}).sort())!==JSON.stringify(['client','engine','express'])
  ||Object.values(r.archives).some(value=>!/^[a-f0-9]{64}$/.test(value?.sha256??'')))throw Error('Incomplete or stale independent developer demonstration');
 return true;
}
export const matrixNames=Object.freeze(['contract-drift','reporting-policy',
 'packages-pact-hosted-client-tests','examples-pact-hosted-common-tests','examples-pact-hosted-express-tests','examples-pact-hosted-next-tests','examples-pact-hosted-rest-tests',
 'api-unit','hosted-dependency-policy','dependency-policy-tests','packed-client','next-route-types','next-typecheck','next-production-build','console-production-build','native-postgres-http','independent-developer-demo','browser-console','audit-console','browser-connect','audit-connect']);
export function matrixReceipt(r){
 if(r.mode!=='all')throw Error('Only complete matrix is exportable');
 if(r.status==='passed'&&(JSON.stringify(r.results.map(x=>x.name))!==JSON.stringify(matrixNames)||r.results.some(x=>x.status!=='passed')))throw Error('Incomplete or contradictory passed matrix');
 return true;
}
export function generatedReferences(source){
 const expected='/// <reference types="next" />\n/// <reference types="next/image-types/global" />\nimport "./.next/types/routes.d.ts";\nimport "./.next/types/root-params.d.ts";\n\n// NOTE: This file should not be edited\n// see https://nextjs.org/docs/app/api-reference/config/typescript for more information.\n';
 if(source.replaceAll('\r\n','\n').replaceAll('./.next/dev/','./.next/')!==expected)throw Error('Unexpected generated Next reference content');
 return true;
}
