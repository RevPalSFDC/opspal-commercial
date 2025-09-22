# Principal Engineer Agent User Guide

## Table of Contents
1. [Introduction](#introduction)
2. [Quick Start](#quick-start)
3. [Core Concepts](#core-concepts)
4. [Usage Patterns](#usage-patterns)
5. [Management Team](#management-team)
6. [Common Workflows](#common-workflows)
7. [Best Practices](#best-practices)
8. [Troubleshooting](#troubleshooting)

## Introduction

The Principal Engineer Agent is your central orchestrator for managing Claude configurations across multiple CRM platforms. It acts as a senior technical leader, delegating tasks to specialized agents and ensuring quality, compliance, and operational excellence.

### Key Benefits
- **Unified Control**: Single point of entry for complex operations
- **Intelligent Delegation**: Automatically routes tasks to appropriate specialists
- **Quality Assurance**: Built-in monitoring and compliance checking
- **Cross-Platform**: Seamlessly manages HubSpot, Salesforce, and future platforms

## Quick Start

### 1. Initialize the System

Run the initialization script to set up the Principal Engineer system:

```bash
cd /home/chris/Desktop/RevPal/Agents
./shared-infrastructure/scripts/initialize-principal.sh
```

### 2. Start the Dashboard

Launch the monitoring dashboard to visualize system status:

```bash
./start-principal.sh
```

Access the dashboard at: http://localhost:3000

### 3. Invoke the Principal Engineer

Use the Task tool in Claude to invoke the principal engineer:

```yaml
Task: principal-engineer
Description: "Your complex task description here"
```

## Core Concepts

### Hierarchy

```
Principal Engineer (Orchestrator)
├── Management Team (7 agents)
│   ├── config-manager
│   ├── agent-maintainer
│   ├── release-coordinator
│   ├── quality-auditor
│   ├── integration-architect
│   ├── mcp-tools-manager
│   └── documentation-curator
├── HubSpot Agents (Platform-specific)
└── Salesforce Agents (Platform-specific)
```

### Decision Flow

1. **Task Assessment**: Principal engineer analyzes complexity
2. **Delegation Strategy**: Determines optimal agent allocation
3. **Execution**: Delegates to appropriate agents
4. **Monitoring**: Tracks progress and handles exceptions
5. **Quality Check**: Validates results and compliance

## Usage Patterns

### Pattern 1: Complex Multi-Step Operations

**When to use**: Tasks requiring coordination across multiple agents or platforms

```yaml
Task: principal-engineer
Description: "Deploy new contact scoring system across HubSpot and Salesforce with data synchronization"
```

The principal engineer will:
1. Analyze requirements
2. Create execution plan
3. Delegate to hubspot-orchestrator and sfdc-orchestrator
4. Coordinate through integration-architect
5. Monitor via quality-auditor

### Pattern 2: Infrastructure Management

**When to use**: Configuration updates, deployments, or system maintenance

```yaml
Task: principal-engineer
Description: "Update all agent configurations to production stage and deploy"
```

The principal engineer will:
1. Use agent-maintainer to update stages
2. Use release-coordinator for deployment
3. Use quality-auditor to verify

### Pattern 3: Cross-Platform Integration

**When to use**: Setting up or managing integrations between platforms

```yaml
Task: principal-engineer
Description: "Set up bidirectional sync between HubSpot contacts and Salesforce leads"
```

The principal engineer will:
1. Delegate to integration-architect
2. Configure field mappings
3. Set up sync rules
4. Test data flow

## Management Team

### config-manager
**Purpose**: Manages all configuration files

**Common tasks**:
- Update CLAUDE.md files
- Manage .mcp.json configurations
- Handle environment variables
- Validate configuration consistency

**Example**:
```yaml
Task: config-manager
Description: "Update MCP server timeout settings across all projects"
```

### agent-maintainer
**Purpose**: Maintains agent YAML definitions

**Common tasks**:
- Update agent versions
- Promote agents to production
- Validate agent configurations
- Manage agent lifecycle

**Example**:
```yaml
Task: agent-maintainer
Description: "Promote all staging agents to production"
```

### release-coordinator
**Purpose**: Handles deployments and releases

**Common tasks**:
- Deploy to environments
- Manage rollbacks
- Version control
- CI/CD pipeline management

**Example**:
```yaml
Task: release-coordinator
Description: "Deploy version 2.0.0 to production with rollback plan"
```

### quality-auditor
**Purpose**: Monitors performance and quality

**Common tasks**:
- Analyze error patterns
- Monitor performance metrics
- Generate quality reports
- Identify optimization opportunities

**Example**:
```yaml
Task: quality-auditor
Description: "Analyze last week's performance and identify bottlenecks"
```

### integration-architect
**Purpose**: Manages cross-platform integrations

**Common tasks**:
- Configure data synchronization
- Set up API connections
- Manage webhooks
- Handle data mapping

**Example**:
```yaml
Task: integration-architect
Description: "Configure webhook for real-time contact updates"
```

### mcp-tools-manager
**Purpose**: Maintains MCP infrastructure

**Common tasks**:
- Update MCP server configurations
- Manage tool definitions
- Optimize performance
- Troubleshoot connectivity

**Example**:
```yaml
Task: mcp-tools-manager
Description: "Add new HubSpot API tool to MCP configuration"
```

### documentation-curator
**Purpose**: Maintains documentation

**Common tasks**:
- Update README files
- Generate API documentation
- Create user guides
- Maintain changelogs

**Example**:
```yaml
Task: documentation-curator
Description: "Update documentation for new agent features"
```

## Common Workflows

### Workflow 1: New Feature Deployment

```yaml
# Step 1: Plan with principal engineer
Task: principal-engineer
Description: "Plan deployment of new lead scoring feature"

# Step 2: Implementation coordinated by principal engineer
Task: principal-engineer  
Description: "Implement lead scoring in HubSpot and Salesforce"

# Step 3: Testing via quality auditor
Task: quality-auditor
Description: "Test lead scoring implementation"

# Step 4: Deploy via release coordinator
Task: release-coordinator
Description: "Deploy lead scoring to production"
```

### Workflow 2: System Health Check

```yaml
# Comprehensive health check
Task: principal-engineer
Description: "Perform complete system health check and optimization"

# This will trigger:
# - quality-auditor for performance analysis
# - mcp-tools-manager for infrastructure check
# - agent-maintainer for agent status
# - config-manager for configuration validation
```

### Workflow 3: Emergency Response

```yaml
# Critical issue resolution
Task: principal-engineer
Description: "URGENT: Fix synchronization failures between platforms"

# Principal engineer will:
# 1. Assess severity
# 2. Delegate to integration-architect
# 3. Monitor via quality-auditor
# 4. Coordinate rollback if needed via release-coordinator
```

## Best Practices

### 1. Task Complexity Assessment

- **Simple tasks**: Use specific agents directly
- **Complex tasks**: Always use principal-engineer
- **When unsure**: Default to principal-engineer

### 2. Clear Task Descriptions

Good:
```yaml
Task: principal-engineer
Description: "Set up automated weekly report generation for sales pipeline metrics across both HubSpot and Salesforce, with email distribution to stakeholders"
```

Poor:
```yaml
Task: principal-engineer
Description: "Fix reports"
```

### 3. Monitoring and Validation

- Always check dashboard after major operations
- Review quality-auditor reports regularly
- Validate configurations with config-manager
- Test changes in staging first

### 4. Documentation

- Document all custom workflows
- Update CLAUDE.md for new patterns
- Maintain changelogs for deployments
- Create runbooks for common operations

## Troubleshooting

### Issue: Agent not responding

**Solution**:
1. Check agent status in dashboard
2. Run agent discovery script
3. Validate agent YAML with agent-maintainer
4. Check MCP configuration with mcp-tools-manager

### Issue: Synchronization failures

**Solution**:
1. Use integration-architect to diagnose
2. Check API credentials
3. Validate field mappings
4. Review error logs with quality-auditor

### Issue: Performance degradation

**Solution**:
1. Run quality-auditor analysis
2. Check resource utilization
3. Optimize with mcp-tools-manager
4. Review recent changes with release-coordinator

### Issue: Configuration drift

**Solution**:
1. Use config-manager to audit configurations
2. Identify discrepancies
3. Synchronize configurations
4. Update documentation

## Advanced Features

### Custom Workflows

Create custom workflow patterns by combining agents:

```yaml
# Example: Quarterly maintenance
Task: principal-engineer
Description: "Execute quarterly maintenance routine:
1. Full system backup
2. Performance optimization
3. Security audit
4. Documentation update
5. Agent version updates"
```

### Parallel Execution

The principal engineer can execute tasks in parallel:

```yaml
Task: principal-engineer
Description: "Simultaneously update HubSpot workflows and Salesforce process builders while maintaining data sync"
```

### Predictive Maintenance

Leverage quality-auditor for predictive analysis:

```yaml
Task: quality-auditor
Description: "Predict potential failures based on current trends and recommend preventive actions"
```

## Getting Help

1. **Documentation**: Check `/documentation/` directory
2. **Dashboard**: Monitor system at http://localhost:3000
3. **Logs**: Review error logs in `/logs/` directories
4. **Discovery**: Run agent discovery for current state
5. **Health Check**: Use quality-auditor for diagnostics

## Conclusion

The Principal Engineer Agent System transforms Claude into a sophisticated orchestrator capable of managing complex multi-platform operations. By following this guide and best practices, you can leverage the full power of the system for efficient, reliable, and scalable CRM management.

Remember: When in doubt, let the principal engineer handle the complexity!