---
description: Custom object design wizard for Attio
argument-hint: "[--name slug] [--template path.json]"
---

# /attio-custom-objects

Interactive custom object creation wizard for Attio workspaces. Guides you through object naming, attribute design, relationship modeling, and list creation — or accepts a pre-built schema template for repeatable deployments.

## Usage

```
/attio-custom-objects
/attio-custom-objects --name support_ticket
/attio-custom-objects --template schemas/support-ticket.json
```

## What This Command Does

Delegates to **attio-custom-objects-architect** to run an interactive schema design session.

### Wizard Flow (Interactive)

**Step 1 — Object Identity**
- Object slug (snake_case): e.g., `support_ticket`
- Singular noun: e.g., `Support Ticket`
- Plural noun: e.g., `Support Tickets`
- Description: business purpose of this object

**Step 2 — Attribute Design**
For each attribute:
- Slug (snake_case)
- Type: text | number | boolean | date | datetime | select | multi-select | status | email | phone-number | domain | url | currency | record-reference
- Required vs. optional
- For select/status: define all options/statuses now

**Step 3 — Relationship Modeling**
- Which objects does this object reference? (record-reference attributes)
- Cardinality: single-value or multi-value?
- Bidirectional or unidirectional?

**Step 4 — List Design (Optional)**
- Create a default list for this object?
- List name, description, and entry-level attributes

**Step 5 — Review and Confirm**
- Full schema summary before any API calls
- Naming convention validation via `attio-field-policy-validator.js`
- User confirms before execution

**Step 6 — Implementation**
- Objects created → non-reference attributes → record-reference attributes → options/statuses → lists
- Uses `auto-implementer.js` for bulk creation from template, or sequential MCP calls for interactive mode

### Template Mode (--template)
Accepts a JSON schema file in auto-implementer format:
```json
{
  "objects": [
    {
      "slug": "support_ticket",
      "singular_noun": "Support Ticket",
      "plural_noun": "Support Tickets",
      "attributes": [
        { "slug": "title", "type": "text", "is_required": true },
        { "slug": "priority", "type": "select", "options": ["Low", "Medium", "High", "Critical"] },
        { "slug": "contact", "type": "record-reference", "target_object": "people" }
      ],
      "lists": [
        { "name": "Active Tickets" }
      ]
    }
  ]
}
```

## Safety

- Object deletion destroys ALL records permanently — this command only creates, never deletes
- Attribute types are immutable after creation — the wizard validates types before creating
- All slugs validated against naming conventions before any API call

## Delegates To

**attio-custom-objects-architect** (Opus model) — handles all schema design decisions and MCP tool execution.
