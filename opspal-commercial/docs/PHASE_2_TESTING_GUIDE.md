# Phase 2 Testing & Validation Guide

**Purpose**: Comprehensive testing plan for stopgap solution components
**Status**: Ready for testing
**Date**: 2025-12-10

---

## Prerequisites

**Completed:**
- ✅ Enhanced CLAUDE.md (Phase 1 - proven effective)
- ✅ Slash commands created (`/route`, `/agents`, `/complexity`)
- ✅ Terminal indicator hooks created
- ✅ Pre-flight blocker hook created

**Next:**
- Test all components
- Collect results
- Update documentation
- Begin monitoring

---

## Test Suite 1: Slash Commands

### Test 1.1: `/route` Command - BLOCKED Operation

**Command:**
```
/route create a new permission set
```

**Expected Output:**
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎯 ROUTING RECOMMENDATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Task: create a new permission set
Agent: opspal-salesforce:sfdc-permission-orchestrator
Confidence: 95%
Complexity: HIGH (80%)

⛔ BLOCKED OPERATION

This task is PROHIBITED from direct execution per CLAUDE.md.

You MUST invoke:
Task(subagent_type='opspal-salesforce:sfdc-permission-orchestrator', prompt='create a new permission set')
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**Validation Checklist:**
- [ ] Correct agent identified
- [ ] BLOCKED status shown
- [ ] Task() invocation provided
- [ ] Confidence and complexity scores present

---

### Test 1.2: `/route` Command - Direct Execution OK

**Command:**
```
/route add a checkbox field to Account
```

**Expected Output:**
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎯 ROUTING RECOMMENDATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Task: add a checkbox field to Account
Agent: None
Confidence: N/A
Complexity: LOW (15%)

✅ DIRECT EXECUTION OK

No specialized agent needed. This is a simple, single-object modification
that can be handled directly.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**Validation Checklist:**
- [ ] No agent recommended
- [ ] Direct execution approved
- [ ] Low complexity identified
- [ ] Clear explanation provided

---

### Test 1.3: `/agents` Command - Filter by Keyword

**Command:**
```
/agents permission
```

**Expected Output:**
```
Available agents matching "permission":

• opspal-salesforce:sfdc-permission-orchestrator
  → Permission set creation and management

  Description:
  - Profile configuration
  - Field-level security
  - Object-level security
  - Permission set management

  Use when: Creating permission sets, security configuration, access control

  Invoke: Task(subagent_type='opspal-salesforce:sfdc-permission-orchestrator', prompt='...')
```

**Validation Checklist:**
- [ ] Correct agents filtered
- [ ] Clear descriptions
- [ ] Invocation template provided
- [ ] Organized output

---

### Test 1.4: `/agents` Command - Show All

**Command:**
```
/agents all
```

**Expected Output:**
Complete catalog organized by category (Salesforce Operations, Cross-Platform Operations, etc.)

**Validation Checklist:**
- [ ] All agents listed
- [ ] Organized by category
- [ ] Descriptions clear
- [ ] No duplicates

---

### Test 1.5: `/complexity` Command - HIGH Complexity

**Command:**
```
/complexity run a CPQ assessment
```

**Expected Output:**
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 COMPLEXITY ASSESSMENT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Task: run a CPQ assessment
Complexity: HIGH (85%)

Indicators:
  ✅ Org-wide analysis
  ✅ Assessment/audit task
  ✅ Multi-step operation
  ❌ Production deployment

⛔ SPECIALIST REQUIRED
This task requires a specialized agent for:
- Comprehensive assessment methodology
- Standardized output format
- Expert domain knowledge

Recommended agent: opspal-salesforce:sfdc-cpq-assessor
Invoke: Task(subagent_type='opspal-salesforce:sfdc-cpq-assessor', prompt='run a CPQ assessment')
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**Validation Checklist:**
- [ ] HIGH complexity identified
- [ ] Indicators shown
- [ ] Agent recommended
- [ ] Clear justification

---

### Test 1.6: `/complexity` Command - LOW Complexity

**Command:**
```
/complexity add a checkbox field
```

**Expected Output:**
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 COMPLEXITY ASSESSMENT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Task: add a checkbox field
Complexity: LOW (15%)

Indicators:
  ✅ Single field creation
  ❌ Multi-step operation
  ❌ Cross-platform
  ❌ Audit task

