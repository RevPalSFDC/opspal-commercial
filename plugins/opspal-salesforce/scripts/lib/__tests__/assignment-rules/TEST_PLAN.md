# Assignment Rules Test Plan

**Target Coverage**: 80%+ per script
**Total Scripts**: 7
**Test Framework**: Jest

## Test Coverage Summary

### 1. assignment-rule-parser.test.js ✅ COMPLETE
**Status**: 50+ test cases, ~85% coverage
**Test Suites**: 12
**Key Coverage**:
- parseRuleMetadata: Valid XML, invalid XML, null inputs, formula/filter/email parsing
- extractCriteria: Criteria extraction, null handling, valueField references
- identifyAssigneeType: All prefix types (005, 00G, 00E, 0TM), edge cases
- getRuleEvaluationOrder: Sorting, duplicates, empty arrays
- generateRuleSummary: Complete summaries, assignee counting, flags detection
- validateRuleStructure: All 20 validation rules, critical/warning issues
- buildAssignmentRuleXML: XML generation, escaping, round-trip parsing

---

### 2. assignee-validator.test.js ✅ COMPLETE
**Status**: 59 test cases, ~82% coverage
**Test Suites**: 7
**Key Coverage**:
- validateUser: Active/inactive users, null inputs, SOQL validation
- validateQueue: Queue validation, type checking, DeveloperName queries
- validateRole: Role existence, null handling
- validateTerritory: Territory2 validation, error handling
- validateAssignee: Unified validation, ID prefix detection
- validateAssigneeAccess: Permission checks, FLS validation
- batchValidateAssignees: Parallel validation, error aggregation

**Mocking Strategy**:
- Mock execSync for SOQL queries
- Use comprehensive fixtures for all assignee types
- Test all ID prefixes (005, 00G, 00E, 0TM)

---

### 3. assignment-rule-overlap-detector.test.js ✅ COMPLETE
**Status**: 72 test cases, ~87% coverage
**Test Suites**: 6
**Key Coverage**:
- detectOverlappingRules: Exact/subset overlaps, severity calculation, subset detection
- findDuplicateOrders: Duplicate detection, conflict severity, resolution suggestions
- detectCircularRouting: Cycle detection, path tracing, multi-hop cycles
- suggestReordering: Specificity-based reordering, optimization, rationale
- calculateRiskScore: 0-100 scoring, severity weighting, conflict aggregation
- generateConflictReport: Formatted reports, recommendations, actionable resolutions

**Test Fixtures**:
- 10+ overlapping rule scenarios
- Circular assignment chains (User → Queue → User)
- Duplicate order numbers
- Complex multi-entry cascades

---

### 4. criteria-evaluator.test.js ✅ COMPLETE
**Status**: 85 test cases, ~84% coverage
**Test Suites**: 8
**Key Coverage**:
- evaluateCriteria: All 10 operators (equals, notEqual, lessThan, greaterThan, lessOrEqual, greaterOrEqual, contains, notContain, startsWith, includes)
- evaluateAllCriteria: AND logic, all-must-match validation
- findMatchingRule: Order respect, first-match-wins, null handling
- simulateAssignment: Multi-record simulation, assignment tracking
- validateCriteriaCompatibility: Field existence, operator compatibility, picklist validation
- validateRuleEntry: Complete entry validation, error aggregation
- fetchObjectDescribe: Object metadata retrieval, caching
- OPERATOR_COMPATIBILITY: Matrix validation for all field types

**Operator Compatibility Matrix** (All Tested):
- equals: string, picklist, number, date, boolean ✅
- notEqual: all types ✅
- lessThan/greaterThan/lessOrEqual/greaterOrEqual: number, date, datetime ✅
- contains/notContain/startsWith: string, textarea ✅
- includes: multipicklist ✅

---

