# Runbook Catalog

Comprehensive catalog of operational runbooks organized by plugin and category.

**Total Runbooks**: 90+
**Last Updated**: 2026-01-03

---

## Salesforce Plugin

### Flow XML Development (8 runbooks)

Step-by-step guides for building, validating, and deploying Salesforce Flows via XML.

| # | Runbook | Description | Key Topics |
|---|---------|-------------|------------|
| 1 | [Authoring Flows via XML](../.claude-plugins/opspal-salesforce/docs/runbooks/flow-xml-development/01-authoring-flows-via-xml.md) | Create Flows from scratch using XML | XML scaffolding, CLI commands, element templates |
| 2 | [Designing Flows for Project Scenarios](../.claude-plugins/opspal-salesforce/docs/runbooks/flow-xml-development/02-designing-flows-for-project-scenarios.md) | Choose the right Flow pattern | 6 core templates, business patterns, use cases |
| 3 | [Tools and Techniques](../.claude-plugins/opspal-salesforce/docs/runbooks/flow-xml-development/03-tools-and-techniques.md) | Modify Flows efficiently | Template-driven, NLP modification, direct XML |
| 4 | [Validation & Best Practices](../.claude-plugins/opspal-salesforce/docs/runbooks/flow-xml-development/04-validation-and-best-practices.md) | Validate Flows before deployment | 12-stage validation, auto-fix, bulkification |
| 5 | [Testing & Deployment](../.claude-plugins/opspal-salesforce/docs/runbooks/flow-xml-development/05-testing-and-deployment.md) | Deploy Flows to production | 4 deployment strategies, testing lifecycle |
| 6 | [Monitoring, Maintenance & Rollback](../.claude-plugins/opspal-salesforce/docs/runbooks/flow-xml-development/06-monitoring-maintenance-rollback.md) | Manage Flows in production | Performance monitoring, optimization, disaster recovery |
| 7 | [Testing & Diagnostics](../.claude-plugins/opspal-salesforce/docs/runbooks/flow-xml-development/07-testing-and-diagnostics.md) | Test Flows with real data | Flow execution testing, debug log analysis |
| 8 | [Incremental Segment Building](../.claude-plugins/opspal-salesforce/docs/runbooks/flow-xml-development/08-incremental-segment-building.md) | Build complex Flows incrementally | Segmentation system, complexity budgets |

**Related Agents**: `sfdc-automation-builder`, `flow-template-specialist`, `flow-diagnostician`, `flow-batch-operator`

---

### Report API Development (9 runbooks)

Building Salesforce reports via REST API and Metadata API for all report formats.

| # | Runbook | Description | Key Topics |
|---|---------|-------------|------------|
| 1 | [Report Formats Fundamentals](../.claude-plugins/opspal-salesforce/docs/runbooks/report-api-development/01-report-formats-fundamentals.md) | Choose report format and API method | Format selection decision tree, REST vs Metadata API |
| 2 | [Tabular Reports](../.claude-plugins/opspal-salesforce/docs/runbooks/report-api-development/02-tabular-reports.md) | Create simple list reports | Column config, filters, row limits |
| 3 | [Summary Reports](../.claude-plugins/opspal-salesforce/docs/runbooks/report-api-development/03-summary-reports.md) | Create grouped reports with subtotals | Groupings, aggregates, 2,000-row limit |
| 4 | [Matrix Reports](../.claude-plugins/opspal-salesforce/docs/runbooks/report-api-development/04-matrix-reports.md) | Create cross-tabulation reports | Dual grouping, sparse grids, intersections |
| 5 | [Joined Reports - Basics](../.claude-plugins/opspal-salesforce/docs/runbooks/report-api-development/05-joined-reports-basics.md) | Understand joined report fundamentals | Multi-block architecture, common groupings |
| 6 | [Joined Reports - Advanced](../.claude-plugins/opspal-salesforce/docs/runbooks/report-api-development/06-joined-reports-advanced.md) | Build complex joined reports | Cross-block formulas, Metadata API XML |
| 7 | [Custom Report Types](../.claude-plugins/opspal-salesforce/docs/runbooks/report-api-development/07-custom-report-types.md) | Extend available report types | Creating types via API, relationships |
| 8 | [Validation & Deployment](../.claude-plugins/opspal-salesforce/docs/runbooks/report-api-development/08-validation-and-deployment.md) | Validate and deploy reports | Format-specific validation, pre-deployment checks |
| 9 | [Troubleshooting & Optimization](../.claude-plugins/opspal-salesforce/docs/runbooks/report-api-development/09-troubleshooting-optimization.md) | Fix issues and improve performance | Common API errors, performance tuning |

