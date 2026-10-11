import {mkdir,readdir,symlink} from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve('.'),candidate=path.resolve(process.argv[2]??'');
if(!candidate.startsWith(path.join(root,'.deployment-candidates')+path.sep))throw Error('Only PACT deployment candidate permitted');
async function linked(source,target,localSdk){await mkdir(target,{recursive:true});for(const entry of await readdir(source,{withFileTypes:true})){if(!entry.isDirectory()&&!entry.isSymbolicLink())continue;if(entry.name==='@pact'&&localSdk){await mkdir(path.join(target,'@pact'),{recursive:true});await symlink(localSdk,path.join(target,'@pact/sdk'),'junction');continue;}await symlink(path.join(source,entry.name),path.join(target,entry.name),'junction');}}
await symlink(path.join(root,'packages/pact-sdk/node_modules'),path.join(candidate,'pact/packages/pact-sdk/node_modules'),'junction');
await linked(path.join(root,'web/node_modules'),path.join(candidate,'pact/web/node_modules'),path.join(candidate,'pact/packages/pact-sdk'));
await linked('C:/Hackathon/saturday-lights/node_modules',path.join(candidate,'saturday-lights/node_modules'),path.join(candidate,'saturday-lights/vendor/pact-sdk'));
console.log('Existing dependency links created only inside '+candidate+'; local SDK links bind candidate copies.');
