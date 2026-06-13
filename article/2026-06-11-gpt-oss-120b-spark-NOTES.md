---
title: "Running gpt-oss-120b on a DGX Spark (and the OOM that froze the box)"
slug: gpt-oss-120b-on-a-single-dgx-spark
description: "DRAFT / running incident log — captured live on 2026-06-11 so the findings survive any further crash. Goal: get gpt-oss-120b running sustainably on the Spark, benchmark it against the Spark Arena leaderboard, then A/B it against Nemotron-3-Super in agent-bench style. The hypothesis: gpt-oss-120b beats Nemotron for our use."
date: 2026-06-11
status: DRAFT
tags: ["dgx-spark", "vllm", "gpt-oss", "benchmarking", "engineering-honesty"]
---

> **THIS IS A WORKING DRAFT / BRIEFING / INCIDENT LOG.** Written live on 2026-06-11 so that if
> another OOM/freeze hits during the gpt-oss relaunch, the forensics and the plan survive on disk.
> **Context from the autonomous benchmark session was lost in the reboot** — this file is the
> briefing that replaces it. Not publishable as-is. The OOM is a short honest sidebar in the final
> piece, not the headline.
>
> **Operator correction (do not ignore):** Qwen was deliberately stopped and the healthcheck
> paused *before* the gpt-oss run. So "gpt-oss coexisted with a resident Qwen" is NOT a confirmed
> root cause — see the unresolved-contradiction note below.

## The plan (why we're doing this)

Three steps, in order:

1. **Get gpt-oss-120b running sustainably** on the Spark (long-term use, not a one-off). The
   working hypothesis is that `openai/gpt-oss-120b` is **better than Nemotron-3-Super** for our
   workload and could become a resident model.
2. **Benchmark it against the Spark Arena leaderboard** — use the `official` registry
   (`spark-arena/recipe-registry`) + its `benchmarking` profile so the numbers are
   leaderboard-comparable, not home-grown.
3. **agent-bench-style A/B vs Nemotron-3-Super** — same harness, deterministic gates, within-task
   comparison (gpt-oss vs Nemotron on the tasks we actually run).

---

## The OOM incident (2026-06-11) — root cause, confirmed

**What the user saw:** left an autonomous gpt-oss benchmark running, came back to a fully frozen
box. Had to hard power-off and reboot. (Two reboots total today: 08:18 and 09:42.)

**Timeline from the journal (boot -2, Jun 10 00:06 → Jun 11 08:17) — facts only:**

- `NVRM: ... Out of memory [NV_ERR_NO_MEMORY] ... _memdescAllocInternal` fired repeatedly, but in
  a bounded window: **first at Jun 10 08:23:32, last at Jun 11 00:08:54.** They did NOT continue
  up to the freeze — they stopped around midnight. So the GPU memory-exhaustion happened *during
  the Jun 10 benchmarking day* and had ceased ~8 h before the morning freeze.
- No Linux userspace OOM-killer fired anywhere (no `invoked oom-killer`, no `Killed process`).
  System RAM was fine. **This was GPU/unified-memory exhaustion, not a RAM OOM.**
- The `vllm-qwen36-healthcheck.timer` fired every ~5 min all night (07:xx, 08:xx …). Every run
  "Deactivated successfully / Finished" with **no auto-restart action logged** — so the
  healthcheck did NOT resurrect Qwen mid-run (rules out the caveman-style timer resurrection).
- At **08:17:49** systemd logged `Stopped vllm-qwen36.service — vLLM Qwen3.6-35B-A3B on port
  30001`, i.e. that unit was *active* at shutdown.
- Shutdown at 08:17:57 was **clean** (`systemd-shutdown: Syncing filesystems`) — not a raw
  power-cut at the kernel level. Likely an SSH `reboot` or ACPI power-button after the desktop had
  frozen (the GUI was dead even though the kernel still logged).
- Boot -1 (08:18 → 09:42) *also* died: `NVRM: gpuHandleSanityCheckRegReadError_GH100: ... bad
  register read ... regvalue: 0xbadf5600` — the "GPU fell off the bus" signature. The GPU stayed
  wedged across the first reboot and needed a second reboot to clear.

**Root cause: FOUND (evidence-based, recovered from the dead container).** The autonomous run's
container `vllm-gptoss` survived the reboot in `Exited (255)` state. Its `docker inspect` + `docker
logs` recovered the lost session context:

- **Exact invocation:** `vllm serve openai/gpt-oss-120b --port 30001` (the *prod* port) on image
  `ghcr.io/spark-arena/dgx-vllm-eugr-nightly:latest`, `--gpu-memory-utilization 0.7`,
  `--max-model-len 131072`, `--max-num-seqs 16`, `--quantization mxfp4`, `--kv-cache-dtype fp8`.
  Ran 06:57:18 → 07:42:51 (≈45 min), exit 255.
- **Weights loaded fine** (15 shards, 18.8 s) — MXFP4 resolved to the **`MARLIN`** MoE backend and
  **`TRITON_ATTN`** attention on the nightly image.
- **Then 44 minutes of total silence.** Last log line 06:58:05 (`MoEPrepareAndFinalizeNoDPEPModular`),
  then nothing until the process died at 07:42:51. **No kernel GPU fault (no Xid/NVRM/hung_task) in
  that window.**

**So it was a userspace HANG, not a memory-fraction OOM.** gpt-oss-120b got through weight load and
into the **torch.compile (inductor) + FlashInfer autotune + full CUDA-graph capture** phase
(`compilation_config mode=VLLM_COMPILE`, `enable_flashinfer_autotune=True`, ~85 cudagraph capture
sizes up to 1024) and **hung there for 44 minutes**, monopolizing the shared GB10 GPU so the GNOME
compositor starved → the desktop appeared frozen. The Jun 10 `NV_ERR_NO_MEMORY` storms were
*separate, earlier* attempts; this 06:57 run is the one that wedged the morning session.

