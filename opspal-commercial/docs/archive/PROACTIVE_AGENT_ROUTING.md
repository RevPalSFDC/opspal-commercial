# Proactive Agent Routing System

## Overview

The OpsPal Internal Plugins project implements **automatic agent routing** via Claude Code hooks. This system proactively suggests or enforces agent usage based on task patterns and complexity analysis, eliminating reliance on manual agent invocation.

**Status**: ✅ **Production Ready** (Implemented 2025-10-17)

**Benefits**:
- **Prevents errors**: Blocks high-risk operations without proper agents
- **Improves consistency**: Always routes to the right agent for the task
- **Provides intelligence**: Complexity scoring + confidence levels
- **Zero manual overhead**: Runs automatically on every user request

---

## Architecture

### Three-Layer Routing System

```
User Request
    ↓
[UserPromptSubmit Hook]
    ↓
┌─────────────────────────────────────┐
│  Layer 1: Pattern Matching          │  ← Fast, high-confidence blocking
│  (user-prompt-submit-enhanced.sh)   │     for known MANDATORY operations
└─────────────────────────────────────┘
    ↓ (if no mandatory match)
┌─────────────────────────────────────┐
│  Layer 2: Auto-Router Analysis      │  ← Complexity scoring (0.0-1.0)
│  (auto-agent-router.js)              │     Confidence scoring (0.0-1.0)
└─────────────────────────────────────┘
    ↓
┌─────────────────────────────────────┐
│  Layer 3: Hybrid Combiner           │  ← Merges both outputs for
│  (user-prompt-hybrid.sh)             │     optimal routing decision
└─────────────────────────────────────┘
    ↓
systemMessage injected into Claude's context
```

### Hook Configuration

**File**: `.claude/settings.json`

```json
{
  "hooks": {
    "UserPromptSubmit": {
      "command": "bash ${CLAUDE_PLUGIN_ROOT}/.claude-plugins/opspal-salesforce/hooks/user-prompt-hybrid.sh",
      "timeout": 7000,
      "description": "Hybrid agent routing with pattern matching + complexity analysis"
    },
    "SessionStart": {
      "command": "bash ${CLAUDE_PLUGIN_ROOT}/.claude-plugins/opspal-salesforce/hooks/session-start-agent-reminder.sh",
      "timeout": 3000,
      "description": "Session initialization"
    }
  }
}
```

---

## Routing Rules

### Mandatory Operations (BLOCKING)

These operations **CANNOT proceed** without using the specified agent:

| Pattern | Agent | Reason |
|---------|-------|--------|
| `deploy.*production` | `release-coordinator` | Prevents deployment failures |
| `delete.*(field\|object\|class)` | `sfdc-metadata-manager` | Prevents data loss |
| `permission.*set.*(create\|update)` | `sfdc-security-admin` | Security enforcement |
| `bulk.*(update\|insert\|delete)` | `sfdc-data-operations` | Data integrity |
| `update.*[0-9]{3,}.*record` | `sfdc-data-operations` | Bulk safety |
| `(create\|update\|modify).*(flow\|workflow)` | `sfdc-automation-builder` | Automation best practices |

**Behavior**: Returns `systemMessage` with `mandatoryAgent: true`, instructs Claude to use Task tool

### Suggested Operations (NON-BLOCKING)

These operations benefit from agent usage but aren't mandatory:

| Pattern | Agent | Complexity Threshold |
|---------|-------|---------------------|
| `conflict\|failed\|mismatch` | `sfdc-conflict-resolver` | Any |
| `merge.*field\|consolidate` | `sfdc-merge-orchestrator` | >0.3 |
| `complex\|planning\|strategy` | `sfdc-planner` | >0.5 |
| `metadata\|field\|object` | `sfdc-metadata-manager` | >0.2 |
| `permission\|profile\|FLS` | `sfdc-security-admin` | Any |
| `data.*import\|bulk\|export` | `sfdc-data-operations` | >0.3 |
| `apex\|trigger\|class\|test` | `sfdc-apex-developer` | >0.4 |
| `flow\|automation\|workflow` | `sfdc-automation-builder` | >0.3 |
| `report\|dashboard\|analytics` | `sfdc-reports-dashboards` | >0.2 |

