# Comprehensive Tool Catalog - OpsPal Internal Plugins

**Generated**: 2025-10-18  
**Scope**: All JavaScript/Shell scripts in `.claude-plugins/*/scripts/lib/`  
**Total Scripts Cataloged**: 287 scripts across 10 official plugins  
**Priority Scripts**: 11 (marked with ★)

---

## Executive Summary

This catalog identifies 287 reusable script components across the OpsPal plugin marketplace, categorized by concern area to identify consolidation opportunities. Key findings include:

- **5 major consolidation opportunities** (20-30% potential code reduction)
- **9 classifier scripts** that could be unified into a single framework
- **3 context managers** that serve similar purposes
- **Multiple merge strategy implementations** across platforms
- **High-value orchestration components** managing complex multi-step workflows

---

## Catalog by Concern Area

### 1. DATA-MERGE (28 scripts, 3 priority)
**Purpose**: Merging records, consolidating data, combining objects

#### Priority Scripts

**★ bulk-merge-executor-parallel.js** (salesforce-plugin)
- Exports: `ParallelBulkMergeExecutor`
- Depends on: `bulk-merge-executor`
- Key Features:
  - Parallel execution with configurable worker pool (default: 5, max: 10)
  - Job queue for distributing work across workers
  - Progress tracking with real-time updates
  - Same safety controls as serial executor
  - **Performance**: 5x faster than serial (49.5s → ~10s per pair)

**★ salesforce-native-merger.js** (salesforce-plugin)
- Exports: `SalesforceNativeMerger`
- Key Features:
  - Native Account merge using ONLY Salesforce CLI + REST API (no external deps)
  - Multiple strategies: auto, favor-master, favor-duplicate, from-decision
  - Explicit field selection (30-50 fields vs 550+) = 40-50% faster queries
  - Complete before/after state capture for rollback
  - Re-parents ALL related records (Contacts, Opportunities, Cases, custom objects)

**★ sfdc-pre-merge-validator.js** (salesforce-plugin)
- Exports: `SFDCPreMergeValidator`
- Key Features:
  - Instance-agnostic validation of merge operations
  - Field History Tracking limits validation (max 20/object - HARD LIMIT)
  - Picklist formula validation (ISBLANK/ISNULL anti-patterns)
  - Object relationship verification
  - Governor limit pre-checks

#### Secondary Scripts
- `bulk-merge-executor.js` - Serial merge executor (parent class)
- `merge-executor.js` - Contact/Account merge coordination
- `merge-feedback-collector.js` - Feedback collection from merge operations
- `merge-learning-engine.js` - Machine learning on merge decisions
- `dedup-rollback-system.js` - Rollback capability for failed merges
- `hubspot-merge-strategy-selector.js` (2 copies - HubSpot & core)
- `merge-audit-logger.js` (2 copies)
- `property-merge-engine.js` (HubSpot)

---

### 2. DATA-MATCH (196 scripts, 3 priority)
**Purpose**: Pattern detection, matching, finding duplicates, identifying relationships

#### Priority Scripts

**★ task-domain-detector.js** (salesforce-plugin & hubspot plugins)
- Purpose: Automatically detects domain (SFDC, HubSpot, CrossPlatform) from task description
- Key Features:
  - Keyword matching and scoring algorithms
  - Returns: domain, required agent pattern, required path
  - Suggests appropriate agents for task routing
- **Location**: Also in hubspot-plugin and hubspot-core-plugin

**★ task-pattern-detector.js** (salesforce-plugin)
- Purpose: Analyzes user task descriptions to detect operation type and complexity
- Key Features:
  - Operation type detection (query, update, delete, merge, deploy, etc.)
  - Complexity score (0.0 - 1.0)
  - Recommended agent selection
  - Confidence level calculation (0.0 - 100)
  - Risk level assessment (low/medium/high)
- **Based on**: Session reflection 2025-10-06 (prevent "spinning cycles")

