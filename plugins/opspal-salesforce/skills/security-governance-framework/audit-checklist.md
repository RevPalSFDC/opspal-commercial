# Security Audit Checklist

## Pre-Deployment Security Review

### Permission Set Review
- [ ] Follows two-tier architecture (Tier 1 foundational, Tier 2 composed)
- [ ] Naming convention followed
- [ ] No excessive permissions (principle of least privilege)
- [ ] Field-level security consistent
- [ ] Object permissions match requirements
- [ ] No conflicting permissions with existing sets
- [ ] Rollback plan documented

### Profile Review
- [ ] Standard profiles not modified
- [ ] Custom profiles properly named
- [ ] Page layouts assigned correctly
- [ ] Record type access appropriate
- [ ] App visibility configured
- [ ] Login hours/IP restrictions if required

### Sharing Rules Review
- [ ] Org-wide defaults appropriate
- [ ] Sharing rules support business requirements
- [ ] No over-sharing of sensitive data
- [ ] Role hierarchy reviewed
- [ ] Manual sharing minimized

## Playwright-Based Audit Capabilities

### Security UI Elements for Scraping

**Setup Audit Trail** (20 recent via API, full history via UI):
```bash
HEAD=1 ORG=production node scripts/scrape-sf-setup-audit-trail.js
```

**Security Health Check** (UI-only dashboard):
```bash
node scripts/scrape-sf-security-health-check.js
```

**Permission Set Assignments**:
```bash
node scripts/scrape-sf-permission-assignments.js
```

**Login History**:
```bash
node scripts/scrape-sf-login-history.js
```

### Generated Reports
- `instances/{org}/setup-audit-trail-snapshot.json`
- `instances/{org}/permission-assignments-snapshot.json`
- `instances/{org}/security-health-check-snapshot.json`
- `instances/{org}/login-history-snapshot.json`

## Compliance Verification

### Combined API + UI Audit
```bash
# API-based permission queries
sf data query --query "SELECT Id, Name FROM PermissionSet" --target-org production

# UI-based audit trail extraction
node scripts/scrape-sf-setup-audit-trail.js
node scripts/scrape-sf-permission-assignments.js
node scripts/scrape-sf-security-health-check.js

# Generate comprehensive security report
node scripts/lib/security-audit-report-generator.js combine \
  data/permissions-api.json \
  instances/{org}/setup-audit-trail-snapshot.json \
  instances/{org}/security-health-check-snapshot.json
```

### Compliance Frameworks
```bash
# Generate compliance report
node scripts/lib/compliance-reporter.js generate \
  --audit-trail instances/{org}/setup-audit-trail-snapshot.json \
  --framework sox,hipaa,gdpr
```

## Post-Deployment Verification

### Immediate Checks
- [ ] Permission set assignments successful
- [ ] No error in deployment logs
- [ ] Users can access expected objects
- [ ] Users cannot access restricted objects
- [ ] FLS correctly applied

### 24-Hour Monitoring
- [ ] No unexpected access issues reported
- [ ] Login patterns normal
- [ ] No permission-related errors in logs
- [ ] Security Health Check score stable

### Weekly Review
- [ ] Audit trail reviewed for changes
- [ ] User access patterns analyzed
- [ ] Sharing rule effectiveness validated
- [ ] Any new security requirements addressed

## Bulk Operations Performance

### Parallel Processing Targets

| Operation | Sequential | Parallel | Target |
|-----------|-----------|----------|--------|
| Permission checks (20 users) | 50s | 6.2s | 8x faster |
| Security audits (40 profiles) | 60s | 4s | 15x faster |
| Metadata from cache | 24s | 4.8s | 5x faster |
| User provisioning (30 users) | 60s | 5s | 12x faster |

### Bulk Patterns Required
- [ ] Use `Promise.all()` for permission queries
- [ ] Use SOQL IN clause for batch auditing
- [ ] Use `org-metadata-cache.js` with 30-minute TTL
- [ ] Use parallel user provisioning
