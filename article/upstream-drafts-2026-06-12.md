# Upstream feedback drafts (2026-06-12) — ALLE GEPOSTET ✅

| Draft | Posted |
|---|---|
| A vLLM | https://github.com/vllm-project/vllm/issues/43969#issuecomment-4694112813 (Kommentar auf existierendem Issue statt Duplikat) |
| B auto-round | https://github.com/intel/auto-round/issues/1919 (als Issue; Intel-Org blockt OAuth-Discussions) |
| C DFlash | https://github.com/z-lab/dflash/issues/135 |
| D Spark Arena | https://github.com/spark-arena/recipe-registry/issues/17 |
| E Serena | https://github.com/oraios/serena/discussions/1573 |
| F caveman | https://github.com/JuliusBrussee/caveman/discussions/520 |
| Bonus dgx-vllm#3 | https://github.com/spark-arena/dgx-vllm/issues/3#issuecomment-4694132827 (+1 mit Mess-Tabelle auf deren --exp-mxfp4-Request) |
| Community-Recipe-PR | https://github.com/spark-arena/community-recipe-registry/pull/6 (AutoRound+DFlash prod-Recipe, Vision-Toggle via extra_flags; nach Merge: `sparkrun run @community/qwen3.6-35b-a3b-autoround-int4-dflash-vllm-cipherfoxie`) |

~~Offen: sparkrun arena benchmark → Leaderboard~~ **VERWORFEN 2026-06-12**: Spark-Arena-Login verlangt Google-Account → Identity-Anker an cipherfoxie, widerspricht der Kompartmentalisierung. Recipe-PR ist der Wert; Leaderboard nur falls je ein sauber separates Konto bewusst aufgesetzt wird (nicht nebenbei). NICHT wieder als offenes TODO aufwärmen.

Gotcha gelernt: GitHub-Orgs können OAuth-App-Discussion-Writes blocken (Intel tat es, oraios nicht); Issues gehen immer. `write:discussion`-Scope via `gh auth refresh` nötig.

---

# Original-Drafts (Archiv)

Posting identity: **cipherfoxie** (GitHub) / HF account as applicable.
Rules applied: data first, repro included, blog link only as closing footnote,
no marketing language. Before posting each: search the tracker for duplicates
and link them instead of filing new if one exists.

---

## Draft A — vLLM issue
**Target:** github.com/vllm-project/vllm/issues (search first: "MXFP4 MARLIN memory GB10 SM121" / "gpu_memory_utilization mxfp4")
**Title:** MARLIN MXFP4 MoE backend allocates far beyond gpu_memory_utilization on GB10 (SM121A): 118 GB observed for gpt-oss-120b with 0.7 cap on a 128 GB unified-memory box

**Body:**

Hardware: NVIDIA DGX Spark (GB10, Blackwell SM121A / arch 12.1a, aarch64, 128 GB unified memory shared between GPU and desktop).

Serving `openai/gpt-oss-120b` (MXFP4) with `--gpu-memory-utilization 0.7`, vLLM resolves MXFP4 to the MARLIN MoE backend on this device (CUTLASS path unavailable, see below). After load, total usage reaches ~118 GB on a 128 GB box, well past the 0.7 cap. The MARLIN workspace / expert materialization appears to live outside vLLM's memory accounting. On unified-memory hardware this is fatal: the GPU allocation starves the desktop compositor and the machine appears frozen.

Two related observations on the same box:

1. `VLLM_USE_FLASHINFER_MOE_MXFP4_MXFP8=1` fails immediately with `MXFP4 grouped gemm is not supported on this device ... kernel does not support current device cuda`. The FlashInfer MXFP4 MoE kernel does not cover SM121A yet (happy to file that against flashinfer instead if that is the better home).
2. Building CUTLASS + FlashInfer from source pinned to arch 12.1a and serving with `--mxfp4-backend CUTLASS --attention-backend FLASHINFER` resolves everything: ~61 GB after load, respects the cap, decodes at 59.5 tok/s single-stream (matches the published Spark Arena figure of 58.82 for this model/hardware).

So the model is fine and the chip is fine; the gap is that no shipped wheel/image carries SM121A MXFP4 CUTLASS kernels, and the MARLIN fallback both underperforms and blows past the memory budget unaccounted.

