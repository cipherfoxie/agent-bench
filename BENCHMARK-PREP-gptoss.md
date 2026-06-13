# Benchmark prep — gpt-oss-120b (2026-06-11)

Two tests, both defined against existing tooling. Prepared while gpt-oss loads.

Serving target: `openai/gpt-oss-120b` served as `gpt-oss-120b`, CUTLASS image
`vllm-node-mxfp4:latest`, util 0.75, currently on **:8000** (first-light, enforce-eager).

---

## TEST A — Performance, Spark-Arena leaderboard parity (vLLM / llama-benchy style)

Goal: tokens/sec **directly comparable to the published 58.82 tok/s** on the Spark Arena board.

**Most faithful (uses the official Spark-Arena benchmark profile = same params as the 58.82 run):**
```bash
cd /home/cipherfox
sparkrun benchmark run @eugr/openai-gpt-oss-120b --hosts localhost --tp 1 --gpu-mem 0.75
```
> Note: sparkrun's run path re-does the model `snapshot_download` (it re-fetched the pruned
> metal/original = 122 GB earlier). If it does that again, abort and use the direct llama-benchy
> call below against the already-running :8000 server instead.

**Direct against the running server (no sparkrun, no re-download):**
```bash
llama-benchy \
  --base-url http://localhost:8000/v1 \
  --served-model-name gpt-oss-120b \
  --tokenizer openai/gpt-oss-120b \
  --runs 3 --latency-mode generation \
  --save-result /data/projects/agent-bench/results/perf-gptoss-spark.md --format md
```
For strict parity, match the leaderboard profile's `--pp` (prefill), `--tg` (gen tokens),
`--depth` (context), `--concurrency`, warmup, and cache flags — pull those from the Spark-Arena
recipe's `benchmarking` profile before the official-comparison run.

Output = prefill/decode tok/s + latency, our number vs 58.82.

---

## TEST B — vs Nemotron-3-Super (agent-bench style: speed + quality)

Goal: within-task A/B of **gpt-oss-120b vs Nemotron-3-Super-120B** — quality (deterministic-gate
success + diff-minimality KPIs) and speed (wallclock + tokens). ARMS=baseline (pure model compare,
no tool intervention).

**Tasks (defined, present in `tasks/`):** `ts-rename`, `ts-callers`, `ts-ambiguous`. The
`ts-ambiguous` trap (rename `UserRepository.save` without touching `Logger.save`) is the quality
differentiator — same one that split Qwen vs Mistral.

**Providers (already in `~/.config/opencode/opencode.json`):**
- `local-gptoss` → model `gpt-oss-120b`
- `local-nemotron` → model `nemotron-3-super`
- both point at `localhost:30001` (the mutex port).

**Run command (once prerequisites below are met):**
```bash
cd /data/projects/agent-bench
EXPERIMENT=gptoss-vs-nemotron ARMS=baseline \
  TASK_NAME=ts-rename,ts-callers,ts-ambiguous N=5 \
  MODELS="local-gptoss/gpt-oss-120b:gptoss,local-nemotron/nemotron-3-super:nemotron" \
  SWITCH_CMD="bash /data/scripts/llm/switch.sh" \
  node runner/bench.js
node runner/aggregate.js gptoss-vs-nemotron-ts-rename+ts-callers+ts-ambiguous
```
bench.js groups by model to minimize GPU switches (concurrency 1) and calls `SWITCH_CMD <engine>`
to swap. Records per run: success, tool calls, tokens-in/out, wallclock, diff-vs-reference,
full-project build, lint — i.e. **speed and quality in one matrix.**

---

## Prerequisites / gaps before Test B (must do first)

1. **Serve gpt-oss on :30001**, not :8000 — that's the port both providers expect. Either relaunch
   gpt-oss on 30001, or temporarily point `local-gptoss` baseURL at :8000.
2. **`switch.sh` has no `gpt-oss` / `nemotron` targets yet** (only `qwen`/`mistral`). Add both:
   each = stop the others + `docker run` that model on :30001, health-gate, with the memory
   watchdog. (gpt-oss launcher = the working `docker run vllm-node-mxfp4` from today, port→30001.)
3. **Nemotron image must be built.** Recipe `nemotron-3-super-nvfp4.yaml` → container `vllm-node`
   (NVFP4, not MXFP4) → a *separate* build. Good news: the nvcr base is cached now
   (`/ai/nvcr-base.tar` + loaded), and the `# syntax` frontend is loaded, so the build is offline /
   Tor-free. Pre-verify Nemotron's license before publishing any numbers (earlier memory: dropped
   on license grounds; re-check).
4. **Memory watchdog** armed for every launch (`/data/scripts/llm/gpu-mem-watchdog.sh`), reserve
   tuned to the util (at 0.75 → reserve 7–8 GB is safe; do NOT use reserve ≥ free-at-util or it
   kills a healthy server — today's self-inflicted lesson).
5. Both models served identically (same max-model-len, same util) for a fair speed comparison.

## TODO (parked) — Qwen-with-vision on the Spark

Found 2026-06-11: `Qwen3.6-FP8` (35 GB, already on disk) has a full `vision_config` +
`visual.blocks.*` weights → **multimodal**. The prod `int4-AutoRound` config *also* has
`vision_config`; it serves text-only **only because the launcher forces `--language-model-only`**,
not because the quant dropped vision. So Qwen-with-vision is achievable:
- (a) serve Qwen3.6-FP8 (vision weights confirmed) — bigger, likely no DFlash, slower;
- (b) drop `--language-model-only` on int4 **iff** the int4 safetensors actually contain the visual
  weights (AutoRound "mixed" may have omitted them) — verify first.
gpt-oss-120b has **no** vision at all, so for image tasks the answer is vision-Qwen, not gpt-oss.
Caveat: vision was likely disabled deliberately (memory/stability) — investigate carefully.

## Order of operations (when gpt-oss serving is confirmed)

1. Confirm gpt-oss `/health` + a chat smoke ping (first real tokens) on :8000.
2. **Test A** first (perf) — it only needs the running server, no swaps. Get our tok/s vs 58.82.
3. Add `gpt-oss`/`nemotron` switch.sh targets + build Nemotron image.
4. **Test B** (agent-bench matrix), model-grouped, watchdog armed.
5. Aggregate → numbers feed the article draft (`2026-06-11-gpt-oss-120b-spark-DRAFT.md`).
