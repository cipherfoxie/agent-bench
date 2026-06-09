# agent-bench Harness Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A reusable promptfoo-based harness that runs an opencode agent through one coding task under a chosen arm (MCP / prompt / model toggle) and reports success + efficiency + objective quality KPIs, proven green end-to-end on a single TypeScript task.

**Architecture:** promptfoo orchestrates the matrix. A custom JS provider runs `opencode run --format json` inside an isolated copy of the fixture, parses the JSONL stream for tokens / tool-calls / latency, and exposes the working-dir path. Build gates and the three objective quality KPIs run as promptfoo exec asserts against that working dir.

**Tech Stack:** Node.js + promptfoo (JS custom provider), bash gate/KPI scripts, git, TypeScript (smoke-slice fixture language). Local model: `local-qwen/qwen3.6-35b` (resident @ :30001).

**Scope:** This plan delivers the harness proven on ONE TS task. The full 5-task multi-language suite, the runner/GPU-loop, charts, and the Serena/Caveman experiment configs are separate follow-on plans.

---

### Task 0: Scaffold project + promptfoo dependency

**Files:**
- Create: `/data/projects/agent-bench/package.json`
- Create: `/data/projects/agent-bench/config.example.yaml`

- [ ] **Step 1: Init node project**

Run: `cd /data/projects/agent-bench && npm init -y && npm pkg set name=agent-bench type=module`
Expected: `package.json` created.

- [ ] **Step 2: Install promptfoo locally**

Run: `cd /data/projects/agent-bench && npm install --save-dev promptfoo`
Expected: `node_modules/` populated (gitignored), `promptfoo` in devDependencies.

- [ ] **Step 3: Add host config example**

Create `config.example.yaml`:

```yaml
# Copy to config.local.yaml (gitignored) and edit for your host.
opencode:
  models:
    strong: local-qwen/qwen3.6-35b      # opencode provider/model id
    weak:   local-sglang/Mistral-Small-4
    reference: anthropic/claude-opus-4-8 # needs a funded Anthropic key
  gpu_switch: /data/scripts/llm/switch.sh   # switch.sh qwen|mistral|none|status
fixture_root: ./fixture
```

- [ ] **Step 4: Commit**

```bash
cd /data/projects/agent-bench
git add package.json package-lock.json config.example.yaml
git commit -m "chore: scaffold node project with promptfoo dependency"
```

---

### Task 1: JSONL run parser (TDD core)

Pure function over the captured opencode `--format json` output. Test fixture already saved at `provider/tests/fixtures/opencode-run-sample.jsonl` (the green spike: read+edit, 2 tool calls, last token snapshot total=12639/input/output, wallclock 3088ms).

**Files:**
- Create: `provider/parse-run.js`
- Test: `provider/tests/parse-run.test.js`
- Fixture: `provider/tests/fixtures/opencode-run-sample.jsonl` (exists)

- [ ] **Step 1: Write the failing test**

Create `provider/tests/parse-run.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseRun } from '../parse-run.js';

const sample = readFileSync(
  fileURLToPath(new URL('./fixtures/opencode-run-sample.jsonl', import.meta.url)),
  'utf8'
);

test('parseRun extracts tool calls', () => {
  const r = parseRun(sample);
  assert.deepEqual(r.toolNames, ['read', 'edit']);
  assert.equal(r.toolCallCount, 2);
});

test('parseRun sums tokens across step-finish events', () => {
  const r = parseRun(sample);
  // three step-finish snapshots: input 12456,12553,12639 ; output 32,65,15
  assert.equal(r.tokens.input, 12456 + 12553 + 12639);
  assert.equal(r.tokens.output, 32 + 65 + 15);
  assert.equal(r.tokens.total, r.tokens.input + r.tokens.output);
});

test('parseRun computes wallclock from outer timestamps', () => {
  const r = parseRun(sample);
  assert.equal(r.latencyMs, 3088);
});

test('parseRun returns final assistant text as output', () => {
  const r = parseRun(sample);
  assert.equal(typeof r.output, 'string');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /data/projects/agent-bench && node --test provider/tests/parse-run.test.js`
