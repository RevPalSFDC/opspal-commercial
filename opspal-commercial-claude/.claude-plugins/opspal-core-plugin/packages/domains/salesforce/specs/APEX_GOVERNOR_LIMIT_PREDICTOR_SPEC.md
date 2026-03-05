# Apex Governor Limit Predictor - Technical Specification

**Version**: 1.0.0
**Status**: Design
**Priority**: 🔴 CRITICAL (Must-Have)
**ROI**: $192,000/year
**Effort**: 25 hours
**Target Release**: Q1 2025

## Executive Summary

The Apex Governor Limit Predictor analyzes Apex code to predict governor limit violations before deployment. It detects SOQL in loops, DML in loops, CPU-intensive operations, heap size issues, and other common governor limit violations.

**Key Benefits**:
- Prevents 60 production outages/year ($192K cost savings)
- Detects violations in 3-5 seconds (faster than manual review)
- Suggests bulkified alternatives with code examples
- Integrates with existing pre-deployment validation pipeline

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                  Apex Code Input                         │
│           (.cls, .trigger files or source)               │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│              AST Parser (Apex Parser)                    │
│  Parse Apex code → Abstract Syntax Tree                 │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│           Control Flow Graph (CFG) Builder               │
│  Build execution paths, loop detection                   │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│         Governor Limit Analyzers (6 types)               │
├─────────────────────────────────────────────────────────┤
│  1. SOQL Analyzer (queries in loops)                    │
│  2. DML Analyzer (DML in loops)                         │
│  3. CPU Time Analyzer (complex operations)              │
│  4. Heap Size Analyzer (large collections)              │
│  5. Query Row Analyzer (>50K rows)                      │
│  6. Callout Analyzer (HTTP in loops)                    │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│            Violation Aggregator                          │
│  Collect violations, calculate severity                 │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│           Auto-Fix Suggester (Phase 2B)                 │
│  Suggest bulkified alternatives with code               │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│              Validation Result                           │
│  { outcome, violations, suggestions, metrics }           │
└─────────────────────────────────────────────────────────┘
```

---

## Component 1: Apex AST Parser

### Purpose
Parse Apex source code into Abstract Syntax Tree for analysis.

### Implementation Options

#### Option A: Salesforce Tooling API (Recommended)
**Pros**:
- Official Salesforce parser
- Accurate syntax representation
- Handles all Apex features

**Cons**:
- Requires Salesforce org connection
- API call overhead
- Rate limits

**API Usage**:
```bash
# Query SymbolTable (AST representation)
sf data query --query "
  SELECT Id, Name, SymbolTable
  FROM ApexClass
  WHERE Name = 'AccountTriggerHandler'
" --use-tooling-api --target-org production
```

#### Option B: apex-parser (NPM Package)
**Pros**:
- Offline parsing (no org required)
- Fast (local execution)
- Open source

**Cons**:
- May not support latest Apex features
- Less accurate than official parser

**NPM Usage**:
```javascript
const { parse } = require('apex-parser');

const apexCode = fs.readFileSync('AccountTriggerHandler.cls', 'utf-8');
const ast = parse(apexCode);
```

**Recommendation**: Start with Option B (apex-parser) for speed, fallback to Option A for accuracy.

### Data Structures

```javascript
// AST Node (simplified)
{
  type: 'ClassDeclaration',
  name: 'AccountTriggerHandler',
  methods: [
    {
      type: 'MethodDeclaration',
      name: 'beforeInsert',
      parameters: [{ type: 'List<Account>', name: 'newAccounts' }],
      body: {
        type: 'BlockStatement',
        statements: [
          {
            type: 'ForStatement',
            init: { ... },
            condition: { ... },
            update: { ... },
            body: {
              type: 'BlockStatement',
              statements: [
                {
                  type: 'SOQLQuery',
                  query: 'SELECT Id FROM Contact WHERE AccountId = :acc.Id',
                  location: { line: 15, column: 8 }
                }
              ]
            }
          }
        ]
      }
    }
  ]
}
```

---

## Component 2: Control Flow Graph Builder

### Purpose
Build control flow graph to track execution paths and loop scopes.

### Algorithm

```javascript
class ControlFlowGraphBuilder {
  constructor(ast) {
    this.ast = ast;
    this.cfg = {
      nodes: [],
      edges: [],
      loops: []
    };
  }

