# Tier 4 Agent Governance Integration Guide
## Complete Integration Patterns for All 5 Security Agents

**Version**: 1.0.0
**Created**: 2025-10-25
**For**: Remaining Tier 4 agents requiring governance integration

---

## Agents Covered

1. ✅ **sfdc-dedup-safety-copilot** (Tier 5 - Already integrated)
2. ✅ **sfdc-security-admin** (Tier 4 - Already integrated)
3. 📋 **sfdc-permission-orchestrator** (Tier 4 - Template below)
4. 📋 **sfdc-compliance-officer** (Tier 4 - Template below)
5. 📋 **sfdc-communication-manager** (Tier 4 - Template below)
6. 📋 **sfdc-agent-governance** (Tier 4 - Self-monitoring template below)

---

## Integration Template for sfdc-permission-orchestrator

### Add to Agent File (after frontmatter)

```markdown
# 🛡️ AGENT GOVERNANCE INTEGRATION (MANDATORY - Tier 4)

**CRITICAL**: This agent manages permission sets. ALL operations MUST use governance.

## Wrap Permission Set Operations

\`\`\`javascript
const AgentGovernance = require('./scripts/lib/agent-governance');
const governance = new AgentGovernance('sfdc-permission-orchestrator');

async function deployPermissionSet(org, psName, config, options) {
    return await governance.executeWithGovernance(
        {
            type: 'DEPLOY_PERMISSION_SET',
            environment: org,
            componentCount: 1,
            reasoning: options.reasoning || `Deploy ${psName} permission set with two-tier architecture`,
            rollbackPlan: `Remove permission set: sf project deploy start --metadata PermissionSet:${psName} --target-org ${org} (with previous version)`,
            affectedComponents: [psName],
            affectedUsers: options.affectedUsers || 0,
            alternativesConsidered: ['Manual assignment (rejected - not scalable)', 'Profile modification (rejected - too broad)'],
            decisionRationale: 'Permission set provides granular, scalable access control'
        },
        async () => {
            const result = await performDeployment(org, psName, config);
            const verification = await verifyPermissionSet(org, psName);
            return { ...result, verification };
        }
    );
}
\`\`\`

## Governance Requirements

**Tier 4**:
- ✅ ALWAYS requires approval (all environments)
- ✅ Multi-approver (security-lead + architect)
- ✅ Documentation required
- ✅ Rollback plan required

**Risk Score**: 55/100 (HIGH)
\`\`\`

### Operations to Wrap

1. `deployPermissionSet()` - Permission set deployment
2. `updateFieldPermissions()` - FLS updates
3. `mergePermissionSets()` - Permission set consolidation
4. `assignPermissionSet()` - User assignments

---

## Integration Template for sfdc-compliance-officer

### Add to Agent File

```markdown
# 🛡️ AGENT GOVERNANCE INTEGRATION (MANDATORY - Tier 4)

**CRITICAL**: This agent configures compliance controls. ALL operations MUST use governance.

## Wrap Compliance Operations

\`\`\`javascript
const AgentGovernance = require('./scripts/lib/agent-governance');
const governance = new AgentGovernance('sfdc-compliance-officer');

async function configureGDPRCompliance(org, config, options) {
    return await governance.executeWithGovernance(
        {
            type: 'CONFIGURE_COMPLIANCE',
            environment: org,
            reasoning: options.reasoning || 'Configure GDPR compliance controls for data privacy',
            rollbackPlan: 'Revert compliance settings to previous state',
            affectedUsers: options.affectedUsers || 0,
            alternativesConsidered: ['Manual compliance (rejected - error-prone)', 'Third-party tool (rejected - data security)'],
            decisionRationale: 'Native Salesforce compliance features provide best security and auditability'
        },
        async () => {
            const result = await deployComplianceConfig(org, config);
            return result;
        }
    );
}

async function enableFieldEncryption(org, fields, options) {
    return await governance.executeWithGovernance(
        {
            type: 'ENABLE_ENCRYPTION',
            environment: org,
            componentCount: fields.length,
            reasoning: options.reasoning || `Enable Shield encryption for ${fields.length} PII field(s)`,
            rollbackPlan: 'Disable encryption if performance issues occur',
            affectedComponents: fields,
            requiresSecurityReview: true
        },
        async () => {
            const result = await enableShieldEncryption(org, fields);
            return result;
        }
    );
}
\`\`\`

## Governance Requirements

**Tier 4**:
- ✅ ALWAYS requires approval
- ✅ Security review required
- ✅ Compliance team notification

**Risk Score**: 55-65/100 (HIGH)
\`\`\`

### Operations to Wrap

1. `configureGDPRCompliance()` - GDPR settings
2. `configureHIPAACompliance()` - HIPAA settings
3. `enableFieldEncryption()` - Shield encryption
4. `configureAuditTrail()` - Field history tracking

---

## Integration Template for sfdc-communication-manager

### Add to Agent File

```markdown
# 🛡️ AGENT GOVERNANCE INTEGRATION (MANDATORY - Tier 4)

**CRITICAL**: Email templates can contain sensitive data. ALL deployments MUST use governance.

## Wrap Email Template Operations

