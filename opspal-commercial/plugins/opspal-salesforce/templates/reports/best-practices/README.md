# Best Practice Report Templates

This directory contains **100% instance-agnostic** report templates derived from proven patterns across multiple Salesforce implementations.

## Template Naming Convention

All templates use the `bp-` prefix (Best Practice) to indicate they are:
- **Anonymized** - No personal names, company names, or org-specific identifiers
- **Portable** - Designed to work across different Salesforce configurations
- **Variation-aware** - Support multiple deployment scenarios (standard, CPQ, enterprise)

## Directory Structure

```
best-practices/
├── sales/
│   ├── executive/       # CRO, VP Sales, Directors
│   ├── manager/         # Sales Managers, Team Leads
│   └── individual/      # Sales Reps
├── marketing/
│   ├── executive/       # CMO, VP Marketing
│   ├── manager/         # Marketing Managers
│   └── individual/      # Marketing Specialists
└── customer-success/
    ├── executive/       # CCO, VP CS
    ├── manager/         # CS Managers
    └── individual/      # CSMs
```

## Template Schema

Each template includes:

### templateMetadata
```json
{
  "templateId": "bp-sales-pipeline-coverage",
  "templateName": "Best Practice: Pipeline Coverage",
  "templateVersion": "1.0",
  "description": "...",
  "audience": "Executive leadership",
  "function": "sales",
  "level": "executive",
  "useCase": "...",
  "tags": ["best-practice", "sales", "pipeline"]
}
```

### variations
Supports different deployment scenarios:
- **simple** - Reduced fields for quick deployment
- **standard** - Full template as designed
- **cpq** - Salesforce CPQ field substitutions
- **enterprise** - Higher value thresholds for enterprise

### orgAdaptation
Field resolution and fallback configuration:
```json
{
  "requiredFields": ["Amount", "StageName"],
  "optionalFields": ["Custom_Field__c"],
  "minimumFidelity": 0.7,
  "fieldFallbacks": {
    "Amount": {
      "patterns": ["Amount", "Pipeline_Value__c"],
      "cpqPatterns": ["SBQQ__NetAmount__c"],
      "dataType": "currency"
    }
  }
}
```

### reportMetadata
Standard Salesforce Analytics API metadata for report creation.

## Usage

### Deploy via CLI
```bash
node scripts/lib/report-template-deployer.js \
  --template best-practices/sales/executive/bp-sales-pipeline-coverage.json \
  --org my-org \
  --variation standard
```

### Deploy via Agent
```
Task(
  subagent_type='opspal-salesforce:sfdc-reports-dashboards',
  prompt='Deploy bp-sales-pipeline-coverage template to production org with CPQ variation'
)
```

## Portability Scores

Templates are rated by portability (percentage of standard fields):
- **90%+** - Highly portable, minimal adaptation needed
- **70-90%** - Portable with field fallbacks
- **<70%** - May require significant customization

## Adding New Templates

1. **Extract** - Use `user-reports-extractor.js` to extract from existing org
2. **Anonymize** - Remove ALL personal/company identifiers
3. **Validate** - Run schema validation
4. **Register** - Add to `dashboard-template-registry.json`

### Anonymization Requirements

Templates MUST NOT contain:
- Creator names (e.g., "Rachel Chu", "John Smith")
- Company names (e.g., "Acme Corp", client names)
- Org-specific IDs or aliases
- Personal initials in IDs (e.g., "rc-", "js-")

### Extraction Command
```bash
node scripts/lib/user-reports-extractor.js \
  --org source-org \
  --user "Full Name" \
  --output ./templates/reports/best-practices
```

## Related Documentation

- [Template Variations Guide](../../docs/TEMPLATE_VARIATIONS_GUIDE.md)
- [Report Template Deployer](../../scripts/lib/report-template-deployer.js)
- [Dashboard Template Registry](../../templates/dashboards/dashboard-template-registry.json)

---
*All templates in this directory are anonymized and do not contain any source attribution.*