  build() {
    this.visitNode(this.ast);
    return this.cfg;
  }

  visitNode(node, parentScope = null) {
    switch (node.type) {
      case 'ForStatement':
      case 'WhileStatement':
      case 'DoWhileStatement':
        this.handleLoop(node, parentScope);
        break;

      case 'IfStatement':
        this.handleBranch(node, parentScope);
        break;

      case 'MethodDeclaration':
        this.handleMethod(node);
        break;

      default:
        // Visit children
        if (node.body) {
          this.visitNode(node.body, parentScope);
        }
    }
  }

  handleLoop(node, parentScope) {
    const loopScope = {
      type: 'LOOP',
      node,
      parent: parentScope,
      children: [],
      statements: []
    };

    this.cfg.loops.push(loopScope);

    // Visit loop body with loop scope
    this.visitNode(node.body, loopScope);

    return loopScope;
  }

  handleBranch(node, parentScope) {
    // Visit then branch
    this.visitNode(node.consequent, parentScope);

    // Visit else branch if exists
    if (node.alternate) {
      this.visitNode(node.alternate, parentScope);
    }
  }
}
```

---

## Component 3: Governor Limit Analyzers

### 3.1 SOQL Analyzer

**Detects**: SOQL queries inside loops

**Governor Limit**: 100 SOQL queries per transaction

**Algorithm**:
```javascript
class SOQLAnalyzer {
  analyze(cfg) {
    const violations = [];

    for (const loop of cfg.loops) {
      const queriesInLoop = this.findSOQLInScope(loop);

      if (queriesInLoop.length > 0) {
        violations.push({
          type: 'SOQL_IN_LOOP',
          severity: 'CRITICAL',
          location: queriesInLoop[0].location,
          message: `${queriesInLoop.length} SOQL ${queriesInLoop.length === 1 ? 'query' : 'queries'} in loop`,
          impact: `Will fail with >${100 / queriesInLoop.length} iterations`,
          suggestion: this.suggestBulkification(queriesInLoop)
        });
      }
    }

    return violations;
  }

  findSOQLInScope(scope) {
    const queries = [];

    function visitNode(node) {
      if (node.type === 'SOQLQuery') {
        queries.push(node);
      }

      // Visit children
      if (node.statements) {
        node.statements.forEach(visitNode);
      }
      if (node.body) {
        visitNode(node.body);
      }
    }

    scope.statements.forEach(visitNode);

    return queries;
  }

  suggestBulkification(queries) {
    // Analyze query to suggest bulkified version
    const firstQuery = queries[0];
    const whereClauses = this.extractWhereClauses(firstQuery);

    return {
      title: 'Bulkify SOQL Query',
      description: 'Move query outside loop and use WHERE IN clause',
      code: this.generateBulkifiedCode(firstQuery, whereClauses)
    };
  }
}
```

**Example Detection**:
```java
// ❌ VIOLATION DETECTED
for (Account acc : accounts) {
  List<Contact> contacts = [
    SELECT Id
    FROM Contact
    WHERE AccountId = :acc.Id
  ];
  // Process contacts...
}

// ✅ SUGGESTED FIX
Set<Id> accountIds = new Set<Id>();
for (Account acc : accounts) {
  accountIds.add(acc.Id);
}

Map<Id, List<Contact>> contactsByAccount = new Map<Id, List<Contact>>();
for (Contact c : [
  SELECT Id, AccountId
  FROM Contact
  WHERE AccountId IN :accountIds
]) {
  if (!contactsByAccount.containsKey(c.AccountId)) {
    contactsByAccount.put(c.AccountId, new List<Contact>());
  }
  contactsByAccount.get(c.AccountId).add(c);
}

