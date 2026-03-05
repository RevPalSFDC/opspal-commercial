# Open Blockers - Investigation Plan

**Date**: 2025-01-17
**Status**: 3 Active Blockers

## Summary

This document details the current blockers preventing complete automation of Salesforce report and dashboard deployment via REST API. Each blocker includes technical details, investigation steps, and potential solutions.

---

## Blocker #1: Dashboard Components - REST API Limitation

**Status**: 🔴 BLOCKED - High Complexity
**Priority**: Medium
**Impact**: Users must manually add dashboard components via UI

### Problem Statement

Dashboard creation via REST API succeeds, but adding components to the dashboard is rejected with `JSON_PARSER_ERROR`. This prevents complete dashboard automation.

### What Works

```javascript
// ✅ This works - Creates empty dashboard
POST /services/data/v64.0/analytics/dashboards
{
    "name": "Test Report Validation Dashboard",
    "folderId": "00l8c000002Sa3zAAC",
    "description": "Test dashboard for report validation"
}

// Response (Success):
{
    "id": "01Zdx000002XKQYEA4",
    "name": "Test Report Validation Dashboard",
    "folderId": "00l8c000002Sa3zAAC"
}
```

### What's Blocked

```javascript
// ❌ This fails - Adding components rejected
POST /services/data/v64.0/analytics/dashboards
{
    "name": "Test Dashboard",
    "folderId": "00l8c000002Sa3zAAC",
    "components": [
        {
            "header": "Opportunities by Stage",
            "footer": "",
            "componentType": "Bar",
            "reportId": "00Odx000001XfOnEAK",
            "properties": {
                "height": 12,
                "width": 6,
                "left": 0,
                "top": 0
            }
        }
    ]
}

// Response (Error):
{
    "errorCode": "JSON_PARSER_ERROR",
    "message": "The request body is either invalid or incomplete."
}
```

### Technical Investigation

#### Step 1: Query Existing Dashboard Structure

**Goal**: Understand how Salesforce structures dashboard metadata internally

**Commands**:
```bash
# Query existing dashboard with components
sf data query --query "SELECT Id, Title, DashboardType FROM Dashboard WHERE FolderName = 'acme-corp Dashboards'" --use-tooling-api

# Get specific dashboard metadata
sf data query --query "SELECT Id, Title, DashboardType, BackgroundDirection, TitleColor, TitleSize FROM Dashboard WHERE Id = '01Zdx000002XKQYEA4'" --use-tooling-api

# Query dashboard components (if separate object)
sf data query --query "SELECT Id, Name, ComponentType FROM DashboardComponent LIMIT 5" --use-tooling-api
```

**Expected Output**: Dashboard metadata structure showing component relationships

#### Step 2: Describe Analytics Dashboard Endpoint

**Goal**: Get full schema for dashboard creation endpoint

**Commands**:
```bash
# Get Analytics API describe
curl -X GET "https://acme-corpmain--staging.sandbox.my.salesforce.com/services/data/v64.0/analytics/dashboards/describe" \
  -H "Authorization: Bearer $SF_ACCESS_TOKEN"

# Alternative: Use REST Explorer in Workbench
# 1. Go to Workbench → utilities → REST Explorer
# 2. GET /services/data/v64.0/analytics/dashboards/describe
```

**Expected Output**: Schema showing required/optional fields for components

#### Step 3: Test Minimal Component Structure

**Goal**: Find the minimum viable component configuration

**Test Cases**:

```javascript
// Test 1: Minimal component with only required fields
{
    "name": "Test Dashboard",
    "folderId": "00l8c000002Sa3zAAC",
    "components": [
        {
            "reportId": "00Odx000001XfOnEAK"
        }
    ]
}

// Test 2: Component with componentType only
{
    "name": "Test Dashboard",
    "folderId": "00l8c000002Sa3zAAC",
    "components": [
        {
            "reportId": "00Odx000001XfOnEAK",
            "componentType": "Bar"
        }
    ]
}

// Test 3: Different properties structure
{
    "name": "Test Dashboard",
    "folderId": "00l8c000002Sa3zAAC",
    "components": [
        {
            "reportId": "00Odx000001XfOnEAK",
            "componentType": "Report",  // Note: "Report" not "Bar"
            "size": "MEDIUM"
        }
    ]
}
```

