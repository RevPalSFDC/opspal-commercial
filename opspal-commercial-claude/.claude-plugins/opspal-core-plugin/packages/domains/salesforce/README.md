# Salesforce Plugin

Comprehensive Salesforce operations with 74 agents. Features: metadata management, Flow Testing & Diagnostics with Flow Scanner Integration, CPQ/RevOps assessments, automated error prevention, permission set management (two-tier), Living Runbook System, deployment automation. v3.57.0: Flow Scanner Integration Phase 5 - wired into 17 files (6 agents, 4 runbooks, ACE Framework, Living Runbook System) for automatic adoption of auto-fix (8 patterns, 70-80% time savings), SARIF output, configuration-driven rules. Agents proactively suggest features, runbooks document usage, system learns patterns.

## Overview

Comprehensive Salesforce operations with 74 agents. Features: metadata management, Flow Testing & Diagnostics with Flow Scanner Integration, CPQ/RevOps assessments, automated error prevention, permission set management (two-tier), Living Runbook System, deployment automation.

**Latest Release (v3.57.0)**: Flow Scanner Integration Phase 5 - Complete system wiring across 17 files enabling automatic adoption of auto-fix capabilities (8 remediation patterns providing 70-80% time savings), SARIF output for CI/CD integration, and configuration-driven rule management. All Flow agents now proactively suggest auto-fix features, runbooks provide comprehensive documentation, ACE Framework tracks adoption metrics, and Living Runbook System learns org-specific patterns.

**Previous Release (v3.56.0)**: Flow Scanner Integration Phases 1-4 - Added auto-fix engine (8 patterns), SARIF output format, configuration-driven rule management, exception management, configurable severity levels, and 8 new validation rules (UnusedVariable, UnconnectedElement, CopyAPIName, RecursiveAfterUpdate, TriggerOrder, AutoLayout, InactiveFlow, UnsafeRunningContext).

This plugin provides 74 agents, 470 scripts, 41 commands.

## Quick Start

### Requirements

- Salesforce CLI (`sf`) v2+ installed and on PATH
- Legacy `sfdx` CLI is not supported
- Compatible with scratch orgs, sandboxes, and production orgs

### Org Targeting

- Authenticate with `sf org login web` (sandbox/prod) or `sf org login jwt` (CI/scratch)
- Set a default org with `sf config set target-org <alias>` or export `SF_TARGET_ORG`
- Auth and org targeting persist via the `sf` CLI config (`.sf/`)

### Installation

```bash
/plugin install salesforce-plugin@revpal-internal-plugins
```

### Verify Installation

```bash
/agents  # Should show 74 salesforce-plugin agents
```

### Your First Task

Try asking for help with flow-batch-operator:
```
User: "Help me specializes in parallel batch operations on multiple salesforce flows with performance optimization and error aggregation"
```

## Features

### Agents
- **flow-batch-operator**: Specializes in parallel batch operations on multiple Salesforce Flows with performance optimization and error aggregation
- **flow-diagnostician**: Comprehensive Flow diagnostic orchestration combining pre-flight validation, execution testing, and coverage analysis to determine production readiness
- **flow-log-analyst**: Specializes in parsing Salesforce debug logs to extract Flow execution details, identify errors, and analyze performance characteristics
- **flow-segmentation-specialist**: Expert in segment-by-segment Salesforce Flow building with complexity tracking, template guidance, and anti-pattern prevention
- **flow-template-specialist**: Expert in applying and customizing Salesforce Flow templates for common automation patterns
- **flow-test-orchestrator**: Orchestrates Flow execution testing with test data management, state capture, and result analysis across all Flow types
- **permission-orchestrator**: Centralized permission set management with two-tier architecture, merge-safe operations, and idempotent deployments
- **permission-segmentation-specialist**: Expert in segment-by-segment permission set building with complexity tracking, template guidance, and anti-pattern prevention
- **response-validator**: Validates agent responses for plausibility, statistical accuracy, and cross-reference consistency before presenting to users. Automatically retries suspicious responses.
- **sfdc-advocate-assignment**: Manages Customer Advocate provisioning, agency-to-account matching, and deployment directory processing with intelligent fuzzy matching
- **sfdc-agent-governance**: Manages agent governance, risk assessment, approval workflows, and audit trails for autonomous Salesforce operations. Enforces permission matrix, calculates risk scores, routes approvals, and ensures compliance.
- **sfdc-apex-developer**: Develops and manages Apex code including triggers, classes, batch jobs, test classes, and custom REST/SOAP services
- **sfdc-apex**: APEX development, tests, and code review. Not for metadata deploy packaging.
- **sfdc-api-monitor**: Monitors Salesforce API usage, generates usage reports, and provides optimization recommendations to prevent quota overages
- **sfdc-architecture-auditor**: Validates architectural decisions, enforces ADR documentation, audits standard vs. custom feature usage, and generates architecture health scores. Ensures adherence to Salesforce best practices and enterprise architecture guidelines.
- **sfdc-automation-auditor**: **v3.32.0 Enhanced** Comprehensive Salesforce automation audit with namespace detection, business process classification, cascade mapping, migration recommendations, and risk-based implementation planning. Audits Apex Triggers, Classes (with Handler pattern detection), Flows, Process Builder, Workflow Rules, and Validation Rules with 8 conflict detection rules, handler inventory, and detailed remediation roadmaps. Supports optional managed package filtering and unlimited class retrieval via pagination.
- **sfdc-automation-builder**: Creates and manages Salesforce automation including flows, process builders, workflow rules, and approval processes with proactive validation
- **sfdc-cli-executor**: Executes Salesforce CLI commands using OAuth authentication for metadata operations, data queries, apex execution, and org management
- **sfdc-communication-manager**: Manages Salesforce communication features including email templates, letterheads, mass email, email deliverability, and communication preferences
- **sfdc-compliance-officer**: Manages Salesforce compliance including GDPR, HIPAA, SOC, data privacy, audit trails, and regulatory requirements
- **sfdc-conflict-resolver**: Specialized agent for detecting and resolving Salesforce metadata conflicts, field type incompatibilities, and deployment blockers before they cause failures
- **sfdc-cpq-assessor**: Specialized agent for comprehensive Salesforce CPQ assessments with mandatory data quality checkpoints and time-series analysis
- **sfdc-cpq-specialist**: Configures Salesforce CPQ including pricing, quotes, product bundles, discount schedules, and revenue optimization
- **sfdc-csv-enrichment**: Specialized agent for enriching CSV data with Salesforce IDs through intelligent fuzzy matching, validation, and error correction
- **sfdc-dashboard-analyzer**: Analyzes Salesforce dashboards and reports to extract business process definitions, enabling intelligent object migration while preserving dashboard functionality
- **sfdc-dashboard-designer**: Enterprise Salesforce dashboard design specialist focused on audience-specific KPIs, visual hierarchy, chart optimization, and performance best practices
- **sfdc-dashboard-migrator**: Orchestrates complete dashboard and report migration from one Salesforce object to another, preserving business logic and visualizations
- **sfdc-dashboard-optimizer**: Optimizes Salesforce dashboard layouts for performance and visual appeal, validates component compatibility, and ensures 12-column grid compliance
- **sfdc-data-generator**: Generates intelligent mock data for Salesforce objects with business context, maintains referential integrity, and supports volume scaling for demonstrations
- **sfdc-data-operations**: Manages Salesforce data operations including imports, exports, transformations, quality analysis, and bulk operations with advanced API capabilities
- **sfdc-dedup-safety-copilot**: Instance-agnostic Salesforce Account deduplication safety copilot with Type 1/2 error detection and data-first survivor selection (Spec-Compliant v2)
- **sfdc-dependency-analyzer**: Analyzes dependencies between Salesforce objects, fields, and data to determine optimal execution order, identify circular dependencies, and plan sequential operations
- **sfdc-deployment-manager**: Manages Salesforce deployments with comprehensive validation pipeline, automated error recovery, and robust verification
- **sfdc-discovery**: Read-only Salesforce org analysis for objects, flows, permissions, and integration points. Produces findings and recommendations only.
- **sfdc-einstein-admin**: Configures Einstein Analytics, AI predictions, recommendation strategies, and machine learning models in Salesforce
- **sfdc-field-analyzer**: Specialized agent for comprehensive Salesforce field metadata analysis, providing intelligent field discovery, validation rule analysis, and pre-operation validation to prevent field-related errors
- **sfdc-integration-specialist**: Manages Salesforce integrations including APIs, connected apps, external services, middleware, and real-time event streaming
- **sfdc-layout-analyzer**: Analyze Salesforce Lightning Pages and Classic Layouts for quality, performance, and UX optimization opportunities
- **sfdc-layout-generator**: Generate optimized Salesforce Lightning Pages using proven fieldInstance pattern and AI-guided persona templates
- **sfdc-lightning-developer**: Develops Lightning Web Components (LWC), Aura components, and custom UI experiences for Salesforce applications
- **sfdc-lucid-diagrams**: Creates and manages Lucid diagrams for Salesforce architectures with multi-tenant isolation and vision analysis
- **sfdc-merge-orchestrator**: |
- **sfdc-metadata-analyzer**: Comprehensive Salesforce metadata analysis without hardcoded values - extracts validation rules, flows, layouts, and profiles dynamically
- **sfdc-metadata-manager**: Manages Salesforce metadata with comprehensive validation, automated error recovery, and proactive metadata integrity monitoring
- **sfdc-metadata**: Salesforce metadata deploys (flows, layouts, permissions) and package.xml management. Not for APEX authoring.
- **sfdc-object-auditor**: Performs comprehensive metadata analysis and auditing of Salesforce objects, providing detailed insights, usage statistics, and optimization recommendations
- **sfdc-orchestrator**: Coordinates complex multi-step Salesforce operations with mandatory validation framework, advanced API tools, automated error recovery, and comprehensive performance monitoring
- **sfdc-performance-optimizer**: Optimizes Salesforce performance with advanced monitoring tools including query optimization, indexing, governor limits, storage management, and real-time system health monitoring
- **sfdc-permission-assessor**: Interactive permission set assessment wizard - discovers fragmentation, analyzes overlap, generates migration plans, and guides consolidation
- **sfdc-permission-orchestrator**: Centralized permission set management with two-tier architecture, merge-safe operations, and idempotent deployments
- **sfdc-planner**: Analyzes Salesforce requirements, creates detailed implementation plans with comprehensive time estimates, performs impact analysis, and presents changes for approval before execution
- **sfdc-quality-auditor**: Continuous quality auditing of Salesforce metadata with health checks, drift detection, and compliance validation
- **sfdc-query-specialist**: Specialized agent for building, optimizing, and executing complex SOQL queries with advanced performance monitoring, error prevention, and real-time optimization capabilities
- **sfdc-remediation-executor**: Executes remediation plans from metadata analysis with phased fixes, rollback capability, and change verification
- **sfdc-renewal-import**: Specialized agent for contract renewal opportunity bulk imports with automatic validation, field mapping, and advocate integration
- **sfdc-report-designer**: Enterprise Salesforce report design specialist focused on format selection, field organization, grouping strategies, and performance optimization following industry best practices
- **sfdc-report-template-deployer**: Automated Salesforce report deployment from templates with 95%+ field resolution rate across different orgs
- **sfdc-report-type-manager**: Discovers and manages Salesforce report types, maps UI names to API tokens, handles restricted types, and surfaces available fields for validation
- **sfdc-report-validator**: Pre-validates all Salesforce report configurations before creation to prevent deployment failures, enforce best practices, and ensure data quality
- **sfdc-reports-dashboards**: Creates and manages Salesforce reports, dashboards, analytics with advanced API capabilities, leadless/hybrid support, comprehensive validation, and intelligent org mode detection
- **sfdc-reports-usage-auditor**: Audits Salesforce reports and dashboards over a rolling 6-month window to analyze usage patterns, classify by department, identify gaps, and generate actionable insights with integrated quality scoring
- **sfdc-revops-auditor**: Performs comprehensive RevOps assessments and audits of Salesforce environments with statistical analysis, business process evaluation, and data-driven recommendations
- **sfdc-revops-coordinator**: Orchestrates RevOps audits, optimizations, and monitoring - acts as the conductor for all RevOps tasks
- **sfdc-sales-operations**: Manages sales-specific Salesforce configurations including lead routing, assignment rules, sales processes, territory management, and opportunity teams
- **sfdc-security-admin**: Manages Salesforce security including profiles, permission sets, roles, sharing rules, and user provisioning with automated field permission verification
- **sfdc-service-cloud-admin**: Manages Service Cloud features including Cases, Knowledge Articles, Service Console, Omni-Channel routing, and customer support operations
- **sfdc-state-discovery**: Performs comprehensive Salesforce org state discovery, metadata comparison, and drift detection between local files and actual org configuration
- **sfdc-ui-customizer**: Manages Salesforce UI customization including page layouts, Lightning pages, record types, list views, and user interface components
- **trigger-orchestrator**: Master orchestrator for Apex trigger operations with handler pattern architecture, bulkification validation, and comprehensive testing
- **trigger-segmentation-specialist**: Specialist agent for segmenting complex Apex trigger logic into manageable handler methods with bulkification validation and governor limit tracking
- **validation-rule-orchestrator**: Centralized validation rule management with segmented formula authoring, complexity tracking, and idempotent deployments
- **validation-rule-segmentation-specialist**: Expert in segment-by-segment validation rule formula authoring with complexity tracking, template guidance, and anti-pattern prevention

