# Agent Usage Examples - RevPal System

This document provides concrete examples of when and how to use each specialized agent in the RevPal system. Each example includes the user request, the correct agent to use, and the proper invocation.

## 🚀 Release & Deployment Agents

### release-coordinator
**When to use**: After merging to main, before production deployments, for tagged releases

**Example 1 - Post-merge release**:
```
User: "I just merged the new customer portal features to main"
Claude: I see you've merged to main. Let me immediately invoke the release-coordinator to prepare for deployment.

Task tool invocation:
- subagent_type: "release-coordinator"
- description: "Coordinate release after main merge"
- prompt: "New customer portal features have been merged to main. Please:
  1. Analyze the changes since last release
  2. Create a release checklist for app, SFDC, and HubSpot
  3. Delegate to platform-specific agents as needed
  4. Generate release summary for Slack notification"
```

**Example 2 - Production deployment**:
```
User: "We need to deploy v2.5.0 to production tomorrow"
Claude: I'll use the release-coordinator to orchestrate the v2.5.0 production deployment.

Task tool invocation:
- subagent_type: "release-coordinator"
- description: "Orchestrate v2.5.0 production deployment"
- prompt: "Prepare for v2.5.0 production deployment. Verify all pre-deployment checks, coordinate platform deployments, and ensure rollback procedures are ready."
```

## 🧠 Complex Planning Agents

### sequential-planner
**When to use**: Unknown scope tasks, complex multi-step operations, high-risk changes

**Example 1 - Complex architecture design**:
```
User: "Design a fault-tolerant payment processing system that integrates with Salesforce and HubSpot"
Claude: This is a complex architectural task with unknown scope. I'll engage the sequential-planner.

Task tool invocation:
- subagent_type: "sequential-planner"
- description: "Design payment system architecture"
- prompt: "Design a fault-tolerant payment processing system with Salesforce and HubSpot integration. Use sequential thinking to:
  1. Decompose requirements
  2. Map system components
  3. Identify failure modes
  4. Design recovery mechanisms
  5. Plan integration points
  Provide branching alternatives for critical decisions."
```

**Example 2 - User flag [SEQUENTIAL]**:
```
User: "[SEQUENTIAL] Refactor our entire permission system"
Claude: I see the [SEQUENTIAL] flag. Engaging sequential-planner for comprehensive permission system refactoring.

Task tool invocation:
- subagent_type: "sequential-planner"
- description: "Plan permission system refactor"
- prompt: "Create a comprehensive plan to refactor the entire permission system. Use sequential thinking with revision capability."
```

## 🔧 Salesforce Specialist Agents

**Note**: Salesforce-specific agents are now located in `platforms/SFDC/.claude/agents/`

### sfdc-conflict-resolver
**When to use**: Deployment failures, metadata conflicts, field type mismatches

**Example 1 - Deployment failure**:
```
User: "My Salesforce deployment failed with field history tracking errors"
Claude: This is a Salesforce deployment conflict. I'll use the sfdc-conflict-resolver to diagnose and fix it.

Task tool invocation:
- subagent_type: "sfdc-conflict-resolver"
- description: "Resolve field history tracking conflict"
- prompt: "Deployment failed due to field history tracking errors. Please:
  1. Query current field history tracking counts
  2. Identify which objects exceed the 20-field limit
  3. Generate resolution plan
  4. Create updated deployment package"
```

### sfdc-merge-orchestrator
**When to use**: Merging objects/fields, consolidating duplicate fields, complex data migrations

**Example 1 - Field consolidation**:
```
User: "We need to merge Customer_Status__c and Account_Status__c fields"
Claude: This requires the sfdc-merge-orchestrator for safe field consolidation.

Task tool invocation:
- subagent_type: "sfdc-merge-orchestrator"
- description: "Merge status fields"
- prompt: "Merge Customer_Status__c and Account_Status__c fields:
  1. Analyze dependencies and data impact
  2. Check for conflicts and validation rules
  3. Create atomic merge plan with rollback
  4. Execute merge with zero data loss"
```

### sfdc-state-discovery
**When to use**: Before deployments, org analysis, drift detection

**Example 1 - Pre-deployment discovery**:
```
User: "What's the current state of our Salesforce org's Account object?"
Claude: I'll use sfdc-state-discovery to analyze the Account object comprehensively.

Task tool invocation:
- subagent_type: "sfdc-state-discovery"
- description: "Discover Account object state"
- prompt: "Perform comprehensive state discovery of the Account object including fields, validation rules, page layouts, and record types. Compare with local metadata files."
```

## 📊 Quality & Analysis Agents

### quality-control-analyzer
**When to use**: After milestones, recurring issues, workflow improvement

**Example 1 - Recurring issues**:
```
User: "Claude keeps making the same API naming mistakes"
Claude: I'll use the quality-control-analyzer to identify and prevent these recurring API naming issues.

Task tool invocation:
- subagent_type: "quality-control-analyzer"
- description: "Analyze API naming patterns"
- prompt: "Analyze Claude interaction history to identify recurring API naming issues. Create QA checklist and preventive measures."
```

**Example 2 - Milestone review**:
```
User: "We just finished sprint 15, let's review any friction points"
Claude: Perfect timing for a quality review. I'll run the quality-control-analyzer.

Task tool invocation:
- subagent_type: "quality-control-analyzer"
- description: "Sprint 15 quality review"
- prompt: "Analyze interactions from sprint 15 to identify friction points, repeated corrections, and areas for improvement. Generate actionable QA criteria."
```

