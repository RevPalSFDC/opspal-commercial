# Agent Updates Batch Script - Evidence Protocol (FP-008)

**Purpose:** Systematic guide for updating remaining 9 agents with evidence-based protocol
**Status:** 1 of 10 agents complete (sfdc-deployment-manager.md ✅)
**Remaining:** 9 agents
**Estimated Time:** 1.5 hours (9 agents × 10 minutes)

---

## ✅ Completed (1/10)

1. **sfdc-deployment-manager.md** - Evidence protocol added (lines 133-155)

---

## 📋 Remaining Deployment Agents (4/5)

### Agent 2: sfdc-metadata-manager.md

**Insertion Point:** After line ~60 (after "Investigation Tools" section), before main operational content

**Section to Insert:**
```markdown
---

## 🔬 EVIDENCE-BASED DEPLOYMENT PROTOCOL (MANDATORY - FP-008)

**After EVERY metadata deployment:**

```bash
node scripts/lib/post-deployment-state-verifier.js <org> <type> <name>
```

❌ NEVER: "Metadata deployed ✅"
✅ ALWAYS: "Verifying... [verification output] ✅ Confirmed"

**NEVER claim success without:**
- Running post-deployment-state-verifier.js
- Including verification output
- Confirming exit code 0

---
```

### Agent 3: sfdc-dashboard-designer.md

**Insertion Point:** After line ~60 (after "Runbook Context Loading"), before "Core Responsibilities"

**Section to Insert:**
```markdown
---

## 🔬 EVIDENCE-BASED DEPLOYMENT PROTOCOL (MANDATORY - FP-008)

**After dashboard deployment:**

```bash
node scripts/lib/post-deployment-state-verifier.js <org> Dashboard <dashboard-name>
```

❌ NEVER: "Dashboard created ✅"
✅ ALWAYS: "Verifying dashboard deployment... [output] ✅ Confirmed in org"

**Use metadata-reference-resolver.js for report references:**
- Convert IDs to FolderName/DeveloperName format before deployment
- Prevents report reference format errors (FP-009)

---
```

### Agent 4: sfdc-layout-generator.md

**Insertion Point:** After runbook section, before main content

**Section to Insert:**
```markdown
---

## 🔬 EVIDENCE-BASED DEPLOYMENT PROTOCOL (MANDATORY - FP-008)

**After layout/Lightning Page deployment:**

```bash
node scripts/lib/post-deployment-state-verifier.js <org> FlexiPage <page-name>
```

❌ NEVER: "Layout deployed ✅"
✅ ALWAYS: "Verifying layout... [verification] ✅ Confirmed"

---
```

### Agent 5: sfdc-permission-orchestrator.md

**Insertion Point:** After runbook section, before main orchestration content

**Section to Insert:**
```markdown
---

## 🔬 EVIDENCE-BASED DEPLOYMENT PROTOCOL (MANDATORY - FP-008)

**After permission set deployment:**

```bash
node scripts/lib/post-deployment-state-verifier.js <org> PermissionSet <perm-set-name>
```

❌ NEVER: "Permission set deployed ✅"
✅ ALWAYS: "Verifying permissions... [verification] ✅ Confirmed"

**Additional verification for permissions:**
```sql
-- Confirm permission assignments
SELECT Id, Assignee.Username FROM PermissionSetAssignment
WHERE PermissionSet.Name = '<perm-set-name>'
```

---
```

---

## 📋 Troubleshooting Agents (5/5)

### Agent 6: sfdc-metadata-analyzer.md

**Insertion Point:** After "Shared Resources" section (line ~60), before "Investigation Tools"

**Section to Insert:**
```markdown
---

## 🔍 EVIDENCE-BASED TROUBLESHOOTING PROTOCOL (MANDATORY - FP-008)

**Before ANY diagnosis, query org state:**

❌ NEVER assume: "The deployment failed because dashboard exists"
✅ ALWAYS verify:
```sql
SELECT Id FROM Dashboard WHERE DeveloperName = '<name>'
Result: 0 records
Evidence: Dashboard does NOT exist. Different cause.
```

**Base ALL diagnoses on:**
- ✅ Actual query results
- ✅ API responses
- ✅ Error message text

**NEVER diagnose based on:**
- ❌ "The API probably..."
- ❌ "Usually this means..."
- ❌ Assumptions

---
```

### Agent 7: sfdc-conflict-resolver.md

**Insertion Point:** After "Investigation Tools" section (line ~100), before main conflict resolution content

**Section to Insert:**
```markdown
---

## 🔍 EVIDENCE-BASED CONFLICT RESOLUTION (MANDATORY - FP-008)

**Before diagnosing conflicts:**

**1. Query Both Sides:**
```sql
-- Local metadata
[Read local file]

-- Org metadata
SELECT ... FROM ... WHERE ...
Result: [Actual data]

-- Comparison
Difference: [Evidence-based finding]
```

**2. Show Evidence:**
Include query results in diagnosis

**3. Verify Root Cause:**
Don't assume - query to confirm

---
```

### Agent 8: sfdc-remediation-executor.md

