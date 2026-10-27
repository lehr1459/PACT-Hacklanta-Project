import {execFileSync} from 'node:child_process';
import {build} from 'esbuild';
import {existsSync,lstatSync,rmSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const packageRoot=path.dirname(fileURLToPath(import.meta.url));
const output=path.resolve(packageRoot,'dist');
if(path.dirname(output)!==packageRoot||path.basename(output)!=='dist')throw Error('Invalid SDK build output');
if(existsSync(output)&&lstatSync(output).isSymbolicLink())throw Error('SDK build output must not be a symlink');
rmSync(output,{recursive:true,force:true});
execFileSync(process.execPath,[path.join(packageRoot,'node_modules/typescript/bin/tsc'),'-p','tsconfig.json'],{cwd:packageRoot,stdio:'inherit'});
if(existsSync(path.join(packageRoot,'src/widget.ts'))){
 const common={absWorkingDir:packageRoot,entryPoints:['src/widget.ts'],bundle:true,platform:'browser',target:'es2022',legalComments:'inline',sourcemap:false};
 await build({...common,format:'esm',outfile:'dist/pact-checkout.mjs'});
 await build({...common,format:'iife',globalName:'PACT',outfile:'dist/pact-checkout.js'});
}
