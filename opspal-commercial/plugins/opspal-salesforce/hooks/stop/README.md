# Prompt-Based Stop Hooks

**NEW in Claude Code v2.0.35+**: Intelligent automation triggers using LLM-based condition evaluation.

## Overview

Prompt-based stop hooks use Claude to analyze conversation context and automatically suggest actions when specific conditions are met. Unlike traditional hooks that run on every event, these hooks evaluate complex patterns and provide contextual suggestions.

**Key Features** (from Claude Code v2.0.41):
- **Model Selection**: Specify `haiku`, `sonnet`, or `opus` for evaluation (default: haiku for speed)
- **Custom Timeouts**: Configure per-hook timeout values
- **Non-Blocking**: Suggestions only, user maintains control
- **Context-Aware**: Full conversation history available for evaluation

## Available Stop Hooks

### 1. Quality Analysis Trigger

**File**: `quality-analysis-trigger.json`
**Purpose**: Detects patterns indicating need for quality analysis
**Model**: Haiku (fast evaluation, ~200ms)
**Timeout**: 5000ms

**Triggers On**:
- Repeated error patterns (2+ occurrences)
- User friction signals ("this keeps happening", "why do I have to...")
- Multiple tool failures (3+ errors)
- Workflow inefficiency (3+ repetitions)
- Agent routing issues

**Action**: Suggests running `/reflect` for session analysis

**Example Trigger**:
```
User encounters "Field history tracking limit exceeded" error twice
→ Hook evaluates: "TRIGGER: Deployment failed twice with field history tracking limit"
→ Suggests: "Would you like me to run /reflect to analyze this session?"
```

### 2. Release Coordination Trigger

**File**: `release-coordination-trigger.json`
**Purpose**: Detects when release-coordinator should be invoked
**Model**: Haiku (fast evaluation, ~200ms)
**Timeout**: 5000ms

**Triggers On**:
- Git merge to main/master branch
- Production deployment intent
- Release tag creation
- Multi-platform changes
- Breaking changes
- Post-merge checklist requests

**Action**: Suggests invoking `release-coordinator` agent

**Example Trigger**:
```
User runs: git push origin main
→ Hook evaluates: "TRIGGER: Merged feature branch to main with git push"
→ Suggests: "Would you like me to invoke the release-coordinator agent?"
```

## Configuration

### Enable Stop Hooks in Settings

Add to `.claude/settings.json` or `settings.local.json`:

```json
{
  "hooks": {
    "Stop": [
      {
        "matcher": {},
        "hooks": [
          {
            "type": "prompt-based",
            "configPath": "${CLAUDE_PLUGIN_ROOT}/.claude-plugins/opspal-salesforce/hooks/stop/quality-analysis-trigger.json"
          },
          {
            "type": "prompt-based",
            "configPath": "${CLAUDE_PLUGIN_ROOT}/.claude-plugins/opspal-salesforce/hooks/stop/release-coordination-trigger.json"
          }
        ]
      }
    ]
  }
}
```

### Custom Configuration

Create your own stop hook:

```json
{
  "name": "custom-trigger",
  "description": "Detects when [condition]",
  "type": "prompt-based",
  "model": "haiku",
  "timeout": 5000,
  "evaluationPrompt": "Analyze the conversation to determine if [condition].\n\nTrigger if: [criteria]\n\nRespond with:\n- \"TRIGGER: [reason]\" - if condition met\n- \"NO_TRIGGER: [reason]\" - if not met",
  "triggerAction": {
    "type": "suggestion",
    "message": "💡 **Action Recommended**\n\n[Message to user]\n\n[Call to action]",
    "commands": ["/command-to-run"]
  },
  "triggerOn": "TRIGGER:",
  "suggestOnlyDontBlock": true
}
```

## Model Selection Guide

Choose the right model for your hook's needs:

