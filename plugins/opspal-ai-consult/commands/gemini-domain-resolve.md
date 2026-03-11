---
description: Resolve company websites to canonical domains with deterministic redirect checks first, then Gemini escalation for unresolved cases
argument-hint: "[--source csv|salesforce|hubspot|marketo|json|domains] [--input <path>|--domains <list>] [--org <sf-org>] [--max-records <n>] [--resolution-mode deterministic-first|hybrid|gemini-only]"
---

# Gemini Domain Resolve Command

You are invoking the `gemini-domain-shadow-analyzer` agent to detect shadow duplicates caused by website redirects, acquisitions, and domain consolidation.

Default behavior is `--resolution-mode deterministic-first`: local redirect resolution first, Gemini only for unresolved domains.

## What to Do

1. Verify Gemini is configured:

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/lib/gemini-cli-invoker.js --check
```

If not configured, direct the user to run `/gemini-link --setup` first.

2. Route to the analyzer agent with the user's source and options:

```
Task(subagent_type='opspal-ai-consult:gemini-domain-shadow-analyzer', prompt='<user request with source/options>')
```

3. If source details are missing, ask for:
- Source type (`csv`, `salesforce`, `hubspot`, `marketo`, `domains`)
- Input path or org alias
- Optional field mappings (`website`, `name`, `id`)

## Example Usage

### CSV

```text
/gemini-domain-resolve --source csv --input ./exports/accounts.csv
```

### Salesforce

```text
/gemini-domain-resolve --source salesforce --org bluerabbit2021-revpal --max-records 400
```

### HubSpot

```text
/gemini-domain-resolve --source hubspot --max-records 300
```

### Marketo

```text
/gemini-domain-resolve --source marketo --max-records 200
```

### Domain List

```text
/gemini-domain-resolve --source domains --domains acme.com,acme-old.com,acquiredco.io
```

## Expected Deliverable

The analyzer returns a report with:
- Canonical domain resolution per input domain
- Shadow duplicate clusters (`distinct input domains -> same resolved domain`)
- Record-level IDs for downstream merge planning
