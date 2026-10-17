// Read-only registry audit. Never runs npm audit fix or changes a dependency.
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { npmCli } from './common.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const projects = { sdk: 'packages/pact-sdk', web: 'web', platform: 'examples/pact-platform-app', prism: 'examples/pact-demo-app' };
const parse = text => JSON.parse(text.replace(/^\uFEFF/, ''));

/** Every direct advisory and inherited path must resolve to a reviewed exact version. */
export async function assessAudit(report, { project, directory, policy, now = new Date() }) {
  if (report?.auditReportVersion !== 2 || !report.vulnerabilities || report.error) throw Error('Unavailable or unsupported npm audit result');
  if (!Number.isFinite(now.getTime()) || policy?.schemaVersion !== 1 || !Array.isArray(policy.exceptions)) throw Error('Invalid audit policy or clock');
  const failures = [], accepted = [], table = report.vulnerabilities;
  const lock = parse(await readFile(path.join(directory, 'package-lock.json'), 'utf8'));
  const graphHash = createHash('sha256').update(JSON.stringify(lock)).digest('hex');
  if (policy.graphs?.[project] !== graphHash) failures.push(`${project}: dependency graph changed; repeat reachability review before renewing exceptions`);
  for (const [name, value] of Object.entries(table)) {
    for (const node of value.nodes ?? []) {
      try {
        if (typeof node !== 'string' || !path.resolve(directory, node).startsWith(path.resolve(directory) + path.sep)) throw Error();
        const installed = parse(await readFile(path.join(directory, node, 'package.json'), 'utf8'));
        if (installed.name !== name || installed.version !== lock.packages?.[node]?.version) throw Error();
      } catch { failures.push(`${name}: affected installed dependency does not match the reviewed lock`); }
    }
    const walk = async (entryName, trail = []) => {
      if (trail.includes(entryName)) return false; // A cycle alone is not evidence of a reviewed advisory.
      const entry = table[entryName];
      if (!entry || !Array.isArray(entry.via) || !entry.via.length) { failures.push(`${name}: unresolved advisory path ${entryName}`); return false; }
      if (!['info', 'low', 'moderate', 'high', 'critical'].includes(entry.severity)) { failures.push(`${entryName}: unknown severity`); return false; }
      let resolved = false;
      for (const via of entry.via) {
        if (typeof via === 'string') { const found = await walk(via, [...trail, entryName]); resolved ||= found; continue; }
        const advisory = /^https:\/\/github\.com\/advisories\/(GHSA-[a-z0-9-]+)$/.exec(via?.url ?? '')?.[1];
        if (!advisory || via.name !== entryName || via.dependency !== entryName || !['info', 'low', 'moderate', 'high', 'critical'].includes(via.severity)) { failures.push(`${entryName}: malformed advisory`); continue; }
        resolved = true;
        if (['info', 'low'].includes(via.severity)) continue;
        const exception = policy.exceptions.find(x => x.package === entryName && x.advisory === advisory && x.severity === via.severity && x.projects?.includes(project));
        const expiry = Date.parse(exception?.expires + 'T00:00:00Z');
        if (!exception || !exception.owner || !exception.reason || !/^\d{4}-\d{2}-\d{2}$/.test(exception.expires) || !Number.isFinite(expiry) || new Date(expiry).toISOString().slice(0, 10) !== exception.expires || now.getTime() >= expiry || via.severity === 'critical') { failures.push(`${entryName} ${advisory}: unapproved, expired or critical finding`); continue; }
        if (!Array.isArray(entry.nodes) || !entry.nodes.length) { failures.push(`${entryName}: missing installed nodes`); continue; }
        for (const node of entry.nodes) {
          if (typeof node !== 'string') { failures.push(`${entryName}: invalid package path`); continue; }
          const target = path.resolve(directory, node);
          if (!target.startsWith(path.resolve(directory) + path.sep)) { failures.push(`${entryName}: invalid package path`); continue; }
          try {
            const installed = parse(await readFile(path.join(target, 'package.json'), 'utf8'));
            if (installed.name !== entryName || !exception.versions?.includes(installed.version)) throw Error('Unreviewed version');
            accepted.push({ package: entryName, version: installed.version, advisory, severity: via.severity, expires: exception.expires });
          } catch { failures.push(`${entryName} ${advisory}: installed version was not reviewed`); }
        }
      }
      return resolved;
    };
    if (!await walk(name)) failures.push(`${name}: no resolvable advisory`);
    if (value.severity === 'critical') failures.push(`${name}: critical inherited finding`);
  }
  return { project, accepted: [...new Map(accepted.map(x => [`${x.package}:${x.version}:${x.advisory}`, x])).values()], failures: [...new Set(failures)], counts: report.metadata?.vulnerabilities };
}

async function audit(directory) {
  const cli = npmCli();
  const child = spawn(process.execPath, [cli, 'audit', '--json', '--ignore-scripts'], { cwd: directory, env: { ...process.env, NODE_PATH: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '';
  child.stdout.on('data', x => { stdout += x; }); child.stderr.resume();
  const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', resolve); });
  if (![0, 1].includes(code)) throw Error(`npm audit failed (${code}); registry/network availability is required`);
  let report;
  try { report = parse(stdout); } catch { throw Error('npm audit did not return JSON'); }
  return report;
}

async function main() {
  const policy = parse(await readFile(new URL('./dependency-exceptions.json', import.meta.url), 'utf8'));
  const output = path.join(root, 'web/test-results/validation/dependencies');
  await mkdir(output, { recursive: true });
  let failed = false;
  for (const [project, relative] of Object.entries(projects)) {
    const directory = path.join(root, relative), report = await audit(directory);
    await writeFile(path.join(output, `${project}.json`), JSON.stringify(report, null, 2) + '\n');
    const result = await assessAudit(report, { project, directory, policy });
    await writeFile(path.join(output, `${project}-assessment.json`), JSON.stringify(result, null, 2) + '\n');
    console.log(JSON.stringify(result));
    failed ||= result.failures.length > 0;
  }
  if (failed) process.exitCode = 1;
}
if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) await main();
