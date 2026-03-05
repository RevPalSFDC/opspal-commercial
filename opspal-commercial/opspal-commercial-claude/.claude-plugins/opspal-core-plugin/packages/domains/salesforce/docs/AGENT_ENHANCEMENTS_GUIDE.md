# Agent Enhancements Guide

**Claude Code v2.0.28-v2.0.30**: Advanced agent capabilities for model selection, tool restrictions, and dynamic subagent configuration.

## Overview

Salesforce Plugin agents are enhanced with modern Claude Code features that provide:
- **Model Selection**: Specify default model per agent
- **Dynamic Subagent Model Selection**: Agents choose appropriate models for tasks they delegate
- **Tool Restrictions**: Explicit blocking of dangerous tools for read-only agents
- **Safety Guardrails**: Prevent accidental data modifications during discovery/analysis

## Agent Configuration Fields

### `model` Field (v2.0.28+)

**Purpose**: Specifies the default model for agent execution and enables dynamic model selection for subagents.

**Supported Values**:
- `haiku` - Fast (200ms avg), cost-effective, good for simple tasks
- `sonnet` - Balanced (500ms avg), recommended for most operations
- `opus` - Powerful (1000ms avg), for complex decision-making

**Usage**:
```yaml
---
name: sfdc-orchestrator
model: sonnet
description: Master coordinator for complex Salesforce operations
---
```

**Dynamic Subagent Model Selection**:

When an agent with `model: sonnet` invokes subagents using the Task tool, it can dynamically specify which model the subagent should use based on task complexity:

```markdown
**Discovery Task** (simple, fast):
- Use Task tool with `model: "haiku"` parameter
- Quick data gathering, simple queries
- Cost-effective for bulk operations

**Analysis Task** (moderate complexity):
- Use Task tool with `model: "sonnet"` parameter (default)
- Complex evaluation, pattern recognition
- Balanced speed and capability

**Critical Decision** (high complexity):
- Use Task tool with `model: "opus"` parameter
- Multi-factor analysis, critical deployments
- Maximum reasoning capability
```

**Current Model Distribution**:
- **52 agents**: Sonnet (default, balanced)
- **3 agents**: Haiku (speed-optimized)
- **13 agents**: No model specified (inherits from parent)

### `disallowedTools` Field (v2.0.30+)

**Purpose**: Explicitly blocks dangerous tools to prevent accidental data modifications, especially critical for read-only agents (auditors, analyzers, discovery agents).

**Supported Patterns**:
- Exact tool names: `Write`, `Edit`, `NotebookEdit`
- Bash command patterns: `Bash(sf project deploy:*)`, `Bash(rm:*)`
- MCP tool patterns: `mcp__salesforce__*_create`, `mcp__salesforce__*_update`

**Usage**:
```yaml
---
name: sfdc-state-discovery
model: sonnet
tools: mcp_salesforce, Read, Grep, TodoWrite, Bash
disallowedTools:
  - Write
  - Edit
  - NotebookEdit
  - Bash(sf project deploy:*)
  - Bash(sf data upsert:*)
  - Bash(sf data delete:*)
  - mcp__salesforce__*_create
  - mcp__salesforce__*_update
  - mcp__salesforce__*_delete
---
```

**Benefits**:
- **Safety**: Prevents accidental modifications during read-only operations
- **Clarity**: Explicit about agent capabilities and restrictions
- **Confidence**: Users know discovery agents can't modify data

**Current Coverage**:
- **60/68 agents** (88%) have disallowedTools configured
- **17 read-only agents** all have comprehensive tool restrictions
- **8 agents without**: Legitimate write agents or legacy

## Agent Categories & Model Selection Strategy

### 1. **Orchestrator Agents** → Sonnet

**Pattern**: `*-orchestrator`, `*-planner`

**Why Sonnet**:
- Complex task decomposition
- Multi-agent coordination
- Decision-making about delegation
- Error recovery strategies

**Agents**:
- `sfdc-orchestrator` - Master coordinator
- `sfdc-planner` - Implementation planning
- `sfdc-permission-orchestrator` - Permission management
- `sfdc-merge-orchestrator` - Object/field merges
- `flow-test-orchestrator` - Flow testing coordination

**Dynamic Selection**:
```
Orchestrator (Sonnet) delegates:
├─ Discovery subtasks → Invoke with Haiku
├─ Complex analysis → Invoke with Sonnet (default)
└─ Critical decisions → Invoke with Opus
```

### 2. **Discovery & Analysis** → Sonnet (with disallowedTools)

**Pattern**: `*-discovery`, `*-analyzer`, `*-auditor`

**Why Sonnet**:
- Pattern recognition across metadata
- Relationship mapping
- Trend analysis
- Detailed reporting