### Scripts
- **add-custom-patterns.js**: Add Custom Error Patterns for Renewal Consolidation
- **add-disallowed-tools-to-agents.js**: Add disallowedTools to Agent Definitions
- **add-model-hints-to-agents.js**: Add preferredModel hints to Salesforce plugin agents
- **advanced-field-deployer.js**: Advanced Field Deployer for Salesforce
- **agent-health-monitor.js**: Agent Health Monitoring System
- **agent-testing-framework.js**: Agent Testing Framework
- **analyze-2025-renewals.js**: Comprehensive RevOps Analysis of 2025 Closed Won Renewals/Amendments
- **analyze-automation-metadata.js**: No description available
- **analyze-frontend.js**: Frontend Analysis CLI
- **analyze-validator-telemetry.js**: Validator Telemetry Analysis & ROI Calculation
- **audit-report-generator.js**: Salesforce Object Audit Report Generator
- **auto-agent-router.js**: Auto Agent Router - Automatic agent invocation based on patterns and complexity
- **check-init.js**: Initialization Check Script
- **check-progress.js**: Check Progress CLI Utility
- **config-manager.js**: Configuration Manager for ClaudeSFDC
- **create-accounts-contacts-diagram.js**: Create a Lucid diagram showing Salesforce Accounts and Contacts
- **create-activity-reports.js**: Create Activity/Task Reports
- **create-lucid-masters-mcp.js**: Create Master Templates in Lucid via MCP
- **create-lucid-with-zip.js**: Create a REAL populated Lucid diagram using proper Standard Import format
- **create-master-templates-lucid.js**: Create Master Templates in Lucidchart
- **create-master-templates.js**: No description available
- **create-populated-lucid-diagram.js**: CREATE POPULATED LUCID DIAGRAM - WITH ACTUAL SHAPES AND CONTENT
- **create-real-lucid-diagram.js**: CREATE REAL LUCID DIAGRAM - ACTUAL PROOF
- **create-real-master-templates.js**: Create Real Master Templates in Lucidchart
- **create-report-safe.js**: Safe Report Creation Script
- **create-wedgewood-tasks.js**: Create Asana Tasks for Wedgewood Production Salesforce Work (2025-09-30)
- **dashboard-refresh-system.js**: Automated Dashboard Refresh System
- **deployment-verifier.js**: Deployment Verification Script
- **diagnostic-mcp-connectivity.js**: Diagnostic Script: MCP Connectivity and Salesforce Validation
- **discover-task-report-type.js**: Discover Task/Activity Report Types
- **enrich-leads-with-gov-classification.js**: Salesforce Lead/Contact Government Classification Enrichment
- **example-with-project-validation.js**: Example Script with Project Structure Validation
- **false-positive-regression-tests.js**: No description available
- **field-deployment-validator.js**: Field Deployment Validator
- **field-verification-service.js**: Field Verification Service
- **first-run-wizard.js**: First-Run Setup Wizard for ClaudeSFDC
- **fix-soql-query.js**: Quick SOQL Query Fixer
- **generate-agent-prompts.js**: No description available
- **generate-automation-package.js**: No description available
- **gong-dashboard-enhancer.js**: Gong Dashboard Enhancer
- **gong-formula-library.js**: Gong Formula Library
- **gong-list-view-generator.js**: Gong List View Generator
- **gong-report-builder.js**: Gong Report Builder
- **integrate-gates-to-agents.js**: Batch Gate Integration Script
- **lucid-create-test-diagrams.js**: No description available
- **lucid-create.js**: No description available
- **mcp-validation-framework.js**: MCP Validation Framework
- **monitor-agent-responses.js**: Agent Response Monitor
- **monitor-bulk-job.js**: Quick job monitoring script
- **monitoring-dashboard.js**: Monitoring Dashboard for New Salesforce Operation Tools
- **object-analysis-engine.js**: Salesforce Object Analysis Engine
- **object-audit.js**: No description available
- **renewal-audit-2025-fixed.js**: Comprehensive RevOps Audit: Closed Won Renewal Opportunities 2025
- **renewal-audit-2025.js**: Comprehensive RevOps Audit: Closed Won Renewal Opportunities 2025
- **repair-dashboard-report-summaries.js**: No description available
- **report-api-diagnostic.js**: Report API Diagnostic Tool
- **report-creation-validator.js**: Report Creation Validator
- **report-dashboard-format-audit.js**: Report Dashboard Format Audit
- **report-type-resolver.js**: Report Type Resolver
- **report-workarounds.js**: Salesforce Report API Workarounds
- **route-and-validate.js**: Route and Validate - Integrated Workflow
- **salesforce-id-verifier.js**: Salesforce ID Verification Utility
- **scrape-sf-connected-apps.js**: Salesforce Connected Apps Scraper
- **scrape-sf-cpq-pricing-config.js**: Salesforce CPQ Pricing Configuration Scraper
- **scrape-sf-permission-assignments.js**: Salesforce Permission Set Assignments Scraper
- **scrape-sf-setup-audit-trail.js**: Salesforce Setup Audit Trail Scraper
- **send-slack-notification.js**: Slack Release Notification Script v2.0
- **setup-lucid-templates.js**: Setup Lucid Templates
- **sfdc-activity-query.js**: No description available
- **sfdc-activity-reports.js**: No description available
- **sfdc-pre-deployment-validator.js**: Salesforce Pre-Deployment Validator
- **smoke.js**: No description available
- **soql-query-builder.js**: SOQL Query Builder for Salesforce MCP Tools
- **soql-query-rewriter.js**: SOQL Query Rewriter
- **soql-report-converter.js**: SOQL Report Converter
- **soql-validator.js**: SOQL Validation Pre-Processor
- **submit-validator-feedback.js**: Interactive Validator Feedback Submission
- **sync-disallowed-tools.js**: Sync disallowedTools to tools field
- **test-agent-runbook-references.js**: Flow XML Development Runbooks - Agent Reference Test
- **test-auto-bootstrap.js**: Test Auto-Bootstrap Template System
- **test-context-loading.js**: Flow XML Development Runbooks - Context Loading Test
- **test-date-fix.js**: Test script to demonstrate date formatting fix for SOQL queries
- **test-diagram-creation.js**: No description available
- **test-frontend-audit-v2.js**: Test Script for Frontend Audit v2 Improvements
- **test-improvements.js**: Simplified Test for Frontend Audit Improvements
- **test-lucid-creation.js**: Test script to create a Lucid diagram using the integration
- **test-lucid-import.js**: Test Lucid Standard Import with Salesforce Data
- **test-lucid-integration.js**: Lucid Integration Test Suite
- **test-lucid-real-creation.js**: Real Lucid Integration Test
- **test-lucid-sfdc-objects.js**: Test Script: Create Lucid Documents for SFDC Objects
- **test-lucid-with-real-api.js**: Test Lucid Integration with Real API
- **test-new-tenant-bootstrap.js**: Test Auto-Bootstrap for New Tenant
- **test-report-validation.js**: Report Validation Test Suite
- **test-universal-report.js**: Universal Report Creation Test
- **tool-inventory.js**: Tool Inventory System
- **unified-syntax-validator.js**: Unified Syntax Validator for Salesforce Deployments
- **update-agent-date-context.js**: Update Agent Date Context
- **update-assignee-mcp.js**: No description available
- **update-task-assignee.js**: No description available
- **validate-asana-compliance.js**: Asana Compliance Validator
- **validate-organization.js**: Organization Validation Script
- **validate-phase4-automation.js**: Phase 4 Automation Validation Script
- **validate-playbook-usage.js**: Playbook Usage Validator
- **validate-runbook-content.js**: Flow XML Development Runbooks - Content Validator
- **validation-first-creator.js**: Validation-First Report Creator
- **verify-integration-points.js**: Flow XML Development Runbooks - Integration Point Verification
- **verify-master-templates.js**: Verify Master Templates Configuration
- **verify-workflow-migration.js**: Verify Workflow Migration
- **webhook-alerting.js**: Webhook Alerting Layer
- **week-1-test-runner.js**: Week 1 Test Scenario Runner

