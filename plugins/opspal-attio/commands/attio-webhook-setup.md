---
description: Webhook configuration wizard for Attio
argument-hint: "[--url target-url] [--events record.created,record.updated]"
---

# /attio-webhook-setup

An interactive wizard that guides you through creating and configuring Attio webhooks, then provides post-setup guidance on HMAC verification, idempotency, and retry handling.

## Usage

```
/attio-webhook-setup
/attio-webhook-setup --url https://hooks.example.com/attio
/attio-webhook-setup --url https://hooks.example.com/attio --events record.created,record.updated
/attio-webhook-setup --url https://n8n.example.com/webhook/attio --events note.created,task.completed
```

## Options

| Option | Description |
|--------|-------------|
| `--url` | Target HTTPS endpoint URL (required; prompted if not provided) |
| `--events` | Comma-separated list of event types to subscribe to (prompted if not provided) |

## Wizard Steps

### Step 1: Target URL

Provide the HTTPS endpoint that will receive webhook payloads. HTTP (non-TLS) endpoints are rejected by Attio and will produce a validation error before submission.

If `--url` is not passed as an argument, the wizard prompts for it interactively.

### Step 2: Choose Event Types

Select the event types to subscribe to. The wizard presents the full list of available Attio event types grouped by category. Pass `--events` to skip the interactive selection.

**Available event categories and types:**

| Category | Events |
|----------|--------|
| Records | `record.created`, `record.updated`, `record.deleted`, `record.merged` |
| Attributes | `attribute-value.created`, `attribute-value.updated`, `attribute-value.deleted` |
| List Entries | `list-entry.created`, `list-entry.updated`, `list-entry.deleted` |
| Notes | `note.created`, `note.updated`, `note.deleted` |
| Tasks | `task.created`, `task.updated`, `task.completed`, `task.deleted` |
| Comments | `comment.created`, `comment.updated`, `comment.deleted` |
| Members | `workspace-member.created`, `workspace-member.deleted` |

Attio supports 25+ event types. The wizard always shows the current complete list fetched from the API at runtime.

### Step 3: Optional Filters

Webhook subscriptions support per-subscription filters to reduce noise. The wizard asks whether you want to add filters (e.g., limit `record.created` events to a specific object type).

Filters are optional and can be skipped.

### Step 4: Create Webhook

The wizard creates the webhook subscription via the Attio API and displays the resulting webhook ID and signing secret.

**The signing secret is shown only once — copy it before proceeding.**

## Post-Setup Guidance

After creation, the wizard outputs a post-setup checklist:

### HMAC Verification

Attio signs each webhook payload with the signing secret using HMAC-SHA256. Verify the `x-attio-signature` header on every incoming request:

```javascript
const crypto = require('crypto');
const signature = req.headers['x-attio-signature'];
const expected = crypto
  .createHmac('sha256', process.env.ATTIO_WEBHOOK_SECRET)
  .update(req.rawBody)
  .digest('hex');
if (signature !== expected) return res.status(401).end();
```

### Idempotency

Attio may deliver the same event more than once. Each payload includes an `event_id`. Store processed event IDs and skip duplicates.

### Retry Handling

Attio retries failed deliveries (non-2xx responses) with exponential backoff for up to 72 hours. Return `200` quickly (within 5 seconds) and process the payload asynchronously.

## Agent Delegation

Delegates to the **attio-integration-specialist** agent.

## Notes

- HTTPS is required; the wizard validates the URL scheme before calling the API
- Webhook subscriptions are workspace-scoped; the API key used must have webhook management permissions
- To list existing webhooks or delete a subscription, use the Attio web app or API directly (no separate command exists yet)
- Test webhook delivery using a service like webhook.site or ngrok during development
