# Quality Stop Trigger

Primary source: `hooks/stop/quality-analysis-trigger.json`.

## What a Stop Trigger Does

A Stop hook fires when Claude Code's session ends or when a tool call completes with specific patterns. Unlike PreToolUse hooks that can block individual tool calls, Stop hooks surface suggestions at the session boundary — they do not block any operation. The `suggestOnlyDontBlock: true` flag ensures this.

## Trigger Conditions

The quality-analysis-trigger fires when any one of these is detected:

| Pattern | Signal | Example |
|---------|--------|---------|
| Repeated error | Same error type 2+ times in session | Field History Tracking limit hit twice |
| User friction | Phrases indicating manual workaround | "This keeps happening", "Can we automate this" |
| High tool failure rate | 3+ tool calls failed with errors | 5 SOQL query errors, 3 deployment failures |
| Workflow repetition | Same steps executed 3+ times | Re-authenticating, re-running same validation |
| Agent routing correction | Wrong agent used then corrected | User redirected from sfdc-query-specialist to sfdc-data-operations |

## Non-Trigger Conditions

The trigger must NOT fire for:
- First occurrence of any error.
- Expected validation failures during development (testing error handling intentionally).
- Simple typos or one-time mistakes.
- Learning/exploration sessions.

## Stop Hook JSON Structure

```json
{
  "name": "quality-analysis-trigger",
  "type": "prompt-based",
  "model": "haiku",
  "timeout": 5000,
  "evaluationPrompt": "...pattern detection prompt...",
  "triggerAction": {
    "type": "suggestion",
    "message": "Quality Analysis Recommended\n\nI've detected patterns that suggest running quality analysis:\n- {reason}\n\nWould you like me to run /reflect?",
    "commands": ["/reflect"]
  },
  "triggerOn": "TRIGGER:",
  "suggestOnlyDontBlock": true
}
```

## Writing the Evaluation Prompt

The evaluation prompt is sent to a fast model (haiku) with the session history. The response must be one of:
- `TRIGGER: [brief reason]` — fires the trigger action
- `NO_TRIGGER: [brief reason]` — does nothing

Keep the prompt under 1000 tokens. Structure it with clear TRIGGER examples and DO NOT TRIGGER examples so the model has deterministic guidance.

## Graceful Halt Pattern

When a quality stop fires, it suggests `/reflect` — a soft stop that captures the session for improvement. This is a graceful halt (suggestion) not a hard abort (block):

```bash
# Hard abort (blocking — only for safety hooks, never for quality stops)
exit 1

# Graceful halt (suggestion — appropriate for quality stops)
# Implemented via suggestOnlyDontBlock: true in the JSON config
# The suggestion appears as a message but does not prevent further tool calls
```

## Kill Switch for Quality Stops

```bash
# Disable quality analysis trigger for this session
export QUALITY_STOP_ENABLED=false

# Or disable all stop hooks
export OPSPAL_STOP_HOOKS_ENABLED=false
```

## Tuning Trigger Sensitivity

If the trigger fires too often (alert fatigue):
1. Increase the error count threshold ("same type of error occurred **3+** times" instead of 2+).
2. Add more specific patterns to the DO NOT TRIGGER list.
3. Require multiple conditions to be true simultaneously (AND logic instead of OR).

If the trigger misses real patterns:
1. Add more example friction phrases to the evaluation prompt.
2. Lower the repetition threshold.
3. Add specific Salesforce error signatures (e.g., "FIELD_INTEGRITY_EXCEPTION", "UNABLE_TO_LOCK_ROW").
