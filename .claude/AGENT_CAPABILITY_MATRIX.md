# Agent Capability Matrix - RevPal System

This matrix documents the capabilities, permissions, and operational boundaries of each agent in the RevPal system.

## 📊 Capability Overview

| Agent | Read | Write | Cross-Repo | Production | MCP Required | Complexity |
|-------|------|-------|------------|------------|--------------|------------|
| **release-coordinator** | ✅ | ❌ | ✅ | ✅ | ❌ | HIGH |
| **project-orchestrator** | ✅ | ❌ | ✅ | ✅ | ❌ | HIGH |
| **sequential-planner** | ✅ | ✅ | ✅ | ✅ | sequential_thinking | HIGH |
| **sfdc-conflict-resolver** † | ✅ | ✅ | ❌ | ✅ | mcp_salesforce | MEDIUM |
| **sfdc-merge-orchestrator** † | ✅ | ✅ | ❌ | ✅ | mcp_salesforce | HIGH |
| **sfdc-state-discovery** † | ✅ | ✅ | ❌ | ✅ | mcp_salesforce | MEDIUM |
| **sfdc-dependency-analyzer** † | ✅ | ✅ | ❌ | ✅ | mcp_salesforce | MEDIUM |
| **quality-control-analyzer** | ✅ | ❌ | ✅ | ✅ | ❌ | LOW |
| **gdrive-document-manager** | ✅ | ❌ | ✅ | ✅ | gdrive | LOW |
| **gdrive-template-library** | ✅ | ✅ | ✅ | ✅ | gdrive | LOW |
| **gdrive-report-exporter** | ✅ | ✅ | ✅ | ✅ | gdrive, salesforce-dx | MEDIUM |
| **router-doctor** | ✅ | ❌ | ✅ | ✅ | ❌ | LOW |
| **mcp-guardian** | ✅ | ❌ | ✅ | ✅ | ❌ | LOW |
| **claude-compliance-enforcer** | ✅ | ❌ | ✅ | ✅ | ❌ | MEDIUM |
| **agent-auditor** | ✅ | ❌ | ❌ | ✅ | ❌ | LOW |
| **project-auditor** | ✅ | ✅ | ✅ | ✅ | ❌ | MEDIUM |
| **patch-smith** | ✅ | ✅ | ❌ | ❌ | ❌ | MEDIUM |
| **docs-keeper** | ✅ | ❌ | ✅ | ✅ | ❌ | LOW |

† Located in `platforms/SFDC/.claude/agents/`

## 🔧 Tool Requirements by Agent

### Orchestration Agents
| Agent | Required Tools | Optional Tools |
|-------|---------------|----------------|
| **release-coordinator** | Task, Read, Grep, Glob, Bash(git:*) | WebFetch |
| **project-orchestrator** | Task, Read, Grep, Glob, Bash(git:*) | TodoWrite |
| **sequential-planner** | sequential_thinking, Read, Write | Grep, Glob, TodoWrite |

### Salesforce Agents
| Agent | Required Tools | Optional Tools |
|-------|---------------|----------------|
| **sfdc-conflict-resolver** | mcp_salesforce, mcp_salesforce_metadata_describe | Read, Write, Bash |
| **sfdc-merge-orchestrator** | mcp_salesforce, mcp_salesforce_metadata_deploy | Task, TodoWrite |
| **sfdc-state-discovery** | mcp_salesforce, mcp_salesforce_metadata_describe | Write, Grep |
| **sfdc-dependency-analyzer** | mcp_salesforce, mcp_salesforce_field_describe | Write, TodoWrite |

### Google Drive Agents
| Agent | Required Tools | Optional Tools |
|-------|---------------|----------------|
| **gdrive-document-manager** | gdrive, Read | Grep, Glob |
| **gdrive-template-library** | gdrive, Read, Write | Glob |
| **gdrive-report-exporter** | gdrive, salesforce-dx, hubspot | Read, Write, Task |

### System Maintenance Agents
| Agent | Required Tools | Optional Tools |
|-------|---------------|----------------|
| **router-doctor** | Read, Grep, Glob | - |
| **mcp-guardian** | Read, Grep, Glob | - |
| **claude-compliance-enforcer** | Read, Grep, Glob | Task |
| **quality-control-analyzer** | Read, Grep | Write, TodoWrite |

## 🎯 Operational Boundaries

### Production-Safe Agents
These agents can safely operate in production environments:
- ✅ All read-only discovery agents
- ✅ release-coordinator (with proper approvals)
- ✅ sfdc-state-discovery (read-only mode)
- ✅ quality-control-analyzer
- ✅ All gdrive-* agents (with proper auth)

### Sandbox-Only Agents
These should primarily operate in sandbox/dev environments:
- ⚠️ sfdc-merge-orchestrator (test first)
- ⚠️ patch-smith (generates patches only)
- ⚠️ Any agent in experimental mode

### Cross-Repository Agents
These agents can work across multiple repositories:
- 🔄 project-orchestrator (primary coordinator)
- 🔄 release-coordinator (release management)
- 🔄 quality-control-analyzer (pattern analysis)
- 🔄 gdrive-* agents (shared resources)

## 📈 Complexity Handling