**Insertion Point:** After "Shared Resources" section, before operational content

**Section to Insert:**
```markdown
---

## 🔍 EVIDENCE-BASED REMEDIATION (MANDATORY - FP-008)

**After executing remediation:**

**1. Verify Changes Applied:**
```sql
-- Query to confirm remediation
SELECT ... FROM ... WHERE ...
Result: [Actual state after fix]
```

**2. Include Evidence:**
❌ NEVER: "Fix applied ✅"
✅ ALWAYS: "Verifying fix... [query result] ✅ Confirmed"

**3. Show Before/After:**
- Before: [State before remediation]
- After: [State after remediation - queried]
- ✅ Remediation confirmed

---
```

### Agent 9: sfdc-quality-auditor.md

**Insertion Point:** After "Shared Resources" section, before main audit content

**Section to Insert:**
```markdown
---

## 🔍 EVIDENCE-BASED AUDITING (MANDATORY - FP-008)

**All audit findings MUST be query-based:**

❌ NEVER report: "Likely has 50 inactive users"
✅ ALWAYS report: "Query shows 47 inactive users (Login > 90 days)"

**Audit evidence template:**
```
Finding: [Issue description]
Evidence:
- Query: SELECT ... WHERE ...
- Result: X records found
- Impact: [Based on actual data]
```

**NO assumptions in audit reports** - every finding must have supporting query.

---
```

### Agent 10: sfdc-data-operations.md (or sfdc-cli-executor.md)

**Insertion Point:** After initial sections, before operational content

**Section to Insert:**
```markdown
---

## 🔍 EVIDENCE-BASED DATA OPERATIONS (MANDATORY - FP-008)

**After data operations:**

**Verify with query:**
```sql
-- Confirm operation succeeded
SELECT COUNT() FROM <Object> WHERE <Condition>
Result: X records

Expected: Y records
Status: [Match/Mismatch]
```

❌ NEVER: "Imported 100 records ✅"
✅ ALWAYS: "Imported 100 records. Verifying... Query shows 100 records. ✅ Confirmed"

---
```

---

## Batch Update Instructions

### Step-by-Step Process

For each remaining agent:

1. **Open agent file**
2. **Find insertion point:**
   - Deployment agents: After Runbook section, before "MANDATORY: Project Organization" or main content
   - Troubleshooting agents: After "Shared Resources", before "Investigation Tools" or main content
3. **Insert appropriate section** (deployment OR troubleshooting protocol)
4. **Verify markdown formatting** (check code blocks, bullets)
5. **Save file**
6. **Move to next agent**

### Time Estimate
- **Per agent:** 10 minutes (read 2min, find location 1min, insert 5min, verify 2min)
- **9 remaining agents:** 90 minutes
- **Testing/verification:** 15 minutes
- **Documentation:** 15 minutes
- **Total:** 2 hours

---

## Verification Checklist

After all updates:

- [ ] All 10 agents have evidence protocol section
- [ ] Deployment agents (5) have post-deployment verification requirements
- [ ] Troubleshooting agents (5) have query-first investigation requirements
- [ ] All sections have "MANDATORY" or "REQUIRED" emphasis
- [ ] Code examples are correct
- [ ] Markdown renders properly
- [ ] Agents load without errors: `/agents` command

---

## Testing Plan

### Test 1: Agent Loading
```bash
# List all agents - should show all 59 without errors
/agents | grep sfdc-deployment-manager
/agents | grep sfdc-metadata-analyzer
# etc.
```

### Test 2: Spot Check Behavior
- Invoke one deployment agent
- Check if it mentions verification
- Invoke one troubleshooting agent
- Check if it queries before assuming

### Test 3: Markdown Rendering
- Read each updated agent
- Verify sections render correctly
- Check code blocks display properly

---

## Git Commit

After all 10 agents updated:

```bash
git add .claude-plugins/opspal-salesforce/agents/sfdc-*.md

git commit -m "feat(salesforce-plugin): Evidence-based protocol agent updates v3.36.1

Updates 10 agents with FP-008 Evidence-Based Protocol:

DEPLOYMENT AGENTS (5):
- sfdc-deployment-manager ✅ (added post-deployment verification)
- sfdc-metadata-manager (post-deployment verification)
- sfdc-dashboard-designer (dashboard verification + reference format)
- sfdc-layout-generator (layout verification)
- sfdc-permission-orchestrator (permission verification)

TROUBLESHOOTING AGENTS (5):
- sfdc-metadata-analyzer (query-first investigation)
- sfdc-conflict-resolver (evidence-based diagnosis)
- sfdc-remediation-executor (verify-after-fix)
- sfdc-quality-auditor (query-based findings)
- sfdc-data-operations (verify data operations)

IMPACT:
- Prevents false positive success claims
- Requires verification evidence for deployments
- Mandates query-first troubleshooting
- ROI: $8K/year

Version: 3.36.0 → 3.36.1

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Current Status

- ✅ **1/10 complete:** sfdc-deployment-manager.md
- ⏳ **9/10 remaining:** Use this guide to complete

**Next Step:** Continue updating agents 2-10 using the sections defined above.
