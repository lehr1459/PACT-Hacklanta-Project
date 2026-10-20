import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
// Diagnostic REST transport only. Actual route enforcement uses the reviewed client/BFF.
function quote(value){return '"'+value.replaceAll('\\','\\\\').replaceAll('"','\\"').replaceAll('\n','\\n').replaceAll('\r','\\r')+'"';}
export async function curlPost({origin,apiKey,path,body,timeoutMs=7500}){
 const u=new URL(origin);
 if(u.origin!==origin||u.username||u.password||u.protocol!=='https:'&&!(u.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(u.hostname))
   ||!['/v1/credentials/validate','/v1/access/check'].includes(path)||!/^pact_sk_dev_key_[a-f0-9]{32}_[A-Za-z0-9_-]{43}$/.test(apiKey)
   ||!Number.isSafeInteger(timeoutMs)||timeoutMs<50||timeoutMs>8000)throw Error('REST_CONFIGURATION_INVALID');
 const data=JSON.stringify(body);if(Buffer.byteLength(data)>16384)throw Error('REST_INPUT_INVALID');
 const config=[`url = ${quote(origin+path)}`,'request = "POST"',`header = ${quote('Authorization: Bearer '+apiKey)}`,'header = "Content-Type: application/json"',`data = ${quote(data)}`,'silent','max-redirs = 0','connect-timeout = 2',`max-time = ${timeoutMs/1000}`,'write-out = "\\n%{http_code}"','max-filesize = 131072','proto = "=http,https"'].join('\n')+'\n';
 return new Promise((resolveResult,reject)=>{
  // -q must be first: refuse user curlrc, proxies, and verbose credential logs.
  const child=spawn(process.platform==='win32'?'curl.exe':'curl',['-q','--config','-'],{windowsHide:true,stdio:['pipe','pipe','pipe'],env:{...process.env,HTTP_PROXY:'',HTTPS_PROXY:'',ALL_PROXY:'',http_proxy:'',https_proxy:'',all_proxy:'',NO_PROXY:'*',no_proxy:'*'}});
  let bytes=0;const chunks=[];let settled=false;
  const fail=()=>{if(settled)return;settled=true;clearTimeout(timer);child.kill();reject(Error('REST_REQUEST_FAILED'));};
  const timer=setTimeout(fail,timeoutMs+250);child.once('error',fail);child.stdin.on('error',fail);
  child.stdout.on('data',chunk=>{bytes+=chunk.length;if(bytes>131080)return fail();chunks.push(chunk);});
  child.stderr.on('data',()=>{}); // Never retain native diagnostics or secret request config.
  child.once('close',code=>{
   if(settled)return;settled=true;clearTimeout(timer);if(code!==0)return reject(Error('REST_REQUEST_FAILED'));
   try{const text=Buffer.concat(chunks).toString('utf8'),i=text.lastIndexOf('\n'),status=Number(text.slice(i+1)),body=JSON.parse(text.slice(0,i));
    if(!Number.isInteger(status)||status<100||status>599)throw Error();resolveResult({status,body});
   }catch{reject(Error('REST_RESPONSE_INVALID'));}
  });child.stdin.end(config);
 });
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const mode=process.argv[2];if(!['validate','access'].includes(mode))throw Error('REST_MODE_REQUIRED');
  const result=await curlPost({origin:process.env.PACT_API_BASE_URL,apiKey:process.env.PACT_API_KEY,path:mode==='validate'?'/v1/credentials/validate':'/v1/access/check',body:mode==='validate'?{}:{walletGrant:process.env.PACT_WALLET_GRANT,resourceKey:process.env.PACT_RESOURCE_KEY}});
  // Fixed, nonauthoritative observation only: no raw body, wallet, code, grant or key.
  console.log(JSON.stringify({httpStatus:result.status,observation:mode==='validate'&&result.status===200&&result.body.valid===true?'KEY_RESPONSE_RECEIVED':mode==='access'&&result.status===200&&result.body.decision==='ALLOW'?'ALLOW_RESPONSE_RECEIVED':'DENIAL_OR_ERROR',authorizesApplication:false}));
  if(result.status!==200)process.exitCode=1;
 }catch{console.error('REST diagnostic failed; check private server configuration.');process.exitCode=1;}
}
