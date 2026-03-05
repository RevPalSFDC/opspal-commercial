# Asana Integration Architecture Diagram

**Date**: 2026-02-10
**Repository**: opspal-internal-plugins

---

## System Architecture Overview

```mermaid
graph TB
    subgraph "Claude Code Interface"
        CC[Claude Code Agent]
        CMD[Slash Commands]
        HOOKS[Hook System]
    end

    subgraph "MCP Layer"
        MCP[MCP Server<br/>@roychri/mcp-server-asana<br/>40+ tools]

        MCP_WS[Workspace Tools<br/>list_workspaces<br/>search_projects<br/>get_project]
        MCP_TASK[Task Tools<br/>search_tasks<br/>create_task<br/>update_task<br/>get_task]
        MCP_STORY[Story Tools<br/>get_task_stories<br/>create_task_story]
        MCP_DEP[Dependency Tools<br/>add_dependencies<br/>add_dependents]
        MCP_TAG[Tag Tools<br/>get_tags<br/>get_tasks_for_tag]
        MCP_BATCH[Batch Tools<br/>get_multiple_tasks]

        MCP --> MCP_WS
        MCP --> MCP_TASK
        MCP --> MCP_STORY
        MCP --> MCP_DEP
        MCP --> MCP_TAG
        MCP --> MCP_BATCH
    end

    subgraph "Custom Utilities Layer"
        AC[AsanaClient<br/>Retry & Fallback]
        APF[AsanaProjectFilter<br/>Cross-Project Protection]
        ARS[AsanaReflectionSync<br/>Bidirectional Sync]
        AUM[AsanaUserManager<br/>User Mapping]
        AFM[AsanaFollowerManager<br/>Follower Assignment]
        APC[AsanaProjectCreator<br/>Project Creation]
        ACM[AsanaCommentManager<br/>Template Comments]
        ATR[AsanaTaskReader<br/>Task Parsing]
        AUF[AsanaUpdateFormatter<br/>Format Validation]
        AICC[AsanaIntegrationComplianceChecker<br/>Standards Validation]
    end

    subgraph "Automated Workflows"
        REFL[Reflection Processing<br/>process-reflections.js]
        WORK[Work Index Sync<br/>work-index hooks]
        QG[Quality Gates<br/>auto-updates]
    end

    subgraph "Infrastructure"
        CB[Circuit Breaker<br/>Graceful Degradation]
        SAGA[Saga Pattern<br/>Transactional Rollback]
        DLQ[Dead Letter Queue<br/>Failed Operation Retry]
        CACHE[Caching Layer<br/>5-min TTL]
        METRICS[Metrics Collection<br/>Performance Tracking]
    end

    subgraph "External Systems"
        ASANA[Asana REST API<br/>v1.0]
        SUPA[Supabase<br/>Reflection Database]
        SLACK[Slack<br/>Alerts]
    end

    subgraph "Configuration & Storage"
        ENV[Environment Variables<br/>ASANA_ACCESS_TOKEN<br/>ASANA_WORKSPACE_ID<br/>ASANA_PROJECT_GID]
        MCP_CFG[.mcp.json<br/>MCP Configuration]
        LINKS[.asana-links.json<br/>Project Mappings]
        TEMPLATES[templates/asana-updates/<br/>Update Templates]
    end

    %% Connections
    CC --> CMD
    CC --> HOOKS
    CC --> MCP

    CMD --> AC
    CMD --> REFL
    CMD --> WORK

    HOOKS --> QG

    MCP --> ASANA

    AC --> MCP
    AC --> ASANA
    APF --> MCP
    APF --> ASANA
    ARS --> MCP
    ARS --> SUPA

    REFL --> AC
    REFL --> APF
    REFL --> ARS
    REFL --> CB
    REFL --> SAGA
    REFL --> DLQ
    REFL --> CACHE
    REFL --> METRICS
    REFL --> SUPA
    REFL --> ASANA

    WORK --> AC
    WORK --> LINKS

    QG --> AC
    QG --> ACM
    QG --> TEMPLATES

    CB --> ASANA
    SAGA --> ASANA
    DLQ -.-> REFL
    METRICS --> SLACK

    ENV --> MCP_CFG
    MCP_CFG --> MCP

    classDef mcpLayer fill:#E6F3FF,stroke:#0066CC,stroke-width:2px
    classDef utilLayer fill:#E6FFE6,stroke:#00CC00,stroke-width:2px
    classDef workflowLayer fill:#FFF5E6,stroke:#FF9900,stroke-width:2px
    classDef infraLayer fill:#F5E6FF,stroke:#9900CC,stroke-width:2px
    classDef externalLayer fill:#FFE6E6,stroke:#CC0000,stroke-width:2px
    classDef configLayer fill:#F0F0F0,stroke:#666666,stroke-width:2px

    class MCP,MCP_WS,MCP_TASK,MCP_STORY,MCP_DEP,MCP_TAG,MCP_BATCH mcpLayer
    class AC,APF,ARS,AUM,AFM,APC,ACM,ATR,AUF,AICC utilLayer
    class REFL,WORK,QG workflowLayer
    class CB,SAGA,DLQ,CACHE,METRICS infraLayer
    class ASANA,SUPA,SLACK externalLayer
    class ENV,MCP_CFG,LINKS,TEMPLATES configLayer
```

