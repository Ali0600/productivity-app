#!/usr/bin/env node
// Mutation check: proves each guarded rule has a test that fails without it.
//
// For every entry in the list (default scripts/pet-mutations.json) it replaces
// one exact snippet in one source file, runs that file's Jest suite, records
// which tests went red, and restores the original bytes. A mutation that no
// test catches ("SURVIVED") is a rule nothing protects.
//
//   node scripts/mutation-check.js [mutations.json]     (npm run test:mutations)
//
// Safety: it edits real source files, so it refuses to start unless every
// target file is committed and unchanged (`git checkout -- <file>` is then a
// complete undo), restores from an in-memory byte copy after each run (also on
// Ctrl-C), and verifies the restored file's hash.
const { execFileSync, spawnSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

// The script's own folder, from argv (the lint config has no Node globals).
const scriptsDir = path.dirname(path.resolve(process.argv[1]));
const root = path.resolve(scriptsDir, '..');
const listPath = path.resolve(process.argv[2] || path.join(scriptsDir, 'pet-mutations.json'));
const mutations = JSON.parse(fs.readFileSync(listPath, 'utf8'));
const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const jsonOut = path.join(os.tmpdir(), `mutation-check-${process.pid}.json`);

const files = [...new Set(mutations.map((m) => m.file))];
for (const file of files) {
  try {
    execFileSync('git', ['diff', '--quiet', 'HEAD', '--', file], { cwd: root });
    execFileSync('git', ['ls-files', '--error-unmatch', file], { cwd: root, stdio: 'ignore' });
  } catch {
    console.error(`refusing: ${file} has uncommitted changes or is untracked. Commit first.`);
    process.exit(2);
  }
}

let restoring = null; // { target, original } while a mutation is applied
const restore = () => {
  if (!restoring) return;
  fs.writeFileSync(restoring.target, restoring.original);
  restoring = null;
};
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    restore();
    process.exit(130);
  });
}

const runJest = (testFile) => {
  fs.rmSync(jsonOut, { force: true });
  spawnSync('npx', ['jest', testFile, '--ci', '--json', `--outputFile=${jsonOut}`], {
    cwd: root,
    encoding: 'utf8',
    timeout: 300000,
  });
  if (!fs.existsSync(jsonOut)) return { error: 'no Jest JSON output' };
  const report = JSON.parse(fs.readFileSync(jsonOut, 'utf8'));
  const failed = [];
  let ran = 0;
  for (const suite of report.testResults) {
    if (suite.status === 'failed' && suite.assertionResults.length === 0) {
      failed.push(`suite failed to run: ${(suite.message || '').split('\n')[0]}`);
    }
    for (const a of suite.assertionResults) {
      ran += 1;
      if (a.status === 'failed') failed.push(a.title);
    }
  }
  return { ran, failed };
};

// Baseline: every suite involved must be green, and its test count is the
// denominator each mutated run is checked against.
const baseline = {};
for (const test of new Set(mutations.map((m) => m.test))) {
  const r = runJest(test);
  if (r.error || r.failed.length > 0) {
    console.error(`baseline not green for ${test}:`, r.error || r.failed);
    process.exit(2);
  }
  baseline[test] = r.ran;
}

const rows = [];
for (const m of mutations) {
  const target = path.join(root, m.file);
  const original = fs.readFileSync(target);
  const text = original.toString('utf8');
  const occurrences = text.split(m.find).length - 1;
  if (occurrences !== 1) {
    rows.push({ name: m.name, verdict: 'NOT APPLIED', detail: `snippet found ${occurrences}x` });
    continue;
  }
  restoring = { target, original };
  fs.writeFileSync(target, text.split(m.find).join(m.replace));
  let result;
  try {
    result = runJest(m.test);
  } finally {
    restore();
  }
  if (sha(fs.readFileSync(target)) !== sha(original)) {
    console.error(`RESTORE FAILED for ${m.file}; run: git checkout -- ${m.file}`);
    process.exit(3);
  }
  const caughtBy = result.failed || [];
  const missing = (m.expectCaughtBy || []).filter((t) => !caughtBy.some((c) => c.includes(t)));
  let verdict = caughtBy.length > 0 ? 'CAUGHT' : 'SURVIVED';
  if (result.error) verdict = `ERROR: ${result.error}`;
  else if (result.ran !== baseline[m.test])
    verdict = `ERROR: ran ${result.ran} of ${baseline[m.test]}`;
  rows.push({
    name: m.name,
    verdict,
    detail: missing.length ? `expected red: ${missing.join(' | ')}` : '',
  });
}
fs.rmSync(jsonOut, { force: true });

for (const r of rows)
  console.log(`${r.verdict.padEnd(12)} ${r.name}${r.detail ? `  (${r.detail})` : ''}`);
const caught = rows.filter((r) => r.verdict === 'CAUGHT' && !r.detail).length;
console.log(`\n${caught} of ${rows.length} mutations caught by the expected test.`);
process.exit(caught === rows.length ? 0 : 1);
