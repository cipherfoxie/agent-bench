# Verdict — Does Serena help local coding agents? (2026-06-10)

Three tasks, two local models (Qwen3.6-35b, Mistral-Small-4), baseline (opencode native tools) vs Serena MCP. The strong/weak split is the story.

## The three tasks

| task | what | size |
|---|---|---|
| ts-rename | rename a function used in 2 files | 3 files, easy |
| ts-callers | rename a function used across 16 files | 16 files, bulk |
| ts-ambiguous | rename `UserRepository.save`→`persist` WITHOUT touching the unrelated `Logger.save` | 10 files, a trap |

The first two are mechanical (a `sed` would do it). The third is the real test: a name that text-replace gets **wrong**.

## Headline numbers

ts-ambiguous (N=3), the differentiating task:

| model | arm | success | mean tools | mean tokens-in | files changed | failure mode |
|---|---|---|---|---|---|---|
| Qwen3.6-35b | baseline | 100% | 15.7 | 146,708 | 4 (correct) | — |
| Qwen3.6-35b | serena | 100% | 13.0 | 151,871 | 4 (correct) | — |
| Mistral-Small-4 | baseline | **0%** | 24.0 | 313,080 | **8** | global-renamed, clobbered Logger ×3 |
| Mistral-Small-4 | serena | **33%** | 11.0 | 152,721 | 1.7 | 1 correct, 2 incomplete |

ts-rename and ts-callers (mechanical): every cell ~100% on Qwen, both arms; Serena adds a 15-158% **token tax** and at best a marginal tool-call reduction. No success or diff-quality benefit, because native tools already produce the minimal correct patch.

## Findings

1. **A strong model does not need Serena.** Qwen3.6 navigated the ambiguous rename correctly 100% of the time with plain grep/read/edit — it left `Logger.save` alone on its own. Serena left success unchanged, trimmed tool-calls slightly, and was sometimes faster, but the effect is marginal.

2. **A weak model + native tools is "confidently wrong, and it compiles."** Mistral-Small failed the ambiguous task **0/3** — every time it did a global rename that clobbered the unrelated `Logger.save` (8 files changed instead of 4). Critically, the broken result **type-checks and lints clean** (regression-free 100%, lint-clean 100%). A naive build/lint CI gate would ship silently-wrong code. This is the most important result in the whole benchmark, and it is about the *failure mode*, not Serena.

3. **Serena does not make a weak model reliable — it changes its failure mode.** With Serena, Mistral went 0/3 → 1/3. The dangerous global-clobber disappeared (mean files-changed 8 → 1.7, no more LOGGER_CLOBBERED), but Mistral then tended to *under*-apply the rename (missed call sites). Serena shifts the weak model from **"confidently wrong" to "incompletely right"** — a safety gain, not a reliability gain.

4. **The token tax is real but situational.** On the mechanical tasks Serena's tool schemas inflate input tokens (Qwen +15-158%). But on the ambiguous task where the weak baseline *thrashed* (24 tools, 313k tokens), Serena was actually cheaper (11 tools, 153k) by being more directed.

## Bottom line

> Serena does not turn a weak local model into a strong one. On easy/mechanical refactors it is pure overhead with a token tax. Its one real value showed up exactly where its pitch says it should — an ambiguous symbol that text-replace gets wrong — and even there it only stopped the weak model from *confidently breaking unrelated code that still compiles*, without making it reliably correct. A capable model needs none of this.

## Honest limitations

- N=3-5; rates, not significance. One language (TS), small fixtures. `serena-agent` 1.5.3, opencode headless, context `ide-assistant`.
- Serena is applied as designed (MCP); the weak model often *misused* its tools — partly a model limitation, not purely Serena's.
- The "weak" model (Mistral-Small-4, ~24B) is not tiny; an 8B would likely fail harder. Capped to 4096 output for its 32k context.
- These are local self-hosted models on a DGX Spark, not frontier APIs.

## Data

`results/runs-{ts-rename,ts-callers,ts-ambiguous}.jsonl`, `summary-*.md/json`. Harness: `runner/`. Reproducible per `README` (to write).
