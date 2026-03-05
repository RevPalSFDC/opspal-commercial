# FLS Bundling Enforcement for Field Deployments - Detailed Guide

**Context Type**: Progressive Disclosure (loaded on "field deployment", "custom field", "FLS", "permission" keywords)
**Priority**: High
**Trigger**: When orchestrating field deployment operations

---

## Overview

**CRITICAL**: When orchestrating sub-agents that deploy custom fields, you MUST enforce FLS bundling to prevent the 40% verification failure rate from post-deployment FLS configuration.

---

## Field Deployment Detection & Enforcement

### When orchestrating ANY field deployment operation:

**1. Detect Field Deployment Intent:**
- User request contains keywords: "create field", "deploy field", "add custom field"
- Sub-agent delegation involves sfdc-metadata-manager with field operations
- Package.xml contains `<types><name>CustomField</name>`
- Operation plan includes CustomField metadata types

**2. Enforce FLS Bundling (MANDATORY):**
```javascript
// ALWAYS enforce this pattern when detecting field deployments
async function enforceFieldDeploymentFLS(deploymentRequest) {
    // Check if request involves field deployment
    if (involvesFieldDeployment(deploymentRequest)) {
        console.log('🛡️  FLS BUNDLING ENFORCEMENT ACTIVE');

        // Block use of deprecated deployers
        if (usesDeprecatedFieldDeployer(deploymentRequest)) {
            throw new Error(`
                ❌ DEPLOYMENT BLOCKED: Using deprecated field deployer

                Deprecated approach causes 40% verification failure rate.

                REQUIRED ACTION:
                Use fls-aware-field-deployer.js for ALL field deployments

                Example:
                node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/fls-aware-field-deployer.js Account \\
                  '{"fullName":"CustomField__c","type":"Text"}' \\
                  --org [org-alias]
            `);
        }

        // Route to FLS-aware deployer
        return {
            agent: 'sfdc-metadata-manager',
            deployer: 'fls-aware-field-deployer.js',
            enforcements: [
                'Field + Permission Set deployed atomically',
                'AgentAccess permission set with <fieldPermissions>',
                'Schema-based verification (no FLS required)',
                'FieldPermissions assertion after deployment'
            ]
        };
    }
}
```

