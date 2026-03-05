# Stopgap Solution Plan - Until Hook Output Injection is Fixed

**Status**: 🚧 ACTIVE WORKAROUND
**Effective Date**: 2025-12-10
**Bug Tracked**: GitHub #12151 (expanded scope)
**Timeline**: Until Anthropic fixes Claude Code hook output injection

---

## Executive Summary

**Problem**: Claude Code hook output injection is completely broken. Hooks execute successfully but their stdout is silently discarded, preventing dynamic routing recommendations from reaching Claude.

**Impact**: No dynamic agent routing, no complexity scoring, no hook-based context injection.

**Solution**: Multi-layered stopgap approach that maximizes routing effectiveness without relying on broken hook output:

1. ✅ Enhanced CLAUDE.md (static instructions) - **PRIMARY SOLUTION**
2. 🎯 Slash commands for manual routing checks
3. 👁️ Visual terminal indicators (hooks → stderr)
4. 🚨 Pre-flight validation with hard blocking
5. 📋 Post-task compliance checking
6. 🔍 Enhanced agent discovery

---

## Layer 1: Enhanced CLAUDE.md (PRIMARY SOLUTION)

**Status**: ✅ **IMPLEMENTED & PROVEN EFFECTIVE**

### What We Implemented

**Mandatory Pre-Response Check:**
```markdown
## 🚨 MANDATORY PRE-RESPONSE CHECK

**CRITICAL**: Before responding to ANY user request, you MUST:

1. ✋ **STOP** and check the routing table below
2. 🔍 **SCAN** for matching keywords
3. 🚫 **BLOCK** yourself from direct execution if match found
4. ✅ **USE** the Task tool with the appropriate specialist agent

**If you respond directly to a specialist task, you are making an ERROR.**
```

**BLOCKED Operations List:**
- CPQ/Q2C Assessment → `sfdc-cpq-assessor`
- RevOps Audit → `sfdc-revops-auditor`
- Automation Audit → `sfdc-automation-auditor`
- Permission Set Creation → `sfdc-permission-orchestrator`
- Report/Dashboard Creation → `sfdc-reports-dashboards`
- Data Import/Export → `sfdc-data-operations`
- Production Deployment → `release-coordinator`
- Multi-platform Operations → `unified-orchestrator`
- Diagram/Flowchart Creation → `diagram-generator`

**Complexity Self-Assessment:**
- 🔴 HIGH (≥70%): Multi-step, cross-platform, audits, migrations, production
- 🟡 MEDIUM (30-70%): Multi-object, workflows, permissions, integrations
- 🟢 LOW (<30%): Single field, simple queries, docs, config reads

**Pre-Response Self-Check:**
> "Does this request match any specialist keyword?
> Is this in the BLOCKED list?
> Should I use a Task tool instead?"

### Effectiveness: ✅ PROVEN

**Test Evidence (2025-12-10):**
- User request: "perform q2c audit"
- CLAUDE.md matched keyword ✅
- Recognized as BLOCKED operation ✅
- Used Task tool with correct agent ✅
- Agent successfully engaged ✅

**Conclusion:** Static instructions work when hooks don't.

### Maintenance

**Keep Updated:**
- Add new specialist agents as they're created
- Update keyword patterns based on usage
- Refine complexity criteria from real-world feedback
- Document common edge cases

**Files:**
- `/home/chris/Desktop/RevPal/Agents/CLAUDE.md` (parent repo)
- `/home/chris/Desktop/RevPal/Agents/opspal-internal-plugins/CLAUDE.md` (plugin repo)

---

## Layer 2: Slash Commands for Manual Routing

**Status**: 🎯 **TO BE IMPLEMENTED**

### Concept

Create slash commands that users can invoke to:
1. Check which agent should handle their task
2. Get routing recommendations
3. Validate task complexity
4. Force agent engagement

### Proposed Commands

#### `/route <task description>`
**Purpose**: Get agent routing recommendation

