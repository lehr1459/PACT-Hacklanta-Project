import fs from 'node:fs/promises';
import path from 'node:path';
const repo=process.cwd(),candidate=path.resolve(repo,'.deployment-candidates/20261010-213948-8755f031/pact');
for(const relative of ['web/node_modules','packages/pact-sdk/node_modules']){
 const destination=path.join(candidate,relative),source=path.join(repo,relative);
 if(!destination.startsWith(candidate+path.sep))throw Error('Unsafe candidate path');
 const stat=await fs.lstat(destination);
 if(stat.isSymbolicLink())await fs.unlink(destination);
 else {for(const item of await fs.readdir(destination)){const target=path.join(destination,item);const info=await fs.lstat(target);if(info.isSymbolicLink())await fs.unlink(target);else if(item.startsWith('@')){for(const sub of await fs.readdir(target)){const nested=path.join(target,sub);if((await fs.lstat(nested)).isSymbolicLink())await fs.unlink(nested);}}}}
 await fs.cp(source,destination,{recursive:true,dereference:true,force:true});
}
const sdk=path.join(candidate,'web/node_modules/@pact/sdk');
// The copied dependency is public source/output; overwrite it with the exact staged package.
await fs.cp(path.join(candidate,'packages/pact-sdk/dist'),path.join(sdk,'dist'),{recursive:true,force:true});
await fs.copyFile(path.join(candidate,'packages/pact-sdk/package.json'),path.join(sdk,'package.json'));
console.log('Physical public dependencies copied inside candidate root; source dependencies untouched.');
