# Bug Report for Anthropic - Claude Code Hook Output Injection

**Target**: GitHub Issue #12151 (expand scope) or new issue
**Priority**: HIGH - Critical feature completely non-functional
**Affects**: Claude Code v2.0.64 (likely all versions)
**Impact**: All hook output injection mechanisms broken

---

## Issue Title

**Hook output injection completely broken - affects ALL hooks, not just plugins**

---

## Summary

Hook scripts execute successfully and return exit code 0, but their stdout output is **silently discarded** and never injected into Claude's context. This affects ALL hooks (plugin and project-level) for all hook types (UserPromptSubmit, SessionStart, etc.).

**Current GitHub #12151** describes this as a plugin-specific issue, but our investigation proves it affects **all hooks regardless of registration location**.

---

## Reproduction Steps

### Minimal Test Case

1. Create project-level hook:

```bash
# .claude/hooks/test-hook.sh
#!/bin/bash
echo "TEST OUTPUT: If you see this, hooks work!"
exit 0
```

2. Register hook:

```json
// .claude/hooks/hooks.json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "type": "command",
        "command": "bash .claude/hooks/test-hook.sh"
      }
    ]
  }
}
```

3. Start Claude Code and send any message

**Expected Result:**
- Claude's context includes: "TEST OUTPUT: If you see this, hooks work!"
- Per docs: "stdout is added to context" for exit code 0

**Actual Result:**
- System reminder shows: `UserPromptSubmit hook success: Success`
- Claude's context shows: **NOTHING** (output silently discarded)

---

## Environment

- **Claude Code Version**: 2.0.64
- **OS**: Linux 6.14.0-36-generic (also affects macOS per other reports)
- **Hook Type Tested**: UserPromptSubmit, SessionStart
- **Hook Location Tested**: Both `.claude/hooks/` (project) and `.claude-plugins/*/hooks/` (plugin)
- **Node.js**: Available and functional
- **jq**: v1.7 installed

---

## Expected Behavior (Per Documentation)