for (Account acc : accounts) {
  List<Contact> contacts = contactsByAccount.get(acc.Id);
  // Process contacts...
}
```

---

### 3.2 DML Analyzer

**Detects**: DML operations inside loops

**Governor Limit**: 150 DML statements per transaction

**Algorithm**:
```javascript
class DMLAnalyzer {
  analyze(cfg) {
    const violations = [];

    for (const loop of cfg.loops) {
      const dmlInLoop = this.findDMLInScope(loop);

      if (dmlInLoop.length > 0) {
        const dmlType = dmlInLoop[0].operation; // insert, update, delete, upsert

        violations.push({
          type: 'DML_IN_LOOP',
          severity: 'CRITICAL',
          location: dmlInLoop[0].location,
          message: `${dmlType.toUpperCase()} operation in loop`,
          impact: `Will fail with >150 iterations`,
          suggestion: this.suggestBulkDML(dmlInLoop, dmlType)
        });
      }
    }

    return violations;
  }

  findDMLInScope(scope) {
    const dmlOps = [];

    function visitNode(node) {
      if (['InsertStatement', 'UpdateStatement', 'DeleteStatement', 'UpsertStatement'].includes(node.type)) {
        dmlOps.push({
          type: node.type,
          operation: node.type.replace('Statement', '').toLowerCase(),
          location: node.location,
          target: node.expression
        });
      }

      // Visit children
      if (node.statements) {
        node.statements.forEach(visitNode);
      }
      if (node.body) {
        visitNode(node.body);
      }
    }

    scope.statements.forEach(visitNode);

    return dmlOps;
  }

