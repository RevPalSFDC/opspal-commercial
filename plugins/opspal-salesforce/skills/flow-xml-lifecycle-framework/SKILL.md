---
name: flow-xml-lifecycle-framework
description: Salesforce Flow XML lifecycle orchestration for authoring, design selection, validation, testing, deployment, monitoring, and rollback. Use when handling complete Flow delivery beyond isolated segment edits.
allowed-tools:
  - Read
  - Grep
  - Glob
---

# Flow XML Lifecycle Framework

## When to Use This Skill

Use this skill when:
- Building a new Flow end-to-end (from design through deployment)
- Managing Flow version transitions in source control
- Deploying Flows across environments (sandbox to production)
- Performing Flow XML validation before deployment
- Coordinating Flow activation after metadata API deployment

**Not for**: Isolated segment edits (use `flow-segmentation-guide`), production debugging (use `flow-diagnostics-observability-framework`), or incident response (use `flow-production-incident-response-framework`).

## Flow XML Structure

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Flow xmlns="http://soap.sforce.com/2006/04/metadata">
    <apiVersion>62.0</apiVersion>
    <status>Active</status>         <!-- Active | Draft | Obsolete -->
    <processType>AutoLaunchedFlow</processType>
    <start>                          <!-- Entry point -->
        <connector><targetReference>First_Element</targetReference></connector>
        <object>Account</object>     <!-- For Record-Triggered -->
        <triggerType>RecordAfterSave</triggerType>
    </start>
    <decisions>...</decisions>
    <recordCreates>...</recordCreates>
    <assignments>...</assignments>
</Flow>
```

## Workflow

### Step 1: Select Flow Pattern

| Scenario | Flow Type | `processType` | `triggerType` |
|----------|-----------|----------------|---------------|
| After record save automation | Record-Triggered | `AutoLaunchedFlow` | `RecordAfterSave` |
| Before record save validation | Record-Triggered | `AutoLaunchedFlow` | `RecordBeforeSave` |
| User-initiated screen wizard | Screen Flow | `Flow` | N/A |
| Scheduled batch process | Scheduled | `AutoLaunchedFlow` | `Scheduled` |
| Platform Event handler | Platform Event-Triggered | `AutoLaunchedFlow` | `PlatformEvent` |

### Step 2: Author and Validate XML

```bash
# Validate Flow XML structure and best practices
node scripts/lib/flow-validator.js <FlowName>.flow-meta.xml

# Auto-fix common issues (dry-run first)
node scripts/lib/flow-validator.js <FlowName>.flow-meta.xml --auto-fix --dry-run
```

### Step 3: Deploy with Activation Verification

```bash
# Deploy the Flow
sf project deploy start --source-dir force-app/main/default/flows/<FlowName>.flow-meta.xml --target-org <org>

# CRITICAL: Verify activation post-deploy
# Metadata API deploys may leave Flows as Draft if org setting is off
sf data query --query "SELECT DeveloperName, ActiveVersion.VersionNumber, LatestVersion.VersionNumber FROM FlowDefinition WHERE DeveloperName = '<FlowName>'" --target-org <org> --use-tooling-api
```

If `ActiveVersionNumber != LatestVersionNumber`, activate manually via Tooling API PATCH.

### Step 4: SFDX Project Structure

```
force-app/main/default/
├── flows/
│   └── My_Flow.flow-meta.xml         # Flow definition
├── flowDefinitions/
│   └── My_Flow.flowDefinition-meta.xml # Activation control (optional)
```

## Routing Boundaries

Use this skill for lifecycle orchestration.
Use `flow-segmentation-guide` for fine-grained segment extraction and complexity slicing.

## References

- [authoring and design](./authoring-design.md)
- [validation and testing](./validation-testing.md)
- [deployment monitoring rollback](./deployment-monitoring-rollback.md)
- [segmentation handoff](./segmentation-handoff.md)
