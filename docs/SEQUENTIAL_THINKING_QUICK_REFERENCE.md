# Sequential Thinking MCP - Quick Reference Guide

## 🎯 User Control Flags

Add these flags to your commands to control how Claude approaches complex tasks:

### Force Sequential Thinking (Careful Planning)
Use when you want Claude to thoroughly plan before execution:

- **`[PLAN_CAREFULLY]`** - Forces step-by-step planning even for simple tasks
- **`[SEQUENTIAL]`** - Alternative flag with same effect

**Examples:**
```
[PLAN_CAREFULLY] Deploy this metadata to production
[SEQUENTIAL] Merge these duplicate accounts
```

### Force Direct Execution (Quick Mode)
Use when you want faster execution without extensive planning:

- **`[QUICK_MODE]`** - Bypasses planning for immediate execution
- **`[DIRECT]`** - Alternative flag with same effect

**Examples:**
```
[QUICK_MODE] Create these 5 custom fields
[DIRECT] Run this batch update
```

## 🧠 Automatic Complexity Assessment

When no flags are provided, the system automatically assesses task complexity:

### HIGH Complexity (Score > 0.7) - Always Uses Sequential Thinking
- Cross-platform releases (3+ systems)
- Salesforce deployments (10+ objects)
- Circular dependency resolution
- Production deployments with breaking changes
- Data migrations (>10,000 records)
- Full org metadata comparisons

### MEDIUM Complexity (Score 0.3-0.7) - Conditional
- 3-10 object modifications
- Workflow creation (5+ steps)
- Permission restructuring
- Integration setup
- Uses Sequential if: unknown scope, production impact, or rollback needed

### SIMPLE Complexity (Score < 0.3) - Direct Execution
- Single field creation
- Basic SOQL queries
- Documentation updates
- Single record operations
- Configuration changes

## 📊 Monitoring Dashboard

Track complexity assessments and routing decisions in real-time:

1. **Start Dashboard:**
   ```bash
   node scripts/complexity-metrics-dashboard.js
   ```

2. **Access at:** http://localhost:3005

3. **Dashboard Features:**
   - Real-time complexity scores
   - Task routing decisions
   - Historical metrics
   - Performance tracking

## 🤖 Agents with Sequential Thinking

These agents can leverage Sequential Thinking MCP:

1. **sequential-planner** - Specialized for complex problem-solving
2. **sfdc-dependency-analyzer** - Analyzes Salesforce dependencies
3. **sfdc-merge-orchestrator** - Orchestrates complex merges

## 💡 Best Practices

### When to Use [PLAN_CAREFULLY]
- Production deployments
- First-time operations
- Complex integrations
- When unsure about impact

### When to Use [QUICK_MODE]
- Sandbox/dev environments
- Repeated operations
- Simple, well-understood tasks
- Time-sensitive fixes

### Let Automatic Assessment Decide
- Most day-to-day tasks
- When you trust the system's judgment
- For consistent behavior

## 🔧 Troubleshooting

### Sequential Thinking Not Activating
1. Check MCP server is running: `claude mcp list`
2. Restart Claude Code if needed
3. Verify `.mcp.json` has sequential-thinking configured

### Dashboard Not Updating
1. Ensure dashboard is running (port 3005)
2. Check network connectivity
3. Review console for errors

### Unexpected Routing
1. Check for control flags in command
2. Review complexity factors in dashboard
3. Verify agent configuration

## 📈 Examples

### Example 1: Force Planning for Production
```
User: [PLAN_CAREFULLY] Deploy the new pricing model to production
Claude: *Uses Sequential Thinking to create detailed plan with rollback strategy*
```

### Example 2: Quick Sandbox Update
```
User: [QUICK_MODE] Add these test fields to the sandbox Account object
Claude: *Executes immediately without extensive planning*
```

### Example 3: Let System Decide
```
User: Merge the duplicate Contact records from yesterday's import
Claude: *Assesses complexity (likely HIGH due to relationships) and uses Sequential Thinking*
```

---

**Pro Tip:** When in doubt, let the automatic assessment handle it. Use control flags only when you have specific requirements for planning depth or execution speed.