### HIGH Complexity (Sequential Thinking Required)
- **release-coordinator**: Multi-platform releases
- **project-orchestrator**: Cross-repo coordination
- **sequential-planner**: Unknown scope tasks
- **sfdc-merge-orchestrator**: Complex field merges

### MEDIUM Complexity (Conditional Sequential)
- **sfdc-conflict-resolver**: Deployment conflicts
- **sfdc-state-discovery**: Full org analysis
- **project-auditor**: Project assessment
- **claude-compliance-enforcer**: Compliance validation

### LOW Complexity (Direct Execution)
- **router-doctor**: Agent discovery
- **mcp-guardian**: MCP validation
- **quality-control-analyzer**: Pattern matching
- **gdrive-document-manager**: Document retrieval

## 🔐 Permission Levels

### Level 1: Read-Only
- Can only read files and query systems
- No modifications allowed
- Examples: router-doctor, mcp-guardian, agent-auditor

### Level 2: Local Write
- Can modify files in current directory
- Cannot affect other repositories
- Examples: patch-smith, docs-keeper

### Level 3: Cross-Repo Write
- Can modify files across repositories
- Requires explicit user approval
- Examples: project-orchestrator (via delegation)

### Level 4: System Modification
- Can modify system configurations
- Can deploy to production
- Examples: sfdc-merge-orchestrator, release-coordinator

## 🚦 Agent Selection Guidelines

### When to Use Each Agent Type

#### Discovery Agents (Read-Only)
**Use when:** You need to understand current state
- sfdc-state-discovery → Salesforce org analysis
- router-doctor → Agent configuration issues
- mcp-guardian → MCP server validation

#### Action Agents (Write-Enabled)
**Use when:** You need to make changes
- sfdc-merge-orchestrator → Merge fields/objects
- sfdc-conflict-resolver → Fix deployment issues
- patch-smith → Generate patches

#### Orchestration Agents (Delegation)
**Use when:** Task spans multiple domains
- project-orchestrator → Multi-repo work
- release-coordinator → Release management
- sequential-planner → Complex planning

#### Quality Agents (Analysis)
**Use when:** You need patterns/insights
- quality-control-analyzer → Friction patterns
- claude-compliance-enforcer → Standards compliance
- agent-auditor → Agent configuration audit

## 🔄 Agent Interaction Patterns

### Delegation Chains
```
User Request
    ↓
Orchestrator Agent (coordinates)
    ↓
Specialist Agents (execute)
    ↓
Verification Agents (validate)
```

### Discovery-Action Pattern
```
Discovery Agent (analyze)
    ↓
Planning Agent (strategize)
    ↓
Action Agent (execute)
    ↓
Verification Agent (confirm)
```

### Quality Loop
```
Development Work
    ↓
quality-control-analyzer (identify patterns)
    ↓
docs-keeper (update docs)
    ↓
claude-compliance-enforcer (validate)
```

## 📝 Agent Model Preferences

| Agent Type | Preferred Model | Reason |
|------------|----------------|---------|
| **Orchestrators** | opus | Complex coordination |
| **Planners** | opus/sonnet | Deep analysis required |
| **Specialists** | sonnet | Focused execution |
| **Validators** | sonnet | Pattern matching |
| **Discoverers** | sonnet | Data gathering |

## 🎯 Success Metrics

### Agent Performance Indicators
- **Response Time**: Target < 30s for simple, < 2min for complex
- **Success Rate**: Target > 95% for production agents
- **Delegation Accuracy**: Correct agent selection > 90%
- **Error Recovery**: Graceful failure handling 100%

### Quality Metrics
- **Pattern Detection**: Identify recurring issues within 3 occurrences
- **Compliance Rate**: 100% adherence to CLAUDE.md standards
- **Documentation Coverage**: All agents fully documented
- **Test Coverage**: All critical paths tested

## 🚨 Red Flags & Warnings

### When NOT to Use Agents
- ❌ Simple, single-file edits (use direct tools)
- ❌ Emergency hotfixes (direct intervention)
- ❌ Exploratory debugging (use interactive tools)
- ❌ User explicitly requests direct action

### Common Mistakes
- ⚠️ Using orchestrator for simple tasks
- ⚠️ Skipping discovery before action
- ⚠️ Ignoring complexity assessments
- ⚠️ Not checking for agent updates

## 📚 Quick Reference

### By Task Type
- **Release/Deploy** → release-coordinator
- **Multi-repo** → project-orchestrator
- **SF Conflicts** → sfdc-conflict-resolver
- **SF Merges** → sfdc-merge-orchestrator
- **Complex Planning** → sequential-planner
- **Quality Review** → quality-control-analyzer
- **Google Drive** → gdrive-* agents
- **Agent Issues** → router-doctor/mcp-guardian

### By Urgency
- **Immediate** → Direct execution (skip agents)
- **Planned** → Use appropriate agent
- **Complex** → sequential-planner first
- **Unknown** → Start with discovery agent

### By Environment
- **Production** → Use release-coordinator
- **Sandbox** → Any appropriate agent
- **Development** → Prefer direct execution
- **Cross-env** → project-orchestrator

---

**Remember**: When in doubt, use an agent. The system is designed to handle complexity better through specialized agents than through direct manipulation.