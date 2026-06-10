# AGENTS, Multi-Agent Contract for agent-bench

This file is the contract any AI agent (Claude, Qwen, Mistral, opencode, Continue, Zed-agent) must read before editing this repo.

## Project ethos

agent-bench exists to replace vibes with numbers. **Honesty beats advocacy.** A negative result is a successful benchmark. Never massage, drop, or footnote inconvenient data; if a run is contaminated, the whole cell is rerun, not patched.

## Rules

1. **Deterministic gates only.** No LLM-judged success criteria, anywhere. If a new task cannot be gated by a build, a typecheck, a grep, or a frozen checklist, redesign the task.

2. **One variable per arm.** An experiment arm toggles exactly one thing. If a change needs two toggles, it is two experiments.

3. **Raw data is sacred.** Every published number must be recomputable from `results/*.jsonl`. Never edit a runs file by hand. Contaminated runs get a clean rerun under a new experiment name; the old file is deleted, not doctored.

4. **Node ESM, stdlib-first.** The runner is dependency-free Node 22 (`node:` imports only). Gate scripts are POSIX bash. Do not add frameworks for what a function can do.

5. **No em-dashes (U+2014) in any user-facing string or article.** Use comma, period, colon, or parens.

6. **No "Generated with Claude Code" / "Co-Authored-By: Claude" trailers** in commits intended for GitHub.

7. **No operator-identity or host internals** in tracked files: no real names, no private hostnames, no internal absolute paths, no internal IPs. Host specifics go through env vars (`MODELS`, `SWITCH_CMD`) or gitignored local config.

8. **Two opencode footguns, never reintroduce:** `opencode run` needs `stdin: 'ignore'` (blocks forever on open stdin); per-arm isolation goes through `OPENCODE_CONFIG`, and prompt injection through `AGENTS.md` in the workdir (project `opencode.json` `instructions` is silently ignored).

9. **Articles follow `article/TEMPLATE.md`**: verdict box first (ADOPT / SITUATIONAL / SKIP), mandatory "Do I run it?" disclosure, limitations section, reproduce section.

10. **Read in this order:** `README.md` for design constraints, this file for ground rules, `results/VERDICT.md` + `results/FINDINGS-*.md` for what has been measured, `git log -5` for context.

## Adding an experiment (the only common task)

- New MCP: arm in `runner/arms.js` with an `mcp` block (`__WORKDIR__` is substituted per run).
- New skill/prompt: arm with `agentsFile` pointing into `prompts/` (store the upstream prompt verbatim, note the source commit).
- New task: fixture dir (plain files, no nested `.git`) + gate script in `tasks/<name>/` + entry in `runner/tasks.js` with a frozen checklist or gate.
- Then: smoke (`node runner/smoke.js <arm> <model> <task>`), matrix (`EXPERIMENT=... ARMS=... TASK_NAME=... N=... node runner/bench.js`), aggregate, findings doc.