**Example:**
```
User: /route create a new permission set
Output:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎯 ROUTING RECOMMENDATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Task: create a new permission set
Agent: opspal-salesforce:sfdc-permission-orchestrator
Confidence: 95%
Complexity: HIGH (75%)

⛔ BLOCKED OPERATION
This task is PROHIBITED from direct execution.

You MUST invoke:
Task(subagent_type='opspal-salesforce:sfdc-permission-orchestrator', prompt='create a new permission set')
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

#### `/agents [keyword]`
**Purpose**: List available agents, optionally filtered

**Example:**
```
User: /agents cpq
Output:
Available agents matching "cpq":
  • opspal-salesforce:sfdc-cpq-assessor
    - CPQ/Q2C assessments and audits
    - Pricing rule analysis
    - Quote process optimization

  • opspal-salesforce:sfdc-cpq-specialist
    - CPQ configuration
    - Product bundles
    - Discount schedules
```

#### `/complexity <task description>`
**Purpose**: Assess task complexity

**Example:**
```
User: /complexity add a checkbox field
Output:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
COMPLEXITY ASSESSMENT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Task: add a checkbox field
Complexity: LOW (15%)
Indicators:
  ✅ Single object modification
  ✅ Simple field type
  ✅ No cross-platform requirements
  ✅ Sandboxable change

Recommendation: Direct execution OK
No specialized agent required.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### Implementation

**Create in `.claude/commands/`:**
```bash
.claude/commands/
├── route.md              # /route command
├── agents.md             # /agents command
└── complexity.md         # /complexity command
```

**Each command file contains:**
```markdown
---
name: route
description: Get agent routing recommendation for a task
---

You are a routing advisor. Analyze the user's task description and:

1. Identify matching specialist agents from the routing table
2. Calculate complexity score (0-1.0)
3. Determine confidence in recommendation
4. Output formatted routing recommendation

Use this format:
[Routing banner with agent, confidence, complexity]
[BLOCKED/RECOMMENDED/AVAILABLE status]
[Task tool invocation syntax]

Refer to CLAUDE.md routing table for agent mappings.
```

### Benefits

- ✅ User-initiated routing checks (no dependency on broken hooks)
- ✅ Explicit, visible recommendations
- ✅ Can be invoked before Claude attempts task
- ✅ Educational: teaches users when to use agents

---

## Layer 3: Visual Terminal Indicators

**Status**: 👁️ **PARTIALLY WORKING** (stderr visible)

### Current Behavior

Hooks can still write to **stderr** (terminal error stream), which appears in the user's terminal but NOT in Claude's context.

**Hook script can output:**
```bash
# Visible in terminal (stderr)
echo "⚠️ [ROUTING] Agent recommended: sfdc-cpq-assessor" >&2

# Invisible to Claude (stdout - discarded by bug)
echo "systemMessage: Agent recommended"
```

### Enhanced Visual Output

**Update hooks to provide rich terminal feedback:**

```bash
#!/bin/bash
# Enhanced stderr output for user visibility

# Get routing recommendation
AGENT="sfdc-cpq-assessor"
COMPLEXITY="85%"

# Output to terminal (stderr = visible)
cat >&2 << EOF

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎯 ROUTING RECOMMENDATION (visible in terminal only)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Agent: $AGENT
Complexity: $COMPLEXITY (HIGH)

⚠️ CAUTION: Claude cannot see this message due to bug #12151
Please manually verify Claude uses the recommended agent.

Expected Claude behavior:
  Task(subagent_type='$AGENT', prompt='...')

If Claude attempts direct execution, use /route command.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

EOF

# Attempt stdout output (will be discarded, but try anyway)
echo "INSTRUCTION: Use Task tool with $AGENT"

exit 0
```

### Benefits

- ✅ User sees routing recommendations
- ✅ Provides visibility into what SHOULD happen
- ✅ Users can manually verify Claude's behavior
- ⚠️ Requires user attention (not automatic)

### Limitations

- ❌ Claude cannot see stderr output
- ❌ Relies on user to notice terminal messages
- ❌ Not integrated into Claude's decision-making