## 🗂️ Google Drive Agents

### gdrive-document-manager
**When to use**: Project documentation, requirements access, compliance documents

**Example**:
```
User: "Get the latest API specifications from our Google Drive"
Claude: I'll use the gdrive-document-manager to retrieve the API specifications.

Task tool invocation:
- subagent_type: "gdrive-document-manager"
- description: "Retrieve API specifications"
- prompt: "Access and retrieve the latest API specification documents from Google Drive RevPal project folders."
```

### gdrive-template-library
**When to use**: Email templates, code patterns, workflow templates

**Example**:
```
User: "We need the standard onboarding email template"
Claude: I'll fetch that from our template library using gdrive-template-library.

Task tool invocation:
- subagent_type: "gdrive-template-library"
- description: "Get onboarding template"
- prompt: "Retrieve the standard onboarding email template from the Google Drive template library."
```

## 🔍 System Maintenance Agents

### router-doctor
**When to use**: Agent discovery issues, name collisions, scope conflicts

**Example**:
```
User: "I'm getting 'agent not found' errors"
Claude: Let me diagnose agent discovery issues with router-doctor.

Task tool invocation:
- subagent_type: "router-doctor"
- description: "Diagnose agent discovery"
- prompt: "Detect agent name collisions and scope conflicts between project and user agents. Provide full paths of any conflicts."
```

### mcp-guardian
**When to use**: MCP server issues, tool mismatches, server validation

**Example**:
```
User: "The Salesforce agent says 'tool not available'"
Claude: This sounds like an MCP configuration issue. I'll run mcp-guardian.

Task tool invocation:
- subagent_type: "mcp-guardian"
- description: "Validate MCP configuration"
- prompt: "Validate that Salesforce agent tools match the MCP server IDs in .mcp.json. Propose fixes for any mismatches."
```

## 🎯 Multi-Repo Coordination

### project-orchestrator
**When to use**: Cross-repo work, multi-platform changes, release planning

**Example**:
```
User: "Update the customer model across ClaudeSFDC and ClaudeHubSpot"
Claude: This spans multiple repositories. I'll use project-orchestrator to coordinate.

Task tool invocation:
- subagent_type: "project-orchestrator"
- description: "Coordinate customer model update"
- prompt: "Coordinate customer model updates across ClaudeSFDC and ClaudeHubSpot repositories. Plan the changes and delegate to appropriate platform agents."
```

## ❌ Anti-Patterns (What NOT to do)

### Don't skip agents for complex tasks
```
❌ BAD: User: "Deploy to production"
        Claude: [Directly runs git commands and deployment scripts]

✅ GOOD: User: "Deploy to production"
         Claude: [Uses release-coordinator agent to orchestrate deployment]
```

### Don't use wrong agent for the task
```
❌ BAD: User: "Merge these Salesforce fields"
        Claude: [Uses sfdc-state-discovery instead of sfdc-merge-orchestrator]

✅ GOOD: User: "Merge these Salesforce fields"
         Claude: [Uses sfdc-merge-orchestrator for the merge operation]
```

### Don't ignore proactive triggers
```
❌ BAD: User: "I merged to main"
        Claude: "Great! The merge is complete."

✅ GOOD: User: "I merged to main"
         Claude: "I see you merged to main. Let me invoke release-coordinator to prepare for deployment."
```

### Don't handle cross-repo work directly
```
❌ BAD: User: "Update configs in all repos"
        Claude: [Manually edits files in each repo]

✅ GOOD: User: "Update configs in all repos"
         Claude: [Uses project-orchestrator to coordinate multi-repo changes]
```

## 📝 Agent Selection Decision Tree

```
START
│
├─ Is this a release/deployment? → release-coordinator
│
├─ Does it span multiple repos? → project-orchestrator
│
├─ Is complexity unknown/high? → sequential-planner
│
├─ Is it a Salesforce task?
│  ├─ Conflict/deployment issue? → sfdc-conflict-resolver
│  ├─ Merging fields/objects? → sfdc-merge-orchestrator
│  ├─ State analysis? → sfdc-state-discovery
│  └─ Dependency analysis? → sfdc-dependency-analyzer
│
├─ Is it a quality/friction issue? → quality-control-analyzer
│
├─ Is it a Google Drive operation?
│  ├─ Documents/requirements? → gdrive-document-manager
│  ├─ Templates? → gdrive-template-library
│  └─ Reports? → gdrive-report-exporter
│
├─ Is it an agent/MCP issue?
│  ├─ Agent discovery? → router-doctor
│  └─ MCP validation? → mcp-guardian
│
└─ Is it a compliance check? → claude-compliance-enforcer
```

## 🎯 Key Takeaways

1. **Always check for specialized agents first** - Don't attempt complex tasks directly
2. **Use proactive triggers** - Especially after merges and before deployments
3. **Respect agent boundaries** - Let each agent do what it's designed for
4. **Chain agents appropriately** - Follow the documented workflows
5. **Use complexity flags** - [SEQUENTIAL] and [DIRECT] when needed
6. **Verify with discovery agents** - Before making changes, understand current state

Remember: The agent system is designed to make complex operations safer and more reliable. When in doubt, use an agent!