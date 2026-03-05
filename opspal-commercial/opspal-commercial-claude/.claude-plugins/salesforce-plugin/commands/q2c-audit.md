---
description: Generate comprehensive Q2C/CPQ configuration audit with automated diagram generation
---

Run a complete Quote-to-Cash (Q2C) configuration audit with automated visualization of all CPQ/Q2C components.

The audit will generate:
- **Q2C Process Flow**: 10-stage process showing automation at each stage (Quote Creation → Revenue Recognition)
- **Entity Relationship Diagram (ERD)**: CPQ object relationships with key fields
- **Automation Cascades**: How automation components trigger each other (flows, triggers, PBs, workflows)
- **Approval Flows**: Sequence diagrams for all approval processes
- **CPQ Configuration Diagrams**: Pricing rules, quote lifecycle, renewal flows, product bundles (requires assessment data)

**Target Org**: {org-alias}

**Options** (optional flags):
- `--detail-level high-level|detailed|both`: Diagram detail level (default: both)
- `--output-dir <path>`: Custom output directory
- `--include-inactive`: Include inactive automation and approval processes
- `--focus-objects Quote,Opportunity`: Analyze specific objects only
- `--no-summary`: Skip summary report generation

**Output Location**: `./q2c-audit-{org-alias}-{timestamp}/`

**Generated Artifacts**:
- **q2c-process/**: Q2C process flow diagrams (high-level + detailed)
- **erd/**: Entity relationship diagrams (high-level + detailed)
- **automation/**: Automation cascade diagrams (high-level + detailed)
- **approvals/**: Approval flow sequence diagrams (one per process)
- **cpq-configuration/**: CPQ config diagrams (requires assessment data)
- **Q2C-AUDIT-SUMMARY.md**: Comprehensive summary report with links to all diagrams

**Diagram Formats**:
- Markdown files with Mermaid code blocks (viewable in GitHub, VS Code, etc.)
- All diagrams generated at both high-level (executive) and detailed (technical) views

**Agents Used**:
- q2c-process-flow-generator
- cpq-erd-generator
- cpq-automation-cascade-generator
- approval-flow-generator

**Estimated Duration**: 2-5 minutes depending on org complexity

**Post-Audit Commands**:
```bash
# View summary report
cat q2c-audit-{org-alias}-*/Q2C-AUDIT-SUMMARY.md

# View specific diagrams
cat q2c-audit-{org-alias}-*/q2c-process/q2c-process-flow-overview.md
cat q2c-audit-{org-alias}-*/erd/cpq-erd-detailed.md
cat q2c-audit-{org-alias}-*/automation/cpq-automation-cascade-detailed.md
cat q2c-audit-{org-alias}-*/approvals/approval-flow-*-detailed.md

# Open all markdown files in VS Code
code q2c-audit-{org-alias}-*/*.md
```

**Integration with CPQ Assessor**:
This command generates the visualization layer. For complete CPQ assessment with data analysis:
```bash
# Run full CPQ assessment (includes Q2C audit diagrams)
Use the sfdc-cpq-assessor agent
```

**Use Cases**:
- **Documentation**: Visual documentation of Q2C configuration
- **Onboarding**: Help new team members understand the setup
- **Troubleshooting**: Identify automation conflicts and circular dependencies
- **Audit & Compliance**: Demonstrate process flows for stakeholders
- **Optimization**: Find redundant automation and approval bottlenecks

**Run the Q2C audit orchestrator to generate a comprehensive visualization package for {org-alias} Salesforce org.**