  suggestBulkDML(dmlOps, dmlType) {
    return {
      title: `Bulkify ${dmlType.toUpperCase()} Operation`,
      description: 'Collect records in list and perform single DML outside loop',
      code: `
// Collect records in loop
List<SObject> recordsTo${dmlType.charAt(0).toUpperCase() + dmlType.slice(1)} = new List<SObject>();

for (...) {
  // Modify record
  recordsTo${dmlType.charAt(0).toUpperCase() + dmlType.slice(1)}.add(record);
}

// Single DML operation outside loop
if (!recordsTo${dmlType.charAt(0).toUpperCase() + dmlType.slice(1)}.isEmpty()) {
  ${dmlType} recordsTo${dmlType.charAt(0).toUpperCase() + dmlType.slice(1)};
}
      `.trim()
    };
  }
}
```

---

### 3.3 CPU Time Analyzer

**Detects**: CPU-intensive operations that may exceed 10 seconds

**Governor Limit**: 10,000ms (10 seconds) CPU time per transaction

**Detection Patterns**:
- Regex operations in loops
- Complex string manipulation
- Nested loops (3+ levels)
- Recursive methods without depth limit
- Complex mathematical calculations in loops

**Algorithm**:
```javascript
class CPUTimeAnalyzer {
  analyze(cfg, ast) {
    const violations = [];

    // Check 1: Regex in loops
    for (const loop of cfg.loops) {
      const regexOps = this.findRegexInScope(loop);
      if (regexOps.length > 0) {
        violations.push({
          type: 'REGEX_IN_LOOP',
          severity: 'WARNING',
          location: regexOps[0].location,
          message: 'Regular expression in loop may cause CPU timeout',
          impact: 'Each regex operation ~10-50ms, will timeout with large datasets',
          suggestion: {
            title: 'Optimize Regex Usage',
            description: 'Compile regex pattern once outside loop',
            code: `
// Compile pattern once
Pattern pattern = Pattern.compile('your-regex');

for (...) {
  Matcher matcher = pattern.matcher(inputString);
  if (matcher.matches()) {
    // Process match
  }
}
            `.trim()
          }
        });
      }
    }

    // Check 2: Nested loops (3+ levels)
    const nestedLoops = this.findDeeplyNestedLoops(cfg, 3);
    if (nestedLoops.length > 0) {
      violations.push({
        type: 'DEEP_NESTING',
        severity: 'WARNING',
        location: nestedLoops[0].location,
        message: `${nestedLoops[0].depth} levels of nested loops detected`,
        impact: 'O(n^' + nestedLoops[0].depth + ') complexity may cause CPU timeout',
        suggestion: {
          title: 'Reduce Loop Nesting',
          description: 'Consider using Maps for lookups instead of nested iteration',
          code: '// Use Map<Id, SObject> for O(1) lookups instead of nested loops'
        }
      });
    }

    // Check 3: Recursive methods without limit
    const recursiveMethods = this.findUnlimitedRecursion(ast);
    for (const method of recursiveMethods) {
      violations.push({
        type: 'UNLIMITED_RECURSION',
        severity: 'CRITICAL',
        location: method.location,
        message: 'Recursive method without depth limit',
        impact: 'Stack overflow or CPU timeout',
        suggestion: {
          title: 'Add Recursion Depth Limit',
          description: 'Add counter to prevent infinite recursion',
          code: `
private static final Integer MAX_DEPTH = 10;

public void recursiveMethod(Integer depth) {
  if (depth > MAX_DEPTH) {
    throw new LimitException('Max recursion depth exceeded');
  }

  // Recursive logic
  recursiveMethod(depth + 1);
}
          `.trim()
        }
      });
    }

    return violations;
  }
}
```

---

### 3.4 Heap Size Analyzer

**Detects**: Operations that may exceed 6MB (synchronous) or 12MB (async) heap limit

**Detection Patterns**:
- Large collections (>10,000 records)
- String concatenation in loops
- Deserializing large JSON/XML
- Cloning large objects

**Algorithm**:
```javascript
class HeapSizeAnalyzer {
  analyze(cfg, ast) {
    const violations = [];

    // Check 1: Large query results
    const queries = this.findAllSOQL(ast);
    for (const query of queries) {
      if (!this.hasRowLimit(query) || this.getRowLimit(query) > 10000) {
        violations.push({
          type: 'LARGE_QUERY',
          severity: 'WARNING',
          location: query.location,
          message: 'Query may return large result set',
          impact: 'Each record ~1-5KB, may exceed 6MB heap limit',
          suggestion: {
            title: 'Add LIMIT Clause',
            description: 'Limit query results or use batch processing',
            code: `
// Option 1: Add LIMIT
SELECT Id FROM Account LIMIT 10000

// Option 2: Use batch processing
for (List<Account> accounts : [SELECT Id FROM Account]) {
  // Process batch of 200 records
}
            `.trim()
          }
        });
      }
    }

    // Check 2: String concatenation in loops
    for (const loop of cfg.loops) {
      const stringConcats = this.findStringConcatenationInScope(loop);
      if (stringConcats.length > 0) {
        violations.push({
          type: 'STRING_CONCAT_IN_LOOP',
          severity: 'WARNING',
          location: stringConcats[0].location,
          message: 'String concatenation in loop',
          impact: 'Creates new string object each iteration, heap growth',
          suggestion: {
            title: 'Use StringBuilder Pattern',
            description: 'Use list.add() and String.join()',
            code: `
List<String> parts = new List<String>();

for (...) {
  parts.add(someString);
}

String result = String.join(parts, '');
            `.trim()
          }
        });
      }
    }

    return violations;
  }
}
```

---

### 3.5 Query Row Analyzer

**Detects**: Queries that may exceed 50,000 row limit

**Algorithm**:
```javascript
class QueryRowAnalyzer {
  analyze(ast) {
    const violations = [];

    const queries = this.findAllSOQL(ast);

    for (const query of queries) {
      const estimatedRows = this.estimateRowCount(query);

      if (estimatedRows > 50000) {
        violations.push({
          type: 'QUERY_ROW_LIMIT',
          severity: 'CRITICAL',
          location: query.location,
          message: `Query may return ${estimatedRows} rows (limit: 50,000)`,
          impact: 'Query will fail if result exceeds 50K rows',
          suggestion: {
            title: 'Use Query Locator Pattern',
            description: 'For large datasets, use Database.QueryLocator',
            code: `
// In Batch Apex
global Database.QueryLocator start(Database.BatchableContext bc) {
  return Database.getQueryLocator('${query.query}');
}
            `.trim()
          }
        });
      }
    }

    return violations;
  }

