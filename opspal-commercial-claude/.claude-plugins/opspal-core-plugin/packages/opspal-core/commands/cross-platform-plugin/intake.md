---
name: intake
description: Start project intake workflow - gather specifications, validate, and generate runbook + Asana project
stage: ready
---

# Project Intake Command

Orchestrates the complete project intake workflow, from gathering specifications to generating runbooks and creating Asana projects with tasks.

## Usage

```
/intake                           # Interactive - generate form first
/intake --form-data <path>        # Process existing form data
/intake --validate <path>         # Validate only (no Asana creation)
/intake --help                    # Show help
```

## Options

- `--form-data <path>` - Path to JSON file exported from intake form
- `--validate` - Run validation only without creating Asana project
- `--output <path>` - Output directory for generated files (default: ./)
- `--skip-context` - Skip automatic context gathering from Asana/Salesforce
- `--skip-asana` - Generate runbook but don't create Asana project

## Workflow

### Interactive Mode (No Arguments)

When run without arguments, the command guides you through the complete intake process:

1. **Generate Form** - Creates `intake-form.html` in current directory
2. **User Fills Form** - Open HTML file in browser, fill out, export JSON
3. **Validate Data** - Run validation on exported JSON
4. **Gather Context** - Query Asana/Salesforce for additional context
5. **Generate Runbook** - Create PROJECT_RUNBOOK.md
6. **Create Asana Project** - Build project structure with requirement tasks

### Process Existing Data

If you already have intake data (JSON export from form):

```bash
/intake --form-data ./intake-data.json
```

This will:
1. Load and parse the JSON file
2. Run full validation
3. Gather context from connected systems
4. Generate PROJECT_RUNBOOK.md
5. Create Asana project with tasks

### Validate Only

To check data without creating outputs:

```bash
/intake --validate ./intake-data.json
```

This returns validation results including:
- Validation errors (must fix)
- Warnings (should review)
- Completeness score (%)
- Ready for handoff status

## Example Session

```
/intake

> No form data provided. Would you like to:
  [x] Generate intake form

> Form generated: ./intake-form.html
  Open this file in your browser, fill out the form, and export the JSON.
  Then run: /intake --form-data ./intake-data.json

--- User fills form and exports JSON ---

/intake --form-data ./intake-data.json

> Loading intake data...
> Validating...
  - Required fields: OK
  - Timeline consistency: OK
  - Circular dependencies: None detected
  - Completeness: 85%

> Gathering context...
  - Salesforce org: Connected (hivemq-sandbox)
  - Asana: Connected (RevOps Projects)
  - Related runbooks: 2 found

> Generating runbook...
  - PROJECT_RUNBOOK.md created

> Creating Asana project...
  - Project: "CPQ Implementation - HiveMQ"
  - Sections: 4 created
  - Tasks: 12 created

> Complete!
  - Runbook: ./PROJECT_RUNBOOK.md
  - Asana Project: https://app.asana.com/0/12345/67890
```

## Form Schema Sections

The intake form collects information across 8 sections:

| Section | Required | Key Fields |
|---------|----------|------------|
| Project Identity | Yes | Name, type, owner, priority |
| Goals & Objectives | Yes | Business objective, success metrics |
| Project Scope | Yes | In-scope, out-of-scope, assumptions |
| Data Sources | No | Sources, integrations, automations |
| Timeline & Budget | Yes | Start/end dates, milestones, budget |
| Dependencies & Risks | No | Dependencies, risks, mitigations |
| Technical Requirements | No | Platforms, org details, complexity |
| Approval & Sign-off | No | Approvers, communication plan |

## Validation Rules

### Errors (Must Fix)
- Missing required fields
- Invalid dates (start > end)
- Circular dependencies detected
- Invalid field formats

### Warnings (Should Review)
- Low completeness score (<80%)
- No risks documented
- Unvalidated assumptions
- Missing out-of-scope items

### Completeness Scoring

Each section is weighted:
- Project Identity: 15%
- Goals & Objectives: 20%
- Scope: 20%
- Data Sources: 10%
- Timeline & Budget: 15%
- Dependencies & Risks: 10%
- Technical Requirements: 5%
- Approval & Sign-off: 5%

**Ready for handoff** requires: Score >= 80% AND no validation errors

## Generated Outputs

| File | Description |
|------|-------------|
| `intake-form.html` | Browser-based intake form |
| `PROJECT_RUNBOOK.md` | Complete project runbook |
| `.intake/validation.json` | Validation results |
| `.intake/context.json` | Gathered context |
| `.intake/asana-mapping.json` | Asana task ID mappings |

## Asana Project Structure

Created project includes:

```
Project: {Project Name}
├── Section: Planning
│   ├── Review requirements
│   ├── Validate assumptions
│   └── Finalize scope
├── Section: Requirements
│   ├── [REQ-001] {requirement}
│   ├── [REQ-002] {requirement}
│   └── ...
├── Section: Implementation
│   └── (Tasks added during dev)
├── Section: Testing
│   └── (UAT tasks)
└── Section: Deployment
    └── (Deployment tasks)
```

## Related Commands

- `/intake-generate-form` - Generate just the intake form
- `/asana-link` - Link project to Asana
- `/reflect` - Submit session feedback

## Implementation

This command uses:
- `scripts/lib/intake/intake-form-generator.js` - Form generation
- `scripts/lib/intake/intake-validator.js` - Validation engine
- `scripts/lib/intake/intake-data-gatherer.js` - Context gathering
- `scripts/lib/intake/intake-runbook-builder.js` - Runbook generation
- `agents/project-intake-orchestrator.md` - Orchestration agent

## See Also

- Agent: `project-intake-orchestrator`
- Template: `templates/intake/intake-runbook.md`
- Schema: `templates/intake/intake-schema.json`