### Commands
- **/activate-flows**: # Activate Salesforce Flows
- **/analyze-layout**: # Analyze Salesforce Layout Quality
- **/asana-link**: # Link Asana Projects to Current Directory
- **/asana-update**: # Update Asana Tasks from Local Work
- **/assess-permissions**: # Permission Set Assessment
- **/audit-automation**: Run a complete automation inventory and conflict analysis audit on the specified Salesforce org.
- **/audit-reports**: # Reports & Dashboards Usage Audit
- **/checkdependencies**: # Check Plugin Dependencies
- **/context7-status**: Check the status of Context7 integration for Salesforce project:
- **/cpq-preflight**: # /cpq-preflight - CPQ Pre-Flight Validation
- **/create-permission-set**: # Create Permission Set Command
- **/create-trigger**: # Create Trigger Command
- **/create-validation-rule**: # Create Validation Rule Command
- **/dedup**: # Salesforce Account Deduplication Command
- **/deploy-report-template**: # Deploy Report Template
- **/design-layout**: # Design Salesforce Layout
- **/diff-runbook**: # Diff Operational Runbook
- **/flow-add**: Add a new element to a Salesforce Flow using natural language instructions, with optional segment-aware complexity tracking and budget warnings.
- **/flow-diagnose**: Run comprehensive diagnostic workflows that orchestrate multiple testing modules to provide complete Flow validation, execution testing, and coverage analysis.
- **/flow-interactive-build**: # /flow-interactive-build - Interactive Segment-by-Segment Flow Building
- **/flow-logs**: Retrieve and parse Salesforce debug logs to extract Flow execution details, identify errors, and analyze performance characteristics.
- **/flow-preflight**: Run comprehensive pre-flight validation checks on a Salesforce Flow before execution or deployment to production.
- **/flow-segment-complete**: Complete the current active segment in a Salesforce Flow, performing comprehensive validation against template rules, anti-patterns, and complexity constraints.
- **/flow-segment-list**: List all segments in a Salesforce Flow, showing completion status, complexity distribution, and flow-level recommendations for segment organization.
- **/flow-segment-start**: Start a new segment in a Salesforce Flow to enable incremental, complexity-aware development. This command uses the Flow Segmentation System (Phase 1-2) to break large flows into manageable logical units.
- **/flow-segment-status**: Display real-time status of the current active segment or all segments in a Salesforce Flow, including complexity tracking, budget usage, and recommendations.
- **/flow-test**: Execute a Salesforce Flow with test data and capture comprehensive execution results including state changes, debug logs, and performance metrics.
- **/generate-runbook**: # Generate Operational Runbook
- **/initialize**: # Initialize Project
- **/playwright-test**: Test Playwright integration for Salesforce:
- **/q2c-audit**: Run a complete Quote-to-Cash (Q2C) configuration audit with automated visualization of all CPQ/Q2C components.
- **/qa-execute**: Execute fresh QA tests against the current Salesforce org state.
- **/qa-review**: Review and analyze existing QA test reports (no test execution).
- **/reflect**: # Session Reflection & Improvement Analysis
- **/routing-help**: # Agent Routing System - Complete Guide
- **/sfpageaudit**: # Lightning Page Field Inventory Analysis
- **/suggest-agent**: Analyze the user's current task request and suggest the most appropriate specialized agent using the task-pattern-detector library.
- **/validate-approval-framework**: Run pre-deployment validation for Salesforce custom approval frameworks.
- **/validate-lwc**: Run pre-deployment validation for Lightning Web Components (LWC) to prevent field reference errors, null safety issues, and deployment failures.
- **/view-runbook**: # View Operational Runbook


## Agents

### flow-batch-operator
**Description:** Specializes in parallel batch operations on multiple Salesforce Flows with performance optimization and error aggregation

**Tools:** Read, Write, Bash, TodoWrite, Grep, Glob

---

### flow-diagnostician
**Description:** Comprehensive Flow diagnostic orchestration combining pre-flight validation, execution testing, and coverage analysis to determine production readiness

**Tools:** mcp_salesforce, mcp__context7__*, Read, Write, Grep, TodoWrite, Bash

---

### flow-log-analyst
**Description:** Specializes in parsing Salesforce debug logs to extract Flow execution details, identify errors, and analyze performance characteristics

**Tools:** mcp_salesforce, mcp__context7__*, Read, Write, Grep, TodoWrite, Bash

---

### flow-segmentation-specialist
**Description:** Expert in segment-by-segment Salesforce Flow building with complexity tracking, template guidance, and anti-pattern prevention

**Tools:** Read, Write, Bash, TodoWrite

---

### flow-template-specialist
**Description:** Expert in applying and customizing Salesforce Flow templates for common automation patterns

**Tools:** Read, Write, Bash, TodoWrite

---

### flow-test-orchestrator
**Description:** Orchestrates Flow execution testing with test data management, state capture, and result analysis across all Flow types

**Tools:** mcp_salesforce, mcp__context7__*, Read, Write, Grep, TodoWrite, Bash

---

### permission-orchestrator
**Description:** Centralized permission set management with two-tier architecture, merge-safe operations, and idempotent deployments

**Tools:** Not specified

---

