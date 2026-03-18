# Agent Governance Integration Guide

**Version**: 1.0.0
**Created**: 2025-10-25
**For**: Salesforce Plugin Developers

---

## Overview

This guide explains how to integrate Salesforce agents with the Agent Governance Framework to ensure safe, controlled autonomous operations.

---

## Quick Start

### 1. Update Agent Frontmatter

Add governance metadata to your agent's YAML frontmatter:

```yaml
---
name: my-custom-agent
model: sonnet
tier: 3  # ← ADD THIS
description: My custom Salesforce agent
tools: mcp_salesforce, Read, Write, Bash
governanceIntegration: true  # ← ADD THIS
version: 1.0.0
---
```

### 2. Import Governance Library

At the start of your agent code:

```javascript
const AgentGovernance = require('./scripts/lib/agent-governance');
const governance = new AgentGovernance('my-custom-agent', { verbose: true });
```

### 3. Wrap High-Risk Operations

```javascript
// Before: Direct execution
await deployCustomField(fieldMetadata);

// After: Governed execution
await governance.executeWithGovernance(
    {
        type: 'DEPLOY_CUSTOM_FIELD',
        environment: orgAlias,
        componentCount: 1,
        reasoning: 'Deploy field for feature XYZ',
        rollbackPlan: 'Delete field if validation fails'
    },
    async () => {
        return await deployCustomField(fieldMetadata);
    }
);
```

---

## Step-by-Step Integration

### Step 1: Determine Your Agent's Permission Tier

| Tier | Operations | Examples |
|------|------------|----------|
| 1 | Read-only (queries, audits) | `sfdc-state-discovery`, `sfdc-automation-auditor` |
| 2 | CRUD records, deploy reports | `sfdc-data-operations`, `sfdc-reports-dashboards` |
| 3 | Deploy metadata (fields, flows) | `sfdc-metadata-manager`, `sfdc-deployment-manager` |
| 4 | Security changes | `sfdc-security-admin`, `sfdc-permission-orchestrator` |
| 5 | Destructive operations | Custom agents only (requires special approval) |

**Choose the LOWEST tier that allows your agent to function.**

### Step 2: Register Agent in Permission Matrix

Edit `config/agent-permission-matrix.json`:

```json
{
  "agents": {
    "my-custom-agent": {
      "tier": 3,
      "description": "My custom agent description",
      "permissions": ["read", "write:records", "deploy:metadata"],
      "maxComponentsPerDeployment": 25,
      "requiresApproval": {
        "production": true,
        "sandbox": {
          "componentCountThreshold": 5
        }
      },
      "requiresDocumentation": true,
      "requiresRollbackPlan": true
    }
  }
}
```

### Step 3: Implement Governance Wrapper

**Pattern A: Full Governance (Recommended)**

Wraps entire operation with risk assessment, approval, and logging:

```javascript
const AgentGovernance = require('./scripts/lib/agent-governance');

class MyCustomAgent {
    constructor() {
        this.governance = new AgentGovernance('my-custom-agent');
    }

    async performOperation(operationDetails) {
        return await this.governance.executeWithGovernance(
            {
                type: 'DEPLOY_CUSTOM_FIELD',
                environment: operationDetails.org,
                componentCount: operationDetails.fields.length,
                reasoning: 'Deploy custom fields for new feature',
                rollbackPlan: 'Delete fields if validation fails',
                affectedComponents: operationDetails.fields.map(f => f.fullName),
                // Optional fields for better risk calculation
                dependencies: operationDetails.dependencies || [],
                hasCircularDeps: false,
                isRecursive: false
            },
            async () => {
                // Your actual operation logic
                return await this.deployFields(operationDetails);
            }
        );
    }

    async deployFields(details) {
        // Implementation...
        return { success: true, deployedFields: [...] };
    }
}
```

**Pattern B: Manual Risk Assessment (Advanced)**

For operations needing custom risk logic:

```javascript
const AgentGovernance = require('./scripts/lib/agent-governance');

class AdvancedAgent {
    constructor() {
        this.governance = new AgentGovernance('advanced-agent');
    }

    async complexOperation(details) {
        // STEP 1: Assess risk
        const risk = await this.governance.assessRisk({
            type: 'COMPLEX_OPERATION',
            environment: details.org,
            recordCount: details.recordCount,
            componentCount: details.componentCount
        });

        console.log(`Risk: ${risk.riskScore}/100 (${risk.riskLevel})`);

        // STEP 2: Handle based on risk level
        if (risk.blocked) {
            throw new Error('Operation blocked due to critical risk');
        }

        let approval = { granted: true };
        if (risk.requiresApproval) {
            approval = await this.governance.requestApproval(details, risk);

            if (!approval.granted) {
                throw new Error(`Approval rejected: ${approval.reason}`);
            }
        }

        // STEP 3: Execute
        const result = await this.execute(details);

        // STEP 4: Log
        await this.governance.logAction(details, risk, approval, {
            startTime: new Date().toISOString(),
            endTime: new Date().toISOString(),
            durationMs: result.durationMs,
            success: result.success,
            errors: result.errors || []
        });

        return result;
    }
}
```

