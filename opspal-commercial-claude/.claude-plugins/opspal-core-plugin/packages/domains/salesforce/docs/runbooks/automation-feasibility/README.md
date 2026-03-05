# Automation Feasibility & Expectations Runbook

This runbook addresses expectation-setting for automation tasks, identifying what can and cannot be automated via Metadata API, and establishing clear communication protocols for hybrid (automated + manual) workflows.

## Overview

| Metric | Value |
|--------|-------|
| Reflection Count | 39 |
| Primary Cohort | prompt-mismatch |
| Priority | P0 |
| Annual ROI | $117,000 |
| Root Cause | No automation feasibility analyzer or expectation-setting protocol |

## Contents

1. [Screen Flow Automation Limits](./01-screen-flow-automation-limits.md)
2. [Quick Action Deployment Guide](./02-quick-action-deployment.md)
3. [Feasibility Scoring Methodology](./03-feasibility-scoring.md)
4. [Expectation-Setting Protocol](./04-expectation-protocol.md)
5. [Manual Step Communication](./05-manual-step-communication.md)

## Quick Reference

### What CAN Be Fully Automated

| Component | Automation Level | Notes |
|-----------|------------------|-------|
| Record-Triggered Flows | 100% | Full XML deployment |
| Autolaunched Flows | 100% | Full XML deployment |
| Scheduled Flows | 100% | Full XML deployment |
| Validation Rules | 100% | Full XML deployment |
| Apex Triggers | 100% | Full source deployment |
| Permission Sets | 100% | Full XML deployment |
| Custom Objects/Fields | 100% | Full XML deployment |
| Reports (most types) | 100% | Full XML deployment |
| Dashboards | 100% | Full XML deployment |

### What CANNOT Be Fully Automated

| Component | Limitation | Manual Steps Required |
|-----------|------------|----------------------|
| Screen Flow UI Components | Multi-select checkboxes, data tables not in XML | UI configuration post-deploy |
| Quick Action Variable Mapping | inputVariableAssignments not deployable | Map variables in Setup |
| Dynamic Choice Resources | Custom components need UI setup | Lightning component config |
| Flow Screen Component Styling | Limited style control in XML | Adjust in Flow Builder |
| Approval Process Email Templates | Some associations manual | Configure in Setup |

### Feasibility Quick Assessment

Ask these questions before promising full automation:

1. Does it involve Screen Flows with complex UI components? → Likely hybrid
2. Does it use Quick Actions with input variables? → Manual step required
3. Does it reference Custom Metadata in picklists? → May need UI work
4. Does it require record-specific styling? → Manual configuration
5. Is it a pure backend automation (no UI)? → Likely fully automatable

## Common Prompt-Mismatch Scenarios

### Scenario 1: "Automate all flow field replacements"

**User Expectation**: 100% automated field replacement across all flows
**Reality**: Screen Flows with UI components require manual finishing

**Correct Response**:
> "I can automate 85% of this request. Here's the breakdown:
> - **Automated (15 flows)**: Record-Triggered and Autolaunched Flows - full XML update
> - **Partial (3 flows)**: Screen Flows with data tables - XML update + manual UI verification
> - **Estimated time**: Automated: 10 min, Manual steps: 25 min"

### Scenario 2: "Deploy Quick Action with flow"

**User Expectation**: One-click deployment
**Reality**: Variable mappings require Setup configuration

**Correct Response**:
> "Deployment requires two phases:
> 1. **Automated**: Flow + Quick Action metadata deployment
> 2. **Manual**: In Setup > Quick Actions > [Action] > configure input variables
> - I'll provide step-by-step instructions for the manual phase"

### Scenario 3: "Run complete RevOps assessment"

**User Expectation**: Comprehensive automated audit
**Reality**: Scope and methodology need clarification

**Correct Response**:
> "Before I begin, let me clarify scope:
> - **Standard scope**: Pipeline metrics, conversion rates, forecast accuracy
> - **Extended scope**: Attribution analysis, territory performance, quota analysis
> - **Timeline focus**: YTD, trailing 12 months, or specific quarters?
> - Which scope and timeline should I use?"

## Expectation-Setting Checklist

Before accepting any automation request:

- [ ] Identify all components involved (flows, quick actions, LWC, etc.)
- [ ] Classify each as Fully Automated / Hybrid / Manual
- [ ] Calculate feasibility percentage
- [ ] List specific manual steps required
- [ ] Estimate time for automated vs manual work
- [ ] Present breakdown to user for confirmation
- [ ] Get explicit approval before proceeding

## Sources

- [Salesforce Metadata API Developer Guide](https://developer.salesforce.com/docs/atlas.en-us.api_meta.meta/api_meta/meta_visual_workflow.htm)
- [Flow Limitations - Success Craft](https://success-craft.com/blog/salesforce-flow-limitations-and-how-to-avoid-them/)
- [Quick Action Implementation Guide](https://resources.docs.salesforce.com/latest/latest/en-us/sfdc/pdf/actions_impl_guide.pdf)