**Related Agents**: `sfdc-reports-dashboards`, `sfdc-report-designer`, `sfdc-report-validator`, `sfdc-report-type-manager`

---

### Validation Rule Management (8 runbooks)

Complete lifecycle for creating, testing, and deploying Salesforce validation rules.

| # | Runbook | Description | Key Topics |
|---|---------|-------------|------------|
| 1 | [Validation Rule Fundamentals](../.claude-plugins/opspal-salesforce/docs/runbooks/validation-rule-management/01-validation-rule-fundamentals.md) | Core concepts and syntax | Formula basics, error messages, conditions |
| 2 | [Designing Validation Rules for Scenarios](../.claude-plugins/opspal-salesforce/docs/runbooks/validation-rule-management/02-designing-validation-rules-for-scenarios.md) | Pattern selection for business needs | Common patterns, complex validations |
| 3 | [Tools and Techniques](../.claude-plugins/opspal-salesforce/docs/runbooks/validation-rule-management/03-tools-and-techniques.md) | Building rules efficiently | Formula builder, template library |
| 4 | [Validation and Best Practices](../.claude-plugins/opspal-salesforce/docs/runbooks/validation-rule-management/04-validation-and-best-practices.md) | Quality standards | Formula validation, error handling |
| 5 | [Testing and Deployment](../.claude-plugins/opspal-salesforce/docs/runbooks/validation-rule-management/05-testing-and-deployment.md) | Deploy rules safely | Testing strategies, deployment procedures |
| 6 | [Monitoring, Maintenance & Rollback](../.claude-plugins/opspal-salesforce/docs/runbooks/validation-rule-management/06-monitoring-maintenance-rollback.md) | Production management | Performance monitoring, rollback procedures |
| 7 | [Troubleshooting](../.claude-plugins/opspal-salesforce/docs/runbooks/validation-rule-management/07-troubleshooting.md) | Fix common issues | Error diagnosis, formula debugging |
| 8 | [Segmented Rule Building](../.claude-plugins/opspal-salesforce/docs/runbooks/validation-rule-management/08-segmented-rule-building.md) | Complex rule construction | Incremental building, complexity management |

**Related Agents**: `validation-rule-orchestrator`, `validation-rule-segmentation-specialist`

---

### Apex Trigger Development (6 runbooks)

Building robust, bulkified Apex triggers with proper testing.

| # | Runbook | Description | Key Topics |
|---|---------|-------------|------------|
| 1 | [Trigger Fundamentals](../.claude-plugins/opspal-salesforce/docs/runbooks/triggers/01-trigger-fundamentals.md) | Core trigger concepts | Events, context variables, execution order |
| 2 | [Handler Pattern Architecture](../.claude-plugins/opspal-salesforce/docs/runbooks/triggers/02-handler-pattern-architecture.md) | Recommended design patterns | Separation of concerns, testability |
| 3 | [Bulkification Best Practices](../.claude-plugins/opspal-salesforce/docs/runbooks/triggers/03-bulkification-best-practices.md) | Handle bulk operations | Collection processing, governor limits |
| 4 | [Testing & Code Coverage](../.claude-plugins/opspal-salesforce/docs/runbooks/triggers/04-testing-code-coverage.md) | Write comprehensive tests | Test patterns, coverage requirements |
| 5 | [Deployment & Monitoring](../.claude-plugins/opspal-salesforce/docs/runbooks/triggers/05-deployment-monitoring.md) | Deploy and monitor triggers | Deployment strategies, logging |
| 6 | [Troubleshooting & Optimization](../.claude-plugins/opspal-salesforce/docs/runbooks/triggers/06-troubleshooting-optimization.md) | Fix issues and optimize | Debug techniques, performance tuning |

**Related Agents**: `trigger-orchestrator`, `trigger-segmentation-specialist`, `sfdc-apex-developer`

---

### Territory Management (10 runbooks)

Complete Territory2 configuration, assignment, and maintenance.

