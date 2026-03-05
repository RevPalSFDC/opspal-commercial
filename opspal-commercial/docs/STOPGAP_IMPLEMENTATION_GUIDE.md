# Stopgap Solution Implementation Guide

**Purpose**: Step-by-step instructions for implementing the stopgap solutions until Anthropic fixes hook output injection bug

**Prerequisites**: Read `STOPGAP_SOLUTION_PLAN.md` first

**Status**: Ready for Phase 2 implementation

---

## Quick Start

### What's Already Working (Phase 1 ✅)

**Enhanced CLAUDE.md** - Successfully routes tasks to specialized agents

**Proven in test (2025-12-10):**
- User: "perform q2c audit"
- Claude: Recognized keyword, used `opspal-salesforce:sfdc-cpq-assessor` ✅

**No action needed** - this is your primary solution.

### What to Implement Next (Phase 2)

1. Slash commands for manual routing (`/route`, `/agents`, `/complexity`)
2. Visual terminal indicators (stderr output)
3. Pre-flight validation with exit code blocking
4. Testing and validation

---

## Phase 2: Slash Commands

### Step 1: Create `/route` Command

**File**: `.claude/commands/route.md`

```markdown
---
name: route
description: Get agent routing recommendation for a task
---

You are a routing advisor. The user will provide a task description. Your job is to:

1. **Analyze the task** for keywords and patterns
2. **Match to specialist agents** using the routing table from CLAUDE.md
3. **Calculate complexity** (HIGH/MEDIUM/LOW)
4. **Provide recommendation** with explicit Task() invocation

## Routing Table Reference

Use the PRIME DIRECTIVE routing table from CLAUDE.md:

| Keywords | Agent | Complexity |
|----------|-------|------------|
| cpq, quote, pricing, q2c | opspal-salesforce:sfdc-cpq-assessor | HIGH |
| revops, pipeline, forecast | opspal-salesforce:sfdc-revops-auditor | HIGH |
| automation audit, flow audit | opspal-salesforce:sfdc-automation-auditor | HIGH |
| permission set | opspal-salesforce:sfdc-permission-orchestrator | HIGH |
| create report, dashboard | opspal-salesforce:sfdc-reports-dashboards | MEDIUM |
| import/export data | opspal-salesforce:sfdc-data-operations | MEDIUM-HIGH |
| deploy to production | release-coordinator | HIGH |
| diagram, flowchart | diagram-generator | MEDIUM |

## BLOCKED Operations

These operations MUST use specialized agents:
- CPQ/Q2C Assessment
- RevOps Audit
- Automation Audit
- Permission Set Creation
- Report/Dashboard Creation
- Data Import/Export (>100 records)
- Production Deployment
- Multi-platform Operations

## Output Format

Use this exact format:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎯 ROUTING RECOMMENDATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Task: [task description]
Agent: [agent-name]
Confidence: [percentage]%
Complexity: [HIGH/MEDIUM/LOW] ([percentage]%)

[Status Badge: ⛔ BLOCKED / ⚠️ RECOMMENDED / ℹ️ AVAILABLE / ✅ DIRECT OK]

[If BLOCKED:]
This task is PROHIBITED from direct execution per CLAUDE.md.

You MUST invoke:
Task(subagent_type='[agent-name]', prompt='[task description]')

[If RECOMMENDED:]
This specialist delivers better outcomes for this task type.

Recommended:
Task(subagent_type='[agent-name]', prompt='[task description]')

[If AVAILABLE:]
A specialist is available if needed.

Optional:
Task(subagent_type='[agent-name]', prompt='[task description]')

[If DIRECT OK:]
No specialized agent needed. Direct execution is fine.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## Examples

### Example 1: BLOCKED Operation
User: "Run a CPQ assessment"
Output:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎯 ROUTING RECOMMENDATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Task: Run a CPQ assessment
Agent: opspal-salesforce:sfdc-cpq-assessor
Confidence: 95%
Complexity: HIGH (85%)

⛔ BLOCKED OPERATION

This task is PROHIBITED from direct execution per CLAUDE.md.

You MUST invoke:
Task(subagent_type='opspal-salesforce:sfdc-cpq-assessor', prompt='Run a CPQ assessment')
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### Example 2: Direct Execution OK
User: "Add a checkbox field to Account"
Output:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎯 ROUTING RECOMMENDATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Task: Add a checkbox field to Account
Agent: None
Confidence: N/A
Complexity: LOW (15%)

✅ DIRECT EXECUTION OK

No specialized agent needed. This is a simple, single-object modification
that can be handled directly.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

Now analyze the user's task and provide your recommendation.
```

