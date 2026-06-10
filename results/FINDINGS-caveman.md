# Findings — caveman skill on local models (2026-06-10)

60 clean runs (qwen half + full mistral redo after the healthcheck contamination). caveman SKILL.md (verbatim, @073d6bb) injected as AGENTS.md; baseline = no instruction. 3 chat tasks (frozen fact checklists) + 2 coding tasks, N=3.

## Chat: compression is real, but a third of the claim — and net-negative for short answers

Output tokens, baseline → caveman (pooled per model):

| model | baseline out | caveman out | reduction | facts intact |
|---|---|---|---|---|
| Qwen3.6 | 444 (3 tasks) | 305 | **−31%** | 100% both arms |
| Mistral-Small | 232 | 160 | **−31%** | 100% both arms |

- The style works: both models comply, answers stay factually complete (every checklist passed).
- **But the claim is ~75% (repo README says 65%); we measure −31%** on local models. Local models are already terse — Mistral answered the chmod question in **27 tokens at baseline**; there is little fluff left to cut. The 65-75% numbers were presumably measured against a verbose frontier-default style.
- **The hidden cost:** the injected instruction adds ~+1,020 input tokens to *every* request. For short chat answers (100-200 tokens), caveman saves ~50-100 output tokens but pays ~1,000 input tokens: **net token consumption goes UP**, not down. It only nets positive when the baseline answer is longer than the instruction (~1k+ tokens). Latency still improves slightly (5-15%), because decode dominates wall time and outputs are shorter.

## Coding: no benefit, sometimes worse — and it does not rescue the weak model

| model | task | arm | success | tools | tokens-in | wall s |
|---|---|---|---|---|---|---|
| Qwen3.6 | ts-rename | baseline | 100% | 10.0 | 89k | 21.5 |
| Qwen3.6 | ts-rename | caveman | 100% | **15.3** | **111k** | 26.6 |
| Qwen3.6 | ts-ambiguous | baseline | 100% | 16.0 | 125k | 30.3 |
| Qwen3.6 | ts-ambiguous | caveman | 100% | 16.3 | **153k** | 30.1 |
| Mistral-S | ts-rename | baseline | 100% | 12.3 | 113k | 43.5 |
| Mistral-S | ts-rename | caveman | 100% | 9.0 | 116k | 38.3 |
| Mistral-S | ts-ambiguous | baseline | **0%** | 25.0 | 221k | 93.2 |
| Mistral-S | ts-ambiguous | caveman | **0%** | 23.3 | 147k | 66.9 |

- Success unchanged everywhere: qwen stays perfect, **Mistral still fails the ambiguous rename 0/3 with caveman** (still clobbers `Logger.save`, 8 files instead of 4). The contaminated first run had shown 3/3 — the clean redo proves that was an artifact of the dual-residency incident, not a real effect. This is why we redid it.
- On qwen, caveman made coding *worse*: +53% tool calls and +24% input tokens on ts-rename (terse reasoning seems to fragment its work into more steps).
- Hypothesis 2 from the spec is confirmed and then some: in agentic coding, tokens live in tool I/O and file content, not in prose — compressing the prose does not move the needle, and the injected instruction adds cost to every step.

## Verdict

> caveman does what it says stylistically — local models comply and stay accurate — but the economics only work for long-form chat. Measured savings are −31% of output tokens, not 65-75%, because self-hosted models are already terse. For short answers the ~1k-token instruction costs more than it saves. In agentic coding it saves nothing and can add steps. And it does not change what a model can or cannot do: the weak model fails the ambiguous refactor with or without it.

Open follow-up (runner prepared, not yet run): the same A/B on Claude models (sonnet/opus/fable) via `runner/claude-chat.js` — where the verbose-default baseline should give caveman much more headroom, possibly vindicating the 65-75% claim in its home environment.

## Provenance

- Raw: `results/runs-caveman-final.jsonl` (30 qwen + 30 mistral clean rows; contaminated mistral half discarded, see `results/NIGHT-REPORT.md` + healthcheck finding in the sovereignty audit).
- Summary: `results/summary-caveman-final.{md,json}`. Skill source: `JuliusBrussee/caveman` skills/caveman/SKILL.md @073d6bb (claims ~75%; repo README claims 65%).
- Injection mechanism: AGENTS.md in workdir (verified; opencode project `opencode.json` `instructions` is not honored).

## Addendum 2026-06-10: Claude A/B (54 runs, runner claude-chat.js)

| model | baseline out | caveman out | Δ | cost base | cost caveman |
|---|---|---|---|---|---|
| Sonnet 4.6 | 119 | 82 | −31% | $0.187 | $0.196 |
| Opus 4.8 | 454 | 307 | −33% | $0.554 | $0.555 |
| Fable 5 | 301 | 355 | **+18%** | $1.087 | $1.178 |

All 54 runs passed the fact checklists. Best case −33% (Opus). Fable complies with the style but compensates with extra substance → longer. **Measured dollar cost: caveman never cheaper on any Claude model** (instruction billed every request). The 65-75% claim materialized on none of five models across two worlds.
