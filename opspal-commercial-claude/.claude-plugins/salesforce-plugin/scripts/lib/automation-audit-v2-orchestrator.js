/**
 * Automation Audit v2.0 Orchestrator
 *
 * Purpose: Coordinates all v2.0 enhancement libraries to produce comprehensive
 * automation audit reports with namespace detection, business classification,
 * cascade mapping, migration recommendations, and risk-based implementation plans.
 *
 * v2.0 Enhancements:
 * 1. Namespace Detection - Managed packages vs custom code
 * 2. Business Process Classification - Stage and department auto-tagging
 * 3. Validation Rules Audit - Redundancy detection and consolidation
 * 4. Cascade Mapping - Automation chains with performance estimates
 * 5. Migration Rationale - Decision matrix for trigger-to-flow migration
 * 6. Risk-Based Phasing - Implementation phases by risk level
 *
 * v3.27.0 Enhancement (Phase 6 - Deep Metadata Extraction):
 * - Retrieves Apex Body field via Tooling API for trigger/class source code
 * - Extracts JavaDoc descriptions from Apex triggers and classes
 * - Parses entry conditions from Apex trigger code (if statements, RecordType checks)
 * - Populates Purpose/Description and Entry Conditions columns with actual data
 * - Reduces "Not Available" and "Embedded in Code" placeholders in Master Inventory
 *
 * v3.27.1 Enhancement (Phase 6.1 - Description Sanitization):
 * - Filters out code blocks, credentials, and sensitive data from descriptions
 * - Truncates verbose descriptions to 200 characters maximum
 * - Extracts key phrases from long JavaDoc comments
 * - Prevents credential leaks (Authorization headers, API keys, tokens)
 * - Makes Master Automation Inventory CSV-safe and readable
 *
 * v3.28.0 Enhancement (Field Write Map & Collision Detection):
 * - Comprehensive field write tracking across Apex Triggers, Flows, and Workflows
 * - Enhanced Flow metadata extraction (trigger object/type, entry criteria, field operations)
 * - WorkflowFieldUpdate querying via Tooling API with value extraction
 * - Field-level collision detection with severity classification (CRITICAL/HIGH/MEDIUM/LOW)
 * - Three-tier condition overlap analysis (DEFINITE/LIKELY/POSSIBLE)
 * - Context-aware remediation recommendations per collision type
 * - Generates FIELD_WRITE_MAP_COLLISIONS.md with actionable details
 *
 * v3.28.1 Enhancement (CSV Generation Fix):
 * - Fix: Flow trigger Object(s) and Trigger Events now populated from _metadata.triggerInfo fallback
 * - Enhancement: RecordTriggerType normalization (e.g., "CreateAndUpdate" → "Create/Update")
 * - Ensures Master_Automation_Inventory.CSV has complete Flow metadata even when FlowDefinitionView unavailable
 *
 * v3.28.2 Enhancement (Enhanced Apex Insights & Code Coverage):
 * - Multi-fallback description extraction: JavaDoc → Method JavaDoc → Inline Comment → Smart Name
 * - Confidence scoring for descriptions (high/medium/low/very-low)
 * - Entry Points detection: @InvocableMethod, @AuraEnabled, @RestResource, webservice
 * - Async Patterns: @future, Queueable, Batchable, Schedulable
 * - Security Posture: with/without sharing, CRUD/FLS checks, Security.stripInaccessible
 * - Data Operations: SOQL counts (static + dynamic), DML counts by type, callouts, emails, platform events
 * - Governor Risks: SOQL-in-loop and DML-in-loop detection
 * - Code Coverage: Per-class/trigger coverage % from ApexCodeCoverageAggregate via Tooling API
 * - 6 New CSV columns: Entry Points, Async Patterns, Security, Data Ops, Governor Risks, Code Coverage %
 * - Enables Lightning migration analysis, security audits, and governor limit risk assessment
 *
 * v3.30.0 Enhancement (Coverage & Accuracy):
 * - Top 10 Risk Hotspots in Executive Summary (prioritized by risk score)
 * - Approval & Assignment Rules field write extraction
 * - Platform Event automation detection (async chains)
 * - Product roadmap (ROADMAP.md) with 13 pending features
 *
 * v3.31.0 Enhancement (Apex Handler & Trigger Inventory):
 * - Complete inventory of Apex Triggers and Handler classes
 * - Handler-to-trigger associations with detection methods
 * - Static analysis: async work, callouts, bulk safety, hard-coded IDs
 * - Migration impact classification (LOW/MEDIUM/HIGH)
 * - Test coverage extraction per handler class
 * - Generates 3 new outputs: apex-handler-inventory.json, Apex_Handler_Inventory.csv, handler-analysis-summary.md
 *
 * Integration:
 * - Extends v1.0 automation-inventory-orchestrator
 * - Adds 9 enhancement modules (v2.0 + v3.29.0 + v3.30.0 + v3.31.0)
 * - Generates 18+ output files across multiple formats
 *
 * @author Automation Audit System v2.0
 * @version 3.31.0
 * @date 2025-10-29
 */

const fs = require('fs');
const path = require('path');

// Import v1.0 orchestrator
const AutomationInventoryOrchestrator = require('./automation-inventory-orchestrator');

// Import v2.0 enhancement libraries
const NamespaceAnalyzer = require('./namespace-analyzer');
const ValidationRuleAuditor = require('./validation-rule-auditor');
const BusinessProcessClassifier = require('./business-process-classifier');
const CascadeTracer = require('./cascade-tracer');
const MigrationRationaleEngine = require('./migration-rationale-engine');
const RiskPhaser = require('./risk-phaser');

// Import Mermaid diagram converters
const {
  automationCascadeToFlowchart,
  dependencyToERD,
  executionOrderToFlowchart
} = require('./mermaid-converters');

// Import v3.21.0 robustness enhancements
const AuditErrorLogger = require('./audit-error-logger');
const SalesforceApiDetector = require('./salesforce-api-detector');
const MetadataCapabilityChecker = require('./metadata-capability-checker');

// Import v3.25.0 field collision analysis
const FieldCollisionAnalyzer = require('./field-collision-analyzer');
const PrioritizationEngine = require('./prioritization-engine');
const RemediationPlanGenerator = require('./remediation-plan-generator');

// Import v3.26.0 description extraction
const ApexDescriptionExtractor = require('./apex-description-extractor');

// Import v3.27.0 deep metadata extraction (Phase 6)
const ApexBodyRetriever = require('./apex-body-retriever');
const EntryConditionExtractor = require('./entry-condition-extractor');

// Import v3.27.1 description sanitizer (Phase 6.1)
const DescriptionSanitizer = require('./description-sanitizer');

// Import v3.28.0 field write map builder (Phase 3.2)
const FieldWriteMapBuilder = require('./field-write-map-builder');

// Import v3.28.2 enhanced description & signals extractors
const { extractClassDescription, extractTriggerDescription } = require('./apex-description-enhanced');
const {
  extractClassSignals,
  extractTriggerSignals,
  formatEntryPoints,
  formatAsyncPatterns,
  formatSecurity,
  formatDataOps,
  formatRisks
} = require('./apex-signals');
const ApexCodeCoverage = require('./apex-code-coverage');

// Import v3.29.0 Phase 1 enhancements
const ExecutionOrderResolver = require('./execution-order-resolver');
const ProcessBuilderFieldExtractor = require('./process-builder-field-extractor');
const RecursionRiskDetector = require('./recursion-risk-detector');
const ScheduledAutomationDetector = require('./scheduled-automation-detector');
const HardcodedArtifactScanner = require('./hardcoded-artifact-scanner');

// Import v3.30.0 Coverage & Accuracy enhancements
const ApprovalAssignmentExtractor = require('./approval-assignment-extractor');
const PlatformEventAutomationDetector = require('./platform-event-automation-detector');

// Import v3.31.0 Apex Handler & Trigger Inventory
const HandlerInventoryBuilder = require('./handler-inventory-builder');
const HandlerInventoryCSVGenerator = require('./handler-inventory-csv-generator');
const HandlerAnalysisReportGenerator = require('./handler-analysis-report-generator');

class AutomationAuditV2Orchestrator {
  constructor(orgAlias, outputDir, options = {}) {
    this.orgAlias = orgAlias;
    this.outputDir = outputDir;
    this.timestamp = new Date().toISOString().replace(/[:.]/g, '-');

    // Store options
    this.options = {
      excludeManaged: options.excludeManaged || false
    };

    // Results storage
    this.results = {
      v1: null,           // v1.0 base inventory
      namespace: null,    // Namespace analysis
      validation: null,   // Validation rules audit
      classification: null, // Business process classification
      cascades: null,     // Cascade mapping
      migration: null,    // Migration recommendations
      risk: null,         // Risk-based phasing
      fieldCollisions: null, // v3.28.0: Field-level collision detection
      recursionRisks: null,  // v3.29.0: Recursion risk analysis
      scheduledAutomation: null, // v3.29.0: Scheduled automation calendar
      hardcodedArtifacts: null,  // v3.29.0: Hardcoded IDs/URLs
      processBuilderData: null,  // v3.29.0: Process Builder field writes
      approvalAssignmentData: null, // v3.30.0: Approval & Assignment Rules field writes
      platformEventData: null,       // v3.30.0: Platform Event automation chains
      handlerInventory: null         // v3.31.0: Apex Handler & Trigger Inventory
    };

    // NEW: Audit scope tracking
    this.auditScope = {
      analyzed: {},
      skipped: {},
      errors: [],
      queryDetails: {}, // Track which query methods worked (e.g., FlowDefinitionView vs FlowDefinition)
      v2FeaturesUsed: []
    };

    // v3.21.0: Initialize robustness utilities
    this.errorLogger = new AuditErrorLogger();
    this.errorLogger.setGlobalContext({
      orgAlias: this.orgAlias,
      auditVersion: '3.29.0', // v3.29.0: Phase 1 HIGH impact enhancements
      timestamp: this.timestamp
    });
    this.apiDetector = new SalesforceApiDetector();
    this.capabilityChecker = new MetadataCapabilityChecker();

    // v3.26.0: Initialize description extractor
    this.descriptionExtractor = new ApexDescriptionExtractor({ verbose: false });

    // v3.27.0: Initialize deep metadata retrievers (Phase 6)
    this.apexBodyRetriever = new ApexBodyRetriever({ orgAlias: this.orgAlias, verbose: false });
    this.entryConditionExtractor = new EntryConditionExtractor({ verbose: false });

    // v3.27.1: Initialize description sanitizer (Phase 6.1)
    this.descriptionSanitizer = new DescriptionSanitizer({ maxLength: 200, verbose: false });

    // v3.29.0: Initialize Phase 1 enhancement modules
    this.executionOrderResolver = new ExecutionOrderResolver();
    this.processBuilderExtractor = new ProcessBuilderFieldExtractor(this.orgAlias);
    this.recursionDetector = new RecursionRiskDetector();
    this.scheduledDetector = new ScheduledAutomationDetector(this.orgAlias);
    this.artifactScanner = new HardcodedArtifactScanner();
  }

  /**
   * Execute full v2.0 audit
   * @returns {Object} Complete audit results
   */
  async execute() {
    console.log('╔══════════════════════════════════════════════════════════╗');
    console.log('║      Salesforce Automation Audit v2.0                   ║');
    console.log('╚══════════════════════════════════════════════════════════╝\n');
    console.log(`Org: ${this.orgAlias}`);
    console.log(`Output: ${this.outputDir}\n`);

    try {
      // Create output directory
      if (!fs.existsSync(this.outputDir)) {
        fs.mkdirSync(this.outputDir, { recursive: true });
      }

      // Phase 1: Run v1.0 base audit
      await this.runBaseAudit();

      // Phase 1.5: Deep Metadata Extraction (v3.27.0)
      await this.runDeepMetadataExtraction();

      // Phase 1.6: Build Field Write Map and Detect Collisions (v3.28.0)
      await this.buildFieldWriteMapAndDetectCollisions();

      // Phase 1.7: Retrieve Code Coverage (v3.28.2)
      await this.retrieveCodeCoverage();

      // Phase 1.8: Process Builder Field Write Extraction (v3.29.0)
      await this.extractProcessBuilderFieldWrites();

      // Phase 1.9: Recursion Risk Detection (v3.29.0)
      await this.detectRecursionRisks();

      // Phase 1.10: Scheduled Automation Detection (v3.29.0)
      await this.detectScheduledAutomation();

      // Phase 1.11: Hardcoded Artifact Scanning (v3.29.0)
      await this.scanHardcodedArtifacts();

      // Phase 1.12: Approval & Assignment Rules Extraction (v3.30.0)
      await this.extractApprovalAssignmentWrites();

      // Phase 1.13: Platform Event Automation Detection (v3.30.0)
      await this.detectPlatformEventAutomation();

      // Phase 1.14: Apex Handler & Trigger Inventory (v3.31.0)
      await this.buildHandlerInventory();

      // Phase 2: Run namespace analysis
      await this.runNamespaceAnalysis();

      // Phase 3: Run validation rules audit
      await this.runValidationAudit();

      // Phase 4: Run business classification
      await this.runBusinessClassification();

      // Phase 5: Run cascade mapping
      await this.runCascadeMapping();

      // Phase 6: Run migration analysis
      await this.runMigrationAnalysis();

      // Phase 7: Run risk-based phasing
      await this.runRiskAnalysis();

      // Phase 8: Generate enhanced reports
      await this.generateEnhancedReports();

      // Phase 9: Generate visual diagrams
      await this.runDiagramGeneration();

      console.log('\n╔══════════════════════════════════════════════════════════╗');
      console.log('║              Audit Complete!                            ║');
      console.log('╚══════════════════════════════════════════════════════════╝\n');

      // v3.21.0: Export error log
      try {
        const errorReport = this.errorLogger.export();
        const errorLogPath = path.join(this.outputDir, 'audit-errors.json');
        fs.writeFileSync(errorLogPath, errorReport);
        console.log(`📊 v3.21.0 Error Report exported to: audit-errors.json`);

        const errorSummary = this.errorLogger.getSummary();
        if (errorSummary.total > 0) {
          console.log(`   Total Errors: ${errorSummary.total}`);
          console.log(`   Critical: ${errorSummary.bySeverity.critical}, High: ${errorSummary.bySeverity.high}, Medium: ${errorSummary.bySeverity.medium}\n`);
        }
      } catch (exportError) {
        console.error('⚠️  Could not export error log:', exportError.message);
      }

      return this.results;

    } catch (error) {
      console.error('\n❌ Audit failed:', error.message);
      console.error(error.stack);
      throw error;
    }
  }

  /**
   * Phase 1: Run v1.0 base audit
   */
  async runBaseAudit() {
    console.log('════════════════════════════════════════════════════════════');
    console.log('Phase 1: Base Inventory & Conflict Detection (v1.0)');
    console.log('════════════════════════════════════════════════════════════\n');

    try {
      const orchestrator = new AutomationInventoryOrchestrator(this.orgAlias, {
        outputDir: this.outputDir,
        activeOnly: true,
        showProgress: true,
        excludeManaged: this.options.excludeManaged
      });
      const result = await orchestrator.execute();

      // Extract data from v1 orchestrator
      this.results.v1 = {
        triggers: orchestrator.rawData.triggers,
        apexClasses: orchestrator.rawData.classes,
        flows: orchestrator.rawData.flows,
        processes: orchestrator.rawData.processes,
        workflows: orchestrator.rawData.workflows,
        udmData: orchestrator.udmData,
        conflicts: orchestrator.conflicts,
        graph: orchestrator.graph,
        hotspots: orchestrator.hotspots,
        summary: result.summary
      };

      console.log(`✓ Base audit complete`);
      console.log(`  - Triggers: ${this.results.v1.triggers?.length || 0}`);
      console.log(`  - Classes: ${this.results.v1.apexClasses?.length || 0}`);
      console.log(`  - Flows: ${this.results.v1.flows?.length || 0}`);
      console.log(`  - Conflicts: ${this.results.v1.conflicts?.length || 0}\n`);

      // NEW: Track audit scope
      this.auditScope.analyzed['Apex Triggers'] = this.results.v1.triggers?.length || 0;
      this.auditScope.analyzed['Apex Classes'] = this.results.v1.apexClasses?.length || 0;
      this.auditScope.analyzed['Flows'] = this.results.v1.flows?.length || 0;
      this.auditScope.analyzed['Process Builder'] = this.results.v1.processes?.length || 0;
      this.auditScope.analyzed['Workflow Rules'] = this.results.v1.workflows?.length || 0;

      // Track query method used for flows (if available)
      if (orchestrator.errors && orchestrator.errors.length > 0) {
        orchestrator.errors.forEach(err => {
          if (err.type === 'Flow' && err.error) {
            // Flow query failed - track the error
            if (err.error.includes('not supported') || err.error.includes('sObject type')) {
              this.auditScope.errors.push({
                component: 'Flows',
                queryAttempted: 'FlowDefinitionView',
                querySucceeded: null,
                error: 'FlowDefinitionView not supported in this org',
                impact: 'Flow count may be inaccurate - manually verify in Setup → Flows',
                recommendation: 'Upgrade to API v58+ or use FlowDefinition fallback'
              });
              this.auditScope.queryDetails['Flows'] = 'Failed (FlowDefinitionView not supported)';
            } else {
              this.auditScope.errors.push({
                component: 'Flows',
                error: err.error,
                impact: 'Flow count may be inaccurate',
                recommendation: 'Review error details and manually verify flow count'
              });
            }
          }
        });
      }
    } catch (error) {
      console.error('❌ Base audit failed:', error.message);
      this.auditScope.errors.push({ phase: 'Base Audit', error: error.message });
      throw error;
    }
  }