---

## Layer 4: Pre-Flight Validation with Hard Blocking

**Status**: 🚨 **TO BE IMPLEMENTED**

### Concept

Use **exit code 1** (hard blocking) for truly dangerous operations. This SHOULD work even with broken output injection.

### How Exit Codes Work

```bash
# Exit 0 = Allow (but output still lost)
echo "Advisory message"
exit 0

# Exit 1 = BLOCK execution (should work)
echo "ERROR: Production deployment requires approval" >&2
exit 1

# Exit 2 = BLOCK with error message (should work)
echo "BLOCKED: Use release-coordinator agent" >&2
exit 2
```

**Theory**: Exit code blocking doesn't rely on output injection, only exit status.

### Implementation

**Create pre-flight validator hook:**

```bash
#!/bin/bash
# .claude/hooks/pre-flight-validator.sh
# Blocks dangerous operations with exit code 1

USER_MESSAGE="$1"

# Dangerous patterns
if echo "$USER_MESSAGE" | grep -qiE "(deploy.*prod|production.*deploy|delete.*all|drop.*table)"; then
  cat >&2 << EOF
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🛑 EXECUTION BLOCKED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Dangerous operation detected: Production deployment/deletion

This operation requires specialist agent approval.

Use: Task(subagent_type='release-coordinator', prompt='...')
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
EOF
  exit 1  # Hard block
fi

exit 0  # Allow
```

**Register in hooks.json:**
```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "type": "command",
        "command": "bash .claude/hooks/pre-flight-validator.sh",
        "description": "Hard blocking for dangerous operations (exit code 1)"
      }
    ]
  }
}
```

### Benefits

- ✅ Actually prevents execution (exit code 1)
- ✅ Failsafe for critical operations
- ✅ Doesn't rely on output injection

### Limitations

- ⚠️ **UNTESTED** - need to verify exit code 1 actually blocks Claude
- ❌ No context message (Claude won't see WHY it's blocked)
- ❌ Pattern matching only (no sophisticated routing)

### Test Plan

1. Create test hook that exits with code 1
2. Trigger with dangerous pattern
3. Verify Claude cannot proceed
4. If works: expand to all BLOCKED operations

---

## Layer 5: Post-Task Compliance Checking

**Status**: 📋 **TO BE IMPLEMENTED**

### Concept

Monitor whether Claude follows routing recommendations by checking tool usage.

### Implementation

**PostToolUse Hook:**

```bash
#!/bin/bash
# .claude/hooks/post-tool-compliance-check.sh

HOOK_INPUT=$(cat)
TOOL_NAME=$(echo "$HOOK_INPUT" | jq -r '.tool_name')

# Check if routing state exists (from UserPromptSubmit)
STATE_FILE="$HOME/.claude/routing-state.json"
if [ -f "$STATE_FILE" ]; then
  RECOMMENDED_AGENT=$(jq -r '.agent' "$STATE_FILE")
  WAS_BLOCKED=$(jq -r '.blocked' "$STATE_FILE")

  # Check if Task tool was used
  if [ "$TOOL_NAME" = "Task" ]; then
    # Extract subagent_type from tool input
    USED_AGENT=$(echo "$HOOK_INPUT" | jq -r '.arguments.subagent_type // ""')

    if [ "$USED_AGENT" = "$RECOMMENDED_AGENT" ]; then
      echo "✅ Compliance: Correct agent used" >&2
      rm "$STATE_FILE"
      exit 0
    else
      echo "⚠️ Compliance Warning: Expected $RECOMMENDED_AGENT, got $USED_AGENT" >&2
      rm "$STATE_FILE"
      exit 0
    fi
  else
    # Non-Task tool used when agent was recommended
    if [ "$WAS_BLOCKED" = "true" ]; then
      echo "❌ COMPLIANCE VIOLATION: Agent blocked but direct execution attempted" >&2
      echo "Expected: Task(subagent_type='$RECOMMENDED_AGENT', ...)" >&2
    fi
  fi
fi

exit 0
```

