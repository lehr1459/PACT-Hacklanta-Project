import {test,expect,type Page} from '@playwright/test';
import {createHash} from 'node:crypto';
import {CONSUMER,installAdmin,stats,knownOffer,fixturePost,revealedSecret,validateCredential,
 exerciseAccess,recordProofHashes,sanitizedScreenshot,observeApiFailures,finishApiFailures,failureDiagnosticSnapshot} from './console-fixtures';

const PATH='/integrate/developer';
function canonical(value:unknown):string{
 if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
 if(value!==null&&typeof value==='object')return '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical((value as Record<string,unknown>)[key])).join(',')+'}';
 const encoded=JSON.stringify(value);if(encoded===undefined)throw Error('Invalid independent payload');return encoded;
}
async function keyboardActivate(page:Page,name:string){
 if(name==='Sign reviewed message'||name==='Sign and apply action')await expect(page.getByTestId('reviewed-proof').getByRole('heading')).toBeFocused();
 const button=page.getByRole('button',{name,exact:true});await expect(button).toBeEnabled();await button.focus();await expect(button).toBeFocused();await page.keyboard.press('Enter');
}
async function login(page:Page){
 await page.goto(PATH);await expect(page.getByRole('heading',{name:'Developer account',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Reload developer session',exact:true})).toBeEnabled();
 expect((await stats(page)).connect).toBe(0);expect((await stats(page)).sign).toBe(0);
 await keyboardActivate(page,'Connect Phantom');await page.getByRole('button',{name:'Review admin sign-in',exact:true}).click();
 await expect(page.getByTestId('reviewed-proof')).toBeVisible();
 const message=await page.getByRole('textbox',{name:'Exact wallet message',exact:true}).inputValue();
 expect(message.includes('developer-admin-login')).toBe(true);expect((await stats(page)).sign).toBe(0);
 await keyboardActivate(page,'Sign reviewed message');await expect(page.getByRole('heading',{name:'My applications',exact:true})).toBeVisible();
 await expect(page.getByTestId('reviewed-proof')).toHaveCount(0);
}
async function apply(page:Page,button:string){
 const before=(await stats(page)).sign;await page.getByRole('button',{name:button,exact:true}).click();
 await expect(page.getByTestId('reviewed-proof')).toBeVisible();
 const payload=await page.getByRole('textbox',{name:'Exact action payload',exact:true}).inputValue();
 const parsed=JSON.parse(payload),message=await page.getByRole('textbox',{name:'Exact wallet message',exact:true}).inputValue();
 const hash=createHash('sha256').update(canonical(parsed)).digest('hex');
 expect(message.includes('Payload SHA256: '+hash)&&message.includes('Issuer: http://127.0.0.1:3112')
  &&message.includes('Environment: devnet')&&/^Application: app_[a-f0-9]{32}$/m.test(message)).toBe(true);
 expect((await stats(page)).sign).toBe(before);
 await keyboardActivate(page,'Sign and apply action');await expect(page.getByTestId('reviewed-proof')).toHaveCount(0);
}
async function tab(page:Page,name:string){
 const button=page.getByRole('navigation',{name:'Application sections',exact:true}).getByRole('button',{name,exact:true});
 const alreadyCurrent=await button.getAttribute('aria-current')==='page';await button.click();
 const heading=page.getByRole('heading',{name,exact:true,level:3});await expect(heading).toBeVisible();if(!alreadyCurrent)await expect(heading).toBeFocused();
}
async function createApp(page:Page,name='Independent console app'){
 await page.getByRole('textbox',{name:'Application name',exact:true}).fill(name);
 await page.getByRole('textbox',{name:'Description (optional)',exact:true}).fill('Disposable local independent acceptance fixture');
 const answer=page.waitForResponse(r=>r.url().endsWith('/v1/developer/apps')&&r.request().method()==='POST');
 await page.getByRole('button',{name:'Create draft application',exact:true}).click();
 const data=await (await answer).json();expect(/^app_[a-f0-9]{32}$/.test(data.app?.id??'')).toBe(true);
 await expect(page.getByRole('heading',{name,exact:true,level:2})).toBeVisible();return String(data.app.id);
}
async function state(page:Page,value:string){
 await tab(page,'Settings');await page.getByRole('combobox',{name:'Application status',exact:true}).selectOption(value);await apply(page,'Review save settings');
 await expect(page.getByRole('combobox',{name:'Application status',exact:true})).toHaveValue(value);
}
async function noPersistence(page:Page){
 const clean=await page.evaluate(()=>!/pact_sk_dev_key_[a-f0-9]{32}_[A-Za-z0-9_-]{43}|pact_grant_[A-Za-z0-9_-]{43}/.test(JSON.stringify({...localStorage,...sessionStorage})));
 expect(clean).toBe(true);
}
test.beforeEach(async({page})=>{observeApiFailures(page);});
test.afterEach(async({page},info)=>{
 if(info.status!==info.expectedStatus){
  info.annotations.push({type:'pact-safe-failure-v1',description:JSON.stringify(await failureDiagnosticSnapshot(page))});
  const diagnostics=await page.evaluate(()=>({
   selectLabels:[...document.querySelectorAll('select')].map(el=>({labels:[...(el.labels??[])].map(label=>label.textContent?.slice(0,300)),ariaLabel:el.getAttribute('aria-label')})),
   activeTag:document.activeElement?.tagName,
   activeButton:document.activeElement?.tagName==='BUTTON'?document.activeElement.textContent:null,
   alerts:[...document.querySelectorAll('main [role=alert]')].map(el=>el.textContent),
   signatures:(window as unknown as {__qaConsoleStats?:{sign:number}}).__qaConsoleStats?.sign,
  })).catch(()=>({unavailable:true}));
  const safe=JSON.stringify(diagnostics).replace(/pact_sk_dev_key_[a-f0-9]{32}_[A-Za-z0-9_-]{43}/g,'[REDACTED_KEY]').replace(/Browser\/session binding: [a-f0-9]{64}/g,'[REDACTED_BINDING]');
  console.log('SAFE_UI_FAILURE_DIAGNOSTICS '+safe);
  for(const select of await page.getByRole('combobox').all())console.log('SAFE_SELECT_ACCESSIBILITY '+await select.ariaSnapshot());
 }else await finishApiFailures(page);
 await recordProofHashes(info);
});

test('real console setup, signed policy, once-only secrets, rotation, enforcement and monitoring',async({page},info)=>{
 test.setTimeout(120000);
 const identity=await installAdmin(page),offer=await knownOffer(page,identity.first),errors:string[]=[],violations:string[]=[];
 let expectedReadinessFailure=false;
 page.on('pageerror',error=>errors.push(error.message));page.on('console',m=>{if(m.type()==='error'){
  if(expectedReadinessFailure&&m.location().url==='http://127.0.0.1:3112/v1/health/ready'&&m.text().includes('status of 503'))return;
  errors.push(m.text());
 }});
 await page.exposeFunction('__qaConsoleCsp',(directive:string)=>violations.push(directive));
 await page.addInitScript(()=>document.addEventListener('securitypolicyviolation',event=>(window as unknown as {__qaConsoleCsp:(s:string)=>void}).__qaConsoleCsp(event.violatedDirective)));
 await login(page);const appId=await createApp(page);
 const response=await page.request.get(PATH),headers=response.headers(),csp=headers['content-security-policy'];
 expect(csp).toContain("'strict-dynamic'");expect(csp).not.toContain("'unsafe-inline'");expect(csp).not.toContain("'unsafe-eval'");
 expect(headers['x-frame-options']).toBe('DENY');expect(headers['referrer-policy']).toBe('no-referrer');
 expect((await page.request.get(PATH)).headers()['content-security-policy']!==csp).toBe(true);
 await tab(page,'Callbacks');await page.getByLabel('Callback URI',{exact:true}).fill(CONSUMER+'/callback');
 await page.getByLabel('Website origin',{exact:true}).fill(CONSUMER);await apply(page,'Review register callback');
 await expect(page.getByRole('heading',{name:CONSUMER+'/callback',exact:true})).toBeVisible();
 await expect(page.getByText(/verified.*local loopback/)).toBeVisible();
 await tab(page,'Resources');await page.getByLabel('Resource key',{exact:true}).fill('premium');await page.getByLabel('Offer address',{exact:true}).fill(offer);
 await apply(page,'Review bind resource');await expect(page.getByRole('heading',{name:'premium',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'View history premium',exact:true}).click();await expect(page.getByRole('heading',{name:'Version history: premium',exact:true})).toBeVisible();
 await tab(page,'Credentials');await page.getByLabel('Credential name',{exact:true}).fill('Independent acceptance key');
 await apply(page,'Review create credential');const original=await revealedSecret(page),originalId=original.match(/pact_sk_dev_(key_[a-f0-9]{32})_/)![1];
 await page.evaluate(()=>{
  const surface=window as unknown as {__qaClipboard?:{value:string;deny:boolean}};surface.__qaClipboard={value:'',deny:false};
  Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async(value:string)=>{if(surface.__qaClipboard!.deny)throw Error('Synthetic clipboard unavailable');surface.__qaClipboard!.value=value;}}});
 });
 await page.getByRole('button',{name:'Copy server api secret',exact:true}).click();
 expect(await page.evaluate(()=>(window as unknown as {__qaClipboard:{value:string}}).__qaClipboard.value===(document.querySelector('[data-testid=one-time-secret] textarea') as HTMLTextAreaElement).value)).toBe(true);
 await expect(page.getByTestId('one-time-secret').getByText('Copied.',{exact:true})).toBeVisible();
 await page.evaluate(()=>{(window as unknown as {__qaClipboard:{value:string;deny:boolean}}).__qaClipboard={value:'',deny:true};});
 await page.getByRole('button',{name:'Copy server api secret',exact:true}).click();await expect(page.getByText('Clipboard unavailable. Text selected; copy it manually.',{exact:true})).toBeVisible();
 expect(await page.getByRole('textbox',{name:'Server API secret',exact:true}).evaluate(el=>{const input=el as HTMLTextAreaElement;return document.activeElement===input&&input.selectionStart===0&&input.selectionEnd===input.value.length;})).toBe(true);
 await page.evaluate(()=>{delete(window as unknown as {__qaClipboard?:unknown}).__qaClipboard;});
 await noPersistence(page);await page.getByRole('button',{name:'Dismiss secret',exact:true}).click();await expect(page.getByTestId('one-time-secret')).toHaveCount(0);
 await tab(page,'Integration');
 for(const framework of ['rest','express','nextjs','react-backend']){
  await page.getByRole('combobox',{name:'Template framework',exact:true}).selectOption(framework);
  const values=await page.locator('textarea').evaluateAll(elements=>elements.map(el=>(el as HTMLTextAreaElement).value).join('\n'));
  expect(!values.includes(original)&&!values.includes('pact_grant_')).toBe(true);expect(values.includes('SET_ONLY_IN_YOUR_SERVER_SECRET_STORE')).toBe(true);
  const commands=await page.getByRole('textbox',{name:'Runnable example commands',exact:true}).inputValue();
  const directory=framework==='rest'?'examples/pact-hosted-rest':framework==='express'?'examples/pact-hosted-express':'examples/pact-hosted-next';
  expect(commands.includes(directory)&&commands.includes('npm --prefix')).toBe(true);
 }
 const guide=await page.request.get('/developer/guide.md');expect(guide.status()).toBe(200);expect((await guide.text()).includes('server')).toBe(true);
 const download=page.waitForEvent('download');await page.getByRole('link',{name:'Download OpenAPI contract',exact:true}).click();
 const artifact=await download;expect(artifact.suggestedFilename()).toBe('pact-openapi.json');
 const stream=await artifact.createReadStream();if(!stream)throw Error('OpenAPI download unavailable');const parts:Buffer[]=[];for await(const bytes of stream)parts.push(bytes);
 const contract=JSON.parse(Buffer.concat(parts).toString('utf8'));expect(contract.openapi).toBe('3.1.0');expect(Object.values(contract.paths).flatMap(item=>Object.values(item as object)).length).toBe(35);
 await state(page,'active');expect((await validateCredential(original)).valid).toBe(true);
 await tab(page,'Credentials');const oldRow=page.getByTestId('credential-'+originalId);
 await oldRow.getByRole('button',{name:'Review rotate credential Independent acceptance key',exact:true}).click();
 await expect(page.getByTestId('reviewed-proof')).toBeVisible();await keyboardActivate(page,'Sign and apply action');
 const rotated=await revealedSecret(page),rotatedId=rotated.match(/pact_sk_dev_(key_[a-f0-9]{32})_/)![1];expect(rotated!==original).toBe(true);
 await page.getByRole('button',{name:'Dismiss secret',exact:true}).click();expect((await validateCredential(original)).valid).toBe(true);expect((await validateCredential(rotated)).valid).toBe(true);
 await oldRow.getByRole('button',{name:'Review revoke credential Independent acceptance key',exact:true}).click();
 await expect(page.getByTestId('reviewed-proof')).toBeVisible();await keyboardActivate(page,'Sign and apply action');await expect(page.getByTestId('reviewed-proof')).toHaveCount(0);
 expect((await validateCredential(original)).valid).toBe(false);expect((await validateCredential(rotated)).valid).toBe(true);
 const access=await exerciseAccess(rotated,offer);expect(access).toEqual({denyStatus:403,allowStatus:200,appId});
 await tab(page,'Usage');await expect(page.getByRole('table',{name:'Recorded authorization usage'})).toBeVisible();
 await expect(page.getByText(/LICENSE_REQUIRED/)).toBeVisible();await expect(page.getByText(/ACTIVE_LICENSE/)).toBeVisible();
 await tab(page,'Audit');await expect(page.getByText('access.allow',{exact:true})).toBeVisible();await expect(page.getByText('access.deny',{exact:true})).toBeVisible();
 await noPersistence(page);expect(errors).toEqual([]);expect(violations).toEqual([]);
 await tab(page,'Test console');await page.getByRole('button',{name:'Check live readiness',exact:true}).click();await expect(page.getByText(/Readiness verified at/)).toBeVisible();
 await fixturePost(page,'/qa/rpc-state',{fail:true});expectedReadinessFailure=true;
 try{await page.getByRole('button',{name:'Check live readiness',exact:true}).click();await expect(page.getByRole('main').getByRole('alert')).toBeVisible();await expect(page.getByText(/Readiness verified at/)).toHaveCount(0);}
 finally{await fixturePost(page,'/qa/rpc-state',{fail:false});expectedReadinessFailure=false;}
 await page.getByRole('button',{name:'Check live readiness',exact:true}).click();await expect(page.getByText(/Readiness verified at/)).toBeVisible();
 await state(page,'paused');expect((await validateCredential(rotated)).valid).toBe(false);await state(page,'active');expect((await validateCredential(rotated)).valid).toBe(true);
 await tab(page,'Credentials');await page.getByTestId('credential-'+rotatedId).getByRole('button',{name:'Review revoke credential Independent acceptance key',exact:true}).click();
 await expect(page.getByTestId('reviewed-proof')).toBeVisible();await keyboardActivate(page,'Sign and apply action');await expect(page.getByTestId('reviewed-proof')).toHaveCount(0);expect((await validateCredential(rotated)).valid).toBe(false);
 await page.reload();await expect(page.getByRole('heading',{name:'My applications',exact:true})).toBeVisible();await page.getByRole('button',{name:/Independent console app.*active/}).click();
 await tab(page,'Credentials');await expect(page.getByTestId('credential-'+rotatedId)).toBeVisible();await expect(page.getByTestId('one-time-secret')).toHaveCount(0);
 await noPersistence(page);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(violations).toEqual([]);expect(errors).toEqual([]);
 await sanitizedScreenshot(page,info);
});

test('signature refusal and cancellation never establish developer session',async({page})=>{
 await installAdmin(page,{rejectSign:true});await page.goto(PATH);await keyboardActivate(page,'Connect Phantom');
 await page.getByRole('button',{name:'Review admin sign-in',exact:true}).click();await expect(page.getByTestId('reviewed-proof')).toBeVisible();
 await page.getByRole('button',{name:'Cancel review',exact:true}).click();expect((await stats(page)).sign).toBe(0);await expect(page.getByRole('heading',{name:'My applications',exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'Review admin sign-in',exact:true}).click();await keyboardActivate(page,'Sign reviewed message');
 await expect(page.getByRole('main').getByRole('alert')).toContainText('refused');expect((await stats(page)).sign).toBe(1);
 await expect(page.getByRole('heading',{name:'My applications',exact:true})).toHaveCount(0);await noPersistence(page);
});

test('missing wallet and refused connection give actionable denial without signing',async({page})=>{
 await page.goto(PATH);await expect(page.getByRole('button',{name:'Connect Phantom',exact:true})).toBeDisabled();await expect(page.getByText(/message signing is unavailable/)).toBeVisible();
 await installAdmin(page,{rejectConnect:true});await page.reload();await keyboardActivate(page,'Connect Phantom');
 await expect(page.getByRole('main').getByRole('alert')).toContainText('refused');expect((await stats(page)).sign).toBe(0);await expect(page.getByTestId('reviewed-proof')).toHaveCount(0);
});

test('wallet switch clears once-only reveal; server expiry clears account records and tenants stay isolated',async({page})=>{
 const identities=await installAdmin(page);await login(page);const firstAppId=await createApp(page,'Sensitive state fixture');
 await tab(page,'Credentials');await page.getByLabel('Credential name',{exact:true}).fill('Sensitive state key');await apply(page,'Review create credential');
 await revealedSecret(page);await page.evaluate(()=>(window as unknown as {__qaConsoleSwitch:()=>void}).__qaConsoleSwitch());
 await expect(page.getByTestId('one-time-secret')).toHaveCount(0);await expect(page.getByRole('button',{name:'Review create credential',exact:true})).toBeDisabled();
 await expect(page.getByText(/Wallet changed\. Reconnect the proven admin wallet/)).toBeVisible();
 await fixturePost(page,'/qa/expire-admin',{walletAddress:identities.first.address});await page.getByRole('button',{name:'Reload developer session',exact:true}).click();
 await expect(page.getByRole('heading',{name:'My applications',exact:true})).toHaveCount(0);await expect(page.getByTestId('one-time-secret')).toHaveCount(0);await noPersistence(page);
 // The new account must explicitly prove itself, and cannot inherit the first account's applications.
 await keyboardActivate(page,'Connect Phantom');await page.getByRole('button',{name:'Review admin sign-in',exact:true}).click();await keyboardActivate(page,'Sign reviewed message');
 await expect(page.getByRole('heading',{name:'My applications',exact:true})).toBeVisible();await expect(page.getByText('No applications yet. Create your first draft.',{exact:true})).toBeVisible();
 expect(await page.evaluate(async id=>(await fetch('/v1/developer/apps/'+id,{credentials:'same-origin'})).status,firstAppId)).toBe(404);
 await page.getByRole('textbox',{name:'Application name',exact:true}).fill('Second tenant fixture');await page.getByRole('button',{name:'Create draft application',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Second tenant fixture',exact:true,level:2})).toBeVisible();await tab(page,'Settings');await page.getByRole('combobox',{name:'Application status',exact:true}).selectOption('active');
 await page.getByRole('button',{name:'Review save settings',exact:true}).click();await expect(page.getByTestId('reviewed-proof')).toBeVisible();
 await page.getByRole('button',{name:'Cancel review',exact:true}).click();await expect(page.getByRole('combobox',{name:'Application status',exact:true})).toHaveValue('active');
 await tab(page,'Overview');await tab(page,'Settings');await expect(page.getByRole('combobox',{name:'Application status',exact:true})).toHaveValue('draft');expect((await stats(page)).sign).toBe(3);
});

test('fresh signed seller proof rejects an unrelated offer without creating a policy',async({page})=>{
 const identities=await installAdmin(page),foreignOffer=await knownOffer(page,identities.second);await login(page);await createApp(page,'Seller proof fixture');
 await tab(page,'Resources');await page.getByLabel('Resource key',{exact:true}).fill('foreign-feature');await page.getByLabel('Offer address',{exact:true}).fill(foreignOffer);
 await page.getByRole('button',{name:'Review bind resource',exact:true}).click();await expect(page.getByTestId('reviewed-proof')).toBeVisible();await keyboardActivate(page,'Sign and apply action');
 await expect(page.getByRole('main').getByRole('alert')).toContainText('does not belong');
 if(await page.getByTestId('reviewed-proof').count())await page.getByRole('button',{name:'Cancel review',exact:true}).click();
 await tab(page,'Overview');await tab(page,'Resources');await expect(page.getByText('No resources bound.',{exact:true})).toBeVisible();expect((await stats(page)).sign).toBe(2);
});

test('ordinary AUTH_REQUIRED response clears a revealed key and cached account without session reload',async({page})=>{
 const identities=await installAdmin(page);await login(page);await createApp(page,'Expired session fixture');
 await tab(page,'Credentials');await page.getByLabel('Credential name',{exact:true}).fill('Expiry cleanup key');await apply(page,'Review create credential');
 await revealedSecret(page);await fixturePost(page,'/qa/expire-admin',{walletAddress:identities.first.address});
 await page.getByLabel('Application name',{exact:true}).fill('Must not be created');
 const denied=page.waitForResponse(r=>r.url().endsWith('/v1/developer/apps')&&r.request().method()==='POST');
 await page.getByRole('button',{name:'Create draft application',exact:true}).click();
 const response=await denied;expect(response.status()).toBe(401);expect((await response.json()).error?.code).toBe('AUTH_REQUIRED');
 await expect(page.getByTestId('one-time-secret')).toHaveCount(0);await expect(page.getByRole('heading',{name:'My applications',exact:true})).toHaveCount(0);
 await expect(page.getByRole('main').getByRole('alert')).toContainText('session expired or changed');await noPersistence(page);
});

test('wallet change invalidates an unsigned action without applying draft settings',async({page})=>{
 await installAdmin(page);await login(page);await createApp(page,'Unsigned proof fixture');await tab(page,'Settings');
 await page.getByRole('combobox',{name:'Application status',exact:true}).selectOption('active');await page.getByRole('button',{name:'Review save settings',exact:true}).click();
 await expect(page.getByTestId('reviewed-proof')).toBeVisible();expect((await stats(page)).sign).toBe(1);
 await page.evaluate(()=>(window as unknown as {__qaConsoleSwitch:()=>void}).__qaConsoleSwitch());await expect(page.getByTestId('reviewed-proof')).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Review save settings',exact:true})).toBeDisabled();expect((await stats(page)).sign).toBe(1);
 await tab(page,'Overview');await tab(page,'Settings');await expect(page.getByRole('combobox',{name:'Application status',exact:true})).toHaveValue('draft');
});

test('public onboarding drafts resume after reload while unsigned policies remain unsaved',async({page})=>{
 await installAdmin(page);await login(page);
 await page.getByLabel('Application name',{exact:true}).fill('Resumed application');await page.getByRole('textbox',{name:'Description (optional)',exact:true}).fill('Resumed public draft');
 await page.getByRole('combobox',{name:'Application framework',exact:true}).selectOption('express');await page.reload();
 await expect(page.getByLabel('Application name',{exact:true})).toHaveValue('Resumed application');await expect(page.getByRole('textbox',{name:'Description (optional)',exact:true})).toHaveValue('Resumed public draft');
 await expect(page.getByRole('combobox',{name:'Application framework',exact:true})).toHaveValue('express');await keyboardActivate(page,'Connect Phantom');
 await page.getByRole('button',{name:'Create draft application',exact:true}).click();await expect(page.getByRole('heading',{name:'Resumed application',exact:true,level:2})).toBeVisible();
 await expect(page.getByLabel('Application name',{exact:true})).toHaveValue('');
 await tab(page,'Callbacks');await page.getByLabel('Callback URI',{exact:true}).fill(CONSUMER+'/draft-callback');await page.getByLabel('Website origin',{exact:true}).fill(CONSUMER);
 await tab(page,'Resources');await page.getByLabel('Resource key',{exact:true}).fill('draft-feature');
 await tab(page,'Overview');await page.reload();await expect(page.getByRole('heading',{name:'My applications',exact:true})).toBeVisible();
 await page.getByRole('button',{name:/Resumed application.*draft/}).click();await tab(page,'Callbacks');
 await expect(page.getByLabel('Callback URI',{exact:true})).toHaveValue(CONSUMER+'/draft-callback');await expect(page.getByText('No callbacks registered.',{exact:true})).toBeVisible();
 await tab(page,'Resources');await expect(page.getByLabel('Resource key',{exact:true})).toHaveValue('draft-feature');await expect(page.getByText('No resources bound.',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Log out developer',exact:true}).click();await expect(page.getByRole('heading',{name:'My applications',exact:true})).toHaveCount(0);
 expect(await page.evaluate(()=>Object.keys(sessionStorage).some(key=>key.startsWith('pact-public-draft:')))).toBe(false);await noPersistence(page);
});
