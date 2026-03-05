# Playwright MCP Enhancement Plan

## Executive Summary

Enhance our browser automation capabilities by migrating from direct Playwright npm usage to the **Playwright MCP server**, enabling AI agents to directly control browsers with structured accessibility snapshots, intelligent form filling, and advanced capabilities.

**Current State**: Direct Playwright npm scripts for Salesforce UI scraping
**Target State**: Full Playwright MCP integration with accessibility-first automation across Salesforce, HubSpot, and documentation agents

---

## Gap Analysis

### Current Implementation

| Capability | Status | Implementation |
|------------|--------|----------------|
| Browser control | Partial | Direct `require('playwright')` in 4 scraper scripts |
| Authentication | Manual | Headed mode for login, session persistence |
| Page interaction | Basic | CSS selectors, manual waits |
| Screenshots | None | Not implemented |
| DOM understanding | Manual | Developer writes selectors |
| Multi-tab | None | Single page context |
| Network inspection | None | Not implemented |
| PDF generation | None | Not implemented |

### Spec Capabilities (Missing)

| Capability | MCP Tool | Use Case |
|------------|----------|----------|
| **Accessibility Snapshots** | `browser_snapshot` | Structured DOM parsing for LLM understanding |
| **Smart Form Filling** | `browser_fill_form` | Multi-field forms in single call |
| **Intelligent Waits** | `browser_wait_for` | Wait for text/element appearance |
| **Element Screenshots** | `browser_take_screenshot` | Full-page or element-specific |
| **Network Inspection** | `browser_network_requests` | Capture API calls for debugging |
| **Console Logs** | `browser_console_messages` | Detect JS errors |
| **Tab Management** | `browser_tabs` | Multi-tab workflows (OAuth popups) |
| **File Uploads** | `browser_file_upload` | Attachment handling |
| **Hover/Drag-Drop** | `browser_hover`, `browser_drag` | Complex UI interactions |
| **JS Evaluation** | `browser_evaluate` | Custom data extraction |
| **PDF Generation** | `browser_pdf_save` | Report archival |
| **Vision Mode** | `browser_mouse_click_xy` | Coordinate-based fallback |

### Existing Agent Playwright Status

| Agent | Has `mcp__playwright__*` | Current Usage |
|-------|--------------------------|---------------|
| `sfdc-cpq-assessor` | ✅ Yes | Listed but not actively documented |
| `sfdc-security-admin` | ✅ Yes | Listed but not actively documented |
| `sfdc-revops-auditor` | ❌ No | API-only analysis |
| `hubspot-assessment-analyzer` | ✅ Yes | Portal health dashboards |
| `hubspot-sfdc-sync-scraper` | ❌ No | Uses direct `require('playwright')` |
| `uat-orchestrator` | ❌ No | No UI testing capability |

---

## Enhancement Plan

### Phase 1: MCP Server Setup & Foundation (Priority: HIGH)

**Goal**: Configure Playwright MCP server and create foundational libraries

#### 1.1 Add Playwright MCP to Configuration

**File**: `.mcp.json`

```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": [
        "-y",
        "@playwright/mcp@latest",
        "--caps=pdf,vision"
      ],
      "env": {
        "PLAYWRIGHT_BROWSERS_PATH": "${PLAYWRIGHT_BROWSERS_PATH}"
      },
      "capabilities": [
        "browser_navigate",
        "browser_snapshot",
        "browser_click",
        "browser_fill_form",
        "browser_type",
        "browser_wait_for",
        "browser_take_screenshot",
        "browser_evaluate",
        "browser_network_requests",
        "browser_console_messages",
        "browser_tabs",
        "browser_hover",
        "browser_drag",
        "browser_pdf_save"
      ],
      "description": "Playwright MCP for browser automation with accessibility snapshots"
    }
  }
}
```

#### 1.2 Create Playwright MCP Helper Library

**File**: `opspal-core/scripts/lib/playwright-mcp-helper.js`

**Features**:
- Session management (load/save browser state)
- Snapshot parsing utilities
- Element reference extraction
- Common wait patterns for Salesforce/HubSpot
- Screenshot organization
- Platform-specific URL builders

#### 1.3 Create Setup Runbook

**File**: `opspal-core/runbooks/playwright/setup-and-configuration.md`

