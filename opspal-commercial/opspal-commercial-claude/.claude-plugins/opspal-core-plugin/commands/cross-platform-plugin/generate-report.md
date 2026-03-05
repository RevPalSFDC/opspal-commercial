---
name: generate-report
description: Generate a professional PDF report from markdown content using the centralized ReportService
argument-hint: "--type <type> --org <org> --file <path> [--title <title>] [--bluf]"
visibility: user-invocable
tags:
  - report
  - pdf
  - documentation
  - assessment
---

# /generate-report Command

Generate professional PDF reports using the centralized ReportService. All reports include RevPal branding, cover pages, table of contents, and consistent styling.

## Usage

```bash
# Generate a report
/generate-report --type revops-audit --org acme --file ./report.md

# With custom title
/generate-report --type cpq-assessment --org hivemq --file ./analysis.md --title "CPQ Configuration Assessment"

# Include BLUF+4 executive summary
/generate-report --type automation-audit --org acme --file ./audit.md --bluf

# List available report types
/generate-report --list-types

# List recent reports
/generate-report --list-reports --org acme
```

## Arguments

| Argument | Description | Required |
|----------|-------------|----------|
| `--type` | Report type (revops-audit, cpq-assessment, etc.) | Yes |
| `--org` | Organization/instance name | Yes |
| `--file` | Path to markdown file | Yes |
| `--title` | Custom report title | No |
| `--bluf` | Include BLUF+4 executive summary | No |
| `--list-types` | Show available report types | No |
| `--list-reports` | Show recent reports for org | No |

## Available Report Types

### Salesforce
- `revops-audit` - RevOps Assessment Report
- `cpq-assessment` - CPQ Configuration Assessment
- `automation-audit` - Automation Audit Report
- `flow-diagnostic` - Flow Diagnostic Report
- `metadata-analysis` - Metadata Analysis Report
- `security-audit` - Security Audit Report
- `permission-analysis` - Permission Set Analysis
- `data-quality` - Data Quality Assessment

### HubSpot
- `hubspot-audit` - HubSpot Assessment Report
- `hubspot-workflow` - Workflow Analysis Report

### Cross-Platform
- `executive-summary` - Executive Summary Report
- `integration-review` - Integration Review Report
- `gtm-planning` - GTM Planning Report
- `uat-results` - UAT Test Results

## Implementation

When this command is invoked:

```javascript
const ReportService = require('./scripts/lib/report-service.js');

// Parse arguments from command
const args = commandArgs;

// List types
if (args.includes('--list-types')) {
  const types = ReportService.getReportTypes();
  console.log('\n## Available Report Types\n');
  types.forEach(t => {
    console.log(`- **${t.type}** (${t.platform}): ${t.description}`);
  });
  return;
}

// List reports
if (args.includes('--list-reports')) {
  const orgIdx = args.indexOf('--org');
  const org = orgIdx > -1 ? args[orgIdx + 1] : null;
  const reports = ReportService.listReports({ org, limit: 10 });
  console.log('\n## Recent Reports\n');
  reports.forEach(r => {
    console.log(`- **${r.id}** | ${r.generatedAt.split('T')[0]} | ${r.type} | ${r.title}`);
    console.log(`  Path: ${r.pdfPath}`);
  });
  return;
}

// Generate report
const typeIdx = args.indexOf('--type');
const orgIdx = args.indexOf('--org');
const fileIdx = args.indexOf('--file');
const titleIdx = args.indexOf('--title');

if (typeIdx === -1 || orgIdx === -1 || fileIdx === -1) {
  console.error('Required: --type, --org, and --file');
  return;
}

const result = await ReportService.generate({
  type: args[typeIdx + 1],
  org: args[orgIdx + 1],
  markdownPath: args[fileIdx + 1],
  title: titleIdx > -1 ? args[titleIdx + 1] : undefined,
  includeBLUF: args.includes('--bluf'),
  verbose: true
});

console.log(`\n✅ Report generated successfully!`);
console.log(`   PDF: ${result.pdfPath}`);
console.log(`   Registry ID: ${result.registry.id}`);
```

## Output Structure

Reports are saved to:
```
instances/{platform}/{org}/reports/{type}/{date}/
├── {title}-{date}.pdf
├── {title}.md
└── EXECUTIVE_SUMMARY.md  (if --bluf)
```

## Features Included

- RevPal branding and logo
- Cover page with org metadata
- Auto-generated table of contents
- Header/footer with page numbers
- Mermaid diagram rendering
- Print-optimized styling
- Report registry tracking
