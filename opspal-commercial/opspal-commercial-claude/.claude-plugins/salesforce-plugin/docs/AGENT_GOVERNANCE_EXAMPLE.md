# Agent Governance Integration Example
## Before & After: sfdc-security-admin

**Version**: 1.0.0
**Created**: 2025-10-25
**Purpose**: Demonstrate governance integration with a real Tier 4 agent

---

## Overview

This document shows the **before and after** of integrating the Agent Governance Framework into the `sfdc-security-admin` agent (Tier 4 - Security operations).

---

## Before Governance Integration

### Agent Code (Original)

```javascript
// agents/sfdc-security-admin.md
// Original implementation - NO governance controls

async function updatePermissionSet(org, permissionSetName, fieldPermissions) {
    console.log(`Updating ${permissionSetName} in ${org}...`);

    // Direct execution - no risk assessment
    const result = await sfMetadataAPI.updatePermissionSet({
        permissionSetName: permissionSetName,
        fieldPermissions: fieldPermissions
    });

    if (result.success) {
        console.log('✅ Permission set updated successfully');
        return result;
    } else {
        console.error('❌ Permission set update failed');
        throw new Error(result.error);
    }
}
```

### Problems with Original Approach

1. **No Risk Assessment**: Operates without understanding impact
2. **No Approval Workflow**: Production security changes happen automatically
3. **No Audit Trail**: Changes not logged for compliance
4. **No Verification**: Doesn't verify changes took effect
5. **No Rollback Plan**: No documented way to undo changes
6. **No Reasoning**: Doesn't explain why change is needed

### Risk Exposure

- **Unauthorized access**: Agent could grant excessive permissions
- **Compliance violations**: Security changes not auditable
- **Blast radius**: Could affect hundreds of users without approval
- **No rollback**: Issues difficult to undo
- **No accountability**: Can't determine who/what made changes

---

## After Governance Integration

### Agent Frontmatter (Updated)

```yaml
---
name: sfdc-security-admin
model: sonnet
tier: 4  # ← ADDED: Tier 4 (Security operations)
description: Manages Salesforce security with governance controls
tools: mcp_salesforce, Read, Write, Bash
governanceIntegration: true  # ← ADDED: Governance enabled
version: 2.0.0  # ← UPDATED: Major version for governance
---
```

### Agent Code (Governance-Integrated)

