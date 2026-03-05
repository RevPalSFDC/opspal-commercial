# Permission Model

## Role-Based Access Control

### Standard Roles Matrix

| Capability | Super Admin | Admin | Sales Manager | Sales Rep | Marketing | Read-Only |
|------------|-------------|-------|---------------|-----------|-----------|-----------|
| User Management | ✓ | ✓ | - | - | - | - |
| Billing | ✓ | - | - | - | - | - |
| Account Settings | ✓ | ✓ | - | - | - | - |
| Property Settings | ✓ | ✓ | - | - | ✓ | - |
| Create Workflows | ✓ | ✓ | - | - | ✓ | - |
| Edit Workflows | ✓ | ✓ | - | - | ✓ | - |
| Delete Records | ✓ | ✓ | ✓ | - | - | - |
| Export Data | ✓ | ✓ | ✓ | - | ✓ | - |
| View All Records | ✓ | ✓ | ✓ | - | ✓ | ✓ |
| Edit Own Records | ✓ | ✓ | ✓ | ✓ | ✓ | - |
| View Reports | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Create Reports | ✓ | ✓ | ✓ | - | ✓ | - |

### Team-Based Permissions

```
Team Structure:
├── Sales
│   ├── Enterprise Team
│   │   └── Can view: Enterprise deals, Enterprise accounts
│   ├── SMB Team
│   │   └── Can view: SMB deals, SMB accounts
│   └── BDR Team
│       └── Can view: Leads, assigned accounts
├── Marketing
│   └── Can view: All contacts, all companies
├── Customer Success
│   └── Can view: Customer accounts only
└── Finance
    └── Can view: Closed-Won deals, invoicing data
```

### Permission Set Templates

#### Sales Representative
```yaml
Name: Sales_Rep_Standard
Objects:
  Contacts:
    View: Owned + Team
    Edit: Owned
    Delete: No
  Companies:
    View: Owned + Team
    Edit: Owned
    Delete: No
  Deals:
    View: Owned + Team
    Edit: Owned
    Delete: No
Features:
  Sequences: Use only
  Meeting Scheduler: Full
  Calling: Full
  Tasks: Full
  Documents: View + Send
  Quotes: Create + Send
```

#### Sales Manager
```yaml
Name: Sales_Manager_Standard
Objects:
  Contacts:
    View: Team
    Edit: Team
    Delete: Team
  Companies:
    View: Team
    Edit: Team
    Delete: No
  Deals:
    View: Team
    Edit: Team
    Delete: Team
Features:
  Sequences: Create + Edit
  Forecasting: Full
  Reports: Create + Edit
  Team Settings: Edit
  Assignment Rules: Edit
```

#### Marketing User
```yaml
Name: Marketing_Standard
Objects:
  Contacts:
    View: All
    Edit: All
    Delete: No
  Companies:
    View: All
    Edit: Marketing properties only
    Delete: No
  Deals:
    View: All
    Edit: No
    Delete: No
Features:
  Campaigns: Full
  Workflows: Create + Edit
  Forms: Full
  Email: Full
  Social: Full
  Ads: Full
```

## Access Control Patterns

### Least Privilege Principle
```
Rules:
1. Start with minimal access
2. Add permissions as needed
3. Document justification for elevated access
4. Review quarterly
5. Remove unused permissions
```

### Sensitive Data Access
```
Restricted Fields (require approval):
- Personal identifiable information (PII)
- Financial information
- Legal/compliance data
- Competitive intelligence
- Employee data

Access Request Process:
1. Submit request with business justification
2. Manager approval
3. Security review (for sensitive data)
4. Time-limited access when possible
5. Audit trail maintained
```

### Permission Inheritance
```
Hierarchy:
Super Admin → Admin → Manager → User → Read-Only

Inheritance Rules:
- Higher levels include lower level permissions
- Explicit denials override inherited allows
- Team permissions stack with role permissions
- Custom permissions take precedence
```

## Permission Audit

### Quarterly Review Checklist
```
[ ] Export user permissions report
[ ] Identify users with elevated access
[ ] Verify business justification for admin roles
[ ] Check for inactive users (no login 90+ days)
[ ] Review external user access
[ ] Validate team assignments
[ ] Check workflow permissions
[ ] Review API key access
[ ] Document changes made
```

### Access Anomaly Detection
```
Alert Conditions:
- User downloads >1000 records
- Bulk delete operations (>100 records)
- After-hours access to sensitive data
- Access from unusual locations
- Multiple failed login attempts
- API calls exceeding normal patterns
```

## Integration User Permissions

### Integration Account Setup
```yaml
Name: Integration_[SystemName]
Type: Non-user account
Permissions:
  - Minimum required for sync
  - No UI access
  - API access only
  - Limited to specific objects
Monitoring:
  - Log all API calls
  - Alert on errors
  - Monthly access review
```

### Common Integration Permissions

| Integration | Required Access |
|-------------|-----------------|
| Salesforce Sync | Contacts, Companies, Deals - Read/Write |
| Slack | Notifications - Send only |
| LinkedIn | Contacts - Read/Write, Companies - Read |
| ZoomInfo | Contacts, Companies - Write only |
| Zapier | Varies by zap - Minimum required |
