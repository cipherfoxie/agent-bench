# Findings — Serena vs baseline, task `ts-rename` (2026-06-10)

First real data from the agent-bench harness. One task (cross-file function rename in a 3-file TypeScript project), 2 local models, 2 arms, N=5 → 20 runs, all completed.

## Results

| model | arm | success | mean tool-calls | mean tokens-in | mean tokens-out | mean wall (s) | files changed | lines changed | regression-free | lint-clean |
|---|---|---|---|---|---|---|---|---|---|---|
| Qwen3.6-35b | baseline | 100% | 10.8 | 75,628 | 696 | 19.6 | 3 | 10 | 100% | 100% |
| Qwen3.6-35b | serena | 100% | 16.2 | 195,171 | 1,000 | 34.5 | 3 | 10 | 100% | 100% |
| Mistral-Small-4 | baseline | 100% | 9.6 | 99,286 | 409 | 45.8 | 3 | 10 | 100% | 100% |
| Mistral-Small-4 | serena | 100% | 9.6 | 149,351 | 440 | 51.5 | 3 | 10.2 | 100% | 100% |

## Findings

1. **No success benefit.** Both models rename correctly 100% of the time with or without Serena. The task is well within native-tool capability, so Serena cannot improve an already-perfect success rate.
2. **No diff-quality benefit.** All arms produce the same minimal, surgical patch (3 files / 10 lines = the reference minimum). Serena's symbol-level "surgical edit" pitch does not show up because the baseline is already minimal on a task this small.
3. **Large token tax.** Serena inflates input tokens substantially — Qwen +158% (75k→195k), Mistral +50% (99k→149k) — because Serena's tool schemas bloat every request's context.
4. **More tool calls, not fewer (Qwen).** Serena raised mean tool-calls on Qwen (10.8→16.2) and was neutral on Mistral. This contradicts the "collapse 8-12 steps into one atomic call" claim *on this task*.
5. **Slower.** Serena added wallclock everywhere (Qwen +76%), tracking the extra tokens.
6. **Model aside:** Mistral-Small-4 is markedly slower than Qwen3.6 here (45.8s vs 19.6s baseline) and needs a 4096 output cap to fit its 32,768 context.

## Honest caveat (sets up the next phase)

`ts-rename` is an **easy** task in a **tiny** repo. Serena's value proposition is large/complex codebases where native grep+read degrade. This task does not exercise that. So the correct reading is **not** "Serena is useless" but "on an easy refactor, Serena is pure overhead with a token tax." Whether it pays off on harder tasks / bigger repos is the open question — which motivates the fuller multi-task, multi-language suite (follow-up).

## Provenance

- Harness: `runner/bench.js` (opencode headless, stdin-fixed, OPENCODE_CONFIG arm isolation), `runner/aggregate.js`.
- Raw: `results/runs.jsonl` (20 rows). Summary: `results/summary.json` / `summary.md`.
- Serena: `serena-agent` 1.5.3 via `uv tool install` + `serena init`, MCP context `ide-assistant`. The agent verifiably used `serena_rename_symbol` / `serena_replace_content`.
- Models: `local-qwen/qwen3.6-35b` (:30001), `local-sglang/Mistral-Small-4` (:30000, output capped 4096). GPU mutex via the GPU-mutex script, prod model restored after.
- N=5; rates reported, no significance claims.