### Benefits

- ✅ Tracks compliance with routing recommendations
- ✅ Provides feedback for improvement
- ✅ Can log violations for analysis

### Limitations

- ❌ Reactive (after the fact)
- ❌ Cannot prevent non-compliance
- ❌ Only visible in terminal (stderr)

---

## Layer 6: Enhanced Agent Discovery

**Status**: 🔍 **TO BE IMPLEMENTED**

### Concept

Make it easier for users to find and use the right agents without relying on hooks.

### Implementation Options

#### Option A: Interactive Agent Selector

**Slash command:** `/select-agent`

**Behavior:**
1. Shows category menu (Salesforce, HubSpot, Cross-Platform, etc.)
2. User selects category
3. Shows agents in that category with descriptions
4. User selects agent
5. Generates Task tool invocation template

#### Option B: Agent Search

**Slash command:** `/find-agent <keywords>`

**Example:**
```
User: /find-agent permission security
Output:
Agents matching "permission security":

1. opspal-salesforce:sfdc-permission-orchestrator ⭐
   → Best match for permission set creation and management

2. opspal-salesforce:sfdc-security-admin
   → Security configuration, profiles, field-level security

3. opspal-salesforce:sfdc-permission-assessor
   → Permission auditing and assessment

Recommended: opspal-salesforce:sfdc-permission-orchestrator
Invoke: Task(subagent_type='opspal-salesforce:sfdc-permission-orchestrator', prompt='...')
```

#### Option C: Quick Reference Card

**Create file:** `.claude/AGENT_QUICK_REFERENCE.md`

**Contents:**
```markdown
# Agent Quick Reference

## When you need to...

**Assess CPQ/Quote-to-Cash:**
→ Use `opspal-salesforce:sfdc-cpq-assessor`

**Audit Revenue Operations:**
→ Use `opspal-salesforce:sfdc-revops-auditor`

**Create Permission Sets:**
→ Use `opspal-salesforce:sfdc-permission-orchestrator`

**Import/Export Data:**
→ Use `opspal-salesforce:sfdc-data-operations`

**Deploy to Production:**
→ Use `release-coordinator`

## Pattern Matching

If task includes "audit" or "assessment" → Use specialist assessor
If task includes "create" + "permission" → Use permission-orchestrator
If task includes "deploy" + "production" → Use release-coordinator
```

### Benefits

- ✅ Self-service agent discovery
- ✅ No dependency on hooks
- ✅ Educational for users

---

## Implementation Roadmap

### Phase 1: Immediate (Already Done ✅)
- [✅] Enhanced CLAUDE.md with BLOCKED operations
- [✅] Complexity self-assessment guide
- [✅] Pre-response self-check protocol
- [✅] Test and validate effectiveness

### Phase 2: Short-term (Next 1-2 days)
- [ ] Create slash commands (`/route`, `/agents`, `/complexity`)
- [ ] Enhance hooks with terminal visual indicators (stderr)
- [ ] Create pre-flight validation with exit code 1 blocking
- [ ] Test exit code blocking behavior

### Phase 3: Medium-term (Next week)
- [ ] Implement post-task compliance checking
- [ ] Create agent quick reference card
- [ ] Add agent search/discovery tools
- [ ] Monitor effectiveness and iterate

### Phase 4: Long-term (When bug fixed)
- [ ] Regression test hook output injection
- [ ] Remove stopgap solutions
- [ ] Restore dynamic routing
- [ ] Document bug resolution

---

## Success Metrics

### Primary Metrics

**Agent Utilization Rate:**
- Target: ≥75% of BLOCKED operations use correct agent
- Baseline: TBD (track next 50 tasks)
- Measurement: PostToolUse compliance logs

**Routing Accuracy:**
- Target: ≥90% correct agent selection
- Measurement: User feedback + task outcomes

**User Friction:**
- Target: <2% of tasks require `/route` command
- Measurement: Command usage logs

