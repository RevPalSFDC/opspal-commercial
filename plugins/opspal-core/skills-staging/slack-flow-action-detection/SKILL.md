---
name: slack-flow-action-detection
description: "Grep flow XML for slackPostMessage actionType/actionName to identify all Slack-sending flows, then extract slackConversationId, [SFDC_ID], and slackMessage parameters for channel mapping"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
---

# Slack Flow Action Detection

Grep flow XML for slackPostMessage actionType/actionName to identify all Slack-sending flows, then extract slackConversationId, [SFDC_ID], and slackMessage parameters for channel mapping

## When to Use This Skill

- When working with Salesforce Flows or automation

**Category**: assessment
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: Grep flow XML for slackPostMessage actionType/actionName to identify all Slack-sending flows, then extract slackConversationId, [SFDC_ID], and slackMessage parameters for channel mapping
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: baa9e054-0ef1-4636-ad6d-c9c8943d7d39
- **Agent**: manual-execution
- **Enriched**: 2026-04-03
