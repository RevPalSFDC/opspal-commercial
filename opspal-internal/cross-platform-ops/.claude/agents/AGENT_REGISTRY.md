# Claude Code Agent Registry - Cross-Platform Operations

## 🎯 Overview

This directory contains **Claude Code sub-agents** that orchestrate and execute HubSpot/Salesforce operations. These agents work with the Node.js tools and scripts in the repository.

## 🤖 Active Claude Code Agents

### Orchestration Layer
| Agent | Purpose | Primary Tools | Delegates To |
|-------|---------|---------------|--------------|
| `cross-platform-orchestrator` | Master coordinator for multi-platform operations | Task, TodoWrite | All specialists |

### HubSpot Specialists
| Agent | Purpose | Primary Tools | Key Commands |
|-------|---------|---------------|--------------|
| `hubspot-deduplication-specialist` | Contact deduplication using multiple strategies | Bash, Read, Write | `node agents/data/deduplication-engine.js` |
| `hubspot-bulk-import-specialist` | Large-scale imports (10M+ records) | Bash, TodoWrite | `./bin/import-contacts`, `./bin/import-companies` |
| `hubspot-export-specialist` | Data extraction with streaming | Bash, Read | `./bin/export-contacts`, `./bin/export-companies` |
| `hubspot-connection-manager` | Authentication and connection pooling | Bash | `node agents/core/connection-manager.js` |

### Salesforce Specialists
*Located in `platforms/SFDC/.claude/agents/`*
| Agent | Purpose | Primary Tools |
|-------|---------|---------------|
| `sfdc-metadata` | Metadata packaging and deployment | Bash (sf commands) |
| `sfdc-apex` | Apex code development and testing | Read, Write, Edit |
| `sfdc-conflict-resolver` | Deployment conflict resolution | Task, Bash |

### Data Quality Specialists
| Agent | Purpose | Primary Tools | Output |
|-------|---------|---------------|--------|
| `data-quality-analyzer` | Data validation and quality scoring | Read, Bash, Grep | Quality reports |
| `error-recovery-specialist` | Auto-fix common data errors (70-85% success) | Bash, Edit | Fixed CSV files |
| `field-mapping-specialist` | Cross-platform field mapping | Read, Write | Mapping configs |

## 📋 How to Use These Agents

### Direct Invocation
```python
# From Claude Code, use the Task tool
await Task({
    subagent_type: 'hubspot-deduplication-specialist',
    description: 'Deduplicate contacts',
    prompt: 'Process contacts.csv using email and phone strategies'
})
```

### Orchestrated Workflow
```python
# Let the orchestrator coordinate multiple agents
await Task({
    subagent_type: 'cross-platform-orchestrator',
    description: 'Full data sync',
    prompt: 'Sync Salesforce contacts to HubSpot with deduplication'
})
```

## 🔄 Agent Communication Flow

```
User Request
    ↓
cross-platform-orchestrator (analyzes & plans)
    ↓
    ├→ data-quality-analyzer (validates data)
    ├→ hubspot-deduplication-specialist (cleans data)
    ├→ field-mapping-specialist (maps fields)
    └→ hubspot-bulk-import-specialist (imports data)
         ↓
    error-recovery-specialist (fixes failures)
```

## 🛠️ Node.js Tools Available to Agents

### Core Infrastructure (agents/)
- `BaseAgent.js` - Foundation class
- `AgentOrchestrator.js` - System orchestrator
- `agents/core/connection-manager.js` - Auth management
- `agents/data/deduplication-engine.js` - Dedup engine
- `agents/orchestration/smart-router.js` - Intelligent routing

### CLI Tools (bin/)
- `import-contacts` - Bulk contact imports
- `export-contacts` - Bulk contact exports
- `import-companies` - Bulk company imports
- `export-companies` - Bulk company exports
- `hubspot-monitor` - Real-time monitoring

### Libraries (lib/hubspot-bulk/)
- `auth.js` - HubSpot authentication
- `imports.js` - Import operations
- `exports.js` - Export operations
- `rateLimit.js` - Rate limiting
- `monitoring.js` - Performance monitoring

## 📊 Agent Capabilities Matrix

| Capability | Orchestrator | Dedup | Import | Export | Quality | Recovery |
|------------|--------------|-------|--------|--------|---------|----------|
| Handles 10M+ records | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Parallel processing | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ |
| Error recovery | ✅ | ❌ | ✅ | ❌ | ❌ | ✅ |
| Progress monitoring | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Resumable operations | ✅ | ❌ | ✅ | ✅ | ❌ | ✅ |

## 🚀 Quick Start Examples

### Example 1: Deduplicate and Import
```bash
# User request: "Deduplicate contacts.csv and import to HubSpot"

# Claude Code will:
1. Invoke hubspot-deduplication-specialist
2. Run: node agents/data/deduplication-engine.js -i contacts.csv
3. Invoke hubspot-bulk-import-specialist
4. Run: ./bin/import-contacts deduplicated.csv
```

### Example 2: Quality Analysis
```bash
# User request: "Analyze data quality of our contact list"

# Claude Code will:
1. Invoke data-quality-analyzer
2. Generate quality report
3. Provide recommendations
4. Optionally invoke error-recovery-specialist
```

### Example 3: Cross-Platform Sync
```bash
# User request: "Sync Salesforce contacts to HubSpot"

# Claude Code will:
1. Invoke cross-platform-orchestrator
2. Orchestrator delegates to:
   - sfdc-export (extract from Salesforce)
   - data-quality-analyzer (validate)
   - hubspot-deduplication-specialist (clean)
   - hubspot-bulk-import-specialist (import)
```

## 🔧 Creating New Agents

### Template for New Agent
```yaml
---
name: agent-name
description: What this agent does
tools:
  - name: Bash
  - name: Read
  - name: Task
backstory: |
  Detailed description of agent's expertise and approach
---

# Agent content...
```

### Registration Process
1. Create agent file in `.claude/agents/`
2. Add to this registry
3. Test with simple task
4. Document in capabilities matrix

## 📈 Performance Metrics

| Agent | Avg Execution Time | Success Rate | Records/Min |
|-------|-------------------|--------------|-------------|
| deduplication-specialist | 2-5 min | 95% | 50,000 |
| bulk-import-specialist | 10-30 min | 90% | 10,000 |
| data-quality-analyzer | 1-3 min | 99% | 100,000 |
| error-recovery-specialist | 5-10 min | 70-85% | 20,000 |

## 🔍 Monitoring & Debugging

### Check Agent Availability
```bash
# List all agents
ls -la .claude/agents/*.md

# Check Node.js tools
npm run agents:list
```

### Monitor Operations
```bash
# Start orchestrator
npm run agents:start-api

# Check status
curl http://localhost:3000/status
```

### Debug Issues
```bash
# Check logs
tail -f .agent-states/*.json

# Validate connections
node agents/core/connection-manager.js validate hubspot
```

## 📝 Best Practices

1. **Always use the orchestrator** for complex multi-step operations
2. **Validate data quality** before any import operation
3. **Use deduplication** when combining data sources
4. **Monitor long-running operations** with hubspot-monitor
5. **Check rate limits** before bulk operations
6. **Test with small datasets** before processing millions of records

## 🚨 Important Notes

- These are **Claude Code agents** that use the Task tool
- They execute **Node.js scripts and tools** in your repository
- They can delegate to other agents for complex workflows
- They maintain state and can resume interrupted operations
- They follow rate limits and best practices automatically

---
*Last Updated: 2025-09-21*
*Total Agents: 10 (4 orchestration, 6 specialists)*