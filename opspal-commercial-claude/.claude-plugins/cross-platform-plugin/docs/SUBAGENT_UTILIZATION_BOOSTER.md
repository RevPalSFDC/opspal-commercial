# Sub-Agent Utilization Booster

## Overview

The **Sub-Agent Utilization Booster** is a Claude Code hook that automatically encourages maximum delegation to specialized plugin agents and tools. It prepends a directive to every user message, increasing sub-agent utilization from typical ~30-40% to the target ≥70%.

**Status**: ✅ Production Ready
**Version**: 1.0.0
**Created**: 2025-10-20

## Problem Solved

**Before**: Users often forget to explicitly invoke agents (e.g., `@diagram-generator`), leading to:
- Low sub-agent utilization (~30-40%)
- Direct execution when specialized agents exist
- Underutilization of 100+ plugin agents
- Missed opportunities for delegation

**After**: Automatic prompt injection encourages Claude to:
- Maximize delegation to specialized agents
- Use plugin tools before direct execution
- Achieve ≥70% sub-agent utilization target
- Leverage the full plugin ecosystem

## How It Works

### Automatic Injection

Every user message is automatically prepended with:

```
Using the appropriate sub-agents, [user's message]
```

**Example**:
- **User types**: `"create a flowchart of the lead process"`
- **Claude receives**: `"Using the appropriate sub-agents, create a flowchart of the lead process"`
- **Result**: Claude invokes `@diagram-generator` instead of trying to create it directly

### Intensity Levels

Configure how strongly to encourage delegation:

#### Standard (Default)
```bash
SUBAGENT_BOOST_INTENSITY=standard
```
**Output**: `"Using the appropriate sub-agents, [message]"`

**Use when**: Normal operations, balanced approach

#### Strong
```bash
SUBAGENT_BOOST_INTENSITY=strong
```
**Output**: `"Using the appropriate sub-agents and tools from the installed plugins, [message]"`

**Use when**: You want explicit mention of plugin tools

#### Maximum
```bash
SUBAGENT_BOOST_INTENSITY=maximum
```
**Output**:
```
IMPORTANT: Maximize delegation to specialized sub-agents and plugin tools.
Avoid direct execution when agents are available.

Using the appropriate sub-agents, [message]
```

**Use when**:
- Training/onboarding new users
- Maximizing utilization metrics
- Complex projects with many specialized agents

## Configuration

### Enable/Disable

```bash
# Enable (default)
export ENABLE_SUBAGENT_BOOST=1

# Disable
export ENABLE_SUBAGENT_BOOST=0
```

### Set Intensity

```bash
# Standard (default)
export SUBAGENT_BOOST_INTENSITY=standard

# Strong
export SUBAGENT_BOOST_INTENSITY=strong

# Maximum
export SUBAGENT_BOOST_INTENSITY=maximum
```

### Project-Wide Configuration

Add to `.claude/settings.json`:

```json
{
  "hooks": {
    "UserPromptSubmit": {
      "command": "bash ${CLAUDE_PLUGIN_ROOT}/.claude-plugins/cross-platform-plugin/hooks/subagent-utilization-booster.sh",
      "timeout": 5000,
      "description": "Maximize sub-agent utilization by encouraging delegation"
    }
  },
  "environment": {
    "ENABLE_SUBAGENT_BOOST": "1",
    "SUBAGENT_BOOST_INTENSITY": "standard"
  }
}
```

### Per-Session Override

```bash
# Disable for one session
ENABLE_SUBAGENT_BOOST=0 claude

# Use maximum intensity for one session
SUBAGENT_BOOST_INTENSITY=maximum claude
```

## Integration with Routing

The booster **chains** with existing routing hooks:

1. **Booster runs first**: Prepends "Using the appropriate sub-agents, "
2. **Routing hook runs**: Analyzes message, suggests specific agents
3. **Combined output**: Boost + routing context

**Example** (production deployment):
```
User: "deploy to production"

Booster output: "Using the appropriate sub-agents, deploy to production"

Routing output: "⚠️ PRODUCTION DEPLOYMENT DETECTED
Requires: @release-coordinator"

Final message to Claude:
"Using the appropriate sub-agents, deploy to production

⚠️ PRODUCTION DEPLOYMENT DETECTED
Requires: @release-coordinator"
```

## Impact Metrics

### Expected Improvements

| Metric | Before | After | Target |
|--------|--------|-------|--------|
| Sub-agent utilization | 30-40% | 60-75% | ≥70% |
| Direct execution rate | 60-70% | 25-40% | ≤30% |
| Agent discovery | Manual | Automatic | - |
| User cognitive load | High | Low | - |

### Measuring Impact

Track utilization via Supervisor-Auditor reports:

```bash
# Check recent execution patterns
grep -r "Sub-agent Utilization" .claude-plugins/developer-tools-plugin/reports/

# Expected output:
# Sub-agent Utilization: 72.3% ✓ (target: ≥70%)
```

## Use Cases

### 1. New User Onboarding

**Problem**: New users don't know which agents exist
**Solution**: Set `SUBAGENT_BOOST_INTENSITY=maximum` during onboarding
**Result**: Users see explicit reminders to use agents, learn by example

### 2. Complex Projects

**Problem**: 100+ agents across 9 plugins - hard to remember all
**Solution**: Enable booster with `standard` intensity
**Result**: Claude automatically delegates to appropriate agents

### 3. Quality Audits

**Problem**: Need to measure sub-agent utilization
**Solution**: Enable booster, run Supervisor-Auditor analysis
**Result**: Achieve ≥70% utilization, pass quality targets

### 4. Performance Optimization

**Problem**: Direct execution is slower than specialized agents
**Solution**: Booster encourages agent delegation
**Result**: Faster execution via parallelization (Supervisor)