Repro: `vllm serve openai/gpt-oss-120b --gpu-memory-utilization 0.7 --enforce-eager` on any GB10 box with a stock image; watch RSS/unified memory vs the configured cap.

Full writeup with the build details: https://sovgrid.org/blog/gpt-oss-120b-on-a-single-dgx-spark/

---

## Draft B — Intel auto-round discussion (positive report)
**Target:** github.com/intel/auto-round → Discussions (Show & Tell / General)
**Title:** Production report: Qwen3.6-35B-A3B int4-mixed AutoRound replaced a 4.75-bit build on DGX Spark (GB10), +12.7% decode, no measurable quality loss, vision tower intact

**Body:**

Short field report since most quant feedback is benchmarks rather than production switches.

Setup: DGX Spark (GB10, 128 GB unified memory), vLLM, `Intel/Qwen3.6-35B-A3B-int4-mixed-AutoRound` served with `--quantization gptq`, speculative decoding via a DFlash draft (k=3).

Measured against the 4.75-bit compressed-tensors community build of the same model, same box, same measurement method (prefill-separated 256-token decode, temperature 0, median of 3):

- Decode: 69.2 vs 61.4 tok/s (+12.7%, in line with the bandwidth math for 4.0 vs 4.75 bits on a 273 GB/s bus)
- Quality: 18/18 on a deterministic coding gate (multi-file renames incl. an ambiguous-symbol case, plus structured chat checks; script-graded, no LLM judging). Identical pass rate to the 4.75-bit build.
- The int4-mixed build kept the full vision tower; it reads screenshots correctly once `--language-model-only` is dropped. Of the three quants we compared (AutoRound int4-mixed, 4.75-bit compressed-tensors, FP8) it was the only one with working vision on this box.

It has been the production model here since 2026-06-11. The mixed approach (MoE gate projections at 16-bit) seems to be doing exactly what it promises at this size.

Method details and raw numbers: https://sovgrid.org/blog/qwen3-35b-quant-comparison-autoround-prismaquant-fp8/

---

## Draft C — DFlash draft model note
**Target:** HF model repo `z-lab/Qwen3.6-35B-A3B-DFlash` → Community tab (new discussion). If there is a GitHub repo, prefer that.
**Title:** Docs suggestion: cold-start TPOT undersells steady-state by ~35% (43 vs 69 tok/s) until the draft path warms

**Body:**

Observation from production use on a DGX Spark (GB10), vLLM, Qwen3.6-35B-A3B int4 with this DFlash draft at k=3.

Measuring decode speed from vLLM's TPOT metric right after launch, over the first handful of requests, gives ~43 tok/s. After a steady stream of requests the same metric settles at ~69 tok/s, which matches an independent prefill-separated measurement of the same setup. The cold reading is not noise; it reproduces, and it is exactly the kind of number people quote in "X is slow" reports.

Might be worth one line in the README: benchmark after warmup over a real request window, not on the first requests after launch.

Longer writeup of how we caught it: https://sovgrid.org/blog/catching-your-benchmark-lying-three-measurement-traps/

---

## Draft D — Spark Arena reproduction report
**Target:** Spark Arena recipes repo (github.com/spark-arena, exact repo with the gpt-oss-120b recipe/leaderboard entry; search for an existing "results/verification" issue format first)
**Title:** Independent reproduction: gpt-oss-120b single-Spark 58.82 tok/s confirmed (59.5 measured), plus two notes on the nightly image

**Body:**

Reproduced your verified gpt-oss-120b single-Spark figure on an independent DGX Spark (GB10, 128 GB): 59.5 tok/s decode from vLLM's TPOT metric vs your published 58.82. Difference is run-to-run noise. Locking GPU clocks at max moved it by a fraction of a token, consistent with a memory-bandwidth ceiling, so the leaderboard number is honest and at the hardware limit.

Two things from the road there that may be worth flagging for recipe users:

