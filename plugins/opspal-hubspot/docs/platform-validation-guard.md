# Platform Validation Guard - Preventing Cross-Platform Agent Routing Errors

**Issue:** issue_002 from Reflection dc5c05e3-e712-40e0-8ab9-bfeaf4b56934
**Priority:** P2 (prompt-mismatch taxonomy)
**Status:** Documentation complete, implementation pending

---

## Problem Statement

**What Happened:**
User requested "use appropriate sub-agents" for a HubSpot workflow operation, but the assistant invoked `opspal-salesforce:sfdc-orchestrator` instead of a HubSpot-specific agent.

**User Feedback:**
> "Why are you using a Salesforce agent for a HubSpot operation?"

**Impact:**
- Wrong agent selected → wasted time
- User frustration and confusion
- Potential for incorrect operations if agent executes
- Loss of trust in agent routing

**Root Cause:**
Agent selection logic failed to match HubSpot context keywords to HubSpot-specific agents. No validation prevented mismatched platform routing.

---

## Solution Overview

Implement **platform validation guards** that verify task platform matches agent platform before invocation.

### Three-Layer Defense:

1. **Pre-Invocation Validation** - Check platform match before Task tool use
2. **Agent Self-Identification** - Agents declare their platform in frontmatter
3. **Post-Selection Confirmation** - User confirmation for ambiguous cases

---

## Implementation Guide

### Layer 1: Pre-Invocation Validation

#### Concept

Before invoking any agent via Task tool, perform platform validation:

```
User Request → Extract Platform → Match to Agent → Validate → Invoke or Reject
```

#### Platform Detection Logic

```javascript
function detectPlatform(userMessage, context) {
  const platformKeywords = {
    hubspot: [
      'hubspot', 'hs', 'workflow', 'contact', 'deal pipeline',
      'business unit', 'marketing hub', 'sales hub',
      'hubspot-plugin', 'mcp__hubspot-v4'
    ],
    salesforce: [
      'salesforce', 'sfdc', 'apex', 'sobject', 'lightning',
      'sfdx', 'metadata', 'org', 'sandbox', 'production',
      'salesforce-plugin', 'mcp__salesforce'
    ],
    cross-platform: [
      'sync', 'both', 'integration', 'bidirectional',
      'salesforce and hubspot', 'both platforms'
    ]
  };

  // Score each platform
  const scores = {};
  for (const [platform, keywords] of Object.entries(platformKeywords)) {
    scores[platform] = keywords.filter(kw =>
      userMessage.toLowerCase().includes(kw) ||
      context.toLowerCase().includes(kw)
    ).length;
  }

  // Return platform with highest score
  const maxScore = Math.max(...Object.values(scores));
  if (maxScore === 0) return 'unknown';

  return Object.keys(scores).find(p => scores[p] === maxScore);
}
```

#### Validation Before Invocation

```javascript
function validateAgentPlatform(agentName, detectedPlatform) {
  const agentPlatforms = {
    'hubspot-workflow-builder': 'hubspot',
    'hubspot-orchestrator': 'hubspot',
    'hubspot-data-manager': 'hubspot',
    'sfdc-orchestrator': 'salesforce',
    'sfdc-metadata-analyzer': 'salesforce',
    'sfdc-apex-developer': 'salesforce',
    'unified-orchestrator': 'cross-platform',
    'sfdc-hubspot-bridge': 'cross-platform'
  };

  const agentPlatform = agentPlatforms[agentName];

  if (!agentPlatform) {
    return { valid: true, warning: `Unknown agent: ${agentName}` };
  }

  if (agentPlatform === 'cross-platform') {
    return { valid: true, warning: null };
  }

  if (detectedPlatform === 'unknown') {
    return { valid: true, warning: 'Platform unclear, proceeding with caution' };
  }

  if (agentPlatform !== detectedPlatform && detectedPlatform !== 'cross-platform') {
    return {
      valid: false,
      error: `Platform mismatch: Agent '${agentName}' is for ${agentPlatform}, but task is for ${detectedPlatform}`
    };
  }

  return { valid: true, warning: null };
}
```