| # | Runbook | Description | Key Topics |
|---|---------|-------------|------------|
| 1 | [Territory Fundamentals](../.claude-plugins/opspal-salesforce/docs/runbooks/territory-management/01-territory-fundamentals.md) | Core Territory2 concepts | Models, hierarchies, types |
| 2 | [Designing Territory Models](../.claude-plugins/opspal-salesforce/docs/runbooks/territory-management/02-designing-territory-models.md) | Model architecture planning | Hierarchy design, naming conventions |
| 3 | [Territory2 Object Relationships](../.claude-plugins/opspal-salesforce/docs/runbooks/territory-management/03-territory2-object-relationships.md) | Data model understanding | Object relationships, fields |
| 4 | [Hierarchy Configuration](../.claude-plugins/opspal-salesforce/docs/runbooks/territory-management/04-hierarchy-configuration.md) | Build territory hierarchies | Parent-child relationships, levels |
| 5 | [User Assignment Strategies](../.claude-plugins/opspal-salesforce/docs/runbooks/territory-management/05-user-assignment-strategies.md) | Assign users to territories | Assignment rules, manual assignments |
| 6 | [Account Assignment Patterns](../.claude-plugins/opspal-salesforce/docs/runbooks/territory-management/06-account-assignment-patterns.md) | Assign accounts to territories | Assignment rules, criteria-based |
| 7 | [Testing and Validation](../.claude-plugins/opspal-salesforce/docs/runbooks/territory-management/07-testing-and-validation.md) | Test territory configuration | Validation checks, testing strategies |
| 8 | [Deployment and Activation](../.claude-plugins/opspal-salesforce/docs/runbooks/territory-management/08-deployment-and-activation.md) | Deploy territory changes | Model activation, deployment |
| 9 | [Monitoring and Maintenance](../.claude-plugins/opspal-salesforce/docs/runbooks/territory-management/09-monitoring-and-maintenance.md) | Ongoing territory management | Health monitoring, adjustments |
| 10 | [Troubleshooting Guide](../.claude-plugins/opspal-salesforce/docs/runbooks/territory-management/10-troubleshooting-guide.md) | Fix territory issues | Common problems, solutions |

**Related Agents**: `sfdc-territory-orchestrator`, `sfdc-territory-discovery`, `sfdc-territory-planner`, `sfdc-territory-deployment`, `sfdc-territory-assignment`

---

### Data Quality Operations (3 runbooks)

Ensuring data integrity and quality in Salesforce.

| # | Runbook | Description | Key Topics |
|---|---------|-------------|------------|
| 1 | [Field Population Monitoring](../.claude-plugins/opspal-salesforce/docs/runbooks/data-quality-operations/01-field-population-monitoring.md) | Track field completeness | Population rates, alerts |
| 2 | [Integration Health Checks](../.claude-plugins/opspal-salesforce/docs/runbooks/data-quality-operations/02-integration-health-checks.md) | Monitor integration data | Sync status, error detection |
| 3 | [Null Handling Patterns](../.claude-plugins/opspal-salesforce/docs/runbooks/data-quality-operations/03-null-handling-patterns.md) | Handle null values properly | Formulas, validation, defaults |

**Related Agents**: `sfdc-data-operations`, `sfdc-query-specialist`

---

### Environment Configuration (4 runbooks)

Setting up and managing Salesforce development environments.

| # | Runbook | Description | Key Topics |
|---|---------|-------------|------------|
| 1 | [System Dependencies](../.claude-plugins/opspal-salesforce/docs/runbooks/environment-configuration/01-system-dependencies.md) | Required software setup | SF CLI, Node.js, jq |
| 2 | [Path Resolution](../.claude-plugins/opspal-salesforce/docs/runbooks/environment-configuration/02-path-resolution.md) | Configure file paths | Project structure, paths |
| 3 | [MCP Configuration](../.claude-plugins/opspal-salesforce/docs/runbooks/environment-configuration/03-mcp-configuration.md) | MCP server setup | Server configuration, authentication |
| 4 | [Multi-Context Execution](../.claude-plugins/opspal-salesforce/docs/runbooks/environment-configuration/04-multi-context-execution.md) | Work across orgs | Multi-org setup, context switching |

---

### Deployment State Management (2 runbooks)

Tracking deployment state and verification.

