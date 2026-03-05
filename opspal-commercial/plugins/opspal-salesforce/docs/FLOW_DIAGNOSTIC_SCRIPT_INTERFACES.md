# Flow Diagnostic Script Interfaces v3.43.0

**Purpose**: Define interface contracts for 6 diagnostic script modules before implementation
**Audience**: Plugin developers, script implementers, integration engineers
**Status**: Specification (Phase 1) - Implementation in Phase 2

---

## Overview

This document specifies the public APIs, data structures, and contracts for 6 diagnostic modules that power the Flow Testing & Diagnostic Framework (Runbook 7).

**Design Principles**:
1. **Composability** - Modules can be used independently or orchestrated
2. **Consistency** - All modules follow same error handling and output patterns
3. **Testability** - Clear input/output contracts enable comprehensive testing
4. **Observability** - All modules emit structured logs for Living Runbook System
5. **Instance-Agnostic** - Zero hardcoded values, all metadata queried dynamically

**Module Dependencies**:
```
flow-diagnostic-orchestrator.js (orchestrates)
  ├── flow-preflight-checker.js (validates readiness)
  ├── flow-executor.js (runs Flows)
  ├── flow-log-parser.js (analyzes debug logs)
  ├── flow-state-snapshot.js (captures state changes)
  └── flow-branch-analyzer.js (tracks coverage)
```

---

## 1. FlowPreflightChecker

**File**: `scripts/lib/flow-preflight-checker.js`
**Purpose**: Automated pre-flight validation before Flow execution or deployment

### Constructor

```javascript
const { FlowPreflightChecker } = require('./scripts/lib/flow-preflight-checker');

const checker = new FlowPreflightChecker(orgAlias, options);
```

**Parameters**:
- `orgAlias` (string, required) - Salesforce org alias (e.g., 'gamma-corp', 'production')
- `options` (object, optional):
  ```javascript
  {
    verbose: false,           // Enable detailed logging
    timeout: 120000,          // Operation timeout (ms)
    skipConnectivityCheck: false, // Skip initial connectivity validation
    autoSetupLogging: true    // Automatically configure debug logging
  }
  ```

### Public Methods

#### checkConnectivity()

Verify authentication to target Salesforce org.

```javascript
const result = await checker.checkConnectivity();
```

**Returns**: `Promise<ConnectivityResult>`
```typescript
interface ConnectivityResult {
  success: boolean;
  orgId?: string;
  orgType?: 'Sandbox' | 'Production' | 'Scratch';
  username?: string;
  apiVersion?: string;
  error?: string;
  timestamp: string;
}
```

**Example Output**:
```json
{
  "success": true,
  "orgId": "00D1234567890ABC",
  "orgType": "Sandbox",
  "username": "admin@company.com.sandbox",
  "apiVersion": "v62.0",
  "timestamp": "2025-11-12T14:30:00Z"
}
```

---

#### checkFlowMetadata(flowApiName)

Retrieve and validate Flow definition.

```javascript
const result = await checker.checkFlowMetadata('Account_Validation_Flow');
```

**Parameters**:
- `flowApiName` (string, required) - Flow API name (DeveloperName)

**Returns**: `Promise<FlowMetadataResult>`
```typescript
interface FlowMetadataResult {
  success: boolean;
  flow?: {
    apiName: string;
    label: string;
    processType: 'AutoLaunchedFlow' | 'Workflow' | 'CustomEvent' | 'InvocableProcess';
    triggerType?: 'onCreate' | 'onUpdate' | 'onDelete' | 'beforeSave' | 'afterSave' | 'scheduled';
    object?: string;
    status: 'Active' | 'Inactive' | 'Draft' | 'Obsolete';
    activeVersionNumber?: number;
    entryCriteria?: string;
    description?: string;
  };
  error?: string;
  warnings?: string[];
}
```

**Validation Checks**:
- Flow exists in org
- Flow has at least one version
- Flow status (Active vs Inactive)
- Well-formed metadata (no XML syntax errors)
- Entry criteria defined (if applicable)

---

#### checkCompetingAutomation(objectName, triggerType)

Identify other automation that might conflict with target Flow.

```javascript
const result = await checker.checkCompetingAutomation('Account', 'after-save');
```

**Parameters**:
- `objectName` (string, required) - Salesforce object API name
- `triggerType` (string, required) - One of: 'before-save', 'after-save', 'before-delete', 'after-delete'

**Returns**: `Promise<CompetingAutomationResult>`
```typescript
interface CompetingAutomationResult {
  success: boolean;
  hasConflicts: boolean;
  flows: Array<{
    apiName: string;
    label: string;
    status: 'Active' | 'Inactive';
    triggerOrder?: number;
    entryCriteria?: string;
  }>;
  triggers: Array<{
    name: string;
    status: 'Active' | 'Inactive';
    events: string[];  // e.g., ['before insert', 'after update']
  }>;
  processBuilders: Array<{
    name: string;
    status: 'Active' | 'Inactive';
    criteria: string;
  }>;
  workflowRules: Array<{
    name: string;
    status: 'Active' | 'Inactive';
    evaluationCriteria: string;
  }>;
  conflicts?: Array<{
    type: 'race_condition' | 'override' | 'governor_limit';
    severity: 'critical' | 'warning' | 'info';
    message: string;
    recommendation: string;
  }>;
}
```

**Conflict Detection Rules**:
- **Race Condition**: Multiple Flows with same trigger order
- **Override**: Apex trigger runs after Flow (might overwrite changes)
- **Governor Limit**: Too many automations on same object

---

#### checkValidationRules(objectName)

