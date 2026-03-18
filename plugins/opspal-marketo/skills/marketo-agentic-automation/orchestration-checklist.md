# Orchestration Checklist

Pre-flight and verification checklist for autonomous program deployment.

## Pre-Flight Validation

### Template Verification
- [ ] Template program ID is valid
- [ ] Template exists and is accessible
- [ ] Template contains expected assets
- [ ] Template has placeholder tokens defined

### Target Configuration
- [ ] Target folder exists
- [ ] Target folder type is 'Folder' (NOT 'Program')
- [ ] Program name is unique in folder
- [ ] Workspace permissions verified

### API Readiness
- [ ] API authentication valid
- [ ] Daily quota sufficient (50,000 calls)
- [ ] Bulk export quota sufficient (500 MB)
- [ ] No rate limit warnings

### Token Preparation
- [ ] All required token values collected
- [ ] Date formats verified (YYYY-MM-DD)
- [ ] URLs are valid and accessible
- [ ] Token names match template (max 50 chars)

## Execution Checklist

### Phase 1: Clone
- [ ] Program cloned successfully
- [ ] New program ID captured
- [ ] Clone status verified

### Phase 2: Tokens
- [ ] All tokens updated
- [ ] Token values verified via get
- [ ] No validation errors

### Phase 3: Assets
- [ ] Asset list retrieved
- [ ] Email count verified
- [ ] Form count verified
- [ ] Landing page count verified
- [ ] Campaign count verified

### Phase 4: Approval (Order Matters!)
- [ ] **Forms approved first** (no dependencies)
- [ ] **Emails approved second** (use tokens)
- [ ] **Landing pages approved third** (embed forms)
- [ ] Approval errors logged

### Phase 5: Activation
- [ ] Trigger campaigns activated
- [ ] Batch campaigns scheduled (if applicable)
- [ ] Activation verified

## Post-Deployment Verification

### Asset Status
- [ ] All forms approved
- [ ] All emails approved
- [ ] All landing pages approved
- [ ] Landing page URLs captured

### Campaign Status
- [ ] Trigger campaigns active
- [ ] Batch campaigns scheduled
- [ ] No orphaned assets

### Integration Points
- [ ] SFDC campaign linked (if applicable)
- [ ] Webinar provider connected (if applicable)
- [ ] Tracking codes configured

## Error Recovery

### Clone Failed
```
Check:
- Template exists?
- Folder is type 'Folder'?
- Name already exists?
```

### Token Update Failed
```
Check:
- Token names match template?
- Date format correct (YYYY-MM-DD)?
- Token name < 50 chars?
```

### Approval Failed
```
Check:
- Dependencies approved first?
- Required fields present?
- Template properly configured?
```

### Activation Failed
```
Check:
- Smart list has members?
- Triggers configured in template?
- No missing references?
```

## Rollback Procedure

If deployment fails mid-execution:

1. **Document created assets**
   - Record program ID
   - Record asset IDs

2. **Do NOT auto-delete**
   - Require user confirmation
   - Provide cleanup commands

3. **Manual cleanup if needed**
   ```
   - Deactivate campaigns
   - Unapprove assets
   - Delete program (with confirmation)
   ```