**Execution**:
```bash
# Create test script
cat > test-dashboard-component.js << 'EOF'
const ReportsRestAPI = require('./scripts/lib/reports-rest-api');

async function testDashboardComponent() {
    const api = new ReportsRestAPI('ACME_SANDBOX');
    await api.initialize();

    const testCases = [
        {
            name: "Test Case 1: Minimal",
            payload: {
                name: "Test Dashboard 1",
                folderId: "00l8c000002Sa3zAAC",
                components: [{ reportId: "00Odx000001XfOnEAK" }]
            }
        },
        {
            name: "Test Case 2: With Type",
            payload: {
                name: "Test Dashboard 2",
                folderId: "00l8c000002Sa3zAAC",
                components: [{
                    reportId: "00Odx000001XfOnEAK",
                    componentType: "Bar"
                }]
            }
        }
    ];

    for (const test of testCases) {
        console.log(`\nTesting: ${test.name}`);
        try {
            const result = await api.apiRequest(
                '/services/data/v64.0/analytics/dashboards',
                'POST',
                test.payload
            );
            console.log('✅ Success:', result.id);
        } catch (error) {
            console.log('❌ Failed:', error.message);
            if (error.body) {
                console.log('   Details:', JSON.stringify(error.body, null, 2));
            }
        }
    }
}

testDashboardComponent().catch(console.error);
EOF

# Run test
ORG=ACME_SANDBOX node test-dashboard-component.js
```

#### Step 4: Research Salesforce Documentation

**Resources to Check**:

1. **Analytics REST API Guide**:
   - URL: https://developer.salesforce.com/docs/atlas.en-us.api_analytics.meta/api_analytics/
   - Section: "Dashboard Resources"
   - Look for: Component schema, example payloads

2. **Analytics API Reference**:
   - URL: https://developer.salesforce.com/docs/atlas.en-us.api_rest.meta/api_rest/resources_analytics_dashboards.htm
   - Check: POST dashboard payload structure

3. **Trailhead/Community**:
   - Search: "Analytics REST API dashboard components"
   - Check: Developer forums for working examples

4. **Salesforce Workbench**:
   - Use REST Explorer to test different payloads interactively
   - Inspect successful dashboard creation responses

#### Step 5: Alternative API - Metadata API

**Goal**: Test dashboard deployment via Metadata API as fallback

**Approach**:
```xml
<!-- package.xml -->
<?xml version="1.0" encoding="UTF-8"?>
<Package xmlns="http://soap.sforce.com/2006/04/metadata">
    <types>
        <members>Test_Dashboard</members>
        <name>Dashboard</name>
    </types>
    <version>64.0</version>
</Package>

<!-- dashboards/Test_Dashboard.dashboard -->
<?xml version="1.0" encoding="UTF-8"?>
<Dashboard xmlns="http://soap.sforce.com/2006/04/metadata">
    <backgroundEndColor>#FFFFFF</backgroundEndColor>
    <backgroundFadeDirection>Diagonal</backgroundFadeDirection>
    <backgroundStartColor>#FFFFFF</backgroundStartColor>
    <dashboardType>SpecifiedUser</dashboardType>
    <isGridLayout>true</isGridLayout>
    <runningUser>admin@company.com</runningUser>
    <textColor>#000000</textColor>
    <title>Test Dashboard</title>
    <titleColor>#000000</titleColor>
    <titleSize>12</titleSize>
    <dashboardGridLayout>
        <dashboardGridComponents>
            <colSpan>6</colSpan>
            <columnIndex>0</columnIndex>
            <dashboardComponent>
                <autoselectColumnsFromReport>false</autoselectColumnsFromReport>
                <componentType>Bar</componentType>
                <displayUnits>Auto</displayUnits>
                <footer>Opportunities by Stage</footer>
                <header>Opportunities by Stage</header>
                <indicatorBreakpoint1>33.0</indicatorBreakpoint1>
                <indicatorBreakpoint2>67.0</indicatorBreakpoint2>
                <indicatorHighColor>#54C254</indicatorHighColor>
                <indicatorLowColor>#C25454</indicatorLowColor>
                <indicatorMiddleColor>#C2C254</indicatorMiddleColor>
                <report>Opportunities_by_Stage_This_Quarter</report>
                <showPicturesOnCharts>false</showPicturesOnCharts>
                <sortBy>RowLabelAscending</sortBy>
            </dashboardComponent>
            <rowIndex>0</rowIndex>
            <rowSpan>12</rowSpan>
        </dashboardGridComponents>
    </dashboardGridLayout>
</Dashboard>
```