Identify validation rules that might prevent Flow from completing.

```javascript
const result = await checker.checkValidationRules('Account');
```

**Parameters**:
- `objectName` (string, required) - Salesforce object API name

**Returns**: `Promise<ValidationRulesResult>`
```typescript
interface ValidationRulesResult {
  success: boolean;
  validationRules: Array<{
    apiName: string;
    active: boolean;
    formula: string;
    errorMessage: string;
    errorDisplayField?: string;
    impact: string;  // Human-readable impact description
  }>;
  requiredFields: Array<{
    fieldName: string;
    fieldType: string;
    isCustom: boolean;
  }>;
  duplicateRules: Array<{
    name: string;
    active: boolean;
    matchRules: string[];
  }>;
  flsRestrictions?: Array<{
    fieldName: string;
    restrictedProfiles: string[];
  }>;
  recommendations: string[];
}
```

**What It Checks**:
- Active validation rules
- Required fields (standard and custom)
- Duplicate rules that might block inserts
- Field-level security (FLS) restrictions
- Object-level permissions

---

#### setupDebugLogging(username, options)

Automatically configure debug logging for Flow execution tracing.

```javascript
const result = await checker.setupDebugLogging('admin@company.com', {
  duration: 30,  // minutes
  categories: {
    workflow: 'FINEST',
    validation: 'INFO',
    apex: 'INFO'
  }
});
```

**Parameters**:
- `username` (string, required) - Salesforce username or 'Automated Process'
- `options` (object, optional):
  ```javascript
  {
    duration: 30,  // Trace flag duration (minutes, max 1440 = 24 hours)
    categories: {
      workflow: 'FINEST',    // Captures Flows and Process Builders
      validation: 'INFO',    // Captures validation rule failures
      callout: 'INFO',       // Captures external service calls
      apex: 'INFO',          // Captures Apex triggers
      database: 'INFO'       // Captures DML operations
    }
  }
  ```

**Returns**: `Promise<DebugLoggingResult>`
```typescript
interface DebugLoggingResult {
  success: boolean;
  debugLevelId?: string;
  debugLevelName?: string;
  traceFlagId?: string;
  username: string;
  duration: number;
  expiresAt: string;  // ISO timestamp
  error?: string;
}
```

**Log Level Options**:
- `NONE` - No logging
- `ERROR` - Error messages only
- `WARN` - Warnings and errors
- `INFO` - Informational, warnings, and errors
- `DEBUG` - Debug info and all above
- `FINE` - Finer-grained debug info
- `FINER` - Even finer-grained
- `FINEST` - Most detailed (use for Flows)

---

#### runAllChecks(flowApiName, options)

Run all pre-flight checks in sequence.

```javascript
const result = await checker.runAllChecks('Account_Validation_Flow', {
  object: 'Account',
  triggerType: 'after-save',
  skipLoggingSetup: false
});
```

**Parameters**:
- `flowApiName` (string, required) - Flow API name
- `options` (object, optional):
  ```javascript
  {
    object: 'Account',       // For competing automation check
    triggerType: 'after-save', // For competing automation check
    skipLoggingSetup: false, // Skip debug logging setup
    continueOnWarnings: true // Continue if warnings (not errors)
  }
  ```

**Returns**: `Promise<PreflightResult>`
```typescript
interface PreflightResult {
  success: boolean;
  canProceed: boolean;
  checks: {
    connectivity: ConnectivityResult;
    flowMetadata: FlowMetadataResult;
    competingAutomation?: CompetingAutomationResult;
    validationRules?: ValidationRulesResult;
    debugLogging?: DebugLoggingResult;
  };
  criticalIssues: string[];
  warnings: string[];
  recommendations: string[];
  timestamp: string;
}
```

### Error Handling

All methods throw `PreflightError` on critical failures:

```javascript
class PreflightError extends Error {
  constructor(message, code, details) {
    super(message);
    this.name = 'PreflightError';
    this.code = code;  // e.g., 'AUTH_FAILED', 'FLOW_NOT_FOUND'
    this.details = details;
  }
}
```

**Error Codes**:
- `AUTH_FAILED` - Cannot authenticate to org
- `FLOW_NOT_FOUND` - Flow does not exist
- `TIMEOUT` - Operation timed out
- `API_ERROR` - Salesforce API returned error
- `INSUFFICIENT_PERMISSIONS` - User lacks required permissions

### Observability

All operations emit structured events for Living Runbook System:

```javascript
{
  type: 'flow_preflight_check',
  orgAlias: 'gamma-corp',
  flowApiName: 'Account_Validation_Flow',
  checkType: 'competing_automation',
  outcome: 'warning',
  duration: 2500,
  findings: { conflicts: 1 },
  timestamp: '2025-11-12T14:30:00Z'
}
```

---

## 2. FlowExecutor

**File**: `scripts/lib/flow-executor.js`
**Purpose**: Execute Flows in controlled test environments

### Constructor

```javascript
const { FlowExecutor } = require('./scripts/lib/flow-executor');

const executor = new FlowExecutor(orgAlias, options);
```

**Parameters**:
- `orgAlias` (string, required) - Salesforce org alias
- `options` (object, optional):
  ```javascript
  {
    verbose: false,
    timeout: 300000,  // 5 minutes for Flow execution
    captureState: true,  // Capture before/after state
    parseDebugLogs: true  // Auto-parse debug logs after execution
  }
  ```

### Public Methods

#### executeRecordTriggeredFlow(flowApiName, testData)

Execute record-triggered Flow by creating/updating test record.

