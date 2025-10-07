# Salesloft Account Merge Strategy

## Executive Summary
Analysis of 21,600 Salesloft accounts reveals significant duplication:
- **1,708 duplicate groups** by cleaned domain (primary concern)
- **1,199 duplicate groups** by name
- **20 duplicate groups** by CRM ID

## Merge Approach: Three-Phase Strategy

### Phase 1: Automated Safe Merges (Immediate)
**Criteria for automatic merging:**
- Same cleaned domain
- Low complexity (<20 people affected)
- Same owner
- No CRM ID conflicts
- Account age difference >30 days

**Process:**
1. Oldest account becomes primary (preserves history)
2. Move all people to primary account
3. Archive duplicate account
4. Log all actions for audit trail

### Phase 2: Semi-Automated Merges (Requires Review)
**Criteria:**
- Medium complexity (20-100 people)
- Different owners but same team
- Minor data conflicts resolvable by rules

**Process:**
1. Generate merge proposals
2. Human review via CSV export
3. Bulk execute approved merges
4. Handle exceptions manually

### Phase 3: Manual Complex Merges
**Criteria:**
- High complexity (>100 people)
- CRM ID conflicts
- Different teams/owners
- Active engagement history on both

**Process:**
1. Export detailed analysis
2. Business stakeholder review
3. Case-by-case resolution
4. Potential CRM cleanup required

## Technical Implementation

### API-Based Merge Process
```python
# 1. Move all people from duplicate to primary
PUT /v2/people/{person_id}
{
  "account_id": primary_account_id
}

# 2. Copy important custom fields
PUT /v2/accounts/{primary_id}
{
  "custom_fields": merged_custom_fields
}

# 3. Archive duplicate account
PUT /v2/accounts/{duplicate_id}
{
  "archived_at": timestamp
}
```

### Data Preservation Strategy
Before merging, preserve:
1. **Activity History**: All emails, calls, notes remain with people
2. **Custom Fields**: Merge non-null values, prioritize primary
3. **Tags**: Union of all tags
4. **Owner History**: Log ownership chain
5. **CRM Associations**: Maintain primary's CRM link

## Merge Rules & Conflict Resolution

### Domain Conflicts
- **Rule**: Clean domain to base format (remove http://, www., trailing /)
- **Conflict**: Multiple accounts claim same domain
- **Resolution**: Oldest account wins, unless CRM data indicates otherwise

### Name Conflicts
- **Rule**: Exact match (case-insensitive)
- **Conflict**: Same company, different divisions
- **Resolution**: Keep separate if different domains, merge if same

### CRM ID Conflicts
- **Rule**: Should be 1:1 with Salesforce
- **Conflict**: Multiple SL accounts, one SF account
- **Resolution**: Merge all into single account matching CRM

### Owner Conflicts
- **Rule**: Preserve existing ownership
- **Conflict**: Different owners for duplicate accounts
- **Resolution**: Primary account owner retained, log others

## Execution Script
```bash
# Analyze duplicates
python3 scripts/analyze-duplicate-accounts.py

# Execute safe merges (dry run)
python3 scripts/analyze-duplicate-accounts.py --merge

# Execute with limit
python3 scripts/analyze-duplicate-accounts.py --merge --limit 10

# Force complex merges (with approval)
python3 scripts/analyze-duplicate-accounts.py --merge --force --limit 5
```

## Impact Analysis

### Immediate Benefits
1. **Resolves PostgreSQL errors**: No more duplicate key violations
2. **Improves sync reliability**: Cleaner 1:1 mapping with Salesforce
3. **Better data quality**: Consolidated account history
4. **Reduced confusion**: Single source of truth per company

### Risks & Mitigations
| Risk | Impact | Mitigation |
|------|--------|------------|
| Data loss | Medium | Full backup before merge, archive duplicates |
| Wrong merge | High | Automated only for safe cases, manual review for complex |
| Broken automations | Medium | Test cadences and workflows post-merge |
| User confusion | Low | Communication plan, training on new structure |

## Rollback Plan
If merge causes issues:
1. Unarchive duplicate accounts (API available)
2. Restore people associations from backup
3. Re-establish workflows
4. Document lessons learned

## Monitoring & Validation

### Pre-Merge Checks
```sql
-- Validate no active cadences on duplicates
SELECT COUNT(*) FROM cadence_memberships
WHERE person_id IN (
  SELECT id FROM people WHERE account_id = duplicate_id
)

-- Check for recent activity
SELECT MAX(last_contacted_at) FROM accounts
WHERE id = duplicate_id
```

### Post-Merge Validation
1. Verify people count matches
2. Check CRM sync status
3. Validate cadence memberships
4. Confirm email deliverability
5. Test workflow triggers

## Best Practices Going Forward

### Prevention Strategy
1. **Import Settings**: Enable "Clean Domains" in Salesloft
2. **Deduplication Rules**: Set up matching rules on domain
3. **Regular Audits**: Monthly duplicate check script
4. **Training**: Team education on account creation
5. **CRM Integration**: Enforce 1:1 mapping with Salesforce

### Maintenance Schedule
- **Daily**: Monitor for new duplicates via webhook
- **Weekly**: Run duplicate detection script
- **Monthly**: Execute approved merges
- **Quarterly**: Full account audit and cleanup

## Quick Commands

### Find specific duplicates
```bash
# Check for domain duplicates
curl -X GET "https://api.salesloft.com/v2/accounts?domain=example.com" \
  -H "Authorization: Bearer $SALESLOFT_TOKEN"
```

### Manual merge
```bash
# Move person to different account
curl -X PUT "https://api.salesloft.com/v2/people/{person_id}" \
  -H "Authorization: Bearer $SALESLOFT_TOKEN" \
  -d '{"account_id": new_account_id}'
```

### Bulk operations
```bash
# Use the analyzer script for bulk operations
python3 scripts/analyze-duplicate-accounts.py --merge --limit 50
```

## Success Metrics
- **Duplicate Reduction**: Target 90% reduction in 30 days
- **Sync Success Rate**: Improve from 97% to 99.5%
- **Error Reduction**: Zero PostgreSQL duplicate key errors
- **Data Quality Score**: Increase from 72% to 95%

## Timeline
- **Week 1**: Execute Phase 1 (safe merges)
- **Week 2-3**: Review and execute Phase 2
- **Week 4+**: Handle complex merges case-by-case
- **Ongoing**: Monitoring and prevention

## Support & Escalation
1. **Technical Issues**: API errors, script failures
2. **Business Decisions**: Which account to keep
3. **CRM Conflicts**: Salesforce data discrepancies
4. **Escalation Path**: Ops → Sales Ops → RevOps → Leadership