\`\`\`javascript
const AgentGovernance = require('./scripts/lib/agent-governance');
const governance = new AgentGovernance('sfdc-communication-manager');

async function deployEmailTemplate(org, templateName, content, options) {
    return await governance.executeWithGovernance(
        {
            type: 'DEPLOY_EMAIL_TEMPLATE',
            environment: org,
            reasoning: options.reasoning || `Deploy email template: ${templateName}`,
            rollbackPlan: `Delete template or revert to previous version`,
            affectedComponents: [templateName],
            alternativesConsidered: ['Manual template creation (rejected - consistency issues)'],
            decisionRationale: 'Automated template deployment ensures consistency and version control'
        },
        async () => {
            const result = await deployTemplate(org, templateName, content);
            return result;
        }
    );
}
\`\`\`

## Governance Requirements

**Tier 4** (Security implications - templates may contain PII):
- ✅ Requires approval in production
- ✅ Security review for templates with merge fields
- ✅ PII detection in template content

**Risk Score**: 30-35/100 (MEDIUM typically, but Tier 4 requires approval anyway)
\`\`\`

### Operations to Wrap

1. `deployEmailTemplate()` - Email template deployment
2. `configureMassEmail()` - Mass email settings
3. `updateLetterhead()` - Letterhead changes

---

## Integration Template for sfdc-agent-governance

### Add to Agent File (Self-Monitoring)

```markdown
# 🛡️ AGENT GOVERNANCE INTEGRATION (MANDATORY - Tier 4)

**SPECIAL CASE**: This agent manages governance itself. Self-monitoring required.

## Self-Monitoring Pattern

\`\`\`javascript
const AgentGovernance = require('./scripts/lib/agent-governance');
const governance = new AgentGovernance('sfdc-agent-governance');

async function updatePermissionMatrix(changes, options) {
    return await governance.executeWithGovernance(
        {
            type: 'UPDATE_GOVERNANCE_CONFIG',
            environment: 'system',
            reasoning: options.reasoning || 'Update agent permission matrix',
            rollbackPlan: 'Restore previous agent-permission-matrix.json from git',
            affectedComponents: ['agent-permission-matrix.json'],
            affectedUsers: 0  // Affects agents, not users directly
        },
        async () => {
            const result = await updateMatrix(changes);
            return result;
        }
    );
}

async function modifyRiskThresholds(thresholds, options) {
    return await governance.executeWithGovernance(
        {
            type: 'MODIFY_RISK_THRESHOLDS',
            environment: 'system',
            reasoning: options.reasoning || 'Tune risk scoring thresholds based on usage data',
            rollbackPlan: 'Restore previous thresholds from git',
            alternativesConsidered: ['Manual threshold tuning (rejected - needs automation)'],
            requiresSecurityReview: true
        },
        async () => {
            const result = await updateThresholds(thresholds);
            return result;
        }
    );
}
\`\`\`

## Governance Requirements

**Tier 4** (Governance configuration):
- ✅ ALWAYS requires approval
- ✅ Security team review (changing governance itself)
- ✅ Git-tracked changes (version control for governance config)

**Risk Score**: 60-65/100 (HIGH)
\`\`\`

---

## Quick Integration Checklist

For each Tier 4 agent:

- [ ] Add `tier: 4` to frontmatter (if not present)
- [ ] Add `governanceIntegration: true` to frontmatter
- [ ] Add `version: X.0.0` (major version bump)
- [ ] Add "🛡️ AGENT GOVERNANCE INTEGRATION" section after frontmatter
- [ ] Include code examples for 3-5 key operations
- [ ] Document approval requirements
- [ ] Document risk score expectations
- [ ] Update agent with these templates

---

## Testing Each Integration

After integrating each agent:

```bash
# 1. Verify frontmatter
grep "tier: 4" agents/sfdc-permission-orchestrator.md
grep "governanceIntegration: true" agents/sfdc-permission-orchestrator.md

# 2. Check governance section exists
grep "AGENT GOVERNANCE INTEGRATION" agents/sfdc-permission-orchestrator.md

# 3. Test in sandbox (if agent has scripts)
# Execute agent operation and verify:
#   - Risk calculated
#   - Approval requested (if HIGH risk)
#   - Audit trail logged
```

---

## Common Pitfalls to Avoid

1. **Forgetting `options` parameter**: All functions need options for reasoning/rollback
2. **Missing verification**: Always verify operation completed successfully
3. **Incomplete rollback plans**: Must be specific, executable commands
4. **Vague reasoning**: Be specific about why operation is needed
5. **Not documenting alternatives**: List 2-3 alternatives considered

---

## Example: Complete Integration Diff

**Before** (sfdc-permission-orchestrator):
```markdown
---
name: sfdc-permission-orchestrator
description: Permission set management
---

# Permission Orchestrator

Manages permission sets...
```

**After** (sfdc-permission-orchestrator):
```markdown
---
name: sfdc-permission-orchestrator
tier: 4
governanceIntegration: true
version: 2.1.0
---

# 🛡️ AGENT GOVERNANCE INTEGRATION (MANDATORY - Tier 4)

[Complete governance section with code examples]

---

# Permission Orchestrator

Manages permission sets...
```

---

## Effort Estimates

Per Tier 4 agent:
- Read agent file: 15 minutes
- Add governance section: 30 minutes
- Test integration: 15 minutes
- **Total**: ~1 hour per agent

**5 Tier 4 agents** = 5 hours total

---

**Status**: Templates ready for implementation
**Next Step**: Apply templates to remaining 3 Tier 4 agents
