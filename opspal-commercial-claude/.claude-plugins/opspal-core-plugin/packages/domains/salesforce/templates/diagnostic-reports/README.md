# Flow Diagnostic Report Templates

This directory contains templates for generating Flow diagnostic reports in multiple formats.

## Available Templates

### 1. HTML Template (`diagnostic-report-template.html`)

**Purpose**: Rich, visual diagnostic reports for stakeholder presentation

**Features**:
- Professional styling with Salesforce Lightning Design System colors
- Executive summary dashboard with key metrics
- Visual progress bars for coverage
- Color-coded issues (critical, warnings, info)
- Governor limit usage charts
- Mobile-responsive design

**Use Cases**:
- Executive presentations
- Stakeholder reviews
- Production deployment approval
- Audit documentation

**Example Usage**:
```javascript
const { FlowDiagnosticOrchestrator } = require('.claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/flow-diagnostic-orchestrator');

const orchestrator = new FlowDiagnosticOrchestrator(orgAlias, {
  verbose: true,
  generateReports: true,
  reportFormat: 'html'
});

const result = await orchestrator.runFullDiagnostic(flowApiName, {
  object: 'Account',
  triggerType: 'after-save',
  testCases: [...]
});

// Report generated at: ./reports/{flowName}-diagnostic-{timestamp}.html
```

---

### 2. Markdown Template (`diagnostic-report-template.md`)

**Purpose**: Documentation-friendly reports for developer reference

**Features**:
- Clean markdown formatting
- Easy to integrate into documentation
- Version control friendly (plain text)
- Quick scanning with headers and tables
- Emoji indicators for status
- Checklists for deployment readiness

**Use Cases**:
- Developer documentation
- Git repository documentation
- Wiki/Confluence integration
- Code review documentation
- Technical runbooks

**Example Usage**:
```javascript
const orchestrator = new FlowDiagnosticOrchestrator(orgAlias, {
  verbose: true,
  generateReports: true,
  reportFormat: 'markdown'
});

const result = await orchestrator.runFullDiagnostic(flowApiName, {...});

// Report generated at: ./reports/{flowName}-diagnostic-{timestamp}.md
```

---

### 3. JSON Schema (`diagnostic-report-schema.json`)

**Purpose**: Machine-readable reports for automation and integration

**Features**:
- Complete JSON schema definition
- Type validation
- Structured data format
- API integration ready
- CI/CD pipeline integration
- Automated analysis support

**Use Cases**:
- CI/CD pipeline integration
- Automated quality gates
- API responses
- Data analysis and trending
- Webhook payloads
- Monitoring system integration

**Example Usage**:
```javascript
const orchestrator = new FlowDiagnosticOrchestrator(orgAlias, {
  verbose: true,
  generateReports: true,
  reportFormat: 'json'
});

const result = await orchestrator.runFullDiagnostic(flowApiName, {...});

// Parse JSON report
const report = JSON.parse(fs.readFileSync(`./reports/${flowName}-diagnostic.json`));

// Automated decision
if (report.overallSummary.readyForProduction) {
  console.log('✅ Deploying to production');
  await deployToProduction(flowName);
} else {
  console.log('❌ Blocked - not production ready');
  console.log(`Critical issues: ${report.overallSummary.criticalIssues}`);
  throw new Error('Deployment blocked');
}
```

---

## Template Variables

All templates support the following variable substitutions:

### Metadata Variables
- `{{flowName}}` - Flow API name
- `{{orgAlias}}` - Salesforce org alias
- `{{timestamp}}` - Report generation timestamp
- `{{apiVersion}}` - Salesforce API version
- `{{diagnosticType}}` - Type of diagnostic (preflight/execution/coverage/full)

### Summary Variables
- `{{readyForProduction}}` - True/False production readiness
- `{{canDeploy}}` - True/False deployment readiness
- `{{coveragePercentage}}` - Overall coverage percentage (0-100)
- `{{criticalIssues}}` - Count of critical issues
- `{{warnings}}` - Count of warnings
- `{{readinessStatus}}` - PRODUCTION_READY/CAN_DEPLOY/NOT_READY
- `{{readinessDecision}}` - Human-readable decision
- `{{readinessExplanation}}` - Detailed explanation

### Pre-flight Variables
- `{{#preflightChecks}}...{{/preflightChecks}}` - Array of pre-flight checks
  - `{{checkName}}` - Check name
  - `{{status}}` - PASSED/FAILED/WARNING
  - `{{details}}` - Check details

### Execution Variables
- `{{#testCases}}...{{/testCases}}` - Array of test case results
  - `{{testCaseId}}` - Test case ID (e.g., RT-001)
  - `{{testCaseName}}` - Test case name
  - `{{success}}` - True/False
  - `{{duration}}` - Execution duration (ms)
  - `{{errorType}}` - Error type if failed
  - `{{errorMessage}}` - Error message if failed

### Coverage Variables
- `{{coveragePercentage}}` - Overall coverage %
- `{{totalBranches}}` - Total decision branches
- `{{coveredBranches}}` - Covered branches count
- `{{#uncoveredBranches}}...{{/uncoveredBranches}}` - Array of uncovered branches
  - `{{elementName}}` - Flow element name
  - `{{decisionLabel}}` - Decision label
  - `{{branchLabel}}` - Branch label
  - `{{condition}}` - Branch condition

