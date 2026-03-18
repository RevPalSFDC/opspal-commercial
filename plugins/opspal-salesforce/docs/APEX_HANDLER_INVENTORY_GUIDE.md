# Apex Handler & Trigger Inventory Guide

## Overview

The Apex Handler & Trigger Inventory feature provides comprehensive analysis of Apex triggers and their associated handler classes, helping you understand patterns, risks, and migration considerations for your Salesforce automation.

**Version**: v3.31.0
**Introduced**: 2025-10-29
**Part of**: Salesforce Automation Audit System

## What It Does

The handler inventory system:

1. **Identifies all Apex triggers** in your org
2. **Detects handler class associations** using pattern matching
3. **Analyzes handler code** for risks and patterns
4. **Classifies migration impact** (LOW/MEDIUM/HIGH)
5. **Extracts test coverage** per handler class
6. **Generates reports** in JSON, CSV, and Markdown formats

## Output Files

When you run an automation audit, the system generates four new files:

### 1. apex-handler-inventory.json
**Purpose**: Complete structured data for programmatic access

**Contains**:
- Full trigger-to-handler associations
- Static analysis results per handler
- Event methods detected
- Objects touched and queried
- Async work patterns
- Platform events published
- Hard-coded IDs found
- Bulk safety findings
- Test coverage data

**Example**:
```json
{
  "objectName": "Account",
  "triggerName": "AccountTrigger",
  "triggerEvents": ["before insert", "after update"],
  "isActive": true,
  "apiVersion": 58.0,
  "handlerClasses": [{
    "className": "AccountTriggerHandler",
    "baseClass": "TriggerHandler",
    "eventMethods": ["beforeInsert", "afterUpdate"],
    "touchesObjects": ["Account", "Contact"],
    "queriesObjects": ["User"],
    "doesCallout": false,
    "asyncWork": ["Queueable"],
    "publishesEvents": [],
    "externalConfig": ["CustomMetadata:Trigger_Config__mdt"],
    "hardCodedIds": [],
    "bulkSafetyFindings": ["OK: No DML inside loops", "OK: No SOQL inside loops"],
    "testClasses": [],
    "approxCoverage": 85,
    "migrationImpact": "MEDIUM"
  }]
}
```

### 2. Apex_Handler_Inventory.csv
**Purpose**: Sortable/filterable analysis in Excel/Google Sheets

**Columns**:
- Object - Salesforce object the trigger operates on
- Trigger - Apex trigger name
- Events - Trigger events (before insert, after update, etc.)
- Active - Whether trigger is active
- API Version - Apex API version
- Handler - Handler class name (or "Inline Logic" if no handler)
- BaseClass - Base class extended (TriggerHandler, fflib, etc.)
- Callouts - Whether handler makes HTTP callouts
- Async - Async patterns used (Future, Queueable, Batchable, Schedulable)
- BulkSafe - Bulk safety status (OK, RISK, CHECK)
- HardCodedIDs - Count of hard-coded Salesforce IDs found
- Coverage% - Test coverage percentage
- MigrationImpact - Risk level (LOW/MEDIUM/HIGH)

**Use Cases**:
```
Filter by HIGH MigrationImpact → Identify complex handlers
Filter by BulkSafe = RISK → Find governor limit risks
Sort by Coverage% ascending → Find low test coverage
Filter by Object = Account → See all Account automation
```

### 3. Handler_Trigger_Associations.csv
**Purpose**: Cross-reference showing handler reuse patterns

**Columns**:
- Handler Class - Handler class name
- Base Class - Base class extended
- Event Methods - Methods implemented (beforeInsert, afterUpdate, etc.)
- Triggers - All triggers using this handler
- Objects - All objects this handler operates on
- Migration Impact - Overall risk level
- Coverage% - Test coverage percentage

**Use Cases**:
```
Find multi-object handlers → Filter where Objects contains ","
Identify shared handlers → Filter where Triggers contains ","
Review handler patterns → Group by Base Class
```

### 4. handler-analysis-summary.md
**Purpose**: Human-readable analysis and recommendations

**Sections**:
1. **Executive Summary** - Counts and key findings
2. **Handler Pattern Summary** - Base class distribution
3. **Risk Classification** - HIGH/MEDIUM/LOW breakdowns with reasons
4. **Migration Priority List** - Top 20 handlers sorted by complexity
5. **Governor Limit Risks** - Bulk safety issues detected
6. **Best Practices** - Recommendations for improvement
7. **Handler-Trigger Matrix** - Association overview