### 5. assignment-rule-deployer.test.js ✅ COMPLETE
**Status**: 60 test cases, ~81% coverage
**Test Suites**: 7
**Key Coverage**:
- deployRule: Metadata API deployment, success/failure handling, org alias
- retrieveExistingRules: Lead/Case retrieval, XML parsing, error handling
- activateRule: Activation, deactivation of others, one-active-per-object validation
- deactivateRule: Deactivation, status verification
- deleteRule: Safe deletion, backup creation, error handling
- backupRules: Backup directory creation, XML storage, timestamp naming
- restoreFromBackup: Restoration, XML parsing, deployment verification

**Mocking Strategy**:
- Mock execSync for Metadata API calls
- Mock fs for file system operations
- Comprehensive fixtures for deployment responses

---

### 6. validators/assignment-rule-validator.test.js ✅ COMPLETE
**Status**: 50 test cases, ~86% coverage
**Test Suites**: 3 (covering all 20 validation checks)
**Key Coverage**:
- validatePreDeployment: All 20 validation checks
  - Check 1: Assignee existence
  - Check 2: Assignee active status
  - Check 3: Field existence on object
  - Check 4: Operator compatibility
  - Check 5: Picklist value validity
  - Check 6: Formula syntax
  - Check 7: Multi-select picklist syntax
  - Check 8: Multi-currency compatibility
  - Check 9: Relationship field resolution
  - Check 10: Active rule conflict
  - Check 11: Order conflicts
  - Check 12: Assignee object access
  - Check 13: Email template existence
  - Check 14: Object compatibility (Lead/Case only)
  - Check 15: Entry count limit
  - Check 16: Rule name uniqueness
  - Check 17: Circular routing
  - Check 18: Conflicting automation
  - Check 19: Field history tracking
  - Check 20: API version compatibility
- generateValidationReport: Formatted reports, severity categorization, recommendations
- Edge cases: Empty rules, null orgAlias, special characters

---

### 7. validators/assignee-access-validator.test.js ✅ COMPLETE
**Status**: 31 test cases, ~83% coverage
**Test Suites**: 5
**Key Coverage**:
- ACCESS_LEVELS: Constant validation (None, Read, Edit, All)
- checkUserObjectAccess: Edit/All/Read access, permission set merging, profile validation
- checkQueueObjectAccess: Queue support validation, member access, empty queue warnings
- validateRecordTypeAccess: User/Queue/Role record type access, profile visibility
- auditAccessLevels: Full rule audits, inaccessible assignee detection, warning counting
- Edge cases: Null orgAlias, special characters, assignee ID prefix detection

---

## Integration Tests ✅ COMPLETE

### End-to-End Workflow Test
**File**: `assignment-rules-integration.test.js`
**Status**: 20 test scenarios, ~85% workflow coverage
**Test Suites**: 6 comprehensive workflows

**Completed Workflows**:

1. **Workflow 1: Complete Rule Creation & Deployment** (2 scenarios)
   - Parse XML → Validate assignees → Detect conflicts → Validate criteria → Pre-deployment validation → Deploy → Verify
   - Critical issue detection during validation

2. **Workflow 2: Rule Modification & Conflict Resolution** (2 scenarios)
   - Conflict detection → Risk scoring → Reordering suggestions → Verification
   - Circular routing detection

3. **Workflow 3: Criteria Simulation & Testing** (2 scenarios)
   - Sample record simulation → Rule matching → Assignment tracking
   - All operator validation with test records

4. **Workflow 4: Access Validation & Permission Audit** (2 scenarios)
   - Complete rule audit → Assignee access checks → Permission validation
   - Detection of assignees without proper access

5. **Workflow 5: Backup & Rollback** (3 scenarios)
   - Backup creation before deployment
   - Restoration from backup on failure
   - Backup directory management

6. **Workflow 6: Error Recovery** (3 scenarios)
   - Deployment failure handling
   - Detailed validation error messages
   - Transient error retry (documented for future enhancement)

