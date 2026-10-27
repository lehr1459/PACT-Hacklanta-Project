import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {serializeOpenAPI} from '../src/openapi.mjs';
const files=[new URL('../openapi.json',import.meta.url),new URL('../../../web/public/developer/openapi.json',import.meta.url)];
const expected=serializeOpenAPI();
if(process.argv[2]==='--check'){
  for(const file of files){let actual;try{actual=await readFile(file,'utf8');}catch{throw Error('Generated OpenAPI missing; run npm run openapi.');}
    if(actual!==expected)throw Error('Generated OpenAPI drift; run npm run openapi.');}
  console.log('Hosted OpenAPI artifacts match runtime schemas (35 operations).');
}else if(process.argv.length===2){for(const file of files){await mkdir(new URL('./',file),{recursive:true});await writeFile(file,expected);}console.log('Generated hosted OpenAPI artifacts.');}
else throw Error('Usage: node scripts/openapi.mjs [--check]');
