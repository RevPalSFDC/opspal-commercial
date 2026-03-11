---
description: Parse specification document and generate executable Asana project plan
argument-hint: "<spec_file> [--project-id <gid>] [--execute] [--dry-run]"
---

# Plan from Specification

You must invoke the `implementation-planner` agent to parse the specification document and generate an executable Asana project plan.

## Parse User Input

Extract the following from the user's command:
- `spec_file`: Required - Path to specification document
- `project_id`: Optional - Existing Asana project GID
- `execute`: Optional - Boolean flag to start immediately
- `dry_run`: Optional - Boolean flag to preview only

## Invoke Implementation Planner

Use the Task tool to invoke the implementation-planner agent with this prompt:

```
Parse and execute the specification at: <spec_file>

${project_id ? `Use existing Asana project: ${project_id}` : 'Search for or ask user to create Asana project'}
${execute ? 'Execute immediately after creating plan.' : 'Show plan for user approval before executing.'}
${dry_run ? 'DRY RUN MODE: Show plan but do not create Asana tasks.' : ''}

Steps:
1. Use project-plan-generator.js to parse the specification
2. Generate structured project plan with phases, tasks, estimates, dependencies
3. Query existing project sections and map phases to sections
4. ${dry_run ? 'Display plan summary and exit' : 'Create tasks in Asana project with section assignments'}
5. Link task dependencies automatically based on detected requirements
6. ${execute && !dry_run ? 'Delegate tasks to specialized agents using Task() tool' : 'Wait for user approval'}
7. Track progress and post status updates to project
```

## Expected Output

After invoking the agent, you should see:
- Specification parsing confirmation
- Generated plan summary (phases, tasks, estimates, dependencies)
- Section mapping (if project has sections matching phase names)
- Asana task creation with section assignments (unless dry-run)
- Dependency linking between tasks
- **Timeline calculation** with start/due dates (working days, excluding weekends)
- **Custom field defaults** set (Effort hours, Status = "Not Started")
- **Phase milestones** created and linked to all phase tasks
- **Section organization** (untitled sections renamed)
- **Project description** set with objectives, scope, timeline
- Task delegation status (if --execute)
- Progress updates posted to project

## Error Handling

If the agent reports errors:
- **"No requirements found"**: Specification format invalid - show user the template examples
- **"Project not found"**: User must create Asana project manually or provide --project-id
- **"Agent not found"**: Implementation-planner agent not loaded - check agent discovery

## Workflow

1. **Parse Specification**: Extract requirements, phases, explicit and implicit dependencies
2. **Generate Plan**: Break down into tasks with estimates, agent assignments, and dependency mapping
3. **Query Sections**: Find existing project sections and map to phase names
4. **Create Asana Tasks**: Build tasks with section assignments and full descriptions
5. **Link Dependencies**: Automatically connect tasks based on detected dependencies
6. **Approval**: Present plan summary for review (unless --execute flag set)
7. **Execute**: Delegate tasks to specialized agents via Task() tool (if --execute)
8. **Track Progress**: Monitor completion and post status updates to project

## Example

```bash
# Generate and review plan
/plan-from-spec ./specs/customer-onboarding.md

# Generate and execute immediately
/plan-from-spec ./specs/field-cleanup.md --execute

# Add to existing project
/plan-from-spec ./specs/integration.md --project-id 1234567890

# Preview without creating Asana tasks
/plan-from-spec ./specs/automation.md --dry-run
```

## Specification Format

Specifications should include:
- **Title**: Project name (H1 heading)
- **Summary**: Brief description
- **Requirements**: Listed with IDs (REQ-001, REQ-002, etc.)
- **Acceptance Criteria**: Success conditions for each requirement
- **Estimates**: Effort in hours (optional - will be calculated if missing)
- **Dependencies**: Between requirements (optional - will be inferred)

### Example Specification

```markdown
# Salesforce Field Cleanup Project

## Overview
Clean up unused custom fields and consolidate duplicates on Account and Contact objects.

## Requirements

### REQ-001: Audit Account Fields
**Type**: Data
**Priority**: High
**Platform**: Salesforce
**Estimated Effort**: 4 hours

Analyze all custom fields on Account object to identify usage patterns.

**Acceptance Criteria**:
- Field usage statistics generated
- Unused fields identified
- Duplicate fields mapped

### REQ-002: Consolidate Duplicate Fields
**Type**: Functional
**Priority**: High
**Platform**: Salesforce
**Dependencies**: REQ-001
**Estimated Effort**: 8 hours

Merge duplicate fields and migrate data.

**Acceptance Criteria**:
- Data migrated without loss
- References updated
- Old fields deprecated
```

## Supported Platforms

- Salesforce
- HubSpot
- Cross-platform (Salesforce + HubSpot integrations)

## Agent Assignment

Tasks are automatically assigned to appropriate agents based on:
- **Keywords**: "field", "object", "flow", "workflow", "integration", etc.
- **Platform**: Salesforce vs HubSpot
- **Type**: Data, functional, technical, integration

### Agent Mapping Examples