From [Claude Code Hooks Documentation](https://docs.claude.com/en/docs/claude-code/hooks):

> **Exit code 0**: For UserPromptSubmit/SessionStart, stdout is added to context

**Expected flow:**
1. Hook executes → returns exit 0
2. Hook stdout captured by Claude Code
3. Stdout content injected into Claude's context
4. Claude sees and uses the injected content

---

## Actual Behavior

**What we observe:**
1. ✅ Hook executes (verified via file writes, logs, side effects)
2. ✅ Exit code 0 returned
3. ✅ Success callback appears: `UserPromptSubmit hook success: Success`
4. ❌ **Stdout is silently discarded** (never captured)
5. ❌ **Nothing injected into Claude's context**

**Only the success/failure callback appears in system reminders. The actual output is lost.**

---

## Evidence

### Test 1: Manual Hook Execution (Works ✅)

```bash
$ echo '{"message":"test"}' | bash .claude-plugins/opspal-core/hooks/master-prompt-handler.sh
[ROUTING] Agent: opspal-salesforce:sfdc-revops-auditor | Confidence: 70% | Complexity: 0%

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[ROUTING] Agent: opspal-salesforce:sfdc-revops-auditor | Confidence: 70%
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[Agent Available: opspal-salesforce:sfdc-revops-auditor]

If task becomes complex: Task(subagent_type='opspal-salesforce:sfdc-revops-auditor', prompt=...)

---
test
```

**Result:** Hook produces valid output ✅

### Test 2: Claude Code Execution (Fails ❌)

**User sends:** "Test Message 2, perform q2c audit"

**System reminder shows:**
```
UserPromptSubmit hook success: Success
```

**Claude's context contains:**
- User message: "Test Message 2, perform q2c audit" ✅
- Hook output: **NOTHING** ❌

**Expected but missing:**
```
[ROUTING] Agent: opspal-salesforce:sfdc-cpq-assessor | Confidence: 95% | Complexity: 85%

INSTRUCTION: Before responding, evaluate this agent recommendation.
[... full routing recommendation ...]
```

### Test 3: JSON Output Format (Also Fails ❌)

Tested with JSON `systemMessage` field:

```bash
#!/bin/bash
echo '{
  "systemMessage": "TEST MESSAGE from hook"
}'
exit 0
```

**Result:** Still not injected into context ❌

### Test 4: hookSpecificOutput (Also Fails ❌)

Tested with documented `hookSpecificOutput.additionalContext`:

```bash
#!/bin/bash
echo '{
  "hookSpecificOutput": {
    "additionalContext": "TEST CONTEXT from hook"
  }
}'
exit 0
```

**Result:** Still not injected into context ❌

---

## Scope of Bug

### Originally Reported (GitHub #12151)
- "Plugin hook output not captured"
- Implied: Project-level hooks might work

### Actual Scope (Our Findings)
- ❌ **ALL hooks affected** (plugin AND project-level)
- ❌ **ALL output formats broken** (plain text, JSON, systemMessage, hookSpecificOutput)
- ❌ **ALL hook types likely affected** (UserPromptSubmit, SessionStart tested; others untested)
- ✅ **Hook execution works** (scripts run, exit codes handled)
- ✅ **Only output capture is broken** (the injection mechanism itself)

---

## Related GitHub Issues

These issues likely share the same root cause:

- **#12151** - Plugin hook output not captured ← **THIS ISSUE (expand scope)**
- **#10373** - SessionStart hooks not working for new conversations
- **#10225** - UserPromptSubmit hooks not executing from plugins
- **#8810** - UserPromptSubmit hooks not working from subdirectories

**Common thread:** Hook output not reaching Claude's context

---

## Impact Assessment

### Severity: CRITICAL

**Why critical:**
1. **Documented feature completely broken** - output injection is a core hook use case
2. **No workaround within hook system** - cannot be fixed without Claude Code changes
3. **Affects all users using hooks** - both plugin developers and end users
4. **Breaking change** - if this ever worked, it's now broken

### User Impact

**What users cannot do:**
- ❌ Dynamic context injection (routing recommendations, complexity scoring)
- ❌ Hook-based guidance and instructions
- ❌ Outcome-based messaging
- ❌ Advisory blocking with context

**What still works:**
- ✅ Hook execution (scripts run)
- ✅ Exit code handling (blocking with exit 1/2)
- ✅ External side effects (logging, file creation)
- ✅ stderr output (terminal visible, not Claude)

**Workaround:**
Users must rely on static instructions in CLAUDE.md instead of dynamic hook output. This works but defeats the purpose of hooks.

---

## Technical Analysis

### The Break Point

**Hook execution pipeline:**
```
User Message → Claude Code
    ↓
Hook Discovery ✅ (works)
    ↓
Hook Execution ✅ (works)
    ↓
Script Runs ✅ (works)
    ↓
Script Returns Output ✅ (works)
    ↓
Claude Code Captures Output ❌ [BUG HERE]
    ↓
Output Injected to Context ❌ (never happens)
```

**The bug is in the output capture mechanism**, not hook execution.

### Hypothesis

Possible causes:
1. **Output stream not read** - Claude Code may not be reading stdout
2. **Buffer/timing issue** - Output may be captured but discarded before injection
3. **Context injection disabled** - Feature may be disabled or broken
4. **Registration difference** - Plugin vs. project hooks may use different code paths (both broken)

---

## Minimal Reproduction Repository

We can provide a minimal reproduction case if helpful:

```
test-hooks-repo/
├── .claude/
│   ├── hooks/
│   │   ├── hooks.json
│   │   └── test-hook.sh
│   └── settings.json
└── README.md (reproduction steps)
```

Would you like us to create this?

---

## Requested Fix

### Primary Request

**Fix the hook output capture mechanism** so that:
1. Hook stdout is captured for exit code 0
2. Plain text stdout is injected into Claude's context
3. JSON `systemMessage` field is injected into context
4. JSON `hookSpecificOutput.additionalContext` is injected into context
5. This works for ALL hook types (UserPromptSubmit, SessionStart, PostToolUse, etc.)
6. This works for ALL hook locations (plugin, project, user scope)

### Verification

After fix, this should work:

```bash
# .claude/hooks/test.sh
#!/bin/bash
echo "Hook output appears in Claude's context"
exit 0
```

**Expected in Claude's context:**
```
<system-reminder>
UserPromptSubmit hook success: Success
</system-reminder>

Hook output appears in Claude's context

[User's original message]
```

---

## Additional Information

### Test Files Available

We have extensive test results and documentation:
- Complete test evidence with reproduction steps
- Comparison of expected vs. actual behavior
- Test matrix covering all output formats
- Workaround documentation

Available upon request.

### User Impact Mitigation

We've implemented a working workaround using static CLAUDE.md instructions, but this is not a sustainable solution. Users need dynamic hook output for:
- Complex routing logic
- Context-aware recommendations
- Real-time complexity scoring
- Evidence-based guidance

---

## Priority Justification

This should be **HIGH PRIORITY** because:

1. **Core documented feature is broken** - not an edge case
2. **Affects all hook users** - widespread impact
3. **No user-side fix possible** - requires Claude Code changes
4. **Workarounds are suboptimal** - defeat the purpose of hooks
5. **May be a regression** - unclear if this ever worked

---

## Questions for Anthropic

1. **Did hook output injection ever work?** (Is this a regression?)
2. **Is this intended behavior?** (Should we use stderr instead?)
3. **Is there a documented workaround?** (Alternative to stdout injection?)
4. **What's the expected timeline for a fix?** (So users can plan accordingly)

---

## Contact

We're happy to provide:
- Additional test cases
- Minimal reproduction repository
- Testing assistance
- Workaround documentation for other users

**Reported by:** RevPal Engineering Team
**Date:** 2025-12-10
**Version Tested:** Claude Code 2.0.64

---

## Appendix: Test Environment Details

**Full environment details:**
```
Claude Code: 2.0.64
OS: Linux 6.14.0-36-generic
Node.js: Available (version not specified)
jq: 1.7
Shell: bash
Working Directory: /home/chris/Desktop/RevPal/Agents/opspal-internal-plugins
Git Repo: Yes
```

**Hook tested:**
- Location: `.claude/hooks/hooks.json` (project-level)
- Alternative location tested: `.claude-plugins/*/hooks/` (plugin-level)
- Both locations exhibit same behavior (output not captured)

**Hook script characteristics:**
- Executable permissions: ✅ Set correctly
- Shebang: ✅ `#!/bin/bash`
- Exit code: ✅ Returns 0
- Output format: ✅ Valid plain text and JSON
- Dependencies: ✅ jq available, all scripts work manually

---

**End of Bug Report**
