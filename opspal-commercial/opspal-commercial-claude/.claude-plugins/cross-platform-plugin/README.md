# Cross Platform Plugin

Cross-platform operations with 37 agents. Features: offline PPTX generation, Google Slides generation, Asana integration, diagram generation (Mermaid/Lucid), PDF generation, Project Connect onboarding, sales funnel diagnostics, instance management, sub-agent utilization boosting, plugin health diagnostics. v1.35.0: Offline PPTX Generator with embedded fonts and shared slide spec.

## Overview

Cross-platform operations with 37 agents. Features: offline PPTX generation with embedded fonts, Google Slides generation with AI-powered content creation, Asana integration, diagram generation (Mermaid/Lucid), PDF generation, Project Connect onboarding, sales funnel diagnostics, instance management, sub-agent utilization boosting, plugin health diagnostics. v1.35.0: Offline PPTX Generator with embedded fonts and shared slide spec.

This plugin provides 37 agents, 17 scripts, 51 commands.

## Quick Start

### Installation

```bash
/plugin install cross-platform-plugin@revpal-internal-plugins
```

### Verify Installation

```bash
/agents  # Should show 13 cross-platform-plugin agents
```

### Your First Task

Try asking for help with asana-task-manager:
```
User: "Help me manages integration between salesforce and asana, syncing tasks bidirectionally and coordinating project work across both platforms with comprehensive time tracking"
```

## Features

### Offline PPTX Generation (v1.35.0)

Generate branded PowerPoint decks directly from markdown without external APIs.

**Capabilities:**
- **Markdown to PPTX** - Deterministic slide generation with shared slide spec
- **Embedded Fonts** - Merge Montserrat/Figtree fonts from a template PPTX
- **Mermaid Diagrams** - Render Mermaid blocks as images in slides
- **Multi-Doc Collation** - Combine multiple markdown sources into one deck

**Quick Start:**
```bash
/generate-pptx report.md report.pptx
```

**Documentation:**
- [PPTX Generation Guide](docs/PPTX_GENERATION_GUIDE.md)

**Agent:** `pptx-generator`

---

### 📊 Google Slides Generation (v1.25.0)

Create and modify Google Slides presentations with AI-powered content generation.

**Capabilities:**
- **Create from Templates** - Clone RevPal branded template with automatic content population
- **Create from Raw Content** - Generate slides from text, CSV, transcripts, or structured data
- **Modify Existing Decks** - Add, update, or remove slides programmatically
- **AI Content Generation** - LLM creates slide outlines and detailed content
- **Automatic Overflow Handling** - 4-tier strategy (reduce font → abbreviate → split → appendix)
- **Quality Validation** - Enforces RevPal branding and WCAG standards
- **PDF Export** - Export presentations as PDFs

**Quick Start:**
```bash
# Create a new executive brief
"Create an executive brief about Q4 pipeline performance"

# Generate from data
"Create a technical deep dive from sales-data.csv"

# Modify existing presentation
"Add a KPI slide to https://docs.google.com/presentation/d/ABC123"

# Update content
"Update slide 5 to show Q4 2024 revenue of $1.5M"
```

**Key Features:**
- 🎯 AI-powered content generation using Claude
- 📋 Template library (executive brief, customer update, deep dive)
- 🎨 RevPal branding (Montserrat/Figtree fonts, Deep Grape/Slate Indigo colors)
- ✅ Quality gates (branding, content, layout, accessibility)
- 🔧 4-tier overflow resolution
- 📊 8 predefined layouts (Title, Content, KPI, Quote, etc.)

**Documentation:**
- [User Guide](docs/GOOGLE_SLIDES_GUIDE.md) - Complete usage documentation
- [API Reference](docs/GOOGLE_SLIDES_API_REFERENCE.md) - Developer documentation

**Prerequisites:**
```bash
# Google API credentials required
export GOOGLE_APPLICATION_CREDENTIALS=/path/to/credentials.json
```

**Templates:**
- **revpal-master** - Default template (50 slides max)
- **executive-brief** - C-level summaries (15 slides max, BLUF format)
- **customer-update** - QBRs and progress reports (25 slides max)
- **deep-dive** - Technical analysis (50 slides max with appendix)

**Agent:** `google-slides-generator`

**Trigger Keywords:** slides, presentation, deck, google slides, powerpoint, slideshow, pitch deck

---

