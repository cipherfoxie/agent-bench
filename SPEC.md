# Serena Benchmark — Design Spec

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

1. **Cross-file rename (TypeScript)** — rename a function used in 3+ files. Gate: `rtk tsc` clean.
2. **Add method + call site (Rust)** — add a method to a struct and a caller. Gate: `rtk cargo check` clean.
3. **Fix moved import (Python)** — a symbol was moved; repair imports. Gate: `python -c "import <module>"` exits 0.
4. **Find-all-callers + edit** — find every caller of symbol X and insert a log line at each. Gate: grep verifies exact count of edited call sites.
5. **Safe delete** — remove an unused symbol without breaking anything. Gate: build clean AND symbol absent.

Tasks are designed to exercise semantic navigation/editing (Serena's claimed strength) while remaining objectively verifiable. Prompts are identical across both arms.

## Metrics (recorded per run)

- **Success** (pass/fail against the gate) → success rate % per cell. Primary metric.
- **Tool calls / steps** → tests the "8–12 steps collapse into 1" claim.
- **Tokens** (input+output) → from `opencode export`.
- **Wallclock** (seconds) → from `time`.

## Harness

`opencode run` headless, JSON export. Per run:

1. `git checkout -- .` in the fixture repo (identical clean start).
2. Ensure correct model is GPU-resident (`switch.sh mistral|qwen`); runs are grouped by model to minimize switching. Opus runs need no GPU.
3. Toggle Serena via `opencode mcp` add/remove (or per-run config).
4. `time opencode run --format json -m <model> --dir <fixture> "<task prompt>"` → capture stdout JSON + wallclock.
5. Run the task's gate command → pass/fail.
6. `opencode export <session>` → parse tool-call count + tokens.
7. Append a row to `results/runs.jsonl`.

`runner/parse-results.py` aggregates JSONL → `results/summary.csv` + charts.

Rejected alternative: driving the TUI by hand and reading numbers off screen — not reproducible, not scriptable.

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

## Project layout (becomes public repo `github.com/cipherfoxie/serena-benchmark`)

```
/data/projects/serena-benchmark/
├── fixture/        TS + Rust + Python mini-repo + the 5 task starting states
├── runner/         bench.sh + parse-results.py + tasks.yaml
├── results/        raw runs.jsonl + summary.csv + charts
├── SPEC.md         this file
└── README.md       1:1 reproduction instructions
```

## Article (sovgrid.org, English)

Structure: hook → setup (DGX Spark GB10, models, Serena) → methodology (+ repo link) → results matrix × 4 metrics + charts → equalizer thesis verdict → honest limitations → links.

- Rules: no em-dash, anti_ai_patterns (VIBE.md), prepublish-check.sh gate, a11y audit, bidirectional crosslinks to existing LLM/Spark articles.
- Mandatory links: Serena GitHub + docs, the claudemarketplaces.com MCP listing, the fixture repo.
- Privacy: Stef/cipherfox/Tor leak grep before any push or publish.

## Out of scope (YAGNI)

- No statistical significance testing (N too small; honest rates only).
- No multi-host / distributed runs.
- No attempt to tune Serena or the models for the benchmark; stock configs only.
