# Salesforce Plugin System Architecture

**Version**: 3.18.0
**Last Updated**: 2025-10-20

## Overview

This diagram illustrates the comprehensive architecture of the Salesforce Plugin, showing the flow from user interactions through validation hooks, orchestration layers, specialized agents, script libraries, and external integrations. The plugin supports enterprise-scale operations with 10k+ bulk operations and parallel execution patterns.

## System Architecture Diagram

```mermaid
graph TB
    %% User Interaction Layer
    subgraph USER["👤 User Interaction Layer"]
        NLI[Natural Language Input]
        CMD[22 Slash Commands<br/>/reflect /dedup /cpq-preflight<br/>/audit-automation /qa-review]
    end

    %% Pre-Operation Hook Layer
    subgraph PREHOOKS["🛡️ Pre-Operation Validation Hooks"]
        PRETASK[pre-task-validation.sh<br/>Task domain validation]
        PREREFLECT[pre-reflect.sh<br/>Context preparation]
        PREBATCH[pre-batch-operation.sh<br/>Bulk operation validation]
        PREROUTE[pre-task-agent-router.sh<br/>Automatic agent routing]
        PREHYBRID[pre-task-hybrid-router.sh<br/>Smart agent selection]
    end

    %% Orchestration Layer
    subgraph ORCHESTRATION["🎯 Master Orchestration Layer"]
        ORGRESOLVE[Org Resolution &<br/>Context Loading]
        ORCHESTRATOR[sfdc-orchestrator<br/>Master Coordinator]
        PLANNER[sfdc-planner<br/>Strategic Planning]
        VALIDATOR[response-validator<br/>Quality Assurance]
    end

    %% Specialist Agent Categories
    subgraph METADATA["📦 Metadata Management<br/>(6 agents)"]
        META1[sfdc-metadata-manager]
        META2[sfdc-metadata-analyzer]
        META3[sfdc-field-manager]
        META4[sfdc-conflict-resolver]
        META5[sfdc-dependency-analyzer]
        META6[sfdc-merge-orchestrator]
    end

    subgraph SECURITY["🔒 Security & Compliance<br/>(4 agents)"]
        SEC1[sfdc-security-admin]
        SEC2[sfdc-compliance-officer]
        SEC3[sfdc-fls-manager]
        SEC4[sfdc-sharing-architect]
    end

    subgraph DATA["💾 Data Operations<br/>(6 agents)"]
        DATA1[sfdc-data-operations]
        DATA2[sfdc-data-generator]
        DATA3[sfdc-dedup-safety-copilot]
        DATA4[sfdc-csv-enrichment]
        DATA5[sfdc-query-optimizer]
        DATA6[sfdc-bulk-loader]
    end

    subgraph CPQ["💰 CPQ/RevOps<br/>(8 agents)"]
        CPQ1[sfdc-cpq-assessor]
        CPQ2[sfdc-cpq-specialist]
        CPQ3[sfdc-revops-auditor]
        CPQ4[sfdc-revops-coordinator]
        CPQ5[sfdc-renewal-import]
        CPQ6[sfdc-advocate-assignment]
        CPQ7[sfdc-territory-manager]
        CPQ8[sfdc-sales-operations]
    end

    subgraph AUTOMATION["⚙️ Automation<br/>(7 agents)"]
        AUTO1[sfdc-automation-auditor]
        AUTO2[sfdc-automation-builder]
        AUTO3[sfdc-flow-developer]
        AUTO4[sfdc-approval-architect]
        AUTO5[sfdc-process-migration]
        AUTO6[sfdc-validation-expert]
        AUTO7[sfdc-trigger-architect]
    end

    subgraph DEVELOPMENT["👨‍💻 Development<br/>(7 agents)"]
        DEV1[sfdc-apex-developer]
        DEV2[sfdc-apex-test-specialist]
        DEV3[sfdc-cli-executor]
        DEV4[sfdc-lwc-developer]
        DEV5[sfdc-integration-architect]
        DEV6[sfdc-deployment-manager]
        DEV7[sfdc-sandbox-manager]
    end

    subgraph REPORTING["📊 Reporting & Analytics<br/>(7 agents)"]
        RPT1[sfdc-report-designer]
        RPT2[sfdc-dashboard-designer]
        RPT3[sfdc-dashboard-analyzer]
        RPT4[sfdc-dashboard-migrator]
        RPT5[sfdc-dashboard-optimizer]
        RPT6[sfdc-usage-auditor]
        RPT7[sfdc-analytics-consultant]
    end

    subgraph AI["🤖 AI/Advanced<br/>(3 agents)"]
        AI1[sfdc-layout-designer]
        AI2[sfdc-layout-ux-analyzer]
        AI3[sfdc-ai-consultant]
    end

    subgraph SPECIALIZED["🎯 Specialized<br/>(6 agents)"]
        SPEC1[sfdc-communication-manager]
        SPEC2[sfdc-migration-specialist]
        SPEC3[sfdc-state-discovery]
        SPEC4[sfdc-quality-auditor]
        SPEC5[sfdc-remediation-executor]
        SPEC6[sfdc-performance-optimizer]
    end

    %% Script Libraries Layer
    subgraph SCRIPTS["📚 Script Libraries (364+ scripts in 11 categories)"]
        SCRIPT1[Orchestration<br/>28 scripts]
        SCRIPT2[Bulk Operations<br/>15 scripts]
        SCRIPT3[Query/Data<br/>22 scripts]
        SCRIPT4[Field/Metadata<br/>32 scripts]
        SCRIPT5[Validation/Quality<br/>28 scripts]
        SCRIPT6[Flow Management<br/>18 scripts]
        SCRIPT7[Layout/UI<br/>18 scripts]
        SCRIPT8[Deployment/Rollback<br/>22 scripts]
        SCRIPT9[Deduplication<br/>34 scripts]
        SCRIPT10[Analysis/Reporting<br/>32 scripts]
        SCRIPT11[Integration/Utilities<br/>52+ scripts]
    end

    %% Execution Layer
    subgraph EXECUTION["⚡ Parallel Execution Engine"]
        PARALLEL[Parallel Bulk Operations<br/>5k-record batches]
        CIRCUIT[Circuit Breaker<br/>Resilience]
        CACHE[Org Context Cache<br/>Performance]
        INTEGRITY[Real Data Integrity<br/>NO_MOCKS=1]
    end

    %% Post-Operation Hook Layer
    subgraph POSTHOOKS["✅ Post-Operation Hooks"]
        POSTCAP[post-result-capture.sh<br/>Result collection]
        POSTSUPA[post-supabase-submit.sh<br/>Reflection storage]
        POSTHEALTH[post-health-dashboard.sh<br/>System monitoring]
        POSTNOTIFY[post-slack-notify.sh<br/>Notifications]
    end

    %% External Integrations
    subgraph EXTERNAL["🌐 External Integrations"]
        SFDC[Salesforce APIs<br/>SOQL, Metadata, Tooling]
        ASANA[Asana<br/>Task Management]
        SUPABASE[Supabase<br/>Reflection Storage]
        SLACK[Slack<br/>Notifications]
    end

    %% Flow connections - User to Hooks
    NLI --> PREHOOKS
    CMD --> PREHOOKS

    %% Pre-hooks to Orchestration
    PRETASK --> ORGRESOLVE
    PREREFLECT --> ORGRESOLVE
    PREBATCH --> ORGRESOLVE
    PREROUTE --> ORCHESTRATOR
    PREHYBRID --> ORCHESTRATOR

    %% Orchestration to Specialists
    ORGRESOLVE --> ORCHESTRATOR
    ORGRESOLVE --> PLANNER
    ORCHESTRATOR --> METADATA
    ORCHESTRATOR --> SECURITY
    ORCHESTRATOR --> DATA
    ORCHESTRATOR --> CPQ
    ORCHESTRATOR --> AUTOMATION
    ORCHESTRATOR --> DEVELOPMENT
    ORCHESTRATOR --> REPORTING
    ORCHESTRATOR --> AI
    ORCHESTRATOR --> SPECIALIZED
    PLANNER --> ORCHESTRATOR

    %% Specialists to Scripts
    METADATA --> SCRIPTS
    SECURITY --> SCRIPTS
    DATA --> SCRIPTS
    CPQ --> SCRIPTS
    AUTOMATION --> SCRIPTS
    DEVELOPMENT --> SCRIPTS
    REPORTING --> SCRIPTS
    AI --> SCRIPTS
    SPECIALIZED --> SCRIPTS

    %% Scripts to Execution
    SCRIPTS --> EXECUTION

    %% Execution to Validator
    EXECUTION --> VALIDATOR

    %% Validator to Post-hooks
    VALIDATOR --> POSTHOOKS

    %% Post-hooks to External
    POSTCAP --> EXTERNAL
    POSTSUPA --> SUPABASE
    POSTHEALTH --> EXTERNAL
    POSTNOTIFY --> SLACK

    %% External Systems connections
    EXECUTION --> SFDC
    POSTCAP --> ASANA

    %% Styling
    classDef userLayer fill:#e3f2fd,stroke:#1976d2,stroke-width:2px
    classDef hookLayer fill:#fff3e0,stroke:#f57c00,stroke-width:2px
    classDef orchLayer fill:#f3e5f5,stroke:#7b1fa2,stroke-width:2px
    classDef agentLayer fill:#e8f5e9,stroke:#388e3c,stroke-width:2px
    classDef scriptLayer fill:#fff9c4,stroke:#f9a825,stroke-width:2px
    classDef execLayer fill:#fce4ec,stroke:#c2185b,stroke-width:2px
    classDef extLayer fill:#e0f2f1,stroke:#00796b,stroke-width:2px

    class USER userLayer
    class PREHOOKS,POSTHOOKS hookLayer
    class ORCHESTRATION orchLayer
    class METADATA,SECURITY,DATA,CPQ,AUTOMATION,DEVELOPMENT,REPORTING,AI,SPECIALIZED agentLayer
    class SCRIPTS scriptLayer
    class EXECUTION execLayer
    class EXTERNAL extLayer
```

