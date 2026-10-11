import {test,expect} from '../../../web/node_modules/@playwright/test/index.mjs';
import {snapshot,PROGRAM,GENESIS,offer,wallet,other,metadataJson,license,blockhash,signature} from '../../../packages/pact-sdk/tests/checkout-qa-fixtures.mjs';

const live=process.env.PACT_CHECKOUT_QA_MODE==='live';
async function mount(page:any,bundle='esm',initial:any={}){
  const state={slot:100,timestamp:1000n,expiry:1060n,missing:true,genesis:GENESIS,...initial};
  const calls:string[]=[];const pageErrors:string[]=[];page.on('pageerror',(e:any)=>pageErrors.push(e.message));
  await page.route('https://api.devnet.solana.com/**',async(route:any)=>{
    const req=route.request().postDataJSON();calls.push(req.method);let result:any;
    if(req.method==='getGenesisHash')result=state.genesis;
    else if(req.method==='getMultipleAccounts'){result=snapshot(state);if(req.params[0][1]!==license.toBase58())result.value[1]=null;}
    else if(req.method==='getLatestBlockhash')result={context:{slot:state.slot},value:{blockhash,lastValidBlockHeight:150}};
    else if(req.method==='simulateTransaction')result={context:{slot:state.slot},value:{err:null,logs:[]}};
    else if(req.method==='sendTransaction'){state.missing=false;state.slot=110;result=signature;}
    else if(req.method==='getSignatureStatuses'){if((state as any).advanceDeadline)await page.evaluate(()=>(window as any).qaNow+=120001);result={context:{slot:state.slot},value:[{slot:110,err:null,confirmationStatus:(state as any).statusMode??'finalized'}]};}
    else if(req.method==='getBlockHeight')result=100;
    else if(req.method==='isBlockhashValid')result={context:{slot:state.slot},value:true};
    else throw Error('Forbidden fixture method '+req.method);
    await route.fulfill({json:{jsonrpc:'2.0',id:req.id,result}});
  });
  await page.goto('/');
  await page.evaluate(async({bundle,program,offer,wallet,metadata}:any)=>{
    const listeners=new Set<any>();let key:string|null=null;
    const adapter={connect:async()=>{key=wallet;return wallet;},disconnect:async()=>{key=null;listeners.forEach(fn=>fn(null));},getPublicKey:()=>key,subscribe:(fn:any)=>{listeners.add(fn);return()=>listeners.delete(fn);},destroy:()=>listeners.clear(),signTransaction:async(tx:any)=>{(window as any).signed++;tx.signatures[0]=new Uint8Array(64).fill(7);return tx;}};
    Object.assign(window,{signed:0,qaNow:0,changeWallet:(next:string|null,emit=true)=>{key=next;if(emit)listeners.forEach(fn=>fn(next));}});
    let api:any;if(bundle==='esm')api=await import('/sdk/pact-checkout.mjs');else{await new Promise<void>((resolve,reject)=>{const script=document.createElement('script');script.src='/sdk/pact-checkout.js';script.onload=()=>resolve();script.onerror=()=>reject(Error('IIFE load failure'));document.head.append(script);});api=(window as any).PACT;}
    (window as any).controller=api.mountCheckout({element:'#checkout',programId:program,offer,rpcUrl:'https://api.devnet.solana.com',metadataJson:metadata,walletAdapter:adapter,now:()=>(window as any).qaNow,onState:(s:any)=>{(window as any).latest=s;(document.querySelector('#premium') as HTMLButtonElement).disabled=s.access!=='active';if(s.access==='active'&&(window as any).destroyOnState)(window as any).controller.destroy();if(s.access==='active'&&(window as any).disconnectOnState)void(window as any).controller.disconnect();},onLicenseActive:()=>{if((window as any).destroyOnLicense)(window as any).controller.destroy();else if((window as any).disconnectOnLicense)void(window as any).controller.disconnect();else throw Error('Synthetic host callback failure');}});
  },{bundle,program:PROGRAM,offer:offer.toBase58(),wallet:wallet.toBase58(),metadata:metadataJson});
  return{state,calls,pageErrors};
}

