# Web Visualization System - Comprehensive Catalog

**Version**: 1.0.0
**Last Updated**: 2026-01-05
**Location**: `opspal-core/scripts/lib/web-viz/`

---

## Overview

The Web Visualization System provides interactive dashboard generation for RevOps use cases. It supports multiple chart types, data tables, maps, KPI cards, and specialized compensation planning components. All dashboards use consistent RevPal branding.

---

## 1. Dashboard Templates (10 Total)

### Sales Category

| Template ID | Name | Description | Platforms | Status |
|------------|------|-------------|-----------|--------|
| `sales-pipeline` | Sales Pipeline Dashboard | Pipeline health, stage distribution, opportunity tracking | SF, HS | ✅ Complete |
| `territory-planning` | Territory Planning Dashboard | Geographic coverage, territory metrics, workload balancing | SF | ✅ Complete |

### Operations Category

| Template ID | Name | Description | Platforms | Status |
|------------|------|-------------|-----------|--------|
| `automation-audit` | Automation Audit Dashboard | Inventory/health of Flows, Triggers, Workflows | SF, HS | ✅ Complete |
| `automation-diagnostics` | Automation Diagnostics Dashboard | Real-time error monitoring, performance tracking | SF | ✅ Complete |
| `data-quality` | Data Quality Dashboard | Completeness, duplicates, hygiene scoring | SF, HS | ✅ Complete |

### Executive Category

| Template ID | Name | Description | Platforms | Status |
|------------|------|-------------|-----------|--------|
| `executive-summary` | Executive Summary Dashboard | High-level KPIs for C-suite/leadership | SF, HS | ✅ Complete |

### Documentation Category

| Template ID | Name | Description | Platforms | Status |
|------------|------|-------------|-----------|--------|
| `process-documentation` | Process Documentation Dashboard | Visual process flows, system interactions | SF, HS | ✅ Complete |

### Compensation Category (NEW)

| Template ID | Name | Description | Platforms | Status |
|------------|------|-------------|-----------|--------|
| `rep-commission-calculator` | Commission Calculator | Rep dashboard for commission calc, YTD tracking, what-if | SF, HS | ✅ Complete |
| `comp-plan-designer` | Compensation Plan Designer | Admin dashboard for tiers, accelerators, SPIFs, Monte Carlo | SF, HS | ✅ Complete |
| `plan-builder` | Compensation Plan Builder | Interactive builder with import/export and editable tiers | Local | ✅ Complete |

---

## 2. Component Library (14 Components)

### Display Components

| Component | File | Description | Chart.js Types |
|-----------|------|-------------|----------------|
| `ChartComponent` | `components/ChartComponent.js` | Chart.js visualizations | bar, line, pie, doughnut, scatter, radar, polarArea, bubble |
| `TableComponent` | `components/TableComponent.js` | Sortable, filterable, paginated tables | N/A |
| `MapComponent` | `components/MapComponent.js` | Leaflet maps with markers, heatmaps, choropleth | N/A |
| `KPICardComponent` | `components/KPICardComponent.js` | Single metric with trend indicator | N/A |
| `GaugeComponent` | `components/GaugeComponent.js` | Semi-circle gauge for quotas/scores | N/A |
| `FlowDiagramComponent` | `components/FlowDiagramComponent.js` | Mermaid-based flowcharts | N/A |

### Interactive Input Components (Compensation)

| Component | File | Description | Use Case |
|-----------|------|-------------|----------|
| `SliderComponent` | `components/SliderComponent.js` | Range slider input | Quota attainment, deal count |
| `NumberInputComponent` | `components/NumberInputComponent.js` | Currency/percent number input | Deal amount entry |
| `DropdownComponent` | `components/DropdownComponent.js` | Select/multi-select dropdown | Deal type, product selection |
| `DatePickerComponent` | `components/DatePickerComponent.js` | Date selection with fiscal awareness | Close date |
| `CalculatorComponent` | `components/CalculatorComponent.js` | Compound input+output widget | Deal commission calculator |

### Advanced & Composite Components

| Component | File | Description | Use Case |
|-----------|------|-------------|----------|
| `EditableTableComponent` | `components/EditableTableComponent.js` | Row-level editing, reorder, delete | Plan tiers, roles, SPIFs |
| `FileUploadComponent` | `components/FileUploadComponent.js` | Drag-drop file import with parsing | Plan imports (CSV/JSON/XLSX) |
| `PlanBuilderComponent` | `components/PlanBuilderComponent.js` | Full compensation plan builder UI | Admin plan design |