| Model | Speed | Cost | Use When |
|-------|-------|------|----------|
| **Haiku** | ~200ms | Low | Pattern detection, simple logic |
| **Sonnet** | ~500ms | Medium | Complex evaluation, nuanced decisions |
| **Opus** | ~1000ms | High | Critical decisions, multi-factor analysis |

**Recommendation**: Use Haiku for stop hooks (fast, low-latency suggestions).

## Timeout Configuration

```json
{
  "timeout": 5000,  // 5 seconds (recommended for Haiku)
  "timeout": 10000, // 10 seconds (if using Sonnet)
  "timeout": 15000  // 15 seconds (if using Opus)
}
```

**Best Practices**:
- Haiku: 3000-5000ms
- Sonnet: 8000-12000ms
- Opus: 12000-20000ms

## Benefits

### 1. Proactive Automation
- Detects patterns users might miss
- Suggests actions at the right moment
- Reduces manual process tracking

### 2. Context-Aware
- Evaluates full conversation history
- Understands user intent and workflow
- Adapts to different scenarios

### 3. Non-Intrusive
- Suggestions only, not blocking
- User maintains control
- Can be dismissed or accepted

### 4. Intelligent
- Uses LLM reasoning, not simple regex
- Handles complex conditions
- Adapts to new patterns

## Troubleshooting

### Hook Not Triggering

**Check**:
1. Verify configuration in settings.json
2. Ensure `configPath` points to correct JSON file
3. Check hook logs: `~/.claude/logs/debug.log` (run with `--debug`)
4. Verify model parameter is valid (`haiku`, `sonnet`, `opus`)

**Debug**:
```bash
# Enable debug logging
claude --debug

# Check for hook errors
tail -f ~/.claude/logs/debug.log | grep "stop-hook"
```

### Timeout Errors

**Symptoms**: "Hook timed out" errors in logs

**Fix**:
- Increase `timeout` value in JSON config
- Use faster model (haiku instead of sonnet)
- Simplify evaluation prompt

### False Positives

**Symptoms**: Hook triggers when it shouldn't

**Fix**:
- Refine `evaluationPrompt` with more specific criteria
- Add examples to "DO NOT Trigger For" section
- Test with different scenarios

## Examples

### Quality Analysis Use Case

**Scenario**: User encounters picklist formula error twice

**Conversation**:
```
User: "Deploy this validation rule"
Claude: [Deploys validation rule]
Error: Invalid picklist formula using ISBLANK()

User: "Fix the formula and deploy again"
Claude: [Fixes formula, deploys]

[Quality Analysis Stop Hook Evaluates]
→ "TRIGGER: Deployment failed twice with picklist formula error"

Claude: "💡 Quality Analysis Recommended
I've detected patterns that suggest running quality analysis:
- Deployment failed twice with picklist formula error

Would you like me to run /reflect to analyze this session?"
```

### Release Coordination Use Case

**Scenario**: User merges to main branch

**Conversation**:
```
User: "Everything looks good, let's merge to main"
Claude: [Assists with git merge]

User: "git push origin main"
[Release Coordination Stop Hook Evaluates]
→ "TRIGGER: Merged feature branch to main with git push"

Claude: "🚀 Release Coordination Recommended
I've detected indicators that suggest invoking the release-coordinator:
- Merged feature branch to main with git push

The release-coordinator will:
- Validate release readiness
- Execute release workflow
- Send notifications
- Update dependent projects

Would you like me to invoke the release-coordinator agent?"
```

## Related Documentation

- **Hooks Guide**: https://docs.claude.com/en/docs/claude-code/hooks
- **Stop Hooks**: https://docs.claude.com/en/docs/claude-code/hooks#stop-hooks
- **Model Selection**: `/model` command in Claude Code

## Version History

- **v3.45.0** (2025-11-14): Initial release with 2 stop hooks
  - Quality Analysis Trigger
  - Release Coordination Trigger
  - Haiku model selection for fast evaluation
  - Non-blocking suggestions only

---

**Last Updated**: 2025-11-14
**Plugin Version**: 3.45.0
