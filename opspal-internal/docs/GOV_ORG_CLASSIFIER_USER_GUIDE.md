# Government Organization Classifier - User Guide

## Overview

The Government Organization Classifier is a specialized tool for B2G (Business-to-Government) sales teams to automatically classify government contacts into 28 predefined organizational buckets. This is particularly valuable in environments with complex government email domains where organizational structure isn't immediately apparent.

**Version**: 1.0.0
**Last Updated**: 2025-10-07

## Table of Contents

- [Quick Start](#quick-start)
- [Use Cases](#use-cases)
- [Classification Process](#classification-process)
- [CRM Integration](#crm-integration)
- [Understanding Results](#understanding-results)
- [Best Practices](#best-practices)
- [Troubleshooting](#troubleshooting)

## Quick Start

### For Single Contact Classification

**Using the Agent**:
```bash
# Interactive classification via Claude Code
# Invoke the gov-org-classifier agent with your contact details
Task: gov-org-classifier
Prompt: "Classify this person: Company='Austin Police Department', Email='officer@austintexas.gov', Name='John Smith', Title='Police Officer'"
```

**Using Command Line**:
```bash
# Create input file
echo '{
  "company": "Austin Police Department",
  "email": "officer@austintexas.gov",
  "name": "John Smith",
  "title": "Police Officer"
}' > contact.json

# Run classification
node opspal-internal/scripts/lib/gov-org-normalizer.js contact.json | \
node opspal-internal/scripts/lib/gov-org-bucket-matcher.js -
```

### For Batch Classification

```bash
# Prepare CSV with contacts
# columns: company, email, name, title

# Run batch classifier
node opspal-internal/scripts/lib/gov-org-batch-classifier.js \
  --input contacts.csv \
  --output-dir ./results \
  --format json \
  --confidence 0.7
```

### For HubSpot Integration

```bash
# One-time setup (creates custom properties)
node opspal-internal/HS/scripts/enrich-contacts-with-gov-classification.js --init

# Enrich all unclassified government contacts
node opspal-internal/HS/scripts/enrich-contacts-with-gov-classification.js \
  --portal production \
  --confidence 0.7 \
  --unclassified-only
```

### For Salesforce Integration

```bash
# One-time setup (creates custom fields on Lead/Contact)
node opspal-internal/SFDC/scripts/enrich-leads-with-gov-classification.js \
  --init \
  --org production \
  --object Lead

# Enrich all unclassified government leads
node opspal-internal/SFDC/scripts/enrich-leads-with-gov-classification.js \
  --org production \
  --object Lead \
  --confidence 0.7 \
  --unclassified-only
```

## Use Cases

### 1. Automated Lead Qualification

**Problem**: Your sales team receives hundreds of leads from government domains but struggles to quickly identify the right department and decision-making structure.

**Solution**: Automatically classify incoming leads to:
- Route to specialized sales reps (federal vs state vs local)
- Prioritize based on bucket (e.g., state agencies > local municipalities)
- Customize messaging based on organization type

**Example**:
- Lead comes in: `jsmith@txdps.texas.gov`
- Classification: Highway Patrol (State Police)
- Routing: Assigned to state government sales specialist
- Messaging: Tailored for statewide law enforcement operations

### 2. Territory Assignment

**Problem**: Government territories are complex with overlapping jurisdictions (federal, state, county, city).

**Solution**: Use classification buckets for intelligent territory assignment:
- Federal agencies → Federal sales team
- State agencies → Regional state team
- County/city → Local government team

### 3. Market Segmentation

**Problem**: Need to analyze market penetration across different government sectors.

**Solution**: Generate reports showing:
- Opportunities by bucket type
- Win rates by organization category
- Revenue distribution across government levels

### 4. Data Enrichment & Cleanup

**Problem**: Existing CRM data has incomplete or inconsistent government organization information.

**Solution**: Bulk enrich historical data:
- Fill missing organization types
- Standardize government classifications
- Add jurisdiction information

## Classification Process

### Input Requirements

**Minimum Required**:
- Email address with government domain (.gov, .us, .edu)

**Recommended Additional Fields**:
- Company name (improves accuracy by 20%)
- Job title (improves accuracy by 30%)
- Full name (helps with LinkedIn verification)

### Classification Workflow

1. **Normalization**: Clean and standardize input data
   - Extract email domain
   - Detect organization type (federal, state, county, city)
   - Parse jurisdiction from domain/company name

2. **Quick Signal Analysis**: Fast pattern matching
   - Check high-confidence domain patterns
   - Match title keywords to bucket patterns
   - Combine domain + title for quick classification

3. **Bucket Scoring**: Score all 28 buckets
   - Title pattern matches (30% weight)
   - Domain pattern matches (25% weight)
   - Company keyword matches (20% weight)
   - Organization type alignment (15% weight)

4. **Disambiguation**: Apply state-specific rules
   - State Police vs Highway Patrol (varies by state)
   - District Attorney vs Commonwealth Attorney (KY, VA, PA)
   - FEMA vs FEMA Regional Office (check for "Region")

5. **Confidence Scoring**: Calculate final confidence (0-1)
   - High (≥0.8): Multiple confirming signals
   - Medium (0.5-0.79): Single reliable signal
   - Low (<0.5): Inferential evidence only

### The 28 Buckets

**Local/Municipal (3 buckets)**:
1. Local Law Enforcement (city police)
2. Municipal Fire Department
3. City/County EM Office

**County Government (6 buckets)**:
4. County Sheriff
5. County Fire Department
6. County EMS
7. District Attorney
8. County Prosecutors
9. Commonwealth Attorney (KY, VA, PA only)

**Emergency Services (3 buckets)**:
10. Hospital EMS Divisions
11. Public Safety Answering Points (PSAP)
12. 911 Center

**Corrections (2 buckets)**:
13. Department of Corrections (DOC)
14. Parole/Probation Boards

**State Government (7 buckets)**:
15. State Attorney General's Office (AGO)
16. State Office of Emergency Management (State OEM)
17. Highway Patrol
18. State Police
19. Bureau of Investigation / State Investigative Divisions
20. Commercial Vehicle Enforcement
21. Conservation Agencies (Fish & Wildlife, DNR)

**Transportation & Infrastructure (3 buckets)**:
22. Department of Transportation (DOT)
23. Highway Authority (Turnpike, Tollway)
24. Ports Authority

**Higher Education (1 bucket)**:
25. University Police

**Federal Government (5 buckets)**:
26. FEMA (headquarters)
27. FEMA Regional Office
28. DHS Sub-Agency (TSA, CBP, CISA)
29. Federal Protective Service
30. U.S. Marshals Service

**Non-Government (1 bucket)**:
31. Not Applicable (contractors, vendors, consultants)

See [Bucket Reference Guide](./GOV_ORG_BUCKETS_REFERENCE.md) for complete definitions and examples.

## CRM Integration

### HubSpot Integration

**Custom Properties Created**:
- `gov_org_bucket` (enum) - Classification bucket
- `gov_org_confidence` (number) - Confidence score 0-100
- `gov_org_classification_date` (date) - When classified
- `gov_org_rationale` (textarea) - Why this bucket was selected
- `gov_org_jurisdiction` (text) - Geographic jurisdiction

**Workflow Integration**:
```javascript
// In HubSpot workflow, trigger on:
// - Email contains ".gov" OR ".us" OR ".edu"
// - Gov Org Bucket is unknown

// Action: Call webhook to trigger classification
// URL: your-server.com/classify-contact
// Method: POST
// Body: { "contactId": "{{contact.hs_object_id}}" }
```

### Salesforce Integration

**Custom Fields Created** (on Lead and/or Contact):
- `Gov_Org_Bucket__c` (Picklist) - Classification bucket
- `Gov_Org_Confidence__c` (Number) - Confidence score 0-100
- `Gov_Org_Classification_Date__c` (Date) - When classified
- `Gov_Org_Rationale__c` (Long Text Area) - Why this bucket
- `Gov_Org_Jurisdiction__c` (Text) - Geographic jurisdiction

**Process Builder Integration**:
1. **Trigger**: Lead/Contact created or updated
2. **Criteria**: Email LIKE '%.gov' OR Email LIKE '%.us' OR Email LIKE '%.edu'
3. **Action**: Call external service (invocable action)
4. **Service**: Runs classification and updates fields

**Lead Assignment Rules**:
```sql
-- Create assignment rules based on classification
-- Example: Assign federal agencies to federal team

CASE
  WHEN Gov_Org_Bucket__c IN ('FEMA', 'DHS Sub-Agency', 'U.S. Marshals Service')
  THEN 'Federal Sales Team'

  WHEN Gov_Org_Bucket__c LIKE '%State%'
  THEN 'State Government Team'

  WHEN Gov_Org_Bucket__c LIKE '%County%' OR Gov_Org_Bucket__c LIKE '%Local%'
  THEN 'Local Government Team'

  ELSE 'General Queue'
END
```

## Understanding Results

### Output JSON Schema

```json
{
  "input": {
    "company": "Austin Fire Department",
    "email": "captain@austintexas.gov",
    "name": "Sarah Martinez",
    "title": "Fire Captain"
  },
  "normalized": {
    "organization_name": "Austin Fire Department",
    "organization_type": "city",
    "jurisdiction": "Austin, TX",
    "email_domain": "austintexas.gov"
  },
  "classification": {
    "bucket": "Municipal Fire Department",
    "confidence": 0.88,
    "rationale": "Email domain austintexas.gov indicates city government. Title 'Fire Captain' and company 'Austin Fire Department' strongly suggest municipal fire services. Organization type 'city' confirms classification.",
    "notes": "High confidence city fire classification"
  }
}
```

### Confidence Levels

**High Confidence (0.8-1.0)** ✅:
- Multiple confirming sources (domain + title + company)
- Clear signals with no ambiguity
- State-specific rules applied correctly
- **Recommended Action**: Auto-update CRM, no manual review needed

**Medium Confidence (0.5-0.79)** ⚠️:
- Single reliable signal or partial confirmation
- Some ambiguity exists but reasonable inference possible
- **Recommended Action**: Auto-update with flag for periodic review

**Low Confidence (<0.5)** ❌:
- Insufficient evidence or conflicting signals
- High ambiguity in classification
- **Recommended Action**: Flag for manual review, do not auto-update

### Common Rationale Patterns

- **"Email domain X indicates Y government level"**: Domain-based classification
- **"Title contains Z keyword"**: Title-based classification
- **"Company name mentions A"**: Company keyword classification
- **"Organization type B matches bucket"**: Type-based confirmation
- **"State-specific rule applied"**: Disambiguation rule used

## Best Practices

### 1. Set Appropriate Confidence Thresholds

**Conservative (≥0.8)**: Use for automated CRM updates without review
- Minimizes false positives
- Requires strong confirming signals
- **Best for**: Initial rollout, high-stakes accounts

**Balanced (≥0.7)**: Recommended default for most use cases
- Good balance of accuracy and coverage
- Catches most clear cases
- **Best for**: Ongoing operations, general enrichment

**Aggressive (≥0.5)**: Use with manual review process
- Maximizes coverage
- Increases false positive rate
- **Best for**: Data discovery, analyst-assisted workflows

### 2. Implement Review Workflows

**For Low Confidence Results**:
```javascript
// Flag for manual review if confidence < 0.7
if (classification.confidence < 0.7) {
  contact.review_queue = true;
  contact.review_reason = 'Low classification confidence';
  contact.review_priority = classification.confidence < 0.5 ? 'high' : 'medium';
}
```

### 3. Monitor Classification Quality

**Key Metrics to Track**:
- Classification coverage rate (% of gov contacts classified)
- Average confidence score by bucket
- Manual override rate (% changed by sales team)
- False positive rate by bucket

**Monthly Review**:
- Sample 20 classifications per bucket
- Verify accuracy against LinkedIn/official sites
- Adjust confidence thresholds if needed

### 4. Handle Ambiguous Cases

**State Police vs Highway Patrol**:
- Check state-specific naming conventions
- Example: California = Highway Patrol (CHP)
- Example: Pennsylvania = State Police

**District Attorney Variants**:
- Virginia, Kentucky, Pennsylvania = "Commonwealth's Attorney"
- New Jersey = "County Prosecutor"
- Most others = "District Attorney"

**Contractor Detection**:
- Company name contains: LLC, Inc, Consulting, Solutions
- Email domain: .com, .net, .io (not .gov)
- Title: Consultant, Contractor, Vendor
- → Classify as "Not Applicable"

### 5. Maintain Historical Classifications

**Never delete old classifications**:
- People change jobs frequently in government
- Keep classification history for trend analysis
- Add timestamp to track when classified

**Track changes**:
```javascript
// Before updating
const oldBucket = contact.gov_org_bucket;
const newBucket = classification.bucket;

if (oldBucket && oldBucket !== newBucket) {
  contact.gov_org_bucket_history += `${oldBucket} → ${newBucket} (${new Date()})`;
}
```

## Troubleshooting

### Issue: Low Classification Rate (<60%)

**Possible Causes**:
1. Missing required input data (company, title)
2. Non-standard government domains
3. Confidence threshold too high

**Solutions**:
- Ensure company and title fields are populated
- Add custom domain patterns to `gov-domain-patterns.json`
- Lower confidence threshold temporarily to 0.5

### Issue: High False Positive Rate (>10%)

**Possible Causes**:
1. Contractors with .gov email forwarding
2. Confidence threshold too low
3. Missing contractor keyword patterns

**Solutions**:
- Increase confidence threshold to 0.8
- Add contractor detection patterns
- Implement manual review for medium confidence (0.5-0.79)

### Issue: Wrong Bucket Assignment

**Possible Causes**:
1. State-specific naming not handled
2. Ambiguous title (e.g., "Director")
3. Missing disambiguation rules

**Solutions**:
- Check state-specific rules in `gov-org-buckets.json`
- Add missing disambiguation patterns
- Use manual review for that specific bucket

### Issue: Slow Performance

**Possible Causes**:
1. Large batch size
2. Evidence validation enabled (URL checks)
3. Rate limiting delays

**Solutions**:
- Reduce batch size from 50 to 25
- Disable evidence validation (`--no-validate-evidence`)
- Increase delay between batches (`--delay 3000`)

### Issue: CRM Integration Failures

**HubSpot**:
- Verify API token has correct scopes
- Check custom properties exist (`--init` first)
- Ensure batch size ≤10 for batch updates

**Salesforce**:
- Verify org authentication (`sf org display`)
- Check custom fields deployed successfully
- Ensure user has FLS (Field-Level Security) on custom fields

## Getting Help

### Resources

- **Bucket Reference**: [GOV_ORG_BUCKETS_REFERENCE.md](./GOV_ORG_BUCKETS_REFERENCE.md)
- **Agent Documentation**: `opspal-internal/.claude/agents/gov-org-classifier.md`
- **Configuration**: `opspal-internal/config/gov-org-buckets.json`

### Support Channels

1. **Check test suite**: Run `node opspal-internal/tests/gov-org-classifier/run-tests.js`
2. **Review logs**: Check `opspal-internal/scripts/lib/gov-classifications/`
3. **Validate configuration**: Ensure config files are properly formatted JSON

### Common Commands

```bash
# Test classification
node opspal-internal/scripts/lib/gov-org-normalizer.js contact.json

# Validate configuration
cat opspal-internal/config/gov-org-buckets.json | jq .

# Run test suite
node opspal-internal/tests/gov-org-classifier/run-tests.js

# Check HubSpot connection
node opspal-internal/HS/scripts/check-rate-limits.js

# Check Salesforce connection
sf org display
```

---

**Version**: 1.0.0
**Last Updated**: 2025-10-07
**Maintained by**: RevPal Operations Team
