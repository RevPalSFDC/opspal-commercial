---
name: routing-help
description: Display routing system rules, complexity scoring, and agent selection guide
argument-hint: "[options]"
---

# Agent Routing System - Complete Guide

This project uses **automatic agent routing** to ensure the right specialist agent handles each operation.

## 🎯 How Routing Works (3 Layers)

### Layer 1: Pattern Matching
- **Fast detection** of high-risk operations
- **Mandatory blocking** for production deploys, bulk updates
- **Keyword-based** matching (e.g., "production", "deploy", "bulk merge")

### Layer 2: Complexity Scoring
- **Intelligent analysis** of operation complexity (0.0-1.0 scale)
- **Weighted factors**: bulk operations (+0.3), production env (+0.4), dependencies (+0.2), etc.
- **Context-aware** scoring based on task description

### Layer 3: Hybrid Combiner
- **Combines** pattern confidence + complexity score
- **Provides recommendations** with confidence levels
- **Blocks or suggests** based on combined analysis

## 📊 Complexity Scoring Formula

```
Base Score = 0.0

+ 0.3 if "bulk" or "batch" operation
+ 0.4 if production environment
+ 0.2 if dependencies/relationships involved
+ 0.2 if metadata changes
+ 0.1 if data migration
+ 0.1 if integration/external system
+ 0.1 if multiple objects affected
+ 0.1 if rollback complexity

Final Score: 0.0-1.0 (capped at 1.0)
```

**Thresholds:**
- **0.0-0.3**: SIMPLE - Direct execution
- **0.3-0.7**: MEDIUM - Consider specialist agent
- **0.7-1.0**: HIGH - **MUST** use specialist agent

## 🚫 Mandatory Agent Operations (Always Blocked)

These operations **require** the specified agent:

| Operation Pattern | Required Agent | Why |
|-------------------|----------------|-----|
| Production deploy | `release-coordinator` | Change control, rollback, verification |
| Bulk merge (>10 pairs) | `sfdc-merge-orchestrator` | Safety validation, conflict detection |
| Metadata conflicts | `sfdc-conflict-resolver` | Dependency analysis, resolution planning |
| Cross-platform work | `unified-orchestrator` | Multi-system coordination |
| Complex planning | `sequential-planner` | Step-by-step breakdown |

**What happens if I ignore?**
- Hook **blocks execution** before Claude processes request
- You'll see: "❌ BLOCKED: Use [agent-name] for this operation"

## 💡 Suggested Agent Operations (High Confidence)

These operations **should** use the specified agent for best results:

| Operation Pattern | Suggested Agent | Complexity | Confidence |
|-------------------|-----------------|------------|------------|
| RevOps audit | `sfdc-revops-auditor` | 0.65 | 0.85 |
| Layout generation | `sfdc-layout-designer` | 0.55 | 0.80 |
| Dedup analysis | `sfdc-dedup-safety-copilot` | 0.60 | 0.75 |
| Validation rules | `sfdc-metadata-validator` | 0.50 | 0.70 |
| Data quality | `unified-data-quality-validator` | 0.55 | 0.75 |

**What happens if I ignore?**
- Hook **suggests** agent but doesn't block
- You'll see: "💡 SUGGESTION: Consider [agent-name] (complexity: 0.X, confidence: 0.Y)"
- You can proceed directly or invoke the agent

## 📝 Routing Examples

### Example 1: Production Deployment (BLOCKED)

**User Input:**
```
"Deploy metadata to production org"
```

**Routing Decision:**
```
❌ BLOCKED: Production deployment detected
Required Agent: release-coordinator
Complexity: 0.9
Confidence: 1.0
Reason: Production changes require change control, testing, rollback planning
```

**How to Proceed:**
Use the Task tool to invoke `release-coordinator`:
```
I need to deploy metadata to production. Please use the release-coordinator agent.
```

---

### Example 2: Bulk Merge Operation (BLOCKED)

**User Input:**
```
"Merge 50 duplicate accounts in Salesforce"
```

**Routing Decision:**
```
❌ BLOCKED: Bulk merge operation detected (>10 pairs)
Required Agent: sfdc-merge-orchestrator
Complexity: 0.8
Confidence: 0.95
Reason: Bulk merges require safety validation, conflict detection, staged execution
```

**How to Proceed:**
```
I need to merge 50 duplicate accounts. Please use the sfdc-merge-orchestrator agent.
```

---

### Example 3: RevOps Audit (SUGGESTED)

**User Input:**
```
"Run a revenue operations audit for the eta-corp org"
```

**Routing Decision:**
```
💡 SUGGESTION: Consider using sfdc-revops-auditor
Complexity: 0.65
Confidence: 0.85
Reason: Comprehensive audit benefits from specialized framework and checklists

You can proceed directly or use the suggested agent for better results.
```