**3. Delegation Pattern with FLS Enforcement:**
```javascript
// When delegating field deployments to sub-agents
await Task({
    subagent_type: 'salesforce-plugin:sfdc-metadata-manager',
    description: 'Deploy custom field with FLS',
    prompt: `Deploy custom field to ${org} using FLS-AWARE deployment.

    CRITICAL REQUIREMENTS:
    - Use scripts/lib/fls-aware-field-deployer.js (MANDATORY)
    - Deploy field + Permission Set in single transaction
    - Include <fieldPermissions> in Permission Set metadata
    - Verify via schema API first (doesn't require FLS)
    - Assert FLS applied via FieldPermissions queries

    NEVER use:
    - field-deployment-manager.js (deprecated)
    - auto-fls-configurator.js (deprecated)
    - Any post-deployment FLS approach

    Field metadata: ${JSON.stringify(fieldMetadata)}
    Object: ${objectName}
    Org: ${orgAlias}`
});
```

---

## Sub-Agent Coordination Requirements

### When coordinating metadata-manager or deployment-manager agents:

**Pre-delegation validation:**
```bash
# Check if operation involves fields
if echo "$operation" | grep -iE "(field|custom.*field)"; then
    echo "🛡️  Field deployment detected - enforcing FLS bundling"
    # Update delegation to use fls-aware-field-deployer.js
fi
```

**Monitor for deprecated patterns:**
- Watch for references to `field-deployment-manager.js`
- Detect separate FLS configuration steps
- Flag SOQL-based verification before schema verification

**Intercept and redirect:**
```javascript
// If sub-agent attempts deprecated approach, intercept
if (attemptingDeprecatedFieldDeployment) {
    console.log('⚠️  DEPRECATED FIELD DEPLOYMENT DETECTED');
    console.log('🔄 REDIRECTING to FLS-aware deployer...');

    // Auto-correct delegation
    return redirectToFLSAwareDeployer(originalRequest);
}
```

---

## Orchestration Workflow for Field Deployments

### Standard orchestration pattern:

```
User Request: "Create custom field X on Object Y"
    ↓
[Detect Field Deployment Intent]
    ↓
[Enforce FLS Bundling Requirement]
    ↓
[Validate Sub-Agent Will Use fls-aware-field-deployer.js]
    ↓
Delegating to deprecated deployer? → YES → BLOCK + Redirect
    ↓ NO
[Delegate to sfdc-metadata-manager with FLS requirements]
    ↓
[Monitor deployment for FLS bundling compliance]
    ↓
[Verify atomic deployment occurred]
    ↓
[Confirm schema verification succeeded]
    ↓
[Assert FLS applied correctly]
    ↓
SUCCESS: Field deployed with FLS, verified, and accessible
```

---

## Emergency Bypass (Audit Trail Required)

**ONLY in critical production emergencies:**

```bash
# Log bypass decision (requires user approval)
cat >> deployment-audit.log <<EOF
TIMESTAMP: $(date -u +%Y-%m-%dT%H:%M:%SZ)
OPERATION: Emergency FLS bundling bypass
APPROVER: [user-email]
REASON: [critical-production-issue]
RISK: Post-deployment FLS configuration may cause verification failures
MITIGATION: Manual FLS verification required immediately after deployment
EOF

# Execute with bypass flag
export FLS_BUNDLING_BYPASS=true
# Proceed with deployment
```

**Post-bypass requirements:**
1. Immediate manual FLS configuration
2. Schema and FieldPermissions verification
3. Permission set assignment confirmation
4. Update audit log with verification results

---

## Detection Patterns for Deprecated Deployers

### Monitor sub-agent operations for these patterns:

| Pattern | Severity | Action |
|---------|----------|--------|
| Using `field-deployment-manager.js` | HIGH | Block and redirect to fls-aware-field-deployer.js |
| Separate FLS configuration step | HIGH | Block and require atomic deployment |
| SOQL verification before schema verification | MEDIUM | Warn and suggest schema-first verification |
| No FieldPermissions assertion | MEDIUM | Warn and add FLS verification step |
| Missing permission set assignment | HIGH | Block until assignment confirmed |

---

## Integration with Validation Framework

**FLS bundling enforcement integrates with orchestration validation:**

```bash
# Add to pre-orchestration validation
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/orchestration-validator.js validate-plan \
  --check-fls-bundling \
  --block-deprecated-field-deployers \
  --require-atomic-field-deployment
```

---

## Why This Matters

### Real Impact:
- **40% reduction** in field deployment verification failures
- **Zero false failures** from missing FLS permissions
- **Atomic deployments** prevent race conditions
- **Immediate field access** for agents after deployment
- **Salesforce best practices** compliance

### Common failure scenario (prevented by enforcement):

**Before FLS Bundling Enforcement**:
1. Agent deploys field using old deployer → Field created
2. Separate FLS configuration step → Delayed or forgotten
3. Agent verification query → ❌ Fails (no FLS permission)
4. User sees "field deployment failed" → False negative

**With FLS bundling enforcement**:
1. Orchestrator enforces fls-aware-field-deployer.js → Field + FLS deployed atomically
2. Permission set assigned immediately → Agent has FLS
3. Schema verification succeeds → Field confirmed
4. FieldPermissions assertion succeeds → FLS confirmed
5. Agent verification query → ✅ Succeeds

---

## Reference Documentation

**Implementation Guide**: `docs/FLS_DEPLOYMENT_IMPLEMENTATION_GUIDE.md`
**Core Library**: `scripts/lib/fls-aware-field-deployer.js`
**MCP Tools**: `mcp-extensions/tools/fls-aware-deployment-tools.js`
**Summary**: `FLS_IMPLEMENTATION_SUMMARY.md`

---

**When This Context is Loaded**: When user message contains keywords: "field deployment", "custom field", "create field", "deploy field", "FLS", "field-level security", "permission"

**Back to Core Agent**: See `sfdc-orchestrator.md` for orchestration overview and delegation patterns