## Architecture Components

### 1. User Interaction Layer (Blue)
- **Natural Language Input**: Conversational requests to Claude Code
- **22 Slash Commands**: Specialized commands like `/reflect`, `/dedup`, `/cpq-preflight`, `/audit-automation`

### 2. Pre-Operation Validation Hooks (Orange)
Automatic quality gates that run before operations:
- **pre-task-validation.sh**: Validates task domain and routing
- **pre-reflect.sh**: Prepares context for reflection analysis
- **pre-batch-operation.sh**: Validates bulk operations before execution
- **pre-task-agent-router.sh**: Automatic agent routing based on task
- **pre-task-hybrid-router.sh**: Smart agent selection with user confirmation

### 3. Master Orchestration Layer (Purple)
Central coordination system:
- **Org Resolution & Context Loading**: Resolves Salesforce org aliases and loads cached context
- **sfdc-orchestrator**: Master coordinator that delegates to specialist agents
- **sfdc-planner**: Strategic planning for complex implementations
- **response-validator**: Quality assurance for all agent responses

### 4. Specialist Agent Categories (Green)
57 specialized agents organized into 10 functional domains:
- **Metadata Management** (6): Objects, fields, validation rules, conflicts, dependencies
- **Security & Compliance** (4): Profiles, permission sets, FLS, sharing
- **Data Operations** (6): Bulk imports/exports, deduplication, CSV processing
- **CPQ/RevOps** (8): CPQ assessments, renewals, territory management
- **Automation** (7): Flows, process builder, approval processes, validation rules
- **Development** (7): Apex, LWC, testing, deployment, sandboxes
- **Reporting & Analytics** (7): Reports, dashboards, usage auditing
- **AI/Advanced** (3): AI-powered layout design and UX analysis
- **Specialized** (6): Communication, migration, state discovery, quality auditing

