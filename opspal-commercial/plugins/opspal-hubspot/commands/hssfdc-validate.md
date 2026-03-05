---
description: Validate existing SFDC sync field mapping CSVs
argument-hint: "[portal-name]"
---

Validate SFDC field mapping CSV files without re-scraping. Checks field counts, sync rules, and required fields.

**Usage:**
```bash
/hssfdc-validate [portal-name]
```

**What it validates:**
1. CSV file structure and format
2. Field counts against expected ranges
3. Sync rule distribution (Two-way, Prefer SF, Always SF percentages)
4. Required fields presence (identifiers, owners)

**Arguments:**
- `portal-name` - Portal to validate (e.g., `example-company`, `demo-company`, `acme-corp`)
  - If omitted, uses `$HUBSPOT_ACTIVE_PORTAL`

**Examples:**
```bash
/hssfdc-validate example-company
/hssfdc-validate acme-corp
/hssfdc-validate  # uses active portal
```

**Expected outputs:**
- ✅ All validations passed
- ⚠️  Warning (deviation from baseline but within acceptable range)
- ❌ Validation failed

**Validation criteria:**

**Field Counts:**
- Contact: 100-200 fields (baseline: 142)
- Company: 300-450 fields (baseline: 366)
- Deal: 300-450 fields (baseline: 352)

**Sync Rules:**
- Two-way: 10-20%
- Prefer Salesforce unless blank: 75-90%
- Always use Salesforce: 0-10%

**Required Files:**
- `instances/{portal}/*_CONTACT_field_mappings.csv`
- `instances/{portal}/*_COMPANY_field_mappings.csv`
- `instances/{portal}/*_DEAL_field_mappings.csv`

**Use cases:**
- Verify CSV files after manual scrape
- Check data quality before analysis
- Validate field mappings after sync changes
- Audit existing field mapping data

**Exit codes:**
- 0: All validations passed
- 1: One or more validations failed
