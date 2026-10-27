// OWNER-RUN service control. This tool is never invoked by CI or artifact creation.
// Private configuration comes only from read-only mounts, never CLI arguments.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {parseConfiguration,dockerEnvironment} from './preflight.mjs';
import {createKit} from '../../../scripts/release/staging-source.mjs';
const directory=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const operations={config:['config','--quiet'],status:['ps'],
  'start-db':['up','--detach','--no-deps','postgres'],
  migrate:['run','--rm','--no-deps','migrate'],
  'start-private':['up','--detach','--no-deps','api','web'],
  'start-ingress':['up','--detach','--no-deps','gateway'],
  'stop-ingress':['stop','gateway'],stop:['stop','gateway','web','api','postgres']};
try{
 const [file,action,revision,...extra]=process.argv.slice(2);assert.equal(extra.length,0);assert.ok(Object.hasOwn(operations,action));
 assert.equal(process.platform,'linux');assert.equal(process.arch,'x64');assert.match(revision??'',/^[a-f0-9]{40}$/);
 const filename=path.resolve(file),stat=await fs.lstat(filename);assert.ok(stat.isFile()&&!stat.isSymbolicLink()&&stat.size<16384);
 const values=parseConfiguration(await fs.readFile(filename,'utf8'));assert.equal(values.PACT_SOURCE_REVISION,revision);assert.equal(values.PACT_CONFIG_DIRECTORY,directory);
 if(!['status','stop','stop-ingress'].includes(action)){const kit=await createKit();assert.equal(kit.manifest.sourceRevision,revision);}
 const result=spawnSync('docker',['--host=unix:///var/run/docker.sock','compose','--env-file',filename,'--file',path.join(directory,'compose.json'),...operations[action]],{env:dockerEnvironment(values),stdio:'inherit'});
 process.exitCode=result.status??1;
}catch{console.error('Owner service command refused. Check Linux, exact source/configuration and the documented operation.');process.exitCode=1;}
