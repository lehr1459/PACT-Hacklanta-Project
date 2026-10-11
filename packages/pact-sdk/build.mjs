import {execFileSync} from 'node:child_process';
import {build} from 'esbuild';
import {existsSync} from 'node:fs';
execFileSync(process.execPath,['node_modules/typescript/bin/tsc','-p','tsconfig.json'],{stdio:'inherit'});
if(existsSync('src/widget.ts')){
 const common={entryPoints:['src/widget.ts'],bundle:true,platform:'browser',target:'es2022',legalComments:'inline',sourcemap:false};
 await build({...common,format:'esm',outfile:'dist/pact-checkout.mjs'});
 await build({...common,format:'iife',globalName:'PACT',outfile:'dist/pact-checkout.js'});
}
