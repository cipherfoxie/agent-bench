import { readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';

const GLOBAL = `${homedir()}/.config/opencode/opencode.json`;

// Build a clean opencode config for one arm: real provider defs + permission,
// but ONLY the arm's MCP servers (no inherited global MCP noise). Written to a
// temp path, passed to opencode via OPENCODE_CONFIG. This is the verified arm toggle.
//   arm = { mcp: {name: {...}} }   (mcp {} = baseline / no intervention)
export function writeArmConfig(outPath, arm, workdir = '') {
  const g = JSON.parse(readFileSync(GLOBAL, 'utf8'));
  // substitute __WORKDIR__ in mcp command args (e.g. serena --project <workdir>)
  const mcp = JSON.parse(JSON.stringify(arm.mcp || {}).replaceAll('__WORKDIR__', workdir));
  const cfg = {
    $schema: 'https://opencode.ai/config.json',
    provider: g.provider || {},
    permission: g.permission || {},   // preserve auto-approve behavior for edits
    mcp,
  };
  // Mistral-Small-4 has a 32768 context; opencode otherwise requests 32000 completion
  // tokens (input + 32000 > 32768 -> reject). Cap output so requests fit.
  const ms = cfg.provider?.['local-sglang']?.models?.['Mistral-Small-4'];
  if (ms) ms.limit = { context: 32768, output: 4096 };
  writeFileSync(outPath, JSON.stringify(cfg, null, 2), 'utf8');
  return cfg;
}