### permission-segmentation-specialist
**Description:** Expert in segment-by-segment permission set building with complexity tracking, template guidance, and anti-pattern prevention

**Tools:** Not specified

---

### response-validator
**Description:** Validates agent responses for plausibility, statistical accuracy, and cross-reference consistency before presenting to users. Automatically retries suspicious responses.

**Tools:** Read, Grep, Glob, Bash, Task

---

### sfdc-advocate-assignment
**Description:** Manages Customer Advocate provisioning, agency-to-account matching, and deployment directory processing with intelligent fuzzy matching

**Tools:** mcp_salesforce_data_query, mcp_salesforce_data_create, mcp_salesforce_data_update, Read, Write, TodoWrite, Bash

---

### sfdc-agent-governance
**Description:** Manages agent governance, risk assessment, approval workflows, and audit trails for autonomous Salesforce operations. Enforces permission matrix, calculates risk scores, routes approvals, and ensures compliance.

**Tools:** mcp_salesforce, Read, Write, Grep, TodoWrite, Bash

---

### sfdc-apex-developer
**Description:** Develops and manages Apex code including triggers, classes, batch jobs, test classes, and custom REST/SOAP services

**Tools:** mcp_salesforce, mcp_salesforce_apex_execute, mcp_salesforce_apex_test, mcp_salesforce_apex_coverage, mcp_salesforce_apex_deploy, mcp_salesforce_apex_create_class, mcp_salesforce_apex_create_trigger, mcp_salesforce_apex_debug_log, Read, Write, Grep, TodoWrite, Bash

---

### sfdc-apex
**Description:** APEX development, tests, and code review. Not for metadata deploy packaging.

**Tools:** Read, Write, Grep, Glob, Bash(sf:*), mcp__context7__*

---

### sfdc-api-monitor
**Description:** Monitors Salesforce API usage, generates usage reports, and provides optimization recommendations to prevent quota overages

**Tools:** Not specified

---

### sfdc-architecture-auditor
**Description:** Validates architectural decisions, enforces ADR documentation, audits standard vs. custom feature usage, and generates architecture health scores. Ensures adherence to Salesforce best practices and enterprise architecture guidelines.

**Tools:** mcp_salesforce, mcp_salesforce_metadata_describe, mcp_salesforce_metadata_retrieve, mcp_salesforce_data_query, Read, Grep, TodoWrite, Bash, Task

---

### sfdc-automation-auditor
**Description:** **v3.32.0 Enhanced** Comprehensive Salesforce automation audit with namespace detection, business process classification, cascade mapping, migration recommendations, and risk-based implementation planning. Audits Apex Triggers, Classes (with Handler pattern detection), Flows, Process Builder, Workflow Rules, and Validation Rules with 8 conflict detection rules, handler inventory, and detailed remediation roadmaps. Supports optional managed package filtering and unlimited class retrieval via pagination.

**Tools:** mcp_salesforce, mcp_salesforce_metadata_describe, mcp_salesforce_metadata_retrieve, mcp_salesforce_data_query, Read, Grep, TodoWrite, Bash, Task

---

### sfdc-automation-builder
**Description:** Creates and manages Salesforce automation including flows, process builders, workflow rules, and approval processes with proactive validation

**Tools:** mcp_salesforce, mcp__context7__*, Read, Write, Grep, TodoWrite, Bash

---

### sfdc-cli-executor
**Description:** Executes Salesforce CLI commands using OAuth authentication for metadata operations, data queries, apex execution, and org management

**Tools:** Bash, Read, Write, TodoWrite

---

### sfdc-communication-manager
**Description:** Manages Salesforce communication features including email templates, letterheads, mass email, email deliverability, and communication preferences

**Tools:** Not specified

---

### sfdc-compliance-officer
**Description:** Manages Salesforce compliance including GDPR, HIPAA, SOC, data privacy, audit trails, and regulatory requirements

**Tools:** mcp_salesforce, mcp_salesforce_user_create, mcp_salesforce_permission_assign, mcp_salesforce_sharing_rule_create, Read, Write, Grep, TodoWrite

---

### sfdc-conflict-resolver
**Description:** Specialized agent for detecting and resolving Salesforce metadata conflicts, field type incompatibilities, and deployment blockers before they cause failures

**Tools:** mcp_salesforce, mcp_salesforce_metadata_describe, mcp_salesforce_field_describe, Read, Write, Grep, TodoWrite, Bash

---

### sfdc-cpq-assessor
**Description:** Specialized agent for comprehensive Salesforce CPQ assessments with mandatory data quality checkpoints and time-series analysis

**Tools:** mcp_salesforce, mcp_salesforce_data_query, mcp__playwright__*, Read, Grep, TodoWrite, Bash, Task

---

### sfdc-cpq-specialist
**Description:** Configures Salesforce CPQ including pricing, quotes, product bundles, discount schedules, and revenue optimization

**Tools:** mcp_salesforce, mcp_salesforce_metadata_deploy, mcp_salesforce_field_create, mcp_salesforce_object_create, mcp_salesforce_flow_create, mcp__context7__*, Read, Write, Grep, TodoWrite

---

### sfdc-csv-enrichment
**Description:** Specialized agent for enriching CSV data with Salesforce IDs through intelligent fuzzy matching, validation, and error correction

**Tools:** Not specified

---

### sfdc-dashboard-analyzer
**Description:** Analyzes Salesforce dashboards and reports to extract business process definitions, enabling intelligent object migration while preserving dashboard functionality

**Tools:** mcp_salesforce, mcp_salesforce_metadata_describe, mcp_salesforce_metadata_retrieve, Read, Grep, TodoWrite, Task, Bash

---

### sfdc-dashboard-designer
**Description:** Enterprise Salesforce dashboard design specialist focused on audience-specific KPIs, visual hierarchy, chart optimization, and performance best practices

**Tools:** Read, Write, Bash, TodoWrite, Task

---

### sfdc-dashboard-migrator
**Description:** Orchestrates complete dashboard and report migration from one Salesforce object to another, preserving business logic and visualizations

**Tools:** Not specified

---

### sfdc-dashboard-optimizer
**Description:** Optimizes Salesforce dashboard layouts for performance and visual appeal, validates component compatibility, and ensures 12-column grid compliance

**Tools:** mcp_salesforce, mcp_salesforce_data_query, Read, Write, TodoWrite, Grep

---

### sfdc-data-generator
**Description:** Generates intelligent mock data for Salesforce objects with business context, maintains referential integrity, and supports volume scaling for demonstrations

**Tools:** mcp_salesforce, mcp_salesforce_data_query, mcp_salesforce_data_create, mcp_salesforce_metadata_retrieve, mcp_salesforce_object_create, mcp_salesforce_field_create, Read, Write, TodoWrite

---

### sfdc-data-operations
**Description:** Manages Salesforce data operations including imports, exports, transformations, quality analysis, and bulk operations with advanced API capabilities

**Tools:** mcp_salesforce_data_query, mcp_salesforce_data_create, mcp_salesforce_data_update, mcp_salesforce_data_delete, mcp__context7__*, Read, Write, TodoWrite, Bash

---

### sfdc-dedup-safety-copilot
**Description:** Instance-agnostic Salesforce Account deduplication safety copilot with Type 1/2 error detection and data-first survivor selection (Spec-Compliant v2)

**Tools:** Not specified

---

### sfdc-dependency-analyzer
**Description:** Analyzes dependencies between Salesforce objects, fields, and data to determine optimal execution order, identify circular dependencies, and plan sequential operations

**Tools:** mcp_salesforce, mcp_salesforce_metadata_describe, mcp_salesforce_field_describe, mcp__context7__*, Read, Grep, TodoWrite, Bash

---

### sfdc-deployment-manager
**Description:** Manages Salesforce deployments with comprehensive validation pipeline, automated error recovery, and robust verification

**Tools:** mcp_salesforce, mcp__context7__*, Read, Write, Grep, TodoWrite, Bash, Task

---

### sfdc-discovery
**Description:** Read-only Salesforce org analysis for objects, flows, permissions, and integration points. Produces findings and recommendations only.

**Tools:** mcp__salesforce-dx, Read, Grep, Glob, Bash

---

### sfdc-einstein-admin
**Description:** Configures Einstein Analytics, AI predictions, recommendation strategies, and machine learning models in Salesforce

**Tools:** mcp_salesforce, mcp_salesforce_analytics_dataset_query, mcp_salesforce_report_create, Read, Write, Grep, TodoWrite

---

### sfdc-field-analyzer
**Description:** Specialized agent for comprehensive Salesforce field metadata analysis, providing intelligent field discovery, validation rule analysis, and pre-operation validation to prevent field-related errors

**Tools:** mcp_salesforce, mcp_salesforce_data_query, mcp__context7__*, Read, Grep, TodoWrite, Bash

---

### sfdc-integration-specialist
**Description:** Manages Salesforce integrations including APIs, connected apps, external services, middleware, and real-time event streaming

