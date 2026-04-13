---
name: screen-flow-hybrid-delivery-framework
description: Salesforce Screen Flow hybrid-delivery framework for automation feasibility, XML-vs-UI boundaries, manual-step handoff templates, and expectation-setting. Use when Screen Flow work cannot be fully automated end-to-end.
allowed-tools:
  - Read
  - Grep
  - Glob
---

# Screen Flow Hybrid Delivery Framework

## When to Use This Skill

Use this skill when:
- A Screen Flow cannot be fully automated via XML (needs UI configuration after deploy)
- Assessing which screen components are automatable vs manual-only
- Generating a post-deployment manual checklist for the admin
- Combining Screen Flows with autolaunched subflows for the best automation coverage

**Not for**: Autolaunched Flow development (use `flow-xml-lifecycle-framework`), general automation selection (use `automation-building-patterns`), or Flow complexity analysis (use `flow-segmentation-guide`).

## Automation Feasibility Matrix

| Component | Automatable via XML? | Notes |
|-----------|---------------------|-------|
| DisplayText, InputField (text/number/date) | Yes | Full XML support |
| RadioButtons, static Picklist | Yes | `choiceReferences` in XML |
| Section headers, LongTextArea | Yes | Standard elements |
| Data Table | Partial | Columns automated, row selection manual |
| Dependent Picklists | Partial | Field refs automated, dynamic choices manual |
| Dynamic Record Choice Sets | No | Must configure in Flow Builder |
| Custom LWC in Flow | No | Component reference deploys, config is manual |
| Quick Action variable assignments | No | Must configure in Setup after deploy |

## Hybrid Architecture Pattern

```
Screen Flow (partially automatable)
├── Screen 1: Collect user input     ← XML: fields, labels, validation
├── Screen 2: Display confirmation   ← XML: display text, variables
└── Subflow: Execute business logic  ← 100% automatable (autolaunched)
    ├── Create records
    ├── Send notifications
    └── Update related records
```

## Feasibility Score

`Score = (fullyAuto + 0.5 * partialAuto) / (fullyAuto + partialAuto + manualOnly) * 100`

| Score | Assessment |
|-------|-----------|
| >80% | High automation — deploy XML, minimal manual steps |
| 50-80% | Moderate — deploy XML skeleton, document manual completion |
| <50% | Low — consider building in Flow Builder directly |

## Workflow

1. Inventory all screen components by automation feasibility
2. Calculate feasibility score
3. Deploy automatable XML portions via `sf project deploy`
4. Generate post-deploy manual checklist with Setup navigation paths

## Routing Boundaries

Use this skill for Screen Flow hybrid execution planning.
Use `automation-building-patterns` for general automation capability selection.
Use `flow-xml-lifecycle-framework` for non-screen flow lifecycle orchestration.

## References

- [automation limits matrix](./automation-limits-matrix.md)
- [feasibility assessment](./feasibility-assessment.md)
- [manual handoff templates](./manual-handoff-templates.md)
