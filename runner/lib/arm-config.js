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
  // Any model with a small context window needs its completion capped, else
  // opencode's default 32000-token completion request overflows it (input +
  // 32000 > context -> reject). Provider-agnostic; current local models all run
  // >=65536 so this is a no-op for them, but keeps short-context models safe.
  for (const prov of Object.values(cfg.provider || {})) {
    for (const m of Object.values(prov?.models || {})) {
      const ctx = m?.limit?.context;
      if (ctx && ctx <= 33000) m.limit = { context: ctx, output: 4096 };
    }
  }
  writeFileSync(outPath, JSON.stringify(cfg, null, 2), 'utf8');
  return cfg;
}