| # | Runbook | Description | Key Topics |
|---|---------|-------------|------------|
| 1 | [Deployment Lifecycle](../.claude-plugins/opspal-salesforce/docs/runbooks/deployment-state-management/01-deployment-lifecycle.md) | Deployment phases | State tracking, phase transitions |
| 2 | [State Verification](../.claude-plugins/opspal-salesforce/docs/runbooks/deployment-state-management/02-state-verification.md) | Verify deployment state | Validation checks, rollback triggers |

**Related Agents**: `sfdc-deployment-manager`, `sfdc-state-discovery`

---

### Automation Feasibility (1 runbook)

Understanding automation limits and constraints.

| # | Runbook | Description | Key Topics |
|---|---------|-------------|------------|
| 1 | [Screen Flow Automation Limits](../.claude-plugins/opspal-salesforce/docs/runbooks/automation-feasibility/01-screen-flow-automation-limits.md) | What can/cannot be automated | Screen Flow constraints, workarounds |

---

### Assignment Rules (Template)

| Runbook | Description | Key Topics |
|---------|-------------|------------|
| [Assignment Rules Runbook Template](../.claude-plugins/opspal-salesforce/templates/runbooks/assignment-rules-runbook-template.md) | Template for org-specific runbooks | Lead/Case assignment, rule configuration |

**Related Agents**: `sfdc-assignment-rules-manager`, `sfdc-sales-operations`

---

## OpsPal Core

### n8n Workflow Automation (5 runbooks)

Managing n8n workflows for data sync and automation.

| Runbook | Description | Key Topics |
|---------|-------------|------------|
| [Data Sync Workflow](../.claude-plugins/opspal-core/runbooks/n8n/data-sync-workflow.md) | Build data sync workflows | SF-to-HS sync, bidirectional |
| [Error Handling Strategy](../.claude-plugins/opspal-core/runbooks/n8n/error-handling-strategy.md) | Handle workflow errors | Retry logic, notifications |
| [Workflow Lifecycle](../.claude-plugins/opspal-core/runbooks/n8n/workflow-lifecycle.md) | Manage workflow states | Activation, deactivation, versioning |
| [Client Onboarding](../.claude-plugins/opspal-core/runbooks/n8n/client-onboarding.md) | Onboard new clients | Setup procedures, configuration |
| [Incident Response](../.claude-plugins/opspal-core/runbooks/n8n/incident-response.md) | Respond to workflow incidents | Diagnosis, recovery, escalation |

---

### Playwright Browser Automation (8 runbooks)

Browser automation for UI testing and data capture.

| Runbook | Description | Key Topics |
|---------|-------------|------------|
| [Setup and Configuration](../.claude-plugins/opspal-core/runbooks/playwright/setup-and-configuration.md) | Configure Playwright | Browser setup, environment |
| [Page Navigation and Snapshots](../.claude-plugins/opspal-core/runbooks/playwright/page-navigation-and-snapshots.md) | Navigate and capture pages | Navigation patterns, snapshots |
| [Form Filling and Interaction](../.claude-plugins/opspal-core/runbooks/playwright/form-filling-and-interaction.md) | Automate form interactions | Input handling, submissions |
| [Screenshot Documentation](../.claude-plugins/opspal-core/runbooks/playwright/screenshot-documentation.md) | Capture screenshots | Documentation, comparison |
| [Authentication Patterns](../.claude-plugins/opspal-core/runbooks/playwright/authentication-patterns.md) | Handle authentication | Login flows, session management |
| [Salesforce UI Patterns](../.claude-plugins/opspal-core/runbooks/playwright/salesforce-ui-patterns.md) | Automate Salesforce UI | Lightning components, classic |
| [HubSpot UI Patterns](../.claude-plugins/opspal-core/runbooks/playwright/hubspot-ui-patterns.md) | Automate HubSpot UI | Portal navigation, forms |
| [UAT Browser Testing](../.claude-plugins/opspal-core/runbooks/playwright/uat-browser-testing.md) | UAT with Playwright | Test scenarios, reporting |

---

### Solution Templates (2 runbooks)

Creating and distributing solution templates.

| Runbook | Description | Key Topics |
|---------|-------------|------------|
| [Creating Solution Templates](../.claude-plugins/opspal-core/runbooks/solution-templates/01-creating-solution-templates.md) | Build reusable templates | Template structure, variables |
| [Solution Catalog Distribution](../.claude-plugins/opspal-core/runbooks/solution-templates/06-solution-catalog-distribution.md) | Distribute templates | Catalog management, versioning |