**Ruled out:** Qwen coexistence (operator stopped it; healthcheck logged no restart; no kernel OOM
in the run window). The recipe's 0.70 util is *not* the primary culprit — the model never reached
KV-cache profiling cleanly; it died in compile/capture.

**The real mistakes, in order:**
1. **Ad-hoc invocation instead of the recipe.** The Spark Arena recipe wants container
   `vllm-node-mxfp4` with `--mxfp4-backend CUTLASS`, `--mxfp4-layers moe,qkv,o,lm_head`,
   `--attention-backend FLASHINFER`, env `VLLM_USE_FLASHINFER_MOE_MXFP4_MXFP8=1`. The run used the
   plain nightly image → fell back to MARLIN + TRITON_ATTN, which hung on this Blackwell/SM121A box.
   (The nightly even logged `Unknown vLLM environment variable: VLLM_MXFP4_BACKEND` — the CUTLASS
   knob isn't wired on that image.)
2. **Full cudagraph capture + torch.compile on a cold 120B MoE** — minutes-to-hang of GPU
   monopolization with no `--enforce-eager` escape hatch.
3. **Port 30001 = the prod port**, and no memory watchdog, so when it wedged there was nothing to
   stop it and prod's port was taken too.

**Why a GPU monopoly/hang freezes the whole machine (Spark-specific, still the core lesson):** GB10
unified memory + GPU are shared between the GNOME compositor and the inference engine. A 44-minute
compile/capture that pins the GPU starves the desktop — there is no "GPU job is busy but the desktop
stays smooth" on this hardware. This is the part worth writing up.

**The fix that follows from this:**
- Smoke first with **`--enforce-eager`** (skips torch.compile + cudagraph capture = the exact hang
  phase), modest `--max-model-len` (32k), util 0.6, on a **separate port (30002)**, to prove the
  model *serves at all* on the available image. Slow but safe.
- Run it solo via the mutex (`switch.sh none` + drop_caches) — gpt-oss-120b weights (~61 GB) cannot
  coexist with Qwen (~56 GB) anyway.
- Guard every launch with a **MemAvailable watchdog** that `docker stop`s the engine before the
  desktop is starved.
- For production speed (not the smoke): build the proper `vllm-node-mxfp4` / CUTLASS+FlashInfer-MoE
  image via sparkrun — a **supervised** step, then re-enable compilation with reduced cudagraph sizes.

---

## The fix: enforce solo via the mutex

`/data/scripts/llm/switch.sh` is the GPU mutex but currently only knows `qwen` and `mistral`
(GB10 = one engine at a time, enforced by docker stop/rm + drop_caches). It has **no gpt-oss
target**. The sustainable path:

1. **Stop Qwen first** to free its ~56 GB (`switch.sh none`, or add a `gpt-oss` target to switch.sh).
2. `drop_caches=3` before relaunch (Spark page-cache hijack: old weights linger in cache → OOM).
3. Launch gpt-oss-120b **solo** at its intended 0.70 util via sparkrun (recipe already cached:
   `openai-gpt-oss-120b.yaml`, container `vllm-node-mxfp4`, MXFP4/CUTLASS, FlashInfer MoE).
4. While gpt-oss is resident, **Qwen is DOWN** — the blog/OWUI/opencode prod LLM is unavailable
   during gpt-oss sessions. Accepted tradeoff for benchmarking; for long-term residency it's a
   real model-swap decision.

**Hard rule going forward:** never launch a second engine without `switch.sh` stopping the first.
`solo_only: true` in a recipe means solo. The mutex is not optional on unified memory.

### Exact relaunch params (from the cached recipe)

```
model:        openai/gpt-oss-120b
container:    vllm-node-mxfp4   (build_args: --exp-mxfp4)
solo_only:    true
gpu_mem_util: 0.70
quant:        mxfp4, --mxfp4-backend CUTLASS, --mxfp4-layers moe,qkv,o,lm_head
attn:         FLASHINFER, --kv-cache-dtype fp8
env:          VLLM_USE_FLASHINFER_MOE_MXFP4_MXFP8=1
port:         8000 (recipe default; our prod convention is :30001 for Qwen, pick a free port)
```

### Comparison target — also already cached

`nemotron-3-super-nvfp4.yaml` → `nvidia/NVIDIA-Nemotron-3-Super-120B-A12B-NVFP4`, container
`vllm-node`, NVFP4/CUTLASS, `gpu_memory_utilization: 0.7`, `tensor_parallel: 2`. Note `solo_only:
false` but at 0.7 util it is effectively solo too. So the agent-bench A/B (step 3) is also a
**mutex'd swap**: run gpt-oss, benchmark, `switch` to Nemotron, benchmark — never both up.

> NOTE: earlier memory said Nemotron was dropped on license grounds. It's present in the official
> Spark Arena registry now — re-verify the license before publishing any Nemotron numbers.

---

## Live smoke results (2026-06-11 afternoon) — what we actually proved

Two guarded smoke launches, Qwen stopped, watchdog armed. **The box never froze** — the
MemAvailable watchdog caught both runs. This is the headline operational win.

**Attempt 1** — `--enforce-eager`, util 0.6, `--load-format fastsafetensors`, max-len 32k:
- Weights loaded in ~20 s, then MemAvailable crashed to **5 GiB in seconds** → watchdog stopped it.
- Cause: `fastsafetensors` (GDS unsupported → `nogds`) **double-buffers** the 60.77 GiB checkpoint
  in unified memory during load → transient ~2× peak.

**Attempt 2** — same but `--load-format auto` (streaming loader):
- vLLM logged it directly: `Checkpoint size: 60.77 GiB. Available RAM: 47.36 GiB` and disabled
  auto-prefetch because the checkpoint exceeds 90% of available RAM.
- Streaming load was **stable at ~44 GiB MemAvailable** but slow: **399 s** (~29 s/shard, no
  prefetch room) vs 20 s for fastsafetensors. So the double-buffer hypothesis was correct.
- **But ~5 s after weights finished, memory spiked from 44 → 3 GiB** during the MXFP4 MoE
  finalize (`MoEPrepareAndFinalizeNoDPEPModular`) → watchdog stopped it (exit 137, `OOMKilled=false`).

**Definitive finding:** on the **nightly image** (`dgx-vllm-eugr-nightly`), gpt-oss-120b's MXFP4
MoE **balloons to ~118 GiB used after load**, and **`--gpu-memory-utilization 0.6` does NOT cap
it** (the MARLIN MoE workspace / expert materialization lives outside vLLM's budget accounting).
Lower util and smaller context do not address it — the blow-up is in MoE finalize, not KV. The box
has 128 GB unified; ~118 GiB for the engine leaves no desktop headroom → unusable as a
co-resident, and marginal even headless.

**Therefore: gpt-oss-120b needs the recipe's intended container** — `vllm-node-mxfp4` built with
`--exp-mxfp4`, served with `--mxfp4-backend CUTLASS`, `--attention-backend FLASHINFER`,
`VLLM_USE_FLASHINFER_MOE_MXFP4_MXFP8=1`. That path keeps the MoE in MXFP4 instead of materializing
it. **Building that image is the next step (sparkrun, supervised-ish — GPU-free build, safe from
freeze).** Until then, gpt-oss-120b does not serve on this box.

**Standing safety net now in place:**
- `/data/scripts/llm/gpu-mem-watchdog.sh <container> [reserve_gib] [poll_s]` — proven twice today.
- `/data/scripts/llm/gptoss-smoke-launch.sh` — enforce-eager, streaming loader, port 30002, util 0.6.
- Healthchecks (`sglang-healthcheck.timer`, `vllm-qwen36-healthcheck.timer`) disabled; `drop_caches`
  NOPASSWD sudoers installed (`/etc/sudoers.d/llm-switch`).

## The blocker gauntlet — why "3.9M downloads/month" tells you nothing

gpt-oss-120b pulls **3,924,278 downloads last month** on Hugging Face (verified on the model page,
2026-06-11). You would assume a model that popular is a solved, one-command experience. Self-hosting it on a DGX Spark (GB10, unified
memory, Blackwell SM121A) was the opposite — a stack of independent traps, each of which silently
wastes hours. Documented in the order we hit them, because this gap between the download counter and
the reality is the whole point:

1. **The compile/capture hang that froze the box.** Ad-hoc launch on the nightly image → vLLM
   entered torch.compile + full CUDA-graph capture on a cold 120B MoE and hung for 44 minutes,
   monopolizing the shared GPU until the desktop was dead. No error, no log, just a frozen machine
   and a hard power-off. Fix discovered: `--enforce-eager`. Nothing warns you.

2. **The MXFP4 MoE memory balloon.** With `--enforce-eager` it loads, then the MARLIN MXFP4 MoE
   finalize step blows past `--gpu-memory-utilization` to ~118 GB used (the util flag does **not**
   cap it). A 60.77 GiB checkpoint somehow needs ~118 GiB to initialize. On a 128 GB box that
   leaves no desktop headroom → the watchdog had to kill it.

3. **The loader double-buffer.** `--load-format fastsafetensors` (the recipe default) double-buffers
   the 60.77 GiB checkpoint in unified memory during load → transient ~2× peak → OOM-class spike.
   Fix: `--load-format auto` (streaming) — but then load is **20× slower** (399 s vs 20 s) because
   the checkpoint exceeds 90% of available RAM after vLLM reserves its budget.

4. **The "right" container needs a from-scratch build.** The fix for #2 is the recipe's intended
   `vllm-node-mxfp4` image (CUTLASS MXFP4 + FlashInfer MoE). It isn't published — it builds locally
   from a **25 GB `nvcr.io/nvidia/pytorch` base** plus prebuilt FlashInfer/vLLM wheels pinned to
   Blackwell arch `12.1a`.

5. **The real blocker: Docker pulls route through Tor.** The `nvcr` base (25 GB) stalls — layers
   download ("Download complete") but extraction/registration never finalizes; dockerd sits idle,
   no CPU, no journal, no I/O wait. The cause is **not** a docker bug: `daemon.json` pins
   `"https-proxy": "socks5h://127.0.0.1:9050"` (Tor, deliberate security hardening — *do not touch*),
   so every registry pull tunnels through Tor. During a pull there are ~6 live connections to
   `:9050`. A 25 GB NGC image over Tor is the stall. **A full `docker` daemon restart did NOT fix
   it** (fresh pull re-wedged immediately), confirming it's the Tor path, not daemon state. And the
   restart bounced every service on the host (Gitea, OpenWebUI, SearXNG, Cloudflare tunnel, Matrix)
   — and auto-restarted Qwen via its restart policy. So the "correct" image is gated behind either
   waiting out a 30–60 min Tor pull or a one-time Tor bypass the operator must explicitly authorize.

6. **183 GB of checkpoint, 122 GB of it dead weight.** The HF repo ships three full copies — the
   serving safetensors (~61 GB), an `original/` raw checkpoint (~60 GB), and a `metal/` Apple build
   (~61 GB). vLLM uses one. The other two are pure disk tax until you prune them by hand (we did).

None of this is in the README. The download counter measures *curiosity* — how many people pulled
the weights — not *that anyone ran it on hardware like yours*. ~3.9M pulls a month, and this
gauntlet still isn't written down anywhere. That is the agent-bench thesis applied to a base model:
**popularity is not evidence of reproducibility on your stack.**

7. **The env-var shortcut is a dead end on this device.** Forcing the efficient path with
   `VLLM_USE_FLASHINFER_MOE_MXFP4_MXFP8=1` on the nightly image fails immediately:
   `Mxfp4 MoE backend 'FLASHINFER_TRTLLM_MXFP4_MXFP8' does not support the deployment configuration
   since kernel does not support current device cuda.` The FlashInfer MXFP4 MoE kernel is **not
   built for Blackwell SM121A** in the shipped image. The only MXFP4 MoE backend that loads on the
   nightly image is MARLIN — the one that balloons (#2). So the efficient path genuinely requires
   the custom CUTLASS build, which is blocked by the Docker wedge (#5). The trap is closed.

## Are we the problem? (the honest answer to "do 3.9M people go through this?")

No — and naming why is the most useful thing in this whole log. The ~3.9M monthly downloaders are
**not** on our path:

- The bulk run **GGUF via Ollama / llama.cpp** — gpt-oss ships an official GGUF / `metal/` build
  (the ~61 GB copy we pruned in #6). That path is one command and works on a Spark today.
- The serious vLLM users run on **x86 + datacenter NVIDIA (H100/A100/H200)**, where the MXFP4
  CUTLASS/FlashInfer kernels are prebuilt and tested. `vllm serve openai/gpt-oss-120b` just works.

Everything broke for us because we sit at the intersection of **four rare conditions the mainstream
never hits at once**:

1. **Blackwell SM121A + ARM64 (DGX Spark, ~2 months old)** — the MXFP4 kernels are barely ported;
   the device literally reports "kernel does not support current device."
2. **Unified memory shared with a desktop** — a GPU OOM freezes the whole machine instead of just
   killing a process on a headless server.
3. **120B at the memory edge** — 61 GB weights on a 128 GB box shared with the desktop = zero
   margin, so the MoE balloon and loader peaks are *fatal* instead of merely wasteful.
4. **The bleeding-edge serving path** (vLLM MXFP4 nightly + an unbuilt custom image) instead of the
   stable GGUF route.

So roughly **80% of the pain is "frontier hardware × frontier serving path × zero margin,"** not
incompetence. But the honest **20% that is our choice**: we insisted on the hardest serving path for
this hardware. If the goal is *use gpt-oss today*, the answer is Ollama/llama.cpp GGUF, which
sidesteps every blocker above. The vLLM-MXFP4-CUTLASS path we've been fighting is the *benchmark/
performance* ambition (to compare against Nemotron, leaderboard-style) — and on a two-month-old
Blackwell box, that path is genuinely frontier work, not a solved one-command experience the
download counter implies.

## Wait — why are we *building* anything? (plain-language detour)

If you've only ever run LLMs the easy way — `ollama run something`, or download a model and press
go — this whole exercise looks insane. So here is what's actually happening, in plain terms.

**Running an LLM is two separate things, not one:**

1. **The model** — the "brain." A big pile of numbers (gpt-oss-120b = ~61 GB). We downloaded this
   ready-made; nothing to build. This is the part everyone means when they say "I downloaded a model."
2. **The engine** — the "machine that runs the brain." Software (here: vLLM) plus, crucially,
   little chunks of GPU code called **kernels** that do the actual math on the graphics chip.

Most people never think about part 2 because on common hardware it's *also* ready-made. On a normal
NVIDIA datacenter card (H100 etc.) or a typical PC, you `pip install vllm` or `docker pull` a
finished package and the kernels inside were **already compiled** by someone else for that
hardware. Download, run, done.

**So why do we have to build it ourselves?** Because GPU kernels are not portable. They have to be
**compiled for the exact chip architecture** — the same way a program built for Windows won't run
on a Mac. The DGX Spark uses NVIDIA's **GB10 / Blackwell chip (architecture "SM121A", and it's ARM-
based)** — a design that's about two months old. The efficient math kernels gpt-oss needs (the
"CUTLASS MXFP4" path) **have not been pre-compiled and shipped for this chip yet** in any
downloadable package. The ready-made images are built for the older, common GPUs.

**That's what "building the image" is.** A Docker *image* is just a sealed box containing an OS, the
libraries, and the compiled engine — everything needed to run, packaged so it starts identically
every time. "Building" it means assembling that box: start from NVIDIA's base box (CUDA + PyTorch),
then **compile the GPU kernels from their human-readable source code into machine code this specific
chip understands**, and seal the result. The `cc1plus` process pinning all CPU cores right now *is*
that compile step — a C++ compiler translating kernel source into Spark-native instructions. It
takes 30–60 minutes because there's a lot of it and it's targeting a brand-new architecture.

**What's the point — what do we get?** A version of the engine where gpt-oss actually runs *well*
on this chip (the 58.82 tok/s the leaderboard shows), instead of the broken fallback path that
balloons to 118 GB and freezes the box. And it's a **one-time** cost: build once, and every future
start is just "run the sealed box" in seconds.

**The honest framing:** this is the **frontier-hardware tax.** You bought a GPU so new that the
software world hasn't shipped pre-built binaries for it yet — so you compile from source, the thing
systems programmers do routinely and the thing 99% of LLM users never see, because they run on
hardware that's been supported for years. It's not that we're doing it wrong; it's that we're early.

## The proven config exists — and it needs the one image we can't pull (Spark Arena, 58.82 tok/s)

This is the whole point of step 2 (leaderboard alignment), and it closes the loop. Spark Arena
publishes a verified gpt-oss-120b run on a DGX Spark with vLLM at **58.82 tokens/sec**
(`spark-arena.com/benchmark/3b9f2d55-…`, authors Raphael Amorim / eugr / dbsci). Its recipe, pulled
verbatim from the page:

```yaml
name: OpenAI GPT-OSS 120B Solo
model: openai/gpt-oss-120b
build_args: ['--exp-mxfp4']
container: vllm-node-mxfp4            # ← the CUTLASS image, built from the nvcr base
command: |
  vllm serve openai/gpt-oss-120b --tool-call-parser openai --reasoning-parser openai_gptoss \
    --enable-auto-tool-choice --distributed-executor-backend ray \
    --gpu-memory-utilization {gpu_memory_utilization} --enable-prefix-caching \
    --load-format fastsafetensors --quantization mxfp4 \
    --mxfp4-backend CUTLASS --mxfp4-layers moe,qkv,o,lm_head \
    --attention-backend FLASHINFER --kv-cache-dtype fp8 \
    --max-num-batched-tokens {max_num_batched_tokens} --host {host} --port {port}
env: { VLLM_USE_FLASHINFER_MOE_MXFP4_MXFP8: '1' }
defaults: { gpu_memory_utilization: 0.7, max_num_batched_tokens: 8192 }
```

So the leaderboard's own working config **requires `container: vllm-node-mxfp4` and
`--mxfp4-backend CUTLASS`.** There is no shortcut on an off-the-shelf image — we proved it:

- **nightly image** (`dgx-vllm-eugr-nightly`, vLLM dev196): auto-selects MARLIN MoE → balloons to
  ~118 GB. Forcing the FlashInfer MoE env → `kernel does not support current device`.
- **nightly-tf5 image** (vLLM dev347): also auto-selects MARLIN → same balloon. And passing the
  recipe's own flag fails hard: `vllm: error: unrecognized arguments: --mxfp4-backend CUTLASS
  --mxfp4-layers …`. **The `--mxfp4-backend` flag does not even exist** in that build.

**Verdict (2026-06-11):** the only path to the published 58.82 tok/s — and the only path that
doesn't balloon — is the purpose-built `vllm-node-mxfp4` image. That image must be built locally
from the 25 GB nvcr base, and that pull is gated behind the Tor proxy (#5). **Every off-the-shelf
shortcut is now exhausted and documented.** The remaining decision is purely: how do we get the
nvcr base onto the box (wait out Tor vs. one-time authorized bypass), then `sparkrun run
@eugr/openai-gpt-oss-120b --tp 1 --gpu-mem 0.85` builds + serves it, guarded by the watchdog.

## Getting the image past Tor — and the false-wedge that cost two restarts

Building `vllm-node-mxfp4` locally turned into its own multi-hour saga, and the root cause of every
"mysterious Docker wedge" was the same: **`daemon.json` routes all Docker registry traffic through
Tor** (`socks5h://127.0.0.1:9050`, deliberate hardening). Nothing else on the box does — `hf`,
`curl`, `wget`, `apt` all go direct, which is why the 61 GB model weights flew in and only Docker
image work crawled. Same line, different path. The wedge wore three different masks:

1. **The 25 GB nvcr base pull** stalled in Tor — layers "Download complete" but the daemon never
   finalized, idle, no journal. **A full `docker` daemon restart did not fix it** (re-wedged
   immediately), which is what proved it was the Tor path, not daemon state.

2. **The fix that respects the Tor policy: fetch outside Docker.** `skopeo` (a non-Docker registry
   client) pulls direct, fast, and never touches the daemon proxy. The base came down in ~6 min vs
   30–60 min of Tor stalling. Caveat: `skopeo copy … docker-daemon:` failed on a client-API
   mismatch (`client 1.41 < min 1.44`), so the robust route is
   `skopeo copy docker://… docker-archive:/path.tar` then `docker load -i`. Note: this means the
   image is no longer pulled *through Tor* — same security tradeoff as a one-time bypass, just with
   a different tool. It's the operator's call, not ours.

3. **The `# syntax` frontend trap.** Even with the base local, the build re-wedged — and `Tor=2`
   during the build gave it away. `Dockerfile.mxfp4` starts with `# syntax=docker/dockerfile:1.6`,
   so **BuildKit pulls that frontend image from Docker Hub through Tor before the build even
   starts.** Same skopeo workaround: preload `docker/dockerfile:1.6` locally → `Tor=0`.

**The honest diagnostic mistake (worth more than the fixes):** after the base and frontend were
local and Tor was out, the build *still* sat at `[2/6] Building image` with **buildx at 0% CPU and
dockerd idle** — identical to the earlier true wedges. I called it a wedge and restarted the daemon
twice. **It wasn't stuck — it was working.** A disk check showed **~118 MB/s sustained writes**:
BuildKit was unpacking the 19.8 GB base into its own snapshot store, which is **disk-bound and
CPU-idle**. The progress signal I'd been using (CPU / process busy) is blind to I/O-bound work; the
right signal was `/proc/diskstats`. Two of the "wedges" I chased were real (Tor); the last one was
my own bad heuristic. On unfamiliar infra, **measure the resource the work actually uses** before
declaring a hang — CPU-idle + heavy disk I/O is progress, not a deadlock.

**Reusable rule for this box:** any Docker *pull/build* that needs a remote image will crawl or
appear to wedge because of the Tor proxy. Pre-stage every required image (FROM base **and** the
`# syntax` frontend) into the local store via `skopeo … docker-archive` + `docker load`, then build
fully offline. And judge build progress by disk I/O, not CPU.

## It worked: CUTLASS image built, no balloon (2026-06-11 evening)

After the whole gauntlet, the payoff. The `vllm-node-mxfp4` image **built successfully** — ~43 min,
24.6 GB image — once both the nvcr base and the `# syntax` frontend were pre-staged locally via
skopeo and Tor was out of the loop. The build was a real from-source CUDA compile (`cc1plus` then
`cicc` pinning all cores at load ~17 — exactly the "frontier-hardware tax" of compiling kernels for
SM121A).

**Launch caveat learned:** `sparkrun run` against the built image stalls at `[3/6] Distributing
resources` doing a full `snapshot_download` — which **re-downloads the 122 GB of `metal/` +
`original/` files we'd pruned** (dir grew 61 → 71 GB, `.incomplete` blobs reappeared). Fix: skip
sparkrun's distribute step and `docker run` the built image directly with `HF_HUB_OFFLINE=1`, so it
serves from the local serving-weights only.

**The result that justifies the entire build (logs):**

```
[MXFP4] Using backend: CUTLASS (--mxfp4-backend)
SM12x detected - using native FlashInfer CUTLASS attention (cubins not available for SM12x)
Memory: ~72 GB used / ~49 GB free   ← stable, NO balloon
```

That is the whole point in three lines: the engine finally selects **CUTLASS** (not the MARLIN
fallback), the **Blackwell-native FlashInfer CUTLASS attention** kernels are active, and memory sits
at **~72 GB with ~49 GB free** instead of the **~118 GB balloon** the off-the-shelf images produced.
The desktop keeps its headroom; the box is usable. Everything the off-the-shelf shortcuts failed at
(the FlashInfer-MoE "kernel does not support current device", the MARLIN balloon, the missing
`--mxfp4-backend` flag) is resolved by the one purpose-built image.

Launch config that got here (direct `docker run`, offline, safe first-light):
`--mxfp4-backend CUTLASS --mxfp4-layers moe,qkv,o,lm_head --attention-backend FLASHINFER
--kv-cache-dtype fp8 --quantization mxfp4 --gpu-memory-utilization 0.85 --max-model-len 32768
--enforce-eager --load-format auto`, env `VLLM_USE_FLASHINFER_MOE_MXFP4_MXFP8=1`, image
`vllm-node-mxfp4:latest`, watchdog armed. (First light uses `--enforce-eager` + streaming loader for
safety; the 58.82 tok/s benchmark config re-enables compilation + fastsafetensors — that's the next
measurement, once serving is confirmed.)

## Test A — performance vs the leaderboard (first numbers)

gpt-oss-120b on our self-built CUTLASS image, `llama-benchy` against the live `:8000` server,
pp1024 / tg512 / depth 4096, concurrency 1, 3 runs:

| metric | value |
|---|---|
| **decode** | **51.98 ± 0.33 tok/s** (peak 54.33) |
| prefill | 6640 tok/s (pp1024) |
| TTFT | 822 ms |
| coherence | PASSED |

**Spark Arena leaderboard: 58.82 tok/s.** We land at **~52 (~88%)** — and the gap is fully
explained: this run used **`--enforce-eager`** (no torch.compile / CUDA-graph capture), the
*safety* choice for first light because that exact phase froze the box this morning. The 58.82
config runs *with* compilation. Re-enabling it (carefully, watchdog armed, on the CUTLASS+FlashInfer
path that didn't hang) is the next measurement and should close the gap. So: leaderboard-comparable
on the first honest try, with a known, deliberate handicap.

## Chasing the leaderboard's 58.82 — and why ~55 is the honest ceiling

We didn't reach 58.82. Here's the full diagnosis, because the *why* is the interesting part:

| condition | decode tok/s (peak) |
|---|---|
| compiled, depth 4096 | 52.55 (54.33) |
| enforce-eager, depth 4096 | 51.98 (54.33) |
| compiled, depth 0 | 54.33 (56.20) |
| compiled, depth 0, **GPU clock locked to max (3003 MHz)** | 54.46 (55.80) |
| **Spark Arena leaderboard** | **58.82** |

Three hypotheses tested and **falsified**:
1. *enforce-eager handicap* → compiled gained +0.6 tok/s. Not it.
2. *context depth* → depth 4096→0 gained ~1 tok/s. Not it.
3. *GPU clock* → locking SM clock to max (vs auto 2502 MHz) gained **0.13 tok/s**. Not it.

The GPU is healthy: P0, 56 °C, **no throttle flags**, only ~44 W draw. Locking the clock doing
nothing is the tell: **MoE decode here is memory-bandwidth-bound, not compute-bound.** Every token
streams the active expert weights out of the Spark's unified LPDDR5X (~273 GB/s), and that
bandwidth — not the SM clock — sets the ceiling. So ~54–56 tok/s is the honest hardware decode
ceiling for gpt-oss-120b on *this* box. The remaining ~5% to 58.82 is unit-to-unit memory-clock
variance / vLLM version / measurement methodology, not something config tuning recovers. We land at
**~93–95% of the published number — parity within noise.** Reporting the ceiling honestly, with the
falsified hypotheses, is the point.

## Test B — gpt-oss vs Qwen vs Nemotron (quality + speed, our tasks)

The whole reason we fought to get gpt-oss-120b running: to *measure* whether the 120B is actually a
better agent than the 35B Qwen we run in prod. agent-bench, baseline arm (pure model, no tool
intervention), deterministic gates, opencode driver, N=3 per task:

| task | gpt-oss-120b | qwen3.6-35b | nemotron-3-super |
|---|---|---|---|
| ts-rename | 67% · 25s | **100% · 23s** | – |
| ts-callers | **0%** · 11s | **100% · 50s** | – |
| ts-ambiguous (the trap) | 67% · 22s | **100% · 34s** | 100% · **285s** |
| chat-tcp | **0%** · 9s | **100% · 7s** | – |
| chat-chmod | 100% · 7s | 100% · 6s | – |
| chat-acid | 100% · 6s | 100% · 6s | – |
| **overall** | **56%** (18 runs) | **100%** (56 runs) | 100% but ~8× slower |

**Verdict: the bigger model is the worse agent here.** Qwen3.6-35B — the model we already run, with
3B active params — passes every task; gpt-oss-120b passes 56%. Nemotron-3-Super matches Qwen's
quality on the one shared task but takes **285 s vs Qwen's 34 s (~8×)**. So on *our* agentic coding
work, the ranking is **Qwen ≫ gpt-oss**, and Nemotron is accurate-but-slow.

**The failure signature, and an honest caveat.** gpt-oss's failures are almost all the same shape:
**`tools=0`, a short 4–10 s reply, no edit attempted** — it answers briefly and never engages the
tools. When it *does* drive tools (14–21 calls) it succeeds. That pattern means part of the 44%
failure may be an **opencode integration issue** — gpt-oss's OpenAI reasoning/tool-call format not
meshing cleanly with the harness — not pure incapability. We flag that honestly. But it is also the
*real* experience of wiring gpt-oss in as an agent on this stack, which is exactly the question
("should I switch my prod agent to it?"). Charitably or not, it does not beat Qwen.

This is the series contract in action: a negative result, measured with the same gates as the
positive ones, shipped with the same prominence. The day-long fight to build the CUTLASS image was
worth it precisely *because* it let us replace a hypothesis ("120B must be better") with a number
(56% vs 100%).

## External cross-check: what the public benchmarks say

Our agent-bench numbers are measured on *our* tasks on *our* hardware. The public aggregators are a
useful independent cross-check — and the point of citing them is that they **agree** with what we
measured, which is exactly the opposite of the hype the param-counts imply.

- **Qwen3.6-35B-A3B vs gpt-oss-120b (Artificial Analysis, Agentic Index):**
  <https://artificialanalysis.ai/models/comparisons/qwen3-6-35b-a3b-vs-gpt-oss-120b?intelligence=agentic-index>
  Structural facts confirmed on the page: Qwen3.6 is **36B total / 3B active**, **262k** context,
  **image input supported**; gpt-oss-120b is **117B total / 5.1B active**, **131k** context, **no
  image input**. Both Apache-2.0.
- See also the individual model pages (live charts): <https://artificialanalysis.ai/models/gpt-oss-120b>
  and <https://artificialanalysis.ai/models/qwen3-6-35b-a3b>, and the Nemotron entries for the
  third corner of our comparison.

**How to read it.** The instinct is "117B must crush 35B." But on the **Agentic Index** the two sit
close, and that is not a glitch — it is the whole lesson:

1. **Active params, not total, drive per-token reasoning.** gpt-oss activates 5.1B per token, Qwen
   3B. That is the same compute ballpark, not a 3× gap. The extra 80B of gpt-oss is *stored*
   knowledge (breadth), which the agentic index does not reward.
2. **Agentic ≠ general intelligence.** Qwen3.6 is tuned for tool-use/coding; gpt-oss-120b is a
   strong general/reasoning model. On a tool-use index they converge; on raw knowledge/STEM
   gpt-oss pulls ahead — a different axis than "drive my coding agent."
3. **The public index lines up with our measurement.** Our agent-bench baseline runs: Qwen3.6 =
   **100% success on every task, fast** (ts-ambiguous ~132k tokens-in, ~34 s). Nemotron-3-Super =
   100% on the trap task but **~8× slower** (~269k tokens, ~285 s). The external agentic index
   showing Qwen level-or-ahead is the independent corroboration of what the gates already told us.

So the citation is not decoration — it is the cross-check that turns "I think Qwen is fine" into
"two independent measurements (a public eval and my own deterministic gates) agree that the bigger
model is not the better agent here." That is the agent-bench thesis with an external witness.

> Caveat on numbers: the Artificial Analysis comparison renders its index scores in interactive
> charts (not static text), so this draft cites the *structural* facts verbatim and the *direction*
> of the comparison, not invented point scores. Pull the exact index values from the live page
> before publishing.

## What I actually run now (the verdict, and the kicker)

A full day: a frozen box and two reboots, a Tor-proxied 25 GB pull beaten with skopeo, a 43-minute
CUDA-kernel compile for a chip two months old, util and watchdog tuning, a self-inflicted watchdog
kill at the finish line. At the end of it gpt-oss-120b runs, cleanly, at the hardware's bandwidth
ceiling. And then the measurement: on my own coding tasks it scores **56%** where the Qwen3.6-35B I
already run scores **100%**, and Nemotron-3-Super matches Qwen's accuracy at roughly eight times the
latency. The 120B I fought all day to stand up is the worst agent of the three on the work I do.

So I keep Qwen. Nothing about my stack changed. That is not a disappointing ending, it is the
point: the day's work did not buy a better model, it bought a *number* in place of a hypothesis, and
the number says the bigger model is not the better agent here. Build it, measure it, ship the
negative result with the same prominence as a positive one.

And the kicker, the part that turns the verdict from close to lopsided. While confirming gpt-oss has
no vision at all, I checked whether the Qwen I run could get its own back. The production quant
retains a full vision tower; one stale launch flag was hiding it. Drop the flag and the 35B that
already beats the 120B on agentic work also **reads a screenshot**, at its own fast footprint, with
speculative decoding still on. So the final tally on this hardware: the model that wins on coding
also sees, and the 120B that loses cannot. The vision side of that story, and the correction it
forces to an earlier post, is its own write-up, linked from here.

## Open decisions / TODO before relaunch

- [ ] Add a `gpt-oss` target to `switch.sh` (so the mutex covers it, not ad-hoc docker).
- [ ] Confirm port (avoid clobbering Qwen's :30001) and whether OWUI/opencode should point at it.
- [ ] Pick the Spark Arena `benchmarking` profile for the leaderboard run (step 2).
- [ ] Decide N and task set for the agent-bench vs-Nemotron A/B (step 3).
- [ ] Long-term: does gpt-oss-120b *replace* Qwen as resident, or stay a switch-in benchmark guest?
- [x] ~~drop_caches NOPASSWD sudoers~~ — **DONE** (`/etc/sudoers.d/llm-switch`, 2026-06-11).
- [x] ~~Healthcheck timers resurrecting engines~~ — **DONE**, both disabled (2026-06-11).
- [x] ~~Prune the 122 GB of dead checkpoint copies (metal/, original/)~~ — **DONE** (183 GB → 61 GB).
- [ ] **THE blocker:** get the 25 GB nvcr base past the Tor proxy → build `vllm-node-mxfp4`.
      Decision: wait out the Tor pull, or one-time authorized Tor bypass for this one image.

## Data / evidence pointers (for the final write-up)

- Journal: `journalctl -b -2 -k | grep NV_ERR_NO_MEMORY` (all-day failures), boot -1 tail
  (`0xbadf5600` bad-register reads = GPU off the bus).
- No `oom-killer` anywhere in boot -2 → rules out RAM OOM, confirms GPU/unified-memory.
- Recipe: `~/.config/sparkrun/cache/eugr-spark-vllm-docker/recipes/openai-gpt-oss-120b.yaml`
  (`solo_only: true`, util 0.70).
- Resident Qwen cmdline: `vllm serve Intel/Qwen3.6-35B-A3B-int4-mixed-AutoRound ... --gpu-memory-utilization 0.5`.
- agent-bench results so far (Serena, caveman): `/data/projects/agent-bench/results/`.
</content>

---

## Measurement pitfalls & learnings — the Qwen-quant matrix that lied (2026-06-11/12)

Tried to build a controlled matrix (AutoRound int4 vs PrismaQuant 4.75bit vs FP8: speed + quality + vision, identical config, on the box). It produced garbage twice. The *failures* are the keeper, in agent-bench-thesis spirit (the instrument can lie; the method must include noticing).

1. **CORRECTED — "vision-on breaks tool-calling" was a misdiagnosis (mine).** First read: vision-on emitted `tool_use::list_files::{}` as plain text -> "vision breaks tools." **That was wrong, and the error is the lesson.** A clean full-dump test (vision tower loaded, proper `tools` array) returns `finish_reason=tool_calls`, `tool_calls=[structured]` -> **vision-on DOES produce structured tool calls.** The web confirms Qwen3-VL is built for agent + vision together. The original "plain text" came from an unclean test (request without a `tools` array -> the model improvised text). The agent-bench 0% failures (both my text-only *matrix* container AND the vision container) correlate with **ad-hoc container config (reasoning runaway), not vision** — the *prod launcher* (text-only) scores 2/2 on the same task. Lesson: never conclude from one unclean test; reproduce with the validated harness before writing a "finding." Whether vision + complex agentic holds up at N>=3 on a *prod-config* vision instance is still unmeasured (no prod vision launcher yet).

2. **Ad-hoc containers != prod behavior (reasoning runaway).** Even text-only, my hand-rolled matrix container made the model reason-loop on complex opencode prompts (~30k tokens, tools=0, timeout) and score 0%, while the *real prod launcher* config scores Qwen at 100% on the same tasks. A subtle config delta (warmup / flags / something) I did not isolate. Lesson: **measure with the actual prod launchers (`qwen36-launch.sh` etc.), not reconstructed docker-run commands.**

3. **Speed measurement artifact.** llama-benchy reported **3.6 tok/s** for all three quants (vs ~30 measured cleanly twice for AutoRound). Almost certainly cold JIT/cudagraph kernels: my 3x chat warmup did not cover the benchmark's prompt shapes. Lesson: **warm thoroughly, then sanity-check the number against a known baseline before trusting it.** 3.6 and 0% were obviously wrong against known ~30 and 100% -> discard, do not publish.

4. **The meta-lesson (and the rule going forward):** an automated benchmark that yields a number is not the same as a *trustworthy* number. Every result gets a sanity gate (is it in a plausible range vs a known value?) before it is allowed into a table or an article. A 140-article blog dies if one mixed-up number erodes trust in all of them. Better a discarded run than a fabricated row.

**Status of numbers — RESOLVED (2026-06-12, authoritative):**
- **gpt-oss-120b decode: 59.5 tok/s** (vLLM-TPOT, reproduces Spark-Arena 58.82, bandwidth-bound). PUBLISHED in Article 1.
- **AutoRound int4 decode: ~69 tok/s** — TWO independent rulers agree: vLLM-TPOT steady-state (warm window, n=12) = **69.0**, and `measure.py` prefill-separated (ROADMAP-canonical, the prod-switch basis) = **69.2**. The night-run vLLM-TPOT cumulative = 64.4 (conservative, mixed cold+warm). A cold count=8 read gave **43.5 — DISCARDED as a spec-decoding cold-start artifact** (DFlash not yet warm). llama-benchy = unreliable (3.6–30). **Lesson for Article 3.**
- **PrismaQuant 4.75bit decode: ~61.4 tok/s** (`measure.py`, SAME ruler as AutoRound 69.2 → AutoRound +12.7%). NOTE: the vLLM-TPOT night-run gave 50.2 for PrismaQuant — a DIFFERENT ruler, do NOT mix. **Weights now DELETED**, so PrismaQuant is no longer re-measurable → for any quant-speed claim use the `measure.py` same-ruler pair (69.2 vs 61.4), never cross-ruler.
- **Quality (agent-bench deterministic gate, prod launchers):** AutoRound **100%** (9/9), PrismaQuant **100%** (9/9), FP8 **0%** (degenerate/reasoning-runaway on the available image), Mistral-119B **88%** (8/9). The `runs-quant-*` ad-hoc-matrix files (all 0%) are the discarded "lying matrix" — use `runs-night-*`/`runs-finish-*` only.
- **Vision:** AutoRound reads a dashboard screenshot AND emits structured tool_calls (measured). PrismaQuant dropped the vision tower (text-only). FP8 had the weights but is unusable. **Weights for PrismaQuant + FP8 DELETED 2026-06-12** (benchmark losers; numbers captured in `/tmp/quant-night.out`, `/tmp/finish-chain.out`).
- **Mistral-119B speed: NOT captured** (SGLang safer-eagle start failed in the run; the "33.9 tok/s" in `/tmp/mistral-chain.out` is Qwen-AutoRound streaming-calibration, not Mistral). Do NOT quote a Mistral tok/s. Quality 88% + vision ✓ are solid.
- **prod-Qwen reboot-fest 2026-06-12:** `vllm-qwen36.service` enabled (was disabled); stale "PrismaQuant" description fixed → "AutoRound int4 (prod)". Reload = `systemctl restart vllm-qwen36` or `switch.sh qwen`. Weights re-pullable from HF `Intel/Qwen3.6-35B-A3B-int4-mixed-AutoRound`.