---

## Asana Hierarchy Navigation

```mermaid
graph TD
    WS[Workspace<br/>DEFAULT_WORKSPACE_ID]
    T[Team<br/>Optional grouping]
    P[Project<br/>Board or List view]
    S[Section<br/>Columns/Phases]
    TK[Task<br/>Work item]
    ST[Subtask<br/>Sub-work item]

    WS --> T
    T --> P
    P --> S
    S --> TK
    TK --> ST

    style WS fill:#5F3B8C,color:#fff
    style P fill:#E99560,color:#fff
    style TK fill:#6FBF73,color:#fff
```

## MCP Tool Categories

```mermaid
graph LR
    subgraph "Discovery Tools"
        LW[list_workspaces]
        SP[search_projects]
        ST[search_tasks]
    end

    subgraph "Read Tools"
        GP[get_project]
        GT[get_task]
        GS[get_project_sections]
        GTS[get_task_stories]
        GMT[get_multiple_tasks]
    end

    subgraph "Write Tools"
        CT[create_task]
        UT[update_task]
        CS[create_subtask]
        CTS[create_task_story]
    end

    Discovery --> Read
    Read --> Write

    style Discovery fill:#5F3B8C,color:#fff
    style Read fill:#E99560,color:#fff
    style Write fill:#6FBF73,color:#fff
```

## Custom Utilities Architecture

```mermaid
graph TB
    subgraph "MCP Gap Coverage"
        UM[AsanaUserManager<br/>User mapping & assignment]
        FM[AsanaFollowerManager<br/>Batch follower ops]
        PC[AsanaProjectCreator<br/>Project creation]
        CM[AsanaCommentManager<br/>Template-based comments]
        TR[AsanaTaskReader<br/>Structured parsing]
        PF[AsanaProjectFilter<br/>Cross-project safety]
    end

    subgraph "Direct API Access"
        API[Asana REST API<br/>Node.js HTTPS]
    end

    UM -->|POST /users| API
    FM -->|POST /tasks/{id}/addFollowers| API
    PC -->|POST /workspaces/{id}/projects| API
    CM -->|POST /tasks/{id}/stories| API
    TR -->|GET /tasks/{id}| API
    PF -->|GET /tasks/{id}| API

    style UM fill:#5F3B8C,color:#fff
    style FM fill:#E99560,color:#fff
    style PC fill:#6FBF73,color:#fff
    style API fill:#3E4A61,color:#fff
```

## Navigation Algorithm: Finding a Task

```mermaid
sequenceDiagram
    participant Agent
    participant MCP
    participant Filter
    participant Asana

    Agent->>MCP: search_tasks(text="login", projects_any=P1)
    MCP->>Asana: GET /workspaces/{id}/tasks/search
    Asana-->>MCP: [T1, T2, T3]
    MCP-->>Agent: 3 results

    Agent->>Agent: Inspect results (name, assignee)
    Agent->>Agent: Select T2 as match

    Agent->>MCP: get_task(T2, opt_fields=full)
    MCP->>Asana: GET /tasks/T2
    Asana-->>MCP: Task details
    MCP-->>Agent: Full task object
```

## GOTCHA-001: sections_any Cross-Project Leakage