**Tools:** mcp_salesforce, mcp__context7__*, Read, Write, Grep, TodoWrite, WebFetch

---

### sfdc-layout-analyzer
**Description:** Analyze Salesforce Lightning Pages and Classic Layouts for quality, performance, and UX optimization opportunities

**Tools:** Read, Bash, TodoWrite

---

### sfdc-layout-generator
**Description:** Generate optimized Salesforce Lightning Pages using proven fieldInstance pattern and AI-guided persona templates

**Tools:** Read, Write, Bash, TodoWrite

---

### sfdc-lightning-developer
**Description:** Develops Lightning Web Components (LWC), Aura components, and custom UI experiences for Salesforce applications

**Tools:** mcp_salesforce, mcp_salesforce_apex_deploy, mcp_salesforce_metadata_deploy, mcp__context7__*, Read, Write, Grep, TodoWrite, Bash

---

### sfdc-lucid-diagrams
**Description:** Creates and manages Lucid diagrams for Salesforce architectures with multi-tenant isolation and vision analysis

**Tools:** mcp_lucid, mcp_salesforce, mcp_salesforce_data_query, Read, Write, Grep, TodoWrite, Bash

---

### sfdc-merge-orchestrator
**Description:** |

**Tools:** mcp_salesforce, mcp_salesforce_metadata_deploy, mcp_salesforce_data_query, mcp_salesforce_data_update, Read, Write, Grep, TodoWrite, Task, Bash

---

### sfdc-metadata-analyzer
**Description:** Comprehensive Salesforce metadata analysis without hardcoded values - extracts validation rules, flows, layouts, and profiles dynamically

**Tools:** Task

---

### sfdc-metadata-manager
**Description:** Manages Salesforce metadata with comprehensive validation, automated error recovery, and proactive metadata integrity monitoring

**Tools:** mcp_salesforce, mcp_salesforce_metadata_deploy, mcp_salesforce_field_create, mcp_salesforce_object_create, mcp__context7__*, Read, Write, Grep, TodoWrite, Bash

---

### sfdc-metadata
**Description:** Salesforce metadata deploys (flows, layouts, permissions) and package.xml management. Not for APEX authoring.

**Tools:** mcp__salesforce-dx, Read, Grep, Glob, Bash(sf:*)

---

### sfdc-object-auditor
**Description:** Performs comprehensive metadata analysis and auditing of Salesforce objects, providing detailed insights, usage statistics, and optimization recommendations

**Tools:** mcp_salesforce, mcp_salesforce_data_query, Read, Grep, TodoWrite, ExitPlanMode

---

### sfdc-orchestrator
**Description:** Coordinates complex multi-step Salesforce operations with mandatory validation framework, advanced API tools, automated error recovery, and comprehensive performance monitoring

**Tools:** Task, mcp_salesforce, Read, Write, TodoWrite, ExitPlanMode, Bash, SlashCommand

---

### sfdc-performance-optimizer
**Description:** Optimizes Salesforce performance with advanced monitoring tools including query optimization, indexing, governor limits, storage management, and real-time system health monitoring

**Tools:** mcp_salesforce, mcp_salesforce_apex_test, mcp_salesforce_apex_debug_log, Read, Grep, TodoWrite, Bash

---

### sfdc-permission-assessor
**Description:** Interactive permission set assessment wizard - discovers fragmentation, analyzes overlap, generates migration plans, and guides consolidation

**Tools:** Read, Bash, Grep, Glob, TodoWrite, Task

---

### sfdc-permission-orchestrator
**Description:** Centralized permission set management with two-tier architecture, merge-safe operations, and idempotent deployments

**Tools:** mcp_salesforce, mcp_salesforce_metadata_deploy, mcp_salesforce_data_query, Read, Write, Grep, TodoWrite, Bash, Task

---

### sfdc-planner
**Description:** Analyzes Salesforce requirements, creates detailed implementation plans with comprehensive time estimates, performs impact analysis, and presents changes for approval before execution

**Tools:** mcp_salesforce, Read, Grep, TodoWrite, ExitPlanMode, Task

---

### sfdc-quality-auditor
**Description:** Continuous quality auditing of Salesforce metadata with health checks, drift detection, and compliance validation

**Tools:** Read, Bash, Grep, Glob, TodoWrite, Task

---

### sfdc-query-specialist
**Description:** Specialized agent for building, optimizing, and executing complex SOQL queries with advanced performance monitoring, error prevention, and real-time optimization capabilities

**Tools:** mcp_salesforce_data_query, mcp_salesforce, mcp__context7__*, Read, Write, Bash, TodoWrite

---

### sfdc-remediation-executor
**Description:** Executes remediation plans from metadata analysis with phased fixes, rollback capability, and change verification

**Tools:** Read, Write, Edit, Bash, Grep, Glob, TodoWrite, Task

---

### sfdc-renewal-import
**Description:** Specialized agent for contract renewal opportunity bulk imports with automatic validation, field mapping, and advocate integration

**Tools:** mcp_salesforce_data_query, mcp_salesforce_data_create, mcp_salesforce_data_update, Read, Write, TodoWrite, Bash

---

### sfdc-report-designer
**Description:** Enterprise Salesforce report design specialist focused on format selection, field organization, grouping strategies, and performance optimization following industry best practices

**Tools:** Read, Write, Bash, TodoWrite, Task

---

### sfdc-report-template-deployer
**Description:** Automated Salesforce report deployment from templates with 95%+ field resolution rate across different orgs

**Tools:** Read, Bash, TodoWrite

---

### sfdc-report-type-manager
**Description:** Discovers and manages Salesforce report types, maps UI names to API tokens, handles restricted types, and surfaces available fields for validation

**Tools:** mcp_salesforce, mcp_salesforce_report_type_list, mcp_salesforce_report_type_describe, mcp_salesforce_data_query, Read, Write, Bash, TodoWrite

---

### sfdc-report-validator
**Description:** Pre-validates all Salesforce report configurations before creation to prevent deployment failures, enforce best practices, and ensure data quality

**Tools:** mcp_salesforce, mcp_salesforce_report_type_list, mcp_salesforce_report_type_describe, mcp_salesforce_data_query, Read, Write, Grep, TodoWrite

---

### sfdc-reports-dashboards
**Description:** Creates and manages Salesforce reports, dashboards, analytics with advanced API capabilities, leadless/hybrid support, comprehensive validation, and intelligent org mode detection

**Tools:** mcp_salesforce, mcp_salesforce_report_type_list, mcp_salesforce_report_type_describe, mcp_salesforce_report_create, mcp_salesforce_report_clone, mcp_salesforce_report_deploy, mcp_salesforce_report_folder_create, mcp_salesforce_report_folder_list, mcp_salesforce_report_run, mcp_salesforce_data_query, mcp__context7__*, Read, Write, Grep, TodoWrite, Bash

---

### sfdc-reports-usage-auditor
**Description:** Audits Salesforce reports and dashboards over a rolling 6-month window to analyze usage patterns, classify by department, identify gaps, and generate actionable insights with integrated quality scoring

**Tools:** mcp_salesforce, mcp_salesforce_data_query, Read, Grep, TodoWrite, Bash

---

### sfdc-revops-auditor
**Description:** Performs comprehensive RevOps assessments and audits of Salesforce environments with statistical analysis, business process evaluation, and data-driven recommendations

**Tools:** mcp_salesforce_data_query, mcp_salesforce, Read, TodoWrite, Bash, Task

---

### sfdc-revops-coordinator
**Description:** Orchestrates RevOps audits, optimizations, and monitoring - acts as the conductor for all RevOps tasks

**Tools:** Task, Bash, mcp_salesforce_data_query, mcp_salesforce, mcp__playwright__*, TodoWrite, WebFetch, Read, Write

---

### sfdc-sales-operations
**Description:** Manages sales-specific Salesforce configurations including lead routing, assignment rules, sales processes, territory management, and opportunity teams

**Tools:** Not specified

---

### sfdc-security-admin
**Description:** Manages Salesforce security including profiles, permission sets, roles, sharing rules, and user provisioning with automated field permission verification

**Tools:** mcp_salesforce, mcp__playwright__*, Read, Write, Grep, TodoWrite, Bash

---

### sfdc-service-cloud-admin
**Description:** Manages Service Cloud features including Cases, Knowledge Articles, Service Console, Omni-Channel routing, and customer support operations

**Tools:** mcp_salesforce, mcp_salesforce_metadata_deploy, mcp_salesforce_field_create, mcp_salesforce_object_create, Read, Write, Grep, TodoWrite

---

### sfdc-state-discovery
**Description:** Performs comprehensive Salesforce org state discovery, metadata comparison, and drift detection between local files and actual org configuration

**Tools:** mcp_salesforce, mcp_salesforce_metadata_describe, mcp_salesforce_object_list, mcp_salesforce_field_list, mcp__playwright__*, Read, Grep, TodoWrite, Bash

---