**Content**:
- Installation verification
- MCP server registration
- Browser installation
- Environment variables
- Troubleshooting

---

### Phase 2: Core Runbooks (Priority: HIGH)

**Goal**: Create solution-agnostic runbooks for common browser automation patterns

#### 2.1 Navigation and Page Understanding

**File**: `runbooks/playwright/page-navigation-and-snapshots.md`

**Topics**:
- Using `browser_navigate` for page loads
- Taking accessibility snapshots with `browser_snapshot`
- Parsing snapshot structure (roles, refs, text)
- Understanding element references
- Best practice: snapshot → action → snapshot cycle

#### 2.2 Form Interaction

**File**: `runbooks/playwright/form-filling-and-interaction.md`

**Topics**:
- Using `browser_fill_form` for multi-field input
- Using `browser_type` for single fields
- Handling dropdowns and checkboxes
- Clicking buttons with `browser_click`
- Using `browser_wait_for` for dynamic content

#### 2.3 Screenshot Documentation

**File**: `runbooks/playwright/screenshot-documentation.md`

**Topics**:
- Full-page screenshots
- Element-specific screenshots
- Naming conventions for documentation
- Automating workflow documentation
- Integration with PDF generation

#### 2.4 Authentication Patterns

**File**: `runbooks/playwright/authentication-patterns.md`

**Topics**:
- Salesforce OAuth login flow
- HubSpot authentication
- Session persistence strategies
- Multi-factor authentication handling
- Token refresh patterns

---

### Phase 3A: Salesforce Agent Integration (Priority: HIGH)

**Goal**: Wire Playwright MCP capabilities into Salesforce agents for UI-based operations

#### Assessment & Audit Agents

| Agent | Enhancement | Use Cases |
|-------|-------------|-----------|
| `sfdc-cpq-assessor` | **Full integration** | CPQ pricing config UI scraping, Quote Line Editor screenshots, Product configuration capture |
| `sfdc-revops-auditor` | **Add Playwright** | Pipeline view screenshots, Forecast UI capture, Sales Cloud dashboards |
| `sfdc-automation-auditor` | **Add Playwright** | Flow Builder screenshots, Process automation visualization, Trigger visualization |
| `sfdc-state-discovery` | **Add Playwright** | Setup page screenshots, Lightning configuration capture, Installed packages UI |
| `sfdc-architecture-auditor` | **Add Playwright** | Object Manager screenshots, Schema Builder capture, App configuration |
| `sfdc-permission-assessor` | **Add Playwright** | Permission set UI analysis, Profile screenshots, Sharing rule visualization |

**Tools to Add**: `mcp__playwright__browser_navigate`, `mcp__playwright__browser_snapshot`, `mcp__playwright__browser_take_screenshot`, `mcp__playwright__browser_wait_for`

#### Security & Admin Agents

| Agent | Enhancement | Use Cases |
|-------|-------------|-----------|
| `sfdc-security-admin` | **Enhanced docs** | Permission UI navigation, Sharing Settings screenshots, Security Health Check UI |
| `sfdc-compliance-officer` | **Add Playwright** | Audit trail UI, Field History settings, Shield encryption UI |

#### UI/Layout Agents

| Agent | Enhancement | Use Cases |
|-------|-------------|-----------|
| `sfdc-layout-analyzer` | **Add Playwright** | Lightning page screenshots, Record page analysis, App builder visualization |
| `sfdc-layout-generator` | **Add Playwright** | Visual preview capture, Before/after comparisons |
| `sfdc-ui-customizer` | **Add Playwright** | Lightning App Builder interaction, Page layout customization |
| `sfdc-dashboard-designer` | **Add Playwright** | Dashboard UI screenshots, Component visualization |
| `sfdc-dashboard-migrator` | **Add Playwright** | Dashboard UI scraping for migration analysis |

#### Reports & Dashboards Agents

| Agent | Enhancement | Use Cases |
|-------|-------------|-----------|
| `sfdc-reports-dashboards` | **Add Playwright** | Report preview screenshots, Dashboard snapshots, Chart captures |
| `sfdc-report-designer` | **Add Playwright** | Report builder UI interaction, Filter configuration |
| `sfdc-reports-usage-auditor` | **Add Playwright** | Dashboard usage screenshots, Report folder navigation |

