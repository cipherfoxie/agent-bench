# Tool-Benchmark Article Template (sovgrid.org series)

Every agent-bench article follows this exact structure so the series is recognizable, comparable, and fast to produce. English, no em-dash, anti_ai_patterns, prepublish-check gates apply.

## Standard verdict scale

- **ADOPT** — clear net benefit for the stated audience, I run it myself.
- **SITUATIONAL** — benefit exists but only under conditions; the box says exactly which.
- **SKIP** — measured cost exceeds measured benefit for the stated audience.

## Required structure

```markdown
---
title: "<Tool>: <one-line question the benchmark answers>"
series: agent-bench
---

# <Title>

<1-2 paragraph hook: what the tool claims, why a self-hoster should care.>

## Verdict at a glance

| | |
|---|---|
| **Verdict** | ADOPT / SITUATIONAL / SKIP — <one-line qualifier> |
| **Install if** | <concrete persona/condition> |
| **Skip if** | <concrete persona/condition> |
| **Cost** | <setup effort + measured token/latency overhead> |
| **Do I run it?** | Yes/No — <one honest sentence> |

## What it is

<2-4 sentences + links: GitHub, marketplace listing, install command. State the vendor's claim verbatim with a number if they make one.>

## How I tested it

<Standard harness paragraph: opencode headless on DGX Spark, models, arms, N, deterministic gates. Link agent-bench repo. One sentence per deviation from the standard setup.>

## Results

<The standard tables: success / tool-calls / tokens / wallclock per model × arm. Quality KPIs for coding tasks. One table per task family, no more than three.>

## Where it helps, where it does not

<The honest split. Lead with the strongest finding either way.>

## Do I run it myself?

<First person, specific: installed where, kept or removed after the benchmark, what would change my mind. This is the trust section — never skip it.>

## Limitations

<N, languages, fixture size, model selection, anything a critic would raise first.>

## Reproduce it

<Repo link, exact commands, raw data location.>
```

## Rules

1. The verdict box comes **before** any methodology. Readers who leave after 10 seconds must leave with the recommendation.
2. "Do I run it?" is mandatory and honest — including "installed only for this benchmark, removed afterwards."
3. Numbers in the verdict box must appear again in Results — no box-only claims.
4. A negative or null result is published with the same template. The series' value is honesty, not advocacy.
5. Every article links: tool GitHub + marketplace page + agent-bench repo + the previous article in the series (bidirectional crosslinks).