Expected: FAIL — `Cannot find module '../parse-run.js'`.

- [ ] **Step 3: Write minimal implementation**

Create `provider/parse-run.js`:

```js
// Parse opencode `run --format json` JSONL into benchmark metrics.
// Each line: { type, timestamp, sessionID, part }
// part.type in: step-start | step-finish | tool | text
export function parseRun(stdout) {
  const objs = [];
  for (const line of stdout.split('\n')) {
    const s = line.trim();
    if (!s) continue;
    try { objs.push(JSON.parse(s)); } catch { /* ignore non-json noise */ }
  }

  const parts = objs.map(o => o.part).filter(Boolean);

  const toolNames = parts.filter(p => p.type === 'tool' && p.tool).map(p => p.tool);

  const tokens = { input: 0, output: 0, total: 0 };
  for (const p of parts) {
    if (p.tokens) {
      tokens.input += p.tokens.input || 0;
      tokens.output += p.tokens.output || 0;
    }
  }
  tokens.total = tokens.input + tokens.output;

  const texts = parts.filter(p => p.type === 'text' && typeof p.text === 'string');
  const output = texts.length ? texts[texts.length - 1].text : '';

  const ts = objs.map(o => o.timestamp).filter(t => typeof t === 'number');
  const latencyMs = ts.length ? Math.max(...ts) - Math.min(...ts) : 0;

  return { output, toolNames, toolCallCount: toolNames.length, tokens, latencyMs };
}
```

Note on `output`: the spike sample's `text` part may carry the assistant message under `p.text`. If the test for `output` fails because text lives elsewhere (e.g. `p.text.text`), inspect one `text` part in the fixture and adjust the extractor — do not loosen the other assertions.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /data/projects/agent-bench && node --test provider/tests/parse-run.test.js`
Expected: PASS (4 tests). If the `output` test fails, fix the text extraction per the note, re-run.

- [ ] **Step 5: Commit**

```bash
cd /data/projects/agent-bench
git add provider/parse-run.js provider/tests/parse-run.test.js
git commit -m "feat(provider): JSONL run parser for opencode output (tokens/tools/latency)"
```

---

### Task 2: Isolated working-dir helper

Each run mutates files, so it must operate on a throwaway copy of the fixture at a clean git state.

**Files:**
- Create: `provider/workdir.js`
- Test: `provider/tests/workdir.test.js`

- [ ] **Step 1: Write the failing test**