### sfdc-ui-customizer
**Description:** Manages Salesforce UI customization including page layouts, Lightning pages, record types, list views, and user interface components

**Tools:** Not specified

---

### trigger-orchestrator
**Description:** Master orchestrator for Apex trigger operations with handler pattern architecture, bulkification validation, and comprehensive testing

**Tools:** Not specified

---

### trigger-segmentation-specialist
**Description:** Specialist agent for segmenting complex Apex trigger logic into manageable handler methods with bulkification validation and governor limit tracking

**Tools:** Not specified

---

### validation-rule-orchestrator
**Description:** Centralized validation rule management with segmented formula authoring, complexity tracking, and idempotent deployments

**Tools:** mcp_salesforce, mcp_salesforce_metadata_deploy, mcp_salesforce_data_query, Read, Write, Grep, TodoWrite, Bash, Task

---

### validation-rule-segmentation-specialist
**Description:** Expert in segment-by-segment validation rule formula authoring with complexity tracking, template guidance, and anti-pattern prevention

**Tools:** Read, Write, Bash, TodoWrite, Task

---


## Scripts

### add-custom-patterns.js
**Purpose:** Add Custom Error Patterns for Renewal Consolidation

**Usage:**
```bash
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/add-custom-patterns.js
```

---

### add-disallowed-tools-to-agents.js
**Purpose:** Add disallowedTools to Agent Definitions

**Usage:**
```bash
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/add-disallowed-tools-to-agents.js
```

---

### add-model-hints-to-agents.js
**Purpose:** Add preferredModel hints to Salesforce plugin agents

**Usage:**
```bash
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/add-model-hints-to-agents.js
```

---

### advanced-field-deployer.js
**Purpose:** Advanced Field Deployer for Salesforce

**Usage:**
```bash
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/advanced-field-deployer.js
```

---

### agent-health-monitor.js
**Purpose:** Agent Health Monitoring System

**Usage:**
```bash
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/agent-health-monitor.js
```

---

### agent-testing-framework.js
**Purpose:** Agent Testing Framework

**Usage:**
```bash
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/agent-testing-framework.js
```

---

### analyze-2025-renewals.js
**Purpose:** Comprehensive RevOps Analysis of 2025 Closed Won Renewals/Amendments

**Usage:**
```bash
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/analyze-2025-renewals.js
```

---

### analyze-automation-metadata.js
**Purpose:** No description available

**Usage:**
```bash
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/analyze-automation-metadata.js
```

---

### analyze-frontend.js
**Purpose:** Frontend Analysis CLI

**Usage:**
```bash
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/analyze-frontend.js
```

---

### analyze-validator-telemetry.js
**Purpose:** Validator Telemetry Analysis & ROI Calculation

**Usage:**
```bash
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/analyze-validator-telemetry.js
```

---

### audit-report-generator.js
**Purpose:** Salesforce Object Audit Report Generator

**Usage:**
```bash
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/audit-report-generator.js
```

---

### auto-agent-router.js
**Purpose:** Auto Agent Router - Automatic agent invocation based on patterns and complexity

**Usage:**
```bash
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/auto-agent-router.js
```

---

### check-init.js
**Purpose:** Initialization Check Script

**Usage:**
```bash
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/check-init.js
```

---

### check-progress.js
**Purpose:** Check Progress CLI Utility

**Usage:**
```bash
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/check-progress.js
```

---

### config-manager.js
**Purpose:** Configuration Manager for ClaudeSFDC

**Usage:**
```bash
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/config-manager.js
```

---

### create-accounts-contacts-diagram.js
**Purpose:** Create a Lucid diagram showing Salesforce Accounts and Contacts

**Usage:**
```bash
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/create-accounts-contacts-diagram.js
```

---

### create-activity-reports.js
**Purpose:** Create Activity/Task Reports

**Usage:**
```bash
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/create-activity-reports.js
```

---

### create-lucid-masters-mcp.js
**Purpose:** Create Master Templates in Lucid via MCP

**Usage:**
```bash
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/create-lucid-masters-mcp.js
```

---

### create-lucid-with-zip.js
**Purpose:** Create a REAL populated Lucid diagram using proper Standard Import format

**Usage:**
```bash
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/create-lucid-with-zip.js
```

---

### create-master-templates-lucid.js
**Purpose:** Create Master Templates in Lucidchart

**Usage:**
```bash
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/create-master-templates-lucid.js
```

---

### create-master-templates.js
**Purpose:** No description available

**Usage:**
```bash
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/create-master-templates.js
```

---

### create-populated-lucid-diagram.js
**Purpose:** CREATE POPULATED LUCID DIAGRAM - WITH ACTUAL SHAPES AND CONTENT

**Usage:**
```bash
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/create-populated-lucid-diagram.js
```

---

### create-real-lucid-diagram.js
**Purpose:** CREATE REAL LUCID DIAGRAM - ACTUAL PROOF

**Usage:**
```bash
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/create-real-lucid-diagram.js
```

---

### create-real-master-templates.js
**Purpose:** Create Real Master Templates in Lucidchart

**Usage:**
```bash
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/create-real-master-templates.js
```

---

### create-report-safe.js
**Purpose:** Safe Report Creation Script

**Usage:**
```bash
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/create-report-safe.js
```

---

### create-wedgewood-tasks.js
**Purpose:** Create Asana Tasks for Wedgewood Production Salesforce Work (2025-09-30)

**Usage:**
```bash
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/create-wedgewood-tasks.js
```

---

### dashboard-refresh-system.js
**Purpose:** Automated Dashboard Refresh System

**Usage:**
```bash
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/dashboard-refresh-system.js
```

---

### deployment-verifier.js
**Purpose:** Deployment Verification Script

**Usage:**
```bash
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/deployment-verifier.js
```

---

### diagnostic-mcp-connectivity.js
**Purpose:** Diagnostic Script: MCP Connectivity and Salesforce Validation

**Usage:**
```bash
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/diagnostic-mcp-connectivity.js
```

---

### discover-task-report-type.js
**Purpose:** Discover Task/Activity Report Types

**Usage:**
```bash
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/discover-task-report-type.js
```

---

### enrich-leads-with-gov-classification.js
**Purpose:** Salesforce Lead/Contact Government Classification Enrichment

**Usage:**
```bash
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/enrich-leads-with-gov-classification.js
```

---

### example-with-project-validation.js
**Purpose:** Example Script with Project Structure Validation

**Usage:**
```bash
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/example-with-project-validation.js
```

---

### false-positive-regression-tests.js
**Purpose:** No description available

**Usage:**
```bash
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/false-positive-regression-tests.js
```

---

### field-deployment-validator.js
**Purpose:** Field Deployment Validator

**Usage:**
```bash
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/field-deployment-validator.js
```

---

### field-verification-service.js
**Purpose:** Field Verification Service

**Usage:**
```bash
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/field-verification-service.js
```

---

### first-run-wizard.js
**Purpose:** First-Run Setup Wizard for ClaudeSFDC

**Usage:**
```bash
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/first-run-wizard.js
```

---

### fix-soql-query.js
**Purpose:** Quick SOQL Query Fixer

**Usage:**
```bash
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/fix-soql-query.js
```

---

### generate-agent-prompts.js
**Purpose:** No description available

**Usage:**
```bash
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/generate-agent-prompts.js
```

---

### generate-automation-package.js
**Purpose:** No description available

**Usage:**
```bash
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/generate-automation-package.js
```

---

### gong-dashboard-enhancer.js
**Purpose:** Gong Dashboard Enhancer

**Usage:**
```bash
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/gong-dashboard-enhancer.js
```

---

### gong-formula-library.js
**Purpose:** Gong Formula Library

**Usage:**
```bash
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/gong-formula-library.js
```

---

### gong-list-view-generator.js
**Purpose:** Gong List View Generator

**Usage:**
```bash
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/gong-list-view-generator.js
```

---

### gong-report-builder.js
**Purpose:** Gong Report Builder

**Usage:**
```bash
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/gong-report-builder.js
```

---

### integrate-gates-to-agents.js
**Purpose:** Batch Gate Integration Script

**Usage:**
```bash
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/integrate-gates-to-agents.js
```

---

### lucid-create-test-diagrams.js
**Purpose:** No description available

**Usage:**
```bash
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lucid-create-test-diagrams.js
```

---

### lucid-create.js
**Purpose:** No description available

**Usage:**
```bash
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lucid-create.js
```

---

### mcp-validation-framework.js
**Purpose:** MCP Validation Framework

**Usage:**
```bash
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/mcp-validation-framework.js
```

---

### monitor-agent-responses.js
**Purpose:** Agent Response Monitor

**Usage:**
```bash
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/monitor-agent-responses.js
```

---

### monitor-bulk-job.js
**Purpose:** Quick job monitoring script

**Usage:**
```bash
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/monitor-bulk-job.js
```

---

### monitoring-dashboard.js
**Purpose:** Monitoring Dashboard for New Salesforce Operation Tools

