# Ambient Reflection System — Developer Guide

## Architecture

The ambient reflection system captures high-signal events (tool errors, user corrections, hook failures, workflow gaps, skill candidates) incrementally during a Claude Code session, compiles them into structured reflection payloads, and submits them for analysis — all without requiring user action.

### Data Flow

```
Hook Events (PostToolUse, Stop, PreCompact, TaskCompleted, UserPromptSubmit)
    |
    +-- ambient-candidate-extractor.sh -----> extractors/*.js
    |       PostToolUse   -> post-tool-extractor.js
    |       UserPromptSubmit -> user-prompt-extractor.js
    |       SubagentStop  -> subagent-extractor.js
    |       TaskCompleted -> task-completed-extractor.js
    |
    +-- ambient-hook-error-observer.sh -----> hook-reflection-interceptor.js
    |       reads hook-errors.jsonl (watermark-based)
    |       classifies: circuit_breaker_open, timeout, validation_failure,
    |                   contract_violation, malformed_output, recovery_failure,
    |                   non_zero_exit
    |       dedupes within session, suppresses cross-session duplicates
    |       crash-safe persistence on failure
    |       immediate flush for immediate-priority errors
    |
    +-- ambient-flush-trigger.sh ----------> flush-trigger-engine.js
            evaluates 14 flush conditions
            drains buffer -> compileCandidates() -> submitPayloads()
            mode-aware dispatch (shadow / auto_submit / manual_only)
```

### Key Components

| Component | File | Purpose |
|-----------|------|---------|
| Buffer | `scripts/lib/ambient/reflection-candidate-buffer.js` | Per-session candidate storage (write-through to disk) |
| Observer | `scripts/lib/ambient/hook-error-observer.js` | Reads `hook-errors.jsonl`, classifies entries |
| Interceptor | `scripts/lib/ambient/hook-reflection-interceptor.js` | Full hook error pipeline: crash-safe, dedup, escalation, flush |
| Flush Engine | `scripts/lib/ambient/flush-trigger-engine.js` | Multi-condition flush decision logic |
| Compiler | `scripts/lib/ambient/reflection-compiler.js` | Dedup, merge, score, build reflection payloads |
| Submitter | `scripts/lib/ambient/ambient-reflection-submitter.js` | Mode-aware submission to Supabase or shadow file |
| Skill Detector | `scripts/lib/ambient/skill-candidate-detector.js` | Cross-session pattern detection, structured skill opportunities |
| Telemetry | `scripts/lib/ambient/ambient-telemetry.js` | Lightweight metrics tracking |
| Config | `config/ambient-reflection-config.json` | All tunable thresholds |

## Modes

The system operates in one of three modes, controlled by `config.mode` or `AMBIENT_REFLECT_MODE` env var:

### `shadow_mode` (default)

- Candidates are collected and compiled normally.
- Payloads are written to `~/.claude/ambient-reflections/shadow-{sessionId}.jsonl` instead of being submitted.
- No network calls. Safe for rollout validation.
- Use `node ambient-reflection-submitter.js review --session <id>` to inspect shadow payloads.
- Use `node shadow-validator.js --session <id> --manual <file>` to compare against a manual `/reflect`.

### `auto_submit`

- Full pipeline: collect, compile, submit to Supabase.
- Failed submissions are queued to `ambient-retry-queue.jsonl` for retry.
- Immediate hook errors attempt submission without waiting for normal batching.

### `manual_only`

- Candidates accumulate in the buffer but are never auto-flushed.
- Only `manual_reflect` trigger (from `/reflect`) or `force: true` causes a flush.
- Hook errors are still captured locally; they just aren't submitted until the user runs `/reflect`.

## Tuning Thresholds

All thresholds are in `config/ambient-reflection-config.json`:

### Buffer