✅ DIRECT EXECUTION OK
This is a straightforward task that can be handled directly.
No specialized agent needed.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**Validation Checklist:**
- [ ] LOW complexity identified
- [ ] Indicators accurate
- [ ] Direct execution approved
- [ ] No agent recommended

---

## Test Suite 2: Terminal Indicators

### Test 2.1: Visual Banner in Terminal

**Setup:**
Register hook in `.claude/hooks/hooks.json`:
```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "type": "command",
        "command": "bash .claude/hooks/enhanced-routing-banner.sh",
        "description": "Visual routing banner in terminal"
      }
    ]
  }
}
```

**Test Input:**
```
User message: "Run a CPQ assessment"
```

**Expected Terminal Output (stderr):**
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎯 ROUTING RECOMMENDATION (Terminal Only)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Agent: opspal-salesforce:sfdc-cpq-assessor
Confidence: 95%
Complexity: 85%

⚠️ Note: Claude cannot see this message (bug #12151)
Please verify Claude uses the recommended agent.

Expected: Task(subagent_type='opspal-salesforce:sfdc-cpq-assessor', prompt='...')
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**Validation Checklist:**
- [ ] Banner appears in terminal
- [ ] Colors/formatting correct
- [ ] Agent name shown
- [ ] Confidence and complexity shown
- [ ] Warning note included
- [ ] Claude still routes correctly (via CLAUDE.md)

---

### Test 2.2: Manual Hook Test

**Command:**
```bash
echo '{"message":"Run a CPQ assessment"}' | bash .claude/hooks/enhanced-routing-banner.sh
```

**Expected:**
- stderr: Visual banner (as above)
- stdout: JSON routing output (for Claude, will be discarded)
- Exit code: 0

**Validation:**
- [ ] stderr banner appears
- [ ] stdout has JSON
- [ ] Exit code is 0
- [ ] No errors

---

## Test Suite 3: Pre-Flight Blocking

### Test 3.1: Manual Blocker Test - Dangerous Pattern

**Command:**
```bash
echo '{"message":"deploy to production"}' | bash .claude/hooks/pre-flight-blocker.sh
echo $?
```

**Expected:**
- stderr: Blocking banner
- Exit code: 1

**Validation:**
- [ ] Blocking banner shown
- [ ] Exit code is 1
- [ ] Pattern identified

---

### Test 3.2: Manual Blocker Test - Safe Pattern

**Command:**
```bash
echo '{"message":"add a field"}' | bash .claude/hooks/pre-flight-blocker.sh
echo $?
```

**Expected:**
- stdout: `{}`
- Exit code: 0

**Validation:**
- [ ] No blocking
- [ ] Exit code is 0
- [ ] No errors

---

### Test 3.3: Live Blocker Test (Experimental)

**IMPORTANT:** This test is experimental. Exit code blocking may not work.

**Setup:**
Register hook in `.claude/hooks/hooks.json`:
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

**Test Input:**
```
User message: "deploy to production"
```

**Possible Outcomes:**

**Outcome A: Blocking Works ✅**
- Claude is blocked from executing
- Error message shown to user
- This would be EXCELLENT news

**Outcome B: Blocking Fails ❌**
- Claude attempts to execute
- No blocking occurs
- This is expected given output injection bug

**Outcome C: Partial Success ⚠️**
- Error shown but Claude proceeds
- Hook executes but blocking ineffective

**Documentation:**
Record actual outcome for future reference.

---

## Test Suite 4: Integration Testing

### Test 4.1: CLAUDE.md + Slash Commands

**Scenario:** User sends complex request

**Test:**
1. User: "perform q2c audit"
2. Check: CLAUDE.md routing (automatic)
3. Verify: Claude uses correct agent
4. Run: `/route perform q2c audit`
5. Compare: Slash command vs automatic routing

**Validation:**
- [ ] Automatic routing works
- [ ] Slash command matches
- [ ] Both recommend same agent
- [ ] Confidence/complexity consistent

---

### Test 4.2: Terminal Indicators + Slash Commands

**Scenario:** User checks routing manually

**Test:**
1. User: "create permission set"
2. Check terminal for banner
3. Run: `/route create permission set`
4. Compare outputs

**Validation:**
- [ ] Terminal shows routing
- [ ] Slash command shows routing
- [ ] Both consistent
- [ ] User has visibility

---

## Test Suite 5: User Acceptance

### Test 5.1: Real-World Tasks

**Task Set:**
1. "Run a CPQ assessment"
2. "Create a new permission set"
3. "Add a checkbox field to Account"
4. "Audit automation across the org"
5. "Build a sales dashboard"

**For Each Task:**
- [ ] CLAUDE.md routes correctly
- [ ] `/route` matches recommendation
- [ ] `/complexity` assesses correctly
- [ ] Terminal banner appears (if hook registered)
- [ ] User experience is smooth

---

### Test 5.2: User Feedback Collection

**Questions:**
1. Did CLAUDE.md routing work automatically?
2. Did you need to use slash commands?
3. Were slash commands helpful?
4. Did you notice terminal indicators?
5. Overall satisfaction (1-5)?

**Record Responses:**
- User 1: [feedback]
- User 2: [feedback]
- User 3: [feedback]
- User 4: [feedback]
- User 5: [feedback]

---

## Test Results Template

### Test Execution Log

**Date:** [YYYY-MM-DD]
**Tester:** [Name]
**Claude Code Version:** [Version]

| Test ID | Test Name | Status | Notes |
|---------|-----------|--------|-------|
| 1.1 | /route BLOCKED | ⏳ | [results] |
| 1.2 | /route Direct OK | ⏳ | [results] |
| 1.3 | /agents filter | ⏳ | [results] |
| 1.4 | /agents all | ⏳ | [results] |
| 1.5 | /complexity HIGH | ⏳ | [results] |
| 1.6 | /complexity LOW | ⏳ | [results] |
| 2.1 | Terminal banner | ⏳ | [results] |
| 2.2 | Manual hook test | ⏳ | [results] |
| 3.1 | Blocker dangerous | ⏳ | [results] |
| 3.2 | Blocker safe | ⏳ | [results] |
| 3.3 | Live blocking | ⏳ | [results] |
| 4.1 | Integration test 1 | ⏳ | [results] |
| 4.2 | Integration test 2 | ⏳ | [results] |
| 5.1 | Real-world tasks | ⏳ | [results] |
| 5.2 | User feedback | ⏳ | [results] |

**Legend:**
- ⏳ Pending
- ✅ Pass
- ❌ Fail
- ⚠️ Partial

---

## Success Criteria

**Phase 2 Testing Complete When:**
- [ ] All slash commands tested and working
- [ ] Terminal indicators tested (documented behavior)
- [ ] Exit code blocking tested (documented behavior)
- [ ] Integration tests passed
- [ ] User feedback collected (5+ users)
- [ ] Results documented
- [ ] Metrics recorded

**Metrics to Track:**
- Slash command success rate (target: 100%)
- User satisfaction (target: ≥80% positive)
- Agent utilization rate (target: ≥75%)
- Routing accuracy (target: ≥90%)

---

## Known Issues to Document

1. **Hook Output Injection Bug (#12151)**
   - Status: Known bug in Claude Code
   - Impact: Hook stdout not injected into context
   - Workaround: CLAUDE.md + slash commands

2. **Terminal Indicators Visibility**
   - Status: Works via stderr
   - Limitation: Claude cannot see these (only user can)
   - Purpose: User verification only

3. **Exit Code Blocking Uncertainty**
   - Status: Unknown if exit 1 blocks execution
   - Test: Required to determine effectiveness
   - Fallback: CLAUDE.md + slash commands

---

## Next Steps After Testing

1. **Document Results**
   - Update `PHASE_2_TEST_RESULTS.md`
   - Record all findings
   - Note what works and what doesn't

2. **Update User Documentation**
   - Add slash command usage guide
   - Document terminal indicators
   - Update troubleshooting guide

3. **Begin Monitoring**
   - Start collecting metrics
   - Track slash command usage
   - Monitor routing accuracy

4. **Iterate Based on Feedback**
   - Refine slash commands if needed
   - Adjust complexity thresholds
   - Improve documentation

5. **Plan Phase 3**
   - Post-task compliance checking
   - Analytics and reporting
   - Additional enhancements

---

**Status**: Ready for testing
**Next Action**: Execute Test Suite 1 (Slash Commands)
**Timeline**: Complete all tests within 2-3 days

**Last Updated**: 2025-12-10
**Version**: 1.0
