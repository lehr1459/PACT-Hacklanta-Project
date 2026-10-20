import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,mkdir,writeFile,rm,rename,symlink,unlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {artifactSourceAllowed,artifactSources,artifactDatabaseUrl,dockerContextText,NODE_IMAGE,stop,waitReady} from './artifact.mjs';

test('production source allowlist excludes active environments, worktrees, tests, dependencies and unrelated repositories',async()=>{
  for(const value of['.env','web/.env.local','services/pact-api/.env','services/pact-api/src/.env','services/pact-api/src/private.env',
    'services/pact-api/src/.env.mjs','packages/pact-sdk/src/.env.ts','services/pact-api/../.env','services\\pact-api\\package.json',
    'services/pact-api/tests/fixtures.mjs','services/pact-api/node_modules/pg/index.js','packages/pact-sdk/dist/server.js',
    'SaturdayLights/package.json','.git/config','AGENTS.md','web/app/page.tsx'])assert.equal(artifactSourceAllowed(value),false,value);
  const files=await artifactSources();assert.ok(files.length>30);assert.equal(new Set(files).size,files.length);
  for(const value of files)assert.equal(artifactSourceAllowed(value),true,value);
  assert.ok(files.includes('services/pact-api/src/clock.mjs'));assert.ok(files.includes('services/pact-api/migrations/006_clock_authority.sql'));
});

test('source collection visits only approved subtrees and omits unexpected files rather than copying directories wholesale',async t=>{
  const base=await mkdtemp(path.join(tmpdir(),'pact-artifact-policy-'));
  t.after(async()=>{assert.ok(base.startsWith(path.join(tmpdir(),'pact-artifact-policy-')));await rm(base,{recursive:true,force:true});});
  for(const dir of['packages/pact-sdk/src/internal','services/pact-api/src','services/pact-api/migrations','services/pact-api/operations','web'])await mkdir(path.join(base,dir),{recursive:true});
  for(const file of['packages/pact-sdk/package.json','packages/pact-sdk/package-lock.json','packages/pact-sdk/build.mjs','packages/pact-sdk/tsconfig.json',
    'services/pact-api/package.json','services/pact-api/package-lock.json','packages/pact-sdk/src/internal/reader.ts','services/pact-api/src/service.mjs',
    'services/pact-api/migrations/001_platform.sql','services/pact-api/operations/restore-quarantine.sql','services/pact-api/src/private.env','web/.env.local'])
    await writeFile(path.join(base,file),'synthetic fixture only');
  const files=await artifactSources(base);assert.equal(files.length,10);assert.ok(!files.some(file=>file.includes('.env')));
  assert.ok(base.startsWith(path.join(tmpdir(),'pact-artifact-policy-')));
  await rename(path.join(base,'packages'),path.join(base,'held-packages'));
  await symlink(path.join(base,'held-packages'),path.join(base,'packages'),process.platform==='win32'?'junction':'dir');
  try{await assert.rejects(()=>artifactSources(base),/ancestor must not be linked/);}
  finally{await unlink(path.join(base,'packages'));await rename(path.join(base,'held-packages'),path.join(base,'packages'));}
});

test('Docker context remains default-deny with narrow source exceptions and immutable nonroot base',async()=>{
  const ignore=(await readFile(new URL('../../services/pact-api/Dockerfile.dockerignore',import.meta.url),'utf8')).trim().split(/\r?\n/).filter(line=>line&&!line.startsWith('#'));
  assert.equal(ignore.shift(),'**');
  assert.ok(ignore.every(line=>line.startsWith('!')&&!/[*?\[\]]/.test(line)),'only exact approved files and their ancestor directories may be included');
  assert.equal((await readFile(new URL('../../services/pact-api/Dockerfile.dockerignore',import.meta.url),'utf8')),dockerContextText(await artifactSources()));
  const docker=await readFile(new URL('../../services/pact-api/Dockerfile',import.meta.url),'utf8');
  assert.deepEqual([...docker.matchAll(/^FROM (\S+)/gm)].map(match=>match[1]),[NODE_IMAGE,NODE_IMAGE]);
  assert.match(docker,/^USER node$/m);assert.match(docker,/npm ci --omit=dev --ignore-scripts/);assert.match(docker,/PACT_HOSTED_HOST=127\.0\.0\.1/);
  assert.match(docker,/execFileSync\('npm',\['--version'\]/);assert.match(docker,/11\.19\.1/);
  assert.doesNotMatch(docker,/^ADD\s|^COPY\s+\.\s|^(?:ARG|ENV)\s+[^\n]*(?:PEPPER|PRIVATE_KEY|DATABASE_URL)=\S+/m);
});

test('artifact database lifecycle accepts only its exact loopback QA parent',()=>{
  assert.equal(artifactDatabaseUrl('postgresql://fixture:fake@127.0.0.1:55439/pact_hosted_qa').pathname,'/pact_hosted_qa');
  for(const value of['postgresql://fixture:fake@localhost:55439/pact_hosted_qa','postgresql://fixture:fake@127.0.0.1:55439/postgres',
    'postgresql://fixture:fake@db.example.invalid/pact_hosted_qa','postgresql://fixture:fake@127.0.0.1:55439/pact_hosted_qa?options=x'])
    assert.throws(()=>artifactDatabaseUrl(value));
});

test('already signal-terminated owned children fail readiness and cleanup immediately',async()=>{
 const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore',windowsHide:true});await once(child,'spawn');
 const exited=once(child,'exit');child.kill('SIGTERM');await exited;
 assert.ok(child.exitCode!==null||child.signalCode!==null);
 const started=performance.now();await stop(child);await assert.rejects(waitReady('http://127.0.0.1:1',child),/exited before readiness/);
 assert.ok(performance.now()-started<1000,'an already exited child must not wait for another exit event');
});
