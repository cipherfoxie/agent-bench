import { execFileSync } from 'node:child_process';
import { runOpencode, cleanupWorkdir } from './lib/run-opencode.js';
import { ARMS } from './arms.js';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const PROMPT = 'Rename the function addNumbers to sum everywhere in this TypeScript project. The project must still type-check.';

const armName = process.argv[2] || 'baseline';
const model = process.argv[3] || 'local-qwen/qwen3.6-35b';

function sh(script, wd) {
  try { return { code: 0, out: execFileSync('bash', [script, wd], { encoding: 'utf8' }).trim() }; }
  catch (e) { return { code: e.status ?? 1, out: (e.stdout || '').toString().trim() }; }
}

const r = await runOpencode({
  model,
  fixturePath: `${ROOT}/fixture/ts-rename`,
  arm: ARMS[armName],
  prompt: PROMPT,
  timeoutMs: 360000,
});

const gate = sh(`${ROOT}/tasks/ts-rename/gate.sh`, r.workdir);
const diff = sh(`${ROOT}/scripts/quality/diff-stat.sh`, r.workdir);
const reg = sh(`${ROOT}/scripts/quality/regression.sh`, r.workdir);
const lint = sh(`${ROOT}/scripts/quality/lint-clean.sh`, r.workdir);

console.log(JSON.stringify({
  arm: armName, model,
  exitCode: r.exitCode, wallMs: r.wallMs,
  success: gate.code === 0, gate: gate.out,
  toolCalls: r.parsed.toolCallCount, toolNames: r.parsed.toolNames,
  tokens: r.parsed.tokens,
  diff: JSON.parse(diff.out || '{}'),
  regression_ok: reg.code === 0, lint_clean: lint.code === 0,
  errors: r.parsed.errors,
}, null, 2));

cleanupWorkdir(r.workdir);