### Agents
- **asana-task-manager**: Manages integration between Salesforce and Asana, syncing tasks bidirectionally and coordinating project work across both platforms with comprehensive time tracking
- **diagram-generator**: Generates Mermaid diagrams from natural language, metadata, or structured data. Supports flowcharts, ERDs, sequence diagrams, and state diagrams.
- **google-slides-generator**: Use when Google Slides is explicitly requested. Generates decks from templates, raw content, or modifies existing presentations with overflow handling and quality validation.
- **implementation-planner**: Parses build specifications and requirements documents to generate executable Asana project plans with task breakdown, agent assignments, estimates, and dependencies. Orchestrates implementation by delegating to specialized agents.
- **instance-backup**: Manages automated backups of Salesforce instances including metadata, data, and configurations with versioning and restore capabilities
- **instance-deployer**: Manages deployments between Salesforce instances, handles promotion from sandbox to production, and coordinates cross-instance metadata migrations
- **instance-manager**: Manages multiple Salesforce instance projects, handles switching between instances, and maintains instance configurations
- **instance-sync**: Synchronizes configurations, metadata, and data between Salesforce instances, maintains consistency across environments
- **live-wire-sync-test-orchestrator**: Orchestrates complete Live Wire Sync Test workflow for validating bidirectional sync between Salesforce and HubSpot
- **pdf-generator**: Converts markdown documents to professional PDFs with Mermaid diagram rendering, multi-document collation, TOC generation, and custom cover pages.
- **pptx-generator**: Converts markdown to offline PPTX decks with embedded fonts, Mermaid diagrams, and shared slide spec layouts.
- **platform-instance-manager**: Manages multiple platform instances (Salesforce, HubSpot, etc.), handles switching between environments, and maintains platform-agnostic configurations
- **plugin-doctor**: Claude Code diagnostics expert that identifies and resolves plugin installation issues, validates system health, and auto-submits infrastructure reflections when problems are detected
- **project-connect**: Autonomous customer onboarding agent that orchestrates project setup across Supabase, GitHub, Google Drive, and Asana with connect-first strategy and comprehensive logging
- **sales-funnel-diagnostic**: Comprehensive cross-platform sales funnel diagnostic agent that analyzes full pipeline (lead/contact → opportunity → close) with industry-benchmarked analysis, root cause diagnostics, and actionable remediation plans for B2B sales teams
- **uat-orchestrator**: Orchestrates UAT (User Acceptance Testing) workflows including test case building, execution against Salesforce/HubSpot, report generation, and integration with CI/CD pipelines

### Scripts
- **generate-v3-29-0-pdf.js**: Generate PDF from automation audit reports
- **hook-analytics-dashboard.js**: Hook Analytics Dashboard
- **project-connect.js**: Project Connect - Customer Onboarding Orchestrator
- **test-asana-integration-e2e.js**: End-to-End Asana Integration Test
- **test-mermaid-lucid-conversion.js**: Test Mermaid to Lucid JSON Conversion
- **validate-pdf-integration.js**: PDF Integration Validator

### Commands
- **/asana-checkpoint**: # Asana Checkpoint Update
- **/asana-link**: # Link Asana Projects to Current Directory
- **/asana-read**: # Read Asana Tasks
- **/asana-update**: # Update Asana Tasks from HubSpot Work
- **/diagnose-sales-funnel**: # Sales Funnel Diagnostic Command
- **/diagram**: # /diagram - Interactive Diagram Generation Command
- **/generate-pdf**: # Generate PDF Command
- **/generate-pptx**: # Generate PPTX Command
- **/live-wire-sync-test**: # Live Wire Sync Test Command
- **/plan-from-spec**: # Plan from Specification
- **/plugindr**: # Plugin Doctor - System Health Diagnostics
- **/project-connect**: # Project Connect
- **/route**: # Agent Routing Analyzer
- **/routing-health**: # Routing Health Check
- **/uat-build**: # Interactive UAT test case builder using question-based workflow
- **/uat-run**: # Execute UAT tests from CSV workbooks against Salesforce or HubSpot


## Agents

### asana-task-manager
**Description:** Manages integration between Salesforce and Asana, syncing tasks bidirectionally and coordinating project work across both platforms with comprehensive time tracking

**Tools:** Task, mcp_asana_list_workspaces, mcp_asana_search_projects, mcp_asana_get_project, mcp_asana_create_task, mcp_asana_update_task, mcp_asana_get_task, mcp_asana_list_tasks, mcp_asana_add_comment, mcp_asana_attach_file, mcp_salesforce, Read, Write, Grep, TodoWrite, ExitPlanMode

---

### diagram-generator
**Description:** Generates Mermaid diagrams from natural language, metadata, or structured data. Supports flowcharts, ERDs, sequence diagrams, and state diagrams.

**Tools:** Read, Write, Bash, Grep, Glob, TodoWrite, mcp_salesforce, mcp_salesforce_metadata_describe, mcp_hubspot

---

### google-slides-generator
**Description:** Use when Google Slides is explicitly requested or collaboration is required. Generates decks from templates, raw content, or modifies existing presentations with overflow handling and quality validation.