**Behavior**: Returns `systemMessage` with `mandatoryAgent: false`, provides complexity/confidence scores

---

## Complexity Scoring

The auto-router calculates a **complexity score** (0.0 - 1.0) based on:

| Factor | Weight | Examples |
|--------|--------|----------|
| Multiple objects/fields | +0.1 per match | "update 5 fields" → +0.5 |
| Bulk operations | +0.3 | "bulk update", "mass import" |
| Production environment | +0.4 | "deploy to production" |
| Dependencies | +0.2 | "circular dependency" |
| Complex patterns | +0.3 | "merge", "consolidate", "migrate" |
| Error/conflict keywords | +0.3 | "failed", "conflict" |

**Thresholds**:
- **0.0 - 0.3**: Simple (direct execution OK)
- **0.3 - 0.7**: Medium (agent recommended)
- **0.7 - 1.0**: High (agent strongly recommended or mandatory)

### Confidence Scoring

Confidence represents how certain the router is about the agent match:

- **1.0** = Mandatory pattern match (blocks execution)
- **0.8 - 0.9** = High confidence (strong recommendation)
- **0.5 - 0.7** = Medium confidence (suggestion)
- **0.0 - 0.4** = Low confidence (no strong opinion)

---

## Hook Output Format

All hooks return JSON with this structure:

```json
{
  "systemMessage": "Message injected into Claude's context",
  "suggestedAgent": "agent-name",
  "mandatoryAgent": true,
  "complexity": 0.75,
  "confidence": 0.90,
  "source": "hybrid"
}
```

**Fields**:
- `systemMessage` (string): Displayed to Claude before execution
- `suggestedAgent` (string): Which agent to use
- `mandatoryAgent` (boolean): Whether this is enforced (true) or suggested (false)
- `complexity` (number): 0.0-1.0 complexity score
- `confidence` (number): 0.0-1.0 confidence score
- `source` (string): "enhanced", "auto-router", or "hybrid"

---

## Testing

### Manual Testing

```bash
# Test with mandatory operation
echo '{"user_message": "deploy to production"}' | \
  CLAUDE_PLUGIN_ROOT=.claude-plugins/opspal-salesforce \
  bash .claude-plugins/opspal-salesforce/hooks/user-prompt-hybrid.sh

# Expected: mandatoryAgent: true, blocks execution

# Test with suggested operation
echo '{"user_message": "create a new custom field"}' | \
  CLAUDE_PLUGIN_ROOT=.claude-plugins/opspal-salesforce \
  bash .claude-plugins/opspal-salesforce/hooks/user-prompt-hybrid.sh

# Expected: mandatoryAgent: false, provides complexity/confidence

# Test with no match
echo '{"user_message": "help me understand this code"}' | \
  CLAUDE_PLUGIN_ROOT=.claude-plugins/opspal-salesforce \
  bash .claude-plugins/opspal-salesforce/hooks/user-prompt-hybrid.sh

# Expected: empty JSON {}
```

### In-Session Testing

Start a new Claude Code session in this directory:

```bash
cd opspal-internal-plugins
claude
```

Try these prompts:

1. **Mandatory block**: "deploy metadata to production"
   - ✅ Should display blocking message
   - ✅ Should suggest release-coordinator agent

2. **Suggested with complexity**: "bulk update 1000 accounts"
   - ✅ Should suggest sfdc-data-operations
   - ✅ Should show complexity ~30%, confidence ~70%

3. **No match**: "explain this function"
   - ✅ Should proceed normally with no routing message

---

## Configuration

### Disabling Hooks Temporarily

Create `.claude/settings.local.json`:

```json
{
  "disableAllHooks": true
}
```

Or disable specific hooks:

```json
{
  "hooks": {
    "UserPromptSubmit": null
  }
}
```

### Adjusting Timeout

If hooks are timing out:

```json
{
  "hooks": {
    "UserPromptSubmit": {
      "timeout": 10000
    }
  }
}
```

### Debug Mode

Enable hook debugging:

```bash
export CLAUDE_DEBUG=1
claude --debug
```

