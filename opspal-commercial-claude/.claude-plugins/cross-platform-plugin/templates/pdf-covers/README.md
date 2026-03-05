# PDF Cover Templates

Location: `templates/pdf-covers/`

Use these templates with:

```js
const PDFGenerator = require('../scripts/lib/pdf-generator');
const generator = new PDFGenerator({ theme: 'revpal' });

await generator.collate(docs, outputPath, {
  coverPage: { template: 'salesforce-audit' },
  metadata: {
    title: 'ACME Automation Audit',
    org: 'ACME Corp',
    date: '2025-12-30',
    version: '1.0'
  }
});
```

## Available Templates

- `salesforce-audit` - Salesforce automation audit reports
- `security-audit` - Security/compliance audit reports
- `executive-report` - Executive summaries and leadership briefs
- `hubspot-assessment` - HubSpot portal assessments
- `data-quality` - Data quality and governance reviews
- `gtm-planning` - Go-to-market planning reports
- `cross-platform-integration` - Multi-platform integration and implementation docs
- `default` - Generic professional cover page

## Supported Metadata

These templates accept shared metadata keys. Unused fields are ignored.

- `title` - Report title
- `org` - Organization name
- `date` - Report date (YYYY-MM-DD)
- `version` - Report version
- `author` - Author or team name
- `subtitle` - Optional subtitle
- `reportType` - Report category label
- `period` - Reporting period (executive reports)
- `assessmentType` - Assessment type (HubSpot)
- `sandboxName` - Environment label (Salesforce)
- `scope` - Scope summary (Salesforce)
- `classification` - Confidentiality label
- `logoPath` - Base64 data URI (auto-injected when logo is available)