```javascript
const result = await executor.executeRecordTriggeredFlow('Account_Validation_Flow', {
  object: 'Account',
  triggerType: 'after-save',
  operation: 'insert',  // or 'update', 'delete'
  recordData: {
    Name: 'Test Account',
    Type: 'Customer',
    Status__c: 'Active'
  },
  recordId: null  // For updates, provide existing record ID
});
```

**Parameters**:
- `flowApiName` (string, required) - Flow API name
- `testData` (object, required):
  ```typescript
  {
    object: string;           // Object API name
    triggerType: 'before-save' | 'after-save';
    operation: 'insert' | 'update' | 'delete';
    recordData: object;       // Field values for record
    recordId?: string;        // For update/delete
    cleanupAfter?: boolean;   // Delete test record after (default: true)
  }
  ```

**Returns**: `Promise<ExecutionResult>`
```typescript
interface ExecutionResult {
  success: boolean;
  executionId: string;  // Unique ID for this execution
  flowApiName: string;
  executionType: 'record_triggered' | 'scheduled' | 'screen' | 'autolaunched';

  // Execution details
  startTime: string;
  endTime: string;
  duration: number;  // ms

  // Record details
  recordId?: string;
  recordBefore?: object;  // State before Flow
  recordAfter?: object;   // State after Flow

  // Flow execution details
  flowVersionNumber?: number;
  elementsExecuted?: string[];  // Element API names
  decisionsEvaluated?: Array<{
    elementName: string;
    outcome: boolean;
    branchTaken: string;
  }>;

  // Logs
  debugLogIds?: string[];
  errors?: Array<{
    type: string;
    message: string;
    element?: string;
    stackTrace?: string;
  }>;

  // Cleanup
  cleanupPerformed?: boolean;
  cleanupRecordIds?: string[];
}
```

---

#### executeScheduledFlow(flowApiName, options)

Execute scheduled Flow on-demand (bypasses schedule).

```javascript
const result = await executor.executeScheduledFlow('Daily_Account_Cleanup', {
  batchSize: 200,
  testMode: true  // Dry-run without committing changes
});
```

**Parameters**:
- `flowApiName` (string, required) - Scheduled Flow API name
- `options` (object, optional):
  ```javascript
  {
    batchSize: 200,      // Max records to process
    testMode: false,     // Dry-run mode
    scheduleOverride: {} // Override schedule criteria
  }
  ```

**Returns**: `Promise<ExecutionResult>` (same structure as above)

---

#### executeScreenFlow(flowApiName, inputVariables)

Execute screen Flow logic (testing without UI).

```javascript
const result = await executor.executeScreenFlow('Contact_Survey_Flow', {
  inputVariables: [
    { name: 'ContactId', type: 'String', value: '003xx000000XXXX' },
    { name: 'SurveyScore', type: 'Number', value: 85 }
  ],
  screenResponses: [
    { screenName: 'Screen1', fields: { Question1: 'Yes', Question2: 'No' } }
  ]
});
```

**Parameters**:
- `flowApiName` (string, required) - Screen Flow API name
- `inputVariables` (array, required):
  ```typescript
  Array<{
    name: string;
    type: 'String' | 'Number' | 'Boolean' | 'Date' | 'DateTime' | 'SObject';
    value: any;
  }>
  ```
- `screenResponses` (array, optional) - Simulated user input for screens

**Returns**: `Promise<ExecutionResult>` (includes `outputVariables` field)

---

#### executeAutoLaunchedFlow(flowApiName, inputVariables)

Execute auto-launched Flow (invocable from other automation).

```javascript
const result = await executor.executeAutoLaunchedFlow('Territory_Assignment', {
  inputVariables: [
    { name: 'AccountId', type: 'String', value: '001xx000000XXXX' }
  ]
});
```

**Parameters**: Same as `executeScreenFlow()`
**Returns**: `Promise<ExecutionResult>`

---

#### getExecutionHistory(flowApiName, options)

Retrieve recent execution history for Flow.

```javascript
const history = await executor.getExecutionHistory('Account_Validation_Flow', {
  limit: 50,
  startDate: '2025-11-01',
  includeErrors: true
});
```

**Parameters**:
- `flowApiName` (string, required) - Flow API name
- `options` (object, optional):
  ```javascript
  {
    limit: 50,
    startDate: '2025-11-01',
    endDate: '2025-11-12',
    includeErrors: true,
    includeSuccess: true
  }
  ```

**Returns**: `Promise<ExecutionHistoryResult>`
```typescript
interface ExecutionHistoryResult {
  flowApiName: string;
  totalExecutions: number;
  executions: Array<{
    id: string;
    startTime: string;
    status: 'Success' | 'Failed' | 'Paused';
    errorMessage?: string;
    recordId?: string;
  }>;
}
```

### Error Handling

Throws `FlowExecutionError`:

```javascript
class FlowExecutionError extends Error {
  constructor(message, code, details) {
    super(message);
    this.name = 'FlowExecutionError';
    this.code = code;  // 'FLOW_ERROR', 'RECORD_ERROR', 'TIMEOUT'
    this.details = details;
  }
}
```

**Error Codes**:
- `FLOW_ERROR` - Flow encountered error during execution
- `RECORD_ERROR` - Cannot create/update test record
- `TIMEOUT` - Flow execution exceeded timeout
- `FLOW_INACTIVE` - Flow is not active
- `VALIDATION_FAILED` - Validation rule blocked operation

### Observability

```javascript
{
  type: 'flow_execution',
  orgAlias: 'gamma-corp',
  flowApiName: 'Account_Validation_Flow',
  executionType: 'record_triggered',
  outcome: 'success',
  duration: 3200,
  elementsExecuted: 8,
  timestamp: '2025-11-12T14:35:00Z'
}
```