### Step 4: Add Verification

Always verify operations completed as expected:

```javascript
await governance.executeWithGovernance(
    {
        type: 'DEPLOY_FIELD',
        environment: org,
        componentCount: 1,
        reasoning: 'Deploy field for feature',
        rollbackPlan: 'Delete field'
    },
    async () => {
        // Deploy
        const result = await deployField(fieldMetadata);

        // VERIFY deployment
        const verification = await verifyDeployment(result.fieldName);

        return {
            ...result,
            verification: {
                performed: true,
                passed: verification.success,
                method: 'post-deployment-state-verifier.js',
                issues: verification.issues || []
            }
        };
    }
);
```

---

## Operation Types

### Standard Operation Types

Use these standard operation types for consistency:

**Read Operations** (Tier 1):
- `QUERY_RECORDS`
- `READ_METADATA`
- `ANALYZE_AUTOMATION`
- `AUDIT_SECURITY`

**Data Operations** (Tier 2):
- `CREATE_RECORD`
- `UPDATE_RECORD`
- `UPDATE_RECORDS` (bulk)
- `DEPLOY_REPORT`
- `DEPLOY_DASHBOARD`

**Metadata Operations** (Tier 3):
- `DEPLOY_FIELD`
- `DEPLOY_OBJECT`
- `DEPLOY_FLOW`
- `DEPLOY_VALIDATION_RULE`
- `DEPLOY_TRIGGER`

**Security Operations** (Tier 4):
- `UPDATE_PROFILE`
- `UPDATE_PERMISSION_SET`
- `UPDATE_ROLE`
- `CREATE_SHARING_RULE`
- `GRANT_PERMISSIONS`

**Destructive Operations** (Tier 5):
- `DELETE_RECORDS`
- `DELETE_FIELD`
- `DELETE_METADATA`

---

## Examples by Agent Type

### Example 1: Read-Only Agent (Tier 1)

**Agent**: `sfdc-state-discovery`

```javascript
const AgentGovernance = require('./scripts/lib/agent-governance');
const governance = new AgentGovernance('sfdc-state-discovery');

async function discoverOrgState(org) {
    return await governance.executeWithGovernance(
        {
            type: 'READ_METADATA',
            environment: org,
            recordCount: 0,
            reasoning: 'Discover org metadata for documentation'
        },
        async () => {
            const metadata = await queryAllMetadata(org);
            return { metadata, verification: { performed: false } };
        }
    );
}
```

**Risk Score**: ~25 (LOW - production read)
**Approval**: Not required
**Logging**: Standard

---

### Example 2: Data Operations Agent (Tier 2)

**Agent**: `sfdc-data-operations`

```javascript
const AgentGovernance = require('./scripts/lib/agent-governance');
const governance = new AgentGovernance('sfdc-data-operations');

async function bulkUpdateContacts(org, updates) {
    return await governance.executeWithGovernance(
        {
            type: 'UPDATE_RECORDS',
            environment: org,
            recordCount: updates.length,
            reasoning: 'Update contact funnel stages based on activity',
            rollbackPlan: 'Restore from backup CSV if issues occur',
            affectedComponents: ['Contact.FunnelStage__c'],
            affectedUsers: 0 // Data operation, not user access
        },
        async () => {
            const result = await bulkUpdate('Contact', updates);

            // Verify sample of updates
            const verification = await verifySample(updates, 10);

            return {
                ...result,
                verification: {
                    performed: true,
                    passed: verification.success,
                    method: 'sample-verification',
                    issues: verification.issues
                }
            };
        }
    );
}
```

**Risk Score**:
- If 500 records in sandbox: ~7 (LOW)
- If 500 records in production: ~32 (MEDIUM - notification)
- If 5,000 records in production: ~50 (MEDIUM - enhanced logging)
- If 50,000 records in production: ~75 (CRITICAL - blocked)

---

### Example 3: Metadata Management Agent (Tier 3)

**Agent**: `sfdc-metadata-manager`

