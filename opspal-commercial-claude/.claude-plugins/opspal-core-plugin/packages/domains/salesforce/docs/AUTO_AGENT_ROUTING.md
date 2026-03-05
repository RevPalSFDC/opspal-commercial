# Auto Agent Routing System

## Overview

The **Auto Agent Routing System** is a proactive agent discovery and invocation framework that automatically:
- **Analyzes** every user request for complexity and risk
- **Suggests** specialized agents based on pattern matching
- **Blocks** high-risk operations that require specific agents
- **Learns** from usage patterns to improve recommendations
- **Tracks** analytics for success rates and optimization

## How It Works

### Architecture

```
User Request
    ↓
UserPromptSubmit Hook (Claude Code)
    ↓
user-prompt-submit-enhanced.sh (Shell wrapper - parses JSON)
    ↓
auto-agent-router.js (Node.js - pattern matching & complexity scoring)
    ↓
agent-triggers.json (Configuration - rules & patterns)
    ↓
Routing Decision (JSON response)
    ↓
systemMessage back to Claude (Suggestion or Block)
```

### Components

#### 1. Hook Script (`hooks/user-prompt-submit-enhanced.sh`)
- **Triggered**: On every user message (UserPromptSubmit hook)
- **Input**: JSON from Claude Code with `user_message`
- **Output**: JSON with `systemMessage`, `suggestedAgent`, `mandatoryAgent`
- **Purpose**: Bridge between Claude Code and auto-router

#### 2. Auto Router (`scripts/auto-agent-router.js`)
- **Complexity Scoring**: Analyzes operation risk (0-100%)
  - Production keywords: +40%
  - Bulk operations: +30%
  - Dependencies: +20%
  - Error/conflict patterns: +30%
  - Multiple objects: +10%
- **Pattern Matching**: Regex patterns from agent-triggers.json
- **Confidence Scoring**: How certain we are about agent match
  - Mandatory patterns: 100% (will block)
  - Keyword matches: 80%
  - Pattern matches: 70%
- **Auto-Invocation**: Decides when to auto-invoke vs suggest
  - Confidence ≥ 90% → Auto-invoke
  - Complexity ≥ 70% → Auto-invoke
  - High success rate (>80%) → Auto-invoke

#### 3. Configuration (`/.claude/agent-triggers.json`)
- **Mandatory Patterns**: Operations that BLOCK without agent
  - Production deploys → release-coordinator
  - Bulk operations (1000+ records) → sfdc-data-operations
  - Permission changes → sfdc-security-admin
  - Metadata deletion → sfdc-metadata-manager
- **Recommended Patterns**: Operations that SUGGEST agent
  - Conflicts → sfdc-conflict-resolver
  - Metadata creation → sfdc-metadata-manager
  - Apex development → sfdc-apex-developer
- **Auto-Invoke Rules**: When to auto-invoke vs suggest
- **Keyword Mappings**: Fallback routing by keywords

#### 4. Analytics (`.claude/agent-usage-data.json`)
- Tracks every invocation with timestamp
- Records success/failure rates per agent
- Stores missed opportunities
- Calculates average complexity/confidence
- Used for learning and optimization

## Usage

### For Users

The system works **automatically** - no manual invocation needed.

When you type a request like:
```
"deploy these changes to production"
```

The hook will automatically:
1. Detect it's a production deployment (high risk)
2. Calculate complexity score (40%)
3. Match mandatory pattern (confidence: 100%)
4. **BLOCK execution** with message:

```
🚫 BLOCKED: High-risk operation detected

MANDATORY AGENT REQUIRED: release-coordinator

To proceed:
1. Use Task tool with subagent_type='release-coordinator'
2. Let the agent handle validation and execution
3. Review agent output before confirming
```

For less risky operations:
```
"create a new custom field for Account"
```

The hook will:
1. Calculate complexity (10%)
2. Match recommended pattern (confidence: 80%)
3. **SUGGEST** (not block) with message:

```
💡 Agent Suggestion: Consider using Task tool with subagent_type='sfdc-metadata-manager'

Complexity: 10%
Confidence: 80%

While not mandatory, using this agent will:
- Reduce errors and failures
- Apply best practices automatically
- Provide validation and safety checks
```

### For Developers

#### Testing the Router

```bash
# Test with sample operations
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/auto-agent-router.js test

# Analyze a specific operation
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/auto-agent-router.js analyze "update 500 opportunities"

# Route an operation (get JSON decision)
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/auto-agent-router.js route "deploy to production" --json

# View analytics and statistics
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/auto-agent-router.js report

# View configuration
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/auto-agent-router.js config
```

#### Adding New Patterns

Edit `.claude/agent-triggers.json`:

```json
{
  "triggers": {
    "mandatory": {
      "patterns": [
        {
          "pattern": "your-regex-pattern-here",
          "agent": "agent-name",
          "message": "Why this agent is required"
        }
      ]
    }
  }
}
```

Pattern syntax uses JavaScript regex:
- `production|prod` - Matches either word
- `update.*[0-9]{3,}.*record` - Matches "update 500 records"
- `(create|modify).*flow` - Matches "create flow" or "modify flow"

#### Adjusting Thresholds

In `agent-triggers.json`:

```json
{
  "triggers": {
    "auto_invoke": {
      "thresholds": {
        "auto_invoke_confidence": 0.9,  // 90% confidence required
        "auto_invoke_complexity": 0.7,  // 70% complexity required
        "mandatory_confidence": 1.0     // 100% = mandatory
      }
    }
  }
}
```