**Test the command:**
```bash
# In Claude Code
/route create a new permission set
```

**Expected output:**
- Routing banner with agent recommendation
- BLOCKED status
- Task() invocation template

---

### Step 2: Create `/agents` Command

**File**: `.claude/commands/agents.md`

```markdown
---
name: agents
description: List available specialist agents, optionally filtered by keyword
---

You are an agent catalog assistant. List available specialist agents with descriptions.

## Available Agents

### Salesforce Operations

**opspal-salesforce:sfdc-cpq-assessor**
- CPQ/Q2C assessments and audits
- Quote-to-Cash process analysis
- Pricing rule evaluation
- Product bundle configuration
- Use for: CPQ audits, pricing analysis, Q2C optimization

**opspal-salesforce:sfdc-revops-auditor**
- Revenue operations auditing
- Pipeline health assessment
- Forecast accuracy analysis
- Sales process optimization
- Use for: RevOps audits, pipeline analysis, GTM strategy

**opspal-salesforce:sfdc-automation-auditor**
- Automation conflict detection
- Flow/Process Builder analysis
- Workflow rule evaluation
- Trigger dependency mapping
- Use for: Automation audits, conflict resolution, cascade analysis

**opspal-salesforce:sfdc-permission-orchestrator**
- Permission set creation and management
- Profile configuration
- Field-level security
- Object-level security
- Use for: Permission sets, security configuration, access control

**opspal-salesforce:sfdc-reports-dashboards**
- Report creation and optimization
- Dashboard design and deployment
- Reporting analytics
- KPI visualization
- Use for: Reports, dashboards, analytics

**opspal-salesforce:sfdc-data-operations**
- Data import/export
- Bulk data operations
- Data migration
- CSV processing
- Use for: Data imports, exports, migrations (>100 records)

**opspal-salesforce:sfdc-metadata-manager**
- Metadata deployment
- Field creation
- Object management
- Validation rules
- Use for: Object/field creation, metadata deployment

### Cross-Platform Operations

**release-coordinator**
- Production deployments
- Release management
- Multi-platform releases
- Version tagging
- Use for: Production deployments, release management

**diagram-generator**
- Architecture diagrams
- Process flowcharts
- Entity relationship diagrams
- Sequence diagrams
- Use for: Documentation, visualization, architecture

## Usage

**With keyword filter:**
```
/agents [keyword]
```

**Examples:**
```
/agents cpq          # Show CPQ-related agents
/agents permission   # Show permission-related agents
/agents data         # Show data operation agents
/agents all          # Show all agents
```

## Output Format

When user provides a keyword, filter agents matching that keyword and display:

```
Available agents matching "[keyword]":

• [agent-name]
  → [primary use case]

  Description:
  - [capability 1]
  - [capability 2]
  - [capability 3]

  Use when: [scenario description]

  Invoke: Task(subagent_type='[agent-name]', prompt='...')

• [next agent...]
```

If no keyword or "all", show complete catalog organized by category.

If no matches found:
```
No agents found matching "[keyword]".

Try:
- /agents all (show all agents)
- /agents cpq (CPQ/quote specialists)
- /agents data (data operation specialists)
- /agents security (permission/security specialists)
```

Now process the user's request.
```

**Test the command:**
```bash
/agents cpq
/agents permission
/agents all
```

---

### Step 3: Create `/complexity` Command

**File**: `.claude/commands/complexity.md`

