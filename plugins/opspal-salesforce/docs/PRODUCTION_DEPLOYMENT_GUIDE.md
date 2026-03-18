# Production Deployment Guide
## Agent Governance Framework - Salesforce Plugin

**Version**: 1.0.0
**Last Updated**: 2025-10-25
**Target Score**: 95/100 on Agentic Salesforce System Audit Rubric

---

## Table of Contents

1. [Overview](#overview)
2. [Pre-Deployment Checklist](#pre-deployment-checklist)
3. [Environment Setup](#environment-setup)
4. [Phase 1: Core Governance Framework](#phase-1-core-governance-framework)
5. [Phase 2: Compliance Automation](#phase-2-compliance-automation)
6. [Phase 3: Architecture & Data Quality](#phase-3-architecture--data-quality)
7. [Post-Deployment Verification](#post-deployment-verification)
8. [Monitoring & Alerting](#monitoring--alerting)
9. [Rollback Procedures](#rollback-procedures)
10. [Troubleshooting](#troubleshooting)

---

## Overview

This guide provides step-by-step instructions for deploying the Agent Governance Framework to production Salesforce environments. The framework implements comprehensive safeguards for AI-powered agents, achieving a 94/100 score on the Agentic Salesforce System Audit Rubric.

### Deployment Scope

**Components**:
- Phase 1: Core Governance (Permission matrix, risk scoring, approvals, audit trail)
- Phase 2: Compliance Automation (API monitor, Jira integration, enhanced PII detection)
- Phase 3: Architecture & Data Quality (Architecture auditor, schema health, data classification)

**Total Files**: 25+ files, ~7,200 lines of code

**Estimated Deployment Time**: 4-6 hours (with testing)

### Prerequisites

- Salesforce CLI installed and authenticated
- Node.js v18+ installed
- Access to production Salesforce org
- Jira admin access (for Phase 2)
- Backup of existing configuration

---

## Pre-Deployment Checklist

### Security & Compliance

- [ ] Security team review completed
- [ ] Legal review of audit retention policies completed
- [ ] Compliance requirements documented (GDPR, HIPAA, SOX)
- [ ] Data privacy impact assessment completed
- [ ] Emergency override protocol approved

### Technical Prerequisites

- [ ] Production org authenticated: `sf org login web --set-default --alias production`
- [ ] All dependencies installed: `npm install`
- [ ] Environment variables configured (see below)
- [ ] Backup directory created: `./backups/pre-governance-deployment/`
- [ ] Rollback scripts tested in sandbox

### Testing

- [ ] All unit tests passing: `npm test`
- [ ] Integration tests completed in full sandbox
- [ ] Sandbox validation with real operations completed
- [ ] Performance benchmarks met (<25ms overhead)
- [ ] Emergency override tested

### Stakeholder Approval

- [ ] Engineering lead sign-off
- [ ] Security team approval
- [ ] Compliance officer approval
- [ ] Change management ticket created (if required)

---

## Environment Setup

### 1. Required Environment Variables

Create a `.env.production` file (or copy `.env.production.example` from repo root):

```bash
# Salesforce Configuration
SF_ORG_ALIAS=production
SF_API_VERSION=62.0

# User Attribution
USER_EMAIL=ops-team@company.com
DEPLOYMENT_OPERATOR=Jane Doe

# API Usage Monitor (Phase 2)
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/T00/B00/xxx
API_DAILY_LIMIT=15000
API_HOURLY_LIMIT=1000

# Jira Integration (Phase 2)
JIRA_URL=https://yourcompany.atlassian.net
JIRA_EMAIL=ops-team@company.com
JIRA_API_TOKEN=your_jira_api_token
JIRA_PROJECT_KEY=SFDC

# Approval Configuration
APPROVAL_TIMEOUT_HOURS=4
APPROVAL_SLACK_CHANNEL=#salesforce-approvals
EMERGENCY_OVERRIDE_APPROVERS=security-team@company.com,ciso@company.com

# Audit Trail Configuration
AUDIT_RETENTION_YEARS=7
AUDIT_RETENTION_DAYS=90  # Optional override for shorter retention windows
AUDIT_LOG_PATH=.claude/logs/agent-governance  # Overrides default ~/.claude/logs/agent-governance
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

### 2. Load Environment Variables

```bash
# Load production environment
set -a
source .env.production
set +a

# Verify environment
echo "Org: $SF_ORG_ALIAS"
echo "Jira: $JIRA_URL"
echo "Audit Retention: $AUDIT_RETENTION_YEARS years"
```

### 2.1 Run Production Readiness Check (Local)

```bash
node .claude-plugins/opspal-salesforce/scripts/production-readiness-check.js

# Optional: skip checks you are not using yet
node .claude-plugins/opspal-salesforce/scripts/production-readiness-check.js \
  --skip-jira \
  --skip-supabase \
  --skip-slack
```

**Expected Result**: No FAIL items before production rollout.

If you do not have production access yet, run a pre-production check:

```bash
node .claude-plugins/opspal-salesforce/scripts/production-readiness-check.js --mode preprod
```

### 2.2 Pre-Production Ops Checklist (No Production Org)

Use this checklist to keep operational readiness moving while production access is unavailable.

- [ ] Run preprod readiness check: `node .claude-plugins/opspal-salesforce/scripts/production-readiness-check.js --mode preprod`
- [ ] Confirm staging org alias is authenticated (e.g., `SF_ORG_ALIAS=acme-corp-staging`)
- [ ] Run Week 3 tests and keep `WEEK_3_TEST_RESULTS.md` current
- [ ] Validate approval workflows in non-interactive mode (Tier 2-4)
- [ ] Validate audit retention with synthetic logs (purge dry-run + actual)
- [ ] Validate GDPR/HIPAA/SOX compliance reports with synthetic logs
- [ ] Confirm log directories exist: `.claude/logs/agent-governance`, `.claude/logs/api-usage`, `.claude/logs/approvals`
- [ ] Monitor hooks are available: `api-usage-monitor.js`, `approval-queue-monitor.js`, `governance-dashboard-generator.js`

Blocked until production access:

- [ ] Production org authentication (`sf org login web --alias production`)
- [ ] Production monitoring hooks configured with real alert targets
- [ ] Jira integration verified end-to-end
- [ ] Slack alerting verified with production channels
- [ ] Supabase audit write path verified in production
- [ ] Rollback tested in production

### 3. Create Required Directories

```bash
mkdir -p .claude/logs/agent-governance/production
mkdir -p .claude/logs/api-usage/production
mkdir -p .claude/logs/approvals/production
mkdir -p backups/pre-governance-deployment
```

### 4. Backup Current Configuration

```bash
# Backup existing hooks (if any)
cp -r .claude/hooks backups/pre-governance-deployment/hooks-$(date +%Y%m%d) || true

# Backup existing config
cp -r .claude-plugins/opspal-salesforce/config backups/pre-governance-deployment/config-$(date +%Y%m%d) || true

# Create deployment snapshot
echo "Deployment started: $(date)" > backups/pre-governance-deployment/deployment.log
echo "Operator: $DEPLOYMENT_OPERATOR" >> backups/pre-governance-deployment/deployment.log
echo "Org: $SF_ORG_ALIAS" >> backups/pre-governance-deployment/deployment.log
```

---

## Phase 1: Core Governance Framework

### Components

1. Agent Permission Matrix
2. Risk Scoring Engine
3. Human-in-the-Loop Controller
4. Audit Trail Logger
5. Agent Governance Wrapper
6. Universal Governance Hook

### Deployment Steps

#### 1.1 Deploy Permission Matrix

```bash
# Copy permission matrix configuration
cp .claude-plugins/opspal-salesforce/config/agent-permission-matrix.json \
   .claude-plugins/opspal-salesforce/config/agent-permission-matrix.production.json

# Verify format
node -e "console.log(JSON.stringify(require('./.claude-plugins/opspal-salesforce/config/agent-permission-matrix.production.json'), null, 2))"

# Review registered agents
echo "Registered agents:"
node -e "const matrix = require('./.claude-plugins/opspal-salesforce/config/agent-permission-matrix.json'); Object.keys(matrix.agents).forEach(agent => console.log('  -', agent))"
```

**Expected Output**: 13+ agents registered with tier assignments

#### 1.2 Deploy Risk Scoring Engine

```bash
# Test risk scorer
node .claude-plugins/opspal-salesforce/scripts/lib/agent-risk-scorer.js test

# Verify risk calculation
node -e "
const RiskScorer = require('./.claude-plugins/opspal-salesforce/scripts/lib/agent-risk-scorer');
const scorer = new RiskScorer();
const risk = scorer.calculateRisk({
  operation: 'UPDATE_PERMISSION_SET',
  environment: 'production',
  componentCount: 1,
  recordCount: 0,
  agent: 'sfdc-security-admin'
});
console.log('Test risk score:', risk.riskScore, '/', risk.riskLevel);
"
```

**Expected Output**: Risk score 65-75 (HIGH)

#### 1.3 Deploy Human-in-the-Loop Controller

```bash
# Test approval controller
node .claude-plugins/opspal-salesforce/scripts/lib/human-in-the-loop-controller.js test-interactive

# Verify approval storage directory
ls -la .claude/logs/approvals/production || mkdir -p .claude/logs/approvals/production
```

**Expected Output**: Interactive approval prompt displays correctly

#### 1.4 Deploy Audit Trail System

```bash
# Test audit logger
node .claude-plugins/opspal-salesforce/scripts/lib/agent-action-audit-logger.js test

# Verify log rotation
node -e "
const logger = require('./.claude-plugins/opspal-salesforce/scripts/lib/agent-action-audit-logger');
logger.rotateOldLogs();
console.log('Log rotation completed');
"

# Check Supabase connection (if configured)
if [ -n "$SUPABASE_URL" ]; then
  curl -X GET "$SUPABASE_URL/rest/v1/agent_actions?limit=1" \
    -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
    -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
fi
```

**Expected Output**: Audit log created successfully, Supabase connection verified

#### 1.5 Deploy Governance Wrapper

```bash
# No deployment needed - used programmatically by agents
# Verify wrapper loads correctly
node -e "
const AgentGovernance = require('./.claude-plugins/opspal-salesforce/scripts/lib/agent-governance');
const governance = new AgentGovernance('test-agent');
console.log('Governance wrapper initialized successfully');
"
```

#### 1.6 Deploy Universal Governance Hook

```bash
# Make hook executable
chmod +x .claude-plugins/opspal-salesforce/hooks/universal-agent-governance.sh

# Test hook (dry run)
AGENT_GOVERNANCE_DRY_RUN=true \
  .claude-plugins/opspal-salesforce/hooks/universal-agent-governance.sh \
  '{"agent":"sfdc-metadata-manager","operation":"DEPLOY_FIELD","environment":"production"}'

# Link hook to Claude Code hooks directory
ln -sf $(pwd)/.claude-plugins/opspal-salesforce/hooks/universal-agent-governance.sh \
       .claude/hooks/pre-agent-operation.sh
```

**Expected Output**: Hook executes without errors, displays risk calculation

### Phase 1 Verification

```bash
# Run Phase 1 verification script
node .claude-plugins/opspal-salesforce/test/governance/verify-phase-1.js

# Expected checks:
# ✅ Permission matrix loaded (13+ agents)
# ✅ Risk scorer calculates scores correctly
# ✅ Approval controller handles requests
# ✅ Audit logger writes to all backends
# ✅ Governance wrapper initializes
# ✅ Universal hook intercepts operations
```

**Success Criteria**:
- All 6 components verified
- No errors in test execution
- Hook intercepts test operation
- Audit log created

---

## Phase 2: Compliance Automation

### Components

1. API Usage Monitor
2. Jira/ServiceNow Integration
3. Enhanced PII Detection

### Deployment Steps

#### 2.1 Deploy API Usage Monitor

```bash
# Deploy API monitor script
cp .claude-plugins/opspal-salesforce/scripts/lib/api-usage-monitor.js \
   /usr/local/lib/salesforce-plugin/

# Deploy configuration
cp .claude-plugins/opspal-salesforce/config/api-usage-config.json \
   .claude-plugins/opspal-salesforce/config/api-usage-config.production.json

# Deploy monitoring hook
chmod +x .claude-plugins/opspal-salesforce/hooks/post-sf-command.sh
ln -sf $(pwd)/.claude-plugins/opspal-salesforce/hooks/post-sf-command.sh \
       .claude/hooks/post-sf-command.sh

# Initialize usage tracking database
node .claude-plugins/opspal-salesforce/scripts/lib/api-usage-monitor.js init production

# Test API monitor
node .claude-plugins/opspal-salesforce/scripts/lib/api-usage-monitor.js status production
```

**Expected Output**:
```
API Usage Status - production
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Daily Usage: 0 / 15000 (0.0%)
Hourly Usage: 0 / 1000 (0.0%)
Status: ✅ HEALTHY
```

#### 2.2 Deploy Jira Integration

**Prerequisites**:
- Jira project created (e.g., `SFDC`)
- Custom fields created (see `config/change-management-config.json`)
- API token generated

```bash
# Verify Jira credentials
curl -X GET "$JIRA_URL/rest/api/3/myself" \
  -u "$JIRA_EMAIL:$JIRA_API_TOKEN" \
  -H "Content-Type: application/json"

# Deploy change ticket manager
cp .claude-plugins/opspal-salesforce/scripts/lib/change-ticket-manager.js \
   /usr/local/lib/salesforce-plugin/

# Deploy configuration
cp .claude-plugins/opspal-salesforce/config/change-management-config.json \
   .claude-plugins/opspal-salesforce/config/change-management-config.production.json

# Test ticket creation
node .claude-plugins/opspal-salesforce/scripts/lib/change-ticket-manager.js create-test-ticket

# Verify ticket created in Jira
echo "Check Jira project $JIRA_PROJECT_KEY for test ticket"
```

**Expected Output**: Test ticket created successfully in Jira

#### 2.3 Deploy Enhanced PII Detection

```bash
# Enhanced PII detection is part of data-classification-framework.js (already deployed in Phase 3)
# Test value-based detection
node -e "
const DataClassification = require('./.claude-plugins/opspal-salesforce/scripts/lib/data-classification-framework');
const framework = new DataClassification('production');

// Test with Contact Email field (should detect PII)
framework.classifyFieldWithSampling({
  QualifiedApiName: 'Contact.Email',
  Label: 'Email',
  DataType: 'Email',
  EntityDefinition: { QualifiedApiName: 'Contact' }
}).then(result => {
  console.log('Email classification:', result.level, '(confidence:', result.confidence + '%)');
  process.exit(0);
}).catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
"
```

**Expected Output**: Email field classified as RESTRICTED with high confidence

### Phase 2 Verification

```bash
# Run Phase 2 verification script
node .claude-plugins/opspal-salesforce/test/governance/verify-phase-2.js

# Expected checks:
# ✅ API monitor tracks calls
# ✅ Threshold alerts configured
# ✅ Jira connection established
# ✅ Test ticket created and closed
# ✅ Enhanced PII detection runs
# ✅ Value-based patterns match
```

**Success Criteria**:
- API monitor tracks test operation
- Jira ticket created and retrievable
- PII detection achieves >90% accuracy on test dataset

---

## Phase 3: Architecture & Data Quality

### Components

1. Architecture Auditor Agent
2. Schema Health Scoring
3. Data Classification Framework (base)

### Deployment Steps

#### 3.1 Deploy Architecture Auditor

```bash
# Architecture auditor is an agent, not a deployment
# Verify agent file exists
ls -la .claude-plugins/opspal-salesforce/agents/sfdc-architecture-auditor.md

# Test architecture health scoring
node .claude-plugins/opspal-salesforce/scripts/lib/architecture-health-scorer.js production

# Expected output: Architecture health score 0-100
```

#### 3.2 Deploy Schema Health Scoring

```bash
# Test schema health scorer
node .claude-plugins/opspal-salesforce/scripts/lib/schema-health-scorer.js production Account

# Expected output: Schema health score for Account object
```

#### 3.3 Deploy Data Classification Framework

```bash
# Base framework already deployed (enhanced with value-based detection in Phase 2)
# Test full classification workflow
node -e "
const DataClassification = require('./.claude-plugins/opspal-salesforce/scripts/lib/data-classification-framework');
const framework = new DataClassification('production');

framework.classifyObject('Contact').then(result => {
  console.log('Contact object classified:');
  console.log('  Total fields:', result.fields.length);
  console.log('  RESTRICTED:', result.fields.filter(f => f.level === 'RESTRICTED').length);
  console.log('  CONFIDENTIAL:', result.fields.filter(f => f.level === 'CONFIDENTIAL').length);
  process.exit(0);
});
"
```

### Phase 3 Verification

```bash
# Run Phase 3 verification script
node .claude-plugins/opspal-salesforce/test/governance/verify-phase-3.js

# Expected checks:
# ✅ Architecture health scorer runs
# ✅ Schema health scorer analyzes objects
# ✅ Data classification framework classifies fields
# ✅ ADR template system available
```

---

## Post-Deployment Verification

### 1. End-to-End Workflow Test

Test a complete governance workflow:

```bash
# Test script that triggers HIGH-risk operation
node .claude-plugins/opspal-salesforce/test/governance/e2e-governance-test.js

# Expected workflow:
# 1. Risk calculation (should be HIGH)
# 2. Approval request created
# 3. Jira ticket created
# 4. Interactive approval prompt
# 5. (After approval) Operation executes
# 6. Audit log created
# 7. Jira ticket updated
```

### 2. Verify All Integrations

```bash
# Check all integration points
./test/governance/verify-all-integrations.sh

# Expected output:
# ✅ Permission matrix: 13+ agents
# ✅ Risk scoring: Calculations correct
# ✅ Approvals: Storage working
# ✅ Audit trail: Multi-backend logging
# ✅ API monitor: Tracking active
# ✅ Jira integration: Tickets created
# ✅ PII detection: High accuracy
# ✅ Architecture scoring: Functional
# ✅ Schema health: Scoring works
```

### 3. Performance Benchmarking

```bash
# Measure governance overhead
node .claude-plugins/opspal-salesforce/test/governance/benchmark-overhead.js

# Target: <25ms average overhead per operation
# Expected: 15-20ms for risk calculation + logging
```

### 4. Production Smoke Tests

```bash
# Test with real agents (read-only operations)
# 1. State discovery
node -e "
const governance = require('./.claude-plugins/opspal-salesforce/scripts/lib/agent-governance');
// Simulate sfdc-state-discovery operation
// Should proceed without approval (Tier 1)
"

# 2. Data query
# Should proceed without approval (read-only)

# 3. Metadata deployment (dry run)
# Should require approval (HIGH risk)
```

**Success Criteria**:
- All smoke tests pass
- Performance overhead <25ms
- No errors in logs
- Approvals routing correctly

---

## Monitoring & Alerting

### 1. Set Up Real-Time Monitoring

```bash
# Start API usage monitor (runs in background)
node .claude-plugins/opspal-salesforce/scripts/lib/api-usage-monitor.js monitor production &

# Start approval queue monitor
node .claude-plugins/opspal-salesforce/scripts/lib/approval-queue-monitor.js production &

# Start governance health check (every 5 minutes)
*/5 * * * * /path/to/governance-health-check.sh
```

### 2. Configure Slack Alerts

Update `api-usage-config.json`:

```json
{
  "alerts": {
    "slack": true,
    "channels": {
      "WARNING": "#salesforce-ops",
      "CRITICAL": "#salesforce-alerts",
      "EMERGENCY": "#salesforce-critical"
    }
  }
}
```

### 3. Set Up Dashboard (Optional)

```bash
# Generate governance dashboard
node .claude-plugins/opspal-salesforce/scripts/lib/governance-dashboard-generator.js production

# Dashboard includes:
# - Active operations
# - Pending approvals
# - Risk distribution
# - API usage trends
# - Recent audit logs
```

### 4. Configure Alert Rules

| Alert | Trigger | Recipients |
|-------|---------|------------|
| CRITICAL risk blocked | Any CRITICAL operation | Security team, Engineering lead |
| Approval timeout | Approval pending >4 hours | Approver, Approver's manager |
| API quota warning | >70% daily quota | Operations team |
| API quota critical | >85% daily quota | Engineering lead, Operations |
| Emergency override | Override used | Security team, CISO |
| Governance failure | Component fails | Engineering lead |

### 5. Audit Log Retention

Retention is enforced automatically during logging when `AUDIT_RETENTION_DAYS` or
`AUDIT_RETENTION_YEARS` is set. You can also run a scheduled purge:

```bash
# Dry run (preview what would be deleted)
node .claude-plugins/opspal-salesforce/scripts/lib/agent-action-audit-logger.js purge --dry-run

# Purge logs older than 90 days
node .claude-plugins/opspal-salesforce/scripts/lib/agent-action-audit-logger.js purge --days 90
```

---

## Rollback Procedures

### Full Rollback (If Critical Issues)

```bash
# 1. Disable governance hooks
mv .claude/hooks/pre-agent-operation.sh .claude/hooks/pre-agent-operation.sh.disabled
mv .claude/hooks/post-sf-command.sh .claude/hooks/post-sf-command.sh.disabled

# 2. Restore previous configuration
cp -r backups/pre-governance-deployment/config-$(date +%Y%m%d)/* \
      .claude-plugins/opspal-salesforce/config/

# 3. Stop monitoring processes
pkill -f api-usage-monitor
pkill -f approval-queue-monitor

# 4. Document rollback
echo "Rollback executed: $(date)" >> backups/pre-governance-deployment/deployment.log
echo "Reason: [document reason]" >> backups/pre-governance-deployment/deployment.log

# 5. Notify stakeholders
curl -X POST "$SLACK_WEBHOOK_URL" \
  -H 'Content-Type: application/json' \
  -d '{"text":"⚠️ Governance framework rolled back - reason: [reason]"}'
```

### Partial Rollback (Single Component)

#### Disable API Monitor Only

```bash
# Remove post-command hook
rm .claude/hooks/post-sf-command.sh

# Stop monitor
pkill -f api-usage-monitor
```

#### Disable Jira Integration Only

```bash
# Update config to disable Jira
node -e "
const config = require('./.claude-plugins/opspal-salesforce/config/change-management-config.json');
config.jira.enabled = false;
require('fs').writeFileSync(
  '.claude-plugins/opspal-salesforce/config/change-management-config.json',
  JSON.stringify(config, null, 2)
);
console.log('Jira integration disabled');
"
```

#### Disable Governance Hook Only

```bash
# Disable pre-operation hook
mv .claude/hooks/pre-agent-operation.sh .claude/hooks/pre-agent-operation.sh.disabled

# Audit logging and other components continue working
```

---

## Troubleshooting

### Issue: Approval Requests Not Creating

**Symptoms**: High-risk operations proceed without approval

**Diagnosis**:
```bash
# Check hook is active
ls -la .claude/hooks/pre-agent-operation.sh

# Check risk scorer
node .claude-plugins/opspal-salesforce/scripts/lib/agent-risk-scorer.js test

# Check approval storage
ls -la .claude/logs/approvals/production
```

**Resolution**:
```bash
# Re-link hook
ln -sf $(pwd)/.claude-plugins/opspal-salesforce/hooks/universal-agent-governance.sh \
       .claude/hooks/pre-agent-operation.sh

# Verify permissions
chmod +x .claude/hooks/pre-agent-operation.sh
```

---

### Issue: Jira Tickets Not Creating

**Symptoms**: Approval requests created but no Jira tickets

**Diagnosis**:
```bash
# Test Jira connection
curl -X GET "$JIRA_URL/rest/api/3/myself" \
  -u "$JIRA_EMAIL:$JIRA_API_TOKEN"

# Check config
cat .claude-plugins/opspal-salesforce/config/change-management-config.json | jq '.jira'

# Check logs
grep "JIRA" .claude/logs/agent-governance/production/*.log
```

**Resolution**:
```bash
# Verify environment variables loaded
echo "JIRA_URL: $JIRA_URL"
echo "JIRA_EMAIL: $JIRA_EMAIL"

# Test ticket creation manually
node .claude-plugins/opspal-salesforce/scripts/lib/change-ticket-manager.js create-test-ticket
```

---

### Issue: API Monitor Not Tracking

**Symptoms**: API usage shows 0 calls despite operations

**Diagnosis**:
```bash
# Check post-command hook
ls -la .claude/hooks/post-sf-command.sh

# Check tracking database
ls -la .claude/logs/api-usage/production

# Test tracking manually
node .claude-plugins/opspal-salesforce/scripts/lib/api-usage-monitor.js track production data query
```

**Resolution**:
```bash
# Re-link hook
ln -sf $(pwd)/.claude-plugins/opspal-salesforce/hooks/post-sf-command.sh \
       .claude/hooks/post-sf-command.sh

# Initialize database
node .claude-plugins/opspal-salesforce/scripts/lib/api-usage-monitor.js init production
```

---

### Issue: PII Detection Inaccurate

**Symptoms**: Fields incorrectly classified

**Diagnosis**:
```bash
# Test specific field
node -e "
const DataClassification = require('./.claude-plugins/opspal-salesforce/scripts/lib/data-classification-framework');
const framework = new DataClassification('production');
framework.classifyFieldWithSampling({
  QualifiedApiName: 'Contact.Problematic_Field__c',
  Label: 'Problematic Field',
  DataType: 'Text',
  EntityDefinition: { QualifiedApiName: 'Contact' }
}).then(console.log);
"
```

**Resolution**:
```bash
# Adjust pattern matching thresholds in data-classification-framework.js
# Or add field-specific overrides in config
```

---

### Issue: Performance Overhead Too High

**Symptoms**: Operations taking >50ms longer

**Diagnosis**:
```bash
# Run benchmark
node .claude-plugins/opspal-salesforce/test/governance/benchmark-overhead.js

# Check for slow components
# - Risk calculation should be <5ms
# - Audit logging should be <10ms
# - Approval check should be <5ms
```

**Resolution**:
```bash
# Enable performance mode (disables verbose logging)
export AGENT_GOVERNANCE_PERFORMANCE_MODE=true

# Or disable specific slow components temporarily
```

---

## Support & Escalation

### Getting Help

- **Documentation**: `docs/AGENT_GOVERNANCE_FRAMEWORK.md`
- **Integration Guide**: `docs/AGENT_GOVERNANCE_INTEGRATION.md`
- **GitHub Issues**: https://github.com/RevPalSFDC/opspal-plugin-internal-marketplace/issues
- **Slack**: #salesforce-ops or #salesforce-alerts
- **Email**: engineering@gorevpal.com

### Escalation Path

1. **Level 1**: Engineering team (immediate response)
2. **Level 2**: Security team (HIGH/CRITICAL risk issues)
3. **Level 3**: CISO (emergency override issues, compliance concerns)

### Emergency Contacts

- Engineering Lead: [contact info]
- Security Lead: [contact info]
- CISO: [contact info]
- 24/7 On-Call: [pager number]

---

## Post-Deployment Tasks

### Week 1: Monitoring Mode

- [ ] Monitor all operations (don't block any)
- [ ] Collect risk score distribution data
- [ ] Tune risk thresholds if needed
- [ ] Monitor API usage patterns
- [ ] Review all audit logs

### Week 2: Soft Enforcement

- [ ] Enable blocking for CRITICAL risk (>70)
- [ ] Require approval for HIGH risk (51-70)
- [ ] Monitor approval latency
- [ ] Review Jira ticket creation
- [ ] Tune alert thresholds

### Week 3: Full Enforcement

- [ ] Remove all bypass flags
- [ ] Enforce all risk thresholds
- [ ] Lock down production access
- [ ] Generate compliance reports
- [ ] Document lessons learned

### Ongoing

- [ ] Weekly governance health review
- [ ] Monthly risk model tuning
- [ ] Quarterly security audit
- [ ] Annual compliance review

---

## Appendix A: Configuration Files

### agent-permission-matrix.json

Location: `.claude-plugins/opspal-salesforce/config/agent-permission-matrix.json`

Purpose: Defines tier assignments and permissions for all agents

Critical fields:
- `agents`: Agent-specific tier and permission configuration
- `environmentRestrictions`: Production lockdown rules
- `deploymentWindow`: Allowed deployment times

### api-usage-config.json

Location: `.claude-plugins/opspal-salesforce/config/api-usage-config.json`

Purpose: API monitoring thresholds and alert configuration

Critical fields:
- `thresholds`: WARNING, CRITICAL, EMERGENCY levels
- `limits`: Daily and hourly API limits
- `alerts`: Slack/email configuration

### change-management-config.json

Location: `.claude-plugins/opspal-salesforce/config/change-management-config.json`

Purpose: Jira/ServiceNow integration configuration

Critical fields:
- `jira`: Credentials and project settings
- `routing`: Risk level to ticket system mapping
- `customFields`: Jira custom field IDs

---

## Appendix B: File Inventory

### Phase 1 Files (10 files)

```
.claude-plugins/opspal-salesforce/
├── agents/
│   └── sfdc-agent-governance.md
├── config/
│   └── agent-permission-matrix.json
├── scripts/lib/
│   ├── agent-risk-scorer.js
│   ├── agent-action-audit-logger.js
│   ├── human-in-the-loop-controller.js
│   └── agent-governance.js
├── hooks/
│   ├── universal-agent-governance.sh
│   └── post-agent-operation.sh
└── docs/
    ├── AGENT_GOVERNANCE_FRAMEWORK.md
    └── AGENT_GOVERNANCE_INTEGRATION.md
```

### Phase 2 Files (8 files)

```
.claude-plugins/opspal-salesforce/
├── agents/
│   └── sfdc-api-monitor.md
├── config/
│   ├── api-usage-config.json
│   └── change-management-config.json
├── scripts/lib/
│   ├── api-usage-monitor.js
│   ├── change-ticket-manager.js
│   └── data-classification-framework.js (enhanced)
└── hooks/
    └── post-sf-command.sh
```

### Phase 3 Files (7 files)

```
.claude-plugins/opspal-salesforce/
├── agents/
│   └── sfdc-architecture-auditor.md
├── scripts/lib/
│   ├── architecture-health-scorer.js
│   ├── schema-health-scorer.js
│   └── data-classification-framework.js (base)
└── templates/adr/
    ├── adr-template.md
    ├── adr-index.md
    └── README.md
```

---

**Deployment Guide Version**: 1.0.0
**Last Updated**: 2025-10-25
**Maintained By**: RevPal Engineering

**Next Review**: 2025-11-25 (30 days post-deployment)