- `sfdc-metadata-manager` - Object/field creation, layouts
- `sfdc-data-operations` - Data imports, migrations
- `sfdc-automation-builder` - Flows, workflows
- `hubspot-workflow-builder` - HubSpot automation
- `unified-orchestrator` - Complex multi-platform work

## Dependency Detection

The system automatically detects dependencies:
- **Explicit**: Listed in requirement dependencies field
- **Implicit**: Based on patterns (e.g., object creation before fields)

### Implicit Dependency Rules

- Object creation → Field creation
- Field creation → Layout configuration
- Data model → Automation
- Apex class → Test class
- Sandbox → Production deployment

## Project Structure

Generated Asana projects include:
- **Phases**: Foundation → Configuration → Automation → Integration → Testing
- **Sections**: One per phase (untitled sections renamed to "Planning & Summary")
- **Tasks**: One per requirement with full description, start/due dates
- **Dependencies**: Mapped between tasks (both explicit and implicit)
- **Milestones**: One per phase, linked to all phase tasks as dependencies
- **Timeline**: Working days calculation (excludes weekends)
- **Custom Fields**: Effort hours (set), Status (set to "Not Started"), agent, platform, complexity
- **Project Description**: Comprehensive overview with objectives, scope, timeline, phases

## Output

After plan generation, you'll see:

```
Analyzing specification...
Found 8 requirements across 3 phases
Estimated 32 hours total effort (5.3 working days)

Project Plan Generated:
├── Phase 1: Foundation (4 tasks, 16 hours)
│   ├── REQ-001: Audit Account Fields (4h) → sfdc-data-operations
│   ├── REQ-002: Audit Contact Fields (4h) → sfdc-data-operations
│   └── ...
├── Phase 2: Configuration (3 tasks, 12 hours)
│   └── ...
└── Phase 3: Testing & Deployment (1 task, 4 hours)

Creating Asana project...
✅ Project created: https://app.asana.com/0/1234567890

Querying project sections...
Found 3 sections in project
  ✓ Mapped phase "Foundation" to section "Foundation"
  ✓ Mapped phase "Configuration" to section "Configuration"

Creating tasks...
✅ Created: REQ-001 (1234567890123456)
✅ Created: REQ-002 (1234567890123457)
...

Linking task dependencies...
  🔗 Linked 5 dependencies for REQ-003
✅ Total dependencies linked: 12

📅 Calculating project timeline...
  📅 REQ-001: 2025-10-26 → 2025-10-26 (1 day)
  📅 REQ-002: 2025-10-27 → 2025-10-27 (1 day)
  ...

⚙️  Setting custom field defaults...
  ✅ REQ-001: Effort=4h, Status=Not Started
  ✅ REQ-002: Effort=4h, Status=Not Started
  ...

🏁 Creating phase milestones...
  🏁 Created milestone for Foundation (1234567890123470)
  🔗 Linked 4 tasks as dependencies
  🏁 Created milestone for Configuration (1234567890123471)
  🔗 Linked 3 tasks as dependencies

📂 Organizing sections...
  ✏️  Renamed "Untitled section" → "Planning & Summary"

📝 Setting project description...
  ✅ Project description set

✅ Project setup complete!

Ready to execute. Options:
- Review tasks in Asana first: https://app.asana.com/0/1234567890
- Run /execute-plan to start implementation
- Or wait for your approval to proceed
```

## Templates

Use pre-built templates for common project types:

```bash
# Salesforce implementation
cp ${CLAUDE_PLUGIN_ROOT}/templates/specifications/salesforce-implementation.md ./specs/my-project.md

# HubSpot workflow
cp ${CLAUDE_PLUGIN_ROOT}/templates/specifications/hubspot-workflow.md ./specs/my-workflow.md

# Integration project
cp ${CLAUDE_PLUGIN_ROOT}/templates/specifications/integration-project.md ./specs/my-integration.md
```

## Error Handling

**Incomplete Specification**:
```
Error: Specification appears incomplete - no requirements found.

Expected format:
- Section titled "Requirements" or "Features"
- List of requirements with descriptions
- Acceptance criteria for each

Use a template from templates/specifications/ or provide more detail.
```

**Invalid File**:
```
Error: Unsupported file format: .pdf
Please convert to .md (markdown) or .txt (plain text) format first.
```

## Best Practices

1. **Clear Requirements**: Write specific, measurable requirements
2. **Acceptance Criteria**: Define success conditions explicitly
3. **Estimates**: Provide estimates when known (system will calculate if missing)
4. **Dependencies**: List explicit dependencies (system infers others)
5. **Platform Clarity**: Specify Salesforce vs HubSpot clearly

## Related

- **Implementation Planner Agent**: `.claude-plugins/opspal-core/agents/implementation-planner.md`
- **Plan Generator Script**: `.claude-plugins/opspal-core/scripts/lib/project-plan-generator.js`
- **Asana Playbook**: `.claude-plugins/opspal-core/docs/ASANA_AGENT_PLAYBOOK.md`
- **Templates**: `.claude-plugins/opspal-core/templates/specifications/`

---

**Invoke implementation-planner agent to execute this command**
