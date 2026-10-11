// Reuse the checkpoint's proven synthetic transaction fixture, without editing it.
import fs from 'node:fs/promises';import path from 'node:path';import {pathToFileURL} from 'node:url';import {createRequire} from 'node:module';
const repo=process.cwd(),stage=process.argv[2]??'baseline',origin=process.argv[3]??'http://127.0.0.1:3013',target=path.join(repo,'.deployment-candidates/ui-redesign',stage);
const require=createRequire(path.join(target,'packages/pact-sdk/package.json')),{build}=require('esbuild');
const original=await fs.readFile(path.join(target,'web/tests/solana/browser.spec.ts'),'utf8');
const helper=original.slice(original.indexOf('type State='),original.indexOf("test('missing extension"));
const directory=path.join(target,'web/test-results/ui-redesign-fixture');await fs.mkdir(directory,{recursive:true});
const publicFixtures=path.join(target,'packages/pact-sdk/tests/checkout-qa-fixtures.mjs').replaceAll('\\','/'),protocol=path.join(target,'web/lib/solana/protocol.ts').replaceAll('\\','/');
const prefix=`import {VersionedTransaction} from '@solana/web3.js';import {expect} from '${pathToFileURL(path.join(target,'web/node_modules/@playwright/test/index.mjs')).href}';import {Buffer} from 'buffer';import {PublicKey,PROGRAM,GENESIS,seller,wallet,offer,license,metadataJson,snapshot} from '${publicFixtures}';import {metadataHash} from '${protocol}';const program=new PublicKey(PROGRAM),buyer=wallet,metadata=metadataJson,DEVNET_GENESIS=GENESIS;function accounts(){return snapshot({slot:100,expiry:1060n}).value;}\n`;
const adapted=helper.replace("!request.url().startsWith('http://127.0.0.1:8548')","!['https://api.devnet.solana.com','https://api.devnet.solana.com/'].includes(request.url())");
await fs.writeFile(path.join(directory,'fixture.ts'),prefix+adapted+'\nexport {fixture,connect,load,buyReady};');
await build({entryPoints:[path.join(directory,'fixture.ts')],outfile:path.join(directory,'fixture.mjs'),bundle:true,platform:'node',format:'esm',target:'node24',external:['file://*','@solana/web3.js','buffer'],banner:{js:"import {createRequire as nodeCreateRequire} from 'node:module';const require=nodeCreateRequire(import.meta.url);"}});
const {fixture,connect,load,buyReady}=await import(pathToFileURL(path.join(directory,'fixture.mjs')).href),{chromium}=await import(pathToFileURL(path.join(target,'web/node_modules/playwright/index.mjs')).href);
const {offer:offerKey}=await import(pathToFileURL(path.join(target,'packages/pact-sdk/tests/checkout-qa-fixtures.mjs')).href);
const output=path.join(repo,'web/test-results/ui-redesign',stage,'transactions');await fs.mkdir(output,{recursive:true});const browser=await chromium.launch(),records=[];
for(const width of [320,390,768,1024,1440]){
 for(const mode of ['finalized','pending-unknown','wizard-generated']){
  const context=await browser.newContext({viewport:{width,height:1000},reducedMotion:'reduce'}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const state=await fixture(page);state.licensed=false;state.confirm=mode==='finalized';
  async function shot(label){const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);if(overflow)throw Error(width+' '+label+' overflow');await page.screenshot({path:path.join(output,`${width}-${label}-synthetic.png`),fullPage:true});records.push({width,state:label,errors:[...errors],fixtureSendCount:state.sent,fixtureRpcMethods:[...state.calls],realSigningOrBroadcast:false});}
  if(mode==='wizard-generated'){await page.goto(origin+'/integrate');await page.getByRole('textbox',{name:/^Application name/}).fill('Synthetic enterprise sample');await page.getByRole('textbox',{name:/^Existing offer address/}).fill(offerKey.toBase58());await page.getByRole('button',{name:/^Validate offer and generate integration/}).click();await page.getByTestId('integration-output').waitFor({timeout:10000});await shot('wizard-generated');}
  else {await page.clock.install();await page.goto(origin+'/');await connect(page);await load(page);await buyReady(page);await page.getByRole('button',{name:'Purchase license'}).click();
   if(mode==='finalized'){await page.getByText(/Purchase license finalized on Solana Devnet/).waitFor({timeout:10000});await shot('finalized');}
   else {await page.getByRole('status').filter({hasText:/RPC accepted/}).waitFor({timeout:10000});await shot('pending');await page.clock.fastForward(121000);await page.getByRole('alert').filter({hasText:/Confirmation unknown/}).waitFor({timeout:10000});await shot('unknown');}
  }
  if(errors.length)throw Error('Runtime error '+errors.join(';'));await context.close();
 }
}
await browser.close();await fs.writeFile(path.join(output,'audit.json'),JSON.stringify(records,null,2));console.log(JSON.stringify({stage,screenshots:records.length,output,fixture:'immutable existing fixture; only endpoint/program/account fixture adaptation',liveEffects:false}));