Create `provider/tests/workdir.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, writeFileSync, readFileSync, mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { prepareWorkdir, cleanupWorkdir } from '../workdir.js';

function makeFixture() {
  const dir = mkdtempSync(join(tmpdir(), 'ab-fix-'));
  writeFileSync(join(dir, 'a.txt'), 'clean\n');
  execSync('git init -q && git add -A && git commit -q -m init', { cwd: dir });
  return dir;
}

test('prepareWorkdir yields an independent clean copy', () => {
  const fix = makeFixture();
  const wd = prepareWorkdir(fix);
  assert.ok(existsSync(join(wd, 'a.txt')));
  writeFileSync(join(wd, 'a.txt'), 'dirty\n');           // mutate copy
  assert.equal(readFileSync(join(fix, 'a.txt'), 'utf8'), 'clean\n'); // source untouched
  cleanupWorkdir(wd);
  assert.equal(existsSync(wd), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /data/projects/agent-bench && node --test provider/tests/workdir.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

Create `provider/workdir.js`:

```js
import { mkdtempSync, cpSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Copy the fixture (working tree only, no .git) into a temp dir for one run.
export function prepareWorkdir(fixturePath) {
  const wd = mkdtempSync(join(tmpdir(), 'ab-run-'));
  cpSync(fixturePath, wd, {
    recursive: true,
    filter: (src) => !src.split('/').includes('.git'),
  });
  return wd;
}

export function cleanupWorkdir(wd) {
  rmSync(wd, { recursive: true, force: true });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /data/projects/agent-bench && node --test provider/tests/workdir.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /data/projects/agent-bench
git add provider/workdir.js provider/tests/workdir.test.js
git commit -m "feat(provider): isolated working-dir copy helper"
```

---

### Task 3: Arm config writer + opencode pickup verification

Writes a per-run `opencode.json` into the working dir that encodes the arm: which MCP servers are enabled (`mcp`) and an optional system instruction (`instructions`). Then verifies opencode actually honors a project-level `opencode.json` from `--dir`.

**Files:**
- Create: `provider/write-arm-config.js`
- Test: `provider/tests/write-arm-config.test.js`

- [ ] **Step 1: Write the failing test (pure config shape)**

Create `provider/tests/write-arm-config.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeArmConfig } from '../write-arm-config.js';

test('baseline arm writes config with no mcp and no instructions', () => {
  const wd = mkdtempSync(join(tmpdir(), 'ab-arm-'));
  writeArmConfig(wd, { mcpServers: {}, systemInstruction: null });
  const cfg = JSON.parse(readFileSync(join(wd, 'opencode.json'), 'utf8'));
  assert.deepEqual(cfg.mcp ?? {}, {});
  assert.ok(!cfg.instructions || cfg.instructions.length === 0);
});

test('treatment arm writes mcp entry and instruction file', () => {
  const wd = mkdtempSync(join(tmpdir(), 'ab-arm-'));
  writeArmConfig(wd, {
    mcpServers: { serena: { type: 'local', command: ['echo', 'serena'] } },
    systemInstruction: 'Always begin replies with ZZZ.',
  });
  const cfg = JSON.parse(readFileSync(join(wd, 'opencode.json'), 'utf8'));
  assert.ok(cfg.mcp.serena);
  assert.ok(existsSync(join(wd, '.agent-bench-instruction.md')));
  assert.ok(cfg.instructions.includes('.agent-bench-instruction.md'));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /data/projects/agent-bench && node --test provider/tests/write-arm-config.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

Create `provider/write-arm-config.js`:

```js
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

// arm = { mcpServers: {name: {...}}, systemInstruction: string|null, modelSettings?: {} }
export function writeArmConfig(workdir, arm) {
  const cfg = { $schema: 'https://opencode.ai/config.json', mcp: arm.mcpServers || {} };
  const instructionFiles = [];
  if (arm.systemInstruction) {
    const rel = '.agent-bench-instruction.md';
    writeFileSync(join(workdir, rel), arm.systemInstruction, 'utf8');
    instructionFiles.push(rel);
  }
  cfg.instructions = instructionFiles;
  writeFileSync(join(workdir, 'opencode.json'), JSON.stringify(cfg, null, 2), 'utf8');
  return cfg;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /data/projects/agent-bench && node --test provider/tests/write-arm-config.test.js`
Expected: PASS.

- [ ] **Step 5: Integration check — does opencode honor the project config?**

This proves the toggle mechanism before we depend on it. Run:

```bash
TMP=$(mktemp -d) && cd "$TMP" && git init -q && echo x > x.txt
node -e "import('/data/projects/agent-bench/provider/write-arm-config.js').then(m=>m.writeArmConfig('$TMP',{mcpServers:{},systemInstruction:'You must begin your reply with the literal token ZZZ.'}))"
opencode run --format json -m local-qwen/qwen3.6-35b --dir "$TMP" "Say hello." 2>/dev/null \
  | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const {parseRun}=require('/data/projects/agent-bench/provider/parse-run.js');})" 2>/dev/null; \
opencode run --format json -m local-qwen/qwen3.6-35b --dir "$TMP" "Say hello." 2>/dev/null | grep -o 'ZZZ' | head -1
```

Expected: output contains `ZZZ`, proving the project `opencode.json` `instructions` are injected. If absent, the instruction-injection mechanism is wrong — STOP and resolve (check whether opencode needs `instructions` as absolute paths, or an `OPENCODE_CONFIG` env var, before continuing). Note: ESM/CJS interop for the inline check is awkward; if it fights you, just eyeball the `grep -o ZZZ`. Clean up: `rm -rf "$TMP"`.

- [ ] **Step 6: Commit**

```bash
cd /data/projects/agent-bench
git add provider/write-arm-config.js provider/tests/write-arm-config.test.js
git commit -m "feat(provider): per-arm opencode.json writer (mcp + instruction toggle), verified pickup"
```

---

### Task 4: opencode invoker

Spawns opencode against a prepared working dir and returns raw stdout + exit code. Integration-level (calls the resident model), so no unit test; a manual smoke step instead.

**Files:**
- Create: `provider/run-opencode.js`

- [ ] **Step 1: Write the implementation**

Create `provider/run-opencode.js`:

```js
import { spawn } from 'node:child_process';

// opts = { model, workdir, prompt, timeoutMs }
export function runOpencode({ model, workdir, prompt, timeoutMs = 600000 }) {
  return new Promise((resolve) => {
    const child = spawn(
      'opencode',
      ['run', '--format', 'json', '-m', model, '--dir', workdir, prompt],
      { cwd: workdir }
    );
    let stdout = '', stderr = '';
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
    child.stdout.on('data', d => (stdout += d));
    child.stderr.on('data', d => (stderr += d));
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, exitCode: code });
    });
  });
}
```

- [ ] **Step 2: Manual smoke**

Run:

```bash
cd /data/projects/agent-bench && node -e "
import('./provider/run-opencode.js').then(async m=>{
  const {execSync}=await import('node:child_process');
  const {mkdtempSync,writeFileSync}=await import('node:fs');
  const {tmpdir}=await import('node:os');const {join}=await import('node:path');
  const wd=mkdtempSync(join(tmpdir(),'ab-smoke-'));
  writeFileSync(join(wd,'hello.txt'),'hello\nworld\n');
  const r=await m.runOpencode({model:'local-qwen/qwen3.6-35b',workdir:wd,prompt:'Append a line saying spike to hello.txt'});
  console.log('exit',r.exitCode,'bytes',r.stdout.length);
})"
```

Expected: `exit 0` and non-trivial byte count (> 1000).

- [ ] **Step 3: Commit**

```bash
cd /data/projects/agent-bench
git add provider/run-opencode.js
git commit -m "feat(provider): opencode invoker"
```

---

### Task 5: promptfoo custom provider

Ties the pieces together into a promptfoo provider. promptfoo calls `callApi(prompt, context)`; provider config (model, arm, fixturePath) comes from `providers[].config` in the promptfooconfig. Returns the assistant output, token usage, and metadata including the working-dir path (asserts read it for gates/KPIs) and tool/latency metrics.

**Files:**
- Create: `provider/opencode-provider.js`

- [ ] **Step 1: Write the implementation**

Create `provider/opencode-provider.js`:

```js
import { prepareWorkdir } from './workdir.js';
import { writeArmConfig } from './write-arm-config.js';
import { runOpencode } from './run-opencode.js';
import { parseRun } from './parse-run.js';

// promptfoo custom provider (ESM). Configured per-arm in promptfooconfig.yaml:
//   providers:
//     - id: file://provider/opencode-provider.js
//       label: qwen-baseline
//       config:
//         model: local-qwen/qwen3.6-35b
//         fixturePath: ./fixture/ts-rename
//         arm: { mcpServers: {}, systemInstruction: null }
export default class OpencodeProvider {
  constructor(options) {
    this.config = options.config || {};
    this.label = options.label || 'opencode';
  }
  id() { return `opencode:${this.label}`; }

  async callApi(prompt) {
    const { model, fixturePath, arm = {} } = this.config;
    const workdir = prepareWorkdir(fixturePath);
    writeArmConfig(workdir, arm);
    const run = await runOpencode({ model, workdir, prompt });
    const parsed = parseRun(run.stdout);
    return {
      output: parsed.output || `[exit ${run.exitCode}]`,
      tokenUsage: {
        total: parsed.tokens.total,
        prompt: parsed.tokens.input,
        completion: parsed.tokens.output,
      },
      cost: 0,
      metadata: {
        workdir,                       // asserts cd here to run gates/KPIs
        toolCallCount: parsed.toolCallCount,
        toolNames: parsed.toolNames,
        latencyMs: parsed.latencyMs,
        exitCode: run.exitCode,
      },
    };
  }
}
```

Note: the working dir is intentionally NOT cleaned up here — promptfoo exec asserts run after `callApi` and need the post-run filesystem. A cleanup assert (Task 6, last) removes it.

- [ ] **Step 2: Commit**

```bash
cd /data/projects/agent-bench
git add provider/opencode-provider.js
git commit -m "feat(provider): promptfoo custom provider tying parser/invoker/arm-config"
```

---

### Task 6: Minimal TS fixture + gate + quality KPI scripts (one task slice)

One coding task: rename a function used across two TS files. Provides the smoke task plus the four assert scripts (gate + 3 quality KPIs).

**Files:**
- Create: `fixture/ts-rename/` (`package.json`, `tsconfig.json`, `src/math.ts`, `src/index.ts`, `src/util.ts`, `.git` via init)
- Create: `tasks/ts-rename/gate.sh`, `tasks/ts-rename/reference.patch`
- Create: `scripts/quality/diff-stat.sh`, `scripts/quality/lint-clean.sh`, `scripts/quality/regression.sh`

- [ ] **Step 1: Create the TS fixture**

```bash
mkdir -p /data/projects/agent-bench/fixture/ts-rename/src
cd /data/projects/agent-bench/fixture/ts-rename
cat > package.json <<'EOF'
{ "name": "ts-rename-fixture", "private": true, "scripts": { "typecheck": "tsc --noEmit" }, "devDependencies": { "typescript": "^5.6.0" } }
EOF
cat > tsconfig.json <<'EOF'
{ "compilerOptions": { "strict": true, "module": "esnext", "target": "es2022", "moduleResolution": "bundler", "noEmit": true } }
EOF
cat > src/math.ts <<'EOF'
export function addNumbers(a: number, b: number): number { return a + b; }
EOF
cat > src/util.ts <<'EOF'
import { addNumbers } from './math.js';
export const double = (n: number) => addNumbers(n, n);
EOF
cat > src/index.ts <<'EOF'
import { addNumbers } from './math.js';
import { double } from './util.js';
console.log(addNumbers(1, 2), double(3));
EOF
npm install >/dev/null 2>&1
git init -q && git add -A && git commit -q -m "fixture: ts-rename baseline"
```

Expected: `npx tsc --noEmit` passes on the clean baseline (verify: `npx tsc --noEmit && echo CLEAN`).

- [ ] **Step 2: Define the task gate**

The task prompt (used later in the config): *"Rename the function `addNumbers` to `sum` everywhere in this TypeScript project. The project must still type-check."*

Create `tasks/ts-rename/gate.sh`:

```bash
#!/usr/bin/env bash
# Pass iff the rename happened AND the project type-checks. Arg: $1 = workdir
set -uo pipefail
wd="$1"
cd "$wd" || exit 2
grep -rq 'addNumbers' src/ && { echo "FAIL: old name addNumbers still present"; exit 1; }
grep -rq '\bsum\b' src/ || { echo "FAIL: new name sum not found"; exit 1; }
npx tsc --noEmit || { echo "FAIL: typecheck"; exit 1; }
echo "PASS"
```

Make executable: `chmod +x tasks/ts-rename/gate.sh`.

- [ ] **Step 3: Capture the minimal reference patch (for diff-minimality)**

```bash
cd /data/projects/agent-bench/fixture/ts-rename
git grep -l addNumbers src | xargs sed -i 's/addNumbers/sum/g'
git diff > ../../tasks/ts-rename/reference.patch
git checkout -- .
wc -l ../../tasks/ts-rename/reference.patch   # records the minimal changed-line count
```

- [ ] **Step 4: Write the quality KPI scripts**

`scripts/quality/diff-stat.sh` (lower is better; emits JSON):

```bash
#!/usr/bin/env bash
# Arg $1 = workdir. Emits {"filesChanged":N,"linesChanged":M}
set -uo pipefail
cd "$1" || exit 2
stat=$(git -C "$1" diff --stat 2>/dev/null | tail -1)
files=$(git -C "$1" diff --name-only 2>/dev/null | grep -c . || echo 0)
lines=$(git -C "$1" diff --numstat 2>/dev/null | awk '{a+=$1+$2} END{print a+0}')
echo "{\"filesChanged\":${files:-0},\"linesChanged\":${lines:-0}}"
```

`scripts/quality/lint-clean.sh` (TS: type-clean as the lint proxy for this slice):

```bash
#!/usr/bin/env bash
# Arg $1 = workdir. Exit 0 if no new violations.
set -uo pipefail
cd "$1" || exit 2
npx tsc --noEmit >/dev/null 2>&1 && echo "LINT_CLEAN" || { echo "LINT_DIRTY"; exit 1; }
```

`scripts/quality/regression.sh` (full check, here == typecheck of whole project; later slices add real test suites):

```bash
#!/usr/bin/env bash
# Arg $1 = workdir. Full project must still build/type-check.
set -uo pipefail
cd "$1" || exit 2
npx tsc --noEmit >/dev/null 2>&1 && echo "NO_REGRESSION" || { echo "REGRESSION"; exit 1; }
```

Make all executable: `chmod +x scripts/quality/*.sh tasks/ts-rename/gate.sh`.

- [ ] **Step 5: Commit**

```bash
cd /data/projects/agent-bench
git add fixture/ts-rename tasks/ts-rename scripts/quality
git commit -m "feat(fixture): ts-rename task with gate + objective quality KPI scripts"
```

---

### Task 7: Smoke promptfooconfig + green end-to-end run

One task, one model (resident qwen), one baseline arm. Asserts: gate (success), then the three quality KPIs, then cleanup. Proves the whole pipeline.

**Files:**
- Create: `experiments/_smoke/promptfooconfig.yaml`

- [ ] **Step 1: Write the smoke config**

Create `experiments/_smoke/promptfooconfig.yaml`:

```yaml
description: agent-bench harness smoke (ts-rename, qwen, baseline)

prompts:
  - "Rename the function addNumbers to sum everywhere in this TypeScript project. The project must still type-check."

providers:
  - id: file://../../provider/opencode-provider.js
    label: qwen-baseline
    config:
      model: local-qwen/qwen3.6-35b
      fixturePath: ../../fixture/ts-rename
      arm: { mcpServers: {}, systemInstruction: null }

defaultTest:
  assert:
    - type: javascript
      value: "output && context.vars ? true : true"   # placeholder presence check
    - type: python
      value: file://assert_gate.py

tests:
  - description: ts-rename succeeds + quality KPIs
```

Because asserts need the provider's `metadata.workdir`, use a script assert. Create `experiments/_smoke/assert_gate.py`:

```python
import json, subprocess, shutil, sys, os
# promptfoo passes the provider result as JSON on stdin to file:// python asserts.
def get_output(o): return o
def main():
    raw = sys.stdin.read()
    data = json.loads(raw)
    meta = (data.get('metadata') or {})
    wd = meta.get('workdir')
    root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
    if not wd or not os.path.isdir(wd):
        print(json.dumps({"pass": False, "score": 0, "reason": "no workdir"})); return
    gate = subprocess.run([f"{root}/tasks/ts-rename/gate.sh", wd], capture_output=True, text=True)
    passed = gate.returncode == 0
    diff = subprocess.run([f"{root}/scripts/quality/diff-stat.sh", wd], capture_output=True, text=True)
    reg = subprocess.run([f"{root}/scripts/quality/regression.sh", wd], capture_output=True, text=True)
    lint = subprocess.run([f"{root}/scripts/quality/lint-clean.sh", wd], capture_output=True, text=True)
    try: diffj = json.loads(diff.stdout.strip() or "{}")
    except Exception: diffj = {}
    reason = {
        "gate": gate.stdout.strip(),
        "diff": diffj,
        "regression_ok": reg.returncode == 0,
        "lint_clean": lint.returncode == 0,
        "toolCalls": meta.get("toolCallCount"),
        "latencyMs": meta.get("latencyMs"),
        "tokens": data.get("tokenUsage"),
    }
    shutil.rmtree(wd, ignore_errors=True)  # cleanup after reading state
    print(json.dumps({"pass": passed, "score": 1 if passed else 0, "reason": json.dumps(reason)}))
main()
```

Note: confirm promptfoo's python file-assert stdin contract for this promptfoo version (`npx promptfoo --version`); if it passes args instead of stdin, adapt `main()` accordingly. The placeholder `javascript` assert can be removed once the python assert runs.

- [ ] **Step 2: Ensure qwen is resident**

Run: `/data/scripts/llm/switch.sh status`
Expected: `qwen : RUNNING`. If not: `/data/scripts/llm/switch.sh qwen` and wait until status shows RUNNING.

- [ ] **Step 3: Run the smoke eval**

Run: `cd /data/projects/agent-bench/experiments/_smoke && npx promptfoo eval -c promptfooconfig.yaml --no-cache`
Expected: 1 test, PASS. The assert `reason` JSON shows `gate: PASS`, a small `diff` (≈ the reference patch line count), `regression_ok: true`, `lint_clean: true`, plus tool/latency/token numbers.

- [ ] **Step 4: Inspect results**

Run: `cd /data/projects/agent-bench/experiments/_smoke && npx promptfoo eval -c promptfooconfig.yaml --no-cache -o ../../results/smoke.json && python3 -c "import json;d=json.load(open('../../results/smoke.json'));print('OK')"`
Expected: `results/smoke.json` written, parses.

- [ ] **Step 5: Commit**

```bash
cd /data/projects/agent-bench
git add experiments/_smoke results/smoke.json
git commit -m "test: green end-to-end harness smoke (ts-rename, qwen, baseline)"
```

---

## Self-Review

- **Spec coverage:** Provider (FRAMEWORK §Architecture) → Tasks 1–5. Isolated workdir + git reset (FRAMEWORK §Fairness) → Task 2. Three toggle mechanisms — `mcp_servers` + `system_instruction` implemented in Task 3; `model_settings` is carried in the arm object shape but not exercised until an experiment needs it (acceptable: extension point, not dead code). Efficiency metrics (tokens/tools/latency) → Tasks 1, 5. Objective quality KPIs (diff-minimality, regression-free, lint-clean) → Task 6 + assert in Task 7. Host abstraction (config.local.yaml) → Task 0. GPU mutex → Task 7 Step 2 (full loop is a later plan). LLM-judge → correctly out of scope (deferred). Opus reference → out of scope here (blocked on credits, later plan).
- **Deliberately deferred to follow-on plans:** full 5-task multi-language fixture; `runner/run.sh` GPU-loop across models; `charts.py`; Serena & Caveman `promptfooconfig.yaml` + matrix runs + article drafts.
- **Known verification points (honest unknowns, each has a STOP/adapt step):** opencode honoring project `opencode.json` instructions (Task 3 Step 5); promptfoo python file-assert stdin contract (Task 7 Step 1). Both are checked before being relied on.
- **Placeholders:** the one intentional `javascript` placeholder assert in Task 7 is labeled and removed once the python assert is confirmed.