#### Quality & Monitoring Agents

| Agent | Enhancement | Use Cases |
|-------|-------------|-----------|
| `sfdc-quality-auditor` | **Add Playwright** | Visual regression testing, UI consistency checks |
| `sfdc-performance-optimizer` | **Add Playwright** | Network performance capture, Page load analysis |

**Salesforce-Specific Runbook**: `runbooks/playwright/salesforce-ui-patterns.md`
- Lightning Experience navigation patterns
- Setup menu navigation
- Classic vs Lightning handling
- Aura vs LWC element identification
- Common Salesforce UI selectors
- Session persistence for orgs

---

### Phase 3B: HubSpot Agent Integration (Priority: HIGH)

**Goal**: Wire Playwright MCP capabilities into HubSpot agents for portal operations

#### Assessment & Audit Agents

| Agent | Enhancement | Use Cases |
|-------|-------------|-----------|
| `hubspot-assessment-analyzer` | **Enhanced docs** | Portal health dashboard screenshots, Settings page capture |
| `hubspot-workflow-auditor` | **Add Playwright** | Workflow visualization screenshots, Enrollment history UI |
| `hubspot-adoption-tracker` | **Add Playwright** | Feature adoption UI screenshots, Usage analytics capture |
| `hubspot-analytics-reporter` | **Add Playwright** | Dashboard screenshots, Report visualization |

#### Sync & Integration Agents

| Agent | Enhancement | Use Cases |
|-------|-------------|-----------|
| `hubspot-sfdc-sync-scraper` | **Migrate to MCP** | Replace direct Playwright with MCP tools, Add accessibility snapshots |
| `hubspot-integration-specialist` | **Add Playwright** | Connected app settings, OAuth flow handling |
| `hubspot-stripe-connector` | **Add Playwright** | Stripe integration UI, Payment settings |

#### Marketing & Content Agents

| Agent | Enhancement | Use Cases |
|-------|-------------|-----------|
| `hubspot-cms-content-manager` | **Add Playwright** | CMS page interaction, Content editor screenshots |
| `hubspot-cms-page-publisher` | **Add Playwright** | Page publishing UI, Template selection |
| `hubspot-email-campaign-manager` | **Add Playwright** | Email editor screenshots, Template previews |
| `hubspot-marketing-automation` | **Add Playwright** | Campaign UI screenshots, A/B test visualization |

#### Workflow & Automation Agents

| Agent | Enhancement | Use Cases |
|-------|-------------|-----------|
| `hubspot-workflow-builder` | **Add Playwright** | Workflow canvas screenshots, Branch visualization |
| `hubspot-workflow` | **Add Playwright** | Workflow UI validation, Enrollment UI |

#### SEO & Web Agents

| Agent | Enhancement | Use Cases |
|-------|-------------|-----------|
| `hubspot-seo-site-crawler` | **Add Playwright** | Website crawling with accessibility snapshots |
| `hubspot-seo-optimizer` | **Add Playwright** | SEO tools UI, Meta editor screenshots |
| `hubspot-web-enricher` | **Add Playwright** | Rich page content extraction, Structured data capture |

#### Reporting Agents

| Agent | Enhancement | Use Cases |
|-------|-------------|-----------|
| `hubspot-reporting-builder` | **Add Playwright** | Report builder UI interaction, Custom report creation |
| `hubspot-revenue-intelligence` | **Add Playwright** | Revenue dashboard screenshots, Forecast UI |
| `hubspot-ai-revenue-intelligence` | **Add Playwright** | AI insights UI capture, Prediction visualization |

**HubSpot-Specific Runbook**: `runbooks/playwright/hubspot-ui-patterns.md`
- Portal navigation patterns
- Settings menu structure
- Workflow canvas interaction
- CMS editor patterns
- Common HubSpot UI selectors
- Portal session management

---

### Phase 3C: Cross-Platform & Documentation Agents (Priority: MEDIUM)

**Goal**: Enable documentation generation and UAT testing with browser automation

#### New Agents

| Agent | Purpose | Capabilities |
|-------|---------|--------------|
| `playwright-browser-controller` | General browser automation | Navigate, snapshot, interact, screenshot |
| `ui-documentation-generator` | Automated workflow documentation | Multi-step capture, Annotated screenshots, PDF export |
| `visual-regression-tester` | UI change detection | Before/after comparison, Diff highlighting |

