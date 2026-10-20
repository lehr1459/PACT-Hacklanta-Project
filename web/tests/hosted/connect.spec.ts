import {test,expect,type Page} from '@playwright/test';
import {generateKeyPairSync,sign,createHash} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
const proofHashes=new Set<string>();
test.afterEach(async({},info)=>{
 await mkdir(info.project.outputDir,{recursive:true});await writeFile(path.join(info.project.outputDir,`worker-${info.workerIndex}-proof-hashes.json`),JSON.stringify({hashes:[...proofHashes]})+'\n');
});

function wallet(){
 const {privateKey,publicKey}=generateKeyPairSync('ed25519');
 const bytes=publicKey.export({format:'der',type:'spki'}).subarray(-32),alphabet='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
 let number=BigInt('0x'+bytes.toString('hex')),address='';
 while(number>0n){address=alphabet[Number(number%58n)]+address;number/=58n;}
 for(const byte of bytes){if(byte!==0)break;address='1'+address;}
 return{address,sign:(message:Uint8Array)=>{const value=sign(null,message,privateKey).toString('base64');proofHashes.add(createHash('sha256').update(value).digest('hex'));return value;}};
}

const CONSUMER='http://127.0.0.1:3113';
async function installWallet(page:Page,options:{rejectConnect?:boolean;rejectSign?:boolean}={}){
 const first=wallet(),second=wallet(),identities=new Map([[first.address,first],[second.address,second]]);
 await page.exposeFunction('__qaSignMessage',(address:string,bytes:number[])=>{
  const identity=identities.get(address);if(!identity)throw Error('Unknown disposable test signer');
  return [...Buffer.from(identity.sign(Buffer.from(bytes)),'base64')];
 });
 await page.addInitScript(({addresses,rejectConnect,rejectSign})=>{
  const surface=window as unknown as Record<string,any>,listeners=new Map<string,Set<(...args:any[])=>void>>();
  let current=addresses[0],connected=false;
  const stats={connect:0,sign:0,messages:[] as string[]};surface.__qaStats=stats;
  const key=()=>({toString:()=>current});
  const provider={isPhantom:true,get publicKey(){return connected?key():null;},
   async connect(){stats.connect++;if(rejectConnect)throw Error('Synthetic wallet connection refused');connected=true;return{publicKey:key()};},
   async signMessage(bytes:Uint8Array){stats.sign++;stats.messages.push(new TextDecoder().decode(bytes));if(rejectSign)throw Error('Synthetic wallet signature refused');
    return{signature:new Uint8Array(await surface.__qaSignMessage(current,[...bytes])),publicKey:key()};},
   on(event:string,callback:(...args:any[])=>void){if(!listeners.has(event))listeners.set(event,new Set());listeners.get(event)!.add(callback);},
   removeListener(event:string,callback:(...args:any[])=>void){listeners.get(event)?.delete(callback);},
  };
  surface.phantom={solana:provider};surface.__qaSwitchWallet=()=>{current=addresses[1];connected=true;for(const fn of listeners.get('accountChanged')??[])fn(key());};
 },{addresses:[first.address,second.address],...options});
 return{first,second};
}
const stats=(page:Page)=>page.evaluate(()=>(window as unknown as {__qaStats:{connect:number;sign:number;messages:string[]}}).__qaStats);
async function start(page:Page,mode=''){
 const response=await page.goto(CONSUMER+'/start'+(mode?'?mode='+mode:''));
 await expect(page.getByRole('heading',{name:'Review before you sign.'})).toBeVisible();return response!;
}
async function review(page:Page){
 await expect(page.getByText('Sign in to the independent browser consumer',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Connect Phantom',exact:true}).click();
 await page.getByRole('button',{name:'Review sign-in message',exact:true}).click();
 await expect(page.getByRole('textbox',{name:'Exact sign-in message'})).toBeVisible();
}
async function consumerState(page:Page){return page.request.get(CONSUMER+'/qa/status').then(r=>r.json());}

test('production nonce CSP hydrates; explicit keyboard review and signature complete through independent backend',async({page},info)=>{
 const identities=await installWallet(page),errors:string[]=[],violations:string[]=[],network:string[]=[],pending:Promise<void>[]=[];
 page.on('pageerror',error=>errors.push(error.message));page.on('console',msg=>{if(msg.type()==='error')errors.push(msg.text());});
 await page.exposeFunction('__qaCsp',(value:string)=>violations.push(value));
 await page.addInitScript(()=>document.addEventListener('securitypolicyviolation',e=>(window as unknown as {__qaCsp:(v:string)=>void}).__qaCsp(e.violatedDirective)));
 page.on('request',req=>{network.push(JSON.stringify({url:req.url(),authorization:req.headers().authorization,body:req.postData()}));});
 page.on('response',res=>{if(res.url().includes('/v1/'))pending.push(res.text().then(body=>{network.push(body);}).catch(()=>{}));});
 const response=await start(page),csp=response.headers()['content-security-policy'];
 expect(csp).toContain("'strict-dynamic'");expect(csp).not.toContain("'unsafe-inline'");expect(csp).not.toContain("'unsafe-eval'");
 expect(csp).toContain("frame-ancestors 'none'");expect(response.headers()['x-frame-options']).toBe('DENY');expect(response.headers()['referrer-policy']).toBe('no-referrer');
 const nonce=csp.match(/'nonce-([^']+)'/)?.[1];expect(nonce).toBeTruthy();
 const second=await page.request.get(page.url());expect(second.headers()['content-security-policy']).not.toBe(csp);
 const scriptNonces=await page.locator('script').evaluateAll(scripts=>scripts.filter(s=>(s as HTMLScriptElement).src||s.textContent).map(s=>(s as HTMLScriptElement).nonce));
 expect(scriptNonces.length).toBeGreaterThan(0);expect(scriptNonces.every(value=>value===nonce)).toBe(true);
 const safe=await page.evaluate(()=>{
  const text=(document.body.textContent??'')+' '+[...document.querySelectorAll('input,textarea')].map(x=>(x as HTMLInputElement).value).join(' ');
  return !/pact_sk_dev_key_|pact_(?:grant|code)_|pact-domain-verification=|Browser\/session binding: [a-f0-9]{64}/.test(text);
 });expect(safe).toBe(true);await page.screenshot({path:info.outputPath('connect-start-sanitized.png'),fullPage:true});
 await expect(page.getByText('Sign in to the independent browser consumer',{exact:true})).toBeVisible();
 expect((await stats(page)).connect).toBe(0);expect((await stats(page)).sign).toBe(0);
 await page.keyboard.press('Tab');
 for(let i=0;i<10;i++){
  if(await page.getByRole('button',{name:'Connect Phantom',exact:true}).evaluate(el=>el===document.activeElement))break;
  await page.keyboard.press('Tab');
 }
 await expect(page.getByRole('button',{name:'Connect Phantom',exact:true})).toBeFocused();
 await page.keyboard.press('Enter');await page.getByRole('button',{name:'Review sign-in message',exact:true}).click();
 const message=page.getByRole('textbox',{name:'Exact sign-in message'});await expect(message).toBeFocused();
 const exact=await message.inputValue();expect(exact.includes(identities.first.address)).toBe(true);expect(exact.includes('No transaction or purchase.')).toBe(true);
 expect((await stats(page)).sign).toBe(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
 await page.getByRole('button',{name:'Sign in with Phantom',exact:true}).click();
 await expect(page).toHaveURL(CONSUMER+'/result');await expect(page.getByRole('heading',{name:'Consumer signed in'})).toBeVisible();
 const result=await consumerState(page);expect(result.completed).toBe(true);expect(result.serverSessionHasGrant).toBe(true);expect(result.walletAddress).toBe(identities.first.address);expect(result.exchanges).toBe(1);
 await Promise.all(pending);expect(network.some(value=>value.includes('pact_sk_dev_')||value.includes('pact_grant_'))).toBe(false);
 expect(await page.evaluate(()=>JSON.stringify({...localStorage,...sessionStorage}))).not.toMatch(/pact_sk_dev_|pact_grant_/);
 expect(errors).toEqual([]);expect(violations).toEqual([]);
});

test('wallet signature refusal remains denied and does not invoke consumer exchange',async({page})=>{
 await installWallet(page,{rejectSign:true});await start(page);await review(page);
 await page.getByRole('button',{name:'Sign in with Phantom',exact:true}).click();
 await expect(page.getByRole('main').getByRole('alert')).toContainText('cancelled or could not complete');expect((await stats(page)).sign).toBe(1);
 const state=await consumerState(page);expect(state.completed).toBe(false);expect(state.exchanges).toBe(0);expect(state.serverSessionHasGrant).toBe(false);
});
test('wallet connection refusal and cancel require new explicit actions',async({page})=>{
 await installWallet(page,{rejectConnect:true});await start(page);await page.getByRole('button',{name:'Connect Phantom',exact:true}).click();
 await expect(page.getByRole('main').getByRole('alert')).toContainText('cancelled or could not complete');expect((await stats(page)).sign).toBe(0);
 await page.getByRole('button',{name:'Cancel sign-in',exact:true}).click();await expect(page.getByRole('status')).toContainText('abandoned');
 await expect(page.getByRole('button',{name:'Connect Phantom',exact:true})).toHaveCount(0);expect((await consumerState(page)).completed).toBe(false);
});
test('account change clears reviewed message and requires another connection',async({page})=>{
 await installWallet(page);await start(page);await review(page);
 await page.evaluate(()=>(window as unknown as {__qaSwitchWallet:()=>void}).__qaSwitchWallet());
 await expect(page.getByRole('status')).toContainText('wallet changed or disconnected');
 await expect(page.getByRole('textbox',{name:'Exact sign-in message'})).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Sign in with Phantom',exact:true})).toHaveCount(0);expect((await stats(page)).sign).toBe(0);
 expect((await consumerState(page)).completed).toBe(false);
});
test('missing wallet and expired request clearly deny without automatic prompts',async({page})=>{
 await start(page);await expect(page.getByText(/Phantom with message signing was not detected/)).toBeVisible();
 await expect(page.getByRole('button',{name:'Connect Phantom',exact:true})).toBeDisabled();expect((await consumerState(page)).completed).toBe(false);
 await start(page,'expired');await expect(page.getByRole('main').getByRole('alert')).toContainText('expired, was already used, or is no longer available');
 await expect(page.getByRole('button',{name:'Connect Phantom',exact:true})).toHaveCount(0);
});
test('reviewed challenge expiration prevents signing',async({page})=>{
 await installWallet(page);await page.clock.install();await start(page);await review(page);await page.clock.fastForward(121000);
 await expect(page.getByRole('main').getByRole('alert')).toContainText('This message expired');
 await expect(page.getByRole('button',{name:'Sign in with Phantom',exact:true})).toBeDisabled();expect((await stats(page)).sign).toBe(0);
 expect((await consumerState(page)).completed).toBe(false);
});
