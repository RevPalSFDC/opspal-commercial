# Evidence-Based Protocol Template for Agents

**Purpose:** Standardized template to add to agent prompts (FP-008 Integration)
**ROI:** $8K/year by preventing false positive "success" claims

---

## For Deployment Agents

Add this section after the agent's main instructions:

```markdown
---

## 🔬 EVIDENCE-BASED DEPLOYMENT PROTOCOL (MANDATORY)

**Root Cause Addressed:** Reflection FP-008 - Agents claimed deployment success without verification

### Post-Deployment Verification (REQUIRED)

After EVERY deployment operation, you MUST:

**Step 1: Call Verification Script**
```bash
node scripts/lib/post-deployment-state-verifier.js <org-alias> <component-type> <component-name>
```

**Step 2: Include Verification Evidence in Response**

❌ **BAD - No Evidence:**
```
Dashboard deployment complete.
```

✅ **GOOD - With Evidence:**
```
Dashboard deployment complete. Verifying...

Verification command:
node scripts/lib/post-deployment-state-verifier.js myorg Dashboard Sales_Dashboard

Result:
✅ Verification PASSED
   - Deployed state matches local metadata
   - Dashboard found in org: Sales_Dashboard
   - All components present

✅ Deployment confirmed with evidence.
```

### Required for These Operations:
- Dashboard deployments
- Layout deployments
- Profile/Permission Set deployments
- Custom Field deployments
- Flow deployments
- Any metadata deployment

### Handling Verification Failures:

```
Verification command:
node scripts/lib/post-deployment-state-verifier.js myorg Dashboard Sales_Dashboard

Result:
❌ Verification FAILED
   - Mismatch detected: chartAxisRange element missing in deployed version

⚠️  Deployment reported success but verification failed.
    Investigating discrepancy...
```

### Exit Codes:
- `0` = Verification passed (deployed state matches expected)
- `1` = Verification failed (mismatch detected)
- `2` = Error during verification (unable to retrieve/compare)

---

### NEVER Claim Deployment Success Without:
1. ✅ Running post-deployment-state-verifier.js
2. ✅ Showing verification command and output
3. ✅ Confirming verification passed (exit code 0)

**This protocol prevents false positives that waste user time debugging "successful" deployments that didn't actually work.**

---
```

---

## For Troubleshooting Agents

Add this section after the agent's main instructions:

```markdown
---

## 🔍 EVIDENCE-BASED TROUBLESHOOTING PROTOCOL (MANDATORY)

**Root Cause Addressed:** Reflection FP-008 - Agents made unfounded assumptions about deployment state

### Query Before Assuming (REQUIRED)

Before making ANY diagnosis or assumption about org state:

**Step 1: Query Org to Verify State**

❌ **BAD - Assumption Without Evidence:**
```
The deployment failed because the dashboard already exists.
```

✅ **GOOD - Evidence-Based Diagnosis:**
```
Checking if dashboard exists in org...

Query:
SELECT Id, DeveloperName FROM Dashboard WHERE DeveloperName = 'Sales_Dashboard'

Result:
0 records returned

Evidence shows: Dashboard does NOT exist in org.
The deployment failed for a different reason. Investigating...
```

### Required Queries for Common Scenarios:

**Deployment Troubleshooting:**
```sql
-- Check if component exists
SELECT Id, DeveloperName FROM <ComponentType> WHERE DeveloperName = '<Name>'

-- Check deployment status
SELECT Id, Status, ErrorMessage FROM AsyncApexJob WHERE Id = '<JobId>'

-- Check metadata propagation
SELECT Id, Status FROM MetadataDeployment WHERE Id = '<DeployId>'
```

**Validation Rule Troubleshooting:**
```sql
-- List active validation rules
SELECT Id, ValidationName, Active, ErrorMessage
FROM ValidationRule
WHERE EntityDefinition.QualifiedApiName = '<Object>' AND Active = true
```

**Field Access Troubleshooting:**
```sql
-- Check field existence and accessibility
SELECT QualifiedApiName, IsCompound, IsQueryable
FROM FieldDefinition
WHERE EntityDefinition.QualifiedApiName = '<Object>'
AND QualifiedApiName = '<Field>'
```

### Evidence Template:

```
Diagnosis: <Your diagnosis>

Evidence:
1. Query: <SOQL query>
   Result: <Query result>

2. Query: <Second query if needed>
   Result: <Result>

Conclusion based on evidence: <Evidence-based conclusion>
```

### NEVER Make Diagnoses Based On:
- ❌ "The API probably..."
- ❌ "Usually this means..."
- ❌ "The deployment likely..."
- ❌ "Metadata should have..."

### ALWAYS Base Diagnoses On:
- ✅ Query results
- ✅ API response data
- ✅ Log file evidence
- ✅ Error messages

**This protocol prevents wasted time from incorrect diagnoses based on assumptions instead of actual org state.**

---
```

---

## Agent Integration Checklist

For each agent updated with evidence protocol:

- [ ] Read agent's current prompt
- [ ] Add appropriate protocol section (deployment OR troubleshooting)
- [ ] Add 2-3 examples specific to that agent's domain
- [ ] Test agent follows protocol (spot check)
- [ ] Mark agent as "evidence-protocol: enabled" in metadata

---

## Agents to Update

### Deployment Agents (5)
1. `sfdc-metadata-deployer.md` - Add deployment protocol
2. `sfdc-dashboard-deployer.md` - Add deployment protocol
3. `sfdc-layout-deployer.md` - Add deployment protocol
4. `sfdc-profile-deployer.md` - Add deployment protocol
5. `sfdc-permission-deployer.md` - Add deployment protocol

### Troubleshooting Agents (5)
6. `sfdc-deployment-troubleshooter.md` - Add troubleshooting protocol
7. `sfdc-metadata-analyzer.md` - Add troubleshooting protocol
8. `sfdc-conflict-resolver.md` - Add troubleshooting protocol
9. `sfdc-remediation-executor.md` - Add troubleshooting protocol
10. `sfdc-quality-auditor.md` - Add troubleshooting protocol

---

## Success Criteria

After integration:
- ✅ All 10 agents include evidence protocol
- ✅ Deployment agents call post-deployment-state-verifier.js
- ✅ Troubleshooting agents query before diagnosing
- ✅ No more false positive "deployment successful" claims
- ✅ Diagnoses based on query evidence, not assumptions

**Expected Impact:** Zero FP-008 reflection issues in next 30 days
