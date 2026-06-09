# opencode provider spike — findings (2026-06-09)

**Verdict: GREEN.** `opencode run --format json` exposes everything the promptfoo provider needs. No `opencode export` fallback required.

## How the spike ran

```
opencode run --format json -m local-qwen/qwen3.6-35b --dir /tmp/ab-spike \
  "Append a new line containing exactly the word spike to hello.txt"
```

- Ran against the resident local Qwen3.6 (`switch.sh status` → qwen RUNNING @ :30001; opencode `local-qwen` → `http://localhost:30001/v1`).
- exit 0; the file was actually edited (read + edit tools), so **`run` mode auto-approves file edits** — no permission prompt to handle.

## Output shape

stdout is **JSONL** — one object per event: `{type, timestamp, sessionID, part}`. The `part` carries the payload, keyed by `part.type`:

- `step-start`, `step-finish`, `tool`, `text`.

### Tool calls

Count = number of objects where `part.type == "tool"` (equivalently `part.tool` is set). Spike: `read` + `edit` = **2**. Each tool part has `part.state.input` (e.g. edit → `{filePath, oldString, newString}`), `part.state.output`, and `part.state.time = {start, end}`.

### Tokens

Each `step-finish` carries:
```json
"part.tokens": {"total": 12488, "input": 12456, "output": 32, "reasoning": 0, "cache": {"write": 0, "read": 0}}
"part.cost": 0
```
`cost = 0` for local models (expected). Aggregation rule for the provider: sum `output` across step-finish events = generated tokens; sum `input` = context tokens processed; report both plus `total`. (Document this choice; it is consistent across arms, which is what matters.)

### Wallclock

Outer event `timestamp` (ms). Spike first→last = **3088 ms**. The provider returns this as `latencyMs`; promptfoo also records its own latency.

## Provider mapping (promptfoo)

The custom provider returns:
- `output` — final assistant text (from the `text` part)
- `tokenUsage` — `{total, prompt: sum(input), completion: sum(output)}`
- `cost` — 0 for local
- metadata: `toolCalls` (count + list of tool names), `latencyMs`

Gates (build/test) run as promptfoo exec asserts on the mutated `--dir` after the run.

## Side finding (not blocking local thesis)

The configured `ANTHROPIC_API_KEY` has **no credit balance** ("Your credit balance is too low"). The Opus reference row needs a funded Anthropic account before it can run. Local matrix (Mistral-Small-4 + Qwen3.6) is unaffected.
