# RevOps Report Templates

Pre-built report templates for common B2B SaaS Revenue Operations metrics.

## Available Templates

| Template | Description | KPIs Covered |
|----------|-------------|--------------|
| `arr-mrr-tracking.json` | Revenue metrics over time | ARR, MRR, Growth Rate |
| `nrr-retention.json` | Retention and expansion analysis | NRR, GRR, Churn, Expansion |
| `cac-ltv-analysis.json` | Unit economics deep dive | CAC, LTV, LTV:CAC, Payback |
| `pipeline-coverage.json` | Pipeline health assessment | Coverage, Velocity, Win Rate |
| `sales-velocity.json` | Deal flow and cycle analysis | Velocity, Cycle Length, Deal Size |
| `funnel-conversion.json` | Stage conversion rates | Lead-to-Opp, MQL-to-SQL |

## Template Schema

Each template follows this JSON schema:

```json
{
  "templateMetadata": {
    "id": "unique-template-id",
    "name": "Human Readable Name",
    "version": "1.0.0",
    "description": "What this template reports on",
    "category": "revenue|retention|acquisition|pipeline|funnel",
    "targetAudience": ["executive", "finance", "sales", "ops"]
  },
  "reportMetadata": {
    "defaultTitle": "Default Report Title",
    "defaultPeriod": "Q4|90d|YTD",
    "defaultFormat": "pdf|excel|sheets|csv",
    "defaultSegmentation": ["segment", "region", "rep"]
  },
  "kpis": [
    {
      "id": "KPI_ID",
      "required": true|false,
      "displayOrder": 1,
      "chartType": "line|bar|pie|table"
    }
  ],
  "dataSources": {
    "salesforce": {
      "objects": ["Opportunity", "Account"],
      "requiredFields": ["Amount", "CloseDate"]
    },
    "hubspot": {
      "objects": ["deals", "contacts"],
      "requiredProperties": ["amount", "closedate"]
    }
  },
  "sections": [
    {
      "id": "section-id",
      "title": "Section Title",
      "type": "summary|dashboard|detail|methodology",
      "kpis": ["KPI_ID_1", "KPI_ID_2"]
    }
  ],
  "benchmarks": {
    "industry": "saas",
    "sources": ["KeyBanc 2024", "OpenView"]
  }
}
```

## Usage

### With /generate-report Command

```bash
# Use built-in template by type
/generate-report arr --format pdf

# Specify template explicitly
/generate-report --template ./templates/reports/revops/arr-mrr-tracking.json
```

### Programmatic Usage

```javascript
const { RevOpsKPIKnowledgeBase } = require('../../../scripts/lib/revops-kpi-knowledge-base');
const template = require('./arr-mrr-tracking.json');

const kpiKB = new RevOpsKPIKnowledgeBase();

// Get data requirements for template
const requirements = template.kpis.map(kpi =>
  kpiKB.getDataRequirements(kpi.id, 'salesforce')
);

// Generate SOQL queries
const queries = template.kpis.map(kpi =>
  kpiKB.generateSOQLTemplate(kpi.id, { startDate, endDate })
);
```

## Customizing Templates

### Adding New KPIs

1. Add KPI definition to `config/revops-kpi-definitions.json`
2. Reference KPI in template's `kpis` array
3. Add to appropriate section

### Creating New Templates

1. Copy an existing template
2. Update `templateMetadata` with unique ID
3. Modify `kpis` array for desired metrics
4. Adjust `sections` for report structure
5. Update `dataSources` for data requirements

### Template Validation

```bash
# Validate template structure
node scripts/lib/validate-template.js ./templates/reports/revops/my-template.json
```

## Section Types

| Type | Description | Use For |
|------|-------------|---------|
| `summary` | Executive summary with BLUF | Opening page |
| `dashboard` | KPI cards with traffic lights | Overview |
| `detail` | Data tables with breakdown | Analysis |
| `chart` | Visualizations | Trends |
| `comparison` | Benchmark comparisons | Context |
| `methodology` | Data sources and formulas | Transparency |

## Chart Types

| Type | Best For | KPI Examples |
|------|----------|--------------|
| `line` | Trends over time | ARR, MRR, NRR |
| `bar` | Comparisons | Segment revenue |
| `stacked_bar` | Part-to-whole over time | Revenue mix |
| `pie` | Distribution | Revenue by segment |
| `table` | Detailed data | Rep performance |
| `gauge` | Single metric health | NRR, Win Rate |
| `funnel` | Conversion flow | Lead → Opp → Close |

## Version History

- **v1.0.0** (2024-12) - Initial release with 6 templates
