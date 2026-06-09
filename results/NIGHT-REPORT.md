# Night Report — 2026-06-09 → 06-10

## TL;DR

Planning + design + the provider spike are **done and committed**. The overnight benchmark campaign **did not run**, because the agent harness (`opencode run`) became wedged at ~21:00 and hangs on every invocation. I diagnosed it thoroughly, ruled out the obvious causes (including your MCP change — it's innocent), left your environment clean, and **halted rather than produce junk data** (per the stated guardrail). Most likely fix: a reboot. Needs your hand in the morning.

## What got done (committed in this repo)

- `FRAMEWORK.md` — promptfoo-based generic harness design (3 toggle types).
- `ROADMAP.md` — curated coding-relevant tool set, tiered runs, pillar+spoke article cluster.
- `experiments/serena/SPEC.md`, `experiments/caveman/SPEC.md` — the two deep-dive experiments.
- `docs/plans/2026-06-09-harness-core.md` — full bite-sized implementation plan (Plan 1).
- `provider/SPIKE.md` + `provider/tests/fixtures/opencode-run-sample.jsonl` — the GREEN provider spike captured at 21:03, when opencode still worked.

## The blocker: `opencode run` hangs

Every `opencode run` now hangs ~indefinitely, stalling immediately after the log line `vcs ... initialized`, producing no output, then dies on timeout. It worked at 21:03 (the spike, 3s). It has been reproducibly broken since ~21:30.

### Ruled out (with evidence)

| Hypothesis | Test | Result |
|---|---|---|
| Local model down/slow | raw curl to vLLM :30001, incl. 4016-token prefill | **Healthy**, HTTP 200 in 0.1–0.7s |
| Your MCP deletion / duplicate MCP | config inspect + MCP-disabled + isolated-config runs | **Innocent** — config correctly points `sovereign-ai → localhost:8002`; runs hang identically with MCPs off |
| Missing git commit in test repo | committed repo | hangs |
| External plugins | `opencode run --pure` | hangs |
| Daemon / SQLite db contention | stopped `opencode-mobile.service` (server fully down) | hangs |
| Corrupt opencode state | moved `~/.local/share/opencode` aside → fresh state (then restored) | hangs |
| Network / phone-home | `strace` → **zero `connect()` calls** | not network |
| Binary auto-update | binary mtime 2026-06-08, unchanged | same binary as the working spike |
| Stale lock / `/tmp/opencode` / TMPDIR | inspected (empty dir), TMPDIR isolated | hangs |
| Git config hang (lfs/fsmonitor/creds) | plain `git rev-list`/`remote` in test repo | git works in <0.1s |
| System resources | `free` 49Gi avail, load 0.6, /tmp 14% | not starved |

`strace` shows opencode spawns its normal git context commands, then sits in the Bun event loop (`ep_poll`) with no sockets and no further syscalls until killed. The hang is **inside opencode's post-vcs bootstrap**, before it ever contacts the model or MCP.

### Most likely cause + fix

Some OS/runtime-level state changed around 21:00–21:18 (note: `/tmp/openclaw-1000/gateway.ca58d093.lock` is timestamped 21:18, same window — openclaw is the other Bun/opencode-adjacent service). I could not pin the exact resource remotely without riskier moves. The highest-probability clean fix is a **reboot** (clears kernel/IPC/runtime state), which I deliberately did **not** do to your machine unattended.

## Your environment was left clean

- `opencode-mobile.service` + `caddy-opencode.service`: stopped for tests, **restarted, verified `active`**.
- `~/.local/share/opencode`: moved aside for one test, **restored**.
- No config of yours was modified. The benchmark repo lives entirely under `/data/projects/agent-bench/`.

## Morning next steps (pick one)

1. **Reboot**, then `cd /tmp/ab-spike && opencode run -m local-qwen/qwen3.6-35b --dir /tmp/ab-spike "say hi"` — if it answers in seconds, the harness is back and the campaign can run.
2. If reboot doesn't fix it: recall what changed in the ~21:00 session (the MCP/openclaw work) — that session likely holds the trigger.
3. Confirm whether your **normal interactive opencode** also hangs (it should, if this is system-wide) — tells us if it's your daily driver too.

Once `opencode run` answers again, Plan 1 (harness core) is ready to execute top-to-bottom, then the Serena + caveman deep dives.
