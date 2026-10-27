import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { assessAudit } from './dependencies.mjs';

test('audit rejects new, expired, critical, drifted and unresolved findings', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'pact-audit-'));
  try {
    await mkdir(path.join(directory, 'node_modules/example'), { recursive: true });
    await writeFile(path.join(directory, 'node_modules/example/package.json'), JSON.stringify({ name: 'example', version: '1.0.0' }));
    const lock = { packages: { 'node_modules/example': { version: '1.0.0' } } };
    await writeFile(path.join(directory, 'package-lock.json'), JSON.stringify(lock));
    const graphs = { test: createHash('sha256').update(JSON.stringify(lock)).digest('hex') };
    const policy = { schemaVersion: 1, graphs, exceptions: [{ package: 'example', advisory: 'GHSA-abcd-abcd-abcd', severity: 'high', versions: ['1.0.0'], projects: ['test'], expires: '2026-11-15', owner: 'Security', reason: 'Reviewed fixture' }] };
    const via = { url: 'https://github.com/advisories/GHSA-abcd-abcd-abcd', name: 'example', dependency: 'example', severity: 'high' };
    const report = { auditReportVersion: 2, vulnerabilities: { example: { via: [via], severity: 'high', nodes: ['node_modules/example'] }, parent: { via: ['example'], severity: 'high', nodes: [] } } };
    const check = (r = report, p = policy, now = new Date('2026-10-16')) => assessAudit(r, { project: 'test', directory, policy: p, now });
    assert.deepEqual((await check()).failures, []);
    assert.equal((await check()).accepted.length, 1);
    assert.ok((await check(report, { ...policy, graphs: {} })).failures.length);
    assert.ok((await check(report, { ...policy, exceptions: [{ ...policy.exceptions[0], expires: '2026-99-99' }] })).failures.length);
    assert.ok((await check(report, { ...policy, exceptions: [{ ...policy.exceptions[0], expires: '2026-02-31' }] })).failures.length);
    assert.ok((await check(report, policy, new Date('2026-11-15'))).failures.length);
    assert.ok((await check(report, { schemaVersion: 1, exceptions: [] })).failures.length);
    assert.ok((await check({ ...report, vulnerabilities: { parent: { via: ['missing'], severity: 'high' } } })).failures.length);
    assert.ok((await check({ ...report, vulnerabilities: { a: { via: ['b'], severity: 'high' }, b: { via: ['a'], severity: 'high' } } })).failures.length);
    assert.ok((await check({ ...report, vulnerabilities: { example: { ...report.vulnerabilities.example, via: [{ ...via, severity: 'critical' }], severity: 'critical' } } })).failures.length);
    assert.ok((await check({ ...report, vulnerabilities: { example: { ...report.vulnerabilities.example, nodes: [42] } } })).failures.length);
    await writeFile(path.join(directory, 'node_modules/example/package.json'), JSON.stringify({ name: 'example', version: '1.0.1' }));
    assert.ok((await check()).failures.length);
    await assert.rejects(check({ auditReportVersion: 2, error: { code: 'ENETWORK' } }));
  } finally {
    // mkdtemp returns a fixed child of the OS temporary directory; verify before removal.
    assert.ok(directory.startsWith(path.join(os.tmpdir(), 'pact-audit-')));
    await rm(directory, { recursive: true, force: true });
  }
});
