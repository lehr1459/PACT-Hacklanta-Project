// Read-only hosted dependency gate. The service's file-linked SDK is a separate
// audited graph; npm audit in the service alone does not inspect its symlink.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {assessAudit} from '../validation/dependencies.mjs';
import {root,npmCli,validationEnv} from '../validation/common.mjs';

export const projects=Object.freeze({
 sdk:'packages/pact-sdk',service:'services/pact-api',client:'packages/pact-hosted-client',
 common:'examples/pact-hosted-common',express:'examples/pact-hosted-express',
 next:'examples/pact-hosted-next',rest:'examples/pact-hosted-rest',
});
const reviewedFiles=Object.freeze([
 'packages/pact-sdk/src/internal/license-reader.ts',
 'packages/pact-sdk/src/server-chain.ts',
 'packages/pact-sdk/node_modules/jayson/lib/generateRequest.js',
]);
const advisories=new Map([
 ['uuid:GHSA-w5hq-g745-h8pq','8.3.2'],
 ['stream-json:GHSA-528h-pc64-c93x','1.9.1'],
 ['stream-json:GHSA-hqr4-qq8f-hg3x','1.9.1'],
 ['stream-json:GHSA-mjw6-4jj6-33hc','1.9.1'],
]);
const parse=text=>JSON.parse(text.replace(/^\uFEFF/,''));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
// Git's Windows checkout conversion must not turn an unchanged reviewed source
// into a different Linux graph. Normalize line endings, not code content.
export const sourceDigest=text=>sha(text.replaceAll('\r\n','\n'));
export function validatePolicy(policy){
 if(policy?.schemaVersion!==1||!Array.isArray(policy.exceptions)
  ||JSON.stringify(Object.keys(policy.graphs??{}).sort())!==JSON.stringify(Object.keys(projects).sort())
  ||Object.values(policy.graphs).some(value=>typeof value!=='string'||!/^[a-f0-9]{64}$/.test(value))
  ||JSON.stringify(Object.keys(policy.reachability?.sources??{}).sort())!==JSON.stringify([...reviewedFiles].sort())
  ||Object.values(policy.reachability.sources).some(value=>typeof value!=='string'||!/^[a-f0-9]{64}$/.test(value)))throw Error('HOSTED_DEPENDENCY_POLICY_INVALID');
 for(const item of policy.exceptions){
  const version=advisories.get(`${item.package}:${item.advisory}`);
  if(!version||item.severity!=='moderate'||JSON.stringify(item.projects)!=='["sdk"]'
   ||JSON.stringify(item.versions)!==JSON.stringify([version])||!/^\d{4}-\d{2}-\d{2}$/.test(item.expires??'')
   ||item.expires>'2026-11-15'||!item.owner||!item.reason)throw Error('HOSTED_DEPENDENCY_EXCEPTION_SCOPE_INVALID');
 }
 return policy;
}
export async function assessHostedProject(report,{project,directory,policy,now=new Date()}){
 validatePolicy(policy);if(!Object.hasOwn(projects,project))throw Error('HOSTED_DEPENDENCY_PROJECT_INVALID');
 const counts=report?.metadata?.vulnerabilities,levels=['info','low','moderate','high','critical'];
 if(!counts||![...levels,'total'].every(level=>Number.isSafeInteger(counts[level])&&counts[level]>=0)
  ||counts.total!==levels.reduce((sum,level)=>sum+counts[level],0))throw Error('HOSTED_DEPENDENCY_AUDIT_INVALID');
 const result=await assessAudit(report,{project,directory,policy,now});
 if(counts.total!==Object.keys(report.vulnerabilities).length)result.failures.push('Hosted audit summary is inconsistent');
 for(const entry of Object.values(report.vulnerabilities))for(const via of entry.via??[]){
  if(typeof via==='string')continue;
  const advisory=/^https:\/\/github\.com\/advisories\/(GHSA-[a-z0-9-]+)$/.exec(via?.url??'')?.[1];
  if(project!=='sdk'||via.severity!=='moderate'||!advisories.has(`${via.name}:${advisory}`))result.failures.push('New hosted advisory requires independent review');
 }
 return{...result,failures:[...new Set(result.failures)]};
}
export function assessReachability({cachePaths,sourceHashes},policy){
 validatePolicy(policy);const failures=[];
 for(const file of reviewedFiles)if(sourceHashes[file]!==policy.reachability.sources[file])failures.push(`Reviewed call path changed: ${file}`);
 const paths=cachePaths.map(value=>value.replaceAll('\\','/'));
 if(paths.some(value=>value.includes('/stream-json/')))failures.push('Affected stream-json runtime became reachable');
 if(paths.some(value=>/\/jayson\/lib\/(?:utils|server(?:\/|\.js)|client\/(?:tcp|tls|http|https)(?:\/|\.js))/.test(value)))failures.push('Unreviewed jayson server/transport runtime became reachable');
 if(!paths.some(value=>value.includes('/jayson/lib/client/browser/')))failures.push('Expected reviewed browser RPC import was not observed');
 return{kind:'hosted-dependency-reachability',failures,streamJsonLoaded:paths.some(value=>value.includes('/stream-json/')),
  uuidIndexModulesPresent:paths.some(value=>/\/uuid\/dist\/v[35]\.js$/.test(value)),
  scope:'Cold hosted import plus exact reviewed SDK call-path sources; new caller behavior also requires code review'};
}
async function audit(directory){
 const child=spawn(process.execPath,[npmCli(),'audit','--json','--ignore-scripts','--no-fund'],{
  cwd:directory,windowsHide:true,env:validationEnv({NODE_PATH:'',NODE_OPTIONS:''}),stdio:['ignore','pipe','pipe'],
 });
 let stdout='',size=0,overflow=false;
 const timer=setTimeout(()=>{overflow=true;child.kill();},45000);
 child.stdout.on('data',chunk=>{size+=chunk.length;if(size>8*1024*1024){overflow=true;child.kill();}else stdout+=chunk;});child.stderr.resume();
 try{
  const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',resolve);});
  if(overflow||![0,1].includes(code))throw Error('HOSTED_DEPENDENCY_AUDIT_UNAVAILABLE');
  let report;try{report=parse(stdout);}catch{throw Error('HOSTED_DEPENDENCY_AUDIT_INVALID');}
  if(report?.auditReportVersion!==2||report.error)throw Error('HOSTED_DEPENDENCY_AUDIT_UNAVAILABLE');return report;
 }finally{clearTimeout(timer);}
}
export async function main(){
 const policy=validatePolicy(parse(await readFile(new URL('./dependency-policy.json',import.meta.url),'utf8')));
 const output=path.join(root,'web/test-results/validation/hosted-dependencies');await mkdir(output,{recursive:true});
 let failed=false;
 for(const[project,relative]of Object.entries(projects)){
  const directory=path.join(root,relative),report=await audit(directory);
  const result=await assessHostedProject(report,{project,directory,policy});
  await writeFile(path.join(output,`${project}-audit.json`),JSON.stringify(report,null,2)+'\n');
  await writeFile(path.join(output,`${project}-assessment.json`),JSON.stringify(result,null,2)+'\n');
  process.stdout.write(JSON.stringify(result)+'\n');failed||=result.failures.length>0;
 }
 // Import definitions only: this does not create a service, read .env or perform
 // RPC/wallet/database actions. Do not claim this proves all possible callsites.
 await import('../../services/pact-api/src/service.mjs');
 const require=createRequire(import.meta.url),sourceHashes={};
 for(const file of reviewedFiles)sourceHashes[file]=sourceDigest(await readFile(path.join(root,file),'utf8'));
 const reachability=assessReachability({cachePaths:Object.keys(require.cache),sourceHashes},policy);
 await writeFile(path.join(output,'reachability.json'),JSON.stringify(reachability,null,2)+'\n');
 process.stdout.write(JSON.stringify(reachability)+'\n');failed||=reachability.failures.length>0;
 if(failed)process.exitCode=1;
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){
 try{await main();}catch{process.stderr.write('Hosted dependency gate unavailable or invalid; fail closed.\n');process.exitCode=1;}
}