**Test Deployment**:
```bash
# Create metadata structure
mkdir -p metadata/dashboards

# Copy XML above to metadata/dashboards/Test_Dashboard.dashboard-meta.xml

# Deploy
sf project deploy start --metadata-dir metadata --target-org ACME_SANDBOX
```

### Potential Solutions

#### Solution 1: Use POST /dashboards Then PATCH /dashboards/{id}

**Hypothesis**: Components may need to be added via PATCH after dashboard creation

**Test**:
```javascript
// Step 1: Create empty dashboard
const createResponse = await api.apiRequest(
    '/services/data/v64.0/analytics/dashboards',
    'POST',
    {
        name: "Test Dashboard",
        folderId: "00l8c000002Sa3zAAC"
    }
);

// Step 2: Add components via PATCH
const dashboardId = createResponse.id;
const patchResponse = await api.apiRequest(
    `/services/data/v64.0/analytics/dashboards/${dashboardId}`,
    'PATCH',
    {
        components: [
            {
                reportId: "00Odx000001XfOnEAK",
                componentType: "Bar",
                properties: { height: 12, width: 6, left: 0, top: 0 }
            }
        ]
    }
);
```

**Effort**: Low (1-2 hours)
**Success Probability**: Medium

#### Solution 2: Use Dashboard Studio API (if exists)

**Hypothesis**: There may be a separate Dashboard Studio endpoint for component management

**Investigation**:
```bash
# Search for Dashboard Studio endpoints
curl -X GET "https://acme-corpmain--staging.sandbox.my.salesforce.com/services/data/v64.0/" \
  -H "Authorization: Bearer $SF_ACCESS_TOKEN" | jq '.[] | select(.name | contains("dashboard"))'
```

**Effort**: Low (1-2 hours)
**Success Probability**: Low (may not exist)

#### Solution 3: Metadata API Dashboard Deployment

**Approach**: Use Metadata API XML deployment for complete dashboard automation

**Pros**:
- Full control over dashboard structure
- Proven to work (UI uses this)
- Complete component configuration

**Cons**:
- More complex implementation
- XML-based (not JSON)
- Slower deployment
- Requires metadata packaging

**Effort**: High (2-3 days)
**Success Probability**: High (guaranteed to work)

#### Solution 4: Hybrid - Create Dashboard + Document UI Steps

**Approach**: Automate dashboard creation, provide detailed UI instructions for components

**Implementation**:
1. Create dashboard programmatically (works now)
2. Return dashboard ID and URL
3. Provide step-by-step UI instructions:
   ```
   Dashboard created: Test Report Validation Dashboard
   URL: https://your-instance.salesforce.com/01Zdx000002XKQYEA4

   To add components:
   1. Click "Edit Dashboard"
   2. Click "+ Component"
   3. Select Report: "Opportunities by Stage (This Quarter)"
   4. Choose Chart Type: Bar Chart
   5. Position and resize as needed
   6. Click "Save"
   ```

**Pros**:
- Unblocks users immediately
- Simple implementation
- Works with current code