#### Integration Point

This validation should occur:
- **In agent system prompts** (guideline to check platform)
- **In pre-task hooks** (automated validation)
- **In orchestrator agents** (before delegating to sub-agents)

---

### Layer 2: Agent Self-Identification

#### Agent Frontmatter

All agents should declare their platform in YAML frontmatter:

```yaml
---
name: hubspot-workflow-builder
platform: hubspot
supported_objects: [contacts, deals, companies]
requires_mcp: hubspot-v4
incompatible_with: [salesforce, sfdc]
---
```

#### Parsing Agent Metadata

```javascript
function parseAgentMetadata(agentFilePath) {
  const content = fs.readFileSync(agentFilePath, 'utf8');
  const match = content.match(/^---\n([\s\S]*?)\n---/);

  if (!match) return null;

  const yaml = require('js-yaml');
  return yaml.load(match[1]);
}
```

#### Usage in Validation

```javascript
function validateWithMetadata(agentName, detectedPlatform) {
  const metadata = parseAgentMetadata(`.claude/agents/${agentName}.md`);

  if (!metadata || !metadata.platform) {
    return { valid: true, warning: `No platform metadata for ${agentName}` };
  }

  if (metadata.incompatible_with && metadata.incompatible_with.includes(detectedPlatform)) {
    return {
      valid: false,
      error: `Agent ${agentName} is incompatible with ${detectedPlatform}`
    };
  }

  if (metadata.platform !== detectedPlatform && detectedPlatform !== 'unknown') {
    return {
      valid: false,
      error: `Agent ${agentName} is for ${metadata.platform}, but task is for ${detectedPlatform}`,
      suggestion: `Use ${detectedPlatform}-orchestrator instead`
    };
  }

  return { valid: true, warning: null };
}
```

---

### Layer 3: Post-Selection Confirmation

#### Ambiguous Case Detection

```javascript
function isAmbiguous(userMessage, detectedPlatform, agentName) {
  // Ambiguous if:
  // 1. User said "appropriate" without specifying platform
  if (userMessage.includes('appropriate') && detectedPlatform === 'unknown') {
    return true;
  }

  // 2. Platform score is close (within 1 point)
  const scores = detectPlatformScores(userMessage);
  const sortedScores = Object.values(scores).sort((a, b) => b - a);
  if (sortedScores[0] - sortedScores[1] <= 1) {
    return true;
  }

  // 3. Cross-platform agent selected
  if (agentName.includes('unified') || agentName.includes('bridge')) {
    return true;
  }

  return false;
}
```

#### Confirmation Prompt

```javascript
function requestConfirmation(agentName, detectedPlatform, userMessage) {
  return `
I'm planning to use '${agentName}' for this task.

**Detected Platform:** ${detectedPlatform}
**Agent Platform:** ${agentMetadata[agentName].platform}

**Task Context:** "${userMessage.slice(0, 100)}..."

Is this the correct agent for your task?
- Type 'yes' to proceed
- Type 'no' and suggest the correct agent
`;
}
```

---

## Integration Examples

### Example 1: Pre-Task Hook

**File:** `.claude/hooks/pre-task-platform-validator.sh`

```bash
#!/bin/bash
# Pre-Task Platform Validation Hook
# Runs before any Task tool invocation

AGENT_NAME="$1"
USER_MESSAGE="$2"

# Call validation script
node .claude/scripts/validate-platform.js "$AGENT_NAME" "$USER_MESSAGE"

EXIT_CODE=$?

if [ $EXIT_CODE -ne 0 ]; then
  echo "❌ Platform validation failed"
  echo "Agent '$AGENT_NAME' does not match task platform"
  echo "Suggestion: Check agent routing rules"
  exit 1
fi

echo "✅ Platform validation passed"
exit 0
```

