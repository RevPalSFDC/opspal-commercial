# Screenshot Documentation

## Purpose

Capture screenshots for documentation, evidence collection, and visual verification. This runbook covers screenshot strategies, naming conventions, and integration with PDF generation.

## Prerequisites

- [ ] Playwright MCP server configured
- [ ] Page navigated to target content
- [ ] Output directory determined

## Procedure

### 1. Full-Page Screenshot

**Capture entire page:**

```
Take a screenshot of the current page
```

**Tool Call:**
```json
{
  "tool": "mcp__playwright__browser_take_screenshot",
  "params": {}
}
```

**Result:** Returns base64-encoded PNG image.

### 2. Named Screenshot

**Capture with specific filename:**

```
Take a screenshot named "dashboard-overview"
```

**Tool Call:**
```json
{
  "tool": "mcp__playwright__browser_take_screenshot",
  "params": {
    "name": "dashboard-overview"
  }
}
```

**Naming conventions:**
- `{context}-{detail}` format
- Lowercase with hyphens
- Include timestamp if needed: `dashboard-overview-2025-12-03`

### 3. Screenshot Workflow Documentation

**Capture multi-step process:**

```
Step 1: Navigate to Account record
- Take screenshot: "01-account-record-view"

Step 2: Click Edit
- Take screenshot: "02-account-edit-form"

Step 3: Change field value
- Take screenshot: "03-field-updated"

Step 4: Click Save
- Take screenshot: "04-save-completed"
```

**Naming pattern:** `{step-number}-{description}`

### 4. Before/After Comparison

**Document changes:**

```
Before change:
- Navigate to configuration page
- Screenshot: "config-before-change"

Make change:
- Update setting
- Apply changes

After change:
- Screenshot: "config-after-change"
```

### 5. Evidence Collection for Assessments

**CPQ Assessment example:**

```
1. "cpq-product-catalog" - Product list
2. "cpq-price-book" - Price book configuration
3. "cpq-discount-schedules" - Discount rules
4. "cpq-approval-workflow" - Approval configuration
5. "cpq-quote-template" - Quote document template
```

**RevOps Audit example:**

```
1. "revops-pipeline-stages" - Opportunity stages
2. "revops-forecast-settings" - Forecast configuration
3. "revops-territory-model" - Territory hierarchy
4. "revops-reports-dashboard" - Key reports
```

### 6. PDF Generation from Screenshots

**Save page as PDF:**

```
Save the current page as PDF named "audit-report"
```

**Tool Call:**
```json
{
  "tool": "mcp__playwright__browser_save_as_pdf",
  "params": {
    "filename": "audit-report.pdf"
  }
}
```

**Use cases:**
- Complete page capture including scroll content
- Print-optimized layouts
- Official documentation

### 7. Screenshot Organization

**Directory structure:**

```
instances/
└── {org-or-portal}/
    └── screenshots/
        ├── assessments/
        │   ├── cpq-assessment-2025-12-03/
        │   │   ├── 01-product-catalog.png
        │   │   ├── 02-price-book.png
        │   │   └── ...
        │   └── revops-audit-2025-12-03/
        ├── documentation/
        │   ├── workflow-setup-guide/
        │   └── user-training/
        └── evidence/
            ├── bug-123/
            └── issue-456/
```

### 8. Annotated Documentation Workflow

**Create annotated walkthrough:**

```
1. Navigate to starting point
2. Screenshot: "step-01-start"
3. Describe what user sees and should do
4. Perform action
5. Screenshot: "step-02-after-action"
6. Describe result
7. Repeat for each step
8. Compile into documentation
```

### 9. Comparison Screenshots

**Capture multiple states:**

```
Environment comparison:
- Sandbox: "sandbox-config-settings"
- Production: "production-config-settings"

Version comparison:
- v1: "flow-version-1"
- v2: "flow-version-2"
```

### 10. Error Documentation

**Capture error states:**

