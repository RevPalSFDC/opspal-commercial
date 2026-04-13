---
name: salesforce-assessment-to-execution-automation-framework
description: Automate post-assessment hook workflows from assessment completion to planning triggers and knowledge sync.
allowed-tools:
  - Read
  - Grep
  - Glob
---

# Assessment-to-Execution Automation Framework

## When to Use This Skill

Use this skill when:
- An assessment (CPQ, RevOps, automation audit) has completed and findings need to become deployment actions
- Building the post-assessment hook pipeline that triggers planning and knowledge sync
- Converting structured audit findings into package.xml manifests and deployment plans
- Automating the handshake between assessment agents and execution agents (deployment, permission sets, validation rules)

**Not for**: Running assessments (use domain-specific assessment agents), managing deployments (use `deployment-state-management-framework`), or building quality gates (use `salesforce-deployment-quality-gates-framework`).

## Assessment-to-Execution Pipeline

```
Assessment Agent → Findings JSON → Planning Trigger Hook → Execution Plan
                                        ↓
                              NotebookLM Sync (knowledge capture)
                                        ↓
                              Phased package.xml Generation
                                        ↓
                              Execution Agent(s) → Deploy
```

## Workflow

### Step 1: Assessment Completion Handshake

When an assessment agent (e.g., `sfdc-revops-auditor`, `sfdc-cpq-assessor`) completes, it produces a structured findings JSON:

```json
{
  "assessment_type": "revops-audit",
  "org_alias": "acme-prod",
  "findings": [
    {
      "id": "F-001",
      "severity": "CRITICAL",
      "category": "data_quality",
      "component_type": "ValidationRule",
      "object": "Opportunity",
      "recommended_action": "create",
      "parameters": { "rule_name": "...", "formula": "..." }
    }
  ]
}
```

The `post-assessment-planning-trigger.sh` hook detects assessment completion and initiates the planning phase.

### Step 2: Generate Execution Plan from Findings

Filter findings by severity and generate phased deployment manifests:

```bash
# Generate package.xml from findings (assessment-to-manifest)
node scripts/lib/sfdc-dependency-analyzer.js \
  --manifest-from-findings assessment-findings.json \
  --org <org-alias> \
  --output package.xml

# Verify no cross-phase dependency violations
node scripts/lib/verify-manifest-split.js package-phase1.xml package-phase2.xml
```

Phase ordering:
1. **Phase 1**: Schema changes (custom fields, objects) - no dependencies
2. **Phase 2**: Automation (validation rules, flows) - depends on Phase 1 fields
3. **Phase 3**: Security (permission sets, sharing rules) - depends on Phase 1+2
4. **Phase 4**: Data fixes (record updates, enrichment) - depends on all above

### Step 3: Sync to Knowledge Base

Assessment findings are automatically synced to NotebookLM (if configured) for client knowledge retention:

```bash
/notebook-sync <org-alias> <assessment-report-path>
```

### Step 4: Hand Off to Execution Agents

Each phase routes to the appropriate specialist:
- Validation rules → `validation-rule-orchestrator`
- Permission sets → `sfdc-permission-orchestrator`
- Flows → `sfdc-deployment-manager`
- Data operations → `sfdc-data-operations`

## Routing Boundaries

Use this skill for the post-assessment automation pipeline.
Use `operations-readiness-framework` for pre-assessment environment preparation.
Use domain-specific execution skills for the actual deployment work.

## References

- [Assessment Planning Trigger](./planning-trigger.md)
- [Assessment Notebook Sync](./notebook-sync.md)
- [Assessment-to-Execution Handshake](./execution-handshake.md)