```mermaid
graph TB
    subgraph "Workspace (W1)"
        subgraph "Project A"
            S1[Section: To Do<br/>GID: S1]
            TA1[Task A1]
            TA2[Task A2]
        end

        subgraph "Project B"
            S2[Section: To Do<br/>GID: S2]
            TB1[Task B1]
            TB2[Task B2]
        end

        subgraph "Project C"
            S3[Section: To Do<br/>GID: S3]
            TC1[Task C1]
        end
    end

    Search[search_tasks<br/>sections_any=S1]
    Wrong[Returns: A1, A2, B1, B2, C1<br/>❌ WRONG]
    Right[search_tasks<br/>sections_any=S1<br/>projects_any=ProjectA]
    Correct[Returns: A1, A2<br/>✅ CORRECT]

    Search -.->|Without projects_any| Wrong
    Right -.->|With projects_any| Correct

    style Wrong fill:#ff6b6b,color:#fff
    style Correct fill:#6FBF73,color:#fff
```

## Update Template Flow

```mermaid
graph LR
    Work[Complete Work]
    Select{Update Type?}
    Progress[Use progress-update.md<br/>< 100 words]
    Blocker[Use blocker-update.md<br/>< 80 words]
    Complete[Use completion-update.md<br/>< 150 words]
    Milestone[Use milestone-update.md<br/>< 200 words]
    Format[Format with metrics]
    Post[create_task_story]

    Work --> Select
    Select -->|Regular checkpoint| Progress
    Select -->|Blocked| Blocker
    Select -->|Task done| Complete
    Select -->|Phase done| Milestone
    Progress --> Format
    Blocker --> Format
    Complete --> Format
    Milestone --> Format
    Format --> Post

    style Progress fill:#5F3B8C,color:#fff
    style Blocker fill:#ff6b6b,color:#fff
    style Complete fill:#6FBF73,color:#fff
    style Post fill:#E99560,color:#fff
```

## Error Recovery Decision Tree

```mermaid
graph TD
    Start[API Call Failed]
    Check{Error Type?}

    Check -->|404 Not Found| Stale[Stale GID]
    Check -->|429 Rate Limit| Rate[Rate Limited]
    Check -->|0 Results| Empty[No Matches]
    Check -->|Multiple Results| Multi[Ambiguous]
    Check -->|Timeout| Timeout[Response Timeout]

    Stale -->|Action| Search1[Fall back to text search]
    Rate -->|Action| Wait[Wait retry-after header<br/>or 5s default]
    Empty -->|Action| Broaden[Broaden search terms<br/>Remove qualifiers]
    Multi -->|Action| Disambig[List options<br/>Ask user to select]
    Timeout -->|Action| Reduce[Reduce opt_fields<br/>Batch operations]

    style Stale fill:#ff6b6b,color:#fff
    style Rate fill:#E99560,color:#fff
    style Empty fill:#5F3B8C,color:#fff
    style Multi fill:#6FBF73,color:#fff
    style Timeout fill:#3E4A61,color:#fff
```

## Agent Integration Standards

```mermaid
graph TB
    Agent[Specialist Agent]
    Import[Import Standards<br/>asana-integration-standards.md]
    Templates[Use Update Templates<br/>progress/blocker/completion]
    Validate[Validate Length<br/>< word limits]
    Metrics[Include Metrics<br/>numbers, percentages]
    Follow[Follow Reading Pattern<br/>5-step task parsing]

    Agent --> Import
    Import --> Templates
    Templates --> Validate
    Validate --> Metrics
    Metrics --> Follow

    style Agent fill:#5F3B8C,color:#fff
    style Templates fill:#E99560,color:#fff
    style Metrics fill:#6FBF73,color:#fff
```

## Brevity Enforcement

```mermaid
graph LR
    Draft[Draft Update]
    Check{Word Count?}
    Pass[< Limit]
    Fail[> Limit]
    Edit[Self-Edit:<br/>Remove redundancy<br/>Condense metrics<br/>Shorten descriptions]
    Quality[Quality Checklist:<br/>✅ Template format<br/>✅ Includes metrics<br/>✅ Clear next steps<br/>✅ Proper formatting]
    Post[Post to Asana]

    Draft --> Check
    Check -->|Progress: 100w<br/>Blocker: 80w<br/>Complete: 150w| Pass
    Check --> Fail
    Fail --> Edit
    Edit --> Check
    Pass --> Quality
    Quality --> Post

    style Fail fill:#ff6b6b,color:#fff
    style Pass fill:#6FBF73,color:#fff
    style Post fill:#E99560,color:#fff
```

---

**Generated**: 2026-02-06
**Version**: 1.0.0
**Maintainer**: OpsPal Core Team