---

## 3. FlowLogParser

**File**: `scripts/lib/flow-log-parser.js`
**Purpose**: Parse Salesforce debug logs to extract Flow execution details

### Constructor

```javascript
const { FlowLogParser } = require('./scripts/lib/flow-log-parser');

const parser = new FlowLogParser(orgAlias, options);
```

**Parameters**:
- `orgAlias` (string, required) - Salesforce org alias
- `options` (object, optional):
  ```javascript
  {
    verbose: false,
    extractOnlyErrors: false,  // Extract only error lines
    parseFormulas: true,       // Parse formula evaluations
    parseDecisions: true       // Parse decision outcomes
  }
  ```

### Public Methods

#### parseLog(logId)

Parse a single debug log.

```javascript
const result = await parser.parseLog('07Lxx000000XXXX');
```

**Parameters**:
- `logId` (string, required) - Debug log ID (15 or 18 char)

**Returns**: `Promise<ParsedLog>`
```typescript
interface ParsedLog {
  logId: string;
  timestamp: string;
  duration: number;  // Total log duration (ms)

  // Flow execution summary
  flowExecutions: Array<{
    flowApiName: string;
    flowVersionNumber: number;
    startLine: number;
    endLine: number;
    duration: number;
    outcome: 'success' | 'failed' | 'paused';
  }>;

  // Elements executed
  elementsExecuted: Array<{
    elementName: string;
    elementType: 'Decision' | 'Assignment' | 'RecordLookup' | 'RecordCreate' | 'RecordUpdate' | 'RecordDelete' | 'Loop' | 'Subflow';
    startLine: number;
    endLine: number;
    duration: number;
    outcome: 'success' | 'failed';
    error?: string;
  }>;

  // Decisions evaluated
  decisionsEvaluated: Array<{
    elementName: string;
    condition: string;
    outcome: boolean;
    branchTaken: string;
    line: number;
  }>;

  // Errors
  errors: Array<{
    type: 'FLOW_ERROR' | 'VALIDATION_ERROR' | 'DML_ERROR' | 'APEX_ERROR';
    message: string;
    element?: string;
    line: number;
    stackTrace?: string;
  }>;

  // Governor limits usage
  governorLimits: {
    soqlQueries: { used: number; max: number; };
    soqlRows: { used: number; max: number; };
    dmlStatements: { used: number; max: number; };
    dmlRows: { used: number; max: number; };
    cpuTime: { used: number; max: number; };  // ms
    heapSize: { used: number; max: number; };  // bytes
  };

  // Validation rules triggered
  validationRules: Array<{
    ruleName: string;
    outcome: 'passed' | 'failed';
    errorMessage?: string;
    line: number;
  }>;
}
```

---

#### parseMultipleLogs(logIds)

Parse multiple logs (e.g., for batch execution).

```javascript
const results = await parser.parseMultipleLogs([
  '07Lxx000000XXXX1',
  '07Lxx000000XXXX2',
  '07Lxx000000XXXX3'
]);
```

**Parameters**:
- `logIds` (array, required) - Array of debug log IDs

**Returns**: `Promise<Array<ParsedLog>>`

---

#### extractFlowErrors(logId)

Extract only Flow-specific errors from log.

```javascript
const errors = await parser.extractFlowErrors('07Lxx000000XXXX');
```

**Returns**: `Promise<Array<FlowError>>`
```typescript
interface FlowError {
  flowApiName: string;
  elementName?: string;
  errorType: string;
  errorMessage: string;
  lineNumber: number;
  stackTrace?: string;
  recommendation?: string;  // Auto-generated fix suggestion
}
```

---

#### getLatestLog(username, options)

Retrieve and parse most recent debug log for user.

```javascript
const log = await parser.getLatestLog('admin@company.com', {
  flowName: 'Account_Validation_Flow',  // Filter by Flow
  maxAgeDays: 1
});
```

**Parameters**:
- `username` (string, required) - Salesforce username or 'Automated Process'
- `options` (object, optional):
  ```javascript
  {
    flowName: 'Account_Validation_Flow',  // Filter to specific Flow
    maxAgeDays: 1,                        // Only consider logs from last N days
    includeErrors: true
  }
  ```

**Returns**: `Promise<ParsedLog | null>`

### Error Handling

Throws `LogParseError`:

```javascript
class LogParseError extends Error {
  constructor(message, code, details) {
    super(message);
    this.name = 'LogParseError';
    this.code = code;  // 'LOG_NOT_FOUND', 'PARSE_FAILED'
    this.details = details;
  }
}
```

**Error Codes**:
- `LOG_NOT_FOUND` - Debug log does not exist or expired
- `PARSE_FAILED` - Cannot parse log format
- `INVALID_LOG_ID` - Log ID format invalid

### Observability

```javascript
{
  type: 'flow_log_parsed',
  orgAlias: 'gamma-corp',
  logId: '07Lxx000000XXXX',
  flowsFound: 2,
  errorsFound: 1,
  duration: 500,
  timestamp: '2025-11-12T14:40:00Z'
}
```

---

## 4. FlowStateSnapshot

**File**: `scripts/lib/flow-state-snapshot.js`
**Purpose**: Capture state before/after Flow execution for diff analysis

### Constructor

```javascript
const { FlowStateSnapshot } = require('./scripts/lib/flow-state-snapshot');

const snapshot = new FlowStateSnapshot(orgAlias, options);
```