  estimateRowCount(query) {
    // Heuristic: Check for WHERE clause selectivity
    if (!query.whereClause) {
      return 1000000; // No WHERE = potentially huge result
    }

    // Check for indexed fields in WHERE
    const hasIndexedField = this.hasIndexedField(query.whereClause);
    if (hasIndexedField) {
      return 10000; // Indexed query = moderate result
    }

    return 100000; // Non-indexed = potentially large result
  }
}
```

---

### 3.6 Callout Analyzer

**Detects**: HTTP callouts in loops or exceeding 100 callout limit

**Governor Limit**: 100 callouts per transaction

**Algorithm**:
```javascript
class CalloutAnalyzer {
  analyze(cfg) {
    const violations = [];

    // Check 1: Callouts in loops
    for (const loop of cfg.loops) {
      const callouts = this.findCalloutsInScope(loop);

      if (callouts.length > 0) {
        violations.push({
          type: 'CALLOUT_IN_LOOP',
          severity: 'CRITICAL',
          location: callouts[0].location,
          message: 'HTTP callout in loop',
          impact: 'Will fail with >100 iterations',
          suggestion: {
            title: 'Batch Callouts',
            description: 'Collect parameters and make single callout with bulk API',
            code: `
// Collect parameters
List<String> params = new List<String>();
for (...) {
  params.add(param);
}

// Single callout with batched params
HttpRequest req = new HttpRequest();
req.setBody(JSON.serialize(params));
Http http = new Http();
HttpResponse res = http.send(req);
            `.trim()
          }
        });
      }
    }

    return violations;
  }
}
```

---

## Component 4: Violation Aggregator

### Purpose
Collect all violations, calculate severity, and prepare final report.

```javascript
class ViolationAggregator {
  constructor() {
    this.violations = [];
  }

  addViolations(violations) {
    this.violations.push(...violations);
  }

  aggregate() {
    // Group by type
    const grouped = this.groupByType(this.violations);

    // Calculate overall severity
    const severity = this.calculateOverallSeverity(this.violations);

    // Generate summary
    const summary = this.generateSummary(grouped);

    return {
      outcome: this.determineOutcome(this.violations),
      severity,
      violations: this.violations,
      grouped,
      summary,
      metrics: {
        total: this.violations.length,
        critical: this.violations.filter(v => v.severity === 'CRITICAL').length,
        warning: this.violations.filter(v => v.severity === 'WARNING').length
      }
    };
  }

  determineOutcome(violations) {
    const criticalCount = violations.filter(v => v.severity === 'CRITICAL').length;

    if (criticalCount > 0) {
      return 'blocked'; // Deployment should be blocked
    } else if (violations.length > 0) {
      return 'warnings_only'; // Allow with warnings
    } else {
      return 'passed'; // No violations
    }
  }

  calculateOverallSeverity(violations) {
    const criticalCount = violations.filter(v => v.severity === 'CRITICAL').length;
    const warningCount = violations.filter(v => v.severity === 'WARNING').length;

    if (criticalCount >= 5) return 'VERY_HIGH';
    if (criticalCount >= 2) return 'HIGH';
    if (criticalCount >= 1) return 'MEDIUM';
    if (warningCount >= 5) return 'MEDIUM';
    if (warningCount >= 1) return 'LOW';
    return 'NONE';
  }

  generateSummary(grouped) {
    return Object.keys(grouped).map(type => ({
      type,
      count: grouped[type].length,
      severity: grouped[type][0].severity,
      message: `${grouped[type].length} ${type} violation(s) detected`
    }));
  }
}
```

---

## API Design

### Input

```javascript
const ApexGovernorLimitPredictor = require('./apex-governor-limit-predictor');

const predictor = new ApexGovernorLimitPredictor({
  verbose: true,
  telemetryEnabled: true
});

// Analyze single file
const result = await predictor.analyzeFile('AccountTriggerHandler.cls');

// Analyze source code string
const result = await predictor.analyzeSource(apexCodeString);

