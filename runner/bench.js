import { execFileSync, execSync } from 'node:child_process';
import { appendFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { runOpencode, cleanupWorkdir } from './lib/run-opencode.js';
import { ARMS } from './arms.js';
import { TASKS } from './tasks.js';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const SWITCH = '/data/scripts/llm/switch.sh';

// --- run configuration (Serena deep-dive, ts-rename, tiered) ---
const MODELS = [
  { id: 'local-qwen/qwen3.6-35b', sw: 'qwen' },
  { id: 'local-sglang/Mistral-Small-4', sw: 'mistral' },
];
const ARM_NAMES = ['baseline', 'serena'];
const N = Number(process.env.N || 5);
const TASK = TASKS[process.env.TASK_NAME || 'ts-rename'];
if (!TASK) { console.error(`unknown TASK_NAME; have: ${Object.keys(TASKS)}`); process.exit(1); }

const RESULTS_DIR = `${ROOT}/results`;
const RUNS = `${RESULTS_DIR}/runs-${TASK.name}.jsonl`;
mkdirSync(RESULTS_DIR, { recursive: true });

function sh(script, wd) {
  try { return { code: 0, out: execFileSync('bash', [script, wd], { encoding: 'utf8' }).trim() }; }
  catch (e) { return { code: e.status ?? 1, out: (e.stdout || '').toString().trim() }; }
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function residentStatus() {
  try { return execSync(`${SWITCH} status`, { encoding: 'utf8' }); } catch { return ''; }
}
async function ensureModel(sw) {
  if (new RegExp(`${sw}\\s*:\\s*RUNNING`).test(residentStatus())) return true;
  console.error(`[gpu] switching to ${sw} ...`);
  try { execSync(`${SWITCH} ${sw}`, { stdio: 'ignore' }); } catch (e) { console.error(`[gpu] switch failed: ${e.message}`); }
  for (let i = 0; i < 60; i++) {            // poll up to ~5 min
    if (new RegExp(`${sw}\\s*:\\s*RUNNING`).test(residentStatus())) { console.error(`[gpu] ${sw} RUNNING`); return true; }
    await sleep(5000);
  }
  console.error(`[gpu] ${sw} did not come up`); return false;
}

async function oneRun(model, armName, trial) {
  const r = await runOpencode({ model: model.id, fixturePath: TASK.fixture, arm: ARMS[armName], prompt: TASK.prompt, timeoutMs: 360000 });
  const gate = sh(TASK.gate, r.workdir);
  const diff = sh(TASK.quality.diff, r.workdir);
  const reg = sh(TASK.quality.regression, r.workdir);
  const lint = sh(TASK.quality.lint, r.workdir);
  let d = {}; try { d = JSON.parse(diff.out || '{}'); } catch {}
  cleanupWorkdir(r.workdir);
  return {
    ts: new Date().toISOString(), experiment: 'serena', task: TASK.name,
    model: model.id, arm: armName, trial,
    success: gate.code === 0, gate: gate.out, exitCode: r.exitCode,
    toolCalls: r.parsed.toolCallCount, toolNames: r.parsed.toolNames,
    tokensIn: r.parsed.tokens.input, tokensOut: r.parsed.tokens.output, tokensTotal: r.parsed.tokens.total,
    wallMs: r.wallMs,
    filesChanged: d.filesChanged ?? null, linesChanged: d.linesChanged ?? null,
    regressionOk: reg.code === 0, lintClean: lint.code === 0,
    errors: r.parsed.errors,
  };
}

console.error(`[bench] serena/${TASK.name}  models=${MODELS.map(m=>m.sw)}  arms=${ARM_NAMES}  N=${N}  total=${MODELS.length*ARM_NAMES.length*N}`);
writeFileSync(RUNS, '');                    // fresh run log
let done = 0;
for (const model of MODELS) {               // group by model -> minimize GPU switches
  const up = await ensureModel(model.sw);
  if (!up) { console.error(`[bench] skipping ${model.id} (engine down)`); continue; }
  for (const armName of ARM_NAMES) {
    for (let t = 1; t <= N; t++) {
      const row = await oneRun(model, armName, t);
      appendFileSync(RUNS, JSON.stringify(row) + '\n');
      done++;
      console.error(`[${done}] ${model.sw}/${armName} #${t}  success=${row.success} tools=${row.toolCalls} tokIn=${row.tokensIn} diff=${row.filesChanged}f/${row.linesChanged}l ${row.wallMs}ms`);
    }
  }
}
// restore prod model (qwen) so the GPU is left as we found it
console.error('[bench] restoring prod model qwen ...');
await ensureModel('qwen');
console.error(`[bench] done: ${done} runs -> ${RUNS}`);