### Base Classes

| Class | File | Description |
|-------|------|-------------|
| `BaseComponent` | `components/BaseComponent.js` | Abstract base for all components |

---

## 3. Data Adapters (3 Adapters)

| Adapter | File | Description |
|---------|------|-------------|
| `SalesforceAdapter` | `adapters/SalesforceAdapter.js` | SOQL queries via sf CLI |
| `HubSpotAdapter` | `adapters/HubSpotAdapter.js` | HubSpot API queries |
| `FileAdapter` | `adapters/FileAdapter.js` | CSV/JSON file loading |

---

## 4. Output & Server

| Module | File | Description |
|--------|------|-------------|
| `StaticHtmlGenerator` | `output/StaticHtmlGenerator.js` | Self-contained HTML generation with embedded CSS/JS |
| `DevServer` | `server/DevServer.js` | WebSocket dev server for live updates |
| `StateManager` | `StateManager.js` | Session state management for conversational updates |

---

## 5. Template System

| Module | File | Description |
|--------|------|-------------|
| `TemplateBuilder` | `templates/TemplateBuilder.js` | Instantiates templates with data bindings |
| `TemplateRegistry` | `templates/TemplateRegistry.js` | Template discovery and validation |
| `SalesforceBindings` | `templates/data-bindings/SalesforceBindings.js` | SOQL binding execution |
| `HubSpotBindings` | `templates/data-bindings/HubSpotBindings.js` | HubSpot binding execution |

---

## 6. Compensation Engine

| Module | File | Description |
|--------|------|-------------|
| `CommissionFormulaEngine` | `compensation/commission-formula-engine.js` | Core calculation: tiers, accelerators, SPIFs, caps, splits |
| `CompPlanRepository` | `compensation/comp-plan-repository.js` | Plan storage and retrieval |

### Commission Engine Features

- **Tiered commissions**: Multiple rate tiers based on attainment %
- **Accelerators/Decelerators**: Rate multipliers above/below thresholds
- **SPIFs**: Bonus programs with eligibility criteria
- **Commission caps**: Maximum earnings limits (e.g., 2x OTE)
- **Deal splits**: Multi-rep commission allocation
- **YTD tracking**: Progressive attainment calculation
- **What-if simulation**: Project impact of future deals

---

## 7. Theme & Branding

### RevPal Theme (`templates/web-viz/themes/revpal-dashboard.css`)

**Brand Colors**:
| Name | Hex | Usage |
|------|-----|-------|
| Grape | `#5F3B8C` | Primary, buttons, links |
| Indigo | `#3E4A61` | Secondary, text |
| Apricot | `#E99560` | Accent, highlights |
| Sand | `#EAE4DC` | Backgrounds |
| Green | `#6FBF73` | Success states |

**Typography**:
- Headings: Montserrat (500-800 weights)
- Body: Figtree (400-600 weights)
- Mono: JetBrains Mono

**Theme Features**:
- 12-column responsive grid
- Card-based component styling
- Branded header with gradient
- Form controls with grape focus states
- Chart color palette (8 colors)
- Pie/doughnut size constraints (280px max)

---

## 8. Demo Data Files

Each template has accompanying demo data for testing without CRM connection:

| File | Template | Records |
|------|----------|---------|
| `sales-pipeline-demo.json` | sales-pipeline | Pipeline stages, opportunities |
| `territory-planning-demo.json` | territory-planning | Territories, accounts, geo data |
| `automation-audit-demo.json` | automation-audit | Flows, triggers, conflicts |
| `automation-diagnostics-demo.json` | automation-diagnostics | Error logs, performance |
| `data-quality-demo.json` | data-quality | Quality scores, duplicates |
| `executive-summary-demo.json` | executive-summary | KPIs, trends |
| `process-documentation-demo.json` | process-documentation | Process steps, flows |
| `rep-commission-calculator-demo.json` | rep-commission-calculator | Rep earnings, deals, tiers |
| `comp-plan-designer-demo.json` | comp-plan-designer | Plan structure, Monte Carlo |
| `plan-builder-demo.json` | plan-builder | Plan drafts, tiers, roles |

---

## 9. Configuration Files

| File | Purpose |
|------|---------|
| `config/web-viz-defaults.json` | Default settings (theme, chart, table, map, CDN URLs) |
| `config/web-viz-templates.json` | Template registry with categories and keywords |

