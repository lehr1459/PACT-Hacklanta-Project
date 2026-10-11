// Compare isolated lint diagnostics without changing application tooling.
import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '../..');
const dir = path.join(root, '.deployment-candidates/ui-redesign');
const read = name => JSON.parse(fs.readFileSync(path.join(dir, `lint-${name}.json`), 'utf8'));
const baseline = read('baseline'), final = read('final');
function normalize(results) {
  return results.flatMap(file => file.messages.map(message => ({
    file: file.filePath.replaceAll('\\', '/').split('/web/').at(-1),
    rule: message.ruleId, severity: message.severity,
    message: message.message.replaceAll(path.join(dir, 'baseline', 'web'), '<web>').replaceAll(path.join(root, 'web'), '<web>'),
    line: message.line, column: message.column, nodeType: message.nodeType,
  }))).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
}
const counts = results => ({errors: results.reduce((n, r) => n + r.errorCount, 0), warnings: results.reduce((n, r) => n + r.warningCount, 0)});
const report = {baseline: counts(baseline), final: counts(final), unchanged: JSON.stringify(normalize(baseline)) === JSON.stringify(normalize(final)),
  note: 'Existing diagnostics are retained. Absolute source-copy paths alone are normalized.'};
fs.writeFileSync(path.join(dir, 'lint-comparison.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (!report.unchanged) process.exitCode = 1;
