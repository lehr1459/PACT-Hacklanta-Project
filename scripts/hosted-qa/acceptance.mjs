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
// Test-only failure observations. No arbitrary server strings cross this boundary.
export const browserFailureCodes=Object.freeze(['UNCLASSIFIED','AUTH_REQUIRED','AUTH_INVALID','AUTH_PROOF_INVALID','ACTION_PROOF_INVALID',
 'API_KEY_INVALID','API_KEY_SCOPE_DENIED','GRANT_INVALID','ORIGIN_DENIED','CSRF_DENIED','INVALID_INPUT','NOT_FOUND',
 'SERVICE_UNAVAILABLE','DATABASE_UNAVAILABLE','REQUEST_DEADLINE','OVERLOADED','RATE_LIMITED',
 'CLOCK_UNAVAILABLE','CLOCK_STORAGE_UNAVAILABLE','CLOCK_STORAGE_OVERRUN','CLOCK_RECORD_INVALID','CLOCK_BINDING_MISMATCH',
 'CLOCK_CONTEXT_MISMATCH','CLOCK_RESTART_QUARANTINED','CLOCK_OWNER_LOCKED','CLOCK_DATABASE_DURABILITY_REQUIRED','CLOCK_DIRECTORY_REQUIRED','CLOCK_CONFIGURATION_REQUIRED',
 'CHAIN_UNAVAILABLE','STALE_CHAIN','APP_DISABLED','POLICY_CHANGED','RESOURCE_NOT_FOUND','RESOURCE_DISABLED','LICENSE_REQUIRED','EXPIRED']);
export function browserFailureDiagnostics(value){
 const reject=()=>{throw Error('Ineligible bounded browser diagnosis');};
 const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
 const integer=(v,min,max)=>Number.isSafeInteger(v)&&v>=min&&v<=max;
 const boolean=v=>{if(typeof v!=='boolean')reject();return v;};
 const fields=(v,names,max)=>{
  if(!object(v))reject();const result={};
  for(const name of names){if(!integer(v[name],0,max))reject();result[name]=v[name];}return result;
 };
 if(!object(value)||value.schemaVersion!==1||!object(value.apiFailures)||!Array.isArray(value.apiFailures.entries)
  ||value.apiFailures.entries.length>16||!integer(value.apiFailures.dropped,0,9999)||!object(value.service))reject();
 const seen=new Set(),entries=value.apiFailures.entries.map(entry=>{
  if(!object(entry)||!browserFailureCodes.includes(entry.code)||!integer(entry.status,400,599)||!integer(entry.count,1,9999))reject();
  const id=entry.code+':'+entry.status;if(seen.has(id))reject();seen.add(id);
  return{code:entry.code,status:entry.status,count:entry.count};
 });
 let service={available:boolean(value.service.available)};
 if(service.available){
  const clock=value.service.clock,database=value.service.database;
  if(!object(clock)||clock.windowMs!==100||!integer(clock.writes,0,1e9)||!object(database))reject();
  const times={};for(const name of['totalWriteMs','maxWriteMs']){
   if(typeof clock[name]!=='number'||!Number.isFinite(clock[name])||clock[name]<0||clock[name]>1e9)reject();times[name]=clock[name];
  }
  if(!integer(database.maxPending,2,64)||!integer(database.perLaneLimit,1,32))reject();
  service={available:true,clock:{available:boolean(clock.available),windowMs:100,writes:clock.writes,...times},
   http:fields(value.service.http,['active','access','auth','control'],128),
   database:{...fields(database,['pending','protectedPending'],64),maxPending:database.maxPending,perLaneLimit:database.perLaneLimit,closed:boolean(database.closed)}};
 }
 return{schemaVersion:1,apiFailures:{entries,dropped:value.apiFailures.dropped},service};
}
// Failure diagnosis must never export matcher values, messages, paths or stdout.
export function browserFailureReceipt(r,{revision,runId,lane}){
 const maximum=lane==='console'?16:lane==='connect'?12:0;
 const integer=(value,limit)=>Number.isSafeInteger(value)&&value>=0&&value<=limit;
 if(!maximum||r?.schemaVersion!==1||r.kind!=='hosted-browser-receipt'||r.rawDiagnosticsRecorded!==false
  ||r.revision!==revision||r.buildRevision!==revision||r.runId!==runId||r.buildRunId!==runId
  ||!['failed','timedout','interrupted'].includes(r.status)||!Array.isArray(r.tests)||r.tests.length>maximum
  ||!integer(r.runnerErrors,100)||!['expected','unexpected','skipped'].every(key=>integer(r.stats?.[key],maximum))
  ||r.stats.expected+r.stats.unexpected+r.stats.skipped!==r.tests.length)throw Error('Ineligible browser failure summary');
 const projects=lane==='console'?['desktop-console','narrow-console']:['desktop-connect','narrow-connect'];
 const files=['console.spec.ts','console-fixtures.ts','connect.spec.ts'];
 const cases=r.tests.filter(item=>item.status!=='passed'&&item.status!=='skipped').map(item=>{
  if(item.file!==lane+'.spec.ts'||!projects.includes(item.project)||!['failed','timedOut','interrupted'].includes(item.status)
   ||!integer(item.line,100000)||item.line<1||!integer(item.durationMs,600000))throw Error('Ineligible browser case');
  const locations=item.failureLocations??[];
  if(!Array.isArray(locations)||locations.length>8)throw Error('Ineligible browser locations');
  return{project:projects.indexOf(item.project),testLine:item.line,status:item.status,durationMs:item.durationMs,
   ...(Object.hasOwn(item,'failureDiagnostics')?{diagnostics:browserFailureDiagnostics(item.failureDiagnostics)}:{}),locations:locations.map(location=>{
   if(!files.includes(location?.file)||!integer(location.line,100000)||location.line<1||!integer(location.column,10000)||location.column<1)throw Error('Ineligible browser location');
   return{file:files.indexOf(location.file),line:location.line,column:location.column};
  })};
 });
 return{kind:'hosted-browser-failure-summary',revision,runId,lane,status:r.status,stats:{expected:r.stats.expected,unexpected:r.stats.unexpected,skipped:r.stats.skipped},runnerErrors:r.runnerErrors,cases,rawDiagnosticsRecorded:false};
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