**Options:**
- **Use suggested agent**: "Please use sfdc-revops-auditor for this audit"
- **Proceed directly**: Continue with your request as-is

---

### Example 4: Simple Field Creation (DIRECT)

**User Input:**
```
"Add a checkbox field to the Account object"
```

**Routing Decision:**
```
✅ DIRECT EXECUTION: Simple operation detected
Complexity: 0.2
Confidence: 0.60
Reason: Single field creation is straightforward
```

**Proceeds automatically** - no agent routing needed.

---

## 🛠️ Troubleshooting

### "Hook timeout" error

**Symptom:**
```
UserPromptSubmit hook timed out after 10000ms
```

**Causes:**
- Hook script hanging (rare)
- Auto-router complexity analysis stuck (rare)
- System resource constraints

**Solutions:**
1. Check hook logs: `~/.claude/logs/debug.log`
2. Temporarily disable hooks: Add `"disableAllHooks": true` to `.claude/settings.local.json`
3. Report issue if recurring

---

### "Agent not found" error

**Symptom:**
```
❌ BLOCKED: Use sfdc-merge-orchestrator
[User tries to invoke agent]
Error: Agent 'sfdc-merge-orchestrator' not found
```

**Causes:**
- Agent not installed or wrong location
- Plugin not loaded

**Solutions:**
1. List available agents: `/agents`
2. Check plugin installation: `/plugin list`
3. Verify agent file exists: `ls .claude-plugins/opspal-salesforce/agents/`
4. Reinstall plugin if needed

---

### Routing conflicts (multiple agents suggested)

**Symptom:**
```
💡 SUGGESTION 1: sfdc-metadata-validator (confidence: 0.7)
💡 SUGGESTION 2: sfdc-conflict-resolver (confidence: 0.65)
```

**Causes:**
- Ambiguous operation description
- Multiple valid approaches

**Solutions:**
1. Choose the agent with **higher confidence**
2. If tied, choose based on **primary goal** (validation vs conflict resolution)
3. Clarify your request for better routing

---

## 📚 Override Controls

### Force Specific Agent

If you know which agent you need:
```
[USE: agent-name] Your request here
```

Example:
```
[USE: sfdc-revops-auditor] Analyze the automation setup
```

### Skip Agent Routing

For simple operations incorrectly flagged:
```
[DIRECT] Your request here
```

Example:
```
[DIRECT] Add a text field to Contact object
```

**Use with caution** - bypasses safety checks.

---

## 🔍 Agent Discovery Quick Reference

**By Operation Type:**

| What You Need | Use This Agent |
|---------------|----------------|
| Deploy to production | `release-coordinator` |
| Merge duplicates | `sfdc-merge-orchestrator` |
| Resolve conflicts | `sfdc-conflict-resolver` |
| RevOps audit | `sfdc-revops-auditor` |
| Layout generation | `sfdc-layout-designer` |
| Automation audit | `sfdc-automation-auditor` |
| Data quality check | `unified-data-quality-validator` |
| Cross-platform work | `unified-orchestrator` |
| Complex planning | `sequential-planner` |

**By Keyword:**

| Keyword in Request | Likely Agent |
|-------------------|--------------|
| "production", "deploy", "release" | `release-coordinator` |
| "merge", "dedupe", "duplicate" | `sfdc-merge-orchestrator` |
| "conflict", "error", "failed" | `sfdc-conflict-resolver` |
| "audit", "assessment", "revops" | `sfdc-revops-auditor` |
| "layout", "page", "fields" | `sfdc-layout-designer` |
| "workflow", "process", "flow" | `sfdc-automation-auditor` |
| "quality", "validation", "clean" | `unified-data-quality-validator` |

---

## 🎓 Best Practices

1. **Trust the routing** - If blocked, there's a good reason (safety, best practices)
2. **Use suggested agents** - They have specialized tools and workflows
3. **Clear descriptions help** - "Deploy validation rules to production" routes better than "update stuff"
4. **Override sparingly** - Routing exists to prevent errors and optimize workflows
5. **Check confidence** - Confidence >0.8 means high certainty, <0.6 means uncertain

---

## 📖 Related Documentation

- **Routing Configuration**: `.claude/settings.json` (see comments section)
- **Auto-Router Script**: `.claude-plugins/opspal-salesforce/scripts/auto-agent-router.js`
- **Hook Script**: `.claude-plugins/opspal-salesforce/hooks/user-prompt-hybrid.sh`
- **Audit Report**: `ROUTING_SYSTEM_ANALYSIS.md`

---

## ℹ️ System Info

- **Routing Version**: 2.0 (Hybrid Pattern + Complexity)
- **Hook Timeout**: 10s (increased from 7s to prevent false timeouts)
- **Average Processing Time**: 250ms (600ms max)
- **Enabled By Default**: Yes (disable via settings.local.json)

---

**Questions or issues?** Check `.claude/logs/debug.log` or submit reflection via `/reflect`