**Tools:** Read, Write, Bash, Grep, Glob, TodoWrite

**Features:**
- Create decks from templates (RevPal master template)
- Create from raw content (text, CSV, transcripts, structured data)
- Modify existing presentations (add/update/remove slides)
- AI-powered content generation (LLM creates outlines and content)
- Automatic overflow handling (4-tier strategy)
- Quality validation (branding, content, layout, accessibility)
- PDF export

**Templates:**
- revpal-master - Default template (50 slides max)
- executive-brief - C-level summaries (15 slides max, BLUF format)
- customer-update - QBRs and progress reports (25 slides max)
- deep-dive - Technical analysis (50 slides max with appendix)

**Example:**
```bash
# Create new executive brief
"Create an executive brief about Q4 pipeline performance"

# Generate from CSV data
"Create a technical deep dive from sales-data.csv"

# Modify existing deck
"Add a KPI slide to https://docs.google.com/presentation/d/ABC123 after slide 3"

# Update content
"In presentation ABC123, update slide 5 to show Q4 2024 revenue"
```

**Documentation:**
- [User Guide](docs/GOOGLE_SLIDES_GUIDE.md) - Complete usage documentation
- [API Reference](docs/GOOGLE_SLIDES_API_REFERENCE.md) - Developer documentation

---

### pptx-generator
**Description:** Converts markdown to offline PPTX decks with embedded fonts, Mermaid diagrams, and shared slide spec layouts.

**Tools:** Read, Write, Bash, Glob, TodoWrite

**Documentation:**
- [PPTX Generation Guide](docs/PPTX_GENERATION_GUIDE.md)

---

### implementation-planner
**Description:** Parses build specifications and requirements documents to generate executable Asana project plans with task breakdown, agent assignments, estimates, and dependencies. Orchestrates implementation by delegating to specialized agents.

**Tools:** Task, mcp_asana_list_workspaces, mcp_asana_search_projects, mcp_asana_get_project, mcp_asana_create_task, mcp_asana_update_task, mcp_asana_get_task, mcp_asana_list_tasks, mcp_asana_add_comment, mcp_asana_get_project_sections, mcp_asana_add_task_dependencies, mcp_asana_create_subtask, mcp_asana_create_project_status, Read, Write, Grep, Glob, TodoWrite, Bash

---

### instance-backup
**Description:** Manages automated backups of Salesforce instances including metadata, data, and configurations with versioning and restore capabilities

**Tools:** Bash, Read, Write, Grep, TodoWrite, mcp_salesforce_data_query

---

### instance-deployer
**Description:** Manages deployments between Salesforce instances, handles promotion from sandbox to production, and coordinates cross-instance metadata migrations

**Tools:** Bash, Read, Write, TodoWrite, ExitPlanMode

---

### instance-manager
**Description:** Manages multiple Salesforce instance projects, handles switching between instances, and maintains instance configurations

**Tools:** Bash, Read, Write, Grep, Glob, TodoWrite

---

### instance-sync
**Description:** Synchronizes configurations, metadata, and data between Salesforce instances, maintains consistency across environments

**Tools:** Bash, Read, Write, Grep, TodoWrite, mcp_salesforce_data_query

---

### live-wire-sync-test-orchestrator
**Description:** Orchestrates complete Live Wire Sync Test workflow for validating bidirectional sync between Salesforce and HubSpot

**Tools:** Bash, Read, Write, Task

---

### pdf-generator
**Description:** Converts markdown documents to professional PDFs with Mermaid diagram rendering, multi-document collation, TOC generation, and custom cover pages.

**Tools:** Read, Write, Bash, Glob, TodoWrite

---

### platform-instance-manager
**Description:** Manages multiple platform instances (Salesforce, HubSpot, etc.), handles switching between environments, and maintains platform-agnostic configurations

**Tools:** Not specified

---

### plugin-doctor
**Description:** Claude Code diagnostics expert that identifies and resolves plugin installation issues, validates system health, and auto-submits infrastructure reflections when problems are detected

**Tools:** Read, Bash, Grep, Glob, mcp__asana__*, Write, TodoWrite

**Example:**
```
bash
# Full diagnostic (default)
/doctor

# Quick health check
/doctor --quick

# Detailed output
/doctor --verbose

# Check specific plugin
/doctor --plugin salesforce-plugin

# JSON output for scripting
/doctor --json

# Check MCP connectivity only
/doctor --mcp

# Attempt automatic fixes
/doctor --fix
```

---

### project-connect
**Description:** Autonomous customer onboarding agent that orchestrates project setup across Supabase, GitHub, Google Drive, and Asana with connect-first strategy and comprehensive logging

