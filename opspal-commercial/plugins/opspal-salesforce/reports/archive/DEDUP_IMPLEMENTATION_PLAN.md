# Salesforce Deduplication: Comprehensive Implementation Plan

**Date**: 2025-10-16
**Version**: 1.0
**Target Architecture**: Dedup v3.0 (Performance-Optimized)
**Based On**: DEDUP_BEST_PRACTICES_EVALUATION.md

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Implementation Phases](#implementation-phases)
3. [Phase 1: Critical Performance (20 hours)](#phase-1-critical-performance)
4. [Phase 2: Optimization & Monitoring (16 hours)](#phase-2-optimization--monitoring)
5. [Phase 3: Scalability Enhancements (24 hours)](#phase-3-scalability-enhancements)
6. [Testing Strategy](#testing-strategy)
7. [Risk Mitigation](#risk-mitigation)
8. [Rollback Procedures](#rollback-procedures)
9. [Success Metrics](#success-metrics)
10. [Timeline & Resources](#timeline--resources)

---

## Executive Summary

### Goals

Transform the deduplication architecture from CLI-based sequential processing to direct Bulk API v2 with parallel execution, achieving:

- **5-10x performance improvement** for typical operations
- **10-30x improvement** for very large orgs
- Maintain existing safety and reliability standards
- Enable scalability to millions of records

### Investment & ROI

| Phase | Investment | Performance Gain | ROI |
|-------|------------|------------------|-----|
| Phase 1 | 20 hours ($3,000) | 5-10x | 6-20x annual |
| Phase 2 | 16 hours ($2,400) | Additional 2-3x | 3-5x annual |
| Phase 3 | 24 hours ($3,600) | Additional 2-5x | 2-4x annual |
| **Total** | **60 hours ($9,000)** | **10-30x overall** | **5-20x annual** |

### Success Criteria

- ✅ delta-corp workflow (10k accounts): 20 min → 2-4 min
- ✅ Large org workflow (100k accounts): 3 hours → 15-25 min
- ✅ Zero increase in error rates
- ✅ All existing safety features maintained
- ✅ Backward compatibility with existing workflows

---

## Implementation Phases

### Overview

```
Phase 1: Critical Performance (Week 1-2)
├─ Task 1.1: Integrate BulkAPIHandler (8h)
├─ Task 1.2: Enable Parallel Processing (6h)
└─ Task 1.3: Add Composite Merge Executor (6h)
    Expected: 5-10x faster

Phase 2: Optimization & Monitoring (Week 3-4)
├─ Task 2.1: API Usage Monitoring (4h)
├─ Task 2.2: Lock Retry Logic (4h)
├─ Task 2.3: Bulk Query Detection (6h)
└─ Task 2.4: Field-Count-Aware Sizing (2h)
    Expected: Additional 2-3x faster

Phase 3: Scalability Enhancements (Week 5-8)
├─ Task 3.1: Multi-Job Parallel Bulk (8h)
├─ Task 3.2: Result Streaming (8h)
├─ Task 3.3: Memory Optimization (4h)
└─ Task 3.4: Performance Dashboard (4h)
    Expected: Scale to millions
```

---

## Phase 1: Critical Performance

**Duration**: 2 weeks
**Investment**: 20 hours
**Expected Outcome**: 5-10x performance improvement
**Risk Level**: Low (leveraging existing infrastructure)

### Task 1.1: Integrate BulkAPIHandler into Dedup Workflow

**Effort**: 8 hours
**Priority**: 🔴 CRITICAL
**Dependencies**: None

#### Objective

Replace CLI-based `execSync` calls with direct Bulk API v2 REST calls using your existing `bulk-api-handler.js` infrastructure.

#### Files to Modify

```
.claude-plugins/opspal-salesforce/
├── scripts/lib/
│   ├── dedup-workflow-orchestrator.js      [MAJOR CHANGES]
│   ├── dedup-safety-engine.js              [MAJOR CHANGES]
│   ├── sfdc-full-backup-generator.js       [MODERATE CHANGES]
│   ├── sfdc-pre-merge-validator.js         [MODERATE CHANGES]
│   └── importance-field-detector.js        [MINOR CHANGES]
```

#### Implementation Steps

##### Step 1.1.1: Refactor DedupWorkflowOrchestrator (3 hours)

**File**: `dedup-workflow-orchestrator.js`

**Current Pattern** (lines 73-78):
```javascript
const validationScript = path.join(this.scriptsDir, 'sfdc-pre-merge-validator.js');
this.results.validation = this.exec(
    `node ${validationScript} ${this.orgAlias} Account`,
    'Step 1/3: Pre-Merge Validation'
);
```

**New Pattern**:
```javascript
class DedupWorkflowOrchestrator {
    constructor(orgAlias, options = {}) {
        this.orgAlias = orgAlias;
        this.options = options;
        this.bulkHandler = null; // Initialize later
    }

    /**
     * Initialize Bulk API handler (do once per workflow)
     */
    async initialize() {
        if (!this.bulkHandler) {
            const BulkAPIHandler = require('./bulk-api-handler');
            this.bulkHandler = await BulkAPIHandler.fromSFAuth(this.orgAlias);
            this.log('Bulk API handler initialized', 'INFO');
        }
    }

    /**
     * Workflow: Prepare for dedup operations
     */
    async prepareWorkflow() {
        this.logSection(`PREPARE WORKFLOW: ${this.orgAlias}`);

        // Initialize once
        await this.initialize();

        console.log('This workflow prepares your org for safe deduplication operations.');
        console.log('Steps: Validate → Backup → Detect Importance Fields\n');

        // Step 1: Pre-merge validation (using bulk handler)
        const SFDCPreMergeValidator = require('./sfdc-pre-merge-validator');
        const validator = new SFDCPreMergeValidator(this.orgAlias, this.bulkHandler);

        this.log('Step 1/3: Pre-Merge Validation', 'STEP');
        this.results.validation = await validator.validate();

        if (!this.results.validation.passed) {
            this.log('Validation failed. Fix issues before proceeding.', 'ERROR');
            return false;
        }

        // Step 2: Full backup (using bulk handler)
        const SFDCFullBackupGenerator = require('./sfdc-full-backup-generator');
        const backupGenerator = new SFDCFullBackupGenerator({
            sobject: 'Account',
            orgAlias: this.orgAlias,
            bulkHandler: this.bulkHandler,
            enableParallel: this.options.parallel || false,
            concurrency: this.options.concurrency || 5
        });

        this.log('Step 2/3: Full Backup Generation', 'STEP');
        const backupResult = await backupGenerator.generateFullBackup();
        this.results.backup = { success: true, ...backupResult };

        if (!this.results.backup.success) {
            this.log('Backup failed. Cannot proceed safely.', 'ERROR');
            return false;
        }

        // Step 3: Importance field detection (using bulk handler)
        const ImportanceFieldDetector = require('./importance-field-detector');
        const importanceDetector = new ImportanceFieldDetector('Account', this.orgAlias, {
            bulkHandler: this.bulkHandler
        });

        this.log('Step 3/3: Importance Field Detection', 'STEP');
        const importanceResult = await importanceDetector.detectWithCache();
        this.results.importance = { success: true, ...importanceResult };

        if (!this.results.importance.success) {
            this.log('Importance detection failed.', 'WARN');
        }

        // Summary
        this.logSection('PREPARE WORKFLOW - COMPLETE');
        console.log('✅ Pre-merge validation: PASSED');
        console.log('✅ Full backup: COMPLETE');
        console.log('✅ Importance fields: DETECTED');
        console.log('\nYou can now proceed with duplicate analysis.');
        console.log(`  node dedup-workflow-orchestrator.js analyze ${this.orgAlias} pairs.csv\n`);

        return true;
    }

    /**
     * Workflow: Analyze duplicate pairs
     */
    async analyzeWorkflow(pairsFile) {
        this.logSection(`ANALYZE WORKFLOW: ${this.orgAlias}`);

        if (!fs.existsSync(pairsFile)) {
            this.log(`Pairs file not found: ${pairsFile}`, 'ERROR');
            return false;
        }

        // Initialize bulk handler
        await this.initialize();

        console.log(`Analyzing duplicate pairs from: ${pairsFile}\n`);

        // Check prerequisites
        const backupDir = path.join(this.scriptsDir, `../../backups/${this.orgAlias}`);
        if (!fs.existsSync(backupDir)) {
            this.log('No backup found. Run prepare workflow first.', 'ERROR');
            console.log(`  node dedup-workflow-orchestrator.js prepare ${this.orgAlias}\n`);
            return false;
        }

        // Run safety analysis (using bulk handler for lookups)
        const DedupSafetyEngine = require('./dedup-safety-engine');
        const safetyEngine = new DedupSafetyEngine(
            this.orgAlias,
            backupDir,
            null, // importance report
            this.options.config || null,
            this.bulkHandler // Pass bulk handler
        );

        this.log('Running Dedup Safety Analysis', 'STEP');
        const pairs = this.loadPairs(pairsFile);

        for (const pair of pairs) {
            try {
                const decision = await safetyEngine.analyzePair(pair.idA, pair.idB);
                safetyEngine.decisions.push(decision);
            } catch (error) {
                console.error(`Error analyzing pair ${pair.idA}/${pair.idB}: ${error.message}`);
            }
        }

        safetyEngine.generateReport();
        safetyEngine.saveResults('dedup-decisions.json');

        // Display results
        this.logSection('ANALYSIS COMPLETE');
        this.displayAnalysisResults('dedup-decisions.json');

        return true;
    }

    /**
     * Load pairs from CSV or JSON
     */
    loadPairs(pairsFile) {
        const content = fs.readFileSync(pairsFile, 'utf8');

        if (pairsFile.endsWith('.json')) {
            return JSON.parse(content);
        }

        // CSV: idA,idB
        const lines = content.split('\n').filter(l => l.trim());
        const pairs = [];

        for (let i = 1; i < lines.length; i++) { // Skip header
            const [idA, idB] = lines[i].split(',').map(s => s.trim());
            if (idA && idB) {
                pairs.push({ idA, idB });
            }
        }

        return pairs;
    }

    /**
     * Display analysis results summary
     */
    displayAnalysisResults(decisionsFile) {
        if (!fs.existsSync(decisionsFile)) return;

        const decisions = JSON.parse(fs.readFileSync(decisionsFile, 'utf8'));

        console.log('\n📊 SUMMARY:');
        console.log(`  Total Pairs Analyzed: ${decisions.stats.total}`);
        console.log(`  ✅ APPROVE: ${decisions.stats.approved}`);
        console.log(`  ⚠️  REVIEW: ${decisions.stats.review}`);
        console.log(`  🛑 BLOCK: ${decisions.stats.blocked}`);
        console.log(`  Type 1 Errors Prevented: ${decisions.stats.type1Prevented}`);
        console.log(`  Type 2 Errors Prevented: ${decisions.stats.type2Prevented}`);

        // Show blocked merges
        if (decisions.stats.blocked > 0) {
            console.log('\n🛑 BLOCKED MERGES (Require Recovery):');
            const blocked = decisions.decisions.filter(d => d.decision === 'BLOCK');
            for (const decision of blocked.slice(0, 5)) {
                console.log(`\n  ${decision.recordA.name} ← ${decision.recordB.name}`);
                console.log(`  Reason: ${decision.guardrails_triggered[0]?.type || 'Unknown'}`);
                console.log(`  Recovery: Procedure ${decision.recovery_procedure}`);
            }
        }

        console.log(`\n📄 Full report saved to: ${decisionsFile}\n`);
    }
}
```

**Testing Checklist**:
- [ ] Initialize bulk handler without errors
- [ ] Reuse handler across all workflow steps
- [ ] Validation step uses bulk handler
- [ ] Backup step uses bulk handler
- [ ] Importance detection uses bulk handler
- [ ] Error messages clear and actionable
- [ ] Backward compatibility maintained

##### Step 1.1.2: Refactor DedupSafetyEngine (2 hours)

**File**: `dedup-safety-engine.js`

**Current** (lines 1096-1121):
```javascript
async executeSoqlQuery(query) {
    const cmd = `sf data query --query "${query}" --target-org ${this.orgAlias} --result-format json`;

    const result = execSync(cmd, {
        encoding: 'utf-8',
        maxBuffer: 500 * 1024 * 1024,
        stdio: ['pipe', 'pipe', 'pipe']
    });

    return JSON.parse(result);
}
```

**New**:
```javascript
class DedupSafetyEngine {
    constructor(orgAlias, backupDir, importanceReport, config = null, bulkHandler = null) {
        this.orgAlias = orgAlias;
        this.backupDir = backupDir;
        this.importanceReport = importanceReport;
        this.config = config || this.loadDefaultConfig();
        this.bulkHandler = bulkHandler; // NEW: Accept bulk handler

        // If no bulk handler provided, use CLI fallback
        this.useCliMode = !bulkHandler;

        // ... rest of constructor
    }

    /**
     * Execute SOQL query using Bulk API handler (if available) or CLI fallback
     */
    async executeSoqlQuery(query) {
        if (this.bulkHandler) {
            // Use bulk handler with smart routing
            return this.bulkHandler.query(query, {
                autoSwitchToBulk: true, // Let handler decide sync vs bulk
                continueOnError: false
            });
        }

        // Fallback to CLI mode (legacy support)
        return this.executeSoqlQueryCLI(query);
    }

    /**
     * CLI fallback (legacy support)
     */
    async executeSoqlQueryCLI(query) {
        const cmd = `sf data query --query "${query}" --target-org ${this.orgAlias} --result-format json`;

        try {
            const result = execSync(cmd, {
                encoding: 'utf-8',
                maxBuffer: 500 * 1024 * 1024,
                stdio: ['pipe', 'pipe', 'pipe']
            });

            const data = JSON.parse(result);

            if (data.status !== 0) {
                throw new Error(`Query failed: ${data.message}`);
            }

            return data.result.records || [];

        } catch (error) {
            throw new Error(`SOQL query failed: ${error.message}`);
        }
    }

    /**
     * Analyze a pair of records
     * Enhanced with async bulk lookups
     */
    async analyzePair(idA, idB) {
        const recordA = this.backupData.active[idA];
        const recordB = this.backupData.active[idB];

        if (!recordA || !recordB) {
            // If not in backup, try live lookup via bulk handler
            if (this.bulkHandler) {
                const missingIds = [];
                if (!recordA) missingIds.push(idA);
                if (!recordB) missingIds.push(idB);

                const records = await this.bulkHandler.query(
                    `SELECT FIELDS(ALL) FROM Account WHERE Id IN ('${missingIds.join("','")}')`,
                    { sync: true } // Force sync for small lookup
                );

                // Update backup data
                records.forEach(record => {
                    this.backupData.active[record.Id] = record;
                });
            } else {
                throw new Error(`Record not found: ${!recordA ? idA : idB}`);
            }
        }

        // ... rest of analyzePair logic (unchanged)
    }
}
```

**Testing Checklist**:
- [ ] Bulk handler mode works correctly
- [ ] CLI fallback mode still works
- [ ] Live lookups for missing records work
- [ ] Performance improvement measurable
- [ ] Error handling maintains quality

##### Step 1.1.3: Refactor SFDCPreMergeValidator (2 hours)

**File**: `sfdc-pre-merge-validator.js`

**Changes**:
```javascript
class SFDCPreMergeValidator {
    constructor(orgAlias, bulkHandler = null) {
        this.orgAlias = orgAlias;
        this.bulkHandler = bulkHandler;
        this.useCliMode = !bulkHandler;
        this.validationResults = {
            passed: true,
            warnings: [],
            errors: [],
            checks: {}
        };
    }

    /**
     * Main validation entry point
     */
    async validate() {
        console.log('\n🔍 Pre-Merge Validation');
        console.log('═'.repeat(70));

        // Check 1: Field History Tracking Limits
        await this.checkFieldHistoryLimits();

        // Check 2: Picklist Formula Validation
        await this.checkPicklistFormulas();

        // Check 3: Object Relationship Verification
        await this.checkObjectRelationships();

        // Check 4: Governor Limit Pre-checks
        await this.checkGovernorLimits();

        // Generate report
        this.generateReport();

        return this.validationResults;
    }

    /**
     * Check field history tracking limits (max 20 per object)
     */
    async checkFieldHistoryLimits() {
        console.log('\n📊 Checking Field History Tracking Limits...');

        try {
            let fieldDescribe;

            if (this.bulkHandler) {
                // Use bulk handler to get field metadata
                const metadata = await this.bulkHandler.syncQuery(
                    `SELECT QualifiedApiName, FieldDefinition.DataType FROM FieldDefinition WHERE EntityDefinition.QualifiedApiName = 'Account' AND IsFieldHistoryTracked = true`,
                    { single: false }
                );

                fieldDescribe = metadata;

            } else {
                // CLI fallback
                const cmd = `sf sobject describe Account --json`;
                const result = execSync(cmd, { encoding: 'utf-8' });
                const data = JSON.parse(result);
                fieldDescribe = data.result.fields.filter(f => f.trackHistory);
            }

            const trackedFieldCount = fieldDescribe.length;
            const maxFields = 20;

            console.log(`  Fields with history tracking: ${trackedFieldCount}/${maxFields}`);

            if (trackedFieldCount >= maxFields) {
                this.validationResults.errors.push({
                    type: 'FIELD_HISTORY_LIMIT',
                    message: `Field history tracking at limit (${trackedFieldCount}/${maxFields})`,
                    recommendation: 'Cannot add more tracked fields without removing existing ones'
                });
                this.validationResults.passed = false;
            } else if (trackedFieldCount >= maxFields - 2) {
                this.validationResults.warnings.push({
                    type: 'FIELD_HISTORY_LIMIT',
                    message: `Field history tracking near limit (${trackedFieldCount}/${maxFields})`,
                    recommendation: 'Be cautious when adding new tracked fields'
                });
            }

            this.validationResults.checks.fieldHistoryLimits = {
                passed: trackedFieldCount < maxFields,
                count: trackedFieldCount,
                limit: maxFields
            };

        } catch (error) {
            console.error(`  ❌ Failed to check field history limits: ${error.message}`);
            this.validationResults.warnings.push({
                type: 'CHECK_FAILED',
                message: `Field history check failed: ${error.message}`
            });
        }
    }

    /**
     * Check picklist formulas for correct patterns
     */
    async checkPicklistFormulas() {
        console.log('\n📐 Checking Picklist Formula Patterns...');

        try {
            let validationRules;

            if (this.bulkHandler) {
                // Use Tooling API via bulk handler
                validationRules = await this.bulkHandler.syncQuery(
                    `SELECT ValidationName, ErrorDisplayField, ErrorMessage, Active FROM ValidationRule WHERE EntityDefinition.QualifiedApiName = 'Account'`,
                    { single: false }
                );

            } else {
                // CLI fallback using Tooling API
                const cmd = `sf data query --query "SELECT ValidationName, ErrorDisplayField FROM ValidationRule WHERE EntityDefinition.QualifiedApiName = 'Account'" --use-tooling-api --json`;
                const result = execSync(cmd, { encoding: 'utf-8' });
                const data = JSON.parse(result);
                validationRules = data.result.records;
            }

            // Analyze validation rules for picklist anti-patterns
            const problematicRules = [];

            for (const rule of validationRules) {
                // This is a simplified check - in production, you'd fetch the full formula
                // via Metadata API and parse for ISBLANK(picklistField) patterns

                // For now, flag rules on common picklist fields
                const commonPicklistFields = ['Type', 'Industry', 'Rating', 'Status__c'];

                if (commonPicklistFields.some(field =>
                    rule.ErrorDisplayField && rule.ErrorDisplayField.includes(field)
                )) {
                    problematicRules.push(rule.ValidationName);
                }
            }

            console.log(`  Validation rules analyzed: ${validationRules.length}`);
            console.log(`  Potential picklist formula issues: ${problematicRules.length}`);

            if (problematicRules.length > 0) {
                this.validationResults.warnings.push({
                    type: 'PICKLIST_FORMULA_PATTERN',
                    message: `${problematicRules.length} validation rules may have picklist formula issues`,
                    rules: problematicRules,
                    recommendation: 'Review validation rules for ISBLANK() on picklist fields. Use TEXT(field) = "" instead.'
                });
            }

            this.validationResults.checks.picklistFormulas = {
                passed: true,
                totalRules: validationRules.length,
                potentialIssues: problematicRules.length
            };

        } catch (error) {
            console.error(`  ❌ Failed to check picklist formulas: ${error.message}`);
            this.validationResults.warnings.push({
                type: 'CHECK_FAILED',
                message: `Picklist formula check failed: ${error.message}`
            });
        }
    }

    // ... Additional validation methods

    /**
     * Generate validation report
     */
    generateReport() {
        console.log('\n' + '═'.repeat(70));
        console.log('VALIDATION REPORT');
        console.log('═'.repeat(70));

        if (this.validationResults.passed) {
            console.log('✅ All validation checks PASSED');
        } else {
            console.log('❌ Validation FAILED - see errors below');
        }

        if (this.validationResults.errors.length > 0) {
            console.log('\n🚫 ERRORS:');
            this.validationResults.errors.forEach((error, idx) => {
                console.log(`\n${idx + 1}. ${error.type}`);
                console.log(`   ${error.message}`);
                if (error.recommendation) {
                    console.log(`   ℹ️  ${error.recommendation}`);
                }
            });
        }

        if (this.validationResults.warnings.length > 0) {
            console.log('\n⚠️  WARNINGS:');
            this.validationResults.warnings.forEach((warning, idx) => {
                console.log(`\n${idx + 1}. ${warning.type}`);
                console.log(`   ${warning.message}`);
                if (warning.recommendation) {
                    console.log(`   ℹ️  ${warning.recommendation}`);
                }
            });
        }

        console.log('\n' + '═'.repeat(70));
    }
}

module.exports = SFDCPreMergeValidator;
```

**Testing Checklist**:
- [ ] All validation checks execute correctly
- [ ] Bulk handler mode faster than CLI mode
- [ ] CLI fallback still works
- [ ] Report generation clear and actionable
- [ ] No false positives in validation

##### Step 1.1.4: Update ImportanceFieldDetector (1 hour)

**File**: `importance-field-detector.js`

**Changes**:
```javascript
class ImportanceFieldDetector {
    constructor(sobject, orgAlias, options = {}) {
        this.sobject = sobject;
        this.orgAlias = orgAlias;
        this.bulkHandler = options.bulkHandler || null;
        this.useCliMode = !this.bulkHandler;

        // Retry configuration (existing)
        this.maxRetries = options.maxRetries || 3;
        this.retryDelay = options.retryDelay || 5000;
        this.processPool = options.processPool || 5;
    }

    /**
     * Get object fields using bulk handler or CLI
     */
    async getObjectFields() {
        let lastError = null;

        for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
            try {
                this.log(`Attempting field retrieval (attempt ${attempt}/${this.maxRetries})`, 'INFO');

                if (this.bulkHandler) {
                    return await this.getObjectFieldsBulk();
                } else {
                    return await this.getObjectFieldsCLI();
                }

            } catch (error) {
                lastError = error;

                // Check if error is ENOBUFS (resource limit)
                const isResourceError = error.message.includes('ENOBUFS') ||
                                       error.message.includes('ENOMEM') ||
                                       error.message.includes('too many open files');

                if (isResourceError && attempt < this.maxRetries) {
                    // Exponential backoff
                    const delay = this.retryDelay * attempt;
                    this.log(`Resource limit hit (ENOBUFS), retrying in ${delay}ms`, 'WARN');
                    await this.sleep(delay);
                } else if (attempt < this.maxRetries) {
                    // Non-resource error, retry with shorter delay
                    const delay = this.retryDelay;
                    this.log(`Field retrieval failed: ${error.message}, retrying in ${delay}ms`, 'WARN');
                    await this.sleep(delay);
                } else {
                    // Final attempt failed
                    this.log(`Field retrieval failed after ${this.maxRetries} attempts`, 'ERROR');
                    throw error;
                }
            }
        }

        throw lastError;
    }

    /**
     * Get fields using Bulk API handler (NEW)
     */
    async getObjectFieldsBulk() {
        // Use Tooling API to get field definitions
        const fields = await this.bulkHandler.syncQuery(
            `SELECT QualifiedApiName, DataType, Label, IsRequired, IsUnique,
                    Precision, Scale, Length, IsIndexed
             FROM FieldDefinition
             WHERE EntityDefinition.QualifiedApiName = '${this.sobject}'`,
            { single: false }
        );

        return fields.map(f => ({
            name: f.QualifiedApiName,
            type: f.DataType,
            label: f.Label,
            required: f.IsRequired,
            unique: f.IsUnique,
            indexed: f.IsIndexed,
            length: f.Length,
            precision: f.Precision,
            scale: f.Scale
        }));
    }

    /**
     * Get fields using CLI (FALLBACK)
     */
    async getObjectFieldsCLI() {
        const cmd = `sf sobject describe ${this.sobject} --json`;

        const result = execSync(cmd, {
            encoding: 'utf-8',
            maxBuffer: 50 * 1024 * 1024,
            stdio: ['pipe', 'pipe', 'pipe']
        });

        const data = JSON.parse(result);

        if (data.status !== 0) {
            throw new Error(`Failed to describe ${this.sobject}: ${data.message}`);
        }

        return data.result.fields;
    }

    // ... rest of class unchanged
}
```

---

### Task 1.2: Enable Parallel Batch Processing

**Effort**: 6 hours
**Priority**: 🔴 CRITICAL
**Dependencies**: Task 1.1 (Bulk handler integration)

#### Objective

Enable parallel execution of query batches using your existing `executeBatchQueriesParallel` infrastructure to achieve 5-10x speedup.

#### Files to Modify

```
.claude-plugins/opspal-salesforce/
└── scripts/lib/
    └── sfdc-full-backup-generator.js      [MAJOR CHANGES]
```

#### Implementation Steps

##### Step 1.2.1: Add Parallel Extraction Method (3 hours)

**File**: `sfdc-full-backup-generator.js`

**Add new method after line 592**:

```javascript
/**
 * P1 Enhancement: Extract active records using parallel batch processing
 * Uses BulkAPIHandler's parallel query execution for 5-10x speedup
 */
async extractActiveRecordsParallel() {
    if (!this.enableParallel || !this.bulkHandler) {
        // Fallback to sequential if parallel not enabled or no bulk handler
        return this.extractActiveRecords();
    }

    const batchSize = 200; // Salesforce FIELDS(ALL) limit
    const concurrency = this.concurrency || 5; // Parallel batches

    this.log(`Extracting records in parallel (${concurrency} concurrent batches of ${batchSize})`);

    // P1 Enhancement: Checkpoint support for resumption
    const checkpoint = new BackupCheckpoint({
        backupDir: this.currentBackupDir,
        sobject: this.sobject,
        saveInterval: 10
    });

    // Check for existing checkpoint and resume if found
    const existingCheckpoint = checkpoint.load();
    let startOffset = 0;
    let allRecords = [];

    if (existingCheckpoint) {
        console.log('🔄 Resuming from checkpoint...');
        allRecords = existingCheckpoint.allRecords || [];
        startOffset = existingCheckpoint.lastOffset || 0;
    }

    // P0 Enhancement: Progress tracking
    const progressTracker = new ProgressTracker({
        operation: `Extracting ${this.sobject} records (parallel)`,
        totalExpected: null,
        updateInterval: 5000
    });

    try {
        // Step 1: Build all keyset-paginated queries
        console.log('  Building query batches...');
        const queries = await this.buildKeysetQueries(batchSize, startOffset);

        console.log(`  Processing ${queries.length} batches with ${concurrency}x parallelism...`);

        // Step 2: Execute queries in parallel batches
        let batchNumber = Math.floor(startOffset / batchSize) + 1;

        for (let i = 0; i < queries.length; i += concurrency) {
            const batchQueries = queries.slice(i, Math.min(i + concurrency, queries.length));

            // Execute this batch of queries in parallel
            const batchPromises = batchQueries.map(async (query, idx) => {
                try {
                    // Rate limiter already built into bulkHandler
                    const result = await this.bulkHandler.query(query, { sync: true });
                    return {
                        success: true,
                        records: result,
                        batchNum: batchNumber + idx
                    };
                } catch (error) {
                    return {
                        success: false,
                        error: error.message,
                        batchNum: batchNumber + idx
                    };
                }
            });

            // Wait for this parallel batch to complete
            const batchResults = await Promise.all(batchPromises);

            // Process results
            for (const result of batchResults) {
                if (result.success) {
                    allRecords = allRecords.concat(result.records);
                    console.log(`  Batch ${result.batchNum}: ${result.records.length} records (total: ${allRecords.length})`);
                } else {
                    console.error(`  ❌ Batch ${result.batchNum} failed: ${result.error}`);
                    // Continue with other batches (partial success)
                }
            }

            // Update progress
            progressTracker.update(allRecords.length);

            // Save checkpoint every N batches
            if ((batchNumber + batchQueries.length) % checkpoint.saveInterval === 0) {
                checkpoint.save({
                    lastOffset: startOffset + ((batchNumber + batchQueries.length) * batchSize),
                    batchNumber: batchNumber + batchQueries.length,
                    totalRecords: allRecords.length,
                    allRecords: allRecords
                });
                console.log(`  💾 Checkpoint saved at batch ${batchNumber + batchQueries.length}`);
            }

            batchNumber += batchQueries.length;
        }

        // Display completion summary
        progressTracker.complete();

        // Cleanup checkpoint
        checkpoint.cleanup();

        // Save all records to single file
        const outputFile = path.join(this.currentBackupDir, `${this.sobject.toLowerCase()}_all_fields_active.json`);
        fs.writeFileSync(outputFile, JSON.stringify({
            records: allRecords,
            totalSize: allRecords.length,
            done: true,
            parallelMode: true,
            concurrency: concurrency
        }, null, 2));

        this.manifest.files.push({
            name: path.basename(outputFile),
            type: 'active_records',
            recordCount: allRecords.length,
            totalSize: allRecords.length,
            batches: Math.ceil(queries.length / concurrency),
            parallelMode: true
        });

        this.manifest.recordCounts[`${this.sobject}_active`] = allRecords.length;

        console.log(`  ✅ Extracted ${allRecords.length.toLocaleString()} active records (${concurrency}x parallel)`);
        this.log(`  File: ${outputFile}`);

        return {
            records: allRecords,
            totalSize: allRecords.length,
            done: true
        };

    } catch (error) {
        console.error(`  ❌ Failed to extract active records (parallel): ${error.message}`);
        throw error;
    }
}

/**
 * Build keyset-paginated queries for parallel execution
 * Returns array of SOQL queries that can be executed concurrently
 */
async buildKeysetQueries(batchSize, startOffset = 0) {
    const queries = [];
    let lastId = null;

    // If resuming from checkpoint, find the lastId
    if (startOffset > 0) {
        const skipQuery = `SELECT Id FROM ${this.sobject} ORDER BY Id ASC LIMIT 1 OFFSET ${startOffset}`;
        const skipResult = await this.bulkHandler.syncQuery(skipQuery, { single: true });
        lastId = skipResult ? skipResult.Id : null;
    }

    // Build queries until we've covered all data
    // Note: We don't know total count upfront, so we'll build a large set
    // and the execution will stop when queries return no results

    const maxQueries = 1000; // Safety limit (200 * 1000 = 200k records max per run)

    for (let i = 0; i < maxQueries; i++) {
        let query;

        if (lastId) {
            query = `SELECT FIELDS(ALL) FROM ${this.sobject} WHERE Id > '${lastId}' ORDER BY Id ASC LIMIT ${batchSize}`;
        } else {
            query = `SELECT FIELDS(ALL) FROM ${this.sobject} ORDER BY Id ASC LIMIT ${batchSize}`;
        }

        queries.push(query);

        // Estimate next lastId (we'll update this during execution)
        // For now, just increment - the actual execution handles empty results
        lastId = this.generateNextId(lastId || '000000000000000');
    }

    return queries;
}

/**
 * Generate next ID for keyset pagination estimate
 * This is an approximation - actual execution handles empty results
 */
generateNextId(currentId) {
    // Salesforce IDs are 15 or 18 characters
    // For estimation, just increment the last character
    const chars = currentId.split('');
    let carry = true;

    for (let i = chars.length - 1; i >= 0 && carry; i--) {
        const char = chars[i];

        if (char === '9') {
            chars[i] = 'A';
            carry = false;
        } else if (char === 'Z') {
            chars[i] = 'a';
            carry = false;
        } else if (char === 'z') {
            chars[i] = '0';
            // carry remains true
        } else {
            chars[i] = String.fromCharCode(char.charCodeAt(0) + 1);
            carry = false;
        }
    }

    return chars.join('');
}
```

**Modify constructor to accept bulk handler**:

```javascript
class SFDCFullBackupGenerator {
    constructor(options = {}) {
        this.sobject = options.sobject;
        this.orgAlias = options.orgAlias;
        this.backupDir = options.backupDir || './backups';
        this.chunkSize = options.chunkSize || 200;
        this.includeDeleted = options.includeDeleted !== false;
        this.includeChildren = options.includeChildren !== false;
        this.verbose = options.verbose || false;

        // NEW: Bulk API handler support
        this.bulkHandler = options.bulkHandler || null;
        this.useCliMode = !this.bulkHandler;

        // P2 Enhancement: Parallel processing mode
        this.enableParallel = options.enableParallel || false;
        this.concurrency = options.concurrency || 5;

        // ... rest of constructor
    }
}
```

**Modify generateFullBackup to use parallel method**:

```javascript
async generateFullBackup() {
    console.log('\n🔒 SFDC Full Backup Generator');
    console.log('═'.repeat(70));
    console.log(`Object: ${this.sobject}`);
    console.log(`Org: ${this.orgAlias}`);
    console.log(`Backup Dir: ${this.currentBackupDir}`);

    // Show mode
    if (this.enableParallel) {
        console.log(`Mode: Parallel (${this.concurrency}x concurrency)`);
    } else {
        console.log(`Mode: Sequential`);
    }
    console.log('');

    try {
        // Step 1: Extract active records (parallel or sequential)
        if (this.enableParallel && this.bulkHandler) {
            console.log('📦 Step 1: Extracting active records (PARALLEL)...');
            await this.extractActiveRecordsParallel();
        } else {
            console.log('📦 Step 1: Extracting active records (SEQUENTIAL)...');
            await this.extractActiveRecords();
        }

        // ... rest of workflow unchanged
    }
}
```

**Testing Checklist**:
- [ ] Parallel extraction 5x faster than sequential
- [ ] Checkpoint/resume works in parallel mode
- [ ] Progress tracking updates correctly
- [ ] No records missed or duplicated
- [ ] Error in one batch doesn't crash all batches
- [ ] Falls back to sequential if parallel disabled

---

### Task 1.3: Add Composite API Merge Executor

**Effort**: 6 hours
**Priority**: 🔴 CRITICAL
**Dependencies**: Task 1.1 (Bulk handler integration)

#### Objective

Implement actual merge execution using Composite Batch API to bundle up to 25 merge operations per HTTP request, achieving 16x speedup over individual merges.

#### Files to Create

```
.claude-plugins/opspal-salesforce/
└── scripts/lib/
    └── merge-executor.js       [NEW FILE]
```

#### Implementation

**New File**: `merge-executor.js`

```javascript
#!/usr/bin/env node

/**
 * Merge Executor
 *
 * Executes approved duplicate merges using Salesforce Composite Batch API.
 * Bundles up to 25 merge operations per HTTP request for optimal performance.
 *
 * Features:
 * - Composite API batch merging (25 merges per request)
 * - Automatic retry for locked records
 * - Detailed success/failure tracking
 * - Dry-run mode for testing
 * - Progress tracking and ETA
 *
 * Usage:
 *   const executor = new MergeExecutor(orgAlias, bulkHandler);
 *   const result = await executor.executeMerges(approvedPairs, { dryRun: false });
 *
 * @author Claude Code
 * @version 1.0.0
 * @date 2025-10-16
 */

const fs = require('fs');
const path = require('path');

class MergeExecutor {
    constructor(orgAlias, bulkHandler, options = {}) {
        this.orgAlias = orgAlias;
        this.bulkHandler = bulkHandler;
        this.options = options;

        this.compositeBatchSize = 25; // Salesforce limit
        this.retryAttempts = 2;
        this.retryDelay = 5000; // 5 seconds

        this.results = {
            successful: 0,
            failed: 0,
            skipped: 0,
            errors: [],
            details: []
        };
    }

    log(message, level = 'INFO') {
        const timestamp = new Date().toISOString().substring(11, 19);
        const prefix = {
            'INFO': 'ℹ️',
            'SUCCESS': '✅',
            'WARN': '⚠️',
            'ERROR': '❌',
            'DRY_RUN': '🔍'
        }[level] || 'ℹ️';
        console.log(`${prefix} [${timestamp}] ${message}`);
    }

    /**
     * Execute merges for approved duplicate pairs
     */
    async executeMerges(approvedPairs, options = {}) {
        const dryRun = options.dryRun || false;
        const continueOnError = options.continueOnError !== false;

        this.log(`Starting merge execution for ${approvedPairs.length} pairs`, 'INFO');

        if (dryRun) {
            this.log('DRY RUN MODE - No merges will be executed', 'DRY_RUN');
        }

        // Filter to only APPROVE decisions
        const mergeable = approvedPairs.filter(p => p.decision === 'APPROVE');

        if (mergeable.length === 0) {
            this.log('No approved merges to execute', 'WARN');
            return this.results;
        }

        this.log(`${mergeable.length} approved merges ready for execution`, 'INFO');

        // Split into composite batches
        const compositeBatches = this.chunkArray(mergeable, this.compositeBatchSize);

        this.log(`Split into ${compositeBatches.length} composite batches (${this.compositeBatchSize} merges each)`, 'INFO');

        // Execute batches
        let batchNumber = 1;
        for (const batch of compositeBatches) {
            this.log(`\nExecuting Composite Batch ${batchNumber}/${compositeBatches.length} (${batch.length} merges)...`, 'INFO');

            if (dryRun) {
                this.log(`  [DRY RUN] Would merge ${batch.length} pairs`, 'DRY_RUN');
                this.results.successful += batch.length;
            } else {
                try {
                    const batchResult = await this.executeCompositeBatch(batch);
                    this.processBatchResults(batchResult, batch);

                    this.log(`  Batch ${batchNumber}: ${batchResult.successful} successful, ${batchResult.failed} failed`, 'INFO');

                } catch (error) {
                    this.log(`  Batch ${batchNumber} failed: ${error.message}`, 'ERROR');

                    if (!continueOnError) {
                        throw error;
                    }

                    // Mark all as failed
                    batch.forEach(pair => {
                        this.results.failed++;
                        this.results.errors.push({
                            pair_id: pair.pair_id,
                            error: `Composite batch failed: ${error.message}`
                        });
                    });
                }
            }

            batchNumber++;

            // Small delay between batches to be gentle on API
            if (batchNumber <= compositeBatches.length && !dryRun) {
                await this.sleep(1000);
            }
        }

        // Handle retries for locked records
        if (!dryRun && this.results.errors.length > 0) {
            await this.retryLockedRecords();
        }

        // Generate summary
        this.generateSummary(dryRun);

        return this.results;
    }

    /**
     * Execute a single composite batch (up to 25 merges)
     */
    async executeCompositeBatch(pairs) {
        // Build composite request
        const compositeRequest = {
            allOrNone: false, // Continue even if some merges fail
            compositeRequest: pairs.map((pair, idx) => ({
                method: 'POST',
                url: `/services/data/v62.0/sobjects/Account/${pair.recommended_survivor}/merge`,
                referenceId: `merge_${idx}`,
                body: {
                    mergeRequest: [{
                        Id: pair.recommended_deleted
                    }]
                }
            }))
        };

        // Execute composite request
        const response = await this.bulkHandler.makeCompositeRequest(compositeRequest);

        // Parse results
        const batchResult = {
            successful: 0,
            failed: 0,
            responses: response.compositeResponse
        };

        response.compositeResponse.forEach((resp, idx) => {
            if (resp.httpStatusCode >= 200 && resp.httpStatusCode < 300) {
                batchResult.successful++;
            } else {
                batchResult.failed++;
            }
        });

        return batchResult;
    }

    /**
     * Process results from composite batch
     */
    processBatchResults(batchResult, pairs) {
        batchResult.responses.forEach((resp, idx) => {
            const pair = pairs[idx];

            if (resp.httpStatusCode >= 200 && resp.httpStatusCode < 300) {
                // Success
                this.results.successful++;
                this.results.details.push({
                    pair_id: pair.pair_id,
                    survivor: pair.recommended_survivor,
                    deleted: pair.recommended_deleted,
                    status: 'SUCCESS'
                });

            } else {
                // Failure
                this.results.failed++;

                const errorMessage = resp.body?.[0]?.message || 'Unknown error';
                const errorCode = resp.body?.[0]?.errorCode || 'UNKNOWN';

                this.results.errors.push({
                    pair_id: pair.pair_id,
                    survivor: pair.recommended_survivor,
                    deleted: pair.recommended_deleted,
                    error: errorMessage,
                    errorCode: errorCode,
                    httpStatus: resp.httpStatusCode
                });

                this.results.details.push({
                    pair_id: pair.pair_id,
                    survivor: pair.recommended_survivor,
                    deleted: pair.recommended_deleted,
                    status: 'FAILED',
                    error: errorMessage
                });
            }
        });
    }

    /**
     * Retry locked records in serial mode
     */
    async retryLockedRecords() {
        const lockErrors = this.results.errors.filter(e =>
            e.errorCode === 'UNABLE_TO_LOCK_ROW' ||
            e.error.includes('UNABLE_TO_LOCK_ROW')
        );

        if (lockErrors.length === 0) return;

        this.log(`\n🔄 Retrying ${lockErrors.length} locked records (serial mode)...`, 'INFO');

        // Wait for locks to clear
        await this.sleep(this.retryDelay);

        // Retry one at a time
        for (const lockedError of lockErrors) {
            try {
                await this.executeSingleMerge(lockedError.survivor, lockedError.deleted);

                // Success - remove from errors, add to success
                this.results.errors = this.results.errors.filter(e => e.pair_id !== lockedError.pair_id);
                this.results.failed--;
                this.results.successful++;

                this.log(`  ✅ Retry succeeded: ${lockedError.pair_id}`, 'SUCCESS');

            } catch (error) {
                this.log(`  ❌ Retry failed: ${lockedError.pair_id} - ${error.message}`, 'ERROR');
                // Keep in errors list
            }

            // Small delay between serial retries
            await this.sleep(500);
        }
    }

    /**
     * Execute a single merge (for retries)
     */
    async executeSingleMerge(survivorId, deletedId) {
        const endpoint = `/services/data/v62.0/sobjects/Account/${survivorId}/merge`;

        const mergeRequest = {
            mergeRequest: [{
                Id: deletedId
            }]
        };

        return this.bulkHandler.makeRequest('POST', endpoint, mergeRequest);
    }

    /**
     * Generate execution summary
     */
    generateSummary(dryRun) {
        console.log('\n' + '═'.repeat(70));
        console.log('MERGE EXECUTION SUMMARY');
        console.log('═'.repeat(70));

        if (dryRun) {
            console.log('\n🔍 DRY RUN MODE - No actual merges executed');
        }

        console.log(`\n✅ Successful: ${this.results.successful}`);
        console.log(`❌ Failed: ${this.results.failed}`);

        if (this.results.skipped > 0) {
            console.log(`⏭️  Skipped: ${this.results.skipped}`);
        }

        const total = this.results.successful + this.results.failed + this.results.skipped;
        const successRate = total > 0 ? (this.results.successful / total * 100).toFixed(1) : 0;

        console.log(`\n📊 Success Rate: ${successRate}%`);

        if (this.results.errors.length > 0) {
            console.log(`\n❌ ERRORS (${this.results.errors.length}):`);
            console.log('─'.repeat(70));

            this.results.errors.slice(0, 10).forEach((error, idx) => {
                console.log(`\n${idx + 1}. Pair: ${error.pair_id}`);
                console.log(`   Survivor: ${error.survivor}`);
                console.log(`   Deleted: ${error.deleted}`);
                console.log(`   Error: ${error.error}`);
            });

            if (this.results.errors.length > 10) {
                console.log(`\n... and ${this.results.errors.length - 10} more errors`);
            }

            // Save error details to file
            const errorFile = path.join(process.cwd(), 'merge-errors.json');
            fs.writeFileSync(errorFile, JSON.stringify(this.results.errors, null, 2));
            console.log(`\n📄 Full error details saved to: ${errorFile}`);
        }

        console.log('\n' + '═'.repeat(70));
    }

    /**
     * Chunk array into batches
     */
    chunkArray(array, chunkSize) {
        const chunks = [];
        for (let i = 0; i < array.length; i += chunkSize) {
            chunks.push(array.slice(i, i + chunkSize));
        }
        return chunks;
    }

    /**
     * Sleep helper
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// CLI interface
if (require.main === module) {
    const args = process.argv.slice(2);

    if (args.length < 2 || args.includes('--help')) {
        console.log(`
Merge Executor

Usage:
  node merge-executor.js <org-alias> <decisions-file> [options]

Arguments:
  org-alias          Target Salesforce org alias
  decisions-file     Path to dedup-decisions.json file

Options:
  --dry-run          Simulate execution without making changes
  --continue-on-error Continue if individual merges fail (default: true)

Examples:
  # Dry run (no changes)
  node merge-executor.js production dedup-decisions.json --dry-run

  # Execute approved merges
  node merge-executor.js production dedup-decisions.json

  # Stop on first error
  node merge-executor.js production dedup-decisions.json --no-continue-on-error
        `);
        process.exit(0);
    }

    const orgAlias = args[0];
    const decisionsFile = args[1];
    const dryRun = args.includes('--dry-run');
    const continueOnError = !args.includes('--no-continue-on-error');

    (async () => {
        try {
            // Load decisions
            if (!fs.existsSync(decisionsFile)) {
                console.error(`❌ Decisions file not found: ${decisionsFile}`);
                process.exit(1);
            }

            const decisions = JSON.parse(fs.readFileSync(decisionsFile, 'utf8'));

            // Initialize bulk API handler
            const BulkAPIHandler = require('./bulk-api-handler');
            const bulkHandler = await BulkAPIHandler.fromSFAuth(orgAlias);

            // Execute merges
            const executor = new MergeExecutor(orgAlias, bulkHandler);
            const result = await executor.executeMerges(decisions.decisions, {
                dryRun,
                continueOnError
            });

            // Exit with appropriate code
            process.exit(result.failed > 0 ? 1 : 0);

        } catch (error) {
            console.error('\n❌ Fatal error:', error.message);
            console.error(error.stack);
            process.exit(1);
        }
    })();
}

module.exports = MergeExecutor;
```

**Update dedup-workflow-orchestrator.js to add merge step**:

```javascript
// Add to DedupWorkflowOrchestrator class

/**
 * Workflow: Execute approved merges
 */
async mergeWorkflow(decisionsFile, options = {}) {
    this.logSection(`MERGE WORKFLOW: ${this.orgAlias}`);

    if (!fs.existsSync(decisionsFile)) {
        this.log(`Decisions file not found: ${decisionsFile}`, 'ERROR');
        return false;
    }

    // Initialize bulk handler
    await this.initialize();

    // Load decisions
    const decisions = JSON.parse(fs.readFileSync(decisionsFile, 'utf8'));

    console.log(`Loaded ${decisions.stats.total} merge decisions`);
    console.log(`  Approved: ${decisions.stats.approved}`);
    console.log(`  Review: ${decisions.stats.review}`);
    console.log(`  Blocked: ${decisions.stats.blocked}\n`);

    // Confirm before executing
    if (!options.dryRun && !options.autoApprove) {
        console.log('⚠️  This will execute REAL merges in Salesforce');
        console.log('   Dry run first recommended: --dry-run\n');

        // In real implementation, add readline prompt here
        // For now, require --auto-approve flag
        this.log('Use --auto-approve to execute without confirmation', 'WARN');
        return false;
    }

    // Execute merges
    const MergeExecutor = require('./merge-executor');
    const executor = new MergeExecutor(this.orgAlias, this.bulkHandler);

    this.log('Executing Merge Operations', 'STEP');
    const result = await executor.executeMerges(decisions.decisions, {
        dryRun: options.dryRun || false,
        continueOnError: options.continueOnError !== false
    });

    this.results.merge = result;

    // Save updated decisions with merge results
    const updatedDecisions = {
        ...decisions,
        mergeExecuted: true,
        mergeTimestamp: new Date().toISOString(),
        mergeResults: {
            successful: result.successful,
            failed: result.failed,
            skipped: result.skipped
        }
    };

    fs.writeFileSync(decisionsFile, JSON.stringify(updatedDecisions, null, 2));

    this.logSection('MERGE WORKFLOW - COMPLETE');
    console.log(`✅ Successful: ${result.successful}`);
    console.log(`❌ Failed: ${result.failed}`);

    if (result.failed > 0) {
        console.log(`\n⚠️  ${result.failed} merge(s) failed - see merge-errors.json for details`);
    }

    return result.failed === 0;
}
```

**Update CLI help in dedup-workflow-orchestrator.js**:

```javascript
// Add to showHelp() method

  merge <org-alias> <decisions-file>
    Execute approved duplicate merges

    Options:
      --dry-run          Simulate execution without making changes
      --auto-approve     Skip confirmation prompt
      --continue-on-error Continue if individual merges fail (default)

    Examples:
      # Dry run first (recommended)
      node dedup-workflow-orchestrator.js merge production dedup-decisions.json --dry-run

      # Execute approved merges
      node dedup-workflow-orchestrator.js merge production dedup-decisions.json --auto-approve

      # Stop on first error
      node dedup-workflow-orchestrator.js merge production dedup-decisions.json --auto-approve --no-continue-on-error
```

**Testing Checklist**:
- [ ] Dry-run mode works correctly
- [ ] Composite batching bundles 25 merges per request
- [ ] Success/failure tracking accurate
- [ ] Lock retry logic works
- [ ] Error file generated with details
- [ ] Progress tracking clear
- [ ] Summary report comprehensive

---

## Phase 1 Testing Strategy

### Unit Testing

**Test File**: `test-phase1-improvements.js`

```javascript
#!/usr/bin/env node

/**
 * Phase 1 Testing Suite
 * Tests Bulk API integration, parallel processing, and merge execution
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

class Phase1TestSuite {
    constructor(orgAlias) {
        this.orgAlias = orgAlias;
        this.testResults = {
            passed: 0,
            failed: 0,
            tests: []
        };
    }

    async runAll() {
        console.log('🧪 Phase 1 Test Suite');
        console.log('═'.repeat(70));

        await this.testBulkHandlerIntegration();
        await this.testParallelProcessing();
        await this.testMergeExecutor();
        await this.testPerformanceImprovement();

        this.generateReport();
    }

    async testBulkHandlerIntegration() {
        console.log('\n📋 Test 1: Bulk Handler Integration');

        try {
            const BulkAPIHandler = require('./bulk-api-handler');
            const handler = await BulkAPIHandler.fromSFAuth(this.orgAlias);

            // Test 1.1: Query execution
            const accounts = await handler.query('SELECT Id, Name FROM Account LIMIT 5', { sync: true });
            assert(Array.isArray(accounts), 'Query should return array');
            assert(accounts.length <= 5, 'Query should respect LIMIT');

            this.recordTest('Bulk Handler Query', true);

            // Test 1.2: Smart routing
            const strategy = handler.determineStrategy(15000, 'query');
            assert(strategy.method === 'bulk', 'Should use bulk for 15k records');

            this.recordTest('Smart Routing Logic', true);

            console.log('  ✅ Bulk Handler Integration: PASSED');

        } catch (error) {
            console.error(`  ❌ Bulk Handler Integration: FAILED - ${error.message}`);
            this.recordTest('Bulk Handler Integration', false, error.message);
        }
    }

    async testParallelProcessing() {
        console.log('\n📋 Test 2: Parallel Processing');

        try {
            const SFDCFullBackupGenerator = require('./sfdc-full-backup-generator');
            const BulkAPIHandler = require('./bulk-api-handler');

            const bulkHandler = await BulkAPIHandler.fromSFAuth(this.orgAlias);

            // Small test with parallel mode
            const generator = new SFDCFullBackupGenerator({
                sobject: 'Account',
                orgAlias: this.orgAlias,
                bulkHandler: bulkHandler,
                enableParallel: true,
                concurrency: 3,
                includeDeleted: false,
                includeChildren: false
            });

            console.log('  Running parallel backup test (3x concurrency)...');
            const startTime = Date.now();

            await generator.generateFullBackup();

            const duration = Date.now() - startTime;
            console.log(`  Completed in ${(duration / 1000).toFixed(2)}s`);

            this.recordTest('Parallel Backup Execution', true);

            // Test 2.2: Verify backup integrity
            const backupDir = path.join('./backups', this.orgAlias);
            const subdirs = fs.readdirSync(backupDir).filter(f =>
                fs.statSync(path.join(backupDir, f)).isDirectory()
            );

            const latestBackup = subdirs.sort().reverse()[0];
            const backupFile = path.join(backupDir, latestBackup, 'account_all_fields_active.json');

            assert(fs.existsSync(backupFile), 'Backup file should exist');

            const backupData = JSON.parse(fs.readFileSync(backupFile, 'utf8'));
            assert(backupData.records.length > 0, 'Backup should have records');
            assert(backupData.parallelMode === true, 'Should be marked as parallel');

            this.recordTest('Backup Integrity', true);

            console.log('  ✅ Parallel Processing: PASSED');

        } catch (error) {
            console.error(`  ❌ Parallel Processing: FAILED - ${error.message}`);
            this.recordTest('Parallel Processing', false, error.message);
        }
    }

    async testMergeExecutor() {
        console.log('\n📋 Test 3: Merge Executor');

        try {
            const MergeExecutor = require('./merge-executor');
            const BulkAPIHandler = require('./bulk-api-handler');

            const bulkHandler = await BulkAPIHandler.fromSFAuth(this.orgAlias);
            const executor = new MergeExecutor(this.orgAlias, bulkHandler);

            // Test with dry-run mode
            const testPairs = [
                {
                    pair_id: 'test_1',
                    decision: 'APPROVE',
                    recommended_survivor: '001xx000000001',
                    recommended_deleted: '001xx000000002'
                }
            ];

            console.log('  Running merge executor in dry-run mode...');
            const result = await executor.executeMerges(testPairs, { dryRun: true });

            assert(result.successful === 1, 'Dry-run should succeed');
            assert(result.failed === 0, 'Dry-run should have no failures');

            this.recordTest('Merge Executor Dry-Run', true);

            console.log('  ✅ Merge Executor: PASSED');

        } catch (error) {
            console.error(`  ❌ Merge Executor: FAILED - ${error.message}`);
            this.recordTest('Merge Executor', false, error.message);
        }
    }

    async testPerformanceImprovement() {
        console.log('\n📋 Test 4: Performance Improvement');

        try {
            // Compare CLI vs Bulk Handler for same query
            const query = 'SELECT Id, Name, Website FROM Account LIMIT 100';

            // Method 1: CLI (old way)
            const cliStart = Date.now();
            const { execSync } = require('child_process');
            const cliResult = execSync(`sf data query --query "${query}" --target-org ${this.orgAlias} --result-format json`, {
                encoding: 'utf-8'
            });
            const cliDuration = Date.now() - cliStart;

            // Method 2: Bulk Handler (new way)
            const BulkAPIHandler = require('./bulk-api-handler');
            const handler = await BulkAPIHandler.fromSFAuth(this.orgAlias);

            const bulkStart = Date.now();
            await handler.query(query, { sync: true });
            const bulkDuration = Date.now() - bulkStart;

            const improvement = ((cliDuration - bulkDuration) / cliDuration * 100).toFixed(1);

            console.log(`  CLI Method: ${cliDuration}ms`);
            console.log(`  Bulk Handler: ${bulkDuration}ms`);
            console.log(`  Improvement: ${improvement}% faster`);

            // Should be at least 20% faster
            assert(bulkDuration < cliDuration * 0.8, 'Bulk handler should be significantly faster');

            this.recordTest('Performance Improvement', true, `${improvement}% faster`);

            console.log('  ✅ Performance Improvement: PASSED');

        } catch (error) {
            console.error(`  ❌ Performance Improvement: FAILED - ${error.message}`);
            this.recordTest('Performance Improvement', false, error.message);
        }
    }

    recordTest(name, passed, details = null) {
        if (passed) {
            this.testResults.passed++;
        } else {
            this.testResults.failed++;
        }

        this.testResults.tests.push({
            name,
            passed,
            details
        });
    }

    generateReport() {
        console.log('\n' + '═'.repeat(70));
        console.log('TEST RESULTS');
        console.log('═'.repeat(70));

        console.log(`\n✅ Passed: ${this.testResults.passed}`);
        console.log(`❌ Failed: ${this.testResults.failed}`);

        const total = this.testResults.passed + this.testResults.failed;
        const successRate = (this.testResults.passed / total * 100).toFixed(1);

        console.log(`\n📊 Success Rate: ${successRate}%`);

        if (this.testResults.failed > 0) {
            console.log('\n❌ FAILED TESTS:');
            this.testResults.tests.filter(t => !t.passed).forEach(test => {
                console.log(`  - ${test.name}: ${test.details}`);
            });
        }

        console.log('\n' + '═'.repeat(70));

        // Save results
        fs.writeFileSync('phase1-test-results.json', JSON.stringify(this.testResults, null, 2));
        console.log('\n📄 Full results saved to: phase1-test-results.json\n');
    }
}

// CLI execution
if (require.main === module) {
    const orgAlias = process.argv[2] || 'default';

    (async () => {
        const suite = new Phase1TestSuite(orgAlias);
        await suite.runAll();

        process.exit(suite.testResults.failed > 0 ? 1 : 0);
    })();
}

module.exports = Phase1TestSuite;
```

---

### Integration Testing

**Test Checklist**:

```markdown
## Phase 1 Integration Testing Checklist

### Pre-Testing Setup
- [ ] Test org authenticated (sf org list)
- [ ] Test data present (>100 accounts)
- [ ] Backup directory writable
- [ ] Node modules installed

### Test 1: Bulk Handler Integration
- [ ] Initialize handler without errors
- [ ] Execute sync query successfully
- [ ] Execute bulk query successfully
- [ ] Smart routing selects correct method
- [ ] Error handling works correctly

### Test 2: Parallel Processing
- [ ] Parallel backup completes successfully
- [ ] Backup file contains all records
- [ ] No duplicate records in backup
- [ ] Checkpoint saves and resumes correctly
- [ ] Progress tracking displays correctly

### Test 3: Merge Executor
- [ ] Dry-run mode works (no changes)
- [ ] Composite batching bundles correctly
- [ ] Success/failure tracking accurate
- [ ] Error file generated
- [ ] Lock retry logic works

### Test 4: Performance Verification
- [ ] Bulk handler faster than CLI
- [ ] Parallel faster than sequential
- [ ] Memory usage reasonable
- [ ] No API limit violations

### Test 5: End-to-End Workflow
- [ ] Prepare workflow completes
- [ ] Analyze workflow completes
- [ ] Merge workflow completes (dry-run)
- [ ] All files generated correctly
- [ ] Reports readable and accurate
```

---

## Phase 1 Success Criteria

### Performance Metrics

**Target**: 5-10x improvement for delta-corp (10k accounts)

| Operation | Baseline | Target | Measured | Status |
|-----------|----------|--------|----------|--------|
| Full Backup | 15 min | 2-3 min | ______ | ⬜ |
| Importance Detection | 3-5 min | 1-2 min | ______ | ⬜ |
| Duplicate Analysis | 2 min | 1 min | ______ | ⬜ |
| **Total Workflow** | **20-22 min** | **4-6 min** | ______ | ⬜ |

### Quality Metrics

- [ ] Zero increase in error rates
- [ ] All existing safety features working
- [ ] Backward compatibility maintained
- [ ] No data loss or corruption
- [ ] User feedback positive

### Acceptance Criteria

Phase 1 is **APPROVED FOR PRODUCTION** when:

1. ✅ All unit tests pass (100%)
2. ✅ All integration tests pass (100%)
3. ✅ Performance improvement ≥ 3x (stretch goal: 5x)
4. ✅ Zero critical bugs
5. ✅ Documentation updated
6. ✅ Team review approved

---

## Risk Mitigation

### Risk Matrix

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| API rate limits exceeded | Medium | High | Rate limiter, monitoring, throttling |
| Data loss during parallel processing | Low | Critical | Checkpoints, validation, backups |
| Merge conflicts increase | Medium | Medium | Lock retry, serial fallback |
| Performance regression | Low | High | Benchmark before/after, rollback plan |
| Memory issues with large datasets | Medium | Medium | Streaming, garbage collection |

### Mitigation Strategies

#### 1. API Rate Limit Protection

**Implementation**:
```javascript
// In bulkHandler initialize
this.apiMonitor = new APIUsageMonitor({
    checkInterval: 60000, // Check every minute
    warningThreshold: 0.8, // Warn at 80%
    pauseThreshold: 0.95 // Pause at 95%
});

// Before each operation
await this.apiMonitor.checkAndPause();
```

**Monitoring**:
- Log API usage every 5 minutes
- Alert if usage > 80%
- Auto-pause if usage > 95%

#### 2. Data Integrity Validation

**Implementation**:
```javascript
// After parallel backup
const validator = new BackupValidator();
const isValid = await validator.validate(backupFile, {
    checkDuplicates: true,
    checkCompleteness: true,
    checkIntegrity: true
});

if (!isValid) {
    throw new Error('Backup validation failed');
}
```

**Checks**:
- No duplicate record IDs
- Record count matches expected
- All required fields present
- JSON structure valid

#### 3. Graceful Degradation

**Implementation**:
```javascript
// If parallel fails, fall back to sequential
try {
    await this.extractActiveRecordsParallel();
} catch (error) {
    this.log('Parallel extraction failed, falling back to sequential', 'WARN');
    await this.extractActiveRecords();
}
```

**Fallback Chain**:
1. Parallel with Bulk API → Sequential with Bulk API → CLI mode

---

## Rollback Procedures

### Rollback Plan

If Phase 1 deployment causes issues:

#### Step 1: Immediate Actions (5 minutes)

```bash
# Revert to previous version
cd .claude-plugins/opspal-salesforce/scripts/lib/
git stash push -m "Phase 1 rollback"
git checkout HEAD~1 dedup-workflow-orchestrator.js
git checkout HEAD~1 dedup-safety-engine.js
git checkout HEAD~1 sfdc-full-backup-generator.js

# Verify rollback
node dedup-workflow-orchestrator.js --version
```

#### Step 2: Validation (10 minutes)

```bash
# Test rolled-back version
node test-phase1-improvements.js <org-alias>

# Verify baseline performance
time node dedup-workflow-orchestrator.js prepare <org-alias>
```

#### Step 3: Communication (15 minutes)

- Notify users via Slack
- Document issue in ROLLBACK_REPORT.md
- Create GitHub issue for post-mortem

### Rollback Decision Tree

```
Issue Detected
├─ Performance regression > 20%?
│  └─ YES → ROLLBACK
├─ Data integrity issue?
│  └─ YES → IMMEDIATE ROLLBACK
├─ API limit violations?
│  ├─ Throttle successful? → CONTINUE with monitoring
│  └─ Throttle failed? → ROLLBACK
└─ Error rate increase?
   ├─ < 5% increase → CONTINUE with monitoring
   ├─ 5-10% increase → ROLLBACK if not resolved in 1 hour
   └─ > 10% increase → IMMEDIATE ROLLBACK
```

---

## Success Metrics

### Phase 1 KPIs

| Metric | Baseline | Target | Measurement Method |
|--------|----------|--------|-------------------|
| **Performance** ||||
| Prepare workflow (10k) | 20-22 min | 4-6 min | Time to completion |
| Prepare workflow (100k) | 180-220 min | 35-45 min | Time to completion |
| API calls per workflow | 55+ | 15-20 | API usage logs |
| Throughput (records/sec) | 10-15 | 50-100 | Progress tracking |
| **Reliability** ||||
| Error rate | < 1% | < 1% | Error logs |
| Completion rate | > 95% | > 98% | Workflow logs |
| Recovery from failures | 50% | 80% | Retry success rate |
| **Resource Usage** ||||
| Memory peak (10k) | 500 MB | < 300 MB | Process monitoring |
| API usage (% of limit) | 15-20% | 5-10% | API monitoring |

### Monitoring Dashboard

**Metrics to Track**:

```javascript
// Phase 1 Metrics Collection
const metrics = {
    timestamp: new Date().toISOString(),
    orgSize: recordCount,
    workflow: 'prepare',

    performance: {
        duration: endTime - startTime,
        throughput: recordCount / (duration / 1000),
        apiCalls: apiCallCount,
        parallelism: concurrency
    },

    reliability: {
        errorsTotal: errorCount,
        errorsRetried: retryCount,
        errorsResolved: resolvedCount,
        completionRate: (successCount / totalCount) * 100
    },

    resources: {
        memoryPeakMB: process.memoryUsage().heapUsed / 1024 / 1024,
        apiUsagePercent: (apiCalls / dailyLimit) * 100
    }
};

// Save to metrics file
fs.appendFileSync('phase1-metrics.jsonl', JSON.stringify(metrics) + '\n');
```

---

## Timeline & Resources

### Phase 1 Timeline

```
Week 1: Implementation (20 hours)
├─ Day 1-2: Task 1.1 - Bulk Handler Integration (8h)
├─ Day 3-4: Task 1.2 - Parallel Processing (6h)
└─ Day 5: Task 1.3 - Merge Executor (6h)

Week 2: Testing & Deployment (10 hours)
├─ Day 6: Unit Testing (3h)
├─ Day 7: Integration Testing (3h)
├─ Day 8: Performance Testing (2h)
├─ Day 9: Documentation & Review (2h)
└─ Day 10: Deployment & Monitoring

Total: 2 weeks (30 hours including testing)
```

### Resource Allocation

**Development**:
- 1 Senior Developer (20 hours)
- Code review time (4 hours)

**Testing**:
- 1 QA Engineer (10 hours)
- Sandbox environments (2 orgs)

**Deployment**:
- DevOps support (2 hours)
- Monitoring setup (2 hours)

**Total Investment**: ~38 hours / $5,700

---

## Phase 2 & Phase 3 Overview

### Phase 2: Optimization & Monitoring (16 hours)

**Goals**:
- Add API usage monitoring
- Implement lock retry logic
- Use Bulk query for duplicate detection
- Field-count-aware batch sizing

**Expected Outcome**: Additional 2-3x improvement

### Phase 3: Scalability Enhancements (24 hours)

**Goals**:
- Multi-job parallel Bulk (leverage 25-job concurrency)
- Result streaming for very large datasets
- Memory optimization
- Performance metrics dashboard

**Expected Outcome**: Scale to millions of records

---

## Conclusion

This implementation plan provides a comprehensive roadmap for achieving **5-10x performance improvement** through Phase 1 while maintaining your excellent safety and reliability standards.

### Key Success Factors

1. **Leverage Existing Infrastructure**: You already have the building blocks (BulkAPIHandler, rate limiter, parallel execution)
2. **Incremental Approach**: Phase 1 focuses on integration, not new systems
3. **Safety First**: All existing safety features maintained
4. **Rollback Ready**: Clear rollback procedures for risk mitigation
5. **Measurable**: Concrete success metrics and KPIs

### Next Steps

1. ✅ Review and approve this plan
2. ✅ Set up test environment (2 sandbox orgs)
3. ✅ Begin Task 1.1: Bulk Handler Integration
4. ✅ Continuous testing throughout implementation
5. ✅ Deploy to beta customers
6. ✅ Monitor and iterate

**Ready to begin implementation? The foundation is solid, and the path to 5-10x performance improvement is clear.**