**Cons**:
- Not fully automated
- Requires manual steps

**Effort**: Low (2-4 hours for documentation)
**Success Probability**: High (guaranteed to work)

### Recommended Next Steps

**Phase 1: Quick Wins** (2-4 hours)
1. Query existing dashboard structure (Step 1)
2. Test PATCH approach (Solution 1)
3. Document UI workflow (Solution 4)

**Phase 2: Research** (4-6 hours)
4. Review Salesforce documentation (Step 4)
5. Test minimal component structures (Step 3)
6. Investigate Dashboard Studio API (Solution 2)

**Phase 3: Fallback** (2-3 days, if needed)
7. Implement Metadata API approach (Solution 3)

**Recommended Priority**: Start with Phase 1, provides immediate value

---

## Blocker #2: TABULAR Report ID Extraction

**Status**: 🟡 BLOCKED - Low Complexity
**Priority**: Low
**Impact**: TABULAR report URLs show "undefined", reports are created successfully

### Problem Statement

TABULAR report creation succeeds but the report ID extraction fails, resulting in URLs with "undefined" instead of the actual report ID.

### What Works

```javascript
// ✅ Report is created successfully
const response = await api.createReport(tabularMetadata);
// Response contains report data, but ID location differs from SUMMARY
```

### What's Blocked

```javascript
// ❌ ID extraction fails
const reportId = response.attributes?.reportId || response.id;
// Returns: undefined

// Results in bad URL:
"https://instance.salesforce.com/lightning/r/Report/undefined/view"
```

### Technical Investigation

#### Step 1: Log Full TABULAR Response

**Goal**: Identify where the report ID is located in TABULAR report responses

**Implementation**:
```javascript
// Modify scripts/lib/reports-rest-api.js
async createReport(reportMetadata) {
    const endpoint = `/services/data/${this.apiVersion}/analytics/reports`;

    try {
        const response = await this.apiRequest(endpoint, 'POST', { reportMetadata });

        // Log full response for TABULAR reports
        if (reportMetadata.reportFormat === 'TABULAR') {
            console.log('\n🔍 TABULAR Report Response Structure:');
            console.log(JSON.stringify(response, null, 2));
        }

        return response;
    } catch (error) {
        throw error;
    }
}
```

**Test**:
```bash
# Deploy TABULAR test report
ORG=ACME_SANDBOX node scripts/lib/report-template-deployer.js \
  --template templates/reports/test-suite/03-tabular-basic.json \
  --org ACME_SANDBOX

# Check output for response structure
```

**Expected Locations to Check**:
- `response.id`
- `response.reportId`
- `response.attributes.reportId`
- `response.attributes.id`
- `response.reportMetadata.id`
- `response.reportExtendedMetadata.id`
- `response.report.id`

#### Step 2: Compare SUMMARY vs TABULAR Responses

**Goal**: Document structural differences between formats

**Test Script**:
```javascript
const ReportsRestAPI = require('./scripts/lib/reports-rest-api');

async function compareResponseStructures() {
    const api = new ReportsRestAPI('ACME_SANDBOX');
    await api.initialize();

    // Create SUMMARY report
    console.log('\n=== SUMMARY Report ===');
    const summaryResponse = await api.createReport({
        name: "Test SUMMARY",
        reportType: "Opportunity",
        reportFormat: "SUMMARY",
        folderId: "00l8c000002Sa3zAAC",
        detailColumns: ["OPPORTUNITY_NAME"],
        groupingsDown: [{ field: "STAGE_NAME" }],
        aggregates: ["RowCount"]
    });

    console.log('Keys:', Object.keys(summaryResponse));
    console.log('ID Locations:');
    console.log('  response.id:', summaryResponse.id);
    console.log('  response.reportId:', summaryResponse.reportId);
    console.log('  response.attributes?.reportId:', summaryResponse.attributes?.reportId);

    // Create TABULAR report
    console.log('\n=== TABULAR Report ===');
    const tabularResponse = await api.createReport({
        name: "Test TABULAR",
        reportType: "Opportunity",
        reportFormat: "TABULAR",
        folderId: "00l8c000002Sa3zAAC",
        detailColumns: ["OPPORTUNITY_NAME", "AMOUNT"]
    });

    console.log('Keys:', Object.keys(tabularResponse));
    console.log('ID Locations:');
    console.log('  response.id:', tabularResponse.id);
    console.log('  response.reportId:', tabularResponse.reportId);
    console.log('  response.attributes?.reportId:', tabularResponse.attributes?.reportId);
}

compareResponseStructures().catch(console.error);
```