**Parameters**:
- `orgAlias` (string, required) - Salesforce org alias
- `options` (object, optional):
  ```javascript
  {
    verbose: false,
    includeRelatedRecords: true,  // Include child records
    maxDepth: 2                   // Max relationship depth
  }
  ```

### Public Methods

#### captureSnapshot(recordId, options)

Capture state of a record and related records.

```javascript
const snapshot = await snapshot.captureSnapshot('001xx000000XXXX', {
  includeFields: ['Name', 'Type', 'Status__c'],  // null = all fields
  includeRelated: ['Contacts', 'Opportunities'],
  includeHistory: true  // Include field history
});
```

**Parameters**:
- `recordId` (string, required) - Record ID
- `options` (object, optional):
  ```javascript
  {
    includeFields: null,         // null = all, or array of field names
    includeRelated: [],          // Related object relationships
    includeHistory: false,       // Include field history records
    timestamp: null              // Custom timestamp (default: now)
  }
  ```

**Returns**: `Promise<Snapshot>`
```typescript
interface Snapshot {
  snapshotId: string;  // Unique ID for this snapshot
  recordId: string;
  objectType: string;
  timestamp: string;

  // Record data
  fields: {
    [fieldName: string]: {
      value: any;
      dataType: string;
      formula?: boolean;
    };
  };

  // Related records
  relatedRecords?: {
    [relationshipName: string]: Array<{
      recordId: string;
      fields: object;
    }>;
  };

  // Field history
  history?: Array<{
    fieldName: string;
    oldValue: any;
    newValue: any;
    createdDate: string;
    createdBy: string;
  }>;

  // Metadata
  systemModstamp: string;
  lastModifiedDate: string;
  lastModifiedBy: string;
}
```

---

#### compareSnapshots(beforeSnapshot, afterSnapshot)

Compare two snapshots to identify changes.

```javascript
const diff = await snapshot.compareSnapshots(snapshot1, snapshot2);
```

**Parameters**:
- `beforeSnapshot` (Snapshot, required) - "Before" snapshot
- `afterSnapshot` (Snapshot, required) - "After" snapshot

**Returns**: `Promise<SnapshotDiff>`
```typescript
interface SnapshotDiff {
  recordId: string;
  objectType: string;
  timespan: number;  // ms between snapshots

  // Changed fields
  changedFields: Array<{
    fieldName: string;
    oldValue: any;
    newValue: any;
    dataType: string;
    changeMagnitude?: number;  // For numeric fields
  }>;

  // Related record changes
  relatedChanges?: {
    [relationshipName: string]: {
      created: string[];  // Record IDs
      updated: string[];
      deleted: string[];
    };
  };

  // System changes
  systemFieldsChanged: Array<{
    fieldName: string;
    oldValue: any;
    newValue: any;
  }>;

  // Summary
  totalFieldsChanged: number;
  totalRelatedRecordsAffected: number;
}
```

**Diff Output Example**:
```json
{
  "recordId": "001xx000000XXXX",
  "objectType": "Account",
  "timespan": 3200,
  "changedFields": [
    {
      "fieldName": "Status__c",
      "oldValue": "Pending",
      "newValue": "Active",
      "dataType": "Picklist"
    },
    {
      "fieldName": "LastActivityDate",
      "oldValue": "2025-11-10",
      "newValue": "2025-11-12",
      "dataType": "Date"
    }
  ],
  "relatedChanges": {
    "Contacts": {
      "created": [],
      "updated": ["003xx000000YYYY"],
      "deleted": []
    }
  },
  "totalFieldsChanged": 2,
  "totalRelatedRecordsAffected": 1
}
```

---

#### generateDiffReport(diff, options)

Generate human-readable diff report.

```javascript
const report = snapshot.generateDiffReport(diff, {
  format: 'markdown',  // or 'html', 'json'
  includeUnchanged: false
});
```

**Parameters**:
- `diff` (SnapshotDiff, required) - Diff result
- `options` (object, optional):
  ```javascript
  {
    format: 'markdown',      // 'markdown', 'html', 'json'
    includeUnchanged: false, // Show fields that didn't change
    highlightFormulas: true  // Highlight formula field changes
  }
  ```

**Returns**: `string` (formatted report)

**Markdown Output Example**:
```markdown
# State Change Report

**Record**: Account (001xx000000XXXX)
**Timespan**: 3.2 seconds
**Fields Changed**: 2
**Related Records Affected**: 1

## Changed Fields

| Field Name | Old Value | New Value | Type |
|------------|-----------|-----------|------|
| Status__c | Pending | Active | Picklist |
| LastActivityDate | 2025-11-10 | 2025-11-12 | Date |

## Related Records

### Contacts (1 updated)
- Contact: John Doe (003xx000000YYYY) - Email changed
```

### Error Handling

Throws `SnapshotError`:

```javascript
class SnapshotError extends Error {
  constructor(message, code, details) {
    super(message);
    this.name = 'SnapshotError';
    this.code = code;  // 'RECORD_NOT_FOUND', 'SNAPSHOT_FAILED'
    this.details = details;
  }
}
```

### Observability

```javascript
{
  type: 'flow_state_snapshot',
  orgAlias: 'gamma-corp',
  recordId: '001xx000000XXXX',
  operation: 'capture',
  fieldsCapture: 25,
  relatedRecords: 3,
  duration: 800,
  timestamp: '2025-11-12T14:45:00Z'
}
```

---

## 5. FlowBranchAnalyzer

**File**: `scripts/lib/flow-branch-analyzer.js`
**Purpose**: Track which Flow decision branches were executed during testing

### Constructor

