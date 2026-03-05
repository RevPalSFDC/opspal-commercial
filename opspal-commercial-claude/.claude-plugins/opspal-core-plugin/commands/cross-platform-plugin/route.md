---
name: route
description: Analyze task and recommend the optimal agent with confidence score and routing explanation
---

# Agent Routing Analyzer

Analyze your task description and get instant recommendations on which specialized agent should handle it.

## How to Use

Simply describe your task after the command:

```
/route [your task description]
```

## What You Get

The routing analyzer will provide:

1. **Recommended Agent** - The specialist agent best suited for your task
2. **Confidence Score** - How certain we are about the recommendation (0.0-1.0)
3. **Complexity Assessment** - Task complexity rating (SIMPLE/MEDIUM/HIGH)
4. **Routing Explanation** - Why this agent was selected
5. **Alternative Agents** - Other agents that could handle similar tasks
6. **Key Capabilities** - What the recommended agent specializes in

## Examples

### Example 1: Production Deployment
```
/route Deploy validation rules to production Salesforce org
```

**Expected Output:**
```
🎯 RECOMMENDED AGENT: release-coordinator
Confidence: 0.95 (Very High)
Complexity: HIGH (0.85)

📋 Reasoning:
- Production deployment detected (requires change control)
- Metadata changes involved (validation rules)
- Requires rollback planning and verification

✨ Key Capabilities:
- Orchestrates end-to-end release process
- Enforces pre-deployment checklists
- Coordinates cross-platform deployments
- Generates stakeholder summaries

🔄 Alternative Agents:
- sfdc-deployment-manager (for direct SF deployment)
- sfdc-metadata-manager (for metadata-only changes)
```

### Example 2: Data Quality Audit
```
/route Check for duplicate accounts and data quality issues in Salesforce
```

**Expected Output:**
```
🎯 RECOMMENDED AGENT: unified-data-quality-validator
Confidence: 0.80 (High)
Complexity: MEDIUM (0.55)

📋 Reasoning:
- Data quality assessment requested
- Deduplication analysis needed
- Cross-system validation possible

✨ Key Capabilities:
- Validates data consistency across platforms
- Identifies duplicate records
- Assesses data quality metrics
- Recommends cleanup strategies

🔄 Alternative Agents:
- sfdc-dedup-safety-copilot (for SF-specific dedup)
- sfdc-data-operations (for data cleanup execution)
```

### Example 3: Simple Field Creation
```
/route Add a text field called "Department" to the Account object
```

**Expected Output:**
```
✅ DIRECT EXECUTION RECOMMENDED
Complexity: SIMPLE (0.15)

📋 Reasoning:
- Single field creation
- Standard metadata operation
- Low risk, straightforward task

💡 Note: No specialized agent needed for this simple operation.
You can proceed directly without agent routing.

🔄 If Needed:
- sfdc-metadata-manager (for batch field operations)
- sfdc-field-analyzer (for field impact analysis)
```

## Routing Logic

The analyzer considers:

1. **Keywords** - Production, deploy, merge, audit, bulk, etc.
2. **Operation Type** - Create, update, delete, analyze, migrate
3. **Scope** - Single vs batch, sandbox vs production
4. **Risk Level** - Data loss potential, user impact
5. **Complexity Factors**:
   - Bulk operations (+0.3)
   - Production environment (+0.4)
   - Dependencies (+0.2)
   - Metadata changes (+0.2)
   - Data migration (+0.1)
   - Multiple objects (+0.1)

## Complexity Thresholds

- **0.0-0.3 (SIMPLE)**: Direct execution, no agent needed
- **0.3-0.7 (MEDIUM)**: Agent recommended for best practices
- **0.7-1.0 (HIGH)**: Agent REQUIRED for safety and governance

## Override Commands

If you disagree with the recommendation:

- **Use specific agent**: `[USE: agent-name] Your task`
- **Force direct execution**: `[DIRECT] Your task` (use with caution)
- **Get more info**: `/routing-help` for detailed routing guide

## Behind the Scenes

This command uses the `task-router.js` script which:
- Parses your task description
- Calculates complexity scores
- Matches against agent capabilities
- Provides confidence-weighted recommendations

The routing system is designed to:
- ✅ Prevent common errors (wrong agent, missing steps)
- ✅ Optimize workflows (right tool for the job)
- ✅ Ensure safety (production controls, bulk operation validation)
- ✅ Improve efficiency (specialized agents work faster)

## Related Commands

- `/routing-help` - Complete routing system guide
- `/agents` - List all available agents
- `/suggest-agent` - Get agent recommendation for current context

---

**Note**: Routing recommendations are based on historical patterns and may not be perfect. Use your judgment for edge cases.
