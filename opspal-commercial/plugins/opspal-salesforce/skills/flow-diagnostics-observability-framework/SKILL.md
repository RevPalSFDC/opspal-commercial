---
name: flow-diagnostics-observability-framework
description: Salesforce Flow diagnostics and observability framework for test strategy, execution tracing, failure triage, production monitoring, and rollback signals. Use when flows fail or degrade in runtime.
allowed-tools:
  - Read
  - Grep
  - Glob
---

# Flow Diagnostics and Observability Framework

Use this skill for operational troubleshooting and runtime reliability of flows.

## Workflow

1. Reproduce failure with controlled test scenarios.
2. Trace execution and isolate failure point.
3. Apply remediation and validate behavior.
4. Set monitoring and rollback triggers.

## Routing Boundaries

Use this skill for diagnostics/monitoring in runtime.
Use `flow-xml-lifecycle-framework` for standard authoring/deployment lifecycle.
Use `flow-segmentation-guide` for structural decomposition work.

## References

- [testing diagnostics playbook](./testing-diagnostics-playbook.md)
- [monitoring signals](./monitoring-signals.md)
- [failure taxonomy and triage](./failure-taxonomy-triage.md)
- [rollback signal model](./rollback-signal-model.md)