---

## 10. API Usage Examples

### Quick Dashboard Creation

```javascript
const { WebVizGenerator } = require('./scripts/lib/web-viz');

const viz = new WebVizGenerator({ theme: 'revpal' });
const dashboard = await viz.dashboard('My Dashboard').init();

dashboard.addChart('revenue', { type: 'bar', title: 'Revenue' });
dashboard.setData('revenue', [
  { month: 'Jan', amount: 100000 },
  { month: 'Feb', amount: 120000 }
]);

await dashboard.generateStaticHTML('./output/dashboard.html', {
  serve: true,
  openBrowser: true
});
```

### From Template

```javascript
const { TemplateBuilder } = require('./scripts/lib/web-viz/templates/TemplateBuilder');

const builder = new TemplateBuilder('rep-commission-calculator');
await builder.loadTemplate();
builder.useDemo(true);

const result = await builder.buildAndGenerate('./output/calculator.html');
```

### Commission Calculation

```javascript
const { CommissionFormulaEngine } = require('./scripts/lib/compensation');

const engine = new CommissionFormulaEngine(compPlan);
const result = engine.calculateCommission(
  { amount: 50000, type: 'new-business' },
  { roleId: 'ae', ytdBookings: 400000 }
);

console.log(result.commission, result.effectiveRate, result.tierApplied);
```

---

## 11. Known Limitations

### Chart Types
- **Funnel charts render as horizontal bars** - No native funnel geometry without a plugin
- Workaround: Use horizontal bar chart with manual ordering

---

## 12. File Structure

```
opspal-core/
├── scripts/lib/
│   ├── web-viz/
│   │   ├── WebVizGenerator.js          # Main orchestrator
│   │   ├── StateManager.js             # Session state
│   │   ├── index.js                    # Public exports
│   │   ├── components/                 # 14 component classes
│   │   ├── adapters/                   # 3 data adapters
│   │   ├── output/                     # StaticHtmlGenerator
│   │   ├── server/                     # DevServer
│   │   ├── templates/                  # TemplateBuilder, Registry, Bindings
│   │   └── __tests__/                  # Unit tests
│   │
│   └── compensation/
│       ├── commission-formula-engine.js
│       ├── comp-plan-repository.js
│       └── index.js
│
├── templates/web-viz/
│   ├── *.json                          # 10 template definitions
│   ├── demo-data/*.json                # 10 demo data files
│   └── themes/
│       └── revpal-dashboard.css        # RevPal brand theme (1019 lines)
│
├── config/
│   ├── web-viz-defaults.json           # Default configuration
│   └── web-viz-templates.json          # Template registry
│
└── output/
    └── commission-calculator-demo.html # Generated dashboard example
```

---

## 13. Testing Checklist

### Theme Consistency
- [ ] All templates specify `baseTheme: "revpal"`
- [ ] Brand colors (Grape, Indigo, Apricot) used consistently
- [ ] Typography (Montserrat headings, Figtree body) renders correctly
- [ ] Pie/doughnut charts constrained to 280px max

### Component Functionality
- [ ] Charts render with correct data
- [ ] Tables sort/filter/paginate correctly
- [ ] KPIs show trends with correct direction
- [ ] Gauges display with threshold colors
- [ ] Maps load tiles and markers

### Commission Calculator Specific
- [ ] Gauge spans 2 rows correctly
- [ ] KPIs show currency/percent formatting
- [ ] Tier progress chart displays stacked bars
- [ ] Earnings breakdown doughnut sized appropriately
- [ ] Recent deals table shows all columns

### Output Modes
- [ ] Static HTML generates self-contained file
- [ ] Dev server starts on random port
- [ ] Browser opens automatically
- [ ] WebSocket updates work (dev server)

---

## 14. Dependencies

### Runtime (CDN-loaded)
- Chart.js 4.4.1 - Charts
- Chart.js Annotation 2.2.1 - Line markers/thresholds
- Chart.js DataLabels 2.2.0 - Value labels
- Leaflet 1.9.4 - Maps
- Leaflet.heat 0.2.0 - Heatmaps
- Mermaid 10.6.1 - Flow diagrams
- SheetJS 0.20.1 - XLSX import/export (plan builder)

### Optional (npm install for dev server)
- express - HTTP server
- ws - WebSocket support

### System
- Node.js 18+
- sf CLI (for Salesforce data)

---

*Generated for sanity review - 2026-01-05*