**★ dedup-safety-engine.js** (salesforce-plugin)
- Exports: `DedupSafetyEngine`
- Purpose: Instance-agnostic duplicate detection with Type 1/2 error prevention
- Key Features:
  - Configurable guardrails for duplicate detection
  - Data-first survivor selection algorithm
  - Type 1 error prevention (false positives blocked)
  - Type 2 error prevention (false negatives blocked)
  - Backup-based validation

#### Secondary Scripts (Important Detectors)
- `conflict-detector.js` - Identifies conflicting configurations
- `fuzzy-account-matcher.js` - Fuzzy matching for Account records
- `fuzzy-matcher.js` - Generic fuzzy matching implementation
- `gap-detector.js` - Identifies data gaps and missing values
- `importance-field-detector.js` - Detects important vs. secondary fields
- `object-size-detector.js` - Determines data volume per object
- `org-quirks-detector.js` - Identifies org customizations
- `portal-quirks-detector.js` - HubSpot portal customizations
- `sfdc-origin-detector.js` - Detects SFDC data in HubSpot

---

### 3. DATA-DEDUPE (21 scripts, 4 priority)
**Purpose**: Deduplication, duplicate prevention, redundancy elimination

#### Priority Scripts

**★ dedup-workflow-orchestrator.js** (salesforce-plugin)
- Exports: `DedupWorkflowOrchestrator`
- Purpose: Unified entry point for all deduplication operations
- Key Features:
  - Orchestrates complete workflow: backup → validation → detection → analysis
  - Operations: prepare, analyze, recover
  - Safety validation at each step
  - Comprehensive logging and error handling

**★ agent-dedup-helper.js** (salesforce-plugin)
- Exports: `AgentDedupHelper`
- Depends on: `dedup-safety-engine`, `bulk-merge-executor`
- Purpose: Helper library for sub-agents to interact with dedup safety engine
- Key Features:
  - Agent authorization checking
  - Simplified analysis and execution APIs
  - Automatic safety recommendations
  - Context-aware decision-making
  - Integration with bulk executor

**★ duplicate-aware-update.js** (salesforce-plugin)
- Exports: `DuplicateAwareUpdate`
- Purpose: Prevents "DUPLICATES_DETECTED" errors by checking BEFORE updates
- Key Features:
  - Automatic duplicate detection pre-flight
  - Automatic merge workflow triggering
  - Batch mode support (JSON file)
  - Auto-merge capability
- **Problem Solved**: Direct email updates no longer fail silently

**★ duplicate-field-analyzer.js** (salesforce-plugin)
- Exports: `DuplicateFieldAnalyzer`
- Purpose: Analyzes duplicate fields across records

---

### 4. ORCHESTRATION (45 scripts, 2 priority)
**Purpose**: Coordinating multi-step processes, workflows, pipelines, batch operations

#### Priority Scripts (High Complexity)

**★ automation-audit-v2-orchestrator.js** (salesforce-plugin)
- Exports: `AutomationAuditV2Orchestrator`
- Dependencies: 7 major components
  - automation-inventory-orchestrator
  - namespace-analyzer
  - validation-rule-auditor
  - business-process-classifier
  - cascade-tracer
  - migration-rationale-engine
  - risk-phaser
- Purpose: Orchestrates comprehensive automation audit workflow
- Key Features:
  - Multi-stage analysis pipeline
  - Risk assessment and phasing
  - Namespace-aware processing
  - Complex interdependency mapping

**★ automation-inventory-orchestrator.js** (salesforce-plugin)
- Exports: `AutomationInventoryOrchestrator`
- Dependencies: 8 major components
  - apex-static-analyzer
  - process-builder-extractor
  - workflow-rule-extractor
  - automation-dependency-graph
  - automation-conflict-engine
  - automation-udm-normalizer
  - automation-risk-scorer
  - flow-streaming-query
- Purpose: Orchestrates automation discovery, analysis, and inventory building
- Key Features:
  - Multi-source extraction (Apex, Flows, Processes, Workflows)
  - Dependency graph construction
  - Conflict detection across automation types
  - Risk scoring and normalization

#### Supporting Orchestration Scripts
- `data-sequence-planner.js` - Plans optimal operation sequencing
- `operation-sequencer.js` - Executes operations in correct order
- `operation-dependency-graph.js` - Maps operation dependencies
- `batch-submit-reflections.js` (2 copies - SFDC & HubSpot)
- `process-builder-extractor.js` - Extracts Process Builder definitions

