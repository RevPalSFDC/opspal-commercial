# HubSpot Data Validation Rules

## No-Mocks Policy

**ZERO TOLERANCE**: All data MUST come from real, authoritative sources.

```javascript
// PROHIBITED: Fake/mock data
const fakeContacts = [
  { email: 'john.doe@example.com', name: 'John Doe' }
];

// REQUIRED: Real data from HubSpot API
const realContacts = await client.get('/crm/v3/objects/contacts');
```

## Enforcement Rules

- All data operations MUST include query execution evidence
- NEVER generate synthetic data without explicit "SIMULATED DATA" labeling
- ALWAYS fail explicitly when queries cannot be executed

## Delete Safety Protocol (5 Steps)

**NEVER skip any step** - All 5 are mandatory for destructive operations:

1. **Backup**: Export records to `.hubspot-backups/`
2. **Validate**: Confirm associations transferred (if merge scenario)
3. **Confirm**: Require explicit user confirmation
4. **Delete**: Execute deletion
5. **Audit**: Write audit log with timestamp, reason, deleted IDs

```javascript
// ALWAYS use safe-delete-wrapper
const safeDelete = require('../scripts/lib/safe-delete-wrapper');

const result = await safeDelete.deleteWithSafety(
  'companies',
  companyIds,
  {
    backupDir: './.hubspot-backups',
    reason: 'Duplicate company cleanup',
    validateAssociations: true,
    survivorId: primaryCompanyId,
    confirmed: false,  // REQUIRED: User must confirm
    deletedBy: process.env.USER_EMAIL
  }
);
```

## Property Validation

### Required Contact Fields

```javascript
// Required for contact creation
const contactSchema = {
  email: "required",       // Must be valid email
  firstname: "optional",
  lastname: "optional",
  lifecyclestage: "optional"  // If set, must be valid stage
};
```

### Property Naming Conventions

**Always use snake_case** for custom properties:

```javascript
// CORRECT
contact_score
lifecycle_stage_date
last_activity_timestamp

// WRONG
contactScore
lifecycleStageDate
lastActivityTimestamp
```

## Context7 Integration

**CRITICAL**: Before generating ANY HubSpot API code, use Context7 for current documentation.

Pre-Code Generation Steps:
1. **Bulk APIs**: "use context7 @hubspot/api-client@latest"
2. **Import/Export**: Verify latest batch operation patterns
3. **ETL patterns**: Check current transformation methods
4. **Association APIs**: Confirm cross-object linking syntax

This prevents:
- Deprecated bulk operation endpoints
- Invalid batch size limits
- Outdated import/export formats
- Incorrect association types