#### Step 3: Test Alternative ID Extraction Methods

**Implementation**:
```javascript
// Enhanced ID extraction with fallback chain
extractReportId(response, reportFormat) {
    // Log for debugging
    const idLocations = {
        'response.id': response.id,
        'response.reportId': response.reportId,
        'response.attributes?.reportId': response.attributes?.reportId,
        'response.attributes?.id': response.attributes?.id,
        'response.reportMetadata?.id': response.reportMetadata?.id,
        'response.report?.id': response.report?.id
    };

    console.log(`🔍 ID locations for ${reportFormat}:`, idLocations);

    // Try format-specific extraction first
    if (reportFormat === 'TABULAR') {
        return response.id ||
               response.reportId ||
               response.reportMetadata?.id ||
               response.attributes?.id;
    } else if (reportFormat === 'SUMMARY') {
        return response.attributes?.reportId ||
               response.id ||
               response.reportId;
    }

    // Universal fallback
    return response.attributes?.reportId ||
           response.id ||
           response.reportId ||
           response.reportMetadata?.id ||
           response.attributes?.id;
}
```

### Solution

**Once ID location is identified**, update extraction logic:

```javascript
// In scripts/lib/report-template-deployer.js
async createReportDirect(reportMetadata, options = {}) {
    // ... existing code ...

    try {
        const response = await this.api.apiRequest(endpoint, 'POST', { reportMetadata });

        // Enhanced ID extraction
        const reportId = this.extractReportId(response, reportMetadata.reportFormat);

        if (!reportId) {
            console.warn('⚠️  Could not extract report ID from response');
            console.warn('   Response keys:', Object.keys(response));
            throw new Error('Report created but ID extraction failed');
        }

        return {
            reportId: reportId,
            reportName: response.attributes?.reportName || reportMetadata.name,
            url: `${this.api.instanceUrl}/lightning/r/Report/${reportId}/view`
        };
    } catch (error) {
        // ... existing error handling ...
    }
}

extractReportId(response, reportFormat) {
    // Implementation from Step 3
}
```

### Recommended Next Steps

**Phase 1: Identify** (30 minutes)
1. Log full TABULAR response structure (Step 1)
2. Identify ID location

**Phase 2: Fix** (30 minutes)
3. Update extraction logic
4. Test with TABULAR report
5. Verify URL generation

**Phase 3: Validate** (30 minutes)
6. Test with both SUMMARY and TABULAR
7. Update documentation

**Total Effort**: 1.5 hours
**Success Probability**: Very High (simple fix once location identified)

---

## Blocker #3: Template Variable Support

**Status**: 🟡 BLOCKED - Unknown Complexity
**Priority**: Low
**Impact**: Dynamic filters (user context, role hierarchy) require manual addition

### Problem Statement

Template variables like `$User.ManagerId.Team` are currently skipped during deployment. This prevents dynamic filtering based on running user context.

### What's Blocked

```json
{
  "reportFilters": [
    {
      "column": "TEAM",
      "operator": "equals",
      "value": "$User.ManagerId.Team"
    }
  ]
}
```

**Current Behavior**:
```
⚠️  Skipping filter with template variable: $User.ManagerId.Team
```

**Desired Behavior**: Filter applied and evaluates dynamically per user viewing the report

### Use Cases