## Examples

### Example 1: Diagram Generation

**Without Booster**:
```
User: "create ERD for Account and Contact"
Claude: Attempts to create diagram syntax directly
Result: Manual work, possibly incorrect syntax
```

**With Booster**:
```
User: "create ERD for Account and Contact"
Claude receives: "Using the appropriate sub-agents, create ERD for Account and Contact"
Claude: Invokes @diagram-generator
Result: Professional ERD using mermaid-generator library
```

### Example 2: Salesforce Analysis

**Without Booster**:
```
User: "analyze automation in this org"
Claude: Runs basic queries
Result: Partial analysis
```

**With Booster**:
```
User: "analyze automation in this org"
Claude receives: "Using the appropriate sub-agents, analyze automation in this org"
Claude: Invokes @sfdc-automation-auditor
Result: Comprehensive automation inventory with recommendations
```

### Example 3: Complex Multi-Step Tasks

**Without Booster**:
```
User: "analyze dependencies across all custom objects"
Claude: Attempts sequential analysis
Result: Slow, manual execution
```

**With Booster (with Supervisor)**:
```
User: "analyze dependencies across all custom objects"
Claude receives: "Using the appropriate sub-agents, analyze dependencies..."
Claude: Invokes @supervisor-auditor
Supervisor: Delegates to @sfdc-dependency-analyzer
Result: Parallel analysis with automatic diagram generation
```

## Best Practices

### When to Enable

✅ **Enable (recommended)**:
- Multi-plugin projects (2+ plugins installed)
- New users learning the system
- Quality audits requiring utilization metrics
- Complex projects with many specialized agents

❌ **Disable** (optional):
- Single-user projects with no plugins
- Debugging specific agent issues
- When explicit control is needed

### Choosing Intensity

- **Standard**: Most projects - balanced, non-intrusive
- **Strong**: Explicit mention of plugins when users aren't aware of installed plugins
- **Maximum**: Training environments, complex projects, quality audits

### Combining with Routing

For best results, use BOTH:
1. **Routing hook** (salesforce-plugin): Blocks mandatory operations, suggests agents
2. **Booster hook** (cross-platform-plugin): Encourages general delegation

Configuration:
```json
{
  "hooks": {
    "UserPromptSubmit": {
      "command": "bash ${CLAUDE_PLUGIN_ROOT}/.claude-plugins/cross-platform-plugin/hooks/subagent-utilization-booster.sh",
      "timeout": 5000
    }
  }
}
```

Note: Booster automatically chains with routing if present.

## Troubleshooting

### Issue: Booster Not Working

**Symptom**: Messages not prepended with directive

**Check**:
```bash
echo '{"message":"test"}' | bash .claude-plugins/cross-platform-plugin/hooks/subagent-utilization-booster.sh | jq .
```

**Expected**: `{"systemMessage": "Using the appropriate sub-agents, test"}`

**Fix**:
- Verify hook is executable: `chmod +x .claude-plugins/cross-platform-plugin/hooks/subagent-utilization-booster.sh`
- Check configuration: `cat .claude/settings.json | jq '.hooks.UserPromptSubmit'`
- Ensure `ENABLE_SUBAGENT_BOOST` is not set to 0

### Issue: Wrong Intensity Level

**Symptom**: "Using the appropriate sub-agents" but expected stronger directive

**Check**:
```bash
echo $SUBAGENT_BOOST_INTENSITY
```

**Fix**:
```bash
export SUBAGENT_BOOST_INTENSITY=strong  # or maximum
```

### Issue: Conflicts with Routing Hook

**Symptom**: Routing suggestions not appearing

**Check**: Booster chains with routing automatically

**Debug**:
```bash
# Test booster alone
CLAUDE_PLUGIN_ROOT=/path/to/plugin echo '{"message":"deploy to production"}' | \
  bash .claude-plugins/cross-platform-plugin/hooks/subagent-utilization-booster.sh | jq .
```

**Expected**: Should include routing context if salesforce-plugin routing hook exists

## Technical Details

### Hook Metadata

| Property | Value |
|----------|-------|
| **Hook Type** | `UserPromptSubmit` |
| **Execution** | Before Claude processes message |
| **Timeout** | 5000ms (recommended) |
| **Dependencies** | jq (JSON processing) |
| **Chains with** | user-prompt-hybrid.sh (optional) |

### Hook Output Schema

```json
{
  "systemMessage": "Enhanced message with boost directive",
  "suggestedAgent": "agent-name (from routing, optional)",
  "mandatoryAgent": false,
  "blockExecution": false,
  "complexity": 0.75,
  "confidence": 0.90
}
```

### Performance

- **Execution time**: < 50ms (standalone)
- **Execution time**: < 150ms (with routing chain)
- **Memory**: Negligible
- **Overhead**: None (runs in same process)

## Version History

### v1.0.0 (2025-10-20)
- Initial release
- 3 intensity levels (standard, strong, maximum)
- Automatic chaining with routing hooks
- Configuration via environment variables
- Complete documentation

## Related

- **Supervisor-Auditor**: Uses booster to achieve ≥70% utilization target
- **Routing Hooks**: Chains with booster for combined context
- **Plugin Architecture**: Benefits all 9 plugins in marketplace
- **Auto-Agent-Router**: Works alongside booster for intelligent routing

## Support

**Issues**: GitHub - RevPalSFDC/opspal-plugin-internal-marketplace
**Documentation**: `.claude-plugins/cross-platform-plugin/docs/`
**Hook Location**: `.claude-plugins/cross-platform-plugin/hooks/subagent-utilization-booster.sh`

---

**💡 Quick Start**: Add to `.claude/settings.json` and set `ENABLE_SUBAGENT_BOOST=1` to maximize sub-agent delegation!