```markdown
---
name: complexity
description: Assess task complexity and determine if a specialist agent is needed
---

You are a task complexity analyzer. Assess the user's task and determine complexity level.

## Complexity Criteria

### 🔴 HIGH Complexity (≥70%)
**Requires specialist agent**

Indicators:
- Multi-step operations (3+ steps)
- Cross-platform operations
- Org-wide analysis or audit
- Data migrations (>1000 records)
- Production deployments
- Assessment/audit tasks
- Complex validation logic
- Multiple object dependencies

Examples:
- "Run a CPQ assessment"
- "Audit automation across the org"
- "Deploy to production"
- "Migrate data from legacy system"

### 🟡 MEDIUM Complexity (30-70%)
**Specialist recommended**

Indicators:
- Multi-object modifications
- Workflow/Flow creation
- Permission restructuring
- Integration setup
- Report/dashboard creation
- Moderate data operations (100-1000 records)

Examples:
- "Create a new approval workflow"
- "Build a sales dashboard"
- "Configure integration with external API"
- "Create permission set for sales team"

### 🟢 LOW Complexity (<30%)
**Direct execution OK**

Indicators:
- Single field creation
- Simple SOQL queries
- Documentation updates
- Configuration reads
- Single-file edits
- Simple picklist updates

Examples:
- "Add a checkbox field to Account"
- "Query all open opportunities"
- "Update README with new instructions"
- "Add a picklist value"

## Output Format

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 COMPLEXITY ASSESSMENT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Task: [task description]
Complexity: [HIGH/MEDIUM/LOW] ([percentage]%)

Indicators:
  [✅ or ❌] [indicator 1]
  [✅ or ❌] [indicator 2]
  [✅ or ❌] [indicator 3]

[If HIGH:]
⛔ SPECIALIST REQUIRED
This task requires a specialized agent for:
- [reason 1]
- [reason 2]

Recommended agent: [agent-name]
Invoke: Task(subagent_type='[agent-name]', prompt='...')

[If MEDIUM:]
⚠️ SPECIALIST RECOMMENDED
While direct execution is possible, a specialist would deliver:
- Better coverage and completeness
- Standardized output format
- Error prevention

Recommended agent: [agent-name]
Invoke: Task(subagent_type='[agent-name]', prompt='...')

[If LOW:]
✅ DIRECT EXECUTION OK
This is a straightforward task that can be handled directly.
No specialized agent needed.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

Now assess the user's task.
```

**Test the command:**
```bash
/complexity add a checkbox field
/complexity run a CPQ assessment
/complexity create a new permission set
```

---

## Phase 2: Visual Terminal Indicators

### Step 4: Enhance Hook stderr Output

**File**: `.claude/hooks/enhanced-routing-banner.sh`

```bash
#!/bin/bash
#
# Enhanced Routing Banner (stderr output)
# Shows routing recommendations in terminal (visible to user)
#

set -euo pipefail

# Read hook input
HOOK_INPUT=$(cat)
USER_MESSAGE=$(echo "$HOOK_INPUT" | jq -r '.message // .userMessage // ""')

# Skip if empty
if [ -z "$USER_MESSAGE" ]; then
  echo '{}'
  exit 0
fi

# Call routing logic (reuse existing)
ROUTING_OUTPUT=$(echo "$HOOK_INPUT" | bash .claude-plugins/opspal-core/hooks/master-prompt-handler.sh 2>/dev/null || echo '{}')

# Extract metadata
AGENT=$(echo "$ROUTING_OUTPUT" | grep -oP "Agent: \K[^ ]+" || echo "")
CONFIDENCE=$(echo "$ROUTING_OUTPUT" | grep -oP "Confidence: \K[0-9]+" || echo "0")
COMPLEXITY=$(echo "$ROUTING_OUTPUT" | grep -oP "Complexity: \K[0-9]+" || echo "0")

# Output visual banner to terminal (stderr = visible)
if [ -n "$AGENT" ] && [ "$AGENT" != "null" ]; then
  cat >&2 << EOF

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎯 ROUTING RECOMMENDATION (Terminal Only)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Agent: $AGENT
Confidence: ${CONFIDENCE}%
Complexity: ${COMPLEXITY}%

⚠️ Note: Claude cannot see this message (bug #12151)
Please verify Claude uses the recommended agent.

Expected: Task(subagent_type='$AGENT', prompt='...')
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

EOF
fi

# Output to Claude (will be discarded, but try anyway)
echo "$ROUTING_OUTPUT"

exit 0
```

