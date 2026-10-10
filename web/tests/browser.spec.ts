import {test, expect, type Page} from '@playwright/test';
import {decodeFunctionData} from 'viem';
import {abi, BUYER, OTHER, installFixtures, connect, metadata} from './fixtures';

async function sustainedClosed(page: Page, timeout=10_000) {
  await page.evaluate(()=>{(window as unknown as {__qaClosedSince:number}).__qaClosedSince=0;});
  await expect.poll(()=>page.evaluate(()=>{
    const qa=window as unknown as {__qaClosedSince:number};
    if(document.querySelector('[data-testid="license-gate"]')?.getAttribute('data-state')!=='closed'){qa.__qaClosedSince=0;return false;}
    qa.__qaClosedSince ||= performance.now();
    return performance.now()-qa.__qaClosedSince>=300;
  }),{timeout,intervals:[100]}).toBe(true);
}

test.describe('Mocked local browser acceptance - no signing or broadcast', () => {
  test.skip(() => process.env.PACT_QA_MODE === 'setup', 'These scenarios require the local fixture contract');
  const externalPosts=new WeakMap<Page,string[]>();
  test.beforeEach(async({page})=>{
    const attempted:string[]=[]; externalPosts.set(page,attempted);
    page.on('request',request=>{if(request.method()==='POST' && !/^http:\/\/127\.0\.0\.1:(3001|8547)\//.test(request.url())) attempted.push(request.url());});
    await page.route('**/*',route=>route.request().method()==='POST' && !/^http:\/\/127\.0\.0\.1:(3001|8547)\//.test(route.request().url()) ? route.abort() : route.fallback());
  });
  test.afterEach(async({page})=>{expect(externalPosts.get(page),'No RPC/signing requests may leave the localhost fixtures').toEqual([]);});
  test('desktop/mobile tools have keyboard navigation and no horizontal overflow', async ({page},testInfo) => {
    await installFixtures(page);
    await page.goto('/base');
    await expect(page.getByRole('heading',{name:/Clear terms/})).toBeVisible();
    const seller=page.getByRole('button',{name:/Seller studio/});
    await seller.focus(); await page.keyboard.press('Enter');
    await expect(page.getByLabel('License title')).toBeVisible();
    await page.getByRole('button',{name:/Verify access/}).click();
    await expect(page.getByLabel('Wallet address')).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth <= window.innerWidth+1)).toBe(true);
    await page.screenshot({path:testInfo.outputPath('mocked-local-tools.png'),fullPage:true});
  });
  test('wrong wallet network blocks access; switch opens only on fresh chain data; disconnect closes', async ({page}) => {
    await installFixtures(page,{chain:8453}); await page.goto('/base'); await connect(page);
    await expect(page.getByRole('button',{name:/Download sample/})).toHaveCount(0);
    await expect(page.getByRole('button',{name:/Switch to Base Sepolia/})).toBeVisible();
    await page.getByRole('button',{name:/Switch to Base Sepolia/}).click();
    await expect(page.getByRole('button',{name:/Download sample/})).toBeVisible();
    await page.getByRole('button',{name:/Disconnect/}).click();
    await expect(page.getByRole('button',{name:/Download sample/})).toHaveCount(0);
  });
  test('matching metadata and approval required, reset after edits, exact test ETH submitted', async ({page}) => {
    const state=await installFixtures(page); state.valid=false; state.expiry=0n;
    await page.goto('/base'); await connect(page);
    const purchase=page.getByRole('button',{name:/Purchase license/});
    await expect(purchase).toBeDisabled();
    await page.getByLabel('Seller metadata JSON').fill(metadata+' ');
    await expect(purchase).toBeDisabled();
    await page.getByLabel('Seller metadata JSON').fill(metadata);
    const approval=page.getByRole('checkbox',{name:/matching license terms/});
    await approval.check(); await expect(purchase).toBeEnabled();
    await page.getByLabel('Offer ID',{exact:true}).fill('1');
    await expect(approval).not.toBeChecked();
    await page.getByLabel('Offer ID',{exact:true}).fill('0');
    await approval.check(); await purchase.click();
    await expect(page.getByRole('status')).toContainText(/Confirmed|confirmed/);
    const sent=await page.evaluate(()=>((window as unknown as {__pactQA:{requests:{method:string;params:unknown[]}[]}}).__pactQA.requests.find(r=>r.method==='eth_sendTransaction')));
    expect(sent).toBeDefined();
    expect((sent!.params[0] as {value:string}).value).toBe('0x38d7ea4c68000');
  });
  test('wallet rejection is an error, never a successful transaction', async ({page}) => {
    await installFixtures(page,{wallet:'reject'}); await page.goto('/base'); await connect(page);
    await page.getByRole('button',{name:/Seller studio/}).click();
    await page.getByRole('button',{name:/Withdraw proceeds/}).click();
    await expect(page.locator('main').getByRole('alert')).toContainText(/rejected|denied/i);
    await expect(page.getByRole('status')).not.toContainText(/Confirmed/);
  });
  test('approved seller creation decodes confirmed OfferCreated ID and selects it',async({page})=>{
    await installFixtures(page); await page.goto('/base'); await connect(page);
    await page.getByRole('button',{name:/Seller studio/}).click();
    await page.getByRole('checkbox',{name:/reviewed and approve these terms/}).check();
    await page.getByRole('button',{name:/Create offer/}).click();
    await expect(page.getByRole('status')).toContainText('Offer #1 confirmed');
    await expect(page.getByLabel('Offer ID',{exact:true})).toHaveValue('1');
  });
  test('buyer accepts exact 64KiB JSON and rejects the next UTF-8 byte', async ({page}) => {
    const state=await installFixtures(page); state.valid=false; state.expiry=0n;
    const parsed=JSON.parse(metadata);
    const prefix=JSON.stringify({...parsed,terms:''});
    state.terms=JSON.stringify({...parsed,terms:'x'.repeat(65536-new TextEncoder().encode(prefix).length)});
    await page.goto('/base'); await connect(page);
    await page.getByLabel('Seller metadata JSON').fill(state.terms);
    const approval=page.getByRole('checkbox',{name:/matching license terms/});
    await expect(approval).toBeEnabled();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
    await approval.check(); await expect(page.getByRole('button',{name:/Purchase license/})).toBeEnabled();
    // Same character count, one extra UTF-8 byte: HTML maxLength must not mask the byte check.
    await page.getByLabel('Seller metadata JSON').fill(state.terms.replace('x','é'));
    await expect(approval).toBeDisabled();
    await expect(page.getByRole('button',{name:/Purchase license/})).toBeDisabled();
  });
  test('RPC simulation failure never requests wallet signing', async ({page}) => {
    const state=await installFixtures(page); await page.goto('/base'); await connect(page);
    await page.getByRole('button',{name:/Seller studio/}).click();
    await expect(page.getByRole('button',{name:/Withdraw proceeds/})).toBeEnabled();
    state.simulationError=true;
    await page.getByRole('button',{name:/Withdraw proceeds/}).click();
    await expect(page.locator('main').getByRole('alert')).toBeVisible();
    const sent=await page.evaluate(()=>((window as unknown as {__pactQA:{requests:{method:string}[]}}).__pactQA.requests.some(r=>r.method==='eth_sendTransaction')));
    expect(sent).toBe(false);
  });
  test('reverted receipt is never announced as confirmed', async ({page}) => {
    const state=await installFixtures(page); state.receipt='reverted';
    await page.goto('/base'); await connect(page); await page.getByRole('button',{name:/Seller studio/}).click();
    await page.getByRole('button',{name:/Withdraw proceeds/}).click();
    await expect(page.locator('main').getByRole('alert')).toContainText(/reverted/i);
    await expect(page.getByRole('status')).not.toContainText(/Confirmed/);
  });
  test('pending transaction stays attributed to original account after wallet switches', async ({page}) => {
    const state=await installFixtures(page); state.receipt='pending';
    await page.goto('/base'); await connect(page); await page.getByRole('button',{name:/Seller studio/}).click();
    await page.getByRole('button',{name:/Withdraw proceeds/}).click();
    await expect(page.getByRole('status')).toContainText(/submitted|Waiting/i);
    await page.evaluate(()=>((window as unknown as {__pactQA:{switchAccount():void}}).__pactQA.switchAccount()));
    await expect(page.getByRole('button',{name:/Disconnect/})).toContainText('0x3333');
    state.receipt='success';
    await expect(page.getByRole('status')).toContainText(/0x2222|222222/i);
    await expect(page.getByRole('status')).toContainText(/Confirmed|confirmed/);
  });
  test('wallet change during simulation prevents the signing request',async ({page})=>{
    const state=await installFixtures(page); await page.goto('/base'); await connect(page);
    await page.getByRole('button',{name:/Seller studio/}).click();
    state.onSimulation=async()=>{
      await page.evaluate(()=>((window as unknown as {__pactQA:{switchAccount():void}}).__pactQA.switchAccount()));
      await expect(page.getByRole('button',{name:/Disconnect/})).toContainText('0x3333');
    };
    await page.getByRole('button',{name:/Withdraw proceeds/}).click();
    await expect(page.locator('main').getByRole('alert')).toContainText(/changed before signing/i);
    expect(await page.evaluate(()=>((window as unknown as {__pactQA:{requests:{method:string}[]}}).__pactQA.requests.filter(r=>r.method==='eth_sendTransaction').length))).toBe(0);
  });
  test('120-second receipt timeout retains hash and says unknown without automatic retry',async ({page})=>{
    await page.clock.install();
    const state=await installFixtures(page); state.receipt='pending';
    await page.goto('/base'); await connect(page); await page.getByRole('button',{name:/Seller studio/}).click();
    await page.getByRole('button',{name:/Withdraw proceeds/}).click();
    await expect(page.getByRole('status')).toContainText(/Submitted/i);
    await page.clock.fastForward(120_100);
    await expect(page.locator('main').getByRole('alert')).toContainText(/Confirmation unknown.*no automatic retry/i);
    await expect(page.getByRole('status').getByRole('link')).toHaveAttribute('href',/0xaaaaaaaa/);
    await expect(page.getByRole('status')).not.toContainText(/Confirmed/);
    expect(await page.evaluate(()=>((window as unknown as {__pactQA:{requests:{method:string}[]}}).__pactQA.requests.filter(r=>r.method==='eth_sendTransaction').length))).toBe(1);
  });
  test('hanging RPC times out and closes previously valid access; recovery needs fresh data', async ({page}) => {
    const state=await installFixtures(page); await page.goto('/base'); await connect(page);
    await expect(page.getByRole('button',{name:/Download sample/})).toBeVisible();
    state.mode='hang';
    await sustainedClosed(page,10_000);
    await expect(page.getByText(/Chain check failed/i).first()).toBeVisible({timeout:12_000});
    state.mode='ok';
    await expect(page.getByRole('button',{name:/Download sample/})).toBeVisible({timeout:12_000});
  });
  test('RPC error closes access and never leaves cached valid verification', async ({page}) => {
    const state=await installFixtures(page); await page.goto('/base'); await connect(page);
    await expect(page.getByRole('button',{name:/Download sample/})).toBeVisible();
    await page.getByRole('button',{name:/Verify access/}).click();
    await page.getByLabel('Wallet address').fill(BUYER);
    await page.getByRole('button',{name:/Verify on chain/}).click();
    await expect(page.getByTestId('verification-result')).toContainText('Entitlement valid');
    state.mode='error';
    await sustainedClosed(page,7000);
    await expect(page.getByTestId('verification-result')).toHaveCount(0);
  });
  test('wallet A to B to A cannot reopen cached access during a hanging fresh check',async ({page})=>{
    const state=await installFixtures(page); await page.goto('/base'); await connect(page);
    await expect(page.getByRole('button',{name:/Download sample/})).toBeVisible();
    state.mode='hang';
    await page.evaluate(()=>((window as unknown as {__pactQA:{switchAccount():void}}).__pactQA.switchAccount()));
    await expect(page.getByRole('button',{name:/Download sample/})).toHaveCount(0);
    await page.evaluate(buyer=>((window as unknown as {__pactQA:{switchTo(value:string):void}}).__pactQA.switchTo(buyer)),BUYER);
    await expect(page.getByRole('button',{name:/Disconnect/})).toContainText('0x2222');
    await expect(page.getByRole('button',{name:/Download sample/})).toHaveCount(0);
  });
  test('offline closes immediately; reconnect requires a successful current snapshot', async ({page,context}) => {
    const state=await installFixtures(page); await page.goto('/base'); await connect(page);
    await expect(page.getByRole('button',{name:/Download sample/})).toBeVisible();
    await context.setOffline(true);
    await expect(page.getByRole('button',{name:/Download sample/})).toHaveCount(0);
    state.mode='hang'; await context.setOffline(false);
    await expect(page.getByRole('button',{name:/Download sample/})).toHaveCount(0);
    state.mode='ok'; await page.reload();
    await connect(page); await expect(page.getByRole('button',{name:/Download sample/})).toBeVisible();
  });
  test('background/resume clears cached entitlement and requires a fresh read', async ({page}) => {
    const state=await installFixtures(page); await page.goto('/base'); await connect(page);
    await expect(page.getByRole('button',{name:/Download sample/})).toBeVisible();
    // Chromium headless does not create OS background tabs; dispatch a controlled visibility transition.
    await page.evaluate(()=>{Object.defineProperty(document,'visibilityState',{value:'hidden',configurable:true});document.dispatchEvent(new Event('visibilitychange'));});
    await expect(page.getByRole('button',{name:/Download sample/})).toHaveCount(0);
    state.mode='hang';
    await page.evaluate(()=>{Object.defineProperty(document,'visibilityState',{value:'visible',configurable:true});document.dispatchEvent(new Event('visibilitychange'));});
    await expect(page.getByRole('button',{name:/Download sample/})).toHaveCount(0);
    state.mode='ok'; await page.reload(); await connect(page);
    await expect(page.getByRole('button',{name:/Download sample/})).toBeVisible();
  });
  test('unchanged block closes access within twelve seconds even though reads succeed', async ({page}) => {
    const state=await installFixtures(page); state.frozen=true;
    await page.goto('/base'); await connect(page);
    await expect(page.getByRole('button',{name:/Download sample/})).toBeVisible();
    const observedStart=Date.now();
    await sustainedClosed(page,14_000);
    expect(Date.now()-observedStart).toBeGreaterThan(10_000);
  });
  test('chain expiry closes with wildly skewed wall clock and contract reads are block pinned', async ({page}) => {
    const state=await installFixtures(page); state.expiry=state.blockTime+3n; state.frozen=true;
    await page.addInitScript(()=>{Date.now=()=>0;});
    await page.goto('/base'); await connect(page);
    await expect(page.getByRole('button',{name:/Download sample/})).toBeVisible();
    await sustainedClosed(page,6000);
    const licenseCalls=state.calls.filter(call=>call.method==='eth_call' && ['isLicenseValid','licenseExpiry'].includes(decodeFunctionData({abi,data:(call.params[0] as {data:`0x${string}`}).data}).functionName));
    expect(licenseCalls.length).toBeGreaterThanOrEqual(2);
    expect(licenseCalls.every(call=>call.params[1]==='0x64')).toBe(true);
  });
  test('public verification identifies queried wallet and clears old result when fields change', async ({page}) => {
    await installFixtures(page); await page.goto('/base');
    await page.getByRole('button',{name:/Verify access/}).click();
    await page.getByLabel('Wallet address').fill(BUYER);
    await page.getByRole('button',{name:/Verify on chain/}).click();
    await expect(page.getByText('Entitlement valid',{exact:true})).toBeVisible();
    await expect(page.getByText(BUYER,{exact:false}).first()).toBeVisible();
    await page.getByLabel('Wallet address').fill(OTHER);
    await expect(page.getByText('Entitlement valid',{exact:true})).toHaveCount(0);
  });
});

test.describe('Missing deployment setup browser state', () => {
  test.skip(() => process.env.PACT_QA_MODE !== 'setup', 'Run PACT_QA_MODE=setup for missing-address build');
  test('missing contract shows setup pending and closes seller/buyer/verifier controls',async ({page},testInfo)=>{
    await installFixtures(page); await page.goto('/base');
    await expect(page.getByText(/contract setup pending/)).toBeVisible();
    await expect(page.getByRole('button',{name:/Download sample/})).toHaveCount(0);
    await page.getByRole('button',{name:/Seller studio/}).click();
    await expect(page.getByRole('button',{name:/Create offer/})).toBeDisabled();
    await expect(page.getByRole('button',{name:/Withdraw proceeds/})).toBeDisabled();
    await page.getByRole('button',{name:/Verify access/}).click();
    await expect(page.getByRole('button',{name:/Verify on chain/})).toBeDisabled();
    await page.screenshot({path:testInfo.outputPath('mocked-local-missing-contract.png'),fullPage:true});
  });
});
