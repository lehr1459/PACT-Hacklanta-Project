import {collectContrast} from './contrast.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const repo=process.cwd(),stage=process.argv[2]??'baseline',origin=process.argv[3]??'http://127.0.0.1:3013';
const {chromium}=await import(pathToFileURL(path.join(repo,'web/node_modules/playwright/index.mjs')).href);
const output=path.join(repo,'web/test-results/ui-redesign',stage,'visual');await fs.mkdir(output,{recursive:true});
const browser=await chromium.launch(),records=[];
const offer='7EdfowQEZyVyyp7bYdQyzmprZtVU9mVba8cysHm2Ardh';
for(const width of [320,390,768,1024,1440]){
 const context=await browser.newContext({viewport:{width,height:1000},reducedMotion:'reduce'}),page=await context.newPage();const errors=[],resources=[],methods=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)resources.push({url:r.url(),status:r.status()});});
 await context.route('**/*',async route=>{const req=route.request();if(req.method()==='POST'){if(!['https://api.devnet.solana.com','https://api.devnet.solana.com/'].includes(req.url()))throw Error('External POST blocked '+req.url());const body=req.postDataJSON();if(!['getGenesisHash','getMultipleAccounts'].includes(body.method))throw Error('Transaction RPC prohibited '+body.method);methods.push(body.method);}await route.continue();});
 for(const [name,url] of [['buy','/?offer='+offer],['seller','/?section=seller&offer='+offer],['verify','/?section=verify&offer='+offer],['wizard','/integrate?offer='+offer],['base','/base']]){
  await page.goto(origin+url,{waitUntil:'networkidle'});
  if(name==='verify'){await page.getByRole('button',{name:'Verify access',exact:false}).click();await page.getByLabel('Wallet public key').fill('GNqRCZsgYUAJtetw5PJZvgpkz663XoiQTfNajDxyJ2kS');await page.getByRole('button',{name:'Verify on chain'}).click();await page.getByTestId('solana-verification-result').waitFor({state:'visible',timeout:20000});}
  const metrics=await page.evaluate(()=>{
   const overflow=[...document.querySelectorAll('body *')].filter(el=>{const r=el.getBoundingClientRect();return r.width>0&&r.left<-1||r.right>innerWidth+1;}).slice(0,15).map(el=>({tag:el.tagName,class:el.className,left:el.getBoundingClientRect().left,right:el.getBoundingClientRect().right}));
   const controls=[...document.querySelectorAll('button,input,select,textarea,a')].filter(el=>{const r=el.getBoundingClientRect();return r.width&&r.height;}).map(el=>({tag:el.tagName,text:(el.getAttribute('aria-label')||el.textContent||'').trim().slice(0,90),width:el.getBoundingClientRect().width,height:el.getBoundingClientRect().height}));
   return{innerWidth,scrollWidth:document.documentElement.scrollWidth,overflow,controls};
  });
  metrics.contrastReview=await collectContrast(page);await page.screenshot({path:path.join(output,`${width}-${name}.png`),fullPage:true});
  await page.keyboard.press('Tab');metrics.focusRings=await page.evaluate(()=>{const result=[];for(const selector of ['.topbar a[href],.topbar button:not(:disabled)','input:not(:disabled),textarea:not(:disabled),select:not(:disabled),main button:not(:disabled)']){const el=[...document.querySelectorAll(selector)].find(node=>selector.startsWith('.topbar')||!node.closest('.topbar'));if(!el)continue;el.focus();const style=getComputedStyle(el);result.push({selector,visible:el.getBoundingClientRect().width>0,color:style.outlineColor,width:style.outlineWidth,offset:style.outlineOffset,style:style.outlineStyle});}document.activeElement?.blur();return result;});
  records.push({width,page:name,url:page.url(),utc:new Date().toISOString(),...metrics,errors:[...errors],resourceErrors:[...resources],rpcMethods:[...methods]});
 }
 await context.close();
}
await browser.close();await fs.writeFile(path.join(output,'audit.json'),JSON.stringify(records,null,2));
console.log(JSON.stringify({stage,screenshots:records.length,pageErrors:records.reduce((n,r)=>n+r.errors.length,0),horizontalOverflow:records.filter(r=>r.scrollWidth>r.innerWidth+1).map(r=>({width:r.width,page:r.page,scrollWidth:r.scrollWidth})),output},null,2));