**Register in hooks.json:**
```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "type": "command",
        "command": "bash .claude/hooks/enhanced-routing-banner.sh",
        "description": "Visual routing banner in terminal (stderr output)"
      }
    ]
  }
}
```

**Test:**
- Send any message
- Check terminal for routing banner
- Verify colors and formatting

---

## Phase 2: Pre-Flight Validation

### Step 5: Create Hard Blocking Hook

**File**: `.claude/hooks/pre-flight-blocker.sh`

```bash
#!/bin/bash
#
# Pre-Flight Blocker (exit code 1 for dangerous operations)
# Tests if exit code blocking works without output injection
#

set -euo pipefail

HOOK_INPUT=$(cat)
USER_MESSAGE=$(echo "$HOOK_INPUT" | jq -r '.message // .userMessage // ""')

# Skip if empty
if [ -z "$USER_MESSAGE" ]; then
  echo '{}'
  exit 0
fi

# Dangerous patterns (production, deletion, destructive)
DANGEROUS_PATTERNS=(
  "deploy.*prod|production.*deploy"
  "delete.*all|bulk.*delete|mass.*delete"
  "drop.*field|drop.*object|drop.*table"
  "truncate.*table"
  "delete.*\*|rm.*-rf"
)

# Check for dangerous patterns
for pattern in "${DANGEROUS_PATTERNS[@]}"; do
  if echo "$USER_MESSAGE" | grep -qiE "$pattern"; then
    # Output error to terminal (stderr)
    cat >&2 << EOF

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🛑 EXECUTION BLOCKED (Exit Code 1)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Dangerous operation detected: Production/destructive operation

Pattern matched: "$pattern"

This operation requires specialist agent approval.

Use: Task(subagent_type='release-coordinator', prompt='...')
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

EOF

    # Attempt to block with exit 1
    exit 1
  fi
done

# If we get here, allow
echo '{}'
exit 0
```

**Test Plan:**

1. **Test without registration:**
```bash
echo '{"message":"deploy to production"}' | bash .claude/hooks/pre-flight-blocker.sh
echo $?  # Should be 1
```

2. **Register in hooks.json:**
```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "type": "command",
        "command": "bash .claude/hooks/pre-flight-blocker.sh",
        "description": "Hard blocking for dangerous operations (TEST)"
      }
    ]
  }
}
```

3. **Test in Claude Code:**
```
User: "deploy to production"
Expected: Claude blocked or shows error
Actual: [TO BE DETERMINED]
```

4. **Document results:**
- If blocking works: Expand to all BLOCKED operations
- If blocking fails: Document and skip this approach

---

## Testing & Validation

### Test Plan

**Test 1: Slash Commands**
```
/route create a new permission set
Expected: Routing recommendation with BLOCKED status ✅

/agents permission
Expected: List of permission-related agents ✅

/complexity add a checkbox field
Expected: LOW complexity, direct execution OK ✅
```

**Test 2: Terminal Indicators**
```
User: "Run a CPQ assessment"
Expected: Routing banner in terminal (stderr) ✅
Verify: Check terminal for colored banner
```

**Test 3: Exit Code Blocking**
```
User: "deploy to production"
Expected: Execution blocked OR error message ❓
Result: [TO BE TESTED]
```

### Validation Checklist

- [ ] `/route` command works and shows correct recommendations
- [ ] `/agents` command lists agents and filters by keyword
- [ ] `/complexity` command assesses complexity accurately
- [ ] Terminal banners appear in stderr output
- [ ] Exit code 1 blocking tested (document results)
- [ ] User feedback collected
- [ ] Documentation updated