---

### 5. ROUTING (32 scripts, 0 priority direct)
**Purpose**: Agent/task routing, pattern-based dispatch, classifier-based selection

#### Key Routing Scripts

**auto-agent-router.js** (salesforce-plugin)
- Purpose: Automatic agent routing based on pattern matching + complexity analysis
- Key Features:
  - Automatic blocking of high-risk operations
  - Smart suggestions based on complexity
  - Confidence levels (0.0-1.0) for routing decisions
  - Zero manual overhead

#### Classifier Scripts (Consolidation Opportunity!)

**9 Classifier Scripts** - CONSOLIDATION CANDIDATE
- `business-process-classifier.js`
- `department-classifier.js`
- `enhanced-gov-classifier.js`
- `funnel-classifier.js`
- `person-first-classifier.js`
- `organization-based-classifier.js`
- `salesforce-aware-master-selector.js`
- `web-search-gov-classifier.js`
- `web-verified-gov-classifier.js`

**Recommendation**: Consolidate into single `ClassifierFramework` with pluggable strategies

---

### 6. OTHER (65 scripts)
**Purpose**: Utility scripts and support libraries

#### Query & Validation (14 scripts)
- `safe-query-builder.js` - Build SOQL safely
- `safe-query-executor.js` - Execute queries with real data enforcement
- `smart-query-validator.js` - Validate SOQL patterns
- `flow-validator.js` - Flow definition validation
- `flow-trigger-validator.js` - Flow trigger validation
- `approval-framework-validator.js` - Approval process validation

#### Metadata Management (11 scripts)
- `metadata-retrieval-framework.js` - Framework for metadata retrieval
- `metadata-validator.js` - Validates metadata integrity
- `metadata-dependency-checker.js` - Maps metadata dependencies
- `metadata-org-comparison.js` - Compares metadata across orgs
- `org-metadata-cache.js` - Caches metadata for performance

#### Field & Layout (12 scripts)
- `field-mapper.js` - Maps fields between objects
- `field-mapping-engine.js` - Field mapping logic
- `field-name-resolver.js` - Resolves field names
- `layout-analyzer.js` - Analyzes page layouts
- `layout-metadata-service.js` - Retrieves layout metadata
- `layout-modifier.js` - Modifies layouts

#### Report & Analytics (10 scripts)
- `reports-rest-api.js` - Reports API wrapper
- `report-type-discovery.js` - Discovers report types
- `report-type-creator.js` - Creates custom report types
- `report-template-deployer.js` - Deploys report templates
- `analytics-discovery.js` - Discovers analytics configuration

#### Error Handling & Recovery (8 scripts)
- `error-recovery.js` - Recovery from errors
- `enhanced-error-recovery.js` - Advanced error recovery
- `deployment-interceptor.js` - Intercepts deployments
- `execution-monitor.js` - Monitors execution
- `operation-verifier.js` - Verifies operations completed

---

## Consolidation Opportunities

### 1. Merge Strategy Consolidation (Risk: LOW, Reward: MEDIUM)

**Current State**:
- `salesforce-native-merger.js` - SFDC implementation
- `hubspot-merge-strategy-selector.js` - HubSpot (2 copies)
- `bulk-merge-executor.js` - Abstract executor

**Recommendation**:
```
Create: MergeStrategyFactory
├── AbstractMergeStrategy (interface)
├── SalesforceNativeMergeStrategy
├── HubSpotMergeStrategy
└── Configuration registry for platform-specific logic
```

**Consolidation Potential**: 2-3 shared utility classes


### 2. Pattern Detection Framework (Risk: MEDIUM, Reward: HIGH)

**Current State**: 4 separate pattern detectors
- `task-pattern-detector.js` - Task operation patterns
- `task-domain-detector.js` - Domain patterns
- `conflict-detector.js` - Conflict patterns
- `gap-detector.js` - Data gap patterns