```javascript
// agents/sfdc-security-admin.md
// Governance-integrated implementation

const AgentGovernance = require('.claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/agent-governance');

class SecurityAdminAgent {
    constructor() {
        // Initialize governance wrapper
        this.governance = new AgentGovernance('sfdc-security-admin', {
            verbose: true
        });
    }

    async updatePermissionSet(org, permissionSetName, fieldPermissions, options = {}) {
        console.log(`Preparing to update ${permissionSetName} in ${org}...`);

        // Use governance wrapper
        return await this.governance.executeWithGovernance(
            {
                // Operation metadata
                type: 'UPDATE_PERMISSION_SET',
                environment: org,
                componentCount: 1,
                affectedUsers: options.affectedUsers || 0,
                affectedComponents: [
                    `${permissionSetName} Permission Set`,
                    ...fieldPermissions.map(fp => `${fp.object}.${fp.field}`)
                ],

                // Business context
                reasoning: options.reasoning ||
                    `Grant field-level security permissions for ${fieldPermissions.length} field(s) to ${permissionSetName}. ` +
                    `Required for data operations requiring access to these fields.`,

                // Alternatives considered
                alternativesConsidered: options.alternatives || [
                    'Add to System Administrator profile (rejected - too broad, affects all admins)',
                    'Create new permission set (rejected - AgentAccess already exists for this purpose)',
                    'Manual field access (rejected - not scalable for autonomous operations)'
                ],

                // Decision rationale
                decisionRationale: options.rationale ||
                    `Updating AgentAccess permission set provides minimal-impact field access for autonomous agents ` +
                    `without affecting human users or requiring new permission set management.`,

                // Rollback plan
                rollbackPlan: options.rollbackPlan ||
                    `Remove field permissions from ${permissionSetName} if users report access issues or unexpected behavior.`,

                rollbackCommand: `node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/permission-set-rollback.js ${org} ${permissionSetName} ${fieldPermissions.map(fp => `${fp.object}.${fp.field}`).join(',')}`,

                // Dependencies (if any)
                dependencies: options.dependencies || []
            },
            async () => {
                // ACTUAL OPERATION: Update permission set
                const updateResult = await sfMetadataAPI.updatePermissionSet({
                    permissionSetName: permissionSetName,
                    fieldPermissions: fieldPermissions
                });

                if (!updateResult.success) {
                    throw new Error(`Permission set update failed: ${updateResult.error}`);
                }

                console.log('✅ Permission set updated, verifying...');

                // VERIFICATION: Confirm FLS applied
                const verification = await this.verifyFLS(org, fieldPermissions);

                if (!verification.passed) {
                    console.error('❌ Verification failed - FLS not applied');
                    console.error('   Issues:', verification.issues.join(', '));

                    // Attempt rollback
                    await this.rollbackPermissionSet(org, permissionSetName, fieldPermissions);

                    throw new Error('Permission set verification failed after deployment');
                }

                console.log('✅ Verification passed - FLS confirmed');

                return {
                    success: true,
                    permissionSet: permissionSetName,
                    fieldsUpdated: fieldPermissions.length,
                    verification: {
                        performed: true,
                        passed: true,
                        method: 'FLS-verification-query',
                        issues: []
                    }
                };
            }
        );
    }

    async verifyFLS(org, fieldPermissions) {
        // Query FieldPermissions to confirm FLS applied
        const queries = fieldPermissions.map(fp =>
            `SELECT Id FROM FieldPermissions WHERE ParentId IN (SELECT Id FROM PermissionSet WHERE Name = 'AgentAccess') AND SobjectType = '${fp.object}' AND Field = '${fp.object}.${fp.field}' AND PermissionsRead = true`
        );

        const results = await Promise.all(
            queries.map(q => sfDataAPI.query(org, q))
        );

        const issues = [];
        results.forEach((result, i) => {
            if (result.totalSize === 0) {
                issues.push(`${fieldPermissions[i].object}.${fieldPermissions[i].field} not found`);
            }
        });

        return {
            passed: issues.length === 0,
            issues: issues
        };
    }

    async rollbackPermissionSet(org, permissionSetName, fieldPermissions) {
        console.log(`🔄 Attempting rollback of ${permissionSetName}...`);

        // Remove field permissions
        const result = await sfMetadataAPI.removeFieldPermissions({
            permissionSetName: permissionSetName,
            fieldPermissions: fieldPermissions
        });

        if (result.success) {
            console.log('✅ Rollback successful');
        } else {
            console.error('❌ Rollback failed - manual intervention required');
        }

        return result;
    }
}
```

### What Changed?

| Aspect | Before | After |
|--------|--------|-------|
| **Risk Assessment** | ❌ None | ✅ Automatic risk calculation |
| **Approval Required** | ❌ Never | ✅ Always (Tier 4 in all environments) |
| **Audit Trail** | ❌ None | ✅ Complete audit log with reasoning |
| **Verification** | ❌ None | ✅ FLS verification query |
| **Rollback Plan** | ❌ None | ✅ Documented + automated rollback |
| **Reasoning** | ❌ None | ✅ Business context + alternatives |
| **Error Handling** | ❌ Basic | ✅ Comprehensive with rollback |

---

## Execution Flow Comparison

### Before (Original)

```
User Request
    ↓
Agent Receives Request
    ↓
Execute updatePermissionSet()  ← Direct execution, no checks
    ↓
Report success/failure
```

**Duration**: ~5 seconds
**Risk Controls**: 0
**Compliance**: None

### After (Governance-Integrated)