---

### Example 2: Orchestrator Agent Validation

**In hubspot-orchestrator.md:**

```markdown
## Platform Validation (MANDATORY)

Before delegating to any sub-agent:

1. **Verify platform match:**
   - Task mentions HubSpot? → Use hubspot-* agents only
   - Task mentions Salesforce? → STOP, use sfdc-* agents instead
   - Task mentions both? → Use unified-orchestrator

2. **Reject mismatches:**
   ```
   ❌ DO NOT invoke salesforce agents for HubSpot tasks
   ❌ DO NOT invoke hubspot agents for Salesforce tasks
   ```

3. **When in doubt, ask user:**
   "This task could apply to HubSpot or Salesforce. Which platform are you working with?"

## Sub-Agent Routing Rules

| Task Type | Correct Agent | NEVER Use |
|-----------|---------------|-----------|
| Workflow modification | hubspot-workflow-builder | sfdc-orchestrator ❌ |
| Property creation | hubspot-data-manager | sfdc-metadata-analyzer ❌ |
| API integration | hubspot-api-connector | sfdc-apex-developer ❌ |
```

---

### Example 3: Validation Script

**File:** `.claude/scripts/validate-platform.js`

```javascript
#!/usr/bin/env node
const fs = require('fs');

const AGENT_NAME = process.argv[2];
const USER_MESSAGE = process.argv[3];

// Platform detection
function detectPlatform(message) {
  const keywords = {
    hubspot: ['hubspot', 'workflow', 'contact', 'deal pipeline'],
    salesforce: ['salesforce', 'apex', 'sobject', 'lightning'],
  };

  for (const [platform, kws] of Object.entries(keywords)) {
    if (kws.some(kw => message.toLowerCase().includes(kw))) {
      return platform;
    }
  }

  return 'unknown';
}

// Agent platform mapping
const agentPlatforms = {
  'hubspot-workflow-builder': 'hubspot',
  'hubspot-orchestrator': 'hubspot',
  'sfdc-orchestrator': 'salesforce',
  'sfdc-metadata-analyzer': 'salesforce',
};

// Validation
const detected = detectPlatform(USER_MESSAGE);
const agentPlatform = agentPlatforms[AGENT_NAME];

if (!agentPlatform) {
  console.log(`⚠️  Unknown agent: ${AGENT_NAME}`);
  process.exit(0); // Allow unknown agents
}

if (detected !== 'unknown' && agentPlatform !== detected) {
  console.error(`❌ Platform mismatch!`);
  console.error(`   Agent: ${AGENT_NAME} (${agentPlatform})`);
  console.error(`   Task: ${detected}`);
  console.error(`   Suggestion: Use ${detected}-orchestrator instead`);
  process.exit(1);
}

console.log(`✅ Platform match: ${agentPlatform}`);
process.exit(0);
```

**Make executable:**
```bash
chmod +x .claude/scripts/validate-platform.js
```

---

## Testing

### Test Cases

#### Test Case 1: Correct Match

**Input:**
- User Message: "Create a HubSpot workflow to nurture leads"
- Agent Selected: `hubspot-workflow-builder`

**Expected:**
- ✅ Validation passes
- No warnings

---

#### Test Case 2: Platform Mismatch (Error)

**Input:**
- User Message: "Modify the HubSpot workflow"
- Agent Selected: `sfdc-orchestrator`

**Expected:**
- ❌ Validation fails
- Error: "Platform mismatch: Agent 'sfdc-orchestrator' is for salesforce, but task is for hubspot"
- Suggestion: "Use hubspot-orchestrator instead"

---

#### Test Case 3: Ambiguous Platform

**Input:**
- User Message: "Use appropriate sub-agents for this task"
- Agent Selected: `hubspot-workflow-builder`