| Key | Default | Effect |
|-----|---------|--------|
| `buffer.maxCandidates` | 200 | Max buffered candidates before oldest are evicted |
| `buffer.maxAgeMinutes` | 120 | Candidates older than this trigger age-based flush |
| `buffer.flushIntervalSeconds` | 60 | Minimum time between flushes |
| `buffer.taskCompletionFlushThreshold` | 5 | Candidates needed for `task_completion` flush |
| `buffer.repeatedFrictionThreshold` | 3 | High/immediate candidates needed for `repeated_friction` flush |
| `buffer.topicTransitionMinCandidates` | 8 | Minimum candidates to detect topic transition |

### Compiler

| Key | Default | Effect |
|-----|---------|--------|
| `compiler.minScoreToKeep` | 0.3 | Candidates below this score are dropped |
| `compiler.dedupeWindowMinutes` | 10 | Time window for merge-dedup of adjacent candidates |
| `compiler.maxIssuesPerReflection` | 25 | Maximum issues in a single reflection payload |

### Skill Candidate

| Key | Default | Effect |
|-----|---------|--------|
| `skillCandidate.patternRepeatThreshold` | 3 | Minimum repeats to surface a skill candidate |
| `skillCandidate.crossSessionWindowDays` | 7 | Window for cross-session signal comparison |
| `skillCandidate.crossSessionSessionThreshold` | 2 | Sessions needed to escalate to immediate |

### Hook Reflection

| Key | Default | Effect |
|-----|---------|--------|
| `hookReflection.enabled` | true | Master switch for hook error reflection |
| `hookReflection.immediateFlushOnError` | true | Immediate flush for `immediate` priority hook errors |
| `hookReflection.dedupeWindowSeconds` | 300 | In-session dedup window for hook errors |
| `hookReflection.crossSessionWindowSeconds` | 86400 | Cross-session suppression window (24h) |
| `hookReflection.crashSafeFile` | `hook-reflection-crash-safe.jsonl` | Crash-safe persistence file name |
| `hookReflection.maxCrashSafeEntries` | 100 | Maximum crash-safe entries before trimming |

### Hook Observer

| Key | Default | Effect |
|-----|---------|--------|
| `hookObserver.captureTimeouts` | true | Capture timeout-classified hook errors |
| `hookObserver.captureNonZeroExits` | true | Capture generic non-zero exit errors |

## Hook Error Behavior

### Classification Priority

| Classification | Default Priority | Severity Score | Trigger |
|----------------|-----------------|----------------|---------|
| `circuit_breaker_open` | `immediate` | 0.95 | Message contains "circuit breaker" + "open" |
| `recovery_failure` | `immediate` | 0.95 | `recovery_succeeded=false` and `exit_code != 0` |
| `contract_violation` | `high` | 0.75 | Message/context contains "contract" and `exit_code != 0` |
| `timeout` | `high` | 0.75 | Message/context contains "timeout" |
| `validation_failure` | `normal` (→ `high` if retries >= 2) | 0.55 | Message/context contains "validation" |
| `malformed_output` | `normal` | 0.55 | Message/context contains "malformed" |
| `non_zero_exit` | `normal` (→ `high` if 2+ prior) | 0.55 | Default for unclassified non-zero exits |

### Escalation Rules

- **In-session**: If a candidate's `dedup_key` appears 3+ times (via `repeat_count`), priority escalates to `immediate` with `severity_score: 0.95`.
- **Cross-session**: Candidates seen in prior sessions (same `dedup_key`, same `exit_code`, no new stack trace) are suppressed — unless classification is `circuit_breaker_open` or `recovery_failure`.

### Enriched JSONL Fields

The shared `error-handler.sh` writes these fields to `~/.claude/logs/hook-errors.jsonl`:

```json
{
  "timestamp": "ISO-8601",
  "level": "error|warn",
  "hook": "hook-name",
  "hook_phase": "PreToolUse|PostToolUse|Stop|...",
  "triggering_action": "tool or command name",
  "message": "error description",
  "context": "additional context",
  "details": "stack/exit info",
  "exit_code": 1,
  "retry_count": 0,
  "recovery_succeeded": "true|false|",
  "stack_trace": "fn@file:line>fn@file:line"
}
```