Hook output appears in `~/.claude/logs/debug.log`

---

## Troubleshooting

### Hook Not Running

**Symptom**: No agent suggestions appear

**Checks**:
1. Verify hook is configured: `cat .claude/settings.json`
2. Check hook is executable: `ls -la .claude-plugins/opspal-salesforce/hooks/*.sh`
3. Test hook manually: `echo '{"user_message":"test"}' | bash .claude-plugins/opspal-salesforce/hooks/user-prompt-hybrid.sh`
4. Check debug logs: `tail -f ~/.claude/logs/debug.log`

### Hook Timeout

**Symptom**: "Hook timed out" errors

**Fixes**:
- Increase timeout in settings.json (default 7000ms)
- Check auto-router performance: `time node scripts/auto-agent-router.js route "test"`
- Disable auto-router if slow: Use enhanced hook only

### Wrong Agent Suggested

**Symptom**: Hook suggests incorrect agent

**Fixes**:
- Update patterns in `user-prompt-submit-enhanced.sh`
- Adjust complexity thresholds in `auto-agent-router.js`
- Add new pattern to MANDATORY_OPS or SUGGESTED_OPS arrays

### No Match When Expected

**Symptom**: Operation should match but doesn't

**Debug**:
```bash
# Test pattern matching directly
echo "bulk update 500 records" | grep -iE "bulk.*(update|insert|delete)"

# Test auto-router
node scripts/auto-agent-router.js route "bulk update 500 records"
```

---

## Performance

### Benchmarks

| Hook | Average Time | Max Time | Timeout |
|------|-------------|----------|---------|
| Enhanced (pattern only) | 50ms | 150ms | 5000ms |
| Auto-router only | 200ms | 500ms | 7000ms |
| Hybrid (both) | 250ms | 600ms | 7000ms |
| SessionStart | 30ms | 100ms | 3000ms |

**Note**: Hook execution is **non-blocking** for user input - Claude waits for hook completion before processing request.

### Optimization Tips

1. **Pattern matching is faster** - Use enhanced hook for known operations
2. **Auto-router for unknown** - Falls back to complexity analysis
3. **Cache results** - Auto-router caches agent usage analytics
4. **Timeout wisely** - 7s is reasonable for hybrid approach

---

## Analytics & Monitoring

### Usage Analytics

Auto-router tracks:
- Agent invocation count
- Success/failure rates
- Auto-invoked vs manual confirmations
- Pattern match frequency

**View analytics**:
```bash
node scripts/auto-agent-router.js report
```

### Hook Execution Log

Hooks log to `~/.claude/logs/debug.log` when `--debug` flag is used:

```bash
claude --debug
tail -f ~/.claude/logs/debug.log | grep Hook
```

---

## Future Enhancements

### Planned (Phase 3)

1. **Agent Compliance Tracking**
   - Log every routing decision
   - Track compliance over time
   - Generate monthly reports
   - `/agent-compliance` slash command

2. **Machine Learning Integration**
   - Learn from successful agent usage
   - Adjust confidence scores based on outcomes
   - Personalized routing per user

3. **Multi-Platform Support**
   - Extend to HubSpot plugin
   - Cross-platform routing decisions
   - Unified routing analytics

### Configuration Options

**File**: `.claude/agent-routing-config.json` (future)

```json
{
  "routing": {
    "enableAutoRouter": true,
    "enablePatternMatching": true,
    "complexityThreshold": 0.7,
    "confidenceThreshold": 0.8,
    "enableAnalytics": true,
    "trackCompliance": true
  }
}
```

---

## References

- **Claude Code Hooks Documentation**: https://docs.claude.com/en/docs/claude-code/hooks
- **Hook Implementation**: `.claude-plugins/opspal-salesforce/hooks/`
- **Auto-Router Source**: `.claude-plugins/opspal-salesforce/scripts/auto-agent-router.js`
- **Configuration**: `.claude/settings.json`
- **Agent Discovery Table**: `CLAUDE.md` - "Agent Discovery & Routing" section

---

**Last Updated**: 2025-10-17
**Status**: Production Ready
**Maintained By**: RevPal Engineering