### Secondary Metrics

**False Positives:**
- Tasks incorrectly flagged as BLOCKED
- Target: <5%

**False Negatives:**
- BLOCKED tasks attempted directly
- Target: <10%

**User Satisfaction:**
- Users report routing as "helpful" vs "annoying"
- Target: >80% positive

---

## Monitoring & Iteration

### Data Collection

**Log Files:**
```
$HOME/.claude/logs/
├── routing.jsonl         # Routing decisions
├── compliance.jsonl      # PostToolUse compliance checks
├── commands.jsonl        # Slash command usage
└── violations.jsonl      # BLOCKED operation violations
```

**Analytics Script:**
```bash
# Generate weekly routing report
node .claude-plugins/opspal-core/scripts/lib/routing-analytics.js --period 7d

# Output:
# - Agent utilization by type
# - Compliance rate
# - Top violations
# - Recommendations
```

### Feedback Loop

1. **Weekly Review**: Analyze logs and metrics
2. **Pattern Detection**: Identify recurring issues
3. **CLAUDE.md Updates**: Refine keyword patterns
4. **Documentation**: Update based on user questions
5. **Iteration**: Enhance stopgap solutions

---

## User Communication

### Documentation Updates

**Update docs with:**
- "Known issue: Hook output injection broken"
- "Current solution: Enhanced CLAUDE.md + slash commands"
- "How to verify agent routing"
- "What to do if Claude ignores routing"

**Files to update:**
- `README.md`
- `docs/GETTING_STARTED.md`
- `docs/TROUBLESHOOTING.md`
- `.claude/AGENT_USAGE_EXAMPLES.md`

### User Expectations

**Set clear expectations:**
✅ **What works:** CLAUDE.md routing, slash commands, manual agent selection
❌ **What's broken:** Dynamic hook recommendations, complexity scoring
⏳ **Timeline:** Waiting for Anthropic to fix (no ETA)

---

## Rollback Plan

If stopgap solutions cause issues:

1. **Immediate:** Remove problematic slash commands
2. **Fallback:** Rely solely on CLAUDE.md (proven to work)
3. **Nuclear:** Remove all hooks (exit 0, no logic)
4. **Communicate:** Update users on status

---

## Cost-Benefit Analysis

### Costs

**Development Time:**
- Slash commands: ~4 hours
- Enhanced hooks: ~2 hours
- Testing & validation: ~4 hours
- **Total:** ~10 hours

**Maintenance:**
- Weekly log review: ~30 min/week
- CLAUDE.md updates: ~1 hour/month
- User support: ~2 hours/month

### Benefits

**Time Savings:**
- Prevents wrong agent selection: ~2 hours/week saved
- Reduces routing confusion: ~1 hour/week saved
- **Annual savings:** ~150 hours

**Quality Improvements:**
- Higher agent utilization (target 75%)
- Fewer errors from direct execution
- Better task outcomes

**ROI:** ~15:1 (150 hours saved / 10 hours invested)

---

## Next Steps

### Immediate Actions

1. **Create slash commands** (highest ROI)
   - `/route` - routing recommendations
   - `/agents` - agent discovery
   - `/complexity` - complexity assessment

2. **Test exit code blocking**
   - Verify exit 1 actually blocks
   - If works: expand to all BLOCKED operations

3. **Enhance terminal output**
   - Add visual routing banners to stderr
   - User-friendly formatting

4. **Monitor effectiveness**
   - Track agent utilization
   - Collect user feedback
   - Iterate based on data

### Approval Required

**Questions for user:**
- [ ] Proceed with slash command implementation?
- [ ] Test exit code 1 blocking?
- [ ] Create agent quick reference card?
- [ ] Set up analytics/monitoring?

---

**Status**: 📋 Plan Ready for Implementation
**Priority**: HIGH
**Timeline**: Phase 1 complete, Phase 2 ready to start
**Owner**: TBD
**Next Review**: After Phase 2 implementation

**Last Updated**: 2025-12-10
**Version**: 1.0