### 5. Script Libraries Layer (Yellow)
364+ JavaScript/Shell scripts organized into 11 functional categories:
- **Orchestration** (28): Multi-agent coordination, workflow management
- **Bulk Operations** (15): Async bulk API, parallel processing
- **Query/Data** (22): Safe query builder, SOQL optimization
- **Field/Metadata** (32): Field managers, metadata parsers
- **Validation/Quality** (28): Preflight validators, data quality checks
- **Flow Management** (18): Flow activation, versioning, migration
- **Layout/UI** (18): Lightning page analysis, layout optimization
- **Deployment/Rollback** (22): Deployment tools, rollback automation
- **Deduplication** (34): Duplicate detection, master selection, merge operations
- **Analysis/Reporting** (32): Impact analysis, usage reports, quality scoring
- **Integration/Utilities** (52+): API wrappers, file utilities, common libraries

### 6. Parallel Execution Engine (Pink)
High-performance execution layer:
- **Parallel Bulk Operations**: Processes 5k-record batches in parallel
- **Circuit Breaker**: Resilience patterns for API failures
- **Org Context Cache**: Performance optimization through caching
- **Real Data Integrity**: NO_MOCKS=1 enforcement (no fake data)

### 7. Post-Operation Hooks (Orange)
Automatic actions after operations complete:
- **post-result-capture.sh**: Collects execution results
- **post-supabase-submit.sh**: Stores reflections in Supabase
- **post-health-dashboard.sh**: Updates monitoring dashboards
- **post-slack-notify.sh**: Sends notifications to Slack channels