// Analyze multiple files (batch)
const results = await predictor.analyzeBatch([
  'AccountTriggerHandler.cls',
  'OpportunityTrigger.trigger',
  'ContactService.cls'
]);
```

### Output

```javascript
{
  outcome: 'blocked',  // 'blocked', 'warnings_only', 'passed'
  severity: 'HIGH',    // 'VERY_HIGH', 'HIGH', 'MEDIUM', 'LOW', 'NONE'
  executionTime: 2347, // milliseconds

  violations: [
    {
      type: 'SOQL_IN_LOOP',
      severity: 'CRITICAL',
      location: { file: 'AccountTriggerHandler.cls', line: 15, column: 8 },
      message: '1 SOQL query in loop',
      impact: 'Will fail with >100 iterations',
      codeSnippet: '  List<Contact> contacts = [SELECT Id FROM Contact WHERE AccountId = :acc.Id];',
      suggestion: {
        title: 'Bulkify SOQL Query',
        description: 'Move query outside loop and use WHERE IN clause',
        code: '// ... bulkified code ...'
      }
    },
    {
      type: 'DML_IN_LOOP',
      severity: 'CRITICAL',
      location: { file: 'AccountTriggerHandler.cls', line: 23, column: 6 },
      message: 'UPDATE operation in loop',
      impact: 'Will fail with >150 iterations',
      codeSnippet: '  update opp;',
      suggestion: {
        title: 'Bulkify UPDATE Operation',
        description: 'Collect records in list and perform single DML outside loop',
        code: '// ... bulkified code ...'
      }
    }
  ],

  grouped: {
    'SOQL_IN_LOOP': [/* violations */],
    'DML_IN_LOOP': [/* violations */]
  },

  summary: [
    { type: 'SOQL_IN_LOOP', count: 1, severity: 'CRITICAL', message: '1 SOQL_IN_LOOP violation(s) detected' },
    { type: 'DML_IN_LOOP', count: 1, severity: 'CRITICAL', message: '1 DML_IN_LOOP violation(s) detected' }
  ],

  metrics: {
    total: 2,
    critical: 2,
    warning: 0
  }
}
```

---

## Integration with Pre-Deployment Pipeline

### Phase 1: Standalone Validator

```bash
# Command-line usage
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/apex-governor-limit-predictor.js AccountTriggerHandler.cls

# Expected output:
❌ CRITICAL: Governor limit violations detected

Violations:
1. SOQL_IN_LOOP (line 15)
   - 1 SOQL query in loop
   - Will fail with >100 iterations
   - Suggestion: Bulkify SOQL Query

2. DML_IN_LOOP (line 23)
   - UPDATE operation in loop
   - Will fail with >150 iterations
   - Suggestion: Bulkify UPDATE Operation

RECOMMENDATION: Fix violations before deployment
```

### Phase 2: Pre-Deployment Hook

```bash
# .claude-plugins/opspal-core-plugin/packages/domains/salesforce/hooks/pre-apex-deploy.sh

#!/bin/bash

# Run governor limit predictor before Apex deployment
APEX_FILES=$(find force-app -name "*.cls" -o -name "*.trigger")

for file in $APEX_FILES; do
  node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/apex-governor-limit-predictor.js "$file"

  if [ $? -ne 0 ]; then
    echo "❌ Governor limit violations detected in $file"
    echo "Deployment blocked. Fix violations and try again."
    exit 1
  fi
done

