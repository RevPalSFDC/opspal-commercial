# Agent Onboarding Guide - RevPal System

Welcome to the RevPal Agent System! This guide will help you quickly understand and effectively use our specialized agent ecosystem.

## 🚀 Quick Start (5 Minutes)

### Step 1: Understand the Basics
- **Agents** are specialized AI assistants for specific tasks
- **Use the Task tool** to invoke agents
- **Agents can delegate** to other agents for complex workflows

### Step 2: Your First Agent Commands

#### After merging code to main:
```
Claude will automatically suggest: "I'll invoke release-coordinator to prepare for deployment"
```

#### When you see repeated issues:
```
You: "Claude keeps making the same API naming mistakes"
Claude uses: quality-control-analyzer
```

#### For complex tasks:
```
You: "[SEQUENTIAL] Design our new permission system"
Claude uses: sequential-planner
```

### Step 3: Essential Agents to Know
1. **release-coordinator** - Your deployment orchestrator
2. **project-orchestrator** - Multi-repo coordinator
3. **sequential-planner** - Complex task planner
4. **quality-control-analyzer** - Pattern detector

## 📖 Complete Onboarding (15 Minutes)

### Understanding Agent Hierarchy

```
┌─────────────────────────┐
│   Orchestrator Agents   │ (Coordinate)
└───────────┬─────────────┘
            ↓
┌─────────────────────────┐
│   Specialist Agents     │ (Execute)
└───────────┬─────────────┘
            ↓
┌─────────────────────────┐
│   Validator Agents      │ (Verify)
└─────────────────────────┘
```

### When Agents Are Used Automatically

Claude will **proactively** use agents when:
- ✅ You merge to main branch
- ✅ You mention deployment or release
- ✅ You describe complex multi-step tasks
- ✅ You report recurring issues
- ✅ You work across multiple repositories

### How to Control Agent Usage

#### Force Agent Usage:
- Add `[SEQUENTIAL]` to force planning
- Add `[RELEASE]` to force release coordination
- Say "use an agent" explicitly

#### Skip Agents:
- Add `[DIRECT]` for immediate execution
- Add `[QUICK_MODE]` to skip planning
- Say "don't use agents" explicitly

## 🎯 Common Scenarios & Solutions

### Scenario 1: Ready to Deploy
```
You: "I merged PR #123 to main"
Expected: Claude invokes release-coordinator
Result: Automated release checklist and coordination
```

### Scenario 2: Salesforce Deployment Failed
```
You: "My deployment failed with field history errors"
Expected: Claude invokes sfdc-conflict-resolver
Result: Automatic conflict resolution and retry
```

### Scenario 3: Complex Unknown Task
```
You: "Build a fault-tolerant payment system"
Expected: Claude invokes sequential-planner
Result: Step-by-step plan with alternatives
```

### Scenario 4: Recurring Issues
```
You: "Why does Claude keep using the wrong API format?"
Expected: Claude invokes quality-control-analyzer
Result: Pattern analysis and prevention checklist
```

## 🛠️ Platform-Specific Agent Groups

### Salesforce Agents
- **sfdc-state-discovery** - Analyze org state
- **sfdc-conflict-resolver** - Fix deployment issues
- **sfdc-merge-orchestrator** - Merge fields/objects
- **sfdc-dependency-analyzer** - Map dependencies

### Google Drive Agents
- **gdrive-document-manager** - Access documents
- **gdrive-template-library** - Get templates
- **gdrive-report-exporter** - Export reports

### System Maintenance Agents
- **router-doctor** - Fix agent discovery
- **mcp-guardian** - Validate MCP setup
- **claude-compliance-enforcer** - Check standards

## 📊 Testing Your Understanding

### Quick Quiz (Self-Check)

1. **Q: You just merged to main. What happens?**
   A: Claude should invoke release-coordinator

2. **Q: You need to work in both ClaudeSFDC and ClaudeHubSpot. Which agent?**
   A: project-orchestrator

3. **Q: Your Salesforce deployment keeps failing. Which agent?**
   A: sfdc-conflict-resolver

4. **Q: You want to skip all agents. What flag?**
   A: [DIRECT] or [QUICK_MODE]

