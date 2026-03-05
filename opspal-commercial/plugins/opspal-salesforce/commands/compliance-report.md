---
name: compliance-report
description: Generate compliance reports for SOC2, GDPR, HIPAA with security configuration audits
argument-hint: "[soc2|gdpr|hipaa] [--org <alias>] [--format markdown|pdf|json]"
arguments:
  - name: framework
    description: Compliance framework (soc2, gdpr, hipaa)
    required: false
  - name: org
    description: Salesforce org alias
    required: false
  - name: format
    description: Output format (json, pdf, markdown)
    required: false
---

# Compliance Report Command

Generate comprehensive compliance reports covering SOC2, GDPR, HIPAA requirements with security configuration audits and remediation recommendations.

## Usage

```bash
/compliance-report soc2                     # SOC2 compliance report
/compliance-report gdpr --org production    # GDPR assessment
/compliance-report hipaa --format pdf       # HIPAA report as PDF
/compliance-report                          # Multi-framework overview
```

## What This Does

1. **Framework Mapping**: Maps Salesforce controls to compliance requirements
2. **Access Auditing**: Reviews user permissions and access patterns
3. **Retention Verification**: Checks data retention policy compliance
4. **Security Configuration**: Validates password, session, MFA settings
5. **Report Generation**: Produces audit-ready documentation

## Execution

Use the compliance-report-generator agent:

```javascript
Task({
  subagent_type: 'opspal-salesforce:compliance-report-generator',
  prompt: `Generate compliance report. Framework: ${framework || 'overview'}. Org: ${org || 'default'}. Format: ${format || 'json'}`
});
```

## Output

The report includes:
- **Control Assessment**: Pass/fail status for each control
- **Evidence Collection**: Supporting data for each finding
- **User Access Review**: Admin users, permissions, activity
- **Security Configuration**: Current vs. recommended settings
- **Findings & Remediation**: Issues with specific actions

## Related Commands

- `/assess-permissions` - Permission set assessment
- `/audit-automation` - Automation audit