**Tools:** mcp__asana__*, Read, Write, Bash, TodoWrite, Grep, ExitPlanMode

---

### sales-funnel-diagnostic
**Description:** Comprehensive cross-platform sales funnel diagnostic agent that analyzes full pipeline (lead/contact → opportunity → close) with industry-benchmarked analysis, root cause diagnostics, and actionable remediation plans for B2B sales teams

**Tools:** Task, mcp_salesforce_data_query, mcp_salesforce, mcp_hubspot_*, Read, Write, Grep, TodoWrite, Bash

---


## Scripts

### generate-v3-29-0-pdf.js
**Purpose:** Generate PDF from automation audit reports

**Usage:**
```bash
node .claude-plugins/cross-platform-plugin/scripts/generate-v3-29-0-pdf.js
```

---

### hook-analytics-dashboard.js
**Purpose:** Hook Analytics Dashboard

**Usage:**
```bash
node .claude-plugins/cross-platform-plugin/scripts/hook-analytics-dashboard.js
```

---

### project-connect.js
**Purpose:** Project Connect - Customer Onboarding Orchestrator

**Usage:**
```bash
node .claude-plugins/cross-platform-plugin/scripts/project-connect.js
```

---

### test-asana-integration-e2e.js
**Purpose:** End-to-End Asana Integration Test

**Usage:**
```bash
node .claude-plugins/cross-platform-plugin/scripts/test-asana-integration-e2e.js
```

---

### test-mermaid-lucid-conversion.js
**Purpose:** Test Mermaid to Lucid JSON Conversion

**Usage:**
```bash
node .claude-plugins/cross-platform-plugin/scripts/test-mermaid-lucid-conversion.js
```

---

### validate-pdf-integration.js
**Purpose:** PDF Integration Validator

**Usage:**
```bash
node .claude-plugins/cross-platform-plugin/scripts/validate-pdf-integration.js
```

---


## Commands

### /asana-checkpoint
# Asana Checkpoint Update

See [commands/asana-checkpoint.md](./commands/asana-checkpoint.md) for detailed usage.

---

### /asana-link
# Link Asana Projects to Current Directory

See [commands/asana-link.md](./commands/asana-link.md) for detailed usage.

---

### /asana-read
# Read Asana Tasks

See [commands/asana-read.md](./commands/asana-read.md) for detailed usage.

---

### /asana-update
# Update Asana Tasks from HubSpot Work

See [commands/asana-update.md](./commands/asana-update.md) for detailed usage.

---

### /diagnose-sales-funnel
# Sales Funnel Diagnostic Command

See [commands/diagnose-sales-funnel.md](./commands/diagnose-sales-funnel.md) for detailed usage.

---

### /diagram
# /diagram - Interactive Diagram Generation Command

See [commands/diagram.md](./commands/diagram.md) for detailed usage.

---

### /generate-pdf
# Generate PDF Command

See [commands/generate-pdf.md](./commands/generate-pdf.md) for detailed usage.

---

### /live-wire-sync-test
# Live Wire Sync Test Command

See [commands/live-wire-sync-test.md](./commands/live-wire-sync-test.md) for detailed usage.

---

### /plan-from-spec
# Plan from Specification

See [commands/plan-from-spec.md](./commands/plan-from-spec.md) for detailed usage.

---

### /plugindr
# Plugin Doctor - System Health Diagnostics

See [commands/plugindr.md](./commands/plugindr.md) for detailed usage.

---

### /project-connect
# Project Connect

See [commands/project-connect.md](./commands/project-connect.md) for detailed usage.

---

### /route
# Agent Routing Analyzer

See [commands/route.md](./commands/route.md) for detailed usage.

---

### /routing-health
# Routing Health Check

See [commands/routing-health.md](./commands/routing-health.md) for detailed usage.

---

### /uat-build
# Interactive UAT Test Case Builder

Build UAT test cases interactively using a question-based workflow.

```bash
/uat-build --platform salesforce --output ./tests/cpq-tests.csv
```

See [commands/uat-build.md](./commands/uat-build.md) for detailed usage.

---

### /uat-run
# Execute UAT Tests

Execute UAT tests from CSV workbooks against Salesforce or HubSpot.

```bash
/uat-run ./tests/qa-workbook.csv --org my-sandbox --epic "CPQ Workflow"
```

**Key Features:**
- Multi-step test scenarios with context management
- Automatic record creation and cleanup
- Report generation (Markdown, CSV, JSON)
- Filter by epic, scenario, or user story

See [commands/uat-run.md](./commands/uat-run.md) for detailed usage.

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
- [Scripts](./scripts/) - Utility scripts
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

**Cross Platform Plugin v1.25.0** - Built by RevPal Engineering
