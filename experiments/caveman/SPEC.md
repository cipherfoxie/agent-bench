# Caveman Benchmark — Design Spec

**Date:** 2026-06-09
**Goal:** Measure whether the popular [caveman](https://claudemarketplaces.com/skills) skill (`juliusbrussee/caveman`, ~203K installs, claims "~75% token reduction while preserving technical accuracy") actually saves tokens for *local* coding agents on a DGX Spark, where it saves them (chat vs agentic coding), and what it costs in accuracy.

**Core question:** A 75% token cut is a chat-style claim. In agentic *coding*, most tokens are tool I/O and file content, not the agent's prose. Does caveman move the needle there at all, and does the compression hurt task success? Hype vs reality on a 203K-install skill.

Runs on the shared promptfoo harness — see [FRAMEWORK.md](../../FRAMEWORK.md). Shares fixture, provider, and metrics with the [Serena experiment](../serena/SPEC.md). Serena is OFF for all caveman runs to isolate the variable.

## Hypotheses

1. caveman cuts **output** tokens substantially in **chat** tasks.
2. caveman's effect on **total** tokens in **coding** tasks is small, because prose is a minority of the token budget there.
3. Weaker local models may not comply with the compression instruction at all (cf. "weak models ignore negative instructions"). Compliance is measured, not assumed.

A negative or mixed result is publishable and is the more credible article.

## Application mechanism (fairness-critical)

caveman is a Claude Code *skill* (a communication-style system instruction). We are running via opencode, not Claude Code. To keep all models apples-to-apples, the caveman prompt content is injected **identically as an opencode agent system instruction** for every model (local and Opus). We do **not** use Claude Code's native skill loading. This is documented in the article so nobody mistakes it for the native skill experience.

## Experimental matrix

| Model | Provider id | caveman off | caveman on |
|---|---|---|---|
| Mistral-Small-4 | `local-sglang/Mistral-Small-4` | N=5 | N=5 |
| Qwen3.6-35b | `local-qwen/qwen3.6-35b` | N=5 | N=5 |
| Opus 4.8 (cloud reference) | `anthropic/claude-opus-4-8` | N=3 | N=3 |

Run across **two task families**:

- **Coding** — the same 5 fixture tasks as the Serena benchmark (Serena off), objective build/test gates.
- **Chat** — 5 non-coding prose prompts (explain / summarize / compare), each with a predefined **fact checklist** so accuracy is scored objectively (did the answer contain the required facts?).

Counts: coding 5×2×2×5 + chat 5×2×2×5 = **200 local runs**; Opus 5×2×3 + 5×2×3 = **60 reference runs**. Total ≈ **260 runs**.

## Metrics (per run)

- **Output tokens** — the headline compression metric.
- **Total tokens** (input+output) — what actually matters for cost/context.
- **Accuracy** — coding: build/test gate; chat: fact-checklist pass rate.
- **Compliance** — did the model actually adopt caveman style? Heuristic: drop in mean output tokens-per-message / sentence length vs the off-arm. Catches "model ignored caveman."
- **Quality (coding family)** — the three objective KPIs from [FRAMEWORK.md](../../FRAMEWORK.md): diff minimality, regression-free, lint/format clean. Here they answer a sharper question: *does compressing the agent's reasoning degrade the code it writes?* For chat tasks, the fact-checklist is the quality measure. LLM-judge deferred.

## Harness

Shared promptfoo harness ([FRAMEWORK.md](../../FRAMEWORK.md)) via `experiments/caveman/promptfooconfig.yaml`:

- **Toggle type:** `system_instruction`.
- **arms:** `baseline` (no injected instruction) and `treatment` (`system_instruction_file: prompts/caveman.md`).
- **providers:** the three models via the opencode provider; Serena off everywhere.
- **tests:** the 5 coding tasks (build/test gate asserts) + 5 chat tasks (fact-checklist asserts), tagged `family=coding|chat`.

Chat tasks need no `git` reset (read-only prose); coding tasks reset per the shared harness.

## Fairness controls

- Identical user prompts in both arms; only the agent system instruction differs.
- Serena OFF everywhere (isolate caveman).
- Fact checklists for chat tasks written and frozen **before** any runs.
- Same fixture and gates for coding as the Serena benchmark.
- Fixed sampling, documented; SGLang config printed.
- N=5 reported as rates; no significance claims.

## Known risks / limitations (disclosed)

- caveman is designed for Claude; injected as a prompt to local models it may underperform the native skill. We measure compliance and say so.
- Coding token savings may be near zero (hypothesis 2) — that is the finding, not a bug.
- Chat accuracy via fact-checklist is semi-objective; mitigated by predefined checklists, disclosed.
- Porting mechanism (system-prompt injection) is our choice, not caveman's intended Claude-skill path — stated plainly.

## Article (sovgrid.org, English)

Hook: "We tested the internet's favorite token-saving skill on local agents. Here is where it saves tokens, and where the 75% claim quietly disappears." Structure: hook → what caveman is + the claim → setup → methodology (+ repo) → results (chat vs coding, by model) + charts → compliance finding → verdict → honest limitations → links.

- Same blog rules as Serena article (no em-dash, anti_ai_patterns, prepublish-check.sh, a11y, crosslinks). Crosslink to the Serena article (paired series).
- Mandatory links: caveman skill page on claudemarketplaces.com, the skills directory, the fixture repo.
- Privacy: Stef/cipherfox/Tor leak grep before push/publish.

## Out of scope (YAGNI)

- No significance testing.
- No tuning of the caveman prompt; use it as published.
- No comparison against other compression skills (single-skill focus).
