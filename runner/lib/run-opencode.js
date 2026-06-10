import { spawn } from 'node:child_process';
import { mkdtempSync, cpSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeArmConfig } from './arm-config.js';
import { parseRun } from './parse-run.js';

// Copy fixture (incl .git, so gate/diff work) into a throwaway workdir.
export function prepareWorkdir(fixturePath) {
  const wd = mkdtempSync(join(tmpdir(), 'ab-wd-'));
  cpSync(fixturePath, wd, { recursive: true });
  return wd;
}

// Run one opencode invocation. opts: { model, fixturePath, arm, prompt, timeoutMs }
// CRITICAL: stdin must be 'ignore' (/dev/null) — opencode run blocks forever on an open stdin.
export function runOpencode(opts) {
  const { model, fixturePath, arm = {}, prompt, timeoutMs = 600000 } = opts;
  const wd = prepareWorkdir(fixturePath);
  const cfgPath = join(wd, '.arm-opencode.json');
  writeArmConfig(cfgPath, arm);
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
