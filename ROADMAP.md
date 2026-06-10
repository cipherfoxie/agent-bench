# agent-bench — Roadmap & scope

> **Design history.** This document is the original design. The implemented harness became a lean direct Node runner (see `README.md` + `runner/`) instead of the promptfoo integration sketched here; final methodology and numbers live in `results/` and the published articles.

**Date:** 2026-06-09

## Decisions

- **Tool set:** curated coding-relevant Top tools (not literal Top-10 — integration MCPs that need external services/credentials are out of scope for the coding harness).
- **Articles:** hybrid **pillar + spokes** — one leaderboard/methodology pillar article, deep-dive spoke articles for the high-story tools, cross-linked.
- **Run intensity:** **tiered** — broad sweep (fewer tasks, N=3) across the set, deep dives (full tasks, N=5/10) on the 2-3 story tools.

## Why the harness already absorbs this

Each tool = one promptfoo experiment YAML (`experiments/<tool>/`). No new harness code. The generic provider's three toggle types (`mcp_servers`, `system_instruction`, `model_settings`) cover MCPs and skills alike.

## Curated set + benchmarkability (honest flags)

Tier "deep" = full task suite + N=5/10 + spoke article. Tier "sweep" = reduced tasks + N=3 + leaderboard row.

| Tool | Kind | Tier | Benchmarkable with current refactor/coding tasks? |
|---|---|---|---|
| Serena | MCP | deep | Yes — spec done (`experiments/serena/`). |
| caveman | skill | deep | Yes — spec done (`experiments/caveman/`). |
| Desktop Commander | MCP | sweep | Yes — overlaps opencode's native file/terminal tools; good "does it add anything" test. |
| Claude Flow | MCP | sweep | Verify first — heavy agent-orchestration; confirm it toggles cleanly in opencode before committing. |
| frontend-design | skill | sweep | Needs a **frontend task family** (build/modify a component) + leans on quality KPIs; design quality is partly subjective. Follow-on task family. |
| vercel-react-best-practices | skill | sweep | Needs a **React/Next task family**. Follow-on. |
| tdd | skill | sweep | Borderline — process skill; objective measurement is hard (would need bug-fix tasks scoring test-first behavior). Evaluate later. |
| skill-creator | skill | drop? | Meta (creates skills) — does not fit a coding-task harness. Likely drop, or special-case. |

**Implication:** the refactor/coding task suite (Plan 1's family) cleanly covers Serena, caveman, Desktop Commander, Claude Flow. The design/React skills (frontend-design, vercel-react-best-practices) require a **second task family** — a separate follow-on plan. tdd and skill-creator are parked pending a fair measurement design.

## Build order

1. **Plan 1 (written):** harness core, proven on one TS refactor task. Foundation.
2. **Plan 2:** full refactor/coding task suite (5 tasks, TS+Rust+Python) + runner GPU-loop + charts.
3. **Plan 3:** deep-dive runs Serena + caveman → data → two spoke articles + pillar skeleton.
4. **Plan 4:** sweep tier (Desktop Commander, Claude Flow) → leaderboard rows in pillar.
5. **Plan 5 (later):** frontend/React task family → frontend-design + vercel-react-best-practices spokes.
6. **Pillar article** assembled last, cross-linking all spokes.

## Article cluster

- **Pillar:** "Benchmarking Claude Code's top coding tools on self-hosted LLMs — methodology + leaderboard" (sovgrid.org, English). Holds the methodology, the full results table, links to every spoke.
- **Spokes (deep):** Serena, caveman, (later) frontend-design. Each: full data, charts, verdict, links to GitHub/marketplace + back to pillar.
- Rules per existing blog discipline: no em-dash, anti_ai_patterns, prepublish-check.sh, a11y, bidirectional crosslinks, operator-identity leak grep before publish.
- Mandatory links across the cluster: each tool's claudemarketplaces.com page + its GitHub/source + the agent-bench repo.

## Cost guardrail

Tiered runs keep GPU time sane. The sweep tier (N=3, reduced tasks) blocks the prod LLM far less than a full matrix on every tool. Run model-grouped (`switch.sh`), concurrency 1.
