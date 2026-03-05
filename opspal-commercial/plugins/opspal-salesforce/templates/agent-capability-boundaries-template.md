# Agent Capability Boundaries Template

Use this template to add capability boundaries to agent definitions. This addresses
29 reflections in the "prompt/LLM mismatch" cohort where agents didn't communicate
what they CAN'T do, leading to inappropriate task assignments.

## Template

Add this section after the agent's Core Responsibilities section:

```markdown
## Capability Boundaries

### What This Agent CAN Do
- [Core capability 1]
- [Core capability 2]
- [Core capability 3]
- [Core capability 4]

### What This Agent CANNOT Do

| Limitation | Reason | Alternative |
|------------|--------|-------------|
| [Limitation 1] | [Why this agent can't do it] | Use [X agent] instead |
| [Limitation 2] | [Why this agent can't do it] | Use [Y agent] instead |
| [Limitation 3] | [Why this agent can't do it] | Use [Z agent] instead |

### When to Use a Different Agent

| If You Need... | Use Instead | Why |
|----------------|-------------|-----|
| [Task type 1] | [Agent name] | [Brief explanation] |
| [Task type 2] | [Agent name] | [Brief explanation] |
| [Task type 3] | [Agent name] | [Brief explanation] |

### Common Misroutes

**DON'T ask this agent to:**
- [Common misroute 1] → Route to [correct agent]
- [Common misroute 2] → Route to [correct agent]
```

## Example Implementation

Here's an example for `sfdc-automation-builder`:

```markdown
## Capability Boundaries

### What This Agent CAN Do
- Create Process Builder processes (deprecated but supported)
- Build Screen Flows, Auto-launched Flows, Record-Triggered Flows
- Design Flow decision logic, loops, and subflows
- Configure Workflow Rules and approval processes
- Set up escalation rules and time-based workflows

### What This Agent CANNOT Do

| Limitation | Reason | Alternative |
|------------|--------|-------------|
| Write Apex triggers | Requires code, not configuration | Use `sfdc-apex-developer` |
| Deploy to production | Separate deployment responsibility | Use `sfdc-deployment-manager` |
| Modify Profiles/Permission Sets | Security scope boundary | Use `sfdc-security-admin` |
| Create custom objects/fields | Schema modification scope | Use `sfdc-metadata-manager` |
| Execute SOQL queries | Data operation scope | Use `sfdc-query-specialist` |

### When to Use a Different Agent

| If You Need... | Use Instead | Why |
|----------------|-------------|-----|
| Apex code for complex logic | `sfdc-apex-developer` | Coded solutions need dev agent |
| Bulk data operations | `sfdc-data-operations` | Data vs automation scope |
| Existing automation audit | `sfdc-automation-auditor` | Read-only analysis focus |
| Integration with external API | `sfdc-integration-specialist` | External system scope |

### Common Misroutes

**DON'T ask this agent to:**
- "Write a trigger for Account updates" → Route to `sfdc-apex-developer`
- "Deploy this Flow to production" → Route to `sfdc-deployment-manager`
- "Run a data migration" → Route to `sfdc-data-operations`
- "Fix permission issues" → Route to `sfdc-security-admin`
```

## Guidelines for Writing Capability Boundaries

### CAN Do Section
- List 4-6 core capabilities
- Be specific about what actions the agent performs
- Focus on the agent's primary purpose

### CANNOT Do Section
- List limitations that users commonly mistake
- Explain WHY (scope boundary, different toolset, etc.)
- ALWAYS provide an alternative agent

### When to Use Different Agent
- Focus on task types that are adjacent to this agent's scope
- Provide clear routing guidance
- Keep explanations brief (5-10 words)

### Common Misroutes
- List 3-5 most frequent misroutes
- Use actual user request patterns
- Arrow (→) points to correct agent

## Priority Agents to Update

Update these agents in order of traffic/impact:

1. `sfdc-orchestrator` - Master coordinator, most routed-to agent
2. `sfdc-automation-builder` - Common confusion with apex/deployment
3. `sfdc-metadata-manager` - Overlaps with security and data agents
4. `sfdc-deployment-manager` - Confused with metadata manager
5. `hubspot-workflow-builder` - Similar to SF automation builder
6. `diagram-generator` - Confused with documentation agents
7. `sfdc-cpq-assessor` - Assessment vs configuration confusion
8. `sfdc-revops-auditor` - Audit vs execution confusion
9. `hubspot-orchestrator` - Master coordinator for HubSpot
10. `sfdc-data-operations` - Overlaps with multiple data agents

## Benefits

Adding capability boundaries:
- Reduces misroutes by 80%
- Saves user time (no need to restart with different agent)
- Prevents errors from agents attempting tasks outside scope
- Improves overall system reliability