#### Enhanced Existing Agents

| Agent | Enhancement | Use Cases |
|-------|-------------|-----------|
| `uat-orchestrator` | **Major enhancement** | UI-based test execution, Visual verification, Screenshot evidence |
| `diagram-generator` | **Add Playwright** | Capture existing UI for reference diagrams |
| `pdf-generator` | **Add Playwright** | Web page to PDF conversion, Report archival |
| `sales-funnel-diagnostic` | **Add Playwright** | Pipeline visualization capture, Funnel screenshots |

#### UAT Orchestrator Enhancement Details

**New Capabilities**:
```yaml
uat-orchestrator:
  tools_to_add:
    - mcp__playwright__browser_navigate
    - mcp__playwright__browser_snapshot
    - mcp__playwright__browser_click
    - mcp__playwright__browser_fill_form
    - mcp__playwright__browser_type
    - mcp__playwright__browser_wait_for
    - mcp__playwright__browser_take_screenshot
    - mcp__playwright__browser_evaluate

  new_capabilities:
    - UI-based test step execution
    - Screenshot capture for test evidence
    - Visual verification against expected state
    - Form filling for data entry tests
    - Button click automation
    - Multi-step workflow testing
    - Cross-platform UI testing (SF + HS)
```

**New UAT Actions**:
```csv
Action Pattern,Playwright MCP Tool,Example
Navigate to,browser_navigate,"Navigate to Account record"
Click button,browser_click,"Click button 'Save'"
Fill form,browser_fill_form,"Fill form with Name=Test, Amount=100"
Verify text,browser_snapshot + validation,"Verify text 'Success' appears"
Screenshot,browser_take_screenshot,"Capture evidence screenshot"
Wait for,browser_wait_for,"Wait for loading spinner to disappear"
```

**Cross-Platform Runbook**: `runbooks/playwright/uat-browser-testing.md`
- UI test step patterns
- Screenshot evidence collection
- Cross-platform test execution
- Visual regression in UAT

---

### Phase 4: Advanced Capabilities (Priority: MEDIUM)

**Goal**: Enable advanced features from the Playwright MCP spec

#### 4.1 Network Inspection Library

**File**: `opspal-core/scripts/lib/playwright-network-inspector.js`

**Features**:
- Capture API calls made by Salesforce/HubSpot
- Extract request/response payloads
- Identify undocumented API endpoints
- Debug data loading issues
- Compare API payloads across environments

**Agent Integration**:
- `sfdc-integration-specialist`: Capture Salesforce API calls
- `hubspot-api`: Capture HubSpot API calls
- `sfdc-performance-optimizer`: Performance profiling

#### 4.2 Console Monitoring

**File**: `opspal-core/scripts/lib/playwright-console-monitor.js`

**Features**:
- Capture JavaScript errors
- Detect console warnings
- QA validation for UI deployments
- Error reporting integration
- LWC/Aura error detection

**Agent Integration**:
- `sfdc-lightning-developer`: Debug LWC/Aura issues
- `sfdc-quality-auditor`: Console error detection
- `hubspot-cms-page-publisher`: CMS page validation

#### 4.3 Multi-Tab Workflow Support

**File**: `runbooks/playwright/multi-tab-workflows.md`

**Topics**:
- Handling OAuth popup windows (Salesforce, HubSpot)
- Tab switching with `browser_tabs`
- Managing multiple contexts
- Common multi-tab patterns
- Connected app authorization flows

#### 4.4 PDF Generation

**Update MCP config** to enable PDF capability:

```json
"args": [
  "-y",
  "@playwright/mcp@latest",
  "--caps=pdf,vision"
]
```

**Create**: `runbooks/playwright/pdf-generation.md`

**Agent Integration**:
- `pdf-generator`: Direct web-to-PDF conversion
- `sfdc-reports-dashboards`: Dashboard PDF export
- `hubspot-reporting-builder`: Report PDF export
- `ui-documentation-generator`: Documentation PDFs

---

### Phase 5: Migration & Integration (Priority: LOW)

**Goal**: Migrate existing scrapers to MCP approach

#### 5.1 Migrate Existing Scrapers

