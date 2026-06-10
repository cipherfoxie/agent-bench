import { readFileSync, writeFileSync } from 'node:fs';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const taskName = process.argv[2] || 'ts-rename';
const rows = readFileSync(`${ROOT}/results/runs-${taskName}.jsonl`, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);

const mean = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
const r1 = (x) => Math.round(x * 10) / 10;

const cells = {};
for (const r of rows) {
  const k = `${r.model}__${r.arm}`;
  (cells[k] ??= []).push(r);
}

const summary = [];
for (const [k, rs] of Object.entries(cells)) {
  const [model, arm] = k.split('__');
  summary.push({
    model, arm, n: rs.length,
    successRate: r1(100 * mean(rs.map(r => r.success ? 1 : 0))),
    meanToolCalls: r1(mean(rs.map(r => r.toolCalls))),
    meanTokensIn: Math.round(mean(rs.map(r => r.tokensIn))),
    meanTokensOut: Math.round(mean(rs.map(r => r.tokensOut))),
    meanWallS: r1(mean(rs.map(r => r.wallMs)) / 1000),
    meanFilesChanged: r1(mean(rs.map(r => r.filesChanged ?? 0))),
    meanLinesChanged: r1(mean(rs.map(r => r.linesChanged ?? 0))),
    regressionFreeRate: r1(100 * mean(rs.map(r => r.regressionOk ? 1 : 0))),
    lintCleanRate: r1(100 * mean(rs.map(r => r.lintClean ? 1 : 0))),
  });
}
summary.sort((a, b) => a.model.localeCompare(b.model) || a.arm.localeCompare(b.arm));

writeFileSync(`${ROOT}/results/summary-${taskName}.json`, JSON.stringify(summary, null, 2));

// markdown table
const cols = ['model', 'arm', 'n', 'successRate', 'meanToolCalls', 'meanTokensIn', 'meanTokensOut', 'meanWallS', 'meanFilesChanged', 'meanLinesChanged', 'regressionFreeRate', 'lintCleanRate'];
const hdr = `| ${cols.join(' | ')} |\n| ${cols.map(() => '---').join(' | ')} |`;
const body = summary.map(s => `| ${cols.map(c => s[c]).join(' | ')} |`).join('\n');
const md = `# Serena benchmark — ${taskName} results\n\n_${rows.length} runs_\n\n${hdr}\n${body}\n`;
writeFileSync(`${ROOT}/results/summary-${taskName}.md`, md);
console.log(md);
