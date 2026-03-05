# Remediation Patterns

## Data Quality Remediation

### Low Completeness (Score < 70)

**Root Causes:**
- Missing required fields on forms
- Incomplete imports
- Integration gaps
- No progressive profiling

**Remediation Steps:**
1. **Audit required fields** - Identify critical fields with low completion
2. **Update forms** - Add required fields, implement progressive profiling
3. **Enrich existing data** - Use ZoomInfo, Clearbit, or manual enrichment
4. **Implement validation** - Add workflow validation for critical fields
5. **Track progress** - Set up completeness dashboard

**Example Workflow:**
```yaml
Workflow: Contact Completeness Enforcement
Trigger: Contact created/updated
Condition: Email known, Company blank
Action:
  1. Enrich from ZoomInfo (if connected)
  2. Set internal property "needs_enrichment" = true
  3. Add to "Needs Enrichment" list
  4. Notify assigned owner after 48h if still incomplete
```

### High Duplicate Rate (> 5%)

**Root Causes:**
- Missing deduplication rules
- Multiple import sources
- Form spam
- No merge workflows

**Remediation Steps:**
1. **Export duplicates** - Generate duplicate report
2. **Analyze patterns** - Identify common duplication sources
3. **Bulk merge** - Merge obvious duplicates (exact email match)
4. **Review fuzzy matches** - Manual review of similar records
5. **Prevent future** - Implement dedup on forms, imports

**Deduplication Priority:**
```
Priority 1: Exact email match → Auto-merge
Priority 2: Email domain + same company + similar name → Review queue
Priority 3: Phone + company match → Review queue
Priority 4: Fuzzy name + company → Low priority review
```

## Automation Remediation

### High Error Rate (> 5%)

**Common Causes:**
- Invalid property values
- Deleted associated records
- Rate limits exceeded
- Permission errors

**Remediation Steps:**
1. **Analyze error logs** - Categorize by error type
2. **Fix data issues** - Clean invalid property values
3. **Update workflow logic** - Add validation branches
4. **Add error handling** - Implement try/catch patterns
5. **Monitor recovery** - Set up error rate alerts

**Error Handling Pattern:**
```yaml
Workflow: Resilient Processing
Before risky action:
  1. Check if required properties exist
  2. Validate data format
  3. Verify associated records exist
On error:
  1. Log error to internal property
  2. Add to "Workflow Errors" list
  3. Retry once after 1 hour
  4. Notify admin if still failing
```

### Low Active Rate (< 60%)

**Root Causes:**
- Orphaned workflows from old campaigns
- Paused workflows never resumed
- Duplicate workflows (old/new versions)
- Unused templates

**Remediation Steps:**
1. **Audit all workflows** - List by status and last run
2. **Archive unused** - Move old campaigns to archive folder
3. **Delete obsolete** - Remove workflows not run in 12+ months
4. **Consolidate duplicates** - Merge similar workflows
5. **Document active** - Create workflow documentation

## Integration Remediation

### Low Sync Success Rate (< 95%)

**Common Causes:**
- Field mapping mismatches
- Required field missing
- Record type conflicts
- Rate limit errors

**Remediation Steps:**
1. **Review error logs** - Categorize by error type
2. **Fix field mappings** - Align property types
3. **Add default values** - Handle missing required fields
4. **Implement retry** - Add retry logic for transient errors
5. **Optimize batch size** - Reduce for rate limit issues

**Field Mapping Checklist:**
```
[ ] Property types match (text → text, number → number)
[ ] Picklist values aligned (exact match or mapping)
[ ] Required fields have defaults
[ ] Date formats consistent (UTC timestamps)
[ ] Multi-select properly delimited
[ ] Reference/lookup IDs synchronized
```

### High Conflict Rate (> 1%)

**Root Causes:**
- Bidirectional sync without winner logic
- Multiple systems updating same field
- Timing conflicts during sync

**Remediation Steps:**
1. **Define system of record** - Per field or per object
2. **Configure sync direction** - One-way where appropriate
3. **Add timestamps** - Track last modified system
4. **Implement winner logic** - Most recent wins, or priority-based
5. **Monitor conflicts** - Alert on conflict rate increase

## User Adoption Remediation

### Low Login Frequency

**Root Causes:**
- Poor training
- System not providing value
- Alternative tools in use
- Complex interface

**Remediation Steps:**
1. **Survey users** - Understand barriers
2. **Simplify interface** - Create role-specific views
3. **Demonstrate value** - Show time savings, insights
4. **Provide training** - Role-specific enablement
5. **Gamify adoption** - Leaderboards, recognition

### Low Feature Adoption

**Remediation by Feature:**
| Feature | Typical Barrier | Solution |
|---------|-----------------|----------|
| Sequences | Don't know how | Training + templates |
| Meetings | Prefer manual | Show time savings |
| Workflows | Marketing only | Cross-team use cases |
| Reporting | Too complex | Pre-built dashboards |
| Tasks | Use other tools | Integration + reminders |

## Reporting Remediation

### Low Maturity (Level 1-2)

**Remediation Roadmap:**

**Week 1-2: Foundation**
- Create standard report library
- Define key metrics by role
- Build 3-5 core dashboards

**Week 3-4: Adoption**
- Train users on report access
- Schedule automated report delivery
- Create self-service report templates

**Week 5-8: Optimization**
- Add custom attribution reporting
- Build cross-functional dashboards
- Implement goal tracking

**Month 3+: Advanced**
- Predictive lead scoring reports
- Revenue attribution models
- Automated anomaly detection