## Queue and Retry Behavior

### Normal Flow

```
Buffer → evaluateFlushTrigger (trigger-based) → compileCandidates → submitPayloads
```

### Immediate Hook Error Flow

```
Buffer → interceptor detects immediate priority → evaluateFlushTrigger('hook_error_immediate')
  → compileCandidates → submitPayloads
```

### Failure Recovery

| Failure Point | Recovery |
|---------------|----------|
| Buffer write fails | Candidates written to `hook-reflection-crash-safe.jsonl` |
| Submission fails (`auto_submit`) | Payload queued to `ambient-retry-queue.jsonl` |
| Flush engine fails | Candidates written to crash-safe file |
| Process crash | Crash-safe file replayed on next interceptor invocation |

### Retry Queue

- Location: `~/.claude/ambient-reflections/ambient-retry-queue.jsonl`
- Processed by `ReflectionReliabilityManager.retryFailedSubmissions()` during session-end hook
- Exponential backoff: 1s base, max 3 attempts
- Failed items marked `_permanentFailure: true` after max retries

### Idempotency

Replayed crash-safe entries carry their original `dedup_key`. The buffer's normalization preserves existing keys. The compiler's `dedupeCandidates()` merges by key, so replayed entries merge harmlessly with any in-flight candidates — even if replayed twice.

## How `/reflect` Interacts with the Ambient System

### Manual `/reflect` (user-initiated)

When a user runs `/reflect`:
1. The existing manual reflection pipeline collects the user's feedback.
2. If `manual_reflect` is passed as the flush trigger, `evaluateFlushTrigger({ trigger: 'manual_reflect', force: true })` fires.
3. This always flushes — even in `manual_only` mode.
4. Accumulated ambient candidates are compiled alongside the manual reflection context.

### Ambient + Manual coexistence

- Ambient captures run silently in the background.
- Manual `/reflect` drains the same buffer, so ambient candidates are included in the submission.
- After `/reflect`, the buffer is empty and the session's ambient capture restarts from zero.
- Shadow mode lets you compare what ambient captured vs. what the user manually wrote.

## Skill Candidate Detection

The system detects six opportunity patterns:

| Pattern | Trigger | Impact |
|---------|---------|--------|
| `repeated_workflow` | 3+ repeats across 2+ sessions | high |
| `brittle_manual_sequence` | workflow_gap with retry signals | high |
| `stable_task` | 2+ lessons/reusable patterns | medium |
| `corrective_guidance` | 2+ user corrections | medium |
| `automation_opportunity` | Wrong-agent or automation signals | high |
| `domain_encapsulation` | 4+ repeats with specific agent/tool | medium |

Each detected opportunity produces a structured object:

```json
{
  "suggested_name": "auto-sfdc-deployer",
  "problem": "Repeated workflow across interactions",
  "trigger_pattern": "Manual retry pattern; deploy failed",
  "expected_inputs": ["Bash invocation context"],
  "expected_outputs": ["sfdc-deployer result"],
  "execution_outline": ["Detect matching trigger", "Apply resolution", "Validate and return"],
  "example_requests": ["Manual retry pattern"],
  "confidence": 0.75,
  "estimated_impact": "high",
  "matched_patterns": ["repeated_workflow", "brittle_manual_sequence"]
}
```

## Telemetry

Lightweight per-session metrics are written to `~/.claude/ambient-reflections/ambient-telemetry.json`:

```bash
node scripts/lib/ambient/ambient-telemetry.js
```

Tracked metrics: candidates captured (by source/priority), compilations, submissions (accepted/rejected/queued), dedupe rate, skill candidates surfaced, shadow payloads, flush count/reasons, hook errors (total/immediate), crash-safe operations, retry queue depth.

## Rollout Guidance

### Phase 1: Shadow Mode (recommended start)