```javascript
const AgentGovernance = require('./scripts/lib/agent-governance');
const governance = new AgentGovernance('sfdc-metadata-manager');

async function deployCustomField(org, fieldMetadata) {
    return await governance.executeWithGovernance(
        {
            type: 'DEPLOY_FIELD',
            environment: org,
            componentCount: 1,
            reasoning: 'Deploy custom field for customer segmentation feature',
            rollbackPlan: 'Delete field and remove from layouts if issues occur',
            rollbackCommand: `node scripts/lib/field-rollback.js ${org} Account CustomField__c`,
            affectedComponents: ['Account.CustomField__c'],
            alternativesConsidered: [
                'Use existing field (rejected - different data type)',
                'Use formula field (rejected - requires calculation)'
            ],
            decisionRationale: 'Custom field provides best user experience'
        },
        async () => {
            // Deploy field
            const result = await fls_aware_field_deployer.deploy(org, fieldMetadata);

            // Verify deployment
            const verification = await verifyFieldDeployment(org, fieldMetadata.fullName);

            return {
                ...result,
                verification: {
                    performed: true,
                    passed: verification.success,
                    method: 'post-deployment-state-verifier.js',
                    issues: verification.issues
                }
            };
        }
    );
}
```

**Risk Score**:
- If in sandbox: ~12 (LOW)
- If in production: ~37 (MEDIUM)
- If in production with 5+ fields: ~52 (HIGH - approval required)

---

### Example 4: Security Agent (Tier 4)

**Agent**: `sfdc-security-admin`

```javascript
const AgentGovernance = require('./scripts/lib/agent-governance');
const governance = new AgentGovernance('sfdc-security-admin');

async function updatePermissionSet(org, permissionSetName, newPermissions) {
    return await governance.executeWithGovernance(
        {
            type: 'UPDATE_PERMISSION_SET',
            environment: org,
            componentCount: 1,
            reasoning: 'Grant field access to AgentAccess permission set for new custom field',
            rollbackPlan: 'Remove field permissions if users report issues',
            rollbackCommand: `node scripts/lib/permission-set-rollback.js ${org} ${permissionSetName} ${newPermissions.join(',')}`,
            affectedComponents: [`${permissionSetName} Permission Set`, ...newPermissions],
            affectedUsers: 45, // Users with this permission set
            alternativesConsidered: [
                'Add to profile (rejected - affects all users)',
                'Create new permission set (rejected - unnecessary complexity)'
            ],
            decisionRationale: 'Updating existing permission set minimizes impact'
        },
        async () => {
            // Update permission set
            const result = await updatePermissionSetMetadata(org, permissionSetName, newPermissions);

            // Verify FLS
            const verification = await verifyFLS(org, newPermissions);

            return {
                ...result,
                verification: {
                    performed: true,
                    passed: verification.success,
                    method: 'FLS-verification-query',
                    issues: verification.issues
                }
            };
        }
    );
}
```

**Risk Score**: Always 67+ (HIGH)
**Approval**: Always required (all environments)
**Logging**: Full audit trail with reasoning

---

## Best Practices

### 1. Always Provide Reasoning

Good reasoning helps approvers make informed decisions:

```javascript
// ❌ BAD: Vague reasoning
reasoning: 'Update permission set'

// ✅ GOOD: Specific reasoning
reasoning: 'Grant field access to AgentAccess permission set for newly deployed Account.Industry_Segment__c field. Required for data operations agent to query and update this field.'
```

### 2. Always Provide Rollback Plans

Detailed rollback plans increase approval rates:

```javascript
// ❌ BAD: No rollback plan
rollbackPlan: 'Manual rollback'

// ✅ GOOD: Specific rollback plan
rollbackPlan: 'Remove Account.Industry_Segment__c from AgentAccess permission set field permissions. Command: node scripts/lib/permission-set-rollback.js production AgentAccess Account.Industry_Segment__c'
```

### 3. Document Alternatives Considered

Shows thoughtful decision-making:

```javascript
alternativesConsidered: [
    'Use Profile (rejected - would affect all 200+ users, not just agents)',
    'Create new Permission Set (rejected - adds complexity, AgentAccess already exists)',
    'Use manual assignment (rejected - not scalable, agent needs automatic access)'
]
```

### 4. Include Verification

Verify operations completed successfully:

```javascript
return {
    success: true,
    deployedField: 'Account.CustomField__c',
    verification: {
        performed: true,
        passed: true,
        method: 'post-deployment-state-verifier.js',
        issues: []
    }
};
```

---

## Testing Governance Integration

### Unit Tests

```javascript
// test/agent-governance.test.js
const AgentGovernance = require('../scripts/lib/agent-governance');

describe('AgentGovernance', () => {
    it('should calculate risk correctly', async () => {
        const governance = new AgentGovernance('test-agent');
        const risk = await governance.assessRisk({
            type: 'QUERY_RECORDS',
            environment: 'production',
            recordCount: 500
        });

        expect(risk.riskScore).toBe(30);
        expect(risk.riskLevel).toBe('LOW');
        expect(risk.requiresApproval).toBe(false);
    });

    it('should require approval for high-risk operations', async () => {
        const governance = new AgentGovernance('test-agent');
        const risk = await governance.assessRisk({
            type: 'UPDATE_PERMISSION_SET',
            environment: 'production'
        });

        expect(risk.riskLevel).toBe('HIGH');
        expect(risk.requiresApproval).toBe(true);
    });
});
```

