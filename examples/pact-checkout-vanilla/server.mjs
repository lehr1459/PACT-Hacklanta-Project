import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {readFile} from 'node:fs/promises';

const directory=path.dirname(fileURLToPath(import.meta.url));
const files=new Map([
  ['/',[path.join(directory,'index.html'),'text/html; charset=utf-8']],
  ['/index.html',[path.join(directory,'index.html'),'text/html; charset=utf-8']],
  ['/app.js',[path.join(directory,'app.js'),'text/javascript; charset=utf-8']],
  ['/config.js',[path.join(directory,'config.js'),'text/javascript; charset=utf-8']],
  ['/style.css',[path.join(directory,'style.css'),'text/css; charset=utf-8']],
  ['/pact-checkout.mjs',[path.resolve(directory,'../../packages/pact-sdk/dist/pact-checkout.mjs'),'text/javascript; charset=utf-8']],
  ['/pact-checkout.js',[path.resolve(directory,'../../packages/pact-sdk/dist/pact-checkout.js'),'text/javascript; charset=utf-8']],
]);
try{await readFile(files.get('/pact-checkout.mjs')[0]);}catch{throw new Error('Build packages/pact-sdk first; the self-contained checkout browser bundle is missing.');}
const requested=process.env.PORT===undefined?3006:Number(process.env.PORT);
if(!Number.isInteger(requested)||requested<3006||requested>3016)throw new Error('PORT must be an integer from 3006 through 3016.');
const server=http.createServer(async(request,response)=>{
  const pathname=new URL(request.url,'http://127.0.0.1').pathname;
  const file=files.get(pathname);
  if(!['GET','HEAD'].includes(request.method)||!file){response.writeHead(404);response.end('Not found');return;}
  try{const content=await readFile(file[0]);response.writeHead(200,{'Content-Type':file[1],'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});response.end(request.method==='HEAD'?undefined:content);}
  catch{response.writeHead(404);response.end('File unavailable. Build the SDK before starting.');}
});
async function listen(port){return new Promise((resolve,reject)=>{const failed=error=>{server.removeListener('listening',ready);reject(error);};const ready=()=>{server.removeListener('error',failed);resolve();};server.once('error',failed);server.once('listening',ready);server.listen(port,'127.0.0.1');});}
let actual;
for(let port=requested;port<=3016;port++){try{await listen(port);actual=port;break;}catch(error){if(error.code!=='EADDRINUSE')throw error;}}
if(actual===undefined)throw new Error('No available PACT checkout port from the requested port through 3016. Existing listeners were left running.');
console.log(`PACT embedded checkout example: http://localhost:${actual}/ (bound to 127.0.0.1)`);
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>process.exit(0)));
