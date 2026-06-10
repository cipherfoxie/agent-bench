import { spawn, execSync } from 'node:child_process';
import { mkdtempSync, cpSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeArmConfig } from './arm-config.js';
import { parseRun } from './parse-run.js';

// Copy fixture (plain files) into a throwaway workdir and make it a fresh git
// repo at a clean baseline, so the gate and diff-stat work per run.
// extraFiles {name: content} are written before the base commit (e.g. AGENTS.md
// for prompt-injection arms), so they never show up in the run diff.
export function prepareWorkdir(fixturePath, extraFiles = {}) {
  const wd = mkdtempSync(join(tmpdir(), 'ab-wd-'));
  cpSync(fixturePath, wd, { recursive: true, filter: (s) => !s.split('/').includes('.git') });
  for (const [name, content] of Object.entries(extraFiles)) writeFileSync(join(wd, name), content, 'utf8');
  execSync('git init -q && git add -A && git -c user.email=b@b -c user.name=b commit -q -m base', { cwd: wd });
  return wd;
}

// Run one opencode invocation. opts: { model, fixturePath, arm, prompt, timeoutMs }
// arm.mcp -> MCP servers; arm.agentsFile -> file injected as AGENTS.md (verified
// instruction-injection mechanism; project opencode.json `instructions` does NOT work).
// CRITICAL: stdin must be 'ignore' (/dev/null) — opencode run blocks forever on an open stdin.
export function runOpencode(opts) {
  const { model, fixturePath, arm = {}, prompt, timeoutMs = 600000 } = opts;
  const extra = arm.agentsFile ? { 'AGENTS.md': readFileSync(arm.agentsFile, 'utf8') } : {};
  const wd = prepareWorkdir(fixturePath, extra);
  const cfgPath = join(wd, '.arm-opencode.json');
  writeArmConfig(cfgPath, arm, wd);
  return new Promise((resolve) => {
    const start = Date.now();
    const child = spawn(
      'opencode',
      ['run', '--format', 'json', '-m', model, '--dir', wd, prompt],
      { cwd: wd, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, OPENCODE_CONFIG: cfgPath } }
    );
    let stdout = '', stderr = '';
    const timer = setTimeout(() => { child.kill('SIGKILL'); }, timeoutMs);
    child.stdout.on('data', d => (stdout += d));
    child.stderr.on('data', d => (stderr += d));
    child.on('close', (code) => {
      clearTimeout(timer);
      const parsed = parseRun(stdout);
      resolve({ parsed, exitCode: code, wallMs: Date.now() - start, workdir: wd, stderr });
    });
  });
}

export function cleanupWorkdir(wd) { rmSync(wd, { recursive: true, force: true }); }