### Integration Tests

```bash
# Test governance flow end-to-end
npm test -- agent-governance-integration.test.js
```

---

## Troubleshooting

### "Operation blocked" - Why?

Check risk score breakdown:

```bash
node scripts/lib/agent-risk-scorer.js \
  --type YOUR_OPERATION \
  --agent YOUR_AGENT \
  --environment production \
  --verbose
```

Look at the breakdown to see which factor is high.

### "Approval timeout" - What now?

Check pending approvals:

```bash
node scripts/lib/human-in-the-loop-controller.js list
```

Manually approve if justified:

```bash
node scripts/lib/human-in-the-loop-controller.js approve <request-id>
```

### "Audit log failed" - Is operation still recorded?

Check multiple storage backends:

```bash
# Check local logs
ls -la ~/.claude/logs/agent-governance/

# Check Supabase (if configured)
# Logs are written to multiple backends for redundancy
```

---

## Migration Checklist

To integrate governance into an existing agent:

- [ ] Add `tier` to agent frontmatter
- [ ] Add `governanceIntegration: true` to frontmatter
- [ ] Register agent in `agent-permission-matrix.json`
- [ ] Import `AgentGovernance` library
- [ ] Wrap high-risk operations with `executeWithGovernance()`
- [ ] Provide reasoning for all operations
- [ ] Provide rollback plans for high-risk operations
- [ ] Add verification to all operations
- [ ] Test in sandbox first
- [ ] Update agent documentation
- [ ] Add unit tests for governance integration

---

## Common Patterns

### Pattern 1: Batch Operations

For operations affecting multiple records/components:

```javascript
const items = [...]; // Large batch

for (const batch of chunkArray(items, 1000)) {
    await governance.executeWithGovernance(
        {
            type: 'UPDATE_RECORDS',
            environment: org,
            recordCount: batch.length,
            reasoning: `Process batch ${batchNumber} of ${totalBatches}`,
            rollbackPlan: `Restore batch ${batchNumber} from backup`
        },
        async () => {
            return await processBatch(batch);
        }
    );
}
```

### Pattern 2: Conditional Governance

Skip governance for read-only operations:

```javascript
async function performOperation(type, details) {
    // Read operations don't need governance overhead
    if (type === 'QUERY' || type === 'READ') {
        return await executeQuery(details);
    }

    // Write operations use governance
    return await governance.executeWithGovernance(details, async () => {
        return await executeWrite(details);
    });
}
```

### Pattern 3: Nested Operations

For operations with sub-operations, track at the highest level:

```javascript
// Track the parent operation, not each sub-operation
await governance.executeWithGovernance(
    {
        type: 'DEPLOY_COMPLETE_FEATURE',
        environment: org,
        componentCount: 10,
        reasoning: 'Deploy complete feature XYZ',
        rollbackPlan: 'Rollback entire feature'
    },
    async () => {
        // Sub-operations don't need individual governance
        await deployFields(fields);
        await deployFlows(flows);
        await deployLayouts(layouts);

        return { success: true };
    }
);
```

---

## Hook-Based Governance (Recommended)

If you want governance without code changes in every agent, use the universal hook bundle already configured for the Salesforce plugin.

- **Hook entrypoint**: `.claude-plugins/opspal-salesforce/hooks/universal-agent-governance.sh`
- **Registration**: `.claude-plugins/opspal-salesforce/.claude-plugin/hooks.json`
- **Behavior**: Auto-detects agent tier, calculates risk, and enforces approval/blocks based on tier + environment.

**Notes**:
- Use `GOVERNANCE_PREP_MODE=true` for preparation steps that should not require approvals.
- Use `STRICT_ORG_VALIDATION=1` to block wrong-org operations when running inside an instance folder.

---

## Reference

- **Framework Documentation**: `docs/AGENT_GOVERNANCE_FRAMEWORK.md`
- **Permission Matrix**: `config/agent-permission-matrix.json`
- **Risk Scorer**: `scripts/lib/agent-risk-scorer.js`
- **Approval Controller**: `scripts/lib/human-in-the-loop-controller.js`
- **Audit Logger**: `scripts/lib/agent-action-audit-logger.js`
- **Claude Code Hooks Guide**: https://code.claude.com/docs/en/hooks-guide#get-started-with-claude-code-hooks
- **Claude Code Plugins Guide**: https://code.claude.com/docs/en/plugins

---

## Support

Questions or issues?

- **Check docs**: `docs/AGENT_GOVERNANCE_FRAMEWORK.md`
- **GitHub**: https://github.com/RevPalSFDC/opspal-plugin-internal-marketplace/issues
- **Email**: engineering@gorevpal.com

---

**Last Updated**: 2025-12-29
**Version**: 1.0.0