### 8. External Integrations (Teal)
Third-party system connections:
- **Salesforce APIs**: SOQL, Metadata API, Tooling API
- **Asana**: Task and project management
- **Supabase**: Reflection storage and analytics
- **Slack**: Real-time notifications

## Key Workflow Patterns

### 1. Discovery → Analysis → Remediation
```
User Request → sfdc-orchestrator → sfdc-state-discovery (current state)
→ sfdc-metadata-analyzer (identify issues) → sfdc-remediation-executor (fix)
→ response-validator (verify) → Results
```

### 2. Parallel Bulk Operations (10k+ records)
```
User Request → pre-batch-operation.sh (validate)
→ sfdc-data-operations → Bulk Operation Scripts (5k batches)
→ Parallel Execution Engine → Circuit Breaker (resilience)
→ post-result-capture.sh → Results
```

### 3. Automatic Agent Routing
```
Natural Language Input → pre-task-agent-router.sh (analyze task)
→ Route to appropriate specialist agent → Execute → Validate
```

### 4. Reflection & Continuous Improvement
```
/reflect command → Analyze session errors → Generate playbook
→ post-supabase-submit.sh → Supabase → /processreflections (internal)
→ Asana tasks → Fix implementation → Update plugin
```

## Legend

### Shape Meanings
- **Rectangles**: Individual components (agents, scripts, tools)
- **Rounded Rectangles (subgraphs)**: Logical groupings of related components
- **Arrows**: Data flow and execution paths

### Color Coding
- **Blue**: User-facing interaction points
- **Orange**: Validation and post-processing hooks
- **Purple**: Master orchestration and coordination
- **Green**: Specialist agent categories
- **Yellow**: Reusable script libraries
- **Pink**: Execution and performance optimization
- **Teal**: External system integrations

### Arrow Types
- **Solid arrows**: Primary execution flow
- All connections show direction of data flow from user input to external systems

## Performance Characteristics

- **Bulk Operation Capacity**: 10k+ records with parallel execution
- **Batch Size**: 5k records per batch
- **Agent Count**: 57 specialized agents across 10 domains
- **Script Library**: 364+ reusable JavaScript/Shell scripts
- **Commands**: 22 slash commands for common operations
- **Hooks**: 15 validation points (8 pre-operation, 7 post-operation)
- **Response Time**: Sub-second for cached org context
- **Reliability**: Circuit breaker patterns for API resilience

## Architecture Principles

1. **Master/Specialist Delegation**: Central orchestrator delegates to domain specialists
2. **Parallel Execution**: Bulk operations split into parallel batches for performance
3. **Validation Gates**: Pre/post hooks ensure quality at every stage
4. **Real Data Integrity**: NO_MOCKS=1 enforcement prevents fake data
5. **Org Resolution**: Dynamic org alias resolution with context caching
6. **Circuit Breaker**: Resilience patterns for external API failures
7. **Continuous Improvement**: Reflection system feeds improvements back to plugin

## Related Documentation

- **Usage Guide**: `.claude-plugin/USAGE.md` - Comprehensive usage instructions
- **Script Library Reference**: `scripts/lib/README.md` - Detailed script documentation
- **Agent Organization**: See agent-specific documentation in `agents/`
- **Hook System**: See hook documentation in `hooks/`
- **Template Library**: `templates/README.md` - Reusable templates

---

**Generated**: 2025-10-20
**Diagram Tool**: Mermaid
**View Online**: Use any Mermaid viewer (GitHub, VS Code, mermaid.live)
