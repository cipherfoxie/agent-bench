---
title: "caveman: does the 75% token-saving skill survive contact with a self-hosted model?"
series: agent-bench
status: DRAFT, review + leak-grep + prepublish-check before deploy
target: sovgrid.org (spoke article)
---

# caveman: does the 75% token-saving skill survive contact with a self-hosted model?

[caveman](https://github.com/JuliusBrussee/caveman) is one of the most-installed skills in the [Claude skills directory](https://claudemarketplaces.com/skills): around 200k installs for the idea that your agent should talk like a smart caveman. Drop the articles, drop the pleasantries, keep the technical substance. The SKILL.md claims roughly 75% token reduction; the repo README says 65%.

I run my agents against self-hosted models, where every token is latency and energy rather than an API invoice. A skill that cuts output by two thirds would be worth real money on a frontier API and real seconds on my hardware. So I measured what it actually does on local models.

## Verdict at a glance

| | |
|---|---|
| **Verdict** | SKIP: best case −33% (not 65-75%), and in measured dollars it was never cheaper, on any model, local or Claude |
| **Install if** | you want terser answers for readability or latency, and you know the token math is not the reason |
| **Skip if** | you expect cost savings (the injected instruction ate them on every Claude model tested), you run a local model (already terse), or your agent mostly does coding work |
| **Cost** | zero setup, but the instruction rides along as ~1k input tokens on every request; on Fable 5 outputs got 18% *longer* |
| **Do I run it?** | No. I tested it on five models across two worlds, and the claimed savings did not show up in either. |

## What it is

A communication-style skill: a single prompt that instructs the model to answer in compressed, article-free, filler-free fragments while keeping code, identifiers, and error strings exact. Source: [JuliusBrussee/caveman](https://github.com/JuliusBrussee/caveman), `skills/caveman/SKILL.md`. Vendor claim: "Cuts token usage ~75% by speaking like caveman while keeping full technical accuracy."

## How I tested it

Same harness as the [Serena benchmark](2026-06-10-serena-local-benchmark.md): opencode headless on a DGX Spark, Qwen3.6-35b (vLLM) and Mistral-Small-4 (SGLang), baseline arm vs caveman arm, N=3 per cell. The skill text is injected verbatim as `AGENTS.md` into the agent's working directory, which opencode honors as project rules (verified with a canary instruction first). Two task families: three chat questions scored against frozen fact checklists (TCP handshake, chmod 750, ACID), and two coding tasks with deterministic build gates, including the ambiguous-rename task that separates careful agents from text-replacers. Harness and raw data: [agent-bench](https://github.com/cipherfoxie/agent-bench).

And because a skill written for Claude deserves to be measured on Claude, the same chat A/B also ran against three frontier models (Sonnet 4.6, Opus 4.8, Fable 5) through the Claude CLI in print mode, with the skill as an appended system prompt and exact token usage from the API response. Different harness than opencode, so I only compare within each model, never across the two worlds. If the token-saving claim has a home turf, this is it: verbose frontier defaults and per-token billing.

One run of this matrix had to be thrown away entirely: a health-check timer resurrected the idle model mid-benchmark and the two engines fought over unified memory. The numbers below are from the clean rerun. The contaminated data, for what it is worth, showed a dramatic caveman "win" that completely evaporated on clean hardware. Benchmark hygiene is not optional.

## Results

Chat, output tokens (pooled over the three questions):

| model | baseline | caveman | reduction | facts intact |
|---|---|---|---|---|
| Qwen3.6-35b | 444 | 305 | −31% | 100% / 100% |
| Mistral-Small-4 | 232 | 160 | −31% | 100% / 100% |

Coding (success / mean tool calls / mean input tokens):

| model | task | baseline | caveman |
|---|---|---|---|
| Qwen3.6 | ts-rename | 100% · 10.0 · 89k | 100% · 15.3 · 111k |
| Qwen3.6 | ts-ambiguous | 100% · 16.0 · 125k | 100% · 16.3 · 153k |
| Mistral-S | ts-rename | 100% · 12.3 · 113k | 100% · 9.0 · 116k |
| Mistral-S | ts-ambiguous | **0%** · 25.0 · 221k | **0%** · 23.3 · 147k |

### On Claude, where the skill was born

Chat, mean output tokens and measured cost per arm (9 calls each, all checklists passed):

| model | baseline out | caveman out | reduction | baseline cost | caveman cost |
|---|---|---|---|---|---|
| Sonnet 4.6 | 119 | 82 | **−31%** | $0.187 | $0.196 |
| Opus 4.8 | 454 | 307 | **−33%** | $0.554 | $0.555 |
| Fable 5 | 301 | 355 | **+18%** | $1.087 | $1.178 |

Two things jump out. First, the best case anywhere is −33%, on the most verbose model. Sonnet lands at −31%, the same number as both local models. The 65-75% claim did not materialize on any of the five models I measured.

Second, **Fable 5 got longer.** It is not ignoring the skill: its answers read like fluent caveman, articles dropped, fragments everywhere. It just spends the saved words on *more substance*: extra clarifications, an unprompted "why three steps" section. Stylistic compliance, inverted outcome. A sample, verbatim:

> TCP handshake establish connection, sync sequence numbers both sides: SYN (client send, pick ISN) ... Why three steps: both sides must prove can send AND receive. Two-way not enough.

And the column that settles the economics: **caveman was never cheaper in dollars.** The injected instruction is billed on every request, and on every Claude model it ate the output savings or worse. The one real benefit that survives measurement is latency (shorter answers decode faster) and, arguably, readability.

## Where it helps, where it does not

**The style itself works.** Both models comply, the answers read like terse engineering notes, and not a single checklist fact was lost. Accuracy survives the compression, exactly as advertised.

**The number does not.** Measured reduction is −31%, not 65-75%. The reason is simple: self-hosted models are already terse. Mistral answered the chmod question in 27 tokens at baseline. You cannot cut two thirds of fluff that is not there. The headline numbers were presumably measured against a verbose frontier-default style, where there is far more to delete.

**Short answers get more expensive, not cheaper.** The skill text rides along as ~1,000 input tokens on *every* request. A chat answer that saves 50-100 output tokens but pays 1,000 input tokens is a net loss. The economics only flip positive when the baseline answer is longer than the instruction itself, roughly 1k+ tokens of prose. Latency did improve a little (5-15%), because decoding fewer output tokens dominates wall time.

**Coding gains nothing.** In agentic work the tokens live in tool schemas, file contents, and diffs, not in the model's prose. On Qwen, caveman actually made the simple refactor *worse*: +53% tool calls, +24% input tokens, as if the compressed reasoning fragmented the work into more steps. And the skill changes nothing about capability: the weak model fails the ambiguous rename 0/3 with or without it, clobbering an unrelated method that happens to share a name.

## Do I run it myself?

No. I tested it because 200k installs deserve a number, and the number is −31% on my local models, −33% in the best case on Claude, +18% on Fable, with a 1k-token surcharge on every request that erased the dollar savings everywhere. I went in expecting the claim to hold at least on its home turf, verbose frontier models with per-token billing. It did not. What survives is a style preference: if you like terse answers and slightly lower latency, caveman delivers exactly that, accurately. That is a legitimate reason. It is just not the advertised one.

Verdict, in the skill's own dialect:

> Skill work. Style real, facts stay. Number wrong: claim 75, measure 31. Short answer? Pay MORE token. Fable? Talk caveman, say MORE thing, cost MORE. Code? No help, weak model still break wrong file. You like short answer, fine. You want save money, no.

## Limitations

N=3 per cell locally and per Claude cell, three chat prompts, TypeScript-only coding fixtures. On local models the skill was injected as an opencode `AGENTS.md`; on Claude as an appended system prompt via the CLI, not the native skill loader, so loader-specific behavior is untested. Single-turn measurements: in long cached sessions the instruction's input cost amortizes differently, though it is billed (cheaper, cached) on every turn there too. And the Fable result is one model version on one day; "complies with the style, compensates with substance" deserves a deeper look before anyone generalizes it.

## Reproduce it

Repo: [agent-bench](https://github.com/cipherfoxie/agent-bench). Raw runs: `results/runs-caveman-final.jsonl` (local) and `results/runs-caveman-claude-chat.jsonl` (Claude), summaries in `results/`. The skill prompt used: `prompts/caveman.md` (verbatim from upstream @073d6bb).

---

*Part of the **agent-bench** series: popular agent enhancements (MCP servers, skills, whatever promises to make your agent better), measured with deterministic gates instead of vibes. Same harness, same verdict scale (ADOPT / SITUATIONAL / SKIP), every result reproducible from the repo. Previous: [what Serena actually buys a self-hosted coding agent](2026-06-10-serena-local-benchmark.md). Follow via RSS or Nostr.*
