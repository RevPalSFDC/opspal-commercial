---
description: Historic value analysis for an Attio record or attribute
argument-hint: "[object] [record-id] [--attribute slug] [--timeline]"
---

# /attio-history

Surfaces Attio's native historic values feature for a record or specific attribute, showing who changed what, when, and what the values were before and after.

## Usage

```
/attio-history people <record-id>
/attio-history companies <record-id>
/attio-history people <record-id> --attribute job_title
/attio-history people <record-id> --timeline
/attio-history companies <record-id> --attribute annual_revenue --timeline
```

## Arguments

| Argument | Description |
|----------|-------------|
| `object` | Attio object type: `people`, `companies`, or any custom object slug |
| `record-id` | The UUID of the record to inspect |
| `--attribute slug` | Limit history to a single attribute by its slug |
| `--timeline` | Render output as a chronological change log with actors |

## Modes

### All-Attribute Record History

```
/attio-history people <record-id>
```

Returns every attribute that has changed on the record, sorted by most-recently-changed first. Useful for understanding the full lifecycle of a record.

### Single-Attribute History

```
/attio-history people <record-id> --attribute job_title
```

Returns the complete change history for one attribute: each value, when it was set, who set it, and how long it remained at that value.

### Timeline View

```
/attio-history people <record-id> --timeline
```

Produces a chronological log of all changes across all attributes, formatted as a timeline with actor names, timestamps, and old→new value pairs. Useful for auditing or understanding a record's journey.

## Output Format

Each change entry includes:

- **Actor** — the user or API integration that made the change
- **Timestamp** — when the change was recorded
- **Attribute** — which field changed
- **Old value** — the value before the change (or `[not set]` for first-time values)
- **New value** — the value after the change
- **Duration** — how long the record held the previous value (calculated from adjacent entries)

## Agent Delegation

Delegates to the **attio-record-historian** agent, which:

1. Resolves the object type and record ID via the Attio API
2. Fetches attribute history using the Attio historic values endpoint
3. Optionally filters to a single attribute if `--attribute` is provided
4. Sorts and formats entries for the selected output mode
5. Calculates duration-at-value for each historic entry

## Limitations

Historic values are **not available** for the following attribute types:

- **Interaction attributes** (COMINT) — email open counts, meeting counts, and similar computed interaction metrics
- **Enriched attributes** — attributes populated by Attio's data enrichment service (e.g., auto-populated company size, industry)

Attempting to fetch history for these attribute types will return an informational message rather than an error.

## Notes

- Record IDs are UUIDs; obtain them from `/attio-query` or by inspecting a record URL in the Attio web app
- Actor names are resolved from workspace member IDs where possible; API integrations are identified by their integration name
- Large change histories (100+ entries) are paginated; the agent fetches all pages before rendering