```
User Request
    ↓
Agent Receives Request
    ↓
[GOVERNANCE] Calculate Risk Score  ← Risk: 67/100 (HIGH)
    ↓
[GOVERNANCE] Check if Blocked  ← Not blocked (< 70)
    ↓
[GOVERNANCE] Request Approval  ← Requires approval (HIGH risk)
    ↓
[APPROVAL] Notify security-lead via Slack
    ↓
[APPROVAL] Wait for approval (timeout: 2 hours)
    ↓
[APPROVAL] Granted by security-lead@company.com
    ↓
Execute updatePermissionSet()
    ↓
[VERIFICATION] Verify FLS applied
    ↓
[AUDIT] Log complete action to audit trail
    ↓
Report success with governance metadata
```

**Duration**: ~15 seconds + approval wait time
**Risk Controls**: 5 (risk assessment, approval, verification, audit, rollback)
**Compliance**: Full audit trail

---

## Real-World Scenario

### Scenario: Add Field Access for New Custom Field

**Context**: Agent deployed `Account.Industry_Segment__c` and needs to grant read/edit access to the `AgentAccess` permission set so data operations can query this field.

### Before Governance

```javascript
// Agent directly updates permission set
await updatePermissionSet('production', 'AgentAccess', [
    { object: 'Account', field: 'Industry_Segment__c', read: true, edit: true }
]);

// Output:
// Updating AgentAccess in production...
// ✅ Permission set updated successfully
```

**What could go wrong**:
- Grants access to wrong field
- Grants access to wrong permission set
- Affects 45 users without review
- No audit trail for compliance
- Can't rollback if issues occur

### After Governance

```javascript
// Agent requests governed execution
const result = await securityAdmin.updatePermissionSet(
    'production',
    'AgentAccess',
    [{ object: 'Account', field: 'Industry_Segment__c', read: true, edit: true }],
    {
        reasoning: 'Grant FLS for newly deployed Account.Industry_Segment__c field to AgentAccess permission set. Required for data operations agent to query and update this field.',
        affectedUsers: 45,
        alternatives: [
            'Add to System Admin profile (rejected - affects all admins)',
            'Create new permission set (rejected - AgentAccess exists for this purpose)'
        ],
        rationale: 'AgentAccess permission set is the designated permission set for agent field access. Updating it is the minimal-impact approach.',
        rollbackPlan: 'Remove Account.Industry_Segment__c from AgentAccess field permissions if issues occur'
    }
);

// Output:
// Preparing to update AgentAccess in production...
//
// 📊 Risk Assessment:
//    Score: 67/100 (HIGH)
//
// ⚠️  APPROVAL REQUIRED
//    Risk Score: 67/100 (HIGH)
//
// Approval request sent to: security-lead@company.com
// Waiting for approval...
//
// ✅ Approval granted by security-lead@company.com
//
// Updating permission set...
// ✅ Permission set updated, verifying...
// ✅ Verification passed - FLS confirmed
//
// Audit log created: AL-2025-10-25-14-30-45-A3F2
```

**What's different**:
- ✅ Risk calculated (67/100 - HIGH)
- ✅ Approval obtained from security-lead
- ✅ Verification performed (FLS query)
- ✅ Complete audit trail logged
- ✅ Rollback plan documented
- ✅ Reasoning captured for compliance

---

## Benefits of Integration

### 1. Security

| Benefit | Description |
|---------|-------------|
| **Authorization** | Only approved operations execute |
| **Auditability** | Complete trail for compliance |
| **Least Privilege** | Agents can't exceed their tier |
| **Accountability** | Know who approved what |

### 2. Compliance

| Regulation | Requirement | How Governance Helps |
|------------|-------------|---------------------|
| **GDPR** | Audit trail of data access | Full operation logging |
| **HIPAA** | PHI access controls | Approval for sensitive operations |
| **SOX** | Change control | Documented approval workflows |
| **SOX** | Segregation of duties | Agents can't self-approve |

### 3. Risk Management