1. Deploy with `"mode": "shadow_mode"` (default).
2. Run sessions normally. Shadow files accumulate at `~/.claude/ambient-reflections/shadow-*.jsonl`.
3. After a few sessions, compare shadow vs. manual reflections:
   ```bash
   node scripts/lib/ambient/shadow-validator.js --session <id> --manual <reflection.json>
   ```
4. Target: >= 60% overlap rate before proceeding.

### Phase 2: Validate Hook Error Capture

1. Check hook health: `/hooks-health`
2. Verify hook error candidates appear in buffer:
   ```bash
   node scripts/lib/ambient/reflection-candidate-buffer.js stats
   ```
3. Review telemetry for dedupe rates and flush reasons.

### Phase 3: Enable Auto-Submit

1. Set `AMBIENT_REFLECT_MODE=auto_submit` (env var) or update config.
2. Monitor retry queue depth and submission success via telemetry.
3. Verify reflections appear in Supabase.

### Rollback

- Set `AMBIENT_REFLECT_MODE=manual_only` to stop all automatic submission.
- Set `hookReflection.enabled=false` to disable hook error capture entirely.
- Both are instant — no deployment needed, just env var or config change.

## Environment Variables

| Variable | Default | Effect |
|----------|---------|--------|
| `AMBIENT_REFLECT_MODE` | (from config) | Override mode: `manual_only`, `shadow_mode`, `auto_submit` |
| `AMBIENT_REFLECT_DEBUG` | `0` | Enable debug output to stderr |
| `AMBIENT_REFLECT_FORCE_FLUSH` | `0` | Force flush on every trigger evaluation |
| `AMBIENT_REFLECT_CAPTURE_RESULT` | `0` | Write flush result to stdout |
| `ENABLE_HOOK_STACK_TRACE` | `0` | Capture bash stack traces in hook errors |

## Files

### Runtime Data (per-session)

```
~/.claude/ambient-reflections/
  {sessionId}-candidates.json          # Active candidate buffer
  {sessionId}-last-flush.json          # Last flush metadata
  shadow-{sessionId}.jsonl             # Shadow mode payloads
  ambient-retry-queue.jsonl            # Failed submission retry queue
  ambient-telemetry.json               # Session telemetry
  hook-reflection-crash-safe.jsonl     # Crash-safe persistence
  skill-signals.jsonl                  # Cross-session skill signals
  .hook-error-watermark                # JSONL byte-offset watermark
```

### Source Code

```
scripts/lib/ambient/
  ambient-reflection-submitter.js      # Mode-aware submission
  ambient-telemetry.js                 # Metrics tracking
  config-loader.js                     # Config loading + env overrides
  flush-trigger-engine.js              # 14-condition flush logic
  hook-error-observer.js               # JSONL reader + classifier
  hook-reflection-interceptor.js       # Full hook error pipeline
  reflection-candidate-buffer.js       # Per-session buffer
  reflection-compiler.js               # Candidate → reflection payload
  shadow-validator.js                  # Shadow vs. manual comparison
  skill-candidate-detector.js          # Skill opportunity detection
  utils.js                             # Shared primitives
  extractors/
    post-tool-extractor.js             # PostToolUse signal extraction
    subagent-extractor.js              # SubagentStop signal extraction
    task-completed-extractor.js        # TaskCompleted signal extraction
    user-prompt-extractor.js           # UserPromptSubmit signal extraction
```

### Tests

```
test/ambient/
  ambient-comprehensive.test.js        # 21 scenarios covering full pipeline
  ambient-reflection-submitter.test.js # Shadow + auto_submit + retry
  config-loader.test.js                # Env override validation
  extractors.test.js                   # All 4 extractors
  flush-trigger-engine.test.js         # Flush conditions
  hook-error-observer.test.js          # Classification + watermark
  hook-reflection-interceptor.test.js  # Dedup + crash-safe + cross-session
  reflection-candidate-buffer.test.js  # Buffer CRUD
  reflection-compiler.test.js          # Compile + score + shape
  shadow-validator.test.js             # Overlap calculation
```
