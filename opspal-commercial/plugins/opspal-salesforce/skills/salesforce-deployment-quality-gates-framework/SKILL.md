---
name: salesforce-deployment-quality-gates-framework
description: Salesforce deployment quality-gate framework for pre-deploy validation orchestration, report/flow checks, and post-deploy state verification. Use when hardening deployment safety hooks.
allowed-tools:
  - Read
  - Grep
  - Glob
---

# Salesforce Deployment Quality Gates Framework

Use this skill for hook-driven deployment safety controls.

## Workflow

1. Run comprehensive pre-deploy validation.
2. Execute domain-specific quality gates (reports/flows).
3. Verify post-deploy state and cache consistency.
4. Record gate outcomes and exceptions.

## Routing Boundaries

Use this skill for hook enforcement around deployments.
Use `deployment-validation-framework` for metadata deployment strategy.

## References

- [comprehensive predeploy validation](./comprehensive-predeploy-validation.md)
- [report and flow quality gates](./report-flow-quality-gates.md)
- [postdeploy state verification](./postdeploy-state-verification.md)