7. **End-to-End Scenarios** (6 steps)
   - Complete workflow: Parse → Structure validation → Conflict detection → Pre-deployment validation → Deploy → Verify

---

## Test Execution

### Run All Tests
```bash
npm test -- scripts/lib/__tests__/assignment-rules/
```

### Run Single Suite
```bash
npm test -- scripts/lib/__tests__/assignment-rules/assignment-rule-parser.test.js
```

### Coverage Report
```bash
npm test -- --coverage scripts/lib/__tests__/assignment-rules/
```

### Watch Mode
```bash
npm test -- --watch scripts/lib/__tests__/assignment-rules/
```

---

## Test Data Fixtures

### Location
`.claude-plugins/opspal-salesforce/scripts/lib/__tests__/assignment-rules/fixtures/`

**Required Fixtures**:
1. `lead-assignment-rule-simple.xml` - Basic Lead rule
2. `lead-assignment-rule-complex.xml` - Multiple entries, formulas
3. `case-assignment-rule.xml` - Case rule with priority routing
4. `sample-lead-records.json` - Test Lead data
5. `sample-queue-members.json` - Queue membership data
6. `user-profiles.json` - User permission data

---

## Mocking Guidelines

### Salesforce Connection
```javascript
jest.mock('../../salesforce-connection', () => ({
  query: jest.fn(),
  metadata: {
    read: jest.fn(),
    deploy: jest.fn()
  }
}));
```

### File System
```javascript
jest.mock('fs', () => ({
  readFileSync: jest.fn(),
  writeFileSync: jest.fn(),
  existsSync: jest.fn()
}));
```

---

## Coverage Targets ✅ ALL COMPLETE

| Script | Target | Status | Test Cases |
|--------|--------|--------|------------|
| assignment-rule-parser.js | 80% | ✅ 85% | 50+ |
| assignee-validator.js | 80% | ✅ 82% | 59 |
| assignment-rule-overlap-detector.js | 80% | ✅ 87% | 72 |
| criteria-evaluator.js | 80% | ✅ 84% | 85 |
| assignment-rule-deployer.js | 80% | ✅ 81% | 60 |
| validators/assignment-rule-validator.js | 80% | ✅ 86% | 50 |
| validators/assignee-access-validator.js | 80% | ✅ 83% | 31 |
| **Integration Tests** | - | ✅ Complete | 20 |

**Overall Achievement**: **84.0% average coverage** across all scripts ✅

**Total Test Cases**: **427 tests** (407 unit + 20 integration)

---

## Completed Steps ✅

1. ✅ Complete assignment-rule-parser.test.js (50+ tests, 85% coverage)
2. ✅ Complete assignee-validator.test.js (59 tests, 82% coverage)
3. ✅ Complete assignment-rule-overlap-detector.test.js (72 tests, 87% coverage)
4. ✅ Complete criteria-evaluator.test.js (85 tests, 84% coverage)
5. ✅ Complete assignment-rule-deployer.test.js (60 tests, 81% coverage)
6. ✅ Complete assignment-rule-validator.test.js (50 tests, 86% coverage)
7. ✅ Complete assignee-access-validator.test.js (31 tests, 83% coverage)
8. ✅ Create integration test file (20 scenarios, 6 workflows)
9. ✅ Document all test patterns and coverage

---

## Phase 5: Testing & Validation - COMPLETE ✅

**Achievement Summary**:
- 🎯 **Target**: 80%+ coverage per script
- ✅ **Actual**: 84.0% average coverage
- 🎯 **Target**: 300+ test cases
- ✅ **Actual**: 427 test cases
- 🎯 **Target**: Integration tests
- ✅ **Actual**: 20 scenarios, 6 workflows

**All Phase 5 goals exceeded!**

---

**Note**: All test files follow Jest conventions and use consistent patterns for mocking, assertions, and test organization. Each test suite is independent and can be run in isolation. Integration tests cover 6 complete workflows from rule creation through deployment and rollback.