## 🔧 Tools & Commands

### Test Agent Routing
```bash
node scripts/test-agent-routing.js
```

### Validate Agent Setup
```bash
bash scripts/validate-agents.sh
```

### View Available Agents
```bash
ls .claude/agents/
```

### Check MCP Servers
```bash
claude mcp list
```

## 📚 Key Documents to Review

1. **CLAUDE.md** - Main configuration and rules
2. **AGENT_USAGE_EXAMPLES.md** - Detailed examples
3. **AGENT_CAPABILITY_MATRIX.md** - What each agent can do

## 🚦 Decision Tree

```
Is it a release/deploy task?
├─ YES → release-coordinator
└─ NO → Continue
    │
    Is it multi-repo?
    ├─ YES → project-orchestrator
    └─ NO → Continue
        │
        Is it complex/unknown?
        ├─ YES → sequential-planner
        └─ NO → Continue
            │
            Is it Salesforce?
            ├─ YES → sfdc-* agents
            └─ NO → Check other specialists
```

## ⚠️ Common Mistakes to Avoid

### DON'T:
- ❌ Try to handle complex tasks without agents
- ❌ Skip release-coordinator after merging to main
- ❌ Ignore [SEQUENTIAL] hints from Claude
- ❌ Use direct execution for production changes

### DO:
- ✅ Let agents handle complex coordination
- ✅ Trust the automatic agent selection
- ✅ Use flags to control behavior when needed
- ✅ Review agent outputs before confirming

## 💡 Pro Tips

1. **Start with discovery agents** before making changes
2. **Chain agents** for complex workflows
3. **Use the capability matrix** to understand limits
4. **Run tests** after significant changes
5. **Let orchestrators delegate** instead of doing everything directly

## 🔄 Workflow Examples

### Release Workflow
```
1. Merge to main
2. release-coordinator activates
3. Delegates to platform agents
4. Generates release notes
5. Notifies via Slack
```

### Conflict Resolution Workflow
```
1. Deployment fails
2. sfdc-conflict-resolver analyzes
3. Identifies conflicts
4. Generates fixes
5. Retries deployment
```

### Quality Improvement Workflow
```
1. Notice repeated issues
2. quality-control-analyzer runs
3. Identifies patterns
4. Creates prevention checklist
5. Updates documentation
```

## 📈 Measuring Success

You're effectively using agents when:
- ✅ Complex tasks complete without errors
- ✅ Deployments happen smoothly
- ✅ Recurring issues decrease
- ✅ Cross-repo work is coordinated
- ✅ You spend less time on routine tasks

## 🆘 Getting Help

### If agents aren't working:
1. Run `bash scripts/validate-agents.sh`
2. Check `claude mcp list` for servers
3. Review error messages carefully
4. Use router-doctor agent

### If you're unsure which agent:
1. Check AGENT_USAGE_EXAMPLES.md
2. Look at the capability matrix
3. Let Claude suggest (it usually knows)
4. Start with a discovery agent

## 🎓 Advanced Topics (After First Week)

### Custom Agent Flags
- Create your own control flags
- Modify complexity thresholds
- Customize agent chains

### Agent Development
- Creating new agents
- Modifying existing agents
- Testing agent interactions

### Performance Optimization
- Monitoring agent performance
- Reducing agent overhead
- Optimizing delegation chains

## ✅ Onboarding Checklist

- [ ] Read this guide completely
- [ ] Run `node scripts/test-agent-routing.js`
- [ ] Try invoking release-coordinator manually
- [ ] Test a [SEQUENTIAL] flag
- [ ] Review AGENT_USAGE_EXAMPLES.md
- [ ] Check capability matrix
- [ ] Run validation script
- [ ] Complete your first agent-assisted task

## 🎉 Congratulations!

You're now ready to use the RevPal Agent System effectively. Remember:
- **Agents are here to help** - use them liberally
- **Start simple** - you'll learn the advanced features over time
- **Trust the automation** - it's been thoroughly tested
- **Ask for help** - the system is designed to guide you

Welcome to a more efficient development workflow with the RevPal Agent System!