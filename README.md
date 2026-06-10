# agent-bench

Reproducible A/B benchmark: does an MCP server or skill actually improve a coding agent on real tasks? Runs [opencode](https://opencode.ai) headless against your own models, compares a baseline arm (native tools) with a treatment arm (baseline + the intervention), and scores every run with deterministic gates.

First case studies: [Serena](https://github.com/oraios/serena) (MCP, semantic code tools) and [caveman](https://github.com/JuliusBrussee/caveman) (skill, token-compressed output). Findings: `results/VERDICT.md`.

## What it measures

Per run: success (deterministic gate), tool calls, input/output tokens, wallclock. For coding tasks additionally three objective quality KPIs: diff minimality (`git diff` vs a minimal reference patch), regression-free (full typecheck after the edit), lint-clean. For chat tasks: a frozen fact checklist on the output. No LLM judge.

## Layout

```
runner/            bench.js (matrix), aggregate.js, smoke.js, arms.js, tasks.js
runner/lib/        opencode invoker, JSONL parser, per-arm config writer
fixture/           TS fixtures (ts-rename, ts-callers, ts-ambiguous) + chat
tasks/             per-task gate scripts
scripts/quality/   diff-stat, regression, lint-clean
prompts/           injected skill prompts (caveman SKILL.md, verbatim)
results/           runs-*.jsonl (raw), summary-*.md/json, VERDICT.md
```

## Reproduce

Requirements: Node 22+, git, opencode (`npm i -g opencode-ai`), your models configured as opencode providers, and for the Serena arm `uv tool install serena-agent && serena init`.

1. Edit `runner/bench.js` MODELS to your opencode provider ids. If you have a GPU mutex script, point `SWITCH` at it; otherwise stub `ensureModel` to return true.
2. Smoke one run: `node runner/smoke.js baseline <provider/model> ts-rename`
3. Matrix: `EXPERIMENT=serena ARMS=baseline,serena TASK_NAME=ts-rename,ts-callers,ts-ambiguous N=5 node runner/bench.js`
4. Aggregate: `node runner/aggregate.js <runs-file-suffix>`

Two opencode footguns the harness already handles: `opencode run` must get stdin from `/dev/null` (it blocks forever on an open stdin), and per-arm isolation goes through the `OPENCODE_CONFIG` env var. Prompt-injection arms write the prompt as `AGENTS.md` into the working copy (project-level `opencode.json` `instructions` is not picked up).

## Adding an experiment

A new MCP: add an arm in `runner/arms.js` with its `mcp` block (use `__WORKDIR__` for per-run paths). A new skill: add an arm with `agentsFile` pointing at the prompt. A new task: fixture dir + gate script + entry in `runner/tasks.js`. No harness changes.

## Honest limits

Small N (3-5), rates not significance. TypeScript fixtures only so far. Results are from self-hosted models (Qwen3.6-35b on vLLM, Mistral-Small-4 on SGLang) on a DGX Spark; your models will differ.
