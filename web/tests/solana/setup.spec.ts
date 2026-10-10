import {test,expect} from '@playwright/test';
test.skip(()=>process.env.PACT_SOLANA_QA_MODE!=='setup','Separate unconfigured production build');
test('unconfigured root is honest, has no write path and preserves Base link',async({page})=>{
  const posts:string[]=[];page.on('request',r=>{if(r.method()==='POST')posts.push(r.url());});await page.route('**/*',route=>route.request().method()==='POST'?route.abort():route.continue());
  await page.goto('/');await expect(page.getByText('Local build ready · Solana program setup pending')).toBeVisible();await expect(page.getByTestId('solana-license-gate')).toHaveAttribute('data-state','closed');await page.getByRole('button',{name:'Seller studio'}).click();await expect(page.getByRole('button',{name:'Create offer'})).toBeDisabled();await expect(page.getByRole('link',{name:'Preserved Base Sepolia fallback'})).toHaveAttribute('href','/base');expect(posts).toEqual([]);
});
