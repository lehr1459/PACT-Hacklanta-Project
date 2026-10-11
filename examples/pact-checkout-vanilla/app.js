import {mountCheckout} from '/pact-checkout.mjs';
import {checkoutConfig} from './config.js';

const node=id=>document.getElementById(id);
const palettes=[['#FF8B5E','#FFCE8A','#F3ECD8','#6E8B84','#183B40'],['#C2B7FD','#8B83BA','#EBDBC5','#E79976','#31374B'],['#D2E66F','#9DAA64','#E2D8BC','#AA765D','#354746']];
const names=['Golden hour','Quiet orbit','Field notes'];
let controller,selection=0;
function drawPalette(){
  node('palette').replaceChildren(...palettes[selection].map(color=>{const tile=document.createElement('div');tile.style.backgroundColor=color;const label=document.createElement('code');label.textContent=color;tile.append(label);return tile;}));
  node('palette-name').textContent=names[selection];
}
function renderAccess(state){
  const open=state.access==='active';
  node('premium-gate').dataset.state=open?'active':'locked';
  node('premium-content').hidden=!open;node('locked-view').hidden=open;node('remix').disabled=!open;
  node('access-status').textContent=open?'Fresh access verified':state.access==='expired'?'License expired':state.access==='paused'?'Access paused':'License required';
  node('workspace-title').textContent=open?'Your workspace is open.':'Your next palette is waiting.';
  node('workspace-message').textContent=state.message;
}
for(const [field,value] of Object.entries(checkoutConfig)){const target=node(`config-${field==='programId'?'program':field==='rpcUrl'?'rpc':field}`);if(target)target.textContent=value;}
drawPalette();
try{
  controller=mountCheckout({...checkoutConfig,element:node('checkout'),onState:renderAccess});
}catch{
  node('checkout').textContent='Checkout configuration is invalid or unavailable. Premium access remains locked.';
  renderAccess({access:'error',message:'Checkout could not initialize. No wallet or transaction was requested.'});
}
node('remix').addEventListener('click',()=>{
  const current=controller?.getState();
  if(!current||current.access!=='active'){if(current)renderAccess(current);return;}
  selection=(selection+1)%palettes.length;drawPalette();
});
window.addEventListener('pagehide',()=>{node('premium-content').hidden=true;node('locked-view').hidden=false;node('remix').disabled=true;controller?.destroy();},{once:true});