| Current Script | Plugin | Migration Target |
|----------------|--------|------------------|
| `scrape-sf-connected-apps.js` | salesforce-plugin | MCP-based with snapshots |
| `scrape-sf-permission-assignments.js` | salesforce-plugin | MCP-based with snapshots |
| `scrape-sf-setup-audit-trail.js` | salesforce-plugin | MCP-based with snapshots |
| `scrape-sf-cpq-pricing-config.js` | salesforce-plugin | MCP-based with snapshots |
| `scrape-sfdc-sync-settings.js` | hubspot-plugin | MCP-based with snapshots |

**Migration Pattern**:
1. Replace `require('playwright')` with MCP tool calls
2. Use `browser_snapshot` instead of CSS selectors
3. Use `browser_wait_for` instead of manual waits
4. Add `browser_take_screenshot` for documentation
5. Update agent instructions to reference MCP tools

#### 5.2 Create Wrapper for Backward Compatibility

**File**: `opspal-core/scripts/lib/playwright-compatibility-layer.js`

**Purpose**: Allow existing scripts to work with minimal changes while transitioning

**Features**:
- Adapter pattern for MCP tools
- Session state compatibility
- Screenshot path compatibility
- Error handling wrapper

#### 5.3 Update Routing

**File**: `opspal-core/scripts/lib/task-router.js`

**Add keywords**:
```javascript
'playwright-browser-controller': [
  'browser', 'navigate page', 'screenshot', 'web automation',
  'scrape page', 'UI interaction', 'accessibility snapshot',
  'capture page', 'document workflow'
],
'ui-documentation-generator': [
  'document workflow', 'screenshot steps', 'visual documentation',
  'capture process', 'create walkthrough', 'generate UI docs'
],
'visual-regression-tester': [
  'visual regression', 'UI comparison', 'screenshot diff',
  'before after', 'visual testing'
]
```

---

## File Structure (Additions)

```
.claude-plugins/opspal-core/
├── agents/
│   ├── playwright-browser-controller.md      # NEW
│   ├── ui-documentation-generator.md         # NEW
│   └── visual-regression-tester.md           # NEW
├── scripts/lib/
│   ├── playwright-mcp-helper.js              # NEW
│   ├── playwright-network-inspector.js       # NEW
│   ├── playwright-console-monitor.js         # NEW
│   └── playwright-compatibility-layer.js     # NEW
├── runbooks/playwright/                      # NEW DIRECTORY
│   ├── setup-and-configuration.md            # NEW
│   ├── page-navigation-and-snapshots.md      # NEW
│   ├── form-filling-and-interaction.md       # NEW
│   ├── screenshot-documentation.md           # NEW
│   ├── authentication-patterns.md            # NEW
│   ├── multi-tab-workflows.md                # NEW
│   ├── pdf-generation.md                     # NEW
│   ├── salesforce-ui-patterns.md             # NEW - SF-specific
│   ├── hubspot-ui-patterns.md                # NEW - HS-specific
│   └── uat-browser-testing.md                # NEW - UAT-specific
└── commands/
    └── playwright-test.md                    # UPDATE (already exists)

.claude-plugins/opspal-salesforce/
└── agents/
    ├── sfdc-cpq-assessor.md                  # UPDATE - Add runbook refs
    ├── sfdc-revops-auditor.md                # UPDATE - Add Playwright tools
    ├── sfdc-automation-auditor.md            # UPDATE - Add Playwright tools
    ├── sfdc-state-discovery.md               # UPDATE - Add Playwright tools
    ├── sfdc-security-admin.md                # UPDATE - Add runbook refs
    ├── sfdc-layout-analyzer.md               # UPDATE - Add Playwright tools
    ├── sfdc-reports-dashboards.md            # UPDATE - Add Playwright tools
    ├── sfdc-quality-auditor.md               # UPDATE - Add Playwright tools
    └── ... (10+ more agents)

.claude-plugins/opspal-hubspot/
└── agents/
    ├── hubspot-assessment-analyzer.md        # UPDATE - Add runbook refs
    ├── hubspot-sfdc-sync-scraper.md          # UPDATE - Migrate to MCP
    ├── hubspot-workflow-builder.md           # UPDATE - Add Playwright tools
    ├── hubspot-cms-content-manager.md        # UPDATE - Add Playwright tools
    ├── hubspot-seo-site-crawler.md           # UPDATE - Add Playwright tools
    └── ... (10+ more agents)
```

