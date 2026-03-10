# Plugin Suite Catalog

> Auto-generated. Do not edit manually.
> Generated from the tracked runtime plugin source tree.

## Summary

| Metric | Count |
|--------|-------|
| Plugins | 9 |
| Agents | 278 |
| Commands | 245 |
| Skills | 154 |
| Hooks | 155 |
| Scripts | 1766 |

## Regeneration

- Refresh docs: `npm run docs:generate`
- Check docs drift: `npm run docs:check`
- Run full docs gates: `npm run docs:ci`

## Related Artifacts

- Ownership and lifecycle matrix: `docs/PLUGIN_OWNERSHIP_AND_LIFECYCLE.md`
- Deprecation policy: `docs/PLUGIN_DEPRECATION_POLICY.md`

## Plugin Matrix

| Plugin | Version | Status | Agents | Mandatory Agents | Commands | Skills | Hooks | Scripts |
|--------|---------|--------|--------|------------------|----------|--------|-------|---------|
| `opspal-ai-consult` | 1.4.4 | active | 2 | 0 | 3 | 1 | 1 | 6 |
| `opspal-core` | 2.32.1 | active | 73 | 7 | 103 | 49 | 80 | 511 |
| `opspal-data-hygiene` | 1.1.5 | deprecated | 2 | 2 | 1 | 1 | 0 | 13 |
| `opspal-gtm-planning` | 2.1.4 | active | 12 | 1 | 15 | 4 | 0 | 2 |
| `opspal-hubspot` | 3.7.15 | active | 59 | 6 | 33 | 23 | 11 | 109 |
| `opspal-marketo` | 2.6.11 | active | 30 | 25 | 30 | 17 | 20 | 35 |
| `opspal-mcp-client` | 1.0.2 | active | 0 | 0 | 0 | 2 | 3 | 1 |
| `opspal-monday` | 1.4.5 | experimental | 6 | 0 | 1 | 3 | 0 | 3 |
| `opspal-salesforce` | 3.79.0 | active | 94 | 20 | 59 | 54 | 40 | 1086 |

## Registry

### opspal-ai-consult

- Version: `1.4.4`
- Status: `active`
- Path: `plugins/opspal-ai-consult`
- Manifest: `plugins/opspal-ai-consult/.claude-plugin/plugin.json`
- Description: Cross-model AI consultation plugin - get second opinions from Google Gemini. Features: non-interactive Gemini CLI invocation, Claude + Gemini response synthesis, alignment scoring, auto-consultation triggers, domain canonicalization for shadow duplicate detection, and ACE skill registry integration for learning from outcomes.

#### Agents

| Agent | Description | File |
|-------|-------------|------|
| `gemini-consult` | Consults Google Gemini for alternative perspectives, code review, or second opinions. Returns synthesized Claude + Ge... | `gemini-consult.md` |
| `gemini-domain-shadow-analyzer` | Resolves website domains through Gemini-based web reasoning and detects shadow duplicate company/account records acro... | `gemini-domain-shadow-analyzer.md` |

#### Commands

| Command | Args | Description | File |
|---------|------|-------------|------|
| `/gemini-consult` | `<question or topic to consult on>` | Get a second opinion from Gemini on code, architecture, or decisions | `gemini-consult.md` |
| `/gemini-domain-resolve` | `[--source csv|salesforce|hubspot|marketo|json|domains] [--input <path>|--doma...` | Resolve company websites to canonical domains with deterministic redirect checks first, then Gemini escalation for un... | `gemini-domain-resolve.md` |
| `/gemini-link` | `[--check | --setup | --test "prompt"]` | Set up and verify Gemini CLI connection for cross-model consultation | `gemini-link.md` |

#### Skills

| Skill | Description | File |
|-------|-------------|------|
| `consultation-escalation-and-ace-logging-framework` | Use post-tool hooks to trigger consultation escalation and log consultation outcomes into ACE learning registry. | `consultation-escalation-and-ace-logging-framework/SKILL.md` |

#### Hooks

- `post-tool-use-consultation-check` (`post-tool-use-consultation-check.sh`): Post-Tool-Use Consultation Check Hook

---

### opspal-core

- Version: `2.32.1`
- Status: `active`
- Path: `plugins/opspal-core`
- Manifest: `plugins/opspal-core/.claude-plugin/plugin.json`
- Description: OpsPal Core - Cross-platform pipeline orchestration with parallel execution, environment preflight & self-healing, offline PPTX/PDF generation, diagrams (Mermaid/Lucid), Google Slides, Asana integration, task scheduling, sub-agent routing, ACE self-learning, project intake system, RevOps data quality governance, cross-platform HubSpot+Salesforce deduplication, NotebookLM client knowledge bases, LLM-ready field dictionaries, Supabase credential validation, Gong conversation intelligence (deal risk, competitive tracking, CRM sync), Fireflies.ai meeting intelligence (transcript sync, action items, engagement insights), and task retry helper with circuit breaker. 69 agents.

#### Agents

