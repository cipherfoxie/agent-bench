import { readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';

const GLOBAL = `${homedir()}/.config/opencode/opencode.json`;

// Build a clean opencode config for one arm: real provider defs + permission,
// but ONLY the arm's MCP servers (no inherited global MCP noise). Written to a
// temp path, passed to opencode via OPENCODE_CONFIG. This is the verified arm toggle.
//   arm = { mcp: {name: {...}} }   (mcp {} = baseline / no intervention)
export function writeArmConfig(outPath, arm) {
  const g = JSON.parse(readFileSync(GLOBAL, 'utf8'));
  const cfg = {
    $schema: 'https://opencode.ai/config.json',
    provider: g.provider || {},
    permission: g.permission || {},   // preserve auto-approve behavior for edits
    mcp: arm.mcp || {},
  };
  writeFileSync(outPath, JSON.stringify(cfg, null, 2), 'utf8');
  return cfg;
}
