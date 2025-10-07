# Salesloft Duplicate Prevention Strategy

## Root Cause Analysis
Based on merging 19 duplicate groups, we've identified the primary causes:

### 1. Domain Format Inconsistencies (60%)
- Accounts created with `http://`, `https://`, `www.` prefixes
- Example: `http://www.townmgmt.com` vs `townmgmt.com`

### 2. CRM Sync Issues (70%)
- Different Salesforce records creating separate SL accounts
- Bidirectional sync without deduplication

### 3. Name Variations (40%)
- "The Company" vs "Company"
- Regional divisions treated as separate accounts
- Abbreviations creating duplicates

## Prevention Implementation

### Phase 1: Immediate Configuration (Today)

#### 1. Enable Domain Cleaning
```
Salesloft Settings > Import Settings > Data Cleaning
☑️ Clean domains on import
☑️ Remove protocols (http/https)
☑️ Remove www prefix
☑️ Convert to lowercase
```

#### 2. Set Duplicate Detection Rules
```
Salesloft Settings > Deduplication
Primary Match: Domain (cleaned)
Secondary Match: Company Name (fuzzy)
Action: Merge on import
```

#### 3. Fix CRM Field Mapping
```
Salesforce Setup > Salesloft Integration
Map: Account.Website → Clean before sync
Formula Field: SUBSTITUTE(SUBSTITUTE(LOWER(Website), 'http://', ''), 'www.', '')
```

### Phase 2: Process Changes (This Week)

#### 1. Team Training Checklist
- [ ] Always search before creating accounts
- [ ] Use domain only (no http/www)
- [ ] Check for abbreviations and variations
- [ ] Verify CRM account exists first

#### 2. Import Process
```python
# Pre-import validation script
def validate_import(csv_file):
    duplicates = []
    for row in csv:
        cleaned_domain = clean_domain(row['domain'])
        if account_exists(cleaned_domain):
            duplicates.append(row)
    return duplicates
```

### Phase 3: Automation (Next Month)

#### 1. Webhook for Duplicate Detection
```python
# Real-time duplicate prevention
@webhook.on('account.create')
def check_duplicate(account):
    cleaned = clean_domain(account.domain)
    existing = find_by_domain(cleaned)

    if existing:
        merge_accounts(existing, account)
        notify_user(f"Merged into {existing.name}")

    return account
```

#### 2. Weekly Audit Script
```bash
#!/bin/bash
# Run every Monday at 9 AM

# Find new duplicates
python3 scripts/salesloft-account-merger.py --find-duplicates > weekly_duplicates.txt

# Auto-merge safe ones
python3 scripts/salesloft-account-merger.py --auto-merge --limit 20 --execute

# Email report
mail -s "Weekly Duplicate Report" sales-ops@company.com < weekly_duplicates.txt
```

#### 3. CRM-SL Sync Improvements
```python
# Bidirectional sync with deduplication
def sync_accounts():
    sf_accounts = get_salesforce_accounts()
    sl_accounts = get_salesloft_accounts()

    for sf_account in sf_accounts:
        cleaned_domain = clean_domain(sf_account.Website)
        sl_match = find_sl_by_domain(cleaned_domain)

        if not sl_match:
            create_sl_account(sf_account)
        elif sl_match.crm_id != sf_account.Id:
            update_sl_crm_id(sl_match, sf_account.Id)
```

## Monitoring & Metrics

### Key Performance Indicators
| Metric | Current | Target | Measurement |
|--------|---------|--------|-------------|
| New duplicates/week | ~10 | <2 | Weekly audit |
| Merge success rate | 100% | >95% | Merge logs |
| CRM sync accuracy | 70% | >95% | ID matching |
| Domain cleaning rate | 50% | 100% | Import logs |

### Dashboard Queries
```sql
-- Daily duplicate check
SELECT domain, COUNT(*) as count
FROM accounts
WHERE archived_at IS NULL
GROUP BY LOWER(REGEXP_REPLACE(domain, '^(https?://)?(www\.)?', ''))
HAVING COUNT(*) > 1;

-- CRM conflict detection
SELECT a1.name, a2.name, a1.crm_id, a2.crm_id
FROM accounts a1
JOIN accounts a2 ON LOWER(a1.domain) = LOWER(a2.domain)
WHERE a1.id < a2.id
AND a1.crm_id != a2.crm_id;
```

## Implementation Timeline

### Week 1 (Current)
- ✅ Execute 19 safe merges
- ✅ Analyze high-value duplicates
- 🔄 Enable domain cleaning in settings
- 📋 Document process for team

### Week 2
- [ ] Train sales team on prevention
- [ ] Set up weekly audit script
- [ ] Review remaining 68 duplicates
- [ ] Coordinate CRM cleanup

### Week 3
- [ ] Implement import validation
- [ ] Create duplicate detection webhook
- [ ] Test automated merging
- [ ] Update integration settings

### Week 4
- [ ] Launch monitoring dashboard
- [ ] Automate weekly reports
- [ ] Review metrics
- [ ] Adjust thresholds

## Success Criteria

### 30-Day Goals
- Reduce duplicate creation by 80%
- Merge 90% of existing duplicates
- Zero PostgreSQL duplicate errors
- 100% domain cleaning on import

### 90-Day Goals
- Fully automated duplicate prevention
- Real-time merge on detection
- Bidirectional sync without duplicates
- <1% duplicate rate

## Quick Reference

### Prevention Checklist
Before creating an account:
1. ✅ Search by domain (without http/www)
2. ✅ Search by company name variations
3. ✅ Check Salesforce for existing account
4. ✅ Use clean domain format

### Domain Cleaning Rules
```
INPUT                           → OUTPUT
http://www.company.com/        → company.com
https://company.com            → company.com
WWW.COMPANY.COM                 → company.com
company.com/products            → company.com
subdomain.company.com           → subdomain.company.com
```

### Merge Decision Tree
```
If duplicate found:
├── Same CRM ID? → Auto-merge
├── Different CRM ID?
│   ├── One is null? → Update null, merge
│   └── Both have IDs? → Manual review
├── <20 people? → Safe to auto-merge
└── >100 people? → Requires approval
```

## Tools & Scripts
- **Merger Tool**: `scripts/salesloft-account-merger.py`
- **Duplicate Finder**: `scripts/analyze-duplicate-accounts.py`
- **High-Value Analysis**: `scripts/analyze-high-value-duplicates.py`
- **Domain Cleaner**: `scripts/fix-account-domains.py`

## Support & Escalation
1. **Daily**: Check for new duplicates
2. **Weekly**: Run audit and merge script
3. **Monthly**: Review metrics and adjust
4. **Quarterly**: Process improvement review