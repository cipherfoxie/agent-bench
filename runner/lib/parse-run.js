// Parse opencode `run --format json` JSONL into benchmark metrics.
// Each line: { type, timestamp, sessionID, part }; part.type in step-start|step-finish|tool|text
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
    if (p.tokens) { tokens.input += p.tokens.input || 0; tokens.output += p.tokens.output || 0; }
  }
  tokens.total = tokens.input + tokens.output;
  const texts = parts.filter(p => p.type === 'text' && typeof p.text === 'string');
  const output = texts.length ? texts[texts.length - 1].text : '';
  const ts = objs.map(o => o.timestamp).filter(t => typeof t === 'number');
  const latencyMs = ts.length ? Math.max(...ts) - Math.min(...ts) : 0;
  // error events (e.g. provider/credit) surfaced for diagnostics
  const errors = objs.filter(o => o.type === 'error').map(o => o.error?.data?.message || o.error?.name || 'error');
  return { output, toolNames, toolCallCount: toolNames.length, tokens, latencyMs, errors };
}