---

## Rollout Plan

### Phase 2A: Slash Commands (Priority 1)
**Timeline**: Immediate
**Risk**: Low
**Impact**: High

1. Create slash command files
2. Test each command
3. Update user documentation
4. Announce availability

### Phase 2B: Terminal Indicators (Priority 2)
**Timeline**: After 2A
**Risk**: Low
**Impact**: Medium

1. Create enhanced banner hook
2. Test stderr output
3. Verify formatting
4. Register hook

### Phase 2C: Exit Code Blocking (Priority 3)
**Timeline**: After 2A & 2B
**Risk**: Medium (untested)
**Impact**: High (if it works)

1. Test exit code 1 behavior
2. Document results
3. If works: Implement broadly
4. If fails: Document and skip

---

## User Documentation

### Update These Files

**README.md:**
```markdown
## Known Issue: Hook Output Injection

Claude Code has a bug (#12151) where hook output is not injected into context.

**Workaround:** We've implemented enhanced CLAUDE.md routing + slash commands.

**What works:**
- ✅ CLAUDE.md automatic routing (tested and proven)
- ✅ `/route` command for manual routing checks
- ✅ `/agents` command for agent discovery
- ✅ `/complexity` command for complexity assessment

**What's broken:**
- ❌ Dynamic hook recommendations (bug in Claude Code)
- ❌ Complexity scoring in context
- ❌ Automatic routing banners

**How to use:**
1. Trust CLAUDE.md automatic routing (it works!)
2. Use `/route <task>` if uncertain about routing
3. Use `/agents [keyword]` to find specialists
4. Check terminal for routing banners (visual only)
```

**docs/TROUBLESHOOTING.md:**
```markdown
## Issue: Claude Not Using Recommended Agent

**Symptom:** Claude attempts direct execution instead of using specialist

**Cause:** Hook output injection bug (#12151)

**Solutions:**
1. Use `/route <task>` command to get explicit recommendation
2. Manually invoke Task tool: `Task(subagent_type='agent-name', prompt='...')`
3. Check terminal for routing banner (shows intended agent)
4. Refer to CLAUDE.md routing table

**Prevention:**
- Use explicit keywords from BLOCKED operations list
- Include "assessment", "audit", or "create" in requests
- Check `/complexity` before starting complex tasks
```

---

## Success Criteria

### Phase 2 Complete When:

- [ ] All 3 slash commands created and tested
- [ ] Terminal indicators working (visible in stderr)
- [ ] Exit code blocking tested and documented
- [ ] User documentation updated
- [ ] Test results recorded
- [ ] User feedback collected (5+ users)

### Metrics to Track:

- Agent utilization rate (target: ≥75%)
- Routing accuracy (target: ≥90%)
- Slash command usage (track frequency)
- User satisfaction (collect feedback)

---

## Troubleshooting

### Issue: Slash Commands Not Found

**Solution:**
- Verify files in `.claude/commands/`
- Check YAML frontmatter format
- Restart Claude Code

### Issue: Terminal Banners Not Appearing

**Solution:**
- Verify hook registered in `.claude/hooks/hooks.json`
- Check stderr redirect (should NOT use `2>&1`)
- Test hook manually: `bash .claude/hooks/enhanced-routing-banner.sh < input.json`

### Issue: Exit Code Blocking Not Working

**Expected:** This is likely, exit code blocking may not work with broken output injection

**Action:**
- Document findings
- Skip this approach
- Rely on CLAUDE.md + slash commands

---

## Next Steps

1. **Implement slash commands** (highest priority)
2. **Test and validate**
3. **Collect user feedback**
4. **Iterate based on results**
5. **Monitor effectiveness**
6. **Plan Phase 3** (post-task compliance, analytics)

---

**Status**: Ready for implementation
**Owner**: TBD
**Timeline**: 1-2 days for Phase 2
**Next Review**: After Phase 2 complete

**Last Updated**: 2025-12-10
**Version**: 1.0
