import { execFileSync } from 'node:child_process';
import { runOpencode, cleanupWorkdir } from './lib/run-opencode.js';
import { ARMS } from './arms.js';
import { TASKS } from './tasks.js';

const armName = process.argv[2] || 'baseline';
const model = process.argv[3] || 'local-qwen/qwen3.6-35b';
const TASK = TASKS[process.argv[4] || 'ts-rename'];

function sh(script, wd) {
  try { return { code: 0, out: execFileSync('bash', [script, wd], { encoding: 'utf8' }).trim() }; }
  catch (e) { return { code: e.status ?? 1, out: (e.stdout || '').toString().trim() }; }
}

const r = await runOpencode({ model, fixturePath: TASK.fixture, arm: ARMS[armName], prompt: TASK.prompt, timeoutMs: 360000 });
const gate = sh(TASK.gate, r.workdir);
const diff = sh(TASK.quality.diff, r.workdir);
console.log(JSON.stringify({
  task: TASK.name, arm: armName, model,
  exitCode: r.exitCode, wallMs: r.wallMs, success: gate.code === 0, gate: gate.out,
  toolCalls: r.parsed.toolCallCount, tokensIn: r.parsed.tokens.input,
  diff: JSON.parse(diff.out || '{}'), errors: r.parsed.errors,
}, null, 2));
cleanupWorkdir(r.workdir);
