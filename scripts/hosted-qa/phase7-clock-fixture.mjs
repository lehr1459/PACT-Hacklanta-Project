import {mkdir,mkdtemp,chmod,readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';

const root=fileURLToPath(new URL('../../web/test-results/hosted-tools/phase7-clocks/',import.meta.url));
export async function clockDirectory(){
 await mkdir(root,{recursive:true,mode:0o700});const directory=await mkdtemp(path.join(root,'authority-'));await chmod(directory,0o700);return directory;
}
export async function waitForClockCeiling(directory){
 const record=await readFile(path.join(directory,'authority.bin')),ceiling=Number(record.subarray(0,128).toString('ascii').split('\n')[3]);
 if(!Number.isSafeInteger(ceiling)||ceiling<0||ceiling>Date.now()+1000)throw Error('Unsafe fixture clock restart ceiling');
 while(Date.now()<=ceiling)await delay(Math.min(25,Math.max(1,ceiling-Date.now()+1)));
}