```javascript
const { FlowBranchAnalyzer } = require('./scripts/lib/flow-branch-analyzer');

const analyzer = new FlowBranchAnalyzer(orgAlias, options);
```

**Parameters**:
- `orgAlias` (string, required) - Salesforce org alias
- `options` (object, optional):
  ```javascript
  {
    verbose: false,
    trackLoops: true,      // Track loop iterations
    trackSubflows: true    // Track subflow executions
  }
  ```

### Public Methods

#### analyzeFlowCoverage(flowApiName, executionResults)

Analyze branch coverage from execution results.

```javascript
const coverage = await analyzer.analyzeFlowCoverage('Account_Validation_Flow', [
  executionResult1,
  executionResult2,
  executionResult3
]);
```

**Parameters**:
- `flowApiName` (string, required) - Flow API name
- `executionResults` (array, required) - Array of `ExecutionResult` objects from FlowExecutor

**Returns**: `Promise<CoverageReport>`
```typescript
interface CoverageReport {
  flowApiName: string;
  flowVersionNumber: number;
  totalExecutions: number;

  // Overall coverage
  totalElements: number;
  elementsExecuted: number;
  coveragePercentage: number;

  // Element-level coverage
  elements: Array<{
    elementName: string;
    elementType: string;
    executionCount: number;
    firstExecuted?: string;  // ISO timestamp
    lastExecuted?: string;
  }>;

  // Decision coverage
  decisions: Array<{
    elementName: string;
    totalOutcomes: number;  // e.g., 2 for if-else, 3 for 3-way split
    outcomesCovered: number;
    coveragePercentage: number;
    outcomes: Array<{
      outcomeName: string;
      executionCount: number;
      condition: string;
    }>;
  }>;

  // Uncovered paths
  uncoveredElements: string[];
  uncoveredBranches: Array<{
    decisionName: string;
    branchName: string;
    condition: string;
  }>;

  // Loops
  loops?: Array<{
    elementName: string;
    totalIterations: number;
    maxIterationsPerExecution: number;
  }>;

  // Subflows
  subflows?: Array<{
    subflowName: string;
    executionCount: number;
  }>;
}
```

**Coverage Example**:
```json
{
  "flowApiName": "Account_Validation_Flow",
  "flowVersionNumber": 5,
  "totalExecutions": 3,
  "totalElements": 12,
  "elementsExecuted": 10,
  "coveragePercentage": 83.3,
  "decisions": [
    {
      "elementName": "Status_Check",
      "totalOutcomes": 2,
      "outcomesCovered": 2,
      "coveragePercentage": 100,
      "outcomes": [
        {
          "outcomeName": "Active",
          "executionCount": 2,
          "condition": "Status__c = 'Active'"
        },
        {
          "outcomeName": "Inactive",
          "executionCount": 1,
          "condition": "Status__c = 'Inactive'"
        }
      ]
    }
  ],
  "uncoveredElements": ["Error_Notification", "Escalation_Email"]
}
```

---

#### generateTestPlan(flowApiName, currentCoverage)

Generate test plan to achieve full coverage.

```javascript
const testPlan = await analyzer.generateTestPlan('Account_Validation_Flow', coverage);
```

**Parameters**:
- `flowApiName` (string, required) - Flow API name
- `currentCoverage` (CoverageReport, required) - Current coverage report

**Returns**: `Promise<TestPlan>`
```typescript
interface TestPlan {
  flowApiName: string;
  currentCoverage: number;
  targetCoverage: number;  // 100%

  // Recommended test cases
  testCases: Array<{
    testName: string;
    objective: string;
    targetElements: string[];
    targetBranches: string[];
    suggestedTestData: {
      object: string;
      recordData: object;
    };
    expectedOutcome: string;
  }>;

  estimatedTests: number;
  estimatedDuration: number;  // minutes
}
```

**Test Plan Example**:
```json
{
  "flowApiName": "Account_Validation_Flow",
  "currentCoverage": 83.3,
  "targetCoverage": 100,
  "testCases": [
    {
      "testName": "Error_Notification_Path",
      "objective": "Execute error notification branch",
      "targetElements": ["Error_Notification"],
      "targetBranches": ["Status_Check.Error"],
      "suggestedTestData": {
        "object": "Account",
        "recordData": {
          "Name": "Test Account",
          "Status__c": "Error"
        }
      },
      "expectedOutcome": "Error notification sent to admin"
    }
  ],
  "estimatedTests": 2,
  "estimatedDuration": 10
}
```

---

#### exportCoverageReport(coverageReport, format)

Export coverage report in various formats.

```javascript
const exported = analyzer.exportCoverageReport(coverage, 'html');
```

**Parameters**:
- `coverageReport` (CoverageReport, required) - Coverage report
- `format` (string, required) - 'html', 'markdown', 'json', 'csv'

**Returns**: `string` (formatted output)

### Error Handling

Throws `CoverageAnalysisError`:

```javascript
class CoverageAnalysisError extends Error {
  constructor(message, code, details) {
    super(message);
    this.name = 'CoverageAnalysisError';
    this.code = code;  // 'FLOW_NOT_FOUND', 'INVALID_EXECUTION_DATA'
    this.details = details;
  }
}
```

### Observability

```javascript
{
  type: 'flow_coverage_analysis',
  orgAlias: 'gamma-corp',
  flowApiName: 'Account_Validation_Flow',
  totalExecutions: 3,
  coveragePercentage: 83.3,
  uncoveredElements: 2,
  duration: 1200,
  timestamp: '2025-11-12T14:50:00Z'
}
```

---

## 6. FlowDiagnosticOrchestrator