**Expected:**
- ⚠️  Warning: "Platform unclear, requesting confirmation"
- Prompt user: "Is this a HubSpot or Salesforce task?"

---

#### Test Case 4: Cross-Platform Agent

**Input:**
- User Message: "Sync data between Salesforce and HubSpot"
- Agent Selected: `sfdc-hubspot-bridge`

**Expected:**
- ✅ Validation passes
- Note: Cross-platform agent allowed for both platforms

---

### Manual Testing

```bash
# Test validation script
node .claude/scripts/validate-platform.js "sfdc-orchestrator" "Create a HubSpot workflow"
# Expected: Exit 1 (failure)

node .claude/scripts/validate-platform.js "hubspot-workflow-builder" "Create a HubSpot workflow"
# Expected: Exit 0 (success)
```

---

## Rollout Plan

### Phase 1: Documentation (✅ Complete)
- [x] Document platform validation pattern
- [x] Create integration examples
- [x] Write test cases

### Phase 2: Add Agent Metadata (Pending)
- [ ] Add `platform` field to all agent frontmatter
- [ ] Add `incompatible_with` lists where applicable
- [ ] Document platform mapping

### Phase 3: Implement Validation Script (Pending)
- [ ] Create `.claude/scripts/validate-platform.js`
- [ ] Add platform detection logic
- [ ] Add agent platform mapping
- [ ] Test with all agent combinations

### Phase 4: Integrate Hooks (Pending)
- [ ] Create pre-task hook for platform validation
- [ ] Wire hook into Task tool invocations
- [ ] Test hook with sample tasks

### Phase 5: Update Orchestrator Agents (Pending)
- [ ] Add platform validation guidelines to `hubspot-orchestrator.md`
- [ ] Add platform validation guidelines to `sfdc-orchestrator.md`
- [ ] Add platform validation guidelines to `unified-orchestrator.md`

### Phase 6: Validation & Rollout (Pending)
- [ ] Test with real-world scenarios
- [ ] Collect feedback from users
- [ ] Refine keyword matching
- [ ] Monitor error rates

---

## Success Metrics

### Target Metrics (30 days post-rollout)

| Metric | Current | Target | Measurement |
|--------|---------|--------|-------------|
| Platform mismatches | 2/week | 0/week | Reflection analysis |
| User corrections | 15% | <2% | User feedback |
| Validation false positives | N/A | <5% | Hook logs |
| Average task success rate | 85% | >95% | Reflection outcomes |

### Monitoring

```bash
# Check platform validation logs
tail -f .claude/logs/platform-validation.log

# Count validation failures
grep "Platform mismatch" .claude/logs/platform-validation.log | wc -l

# Identify most common mismatches
grep "Platform mismatch" .claude/logs/platform-validation.log | \
  awk '{print $4, $6}' | sort | uniq -c | sort -rn
```

---

## Related Issues

### Similar Issues to Prevent

- **issue_002**: Wrong agent selection (HubSpot → Salesforce)
- **Potential future issues**:
  - Salesforce agent used for HubSpot data operations
  - Cross-platform agent used for platform-specific tasks
  - User confusion about which agent to use

### Broader Impact

Platform validation addresses a class of issues:
- **Agent routing errors** - Wrong agent selected
- **Tool mismatches** - Using wrong MCP server
- **Context confusion** - Mixing platform-specific logic

---

## Related Resources

- [Agent Routing Rules](../AGENT_ROUTING_RULES.md)
- [HubSpot Plugin README](../../README.md)
- [Asana Task: MCP-First Tool Discovery](https://app.asana.com/0/1211617834659194/1211619300702115)
- Reflection: dc5c05e3-e712-40e0-8ab9-bfeaf4b56934

---

## Feedback

**Have suggestions for improving platform validation?**
- Submit a reflection via `/reflect`
- Update this document directly
- Create an issue in the plugin repository

**Document History:**
- 2025-10-12: Initial documentation based on issue_002 analysis
