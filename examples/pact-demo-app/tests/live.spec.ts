import {test,expect} from '@playwright/test';
import {createPactClient} from '../../../packages/pact-sdk/dist/index.js';
test.skip(()=>process.env.PACT_SDK_QA_MODE!=='live','Actual public Devnet reads run separately');
const buyer='GNqRCZsgYUAJtetw5PJZvgpkz663XoiQTfNajDxyJ2kS',seller='HXmEkejco1WDhYx3j94388JUSkqL6cCyf3BxxUdQZuz2';
const offer='7EdfowQEZyVyyp7bYdQyzmprZtVU9mVba8cysHm2Ardh';
test('actual Devnet account reads with explicitly synthetic buyer/seller identity remain locked',async({page},info)=>{
 const errors:string[]=[],methods:string[]=[],contexts:number[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',async route=>{const r=route.request();if(r.method()!=='POST'){await route.continue();return;}expect(['https://api.devnet.solana.com','https://api.devnet.solana.com/']).toContain(r.url());const body=r.postDataJSON();expect(['getGenesisHash','getMultipleAccounts']).toContain(body.method);methods.push(body.method);await route.continue();});
 page.on('response',async response=>{if(response.request().method()==='POST'){const body=await response.json().catch(()=>null);if(body?.result?.context?.slot)contexts.push(body.result.context.slot);}});
 await page.addInitScript(address=>{let current=address;const listeners=new Map<string,(key:unknown)=>void>();const key=()=>({toBase58:()=>current});const forbidden=()=>{throw Error('Live QA signing forbidden');};const provider={isPhantom:true,publicKey:key(),connect:async()=>({publicKey:provider.publicKey}),disconnect:async()=>{},on:(event:string,fn:(key:unknown)=>void)=>listeners.set(event,fn),off:(event:string)=>listeners.delete(event),signTransaction:forbidden,signAndSendTransaction:forbidden,signMessage:forbidden};Object.assign(window,{phantom:{solana:provider},qaPublicIdentity:(address:string)=>{current=address;provider.publicKey=key();listeners.get('accountChanged')?.(provider.publicKey);}});},buyer);
 await page.goto('/');await expect(page.getByTestId('premium-gate')).toHaveAttribute('data-state','locked');await page.getByRole('button',{name:'Connect Phantom'}).click();await expect(page.getByTestId('connected-wallet')).toHaveText(buyer);await expect(page.getByRole('heading',{name:'Your session has expired.'})).toBeVisible();await expect(page.getByTestId('premium-gate')).toHaveAttribute('data-state','expired');await expect(page.getByTestId('premium-content')).toHaveCount(0);
 // Public Devnet state can acquire an expired record after this fixture was first written.
 // An independent SDK read fixes the expected inactive state; errors or active access fail.
 const sellerOracle=await createPactClient({rpcUrl:'https://api.devnet.solana.com'}).getLicenseStatus({offer,wallet:seller});
 await info.attach('seller-oracle-snapshot.json',{body:JSON.stringify(sellerOracle,null,2),contentType:'application/json'});
 expect(sellerOracle.offer).toBe(offer);expect(sellerOracle.wallet).toBe(seller);expect(sellerOracle.active).toBe(false);expect(['missing','expired']).toContain(sellerOracle.state);
 await page.evaluate(address=>(window as any).qaPublicIdentity(address),seller);await expect(page.getByTestId('connected-wallet')).toHaveText(seller);
 const sellerExpired=sellerOracle.state==='expired',gate=page.getByTestId('premium-gate');
 await expect(gate.getByRole('status')).toHaveText(sellerExpired?'License expired':'No license found');
 await expect(gate.getByRole('heading',{name:sellerExpired?'Your session has expired.':'A little color. A valid license.',exact:true})).toBeVisible();
 await expect(gate).toHaveAttribute('data-state',sellerExpired?'expired':'locked');await expect(page.getByTestId('premium-content')).toHaveCount(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:`test-results/${info.project.name}-actual-devnet-synthetic-identity.png`,fullPage:true});await info.attach('actual-read-synthetic-identity.json',{body:JSON.stringify({classification:'Actual public Devnet account reads; synthetic identity provider. No proof of real wallet ownership.',buyer,seller,sellerOracle,methods,contexts},null,2),contentType:'application/json'});expect(methods).toContain('getMultipleAccounts');expect(contexts.length).toBeGreaterThan(0);expect(errors).toEqual([]);
});