| Agent | Description | File |
|-------|-------------|------|
| `account-expansion-orchestrator` | Identifies and scores cross-sell/upsell opportunities for existing customers. Calculates expansion ROI and prioritize... | `account-expansion-orchestrator.md` |
| `alert-streaming-manager` | Manages push-based alert delivery with intelligent grouping, multi-channel routing (Slack, email, SMS, webhooks), con... | `alert-streaming-manager.md` |
| `asana-task-manager` | Use PROACTIVELY for Asana-Salesforce integration. Syncs tasks bidirectionally with time tracking and project coordina... | `asana-task-manager.md` |
| `autofix-agent` | Headless fixer agent that implements a specific fix from a reflection analysis, runs tests, and commits if passing. U... | `autofix-agent.md` |
| `benchmark-research-agent` | **DEPRECATED** - Use opspal-salesforce:benchmark-research-agent instead. This duplicate will be removed in a future r... | `benchmark-research-agent.md` |
| `bugfix-hypothesis-agent` | Analyze bug reports to generate 3 ranked hypotheses with root causes, fix descriptions, and affected files. Analysis-... | `bugfix-hypothesis-agent.md` |
| `client-notebook-orchestrator` | High-level orchestration for client knowledge bases. Handles new client onboarding, content generation (briefings, po... | `client-notebook-orchestrator.md` |
| `compensation-calculator` | Sales rep commission calculator with real-time deal calculations, YTD tracking, and what-if simulations. Integrates w... | `compensation-calculator.md` |
| `contact-dedup-orchestrator` | **DEPRECATED** - Use opspal-data-hygiene:contact-dedup-orchestrator instead. This duplicate will be removed in a futu... | `contact-dedup-orchestrator.md` |
| `conversation-intelligence-aggregator` | Unified conversation intelligence across Gong and Fireflies.ai. Merges call and meeting data from both platforms, ded... | `conversation-intelligence-aggregator.md` |
| `cross-platform-pipeline-orchestrator` | Orchestrates parallel cross-platform operations across Salesforce, HubSpot, Asana, and Marketo - builds DAGs, spawns ... | `cross-platform-pipeline-orchestrator.md` |
| `cs-operations-orchestrator` | Customer Success operations automation including QBR generation, health-score-driven interventions, and renewal forec... | `cs-operations-orchestrator.md` |
| `data-migration-orchestrator` | Orchestrates data migrations between platforms with validation. Handles field mapping, transformation, and verificati... | `data-migration-orchestrator.md` |
| `diagram-generator` | MUST BE USED for diagrams, flowcharts, or ERDs. Generates Mermaid diagrams from natural language or metadata. Support... | `diagram-generator.md` |
| `environment-profile-manager` | Use PROACTIVELY for environment profile management. Manages environment profiles, parameter mappings, credentials, an... | `environment-profile-manager.md` |
| `field-dictionary-manager` | Use PROACTIVELY for field dictionary operations. Manages LLM-consumable field dictionaries that bridge technical Sale... | `field-dictionary-manager.md` |
| `fireflies-action-tracker-agent` | Read-only extraction and tracking of action items from Fireflies.ai transcripts. Surfaces meeting follow-ups, attribu... | `fireflies-action-tracker-agent.md` |
| `fireflies-integration-agent` | Integrates Fireflies.ai meeting intelligence with Salesforce and HubSpot. Manages API authentication, configuration, ... | `fireflies-integration-agent.md` |
| `fireflies-meeting-intelligence-agent` | Read-only analysis of meeting conversation health using Fireflies.ai transcript data. Surfaces engagement metrics, ta... | `fireflies-meeting-intelligence-agent.md` |
| `fireflies-sync-orchestrator` | Orchestrates Fireflies.ai-to-CRM data synchronization workflows. Handles batch transcript sync, meeting insights aggr... | `fireflies-sync-orchestrator.md` |
| `gong-competitive-intelligence-agent` | Analyzes Gong tracker data for competitive intelligence. Identifies competitor mentions, tracks trends, groups by dea... | `gong-competitive-intelligence-agent.md` |
| `gong-deal-intelligence-agent` | Read-only analysis of deal conversation health using Gong data. Surfaces risk signals, stakeholder engagement gaps, c... | `gong-deal-intelligence-agent.md` |
| `gong-integration-agent` | Integrates Gong/Chorus conversation intelligence with Salesforce and HubSpot. Syncs call recordings, transcripts, dea... | `gong-integration-agent.md` |
| `gong-sync-orchestrator` | Orchestrates Gong-to-CRM data synchronization workflows. Handles batch call sync, insights aggregation, error recover... | `gong-sync-orchestrator.md` |
| `google-slides-generator` | Use when Google Slides is explicitly requested or collaboration is required. Generates decks from templates, raw cont... | `google-slides-generator.md` |
| `implementation-planner` | Use PROACTIVELY for implementation planning. Generates Asana project plans from specs with task breakdown and agent d... | `implementation-planner.md` |
| `instance-backup` | Use PROACTIVELY for SF instance backups. Manages automated metadata, data, and configuration backups with restore cap... | `instance-backup.md` |
| `instance-deployer` | Automatically routes for SF deployments. Handles sandbox-to-production promotion and cross-instance metadata migrations. | `instance-deployer.md` |
| `instance-manager` | Use PROACTIVELY for SF instance management. Handles switching between instances and maintains configurations. | `instance-manager.md` |
| `instance-sync` | Use PROACTIVELY for SF instance sync. Synchronizes configurations, metadata, and data between environments. | `instance-sync.md` |
| `intelligent-intake-orchestrator` | Use PROACTIVELY for project intake. Classifies natural language requests, asks minimal clarifying questions, generate... | `intelligent-intake-orchestrator.md` |
| `live-wire-sync-test-orchestrator` | Automatically routes for sync testing. Orchestrates Live Wire Sync Test workflow for SF-HubSpot bidirectional validat... | `live-wire-sync-test-orchestrator.md` |
| `multi-platform-campaign-orchestrator` | Orchestrates campaigns across Salesforce, HubSpot, and Marketo. Coordinates audiences, content, and timing across pla... | `multi-platform-campaign-orchestrator.md` |
| `multi-platform-workflow-orchestrator` | Orchestrates complex workflows spanning multiple platforms. Handles sequencing, error recovery, and state management.... | `multi-platform-workflow-orchestrator.md` |
| `n8n-execution-monitor` | Use for n8n execution monitoring and debugging. Provides on-demand status checks, error analysis, and execution repor... | `n8n-execution-monitor.md` |
| `n8n-integration-orchestrator` | Use PROACTIVELY for multi-platform n8n orchestration. Designs complex cross-platform workflows involving Salesforce, ... | `n8n-integration-orchestrator.md` |
| `n8n-lifecycle-manager` | Manage n8n workflow lifecycle states including activation, deactivation, archival, scheduling, and template cloning | `n8n-lifecycle-manager.md` |
| `n8n-optimizer` | Analyze and optimize n8n workflow performance based on execution data, identifying bottlenecks and generating improve... | `n8n-optimizer.md` |
| `n8n-workflow-builder` | Use PROACTIVELY for n8n automation. Designs and creates n8n workflows from natural language specifications. Supports ... | `n8n-workflow-builder.md` |
| `notebooklm-knowledge-manager` | MUST BE USED for NotebookLM operations. Manages client knowledge bases, syncs assessment sources, and provides query ... | `notebooklm-knowledge-manager.md` |
| `outreach-integration-agent` | Integrates Outreach/SalesLoft sales engagement data with Salesforce and HubSpot. Syncs activities, sequences, meeting... | `outreach-integration-agent.md` |
| `pdf-generator` | Use PROACTIVELY for PDF generation. Converts markdown to professional PDFs with Mermaid diagrams and custom covers. | `pdf-generator.md` |
| `pipeline-intelligence-agent` | Pipeline health scoring, bottleneck detection, and deal risk assessment. Identifies at-risk deals and provides action... | `pipeline-intelligence-agent.md` |
| `platform-instance-manager` | Use PROACTIVELY for multi-platform management. Manages instances across SF, HubSpot with environment switching. | `platform-instance-manager.md` |
| `playwright-browser-controller` | Master agent for direct browser automation using Playwright MCP. Provides low-level browser control for navigation, i... | `playwright-browser-controller.md` |
| `plugin-doctor` | Use PROACTIVELY for plugin diagnostics. Identifies installation issues, validates health, and auto-submits reflections. | `plugin-doctor.md` |
| `pptx-generator` | Use PROACTIVELY for offline PPTX generation. Converts markdown to branded PowerPoint decks with embedded fonts and Me... | `pptx-generator.md` |
| `product-analytics-bridge` | Bridges product analytics platforms (Pendo, Amplitude, Mixpanel, Heap) with Salesforce and HubSpot. Syncs usage data ... | `product-analytics-bridge.md` |
| `project-connect` | Use PROACTIVELY for customer onboarding. Orchestrates project setup across Supabase, GitHub, Drive, and Asana. | `project-connect.md` |
| `realtime-dashboard-coordinator` | Coordinates real-time dashboard updates via WebSocket connections. Manages configurable refresh intervals, delta-only... | `realtime-dashboard-coordinator.md` |
| `revops-churn-risk-scorer` | Rules-based churn risk scoring with configurable signal weights. Identifies at-risk accounts through engagement drops... | `revops-churn-risk-scorer.md` |
| `revops-customer-health-scorer` | Generates composite customer health scores using rules-based weighted scoring across engagement, support, usage, paym... | `revops-customer-health-scorer.md` |
| `revops-data-quality-orchestrator` | Master orchestrator for RevOps data quality operations across CRM systems | `revops-data-quality-orchestrator.md` |
| `revops-deal-scorer` | Rules-based deal win probability scoring analyzing stage velocity, engagement patterns, ICP fit, and competitive posi... | `revops-deal-scorer.md` |
| `revops-dedup-specialist` | Specialist agent for RevOps data deduplication operations | `revops-dedup-specialist.md` |
| `revops-lead-scorer` | Rules-based lead quality scoring combining ICP firmographic fit and behavioral engagement signals. Generates MQL qual... | `revops-lead-scorer.md` |
| `revops-reporting-assistant` | MUST BE USED for RevOps report generation. Autonomous report creation with wizard mode, template matching, cross-plat... | `revops-reporting-assistant.md` |
| `sales-enablement-coordinator` | Coordinates sales enablement activities including training paths, skill gap analysis, and content recommendations. CA... | `sales-enablement-coordinator.md` |
| `sales-funnel-diagnostic` | MUST BE USED for funnel analysis or conversion diagnostics. Analyzes full pipeline with industry benchmarks, root cau... | `sales-funnel-diagnostic.md` |
| `sales-playbook-orchestrator` | Generates segment-specific sales playbooks with next-best-action recommendations. Combines deal context, customer sig... | `sales-playbook-orchestrator.md` |
| `sfdc-hubspot-dedup-orchestrator` | **DEPRECATED** - Use opspal-data-hygiene:sfdc-hubspot-dedup-orchestrator instead. This duplicate will be removed in a... | `sfdc-hubspot-dedup-orchestrator.md` |
| `solution-analyzer` | Use PROACTIVELY for reverse engineering solutions. Analyzes existing implementations to extract templatizable pattern... | `solution-analyzer.md` |
| `solution-catalog-manager` | Use PROACTIVELY for solution catalog operations. Manages the shared solution catalog including browsing, searching, p... | `solution-catalog-manager.md` |
| `solution-deployment-orchestrator` | MUST BE USED for solution deployments. Orchestrates multi-component, multi-platform deployments with checkpoint/rollb... | `solution-deployment-orchestrator.md` |
| `solution-runbook-generator` | Use PROACTIVELY for deployment documentation. Generates deployment runbooks, operational guides, and solution documen... | `solution-runbook-generator.md` |
| `solution-template-manager` | MUST BE USED for solution template management. Creates, validates, versions, and organizes solution templates with pa... | `solution-template-manager.md` |
| `task-graph-orchestrator` | Master orchestrator that decomposes complex requests into Task Graphs (DAGs) with risk-based execution, parallel sche... | `task-graph-orchestrator.md` |
| `task-scheduler` | Use PROACTIVELY for scheduling automated tasks. Manages scheduled Claude Code prompts and scripts with cron-based exe... | `task-scheduler.md` |
| `uat-orchestrator` | Use PROACTIVELY for UAT testing. Orchestrates test workflows with execution against SF/HubSpot and report generation. | `uat-orchestrator.md` |
| `ui-documentation-generator` | Specialized agent for creating visual documentation by capturing screenshots, annotating workflows, and generating do... | `ui-documentation-generator.md` |
| `unified-exec-dashboard-agent` | Generates unified executive dashboards combining data from all platforms. Creates C-level views of revenue, pipeline,... | `unified-exec-dashboard-agent.md` |
| `visual-regression-tester` | Specialized agent for visual regression testing, comparing UI states before and after changes using Playwright MCP sc... | `visual-regression-tester.md` |
| `web-viz-generator` | MUST BE USED for interactive web dashboards and data visualization. Generates charts, tables, maps, gauges, and KPI c... | `web-viz-generator.md` |

#### Commands

| Command | Args | Description | File |
|---------|------|-------------|------|
| `/account-expansion` | `[--segment <name>] [--account <account-id>] [--top <n>]` | Identify and score cross-sell/upsell opportunities for existing customers | `account-expansion.md` |
| `/ace-maintenance` | `[--task health|decay|cleanup|report]` | Run ACE Framework maintenance tasks (health check, confidence decay, cache cleanup, metrics) | `ace-maintenance.md` |
| `/activate-license` | `<license-key>` | Activate an OpsPal license key on this machine to unlock encrypted premium assets | `activate-license.md` |
| `/asana-checkpoint` | `[options]` | Post intermediate progress checkpoint to Asana task | `asana-checkpoint.md` |
| `/asana-link` | `[options]` | Link Asana project(s) to current working directory (platform-agnostic) | `asana-link.md` |
| `/asana-read` | `[project-gid] [--project <name>]` | Read and parse assigned Asana tasks into agent-friendly format | `asana-read.md` |
| `/asana-update` | `[options]` | Update or create Asana tasks based on work completed in linked project (platform-agnostic) | `asana-update.md` |
| `/autofix` | `[--max-fixes N] [--dry-run] [--skip-merge] [--resume] [--verbose]` | Autonomous reflection-to-fix loop -- analyzes open reflections, implements fixes, tests, and merges automatically | `autofix.md` |
| `/automation-health` | `[--platform marketo|hubspot|salesforce|all] [--window 15m|1h|24h] [--format m...` | Show unified automation health signals across Marketo, HubSpot, Salesforce, and browser workflows | `automation-health.md` |
| `/automation-preflight` | `[--platform marketo|hubspot|salesforce] [--mode api|ui|hybrid] [--operation <...` | Run cross-platform automation preflight checks for API/UI/hybrid operations | `automation-preflight.md` |
| `/bugfix` | `<bug description> [--test-cmd <cmd>] [--files <file1,file2>] [--dry-run] [--r...` | Parallel hypothesis bug fix pipeline -- generates 3 hypotheses, tests each on its own branch, presents results | `bugfix.md` |
| `/campaign-orchestrate` | `<plan|sync|launch|status> [--campaign <name>]` | Orchestrate campaigns across Salesforce, HubSpot, and Marketo with audience sync and timing coordination | `campaign-orchestrate.md` |
| `/checkdependencies` | `[--fix] [--plugin <name>] [--verbose]` | Check and install missing npm dependencies across all plugins | `checkdependencies.md` |
| `/complexity` | `[task description]` | Assess task complexity and get decomposition recommendation without full orchestration | `complexity.md` |
| `/cs-ops` | `<qbr|health-check|renewals|interventions> [--account <id>] [--period <period>]` | Customer Success operations including QBR generation, health interventions, and renewal forecasting | `cs-ops.md` |
| `/data-health` | `[--object Account|Contact|all] [--format markdown|json|csv]` | Generate quick data quality health scorecard | `data-health.md` |
| `/data-migrate` | `plan --source hubspot --target salesforce` | Orchestrate data migrations between platforms with field mapping, validation, and rollback | `data-migrate.md` |
| `/data-quality-audit` | `[--object Account|Contact|Lead] [--scope full|quick] [--output report|actions]` | Run comprehensive data quality audit on CRM data | `data-quality-audit.md` |
| `/deactivate-license` | `[options]` | Remove OpsPal license from this machine and notify the server | `deactivate-license.md` |
| `/dedup-companies` | `[--config <path>] [--output-dir <path>] [--resume <session>]` | Execute complete Company/Account deduplication workflow between HubSpot and Salesforce | `dedup-companies.md` |
| `/deduplicate` | `[--object Account|Contact|Lead] [--mode detect|merge|both] [--threshold 80-100]` | Run deduplication workflow to identify and merge duplicate records | `deduplicate.md` |
| `/diagnose-sales-funnel` | `[options]` | Run comprehensive top-of-funnel and mid-funnel sales performance diagnostic with industry-benchmarked analysis and ac... | `diagnose-sales-funnel.md` |
| `/diagram` | `[type] [subject] [options]` | Generate Mermaid diagrams from natural language, metadata, or structured data. Supports flowcharts, ERDs, sequence di... | `diagram.md` |
| `/diff-runbook` | `baseline` | Show changes in runbook since last version or between dates | `diff-runbook.md` |
| `/enablement` | `<assess|training|content|onboard> [--rep <id>] [--segment <name>]` | Sales enablement coordination including training paths, skill gap analysis, and content recommendations | `enablement.md` |
| `/encrypt-assets` | `<subcommand> [--plugin <name>] [--file <path>]` | Manage encrypted plugin assets (key setup, encrypt, decrypt, verify, status) | `encrypt-assets.md` |
| `/enrich-data` | `[--object Account|Contact] [--fields email,title,industry] [--source auto|web...` | Trigger multi-source enrichment pipeline to fill data gaps | `enrich-data.md` |
| `/enrich-field-dictionary` | `acme-corp` | Interactive workflow to add business context to field dictionary entries | `enrich-field-dictionary.md` |
| `/envcheck` | `[--fix] [--platform <sf|hs|mk|asana|gh>] [--quick] [--json]` | Run environment health checks across all platforms with optional auto-fix | `envcheck.md` |
| `/exec-dashboard` | `[--template <name>] [--period <period>] [--format web|pdf|json]` | Generate unified executive dashboards combining metrics from all platforms | `exec-dashboard.md` |
| `/finishopspalupdate` | `[--skip-fix] [--verbose] [--no-cache-prune]` | Run post-update validation, routing health checks, cache prune, and documentation sync | `finishopspalupdate.md` |
| `/fireflies-action-items` | `[--period 7d|30d] [--assignee <name>] [--status open|overdue|completed|all] [...` | Extract and track action items from Fireflies transcripts | `fireflies-action-items.md` |
| `/fireflies-auth` | `[validate|check|status]` | Configure or verify Fireflies authentication and API budget status | `fireflies-auth.md` |
| `/fireflies-insights` | `[--period 30d|90d] [--pipeline <name>] [--min-amount <number>] [--participant...` | Analyze Fireflies meeting data for health, engagement, and risk signals | `fireflies-insights.md` |
| `/fireflies-sync` | `[--mode calls|insights] [--since 7d|24h|30d] [--target salesforce|hubspot] [-...` | Sync Fireflies transcripts to CRM (Salesforce or HubSpot) | `fireflies-sync.md` |
| `/generate-client-briefing` | `<org-alias> [type] [period]` | Generate executive briefing from client's NotebookLM knowledge base | `generate-client-briefing.md` |
| `/generate-field-dictionary` | `acme-corp --sf-alias acme-prod` | Generate a field dictionary skeleton from Salesforce and/or HubSpot metadata caches | `generate-field-dictionary.md` |
| `/generate-pdf` | `[input-pattern] [output.pdf] [options]` | Convert markdown documents to professional PDFs with diagram rendering, multi-document collation, and table of contents | `generate-pdf.md` |
| `/generate-pptx` | `[input.md|glob] [output.pptx] [--title <text>] [--org <name>] [--profile <exe...` | Generate an offline PPTX deck from markdown with RevPal branding and embedded fonts | `generate-pptx.md` |
| `/generate-report` | `--type <type> --org <org> --file <path> [--title <title>] [--bluf] [--profile...` | Generate a professional PDF report from markdown content using the centralized ReportService | `generate-report.md` |
| `/generate-runbook` | `[options]` | Generate or update operational runbook from observations and reflections | `generate-runbook.md` |
| `/gong-auth` | `[validate|check|status]` | Validate and manage Gong API credentials | `gong-auth.md` |
| `/gong-competitive-intel` | `[--period 2026-Q1|90d] [--competitors 'A,B,C'] [--output <path>]` | Generate competitive intelligence report from Gong tracker data | `gong-competitive-intel.md` |
| `/gong-risk-report` | `[--pipeline <name>] [--min-amount <n>] [--output <path>]` | Analyze open deals for conversation-based risk signals from Gong data | `gong-risk-report.md` |
| `/gong-sync` | `[--mode calls|insights] [--since 24h|7d] [--target salesforce|hubspot] [--dry...` | Sync Gong conversation data to Salesforce Events or HubSpot Engagements | `gong-sync.md` |
| `/healthcheck-hooks` | `[--quick] [--verbose] [--format json|markdown] [--save] [--watch [interval_ms]]` | Run comprehensive hook system diagnostics with silent failure detection | `healthcheck-hooks.md` |
| `/initialize` | `[--project-dir=<path>] [--force]` | Initialize project structure with folders, CLAUDE.md, and .gitignore based on installed plugins | `initialize.md` |
| `/intake` | `[request description] [--json] [--plan-only] [--project-gid <gid>] [--workspa...` | Classify a request, generate an implementation plan, and create Asana tasks from natural language | `intake.md` |
| `/intake-generate-form` | `[--output <path>] [--project-type <type>]` | Generate an HTML intake form for project specifications | `intake-generate-form.md` |
| `/license-canary` | `[--expect-tier <starter|professional|enterprise|trial>] [--license-key <key>]...` | Validate the live license handshake and scoped key bundle on this machine | `license-canary.md` |
| `/license-status` | `[options]` | Show current OpsPal license status, tier, and asset access breakdown | `license-status.md` |
| `/live-wire-sync-test` | `--account-selectors \"001XXXXX,domain:acme.com\" --sla-seconds 300 --dry-run` | Test bidirectional sync between Salesforce and HubSpot using probe fields | `live-wire-sync-test.md` |
| `/match-domain` | `[options]` | Match data with domain-aware abbreviation expansion | `match-domain.md` |
| `/migrate-schema` | `[--find-stragglers] [--dry-run] [--only-org <slug>]` | Migrate instance data from system-centric to client-centric folder structure | `migrate-schema.md` |
| `/n8n-lifecycle` | `<action> [workflow-id] [options]` | Manage n8n workflow lifecycle (activate, deactivate, status, execute) | `n8n-lifecycle.md` |
| `/n8n-optimize` | `<workflow-id> [--quick] [--json]` | Analyze n8n workflow performance and generate optimization recommendations | `n8n-optimize.md` |
| `/n8n-status` | `[--workflows] [--executions] [--health]` | Check n8n connection status and display workflow summary | `n8n-status.md` |
| `/notebook-init` | `eta-corp` | Create a new NotebookLM notebook for a client org or project | `notebook-init.md` |
| `/notebook-query` | `eta-corp \"What were the main CPQ findings?\"` | Query a client's NotebookLM knowledge base with natural language | `notebook-query.md` |
| `/notebook-sync` | `eta-corp ./reports/cpq-assessment.md` | Sync a file or assessment report to NotebookLM knowledge base | `notebook-sync.md` |
| `/pdf-health` | `[--verbose] [--fix]` | Check PDF generation pipeline health and diagnose issues | `pdf-health.md` |
| `/pdf-read` | `<path> [query]` | Intelligently read large PDFs using optimized page ranges. Leverages Claude Code v2.1.30+ pages parameter. | `pdf-read.md` |
| `/pipeline` | `\"<natural language request describing cross-platform operation>\"` | Run parallel cross-platform operations across Salesforce, HubSpot, Asana, and Marketo with automatic reconciliation | `pipeline.md` |
| `/pipeline-health` | `[--org <alias>] [--segment <name>] [--detailed]` | Analyze pipeline health including bottlenecks, deal risk, and coverage metrics | `pipeline-health.md` |
| `/plan-from-spec` | `<spec_file> [--project-id <gid>] [--execute] [--dry-run]` | Parse specification document and generate executable Asana project plan | `plan-from-spec.md` |
| `/plugindr` | `--verbose` | Run comprehensive plugin system diagnostics and health checks | `plugindr.md` |
| `/pluginupdate` | `[--plugin <name>] [--check-only] [--fix] [--verbose]` | Run post-installation and post-update tasks for all installed plugins | `pluginupdate.md` |
| `/project-connect` | `[options]` | Set up or connect to customer project across GitHub, Google Drive, and Asana | `project-connect.md` |
| `/query-field-dictionary` | `acme-corp Amount` | Query field dictionary by name, tag, audience, or free-text search | `query-field-dictionary.md` |
| `/reflect` | `[options]` | Analyze session for errors, feedback, and generate improvement playbook | `reflect.md` |
| `/review-queue` | `[--action list|approve|reject|bulk] [--type merge|enrichment|correction]` | Process pending data quality actions from the review queue | `review-queue.md` |
| `/route` | `[your task description]` | Analyze task and recommend the optimal agent with confidence score and routing explanation | `route.md` |
| `/routing-compliance` | `[stats|recent|rate]` | Display routing compliance statistics and analyze agent utilization patterns | `routing-compliance.md` |
| `/routing-health` | `[options]` | Check the health and status of the automatic agent routing system | `routing-health.md` |
| `/sales-playbook` | `[segment] [--deal <id>] [--org <alias>]` | Generate segment-specific sales playbooks with next-best-action recommendations | `sales-playbook.md` |
| `/schedule-add` | `[--name=NAME --type=TYPE --schedule=CRON --prompt=PROMPT|--command=CMD]` | Add a new scheduled task (Claude prompt or script) to run on a cron schedule | `schedule-add.md` |
| `/schedule-disable` | `<task-id>` | Disable a scheduled task without removing it | `schedule-disable.md` |
| `/schedule-enable` | `<task-id>` | Enable a disabled scheduled task | `schedule-enable.md` |
| `/schedule-list` | `[--enabled | --disabled | --json]` | List all scheduled tasks with their status and schedule | `schedule-list.md` |
| `/schedule-logs` | `<task-id> [--limit=N] [--tail=N]` | View execution logs and history for a scheduled task | `schedule-logs.md` |
| `/schedule-remove` | `<task-id>` | Remove a scheduled task by its ID | `schedule-remove.md` |
| `/schedule-run` | `<task-id>` | Manually run a scheduled task immediately for testing | `schedule-run.md` |
| `/setup-notebooklm` | `[options]` | Setup NotebookLM MCP server authentication (first-time setup or re-auth) | `setup-notebooklm.md` |
| `/silent-failure-check` | `[--quick] [--verbose] [--days N] [--json]` | Run comprehensive silent failure detection across the plugin ecosystem | `silent-failure-check.md` |
| `/solution-catalog` | `[--search <query>] [--platform <name>] [--tag <tag>]` | Browse and search the shared solution catalog to discover available templates | `solution-catalog.md` |
| `/solution-deploy` | `<solution-name> --env <environment> [--validate-only] [--dry-run]` | Deploy a solution template to a target environment with parameter resolution | `solution-deploy.md` |
| `/solution-info` | `<solution-name> [--format text|json|markdown]` | View detailed information about a solution including components and parameters | `solution-info.md` |
| `/solution-install` | `<solution-name> [--force] [--version <version>] [--dry-run]` | Install a solution from the shared catalog to your local plugin installation | `solution-install.md` |
| `/solution-list` | `[--platform <name>] [--tag <tag>] [--format table|json|markdown]` | List available solution templates with metadata and status information | `solution-list.md` |
| `/solution-publish` | `<solution-path> [--message <message>] [--dry-run]` | Publish a local solution template to the shared catalog for distribution | `solution-publish.md` |
| `/solution-rollback` | `[--checkpoint <id>] [--deployment <id>] [--list]` | Rollback a solution deployment to a previous checkpoint state | `solution-rollback.md` |
| `/solution-validate` | `<solution-path> [--env <environment>] [--strict]` | Validate solution template structure, parameters, and dependencies without deploying | `solution-validate.md` |
| `/startopspalupdate` | `[--dry-run] [--skip-confirm] [--only plugin1,plugin2] [--history] [--verbose]...` | Force refresh marketplace and update all installed OpsPal plugins to latest versions | `startopspalupdate.md` |
| `/strategy-dashboard` | `[--category <category>] [--agent <agent>] [--json]` | View ACE Framework strategy registry overview with performance metrics | `strategy-dashboard.md` |
| `/strategy-transfer` | `<command> [options]` | ACE Framework strategy transfer operations - candidates, transfer, validate, rollback | `strategy-transfer.md` |
| `/sync-claudemd` | `[--dry-run] [--verbose] [--project-dir=<path>]` | Dynamically discover and sync plugin metadata to CLAUDE.md routing tables | `sync-claudemd.md` |
| `/task-graph` | `[task description]` | Decompose complex request into a Task Graph (DAG) with explicit dependencies, parallel execution, and verification gates | `task-graph.md` |
| `/uat-build` | `[--output <path>] [--platform salesforce|hubspot] [--format csv|json]` | Interactively build UAT test cases through guided questions | `uat-build.md` |
| `/uat-run` | `<csv-file> [options]` | Execute UAT tests from CSV workbooks against Salesforce or HubSpot, with automated step execution, context management... | `uat-run.md` |
| `/view-runbook` | `[workflows|exceptions|recommendations]` | View operational runbook for a Salesforce instance | `view-runbook.md` |
| `/viz` | `template create sales-pipeline --demo` | Generate interactive web dashboards with charts, tables, maps, and pre-built templates | `viz.md` |
| `/work-index` | `<subcommand> [options]` | Manage client work request index for project memory | `work-index.md` |
| `/workflow-orchestrate` | `<create|execute|status|rollback> [--workflow <id>] [--input <json>]` | Orchestrate complex workflows spanning multiple platforms with sequencing and error recovery | `workflow-orchestrate.md` |

#### Skills

| Skill | Description | File |
|-------|-------------|------|
| `agent-scoped-mcp-loading-framework` | Configure and troubleshoot agent-scoped MCP loading hooks for selective server activation. | `agent-scoped-mcp-loading-framework/SKILL.md` |
| `asana-integration-playbook` | Asana project management integration patterns and best practices. Use when creating Asana tasks, posting updates, rea... | `asana-integration-playbook/SKILL.md` |
| `batch-operation-advisory-framework` | Use advisory hooks to steer large data operations toward efficient batch-capable agent patterns. | `batch-operation-advisory-framework/SKILL.md` |
| `client-centric-migration` | Migrate instance data from system-centric (instances/{platform}/{org}/) to client-centric (orgs/{org}/platforms/{plat... | `client-centric-migration/SKILL.md` |
| `context-budget-guardrails-framework` | Implement hook-level context budget controls to prevent quality degradation at high token utilization. | `context-budget-guardrails-framework/SKILL.md` |
| `core-fireflies-workflow-framework` | Standardize Fireflies transcript sync, action extraction, and QA workflows for reliable operations. | `core-fireflies-workflow-framework/SKILL.md` |
| `core-gong-intelligence-operations` | Operational framework for Gong sync quality, intelligence extraction, and downstream reliability checks. | `core-gong-intelligence-operations/SKILL.md` |
| `core-n8n-deployment-lifecycle-skill` | Manage n8n workflow promotion lifecycle with validation gates, environment diffing, and rollback readiness. | `core-n8n-deployment-lifecycle-skill/SKILL.md` |
| `cross-plugin-coupling-detector` | Map cross-plugin dependencies in scripts/hooks and surface high-risk coupling edges. | `cross-plugin-coupling-detector/SKILL.md` |
| `evidence-capture-packager` | Package operational evidence artifacts into a review-ready bundle with index and retention metadata. | `evidence-capture-packager/SKILL.md` |
| `file-catalog-patterns` | Standard patterns for file catalog generation across source platforms (Monday.com, Airtable, Notion, etc.) for CRM in... | `file-catalog-patterns/SKILL.md` |
| `hook-context-pruning-patterns` | Design deterministic context trimming for hooks to prevent oversized prompt injection and degraded routing quality. | `hook-context-pruning-patterns/SKILL.md` |
| `hook-decision-contract-enforcer` | Standardize hook decision envelopes and exit-code semantics across policy enforcement paths. | `hook-decision-contract-enforcer/SKILL.md` |
| `hook-event-coverage-auditor` | Audit hook event registrations against implemented scripts and identify undercovered lifecycle events. | `hook-event-coverage-auditor/SKILL.md` |
| `hook-matcher-regex-migrator` | Validate and migrate fragile hook matcher patterns to robust regex forms with compatibility notes. | `hook-matcher-regex-migrator/SKILL.md` |
| `hook-observability-standardizer` | Standardize hook logging, telemetry fields, and health checks across plugin ecosystems. | `hook-observability-standardizer/SKILL.md` |
| `hook-path-boundary-enforcer` | Detect and prevent cross-plugin hook path coupling and boundary violations in configs and scripts. | `hook-path-boundary-enforcer/SKILL.md` |
| `hook-payload-budget-guard` | Apply input payload byte budgets for hook stdin/tool args with consistent warn/block handling. | `hook-payload-budget-guard/SKILL.md` |
| `hook-payload-canonicalizer` | Canonicalize reconstructed hook payloads to avoid regex-induced JSON corruption in shell flows. | `hook-payload-canonicalizer/SKILL.md` |
| `hook-rollout-and-canary-manager` | Roll out hook changes safely using phased canaries, rollback thresholds, and success gates. | `hook-rollout-and-canary-manager/SKILL.md` |
| `hook-shell-safety-hardener` | Harden shell-based hooks with strict mode, bounded external calls, and deterministic failure behavior. | `hook-shell-safety-hardener/SKILL.md` |
| `hooks-health` | Run a comprehensive health check of the Claude Code hook system. | `hooks-health/SKILL.md` |
| `implementation-planning-framework` | Implementation planning methodology with specification parsing, agent selection, and effort estimation. Use when crea... | `implementation-planning-framework/SKILL.md` |
| `incident-commander-checklist` | Operational incident command workflow for triage, communication, escalation, and closure evidence. | `incident-commander-checklist/SKILL.md` |
| `mermaid-diagram-reference` | Mermaid diagram syntax reference and templates for technical documentation. Use when creating flowcharts, ERD diagram... | `mermaid-diagram-reference/SKILL.md` |
| `org-claim-evidence-enforcement` | Enforce hook policies that require org-state claims to be backed by executable evidence and citations. | `org-claim-evidence-enforcement/SKILL.md` |
| `pdf-read` | Intelligently read large PDFs using page ranges. Analyzes PDF structure and returns relevant pages for queries. Uses ... | `pdf-context-optimizer/SKILL.md` |
| `plugin-scaffolding` | Templates for creating Claude Code plugin components. Use when creating new agents, hooks, commands, or scripts. Prov... | `plugin-scaffolding/SKILL.md` |
| `policy-context-normalizer` | Normalize policy-enforcement context inputs into stable schemas before routing and rule evaluation. | `policy-context-normalizer/SKILL.md` |
| `postmortem-rca-writer` | Produce consistent post-incident RCA documents with corrective actions, ownership, and prevention tracking. | `postmortem-rca-writer/SKILL.md` |
| `precommit-large-file-gate` | Implement staged-file size gates in pre-commit hooks with allowlists and actionable block messages. | `precommit-large-file-gate/SKILL.md` |
| `precommit-quality-enforcement-framework` | Enforce pre-commit hook quality gates for secrets, silent failures, mock data, and boundary violations. | `precommit-quality-enforcement-framework/SKILL.md` |
| `project-intake-framework` | Project intake methodology for gathering specifications, validating requirements, and generating runbooks. Use when s... | `project-intake-framework/SKILL.md` |
| `reflect` | Analyze session for errors, feedback, and generate improvement playbook. Use after development sessions to document p... | `reflect/SKILL.md` |
| `rollback-executor-safeguard` | Generate safe rollback execution plans with verification gates and evidence capture. | `rollback-executor-safeguard/SKILL.md` |
| `routing-governance-playbook` | Configure and tune hook-based routing governance, complexity thresholds, block modes, and override policies across co... | `routing-governance-playbook/SKILL.md` |
| `routing-noise-recovery-playbook` | Harden routing under noisy or oversized transcript context using adaptive thresholds and recovery fallbacks. | `routing-noise-recovery-playbook/SKILL.md` |
| `runbook-domain-router` | Route ambiguous operational requests to the correct domain runbooks across plugins with confidence scoring and fallba... | `runbook-domain-router/SKILL.md` |
| `runbook-linkage-linter` | Validate runbook-to-agent-to-skill linkage integrity and detect stale references before release or docs CI. | `runbook-linkage-linter/SKILL.md` |
| `runbook-policy-operations` | Operate hook-based runbook policy injection and compliance checks for operational workflows. | `runbook-policy-operations/SKILL.md` |
| `sales-funnel-diagnostic` | Sales funnel diagnostic methodology with industry benchmarks and root cause analysis. Use when analyzing pipeline con... | `sales-funnel-diagnostic/SKILL.md` |
| `script-inventory-operator` | Create a deterministic inventory of scripts and tooling clusters with ownership and risk metadata. | `script-inventory-operator/SKILL.md` |
| `session-continuity-ops` | Operate session continuity hooks for scratchpad persistence, context hydration, and transcript backup reliability. | `session-continuity-ops/SKILL.md` |
| `silent-failure-check` | Comprehensive silent failure detection across the OpsPal plugin ecosystem. | `silent-failure-check/SKILL.md` |
| `slo-sla-operations-guard` | Classify SLO and SLA breaches, assign response priority, and map remediation workflows. | `slo-sla-operations-guard/SKILL.md` |
| `subagent-verification-debugging` | Debug subagent lifecycle hooks, verification failures, and recurring subagent execution issues. | `subagent-verification-debugging/SKILL.md` |
| `test-smoke-harness-curator` | Curate smoke test harnesses for critical scripts, hooks, and operational workflows. | `test-smoke-harness-curator/SKILL.md` |
| `tool-contract-engineering` | Design and maintain pre/post tool contract validation hooks and failure triage patterns. | `tool-contract-engineering/SKILL.md` |
| `xml-inline-parse-guard` | Harden inline XML ingestion paths with format detection, parser safety, and policy-aware validation. | `xml-inline-parse-guard/SKILL.md` |

#### Hooks

- `base-context-loader` (`context-loader/base-context-loader.sh`): Base Context Loader Hook
- `error-handler` (`lib/error-handler.sh`): Standardized Error Handler Library for Hooks
- `hubspot` (`context-loader/platform-extensions/hubspot.sh`): HubSpot Context Extension
- `intake-suggestion` (`intake-suggestion.sh`): Intake Suggestion Hook
- `marketo` (`context-loader/platform-extensions/marketo.sh`): Marketo Context Extension
- `master-prompt-handler` (`master-prompt-handler.sh`): Master Prompt Handler
- `permission-request-handler` (`permission-request-handler.sh`): PermissionRequest Hook - Audit & Auto-Approve
- `post-assessment-work-index` (`post-assessment-work-index.sh`): Post-Assessment Work Index Hook
- `post-audit-bluf-generator` (`post-audit-bluf-generator.sh`): Post-Audit BLUF+4 Summary Generator Hook
- `post-edit-verification` (`post-edit-verification.sh`): Post-Edit Verification Hook
- `post-fireflies-sync` (`post-fireflies-sync.sh`): Post-Fireflies Sync Hook
- `post-gong-sync` (`post-gong-sync.sh`): Post-Gong Sync Hook
- `post-pdf-verification` (`post-pdf-verification.sh`): Post-PDF Verification Hook
- `post-plugin-update` (`post-plugin-update.sh`): Post-Plugin-Update Hook
- `post-reflect` (`reflection/post-reflect.sh`): Post-Reflect Hook (Unified)
- `post-reflect-alerter` (`post-reflect-alerter.sh`): Post-Reflect Alerter Hook
- `post-reflect-strategy-update` (`post-reflect-strategy-update.sh`): Post-Reflect Skill Update Hook
- `post-subagent-verification` (`post-subagent-verification.sh`): Post Sub-Agent Verification Hook
- `post-task-runbook-compliance-check` (`post-task-runbook-compliance-check.sh`): Post-Task Runbook Compliance Check Hook
- `post-task-stall-check` (`post-task-stall-check.sh`): Post Task Stall Check Hook
- `post-task-verification` (`post-task-verification.sh`): Post-Task Verification Hook
- `post-todowrite-scratchpad` (`post-todowrite-scratchpad.sh`): Post TodoWrite Scratchpad Hook
- `post-tool-capture` (`post-tool-capture.sh`): post-tool-capture.sh - Capture tool invocations for session context
- `post-tool-use` (`post-tool-use.sh`): PostToolUse Hook - Tool Result Validation
- `post-tool-use-contract-validation` (`post-tool-use-contract-validation.sh`): Post-Tool Use Contract Validation Hook
- `post-tool-validator` (`validation/post-tool-validator.sh`): Post-Tool Validator (Unified)
- `pre-commit-config-validation` (`pre-commit-config-validation.sh`): Pre-commit Config Validation Hook
- `pre-compact` (`pre-compact.sh`): PreCompact Hook - Transcript Backup
- `pre-dependency-check` (`pre-dependency-check.sh`): Pre-Dependency Check Hook
- `pre-fireflies-api-call` (`pre-fireflies-api-call.sh`): Pre-Fireflies API Call Hook
- `pre-gong-api-call` (`pre-gong-api-call.sh`): Pre-Gong API Call Hook
- `pre-operation-data-validator` (`pre-operation-data-validator.sh`): Pre-Operation Data Validator Hook
- `pre-operation-env-validator` (`pre-operation-env-validator.sh`): Pre-Operation Environment Validator Hook
- `pre-operation-idempotency-check` (`pre-operation-idempotency-check.sh`): Pre-Operation Idempotency Check Hook
- `pre-operation-snapshot` (`pre-operation-snapshot.sh`): Pre-Operation Snapshot Hook
- `pre-plan-scope-validation` (`pre-plan-scope-validation.sh`): Pre-Plan Scope Validation Hook
- `pre-reflect` (`reflection/pre-reflect.sh`): Pre-Reflect Hook (Unified)
- `pre-session-path-validator` (`pre-session-path-validator.sh`): Pre-Session Path Validator Hook
- `pre-session-silent-failure-check` (`pre-session-silent-failure-check.sh`): Pre-Session Silent Failure Check Hook
- `pre-stop-org-verification` (`pre-stop-org-verification.sh`): Pre-Stop Org Verification Hook
- `pre-supabase-validation` (`pre-supabase-validation.sh`): Pre-Supabase Validation Hook
- `pre-task-agent-recommendation` (`pre-task-agent-recommendation.sh`): Pre-Task Agent Recommendation Hook
- `pre-task-agent-validator` (`pre-task-agent-validator.sh`): Pre-Task Agent Validator Hook
- `pre-task-field-dictionary-injector` (`pre-task-field-dictionary-injector.sh`): Pre-Task Field Dictionary Injector Hook
- `pre-task-graph-trigger` (`pre-task-graph-trigger.sh`): Pre-Task Graph Trigger Hook
- `pre-task-routing-clarity` (`pre-task-routing-clarity.sh`): Pre-Task Routing Clarity Hook
- `pre-task-runbook-policy-enforcer` (`pre-task-runbook-policy-enforcer.sh`): Pre-Task Runbook Policy Enforcer Hook
- `pre-task-runbook-reminder` (`pre-task-runbook-reminder.sh`): Pre-Task Runbook Reminder Hook
- `pre-task-template-injector` (`pre-task-template-injector.sh`): Pre-Task Template Injector Hook
- `pre-task-work-context` (`pre-task-work-context.sh`): Pre-Task Work Context Hook
- `pre-tool-execution` (`pre-tool-execution.sh`): # Pre-Tool Execution Validation Hook
- `pre-tool-use-asset-resolver` (`pre-tool-use-asset-resolver.sh`): Pre-Tool-Use Asset Resolver (Bash)
- `pre-tool-use-asset-resolver-read` (`pre-tool-use-asset-resolver-read.sh`): Pre-Tool-Use Asset Resolver (Read)
- `pre-tool-use-contract-validation` (`pre-tool-use-contract-validation.sh`): Pre-Tool Use Contract Validation Hook
- `pre-tool-validator` (`validation/pre-tool-validator.sh`): Pre-Tool Validator (Unified)
- `prevention-system-orchestrator` (`prevention-system-orchestrator.sh`): Prevention System Orchestrator
- `salesforce` (`context-loader/platform-extensions/salesforce.sh`): Salesforce Context Extension
- `session-capture-init` (`session-capture-init.sh`): session-capture-init.sh - Initialize session context capture
- `session-context-loader` (`session-context-loader.sh`): Session Context Loader Hook
- `session-end` (`session-end.sh`): Session End Hook (Unified)
- `session-end-reliability` (`session-end-reliability.sh`): Session End Reliability Hook
- `session-end-scratchpad` (`session-end-scratchpad.sh`): Session End Scratchpad Hook
- `session-init` (`session-init.sh`): Session Init Hook (Unified)
- `session-start-asset-decryptor` (`session-start-asset-decryptor.sh`): Session Start Asset Decryptor
- `session-start-env-config` (`session-start-env-config.sh`): Session Start Environment Configuration Hook (v2.0.0)
- `session-start-envcheck` (`session-start-envcheck.sh`): Session Start Environment Check Hook
- `session-start-repo-sync` (`session-start-repo-sync.sh`): Session Start Repository Sync Hook
- `session-start-scratchpad` (`session-start-scratchpad.sh`): Session Start Scratchpad Hook
- `session-start-version-check` (`session-start-version-check.sh`): Session Start Version Check Hook
- `session-stop-asset-cleanup` (`session-stop-asset-cleanup.sh`): Session Stop Asset Cleanup
- `setup-maintenance` (`setup-maintenance.sh`): Setup Hook - Environment Maintenance & Onboarding
- `stop-session-silent-failure-summary` (`stop-session-silent-failure-summary.sh`): Stop Session Silent Failure Summary Hook
- `subagent-capability-gate-openclaw` (`subagent-capability-gate-openclaw.sh`)
- `subagent-start-context` (`subagent-start-context.sh`): SubagentStart Hook - Unified Context Injection
- `subagent-stop-capture` (`subagent-stop-capture.sh`): SubagentStop Hook - Error Capture & Debugging
- `task-completed-metrics` (`task-completed-metrics.sh`): TaskCompleted Hook - Agent Performance Metrics
- `task-graph-policy-enforcer` (`task-graph-policy-enforcer.sh`): Task Graph Policy Enforcer Hook
- `unified-router` (`unified-router.sh`): Unified Router Hook
- `user-prompt-router` (`user-prompt-router.sh`): User Prompt Router - Automatic Agent Routing Hook
- `weekly-strategy-transfer` (`weekly-strategy-transfer.sh`): Weekly Skill Transfer Hook

---

### opspal-data-hygiene

- Version: `1.1.5`
- Status: `deprecated`
- Path: `plugins/opspal-data-hygiene`
- Manifest: `plugins/opspal-data-hygiene/.claude-plugin/plugin.json`
- Description: [DEPRECATED] Cross-platform data deduplication and hygiene management for HubSpot and Salesforce. Functionality has been consolidated into opspal-core. Use /dedup-companies or /deduplicate commands instead.

#### Agents

| Agent | Description | File |
|-------|-------------|------|
| `contact-dedup-orchestrator` | MUST BE USED for Contact/Lead deduplication. Orchestrates Contact dedup between HubSpot and Salesforce with fuzzy mat... | `contact-dedup-orchestrator.md` |
| `sfdc-hubspot-dedup-orchestrator` | MUST BE USED for cross-platform deduplication. Orchestrates Company/Account dedup between HubSpot and Salesforce with... | `sfdc-hubspot-dedup-orchestrator.md` |

#### Commands

| Command | Args | Description | File |
|---------|------|-------------|------|
| `/dedup-companies` | `[--config <path>] [--output-dir <path>] [--resume <session>]` | Execute complete Company/Account deduplication workflow between HubSpot and Salesforce | `dedup-companies.md` |

#### Skills

| Skill | Description | File |
|-------|-------------|------|
| `cross-platform-deduplication` | Cross-platform deduplication methodology for HubSpot and Salesforce with 6-phase workflow. Use when deduplicating Com... | `cross-platform-deduplication/SKILL.md` |

#### Hooks

_None_

---

### opspal-gtm-planning

- Version: `2.1.4`
- Status: `active`
- Path: `plugins/opspal-gtm-planning`
- Manifest: `plugins/opspal-gtm-planning/.claude-plugin/plugin.json`
- Description: GTM Annual Planning framework with strategic reporting templates. Includes territory design, quota modeling, compensation planning, revenue modeling, retention analysis, market intelligence, and 13 strategic report templates. 11 agents, 14 commands, 3 skill frameworks.

#### Agents

| Agent | Description | File |
|-------|-------------|------|
| `forecast-orchestrator` | Master orchestrator for revenue forecasting and pipeline prediction. Combines weighted pipeline, historical patterns,... | `forecast-orchestrator.md` |
| `gtm-attribution-governance` | Use PROACTIVELY for attribution governance. Compares attribution models, back-tests vs prior FY, and recommends optim... | `gtm-attribution-governance.md` |
| `gtm-comp-planner` | Use PROACTIVELY for compensation planning. Designs OTE structures, commission rates, accelerators, and UAT test plans. | `gtm-comp-planner.md` |
| `gtm-data-insights` | Use PROACTIVELY for GTM data analysis. Extracts historical data, builds cohorts, validates fields, and generates Data... | `gtm-data-insights.md` |
| `gtm-market-intelligence` | Provides market sizing, segmentation analysis, and ICP performance insights for SaaS businesses. Specializes in TAM/S... | `gtm-market-intelligence.md` |
| `gtm-planning-orchestrator` | MUST BE USED for GTM annual planning. Master orchestrator with approval gates, scenario modeling, and multi-agent coo... | `gtm-planning-orchestrator.md` |
| `gtm-quota-capacity` | Use PROACTIVELY for quota modeling. Builds P10/P50/P90 scenarios via Monte Carlo, sensitivity analysis, and back-test... | `gtm-quota-capacity.md` |
| `gtm-retention-analyst` | Analyzes retention, expansion, and revenue conversion metrics for SaaS businesses. Specializes in NRR/GRR cohort anal... | `gtm-retention-analyst.md` |
| `gtm-revenue-modeler` | Generates multi-year revenue projections, scenario models, and ARR waterfall analysis. Specializes in driver-based fo... | `gtm-revenue-modeler.md` |
| `gtm-strategic-reports-orchestrator` | Master coordinator for strategic GTM report generation. Routes requests to specialized agents, validates data contrac... | `gtm-strategic-reports-orchestrator.md` |
| `gtm-strategy-planner` | Use PROACTIVELY for GTM strategy. Defines motion playbooks, credit rules, PLG→SLG transitions, and partner strategies. | `gtm-strategy-planner.md` |
| `gtm-territory-designer` | Use PROACTIVELY for territory design. Creates balanced carves, validates fairness, generates account assignments, and... | `gtm-territory-designer.md` |

#### Commands

| Command | Args | Description | File |
|---------|------|-------------|------|
| `/forecast` | `[period] [--org <alias>] [--method weighted|historical|combined]` | Generate revenue forecasts using weighted pipeline, historical patterns, and time-series analysis | `forecast.md` |
| `/gtm-arr-waterfall` | `[--period Q4-2025] [--segments all]` | Generate ARR waterfall analysis showing revenue movement components | `gtm-arr-waterfall.md` |
| `/gtm-comp` | `[--ote <amount>] [--split <base/variable>] [--accelerators]` | Design sales compensation plans with OTE modeling, accelerators, and UAT validation | `gtm-comp.md` |
| `/gtm-data-quality` | `[--years <count>] [--objects Opportunity,Account] [--threshold <percent>]` | Assess historical data quality and sufficiency for GTM planning decisions | `gtm-data-quality.md` |
| `/gtm-icp-analysis` | `[--period Q4-2025] [--attributes industry,size,use-case]` | Analyze ICP (Ideal Customer Profile) win rates and identify winning deal profiles | `gtm-icp-analysis.md` |
| `/gtm-market-size` | `[--method bottom-up|top-down] [--segments true]` | Calculate TAM/SAM/SOM market opportunity sizing with penetration analysis | `gtm-market-size.md` |
| `/gtm-plan` | `[--fiscal-year FY2026] [--stage kickoff|territories|quotas|comp|review]` | Start orchestrated GTM annual planning workflow with data quality, territories, quotas, and compensation | `gtm-plan.md` |
| `/gtm-quota` | `[--target <amount>] [--growth <percent>] [--scenario p10|p50|p90]` | Model and distribute sales quotas with scenario analysis and attainability scoring | `gtm-quota.md` |
| `/gtm-report` | `<template-id> [--period Q1-2026] [--segments enterprise,mid-market] [--format...` | Generate strategic GTM reports from the template library | `gtm-report.md` |
| `/gtm-retention` | `[--period Q4-2025] [--cohorts true] [--segments enterprise,mid-market,smb]` | Analyze Net Revenue Retention (NRR) and Gross Revenue Retention (GRR) with cohorts | `gtm-retention.md` |
| `/gtm-revenue-mix` | `[--period 2025] [--trend true]` | Analyze revenue composition by source (New vs Expansion vs Renewal) | `gtm-revenue-mix.md` |
| `/gtm-revenue-model` | `[--years 5] [--base-growth 30] [--scenarios upside,base,downside]` | Generate multi-year ARR projections with driver-based forecasting | `gtm-revenue-model.md` |
| `/gtm-scenario` | `[--base-arr <amount>] [--period <period>]` | Create upside/base/downside revenue scenarios with sensitivity analysis | `gtm-scenario.md` |
| `/gtm-strategy` | `[--tam] [--competitors <list>] [--growth-target <percent>]` | Analyze market strategy including TAM/SAM/SOM, competitive positioning, and growth targets | `gtm-strategy.md` |
| `/gtm-territory` | `[--region <name>] [--reps <count>] [--method geography|industry|named]` | Design and validate sales territories with fairness scoring and workload balancing | `gtm-territory.md` |

#### Skills

| Skill | Description | File |
|-------|-------------|------|
| `gtm-annual-planning-framework` | GTM annual planning orchestration methodology with 7-phase workflow and approval gates. Use when initiating annual pl... | `gtm-annual-planning-framework/SKILL.md` |
| `gtm-revenue-modeling` | Revenue modeling methodology including ARR waterfall, scenario planning, and projection models. Use when building rev... | `gtm-revenue-modeling/SKILL.md` |
| `gtm-scenario-governance-framework` | Govern GTM scenario planning with assumption tracking, sensitivity analysis, and decision records. | `gtm-scenario-governance-framework/SKILL.md` |
| `quota-capacity-modeling` | Quota and capacity modeling methodology with Monte Carlo simulations and P10/P50/P90 scenarios. Use when building quo... | `quota-capacity-modeling/SKILL.md` |

#### Hooks

_None_

---

### opspal-hubspot

- Version: `3.7.15`
- Status: `active`
- Path: `plugins/opspal-hubspot`
- Manifest: `plugins/opspal-hubspot/.claude-plugin/plugin.json`
- Description: HubSpot operations: workflows, contacts, deals, marketing campaigns, CMS blog management, HubDB, serverless functions, Developer Platform apps with app cards and settings components, Imports V3 API, Goal Targets V3 API (quotas, attainment), Automation Actions V4 API (custom workflow actions, callbacks), analytics, Salesforce sync, Service Hub, revenue intelligence, and list-workflow pairing validation. 54 agents.

#### Agents

| Agent | Description | File |
|-------|-------------|------|
| `hubspot-admin-specialist` | Use PROACTIVELY for portal administration. Manages users, permissions, security configuration, and governance standards. | `hubspot-admin-specialist.md` |
| `hubspot-adoption-tracker` | Use PROACTIVELY for adoption tracking. Monitors user activity, feature adoption metrics, training effectiveness, and ... | `hubspot-adoption-tracker.md` |
| `hubspot-ai-revenue-intelligence` | Use PROACTIVELY for revenue intelligence. AI-powered forecasting, deal intelligence, predictive analytics, and autono... | `hubspot-ai-revenue-intelligence.md` |
| `hubspot-analytics-reporter` | Use PROACTIVELY for HubSpot analytics. Generates comprehensive reports and insights across all hubs with AI-powered a... | `hubspot-analytics-reporter.md` |
| `hubspot-api` | Use PROACTIVELY for API integration. Manages webhooks, integrations, and API connectivity. Not for secrets storage. | `hubspot-api.md` |
| `hubspot-app-card-builder` | Creates HubSpot App Cards for UI extensibility. Builds React-based custom components for CRM records, preview panels,... | `hubspot-app-card-builder.md` |
| `hubspot-app-developer` | MUST BE USED for HubSpot app development. Master orchestrator for creating, configuring, and deploying HubSpot apps w... | `hubspot-app-developer.md` |
| `hubspot-assessment-analyzer` | MUST BE USED for HubSpot assessments. Performs comprehensive RevOps analysis using statistical methodologies to ident... | `hubspot-assessment-analyzer.md` |
| `hubspot-attribution-analyst` | Use PROACTIVELY for attribution analysis. Handles multi-touch attribution modeling and marketing performance measurem... | `hubspot-attribution-analyst.md` |
| `hubspot-autonomous-operations` | Use PROACTIVELY for autonomous operations. Self-operating system for automated decisions, process optimization, and w... | `hubspot-autonomous-operations.md` |
| `hubspot-callback-orchestrator` | Manages async workflow callback execution for HubSpot Automation Actions V4. Handles BLOCK state, expiration tracking... | `hubspot-callback-orchestrator.md` |
| `hubspot-cms-blog-author-manager` | Use PROACTIVELY for blog author management. Creates, updates, and manages HubSpot blog authors with profile configura... | `hubspot-cms-blog-author-manager.md` |
| `hubspot-cms-blog-post-manager` | Use PROACTIVELY for blog post management. Creates, updates, publishes, schedules, and manages HubSpot blog posts with... | `hubspot-cms-blog-post-manager.md` |
| `hubspot-cms-content-manager` | Use PROACTIVELY for CMS management. Manages website pages, blog posts, landing pages, templates, modules, SEO, and mu... | `hubspot-cms-content-manager.md` |
| `hubspot-cms-cta-manager` | Use PROACTIVELY for CTA management. Creates and manages HubSpot CTAs using Playwright automation, including button co... | `hubspot-cms-cta-manager.md` |
| `hubspot-cms-domain-monitor` | Use PROACTIVELY for domain monitoring. Lists connected domains, checks HTTPS status, monitors domain health, and trac... | `hubspot-cms-domain-monitor.md` |
| `hubspot-cms-files-manager` | Use PROACTIVELY for file and asset management. Manages HubSpot files including images, documents, and media with uplo... | `hubspot-cms-files-manager.md` |
| `hubspot-cms-form-manager` | Use PROACTIVELY for HubSpot form operations. Creates, configures, and manages HubSpot forms including field configura... | `hubspot-cms-form-manager.md` |
| `hubspot-cms-hubdb-manager` | Use PROACTIVELY for HubDB management. Manages HubSpot HubDB tables, rows, columns, and draft/publish workflows for dy... | `hubspot-cms-hubdb-manager.md` |
| `hubspot-cms-page-publisher` | Use PROACTIVELY for CMS publishing. Manages page lifecycle including creation, updates, cloning, deletion, and publis... | `hubspot-cms-page-publisher.md` |
| `hubspot-cms-redirect-manager` | Use PROACTIVELY for URL redirect management. Creates and manages HubSpot URL redirects for SEO preservation, site mig... | `hubspot-cms-redirect-manager.md` |
| `hubspot-cms-theme-manager` | Use PROACTIVELY for CMS theme management. Manages HubSpot CMS themes via CLI including theme selection, configuration... | `hubspot-cms-theme-manager.md` |
| `hubspot-commerce-manager` | Use PROACTIVELY for commerce operations. Handles product catalogs, pricing, quotes, payments, invoicing, and e-commer... | `hubspot-commerce-manager.md` |
| `hubspot-contact-manager` | Use PROACTIVELY for contact management. Manages contacts, lists, properties, and segmentation with data quality enfor... | `hubspot-contact-manager.md` |
| `hubspot-content-automation-agent` | Automatically routes for content automation. Generates AI-optimized TL;DR sections, answer blocks, and FAQ content. | `hubspot-content-automation-agent.md` |
| `hubspot-conversation-intelligence` | Use PROACTIVELY for conversation analysis. AI-powered analysis for calls, emails, and meetings with insights extracti... | `hubspot-conversation-intelligence.md` |
| `hubspot-custom-action-builder` | MUST BE USED for creating custom HubSpot workflow actions. Creates custom action definitions with input/output fields... | `hubspot-custom-action-builder.md` |
| `hubspot-data` | Use PROACTIVELY for data operations. Handles contact/company property and data hygiene operations. Not for workflows. | `hubspot-data.md` |
| `hubspot-data-hygiene-specialist` | Use PROACTIVELY for data hygiene operations. Handles duplicate detection, format standardization, data enrichment, an... | `hubspot-data-hygiene-specialist.md` |
| `hubspot-data-operations-manager` | MUST BE USED for HubSpot data operations. Handles bulk imports, exports, transformations, migrations, and cross-objec... | `hubspot-data-operations-manager.md` |
| `hubspot-email-campaign-manager` | Use PROACTIVELY for email campaigns. Manages templates, sequences, and marketing communications with personalization ... | `hubspot-email-campaign-manager.md` |
| `hubspot-goals-manager` | Use PROACTIVELY for sales goals and quotas. Provides goal target retrieval, quota tracking, attainment reporting, and... | `hubspot-goals-manager.md` |
| `hubspot-governance-enforcer` | Use PROACTIVELY for HubSpot governance. Enforces data quality, compliance, permissions, audit trails, and change mana... | `hubspot-governance-enforcer.md` |
| `hubspot-integration-specialist` | Use PROACTIVELY for HubSpot integrations. Manages webhooks, API integrations, custom apps, and third-party connections. | `hubspot-integration-specialist.md` |
| `hubspot-lead-scoring-specialist` | Use PROACTIVELY for lead scoring setup. Develops, implements, and optimizes lead scoring models with AI-powered crite... | `hubspot-lead-scoring-specialist.md` |
| `hubspot-marketing-automation` | Use PROACTIVELY for marketing automation. Creates workflows, email automation, lead scoring, and behavioral triggers ... | `hubspot-marketing-automation.md` |
| `hubspot-orchestrator` | MUST BE USED for complex multi-step HubSpot operations. Coordinates workflows across domains, manages dependencies, a... | `hubspot-orchestrator.md` |
| `hubspot-pipeline-manager` | Use PROACTIVELY for pipeline management. Manages deal pipelines, sales processes, forecasting, and revenue operations. | `hubspot-pipeline-manager.md` |
| `hubspot-plg-foundation` | Use PROACTIVELY for product-led growth. Handles PQL scoring, usage-based triggers, freemium conversion, and self-serv... | `hubspot-plg-foundation.md` |
| `hubspot-property-manager` | Use PROACTIVELY for property management. Handles custom objects, calculated properties, dependencies, rollups, and da... | `hubspot-property-manager.md` |
| `hubspot-renewals-specialist` | Use PROACTIVELY for renewal management. Manages renewal pipelines, churn prevention, contract tracking, and renewal f... | `hubspot-renewals-specialist.md` |
| `hubspot-reporting-builder` | Use PROACTIVELY for reporting. Creates custom reports, dashboards, and data visualizations for marketing, sales, and ... | `hubspot-reporting-builder.md` |
| `hubspot-revenue-intelligence` | Use PROACTIVELY for revenue intelligence. Provides deal health scoring, predictive forecasting, pipeline velocity ana... | `hubspot-revenue-intelligence.md` |
| `hubspot-schema-automation-agent` | Automatically routes for schema generation. Generates and validates JSON-LD schema markup for AI search optimization. | `hubspot-schema-automation-agent.md` |
| `hubspot-sdr-operations` | Use PROACTIVELY for SDR operations. Manages outbound sequences, territory management, lead routing, and cadence optim... | `hubspot-sdr-operations.md` |
| `hubspot-seo-competitor-analyzer` | Automatically routes for competitor analysis. Identifies content gaps and opportunities through SERP analysis and com... | `hubspot-seo-competitor-analyzer.md` |
| `hubspot-seo-content-optimizer` | Automatically routes for content optimization. Analyzes quality, identifies AEO opportunities, generates recommendati... | `hubspot-seo-content-optimizer.md` |
| `hubspot-seo-deployment-agent` | Automatically routes for SEO deployment. Deploys AI search optimizations to HubSpot with backup and rollback capability. | `hubspot-seo-deployment-agent.md` |
| `hubspot-seo-optimizer` | Use PROACTIVELY for SEO optimization. Provides keyword research, content optimization, technical SEO audits, SERP ana... | `hubspot-seo-optimizer.md` |
| `hubspot-seo-site-crawler` | Automatically routes for site crawling. Parses sitemaps, performs batch analysis, detects broken links, calculates he... | `hubspot-seo-site-crawler.md` |
| `hubspot-service-hub-manager` | Use PROACTIVELY for Service Hub management. Manages tickets, SLAs, customer health, and support operations. | `hubspot-service-hub-manager.md` |
| `hubspot-settings-builder` | Creates HubSpot Settings Components - React-based configuration pages for HubSpot apps. Builds settings pages with Pa... | `hubspot-settings-builder.md` |
| `hubspot-sfdc-sync-scraper` | Use PROACTIVELY for SF sync analysis. Scrapes Salesforce connector settings via Playwright MCP browser automation (se... | `hubspot-sfdc-sync-scraper.md` |
| `hubspot-stripe-connector` | Use PROACTIVELY for Stripe integration. Manages bidirectional sync for subscription data, payments, and revenue track... | `hubspot-stripe-connector.md` |
| `hubspot-territory-manager` | Use PROACTIVELY for territory management. Handles territory planning, account segmentation, lead routing, and optimiz... | `hubspot-territory-manager.md` |
| `hubspot-web-enricher` | Use PROACTIVELY for data enrichment. Enriches company data using web search and intelligent website analysis without ... | `hubspot-web-enricher.md` |
| `hubspot-workflow` | Use PROACTIVELY for workflow management. Creates, changes, and validates HubSpot workflows and automation logic. Not ... | `hubspot-workflow.md` |
| `hubspot-workflow-auditor` | Use PROACTIVELY for workflow auditing. Verifies API operations with evidence-based validation, detecting silent failu... | `hubspot-workflow-auditor.md` |
| `hubspot-workflow-builder` | MUST BE USED for HubSpot workflow creation. Creates complex workflows with AI-powered automation, cross-hub orchestra... | `hubspot-workflow-builder.md` |

#### Commands

| Command | Args | Description | File |
|---------|------|-------------|------|
| `/ai-search-optimize` | `<url> [--deploy] [--portal-id <id>] [--dry-run] [--staged] [--focus <types>]` | Complete AI search optimization workflow - generate schema, optimize content, and deploy to HubSpot | `ai-search-optimize.md` |
| `/analyze-competitor` | `--your-site <url> --competitor <url> [--out <file>]` | Deep-dive competitive analysis for a single competitor with actionable recommendations | `analyze-competitor.md` |
| `/checkdependencies` | `[options]` | [REDIRECTS TO opspal-core] Check and install plugin dependencies | `checkdependencies.md` |
| `/cms-audit-pages` | `--type landing-pages` | Comprehensive audit of all CMS pages with SEO analysis, publishing status, and PDF report generation | `cms-audit-pages.md` |
| `/cms-build-site` | `[options]` | Guided website build process for HubSpot CMS with theme selection, page creation, forms, CTAs, and workflows | `cms-build-site.md` |
| `/cms-create-page` | `--type landing-page --name \"Product Launch\" --slug \"product-launch\"` | Create a new HubSpot CMS page (website or landing page) with validation | `cms-create-page.md` |
| `/cms-launch-site` | `[options]` | Pre-launch checklist and go-live wizard for HubSpot CMS websites | `cms-launch-site.md` |
| `/cms-publish-page` | `<page-id>` | Publish a HubSpot CMS page (immediate or scheduled) with validation | `cms-publish-page.md` |
| `/deploy-ai-seo` | `--portal-id <id> [--schema <file>] [--content <file>] [--rollback <id>] [--dr...` | Deploy pre-generated AI search optimizations to HubSpot with backup and rollback capability | `deploy-ai-seo.md` |
| `/hs-action-add-function` | `[--action <id>] [--type pre-action|post-action] [--template <name>]` | Add a serverless function to an existing custom workflow action | `hs-action-add-function.md` |
| `/hs-action-create` | `[--name <name>] [--url <callback-url>] [--object <type>]` | Interactive wizard to create a custom HubSpot workflow action | `hs-action-create.md` |
| `/hs-action-list` | `[--app <id>] [--format json|detailed]` | List all custom workflow actions for a HubSpot app | `hs-action-list.md` |
| `/hs-app-card-add` | `[--type <card-type>] [--name <card-name>]` | Add an app card to an existing HubSpot app project | `hs-app-card-add.md` |
| `/hs-app-create` | `[--name <app-name>] [--template <template>]` | Initialize a new HubSpot app project with guided setup wizard | `hs-app-create.md` |
| `/hs-app-deploy` | `[--account <name>] [--force]` | Deploy HubSpot app to a portal with validation and confirmation | `hs-app-deploy.md` |
| `/hs-app-validate` | `[--marketplace]` | Validate HubSpot app for deployment or marketplace submission | `hs-app-validate.md` |
| `/hs-callback-complete` | `--callback <id> [--status success|failure] [--output <json>]` | Complete a pending HubSpot workflow callback with output fields | `hs-callback-complete.md` |
| `/hs-goals` | `[--all] [--user <user-id>] [--period <period>]` | List and display sales goals, quotas, and attainment status from HubSpot Goal Targets V3 API | `hs-goals.md` |
| `/hs-import-advanced` | `[--file <path>] [--type single-file|multi-file]` | Advanced HubSpot data import with full V3 API features including multi-file imports, associations, and marketing flags | `hs-import-advanced.md` |
| `/hs-settings-add` | `[--name <component-name>]` | Add a settings component to an existing HubSpot app project | `hs-settings-add.md` |
| `/hsdedup` | `[options]` | Automated duplicate detection and resolution for HubSpot companies sharing Salesforce Account IDs with lift-and-shift... | `hsdedup.md` |
| `/hsenrich` | `<object-type> <field-name> [options]` | Quick company/contact enrichment for missing fields using domain-based derivation or web scraping | `hsenrich.md` |
| `/hsmerge` | `<master-company-id> <duplicate-company-id>` | Interactive merge strategy selector for HubSpot companies - detects SF sync constraints and recommends lift-and-shift... | `hsmerge.md` |
| `/hssfdc-analyze` | `[options]` | Analyze Salesforce sync field mappings for current HubSpot portal | `hssfdc-analyze.md` |
| `/hssfdc-scrape` | `[portal-name]` | Scrape HubSpot Salesforce connector settings (not available via API) | `hssfdc-scrape.md` |
| `/hssfdc-session-check` | `[portal-name] [--deep]` | Test HubSpot session health and integrations page access | `hssfdc-session-check.md` |
| `/hssfdc-validate` | `[portal-name]` | Validate existing SFDC sync field mapping CSVs | `hssfdc-validate.md` |
| `/initialize` | `[options]` | [REDIRECTS TO opspal-core] Initialize project structure | `initialize.md` |
| `/newhs` | `[--name=<portal>] [--portal-id=<id>] [--api-key=<key>]` | Create new HubSpot portal configuration and project folder structure | `newhs.md` |
| `/optimize-content` | `--url <url> --keyword <keyword> [--format detailed|html] [--file <path>] [--g...` | Focused content optimization for single pages or new content planning. Analyzes content quality, AEO opportunities, r... | `optimize-content.md` |
| `/seo-audit` | `--url <url> [--max-pages <n>] [--check-broken-links] [--competitors <urls>]` | Comprehensive SEO audit with optional competitor analysis, content optimization, GEO validation, and AI search optimi... | `seo-audit.md` |
| `/seo-broken-links` | `<url> [options]` | Quick broken link scan for websites - detects 404s, redirect chains, orphan pages, and external link issues | `seo-broken-links.md` |
| `/topic-cluster` | `--topic \"seed topic\" [options]` | Generate SEO-optimized topic clusters with pillar page and supporting cluster pages for comprehensive content strategy | `topic-cluster.md` |

#### Skills

| Skill | Description | File |
|-------|-------------|------|
| `hubspot-agent-governance-runtime` | Implement runtime hook governance for HubSpot task safety, mandatory agent routing, and strict-mode behavior. | `hubspot-agent-governance-runtime/SKILL.md` |
| `hubspot-agent-standards` | Mandatory standards for all HubSpot agents. Use when performing ANY HubSpot API operation, bulk data operation, workf... | `hubspot-agent-standards/SKILL.md` |
| `hubspot-app-development` | HubSpot app development lifecycle from creation to marketplace. Use when building HubSpot apps, adding CRM cards, con... | `hubspot-app-development/SKILL.md` |
| `hubspot-assessment-methodology` | HubSpot assessment and audit methodology with statistical sampling and scoring frameworks. Use when conducting portal... | `hubspot-assessment-methodology/SKILL.md` |
| `hubspot-automation-actions` | HubSpot Automation Actions V4 API patterns for creating custom workflow actions, action functions, and callback handl... | `hubspot-automation-actions/SKILL.md` |
| `hubspot-cli-patterns` | Reference guide for HubSpot CLI operations including theme management, file operations, authentication, and developme... | `hubspot-cli-patterns/SKILL.md` |
| `hubspot-cms-release-operations` | Operate hook workflows for HubSpot CMS release readiness, publish controls, and post-publish telemetry/notifications. | `hubspot-cms-release-operations/SKILL.md` |
| `hubspot-company-merge-strategy` | Use hook guidance to choose safe merge strategies for HubSpot companies with Salesforce sync constraints. | `hubspot-company-merge-strategy/SKILL.md` |
| `hubspot-data-validation` | HubSpot Lists API validation patterns and common error prevention. Use when creating or updating lists, filtering con... | `hubspot-data-validation/SKILL.md` |
| `hubspot-developer-platform` | HubSpot Developer Platform patterns for building apps with app cards, settings components, and marketplace submission... | `hubspot-developer-platform/SKILL.md` |
| `hubspot-goals-quotas` | HubSpot Goal Targets V3 API patterns for sales goals, quotas, attainment tracking, and goal progress monitoring. | `hubspot-goals-quotas/SKILL.md` |
| `hubspot-governance-patterns` | HubSpot portal governance and compliance enforcement patterns. Use when establishing naming conventions, managing use... | `hubspot-governance-patterns/SKILL.md` |
| `hubspot-hook-input-contracts` | Standardize HubSpot hook input parsing across stdin event JSON and argv fallback modes. | `hubspot-hook-input-contracts/SKILL.md` |
| `hubspot-hook-response-contracts` | Normalize HubSpot pre-hook outputs with machine-readable decision envelopes and human diagnostics. | `hubspot-hook-response-contracts/SKILL.md` |
| `hubspot-hook-shell-hardening` | Apply consistent shell strictness and non-interactive safety defaults across HubSpot hooks. | `hubspot-hook-shell-hardening/SKILL.md` |
| `hubspot-hook-skill-sync-governance` | Keep HubSpot skill references synchronized with actual hook file names and trigger surfaces. | `hubspot-hook-skill-sync-governance/SKILL.md` |
| `hubspot-hook-subprocess-and-tempfile-safety` | Enforce subprocess dependency checks and tempfile lifecycle safety in HubSpot hook scripts. | `hubspot-hook-subprocess-and-tempfile-safety/SKILL.md` |
| `hubspot-incident-triage-framework` | Triage and stabilize HubSpot automation incidents with severity scoring and recovery plans. | `hubspot-incident-triage-framework/SKILL.md` |
| `hubspot-multi-object-migration-framework` | Plan and execute staged multi-object HubSpot migrations with reconciliation controls. | `hubspot-multi-object-migration-framework/SKILL.md` |
| `hubspot-output-path-governance` | Enforce hook-based output path and artifact placement governance for generated HubSpot artifacts. | `hubspot-output-path-governance/SKILL.md` |
| `hubspot-portal-runtime-lifecycle` | Manage portal auth/switch lifecycle hooks and stale credential recovery for stable HubSpot runtime context. | `hubspot-portal-runtime-lifecycle/SKILL.md` |
| `hubspot-seo-framework` | HubSpot SEO optimization methodology and content scoring framework. Use when conducting keyword research, optimizing ... | `hubspot-seo-framework/SKILL.md` |
| `hubspot-workflow-patterns` | HubSpot workflow API limitations, branching patterns, and workarounds. Use when creating or modifying HubSpot workflo... | `hubspot-workflow-patterns/SKILL.md` |

#### Hooks

- `post-cms-publish-notification` (`post-cms-publish-notification.sh`): Post-CMS Publish Notification Hook
- `post-portal-authentication` (`post-portal-authentication.sh`): Post-Portal Authentication Hook
- `post-portal-switch` (`post-portal-switch.sh`): post-portal-switch.sh - Post Portal Switch Hook
- `pre-cms-publish-validation` (`pre-cms-publish-validation.sh`): Pre-CMS Publish Validation Hook
- `pre-company-merge` (`pre-company-merge.sh`): Pre-Company Merge Validation Hook
- `pre-hubspot-api-call` (`pre-hubspot-api-call.sh`): Pre-HubSpot API Call Hook
- `pre-task-agent-validator` (`pre-task-agent-validator.sh`): Pre-Task Agent Validator Hook
- `pre-task-context-loader` (`pre-task-context-loader.sh`): Pre-Task Context Loader Hook
- `pre-task-mandatory` (`pre-task-mandatory.sh`): Pre-Task Mandatory Hook - Enforces agent usage for critical HubSpot operations
- `pre-workflow-list-validation` (`pre-workflow-list-validation.sh`): Pre-Workflow List Validation Hook
- `pre-write-path-validator` (`pre-write-path-validator.sh`): Pre-Write Path Validator Hook

---

### opspal-marketo

- Version: `2.6.11`
- Status: `active`
- Path: `plugins/opspal-marketo`
- Manifest: `plugins/opspal-marketo/.claude-plugin/plugin.json`
- Description: Marketo marketing automation: leads, smart campaigns, email, landing pages, programs, analytics, Salesforce sync, MQL handoff, agentic automation, Claude-powered observability, campaign diagnostics, and lead routing diagnostics with safe remediation workflows.

#### Agents

| Agent | Description | File |
|-------|-------------|------|
| `marketo-analytics-assessor` | MUST BE USED for comprehensive Marketo analytics and reporting. Analyzes program performance, email metrics, attribut... | `marketo-analytics-assessor.md` |
| `marketo-automation-auditor` | MUST BE USED for automation audits, campaign conflict detection, and cascade analysis. Performs comprehensive read-on... | `marketo-automation-auditor.md` |
| `marketo-automation-orchestrator` | MUST BE USED for complex multi-step Marketo agentic automation workflows. Orchestrates program setup, asset creation,... | `marketo-automation-orchestrator.md` |
| `marketo-campaign-builder` | MUST BE USED for Marketo smart campaign creation and management. Creates trigger campaigns, batch campaigns, and comp... | `marketo-campaign-builder.md` |
| `marketo-campaign-diagnostician` | MUST BE USED for campaign diagnostic issues including triggers not firing, flow step failures, leads stuck in status,... | `marketo-campaign-diagnostician.md` |
| `marketo-data-normalizer` | Transforms raw Marketo bulk export CSV data into normalized JSON structures suitable for Claude analysis. Handles CSV... | `marketo-data-normalizer.md` |
| `marketo-data-operations` | MUST BE USED for Marketo bulk data operations. Handles lead import/export, bulk updates, list operations, custom obje... | `marketo-data-operations.md` |
| `marketo-email-deliverability-auditor` | MUST BE USED for email deliverability audits, compliance checks, and engagement trend analysis. Performs comprehensiv... | `marketo-email-deliverability-auditor.md` |
| `marketo-email-specialist` | MUST BE USED for Marketo email creation and management. Creates email templates, operational emails, program emails, ... | `marketo-email-specialist.md` |
| `marketo-form-builder` | MUST BE USED for Marketo form creation and configuration. Creates forms, manages fields, configures validation, sets ... | `marketo-form-builder.md` |
| `marketo-governance-enforcer` | Use PROACTIVELY for Marketo governance, tier-based approvals, audit trails, and compliance enforcement. Manages opera... | `marketo-governance-enforcer.md` |
| `marketo-hubspot-bridge` | MUST BE USED for HubSpot-Marketo data synchronization, cross-platform lead routing, and unified contact management. B... | `marketo-hubspot-bridge.md` |
| `marketo-instance-discovery` | Use PROACTIVELY for read-only Marketo instance analysis. Discovers programs, campaigns, leads, custom fields, and con... | `marketo-instance-discovery.md` |
| `marketo-integration-specialist` | MUST BE USED for Marketo integrations and webhooks. Configures webhooks, manages API integrations, handles CRM sync, ... | `marketo-integration-specialist.md` |
| `marketo-intelligence-analyst` | Claude-powered analysis and actionable recommendations for Marketo marketing data. Interprets activity patterns, anal... | `marketo-intelligence-analyst.md` |
| `marketo-landing-page-manager` | MUST BE USED for Marketo landing page creation and management. Creates landing pages, manages templates, configures f... | `marketo-landing-page-manager.md` |
| `marketo-lead-manager` | MUST BE USED for Marketo lead operations. Manages lead creation, updates, queries, merging, scoring, and lifecycle ma... | `marketo-lead-manager.md` |
| `marketo-lead-quality-assessor` | MUST BE USED for lead quality assessments, database health audits, and scoring validation. Performs comprehensive rea... | `marketo-lead-quality-assessor.md` |
| `marketo-lead-routing-diagnostician` | MUST BE USED for lead routing diagnostics and daisy-chained automation failures. Performs canonical lead resolution, ... | `marketo-lead-routing-diagnostician.md` |
| `marketo-lead-scoring-architect` | MUST BE USED for lead scoring model design and implementation. Creates behavioral and demographic scoring rules, scor... | `marketo-lead-scoring-architect.md` |
| `marketo-mql-handoff-orchestrator` | MUST BE USED for MQL qualification and sales handoff automation. Configures score threshold triggers, SFDC lead sync,... | `marketo-mql-handoff-orchestrator.md` |
| `marketo-observability-orchestrator` | Master coordinator for the Marketo observability layer. Orchestrates bulk extract jobs, coordinates data normalizatio... | `marketo-observability-orchestrator.md` |
| `marketo-orchestrator` | MUST BE USED for complex multi-step Marketo operations. Coordinates workflows with mandatory validation, automated er... | `marketo-orchestrator.md` |
| `marketo-performance-optimizer` | Use PROACTIVELY for Marketo performance optimization, API efficiency, rate limit management, and system health monito... | `marketo-performance-optimizer.md` |
| `marketo-program-architect` | MUST BE USED for Marketo program creation and structure. Designs program hierarchies, configures channels, manages pr... | `marketo-program-architect.md` |
| `marketo-program-roi-assessor` | MUST BE USED for program ROI analysis, campaign effectiveness assessment, and cost analysis. Performs comprehensive r... | `marketo-program-roi-assessor.md` |
| `marketo-revenue-cycle-analyst` | MUST BE USED for Marketo Revenue Cycle Modeling (RCM) analysis. Analyzes revenue stages, lead flow, success paths, SL... | `marketo-revenue-cycle-analyst.md` |
| `marketo-sfdc-sync-specialist` | MUST BE USED for Salesforce-Marketo sync management, field mapping validation, and sync error resolution. Manages bid... | `marketo-sfdc-sync-specialist.md` |
| `marketo-smart-campaign-api-specialist` | MUST BE USED for programmatic Smart Campaign CRUD operations via REST API. Creates, reads, updates, clones, and delet... | `marketo-smart-campaign-api-specialist.md` |
| `marketo-webinar-orchestrator` | MUST BE USED for end-to-end webinar campaign management. Orchestrates program creation, email sequences, registration... | `marketo-webinar-orchestrator.md` |

#### Commands

| Command | Args | Description | File |
|---------|------|-------------|------|
| `/activity-report` | `[--days=N] [--type=email|web|form|all] [--program=id]` | Generate activity summary report for specified time period without full data export | `activity-report.md` |
| `/analyze-performance` | `[--scope=campaign|program|full] [--type=performance|engagement|funnel|anomaly]` | Trigger Claude analysis on Marketo data and generate optimization recommendations | `analyze-performance.md` |
| `/api-usage` | `[--period=today|week|month] [--detail] [--forecast]` | Track Marketo API usage, rate limits, and quota consumption | `api-usage.md` |
| `/bulk-export-wizard` | `[--type=leads|activities] [--days=N] [--format=CSV|TSV]` | Interactive wizard for bulk export of leads and activities from Marketo | `bulk-export-wizard.md` |
| `/clone-campaign-wizard` | `[--source=id] [--target-folder=id] [--name=string] [--batch]` | Interactive wizard to clone Smart Campaigns with validation and customization | `clone-campaign-wizard.md` |
| `/configure-mql-handoff` | `[--threshold=N] [--assignment=round-robin|territory|account]` | Interactive wizard to set up MQL qualification and sales handoff workflows | `configure-mql-handoff.md` |
| `/create-email-program` | `[--template=id] [--folder=id]` | Interactive wizard to create Marketo email programs with A/B testing | `create-email-program.md` |
| `/create-nurture-program` | `[--type=drip|lifecycle|onboarding] [--folder=id]` | Interactive wizard to create Marketo engagement programs (nurture streams) | `create-nurture-program.md` |
| `/create-scoring-model` | `[--type=combined|behavioral|demographic] [--mql-threshold=N]` | Interactive wizard to design and implement lead scoring models in Marketo | `create-scoring-model.md` |
| `/create-smart-campaign` | `[--type=trigger|batch|request] [--program=id]` | Interactive wizard to create Marketo smart campaigns with best practices | `create-smart-campaign.md` |
| `/diagnose-campaign` | `[campaign-id] [--issue=type]` | Interactive wizard for diagnosing Marketo campaign issues | `diagnose-campaign.md` |
| `/diagnose-lead-routing` | `[--lead-id=id | --email=user@example.com] [--since=iso] [--campaign=id] [--pr...` | Diagnose Marketo lead routing failures with canonical identity, membership, timeline, and smart-list correlation | `diagnose-lead-routing.md` |
| `/extract-wizard` | `[--type=leads|activities|programs] [--days=N] [--quick]` | Interactive wizard to configure and run Marketo bulk exports | `extract-wizard.md` |
| `/launch-webinar` | `[--template=id] [--date=YYYY-MM-DD] [--provider=zoom|gotowebinar|webex]` | Interactive wizard for end-to-end webinar campaign creation and launch | `launch-webinar.md` |
| `/lead-quality-report` | `[instance] [--sample=size] [--segment=filter]` | Generate a comprehensive lead quality report for your Marketo database | `lead-quality-report.md` |
| `/marketo-audit` | `[instance] [--scope=full|quick] [--focus=leads|programs|campaigns|emails|sync]` | Run comprehensive audit of Marketo instance covering leads, programs, and sync | `marketo-audit.md` |
| `/marketo-auth` | `[action] [instance]` | Configure or verify Marketo authentication and credentials | `marketo-auth.md` |
| `/marketo-governance-audit` | `[instance] [--mode=manual|hybrid] [--required-tags=TagA,TagB]` | Run a governance audit with manual evidence and automated checks | `marketo-governance-audit.md` |
| `/marketo-instance` | `[action] [instance-name]` | Switch or manage Marketo instances (production, sandbox, etc.) | `marketo-instance.md` |
| `/marketo-leads` | `[action] [options]` | Query, create, update, or manage leads in Marketo | `marketo-leads.md` |
| `/marketo-logs` | `[--type=activity_type] [--lead=id] [--since=date] [--limit=count]` | Retrieve and filter Marketo activity logs for debugging and analysis | `marketo-logs.md` |
| `/marketo-preflight` | `<operation> [--target=id]` | Run pre-flight validation checks before executing operations in Marketo | `marketo-preflight.md` |
| `/monitor-sync` | `[--errors] [--queue] [--mappings] [--full]` | Real-time monitoring of Marketo-Salesforce synchronization status and errors | `monitor-sync.md` |
| `/observability-dashboard` | `[--full] [--json]` | Display current observability metrics, quota status, and recent Claude insights | `observability-dashboard.md` |
| `/observability-setup` | `[--portal=<name>] [--schedule=daily|hourly] [--quick]` | Configure the Marketo observability layer for continuous marketing intelligence | `observability-setup.md` |
| `/orchestrate-program` | `[--template=id] [--name=string] [--folder=id]` | Interactive wizard for end-to-end program deployment from template | `orchestrate-program.md` |
| `/remediate-lead-routing` | `--incident-id=id [--mode=dry-run|execute] [--idempotency-key=key]` | Safely remediate lead routing incidents with idempotency and explicit confirmation gates | `remediate-lead-routing.md` |
| `/smart-campaign-api` | `[--operation=create|read|update|clone|delete|activate] [--examples]` | Quick reference for Smart Campaign REST API endpoints and usage | `smart-campaign-api.md` |
| `/smart-list-snapshot` | `[campaigns|assets|both] [--label=name] [--portal=id]` | Snapshot and diff Smart List rules for campaign and asset backups | `smart-list-snapshot.md` |
| `/sync-program-to-sfdc` | `[--program=id] [--campaign=id] [--direction=bidirectional|marketo-to-sfdc|sfd...` | Interactive wizard to configure Marketo program to Salesforce campaign sync | `sync-program-to-sfdc.md` |

#### Skills

| Skill | Description | File |
|-------|-------------|------|
| `atomic-json-state-manager` | Use atomic, race-safe JSON state persistence patterns for Marketo hooks and observability flows. | `atomic-json-state-manager/SKILL.md` |
| `marketo-agentic-automation` | Marketo agentic automation patterns and best practices. Use for autonomous program deployment, bulk operations, orche... | `marketo-agentic-automation/SKILL.md` |
| `marketo-api-reference` | Marketo REST API patterns, authentication, and common operations. Use when integrating with Marketo, building automat... | `marketo-api-reference/SKILL.md` |
| `marketo-bulk-import-recovery-playbook` | Handle hook-driven post-bulk-import recovery, warning triage, and safe retry operations. | `marketo-bulk-import-recovery-playbook/SKILL.md` |
| `marketo-campaign-diagnostics-framework` | Marketo campaign incident triage and diagnostics with structured intake, evidence-first root cause analysis, safe rem... | `marketo-campaign-diagnostics-framework/SKILL.md` |
| `marketo-campaign-execution-operations` | Marketo campaign execution operations for activation readiness, email blast delivery, webinar and engagement program ... | `marketo-campaign-execution-operations/SKILL.md` |
| `marketo-change-safety-guardrails` | Apply hook guardrails for high-impact Marketo mutation operations with preflight checks and rollback safety. | `marketo-change-safety-guardrails/SKILL.md` |
| `marketo-governance-audit-framework` | Marketo governance and quarterly audit framework covering instance standards, automation guardrails, operational inci... | `marketo-governance-audit-framework/SKILL.md` |
| `marketo-incident-response-playbook` | Structured incident response for Marketo campaign, routing, and sync failures. | `marketo-incident-response-playbook/SKILL.md` |
| `marketo-instance-lifecycle-operations` | Operate Marketo instance lifecycle hooks for session context, auth continuity, and instance quirk detection. | `marketo-instance-lifecycle-operations/SKILL.md` |
| `marketo-lead-routing-diagnostics` | Deterministic API-first diagnostics for Marketo lead routing incidents, including identity resolution, membership sna... | `marketo-lead-routing-diagnostics/SKILL.md` |
| `marketo-lead-scoring-methodology` | Marketo lead scoring model design methodology with two-dimensional scoring (behavior + demographic). Use when designi... | `marketo-lead-scoring-methodology/SKILL.md` |
| `marketo-mql-handoff-framework` | Marketo MQL qualification and sales handoff workflow patterns. Use when configuring MQL qualification triggers, setti... | `marketo-mql-handoff-framework/SKILL.md` |
| `marketo-observability-layer` | Claude-powered continuous marketing intelligence using Marketo Bulk Extract APIs | `marketo-observability-layer/SKILL.md` |
| `marketo-rollout-gates-framework` | Apply preflight and launch gates for Marketo program and campaign deployments. | `marketo-rollout-gates-framework/SKILL.md` |
| `marketo-sfdc-integration-patterns` | Marketo-Salesforce synchronization patterns and best practices. Use when configuring sync settings, troubleshooting s... | `marketo-sfdc-integration-patterns/SKILL.md` |
| `marketo-smart-campaign-api-reference` | Marketo Smart Campaigns REST API reference. Use when creating, reading, updating, cloning, or deleting campaigns via ... | `marketo-smart-campaign-api-reference/SKILL.md` |

#### Hooks

- `api-limit-monitor` (`api-limit-monitor.sh`): Hook: api-limit-monitor
- `campaign-diagnostic-reminder` (`campaign-diagnostic-reminder.sh`): Hook: campaign-diagnostic-reminder
- `error-handler` (`lib/error-handler.sh`): Marketo Plugin Error Handler
- `observability-quota-monitor` (`observability-quota-monitor.sh`): Observability Quota Monitor Hook
- `post-bulk-import` (`post-bulk-import.sh`): Hook: post-bulk-import
- `post-campaign-create` (`post-campaign-create.sh`): Hook: post-campaign-create
- `post-extract-complete` (`post-extract-complete.sh`): Post-Extract Complete Hook
- `post-instance-authentication` (`post-instance-authentication.sh`): Post Instance Authentication Hook - Marketo Plugin
- `post-operation-verification` (`post-operation-verification.sh`): Hook: post-operation-verification
- `pre-bulk-export` (`pre-bulk-export.sh`): Hook: pre-bulk-export
- `pre-bulk-operation` (`pre-bulk-operation.sh`): Hook: pre-bulk-operation
- `pre-campaign-activation` (`pre-campaign-activation.sh`): Hook: pre-campaign-activation
- `pre-campaign-clone` (`pre-campaign-clone.sh`): Hook: pre-campaign-clone
- `pre-campaign-delete` (`pre-campaign-delete.sh`): Hook: pre-campaign-delete
- `pre-intelligence-analysis` (`pre-intelligence-analysis.sh`): Pre-Intelligence Analysis Hook
- `pre-lead-merge` (`pre-lead-merge.sh`): Hook: pre-lead-merge
- `pre-observability-extract` (`pre-observability-extract.sh`): Pre-Observability Extract Hook
- `pre-orchestration` (`pre-orchestration.sh`): Hook: pre-orchestration
- `session-start-marketo` (`session-start-marketo.sh`): Session Start Hook - Marketo Plugin
- `sync-error-monitor` (`sync-error-monitor.sh`): Hook: sync-error-monitor

---

### opspal-mcp-client

- Version: `1.0.2`
- Status: `active`
- Path: `plugins/opspal-mcp-client`
- Manifest: `plugins/opspal-mcp-client/.claude-plugin/plugin.json`
- Description: OpsPal MCP Client - Thin client plugin with 3 hooks, 1 script for OpsPal proprietary IP server connectivity, client-side validation, and usage tracking. Ships no IP - only wiring.

#### Agents

_None_

#### Commands

_None_

#### Skills

| Skill | Description | File |
|-------|-------------|------|
| `opspal-mcp-input-validation-framework` | Validate OpsPal MCP scoring and compute tool inputs with hook-enforced schema prechecks and guardrails. | `opspal-mcp-input-validation-framework/SKILL.md` |
| `opspal-mcp-usage-budget-governance` | Track and govern daily OpsPal MCP usage budgets using post-tool hooks and threshold-based warnings. | `opspal-mcp-usage-budget-governance/SKILL.md` |

#### Hooks

- `post-opspal-usage` (`post-opspal-usage.sh`): Post-call usage tracker for all OpsPal MCP tools.
- `pre-opspal-compute` (`pre-opspal-compute.sh`): Pre-validation for OpsPal compute-heavy tools (revenue model, scenarios, market sizing).
- `pre-opspal-scoring` (`pre-opspal-scoring.sh`): Pre-validation for OpsPal scoring tools.

---

### opspal-monday

- Version: `1.4.5`
- Status: `experimental`
- Path: `plugins/opspal-monday`
- Manifest: `plugins/opspal-monday/.claude-plugin/plugin.json`
- Description: [EXPERIMENTAL] Monday.com board and item management: CRUD operations, batch processing, file catalog generation, CSV/JSON import/export, and cross-board operations.

#### Agents

| Agent | Description | File |
|-------|-------------|------|
| `monday-batch-operator` | Handles bulk Monday.com operations with parallel processing, rate limiting, and error recovery. Use for large-scale i... | `monday-batch-operator.md` |
| `monday-board-analyzer` | Analyze Monday.com board exports to identify structure, columns, and generate configuration | `monday-board-analyzer.md` |
| `monday-board-manager` | Manages Monday.com boards - creation, configuration, archival, and permissions. Use for board-level operations. | `monday-board-manager.md` |
| `monday-file-catalog-generator` | Transform Monday.com board exports into normalized file catalogs for CRM ingestion | `monday-file-catalog-generator.md` |
| `monday-file-extractor` | Download attachments from Monday.com items/boards with optional catalog generation for CRM import. | `monday-file-extractor.md` |
| `monday-item-manager` | Manages Monday.com items - create, update, delete, column values, and subitems. Use for item-level operations. | `monday-item-manager.md` |

#### Commands

| Command | Args | Description | File |
|---------|------|-------------|------|
| `/monday-files` | `[--item <id>|--update <id>|--board <id>] [--include-updates] [--output <path>]` | Extract file attachments from Monday.com items, updates, or entire boards | `monday-files.md` |

#### Skills

| Skill | Description | File |
|-------|-------------|------|
| `monday-agent-operations-framework` | Operate monday.com board/item/file workflows with safe batching, validation, and rollback-aware execution. | `monday-agent-operations-framework/SKILL.md` |
| `monday-change-validation-and-rollback` | Validate Monday changes with before/after diffing and generate deterministic rollback procedures. | `monday-change-validation-and-rollback/SKILL.md` |
| `monday-data-patterns` | Monday.com data structure patterns, URL formats, and file matching strategies | `monday-data-patterns.md` |

#### Hooks

_None_

---

### opspal-salesforce

- Version: `3.79.0`
- Status: `active`
- Path: `plugins/opspal-salesforce`
- Manifest: `plugins/opspal-salesforce/.claude-plugin/plugin.json`
- Description: Salesforce metadata, CPQ/RevOps assessments, Flow automation with intelligent segmentation, layout management, and permission sets with automated error prevention. Now with deterministic Report CRUD pipeline: ReportPlan contract, type fallback engine, constraint auto-correction, semantic disambiguation, preflight auto-repair, patch-based updates, dependency-aware deletion, and operational telemetry. 92 agents.

#### Agents

| Agent | Description | File |
|-------|-------------|------|
| `apex-debug-analyst` | Automatically routes for Apex debug analysis. Analyzes debug logs, execution tracing, and governor limit troubleshoot... | `apex-debug-analyst.md` |
| `benchmark-research-agent` | Retrieves verified industry benchmarks from authoritative sources with full citations. Use when assessment agents nee... | `benchmark-research-agent.md` |
| `compliance-report-generator` | Generates compliance reports for SOC2, GDPR, HIPAA requirements. Audits data access, retention policies, and security... | `compliance-report-generator.md` |
| `flow-batch-operator` | Automatically routes for batch Flow operations. Parallel processing on multiple Flows with optimization. | `flow-batch-operator.md` |
| `flow-diagnostician` | Automatically routes for Flow diagnostics. Orchestrates pre-flight validation, execution testing, and coverage analysis. | `flow-diagnostician.md` |
| `flow-log-analyst` | Automatically routes for Flow log analysis. Parses debug logs to extract Flow execution details and identify errors. | `flow-log-analyst.md` |
| `flow-segmentation-specialist` | Automatically routes for Flow segmentation. Segment-by-segment Flow building with complexity tracking and templates. | `flow-segmentation-specialist.md` |
| `flow-template-specialist` | Automatically routes for Flow templates. Applies and customizes Salesforce Flow templates for common patterns. | `flow-template-specialist.md` |
| `flow-test-orchestrator` | Automatically routes for Flow testing. Orchestrates execution testing with test data management and result analysis. | `flow-test-orchestrator.md` |
| `permission-orchestrator` | MUST BE USED for permission set creation. Provides centralized two-tier architecture with merge-safe operations and i... | `permission-orchestrator.md` |
| `permission-segmentation-specialist` | Automatically routes for permission segmentation. Segment-by-segment permission set building with complexity tracking. | `permission-segmentation-specialist.md` |
| `response-validator` | Automatically routes for response validation. Validates plausibility, statistical accuracy, and consistency with auto... | `response-validator.md` |
| `sfdc-advocate-assignment` | Automatically routes for advocate assignment. Manages Customer Advocate provisioning, agency-account matching, and fu... | `sfdc-advocate-assignment.md` |
| `sfdc-agent-governance` | Use PROACTIVELY for agent governance. Manages risk assessment, approval workflows, audit trails, and compliance enfor... | `sfdc-agent-governance.md` |
| `sfdc-apex` | Use PROACTIVELY for Apex development. Handles code writing, tests, and code review. Not for metadata deploy packaging. | `sfdc-apex.md` |
| `sfdc-apex-developer` | Use PROACTIVELY for Apex development. Develops triggers, classes, batch jobs, test classes, and custom REST/SOAP serv... | `sfdc-apex-developer.md` |
| `sfdc-api-monitor` | Use PROACTIVELY for API monitoring. Generates usage reports and provides optimization recommendations to prevent quot... | `sfdc-api-monitor.md` |
| `sfdc-architecture-auditor` | MUST BE USED for architecture audits. Validates architectural decisions, enforces ADR documentation, and generates he... | `sfdc-architecture-auditor.md` |
| `sfdc-assignment-rules-manager` | Orchestrates Salesforce Assignment Rules for Lead and Case objects with conflict detection, metadata deployment, and ... | `sfdc-assignment-rules-manager.md` |
| `sfdc-automation-auditor` | MUST BE USED for automation or flow audits. Performs comprehensive Salesforce automation analysis with 13+ automation... | `sfdc-automation-auditor.md` |
| `sfdc-automation-builder` | Use PROACTIVELY for automation creation. Creates flows, process builders, workflow rules, and approval processes with... | `sfdc-automation-builder.md` |
| `sfdc-bulkops-orchestrator` | Autonomous bulk DML orchestrator with batched execution, parallel validation, checkpointing, and audit trails for lar... | `sfdc-bulkops-orchestrator.md` |
| `sfdc-bulkops-validator` | Read-only sub-agent that validates bulk operation batch results by querying Salesforce to confirm expected values | `sfdc-bulkops-validator.md` |
| `sfdc-cli-executor` | Automatically routes for SF CLI execution. Handles metadata operations, data queries, Apex, and org management via OA... | `sfdc-cli-executor.md` |
| `sfdc-communication-manager` | Use PROACTIVELY for communication features. Manages email templates, letterheads, mass email, deliverability, and com... | `sfdc-communication-manager.md` |
| `sfdc-compliance-officer` | Use PROACTIVELY for compliance requirements. Manages GDPR, HIPAA, SOC, data privacy, audit trails, and regulatory com... | `sfdc-compliance-officer.md` |
| `sfdc-conflict-resolver` | MUST BE USED for deployment conflicts. Detects and resolves Salesforce metadata conflicts, field type incompatibiliti... | `sfdc-conflict-resolver.md` |
| `sfdc-cpq-assessor` | MUST BE USED for CPQ, quote, or pricing assessments. Performs comprehensive Salesforce CPQ analysis with mandatory da... | `sfdc-cpq-assessor.md` |
| `sfdc-cpq-specialist` | Use PROACTIVELY for CPQ configuration. Configures pricing, quotes, product bundles, discount schedules, and revenue o... | `sfdc-cpq-specialist.md` |
| `sfdc-csv-enrichment` | Automatically routes for CSV enrichment. Enriches CSV data with Salesforce IDs through fuzzy matching and validation. | `sfdc-csv-enrichment.md` |
| `sfdc-dashboard-analyzer` | Automatically routes for dashboard analysis. Extracts business process definitions for object migration while preserv... | `sfdc-dashboard-analyzer.md` |
| `sfdc-dashboard-designer` | Use PROACTIVELY for dashboard design. Focuses on audience-specific KPIs, visual hierarchy, and performance optimization. | `sfdc-dashboard-designer.md` |
| `sfdc-dashboard-migrator` | Automatically routes for dashboard migration. Migrates dashboards and reports between objects preserving business logic. | `sfdc-dashboard-migrator.md` |
| `sfdc-dashboard-optimizer` | Automatically routes for dashboard optimization. Optimizes layouts for performance, validates components, and ensures... | `sfdc-dashboard-optimizer.md` |
| `sfdc-data-export-manager` | Automatically routes for data exports. Handles backups, intelligent field selection, and streaming exports with memor... | `sfdc-data-export-manager.md` |
| `sfdc-data-generator` | Automatically routes for mock data generation. Creates business-appropriate data with referential integrity for demos... | `sfdc-data-generator.md` |
| `sfdc-data-import-manager` | Automatically routes for data imports. Handles CSV validation, bulk ingestion, and field mapping with pre-flight vali... | `sfdc-data-import-manager.md` |
| `sfdc-data-operations` | MUST BE USED for data import/export operations. Orchestrates Salesforce data operations by routing to specialized age... | `sfdc-data-operations.md` |
| `sfdc-dedup-safety-copilot` | Automatically routes for safe deduplication. Type 1/2 error detection and data-first survivor selection for Account m... | `sfdc-dedup-safety-copilot.md` |
| `sfdc-dependency-analyzer` | Use PROACTIVELY for dependency analysis. Determines optimal execution order, identifies circular dependencies, and pl... | `sfdc-dependency-analyzer.md` |
| `sfdc-deployment-manager` | MUST BE USED for Salesforce deployments. Manages deployments with comprehensive validation pipeline, automated error ... | `sfdc-deployment-manager.md` |
| `sfdc-discovery` | Use PROACTIVELY for org analysis. Read-only discovery of objects, flows, permissions, and integration points with rec... | `sfdc-discovery.md` |
| `sfdc-einstein-admin` | Use PROACTIVELY for Einstein configuration. Configures AI predictions, recommendation strategies, and machine learnin... | `sfdc-einstein-admin.md` |
| `sfdc-enrichment-manager` | Manages data enrichment for upserted records. Implements waterfall enrichment strategy, stage-aligned enrichment, and... | `sfdc-enrichment-manager.md` |
| `sfdc-field-analyzer` | Use PROACTIVELY for field analysis. Provides intelligent field discovery, validation rule analysis, and pre-operation... | `sfdc-field-analyzer.md` |
| `sfdc-integration-specialist` | Use PROACTIVELY for integrations. Manages APIs, connected apps, external services, middleware, and real-time event st... | `sfdc-integration-specialist.md` |
| `sfdc-layout-analyzer` | Use PROACTIVELY for layout analysis. Analyzes Lightning Pages and Classic Layouts for quality, performance, and UX. | `sfdc-layout-analyzer.md` |
| `sfdc-layout-deployer` | MUST BE USED for layout deployments. Orchestrates deployment of FlexiPages, Layouts, and CompactLayouts with validati... | `sfdc-layout-deployer.md` |
| `sfdc-layout-generator` | Use PROACTIVELY for layout generation. Creates optimized Lightning Pages using fieldInstance pattern and persona temp... | `sfdc-layout-generator.md` |
| `sfdc-lead-auto-converter` | Automated Lead conversion with match-then-convert workflow. Prevents duplicate Contacts, manages Contact roles, prese... | `sfdc-lead-auto-converter.md` |
| `sfdc-lightning-developer` | Use PROACTIVELY for Lightning development. Creates LWC, Aura components, and custom UI experiences for Salesforce app... | `sfdc-lightning-developer.md` |
| `sfdc-lucid-diagrams` | Automatically routes for Lucid diagrams. Creates architecture diagrams for Salesforce with multi-tenant isolation and... | `sfdc-lucid-diagrams.md` |
| `sfdc-merge-orchestrator` | MUST BE USED for object or field merges. Orchestrates Salesforce object and field merge operations with data migratio... | `sfdc-merge-orchestrator.md` |
| `sfdc-metadata` | Automatically routes for metadata deploys. Handles flows, layouts, permissions, and package.xml management. Not for A... | `sfdc-metadata.md` |
| `sfdc-metadata-analyzer` | Use PROACTIVELY for metadata analysis. Extracts validation rules, flows, layouts, and profiles dynamically without ha... | `sfdc-metadata-analyzer.md` |
| `sfdc-metadata-manager` | MUST BE USED for metadata management. Manages Salesforce metadata with comprehensive validation, automated error reco... | `sfdc-metadata-manager.md` |
| `sfdc-object-auditor` | Use PROACTIVELY for object audits. Performs comprehensive metadata analysis providing insights, usage statistics, and... | `sfdc-object-auditor.md` |
| `sfdc-orchestrator` | MUST BE USED for complex multi-step Salesforce operations. Coordinates workflows with mandatory validation, automated... | `sfdc-orchestrator.md` |
| `sfdc-ownership-router` | Handles ownership assignment for upserted records. Evaluates assignment rules, territory assignments, round-robin que... | `sfdc-ownership-router.md` |
| `sfdc-performance-optimizer` | Use PROACTIVELY for performance optimization. Handles query optimization, indexing, governor limits, storage manageme... | `sfdc-performance-optimizer.md` |
| `sfdc-permission-assessor` | Use PROACTIVELY for permission assessment. Interactive wizard for fragmentation discovery, overlap analysis, and cons... | `sfdc-permission-assessor.md` |
| `sfdc-permission-orchestrator` | MUST BE USED for permission set management. Provides centralized two-tier architecture with merge-safe operations and... | `sfdc-permission-orchestrator.md` |
| `sfdc-planner` | Use PROACTIVELY before implementations. Creates detailed plans with impact analysis and presents changes for approval... | `sfdc-planner.md` |
| `sfdc-quality-auditor` | Use PROACTIVELY for quality auditing. Continuous metadata auditing with health checks, drift detection, and compliance. | `sfdc-quality-auditor.md` |
| `sfdc-query-specialist` | Use PROACTIVELY for complex SOQL queries. Builds, optimizes, and executes queries with performance monitoring and err... | `sfdc-query-specialist.md` |
| `sfdc-remediation-executor` | Use PROACTIVELY for remediation execution. Executes phased fixes from metadata analysis with rollback capability and ... | `sfdc-remediation-executor.md` |
| `sfdc-renewal-import` | Automatically routes for renewal imports. Handles bulk renewal opportunity imports with validation, mapping, and advo... | `sfdc-renewal-import.md` |
| `sfdc-report-designer` | Use PROACTIVELY for report design. Focuses on format selection, field organization, grouping strategies, and performa... | `sfdc-report-designer.md` |
| `sfdc-report-template-deployer` | Automatically routes for report template deployment. Deploys reports from templates with 95%+ field resolution rate. | `sfdc-report-template-deployer.md` |
| `sfdc-report-type-manager` | Automatically routes for report type management. Discovers types, maps UI names to API tokens, and surfaces available... | `sfdc-report-type-manager.md` |
| `sfdc-report-validator` | Automatically routes for report validation. Pre-validates report configurations to prevent deployment failures. | `sfdc-report-validator.md` |
| `sfdc-reports-dashboards` | MUST BE USED for report or dashboard creation. Creates and manages Salesforce reports and dashboards with advanced AP... | `sfdc-reports-dashboards.md` |
| `sfdc-reports-usage-auditor` | Automatically routes for report usage audits. Analyzes 6-month usage patterns, classifies by department, identifies g... | `sfdc-reports-usage-auditor.md` |
| `sfdc-revops-auditor` | MUST BE USED for RevOps, pipeline, or forecast audits. Performs comprehensive Salesforce assessments with statistical... | `sfdc-revops-auditor.md` |
| `sfdc-revops-coordinator` | Use PROACTIVELY for RevOps coordination. Orchestrates audits, optimizations, and monitoring across RevOps tasks. | `sfdc-revops-coordinator.md` |
| `sfdc-sales-operations` | Use PROACTIVELY for sales operations. Manages lead routing, assignment rules, sales processes, territory management, ... | `sfdc-sales-operations.md` |
| `sfdc-security-admin` | MUST BE USED for Salesforce security operations. Manages profiles, permission sets, roles, sharing rules, and user pr... | `sfdc-security-admin.md` |
| `sfdc-service-cloud-admin` | Use PROACTIVELY for Service Cloud configuration. Manages Cases, Knowledge Articles, Service Console, Omni-Channel rou... | `sfdc-service-cloud-admin.md` |
| `sfdc-state-discovery` | MUST BE USED before org modifications. Performs comprehensive state discovery, metadata comparison, and drift detecti... | `sfdc-state-discovery.md` |
| `sfdc-territory-assignment` | Manages Salesforce Territory2 user and account assignments. Handles bulk assignments, duplicate prevention, exclusion... | `sfdc-territory-assignment.md` |
| `sfdc-territory-deployment` | Executes Salesforce Territory2 changes with validation and rollback support. Deploys models, creates territories, and... | `sfdc-territory-deployment.md` |
| `sfdc-territory-discovery` | Read-only analysis of Salesforce Territory2 configuration. Discovers territory models, hierarchies, user assignments,... | `sfdc-territory-discovery.md` |
| `sfdc-territory-monitor` | Monitors Salesforce Territory2 operations and health. Queries Territory2AlignmentLog, Territory2ModelHistory, and gen... | `sfdc-territory-monitor.md` |
| `sfdc-territory-orchestrator` | MUST BE USED for territory management operations. Master coordinator for Territory2 model lifecycle, hierarchy manage... | `sfdc-territory-orchestrator.md` |
| `sfdc-territory-planner` | Designs Salesforce Territory2 structures and plans territory changes. Creates hierarchy designs, metadata packages, a... | `sfdc-territory-planner.md` |
| `sfdc-ui-customizer` | Use PROACTIVELY for UI customization. Manages page layouts, Lightning pages, record types, list views, and interface ... | `sfdc-ui-customizer.md` |
| `sfdc-upsert-error-handler` | Manages error queue for failed upsert operations. Implements automatic retry with exponential backoff, partial failur... | `sfdc-upsert-error-handler.md` |
| `sfdc-upsert-matcher` | Intelligent matching engine for Lead/Contact/Account upsert operations. Handles unique identifier matching, fuzzy mat... | `sfdc-upsert-matcher.md` |
| `sfdc-upsert-orchestrator` | MUST BE USED for Lead/Contact/Account upsert operations. Orchestrates matching, enrichment, conversion, ownership rou... | `sfdc-upsert-orchestrator.md` |
| `trigger-orchestrator` | MUST BE USED for Apex trigger creation. Master orchestrator with handler pattern architecture, bulkification validati... | `trigger-orchestrator.md` |
| `trigger-segmentation-specialist` | Automatically routes for trigger segmentation. Segments complex Apex trigger logic into handler methods with bulkific... | `trigger-segmentation-specialist.md` |
| `validation-rule-orchestrator` | MUST BE USED for validation rule creation. Provides centralized management with segmented formula authoring and compl... | `validation-rule-orchestrator.md` |
| `validation-rule-segmentation-specialist` | Automatically routes for validation rule segmentation. Segment-by-segment formula authoring with complexity tracking. | `validation-rule-segmentation-specialist.md` |
| `win-loss-analyzer` | Analyzes closed deals to extract win/loss patterns and competitive intelligence. Identifies success factors and compe... | `win-loss-analyzer.md` |

#### Commands

| Command | Args | Description | File |
|---------|------|-------------|------|
| `/activate-flows` | `[options]` | Interactive guide for Salesforce flow activation with comprehensive troubleshooting | `activate-flows.md` |
| `/analyze-decay-risk` | `<org-alias>` | Predict report and dashboard abandonment using leading indicators (ownership changes, usage velocity, dependency stal... | `analyze-decay-risk.md` |
| `/analyze-layout` | `--object {Object} --org {org-alias}` | Analyze Lightning Pages and Classic Layouts for quality, performance, and UX optimization opportunities | `analyze-layout.md` |
| `/apex-logs` | `myorg` | View and retrieve Salesforce debug logs with filtering and analysis options | `apex-logs.md` |
| `/asana-link` | `[options]` | [REDIRECTS TO opspal-core] Link Asana project(s) to current directory | `asana-link.md` |
| `/asana-update` | `[options]` | [REDIRECTS TO opspal-core] Update Asana tasks based on local work | `asana-update.md` |
| `/assess-permissions` | `[initiative-name]` | Launch interactive permission set assessment wizard to discover fragmentation and plan consolidation | `assess-permissions.md` |
| `/audit-automation` | `[options]` | Run comprehensive Salesforce automation audit with conflict detection and remediation planning | `audit-automation.md` |
| `/audit-reports` | `<org-alias>` | Comprehensive 6-month usage audit for Salesforce reports and dashboards | `audit-reports.md` |
| `/bulkops` | `<execute|dry-run|resume|audit|rollback> <operation> <object> [csv-path] --org...` | Autonomous bulk Salesforce operations with checkpointing, validation, and audit trails | `bulkops.md` |
| `/check-trust-erosion` | `<org-alias>` | Detect trust erosion signals in Salesforce reports and dashboards (shadow reports, metric inconsistencies, ownership ... | `check-trust-erosion.md` |
| `/checkdependencies` | `[options]` | [REDIRECTS TO opspal-core] Check and install plugin dependencies | `checkdependencies.md` |
| `/compliance-report` | `[soc2|gdpr|hipaa] [--org <alias>] [--format markdown|pdf|json]` | Generate compliance reports for SOC2, GDPR, HIPAA with security configuration audits | `compliance-report.md` |
| `/context7-status` | `[options]` | Check Context7 MCP server status and agent integration | `context7-status.md` |
| `/cpq-preflight` | `[org-alias]` | Run comprehensive pre-flight validation before CPQ assessments | `cpq-preflight.md` |
| `/create-permission-set` | `--name Sales_Manager --template sales-user` | Interactive wizard to create permission sets from templates with complexity tracking and segmentation support | `create-permission-set.md` |
| `/create-trigger` | `--object Account --template cascade-update` | Interactive wizard to create Apex triggers from templates with test classes | `create-trigger.md` |
| `/create-validation-rule` | `[--template <id>] [--object <name>] [--custom] [--formula <formula>] [--targe...` | Interactive wizard for creating validation rules using templates or custom formulas | `create-validation-rule.md` |
| `/debug-cleanup` | `myorg` | Clean up expired trace flags and old debug logs from a Salesforce org | `debug-cleanup.md` |
| `/debug-start` | `myorg` | Start debug log capture for a Salesforce org with configurable presets | `debug-start.md` |
| `/debug-stop` | `myorg` | Stop debug log capture and cleanup trace flags on a Salesforce org | `debug-stop.md` |
| `/dedup` | `{action} {org} [params]` | Unified interface for Salesforce Account deduplication operations with Type 1/2 error prevention | `dedup.md` |
| `/deploy-layout` | `--source {path} --org {org-alias}` | Deploy Salesforce layouts (FlexiPages, Layouts, CompactLayouts) with validation, backup, and profile assignments | `deploy-layout.md` |
| `/deploy-report-template` | `\\` | Deploy a report from template with automated field resolution | `deploy-report-template.md` |
| `/design-layout` | `--object {Object} --persona {persona} --org {org-alias}` | Generate optimized Salesforce Lightning Page using proven fieldInstance pattern and AI-guided persona templates | `design-layout.md` |
| `/diagnose-report-access` | `[report-type] [--org <alias>] [--user <username>] [--permission-set <name>] [...` | Diagnose and fix Salesforce report access issues by analyzing report type permission requirements | `diagnose-report-access.md` |
| `/extract-user-reports` | `[options]` | Extract reports and dashboards created by a specific user and generate reusable templates | `extract-user-reports.md` |
| `/flow-add` | `./flows/Account_Processing.flow-meta.xml \\` | Add an element to a Salesforce Flow with natural language and real-time complexity tracking | `flow-add.md` |
| `/flow-analyze-segments` | `<FlowName> --org <alias>` | Analyze existing Salesforce Flow for logical segment patterns, complexity distribution, and segmentation recommendati... | `flow-analyze-segments.md` |
| `/flow-diagnose` | `Account_Validation_Flow gamma-corp --type preflight \\` | Run comprehensive Flow diagnostic workflows combining preflight, execution, and coverage analysis | `flow-diagnose.md` |
| `/flow-edit` | `<FlowName> \"<instruction>\" --org <alias>` | Safe minor edits to Salesforce Flows without segmentation overhead. Best for quick changes to simple flows. | `flow-edit.md` |
| `/flow-extract-subflow` | `<FlowName> --segment <SegmentName> --org <alias>` | Extract flow elements into a separate subflow. Supports segment-based, element-based, and interactive selection. | `flow-extract-subflow.md` |
| `/flow-interactive-build` | `<flowName> --org <alias> [--resume] [--testing-enabled] [--strict-mode]` | Interactive wizard for segment-by-segment Flow building with complexity tracking and templates | `flow-interactive-build.md` |
| `/flow-logs` | `gamma-corp --latest` | Retrieve and parse Salesforce debug logs for Flow execution analysis | `flow-logs.md` |
| `/flow-preflight` | `Account_Validation_Flow gamma-corp` | Run pre-flight validation checks before Flow execution or deployment | `flow-preflight.md` |
| `/flow-segment-complete` | `./flows/Account_Processing.flow-meta.xml --validate --org gamma-corp` | Complete the current segment in a Salesforce Flow with comprehensive validation | `flow-segment-complete.md` |
| `/flow-segment-list` | `./flows/Account_Processing.flow-meta.xml --org gamma-corp` | List all segments in a Salesforce Flow with summary statistics and recommendations | `flow-segment-list.md` |
| `/flow-segment-start` | `./flows/Account_Processing.flow-meta.xml Input_Validation --org gamma-corp` | Start a new segment in a Salesforce Flow with complexity tracking and template guidance | `flow-segment-start.md` |
| `/flow-segment-status` | `./flows/Account_Processing.flow-meta.xml --org gamma-corp` | Get status of current or all segments in a Salesforce Flow with complexity tracking | `flow-segment-status.md` |
| `/flow-test` | `Account_Validation_Flow gamma-corp \\` | Execute Salesforce Flow with test data and capture execution results | `flow-test.md` |
| `/flow-versions` | `<flow-developer-name> --org <org-alias>` | Show all versions of a Salesforce Flow with status, activation info, and version comparison | `flow-versions.md` |
| `/initialize` | `[options]` | [REDIRECTS TO opspal-core] Initialize project structure | `initialize.md` |
| `/lead-convert` | `<action> [--org <alias>] [--options...]` | Convert Leads to Contacts/Accounts with duplicate prevention and optional Opportunity creation | `lead-convert.md` |
| `/monitor-logs` | `myorg` | Real-time debug log monitoring for a Salesforce org with filtering and alerting | `monitor-logs.md` |
| `/playwright-test` | `[options]` | Test Playwright browser automation setup and session status for Salesforce | `playwright-test.md` |
| `/q2c-audit` | `[options]` | Generate comprehensive Q2C/CPQ configuration audit with automated diagram generation | `q2c-audit.md` |
| `/qa-execute` | `[options]` | Execute fresh QA tests against the current Salesforce org state | `qa-execute.md` |
| `/qa-review` | `[options]` | Review and analyze existing QA test reports without executing new tests | `qa-review.md` |
| `/routing-help` | `[options]` | Display routing system rules, complexity scoring, and agent selection guide | `routing-help.md` |
| `/score-actionability` | `<dashboard-file-or-org>` | Evaluate dashboard component actionability using 5-criteria weighted scoring to identify vanity metrics | `score-actionability.md` |
| `/sfpageaudit` | `--object {Object} --org {org-alias}` | Analyze Lightning Record Page field assignments for any Salesforce object | `sfpageaudit.md` |
| `/suggest-agent` | `[options]` | Analyze task and suggest the most appropriate specialized agent | `suggest-agent.md` |
| `/territory-assignment-wizard` | `[options]` | Interactive wizard for assigning users and accounts to territories | `territory-assignment-wizard.md` |
| `/territory-discovery` | `[org-alias]` | Discover and analyze current territory configuration with health metrics and hierarchy visualization | `territory-discovery.md` |
| `/territory-validator` | `[operation] [options]` | Pre-validate territory operations before execution to prevent errors | `territory-validator.md` |
| `/upsert` | `<action> [file|query] [--org <alias>] [--options...]` | Unified interface for Lead/Contact/Account upsert operations with matching, enrichment, and conversion | `upsert.md` |
| `/validate-approval-framework` | `[options]` | Run pre-deployment validation for Salesforce custom approval frameworks | `validate-approval-framework.md` |
| `/validate-lwc` | `[options]` | Run pre-deployment validation for Lightning Web Components (LWC) | `validate-lwc.md` |
| `/win-loss` | `[period] [--competitor <name>] [--org <alias>]` | Analyze closed deals to extract win/loss patterns and competitive intelligence | `win-loss.md` |

#### Skills

| Skill | Description | File |
|-------|-------------|------|
| `assignment-rules-framework` | Seven-phase framework for Salesforce Lead/Case assignment rule design, validation, deployment, and conflict prevention. | `assignment-rules-framework/SKILL.md` |
| `automation-audit-framework` | Salesforce automation audit methodology. Use when auditing Flows, Process Builders, Workflow Rules, Apex Triggers, or... | `automation-audit-framework/SKILL.md` |
| `automation-building-patterns` | Salesforce automation feasibility analysis and building patterns. Use when creating flows, process builders, workflow... | `automation-building-patterns/SKILL.md` |
| `compact-layout-guide` | Salesforce Compact Layout design and management. Use when selecting fields for the highlights panel, creating visual ... | `compact-layout-guide/SKILL.md` |
| `cpq-assessment` | Salesforce CPQ assessment methodology. Use when evaluating CPQ configuration, pricing rules, product bundles, discoun... | `cpq-assessment/SKILL.md` |
| `data-quality-operations-framework` | Continuous Salesforce data-quality operations for field population monitoring, integration health checks, null handli... | `data-quality-operations-framework/SKILL.md` |
| `deployment-state-management-framework` | Stateful Salesforce deployment control for retrieve-compare-validate-deploy-verify loops with idempotent re-runs and ... | `deployment-state-management-framework/SKILL.md` |
| `deployment-validation-framework` | Salesforce deployment validation and error recovery methodology. Use when deploying metadata, validating deployments,... | `deployment-validation-framework/SKILL.md` |
| `field-metadata-dependency-matrix-integrity-framework` | Enforce field-level metadata dependency integrity across record types, picklists, and formulas. | `field-metadata-dependency-matrix-integrity-framework/SKILL.md` |
| `flow-diagnostics-observability-framework` | Salesforce Flow diagnostics and observability framework for test strategy, execution tracing, failure triage, product... | `flow-diagnostics-observability-framework/SKILL.md` |
| `flow-production-incident-response-framework` | Salesforce Flow production incident response framework for runtime diagnostics, service restoration, rollback trigger... | `flow-production-incident-response-framework/SKILL.md` |
| `flow-scanner-integration` | Flow Scanner Integration - Auto-fix, SARIF output, configuration-driven validation | `flow-scanner-integration/SKILL.md` |
| `flow-segmentation-guide` | Flow segmentation methodology for complexity management, pattern detection, and safe editing. Use when editing flows,... | `flow-segmentation-guide/SKILL.md` |
| `flow-xml-lifecycle-framework` | Salesforce Flow XML lifecycle orchestration for authoring, design selection, validation, testing, deployment, monitor... | `flow-xml-lifecycle-framework/SKILL.md` |
| `hook-inline-node-execution-hardening-framework` | Harden inline Node execution in shell hooks with deterministic IO contracts and failure propagation. | `hook-inline-node-execution-hardening-framework/SKILL.md` |
| `hook-log-retention-and-rotation-framework` | Standardize Salesforce hook log size rotation and retention to prevent oversized files and runaway disk growth. | `hook-log-retention-and-rotation-framework/SKILL.md` |
| `joined-report-engineering-framework` | Salesforce joined-report engineering framework for multi-block design, cross-block formulas, deployment validation, a... | `joined-report-engineering-framework/SKILL.md` |
| `layout-cli-api-reference` | Salesforce layout CLI and API operations. Use when creating, retrieving, modifying, or deploying page layouts, Lightn... | `layout-cli-api-reference/SKILL.md` |
| `layout-planning-guide` | Persona-based page layout planning for Salesforce. Use when designing layouts for different user roles, deciding fiel... | `layout-planning-guide/SKILL.md` |
| `lightning-page-design-guide` | Lightning Record Page design and deployment guidance. Use when building Lightning pages in App Builder, selecting pag... | `lightning-page-design-guide/SKILL.md` |
| `metadata-dependency-patterns` | Salesforce metadata dependency analysis and safe deletion patterns. Use when deleting fields, analyzing metadata depe... | `metadata-dependency-patterns/SKILL.md` |
| `operations-readiness-framework` | Salesforce operational readiness baseline combining environment configuration and data-quality health checks. Use whe... | `operations-readiness-framework/SKILL.md` |
| `package-xml-manifest-governance-framework` | Harden package.xml interpretation and enforcement for metadata dependency safety. | `package-xml-manifest-governance-framework/SKILL.md` |
| `performance-optimization-guide` | Salesforce performance optimization methodology and investigation tools. Use when optimizing slow queries, managing g... | `performance-optimization-guide/SKILL.md` |
| `report-api-development-framework` | Salesforce report API lifecycle for format selection, REST vs Metadata API implementation, joined report handling, va... | `report-api-development-framework/SKILL.md` |
| `report-dashboard-validator-contract-adapter-framework` | Keep hook-call contracts aligned with report/dashboard validator module exports and payload shapes. | `report-dashboard-validator-contract-adapter-framework/SKILL.md` |
| `report-type-reference` | Salesforce report type discovery, field mapping, and format compatibility. Use when discovering report types, mapping... | `report-type-reference/SKILL.md` |
| `revops-assessment-framework` | Revenue Operations assessment methodology for Salesforce. Use when evaluating GTM architecture, pipeline health, sale... | `revops-assessment-framework/SKILL.md` |
| `salesforce-assessment-to-execution-automation-framework` | Automate post-assessment hook workflows from assessment completion to planning triggers and knowledge sync. | `salesforce-assessment-to-execution-automation-framework/SKILL.md` |
| `salesforce-context-budgeting-framework` | Control Salesforce hook-injected context size with deterministic prioritization, token budgets, and overflow markers. | `salesforce-context-budgeting-framework/SKILL.md` |
| `salesforce-deployment-quality-gates-framework` | Salesforce deployment quality-gate framework for pre-deploy validation orchestration, report/flow checks, and post-de... | `salesforce-deployment-quality-gates-framework/SKILL.md` |
| `salesforce-hook-governance-framework` | Salesforce hook governance framework for risk scoring, approval gating, tiered tool restrictions, and audit-trail enf... | `salesforce-hook-governance-framework/SKILL.md` |
| `salesforce-hook-reliability-circuit-breaker-framework` | Salesforce hook reliability framework using circuit-breaker patterns for failure containment, cooldown recovery, and ... | `salesforce-hook-reliability-circuit-breaker-framework/SKILL.md` |
| `salesforce-metadata-standards` | Salesforce metadata best practices and naming conventions. Use when creating fields, objects, flows, validation rules... | `salesforce-metadata-standards/SKILL.md` |
| `salesforce-notification-and-stop-automation-framework` | Salesforce notification and stop-hook automation framework for matcher-based notifications and prompt-based stop trig... | `salesforce-notification-and-stop-automation-framework/SKILL.md` |
| `salesforce-org-alias-and-path-compliance-framework` | Salesforce org-alias and path compliance framework for preventing hardcoded org aliases and enforcing correct project... | `salesforce-org-alias-and-path-compliance-framework/SKILL.md` |
| `salesforce-org-context-detection-framework` | Salesforce org context detection framework for auto-detecting target org, loading org quirks, and propagating consist... | `salesforce-org-context-detection-framework/SKILL.md` |
| `salesforce-permission-propagation-and-field-readiness-framework` | Manage hook workflows for permission sync and post-field-deployment readiness validation. | `salesforce-permission-propagation-and-field-readiness-framework/SKILL.md` |
| `salesforce-query-safety-framework` | Salesforce query safety framework for SOQL and jq preflight validation, command linting, and prevention of unsafe que... | `salesforce-query-safety-framework/SKILL.md` |
| `salesforce-runtime-telemetry-and-api-quota-framework` | Operate telemetry and API quota tracking hooks for Salesforce command workflows and alert thresholds. | `salesforce-runtime-telemetry-and-api-quota-framework/SKILL.md` |
| `salesforce-task-risk-routing-framework` | Salesforce task risk-routing framework for mandatory agent selection on high-risk operations, advisory routing for me... | `salesforce-task-risk-routing-framework/SKILL.md` |
| `screen-flow-hybrid-delivery-framework` | Salesforce Screen Flow hybrid-delivery framework for automation feasibility, XML-vs-UI boundaries, manual-step handof... | `screen-flow-hybrid-delivery-framework/SKILL.md` |
| `security-governance-framework` | Salesforce security administration governance and common mistake prevention. Use when managing profiles, permission s... | `security-governance-framework/SKILL.md` |
| `soql-large-result-paging-framework` | Handle large Salesforce query result sets safely using LIMIT, pagination, and chunked extraction workflows. | `soql-large-result-paging-framework/SKILL.md` |
| `territory-management` | Salesforce Territory2 management methodology. Use when managing territory models, hierarchies, user assignments, acco... | `territory-management/SKILL.md` |
| `territory-operations-observability-framework` | Salesforce Territory2 runtime operations framework for testing, deployment activation, monitoring, and troubleshootin... | `territory-operations-observability-framework/SKILL.md` |
| `trigger-development-framework` | Salesforce Apex trigger development lifecycle for design, handler architecture, bulkification, testing, deployment, a... | `trigger-development-framework/SKILL.md` |
| `upsert-compliance-forensics-framework` | Salesforce upsert compliance and forensics framework for evidence-grade audit trails, incident reconstruction, contro... | `upsert-compliance-forensics-framework/SKILL.md` |
| `upsert-governance-observability-framework` | Salesforce upsert governance and observability controls for ownership routing, audit logging, operational transparenc... | `upsert-governance-observability-framework/SKILL.md` |
| `upsert-orchestration-guide` | Lead/Contact/Account upsert methodology including matching, enrichment, conversion, and error handling. Use when impo... | `upsert-orchestration-guide/SKILL.md` |
| `validation-rule-impact-analysis-framework` | Salesforce validation-rule impact analysis framework for pre-deploy blast-radius estimation, phased rollout planning,... | `validation-rule-impact-analysis-framework/SKILL.md` |
| `validation-rule-lifecycle-framework` | End-to-end Salesforce validation rule lifecycle for design, testing, deployment, monitoring, rollback, and segmented ... | `validation-rule-lifecycle-framework/SKILL.md` |
| `validation-rule-patterns` | Validation rule formula patterns and templates for Salesforce. Use when creating validation rules, writing formula lo... | `validation-rule-patterns/SKILL.md` |
| `xml-roundtrip-fidelity-framework` | Preserve Salesforce metadata XML semantic fidelity across parse, transform, and reserialization paths. | `xml-roundtrip-fidelity-framework/SKILL.md` |

#### Hooks

- `agent-usage-validator` (`agent-usage-validator.sh`): Agent Usage Validator Hook for Claude Code
- `hook-circuit-breaker` (`hook-circuit-breaker.sh`): Hook Circuit Breaker - Graceful degradation for hook failures
- `post-agent-operation` (`post-agent-operation.sh`): Post-Agent-Operation Hook
- `post-assessment-notebooklm-sync` (`post-assessment-notebooklm-sync.sh`): Post-Assessment NotebookLM Sync Hook
- `post-assessment-planning-trigger` (`post-assessment-planning-trigger.sh`): Post-Assessment Planning Trigger
- `post-bash-error-handler` (`post-bash-error-handler.sh`): Post-Bash Error Handler Hook
- `post-discovery-field-dictionary` (`post-discovery-field-dictionary.sh`): Post-Discovery Field Dictionary Hook
- `post-field-deployment` (`post-field-deployment.sh`): post-field-deployment.sh - Verify field accessibility after deployment
- `post-operation-observe` (`post-operation-observe.sh`): Post-Operation Observer Hook
- `post-org-auth` (`post-org-auth.sh`): Post-Org Authentication Hook
- `post-sf-command` (`post-sf-command.sh`): # Post-SF-Command Hook - API Usage Tracking
- `post-sf-query-validation` (`post-sf-query-validation.sh`): Post-SF Query Validation Hook
- `post-territory-operation-logger` (`post-territory-operation-logger.sh`): Post-Territory Operation Logger Hook
- `pre-bash-jq-validator` (`pre-bash-jq-validator.sh`): Pre-Bash jq Validator Hook
- `pre-bash-soql-validator` (`pre-bash-soql-validator.sh`): Pre-Bash SOQL Validator Hook
- `pre-batch-validation` (`pre-batch-validation.sh`): Pre-Batch Validation Hook
- `pre-dashboard-report-check` (`pre-dashboard-report-check.sh`): Pre-Dashboard Report Check Hook
- `pre-deploy-flow-validation` (`pre-deploy-flow-validation.sh`): Pre-Deployment Flow Validation Hook
- `pre-deploy-report-quality-gate` (`pre-deploy-report-quality-gate.sh`): Pre-Deployment Report Quality Gate Hook
- `pre-deployment-comprehensive-validation` (`pre-deployment-comprehensive-validation.sh`): Pre-Deployment Comprehensive Validation Hook
- `pre-deployment-permission-sync` (`pre-deployment-permission-sync.sh`): Pre-Deployment Permission Sync Hook
- `pre-flow-deployment` (`pre-flow-deployment.sh`): Pre-Flow Deployment Hook
- `pre-high-risk-operation` (`pre-high-risk-operation.sh`): Pre-High-Risk-Operation Hook
- `pre-operation-org-validation` (`pre-operation-org-validation.sh`): Pre-Operation Org Validation Hook
- `pre-org-operation-validation` (`pre-org-operation-validation.sh`): Pre-Org Operation Validation Hook
- `pre-picklist-dependency-validation` (`pre-picklist-dependency-validation.sh`): Pre-Picklist-Dependency Validation Hook
- `pre-sfdc-metadata-manager-invocation` (`pre-sfdc-metadata-manager-invocation.sh`): Pre-Agent Hook: sfdc-metadata-manager Progressive Disclosure
- `pre-soql-validation` (`pre-soql-validation.sh`): Pre-SOQL Validation Hook
- `pre-task-context-loader` (`pre-task-context-loader.sh`): Pre-Task Context Loader Hook
- `pre-task-hook` (`pre-task-hook.sh`): Pre-Task Agent Discovery & Organization Enforcement Hook
- `pre-task-mandatory` (`pre-task-mandatory.sh`): Pre-Task Mandatory Hook - Enforces agent usage for critical operations
- `pre-territory-migration-validator` (`pre-territory-migration-validator.sh`): pre-territory-migration-validator.sh
- `pre-territory-write-validator` (`pre-territory-write-validator.sh`): Pre-Territory Write Validator Hook
- `pre-tool-use` (`pre-tool-use.sh`): PreToolUse Hook - Enforce disallowedTools for Task tool invocations
- `pre-tool-use-territory-rule-validator` (`pre-tool-use-territory-rule-validator.sh`): Pre-Tool-Use Territory Rule Validator Hook
- `pre-write-alias-linter` (`pre-write-alias-linter.sh`): Pre-Write Alias Linter
- `session-start-agent-reminder` (`session-start-agent-reminder.sh`): Session Start Agent Reminder Hook
- `soql-enhancer` (`pre-tool-use/soql-enhancer.sh`): SOQL Enhancement Hook (PreToolUse)
- `universal-agent-governance` (`universal-agent-governance.sh`): Universal Agent Governance Hook
- `validate-sfdc-project-location` (`validate-sfdc-project-location.sh`): MANDATORY: Validates that SFDC projects are created in correct location

---

_End of auto-generated catalog._