## Understanding Migration Impact

The system calculates migration impact (LOW/MEDIUM/HIGH) based on:

### HIGH Risk (Score ≥ 6)
**Characteristics**:
- Makes HTTP callouts
- Contains hard-coded Salesforce IDs
- Has DML or SOQL inside loops
- Multiple high-risk factors

**Recommendation**: Keep as Apex, focus on optimization

### MEDIUM Risk (Score 3-5)
**Characteristics**:
- Uses async patterns (@future, Queueable)
- Publishes platform events
- Touches multiple objects
- Moderate complexity

**Recommendation**: May require hybrid approach (Flow + Apex Invocable)

### LOW Risk (Score < 3)
**Characteristics**:
- Simple field updates
- No callouts or async work
- Bulk-safe patterns
- Good test coverage

**Recommendation**: Good candidates for Flow migration

## Using the Reports

### Scenario 1: Planning Flow Migration

**Goal**: Identify triggers that can be converted to Flows

**Steps**:
1. Open `Apex_Handler_Inventory.csv`
2. Filter `MigrationImpact` = "LOW"
3. Filter `BulkSafe` = "OK"
4. Sort by `Coverage%` descending (prioritize well-tested)
5. Review `handler-analysis-summary.md` for detailed recommendations

### Scenario 2: Finding Governor Limit Risks

**Goal**: Identify handlers with potential governor limit issues

**Steps**:
1. Open `Apex_Handler_Inventory.csv`
2. Filter `BulkSafe` = "RISK"
3. Review `handler-analysis-summary.md` → "Governor Limit Risks" section
4. Prioritize by object (focus on high-volume objects first)

### Scenario 3: Improving Test Coverage

**Goal**: Find handlers with insufficient test coverage

**Steps**:
1. Open `Apex_Handler_Inventory.csv`
2. Sort by `Coverage%` ascending
3. Filter `Coverage%` < 75
4. Create test improvement plan starting with HIGH impact handlers

### Scenario 4: Consolidating Handler Patterns

**Goal**: Standardize on a single handler pattern

**Steps**:
1. Open `handler-analysis-summary.md`
2. Review "Handler Pattern Summary" section
3. Note base class distribution
4. Open `Handler_Trigger_Associations.csv`
5. Identify handlers without standard base class (BaseClass = "None")
6. Plan refactoring to consistent pattern (e.g., TriggerHandler)

### Scenario 5: Detecting Multi-Object Handlers

**Goal**: Find handlers serving multiple objects (potential anti-pattern)

**Steps**:
1. Open `Handler_Trigger_Associations.csv`
2. Filter where `Objects` contains "," (comma indicates multiple)
3. Review "Handler-Trigger Association Matrix" in analysis report
4. Evaluate if multi-object usage is intentional or should be refactored

## Static Analysis Capabilities

The system performs comprehensive static analysis on each handler:

### Async Work Detection
**Patterns Detected**:
- `@future` methods
- `implements Queueable`
- `implements Database.Batchable`
- `implements Schedulable`
- `System.enqueueJob()` calls
- `Database.executeBatch()` calls

**Why It Matters**: Async handlers have different governor limits and require special testing

### Callout Detection
**Patterns Detected**:
- `HttpRequest` / `HttpResponse`
- `@future(callout=true)`
- `Continuation` patterns
- `callout:` named credentials

**Why It Matters**: Callouts require async context, affect transaction length, and need special error handling

### Hard-Coded ID Detection
**Patterns Detected**:
- 15-character Salesforce IDs
- 18-character Salesforce IDs

**Why It Matters**: Hard-coded IDs break in different orgs (sandbox, production, scratch orgs)

### Bulk Safety Checks
**Patterns Detected**:
- DML inside `for` or `while` loops
- SOQL queries inside `for` or `while` loops

**Why It Matters**: These patterns hit governor limits in bulk operations

### External Configuration
**Patterns Detected**:
- Custom Metadata Types (`__mdt`)
- Custom Settings with `.getInstance()`

**Why It Matters**: Indicates flexible, org-specific configuration rather than hard-coded values

### Platform Events
**Patterns Detected**:
- `EventBus.publish()` calls
- Platform Event types (`__e`)

**Why It Matters**: Creates async automation chains that need special consideration

## Best Practices

### 1. Review HIGH Risk Handlers First