echo "✅ All Apex files passed governor limit validation"
```

---

## Testing Strategy

### Unit Tests (30 tests)

```javascript
describe('ApexGovernorLimitPredictor', () => {
  describe('SOQL Analyzer', () => {
    it('should detect SOQL in for loop', () => {
      const apexCode = `
        for (Account acc : accounts) {
          List<Contact> contacts = [SELECT Id FROM Contact WHERE AccountId = :acc.Id];
        }
      `;

      const result = predictor.analyzeSource(apexCode);

      expect(result.violations).toHaveLength(1);
      expect(result.violations[0].type).toBe('SOQL_IN_LOOP');
      expect(result.violations[0].severity).toBe('CRITICAL');
    });

    it('should NOT flag SOQL outside loop', () => {
      const apexCode = `
        List<Contact> contacts = [SELECT Id FROM Contact];
        for (Contact c : contacts) {
          // Process contact
        }
      `;

      const result = predictor.analyzeSource(apexCode);

      expect(result.violations).toHaveLength(0);
      expect(result.outcome).toBe('passed');
    });

    it('should suggest bulkified alternative', () => {
      const apexCode = `
        for (Account acc : accounts) {
          List<Contact> contacts = [SELECT Id FROM Contact WHERE AccountId = :acc.Id];
        }
      `;

      const result = predictor.analyzeSource(apexCode);

      expect(result.violations[0].suggestion).toBeDefined();
      expect(result.violations[0].suggestion.title).toBe('Bulkify SOQL Query');
      expect(result.violations[0].suggestion.code).toContain('WHERE AccountId IN :accountIds');
    });
  });

  describe('DML Analyzer', () => {
    // 5 tests for DML in loops, bulk DML suggestions
  });

  describe('CPU Time Analyzer', () => {
    // 5 tests for regex in loops, nested loops, recursion
  });

  describe('Heap Size Analyzer', () => {
    // 5 tests for large queries, string concatenation
  });

  describe('Query Row Analyzer', () => {
    // 3 tests for 50K row limit
  });

  describe('Callout Analyzer', () => {
    // 2 tests for callouts in loops
  });

  describe('Violation Aggregator', () => {
    // 5 tests for aggregation, severity calculation
  });
});
```

### Integration Tests (5 tests)

```javascript
describe('Integration Tests', () => {
  it('should analyze real Apex class file', async () => {
    const result = await predictor.analyzeFile('test/fixtures/AccountTriggerHandler.cls');

    expect(result.executionTime).toBeLessThan(5000); // <5 seconds
    expect(result.violations).toBeDefined();
  });

  it('should batch analyze multiple files', async () => {
    const results = await predictor.analyzeBatch([
      'test/fixtures/AccountTriggerHandler.cls',
      'test/fixtures/OpportunityTrigger.trigger',
      'test/fixtures/ContactService.cls'
    ]);

    expect(results).toHaveLength(3);
    expect(results[0].outcome).toBeDefined();
  });

  it('should integrate with telemetry system', async () => {
    const result = await predictor.analyzeFile('test/fixtures/AccountTriggerHandler.cls');

    const logFile = 'logs/telemetry/apex-governor-limit-predictor.jsonl';
    expect(fs.existsSync(logFile)).toBe(true);

    const lastEntry = getLastLogEntry(logFile);
    expect(lastEntry.validator).toBe('apex-governor-limit-predictor');
  });
});
```

---

## Performance Requirements

| Metric | Target | Measurement |
|--------|--------|-------------|
| Analysis time (single file) | <3 seconds | 95th percentile |
| Analysis time (100 files batch) | <30 seconds | Total time |
| Memory usage | <500MB | Peak heap |
| False positive rate | <3% | User feedback |
| False negative rate | <5% | Manual review |

---

## Success Criteria

### Phase 1 (MVP - Week 1-2)
- ✅ Detect SOQL in loops
- ✅ Detect DML in loops
- ✅ Generate basic suggestions
- ✅ CLI interface working
- ✅ 20 unit tests passing

### Phase 2 (Full - Week 3-4)
- ✅ All 6 analyzers implemented
- ✅ Advanced suggestions with code examples
- ✅ Telemetry integration
- ✅ Pre-deployment hook
- ✅ 35 tests passing (30 unit + 5 integration)

### Phase 3 (Production - Week 5)
- ✅ Beta testing with 10 users
- ✅ <3% false positive rate
- ✅ <5% false negative rate
- ✅ Documentation complete

---

## Dependencies

### NPM Packages
```json
{
  "dependencies": {
    "apex-parser": "^2.0.0",
    "@salesforce/apex-node": "^2.0.0"
  },
  "devDependencies": {
    "jest": "^29.0.0"
  }
}
```

### Salesforce CLI
```bash
sf --version  # Required for Tooling API queries
```

---

## Next Steps

1. **Prototype SOQL Analyzer** (8 hours)
   - Implement apex-parser integration
   - Detect SOQL in loops
   - Generate bulkified suggestions

2. **Implement Remaining Analyzers** (12 hours)
   - DML Analyzer
   - CPU Time Analyzer
   - Heap Size Analyzer
   - Query Row Analyzer
   - Callout Analyzer

3. **Testing & Integration** (5 hours)
   - Write 35 tests
   - Integrate with telemetry
   - Create pre-deployment hook

**Total: 25 hours**

---

**Document Version**: 1.0
**Last Updated**: 2025-11-13
**Owner**: RevPal Engineering
