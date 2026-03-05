# Agent Governance Quick Reference Card

**Version**: 1.0.0
**For**: Quick lookup during agent operations

---

## Permission Tiers

| Tier | Name | Approval Required | Examples |
|------|------|-------------------|----------|
| **1** | Read-Only | Never | `sfdc-state-discovery`, `sfdc-automation-auditor` |
| **2** | Standard Ops | Production + >1k records | `sfdc-data-operations`, `sfdc-reports-dashboards` |
| **3** | Metadata | Production + >5 components | `sfdc-metadata-manager`, `sfdc-deployment-manager` |
| **4** | Security | Always (all envs) | `sfdc-security-admin`, `sfdc-permission-orchestrator` |
| **5** | Destructive | Always + executive | None (special approval only) |

---

## Risk Levels & Actions

| Risk Score | Level | Action |
|------------|-------|--------|
| **0-30** | LOW | ✅ Proceed (standard logging) |
| **31-50** | MEDIUM | ✅ Proceed (enhanced logging + notification) |
| **51-70** | HIGH | ⚠️  Require approval (single approver) |
| **71-100** | CRITICAL | ❌ Block + manual review (multi-approver) |

---

## Quick Commands

### Calculate Risk
```bash
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/agent-risk-scorer.js \
  --type <OPERATION_TYPE> \
  --agent <AGENT_NAME> \
  --environment <production|sandbox|dev> \
  --record-count <NUMBER> \
  --verbose
```

### List Pending Approvals
```bash
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/human-in-the-loop-controller.js list
```

### Search Audit Logs
```bash
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/agent-action-audit-logger.js search \
  --agent <AGENT_NAME> \
  --risk-level <LOW|MEDIUM|HIGH|CRITICAL> \
  --start-date <YYYY-MM-DD>
```

### Generate Compliance Report
```bash
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/agent-action-audit-logger.js report <gdpr|hipaa|sox> \
  --start-date <YYYY-MM-DD> \
  --end-date <YYYY-MM-DD>
```

---

## Integration Pattern

```javascript
const AgentGovernance = require('.claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/agent-governance');
const governance = new AgentGovernance('my-agent');

await governance.executeWithGovernance(
    {
        type: 'OPERATION_TYPE',
        environment: org,
        recordCount: count,
        reasoning: 'Why this is needed',
        rollbackPlan: 'How to undo'
    },
    async () => {
        return await myOperation();
    }
);
```

---

## Emergency Override

```bash
export AGENT_GOVERNANCE_OVERRIDE=true
export OVERRIDE_REASON="Production outage - ticket #12345"
export OVERRIDE_APPROVER="security-lead@company.com"
export OVERRIDE_APPROVAL_CODE="<one-time-code>"

# Execute operation (override logged automatically)

# Clear immediately after
unset AGENT_GOVERNANCE_OVERRIDE OVERRIDE_REASON OVERRIDE_APPROVER OVERRIDE_APPROVAL_CODE
```

---

## Documentation

- **Framework**: `docs/AGENT_GOVERNANCE_FRAMEWORK.md`
- **Integration**: `docs/AGENT_GOVERNANCE_INTEGRATION.md`
- **Examples**: `docs/AGENT_GOVERNANCE_EXAMPLE.md`
- **Audit Report**: `AGENTIC_SALESFORCE_SYSTEM_AUDIT_REPORT.md`

---

## Support

- **Issues**: https://github.com/RevPalSFDC/opspal-plugin-internal-marketplace/issues
- **Email**: engineering@gorevpal.com
- **Emergency**: security@gorevpal.com
