---
title: "Does Serena help a self-hosted coding model? I benchmarked it"
status: DRAFT, review + leak-grep + prepublish-check before deploy
target: sovgrid.org (spoke article)
---

# Does Serena help a self-hosted coding model? I benchmarked it

[Serena](https://github.com/oraios/serena) is one of the most-installed coding MCP servers on the [Claude marketplace directory](https://claudemarketplaces.com/mcp/oraios/serena). It gives an agent symbol-level tools: rename a symbol, find its references, edit it by name instead of by line. The pitch is that semantic, language-server-backed edits beat grep-and-replace.

I run my coding agents against self-hosted models on a DGX Spark, not against a frontier API. So the interesting question for me is not "is Serena good," it is "does Serena help a *local* model, or does it mostly help a strong model that already navigates code well?"

I measured it. The short answer is more interesting than yes or no.

## Verdict at a glance

| | |
|---|---|
| **Verdict** | SITUATIONAL — a guardrail for weak models, overhead for strong ones |
| **Install if** | your agent runs on a smaller model that has to do multi-file refactors, and a silently wrong edit would hurt you |
| **Skip if** | your daily driver is a capable model (Qwen3.6-class or better); it solved every task, including the ambiguous one, without Serena |
| **Cost** | one `uv tool install` + `serena init`; measured +15-158% input tokens on tasks the model could already do |
| **Do I run it?** | No — installed for this benchmark, not wired into my daily agent. My model did not need it. I would revisit the day I depend on a weaker model for code edits. |

## Setup

Everything runs locally. The agent is [opencode](https://opencode.ai) in headless mode, driving two models served on the Spark:

- **Qwen3.6-35b** (the strong one), via vLLM.
- **Mistral-Small-4** (the weaker one), via SGLang, output capped to 4096 tokens to fit its 32,768 context.

Each task runs in two arms: **baseline** (opencode's native tools: grep, read, edit, bash) and **serena** (the same, plus the Serena MCP, installed with `uv tool install serena-agent` and the `ide-assistant` context). The agent's working directory is a throwaway git copy of a fixture, so every run starts clean and I can diff the result.

For each run I record success against a deterministic gate, tool calls, input and output tokens, wallclock, and how many files and lines changed. Five repetitions per cell on the easy task, three on the harder ones. These are rates, not significance tests.

The harness and fixtures are in the repo: [agent-bench](https://github.com/cipherfoxie/agent-bench).

## Three tasks, increasing nastiness

1. **ts-rename**: rename a function used in two files. A `sed` one-liner would do it.
2. **ts-callers**: rename a function used across sixteen files. Still mechanical.
3. **ts-ambiguous**: rename the `save` method of a `UserRepository` class to `persist`, and leave the unrelated `Logger.save` method completely alone. This is the one that matters. A global text replace gets it wrong.

The third task is the real test of Serena's pitch. The name `save` exists on two different classes. Renaming the right one needs you to know which symbol you are touching. Text-replace does not.

## The mechanical tasks: Serena is overhead

On ts-rename and ts-callers, both models succeed with or without Serena, because the native tools already produce the minimal correct patch. Serena does not improve success or diff quality. It adds tokens, because its tool schemas bloat every request.

ts-rename (N=5), input tokens:

| model | baseline | serena |
| --- | --- | --- |
| Qwen3.6 | 75,628 | 195,171 (+158%) |
| Mistral-Small | 99,286 | 149,351 (+50%) |

Same 100% success in every cell, same surgical 3-files / 10-lines patch in every cell. On a task this size, Serena is a tax you pay for nothing. On the sixteen-file bulk rename it trimmed Qwen's tool calls slightly (44 to 39) but the picture is the same: no success or quality benefit.

If your refactor is something `sed` could do, Serena is not earning its context window.

## The ambiguous task: this is where it gets interesting

Here are the numbers that made the whole exercise worth it (N=3):

| model | arm | success | mean tools | mean tokens-in | files changed | failure mode |
| --- | --- | --- | --- | --- | --- | --- |
| Qwen3.6 | baseline | 100% | 15.7 | 146,708 | 4 (correct) | none |
| Qwen3.6 | serena | 100% | 13.0 | 151,871 | 4 (correct) | none |
| Mistral-Small | baseline | **0%** | 24.0 | 313,080 | **8** | clobbered Logger, 3 of 3 |
| Mistral-Small | serena | **33%** | 11.0 | 152,721 | 1.7 | 1 correct, 2 incomplete |

Three things fall out of this.

**The strong model does not need Serena.** Qwen3.6 got the ambiguous rename right every single time with plain grep and edit. It worked out on its own that `Logger.save` was a different symbol and left it alone. Serena changed nothing about its success, trimmed a couple of tool calls, and was sometimes faster. Marginal.

**The weak model with native tools is confidently wrong, and it compiles.** Mistral-Small failed the ambiguous task zero times out of three. Every time, it did a global rename and clobbered the unrelated `Logger.save` (eight files changed instead of four). The part that should worry you: the broken result type-checks and lints clean. My regression and lint gates passed on code that was semantically wrong. A normal CI that runs `tsc` and a linter would have shipped it. The dangerous failure here is not a crash, it is a green build on broken code.

**Serena does not make the weak model reliable. It changes how it fails.** With Serena, Mistral went from zero to one out of three. The global clobber disappeared (mean files changed dropped from eight to under two, and the "Logger got renamed" failure stopped happening). But then Mistral tended to under-apply the rename and miss call sites. Serena moved it from *confidently wrong* to *incompletely right*. That is a safety improvement, not a reliability improvement.

One more nuance on cost: on this task the token tax inverted. Baseline Mistral thrashed (24 tool calls, 313k input tokens) while the Serena run was more directed (11 calls, 153k). When the native approach flails, Serena can actually be cheaper.

## Verdict

Serena does not turn a weak local model into a strong one. On easy and mechanical refactors it is pure overhead with a token tax. Its one real benefit showed up exactly where its own pitch says it should, an ambiguous symbol that text-replace gets wrong, and even there it only stopped the weak model from confidently breaking unrelated code that still compiles. It did not make that model reliably correct. A capable model needs none of it.

If you run a strong local model, you probably do not need Serena for refactors it can already reason through. If you run a weaker one, Serena is less a capability boost and more a guardrail against silent, compiling, semantically-wrong edits. That guardrail might still be worth it, because a green build on broken code is the expensive kind of bug.

## Do I run it myself?

No. I installed Serena for this benchmark (`uv tool install serena-agent`, `serena init`, wired into opencode as a per-run MCP), and the integration was painless. But my daily agent runs on Qwen3.6, and the data says that model gains nothing from it on refactor work, while every request pays the schema overhead. So it is not part of my stack today. Two things would change my mind: having to rely on a smaller model for agentic edits (then Serena is the guardrail against the compiles-but-wrong failure mode), or working in codebases large enough that native grep-and-read stops scaling. I will rerun this benchmark when either happens.

## Limitations

This is one language (TypeScript), small fixtures, and N of three to five, so read it as rates and direction, not as significance. The "weak" model is Mistral-Small at around 24B, not a tiny 8B that would likely fail harder. Serena was applied as designed; where the weak model failed with it, that is partly the model misusing the tools, not purely Serena. And these are self-hosted models on a DGX Spark, not frontier APIs.

The harness is generic. Pointing it at another MCP or another skill is a config file, not new code, so the same method extends to the next tool worth checking.

## Reproduce it

Repo: [agent-bench](https://github.com/cipherfoxie/agent-bench). Serena: [github.com/oraios/serena](https://github.com/oraios/serena), [marketplace listing](https://claudemarketplaces.com/mcp/oraios/serena). Raw runs and per-task summaries are under `results/`.
