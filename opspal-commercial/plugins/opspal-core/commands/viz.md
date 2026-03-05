---
name: viz
aliases: [visualize, dashboard, web-viz]
description: Generate interactive web dashboards with charts, tables, maps, and pre-built templates
argument-hint: "template create sales-pipeline --demo"
---

# /viz Command

Create and manage interactive web visualizations for data from Salesforce, HubSpot, or local files. Includes pre-built RevOps dashboard templates.

## Quick Start

```bash
# Create from template (fastest)
/viz template create sales-pipeline --demo

# Create new blank dashboard
/viz new "Dashboard Title"

# List available templates
/viz template list
```

## Template Commands

### List Templates
```bash
/viz template list              # List all templates
/viz template list --category sales  # Filter by category
```

### Template Info
```bash
/viz template info sales-pipeline    # Show template details
/viz template info data-quality      # Components, data sources, etc.
```

### Create from Template
```bash
# With demo data (no org connection needed)
/viz template create sales-pipeline --demo

# With live Salesforce data
/viz template create sales-pipeline --org production

# With live HubSpot data
/viz template create sales-pipeline --platform hubspot

# With filters
/viz template create executive-summary --org production --filter "timePeriod=this-quarter"

# Custom output path
/viz template create data-quality --demo --output ./reports/data-quality.html
```

## Available Templates

| Template | Description | Platforms |
|----------|-------------|-----------|
| `sales-pipeline` | Pipeline health, stage distribution, opportunity tracking | SF, HS |
| `territory-planning` | Geographic coverage, workload balance, whitespace | SF |
| `automation-audit` | Flow/trigger inventory, conflicts, dependencies | SF, HS |
| `automation-diagnostics` | Error monitoring, performance, alerts | SF |
| `data-quality` | Completeness scores, duplicates, hygiene | SF, HS |
| `executive-summary` | Revenue KPIs, quota attainment, forecasts | SF, HS |
| `process-documentation` | Process flows, system diagrams, step details | SF, HS |

## Custom Dashboard Commands

### Create Dashboard
```bash
# Create new dashboard
/viz new "Dashboard Title"

# Create with initial chart
/viz new "Sales Dashboard" --chart bar --data salesforce --query "SELECT Region, SUM(Amount) FROM Opportunity GROUP BY Region"
```

### Session Management
```bash
# List existing dashboards
/viz list

# Resume existing session
/viz resume <session-id>

# Export current dashboard to static HTML
/viz export [--output path/to/file.html]

# Start dev server for live updates
/viz serve [--port 3847]

# Stop dev server
/viz stop
```

## Quick Examples

### Simple Bar Chart
```bash
/viz new "Revenue by Region" --chart bar --data salesforce --object Opportunity --group-by Region__c --aggregate SUM(Amount)
```

### Data Table
```bash
/viz new "Open Opportunities" --table --data salesforce --query "SELECT Name, Amount, StageName FROM Opportunity WHERE IsClosed = false LIMIT 50"
```

### From CSV File
```bash
/viz new "Sales Report" --chart line --data file --path ./data/monthly_sales.csv --label-field month --value-field revenue
```

### KPI Dashboard
```bash
/viz new "Key Metrics"
# Then conversationally add KPIs:
# "Add a KPI showing total pipeline value"
# "Add a KPI showing average deal size"
# "Add a KPI showing win rate"
```

## Options

| Option | Description |
|--------|-------------|
| `--chart <type>` | Chart type: bar, line, pie, doughnut, scatter, funnel |
| `--table` | Create a data table |
| `--map <type>` | Map type: markers, heatmap, territory, choropleth |
| `--kpi` | Create KPI card |
| `--gauge` | Create gauge visualization |
| `--flow` | Create flow diagram (Mermaid) |
| `--data <source>` | Data source: salesforce, hubspot, file |
| `--query <soql>` | SOQL/HQL query string |
| `--object <name>` | Object to query (Opportunity, Account, etc.) |
| `--group-by <field>` | Field to group by |
| `--aggregate <expr>` | Aggregation: SUM(Amount), COUNT(Id), AVG(Amount) |
| `--path <file>` | Path to CSV/JSON file |
| `--output <path>` | Output path for HTML export |
| `--port <number>` | Dev server port (default: 3847) |
| `--theme <name>` | Theme: revpal (default), dark |
| `--demo` | Use demo data (templates only) |
| `--org <alias>` | Salesforce org alias |
| `--platform <name>` | Platform: salesforce, hubspot |
| `--filter <expr>` | Filter expression (key=value) |