**Usage:**
```bash
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/monitoring-dashboard.js
```

---

### object-analysis-engine.js
**Purpose:** Salesforce Object Analysis Engine

**Usage:**
```bash
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/object-analysis-engine.js
```

---

### object-audit.js
**Purpose:** No description available

**Usage:**
```bash
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/object-audit.js
```

---

### renewal-audit-2025-fixed.js
**Purpose:** Comprehensive RevOps Audit: Closed Won Renewal Opportunities 2025

**Usage:**
```bash
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/renewal-audit-2025-fixed.js
```

---

### renewal-audit-2025.js
**Purpose:** Comprehensive RevOps Audit: Closed Won Renewal Opportunities 2025

**Usage:**
```bash
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/renewal-audit-2025.js
```

---

### repair-dashboard-report-summaries.js
**Purpose:** No description available

**Usage:**
```bash
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/repair-dashboard-report-summaries.js
```

---

### report-api-diagnostic.js
**Purpose:** Report API Diagnostic Tool

**Usage:**
```bash
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/report-api-diagnostic.js
```

---

### report-creation-validator.js
**Purpose:** Report Creation Validator

**Usage:**
```bash
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/report-creation-validator.js
```

---

### report-dashboard-format-audit.js
**Purpose:** Report Dashboard Format Audit

**Usage:**
```bash
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/report-dashboard-format-audit.js
```

---

### report-type-resolver.js
**Purpose:** Report Type Resolver

**Usage:**
```bash
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/report-type-resolver.js
```

---

### report-workarounds.js
**Purpose:** Salesforce Report API Workarounds

**Usage:**
```bash
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/report-workarounds.js
```

---

### route-and-validate.js
**Purpose:** Route and Validate - Integrated Workflow

**Usage:**
```bash
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/route-and-validate.js
```

---

### salesforce-id-verifier.js
**Purpose:** Salesforce ID Verification Utility

**Usage:**
```bash
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/salesforce-id-verifier.js
```

---

### scrape-sf-connected-apps.js
**Purpose:** Salesforce Connected Apps Scraper

**Usage:**
```bash
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/scrape-sf-connected-apps.js
```

---

### scrape-sf-cpq-pricing-config.js
**Purpose:** Salesforce CPQ Pricing Configuration Scraper

**Usage:**
```bash
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/scrape-sf-cpq-pricing-config.js
```

---

### scrape-sf-permission-assignments.js
**Purpose:** Salesforce Permission Set Assignments Scraper

**Usage:**
```bash
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/scrape-sf-permission-assignments.js
```

---

### scrape-sf-setup-audit-trail.js
**Purpose:** Salesforce Setup Audit Trail Scraper

**Usage:**
```bash
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/scrape-sf-setup-audit-trail.js
```

---

### send-slack-notification.js
**Purpose:** Slack Release Notification Script v2.0

**Usage:**
```bash
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/send-slack-notification.js
```

---

### setup-lucid-templates.js
**Purpose:** Setup Lucid Templates

**Usage:**
```bash
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/setup-lucid-templates.js
```

---

### sfdc-activity-query.js
**Purpose:** No description available

**Usage:**
```bash
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/sfdc-activity-query.js
```

---

### sfdc-activity-reports.js
**Purpose:** No description available

**Usage:**
```bash
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/sfdc-activity-reports.js
```

---

### sfdc-pre-deployment-validator.js
**Purpose:** Salesforce Pre-Deployment Validator

**Usage:**
```bash
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/sfdc-pre-deployment-validator.js
```

---

### smoke.js
**Purpose:** No description available

**Usage:**
```bash
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/smoke.js
```

---

### soql-query-builder.js
**Purpose:** SOQL Query Builder for Salesforce MCP Tools

**Usage:**
```bash
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/soql-query-builder.js
```

---

### soql-query-rewriter.js
**Purpose:** SOQL Query Rewriter

**Usage:**
```bash
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/soql-query-rewriter.js
```

---

### soql-report-converter.js
**Purpose:** SOQL Report Converter

**Usage:**
```bash
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/soql-report-converter.js
```

---

### soql-validator.js
**Purpose:** SOQL Validation Pre-Processor

**Usage:**
```bash
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/soql-validator.js
```

---

### submit-validator-feedback.js
**Purpose:** Interactive Validator Feedback Submission

**Usage:**
```bash
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/submit-validator-feedback.js
```

---

### sync-disallowed-tools.js
**Purpose:** Sync disallowedTools to tools field

**Usage:**
```bash
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/sync-disallowed-tools.js
```

---

### test-agent-runbook-references.js
**Purpose:** Flow XML Development Runbooks - Agent Reference Test

**Usage:**
```bash
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/test-agent-runbook-references.js
```

---

### test-auto-bootstrap.js
**Purpose:** Test Auto-Bootstrap Template System

**Usage:**
```bash
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/test-auto-bootstrap.js
```

---

### test-context-loading.js
**Purpose:** Flow XML Development Runbooks - Context Loading Test

**Usage:**
```bash
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/test-context-loading.js
```

---

### test-date-fix.js
**Purpose:** Test script to demonstrate date formatting fix for SOQL queries

**Usage:**
```bash
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/test-date-fix.js
```

---

### test-diagram-creation.js
**Purpose:** No description available

**Usage:**
```bash
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/test-diagram-creation.js
```

---

### test-frontend-audit-v2.js
**Purpose:** Test Script for Frontend Audit v2 Improvements

**Usage:**
```bash
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/test-frontend-audit-v2.js
```

---

### test-improvements.js
**Purpose:** Simplified Test for Frontend Audit Improvements

**Usage:**
```bash
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/test-improvements.js
```

---

### test-lucid-creation.js
**Purpose:** Test script to create a Lucid diagram using the integration

**Usage:**
```bash
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/test-lucid-creation.js
```

---

### test-lucid-import.js
**Purpose:** Test Lucid Standard Import with Salesforce Data

**Usage:**
```bash
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/test-lucid-import.js
```

---

### test-lucid-integration.js
**Purpose:** Lucid Integration Test Suite

**Usage:**
```bash
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/test-lucid-integration.js
```

---

### test-lucid-real-creation.js
**Purpose:** Real Lucid Integration Test

**Usage:**
```bash
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/test-lucid-real-creation.js
```

---

### test-lucid-sfdc-objects.js
**Purpose:** Test Script: Create Lucid Documents for SFDC Objects

**Usage:**
```bash
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/test-lucid-sfdc-objects.js
```

---

### test-lucid-with-real-api.js
**Purpose:** Test Lucid Integration with Real API

**Usage:**
```bash
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/test-lucid-with-real-api.js
```

---

### test-new-tenant-bootstrap.js
**Purpose:** Test Auto-Bootstrap for New Tenant

**Usage:**
```bash
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/test-new-tenant-bootstrap.js
```

---

### test-report-validation.js
**Purpose:** Report Validation Test Suite

**Usage:**
```bash
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/test-report-validation.js
```

---

### test-universal-report.js
**Purpose:** Universal Report Creation Test

**Usage:**
```bash
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/test-universal-report.js
```

---

### tool-inventory.js
**Purpose:** Tool Inventory System

**Usage:**
```bash
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/tool-inventory.js
```

---

### unified-syntax-validator.js
**Purpose:** Unified Syntax Validator for Salesforce Deployments

**Usage:**
```bash
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/unified-syntax-validator.js
```

---

### update-agent-date-context.js
**Purpose:** Update Agent Date Context

**Usage:**
```bash
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/update-agent-date-context.js
```

---

### update-assignee-mcp.js
**Purpose:** No description available

**Usage:**
```bash
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/update-assignee-mcp.js
```

---

### update-task-assignee.js
**Purpose:** No description available

**Usage:**
```bash
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/update-task-assignee.js
```

---

### validate-asana-compliance.js
**Purpose:** Asana Compliance Validator

**Usage:**
```bash
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/validate-asana-compliance.js
```

---

### validate-organization.js
**Purpose:** Organization Validation Script

**Usage:**
```bash
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/validate-organization.js
```

---

### validate-phase4-automation.js
**Purpose:** Phase 4 Automation Validation Script

**Usage:**
```bash
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/validate-phase4-automation.js
```

---

### validate-playbook-usage.js
**Purpose:** Playbook Usage Validator

**Usage:**
```bash
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/validate-playbook-usage.js
```

---

### validate-runbook-content.js
**Purpose:** Flow XML Development Runbooks - Content Validator

**Usage:**
```bash
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/validate-runbook-content.js
```

---

### validation-first-creator.js
**Purpose:** Validation-First Report Creator

**Usage:**
```bash
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/validation-first-creator.js
```

---

### verify-integration-points.js
**Purpose:** Flow XML Development Runbooks - Integration Point Verification

**Usage:**
```bash
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/verify-integration-points.js
```

---

### verify-master-templates.js
**Purpose:** Verify Master Templates Configuration