**Agents**:
- `sfdc-state-discovery` - Org state analysis
- `sfdc-metadata-analyzer` - Metadata evaluation
- `sfdc-dependency-analyzer` - Dependency mapping
- `sfdc-automation-auditor` - Automation review
- `sfdc-architecture-auditor` - Architecture validation

**Tool Restrictions**:
```yaml
disallowedTools:
  - Write, Edit, NotebookEdit
  - Bash(sf project deploy:*)
  - Bash(sf data *:*)
  - mcp__salesforce__*_create
  - mcp__salesforce__*_update
  - mcp__salesforce__*_delete
```

### 3. **Assessment & Audit** → Sonnet (with disallowedTools)

**Pattern**: `*-assessor`, `*-auditor`

**Why Sonnet**:
- Statistical analysis
- Business process evaluation
- Risk assessment
- Recommendation generation

**Agents**:
- `sfdc-cpq-assessor` - CPQ health checks
- `sfdc-revops-auditor` - RevOps assessments
- `sfdc-quality-auditor` - Quality monitoring
- `sfdc-reports-usage-auditor` - Report usage analysis

**Tool Restrictions**: Same as Discovery & Analysis

### 4. **Validation & Pre-flight** → Haiku (with disallowedTools)

**Pattern**: `*-validator`, `*-preflight`

**Why Haiku**:
- Fast validation checks
- Simple rule evaluation
- Quick feedback loops
- Cost-effective for frequent use

**Agents**:
- `sfdc-report-validator` - Report configuration validation
- `response-validator` - Response quality checks

**Tool Restrictions**: Comprehensive blocking of all write operations

### 5. **Deployment & Modification** → Sonnet (NO restrictions)

**Pattern**: `*-manager`, `*-builder`, `*-deployer`

**Why Sonnet**:
- Complex deployment logic
- Error recovery
- Rollback planning
- Multi-phase operations

**Agents**:
- `sfdc-metadata-manager` - Metadata operations
- `sfdc-deployment-manager` - Deployment coordination
- `sfdc-automation-builder` - Flow/workflow creation
- `sfdc-data-operations` - Data imports/exports

**No disallowedTools**: These agents legitimately need write access

## Best Practices

### For Agent Developers

**1. Always Specify Model**:
```yaml
model: sonnet  # Default for most agents
```

**2. Add disallowedTools for Read-Only Agents**:
```yaml
disallowedTools:
  - Write
  - Edit
  - Bash(sf project deploy:*)
  - mcp__salesforce__*_create
```

**3. Document Dynamic Model Selection**:
```markdown
## Subagent Delegation

This orchestrator uses dynamic model selection:
- **Haiku**: Quick data gathering, simple queries
- **Sonnet** (default): Complex analysis, standard operations
- **Opus**: Critical production decisions, multi-factor evaluation
```

**4. Use Task Tool with Model Parameter**:
```markdown
For quick data gathering, use:
`Task tool with subagent_type="sfdc-query-specialist" and model="haiku"`

For complex analysis, use:
`Task tool with subagent_type="sfdc-metadata-analyzer" and model="sonnet"`

For critical decisions, use:
`Task tool with subagent_type="sfdc-planner" and model="opus"`
```

### For Agent Users

**Model Selection Tips**:
- **Haiku**: Use for bulk operations, quick checks, frequent validations
- **Sonnet**: Default choice for most operations
- **Opus**: Reserve for critical production decisions, complex planning

**Understanding disallowedTools**:
- Agents with disallowedTools are SAFE for discovery
- They cannot accidentally modify your org
- Use them freely for analysis and reporting

**Forcing Different Models**:
```bash
# Override agent's default model
claude --model opus "Run comprehensive security audit"

# Use haiku for speed on simple tasks
claude --model haiku "List all active flows"
```

## Model Selection Decision Tree

```
What type of operation?
├─ Discovery / Analysis / Audit
│  └─ Model: Sonnet (thorough analysis)
│     └─ Add disallowedTools: YES (safety)
│
├─ Quick Validation / Pre-flight Check
│  └─ Model: Haiku (speed, low cost)
│     └─ Add disallowedTools: YES (safety)
│
├─ Deployment / Modification
│  └─ Model: Sonnet (error handling)
│     └─ Add disallowedTools: NO (needs write access)
│
└─ Orchestration / Planning
   └─ Model: Sonnet (coordination)
      └─ Add disallowedTools: Conditional
         └─ Can delegate writes to subagents
```

## Dynamic Subagent Model Selection Examples

### Example 1: sfdc-orchestrator

**Scenario**: User requests complex deployment