**Common Template Variables**:
- `$User.Id` - Current user's ID
- `$User.ManagerId` - Current user's manager
- `$User.Role` - Current user's role name
- `$User.Department` - Current user's department
- `$User.Team` - Current user's team
- Relationship traversals: `$User.ManagerId.Team`, `$User.Role.RollupDescription`

**Example Use Case**: "Show opportunities for my team"
```json
{
  "reportFilters": [
    {
      "column": "OWNER_ROLE",
      "operator": "equals",
      "value": "$User.Role"
    }
  ]
}
```

### Technical Investigation

#### Step 1: Test Direct Variable Pass-Through

**Goal**: Determine if Salesforce API accepts template variables as-is

**Test**:
```javascript
// Test 1: Pass variable directly in filter value
const testMetadata = {
    name: "Test Variable Filter",
    reportType: "Opportunity",
    reportFormat: "SUMMARY",
    folderId: "00l8c000002Sa3zAAC",
    detailColumns: ["OPPORTUNITY_NAME", "AMOUNT"],
    groupingsDown: [{ field: "STAGE_NAME" }],
    aggregates: ["RowCount"],
    reportFilters: [
        {
            column: "OWNER_ID",
            operator: "equals",
            value: "$User.Id"  // Template variable
        }
    ]
};

// Deploy and check result
const result = await api.createReport(testMetadata);
```

**Expected Outcomes**:
1. ✅ **Accepted**: Filter stored as `$User.Id`, evaluates dynamically
2. ❌ **Rejected**: Error about invalid filter value
3. ⚠️ **Accepted but literal**: Filter stored as string "$User.Id" (treated as literal text)

**Test Script**:
```bash
cat > test-template-variables.js << 'EOF'
const ReportsRestAPI = require('./scripts/lib/reports-rest-api');

async function testTemplateVariables() {
    const api = new ReportsRestAPI('ACME_SANDBOX');
    await api.initialize();

    const variables = [
        { name: "$User.Id", column: "OWNER_ID" },
        { name: "$User.Role", column: "OWNER_ROLE" },
        { name: "$User.ManagerId", column: "REPORTS_TO_ID" }
    ];

    for (const variable of variables) {
        console.log(`\nTesting: ${variable.name}`);
        try {
            const result = await api.createReport({
                name: `Test ${variable.name}`,
                reportType: "Opportunity",
                reportFormat: "TABULAR",
                folderId: "00l8c000002Sa3zAAC",
                detailColumns: ["OPPORTUNITY_NAME"],
                reportFilters: [{
                    column: variable.column,
                    operator: "equals",
                    value: variable.name
                }]
            });
            console.log('✅ Accepted:', result.reportId);

            // Query back the filter to see how it's stored
            const describe = await api.apiRequest(
                `/services/data/v64.0/analytics/reports/${result.reportId}/describe`
            );
            const appliedFilter = describe.reportMetadata.reportFilters.find(
                f => f.column === variable.column
            );
            console.log('   Stored as:', appliedFilter?.value);

        } catch (error) {
            console.log('❌ Rejected:', error.message);
        }
    }
}

testTemplateVariables().catch(console.error);
EOF

ORG=ACME_SANDBOX node test-template-variables.js
```

#### Step 2: Research Salesforce Documentation

**Resources to Check**:

1. **Report Filters Documentation**:
   - URL: https://developer.salesforce.com/docs/atlas.en-us.api_analytics.meta/api_analytics/sforce_analytics_rest_api_report_filters.htm
   - Look for: Dynamic filter values, merge fields

2. **Reports and Dashboards Developer Guide**:
   - URL: https://developer.salesforce.com/docs/atlas.en-us.reports.meta/reports/
   - Search: "dynamic filters", "user context", "running user"

3. **Community/Forums**:
   - Search: "Analytics REST API user context filter"
   - Check: Success stories or confirmed limitations

#### Step 3: Test Alternative Approaches

**Approach A: Runtime Variable Resolution**