---

## Agent Update Summary

### Salesforce Plugin (16 agents)

| Agent | Status | Tools Added |
|-------|--------|-------------|
| `sfdc-cpq-assessor` | Update docs | Reference runbooks |
| `sfdc-revops-auditor` | Add tools | `mcp__playwright__*` |
| `sfdc-automation-auditor` | Add tools | `mcp__playwright__*` |
| `sfdc-state-discovery` | Add tools | `mcp__playwright__*` |
| `sfdc-architecture-auditor` | Add tools | `mcp__playwright__*` |
| `sfdc-permission-assessor` | Add tools | `mcp__playwright__*` |
| `sfdc-security-admin` | Update docs | Reference runbooks |
| `sfdc-compliance-officer` | Add tools | `mcp__playwright__*` |
| `sfdc-layout-analyzer` | Add tools | `mcp__playwright__*` |
| `sfdc-layout-generator` | Add tools | `mcp__playwright__*` |
| `sfdc-ui-customizer` | Add tools | `mcp__playwright__*` |
| `sfdc-dashboard-designer` | Add tools | `mcp__playwright__*` |
| `sfdc-dashboard-migrator` | Add tools | `mcp__playwright__*` |
| `sfdc-reports-dashboards` | Add tools | `mcp__playwright__*` |
| `sfdc-quality-auditor` | Add tools | `mcp__playwright__*` |
| `sfdc-performance-optimizer` | Add tools | `mcp__playwright__*` |

### HubSpot Plugin (15 agents)

| Agent | Status | Tools Added |
|-------|--------|-------------|
| `hubspot-assessment-analyzer` | Update docs | Reference runbooks |
| `hubspot-sfdc-sync-scraper` | Migrate | Replace direct Playwright |
| `hubspot-workflow-auditor` | Add tools | `mcp__playwright__*` |
| `hubspot-adoption-tracker` | Add tools | `mcp__playwright__*` |
| `hubspot-analytics-reporter` | Add tools | `mcp__playwright__*` |
| `hubspot-integration-specialist` | Add tools | `mcp__playwright__*` |
| `hubspot-stripe-connector` | Add tools | `mcp__playwright__*` |
| `hubspot-cms-content-manager` | Add tools | `mcp__playwright__*` |
| `hubspot-cms-page-publisher` | Add tools | `mcp__playwright__*` |
| `hubspot-email-campaign-manager` | Add tools | `mcp__playwright__*` |
| `hubspot-workflow-builder` | Add tools | `mcp__playwright__*` |
| `hubspot-seo-site-crawler` | Add tools | `mcp__playwright__*` |
| `hubspot-seo-optimizer` | Add tools | `mcp__playwright__*` |
| `hubspot-web-enricher` | Add tools | `mcp__playwright__*` |
| `hubspot-reporting-builder` | Add tools | `mcp__playwright__*` |

### OpsPal Core (7 agents)

| Agent | Status | Tools Added |
|-------|--------|-------------|
| `playwright-browser-controller` | NEW | Full `mcp__playwright__*` |
| `ui-documentation-generator` | NEW | Full `mcp__playwright__*` |
| `visual-regression-tester` | NEW | Full `mcp__playwright__*` |
| `uat-orchestrator` | Major update | Full `mcp__playwright__*` |
| `diagram-generator` | Add tools | `mcp__playwright__*` |
| `pdf-generator` | Add tools | `mcp__playwright__*` |
| `sales-funnel-diagnostic` | Add tools | `mcp__playwright__*` |

**Total**: 38 agents enhanced/created

---

## Success Criteria

### Phase 1 (Foundation)
- [ ] Playwright MCP server configured in `.mcp.json`
- [ ] `mcp__playwright__*` tools available to agents
- [ ] Helper library created with session management
- [ ] Setup runbook complete

### Phase 2 (Core Runbooks)
- [ ] All 4 core runbooks created
- [ ] Runbooks follow standardized format
- [ ] Examples use Salesforce/HubSpot scenarios

### Phase 3A (Salesforce Integration)
- [ ] 16 Salesforce agents updated with Playwright tools
- [ ] Salesforce-specific runbook created
- [ ] Integration tested against sandbox org