**Usage:**
```bash
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/verify-master-templates.js
```

---

### verify-workflow-migration.js
**Purpose:** Verify Workflow Migration

**Usage:**
```bash
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/verify-workflow-migration.js
```

---

### webhook-alerting.js
**Purpose:** Webhook Alerting Layer

**Usage:**
```bash
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/webhook-alerting.js
```

---

### week-1-test-runner.js
**Purpose:** Week 1 Test Scenario Runner

**Usage:**
```bash
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/week-1-test-runner.js
```

---


## Commands

### /activate-flows
# Activate Salesforce Flows

See [commands/activate-flows.md](./commands/activate-flows.md) for detailed usage.

---

### /analyze-layout
# Analyze Salesforce Layout Quality

See [commands/analyze-layout.md](./commands/analyze-layout.md) for detailed usage.

---

### /asana-link
# Link Asana Projects to Current Directory

See [commands/asana-link.md](./commands/asana-link.md) for detailed usage.

---

### /asana-update
# Update Asana Tasks from Local Work

See [commands/asana-update.md](./commands/asana-update.md) for detailed usage.

---

### /assess-permissions
# Permission Set Assessment

See [commands/assess-permissions.md](./commands/assess-permissions.md) for detailed usage.

---

### /audit-automation
Run a complete automation inventory and conflict analysis audit on the specified Salesforce org.

See [commands/audit-automation.md](./commands/audit-automation.md) for detailed usage.

---

### /audit-reports
# Reports & Dashboards Usage Audit

See [commands/audit-reports.md](./commands/audit-reports.md) for detailed usage.

---

### /checkdependencies
# Check Plugin Dependencies

See [commands/checkdependencies.md](./commands/checkdependencies.md) for detailed usage.

---

### /context7-status
Check the status of Context7 integration for Salesforce project:

See [commands/context7-status.md](./commands/context7-status.md) for detailed usage.

---

### /cpq-preflight
# /cpq-preflight - CPQ Pre-Flight Validation

See [commands/cpq-preflight.md](./commands/cpq-preflight.md) for detailed usage.

---

### /create-permission-set
# Create Permission Set Command

See [commands/create-permission-set.md](./commands/create-permission-set.md) for detailed usage.

---

### /create-trigger
# Create Trigger Command

See [commands/create-trigger.md](./commands/create-trigger.md) for detailed usage.

---

### /create-validation-rule
# Create Validation Rule Command

See [commands/create-validation-rule.md](./commands/create-validation-rule.md) for detailed usage.

---

### /dedup
# Salesforce Account Deduplication Command

See [commands/dedup.md](./commands/dedup.md) for detailed usage.

---

### /deploy-report-template
# Deploy Report Template

See [commands/deploy-report-template.md](./commands/deploy-report-template.md) for detailed usage.

---

### /design-layout
# Design Salesforce Layout

See [commands/design-layout.md](./commands/design-layout.md) for detailed usage.

---

### /diff-runbook
# Diff Operational Runbook

See [commands/diff-runbook.md](./commands/diff-runbook.md) for detailed usage.

---

### /flow-add
Add a new element to a Salesforce Flow using natural language instructions, with optional segment-aware complexity tracking and budget warnings.

See [commands/flow-add.md](./commands/flow-add.md) for detailed usage.

---

### /flow-diagnose
Run comprehensive diagnostic workflows that orchestrate multiple testing modules to provide complete Flow validation, execution testing, and coverage analysis.

See [commands/flow-diagnose.md](./commands/flow-diagnose.md) for detailed usage.

---

### /flow-interactive-build
# /flow-interactive-build - Interactive Segment-by-Segment Flow Building

See [commands/flow-interactive-build.md](./commands/flow-interactive-build.md) for detailed usage.

---

### /flow-logs
Retrieve and parse Salesforce debug logs to extract Flow execution details, identify errors, and analyze performance characteristics.

See [commands/flow-logs.md](./commands/flow-logs.md) for detailed usage.

---

### /flow-preflight
Run comprehensive pre-flight validation checks on a Salesforce Flow before execution or deployment to production.

See [commands/flow-preflight.md](./commands/flow-preflight.md) for detailed usage.

---

### /flow-segment-complete
Complete the current active segment in a Salesforce Flow, performing comprehensive validation against template rules, anti-patterns, and complexity constraints.

See [commands/flow-segment-complete.md](./commands/flow-segment-complete.md) for detailed usage.

---

### /flow-segment-list
List all segments in a Salesforce Flow, showing completion status, complexity distribution, and flow-level recommendations for segment organization.

See [commands/flow-segment-list.md](./commands/flow-segment-list.md) for detailed usage.

---

### /flow-segment-start
Start a new segment in a Salesforce Flow to enable incremental, complexity-aware development. This command uses the Flow Segmentation System (Phase 1-2) to break large flows into manageable logical units.

See [commands/flow-segment-start.md](./commands/flow-segment-start.md) for detailed usage.

---

### /flow-segment-status
Display real-time status of the current active segment or all segments in a Salesforce Flow, including complexity tracking, budget usage, and recommendations.

See [commands/flow-segment-status.md](./commands/flow-segment-status.md) for detailed usage.

---

### /flow-test
Execute a Salesforce Flow with test data and capture comprehensive execution results including state changes, debug logs, and performance metrics.

See [commands/flow-test.md](./commands/flow-test.md) for detailed usage.

---

### /generate-runbook
# Generate Operational Runbook

See [commands/generate-runbook.md](./commands/generate-runbook.md) for detailed usage.

---

### /initialize
# Initialize Project

See [commands/initialize.md](./commands/initialize.md) for detailed usage.

---

### /playwright-test
Test Playwright integration for Salesforce:

See [commands/playwright-test.md](./commands/playwright-test.md) for detailed usage.

---

### /q2c-audit
Run a complete Quote-to-Cash (Q2C) configuration audit with automated visualization of all CPQ/Q2C components.

See [commands/q2c-audit.md](./commands/q2c-audit.md) for detailed usage.

---

### /qa-execute
Execute fresh QA tests against the current Salesforce org state.

See [commands/qa-execute.md](./commands/qa-execute.md) for detailed usage.

---

### /qa-review
Review and analyze existing QA test reports (no test execution).

See [commands/qa-review.md](./commands/qa-review.md) for detailed usage.

---

### /reflect
# Session Reflection & Improvement Analysis

See [commands/reflect.md](./commands/reflect.md) for detailed usage.

---

### /routing-help
# Agent Routing System - Complete Guide

See [commands/routing-help.md](./commands/routing-help.md) for detailed usage.

---

### /sfpageaudit
# Lightning Page Field Inventory Analysis

See [commands/sfpageaudit.md](./commands/sfpageaudit.md) for detailed usage.

---

### /suggest-agent
Analyze the user's current task request and suggest the most appropriate specialized agent using the task-pattern-detector library.

See [commands/suggest-agent.md](./commands/suggest-agent.md) for detailed usage.

---

### /validate-approval-framework
Run pre-deployment validation for Salesforce custom approval frameworks.

See [commands/validate-approval-framework.md](./commands/validate-approval-framework.md) for detailed usage.

---

### /validate-lwc
Run pre-deployment validation for Lightning Web Components (LWC) to prevent field reference errors, null safety issues, and deployment failures.

See [commands/validate-lwc.md](./commands/validate-lwc.md) for detailed usage.

---

### /view-runbook
# View Operational Runbook

See [commands/view-runbook.md](./commands/view-runbook.md) for detailed usage.

---

## Dependencies

### Required CLI Tools

- **node** >=18.0.0
  - Node.js runtime for development tools
  - Check: `node --version`
  - Install: https://nodejs.org/



## Documentation

### Plugin-Specific
- [CHANGELOG](./CHANGELOG.md) - Version history
- [Agents](./agents/) - Agent source files
- [Scripts](.claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/) - Utility scripts
- [Commands](./commands/) - Slash commands

### General Documentation
- [Plugin Development Guide](../../docs/PLUGIN_DEVELOPMENT_GUIDE.md)
- [Agent Writing Guide](../../docs/AGENT_WRITING_GUIDE.md)
- [Plugin Quality Standards](../../docs/PLUGIN_QUALITY_STANDARDS.md)


## Troubleshooting

See individual agent documentation for specific troubleshooting guidance.

Common issues:
- Installation problems: Verify all dependencies are installed
- Agent not discovered: Run `/agents` to verify installation
- Permission errors: Check file permissions on scripts

## Contributing

See [CONTRIBUTING.md](../../CONTRIBUTING.md) for guidelines.

## Version History

See [CHANGELOG.md](./CHANGELOG.md) for detailed version history.

## License

MIT License - see repository LICENSE file

## Support

- **Documentation**: See `/docs` directory
- **Issues**: GitHub Issues
- **Repository**: https://github.com/RevPalSFDC/opspal-plugin-internal-marketplace

---

**Salesforce Plugin v3.50.0** - Built by RevPal Engineering
