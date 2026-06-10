# agent-bench

> Does that MCP server or skill actually make your coding agent better? Measure it. Deterministic gates, A/B arms, your own models, reproducible numbers instead of vibes.

[![License: MIT](https://img.shields.io/badge/license-MIT-yellow.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-22.x-339933.svg?logo=nodedotjs&logoColor=white)](https://nodejs.org)
[![opencode](https://img.shields.io/badge/agent-opencode-blue.svg)](https://opencode.ai)
[![Models](https://img.shields.io/badge/models-any%20OpenAI--compatible-success.svg)](#reproduce)
[![Honest Results](https://img.shields.io/badge/negative%20results-published-red.svg)](results/)

## What

`agent-bench` runs a coding agent through the same tasks twice, once with an "enhancement" (an MCP server, a skill prompt, a model setting) and once without, on the models *you* run, and scores every run with deterministic gates instead of model-graded vibes.

```
[bench] serena/ts-ambiguous  models=qwen,mistral  arms=baseline,serena  N=3  total=12
[1] qwen/baseline #1  success=true tools=19 tokIn=138864 diff=4f/8l 69264ms
[4] qwen/serena #1    success=true tools=8  tokIn=99506  diff=4f/8l 20071ms
[7] mistral/baseline #1  success=false tools=23 tokIn=240278 diff=8f/18l  <- clobbered the wrong class, still type-checks
```

Per run it records: success against a hard gate (build, typecheck, fact checklist), tool calls, input/output tokens, wallclock, and three objective quality KPIs for code edits — diff minimality vs a reference patch, regression-freedom (full typecheck, not just the target), and lint cleanliness. No LLM judge anywhere.

## agent-bench vs the alternatives

| | agent-bench | MCP-Bench / MCPBench (academic) | promptfoo raw | Twitter screenshots |
|---|---|---|---|---|
| **Question answered** | does intervention X help *my* agent on *my* tasks | how well do models use MCP tools in general | is prompt A better than prompt B | trust me bro |
| **A/B arms (with / without)** | core design | no | manual setup | no |
| **Agentic loop (real edits on real files)** | ✓ via opencode headless | partial / sandboxed | not the focus | n/a |
| **Deterministic pass/fail gates** | build + typecheck + frozen checklists | mixed, partly LLM-judged | assertions available | no |
| **Quality of the edit (diff minimality, regressions)** | ✓ measured | no | no | no |
| **Your own self-hosted models** | first-class | usually frontier APIs | ✓ | n/a |
| **Negative results published** | yes, that is the point | rarely | n/a | never |
| **New tool to benchmark** | one config entry | new paper | new config | new thread |

## Why

The agent-tool ecosystem runs on install counts and claims. Serena's pitch is semantic edits; caveman's pitch is "~75% token savings". Both are top-charts popular. Measured on real self-hosted models with hard gates, one turned out to be a guardrail rather than a turbo, and the other saved a third of the claim at best and *cost* money on every Claude model tested. You only learn that by measuring, and you can only trust it if every number is reproducible from raw data.

Findings so far (full write-ups on [sovgrid.org](https://sovgrid.org/blog/agent-bench-pillar/)):

| Tool | Verdict | Headline number | Write-up |
|---|---|---|---|
| [Serena](https://github.com/oraios/serena) (MCP, semantic code tools) | SITUATIONAL | weak model native: 0/3 on ambiguous rename, broken result still compiled; with Serena 1/3, failure mode shifts from "confidently wrong" to "incompletely right" | [sovgrid.org/blog/serena-local-benchmark/](https://sovgrid.org/blog/serena-local-benchmark/) |
| [caveman](https://github.com/JuliusBrussee/caveman) (skill, token compression) | SKIP | claim 75%, measured -31% local / -33% best-case Claude / **+18% on Fable 5**; never cheaper in dollars | [sovgrid.org/blog/caveman-local-benchmark/](https://sovgrid.org/blog/caveman-local-benchmark/) |

## Reproduce

Requirements: Node 22+, git, [opencode](https://opencode.ai) (`npm i -g opencode-ai`), your models configured as opencode providers. For the Serena arm: `uv tool install serena-agent && serena init`.

```bash
git clone https://github.com/cipherfoxie/agent-bench && cd agent-bench && npm install

# 1. point MODELS in runner/bench.js at your opencode provider ids
#    (if you have a GPU mutex script, set SWITCH; otherwise stub ensureModel)

# 2. smoke one run
node runner/smoke.js baseline <provider/model> ts-rename

# 3. full matrix
EXPERIMENT=serena ARMS=baseline,serena TASK_NAME=ts-rename,ts-callers,ts-ambiguous N=5 node runner/bench.js

# 4. aggregate
node runner/aggregate.js <runs-file-suffix>
```

Raw data for every published number is in `results/*.jsonl`.

## Layout

## Series

The methodology article ([sovgrid.org/blog/agent-bench-pillar/](https://sovgrid.org/blog/agent-bench-pillar/)) explains the design. Published spokes so far: [Serena](https://sovgrid.org/blog/serena-local-benchmark/) · [caveman](https://sovgrid.org/blog/caveman-local-benchmark/). The series continues through the Claude marketplace top charts — submit a benchmark result via issue or PR.

```
runner/            bench.js (matrix) · aggregate.js · smoke.js · arms.js · tasks.js
runner/lib/        opencode invoker · JSONL parser · per-arm config writer
runner/claude-chat.js   same A/B on Claude models via the claude CLI (subscription auth)
fixture/           TS fixtures (ts-rename, ts-callers, ts-ambiguous) + chat
tasks/             per-task gate scripts
scripts/quality/   diff-stat · regression · lint-clean
prompts/           injected skill prompts, verbatim from upstream
results/           runs-*.jsonl (raw) · summaries · VERDICT.md · FINDINGS-*.md
article/           the published write-ups (canonical versions on sovgrid.org)
```

## Design constraints

1. **Deterministic gates only.** A run passes a build, a typecheck, or a frozen fact checklist. No LLM grades another LLM.
2. **A/B or it did not happen.** Every claim is a within-model comparison against a baseline arm on identical prompts.
3. **Negative results ship.** A tool that measures as overhead gets published with the same template as a winner.
4. **One change per arm.** Toggle exactly one variable; everything else stays fixed and documented.
5. **Raw data in the repo.** Every table is recomputable from `results/*.jsonl`.
6. **Benchmark hygiene is part of the method.** One matrix here was thrown away because a health-check timer resurrected an idle model mid-run; the clean redo flipped a finding. Contaminated data dies, it does not get footnoted.

## Adding an experiment

A new MCP: add an arm in `runner/arms.js` with its `mcp` block (`__WORKDIR__` substitutes the per-run path). A new skill: add an arm with `agentsFile` pointing at the prompt. A new task: fixture dir + gate script + entry in `runner/tasks.js`. No harness changes.

Two opencode footguns the harness already handles: `opencode run` must get stdin from `/dev/null` (it blocks forever on an open stdin), and per-arm isolation goes through the `OPENCODE_CONFIG` env var; prompt-injection arms write `AGENTS.md` into the working copy (project-level `opencode.json` `instructions` is not picked up).

## Honest limits

Small N (3-5), rates not significance. TypeScript fixtures only so far. Published numbers are from self-hosted models (Qwen3.6-35b on vLLM, Mistral-Small-4 on SGLang) on a DGX Spark plus Claude models via CLI; your stack will differ, which is exactly why the harness is a clone away.

## License

MIT.