**File**: `scripts/lib/flow-diagnostic-orchestrator.js`
**Purpose**: Orchestrate end-to-end diagnostic workflows

### Constructor

```javascript
const { FlowDiagnosticOrchestrator } = require('./scripts/lib/flow-diagnostic-orchestrator');

const orchestrator = new FlowDiagnosticOrchestrator(orgAlias, options);
```

**Parameters**:
- `orgAlias` (string, required) - Salesforce org alias
- `options` (object, optional):
  ```javascript
  {
    verbose: false,
    continueOnWarnings: true,
    captureObservations: true,  // Emit events for Living Runbook System
    generateReports: true       // Auto-generate reports
  }
  ```

### Public Methods

#### runPreflightDiagnostic(flowApiName, options)

Run complete pre-flight diagnostic workflow.

```javascript
const result = await orchestrator.runPreflightDiagnostic('Account_Validation_Flow', {
  object: 'Account',
  triggerType: 'after-save',
  setupLogging: true
});
```

**Orchestrates**:
1. FlowPreflightChecker.checkConnectivity()
2. FlowPreflightChecker.checkFlowMetadata()
3. FlowPreflightChecker.checkCompetingAutomation()
4. FlowPreflightChecker.checkValidationRules()
5. FlowPreflightChecker.setupDebugLogging()

**Returns**: `Promise<PreflightDiagnosticResult>`
```typescript
interface PreflightDiagnosticResult {
  success: boolean;
  canProceed: boolean;
  flowApiName: string;
  orgAlias: string;

  checks: PreflightResult;  // From FlowPreflightChecker

  summary: {
    totalChecks: number;
    passed: number;
    warnings: number;
    criticalIssues: number;
  };

  recommendations: string[];
  nextSteps: string[];

  reportPath?: string;  // If generateReports: true
  timestamp: string;
}
```

---

#### runExecutionDiagnostic(flowApiName, testData)

Run execution diagnostic workflow (execute + capture state + parse logs).

```javascript
const result = await orchestrator.runExecutionDiagnostic('Account_Validation_Flow', {
  object: 'Account',
  triggerType: 'after-save',
  operation: 'insert',
  recordData: {
    Name: 'Test Account',
    Type: 'Customer'
  }
});
```

**Orchestrates**:
1. FlowStateSnapshot.captureSnapshot() (before)
2. FlowExecutor.executeRecordTriggeredFlow()
3. FlowStateSnapshot.captureSnapshot() (after)
4. FlowStateSnapshot.compareSnapshots()
5. FlowLogParser.getLatestLog()
6. FlowLogParser.parseLog()

**Returns**: `Promise<ExecutionDiagnosticResult>`
```typescript
interface ExecutionDiagnosticResult {
  success: boolean;
  flowApiName: string;
  orgAlias: string;

  execution: ExecutionResult;  // From FlowExecutor
  stateDiff: SnapshotDiff;     // From FlowStateSnapshot
  parsedLog: ParsedLog;        // From FlowLogParser

  summary: {
    executionSucceeded: boolean;
    fieldsChanged: number;
    elementsExecuted: number;
    errors: number;
    governorLimitWarnings: string[];
  };

  recommendations: string[];
  reportPath?: string;
  timestamp: string;
}
```

---

#### runCoverageDiagnostic(flowApiName, testCases)

Run coverage diagnostic workflow (multiple executions + coverage analysis).

```javascript
const result = await orchestrator.runCoverageDiagnostic('Account_Validation_Flow', [
  { recordData: { Status__c: 'Active' } },
  { recordData: { Status__c: 'Inactive' } },
  { recordData: { Status__c: 'Error' } }
]);
```

**Orchestrates**:
1. FlowExecutor.executeRecordTriggeredFlow() (for each test case)
2. FlowBranchAnalyzer.analyzeFlowCoverage()
3. FlowBranchAnalyzer.generateTestPlan() (if coverage < 100%)

**Returns**: `Promise<CoverageDiagnosticResult>`
```typescript
interface CoverageDiagnosticResult {
  success: boolean;
  flowApiName: string;
  orgAlias: string;

  executions: ExecutionResult[];
  coverage: CoverageReport;  // From FlowBranchAnalyzer
  testPlan?: TestPlan;       // If coverage < 100%

  summary: {
    totalTests: number;
    passedTests: number;
    failedTests: number;
    coveragePercentage: number;
    uncoveredBranches: number;
  };

  recommendations: string[];
  reportPath?: string;
  timestamp: string;
}
```

---

#### runFullDiagnostic(flowApiName, options)

Run complete diagnostic workflow (preflight + execution + coverage).

```javascript
const result = await orchestrator.runFullDiagnostic('Account_Validation_Flow', {
  object: 'Account',
  triggerType: 'after-save',
  testCases: [
    { recordData: { Status__c: 'Active' } },
    { recordData: { Status__c: 'Inactive' } }
  ]
});
```

**Orchestrates**: All 3 diagnostic workflows in sequence

**Returns**: `Promise<FullDiagnosticResult>`
```typescript
interface FullDiagnosticResult {
  success: boolean;
  flowApiName: string;
  orgAlias: string;

  preflight: PreflightDiagnosticResult;
  execution: ExecutionDiagnosticResult;
  coverage: CoverageDiagnosticResult;

  overallSummary: {
    canDeploy: boolean;
    readyForProduction: boolean;
    criticalIssues: string[];
    warnings: string[];
    coveragePercentage: number;
  };

  recommendations: string[];
  reportPath?: string;  // Consolidated report
  timestamp: string;
}
```

---

