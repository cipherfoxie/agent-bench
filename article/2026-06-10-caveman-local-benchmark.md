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
| **Verdict** | SKIP for self-hosted agents — measured savings are a third of the claim, and short answers get net *more* expensive |
| **Install if** | you mostly generate long-form prose answers (1k+ tokens) and want them shorter and faster |
| **Skip if** | you run a local model (already terse), or your agent mostly does coding work (tokens live in tool I/O, not prose) |
| **Cost** | zero setup, but the injected instruction adds ~1,000 input tokens to every single request |
| **Do I run it?** | No — the math only works against verbose baselines, and my local models do not have one. |

## What it is

A communication-style skill: a single prompt that instructs the model to answer in compressed, article-free, filler-free fragments while keeping code, identifiers, and error strings exact. Source: [JuliusBrussee/caveman](https://github.com/JuliusBrussee/caveman), `skills/caveman/SKILL.md`. Vendor claim: "Cuts token usage ~75% by speaking like caveman while keeping full technical accuracy."

## How I tested it

Same harness as the [Serena benchmark](2026-06-10-serena-local-benchmark.md): opencode headless on a DGX Spark, Qwen3.6-35b (vLLM) and Mistral-Small-4 (SGLang), baseline arm vs caveman arm, N=3 per cell. The skill text is injected verbatim as `AGENTS.md` into the agent's working directory, which opencode honors as project rules (verified with a canary instruction first). Two task families: three chat questions scored against frozen fact checklists (TCP handshake, chmod 750, ACID), and two coding tasks with deterministic build gates, including the ambiguous-rename task that separates careful agents from text-replacers. Harness and raw data: [agent-bench](https://github.com/cipherfoxie/agent-bench).

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

## Where it helps, where it does not

**The style itself works.** Both models comply, the answers read like terse engineering notes, and not a single checklist fact was lost. Accuracy survives the compression, exactly as advertised.

**The number does not.** Measured reduction is −31%, not 65-75%. The reason is simple: self-hosted models are already terse. Mistral answered the chmod question in 27 tokens at baseline. You cannot cut two thirds of fluff that is not there. The headline numbers were presumably measured against a verbose frontier-default style, where there is far more to delete.

**Short answers get more expensive, not cheaper.** The skill text rides along as ~1,000 input tokens on *every* request. A chat answer that saves 50-100 output tokens but pays 1,000 input tokens is a net loss. The economics only flip positive when the baseline answer is longer than the instruction itself, roughly 1k+ tokens of prose. Latency did improve a little (5-15%), because decoding fewer output tokens dominates wall time.

**Coding gains nothing.** In agentic work the tokens live in tool schemas, file contents, and diffs, not in the model's prose. On Qwen, caveman actually made the simple refactor *worse*: +53% tool calls, +24% input tokens, as if the compressed reasoning fragmented the work into more steps. And the skill changes nothing about capability: the weak model fails the ambiguous rename 0/3 with or without it, clobbering an unrelated method that happens to share a name.

## Do I run it myself?

No. I tested it because 200k installs deserve a number, and the number is −31% with a 1k-token surcharge per request. On my stack, where the models are already terse and most agent tokens are tool I/O, it is a net loss. If I were paying per token against a verbose frontier API for long-form chat, I would test it there before dismissing it — that experiment (sonnet, opus, fable via the same harness) is prepared and queued.

## Limitations

N=3 per cell, three chat prompts, TypeScript-only coding fixtures, two local models. The skill was injected as an opencode `AGENTS.md` rather than through Claude Code's native skill loader, which is the honest way to run it on a local agent but not the environment it was designed for. The 65-75% claim may well hold on verbose frontier models; that test is pending.

## Reproduce it

Repo: [agent-bench](https://github.com/cipherfoxie/agent-bench). Raw runs: `results/runs-caveman-final.jsonl`, summaries in `results/`. The skill prompt used: `prompts/caveman.md` (verbatim from upstream @073d6bb).
