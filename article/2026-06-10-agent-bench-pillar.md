---
title: "agent-bench: stop trusting install counts, start measuring your agent's tools"
description: "I built a small, dependency-free harness that answers one question with numbers instead of vibes: does this enhancement make my agent measurably better, on my models, on my tasks? Here is the method, what I found, and why deterministic gates are the whole point."
date: 2026-06-10
tags: ["strategy", "agents", "engineering-honesty", "opencode"]
quality:
  score: 230.0
  style: "technical_analysis"
  content_class: "Durable"
  word_count: 891
  code_blocks: 1
  version_refs: 0
  file_paths: 0
---

# agent-bench: stop trusting install counts, start measuring your agent's tools

The agent-tool ecosystem has a measurement problem. MCP servers and skills are ranked by install counts and star counts, their READMEs make quantified claims ("75% token savings", "surgical semantic edits"), and the evidence behind those claims is usually a demo GIF. Meanwhile you are deciding whether to wire one of these things into the agent that edits your code.

I wanted a different basis for that decision, so I built [agent-bench](https://github.com/cipherfoxie/agent-bench): a small, dependency-free harness that answers one question with numbers instead of vibes. **Does this enhancement make my agent measurably better, on my models, on my tasks?**

## The method in one paragraph

Every experiment is an A/B: the agent runs the same task with the enhancement (treatment arm) and without it (baseline arm), N times each, on each model you care about. Success is decided by deterministic gates: the project type-checks, the rename actually happened, the answer contains the frozen list of required facts. No LLM grades another LLM anywhere. Per run it records tool calls, input and output tokens, wallclock, and for code edits three quality KPIs: how minimal the diff is against a reference patch, whether the full project still builds (not just the target), and whether the edit introduced lint violations. Raw JSONL for every published number lives in the repo.

## Why deterministic gates are the whole point

The single most important thing the first benchmark found would be invisible to any LLM-judged eval: a weaker local model, asked to rename `UserRepository.save` while leaving the unrelated `Logger.save` alone, did a global text-replace every single time, and **the broken result compiled and linted clean**. A CI pipeline would have shipped it. An LLM judge reading the diff might have praised its consistency. Only a gate that knows the *intent* (this symbol, not that one) catches it. That finding alone changed how I route tasks to models on my own stack.

## What it is not

agent-bench is not an academic benchmark and does not want to be one. [MCP-Bench](https://github.com/Accenture/mcp-bench) and friends measure how well models use MCP tools in general, against fixed task suites, mostly on frontier APIs. Useful for model comparisons, useless for the question "should *I* install *this*". agent-bench is also not a leaderboard of models: it compares arms within a model, so every conclusion is about the enhancement, not about which model is smarter. And it is deliberately small: a few hundred lines of Node with zero runtime dependencies, because a benchmark you cannot audit in fifteen minutes is just another claim.

## What it has measured so far

Two case studies, both fully written up:

**[Serena](/blog/serena-local-benchmark/)** (semantic code tools, MCP): a strong local model gained nothing on refactor tasks and paid 15-158% more input tokens for the privilege. The weak model was not fixed by it either, but its failure mode changed from "confidently wrong and it compiles" to "incompletely right", which is a real safety difference. Verdict: SITUATIONAL, a guardrail rather than a turbo.

**[caveman](/blog/caveman-local-benchmark/)** (token-compression skill): claims ~75% savings, measured -31% on local models and -33% best-case on Claude, +18% on Fable 5 (it speaks fluent caveman and uses the saved words to say more things), and in measured dollars it was never cheaper on any model, because the injected instruction is billed on every request. Verdict: SKIP.

Both write-ups follow the same template: a verdict box up top (ADOPT / SITUATIONAL / SKIP, install-if, skip-if, cost, and a mandatory "Do I run it myself?" disclosure), then methodology, results, limitations, and a reproduce section. Negative results ship with the same prominence as positive ones. That is the series contract.

## Benchmark hygiene, learned the hard way

One result in the caveman matrix initially showed the skill rescuing the weak model on the hardest task, three out of three. It was an artifact: a health-check timer had resurrected an idle model mid-benchmark, both engines fought over unified memory, and the runs degraded. The clean rerun showed zero out of three. The contaminated data was deleted, the rerun is the published number, and the incident is documented. If your benchmark infrastructure can lie to you, it eventually will; the method has to include noticing.

## Run it on your stack

The harness needs Node 22, git, and [opencode](https://opencode.ai) with your models configured as providers. Point `MODELS` at your provider ids, smoke one run, then run a matrix. Adding a new MCP server or skill to test is one entry in a config file, no harness changes. The repo's `AGENTS.md` is a contract for AI agents working on the codebase itself, and the README documents the two opencode footguns that cost me a night so they do not cost you one.

```bash
git clone https://github.com/cipherfoxie/agent-bench && cd agent-bench && npm install
node runner/smoke.js baseline <provider/model> ts-rename
EXPERIMENT=serena ARMS=baseline,serena TASK_NAME=ts-ambiguous N=5 node runner/bench.js
```

If you benchmark something from the ecosystem's top charts with it, I would genuinely like to see the numbers, especially if they disagree with mine.

## What is next in the series

The two case studies so far cover the top of the Claude marketplace skills and MCP directories at the time of writing. The series continues through the charts in the same format: one tool at a time, same harness, same verdict scale, no skipping negative results.

Candidates on the list: memory MCPs (persistent context across sessions), browser automation MCPs (tools that give agents a real browser), and a few skills that make bolder efficiency claims than caveman did. The question is always the same: does this thing actually help on the tasks I run, or is the install count doing the marketing?

If you benchmark something from the top charts before I do and want to submit numbers, the harness is generic and the AGENTS.md explains the contract. Open an issue or PR on the repo.

---

*This is the pillar of the **agent-bench** series. Spokes so far: [Serena](/blog/serena-local-benchmark/), [caveman](/blog/caveman-local-benchmark/). The repo: [github.com/cipherfoxie/agent-bench](https://github.com/cipherfoxie/agent-bench). Follow via RSS or Nostr.*
