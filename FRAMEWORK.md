# agent-bench — Framework Design Spec

> **Design history.** This document is the original design. The implemented harness became a lean direct Node runner (see `README.md` + `runner/`) instead of the promptfoo integration sketched here; final methodology and numbers live in `results/` and the published articles.

**Date:** 2026-06-09
**Purpose:** A reproducible, config-driven harness to measure whether a given **intervention** improves a coding agent on real tasks, across models, with the same metrics every time. An intervention is an MCP server, a skill/prompt, or a model setting. First two case studies: [Serena](experiments/serena/SPEC.md) (MCP) and [caveman](experiments/caveman/SPEC.md) (skill).

Built **on [promptfoo](https://github.com/promptfoo/promptfoo)** rather than hand-rolled.

## Why promptfoo (research-before-build outcome)

- The academic MCP benchmarks ([MCP-Bench](https://github.com/Accenture/mcp-bench), [MCPAgentBench](https://arxiv.org/abs/2512.24565), [MCPBench](https://github.com/modelscope/MCPBench)) measure a model's *general* MCP tool-use against their own fixed task suites. They do not A/B an intervention on your own tasks. Wrong tool.
- promptfoo is a declarative YAML eval framework, multi-provider (local SGLang endpoints + Anthropic side by side), with native token/latency capture, [MCP evaluation](https://www.docker.com/blog/evaluate-models-and-mcp-with-promptfoo-docker/), [agent-skill integration](https://www.promptfoo.dev/docs/integrations/agent-skill/), [model-graded](https://www.promptfoo.dev/docs/configuration/expected-outputs/model-graded/) and exec asserts, and CLI/CI. Used by OpenAI and Anthropic, which gives the published benchmark credibility and SEO.

## Core model

Every experiment compares **arms** (baseline vs treatment) over **models × tasks × N**, with identical metrics. Only the toggle differs. Three toggle mechanisms cover our cases and keep the harness generic:

| Toggle | Arm declares | Example |
|---|---|---|
| `mcp_servers` | which MCP servers are enabled | Serena on/off |
| `system_instruction` | a prompt/skill text injected as system instruction | caveman on/off |
| `model_settings` | a model param override (temperature, variant, ctx) | reasoning-effort on/off |

**Benchmarking a new MCP or skill = a new experiment YAML, no new code.** A new toggle type is a small, additive change to the provider.

## Architecture

- **promptfoo = orchestrator.** Owns the matrix, scoring, reporting, token/latency capture. Each arm is a promptfoo provider; each task is a promptfoo test; each gate is an exec assert.
- **Custom opencode provider** (`provider/opencode-provider.*`): runs the agentic loop via `opencode run --format json -m <model> --dir <workdir>` and returns `{output, tokenUsage, toolCalls, latencyMs}`. It reads the arm config and configures opencode per run (writes the MCP set, sets the system instruction / `--agent`, applies model settings). It operates on an **isolated working copy** of the fixture (git worktree or temp clone) so repeated and grouped runs never clobber each other.
- **Tasks** (`tasks/*.yaml`): coding tasks (clean starting state + prompt + gate command) and chat tasks (prompt + fact checklist). Gates run as promptfoo exec asserts on the post-run fixture state.
- **Metrics:** tokens and latency are native to promptfoo; `toolCalls` is surfaced by our provider; success is the assert result. promptfoo writes JSON output → `results/` → charts.

## Host abstraction (public repo, zero leak)

- `config.example.yaml` is committed with placeholders.
- `config.local.yaml` is gitignored and holds host specifics: local SGLang endpoint URLs, provider ids, the GPU-mutex command.
- Outsiders clone, copy the example, point it at their own stack, and reproduce. operator infrastructure stays private.

## GPU mutex / serialization

Local SGLang keeps one resident model (a single-resident GPU mutex). `runner/run.sh` loops models: switch the resident model → run that model's whole promptfoo slice with `--max-concurrency 1` against the shared fixture → next model. Opus needs no GPU. Within a model, arms and tasks vary, so within-model wallclock is comparable (sole resident).

## Repo layout

```
agent-bench/
├── FRAMEWORK.md              this file
├── provider/                 opencode provider wrapper for promptfoo
├── tasks/                    coding + chat task defs + gate scripts
├── prompts/                  injected system/skill prompts (e.g. caveman.md)
├── fixture/                  TS + Rust + Python mini-repo (coding task states)
├── experiments/
│   ├── serena/   SPEC.md + promptfooconfig.yaml
│   └── caveman/  SPEC.md + promptfooconfig.yaml
├── results/                  promptfoo run outputs + charts
├── config.example.yaml       host placeholders (committed)
├── runner/run.sh             model-loop + GPU-switch wrapper
└── README.md                 1:1 reproduction instructions
```

## Metrics & reporting

Per cell (model × arm × task family), two axes:

**Speed / efficiency:** success rate (pass/fail gate), mean tool-calls, mean tokens (in / out / total), mean wallclock.

**Quality (beyond "it passes"):** three objective KPIs, all computed without a judge model:
- **Diff minimality** — changed lines + files vs a minimal reference patch (`git diff --stat`). Tests the "surgical edit" claim; smaller is better.
- **Regression-free** — the *full* build+test suite passes after the edit, not just the task's targeted gate. Catches collateral damage.
- **Lint/format clean** — no new clippy / eslint / ruff violations introduced vs the clean baseline.

Quality KPIs apply to the **coding** task family. For **chat** tasks the quality measure is the fact-checklist pass rate (see caveman spec).

**Deferred:** an LLM-judge quality rubric. It requires a neutral judge model (not in the test matrix) — Anthropic has no credit, and a local judge would be circular. Held as an optional later pass: blind to arm/model, rubric-anchored, reporting inter-arm deltas only, never as a headline. Run only once a neutral judge is funded/available.

`results/` JSON → a small `charts.py` (matplotlib) renders the comparison figures used in the articles.

## Fairness controls (shared by all experiments)

- Identical user prompts across arms; only the arm toggle differs.
- Fixed sampling, documented per model; SGLang config validated via `diagnose_sglang` and printed in the article.
- Clean `git` reset of the working copy before each coding run.
- N reported as rates only; no p-values or significance claims at these N.
- Baseline arm keeps full native tooling, so every experiment measures *native vs native+intervention*, stated plainly.

## Out of scope (YAGNI)

- No statistical significance testing (honest rates only).
- No toggle types beyond the three above; no plugin system.
- No distributed / multi-host runs.
- No tuning of the intervention or models; stock configs only.