---

## Marketo Plugin

### Lead Management (2 runbooks)

Managing leads in Marketo.

| Runbook | Description | Key Topics |
|---------|-------------|------------|
| [Lead Quality Maintenance](../.claude-plugins/opspal-marketo/docs/runbooks/lead-management/lead-quality-maintenance.md) | Maintain lead quality | Data hygiene, scoring updates |
| [Bulk Operations Guide](../.claude-plugins/opspal-marketo/docs/runbooks/lead-management/bulk-operations-guide.md) | Handle bulk lead operations | Import, export, mass updates |

**Related Agents**: `marketo-lead-quality-assessor`

---

### Campaign Operations (2 runbooks)

Managing Marketo campaigns.

| Runbook | Description | Key Topics |
|---------|-------------|------------|
| [Campaign Activation Checklist](../.claude-plugins/opspal-marketo/docs/runbooks/campaign-operations/campaign-activation-checklist.md) | Pre-activation validation | Checklist items, validation |
| [Trigger Campaign Best Practices](../.claude-plugins/opspal-marketo/docs/runbooks/campaign-operations/trigger-campaign-best-practices.md) | Build trigger campaigns | Trigger setup, filters |

---

### Campaign Diagnostics (10 runbooks)

Diagnosing and resolving Marketo campaign and program issues.

| Runbook | Description | Key Topics |
|---------|-------------|------------|
| [Smart Campaigns Not Triggering](../.claude-plugins/opspal-marketo/docs/runbooks/campaign-diagnostics/01-smart-campaigns-not-triggering.md) | Trigger failures | Triggers, backlog, limits |
| [Flow Step Failures](../.claude-plugins/opspal-marketo/docs/runbooks/campaign-diagnostics/02-flow-step-failures.md) | Flow action errors | Assets, skips, sync |
| [Leads Not Progressing](../.claude-plugins/opspal-marketo/docs/runbooks/campaign-diagnostics/03-leads-not-progressing.md) | Status stagnation | Program status, success |
| [Token Resolution Failures](../.claude-plugins/opspal-marketo/docs/runbooks/campaign-diagnostics/04-token-resolution-failures.md) | Personalization issues | Tokens, context, timing |
| [Low Engagement](../.claude-plugins/opspal-marketo/docs/runbooks/campaign-diagnostics/05-low-engagement.md) | Performance decline | Opens, clicks, deliverability |
| [High Bounce or Unsubscribe Rates](../.claude-plugins/opspal-marketo/docs/runbooks/campaign-diagnostics/06-high-bounce-unsubscribe.md) | Deliverability risk | Bounces, unsubscribes |
| [Sync and API Job Failures](../.claude-plugins/opspal-marketo/docs/runbooks/campaign-diagnostics/07-sync-api-job-failures.md) | Integration disruptions | Quotas, bulk jobs |
| [Detection Strategies](../.claude-plugins/opspal-marketo/docs/runbooks/campaign-diagnostics/08-detection-strategies.md) | Proactive monitoring | Alerts, thresholds |
| [API Queries and Payloads](../.claude-plugins/opspal-marketo/docs/runbooks/campaign-diagnostics/09-api-queries-and-payloads.md) | Diagnostic templates | API calls, errors |
| [User Communication and Remediation](../.claude-plugins/opspal-marketo/docs/runbooks/campaign-diagnostics/10-user-communication-remediation.md) | Response handling | Messaging, approvals |

**Related Agents**: `marketo-campaign-diagnostician`, `marketo-automation-auditor`, `marketo-observability-orchestrator`

**Command**: `/diagnose-campaign` - Interactive troubleshooting wizard

---

### Integrations (3 runbooks)

Integrating Marketo with other systems.

| Runbook | Description | Key Topics |
|---------|-------------|------------|
| [Salesforce Sync Troubleshooting](../.claude-plugins/opspal-marketo/docs/runbooks/integrations/salesforce-sync-troubleshooting.md) | Fix SF sync issues | Common errors, diagnosis |
| [HubSpot Bridge Setup](../.claude-plugins/opspal-marketo/docs/runbooks/integrations/hubspot-bridge-setup.md) | Connect Marketo to HubSpot | Integration setup, mapping |
| [Program SFDC Campaign Sync](../.claude-plugins/opspal-marketo/docs/runbooks/integrations/program-sfdc-campaign-sync.md) | Sync programs to campaigns | Sync rules, status mapping |

