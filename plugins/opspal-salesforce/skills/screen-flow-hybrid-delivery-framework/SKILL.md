---
name: screen-flow-hybrid-delivery-framework
description: Salesforce Screen Flow hybrid-delivery framework for automation feasibility, XML-vs-UI boundaries, manual-step handoff templates, and expectation-setting. Use when Screen Flow work cannot be fully automated end-to-end.
allowed-tools:
  - Read
  - Grep
  - Glob
---

# Screen Flow Hybrid Delivery Framework

Use this skill when Screen Flow delivery requires both automated and manual setup.

## Workflow

1. Assess automatable vs manual components.
2. Produce feasibility score and expectation report.
3. Implement automatable XML portions.
4. Generate explicit post-deploy manual checklist.

## Routing Boundaries

Use this skill for Screen Flow hybrid execution planning.
Use `automation-building-patterns` for general automation capability selection.
Use `flow-xml-lifecycle-framework` for non-screen flow lifecycle orchestration.

## References

- [automation limits matrix](./automation-limits-matrix.md)
- [feasibility assessment](./feasibility-assessment.md)
- [manual handoff templates](./manual-handoff-templates.md)