| Risk Type | Mitigation |
|-----------|------------|
| **Data corruption** | Verification before reporting success |
| **Unauthorized access** | Approval required for security changes |
| **Production outages** | Rollback plans for all high-risk ops |
| **Compliance violations** | Automated audit trail generation |

---

## Migration Timeline

### Week 1: High-Security Agents (Tier 4)
- `sfdc-security-admin`
- `sfdc-permission-orchestrator`

### Week 2: Metadata Agents (Tier 3)
- `sfdc-metadata-manager`
- `sfdc-deployment-manager`
- `sfdc-automation-builder`

### Week 3: Data Operations Agents (Tier 2)
- `sfdc-data-operations`
- `sfdc-merge-orchestrator`

### Week 4: Testing & Validation
- Integration tests
- Sandbox validation
- Production rollout

---

## Testing Example

```javascript
// test/agent-governance-security-admin.test.js

const SecurityAdminAgent = require('../agents/sfdc-security-admin');

describe('SecurityAdminAgent with Governance', () => {
    it('should calculate HIGH risk for permission set updates in production', async () => {
        const agent = new SecurityAdminAgent();

        // This should trigger governance
        const operation = {
            org: 'production',
            permissionSetName: 'AgentAccess',
            fieldPermissions: [{ object: 'Account', field: 'CustomField__c' }]
        };

        // In test mode, governance should calculate risk but not block
        process.env.GOVERNANCE_TEST_MODE = 'true';

        const result = await agent.updatePermissionSet(
            operation.org,
            operation.permissionSetName,
            operation.fieldPermissions
        );

        expect(result.governance.riskScore).toBeGreaterThan(60);
        expect(result.governance.riskLevel).toBe('HIGH');
        expect(result.governance.approvalRequired).toBe(true);
    });

    it('should block CRITICAL risk operations', async () => {
        const agent = new SecurityAdminAgent();

        // Simulate critical risk operation (50k+ users affected)
        const operation = {
            org: 'production',
            permissionSetName: 'SystemAdministrator',
            fieldPermissions: [...], // Many fields
            affectedUsers: 50000
        };

        process.env.GOVERNANCE_TEST_MODE = 'true';

        await expect(
            agent.updatePermissionSet(
                operation.org,
                operation.permissionSetName,
                operation.fieldPermissions,
                { affectedUsers: operation.affectedUsers }
            )
        ).rejects.toThrow('Operation blocked due to critical risk');
    });
});
```

---

## Rollout Checklist

### For Each Agent:

- [ ] Add `tier` to frontmatter
- [ ] Add `governanceIntegration: true` to frontmatter
- [ ] Register in `agent-permission-matrix.json`
- [ ] Import `AgentGovernance` library
- [ ] Wrap operations with `executeWithGovernance()`
- [ ] Add reasoning for all operations
- [ ] Add rollback plans for high-risk operations
- [ ] Add verification to all operations
- [ ] Add unit tests
- [ ] Update documentation
- [ ] Test in sandbox
- [ ] Deploy to production

---

## Success Metrics

### Before Governance (Original)

- **Approval Rate**: 0% (no approvals)
- **Audit Trail**: 0% (no logging)
- **Verification**: 0% (no verification)
- **Rollback Success**: Unknown (no rollback plans)
- **Compliance**: Manual audit trail generation

### After Governance (Target)

- **Approval Rate**: 100% for Tier 4 operations
- **Audit Trail**: 100% (all operations logged)
- **Verification**: 100% (all operations verified)
- **Rollback Success**: >90% (documented rollback plans)
- **Compliance**: Automated GDPR/HIPAA/SOX reporting

---

## Support

Questions about governance integration?

- **Framework**: `docs/AGENT_GOVERNANCE_FRAMEWORK.md`
- **Integration Guide**: `docs/AGENT_GOVERNANCE_INTEGRATION.md`
- **This Example**: `docs/AGENT_GOVERNANCE_EXAMPLE.md`
- **Issues**: https://github.com/RevPalSFDC/opspal-plugin-internal-marketplace/issues

---

**Last Updated**: 2025-10-25
**Version**: 1.0.0