1. On `dgx-vllm-eugr-nightly`, MXFP4 resolves to MARLIN + TRITON_ATTN. With full torch.compile + CUDA-graph capture on this cold 120B MoE the launch hung for 44 minutes pinning the GPU, which on unified memory freezes the whole desktop. `--enforce-eager` avoids the hang but then the MARLIN path balloons to ~118 GB regardless of `--gpu-memory-utilization`. The nightly also logs `Unknown vLLM environment variable: VLLM_MXFP4_BACKEND`, so the CUTLASS knob is not wired there.
2. The intended `vllm-node-mxfp4` container (CUTLASS + FlashInfer, arch 12.1a) fixes all of it: ~61 GB after load, clean serve at the number above. Building it locally took a 43-minute compile; if a prebuilt image were published, the recipe would be one command for everyone.

Full build log and measurements: https://sovgrid.org/blog/gpt-oss-120b-on-a-single-dgx-spark/

---

## Draft E — Serena discussion (balanced report, net useful for them)
**Target:** github.com/oraios/serena → Discussions (search issues/discussions for "benchmark" first)
**Title:** Measured Serena on two self-hosted models with deterministic gates: no effect on a strong model, but it rescued a weak one on the dangerous task

**Body:**

Independent measurement, N=3-5 per cell, deterministic pass/fail gates (typecheck + actual rename verification, no LLM judging), opencode headless on a DGX Spark. Models: Qwen3.6-35B (vLLM) and Mistral-Small-4 (SGLang). Baseline arm = native grep/read/edit, serena arm = same plus Serena MCP (`ide-assistant` context).

The headline result you may want to know about: on an ambiguous rename (rename `UserRepository.save`, leave an unrelated `Logger.save` alone), the weak model with native tools failed 3 of 3, every time doing a global rename that clobbered the unrelated symbol across 8 files, and the broken result passed typecheck and lint. With Serena it went to 1 of 3 correct and the damage dropped from 8 files to 1.7 mean. Serena acted as a semantic guardrail exactly where plain text-replacement is confidently wrong.

The flip side, equally measured: the strong model never needed it. Qwen3.6 passed everything in both arms with identical surgical diffs, and Serena's tool schemas added +15% to +158% input tokens depending on task (ts-rename N=5: 75.6k baseline vs 195.2k with Serena). If schema size could shrink, the tax on capable models would drop and the guardrail story would be close to free.

Verdict we published: situational, guardrail for weak models, overhead for strong ones. Full method and raw runs: harness https://github.com/cipherfoxie/agent-bench, writeup https://sovgrid.org/blog/serena-local-benchmark/

---

## Draft F — caveman issue/discussion (claim check, factual)
**Target:** github.com/JuliusBrussee/caveman → Discussions if enabled, else an issue (search for existing benchmark threads first)
**Title:** Independent measurement across 5 models: output reduction is real (~-31%) but total cost never dropped; the 65-75% claim does not reproduce

**Body:**

Measured the skill with deterministic gates on two self-hosted models (Qwen3.6-35B, Mistral-Small-4, via opencode headless, skill injected verbatim as project rules, injection verified with a canary instruction) and three Claude models via API (Sonnet 4.6, Opus 4.8, Fable 5). N=3 per cell, chat answers scored against frozen fact checklists, coding tasks gated by typecheck/rename verification.

What reproduces: output-token reduction on chat-style answers, consistently around -31% on four of five models (best case -33% on Opus). Technical accuracy held, all checklists passed in both arms.

What does not reproduce: the 65-75% token-reduction claim, on any of the five models. Two reasons fall out of the data. First, the instruction itself rides along as ~1k input tokens on every request, and on coding tasks input dominates, so total tokens often went up (Qwen ts-rename: 89k baseline vs 111k with the skill). Second, measured in dollars on the Claude models, the caveman arm was never cheaper (e.g. Opus $0.554 vs $0.555; Fable 5 outputs got 18% longer and cost more). One model going the wrong direction entirely suggests the effect is also model-dependent.

Suggestion: qualify the claim toward "up to ~33% shorter chat outputs, model-dependent, with no total-cost saving measured on agentic coding workloads", or scope it to the workloads where it holds. Happy to share raw runs: harness https://github.com/cipherfoxie/agent-bench, full writeup https://sovgrid.org/blog/caveman-local-benchmark/

---

## Skipped on purpose
- OpenAI gpt-oss repo: 56% agentic result carries a harness-integration caveat; not actionable upstream.
- PrismaQuant author: vision-drop is a build choice, not a bug; only worth a neutral note if a channel presents itself.
- Lightricks LTX-2: nothing tested yet; no comment before we have data.