### Issues Variables
- `{{#criticalIssuesList}}...{{/criticalIssuesList}}` - Critical issues array
  - `{{issue}}` - Issue summary
  - `{{description}}` - Issue description
  - `{{recommendation}}` - Fix recommendation
- `{{#warningsList}}...{{/warningsList}}` - Warnings array
- `{{#infoList}}...{{/infoList}}` - Informational messages array

### Governor Limits Variables
- `{{#governorLimits}}...{{/governorLimits}}` - Governor limits array
  - `{{limitType}}` - Limit type (CPU_TIME, HEAP_SIZE, etc.)
  - `{{used}}` - Amount used
  - `{{available}}` - Total available
  - `{{percentage}}` - Usage percentage
  - `{{status}}` - SAFE/WARNING/CRITICAL

---

## Customization

### Modifying Templates

Templates use Handlebars-style syntax for variable substitution and loops:

**Variables**: `{{variableName}}`
**Conditionals**: `{{#if condition}}...{{/if}}`
**Loops**: `{{#arrayName}}...{{/arrayName}}`

### Adding Custom Sections

To add custom sections to templates:

1. **Define data structure** in FlowDiagnosticOrchestrator output
2. **Add template section** with appropriate variable bindings
3. **Update schema** (for JSON template)
4. **Test rendering** with sample data

Example - Add custom metric:

```javascript
// In FlowDiagnosticOrchestrator
result.customMetrics = {
  apiCallsCount: 15,
  dmlRowsCount: 250
};

// In template
<div class="metric-card">
  <div class="label">API Calls</div>
  <div class="value">{{customMetrics.apiCallsCount}}</div>
</div>
```

---

## CI/CD Integration

### GitHub Actions Example

```yaml
- name: Run Flow Diagnostics
  run: |
    node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/run-diagnostics.js MyFlow production --format json

- name: Check Production Readiness
  run: |
    if jq -e '.overallSummary.readyForProduction == false' reports/MyFlow-diagnostic.json; then
      echo "❌ Flow not ready for production"
      exit 1
    fi

- name: Upload Report
  uses: actions/upload-artifact@v2
  with:
    name: diagnostic-report
    path: reports/MyFlow-diagnostic.html
```

### Jenkins Pipeline Example

```groovy
stage('Flow Diagnostic') {
    steps {
        sh 'node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/run-diagnostics.js MyFlow production --format json'

        script {
            def report = readJSON file: 'reports/MyFlow-diagnostic.json'
            if (!report.overallSummary.readyForProduction) {
                error("Flow not ready for production: ${report.overallSummary.criticalIssues} critical issues")
            }
        }
    }
    post {
        always {
            publishHTML([
                reportName: 'Flow Diagnostic Report',
                reportDir: 'reports',
                reportFiles: 'MyFlow-diagnostic.html'
            ])
        }
    }
}
```

---

## Report Generation API

### FlowDiagnosticOrchestrator API

```javascript
const { FlowDiagnosticOrchestrator } = require('.claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/flow-diagnostic-orchestrator');

const orchestrator = new FlowDiagnosticOrchestrator(orgAlias, {
  verbose: true,
  generateReports: true,
  reportFormat: 'html', // or 'markdown', 'json'
  reportDir: './reports',
  reportTemplate: './templates/diagnostic-reports/diagnostic-report-template.html'
});

const result = await orchestrator.runFullDiagnostic(flowApiName, {
  object: 'Account',
  triggerType: 'after-save',
  testCases: [...]
});

// result.reportPath contains path to generated report
console.log(`Report generated: ${result.reportPath}`);
```

### Multiple Format Generation

```javascript
const formats = ['html', 'markdown', 'json'];

for (const format of formats) {
  const orchestrator = new FlowDiagnosticOrchestrator(orgAlias, {
    generateReports: true,
    reportFormat: format
  });

  await orchestrator.runFullDiagnostic(flowApiName, {...});
}

// Generates:
// - reports/MyFlow-diagnostic-{timestamp}.html
// - reports/MyFlow-diagnostic-{timestamp}.md
// - reports/MyFlow-diagnostic-{timestamp}.json
```

---

## Best Practices

### For HTML Reports
- ✅ Use for stakeholder presentations
- ✅ Include in deployment approval documentation
- ✅ Attach to change requests
- ✅ Archive for audit compliance

### For Markdown Reports
- ✅ Commit to Git for version history
- ✅ Include in pull request descriptions
- ✅ Add to wiki/documentation sites
- ✅ Use for developer handoff

### For JSON Reports
- ✅ Parse in CI/CD pipelines
- ✅ Store in monitoring systems
- ✅ Trend analysis over time
- ✅ Automated quality gates

---

## Related Documentation

- **Runbook 7**: `../../docs/runbooks/flow-xml-development/07-testing-and-diagnostics.md`
- **Diagnostic Modules**: `../..claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/flow-*.js`
- **CLI Commands**: `/flow-diagnose`
- **Agents**: `flow-diagnostician`, `flow-test-orchestrator`, `flow-log-analyst`

---

**Version**: 3.43.0
**Last Updated**: 2025-11-12
**Maintained By**: Salesforce Plugin Team - RevPal Internal
