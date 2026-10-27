// Run actual documentation modules against an independently installed SDK tarball.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const examples=['lookup.mjs','purchase-recovery.mjs','authorize.mjs'];

export async function runDocumentationExamples({consumerDirectory,outputDirectory}){
  assert.ok(consumerDirectory&&outputDirectory,'An isolated installed consumer and report directory are required');
  const consumer=await fs.realpath(consumerDirectory),require=createRequire(path.join(consumer,'package.json'));
  assert.ok(!consumer.startsWith(root+path.sep)&&consumer!==root,'Documentation consumer must be outside the repository');
  const sdk=await fs.realpath(require.resolve('@pact/sdk'));
  assert.ok(sdk.startsWith(path.join(consumer,'node_modules')+path.sep),'SDK must resolve inside the consumer');
  assert.equal((await fs.lstat(path.join(consumer,'node_modules/@pact/sdk'))).isSymbolicLink(),false,'Install the extracted tarball, not a package junction');
  const directory=await fs.mkdtemp(path.join(consumer,'pact-documentation-'));await fs.mkdir(path.join(directory,'examples'));
  const inputs={};
  for(const file of examples){const bytes=await fs.readFile(path.join(root,'docs/platform/examples',file));inputs[file]=createHash('sha256').update(bytes).digest('hex');await fs.writeFile(path.join(directory,'examples',file),bytes);}
  await fs.copyFile(path.join(root,'scripts/validation/documentation.test.mjs'),path.join(directory,'documentation.test.mjs'));
  await fs.copyFile(path.join(root,'packages/pact-sdk/tests/golden/protocol-v1.json'),path.join(directory,'protocol-v1.json'));
  const manifest=JSON.parse(await fs.readFile(path.resolve(path.dirname(sdk),'../package.json'),'utf8'));
  assert.equal(manifest.version,'0.2.0','These release examples must run against the reviewed SDK 0.2.0 tarball');
  const output=path.resolve(outputDirectory);await fs.mkdir(output,{recursive:true});
  const env={...process.env};for(const key of Object.keys(env))if(/^(?:NODE_PATH$|NODE_OPTIONS$|PACT_|NEXT_PUBLIC_|SOLANA_|VERCEL(?:_|$)|AWS_|FUNCTIONS_WORKER_RUNTIME$|AZURE_FUNCTIONS_ENVIRONMENT$|K_SERVICE$|NETLIFY$|NODE_UNIQUE_ID$|WEB_CONCURRENCY$)/.test(key))delete env[key];
  const child=spawn(process.execPath,['--test','--test-reporter=tap',path.join(directory,'documentation.test.mjs')],{cwd:consumer,env,stdio:['ignore','pipe','pipe'],windowsHide:true});
  const chunks=[];child.stdout.on('data',chunk=>chunks.push(chunk));child.stderr.on('data',chunk=>chunks.push(chunk));
  let timedOut=false;const timer=setTimeout(()=>{timedOut=true;child.kill();},30000);
  let code;try{code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',resolve);});}finally{clearTimeout(timer);}
  const log=Buffer.concat(chunks);await fs.writeFile(path.join(output,'documentation.log'),log);
  const summary=log.toString('utf8'),counts=Object.fromEntries(['tests','pass','fail','skipped'].map(key=>[key,Number(new RegExp('^# '+key+' (\\d+)$','m').exec(summary)?.[1]??-1)]));
  const report={status:code===0&&!timedOut&&counts.tests===3&&counts.pass===3&&counts.fail===0&&counts.skipped===0?'passed':'failed',sdkVersion:manifest.version,node:process.version,isolatedConsumer:true,syntheticFixtures:true,networkTransactions:0,counts,inputs,exitCode:code,timedOut};
  await fs.writeFile(path.join(output,'documentation.json'),JSON.stringify(report,null,2)+'\n');
  assert.equal(report.status,'passed',`Documentation examples failed; see ${path.join(output,'documentation.log')}`);
  return report;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  const args=process.argv.slice(2);assert.ok(args.length===4&&args[0]==='--consumer'&&args[2]==='--output','Usage: documentation.mjs --consumer <installed-project> --output <report-directory>');
  console.log(JSON.stringify(await runDocumentationExamples({consumerDirectory:args[1],outputDirectory:args[3]})));
}