  /**
   * Phase 1.5: Deep Metadata Extraction (v3.27.0)
   * Retrieves Apex Body fields and Flow metadata for enhanced descriptions and entry conditions
   */
  async runDeepMetadataExtraction() {
    console.log('════════════════════════════════════════════════════════════');
    console.log('Phase 1.5: Deep Metadata Extraction (v3.27.0 - Enhanced)');
    console.log('════════════════════════════════════════════════════════════\n');

    try {
      const startTime = Date.now();

      // Extract trigger IDs for body retrieval
      const triggerIds = (this.results.v1?.triggers || [])
        .map(t => t.Id)
        .filter(id => id);

      // Extract class IDs for body retrieval
      const classIds = (this.results.v1?.apexClasses || [])
        .map(c => c.Id)
        .filter(id => id);

      // Extract flow names for metadata retrieval
      const flowNames = (this.results.v1?.flows || [])
        .map(f => f.DeveloperName || f.ApiName)
        .filter(name => name);

      console.log(`📥 Retrieving deep metadata:`);
      console.log(`  - Apex Trigger Bodies: ${triggerIds.length}`);
      console.log(`  - Apex Class Bodies: ${classIds.length}`);
      console.log(`  - Flow Metadata: ${flowNames.length}\n`);

      // Initialize storage for retrieved metadata
      this.results.deepMetadata = {
        triggerBodies: new Map(),
        classBodies: new Map(),
        flowMetadata: new Map(),
        extractionLog: {
          triggerBodiesRetrieved: 0,
          classBodiesRetrieved: 0,
          flowMetadataRetrieved: 0,
          errors: []
        }
      };

      // Retrieve Apex trigger bodies
      if (triggerIds.length > 0) {
        try {
          console.log(`  🔄 Retrieving ${triggerIds.length} Apex trigger bodies...`);
          const bodies = await this.apexBodyRetriever.retrieveTriggerBodies(triggerIds);
          this.results.deepMetadata.triggerBodies = bodies;
          this.results.deepMetadata.extractionLog.triggerBodiesRetrieved = bodies.size;
          console.log(`  ✅ Retrieved ${bodies.size} trigger bodies\n`);
        } catch (error) {
          console.warn(`  ⚠️  Failed to retrieve trigger bodies: ${error.message}`);
          this.results.deepMetadata.extractionLog.errors.push({
            component: 'Apex Triggers',
            error: error.message
          });
        }
      }

      // Retrieve Apex class bodies
      if (classIds.length > 0) {
        try {
          console.log(`  🔄 Retrieving ${classIds.length} Apex class bodies...`);
          const bodies = await this.apexBodyRetriever.retrieveClassBodies(classIds);
          this.results.deepMetadata.classBodies = bodies;
          this.results.deepMetadata.extractionLog.classBodiesRetrieved = bodies.size;
          console.log(`  ✅ Retrieved ${bodies.size} class bodies\n`);
        } catch (error) {
          console.warn(`  ⚠️  Failed to retrieve class bodies: ${error.message}`);
          this.results.deepMetadata.extractionLog.errors.push({
            component: 'Apex Classes',
            error: error.message
          });
        }
      }

      // Note: Flow metadata retrieval already happens in base audit via FlowMetadataRetriever
      // We'll use the existing flow metadata from v1 results

      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`✓ Deep metadata extraction complete (${duration}s)`);
      console.log(`  - Trigger Bodies: ${this.results.deepMetadata.extractionLog.triggerBodiesRetrieved}/${triggerIds.length}`);
      console.log(`  - Class Bodies: ${this.results.deepMetadata.extractionLog.classBodiesRetrieved}/${classIds.length}\n`);

    } catch (error) {
      console.error('❌ Deep metadata extraction failed:', error.message);
      this.auditScope.errors.push({ phase: 'Deep Metadata Extraction', error: error.message });
      // Don't throw - this is an enhancement, not critical
    }
  }

  /**
   * Phase 1.6: Build Field Write Map and Detect Collisions (v3.28.0)
   * Constructs comprehensive map of all field write operations across Apex, Flows, and Workflows
   * Detects field-level collisions where multiple automations write to same field
   */
  async buildFieldWriteMapAndDetectCollisions() {
    console.log('════════════════════════════════════════════════════════════');
    console.log('Phase 1.6: Field Write Map & Collision Detection (v3.28.0)');
    console.log('════════════════════════════════════════════════════════════\n');

    try {
      const startTime = Date.now();
      const mapBuilder = new FieldWriteMapBuilder();

      // Step 1: Add Apex trigger writes
      if (this.results.v1?.triggers && this.results.deepMetadata?.triggerBodies) {
        console.log(`📝 Processing ${this.results.v1.triggers.length} Apex triggers...`);
        let processedTriggers = 0;

        this.results.v1.triggers.forEach(trigger => {
          const body = this.results.deepMetadata.triggerBodies.get(trigger.Id);
          if (body) {
            mapBuilder.addApexTriggerWrites(trigger, body);
            processedTriggers++;
          }
        });

        console.log(`   ✓ Processed ${processedTriggers} trigger bodies\n`);
      }

      // Step 2: Add Flow writes
      if (this.results.v1?.flows) {
        console.log(`📊 Processing ${this.results.v1.flows.length} Flows...`);
        let processedFlows = 0;

        this.results.v1.flows.forEach(flow => {
          // Flows may have metadata attached with fieldOperations
          if (flow._metadata?.fieldOperations) {
            mapBuilder.addFlowWrites(flow, flow._metadata);
            processedFlows++;
          } else if (flow.fieldOperations) {
            // Or fieldOperations at top level
            mapBuilder.addFlowWrites(flow, { fieldOperations: flow.fieldOperations });
            processedFlows++;
          }
        });

        console.log(`   ✓ Processed ${processedFlows} flows with field operations\n`);
      }

      // Step 3: Add Workflow writes
      if (this.results.v1?.workflows) {
        console.log(`📋 Processing ${this.results.v1.workflows.length} Workflow Rules...`);
        let processedWorkflows = 0;

        this.results.v1.workflows.forEach(workflow => {
          // Workflows should have fieldUpdatesDetailed from v3.28.0 enrichment
          if (workflow.fieldUpdatesDetailed && workflow.fieldUpdatesDetailed.length > 0) {
            mapBuilder.addWorkflowWrites(workflow, workflow.fieldUpdatesDetailed);
            processedWorkflows++;
          }
        });

        console.log(`   ✓ Processed ${processedWorkflows} workflows with field updates\n`);
      }

      // Step 3.5: Add Process Builder writes (v3.29.0)
      if (this.results.processBuilderData?.processes) {
        console.log(`🔧 Processing ${this.results.processBuilderData.processes.length} Process Builder processes...`);
        let processedPB = 0;

        this.results.processBuilderData.processes.forEach(process => {
          if (process.fieldWrites && process.fieldWrites.length > 0) {
            mapBuilder.addProcessBuilderWrites(process, process.fieldWrites);
            processedPB++;
          }
        });

        console.log(`   ✓ Processed ${processedPB} Process Builder processes with field writes\n`);
      }

      // Step 4: Detect collisions
      console.log('🔍 Detecting field-level collisions...\n');
      const collisions = mapBuilder.detectCollisions();
      const stats = mapBuilder.getStats();

      // Store results
      this.results.fieldCollisions = {
        collisions: collisions,
        stats: stats,
        writeMap: mapBuilder.getWriteMap()
      };

      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`✓ Field write map complete (${duration}s)`);
      console.log(`  - Total Field Writes: ${stats.totalWrites}`);
      console.log(`  - Unique Fields: ${stats.uniqueFields}`);
      console.log(`  - Field Collisions: ${stats.collisions}`);
      console.log(`  - Fields with Single Writer: ${stats.fieldsWithSingleWriter}\n`);

      // Track audit scope
      this.auditScope.v2FeaturesUsed.push('Field Write Map (v3.28.0)');

    } catch (error) {
      console.error('❌ Field write map building failed:', error.message);
      this.auditScope.errors.push({ phase: 'Field Write Map', error: error.message });
      // Don't throw - this is an enhancement, not critical
      this.results.fieldCollisions = {
        collisions: [],
        stats: { totalWrites: 0, uniqueFields: 0, collisions: 0 }
      };
    }
  }

  /**
   * Phase 1.7: Retrieve Code Coverage (v3.28.2)
   * Retrieves code coverage percentages for all Apex classes and triggers
   * using ApexCodeCoverageAggregate from Tooling API
   */
  async retrieveCodeCoverage() {
    console.log('════════════════════════════════════════════════════════════');
    console.log('Phase 1.7: Code Coverage Snapshot (v3.28.2)');
    console.log('════════════════════════════════════════════════════════════\n');

    try {
      const startTime = Date.now();
      const coverageRetriever = new ApexCodeCoverage(this.orgAlias);

      await coverageRetriever.retrieve();
      const stats = coverageRetriever.getStats();

      // Store results
      this.results.codeCoverage = {
        coverageById: coverageRetriever.coverageById,
        stats: stats
      };

      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`✓ Code coverage retrieval complete (${duration}s)`);
      console.log(`  - Classes/Triggers with Coverage: ${stats.total}`);
      console.log(`  - Average Coverage: ${stats.avgCoverage}%`);
      console.log(`  - ≥75% Coverage: ${stats.covered} (${Math.round(100*stats.covered/stats.total)}%)`);
      console.log(`  - 0% Coverage: ${stats.notCovered} (${Math.round(100*stats.notCovered/stats.total)}%)\n`);

      // Track audit scope
      this.auditScope.v2FeaturesUsed.push('Code Coverage (v3.28.2)');

    } catch (error) {
      console.error('❌ Code coverage retrieval failed:', error.message);
      this.auditScope.errors.push({ phase: 'Code Coverage', error: error.message });
      // Don't throw - this is an enhancement, not critical
      this.results.codeCoverage = {
        coverageById: new Map(),
        stats: { total: 0, covered: 0, notCovered: 0, avgCoverage: 0 }
      };
    }
  }

  /**
   * Phase 1.8: Extract Process Builder Field Writes (v3.29.0)
   * Parses Process Builder processes to extract field write operations
   * and integrates them into the Field Write Map for collision detection
   */
  async extractProcessBuilderFieldWrites() {
    console.log('════════════════════════════════════════════════════════════');
    console.log('Phase 1.8: Process Builder Field Write Extraction (v3.29.0)');
    console.log('════════════════════════════════════════════════════════════\n');

    try {
      const startTime = Date.now();

      // Get Process Builder processes
      console.log('📋 Retrieving Process Builder processes...\n');
      const processes = await this.processBuilderExtractor.getProcessesWithFieldWrites();

      if (processes.length === 0) {
        console.log('✓ No Process Builder processes with field writes found\n');
        this.results.processBuilderData = { processes: [], totalFieldWrites: 0 };
        return;
      }

      let totalFieldWrites = 0;
      processes.forEach(p => {
        totalFieldWrites += p.fieldWrites?.length || 0;
      });

      // Store results
      this.results.processBuilderData = {
        processes,
        totalFieldWrites
      };

      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`✓ Process Builder extraction complete (${duration}s)`);
      console.log(`  - Processes Analyzed: ${processes.length}`);
      console.log(`  - Total Field Writes: ${totalFieldWrites}\n`);

      // Track audit scope
      this.auditScope.v2FeaturesUsed.push('Process Builder Field Writes (v3.29.0)');
      this.auditScope.analyzed['Process Builder'] = processes.length;

    } catch (error) {
      console.error('❌ Process Builder extraction failed:', error.message);
      this.auditScope.errors.push({ phase: 'Process Builder Extraction', error: error.message });
      this.results.processBuilderData = { processes: [], totalFieldWrites: 0 };
    }
  }

  /**
   * Phase 1.9: Recursion Risk Detection (v3.29.0)
   * Detects recursion risks in Apex triggers and Flows that could cause
   * CPU timeout errors or infinite loops
   */
  async detectRecursionRisks() {
    console.log('════════════════════════════════════════════════════════════');
    console.log('Phase 1.9: Recursion Risk Detection (v3.29.0)');
    console.log('════════════════════════════════════════════════════════════\n');

    try {
      const startTime = Date.now();
      const risks = [];

      // Detect Apex recursion risks
      if (this.results.v1.triggers && this.results.v1.triggers.length > 0) {
        console.log('🔍 Analyzing Apex triggers for recursion risks...\n');

        for (const trigger of this.results.v1.triggers) {
          const triggerBody = trigger.Body || '';
          const risk = this.recursionDetector.detectApexRecursion(trigger, triggerBody);

          if (risk && risk.riskLevel !== 'NONE') {
            risks.push({
              type: 'ApexTrigger',
              name: trigger.Name,
              object: trigger.TableEnumOrId,
              ...risk
            });
          }
        }
      }

      // Detect Flow recursion risks
      if (this.results.v1.flows && this.results.v1.flows.length > 0) {
        console.log('🔍 Analyzing Flows for recursion risks...\n');

        for (const flow of this.results.v1.flows) {
          // Get field writes from field collision data if available
          const fieldWrites = [];
          if (this.results.fieldCollisions?.writeMap) {
            for (const [fieldKey, automations] of this.results.fieldCollisions.writeMap) {
              const flowWrites = automations.filter(a =>
                a.sourceType === 'Flow' && a.sourceName === flow.DeveloperName
              );
              flowWrites.forEach(w => {
                const [obj, field] = fieldKey.split('.');
                fieldWrites.push({ object: obj, field, value: w.value });
              });
            }
          }

          const risk = this.recursionDetector.detectFlowRecursion(
            flow,
            flow.Metadata || {},
            fieldWrites
          );

          if (risk && risk.riskLevel !== 'NONE') {
            risks.push({
              type: 'Flow',
              name: flow.DeveloperName,
              object: flow.ProcessType === 'Workflow' ? 'Multiple' : 'Unknown',
              ...risk
            });
          }
        }
      }

      // Categorize risks by level
      const highRisks = risks.filter(r => r.riskLevel === 'HIGH');
      const mediumRisks = risks.filter(r => r.riskLevel === 'MEDIUM');
      const lowRisks = risks.filter(r => r.riskLevel === 'LOW');

      // Store results
      this.results.recursionRisks = {
        risks,
        summary: {
          total: risks.length,
          high: highRisks.length,
          medium: mediumRisks.length,
          low: lowRisks.length
        }
      };

      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`✓ Recursion risk detection complete (${duration}s)`);
      console.log(`  - Total Risks: ${risks.length}`);
      console.log(`  - HIGH Risk: ${highRisks.length}`);
      console.log(`  - MEDIUM Risk: ${mediumRisks.length}`);
      console.log(`  - LOW Risk: ${lowRisks.length}\n`);

      // Track audit scope
      this.auditScope.v2FeaturesUsed.push('Recursion Risk Detection (v3.29.0)');

    } catch (error) {
      console.error('❌ Recursion risk detection failed:', error.message);
      this.auditScope.errors.push({ phase: 'Recursion Risk Detection', error: error.message });
      this.results.recursionRisks = {
        risks: [],
        summary: { total: 0, high: 0, medium: 0, low: 0 }
      };
    }
  }

  /**
   * Phase 1.10: Scheduled Automation Detection (v3.29.0)
   * Detects scheduled Flows and Apex jobs to explain mystery overwrites
   * that happen outside user transaction times
   */
  async detectScheduledAutomation() {
    console.log('════════════════════════════════════════════════════════════');
    console.log('Phase 1.10: Scheduled Automation Detection (v3.29.0)');
    console.log('════════════════════════════════════════════════════════════\n');

    try {
      const startTime = Date.now();

      // Detect scheduled flows
      const flows = await this.scheduledDetector.detectScheduledFlows();

      // Detect scheduled Apex jobs
      const apex = await this.scheduledDetector.detectScheduledApex();

      // Generate calendar
      const calendar = this.scheduledDetector.generateCalendar(flows, apex);

      // Store results
      this.results.scheduledAutomation = {
        flows,
        apex,
        calendar
      };

      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`✓ Scheduled automation detection complete (${duration}s)`);
      console.log(`  - Scheduled Flows: ${flows.length}`);
      console.log(`  - Scheduled Apex Jobs: ${apex.length}`);
      console.log(`  - Total Scheduled: ${calendar.totalScheduled}\n`);

      // Track audit scope
      this.auditScope.v2FeaturesUsed.push('Scheduled Automation Detection (v3.29.0)');
      this.auditScope.analyzed['Scheduled Flows'] = flows.length;
      this.auditScope.analyzed['Scheduled Apex'] = apex.length;

    } catch (error) {
      console.error('❌ Scheduled automation detection failed:', error.message);
      this.auditScope.errors.push({ phase: 'Scheduled Automation Detection', error: error.message });
      this.results.scheduledAutomation = {
        flows: [],
        apex: [],
        calendar: { totalScheduled: 0, entries: [] }
      };
    }
  }

  /**
   * Phase 1.11: Hardcoded Artifact Scanning (v3.29.0)
   * Scans Apex code and Flow formulas for hardcoded Salesforce IDs
   * and instance URLs to identify migration blockers
   */
  async scanHardcodedArtifacts() {
    console.log('════════════════════════════════════════════════════════════');
    console.log('Phase 1.11: Hardcoded Artifact Scanning (v3.29.0)');
    console.log('════════════════════════════════════════════════════════════\n');

    try {
      const startTime = Date.now();
      const apexArtifacts = [];
      const flowArtifacts = [];

      // Scan Apex classes and triggers
      if (this.results.v1.apexClasses) {
        console.log('🔍 Scanning Apex classes for hardcoded artifacts...\n');
        for (const cls of this.results.v1.apexClasses) {
          const artifacts = this.artifactScanner.scanApexCode(cls.Name, cls.Body);
          if (artifacts.hasArtifacts) {
            apexArtifacts.push(artifacts);
          }
        }
      }

      if (this.results.v1.triggers) {
        console.log('🔍 Scanning Apex triggers for hardcoded artifacts...\n');
        for (const trigger of this.results.v1.triggers) {
          const artifacts = this.artifactScanner.scanApexCode(trigger.Name, trigger.Body);
          if (artifacts.hasArtifacts) {
            apexArtifacts.push(artifacts);
          }
        }
      }

      // Scan Flows
      if (this.results.v1.flows) {
        console.log('🔍 Scanning Flows for hardcoded artifacts...\n');
        for (const flow of this.results.v1.flows) {
          const artifacts = this.artifactScanner.scanFlowMetadata(
            flow.DeveloperName,
            flow.Metadata
          );
          if (artifacts.hasArtifacts) {
            flowArtifacts.push(artifacts);
          }
        }
      }

      // Generate summary
      const summary = this.artifactScanner.generateSummary(apexArtifacts, flowArtifacts);

      // Store results
      this.results.hardcodedArtifacts = {
        apexArtifacts,
        flowArtifacts,
        summary
      };

      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`✓ Hardcoded artifact scanning complete (${duration}s)`);
      console.log(`  - Apex Files with Artifacts: ${apexArtifacts.length}`);
      console.log(`  - Flows with Artifacts: ${flowArtifacts.length}`);
      console.log(`  - Total IDs Found: ${summary.totalIds}`);
      console.log(`  - Total URLs Found: ${summary.totalUrls}`);
      console.log(`  - CRITICAL Risk: ${summary.riskBreakdown.CRITICAL}`);
      console.log(`  - HIGH Risk: ${summary.riskBreakdown.HIGH}\n`);

      // Track audit scope
      this.auditScope.v2FeaturesUsed.push('Hardcoded Artifact Scanning (v3.29.0)');

    } catch (error) {
      console.error('❌ Hardcoded artifact scanning failed:', error.message);
      this.auditScope.errors.push({ phase: 'Hardcoded Artifact Scanning', error: error.message });
      this.results.hardcodedArtifacts = {
        apexArtifacts: [],
        flowArtifacts: [],
        summary: { totalScanned: 0, withArtifacts: 0 }
      };
    }
  }

  /**
   * Phase 1.12: Approval & Assignment Rules Field Write Extraction (v3.30.0)
   * Extracts field updates from Approval Processes and Assignment Rules
   */
  async extractApprovalAssignmentWrites() {
    console.log('════════════════════════════════════════════════════════════');
    console.log('Phase 1.12: Approval & Assignment Rules Extraction (v3.30.0)');
    console.log('════════════════════════════════════════════════════════════\n');

    try {
      const startTime = Date.now();

      const extractor = new ApprovalAssignmentExtractor(this.orgAlias, { verbose: false });
      const extractorResults = await extractor.extract();

      // Store results
      this.results.approvalAssignmentData = extractorResults;

      // Merge field writes into Field Write Map
      if (extractorResults.fieldWrites && extractorResults.fieldWrites.length > 0) {
        console.log(`🔗 Merging ${extractorResults.fieldWrites.length} approval/assignment field writes into Field Write Map...\n`);

        if (!this.results.fieldCollisions) {
          this.results.fieldCollisions = { fieldWrites: [], collisions: [], stats: {} };
        }

        // Add approval/assignment writes to field write collection
        extractorResults.fieldWrites.forEach(write => {
          this.results.fieldCollisions.fieldWrites.push(write);
        });
      }

      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`✓ Approval & Assignment extraction complete (${duration}s)`);
      console.log(`  - Approval Processes: ${extractorResults.summary.totalApprovals}`);
      console.log(`  - Assignment Rules: ${extractorResults.summary.totalAssignmentRules}`);
      console.log(`  - Field Writes: ${extractorResults.summary.totalFieldWrites}`);
      console.log(`  - Objects Covered: ${extractorResults.summary.objectsCovered.length}\n`);

      // Track audit scope
      this.auditScope.v2FeaturesUsed.push('Approval & Assignment Rules (v3.30.0)');

    } catch (error) {
      console.error('❌ Approval & Assignment extraction failed:', error.message);
      this.auditScope.errors.push({ phase: 'Approval & Assignment Rules', error: error.message });
      this.results.approvalAssignmentData = {
        approvalProcesses: [],
        assignmentRules: [],
        fieldWrites: [],
        summary: { totalApprovals: 0, totalAssignmentRules: 0, totalFieldWrites: 0 }
      };
    }
  }

  /**
   * Phase 1.13: Platform Event Automation Detection (v3.30.0)
   * Detects automation triggered by Platform Events
   */
  async detectPlatformEventAutomation() {
    console.log('════════════════════════════════════════════════════════════');
    console.log('Phase 1.13: Platform Event Automation Detection (v3.30.0)');
    console.log('════════════════════════════════════════════════════════════\n');

    try {
      const startTime = Date.now();

      const detector = new PlatformEventAutomationDetector(this.orgAlias, { verbose: false });
      const detectorResults = await detector.detect();

      // Store results
      this.results.platformEventData = detectorResults;

      // Merge field writes into Field Write Map
      if (detectorResults.fieldWrites && detectorResults.fieldWrites.length > 0) {
        console.log(`🔗 Merging ${detectorResults.fieldWrites.length} Platform Event field writes into Field Write Map...\n`);

        if (!this.results.fieldCollisions) {
          this.results.fieldCollisions = { fieldWrites: [], collisions: [], stats: {} };
        }

        // Add PE writes to field write collection
        detectorResults.fieldWrites.forEach(write => {
          this.results.fieldCollisions.fieldWrites.push(write);
        });
      }

      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`✓ Platform Event automation detection complete (${duration}s)`);
      console.log(`  - Platform Event Triggers: ${detectorResults.summary.totalPETriggers}`);
      console.log(`  - Platform Event Flows: ${detectorResults.summary.totalPEFlows}`);
      console.log(`  - Field Writes: ${detectorResults.summary.totalFieldWrites}`);
      console.log(`  - Platform Events Used: ${detectorResults.summary.platformEventsUsed.length}\n`);

      // Track audit scope
      this.auditScope.v2FeaturesUsed.push('Platform Event Automation (v3.30.0)');

    } catch (error) {
      console.error('❌ Platform Event automation detection failed:', error.message);
      this.auditScope.errors.push({ phase: 'Platform Event Automation', error: error.message });
      this.results.platformEventData = {
        platformEventTriggers: [],
        platformEventFlows: [],
        fieldWrites: [],
        summary: { totalPETriggers: 0, totalPEFlows: 0, totalFieldWrites: 0 }
      };
    }
  }

  /**
   * Phase 1.14: Apex Handler & Trigger Inventory (v3.31.0)
   * Builds comprehensive handler-trigger inventory with risk analysis
   */
  async buildHandlerInventory() {
    console.log('════════════════════════════════════════════════════════════');
    console.log('Phase 1.14: Apex Handler & Trigger Inventory (v3.31.0)');
    console.log('════════════════════════════════════════════════════════════\n');

    try {
      const startTime = Date.now();

      // Build inventory
      const builder = new HandlerInventoryBuilder(this.orgAlias, {
        verbose: false,
        excludeManaged: this.options.excludeManaged
      });
      const inventory = await builder.buildInventory();

      // Save JSON
      await builder.saveInventory(inventory, this.outputDir);

      // Generate CSV
      const csvGenerator = new HandlerInventoryCSVGenerator({ verbose: false });
      const csvPaths = await csvGenerator.generateCSV(inventory, this.outputDir);

      // Generate analysis report
      const reportGenerator = new HandlerAnalysisReportGenerator({ verbose: false });
      const reportPath = await reportGenerator.generateReport(inventory, this.outputDir);

      // Store results
      this.results.handlerInventory = {
        inventory: inventory,
        csvPaths: csvPaths,
        reportPath: reportPath,
        summary: {
          totalTriggers: inventory.length,
          totalHandlers: new Set(inventory.flatMap(e => e.handlerClasses.map(h => h.className)).filter(c => c)).size,
          highRiskHandlers: inventory.flatMap(e => e.handlerClasses).filter(h => h.migrationImpact === 'HIGH').length,
          mediumRiskHandlers: inventory.flatMap(e => e.handlerClasses).filter(h => h.migrationImpact === 'MEDIUM').length,
          lowRiskHandlers: inventory.flatMap(e => e.handlerClasses).filter(h => h.migrationImpact === 'LOW').length
        }
      };

      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`✓ Handler inventory build complete (${duration}s)`);
      console.log(`  - Triggers Analyzed: ${this.results.handlerInventory.summary.totalTriggers}`);
      console.log(`  - Handler Classes: ${this.results.handlerInventory.summary.totalHandlers}`);
      console.log(`  - HIGH Risk: ${this.results.handlerInventory.summary.highRiskHandlers}`);
      console.log(`  - MEDIUM Risk: ${this.results.handlerInventory.summary.mediumRiskHandlers}`);
      console.log(`  - LOW Risk: ${this.results.handlerInventory.summary.lowRiskHandlers}\n`);

      // Track audit scope
      this.auditScope.v2FeaturesUsed.push('Apex Handler & Trigger Inventory (v3.31.0)');

    } catch (error) {
      console.error('❌ Handler inventory build failed:', error.message);
      this.auditScope.errors.push({ phase: 'Handler Inventory', error: error.message });
      this.results.handlerInventory = {
        inventory: [],
        summary: {
          totalTriggers: 0,
          totalHandlers: 0,
          highRiskHandlers: 0,
          mediumRiskHandlers: 0,
          lowRiskHandlers: 0
        }
      };
    }
  }

  /**
   * Phase 2: Namespace analysis
   */
  async runNamespaceAnalysis() {
    console.log('════════════════════════════════════════════════════════════');
    console.log('Phase 2: Namespace Analysis (Managed Packages Detection)');
    console.log('════════════════════════════════════════════════════════════\n');

    try {
      const analyzer = new NamespaceAnalyzer(this.orgAlias);
      this.results.namespace = await analyzer.analyze();

      console.log(`✓ Namespace analysis complete`);
      console.log(`  - Managed Packages: ${this.results.namespace.summary.managedPackages}`);
      console.log(`  - Custom Code: ${this.results.namespace.summary.customCode}`);
      console.log(`  - Modifiable: ${this.results.namespace.summary.modifiablePercentage}%\n`);

      // Export namespace data
      analyzer.exportToCSV(this.outputDir);
      const summaryReport = analyzer.generateSummaryReport();
      fs.writeFileSync(
        path.join(this.outputDir, 'namespace-analysis-summary.md'),
        summaryReport
      );
    } catch (error) {
      console.error('❌ Namespace analysis failed:', error.message);
      this.results.namespace = { summary: {} };
    }
  }

  /**
   * Phase 3: Validation rules audit
   */
  async runValidationAudit() {
    console.log('════════════════════════════════════════════════════════════');
    console.log('Phase 3: Validation Rules Audit');
    console.log('════════════════════════════════════════════════════════════\n');

    try {
      const auditor = new ValidationRuleAuditor(this.orgAlias, {
        capabilityChecker: this.capabilityChecker,
        errorLogger: this.errorLogger
      });
      this.results.validation = await auditor.audit();

      console.log(`✓ Validation audit complete`);
      console.log(`  - Total Rules: ${this.results.validation.summary.totalRules}`);
      console.log(`  - Redundancy Patterns: ${this.results.validation.summary.redundancyPatterns}`);
      console.log(`  - Obsolete Rules: ${this.results.validation.summary.obsoleteRules}\n`);

      // NEW: Track audit scope
      this.auditScope.analyzed['Validation Rules'] = this.results.validation.summary.totalRules;
      this.auditScope.v2FeaturesUsed.push('Validation Rules Audit');

      // Export validation data
      auditor.exportToCSV(this.outputDir);
      const report = auditor.generateSummaryReport();
      fs.writeFileSync(
        path.join(this.outputDir, 'validation-rules-audit.md'),
        report
      );
    } catch (error) {
      console.error('❌ Validation audit failed:', error.message);
      this.results.validation = { summary: { totalRules: 0 } };

      // Extract ErrorId if present (for Salesforce API errors)
      const errorIdMatch = error.message.match(/ErrorId:\s*(\d+-\d+)/);
      const errorId = errorIdMatch ? errorIdMatch[1] : null;

      // Enhanced error tracking
      const errorDetails = {
        component: 'Validation Rules',
        queryAttempted: 'ValidationRule with EntityDefinition join',
        error: error.message,
        impact: 'Validation rule count may be inaccurate (reported 0)',
        recommendation: 'Manually verify validation rules in Setup → Validation Rules'
      };

      if (errorId) {
        errorDetails.errorId = errorId;
        errorDetails.recommendation += ` or contact Salesforce Support with ErrorId: ${errorId}`;
      }

      // Check if it's an EntityDefinition join error
      if (error.message.includes('UNKNOWN_EXCEPTION') || error.message.includes('EntityDefinition')) {
        errorDetails.knownIssue = 'EntityDefinition.QualifiedApiName relationship not supported in some orgs';
        errorDetails.resolution = 'Fixed in v3.20.0 - uses EntityDefinitionId with separate lookup';
      }

      this.auditScope.errors.push(errorDetails);
      this.auditScope.skipped['Validation Rules'] = 'Query failed - see error details';
    }
  }

  /**
   * Phase 4: Business process classification
   */
  async runBusinessClassification() {
    console.log('════════════════════════════════════════════════════════════');
    console.log('Phase 4: Business Process Classification');
    console.log('════════════════════════════════════════════════════════════\n');

    try {
      const classifier = new BusinessProcessClassifier(this.orgAlias);

      // Load components from v1 results
      const components = this.results.v1
        ? this.convertV1ToComponents(this.results.v1)
        : await classifier.loadComponents();

      // Call the correct API: classifyAll(components)
      const classified = classifier.classifyAll(components);

      // Generate summary from classified results
      this.results.classification = {
        classifiedComponents: classified,
        summary: {
          stages: this.groupByStage(classified),
          departments: this.groupByDepartment(classified)
        }
      };

      console.log(`✓ Classification complete`);
      console.log(`  - Top of Funnel: ${this.results.classification.summary.stages['Top of Funnel'] || 0}`);
      console.log(`  - Sales Cycle: ${this.results.classification.summary.stages['Sales Cycle'] || 0}`);
      console.log(`  - Post-Close: ${this.results.classification.summary.stages['Post-Close'] || 0}\n`);

      // Export classification data
      classifier.exportToCSV(classified, this.outputDir);
      const report = classifier.generateSummaryReport(classified);
      fs.writeFileSync(
        path.join(this.outputDir, 'business-process-classification.md'),
        report
      );
    } catch (error) {
      console.error('❌ Classification failed:', error.message);
      this.results.classification = { summary: { stages: {}, departments: {} } };
    }
  }

  /**
   * Phase 5: Cascade mapping
   */
  async runCascadeMapping() {
    console.log('════════════════════════════════════════════════════════════');
    console.log('Phase 5: Cascade Mapping (Automation Chains)');
    console.log('════════════════════════════════════════════════════════════\n');

    try {
      // Get dependency graph from v1 results
      const dependencyGraph = this.results.v1?.graph || null;

      if (!dependencyGraph || !dependencyGraph.nodes || !dependencyGraph.edges) {
        console.warn('⚠ No dependency graph available from v1 audit - skipping cascade mapping');
        this.results.cascades = {
          cascades: [],
          circularDependencies: [],
          representativeExamples: [],
          statistics: {
            totalCascades: 0,
            avgChainLength: 0,
            maxChainLength: 0,
            circularDependencies: 0,
            highRiskCascades: 0,
            mediumRiskCascades: 0,
            lowRiskCascades: 0
          }
        };
        return;
      }

      // Create tracer with dependency graph (convert Map to Array structure)
      const tracer = new CascadeTracer(dependencyGraph.toJSON());
      this.results.cascades = tracer.trace();

      console.log(`✓ Cascade mapping complete`);
      console.log(`  - Total Cascades: ${this.results.cascades.totalCascades || 0}`);
      console.log(`  - Circular Dependencies: ${this.results.cascades.statistics?.circularDependencies || 0}`);
      console.log(`  - Representative Examples: ${this.results.cascades.representativeExamples?.length || 0}\n`);

      // Export cascade data
      const cascadeJSON = JSON.stringify(this.results.cascades, null, 2);
      fs.writeFileSync(
        path.join(this.outputDir, 'cascade-map.json'),
        cascadeJSON
      );
      const report = tracer.generateSummaryReport(this.results.cascades);
      fs.writeFileSync(
        path.join(this.outputDir, 'cascade-mapping-report.md'),
        report
      );
    } catch (error) {
      console.error('❌ Cascade mapping failed:', error.message);
      console.error(error.stack);
      this.results.cascades = {
        cascades: [],
        circularDependencies: [],
        representativeExamples: [],
        statistics: {
          totalCascades: 0,
          avgChainLength: 0,
          maxChainLength: 0,
          circularDependencies: 0,
          highRiskCascades: 0,
          mediumRiskCascades: 0,
          lowRiskCascades: 0
        }
      };
    }
  }

  /**
   * Phase 6: Migration analysis
   */
  async runMigrationAnalysis() {
    console.log('════════════════════════════════════════════════════════════');
    console.log('Phase 6: Migration Rationale Analysis');
    console.log('════════════════════════════════════════════════════════════\n');

    try {
      const engine = new MigrationRationaleEngine(
        this.orgAlias,
        this.results.cascades,
        this.results.namespace
      );

      this.results.migration = await engine.analyze();

      console.log(`✓ Migration analysis complete`);
      console.log(`  - Migrate to Flow: ${this.results.migration.summary.recommendations.MIGRATE_TO_FLOW}`);
      console.log(`  - Keep as Apex: ${this.results.migration.summary.recommendations.KEEP_AS_APEX}`);
      console.log(`  - Hybrid Approach: ${this.results.migration.summary.recommendations.HYBRID}\n`);

      // Export migration data
      engine.exportToCSV(this.outputDir);
      const report = engine.generateReport();
      fs.writeFileSync(
        path.join(this.outputDir, 'migration-recommendations.md'),
        report
      );
    } catch (error) {
      console.error('❌ Migration analysis failed:', error.message);
      this.results.migration = { summary: { recommendations: {} } };
    }
  }

  /**
   * Phase 7: Risk-based phasing
   */
  async runRiskAnalysis() {
    console.log('════════════════════════════════════════════════════════════');
    console.log('Phase 7: Risk-Based Implementation Phasing');
    console.log('════════════════════════════════════════════════════════════\n');

    try {
      const phaser = new RiskPhaser(
        this.orgAlias,
        this.results.v1,
        this.results.cascades,
        this.results.namespace
      );

      this.results.risk = await phaser.analyze();

      console.log(`✓ Risk analysis complete`);
      console.log(`  - Low Risk: ${this.results.risk.summary.riskDistribution.LOW} (${this.results.risk.summary.riskPercentages.LOW}%)`);
      console.log(`  - Medium Risk: ${this.results.risk.summary.riskDistribution.MEDIUM} (${this.results.risk.summary.riskPercentages.MEDIUM}%)`);
      console.log(`  - High Risk: ${this.results.risk.summary.riskDistribution.HIGH} (${this.results.risk.summary.riskPercentages.HIGH}%)\n`);

      // Export risk data
      phaser.exportToCSV(this.outputDir);
      const report = phaser.generateReport();
      fs.writeFileSync(
        path.join(this.outputDir, 'risk-based-implementation-plan.md'),
        report
      );
    } catch (error) {
      console.error('❌ Risk analysis failed:', error.message);
      this.results.risk = { summary: { riskDistribution: {} } };
    }
  }

  /**
   * Phase 9: Generate visual diagrams (Mermaid integration)
   */
  async runDiagramGeneration() {
    console.log('════════════════════════════════════════════════════════════');
    console.log('Phase 9: Generate Visual Diagrams (Mermaid)');
    console.log('════════════════════════════════════════════════════════════\n');

    // Skip if SKIP_DIAGRAMS environment variable is set
    if (process.env.SKIP_DIAGRAMS === '1') {
      console.log('⏭️  Diagram generation skipped (SKIP_DIAGRAMS=1)\n');
      return;
    }

    try {
      const diagramsGenerated = [];

      // Diagram 1: Automation Cascade Flowchart
      if (this.results.cascades && this.results.cascades.cascades && this.results.cascades.cascades.length > 0) {
        console.log('📊 Generating automation cascade flowchart...');
        const cascadeData = automationCascadeToFlowchart(
          this.results.cascades.cascades,
          this.results.v1?.conflicts || []
        );

        // Write Mermaid source file
        const cascadeMmd = this.generateMermaidFlowchart(cascadeData, {
          title: `${this.orgAlias} Automation Cascade`,
          theme: 'default'
        });
        const cascadeMmdPath = path.join(this.outputDir, 'automation-cascade-flowchart.mmd');
        fs.writeFileSync(cascadeMmdPath, cascadeMmd);

        // Write GitHub-renderable markdown file
        const cascadeMd = `# Automation Cascade - ${this.orgAlias}\n\n\`\`\`mermaid\n${cascadeMmd}\n\`\`\`\n`;
        const cascadeMdPath = path.join(this.outputDir, 'automation-cascade-flowchart.md');
        fs.writeFileSync(cascadeMdPath, cascadeMd);

        diagramsGenerated.push('automation-cascade-flowchart');
        console.log(`   ✓ Generated: automation-cascade-flowchart.mmd`);
        console.log(`   ✓ Generated: automation-cascade-flowchart.md\n`);
      }

      // Diagram 2: Dependency Graph ERD
      if (this.results.v1?.graph && this.results.v1.graph.nodes && this.results.v1.graph.nodes.size >= 5) {
        console.log('📊 Generating dependency graph ERD...');
        const dependencyData = dependencyToERD(this.results.v1.graph.toJSON());

        const dependencyMmd = this.generateMermaidERD(dependencyData, {
          title: `${this.orgAlias} Object Dependencies`,
          theme: 'default'
        });
        const dependencyMmdPath = path.join(this.outputDir, 'dependency-graph-erd.mmd');
        fs.writeFileSync(dependencyMmdPath, dependencyMmd);

        const dependencyMd = `# Object Dependency Graph - ${this.orgAlias}\n\n\`\`\`mermaid\n${dependencyMmd}\n\`\`\`\n`;
        const dependencyMdPath = path.join(this.outputDir, 'dependency-graph-erd.md');
        fs.writeFileSync(dependencyMdPath, dependencyMd);

        diagramsGenerated.push('dependency-graph-erd');
        console.log(`   ✓ Generated: dependency-graph-erd.mmd`);
        console.log(`   ✓ Generated: dependency-graph-erd.md\n`);
      }

      // Conflict overlay diagram removed in v3.25.1 - replaced by FIELD_COLLISION_ANALYSIS.md
      // which provides actionable details (trigger names, fields, execution context)

      if (diagramsGenerated.length > 0) {
        console.log(`✅ Generated ${diagramsGenerated.length} diagram(s): ${diagramsGenerated.join(', ')}\n`);
      } else {
        console.log('⚠️  No diagrams generated (insufficient data or conflicts)\n');
      }

    } catch (error) {
      console.warn('⚠️  Diagram generation failed:', error.message);
      console.warn('   Continuing without diagrams...\n');
      // Non-fatal error - audit continues
    }
  }

  /**
   * Generate Mermaid flowchart syntax from diagram data
   */
  generateMermaidFlowchart(data, options = {}) {
    const { title = '', theme = 'default', direction = 'TB' } = options;
    let mermaid = `%%{init: {'theme':'${theme}'}}%%\n`;
    mermaid += `flowchart ${direction}\n`;

    if (title) {
      mermaid += `    %% ${title}\n\n`;
    }

    // Add subgraphs
    if (data.subgraphs && data.subgraphs.length > 0) {
      data.subgraphs.forEach(subgraph => {
        mermaid += `    subgraph ${subgraph.id}["${subgraph.title}"]\n`;
        if (subgraph.nodes) {
          subgraph.nodes.forEach(node => {
            const nodeLabel = node.label.replace(/"/g, '\\"');
            mermaid += `        ${node.id}["${nodeLabel}"]\n`;
            if (node.style) {
              mermaid += `        style ${node.id} ${node.style}\n`;
            }
          });
        }
        mermaid += `    end\n\n`;
      });
    }

    // Add standalone nodes
    if (data.nodes && data.nodes.length > 0) {
      data.nodes.forEach(node => {
        const nodeLabel = node.label.replace(/"/g, '\\"');
        const shape = node.shape || '[]';
        const [open, close] = shape === '()' ? ['(', ')'] :
                              shape === '{}' ? ['{', '}'] :
                              shape === '(())' ? ['((', '))'] : ['[', ']'];
        mermaid += `    ${node.id}${open}"${nodeLabel}"${close}\n`;
      });
      mermaid += `\n`;
    }

    // Add edges
    if (data.edges && data.edges.length > 0) {
      data.edges.forEach(edge => {
        const arrow = edge.arrow || '-->';
        const label = edge.label ? `|"${edge.label}"|` : '';
        mermaid += `    ${edge.from} ${arrow}${label} ${edge.to}\n`;
      });
      mermaid += `\n`;
    }

    // Add styling
    if (data.styles && data.styles.length > 0) {
      data.styles.forEach(style => {
        mermaid += `    style ${style.nodeId} ${style.css}\n`;
      });
    }

    // Add annotations as comments
    if (data.annotations && data.annotations.length > 0) {
      mermaid += `\n    %% Annotations:\n`;
      data.annotations.forEach(annotation => {
        mermaid += `    %% - ${annotation}\n`;
      });
    }

    return mermaid;
  }

  /**
   * Generate Mermaid ERD syntax from diagram data
   */
  generateMermaidERD(data, options = {}) {
    const { title = '', theme = 'default' } = options;
    let mermaid = `%%{init: {'theme':'${theme}'}}%%\n`;
    mermaid += `erDiagram\n`;

    if (title) {
      mermaid += `    %% ${title}\n\n`;
    }

    // Add entities
    if (data.entities && data.entities.length > 0) {
      data.entities.forEach(entity => {
        mermaid += `    ${entity.name} {\n`;
        if (entity.attributes) {
          entity.attributes.forEach(attr => {
            const annotation = attr.annotation ? ` "${attr.annotation}"` : '';
            mermaid += `        ${attr.type} ${attr.name}${annotation}\n`;
          });
        }
        mermaid += `    }\n\n`;
      });
    }

    // Add relationships
    if (data.relationships && data.relationships.length > 0) {
      data.relationships.forEach(rel => {
        mermaid += `    ${rel.from} ${rel.cardinality} ${rel.to} : "${rel.label}"\n`;
      });
      mermaid += `\n`;
    }

    // Add annotations as comments
    if (data.annotations && data.annotations.length > 0) {
      mermaid += `    %% Annotations:\n`;
      data.annotations.forEach(annotation => {
        mermaid += `    %% - ${annotation}\n`;
      });
    }

    return mermaid;
  }

  /**
   * Phase 8: Generate enhanced reports
   */
  async generateEnhancedReports() {
    console.log('════════════════════════════════════════════════════════════');
    console.log('Phase 8: Generating Enhanced v2.0 Reports');
    console.log('════════════════════════════════════════════════════════════\n');

    try {
      // Generate executive summary
      const executiveSummary = this.generateExecutiveSummary();
      fs.writeFileSync(
        path.join(this.outputDir, 'EXECUTIVE_SUMMARY_V2.md'),
        executiveSummary
      );
      console.log(`✓ Executive summary generated`);

      // Generate enhanced inventory CSV
      const enhancedInventory = this.generateEnhancedInventory();
      fs.writeFileSync(
        path.join(this.outputDir, 'enhanced-inventory.csv'),
        enhancedInventory
      );
      console.log(`✓ Enhanced inventory CSV generated`);

      // Generate Master Automation Inventory CSV
      const masterInventory = this.generateMasterInventory();
      fs.writeFileSync(
        path.join(this.outputDir, 'Master_Automation_Inventory.csv'),
        masterInventory
      );
      console.log(`✓ Master Automation Inventory CSV generated`);

      // Generate Master Inventory Summary
      const masterSummary = this.generateMasterSummary();
      fs.writeFileSync(
        path.join(this.outputDir, 'Master_Inventory_Summary.md'),
        masterSummary
      );
      console.log(`✓ Master Inventory Summary generated`);

      // Generate Filtered Managed Packages CSV
      const filteredPackagesCSV = this.generateFilteredManagedPackagesCSV();
      fs.writeFileSync(
        path.join(this.outputDir, 'Filtered_Managed_Packages.csv'),
        filteredPackagesCSV
      );
      console.log(`✓ Filtered Managed Packages CSV generated (${this.filteredManagedClasses?.length || 0} classes filtered)`);

      // Generate complete results JSON
      fs.writeFileSync(
        path.join(this.outputDir, 'audit-results-v2-complete.json'),
        JSON.stringify(this.results, null, 2)
      );
      console.log(`✓ Complete results JSON generated`);

      // Generate quick reference guide
      const quickRef = this.generateQuickReference();
      fs.writeFileSync(
        path.join(this.outputDir, 'QUICK_REFERENCE_V2.md'),
        quickRef
      );
      console.log(`✓ Quick reference guide generated\n`);

      // v3.25.0: Generate field collision analysis reports
      await this.generateFieldCollisionReports();

      // v3.28.0: Generate field write map collision report
      await this.generateFieldWriteMapReport();

      // v3.29.0: Generate new enhancement reports
      await this.generateRecursionRiskReport();
      await this.generateScheduledAutomationCalendar();
      await this.generateHardcodedArtifactsReport();
      await this.generateExecutionOrderAnalysis();
      await this.generateV3_29_0EnhancementsSummary();

    } catch (error) {
      console.error('❌ Report generation failed:', error.message);
    }
  }

  /**
   * v3.25.0: Generate field collision analysis reports
   */
  async generateFieldCollisionReports() {
    console.log('════════════════════════════════════════════════════════════');
    console.log('Phase 8.5: Field Collision Analysis (v3.25.0)');
    console.log('════════════════════════════════════════════════════════════\n');

    try {
      // Load conflicts from findings
      const conflictsPath = path.join(this.outputDir, 'findings', 'Conflicts.json');
      if (!fs.existsSync(conflictsPath)) {
        console.log('⚠️  No conflicts found, skipping field collision analysis\n');
        return;
      }

      const conflicts = JSON.parse(fs.readFileSync(conflictsPath, 'utf8'));

      // Step 1: Analyze field collisions
      const analyzer = new FieldCollisionAnalyzer({ verbose: false });
      const analysisResults = analyzer.analyzeCollisions(conflicts, { limit: 20 });

      if (analysisResults.totalCollisions === 0) {
        console.log('✓ No field collisions detected\n');
        return;
      }

      console.log(`✓ Analyzed ${analysisResults.totalCollisions} field collision(s)`);

      // Step 2: Prioritize into sprints
      const prioritizationEngine = new PrioritizationEngine({ verbose: false });
      const sprintPlan = prioritizationEngine.prioritizeIntoSprints(analysisResults.allCollisions);
      console.log(`✓ Prioritized into ${sprintPlan.sprints.length} sprint(s)`);

      // Step 3: Generate reports
      const reportGenerator = new RemediationPlanGenerator({
        verbose: false,
        orgName: this.orgAlias,
        auditDate: new Date().toISOString().split('T')[0]
      });

      const reports = reportGenerator.generateReports(analysisResults, sprintPlan);

      // Write reports
      fs.writeFileSync(
        path.join(this.outputDir, 'FIELD_COLLISION_ANALYSIS.md'),
        reports.analysisReport
      );
      console.log(`✓ Generated: FIELD_COLLISION_ANALYSIS.md`);

      fs.writeFileSync(
        path.join(this.outputDir, 'PRIORITIZED_REMEDIATION_PLAN.md'),
        reports.remediationPlan
      );
      console.log(`✓ Generated: PRIORITIZED_REMEDIATION_PLAN.md\n`);

    } catch (error) {
      console.error('❌ Field collision analysis failed:', error.message);
      if (error.stack) {
        console.error('Stack trace:', error.stack);
      }
    }
  }

  /**
   * v3.28.0: Generate field write map collision report
   */
  async generateFieldWriteMapReport() {
    console.log('════════════════════════════════════════════════════════════');
    console.log('Phase 8.6: Field Write Map Report (v3.28.0)');
    console.log('════════════════════════════════════════════════════════════\n');

    try {
      if (!this.results.fieldCollisions || this.results.fieldCollisions.collisions.length === 0) {
        console.log('✓ No field-level collisions detected\n');
        return;
      }

      const { collisions, stats } = this.results.fieldCollisions;

      // Generate markdown report
      let report = `# Field Write Map - Collision Analysis\n\n`;
      report += `**Organization**: ${this.orgAlias}\n`;
      report += `**Audit Date**: ${new Date().toISOString().split('T')[0]}\n`;
      report += `**Audit Version**: v3.28.0\n\n`;

      report += `---\n\n`;
      report += `## Summary Statistics\n\n`;
      report += `- **Total Field Writes**: ${stats.totalWrites}\n`;
      report += `- **Unique Fields Modified**: ${stats.uniqueFields}\n`;
      report += `- **Field Collisions Detected**: ${stats.collisions}\n`;
      report += `- **Fields with Single Writer**: ${stats.fieldsWithSingleWriter}\n\n`;

      // Collision breakdown by severity
      const bySeverity = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
      collisions.forEach(c => bySeverity[c.severity]++);

      report += `### Collision Breakdown by Severity\n\n`;
      report += `| Severity | Count |\n`;
      report += `|----------|-------|\n`;
      report += `| CRITICAL | ${bySeverity.CRITICAL} |\n`;
      report += `| HIGH     | ${bySeverity.HIGH} |\n`;
      report += `| MEDIUM   | ${bySeverity.MEDIUM} |\n`;
      report += `| LOW      | ${bySeverity.LOW} |\n\n`;

      report += `---\n\n`;
      report += `## Detected Field Collisions\n\n`;

      // Group by severity
      const criticalCollisions = collisions.filter(c => c.severity === 'CRITICAL');
      const highCollisions = collisions.filter(c => c.severity === 'HIGH');
      const mediumCollisions = collisions.filter(c => c.severity === 'MEDIUM');
      const lowCollisions = collisions.filter(c => c.severity === 'LOW');

      // CRITICAL collisions
      if (criticalCollisions.length > 0) {
        report += `### 🔴 CRITICAL Severity (${criticalCollisions.length})\n\n`;
        criticalCollisions.forEach((collision, i) => {
          report += `#### ${i + 1}. ${collision.object}.${collision.field}\n\n`;
          report += `**Conflict ID**: \`${collision.conflictId}\`\n\n`;
          report += `**Automations Writing to This Field**: ${collision.automationCount}\n\n`;
          report += `${collision.specificConflict}\n\n`;
          report += `**Condition Overlap**: ${collision.overlapAnalysis.overlap}\n`;
          report += ` - ${collision.overlapAnalysis.reason}\n\n`;
          report += `**Recommendation**: ${collision.recommendation.action}\n`;
          collision.recommendation.steps.forEach((step, idx) => {
            report += `${idx + 1}. ${step}\n`;
          });
          report += `\n---\n\n`;
        });
      }

      // HIGH collisions
      if (highCollisions.length > 0) {
        report += `### 🟠 HIGH Severity (${highCollisions.length})\n\n`;
        highCollisions.forEach((collision, i) => {
          report += `#### ${i + 1}. ${collision.object}.${collision.field}\n\n`;
          report += `**Conflict ID**: \`${collision.conflictId}\`\n\n`;
          report += `**Automations Writing to This Field**: ${collision.automationCount}\n\n`;
          report += `${collision.specificConflict}\n\n`;
          report += `**Condition Overlap**: ${collision.overlapAnalysis.overlap}\n`;
          report += ` - ${collision.overlapAnalysis.reason}\n\n`;
          report += `**Recommendation**: ${collision.recommendation.action}\n`;
          collision.recommendation.steps.forEach((step, idx) => {
            report += `${idx + 1}. ${step}\n`;
          });
          report += `\n---\n\n`;
        });
      }

      // MEDIUM collisions
      if (mediumCollisions.length > 0) {
        report += `### 🟡 MEDIUM Severity (${mediumCollisions.length})\n\n`;
        mediumCollisions.forEach((collision, i) => {
          report += `#### ${i + 1}. ${collision.object}.${collision.field}\n\n`;
          report += `**Automations Writing to This Field**: ${collision.automationCount}\n\n`;
          report += `${collision.specificConflict}\n\n`;
          report += `**Condition Overlap**: ${collision.overlapAnalysis.overlap}\n`;
          report += ` - ${collision.overlapAnalysis.reason}\n\n`;
          report += `**Recommendation**: ${collision.recommendation.action}\n\n`;
          report += `---\n\n`;
        });
      }

      report += `---\n\n`;
      report += `## How to Use This Report\n\n`;
      report += `1. **Address CRITICAL collisions first** - These involve 4+ automations or workflows with unclear execution order\n`;
      report += `2. **Review HIGH severity collisions** - These involve 3 automations or workflows + triggers\n`;
      report += `3. **For each collision**:\n`;
      report += `   - Review the specific field being modified\n`;
      report += `   - Analyze the condition overlap (DEFINITE, LIKELY, POSSIBLE)\n`;
      report += `   - Follow the recommended remediation steps\n`;
      report += `4. **Test in sandbox** - Always test consolidations in sandbox before production\n`;
      report += `5. **Document decisions** - Record why certain automations take precedence\n\n`;

      report += `---\n\n`;
      report += `**Generated by**: Salesforce Automation Audit v3.28.0\n`;
      report += `**Timestamp**: ${new Date().toISOString()}\n`;

      // Write report
      const reportPath = path.join(this.outputDir, 'FIELD_WRITE_MAP_COLLISIONS.md');
      fs.writeFileSync(reportPath, report);
      console.log(`✓ Generated: FIELD_WRITE_MAP_COLLISIONS.md`);
      console.log(`  - ${collisions.length} field collision(s) documented\n`);

    } catch (error) {
      console.error('❌ Field write map report generation failed:', error.message);
      if (error.stack) {
        console.error('Stack trace:', error.stack);
      }
    }
  }

  /**
   * v3.29.0: Generate Recursion Risk Report
   */
  async generateRecursionRiskReport() {
    console.log('════════════════════════════════════════════════════════════');
    console.log('Phase 8.7: Recursion Risk Report (v3.29.0)');
    console.log('════════════════════════════════════════════════════════════\n');

    try {
      if (!this.results.recursionRisks || this.results.recursionRisks.risks.length === 0) {
        console.log('✓ No recursion risks detected\n');
        return;
      }

      const { risks, summary } = this.results.recursionRisks;

      let report = `# Recursion Risk Analysis\n\n`;
      report += `**Organization**: ${this.orgAlias}\n`;
      report += `**Audit Date**: ${new Date().toISOString().split('T')[0]}\n`;
      report += `**Audit Version**: v3.29.0\n\n`;
      report += `## Summary\n\n`;
      report += `- **Total Risks**: ${summary.total}\n`;
      report += `- **HIGH Risk**: ${summary.high} ⚠️\n`;
      report += `- **MEDIUM Risk**: ${summary.medium}\n`;
      report += `- **LOW Risk**: ${summary.low}\n\n`;
      report += `## What This Report Shows\n\n`;
      report += `This report identifies Apex triggers and Flows that may cause infinite loops or CPU timeout errors due to:\n\n`;
      report += `- **Apex Triggers**: Missing recursion guards when updating own object\n`;
      report += `- **Flows**: Updating fields that are part of their entry criteria\n`;
      report += `- **Circular Chains**: Multiple automations calling each other\n\n`;

      // HIGH Risk
      const highRisks = risks.filter(r => r.riskLevel === 'HIGH');
      if (highRisks.length > 0) {
        report += `## 🔴 HIGH Risk (${highRisks.length})\n\n`;
        report += `**Action Required**: Address immediately to prevent production issues\n\n`;
        highRisks.forEach((risk, i) => {
          report += `### ${i + 1}. ${risk.name} (${risk.type})\n\n`;
          report += `- **Object**: ${risk.object}\n`;
          report += `- **Risk**: ${risk.reason}\n`;
          report += `- **Recommendation**: ${risk.recommendation}\n\n`;
          if (risk.detailedAnalysis) {
            report += `**Details**: ${risk.detailedAnalysis}\n\n`;
          }
          report += `---\n\n`;
        });
      }

      // MEDIUM Risk
      const mediumRisks = risks.filter(r => r.riskLevel === 'MEDIUM');
      if (mediumRisks.length > 0) {
        report += `## 🟡 MEDIUM Risk (${mediumRisks.length})\n\n`;
        mediumRisks.forEach((risk, i) => {
          report += `### ${i + 1}. ${risk.name} (${risk.type})\n\n`;
          report += `- **Object**: ${risk.object}\n`;
          report += `- **Risk**: ${risk.reason}\n`;
          report += `- **Recommendation**: ${risk.recommendation}\n\n`;
          report += `---\n\n`;
        });
      }

      // LOW Risk
      const lowRisks = risks.filter(r => r.riskLevel === 'LOW');
      if (lowRisks.length > 0) {
        report += `## 🟢 LOW Risk (${lowRisks.length})\n\n`;
        lowRisks.forEach((risk, i) => {
          report += `- **${risk.name}** (${risk.type}): ${risk.reason}\n`;
        });
        report += `\n`;
      }

      report += `---\n\n`;
      report += `**Generated by**: Salesforce Automation Audit v3.29.0\n`;
      report += `**Timestamp**: ${new Date().toISOString()}\n`;

      const reportPath = path.join(this.outputDir, 'RECURSION_RISK_REPORT.md');
      fs.writeFileSync(reportPath, report);
      console.log(`✓ Generated: RECURSION_RISK_REPORT.md`);
      console.log(`  - ${summary.high} HIGH risk, ${summary.medium} MEDIUM risk, ${summary.low} LOW risk\n`);

    } catch (error) {
      console.error('❌ Recursion risk report generation failed:', error.message);
    }
  }

  /**
   * v3.29.0: Generate Scheduled Automation Calendar
   */
  async generateScheduledAutomationCalendar() {
    console.log('════════════════════════════════════════════════════════════');
    console.log('Phase 8.8: Scheduled Automation Calendar (v3.29.0)');
    console.log('════════════════════════════════════════════════════════════\n');

    try {
      if (!this.results.scheduledAutomation || this.results.scheduledAutomation.calendar.totalScheduled === 0) {
        console.log('✓ No scheduled automation detected\n');
        return;
      }

      const { flows, apex, calendar } = this.results.scheduledAutomation;

      let report = `# Scheduled Automation Calendar\n\n`;
      report += `**Organization**: ${this.orgAlias}\n`;
      report += `**Audit Date**: ${new Date().toISOString().split('T')[0]}\n`;
      report += `**Audit Version**: v3.29.0\n\n`;
      report += `## Summary\n\n`;
      report += `- **Total Scheduled**: ${calendar.totalScheduled}\n`;
      report += `- **Scheduled Flows**: ${flows.length}\n`;
      report += `- **Scheduled Apex Jobs**: ${apex.length}\n\n`;
      report += `### Frequency Breakdown\n\n`;
      report += `- **Daily**: ${calendar.summary.daily}\n`;
      report += `- **Weekly**: ${calendar.summary.weekly}\n`;
      report += `- **Monthly**: ${calendar.summary.monthly}\n`;
      report += `- **Hourly**: ${calendar.summary.hourly}\n`;
      report += `- **Custom**: ${calendar.summary.custom}\n\n`;
      report += `## Why This Matters\n\n`;
      report += `Scheduled automation can cause "mystery overwrites" - field values changing outside user transactions. `;
      report += `This calendar helps you understand when automated processes run and which fields they may modify.\n\n`;

      // Upcoming scheduled automation
      report += `## Upcoming Scheduled Automation\n\n`;
      if (calendar.entries.length > 0) {
        calendar.entries.slice(0, 20).forEach((entry, i) => {
          report += `### ${i + 1}. ${entry.name}\n\n`;
          report += `- **Type**: ${entry.category}\n`;
          report += `- **Schedule**: ${entry.schedule}\n`;
          if (entry.nextFireTime) {
            report += `- **Next Run**: ${entry.nextFireTime}\n`;
          }
          if (entry.cronExpression) {
            report += `- **Cron**: \`${entry.cronExpression}\`\n`;
          }
          report += `\n`;
        });
      }

      // Scheduled Flows detail
      if (flows.length > 0) {
        report += `## Scheduled Flows Detail\n\n`;
        flows.forEach(flow => {
          report += `### ${flow.name}\n\n`;
          report += `- **Schedule**: ${flow.schedule}\n`;
          if (flow.startTime) {
            report += `- **Start Time**: ${flow.startTime}\n`;
          }
          if (flow.namespace) {
            report += `- **Namespace**: ${flow.namespace}\n`;
          }
          report += `\n`;
        });
      }

      // Scheduled Apex detail
      if (apex.length > 0) {
        report += `## Scheduled Apex Jobs Detail\n\n`;
        apex.forEach(job => {
          report += `### ${job.name}\n\n`;
          report += `- **Class Name**: ${job.className}\n`;
          report += `- **Job Type**: ${job.jobType}\n`;
          report += `- **State**: ${job.state}\n`;
          report += `- **Schedule**: ${job.schedule}\n`;
          if (job.nextFireTime) {
            report += `- **Next Fire Time**: ${job.nextFireTime}\n`;
          }
          report += `- **Cron Expression**: \`${job.cronExpression}\`\n\n`;
        });
      }

      report += `---\n\n`;
      report += `**Generated by**: Salesforce Automation Audit v3.29.0\n`;
      report += `**Timestamp**: ${new Date().toISOString()}\n`;

      const reportPath = path.join(this.outputDir, 'SCHEDULED_AUTOMATION_CALENDAR.md');
      fs.writeFileSync(reportPath, report);
      console.log(`✓ Generated: SCHEDULED_AUTOMATION_CALENDAR.md`);
      console.log(`  - ${flows.length} scheduled Flows, ${apex.length} scheduled Apex jobs\n`);

    } catch (error) {
      console.error('❌ Scheduled automation calendar generation failed:', error.message);
    }
  }

  /**
   * v3.29.0: Generate Hardcoded Artifacts Report
   */
  async generateHardcodedArtifactsReport() {
    console.log('════════════════════════════════════════════════════════════');
    console.log('Phase 8.9: Hardcoded Artifacts Report (v3.29.0)');
    console.log('════════════════════════════════════════════════════════════\n');

    try {
      if (!this.results.hardcodedArtifacts || this.results.hardcodedArtifacts.summary.withArtifacts === 0) {
        console.log('✓ No hardcoded artifacts detected\n');
        return;
      }

      const { apexArtifacts, flowArtifacts, summary } = this.results.hardcodedArtifacts;

      let report = `# Hardcoded Artifacts Report\n\n`;
      report += `**Organization**: ${this.orgAlias}\n`;
      report += `**Audit Date**: ${new Date().toISOString().split('T')[0]}\n`;
      report += `**Audit Version**: v3.29.0\n\n`;
      report += `## Summary\n\n`;
      report += `- **Files Scanned**: ${summary.totalScanned}\n`;
      report += `- **Files with Artifacts**: ${summary.withArtifacts}\n`;
      report += `- **Total Hardcoded IDs**: ${summary.totalIds}\n`;
      report += `- **Total Hardcoded URLs**: ${summary.totalUrls}\n\n`;
      report += `### Risk Breakdown\n\n`;
      report += `- **CRITICAL**: ${summary.riskBreakdown.CRITICAL} 🔴\n`;
      report += `- **HIGH**: ${summary.riskBreakdown.HIGH} 🟠\n`;
      report += `- **MEDIUM**: ${summary.riskBreakdown.MEDIUM} 🟡\n`;
      report += `- **LOW**: ${summary.riskBreakdown.LOW}\n\n`;
      report += `### Artifact Types Found\n\n`;
      Object.entries(summary.artifactTypes).forEach(([type, count]) => {
        report += `- **${type}**: ${count}\n`;
      });
      report += `\n`;
      report += `## Why This Matters\n\n`;
      report += `Hardcoded Salesforce IDs and instance URLs create migration blockers. `;
      report += `These must be replaced with dynamic references (Custom Metadata, Custom Settings, or lookups) before migrating to a new org.\n\n`;

      // CRITICAL Risk
      const criticalArtifacts = [...apexArtifacts, ...flowArtifacts].filter(a => a.riskLevel === 'CRITICAL');
      if (criticalArtifacts.length > 0) {
        report += `## 🔴 CRITICAL Risk (${criticalArtifacts.length})\n\n`;
        report += `**Migration Blockers**: These MUST be fixed before any org migration\n\n`;
        criticalArtifacts.forEach(artifact => {
          const name = artifact.className || artifact.flowName;
          report += `### ${name}\n\n`;

          if (artifact.ids.length > 0) {
            report += `**Hardcoded IDs**:\n`;
            artifact.ids.forEach(id => {
              report += `- \`${id.id}\` (${id.type})`;
              if (id.line) report += ` - Line ${id.line}`;
              report += `\n`;
            });
            report += `\n`;
          }

          if (artifact.urls.length > 0) {
            report += `**Hardcoded URLs**:\n`;
            artifact.urls.forEach(url => {
              report += `- \`${url.url}\``;
              if (url.line) report += ` - Line ${url.line}`;
              report += `\n`;
            });
            report += `\n`;
          }
          report += `---\n\n`;
        });
      }

      // HIGH Risk
      const highArtifacts = [...apexArtifacts, ...flowArtifacts].filter(a => a.riskLevel === 'HIGH');
      if (highArtifacts.length > 0) {
        report += `## 🟠 HIGH Risk (${highArtifacts.length})\n\n`;
        highArtifacts.forEach(artifact => {
          const name = artifact.className || artifact.flowName;
          report += `### ${name}\n\n`;
          report += `- **IDs Found**: ${artifact.ids.length}\n`;
          report += `- **URLs Found**: ${artifact.urls.length}\n\n`;
          artifact.ids.forEach(id => {
            report += `  - \`${id.id}\` (${id.type})\n`;
          });
          report += `\n---\n\n`;
        });
      }

      // MEDIUM Risk
      const mediumArtifacts = [...apexArtifacts, ...flowArtifacts].filter(a => a.riskLevel === 'MEDIUM');
      if (mediumArtifacts.length > 0) {
        report += `## 🟡 MEDIUM Risk (${mediumArtifacts.length})\n\n`;
        mediumArtifacts.forEach(artifact => {
          const name = artifact.className || artifact.flowName;
          report += `- **${name}**: ${artifact.ids.length} IDs, ${artifact.urls.length} URLs\n`;
        });
        report += `\n`;
      }

      report += `---\n\n`;
      report += `## Remediation Guidance\n\n`;
      report += `1. **RecordType IDs**: Use RecordType.DeveloperName in SOQL or Custom Metadata\n`;
      report += `2. **Profile/PermissionSet IDs**: Use Name field in queries or Custom Metadata\n`;
      report += `3. **User IDs**: Use UserInfo methods or lookup by Username/Email\n`;
      report += `4. **Instance URLs**: Use Named Credentials or Custom Settings\n`;
      report += `5. **Organization IDs**: Use UserInfo.getOrganizationId()\n\n`;

      report += `---\n\n`;
      report += `**Generated by**: Salesforce Automation Audit v3.29.0\n`;
      report += `**Timestamp**: ${new Date().toISOString()}\n`;

      const reportPath = path.join(this.outputDir, 'HARDCODED_ARTIFACTS_REPORT.md');
      fs.writeFileSync(reportPath, report);
      console.log(`✓ Generated: HARDCODED_ARTIFACTS_REPORT.md`);
      console.log(`  - ${summary.withArtifacts} files with hardcoded artifacts (${summary.riskBreakdown.CRITICAL} CRITICAL)\n`);

    } catch (error) {
      console.error('❌ Hardcoded artifacts report generation failed:', error.message);
    }
  }

  /**
   * v3.29.0: Generate Execution Order Analysis
   */
  async generateExecutionOrderAnalysis() {
    console.log('════════════════════════════════════════════════════════════');
    console.log('Phase 8.10: Execution Order Analysis (v3.29.0)');
    console.log('════════════════════════════════════════════════════════════\n');

    try {
      if (!this.results.fieldCollisions || this.results.fieldCollisions.collisions.length === 0) {
        console.log('✓ No field collisions for execution order analysis\n');
        return;
      }

      const { collisions } = this.results.fieldCollisions;

      // Filter collisions with final writer determinations
      const collisionsWithFinalWriter = collisions.filter(c => c.finalWriterDetermination);

      if (collisionsWithFinalWriter.length === 0) {
        console.log('✓ No final writer determinations available\n');
        return;
      }

      let report = `# Execution Order Analysis - Final Writer Determinations\n\n`;
      report += `**Organization**: ${this.orgAlias}\n`;
      report += `**Audit Date**: ${new Date().toISOString().split('T')[0]}\n`;
      report += `**Audit Version**: v3.29.0\n\n`;
      report += `## Summary\n\n`;
      report += `- **Total Field Collisions**: ${collisions.length}\n`;
      report += `- **With Final Writer Analysis**: ${collisionsWithFinalWriter.length}\n\n`;

      const certainCount = collisionsWithFinalWriter.filter(c => c.finalWriterDetermination.confidence === 'CERTAIN').length;
      const likelyCount = collisionsWithFinalWriter.filter(c => c.finalWriterDetermination.confidence === 'LIKELY').length;
      const orderDepCount = collisionsWithFinalWriter.filter(c => c.finalWriterDetermination.confidence === 'ORDER-DEPENDENT').length;

      report += `### Confidence Breakdown\n\n`;
      report += `- **CERTAIN** (deterministic): ${certainCount}\n`;
      report += `- **LIKELY** (TriggerOrder differs): ${likelyCount}\n`;
      report += `- **ORDER-DEPENDENT** (same position, unclear order): ${orderDepCount}\n\n`;

      report += `## What This Report Shows\n\n`;
      report += `This report uses Salesforce's 13-position Order of Execution to determine which automation "wins" when multiple automations write to the same field.\n\n`;
      report += `**Confidence Levels**:\n`;
      report += `- **CERTAIN**: Automations at different execution positions (deterministic)\n`;
      report += `- **LIKELY**: Same position but different TriggerOrder (usually deterministic)\n`;
      report += `- **ORDER-DEPENDENT**: Same position, same/unknown TriggerOrder (last write wins, unpredictable)\n\n`;

      // CERTAIN determinations
      const certainCollisions = collisionsWithFinalWriter.filter(c => c.finalWriterDetermination.confidence === 'CERTAIN');
      if (certainCollisions.length > 0) {
        report += `## ✅ CERTAIN Determinations (${certainCollisions.length})\n\n`;
        certainCollisions.slice(0, 10).forEach(collision => {
          const fw = collision.finalWriterDetermination;
          report += `### ${collision.object}.${collision.field}\n\n`;
          report += `- **Final Writer**: ${fw.finalWriter.automationName} (${fw.finalWriter.automationType})\n`;
          report += `- **Execution Position**: ${fw.executionPosition}\n`;
          report += `- **Rationale**: ${fw.rationale}\n`;
          report += `- **Writers**:\n`;
          fw.allWriters.forEach(w => {
            report += `  - ${w.automationName} (${w.automationType}) - Position ${w.position}\n`;
          });
          report += `\n---\n\n`;
        });
      }

      // LIKELY determinations
      const likelyCollisions = collisionsWithFinalWriter.filter(c => c.finalWriterDetermination.confidence === 'LIKELY');
      if (likelyCollisions.length > 0) {
        report += `## ⚡ LIKELY Determinations (${likelyCollisions.length})\n\n`;
        likelyCollisions.slice(0, 10).forEach(collision => {
          const fw = collision.finalWriterDetermination;
          report += `### ${collision.object}.${collision.field}\n\n`;
          report += `- **Final Writer**: ${fw.finalWriter.automationName} (${fw.finalWriter.automationType})\n`;
          report += `- **TriggerOrder**: ${fw.finalWriter.triggerOrder}\n`;
          report += `- **Rationale**: ${fw.rationale}\n\n`;
          report += `---\n\n`;
        });
      }

      // ORDER-DEPENDENT determinations
      const orderDepCollisions = collisionsWithFinalWriter.filter(c => c.finalWriterDetermination.confidence === 'ORDER-DEPENDENT');
      if (orderDepCollisions.length > 0) {
        report += `## ⚠️ ORDER-DEPENDENT Determinations (${orderDepCollisions.length})\n\n`;
        report += `**Action Required**: These collisions are UNPREDICTABLE. The final value depends on which automation executes last.\n\n`;
        orderDepCollisions.slice(0, 10).forEach(collision => {
          const fw = collision.finalWriterDetermination;
          report += `### ${collision.object}.${collision.field}\n\n`;
          report += `- **Tied Writers**: ${fw.allWriters.map(w => w.automationName).join(', ')}\n`;
          report += `- **Execution Position**: ${fw.executionPosition}\n`;
          report += `- **Rationale**: ${fw.rationale}\n`;
          report += `- **Recommendation**: Consolidate these automations or set explicit TriggerOrder\n\n`;
          report += `---\n\n`;
        });
      }

      report += `---\n\n`;
      report += `**Generated by**: Salesforce Automation Audit v3.29.0\n`;
      report += `**Timestamp**: ${new Date().toISOString()}\n`;

      const reportPath = path.join(this.outputDir, 'EXECUTION_ORDER_ANALYSIS.md');
      fs.writeFileSync(reportPath, report);
      console.log(`✓ Generated: EXECUTION_ORDER_ANALYSIS.md`);
      console.log(`  - ${certainCount} CERTAIN, ${likelyCount} LIKELY, ${orderDepCount} ORDER-DEPENDENT\n`);

    } catch (error) {
      console.error('❌ Execution order analysis generation failed:', error.message);
    }
  }

  /**
   * v3.29.0: Generate v3.29.0 Enhancements Summary
   */
  async generateV3_29_0EnhancementsSummary() {
    console.log('════════════════════════════════════════════════════════════');
    console.log('Phase 8.11: v3.29.0 Enhancements Summary (v3.29.0)');
    console.log('════════════════════════════════════════════════════════════\n');

    try {
      let report = `# v3.29.0 Enhancements Summary\n\n`;
      report += `**Organization**: ${this.orgAlias}\n`;
      report += `**Audit Date**: ${new Date().toISOString().split('T')[0]}\n`;
      report += `**Audit Version**: v3.29.0 Phase 1\n\n`;

      report += `## What's New in v3.29.0\n\n`;
      report += `This release implements **5 HIGH-impact, LOW-effort enhancements** based on user feedback:\n\n`;

      // Enhancement 1: Process Builder
      report += `### 1. Process Builder Field Write Detection\n\n`;
      report += `**Status**: `;
      if (this.results.processBuilderData) {
        report += `✅ ENABLED\n`;
        report += `- **Processes Analyzed**: ${this.results.processBuilderData.processes?.length || 0}\n`;
        report += `- **Field Writes Found**: ${this.results.processBuilderData.totalFieldWrites || 0}\n\n`;
        report += `Process Builder field writes are now integrated into Field Write Map collision detection, closing the "mystery overwrite" gap.\n\n`;
      } else {
        report += `❌ NO DATA\n\n`;
      }

      // Enhancement 2: Final Writer Modeling
      report += `### 2. Final Writer Determination (Execution Order Modeling)\n\n`;
      report += `**Status**: `;
      if (this.results.fieldCollisions) {
        const withFinalWriter = this.results.fieldCollisions.collisions.filter(c => c.finalWriterDetermination).length;
        report += `✅ ENABLED\n`;
        report += `- **Field Collisions Analyzed**: ${this.results.fieldCollisions.collisions.length}\n`;
        report += `- **With Final Writer Determination**: ${withFinalWriter}\n\n`;
        report += `Uses Salesforce's 13-position Order of Execution to deterministically resolve which automation "wins" in collisions.\n\n`;
      } else {
        report += `❌ NO DATA\n\n`;
      }

      // Enhancement 3: Recursion Risk Detection
      report += `### 3. Recursion Risk Detection\n\n`;
      report += `**Status**: `;
      if (this.results.recursionRisks) {
        report += `✅ ENABLED\n`;
        report += `- **Total Risks**: ${this.results.recursionRisks.summary.total}\n`;
        report += `- **HIGH Risk**: ${this.results.recursionRisks.summary.high}\n`;
        report += `- **MEDIUM Risk**: ${this.results.recursionRisks.summary.medium}\n`;
        report += `- **LOW Risk**: ${this.results.recursionRisks.summary.low}\n\n`;
        report += `Detects recursion risks in Apex triggers (missing guards) and Flows (self-update on entry criteria fields).\n\n`;
      } else {
        report += `❌ NO DATA\n\n`;
      }

      // Enhancement 4: Scheduled Automation
      report += `### 4. Scheduled Automation Detection\n\n`;
      report += `**Status**: `;
      if (this.results.scheduledAutomation) {
        report += `✅ ENABLED\n`;
        report += `- **Scheduled Flows**: ${this.results.scheduledAutomation.flows?.length || 0}\n`;
        report += `- **Scheduled Apex Jobs**: ${this.results.scheduledAutomation.apex?.length || 0}\n`;
        report += `- **Total Scheduled**: ${this.results.scheduledAutomation.calendar?.totalScheduled || 0}\n\n`;
        report += `Explains "mystery overwrites" that happen outside user transaction times by cataloging all scheduled automation.\n\n`;
      } else {
        report += `❌ NO DATA\n\n`;
      }

      // Enhancement 5: Hardcoded Artifacts
      report += `### 5. Hardcoded Artifact Scanning\n\n`;
      report += `**Status**: `;
      if (this.results.hardcodedArtifacts) {
        report += `✅ ENABLED\n`;
        report += `- **Files Scanned**: ${this.results.hardcodedArtifacts.summary.totalScanned}\n`;
        report += `- **With Artifacts**: ${this.results.hardcodedArtifacts.summary.withArtifacts}\n`;
        report += `- **Total IDs Found**: ${this.results.hardcodedArtifacts.summary.totalIds}\n`;
        report += `- **CRITICAL Risk**: ${this.results.hardcodedArtifacts.summary.riskBreakdown?.CRITICAL || 0}\n\n`;
        report += `Scans Apex code and Flow formulas for hardcoded Salesforce IDs and instance URLs (migration blockers).\n\n`;
      } else {
        report += `❌ NO DATA\n\n`;
      }

      report += `## New Deliverables\n\n`;
      report += `This release adds **5 new reports**:\n\n`;
      report += `1. **RECURSION_RISK_REPORT.md** - Recursion risks by severity\n`;
      report += `2. **SCHEDULED_AUTOMATION_CALENDAR.md** - Calendar of scheduled automation\n`;
      report += `3. **HARDCODED_ARTIFACTS_REPORT.md** - Migration blockers (IDs/URLs)\n`;
      report += `4. **EXECUTION_ORDER_ANALYSIS.md** - Final writer determinations\n`;
      report += `5. **V3.29.0_ENHANCEMENTS_SUMMARY.md** - This summary\n\n`;

      report += `## Enhanced Deliverables\n\n`;
      report += `These existing deliverables now include v3.29.0 data:\n\n`;
      report += `1. **Master_Automation_Inventory.csv** - Added columns: Schedule, Recursion Risk, Hardcoded Artifacts\n`;
      report += `2. **FIELD_WRITE_MAP_COLLISIONS.md** - Now includes Process Builder writes\n`;
      report += `3. **EXECUTIVE_SUMMARY_V2.md** - Added v3.29.0 sections\n\n`;

      report += `## Phase 1 Implementation Complete\n\n`;
      report += `All 5 HIGH-impact/LOW-effort enhancements from user feedback have been successfully implemented. `;
      report += `These features close critical gaps in automation analysis and provide actionable intelligence for remediation.\n\n`;

      report += `**Next**: Phase 2 (MEDIUM-effort enhancements) planned for future release.\n\n`;

      report += `---\n\n`;
      report += `**Generated by**: Salesforce Automation Audit v3.29.0\n`;
      report += `**Timestamp**: ${new Date().toISOString()}\n`;

      const reportPath = path.join(this.outputDir, 'V3.29.0_ENHANCEMENTS_SUMMARY.md');
      fs.writeFileSync(reportPath, report);
      console.log(`✓ Generated: V3.29.0_ENHANCEMENTS_SUMMARY.md\n`);

    } catch (error) {
      console.error('❌ v3.29.0 enhancements summary generation failed:', error.message);
    }
  }

  /**
   * Convert v1 results to component format
   */
  convertV1ToComponents(v1Results) {
    const components = [];

    // Add triggers
    if (v1Results.triggers) {
      v1Results.triggers.forEach(trigger => {
        components.push({
          name: trigger.Name,
          type: 'ApexTrigger',
          object: trigger.TableEnumOrId,
          namespace: trigger.NamespacePrefix || null
        });
      });
    }

    // Add flows
    if (v1Results.flows) {
      v1Results.flows.forEach(flow => {
        components.push({
          name: flow.DeveloperName || flow.Name,
          type: 'Flow',
          namespace: flow.NamespacePrefix || null
        });
      });
    }

    return components;
  }

  /**
   * Generate Top 10 Risk Hotspots (v3.30.0)
   * Prioritizes areas by collision count, final-writer uncertainty, recursion risk, and coverage gaps
   */
  generateTop10Hotspots() {
    const hotspots = [];

    // 1. Collect Field Collision Hotspots
    if (this.results.fieldCollisions && this.results.fieldCollisions.collisions) {
      this.results.fieldCollisions.collisions.forEach(collision => {
        const baseScore = collision.severity === 'CRITICAL' ? 100 :
                         collision.severity === 'HIGH' ? 50 :
                         collision.severity === 'MEDIUM' ? 20 : 5;

        const writerCount = collision.writers ? collision.writers.length : 0;
        const finalWriterUncertainty = (collision.finalWriterDetermination &&
                                        collision.finalWriterDetermination.confidence === 'UNCERTAIN') ? 30 : 0;

        const riskScore = baseScore + (writerCount * 10) + finalWriterUncertainty;

        hotspots.push({
          type: 'FIELD_COLLISION',
          object: collision.object,
          field: collision.field,
          severity: collision.severity,
          riskScore,
          description: `${writerCount} automations write to ${collision.field}`,
          impact: collision.finalWriterDetermination ?
                 `Final writer: ${collision.finalWriterDetermination.winner || 'UNCERTAIN'}` :
                 'Race condition - unpredictable results',
          recommendation: 'Consolidate field writes into single automation'
        });
      });
    }

    // 2. Collect Recursion Risk Hotspots
    if (this.results.recursionRisks && this.results.recursionRisks.risks) {
      this.results.recursionRisks.risks.forEach(risk => {
        if (risk.riskLevel === 'HIGH' || risk.riskLevel === 'MEDIUM') {
          const riskScore = risk.riskLevel === 'HIGH' ? 80 : 40;

          hotspots.push({
            type: 'RECURSION_RISK',
            object: risk.automationType,
            field: risk.automationName,
            severity: risk.riskLevel,
            riskScore,
            description: `${risk.riskLevel} recursion risk - ${risk.reason}`,
            impact: 'CPU limit exceptions, infinite loops',
            recommendation: risk.hasGuards ?
                          'Review guard effectiveness' :
                          'Add static recursion guard'
          });
        }
      });
    }

    // 3. Collect Hardcoded Artifact Hotspots
    if (this.results.hardcodedArtifacts && this.results.hardcodedArtifacts.artifacts) {
      const artifactsByComponent = {};
      this.results.hardcodedArtifacts.artifacts.forEach(artifact => {
        const key = `${artifact.componentType}:${artifact.componentName}`;
        if (!artifactsByComponent[key]) {
          artifactsByComponent[key] = {
            componentType: artifact.componentType,
            componentName: artifact.componentName,
            artifacts: [],
            maxRisk: 'LOW'
          };
        }
        artifactsByComponent[key].artifacts.push(artifact);
        if (artifact.riskLevel === 'CRITICAL' || artifactsByComponent[key].maxRisk === 'CRITICAL') {
          artifactsByComponent[key].maxRisk = 'CRITICAL';
        } else if (artifact.riskLevel === 'HIGH' && artifactsByComponent[key].maxRisk !== 'CRITICAL') {
          artifactsByComponent[key].maxRisk = 'HIGH';
        }
      });

      Object.values(artifactsByComponent).forEach(component => {
        if (component.artifacts.length >= 3 || component.maxRisk === 'CRITICAL') {
          const riskScore = component.maxRisk === 'CRITICAL' ? 70 :
                           component.maxRisk === 'HIGH' ? 50 : 30;

          hotspots.push({
            type: 'HARDCODED_ARTIFACTS',
            object: component.componentType,
            field: component.componentName,
            severity: component.maxRisk,
            riskScore,
            description: `${component.artifacts.length} hardcoded IDs/URLs`,
            impact: 'Migration blocker - fails in new environments',
            recommendation: 'Replace IDs with dynamic queries or Custom Metadata'
          });
        }
      });
    }

    // 4. Collect Scheduled Automation with Multiple Writers (Potential Night-Time Collisions)
    if (this.results.scheduledAutomation && this.results.scheduledAutomation.scheduled && this.results.fieldCollisions) {
      const scheduledWriters = new Set();
      this.results.scheduledAutomation.scheduled.forEach(sched => {
        scheduledWriters.add(sched.name);
      });

      // Check if any collision involves scheduled automation
      if (this.results.fieldCollisions.collisions) {
        this.results.fieldCollisions.collisions.forEach(collision => {
          const hasScheduledWriter = collision.writers &&
                                     collision.writers.some(w => scheduledWriters.has(w.automationName || w.sourceName));

          if (hasScheduledWriter && collision.writers.length > 1) {
            hotspots.push({
              type: 'SCHEDULED_COLLISION',
              object: collision.object,
              field: collision.field,
              severity: 'HIGH',
              riskScore: 60,
              description: `Scheduled automation + ${collision.writers.length - 1} other writers`,
              impact: 'Mystery overnight overwrites',
              recommendation: 'Review scheduled job timing and consolidate field writes'
            });
          }
        });
      }
    }

    // 5. Sort by risk score and return top 10
    const top10 = hotspots
      .sort((a, b) => b.riskScore - a.riskScore)
      .slice(0, 10)
      .map((hotspot, index) => ({
        ...hotspot,
        rank: index + 1
      }));

    return top10;
  }

  /**
   * Generate enhanced executive summary
   */
  /**
   * NEW: Generate Audit Scope section
   */
  generateAuditScopeSection() {
    let section = '';
    section += '## Audit Scope & Coverage\n\n';
    section += 'This section provides transparency into what automation components were analyzed vs skipped during this audit.\n\n';

    // Components Successfully Analyzed
    section += '### ✅ Components Successfully Analyzed:\n\n';
    section += `- **Apex Triggers**: ${this.auditScope.analyzed['Apex Triggers'] || 0} analyzed\n`;
    section += `- **Apex Classes**: ${this.auditScope.analyzed['Apex Classes'] || 0} analyzed\n`;
    section += `- **Flows**: ${this.auditScope.analyzed['Flows'] || 0} analyzed\n`;
    section += `- **Process Builder**: ${this.auditScope.analyzed['Process Builder'] || 0} analyzed\n`;
    section += `- **Workflow Rules**: ${this.auditScope.analyzed['Workflow Rules'] || 0} analyzed\n`;

    if (this.auditScope.analyzed['Validation Rules']) {
      section += `- **Validation Rules**: ${this.auditScope.analyzed['Validation Rules']} analyzed ⭐ v2.0 Enhancement\n`;
    }
    section += '\n';

    // v2.0 Enhanced Analysis
    if (this.results.namespace || this.results.validation || this.results.classification || this.results.cascades) {
      section += '### 🔍 v2.0 Enhanced Analysis Performed:\n\n';

      if (this.results.namespace) {
        const managed = this.results.namespace.summary?.managedPackages || 0;
        const custom = this.results.namespace.summary?.customComponents || 0;
        section += `- ✅ **Managed Package Detection** (${managed} managed, ${custom} custom)\n`;
      }

      if (this.results.validation) {
        const total = this.results.validation.summary?.totalRules || 0;
        section += `- ✅ **Validation Rules Audit** (${total} rules analyzed)\n`;
      }

      if (this.results.classification) {
        section += `- ✅ **Business Process Classification** (by stage & department)\n`;
      }

      if (this.results.cascades) {
        const chains = this.results.cascades.chains?.length || 0;
        section += `- ✅ **Cascade Mapping** (${chains} automation chains detected)\n`;
      }

      if (this.results.migration) {
        const candidates = this.results.migration.triggerToFlowCandidates?.length || 0;
        section += `- ✅ **Migration Recommendations** (${candidates} triggers → Flow candidates)\n`;
      }

      if (this.results.risk) {
        section += `- ✅ **Risk-Based Implementation Phasing** (3-phase roadmap generated)\n`;
      }

      section += '\n';
    }

    // Components Skipped or Limited
    if (Object.keys(this.auditScope.skipped).length > 0 || this.auditScope.errors.length > 0) {
      section += '### ⚠️ Components Skipped or Limited:\n\n';

      for (const [component, reason] of Object.entries(this.auditScope.skipped)) {
        section += `- **${component}**: ${reason}\n`;
      }

      if (this.auditScope.errors.length > 0) {
        section += '\n**Errors Encountered:**\n\n';
        for (const err of this.auditScope.errors) {
          // Enhanced error display with full context
          section += `**${err.component || 'Unknown Component'}**:\n`;

          if (err.queryAttempted) {
            section += `  - Query Attempted: \`${err.queryAttempted}\`\n`;
          }
          if (err.querySucceeded) {
            section += `  - Query Succeeded: \`${err.querySucceeded}\` (fallback)\n`;
          }
          if (err.errorId) {
            section += `  - Salesforce Error ID: \`${err.errorId}\`\n`;
          }
          if (err.error && err.error.length < 200) {
            section += `  - Error: ${err.error}\n`;
          }
          if (err.impact) {
            section += `  - Impact: ${err.impact}\n`;
          }
          if (err.knownIssue) {
            section += `  - Known Issue: ${err.knownIssue}\n`;
          }
          if (err.resolution) {
            section += `  - Resolution: ${err.resolution}\n`;
          }
          if (err.recommendation) {
            section += `  - Recommendation: ${err.recommendation}\n`;
          }
          section += '\n';
        }
      }

      section += '\n';
    } else {
      section += '### ⚠️ Components Skipped or Limited:\n\n';
      section += '- None - Full audit completed successfully\n\n';
    }

    return section;
  }

  generateExecutiveSummary() {
    let summary = `# Salesforce Automation Audit - Executive Summary v3.30.0\n\n`;
    summary += `**Organization**: ${this.orgAlias}\n`;
    summary += `**Audit Date**: ${new Date().toISOString().split('T')[0]}\n`;
    summary += `**Audit Version**: 3.30.0 (Top 10 Risk Hotspots + Approvals + Platform Events)\n\n`;

    summary += `---\n\n`;
    summary += `## Overview\n\n`;

    const totalComponents = (this.results.v1?.triggers?.length || 0) +
                           (this.results.v1?.apexClasses?.length || 0) +
                           (this.results.v1?.flows?.length || 0);

    summary += `This comprehensive audit analyzed **${totalComponents} automation components** across `;
    summary += `Apex Triggers, Classes, and Flows, with enhanced analysis including namespace detection, `;
    summary += `business process classification, cascade mapping, migration recommendations, risk-based implementation planning, `;
    summary += `**field-level collision detection**, and **complete Flow metadata extraction**.\n\n`;

    summary += `### Key Findings\n\n`;
    summary += `- **Total Conflicts**: ${this.results.v1?.conflicts?.length || 0}\n`;

    // Add Field Write Map stats (v3.28.0 enhancement)
    if (this.results.fieldCollisions && this.results.fieldCollisions.stats) {
      summary += `- **Field-Level Collisions**: ${this.results.fieldCollisions.stats.collisions} fields with multiple writers\n`;
      summary += `- **Total Field Writes Tracked**: ${this.results.fieldCollisions.stats.totalWrites}\n`;
    }

    summary += `- **Managed Package Components**: ${this.results.namespace?.summary.managedPackages || 0}\n`;
    summary += `- **Custom Code Components**: ${this.results.namespace?.summary.customCode || 0}\n`;
    summary += `- **Validation Rules**: ${this.results.validation?.summary.totalRules || 0}\n`;
    summary += `- **Cascade Chains**: ${this.results.cascades?.cascades?.length || 0}\n`;
    summary += `- **Migration Candidates**: ${this.results.migration?.summary.recommendations.MIGRATE_TO_FLOW || 0}\n\n`;

    summary += `---\n\n`;

    // NEW v3.30.0: Top 10 Risk Hotspots
    const top10Hotspots = this.generateTop10Hotspots();
    if (top10Hotspots && top10Hotspots.length > 0) {
      summary += `## 🔥 TOP 10 RISK HOTSPOTS\n\n`;
      summary += `**Priority areas requiring immediate attention** (ranked by risk score)\n\n`;

      top10Hotspots.forEach(hotspot => {
        const icon = hotspot.type === 'FIELD_COLLISION' ? '⚠️' :
                    hotspot.type === 'RECURSION_RISK' ? '🔄' :
                    hotspot.type === 'HARDCODED_ARTIFACTS' ? '🔒' :
                    hotspot.type === 'SCHEDULED_COLLISION' ? '⏰' : '⚡';

        summary += `### ${hotspot.rank}. ${icon} ${hotspot.object}.${hotspot.field} [${hotspot.severity}]\n\n`;
        summary += `- **Risk Type**: ${hotspot.type.replace(/_/g, ' ')}\n`;
        summary += `- **Description**: ${hotspot.description}\n`;
        summary += `- **Impact**: ${hotspot.impact}\n`;
        summary += `- **Recommendation**: ${hotspot.recommendation}\n`;
        summary += `- **Risk Score**: ${hotspot.riskScore}\n\n`;
      });

      summary += `**Action Required**: Start with #1 - highest risk score indicates greatest business impact.\n\n`;
      summary += `---\n\n`;
    }

    // NEW: Insert Audit Scope section
    summary += this.generateAuditScopeSection();

    summary += `---\n\n`;
    summary += `## Business Impact\n\n`;

    if (this.results.classification) {
      summary += `### Process Distribution\n\n`;
      Object.entries(this.results.classification.summary.stages || {}).forEach(([stage, count]) => {
        summary += `- **${stage}**: ${count} components\n`;
      });
      summary += `\n`;

      summary += `### Department Ownership\n\n`;
      Object.entries(this.results.classification.summary.departments || {}).forEach(([dept, count]) => {
        summary += `- **${dept}**: ${count} components\n`;
      });
      summary += `\n`;
    }

    summary += `---\n\n`;
    summary += `## Implementation Roadmap\n\n`;

    if (this.results.risk) {
      summary += `### Risk-Based Phasing\n\n`;
      summary += `- **Phase 1 (Weeks 1-2)**: ${this.results.risk.summary.riskDistribution.LOW || 0} Low-Risk Changes\n`;
      summary += `- **Phase 2 (Weeks 3-5)**: ${this.results.risk.summary.riskDistribution.MEDIUM || 0} Medium-Risk Changes\n`;
      summary += `- **Phase 3 (Weeks 6-10)**: ${this.results.risk.summary.riskDistribution.HIGH || 0} High-Risk Changes\n\n`;

      if (this.results.risk.timeline) {
        summary += `**Total Estimated Effort**: ${this.results.risk.timeline.totalEffort.range}\n`;
        summary += `**Total Duration**: ${this.results.risk.timeline.totalDuration}\n\n`;
      }
    }

    summary += `---\n\n`;
    summary += `## Migration Recommendations\n\n`;

    if (this.results.migration) {
      summary += `- **Migrate to Flow**: ${this.results.migration.summary.recommendations.MIGRATE_TO_FLOW || 0} triggers\n`;
      summary += `- **Keep as Apex**: ${this.results.migration.summary.recommendations.KEEP_AS_APEX || 0} triggers\n`;
      summary += `- **Hybrid Approach**: ${this.results.migration.summary.recommendations.HYBRID || 0} triggers\n`;
      summary += `- **Requires Evaluation**: ${this.results.migration.summary.recommendations.EVALUATE || 0} triggers\n\n`;
    }

    summary += `---\n\n`;
    summary += `## Next Steps\n\n`;
    summary += `1. Review detailed reports in audit output directory\n`;
    summary += `2. Prioritize Phase 1 low-risk changes for quick wins\n`;
    summary += `3. Plan sandbox testing for Phase 2 medium-risk changes\n`;
    summary += `4. Schedule stakeholder review for Phase 3 high-risk changes\n`;
    summary += `5. Begin trigger consolidation for conflict resolution\n\n`;

    summary += `---\n\n`;
    summary += `## Deliverables\n\n`;
    summary += `This v3.28.2 audit includes:\n\n`;
    summary += `- Executive Summary (this document)\n`;
    summary += `- 🔴 **FIELD_WRITE_MAP_COLLISIONS.md** - Complete field-level collision analysis ⭐ v3.28.0\n`;
    summary += `- Namespace Analysis Report\n`;
    summary += `- Validation Rules Audit Report\n`;
    summary += `- Business Process Classification Report\n`;
    summary += `- Cascade Mapping Report\n`;
    summary += `- Migration Recommendations Report\n`;
    summary += `- Risk-Based Implementation Plan\n`;
    summary += `- Enhanced Inventory CSV (with Flow trigger metadata) ⭐ ENHANCED in v3.28.0\n`;
    summary += `- Complete Results JSON\n`;
    summary += `- Quick Reference Guide\n\n`;

    // Add v3.28.0/v3.28.2 highlights if field collisions exist
    if (this.results.fieldCollisions && this.results.fieldCollisions.stats.collisions > 0) {
      summary += `### 🔴 Field-Level Collision Analysis (v3.28.0)\n\n`;
      summary += `**CRITICAL FILE**: \`FIELD_WRITE_MAP_COLLISIONS.md\` (${this.results.fieldCollisions.stats.collisions} fields affected)\n\n`;
      summary += `This audit includes comprehensive field-level collision detection:\n\n`;
      summary += `- **Field Write Map**: Tracks which automations write to which fields\n`;
      summary += `- **Collision Detection**: Identifies ${this.results.fieldCollisions.stats.collisions} fields modified by multiple automations\n`;
      summary += `- **Overlap Analysis**: Classifies condition overlap (DEFINITE/LIKELY/POSSIBLE)\n`;
      summary += `- **Remediation Recommendations**: Context-aware consolidation strategies per collision\n`;
      summary += `- **Flow Metadata**: Complete trigger object, events, and entry criteria\n`;
      summary += `\n**Report**: See \`FIELD_WRITE_MAP_COLLISIONS.md\` for detailed analysis\n\n`;
    }

    return summary;
  }

  /**
   * Generate enhanced inventory CSV
   */
  generateEnhancedInventory() {
    const rows = [];
    const header = 'Name,Type,Object,Namespace,Package Type,Stage,Department,Risk Score,Risk Level,Modifiable';
    rows.push(header);

    // Merge all component data
    const components = this.mergeComponentData();

    components.forEach(comp => {
      const row = [
        comp.name || '',
        comp.type || '',
        comp.object || '',
        comp.namespace || '',
        comp.packageType || '',
        comp.stage || '',
        comp.department || '',
        comp.riskScore || '',
        comp.riskLevel || '',
        comp.modifiable || ''
      ].map(val => `"${String(val).replace(/"/g, '""')}"`).join(',');

      rows.push(row);
    });

    return rows.join('\n');
  }

  /**
   * Merge component data from all analyses
   */
  mergeComponentData() {
    const components = [];
    const componentMap = new Map();

    // Start with v1 data
    if (this.results.v1?.triggers) {
      this.results.v1.triggers.forEach(trigger => {
        const key = `${trigger.Name}-ApexTrigger`;
        componentMap.set(key, {
          name: trigger.Name,
          type: 'ApexTrigger',
          object: trigger.TableEnumOrId,
          namespace: trigger.NamespacePrefix || null
        });
      });
    }

    if (this.results.v1?.flows) {
      this.results.v1.flows.forEach(flow => {
        const key = `${flow.DeveloperName || flow.Name}-Flow`;
        componentMap.set(key, {
          name: flow.DeveloperName || flow.Name,
          type: 'Flow'
        });
      });
    }

    // Enrich with namespace data
    if (this.results.namespace?.triggers && this.results.namespace?.flows) {
      [...this.results.namespace.triggers, ...this.results.namespace.flows].forEach(comp => {
        const key = `${comp.name}-${comp.type}`;
        if (componentMap.has(key)) {
          const existing = componentMap.get(key);
          existing.packageType = comp.packageType;
          existing.modifiable = comp.modifiable;
        }
      });
    }

    // Enrich with classification data
    if (this.results.classification?.classifiedComponents) {
      this.results.classification.classifiedComponents.forEach(comp => {
        const key = `${comp.name}-${comp.type}`;
        if (componentMap.has(key)) {
          const existing = componentMap.get(key);
          existing.stage = comp.classification?.businessStage;
          existing.department = comp.classification?.department;
        }
      });
    }

    // Enrich with risk data
    if (this.results.risk?.components) {
      this.results.risk.components.forEach(comp => {
        const key = `${comp.name}-${comp.type}`;
        if (componentMap.has(key)) {
          const existing = componentMap.get(key);
          existing.riskScore = comp.riskScore;
          existing.riskLevel = comp.riskLevel;
        }
      });
    }

    // Convert map to array
    componentMap.forEach(comp => components.push(comp));

    return components;
  }

  /**
   * Generate quick reference guide
   */
  generateQuickReference() {
    let guide = `# Quick Reference Guide - Automation Audit v2.0\n\n`;
    guide += `**Org**: ${this.orgAlias}\n`;
    guide += `**Date**: ${new Date().toISOString().split('T')[0]}\n\n`;

    guide += `## File Structure\n\n`;
    guide += `\`\`\`\n`;
    guide += `${this.outputDir}/\n`;
    guide += `├── EXECUTIVE_SUMMARY_V2.md               # Start here\n`;
    guide += `├── Master_Automation_Inventory.csv       # ⭐ User-friendly 15-column inventory\n`;
    guide += `├── Master_Inventory_Summary.md           # ⭐ Usage guide for Master CSV\n`;
    guide += `├── Filtered_Managed_Packages.csv         # 🆕 Managed packages excluded from main inventory\n`;
    guide += `├── QUICK_REFERENCE_V2.md                 # This file\n`;
    guide += `├── enhanced-inventory.csv                # Technical inventory\n`;
    guide += `├── namespace-analysis-summary.md         # Managed packages report\n`;
    guide += `├── validation-rules-audit.md             # Validation rules analysis\n`;
    guide += `├── business-process-classification.md    # Process/dept tags\n`;
    guide += `├── cascade-mapping-report.md             # Automation chains\n`;
    guide += `├── migration-recommendations.md          # Trigger-to-Flow decisions\n`;
    guide += `├── risk-based-implementation-plan.md     # Phased rollout\n`;
    guide += `└── audit-results-v2-complete.json        # Raw data\n`;
    guide += `\`\`\`\n\n`;

    guide += `## Priority Actions\n\n`;
    guide += `### Immediate (This Week)\n`;
    guide += `1. Review Executive Summary\n`;
    guide += `2. Identify critical conflicts requiring immediate attention\n`;
    guide += `3. Review managed package component list (read-only)\n\n`;

    guide += `### Short-Term (Weeks 1-2)\n`;
    guide += `1. Begin Phase 1 low-risk changes\n`;
    guide += `2. Deploy trigger consolidations for simple conflicts\n`;
    guide += `3. Start validation rule cleanup\n\n`;

    guide += `### Medium-Term (Weeks 3-5)\n`;
    guide += `1. Execute Phase 2 medium-risk changes\n`;
    guide += `2. Migrate simple triggers to Flow\n`;
    guide += `3. Test cascade chains in sandbox\n\n`;

    guide += `### Long-Term (Weeks 6-10)\n`;
    guide += `1. Plan Phase 3 high-risk changes\n`;
    guide += `2. Consolidate complex business logic\n`;
    guide += `3. Complete migration recommendations\n\n`;

    guide += `## Key Metrics\n\n`;
    const metrics = {
      'Total Components': (this.results.v1?.triggers?.length || 0) +
                         (this.results.v1?.flows?.length || 0),
      'Conflicts': this.results.v1?.conflicts?.length || 0,
      'Managed Packages': this.results.namespace?.summary.managedPackages || 0,
      'Validation Rules': this.results.validation?.summary.totalRules || 0,
      'Migration Candidates': this.results.migration?.summary.recommendations.MIGRATE_TO_FLOW || 0
    };

    Object.entries(metrics).forEach(([key, value]) => {
      guide += `- **${key}**: ${value}\n`;
    });

    return guide;
  }

  /**
   * Group classified components by stage
   */
  groupByStage(classified) {
    const stages = {};
    classified.forEach(comp => {
      const stage = comp.classification?.businessStage || 'Unknown';
      stages[stage] = (stages[stage] || 0) + 1;
    });
    return stages;
  }

  /**
   * Group classified components by department
   */
  groupByDepartment(classified) {
    const departments = {};
    classified.forEach(comp => {
      const dept = comp.classification?.department || 'Unknown';
      departments[dept] = (departments[dept] || 0) + 1;
    });
    return departments;
  }

  /**
   * Check if ApexClass should be filtered from Master Inventory
   * Filters managed packages and common managed package prefixes
   * @param {Object} apexClass - ApexClass record
   * @param {Object} nsData - Namespace data {namespace, packageType}
   * @returns {boolean} True if class should be filtered out
   */
  shouldFilterApexClass(apexClass, nsData) {
    // Filter managed packages
    if (nsData.packageType === 'MANAGED') {
      return true;
    }

    // Filter common managed package prefixes
    const managedPrefixes = [
      'PS_',              // PandaDoc, etc.
      'MCList',           // Marketing Cloud
      'MC Subscriber',    // Marketing Cloud
      'MCSubscriberActivity', // Marketing Cloud
      'SSDupeCatcher',    // CRM Fusion DupeCatcher
      'tAA_',             // Total Achievement Alliance
      'ABM',              // ABM packages
      'ABMC',             // ABM Cloud packages
      'AC ',              // AppExchange packages
      'C2C',              // Commerce Cloud
      'CCI',              // Cumulus CI
      'DA '               // Various managed packages
    ];

    const className = apexClass.Name || '';
    return managedPrefixes.some(prefix => className.startsWith(prefix));
  }

  /**
   * Generate Master Automation Inventory CSV (15 columns - added Namespace, Package Type)
   */
  generateMasterInventory() {
    const rows = [];
    // v3.29.0: Added Schedule, Recursion Risk, Hardcoded Artifacts columns
    const header = 'Name,Type,Status,Object(s),Trigger Events,Entry Conditions,Purpose/Description,Entry Points,Async Patterns,Security,Data Ops,Governor Risks,Code Coverage %,Schedule,Recursion Risk,Hardcoded Artifacts,Risk Score,Conflicts Detected,Severity,Last Modified,API Version,Namespace,Package Type,Automation ID';
    rows.push(header);

    // Initialize filtered managed classes tracker (will be exported separately)
    this.filteredManagedClasses = [];

    // Build conflict map for quick lookup
    const conflictMap = new Map();
    if (this.results.v1?.conflicts) {
      this.results.v1.conflicts.forEach(conflict => {
        conflict.automations?.forEach(auto => {
          const key = auto.name || auto.id;
          if (!conflictMap.has(key)) {
            conflictMap.set(key, []);
          }
          conflictMap.get(key).push(conflict);
        });
      });
    }

    // Build namespace map for quick lookup
    const namespaceMap = new Map();
    if (this.results.namespace) {
      ['triggers', 'classes', 'flows'].forEach(componentType => {
        if (this.results.namespace[componentType]) {
          this.results.namespace[componentType].forEach(comp => {
            const key = comp.name || comp.id;
            namespaceMap.set(key, {
              namespace: comp.namespace || 'None',
              packageType: comp.packageType || 'CUSTOM'
            });
          });
        }
      });
    }

    // Process triggers
    if (this.results.v1?.triggers) {
      this.results.v1.triggers.forEach(trigger => {
        const triggerEvents = this.extractTriggerEvents(trigger);
        const conflicts = conflictMap.get(trigger.Name) || [];
        const severity = this.determineSeverity(trigger.Name, conflicts);
        const nsData = namespaceMap.get(trigger.Name) || { namespace: 'None', packageType: 'CUSTOM' };

        // v3.28.2: Enhanced metadata extraction with signals
        let description = 'Not Available';
        let entryConditions = 'Embedded in Code';
        let entryPoints = 'N/A'; // Triggers don't have entry points
        let asyncPatterns = 'N/A'; // Triggers don't have async patterns
        let security = 'N/A';
        let dataOps = 'N/A';
        let govRisks = 'None';
        let coverage = '';

        // Look up trigger body from deep metadata extraction
        const triggerBody = this.results.deepMetadata?.triggerBodies?.get(trigger.Id);
        if (triggerBody) {
          // v3.28.2: Use enhanced description extractor with fallbacks
          const descResult = extractTriggerDescription({
            body: triggerBody,
            triggerName: trigger.Name,
            minLen: 5
          });
          description = descResult.description;

          // v3.27.1: Sanitize description
          description = this.descriptionSanitizer.sanitize(description, 'ApexTrigger') || description;

          // Extract entry conditions
          const conditions = this.entryConditionExtractor.extractApexTriggerConditions(triggerBody, trigger.Name);
          if (conditions && conditions !== 'Embedded in Code') {
            entryConditions = conditions;
          }

          // v3.28.2: Extract trigger signals
          const signals = extractTriggerSignals(triggerBody);
          govRisks = formatRisks(signals.risks);

          // Extract data ops from trigger body (basic counts)
          const classSignals = extractClassSignals(triggerBody);
          dataOps = formatDataOps(classSignals.dataOps);
        }

        // v3.28.2: Get code coverage
        if (this.results.codeCoverage?.coverageById?.has(trigger.Id)) {
          const pct = this.results.codeCoverage.coverageById.get(trigger.Id);
          coverage = pct !== null ? `${pct}%` : '';
        }

        // v3.29.0: Get new enhancement data
        const schedule = 'N/A'; // Triggers don't have schedules
        const recursionRisk = this.getRecursionRisk(trigger.Name, 'ApexTrigger');
        const hardcodedArtifacts = this.getHardcodedArtifactsCount(trigger.Name, 'ApexTrigger');

        const row = [
          trigger.Name || '',
          'ApexTrigger',
          trigger.Status || 'Active',
          trigger.TableEnumOrId || '',
          triggerEvents,
          entryConditions,
          description,
          entryPoints,      // v3.28.2
          asyncPatterns,    // v3.28.2
          security,         // v3.28.2
          dataOps,          // v3.28.2
          govRisks,         // v3.28.2
          coverage,         // v3.28.2
          schedule,         // v3.29.0
          recursionRisk,    // v3.29.0
          hardcodedArtifacts, // v3.29.0
          this.getRiskScore(trigger.Name) || '0',
          conflicts.length.toString(),
          severity,
          this.formatDate(trigger.LastModifiedDate),
          trigger.ApiVersion || '',
          nsData.namespace,
          nsData.packageType,
          trigger.Id || ''
        ].map(val => `"${String(val).replace(/"/g, '""')}"`).join(',');

        rows.push(row);
      });
    }

    // Process classes (with managed package filtering)
    if (this.results.v1?.apexClasses) {
      this.results.v1.apexClasses.forEach(apexClass => {
        const conflicts = conflictMap.get(apexClass.Name) || [];
        const severity = this.determineSeverity(apexClass.Name, conflicts);
        const nsData = namespaceMap.get(apexClass.Name) || { namespace: 'None', packageType: 'CUSTOM' };

        // Filter managed packages and common prefixes
        if (this.shouldFilterApexClass(apexClass, nsData)) {
          this.filteredManagedClasses.push({
            name: apexClass.Name,
            namespace: nsData.namespace,
            packageType: nsData.packageType,
            lastModified: apexClass.LastModifiedDate,
            apiVersion: apexClass.ApiVersion
          });
          return; // Skip this class in main inventory
        }

        // v3.28.2: Enhanced metadata extraction with signals
        let description = 'Not Available';
        let entryPoints = 'N/A';
        let asyncPatterns = 'N/A';
        let security = 'N/A';
        let dataOps = 'N/A';
        let govRisks = 'None';
        let coverage = '';

        // Look up class body from deep metadata extraction
        const classBody = this.results.deepMetadata?.classBodies?.get(apexClass.Id);
        if (classBody) {
          // v3.28.2: Use enhanced description extractor with fallbacks
          const descResult = extractClassDescription({
            body: classBody,
            className: apexClass.Name,
            minLen: 5
          });
          description = descResult.description;

          // v3.27.1: Sanitize description
          description = this.descriptionSanitizer.sanitize(description, 'ApexClass') || description;

          // v3.28.2: Extract class signals
          const signals = extractClassSignals(classBody);
          entryPoints = formatEntryPoints(signals.entryPoints);
          asyncPatterns = formatAsyncPatterns(signals.async);
          security = formatSecurity(signals.security);
          dataOps = formatDataOps(signals.dataOps);
          govRisks = formatRisks(signals.risks);
        }

        // v3.28.2: Get code coverage
        if (this.results.codeCoverage?.coverageById?.has(apexClass.Id)) {
          const pct = this.results.codeCoverage.coverageById.get(apexClass.Id);
          coverage = pct !== null ? `${pct}%` : '';
        }

        // v3.29.0: Get new enhancement data
        const schedule = this.getSchedule(apexClass.Name, 'ApexClass');
        const recursionRisk = 'N/A'; // Classes don't have recursion risk
        const hardcodedArtifacts = this.getHardcodedArtifactsCount(apexClass.Name, 'ApexClass');

        const row = [
          apexClass.Name || '',
          'ApexClass',
          apexClass.Status || 'Active',
          'N/A', // Classes don't have a single object
          'N/A', // No trigger events for classes
          'N/A', // No entry conditions for classes
          description,
          entryPoints,      // v3.28.2
          asyncPatterns,    // v3.28.2
          security,         // v3.28.2
          dataOps,          // v3.28.2
          govRisks,         // v3.28.2
          coverage,         // v3.28.2
          schedule,         // v3.29.0
          recursionRisk,    // v3.29.0
          hardcodedArtifacts, // v3.29.0
          this.getRiskScore(apexClass.Name) || '0',
          conflicts.length.toString(),
          severity,
          this.formatDate(apexClass.LastModifiedDate),
          apexClass.ApiVersion || '',
          nsData.namespace,
          nsData.packageType,
          apexClass.Id || ''
        ].map(val => `"${String(val).replace(/"/g, '""')}"`).join(',');

        rows.push(row);
      });
    }

    // Process flows
    if (this.results.v1?.flows) {
      this.results.v1.flows.forEach(flow => {
        const flowName = flow.DeveloperName || flow.Name;
        const conflicts = conflictMap.get(flowName) || [];
        const severity = this.determineSeverity(flowName, conflicts);
        const nsData = namespaceMap.get(flowName) || { namespace: 'None', packageType: 'CUSTOM' };

        // v3.28.0: Enhanced Flow metadata extraction with trigger object/events/criteria
        let description = 'Not Available';
        let entryConditions = 'Not Available';
        let triggerObject = 'N/A';
        let triggerEvents = 'N/A';

        // Helper function to normalize RecordTriggerType for consistent display
        const normalizeRecordTriggerType = (rtt) => {
          if (!rtt) return '';
          const map = {
            'CreateAndUpdate': 'Create/Update',
            'CreateOrUpdate': 'Create/Update',
            'CreateUpdate': 'Create/Update',
            'Create': 'Create',
            'Update': 'Update',
            'Delete': 'Delete'
          };
          return map[rtt] || rtt;
        };

        // Extract trigger object from enhanced FlowDefinitionView query (v3.28.0 Phase 1.1)
        if (flow.TriggerObjectOrEvent?.QualifiedApiName) {
          triggerObject = flow.TriggerObjectOrEvent.QualifiedApiName;
        } else if (flow.Object) {
          triggerObject = flow.Object;
        } else if (flow._metadata?.triggerInfo?.Object) {
          // v3.28.1: Fallback to _metadata.triggerInfo (from Flow XML parsing)
          triggerObject = flow._metadata.triggerInfo.Object;
        }

        // Extract trigger events from TriggerType and RecordTriggerType (v3.28.0 Phase 1.1)
        // v3.28.1: Enhanced to support _metadata.triggerInfo fallback
        const triggerTypeMap = {
          'RecordBeforeSave': 'before save',
          'RecordAfterSave': 'after save',
          'Scheduled': 'scheduled',
          'PlatformEvent': 'platform event'
        };

        const tt = (flow.TriggerType && flow.TriggerType !== 'null')
          ? flow.TriggerType
          : (flow._metadata?.triggerInfo?.TriggerType || null);

        const rtt = flow.RecordTriggerType || flow._metadata?.triggerInfo?.RecordTriggerType || null;

        if (tt || rtt) {
          const timing = triggerTypeMap[tt] || tt || '';
          const events = normalizeRecordTriggerType(rtt);
          const parts = [timing, events && `(${events})`].filter(Boolean);
          triggerEvents = parts.join(' ') || 'Always';
        }

        // Description extraction (basic metadata already available)
        if (flow.Description) {
          description = flow.Description;
        } else if (flow.Label) {
          description = `Flow: ${flow.Label}`;
        }

        // v3.28.0 Phase 1.3-1.4: Entry conditions from enhanced Flow metadata
        if (flow._metadata?.entryCriteria) {
          // Entry criteria from metadata API retrieval
          entryConditions = flow._metadata.entryCriteria.summary || 'Not Available';
        } else if (this.results.deepMetadata && this.results.deepMetadata.flowMetadata) {
          // Fallback to deep metadata extraction
          const flowMetadata = this.results.deepMetadata.flowMetadata.get(flow.DurableId || flow.Id);
          if (flowMetadata) {
            // Extract entry conditions from Flow metadata
            const conditions = this.entryConditionExtractor.extractFlowEntryConditions(flowMetadata, flowName);
            if (conditions && conditions !== 'Not Available') {
              entryConditions = conditions;
            }

            // Also attempt to extract better description from Flow metadata
            const flowDescResult = this.descriptionExtractor.extractFlowDescription(flowMetadata);
            if (flowDescResult.description && flowDescResult.description !== description) {
              description = flowDescResult.description;
            }
          }
        }

        // v3.27.1: Sanitize Flow description (regardless of source: metadata or deep extraction)
        if (description && description !== 'Not Available') {
          description = this.descriptionSanitizer.sanitize(description, 'Flow') || description;
        }

        // v3.29.0: Get new enhancement data
        const schedule = this.getSchedule(flowName, 'Flow');
        const recursionRisk = this.getRecursionRisk(flowName, 'Flow');
        const hardcodedArtifacts = this.getHardcodedArtifactsCount(flowName, 'Flow');

        const row = [
          flowName || '',
          'Flow',
          'Active', // Flows in inventory are active
          triggerObject, // v3.28.0: Real trigger object from TriggerObjectOrEvent.QualifiedApiName
          triggerEvents, // v3.28.0: Real trigger events from TriggerType + RecordTriggerType
          entryConditions, // v3.28.0: Real entry criteria from enhanced metadata
          description,
          'N/A', // Entry Points (flows don't have these)
          'N/A', // Async Patterns
          'N/A', // Security
          'N/A', // Data Ops
          'N/A', // Governor Risks
          'N/A', // Code Coverage
          schedule,         // v3.29.0
          recursionRisk,    // v3.29.0
          hardcodedArtifacts, // v3.29.0
          this.getRiskScore(flowName) || '0',
          conflicts.length.toString(),
          severity,
          this.formatDate(flow.LastModifiedDate),
          'N/A', // API version not available in FlowDefinitionView
          nsData.namespace,
          nsData.packageType,
          flow.DurableId || flow.Id || ''
        ].map(val => `"${String(val).replace(/"/g, '""')}"`).join(',');

        rows.push(row);
      });
    }

    // Process workflows
    if (this.results.v1?.workflows) {
      this.results.v1.workflows.forEach(workflow => {
        const conflicts = conflictMap.get(workflow.Name) || [];
        const severity = this.determineSeverity(workflow.Name, conflicts);
        const nsData = namespaceMap.get(workflow.Name) || { namespace: 'None', packageType: 'CUSTOM' };

        // v3.29.0: Get new enhancement data
        const schedule = 'N/A'; // Workflows don't have schedules
        const recursionRisk = 'N/A'; // Workflows don't have recursion risk
        const hardcodedArtifacts = 'N/A'; // Workflows don't have hardcoded artifacts (field updates use formulas)

        const row = [
          workflow.Name || '',
          'WorkflowRule',
          workflow.State || 'Active',
          workflow.TableEnumOrId || '',
          'N/A',
          workflow.TriggerType || 'N/A', // Entry condition is trigger type
          workflow.Description || 'N/A',
          'N/A', // Entry Points
          'N/A', // Async Patterns
          'N/A', // Security
          'N/A', // Data Ops
          'N/A', // Governor Risks
          'N/A', // Code Coverage
          schedule,         // v3.29.0
          recursionRisk,    // v3.29.0
          hardcodedArtifacts, // v3.29.0
          this.getRiskScore(workflow.Name) || '0',
          conflicts.length.toString(),
          severity,
          this.formatDate(workflow.LastModifiedDate),
          'N/A',
          nsData.namespace,
          nsData.packageType,
          workflow.Id || ''
        ].map(val => `"${String(val).replace(/"/g, '""')}"`).join(',');

        rows.push(row);
      });
    }

    return rows.join('\n');
  }

  /**
   * v3.29.0: Get schedule information for automation
   * @param {string} name - Automation name
   * @param {string} type - Automation type (Flow, ApexClass)
   * @returns {string} Schedule description or 'N/A'
   */
  getSchedule(name, type) {
    if (!this.results.scheduledAutomation) {
      return 'N/A';
    }

    if (type === 'Flow') {
      const flow = this.results.scheduledAutomation.flows?.find(f => f.name === name);
      return flow ? flow.schedule : 'N/A';
    }

    if (type === 'ApexClass') {
      const apex = this.results.scheduledAutomation.apex?.find(a => a.className === name);
      return apex ? apex.schedule : 'N/A';
    }

    return 'N/A';
  }

  /**
   * v3.29.0: Get recursion risk level for automation
   * @param {string} name - Automation name
   * @param {string} type - Automation type (ApexTrigger, Flow)
   * @returns {string} Risk level (HIGH, MEDIUM, LOW, NONE) or 'N/A'
   */
  getRecursionRisk(name, type) {
    if (!this.results.recursionRisks || !this.results.recursionRisks.risks) {
      return 'NONE';
    }

    const risk = this.results.recursionRisks.risks.find(r =>
      r.name === name && r.type === type
    );

    return risk ? risk.riskLevel : 'NONE';
  }

  /**
   * v3.29.0: Get hardcoded artifacts count for automation
   * @param {string} name - Automation name
   * @param {string} type - Automation type
   * @returns {string} Artifact count or 'None'
   */
  getHardcodedArtifactsCount(name, type) {
    if (!this.results.hardcodedArtifacts) {
      return 'None';
    }

    let artifacts = null;

    if (type === 'ApexTrigger' || type === 'ApexClass') {
      artifacts = this.results.hardcodedArtifacts.apexArtifacts?.find(a =>
        a.className === name || a.triggerName === name
      );
    } else if (type === 'Flow') {
      artifacts = this.results.hardcodedArtifacts.flowArtifacts?.find(a =>
        a.flowName === name
      );
    }

    if (!artifacts || !artifacts.hasArtifacts) {
      return 'None';
    }

    const count = (artifacts.ids?.length || 0) + (artifacts.urls?.length || 0);
    return count > 0 ? `${count} (${artifacts.riskLevel})` : 'None';
  }

  /**
   * Generate Filtered Managed Packages CSV
   * Contains ApexClasses that were filtered from the Master Inventory
   */
  generateFilteredManagedPackagesCSV() {
    const rows = [];
    const header = 'Name,Namespace,Package Type,Last Modified,API Version';
    rows.push(header);

    if (this.filteredManagedClasses && this.filteredManagedClasses.length > 0) {
      this.filteredManagedClasses.forEach(cls => {
        const row = [
          cls.name || '',
          cls.namespace || 'None',
          cls.packageType || 'UNKNOWN',
          this.formatDate(cls.lastModified),
          cls.apiVersion || ''
        ].map(val => `"${String(val).replace(/"/g, '""')}"`).join(',');

        rows.push(row);
      });
    } else {
      // Add a note if no classes were filtered
      rows.push('"No managed packages were filtered","","","",""');
    }

    return rows.join('\n');
  }

  /**
   * Generate Master Inventory Summary (usage guide)
   */
  generateMasterSummary() {
    const totalAutomations = (this.results.v1?.triggers?.length || 0) +
                            (this.results.v1?.apexClasses?.length || 0) +
                            (this.results.v1?.flows?.length || 0) +
                            (this.results.v1?.workflows?.length || 0);

    const conflictsBySeverity = this.getConflictsBySeverity();
    const fileSize = Math.round(totalAutomations * 0.3); // Rough estimate: 0.3 KB per automation

    let summary = `# Master Automation Inventory - Usage Guide\n\n`;
    summary += `## File Details\n\n`;
    summary += `**Location**: ${this.outputDir}/Master_Automation_Inventory.csv\n\n`;
    summary += `**Size**: ${fileSize} KB\n\n`;
    summary += `**Format**: CSV (UTF-8)\n\n`;
    summary += `**Last Updated**: ${new Date().toISOString().split('T')[0]}\n\n`;
    summary += `**Organization**: ${this.orgAlias}\n\n`;

    // Add filtered packages info
    if (this.filteredManagedClasses && this.filteredManagedClasses.length > 0) {
      summary += `**ℹ️ Note**: ${this.filteredManagedClasses.length} managed package ApexClasses were filtered from this inventory to improve readability.\n`;
      summary += `See \`Filtered_Managed_Packages.csv\` for the complete list of filtered classes.\n\n`;
    }

    summary += `---\n\n`;
    summary += `## 📊 Key Statistics\n\n`;
    summary += `| Metric                     | Count |\n`;
    summary += `|----------------------------|-------|\n`;
    summary += `| Total Automations          | ${totalAutomations}   |\n`;
    summary += `| Apex Triggers              | ${this.results.v1?.triggers?.length || 0}   |\n`;
    summary += `| Apex Classes               | ${this.results.v1?.apexClasses?.length || 0}   |\n`;
    summary += `| Flows                      | ${this.results.v1?.flows?.length || 0}   |\n`;
    summary += `| Workflow Rules             | ${this.results.v1?.workflows?.length || 0}   |\n`;
    summary += `| Automations with Conflicts | ${this.getAutomationsWithConflicts()}   |\n`;
    summary += `| CRITICAL Severity          | ${conflictsBySeverity.CRITICAL || 0}   |\n`;
    summary += `| HIGH Severity              | ${conflictsBySeverity.HIGH || 0}   |\n`;
    summary += `| MEDIUM Severity            | ${conflictsBySeverity.MEDIUM || 0}   |\n`;
    summary += `| LOW Severity               | ${conflictsBySeverity.LOW || 0}   |\n\n`;

    summary += `---\n\n`;
    summary += `## 📋 Column Definitions\n\n`;
    summary += `### 1. Name\n`;
    summary += `The unique identifier for the automation component.\n\n`;

    summary += `### 2. Type\n`;
    summary += `The automation type: ApexTrigger, ApexClass, Flow, WorkflowRule, ProcessBuilder.\n\n`;

    summary += `### 3. Status\n`;
    summary += `Active or Inactive. Only active automations are included in analysis.\n\n`;

    summary += `### 4. Object(s)\n`;
    summary += `The Salesforce object(s) this automation acts upon (e.g., Account, Opportunity).\n\n`;

    summary += `### 5. Trigger Events\n`;
    summary += `For Apex Triggers only: the timing of execution (e.g., beforeInsert, afterUpdate).\n\n`;

    summary += `### 6. Entry Conditions\n`;
    summary += `For Flows/Workflows: the criteria that must be met for the automation to fire.\n\n`;

    summary += `### 7. Purpose/Description\n`;
    summary += `A brief description of what the automation does (when available).\n\n`;

    summary += `### 8. Risk Score\n`;
    summary += `A 0-100 score indicating the risk level of this automation based on complexity, conflicts, and dependencies.\n\n`;

    summary += `### 9. Conflicts Detected\n`;
    summary += `The number of conflicts this automation is involved in with other automations.\n\n`;

    summary += `### 10. Severity\n`;
    summary += `CRITICAL, HIGH, MEDIUM, or LOW - the highest severity of conflicts involving this automation.\n\n`;

    summary += `### 11. Last Modified\n`;
    summary += `The date this automation was last modified.\n\n`;

    summary += `### 12. API Version\n`;
    summary += `The Salesforce API version this automation uses.\n\n`;

    summary += `### 13. Namespace\n`;
    summary += `The package namespace prefix (e.g., SBQQ, FCR). "None" indicates custom code (org-developed).\n\n`;

    summary += `### 14. Package Type\n`;
    summary += `Either "CUSTOM" (org-developed, modifiable) or "MANAGED_PACKAGE" (vendor-provided, read-only).\n\n`;

    summary += `### 15. Automation ID\n`;
    summary += `The Salesforce ID of the automation component.\n\n`;

    summary += `---\n\n`;
    summary += `## 🎯 Quick Start\n\n`;
    summary += `### To open and use:\n`;
    summary += `1. Open the CSV in Microsoft Excel or Google Sheets\n`;
    summary += `2. Enable filtering: Data → Filter (or Ctrl+Shift+L)\n`;
    summary += `3. Sort by Severity column to see high-priority items first\n`;
    summary += `4. Filter by Object(s) to find automation for specific objects\n\n`;

    summary += `### Example filters:\n`;
    summary += `- **Severity = "CRITICAL"** → ${conflictsBySeverity.CRITICAL || 0} automations needing immediate attention\n`;
    summary += `- **Object(s) contains "Account"** → All Account-related automation\n`;
    summary += `- **Type = "ApexTrigger"** → All ${this.results.v1?.triggers?.length || 0} triggers\n`;
    summary += `- **Conflicts Detected > 0** → All ${this.getAutomationsWithConflicts()} automations involved in conflicts\n`;
    summary += `- **Package Type = "CUSTOM"** → ${this.results.namespace?.summary.customCode || 'N/A'} org-developed automations (modifiable)\n`;
    summary += `- **Package Type = "MANAGED_PACKAGE"** → ${this.results.namespace?.summary.managedPackages || 'N/A'} vendor automations (read-only)\n`;
    summary += `- **Namespace <> "None"** → All managed package components by vendor\n\n`;

    summary += `---\n\n`;
    summary += `## ⚠️ Priority Actions\n\n`;
    summary += `### Immediate (This Week)\n`;
    summary += `1. Filter by Severity = "CRITICAL" and review ${conflictsBySeverity.CRITICAL || 0} items\n`;
    summary += `2. Identify automations with Conflicts Detected > 3 (high contention)\n`;
    summary += `3. Review HIGH severity items on business-critical objects (Account, Opportunity, Contact)\n\n`;

    summary += `### Short-Term (Weeks 1-2)\n`;
    summary += `1. Begin resolving CRITICAL conflicts through consolidation\n`;
    summary += `2. Document purpose/description for automations marked "N/A"\n`;
    summary += `3. Review Risk Score > 75 items for optimization opportunities\n\n`;

    summary += `### Medium-Term (Weeks 3-5)\n`;
    summary += `1. Address HIGH severity conflicts\n`;
    summary += `2. Plan migration for triggers recommended by migration analysis\n`;
    summary += `3. Update older API versions (< v58.0)\n\n`;

    summary += `---\n\n`;
    summary += `## 💡 Pro Tips for Excel/Sheets\n\n`;
    summary += `### Sort by multiple columns:\n`;
    summary += `1. Select all data\n`;
    summary += `2. Data → Sort\n`;
    summary += `3. Sort by: Severity (descending), then Conflicts Detected (descending)\n\n`;

    summary += `### Create a pivot table:\n`;
    summary += `1. Select all data\n`;
    summary += `2. Insert → PivotTable\n`;
    summary += `3. Rows: Object(s), Type\n`;
    summary += `4. Values: Count of Name, Sum of Conflicts Detected\n\n`;

    summary += `### Filter by date range:\n`;
    summary += `1. Click filter on Last Modified column\n`;
    summary += `2. Date Filters → Custom Filter\n`;
    summary += `3. Example: Last Modified > 2024-01-01 (recent changes)\n\n`;

    summary += `---\n\n`;
    summary += `## 📁 Full Path\n\n`;
    summary += `\`${path.join(process.cwd(), this.outputDir, 'Master_Automation_Inventory.csv')}\`\n\n`;

    summary += `---\n\n`;
    summary += `## 🔗 Related Reports\n\n`;
    summary += `- **EXECUTIVE_SUMMARY_V2.md**: High-level overview and recommendations\n`;
    summary += `- **QUICK_REFERENCE_V2.md**: File structure and next steps\n`;
    summary += `- **enhanced-inventory.csv**: Technical inventory with namespace/risk data\n`;
    summary += `- **namespace-analysis-summary.md**: Managed package analysis\n`;
    summary += `- **cascade-mapping-report.md**: Automation dependency chains\n\n`;

    summary += `---\n\n`;
    summary += `**Generated by**: Salesforce Automation Audit v2.0\n`;
    summary += `**Date**: ${new Date().toISOString()}\n`;

    return summary;
  }

  /**
   * Helper: Extract trigger events from trigger metadata
   */
  extractTriggerEvents(trigger) {
    const events = [];
    if (trigger.UsageBeforeInsert) events.push('beforeInsert');
    if (trigger.UsageAfterInsert) events.push('afterInsert');
    if (trigger.UsageBeforeUpdate) events.push('beforeUpdate');
    if (trigger.UsageAfterUpdate) events.push('afterUpdate');
    if (trigger.UsageBeforeDelete) events.push('beforeDelete');
    if (trigger.UsageAfterDelete) events.push('afterDelete');
    if (trigger.UsageAfterUndelete) events.push('afterUndelete');
    return events.length > 0 ? events.join('|') : 'N/A';
  }

  /**
   * Helper: Determine severity based on conflicts
   */
  determineSeverity(name, conflicts) {
    if (conflicts.length === 0) return 'LOW';

    const severities = conflicts.map(c => c.severity);
    if (severities.includes('CRITICAL')) return 'CRITICAL';
    if (severities.includes('HIGH')) return 'HIGH';
    if (severities.includes('MEDIUM')) return 'MEDIUM';
    return 'LOW';
  }

  /**
   * Helper: Get risk score for an automation
   */
  getRiskScore(name) {
    if (!this.results.v1?.udmData) return '0';

    const automation = this.results.v1.udmData.find(a => a.name === name);
    return automation?.riskScore?.toString() || '0';
  }

  /**
   * Helper: Format date for display
   */
  formatDate(date) {
    if (!date) return 'N/A';
    try {
      return new Date(date).toISOString().split('T')[0];
    } catch {
      return 'N/A';
    }
  }

  /**
   * Helper: Get conflicts by severity
   */
  getConflictsBySeverity() {
    const bySeverity = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
    if (this.results.v1?.conflicts) {
      this.results.v1.conflicts.forEach(conflict => {
        bySeverity[conflict.severity] = (bySeverity[conflict.severity] || 0) + 1;
      });
    }
    return bySeverity;
  }

  /**
   * Helper: Get count of automations with conflicts
   */
  getAutomationsWithConflicts() {
    if (!this.results.v1?.conflicts) return 0;

    const automationsWithConflicts = new Set();
    this.results.v1.conflicts.forEach(conflict => {
      conflict.automations?.forEach(auto => {
        automationsWithConflicts.add(auto.name || auto.id);
      });
    });
    return automationsWithConflicts.size;
  }
}

// CLI Usage
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.error('Usage: node automation-audit-v2-orchestrator.js <org-alias> <output-dir> [--exclude-managed]');
    console.error('Example: node automation-audit-v2-orchestrator.js neonone ./audit-output');
    console.error('');
    console.error('Options:');
    console.error('  --exclude-managed    Exclude managed package classes, triggers, and flows from analysis');
    process.exit(1);
  }

  const orgAlias = args[0];
  const outputDir = args[1];
  const excludeManaged = args.includes('--exclude-managed');

  (async () => {
    try {
      const orchestrator = new AutomationAuditV2Orchestrator(orgAlias, outputDir, { excludeManaged });
      await orchestrator.execute();

      // Generate consolidated PDF report
      try {
        console.log('\n📄 Generating consolidated PDF report...');
        const PDFGenerator = require('../../../cross-platform-plugin/scripts/lib/pdf-generator');
        const generator = new PDFGenerator({ verbose: false });

        const documents = [
          { path: path.join(outputDir, 'EXECUTIVE_SUMMARY_V2.md'), title: 'Executive Summary', order: 0 },
          { path: path.join(outputDir, 'AUTOMATION_SUMMARY.md'), title: 'Automation Summary', order: 1 },
          { path: path.join(outputDir, 'CONFLICTS.md'), title: 'Conflict Analysis', order: 2 },
          { path: path.join(outputDir, 'FIELD_COLLISION_ANALYSIS.md'), title: 'Field Collisions', order: 3 },
          { path: path.join(outputDir, 'PRIORITIZED_REMEDIATION_PLAN.md'), title: 'Remediation Plan', order: 4 }
        ].filter(doc => fs.existsSync(doc.path));

        if (documents.length > 0) {
          const timestamp = new Date().toISOString().split('T')[0];
          const pdfPath = path.join(outputDir, `automation-audit-complete-${orgAlias}-${timestamp}.pdf`);

          await generator.collate(documents, pdfPath, {
            toc: true,
            bookmarks: true,
            renderMermaid: true,
            coverPage: { template: 'salesforce-audit' },
            metadata: {
              title: `Automation Audit - ${orgAlias}`,
              org: orgAlias,
              date: timestamp,
              version: '3.28.2'
            }
          });

          console.log(`✅ PDF generated: ${path.basename(pdfPath)}`);
        } else {
          console.log('⚠️  No markdown reports found - skipping PDF generation');
        }
      } catch (pdfError) {
        console.warn('⚠️  PDF generation failed (non-fatal):', pdfError.message);
      }

      console.log('\n✅ All reports generated successfully!');
      console.log(`\nView results: ${outputDir}/EXECUTIVE_SUMMARY_V2.md`);

    } catch (error) {
      console.error('\n❌ Orchestration failed:', error.message);
      console.error(error.stack);
      process.exit(1);
    }
  })();
}

module.exports = AutomationAuditV2Orchestrator;