```
1. Reproduce error condition
2. Screenshot: "error-state-visible"
3. Capture console messages
4. Screenshot any relevant UI state
5. Document steps to reproduce
```

## Validation

### Screenshot Quality Checklist

- [ ] Page fully loaded before capture
- [ ] Relevant content visible
- [ ] No loading spinners
- [ ] Sensitive data redacted if needed
- [ ] Clear and readable
- [ ] Proper naming convention

### Organization Checklist

- [ ] Screenshots in appropriate directory
- [ ] Consistent naming scheme
- [ ] Timestamps if needed
- [ ] Context documented

## Troubleshooting

### Issue: Blank Screenshot

**Symptoms:**
- Screenshot is white/empty
- Content not captured

**Causes & Solutions:**

| Cause | Solution |
|-------|----------|
| Page not loaded | Add wait before screenshot |
| Content below fold | Scroll to content first |
| Modal covering content | Dismiss modal |
| Animation in progress | Wait for animation |

### Issue: Partial Content

**Symptoms:**
- Cut off content
- Missing elements

**Causes & Solutions:**

| Cause | Solution |
|-------|----------|
| Viewport too small | Use browser_resize |
| Content scrolled | Scroll to center content |
| Dynamic loading | Wait for content |

### Issue: Sensitive Data Visible

**Symptoms:**
- PII or credentials in screenshot
- Data that shouldn't be shared

**Causes & Solutions:**

| Cause | Solution |
|-------|----------|
| Real data displayed | Use sandbox/test data |
| Credentials visible | Mask before sharing |
| User info shown | Redact in post-processing |

### Issue: Large File Size

**Symptoms:**
- Screenshot files too large
- Storage concerns

**Causes & Solutions:**

| Cause | Solution |
|-------|----------|
| High resolution | Resize viewport |
| Complex page | Use PDF for long pages |
| Many images | Consider compression |

## Platform-Specific Patterns

### Salesforce Screenshots

**Setup documentation:**
```
1. Setup Home: "sf-setup-home"
2. Object Manager: "sf-object-{object-name}"
3. Fields: "sf-fields-{object-name}"
4. Page Layouts: "sf-layout-{layout-name}"
5. Validation Rules: "sf-validation-{object-name}"
```

**Flow documentation:**
```
1. Flow list: "sf-flows-list"
2. Flow canvas: "sf-flow-{flow-name}-canvas"
3. Flow element: "sf-flow-{flow-name}-{element}"
```

### HubSpot Screenshots

**Settings documentation:**
```
1. Portal Settings: "hs-settings-general"
2. Properties: "hs-properties-{object}"
3. Workflows: "hs-workflow-{name}"
4. Integrations: "hs-integration-{name}"
```

**Reports documentation:**
```
1. Dashboard: "hs-dashboard-{name}"
2. Report: "hs-report-{name}"
3. Analytics: "hs-analytics-{section}"
```

## Integration with PDF Generator

**Multi-document PDF workflow:**

```javascript
const { PDFGenerationHelper } = require('./pdf-generation-helper');

await PDFGenerationHelper.generateMultiReportPDF({
  orgAlias: 'production',
  outputDir: './reports',
  documents: [
    { path: 'screenshots/01-overview.png', title: 'Overview', order: 0 },
    { path: 'screenshots/02-config.png', title: 'Configuration', order: 1 },
    { path: 'analysis.md', title: 'Analysis', order: 2 }
  ],
  coverTemplate: 'salesforce-audit',
  metadata: {
    title: 'Configuration Audit Report',
    version: '1.0.0'
  }
});
```

## Related Resources

- [Page Navigation and Snapshots](./page-navigation-and-snapshots.md)
- [UAT Browser Testing](./uat-browser-testing.md)
- [PDF Generation Helper](../../scripts/lib/pdf-generation-helper.js)

---

**Version**: 1.0.0
**Created**: 2025-12-03
**Author**: RevPal Engineering
