// caveman A/B on Claude models via the `claude` CLI (print mode, subscription auth).
// Different harness than opencode (Claude Code's own system prompt) — the A/B
// within each model is valid; cross-comparison to local runs is directional only.
// Chat family only (no tools, no GPU, no gates beyond fact checklists).
import { spawn } from 'node:child_process';
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { TASKS } from './tasks.js';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const CAVEMAN = readFileSync(`${ROOT}/prompts/caveman.md`, 'utf8');
const MODELS = ['claude-sonnet-4-6', 'claude-opus-4-8', 'claude-fable-5'];
const CHAT_TASKS = ['chat-tcp', 'chat-chmod', 'chat-acid'].map(t => TASKS[t]);
const ARMS = ['baseline', 'caveman'];
const N = Number(process.env.N || 3);
const RUNS = `${ROOT}/results/runs-caveman-claude-chat.jsonl`;

function claudeP({ model, prompt, arm }) {
  return new Promise((resolve) => {
    const args = ['-p', prompt, '--model', model, '--output-format', 'json'];
    if (arm === 'caveman') args.push('--append-system-prompt', CAVEMAN);
    const start = Date.now();
    // strip the credit-less ANTHROPIC_API_KEY so the CLI uses subscription auth
    const env = { ...process.env }; delete env.ANTHROPIC_API_KEY;
    const child = spawn('claude', args, { stdio: ['ignore', 'pipe', 'pipe'], env });
    let out = '', err = '';
    const timer = setTimeout(() => child.kill('SIGKILL'), 180000);
    child.stdout.on('data', d => (out += d));
    child.stderr.on('data', d => (err += d));
    child.on('close', (code) => {
      clearTimeout(timer);
      let j = {};
      try { j = JSON.parse(out); } catch {}
      resolve({
        text: j.result || '', exitCode: code, wallMs: Date.now() - start,
        tokensIn: j.usage?.input_tokens ?? null, tokensOut: j.usage?.output_tokens ?? null,
        cacheRead: j.usage?.cache_read_input_tokens ?? 0, costUsd: j.total_cost_usd ?? null,
        err: err.slice(0, 200),
      });
    });
  });
}

writeFileSync(RUNS, '');
let done = 0;
const total = MODELS.length * CHAT_TASKS.length * ARMS.length * N;
for (const model of MODELS) {
  for (const task of CHAT_TASKS) {
    for (const arm of ARMS) {
      for (let t = 1; t <= N; t++) {
        const r = await claudeP({ model, prompt: task.prompt, arm });
        const missing = task.checklist.filter(re => !re.test(r.text));
        const row = {
          ts: new Date().toISOString(), experiment: 'caveman-claude', task: task.name,
          model, arm, trial: t,
          success: r.text.length > 0 && missing.length === 0,
          gate: !r.text.length ? 'EMPTY' : (missing.length ? `MISSING_${missing.length}` : 'PASS'),
          exitCode: r.exitCode, toolCalls: 0, toolNames: [],
          tokensIn: r.tokensIn, tokensOut: r.tokensOut, tokensTotal: (r.tokensIn ?? 0) + (r.tokensOut ?? 0),
          wallMs: r.wallMs, outputChars: r.text.length, costUsd: r.costUsd,
          filesChanged: null, linesChanged: null, regressionOk: null, lintClean: null,
          errors: r.err && !r.text.length ? [r.err] : [],
        };
        appendFileSync(RUNS, JSON.stringify(row) + '\n');
        done++;
        console.error(`[${done}/${total}] ${model}/${task.name}/${arm} #${t} success=${row.success} tokOut=${row.tokensOut} ${row.wallMs}ms`);
      }
    }
  }
}
console.error(`[claude-chat] done -> ${RUNS}`);