**Recommendation**:
```
Create: PatternDetectionEngine
├── PatternRegistry
├── ScoringEngine
├── ConfidenceCalculator
└── Platform-specific strategy implementations
```

**Consolidation Potential**: 40% code reduction, shared scoring algorithms


### 3. Classifier Framework (Risk: LOW, Reward: VERY HIGH)

**Current State**: 9 similar classifiers
- `business-process-classifier.js`
- `department-classifier.js`
- `enhanced-gov-classifier.js`
- `funnel-classifier.js`
- `person-first-classifier.js`
- `organization-based-classifier.js`
- `salesforce-aware-master-selector.js`
- `web-search-gov-classifier.js`
- `web-verified-gov-classifier.js`

**Recommendation**:
```
Create: ClassifierFramework
├── BaseClassifier (shared logic)
├── ClassificationStrategies (pluggable)
├── ScoringEngine (shared)
├── CacheManager (shared)
└── Built-in strategies for each use case
```

**Consolidation Potential**: 60% code reduction, massive test coverage improvement


### 4. Context Manager Consolidation (Risk: MEDIUM, Reward: MEDIUM)

**Current State**: 4 context managers
- `org-context-manager.js` - SFDC org context
- `org-context-injector.js` - Context injection
- `org-context-validator.js` - Context validation
- `portal-context-manager.js` - HubSpot portal context

**Recommendation**:
```
Create: UnifiedContextManager
├── ContextStore
├── ValidationChain
├── InjectionMiddleware
└── Platform-specific context providers
```

**Consolidation Potential**: 50% code reduction, unified context protocol


### 5. Quirks Detection System (Risk: MEDIUM, Reward: MEDIUM)

**Current State**: 4 overlapping quirks/metadata detectors
- `org-quirks-detector.js` - SFDC org quirks
- `portal-quirks-detector.js` - HubSpot portal quirks
- `org-metadata-cache.js` - Metadata caching
- `instance-agnostic-metadata-analyzer.js` - Metadata analysis

**Recommendation**:
```
Create: UnifiedQuirksDetectionEngine
├── QuirksRegistry
├── DetectorFramework
├── CachingLayer
└── Platform-specific detectors
```

**Consolidation Potential**: 35% code reduction, shared caching


---

## High-Dependency Scripts

These scripts are dependencies for many other components:

| Script | Depends On | Dependents | Risk if Modified |
|--------|-----------|------------|------------------|
| `automation-audit-v2-orchestrator.js` | 7 | Multiple agents | **HIGH** |
| `automation-inventory-orchestrator.js` | 8 | audit-v2 orchestrator | **HIGH** |
| `instance-agnostic-toolkit.js` | 15 | Core orchestration | **CRITICAL** |
| `metadata-retrieval-framework.js` | 3 | Multiple metadata ops | **HIGH** |
| `operation-sequencer.js` | 5 | Bulk operations | **HIGH** |

---

## Plugin Distribution

**Scripts by Plugin**:
- **salesforce-plugin**: 220 scripts (76%)
- **hubspot-plugin**: 31 scripts (11%)
- **hubspot-core-plugin**: 18 scripts (6%)
- **developer-tools-plugin**: 12 scripts (4%)
- **Other plugins**: 6 scripts (2%)

---

## Implementation Priority

### Phase 1 (Immediate - 2 weeks)
1. Classifier Framework consolidation (9 → 1 component)
2. Context Manager unification (4 → 1 component)
3. Shared test suite for consolidation

### Phase 2 (Near-term - 4 weeks)
4. Quirks Detection System consolidation
5. Pattern Detection Framework
6. Merge Strategy consolidation

### Phase 3 (Medium-term - 8 weeks)
7. Query validation framework
8. Metadata management framework
9. Complete test coverage

---

## File Location

**Complete Catalog JSON**: `/home/chris/Desktop/RevPal/Agents/opspal-internal-plugins/TOOL_CATALOG_COMPLETE.json`

---

## Next Steps

1. Review priority scripts in detail
2. Validate consolidation recommendations with team
3. Create RFCs for major consolidations
4. Implement Phase 1 consolidations
5. Monitor metrics (lines of code, test coverage, maintenance burden)