**Implementation**:
```javascript
// Resolve variables at deployment time
async resolveTemplateVariable(variable, orgAlias) {
    // Query user context
    const userQuery = await this.api.query(
        `SELECT Id, ManagerId, UserRoleId FROM User WHERE Username = '${process.env.SF_USERNAME}'`
    );

    const user = userQuery.records[0];

    // Resolve variable
    const resolutions = {
        '$User.Id': user.Id,
        '$User.ManagerId': user.ManagerId,
        '$User.Role': user.UserRoleId
    };

    return resolutions[variable] || variable;
}

// Use during filter mapping
if (filter.value && filter.value.startsWith('$')) {
    const resolved = await this.resolveTemplateVariable(filter.value, options.orgAlias);
    filter.value = resolved;
    console.log(`   🔄 Resolved ${filter.value} → ${resolved}`);
}
```

**Pros**:
- Works immediately
- No API limitations

**Cons**:
- Fixed to deployment user (not dynamic per viewer)
- Requires re-deployment to change

**Approach B: Use Report Running User**

**Implementation**:
```javascript
// Set runningUser in report metadata
{
    "reportMetadata": {
        "name": "My Team Opportunities",
        "runningUser": "$User"  // Dynamic running user
        // ... rest of metadata
    }
}
```

**Test**: Check if this enables dynamic filtering

**Approach C: Document Manual Addition**

**If API doesn't support**, provide clear documentation:

```markdown
## Adding Dynamic Filters

Template variables cannot be added programmatically. Add manually:

1. Open report in Salesforce
2. Click "Edit"
3. Add Filter:
   - Field: Owner ID
   - Operator: equals
   - Value: Click "Insert field" → Select "Running User ID"
4. Save

Result: Filter dynamically evaluates per user viewing report
```

### Recommended Next Steps

**Phase 1: Test Pass-Through** (1 hour)
1. Test passing variables directly to API (Step 1)
2. Check if variables are stored and evaluated

**Phase 2: Research** (2 hours)
3. Review Salesforce documentation (Step 2)
4. Check community for working examples

**Phase 3: Solution** (varies)
- If API supports: Update code to pass variables (30 minutes)
- If API doesn't support: Document manual addition (1 hour)
- If needs resolution: Implement runtime resolution (3-4 hours)

**Total Effort**: 3-7 hours (depending on outcome)
**Success Probability**: Medium (API support unclear)

---

## Priority Matrix

| Blocker | Priority | Impact | Effort | Success Probability |
|---------|----------|--------|--------|---------------------|
| Dashboard Components | Medium | Medium | High (2-3 days) | Medium |
| TABULAR ID Extraction | Low | Low | Low (1.5 hours) | Very High |
| Template Variables | Low | Low | Medium (3-7 hours) | Medium |

## Recommended Investigation Order

1. **TABULAR ID Extraction** - Quick win, high success probability
2. **Template Variables** - Medium effort, good learning opportunity
3. **Dashboard Components** - Highest complexity, defer until other blockers resolved

## Timeline Estimate

- **Week 1**: TABULAR fix + Template variable investigation
- **Week 2**: Dashboard component investigation + documentation
- **Week 3**: Implementation of chosen dashboard solution

---

## Success Criteria

### TABULAR ID Extraction
- [ ] Full response structure documented
- [ ] ID extraction logic updated
- [ ] URLs generate correctly for TABULAR reports
- [ ] Tests pass for both SUMMARY and TABULAR

### Template Variables
- [ ] API capability determined (supports/doesn't support)
- [ ] If supported: Implementation complete and tested
- [ ] If not supported: Clear documentation provided
- [ ] Example templates with variables created

### Dashboard Components
- [ ] API structure fully understood
- [ ] Either: Working implementation OR comprehensive UI documentation
- [ ] Test suite covers dashboard creation scenarios
- [ ] Decision documented (REST API vs Metadata API vs Hybrid)

---

**Last Updated**: 2025-01-17
**Next Review**: After completing TABULAR investigation
