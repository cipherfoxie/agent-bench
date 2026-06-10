# Serena Benchmark — Design Spec

> **Design history.** This document is the original design. The implemented harness became a lean direct Node runner (see `README.md` + `runner/`) instead of the promptfoo integration sketched here; final methodology and numbers live in `results/` and the published articles.

**Date:** 2026-06-09
**Goal:** Measure whether the [Serena](https://github.com/oraios/serena) coding MCP actually improves *local* coding agents (self-hosted LLMs on a DGX Spark), and by how much, versus the agent's native tools. Publish a reproducible benchmark and a write-up on sovgrid.org.

**Core question:** Does Serena help the *model*, or does it mostly help a frontier model like Claude that already navigates code well? I.e. is Serena a capability equalizer for weaker local models?

## Hypothesis

Serena's symbol-level (LSP-backed) tools collapse multi-step navigation/edit sequences into atomic calls. A weaker model should therefore benefit *more* than a strong one, because the precision comes from the language server rather than the model's reasoning. We will confirm or refute this. A null/negative result is an acceptable and publishable outcome — we report what the data shows.

## Experimental matrix

| Model | Provider id | without Serena | with Serena |
|---|---|---|---|
| Mistral-Small-4 | `local-sglang/Mistral-Small-4` | N=5 | N=5 |
| Qwen3.6-35b | `local-qwen/qwen3.6-35b` | N=5 | N=5 |
| Opus 4.8 (cloud reference ceiling) | `anthropic/claude-opus-4-8` | N=3 | N=3 |

- "without Serena" = opencode native tools (read/edit/grep/bash).
- "with Serena" = native tools + Serena MCP enabled.
- Opus row is a reference ceiling only, clearly labeled as cloud/frontier, not part of the local thesis.

Lineup × 5 tasks × N → 200 local runs + 30 reference runs = **230 runs total**.

## Task suite

Each task has a clean starting state in the fixture repo and a deterministic pass/fail gate. Five tasks:

1. **Cross-file rename (TypeScript)** — rename a function used in 3+ files. Gate: `tsc` clean.
2. **Add method + call site (Rust)** — add a method to a struct and a caller. Gate: `cargo check` clean.
3. **Fix moved import (Python)** — a symbol was moved; repair imports. Gate: `python -c "import <module>"` exits 0.
4. **Find-all-callers + edit** — find every caller of symbol X and insert a log line at each. Gate: grep verifies exact count of edited call sites.
5. **Safe delete** — remove an unused symbol without breaking anything. Gate: build clean AND symbol absent.

Tasks are designed to exercise semantic navigation/editing (Serena's claimed strength) while remaining objectively verifiable. Prompts are identical across both arms.

## Metrics (recorded per run)

Speed / efficiency:
- **Success** (pass/fail against the gate) → success rate % per cell. Primary metric.
- **Tool calls / steps** → tests the "8–12 steps collapse into 1" claim.
- **Tokens** (input+output) → promptfoo native (via the opencode provider).
- **Wallclock** (seconds) → promptfoo native latency.

Quality (objective, see [FRAMEWORK.md](../../FRAMEWORK.md)):
- **Diff minimality** — changed lines/files vs minimal reference patch. Directly tests Serena's "surgical edit" claim.
- **Regression-free** — full build+test suite passes, not just the targeted gate.
- **Lint/format clean** — no new clippy/eslint/ruff violations.

Deferred: LLM-judge rubric (no neutral judge available yet).

## Harness

Runs on the shared promptfoo-based harness — see [FRAMEWORK.md](../../FRAMEWORK.md). This experiment is just a promptfoo config (`experiments/serena/promptfooconfig.yaml`):

- **Toggle type:** `mcp_servers`.
- **arms:** `baseline` (`mcp_servers: []`) and `treatment` (`mcp_servers: [serena]`).
- **providers:** the three models via the custom opencode provider.
- **tests:** the 5 coding tasks from `tasks/`; gates run as exec asserts.
- Serena is configured locally via `uvx` (stdio), no cloud.

Rejected alternative: a bespoke per-run shell script, or driving the TUI by hand — not reproducible, more code, less credible than promptfoo.

## Fairness controls (credibility)

- Identical prompts in both arms.
- Fixed sampling (temperature etc.), documented per model.
- SGLang config validated via `diagnose_sglang` and printed in the article.
- Within-model wallclock is fair (sole GPU resident during that model's block).
- N=5 reported as rates only; **no p-values or significance claims** at this N.
- Serena off-arm still has full native tooling, so this measures *native vs native+Serena*, stated plainly.

## Known risks / limitations (disclosed in the article)

- Mistral-Small-4 is not "tiny"; the equalizer effect may be moderate, not dramatic.
- Local models may call Serena's tools incorrectly — that is itself a result, not a harness bug.
- Qwen3.6 context is 32768; large tasks may truncate. Documented.
- GPU mutex means local models are benchmarked sequentially, not concurrently.

## Project layout

Part of the `agent-bench` repo (`github.com/cipherfoxie/agent-bench`). See [FRAMEWORK.md](../../FRAMEWORK.md) for the full layout. This experiment owns `experiments/serena/` (this spec + `promptfooconfig.yaml`) and shares `fixture/`, `tasks/`, `provider/`, `results/`.

## Article (sovgrid.org, English)

Structure: hook → setup (DGX Spark GB10, models, Serena) → methodology (+ repo link) → results matrix × 4 metrics + charts → equalizer thesis verdict → honest limitations → links.

- Rules: no em-dash, anti_ai_patterns (VIBE.md), prepublish-check.sh gate, a11y audit, bidirectional crosslinks to existing LLM/Spark articles.
- Mandatory links: Serena GitHub + docs, the claudemarketplaces.com MCP listing, the fixture repo.
- Privacy: operator-identity leak grep before any push or publish.

## Out of scope (YAGNI)

- No statistical significance testing (N too small; honest rates only).
- No multi-host / distributed runs.
- No attempt to tune Serena or the models for the benchmark; stock configs only.
