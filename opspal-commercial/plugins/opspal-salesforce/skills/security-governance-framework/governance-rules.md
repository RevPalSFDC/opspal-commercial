# Security Governance Rules

## Agent Governance Integration

**CRITICAL**: Security operations MUST use the Agent Governance Framework. Tier 4 = Security & Permissions.

### Governance Pattern

```javascript
const AgentGovernance = require('./scripts/lib/agent-governance');
const governance = new AgentGovernance('sfdc-security-admin');

async function updatePermissionSet(org, psName, permissions, options) {
    return await governance.executeWithGovernance(
        {
            type: 'UPDATE_PERMISSION_SET',
            environment: org,
            componentCount: 1,
            reasoning: options.reasoning,
            rollbackPlan: options.rollbackPlan,
            rollbackCommand: `node scripts/lib/permission-set-rollback.js ${org} ${psName}`,
            affectedComponents: [psName, ...permissions.map(p => `${p.object}.${p.field}`)],
            affectedUsers: options.affectedUsers || 0,
            alternativesConsidered: options.alternatives || [],
            decisionRationale: options.rationale
        },
        async () => {
            const result = await deployPermissionSet(org, psName, permissions);
            const verification = await verifyFLS(org, permissions);
            return { ...result, verification };
        }
    );
}
```

## Tier 4 Requirements

**Security Operations Always Require:**
- Approval in ALL environments (dev, sandbox, production)
- Multi-approver required (security-lead + one other)
- Documentation required (reasoning, alternatives, rationale)
- Rollback plan required
- Security review required
- Verification MANDATORY after deployment

### Risk Score Calculation

```
Base Score: 55-60/100 (HIGH)
- Impact: 30 (security/permission change)
- Environment: 0-25 (depends on org)
- Volume: 0 (metadata only)
- Historical: 0-15 (based on success rate)
- Complexity: 0-5 (usually simple changes)
```

## Approval Workflow

1. **Agent calculates risk** (automatic, typically HIGH)
2. **Approval request sent** to: Security-lead + another approver
3. **Approvers review** via Slack notification:
   - What security change is being made?
   - Why is it needed?
   - How many users affected?
   - What's the rollback plan?
4. **If approved** → Operation proceeds with verification
5. **If rejected** → Operation blocked

### Emergency Override

Available for critical security issues, requires security team approval code.

## Verification Requirements

### Post-Deployment Verification (MANDATORY)

```javascript
async function verifyFLS(org, permissions) {
    const verification = await postDeploymentStateVerifier.verify(org, permissions);

    return {
        performed: true,
        passed: verification.success,
        method: 'post-deployment-state-verifier.js',
        issues: verification.issues || []
    };
}
```

### What to Verify
- Field-level security applied correctly
- Object permissions match intent
- Tab visibility updated
- App access configured
- No unintended side effects

## Documentation Requirements

### Required Documentation
1. **Reasoning**: Why is this change needed?
2. **Alternatives Considered**: What other options were evaluated?
3. **Decision Rationale**: Why was this approach chosen?
4. **Rollback Plan**: How to undo if issues occur
5. **Affected Users**: Count of impacted users
6. **Affected Components**: List of permission sets, profiles, etc.