## Conversational Mode

After creating a dashboard (from template or blank), you can make changes conversationally:

```
You: /viz template create sales-pipeline --demo
Bot: Created Sales Pipeline Dashboard with demo data. What would you like to modify?

You: Show only Negotiation and Proposal stages
Bot: [Updates charts and tables to filter stages]

You: Add a gauge showing win rate
Bot: [Adds gauge component]

You: Export this
Bot: [Generates static HTML file]
```

Or from blank:

```
You: /viz new "Q4 Analysis"
Bot: Created dashboard "Q4 Analysis". What would you like to visualize?

You: Show me sales by stage
Bot: [Creates bar chart of sales by stage]

You: Filter to just Q4
Bot: [Updates chart with Q4 filter]

You: Add a table showing top 10 deals
Bot: [Adds table component]
```

## Output Modes

### Static HTML (Default)
- Self-contained HTML file with embedded data
- Auto-served via HTTP to avoid CORS issues
- Can be opened directly in browser
- Shareable via email/Slack

### Dev Server
- Real-time updates via WebSocket
- Hot-reload on data changes
- Best for iterative development
- Requires `npm install express ws`

## Data Sources

### Salesforce
```bash
/viz new "Pipeline" --data salesforce --org production --query "SELECT..."
```

### HubSpot
```bash
/viz new "Deals" --data hubspot --object deals --properties dealname,amount,dealstage
```

### Local Files
```bash
# CSV
/viz new "Report" --data file --path ./data/report.csv

# JSON
/viz new "Report" --data file --path ./data/report.json --data-path results.items
```

### Demo Data (Templates)
```bash
/viz template create automation-audit --demo
```

## Template Categories

### Sales & Pipeline
- `sales-pipeline` - Pipeline health, stage funnel, top opportunities
- `territory-planning` - Geographic coverage, workload balance

### Operations & Admin
- `automation-audit` - Inventory, conflicts, dependencies
- `automation-diagnostics` - Errors, performance, alerts (SF only)
- `data-quality` - Completeness, duplicates, hygiene scores

### Executive
- `executive-summary` - Revenue KPIs, quota attainment, forecasts

### Documentation
- `process-documentation` - Process flows, system diagrams

## Components Available

| Component | Description | Use Case |
|-----------|-------------|----------|
| Chart | Bar, line, pie, doughnut, scatter, funnel | Trends, distributions |
| Table | Sortable, filterable, paginated | Record lists |
| KPI | Single metric with trend | Key numbers |
| Gauge | Semicircle gauge | Scores, percentages |
| Map | Markers, heatmap, choropleth | Geographic data |
| FlowDiagram | Mermaid-based | Process flows, dependencies |

## Session Management

Dashboards are saved in `./dashboards/{session-id}/`:
- `.dashboard-state.json` - State and configuration
- `dashboard.html` - Generated HTML (when exported)

List sessions:
```bash
/viz list
```

Resume session:
```bash
/viz resume session_abc123
```

## Programmatic Usage

```javascript
const { fromTemplate, listTemplates } = require('./scripts/lib/web-viz');

// List templates
const templates = await listTemplates();

// Create from template
const builder = await fromTemplate('sales-pipeline');
builder.useDemo(true);
builder.setTheme('revpal');
const dashboard = await builder.build();
await dashboard.generateStaticHTML('./output/pipeline.html');
```

## Troubleshooting

**"Dev server dependencies missing"**
```bash
cd .claude-plugins/opspal-core
npm install express ws --save
```

**"No data returned"**
- Check your query syntax
- Verify field API names
- Check org permissions
- Try `--demo` flag to test with sample data

**"Port already in use"**
```bash
/viz serve --port 3848
```

**"Template not found"**
```bash
/viz template list  # See available templates
```

## Related Commands

- `/diagram` - Generate Mermaid diagrams
- `/pdf` - Generate PDF reports
- `/opspal-salesforce:sfdc-reports-dashboards` - Create Salesforce native dashboards