Start with handlers classified as HIGH risk:
```
Open: Apex_Handler_Inventory.csv
Filter: MigrationImpact = "HIGH"
Action: Review each handler for optimization opportunities
```

### 2. Eliminate Hard-Coded IDs

Hard-coded IDs are migration blockers:
```
Open: Apex_Handler_Inventory.csv
Filter: HardCodedIDs > 0
Action: Replace with dynamic queries or Custom Metadata
```

### 3. Fix Bulk Safety Issues

Address governor limit risks before migration:
```
Open: handler-analysis-summary.md
Section: Governor Limit Risks
Action: Refactor DML/SOQL outside loops
```

### 4. Standardize on Handler Pattern

Use a consistent base class:
```
Open: Handler_Trigger_Associations.csv
Review: BaseClass column
Action: Refactor to TriggerHandler or fflib_SObjectDomain
```

### 5. Improve Test Coverage

Ensure adequate testing before changes:
```
Open: Apex_Handler_Inventory.csv
Filter: Coverage% < 75
Action: Add test classes to improve coverage
```

## Integration with Automation Audit

The handler inventory is part of the comprehensive automation audit:

**Command**: `/audit-automation [org-alias]`

**Full Output Includes**:
- Base automation inventory (triggers, flows, processes, workflows)
- Namespace analysis (managed packages)
- Validation rules audit
- Business process classification
- Cascade mapping
- Migration recommendations
- Risk-based implementation plan
- **Handler inventory (NEW in v3.31.0)**

All reports work together to provide complete automation visibility.

## Troubleshooting

### Issue: No handlers detected

**Possible Causes**:
- Triggers use inline logic (no handler pattern)
- Handler classes don't follow naming conventions
- Managed package handlers (not queryable)

**Solution**:
- Review `apex-handler-inventory.json` for triggers with `"className": null`
- Check `handler-analysis-summary.md` for inline trigger count
- Consider refactoring to handler pattern for better maintainability

### Issue: Handler class not found

**Possible Causes**:
- Handler is in managed package
- Handler class was deleted
- Handler references external class

**Solution**:
- Review trigger body manually
- Check if handler is from installed package
- Verify handler class exists in org

### Issue: Low coverage reported

**Possible Causes**:
- Tests not covering all handler methods
- Code coverage data not current
- Async methods not tested with `Test.startTest()`/`Test.stopTest()`

**Solution**:
- Run all tests: `sf apex run test --wait 10 --test-level RunLocalTests`
- Review test classes
- Add tests for uncovered scenarios

## Technical Details

### Detection Methods

The system uses three pattern-matching techniques:

1. **Instantiation**: `new HandlerClassName()`
2. **Static Method**: `HandlerClassName.methodName()`
3. **Variable Assignment**: `HandlerClass handler = new HandlerClass()`

### Analysis Process

1. Query all `ApexTrigger` records
2. Query candidate `ApexClass` records (Name LIKE '%Handler%' OR '%Trigger%')
3. Retrieve trigger bodies via Tooling API
4. Retrieve class bodies via Tooling API
5. Parse trigger bodies for handler references
6. Analyze handler bodies for patterns
7. Retrieve test coverage from `ApexCodeCoverageAggregate`
8. Calculate migration impact scores
9. Generate JSON, CSV, and Markdown outputs

### Performance

Typical execution time:
- Small org (< 50 triggers): 30-60 seconds
- Medium org (50-200 triggers): 2-4 minutes
- Large org (> 200 triggers): 5-10 minutes

## Related Documentation

- **Automation Audit Guide**: `.claude-plugins/opspal-salesforce/docs/AUTOMATION_AUDIT_GUIDE.md` (if exists)
- **Agent Documentation**: `.claude-plugins/opspal-salesforce/agents/sfdc-automation-auditor.md`
- **Orchestrator Script**: `.claude-plugins/opspal-salesforce/scripts/lib/automation-audit-v2-orchestrator.js`
- **Detection Script**: `.claude-plugins/opspal-salesforce/scripts/lib/apex-handler-detector.js`
- **Analysis Script**: `.claude-plugins/opspal-salesforce/scripts/lib/handler-static-analyzer.js`

## Support

For issues or questions:
- GitHub Issues: https://github.com/RevPalSFDC/opspal-plugin-internal-marketplace/issues
- Reflection System: Use `/reflect` to submit feedback
- Community: RevPal Slack Channel

---

**Last Updated**: 2025-10-29
**Version**: 3.31.0
**Maintained By**: RevPal Engineering