---

### Performance (1 runbook)

Optimizing Marketo performance.

| Runbook | Description | Key Topics |
|---------|-------------|------------|
| [API Optimization Guide](../.claude-plugins/opspal-marketo/docs/runbooks/performance/api-optimization-guide.md) | Optimize API usage | Rate limits, batching |

---

### Assessments (1 runbook)

Conducting Marketo assessments.

| Runbook | Description | Key Topics |
|---------|-------------|------------|
| [Quarterly Audit Procedure](../.claude-plugins/opspal-marketo/docs/runbooks/assessments/quarterly-audit-procedure.md) | Quarterly health check | Audit checklist, reporting |

**Related Agents**: `marketo-analytics-assessor`

---

### Governance (4 runbooks)

Marketo instance health and governance.

| Runbook | Description | Key Topics |
|---------|-------------|------------|
| [Instance Health and Governance Foundations](../.claude-plugins/opspal-marketo/docs/runbooks/governance/01-instance-health-governance-foundations.md) | Governance controls and baselines | Audit trail, access, standards |
| [Automation and Performance Guardrails](../.claude-plugins/opspal-marketo/docs/runbooks/governance/02-automation-performance-guardrails.md) | Automation governance | Triggers vs batch, queue health |
| [Operational Workflows and Incident Response](../.claude-plugins/opspal-marketo/docs/runbooks/governance/03-operational-workflows-incident-response.md) | Operational procedures | Deployments, incidents |
| [Troubleshooting, Pitfalls, and SFDC Mapping](../.claude-plugins/opspal-marketo/docs/runbooks/governance/04-troubleshooting-pitfalls-sfdc-mapping.md) | Troubleshooting and mapping | Common issues, SFDC alignment |

---

### Programs (2 runbooks)

Building Marketo programs.

| Runbook | Description | Key Topics |
|---------|-------------|------------|
| [Webinar Campaign Launch](../.claude-plugins/opspal-marketo/docs/runbooks/programs/webinar-campaign-launch.md) | Launch webinar campaigns | Setup, promotion, follow-up |
| [Engagement Program Setup](../.claude-plugins/opspal-marketo/docs/runbooks/programs/engagement-program-setup.md) | Create engagement programs | Streams, cadence, content |

---

### Leads (2 runbooks)

Lead scoring and handoff.

| Runbook | Description | Key Topics |
|---------|-------------|------------|
| [Lead Scoring Model Setup](../.claude-plugins/opspal-marketo/docs/runbooks/leads/lead-scoring-model-setup.md) | Build scoring models | Score components, thresholds |
| [MQL Handoff Workflow](../.claude-plugins/opspal-marketo/docs/runbooks/leads/mql-handoff-workflow.md) | Automate MQL handoff | Handoff criteria, routing |

---

### Email (1 runbook)

Email campaign execution.

| Runbook | Description | Key Topics |
|---------|-------------|------------|
| [Email Blast Execution](../.claude-plugins/opspal-marketo/docs/runbooks/email/email-blast-execution.md) | Execute email campaigns | Sending, scheduling, tracking |

**Related Agents**: `marketo-email-deliverability-auditor`

---

## Quick Reference by Task

| Task | Plugin | Runbook Category |
|------|--------|------------------|
| Build a Flow | Salesforce | Flow XML Development |
| Create a report | Salesforce | Report API Development |
| Create validation rule | Salesforce | Validation Rule Management |
| Build Apex trigger | Salesforce | Apex Trigger Development |
| Configure territories | Salesforce | Territory Management |
| Set up n8n workflows | Cross-Platform | n8n Workflow Automation |
| Automate browser tests | Cross-Platform | Playwright Browser Automation |
| Manage Marketo leads | Marketo | Lead Management |
| Launch Marketo campaigns | Marketo | Campaign Operations |
| Diagnose Marketo campaigns | Marketo | Campaign Diagnostics |
| Integrate Marketo | Marketo | Integrations |

---

## Contributing

To add or update runbooks:

1. Follow the established format in existing runbooks
2. Place in appropriate plugin's `docs/runbooks/` directory
3. Update this catalog with new entries
4. Run `/reflect` to capture the addition

---

**Maintained By**: RevPal Engineering
**Repository**: https://github.com/RevPalSFDC/opspal-plugin-internal-marketplace