test.describe('self-contained checkout bundles, synthetic identity/RPC only',()=>{
 test.skip(live);
 for(const bundle of ['esm','iife'])test(`${bundle}: explicit consent, exact metadata, finalized access and teardown`,async({page})=>{
  const f=await mount(page,bundle);await expect(page.locator('#price')).toContainText('0.001');
  expect(f.calls.every(m=>['getGenesisHash','getMultipleAccounts'].includes(m))).toBeTruthy();
  await expect(page.getByRole('button',{name:'Purchase license',exact:true})).toBeDisabled();
  await page.getByRole('button',{name:'Connect Phantom'}).click();await expect(page.locator('#status')).toHaveAttribute('data-access','unlicensed');
  await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Purchase license',exact:true}).click();
  await expect(page.locator('#premium')).toBeEnabled();await expect(page.locator('#transaction-stage')).toContainText('finalized');
  expect(await page.evaluate(()=>(window as any).signed)).toBe(1);expect(f.calls.filter(m=>m==='sendTransaction')).toHaveLength(1);
  await expect(page.locator('img')).toHaveCount(0);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
  await page.screenshot({path:`web/test-results/checkout-${bundle}-${test.info().project.name}.png`,fullPage:true});
  await page.evaluate(()=>(window as any).controller.destroy());await expect(page.locator('#checkout').locator('section')).toHaveCount(0);expect(f.pageErrors).toEqual([]);
 });
 test('active, expired, wrong wallet, silent identity changes and null events close access',async({page})=>{
  const f=await mount(page,'esm',{missing:false});await page.getByRole('button',{name:'Connect Phantom'}).click();await expect(page.locator('#premium')).toBeEnabled();
  await page.evaluate((key)=>(window as any).changeWallet(key,false),other.toBase58());await expect(page.locator('#premium')).toBeDisabled();
  await page.evaluate(()=>(window as any).changeWallet(null));await expect(page.locator('#status')).toHaveAttribute('data-access','disconnected');
  await page.getByRole('button',{name:'Connect Phantom'}).click();f.state.expiry=1000n;await page.evaluate(()=>(window as any).controller.refresh());await expect(page.locator('#status')).toHaveAttribute('data-access','expired');expect(f.calls).not.toContain('sendTransaction');expect(f.pageErrors).toEqual([]);
 });
 test('offline and fresh RPC failure cannot retain premium access',async({page})=>{
  const f=await mount(page,'esm',{missing:false});await page.getByRole('button',{name:'Connect Phantom'}).click();await expect(page.locator('#premium')).toBeEnabled();
  await page.evaluate(()=>{Object.defineProperty(navigator,'onLine',{configurable:true,value:false});dispatchEvent(new Event('offline'));});await expect(page.locator('#status')).toHaveAttribute('data-access','paused');await expect(page.locator('#premium')).toBeDisabled();
  f.state.genesis='Wrong synthetic genesis';await page.evaluate(()=>{Object.defineProperty(navigator,'onLine',{configurable:true,value:true});dispatchEvent(new Event('online'));});await expect(page.locator('#status')).toHaveAttribute('data-access','error');expect(f.calls).not.toContain('sendTransaction');expect(f.pageErrors).toEqual([]);
 });
 for(const mode of ['destroyOnState','destroyOnLicense'])test(`reentrant ${mode} callback must deliver closed host access`,async({page})=>{
  const f=await mount(page,'esm',{missing:false});await page.evaluate(mode=>{(window as any)[mode]=true;},mode);await page.getByRole('button',{name:'Connect Phantom'}).click();await expect(page.locator('#checkout').locator('section')).toHaveCount(0);await expect(page.locator('#premium')).toBeDisabled();expect(await page.evaluate(()=>(window as any).latest.access)).not.toBe('active');expect(f.pageErrors).toEqual([]);
 });
 for(const mode of ['disconnectOnState','disconnectOnLicense'])test(`reentrant ${mode} callback must deliver disconnected host access`,async({page})=>{
  const f=await mount(page,'esm',{missing:false});await page.evaluate(mode=>{(window as any)[mode]=true;},mode);await page.getByRole('button',{name:'Connect Phantom'}).click();await expect(page.locator('#premium')).toBeDisabled();await expect(page.locator('#status')).toHaveAttribute('data-access','disconnected');expect(f.pageErrors).toEqual([]);
 });
 test('8-second freshness and 12-second frozen slot fail closed, progressing slot recovers',async({page})=>{
  const f=await mount(page,'esm',{missing:false});await page.getByRole('button',{name:'Connect Phantom'}).click();await expect(page.locator('#premium')).toBeEnabled();await page.evaluate(()=>(window as any).qaNow=8001);await expect(page.locator('#premium')).toBeDisabled();await page.evaluate(()=>(window as any).qaNow=12001);await page.evaluate(()=>(window as any).controller.refresh());await expect(page.locator('#premium')).toBeDisabled();f.state.slot=101;await page.evaluate(()=>(window as any).controller.refresh());await expect(page.locator('#premium')).toBeEnabled();expect(f.calls).not.toContain('sendTransaction');expect(f.pageErrors).toEqual([]);
 });
 test('hidden closure and rapid visible resume require fresh verification; metadata edits clear consent',async({page})=>{
  const f=await mount(page,'esm',{missing:false});await page.getByRole('button',{name:'Connect Phantom'}).click();await expect(page.locator('#premium')).toBeEnabled();await page.evaluate(()=>{Object.defineProperty(document,'visibilityState',{configurable:true,value:'hidden'});document.dispatchEvent(new Event('visibilitychange'));});await expect(page.locator('#premium')).toBeDisabled();await page.evaluate(()=>{Object.defineProperty(document,'visibilityState',{configurable:true,value:'visible'});document.dispatchEvent(new Event('visibilitychange'));});await expect(page.locator('#premium')).toBeEnabled();await page.getByRole('checkbox').check();await page.locator('#metadata-panel').evaluate((element:any)=>element.open=true);await page.locator('#metadata').fill(metadataJson+' ');await expect(page.getByRole('checkbox')).not.toBeChecked();await expect(page.locator('#purchase')).toBeDisabled();expect(f.pageErrors).toEqual([]);
 });
 test('confirmed active account cannot unlock protected purchase until finalized recovery',async({page})=>{
  const f=await mount(page,'esm',{statusMode:'confirmed',advanceDeadline:true});await page.getByRole('button',{name:'Connect Phantom'}).click();await expect(page.locator('#status')).toHaveAttribute('data-access','unlicensed');await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Purchase license',exact:true}).click();await expect(page.locator('#transaction-stage')).toContainText('confirmed');await expect(page.locator('#premium')).toBeDisabled();await page.evaluate(()=>(window as any).controller.refresh());await expect(page.locator('#premium')).toBeDisabled();(f.state as any).statusMode='finalized';(f.state as any).advanceDeadline=false;f.state.slot=111;await page.evaluate(()=>(window as any).controller.refresh());await expect(page.locator('#premium')).toBeEnabled();expect(f.calls.filter(m=>m==='sendTransaction')).toHaveLength(1);expect(await page.evaluate(()=>(window as any).signed)).toBe(1);expect(f.pageErrors).toEqual([]);
 });
 test('malformed protected journal cannot unlock even with fresh active account',async({page})=>{
  const f=await mount(page,'esm',{missing:false});await page.evaluate(({program,wallet,offer})=>localStorage.setItem(`pact.solana.checkout.v1:${program}:${wallet}:${offer}`,'{"corrupt":true}'),{program:PROGRAM,wallet:wallet.toBase58(),offer:offer.toBase58()});await page.getByRole('button',{name:'Connect Phantom'}).click();await expect(page.locator('#premium')).toBeDisabled();await expect(page.getByRole('button',{name:'Purchase license',exact:true})).toBeDisabled();expect(f.calls).not.toContain('sendTransaction');expect(f.pageErrors).toEqual([]);
 });
});
