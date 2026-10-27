import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {projects,validatePolicy,assessHostedProject,assessReachability,sourceDigest} from './dependencies.mjs';

const parse=text=>JSON.parse(text.replace(/^\uFEFF/,''));
const actual=parse(await readFile(new URL('./dependency-policy.json',import.meta.url),'utf8'));
const clean={auditReportVersion:2,vulnerabilities:{},metadata:{vulnerabilities:{info:0,low:0,moderate:0,high:0,critical:0,total:0}}};
const clone=value=>structuredClone(value);
async function fixture(t){
 const directory=await mkdtemp(path.join(tmpdir(),'pact-hosted-audit-'));
 t.after(async()=>{assert.ok(directory.startsWith(path.join(tmpdir(),'pact-hosted-audit-')));await rm(directory,{recursive:true,force:true});});
 await mkdir(path.join(directory,'node_modules/uuid'),{recursive:true});
 await writeFile(path.join(directory,'node_modules/uuid/package.json'),JSON.stringify({name:'uuid',version:'8.3.2'}));
 const lock={packages:{'node_modules/uuid':{version:'8.3.2'}}};await writeFile(path.join(directory,'package-lock.json'),JSON.stringify(lock));
 const policy=clone(actual),hash=createHash('sha256').update(JSON.stringify(lock)).digest('hex');
 for(const name of Object.keys(projects))policy.graphs[name]=hash;
 const via={url:'https://github.com/advisories/GHSA-w5hq-g745-h8pq',name:'uuid',dependency:'uuid',severity:'moderate'};
 const report={auditReportVersion:2,vulnerabilities:{uuid:{severity:'moderate',via:[via],nodes:['node_modules/uuid']}},metadata:{vulnerabilities:{info:0,low:0,moderate:1,high:0,critical:0,total:1}}};
 const check=(value=report,extra={})=>assessHostedProject(value,{project:'sdk',directory,policy,now:new Date('2026-10-19T12:00:00Z'),...extra});
 return{directory,policy,report,via,check};
}

test('hosted policy requires service AND linked SDK and every new exact graph',()=>{
 assert.deepEqual(Object.keys(projects).sort(),['client','common','express','next','rest','sdk','service']);
 for(const project of Object.keys(projects)){const policy=clone(actual);delete policy.graphs[project];assert.throws(()=>validatePolicy(policy));}
 const extra=clone(actual);extra.graphs.unreviewed='a'.repeat(64);assert.throws(()=>validatePolicy(extra));
});
test('reviewed source digest is stable across Git LF/CRLF checkouts and rejects code changes',()=>{
 assert.equal(sourceDigest('const value=1;\n'),sourceDigest('const value=1;\r\n'));
 assert.notEqual(sourceDigest('const value=1;\n'),sourceDigest('const value=2;\n'));
});

test('only exact SDK versions/advisories qualify; scope and deadline cannot be widened',async t=>{
 const f=await fixture(t);assert.deepEqual((await f.check()).failures,[]);
 assert.equal((await f.check()).accepted.length,1);
 assert.ok((await f.check(f.report,{project:'service'})).failures.length);
 for(const change of [item=>item.projects.push('service'),item=>item.versions.push('9.0.1'),item=>item.expires='2026-11-16',item=>item.severity='critical']){
  const policy=clone(f.policy);change(policy.exceptions[0]);assert.throws(()=>validatePolicy(policy));
 }
 assert.ok((await f.check(f.report,{now:new Date('2026-11-15T00:00:00Z')})).failures.length);
});

test('new low/moderate/critical advisories and unresolved inherited paths fail closed',async t=>{
 const f=await fixture(t);
 for(const severity of ['low','moderate','critical']){
  const report=clone(f.report);report.vulnerabilities.uuid.severity=severity;report.vulnerabilities.uuid.via[0]={...f.via,severity,url:'https://github.com/advisories/GHSA-abcd-abcd-abcd'};
  assert.ok((await f.check(report)).failures.length);
 }
 assert.ok((await f.check({...f.report,vulnerabilities:{parent:{severity:'moderate',via:['missing'],nodes:[]}}})).failures.length);
 await assert.rejects(f.check({auditReportVersion:2,error:{code:'ENETWORK'}}));
 await assert.rejects(f.check({auditReportVersion:2,vulnerabilities:{}}));
 assert.ok((await f.check({...clean,metadata:f.report.metadata})).failures.length);
});

test('even clean new graphs reject lock drift; affected installed version drift also denies',async t=>{
 const f=await fixture(t);assert.deepEqual((await f.check(clean,{project:'client'})).failures,[]);
 const policy=clone(f.policy);policy.graphs.client='0'.repeat(64);assert.ok((await f.check(clean,{project:'client',policy})).failures.length);
 await writeFile(path.join(f.directory,'node_modules/uuid/package.json'),JSON.stringify({name:'uuid',version:'8.3.3'}));
 assert.ok((await f.check()).failures.length);
});

test('reachability rejects changed reviewed callpaths or newly loaded affected transports',()=>{
 const snapshot={cachePaths:['/sdk/node_modules/jayson/lib/client/browser/index.js','/sdk/node_modules/uuid/dist/v3.js'],sourceHashes:{...actual.reachability.sources}};
 assert.deepEqual(assessReachability(snapshot,actual).failures,[]);
 for(const module of ['/sdk/node_modules/stream-json/index.js','/sdk/node_modules/jayson/lib/utils.js','/sdk/node_modules/jayson/lib/client/tcp.js']){
  assert.ok(assessReachability({...snapshot,cachePaths:[...snapshot.cachePaths,module]},actual).failures.length);
 }
 const sourceHashes={...snapshot.sourceHashes,[Object.keys(snapshot.sourceHashes)[0]]:'0'.repeat(64)};
 assert.ok(assessReachability({...snapshot,sourceHashes},actual).failures.length);
 assert.ok(assessReachability({...snapshot,cachePaths:[]},actual).failures.length);
});