#### generateConsolidatedReport(diagnosticResults, format)

Generate consolidated report from diagnostic results.

```javascript
const report = orchestrator.generateConsolidatedReport(fullDiagnosticResult, 'html');
```

**Parameters**:
- `diagnosticResults` (object, required) - Any diagnostic result object
- `format` (string, required) - 'html', 'markdown', 'pdf', 'json'

**Returns**: `string` (formatted report) or `Buffer` (for PDF)

### Error Handling

Throws `OrchestrationError`:

```javascript
class OrchestrationError extends Error {
  constructor(message, code, details) {
    super(message);
    this.name = 'OrchestrationError';
    this.code = code;  // 'PREFLIGHT_FAILED', 'EXECUTION_FAILED'
    this.details = details;
  }
}
```

### Observability

```javascript
{
  type: 'flow_diagnostic_orchestration',
  orgAlias: 'gamma-corp',
  flowApiName: 'Account_Validation_Flow',
  workflowType: 'full_diagnostic',
  outcome: 'success',
  duration: 15000,
  modulesInvoked: ['preflight', 'executor', 'log-parser', 'snapshot', 'branch-analyzer'],
  timestamp: '2025-11-12T15:00:00Z'
}
```

---

## Common Patterns

### Pattern 1: Quick Preflight Check

```javascript
const { FlowPreflightChecker } = require('./scripts/lib/flow-preflight-checker');

const checker = new FlowPreflightChecker('gamma-corp');
const result = await checker.runAllChecks('MyFlow', {
  object: 'Account',
  triggerType: 'after-save'
});

if (!result.canProceed) {
  console.error('Preflight failed:', result.criticalIssues);
  process.exit(1);
}
```

### Pattern 2: Execute and Analyze

```javascript
const { FlowExecutor } = require('./scripts/lib/flow-executor');
const { FlowLogParser } = require('./scripts/lib/flow-log-parser');

const executor = new FlowExecutor('gamma-corp');
const parser = new FlowLogParser('gamma-corp');

// Execute Flow
const execution = await executor.executeRecordTriggeredFlow('MyFlow', {
  object: 'Account',
  operation: 'insert',
  recordData: { Name: 'Test' }
});

// Parse logs
const log = await parser.getLatestLog('Automated Process', {
  flowName: 'MyFlow'
});

console.log('Errors found:', log.errors.length);
```

### Pattern 3: Coverage Analysis

```javascript
const { FlowExecutor } = require('./scripts/lib/flow-executor');
const { FlowBranchAnalyzer } = require('./scripts/lib/flow-branch-analyzer');

const executor = new FlowExecutor('gamma-corp');
const analyzer = new FlowBranchAnalyzer('gamma-corp');

// Run multiple test cases
const executions = await Promise.all([
  executor.executeRecordTriggeredFlow('MyFlow', { recordData: { Status__c: 'Active' } }),
  executor.executeRecordTriggeredFlow('MyFlow', { recordData: { Status__c: 'Inactive' } })
]);

// Analyze coverage
const coverage = await analyzer.analyzeFlowCoverage('MyFlow', executions);

console.log('Coverage:', coverage.coveragePercentage + '%');

if (coverage.coveragePercentage < 100) {
  const testPlan = await analyzer.generateTestPlan('MyFlow', coverage);
  console.log('Need', testPlan.estimatedTests, 'more tests for full coverage');
}
```

### Pattern 4: Orchestrated Workflow

```javascript
const { FlowDiagnosticOrchestrator } = require('./scripts/lib/flow-diagnostic-orchestrator');

const orchestrator = new FlowDiagnosticOrchestrator('gamma-corp');

const result = await orchestrator.runFullDiagnostic('MyFlow', {
  object: 'Account',
  triggerType: 'after-save',
  testCases: [
    { recordData: { Status__c: 'Active' } },
    { recordData: { Status__c: 'Inactive' } },
    { recordData: { Status__c: 'Error' } }
  ]
});

console.log('Ready for production:', result.overallSummary.readyForProduction);
console.log('Coverage:', result.coverage.coverage.coveragePercentage + '%');
console.log('Report:', result.reportPath);
```

---

## Testing Interfaces

All modules must implement these test helpers:

### Mocking Interface

```javascript
class MockSalesforceConnection {
  async query(soql) { /* ... */ }
  async insert(sobject, records) { /* ... */ }
  async update(sobject, records) { /* ... */ }
  async retrieve(sobject, ids, fields) { /* ... */ }
}
```

### Test Data Builders

```javascript
class FlowTestDataBuilder {
  static buildExecutionResult(overrides) { /* ... */ }
  static buildParsedLog(overrides) { /* ... */ }
  static buildSnapshot(overrides) { /* ... */ }
  static buildCoverageReport(overrides) { /* ... */ }
}
```

### Integration Test Helpers

```javascript
class FlowDiagnosticTestHarness {
  async setupTestOrg() { /* ... */ }
  async deployTestFlow() { /* ... */ }
  async cleanupTestData() { /* ... */ }
}
```

---

## Implementation Checklist

For each module, implementers must:

- [ ] Implement all public methods with correct signatures
- [ ] Validate all input parameters
- [ ] Return data structures matching TypeScript interfaces
- [ ] Throw correct error types with codes
- [ ] Emit observability events
- [ ] Add JSDoc comments with examples
- [ ] Create unit tests (80%+ coverage)
- [ ] Create integration tests
- [ ] Document in Runbook 7 (corresponding section)

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2025-11-12 | Initial interface specification |

---

**Next**: Phase 2 implementation begins with `flow-preflight-checker.js`