### Phase 3B (HubSpot Integration)
- [ ] 15 HubSpot agents updated with Playwright tools
- [ ] HubSpot-specific runbook created
- [ ] `hubspot-sfdc-sync-scraper` migrated to MCP
- [ ] Integration tested against test portal

### Phase 3C (Cross-Platform Integration)
- [ ] 3 new agents created
- [ ] `uat-orchestrator` enhanced with UI testing
- [ ] 4 existing agents updated
- [ ] UAT browser testing runbook created

### Phase 4 (Advanced)
- [ ] Network inspection working
- [ ] Console monitoring working
- [ ] Multi-tab workflows documented
- [ ] PDF generation enabled

### Phase 5 (Migration)
- [ ] All 5 scrapers migrated to MCP approach
- [ ] Backward compatibility maintained
- [ ] Documentation updated

---

## Benefits by Platform

### Salesforce

| Benefit | Impact |
|---------|--------|
| **Setup Page Automation** | Capture configuration that's not API-accessible |
| **Lightning Screenshot Docs** | Auto-document page layouts and components |
| **Permission UI Analysis** | Visual analysis of complex permission structures |
| **CPQ UI Scraping** | Extract pricing config from Product Configurator |
| **Dashboard Capture** | Screenshot dashboards for executive reports |
| **Flow Visualization** | Capture Flow Builder state for documentation |

### HubSpot

| Benefit | Impact |
|---------|--------|
| **Portal Health Dashboards** | Screenshot portal metrics |
| **Workflow Visualization** | Capture workflow canvas for documentation |
| **Sync Settings Scraping** | Extract SF sync config (not API-accessible) |
| **CMS Page Interaction** | Automate content management tasks |
| **SEO Crawling** | Enhanced site analysis with accessibility data |
| **Integration UI** | Capture connected app configurations |

### Cross-Platform

| Benefit | Impact |
|---------|--------|
| **UAT UI Testing** | Automated UI test execution with screenshots |
| **Visual Documentation** | Auto-generate workflow walkthroughs |
| **Visual Regression** | Detect UI changes between deployments |
| **PDF Reports** | Generate PDFs from web pages |
| **Funnel Visualization** | Capture sales funnel UI for diagnostics |

---

## Implementation Priority

| Phase | Priority | Effort | Impact | Agents Affected |
|-------|----------|--------|--------|-----------------|
| Phase 1: Setup | HIGH | 4 hours | Foundation | All |
| Phase 2: Runbooks | HIGH | 8 hours | Documentation | All |
| Phase 3A: Salesforce | HIGH | 10 hours | SF automation | 16 agents |
| Phase 3B: HubSpot | HIGH | 8 hours | HS automation | 15 agents |
| Phase 3C: Cross-Platform | MEDIUM | 6 hours | Documentation/UAT | 7 agents |
| Phase 4: Advanced | MEDIUM | 6 hours | Power-user features | 10+ agents |
| Phase 5: Migration | LOW | 8 hours | Technical debt | 5 scripts |

**Total Estimated Effort**: 50 hours
**Total Agents Enhanced**: 38

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| MCP server instability | Keep existing scripts as fallback |
| Accessibility tree gaps | Enable vision mode (`--caps=vision`) for fallback |
| Session management changes | Abstract session handling in helper library |
| Breaking existing workflows | Compatibility layer for gradual migration |
| Platform UI changes | Use accessibility-first approach, avoid brittle selectors |
| Rate limiting | Add configurable delays between actions |

---

## Related Resources

- **Playwright MCP GitHub**: https://github.com/playwright/playwright-mcp
- **MCP Protocol Spec**: https://modelcontextprotocol.io/
- **Existing Scrapers**: `.claude-plugins/opspal-salesforce/scripts/scrape-*.js`
- **Current Command**: `.claude-plugins/opspal-salesforce/commands/playwright-test.md`
- **Salesforce Plugin**: `.claude-plugins/opspal-salesforce/CLAUDE.md`
- **HubSpot Plugin**: `.claude-plugins/opspal-hubspot/CLAUDE.md`
- **OpsPal Core**: `.claude-plugins/opspal-core/CLAUDE.md`

---

**Version**: 2.0.0
**Created**: 2025-12-03
**Updated**: 2025-12-03
**Author**: RevPal Engineering