**Orchestrator Decision Flow**:
```
1. Assess task complexity (Sonnet reasoning)
2. Decompose into subtasks:
   a. Discover current state → Delegate to sfdc-state-discovery (Haiku)
   b. Analyze dependencies → Delegate to sfdc-dependency-analyzer (Sonnet)
   c. Plan deployment order → Delegate to sfdc-planner (Sonnet)
   d. Execute deployment → Delegate to sfdc-deployment-manager (Sonnet)
   e. Validate results → Delegate to sfdc-state-discovery (Haiku)
```

**Cost Optimization**:
- 2 Haiku calls (discovery, validation): Fast + cheap
- 3 Sonnet calls (analysis, planning, deployment): Balanced

### Example 2: sfdc-planner

**Scenario**: User requests implementation plan for new feature

**Planner Decision Flow**:
```
1. Analyze requirements (Sonnet reasoning)
2. Research existing implementations:
   → Query metadata (Haiku - fast search)
3. Evaluate patterns and best practices:
   → Analyze architecture (Sonnet - complex evaluation)
4. Critical architecture decision needed:
   → Invoke sfdc-architecture-auditor (Opus - high stakes)
5. Generate detailed plan (Sonnet reasoning)
```

**Quality vs Speed**:
- Haiku for data gathering (fast)
- Sonnet for standard evaluation (balanced)
- Opus for critical decisions (quality)

### Example 3: flow-test-orchestrator

**Scenario**: Test 15 flows in sandbox

**Orchestrator Decision Flow**:
```
1. Batch processing strategy (Sonnet reasoning)
2. For each flow:
   a. Quick validation → flow-preflight (Haiku - fast checks)
   b. Execute test → flow-test-executor (Sonnet - accurate execution)
   c. Parse logs → flow-log-analyst (Haiku - pattern matching)
3. Generate consolidated report (Sonnet reasoning)
```

**Performance Gains**:
- 15 Haiku validations: ~3 seconds total
- 15 Sonnet executions: ~7.5 seconds total
- 15 Haiku log parsers: ~3 seconds total
- Total: ~15 seconds vs ~25 seconds (all Sonnet)

## Migration Guide

### Adding disallowedTools to Existing Agent

**Before**:
```yaml
---
name: my-discovery-agent
model: sonnet
tools: Read, Grep, Bash
---
```

**After**:
```yaml
---
name: my-discovery-agent
model: sonnet
tools: Read, Grep, Bash
disallowedTools:
  - Write
  - Edit
  - Bash(sf project deploy:*)
  - mcp__salesforce__*_create
---
```

### Adding Dynamic Model Selection to Orchestrator

**Before**:
```markdown
Use Task tool to delegate to sfdc-metadata-analyzer
```

**After**:
```markdown
**For complex metadata analysis**:
Use Task tool with:
- subagent_type: "sfdc-metadata-analyzer"
- model: "sonnet" (default for thorough analysis)

**For quick metadata checks**:
Use Task tool with:
- subagent_type: "sfdc-metadata-analyzer"
- model: "haiku" (faster, cost-effective)
```

## Troubleshooting

### Agent Using Wrong Model

**Symptom**: Haiku agent struggles with complex task

**Fix**: Override with --model flag or update agent's default:
```yaml
model: sonnet  # Change from haiku
```

### disallowedTools Blocking Legitimate Operation

**Symptom**: Error "Tool X is not allowed for this agent"

**Fix**: Review agent purpose - if it truly needs write access, remove from disallowedTools:
```yaml
disallowedTools:
  # - Write  # Removed - this agent needs write access
  - Bash(sf project deploy:*)  # Keep deployment restrictions
```

### Subagent Not Respecting Model Parameter

**Symptom**: Subagent uses wrong model despite Task tool model parameter

**Fix**: Ensure Claude Code version >= v2.0.28:
```bash
claude --version
# Should show v2.0.28 or higher
```

## Statistics

**Salesforce Plugin Agent Configuration** (v3.45.0):
- **Total Agents**: 68
- **With model field**: 55 (81%)
  - Sonnet: 52 agents (94.5%)
  - Haiku: 3 agents (5.5%)
- **With disallowedTools**: 60 (88%)
  - Read-only agents: 17 (all protected)
  - Orchestrators: 5 (conditional restrictions)
  - Deployment agents: 0 (need write access)
- **Fully Enhanced**: 54 agents (79%)

## Related Documentation

- **Agent Organization Pattern**: `../../docs/AGENT_ORGANIZATION_PATTERN.md`
- **Safety Guardrails**: `SAFETY_GUARDRAILS_COMPLETE.md`
- **Routing Help**: Run `/routing-help` command
- **Claude Code Docs**: https://docs.claude.com/en/docs/claude-code/agents

## Version History

- **v3.45.0** (2025-11-14): Added Agent Enhancements Guide
  - Documented model field usage
  - Documented disallowedTools patterns
  - Added dynamic subagent model selection examples
  - Migration guide for existing agents

---

**Last Updated**: 2025-11-14
**Plugin Version**: 3.45.0