## Decision Flow

```
User Request Received
    ↓
Calculate Complexity Score
    ↓
Check Mandatory Patterns (confidence = 1.0)
    ├─ Match? → BLOCK execution, require agent
    └─ No match ↓
Check Recommended Patterns
    ├─ Match? → Suggest agent
    └─ No match ↓
Check Keyword Mappings
    ├─ Match? → Suggest agent (lower confidence)
    └─ No match ↓
No Routing (allow direct execution)
```

## Analytics & Learning

The system tracks:

### Agent Usage Statistics
```json
{
  "agentUsage": {
    "release-coordinator": {
      "totalUses": 15,
      "successCount": 14,
      "failureCount": 1,
      "autoInvoked": 10
    }
  }
}
```

Success rate = 14/15 = 93.3%

If agent has >80% success rate over 5+ uses → Auto-invoke in future

### Auto-Invocation History
```json
{
  "autoInvocations": [
    {
      "timestamp": "2025-10-17T10:30:00Z",
      "operation": "deploy to production",
      "agent": "release-coordinator",
      "success": true
    }
  ]
}
```

### Statistics Dashboard
```bash
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/auto-agent-router.js report
```

Output:
```
📊 AUTO-ROUTING STATISTICS
══════════════════════════════════════════════════
Total Auto-Invocations: 45

Agent Usage:
  release-coordinator:
    Uses: 15 | Auto: 10 | Success: 93.3%
  sfdc-data-operations:
    Uses: 12 | Auto: 8 | Success: 91.7%
  sfdc-conflict-resolver:
    Uses: 8 | Auto: 5 | Success: 100.0%

Recent Auto-Invocations:
  [10:30 AM] ✓ release-coordinator
  [10:15 AM] ✓ sfdc-data-operations
  [10:00 AM] ✓ sfdc-conflict-resolver
══════════════════════════════════════════════════
```

## Configuration Files

### `.claude/settings.json` (Project-level)
```json
{
  "hooks": {
    "UserPromptSubmit": {
      "command": "bash ${CLAUDE_PLUGIN_ROOT}/.claude-plugins/opspal-core-plugin/packages/domains/salesforce/hooks/user-prompt-submit-enhanced.sh",
      "timeout": 5000
    }
  }
}
```

### `.claude/agent-triggers.json` (Routing rules)
- 20 patterns total
- 15 specialized agents
- Mandatory + recommended + keywords

### `.claude/agent-usage-data.json` (Analytics)
- Auto-generated on first run
- Updated after every routing decision
- Used for learning and optimization

## Troubleshooting

### Hook Not Firing

**Check 1**: Verify hook is configured
```bash
cat .claude/settings.json | jq '.hooks.UserPromptSubmit'
```

**Check 2**: Verify script is executable
```bash
ls -lah .claude-plugins/opspal-core-plugin/packages/domains/salesforce/hooks/user-prompt-submit-enhanced.sh
```

Should show `-rwxrwxr-x` (executable)

**Check 3**: Test hook manually
```bash
echo '{"user_message":"deploy to production"}' | bash .claude-plugins/opspal-core-plugin/packages/domains/salesforce/hooks/user-prompt-submit-enhanced.sh
```

Should output JSON with routing decision.

### No Agent Suggestions

**Check 1**: Test auto-router directly
```bash
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/auto-agent-router.js route "your operation here"
```

**Check 2**: Verify patterns match
```bash
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/auto-agent-router.js config | jq '.triggers.mandatory.patterns'
```

**Check 3**: Add debug output
```bash
CLAUDE_DEBUG=1 echo '{"user_message":"test"}' | bash hooks/user-prompt-submit-enhanced.sh
```

### Analytics Not Updating

**Check**: Verify analytics file exists and is writable
```bash
ls -lah .claude/agent-usage-data.json
```

If missing, create it:
```bash
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/auto-agent-router.js init
```

## Best Practices

### For Plugin Developers

1. **Add patterns for new agents**: Update agent-triggers.json when creating new agents
2. **Set appropriate confidence**: 1.0 for mandatory, 0.7-0.9 for recommended
3. **Test before deploying**: Use `node auto-agent-router.js test`
4. **Monitor analytics**: Check success rates weekly
5. **Update patterns**: Add patterns when users ask about tasks repeatedly

### For Users

1. **Trust the suggestions**: Agents prevent errors and save time
2. **Review blocking messages**: They exist to prevent production incidents
3. **Report false positives**: If suggested agent doesn't make sense
4. **Use /reflect**: Submit feedback about routing accuracy

## Version History

### v1.0.0 (2025-10-17)
- ✅ Initial implementation
- ✅ Complexity scoring engine
- ✅ Pattern-based routing
- ✅ Analytics tracking
- ✅ Auto-invocation logic
- ✅ 20 patterns for 15 agents
- ✅ JSON-based configuration

## Related Documentation

- [Agent Decision Card](../.claude/AGENT_DECISION_CARD.md) - Quick reference for when to use agents
- [Agent Organization Pattern](../../docs/AGENT_ORGANIZATION_PATTERN.md) - How agents are structured
- [CLAUDE.md](../../CLAUDE.md) - Project instructions and agent routing table

---

**Maintained by**: RevPal Engineering
**Last Updated**: 2025-10-17
