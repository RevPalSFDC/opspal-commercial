---
description: Salesforce-Attio sync analysis and data synchronization
argument-hint: "[--direction sfdc-to-attio|attio-to-sfdc|bidirectional] [--object contacts|accounts|opportunities] [--dry-run]"
---

# /attio-sync-sfdc

A cross-platform sync wizard that compares, maps, and synchronizes records between Salesforce and Attio. Supports unidirectional and bidirectional sync with upsert semantics.

## Usage

```
/attio-sync-sfdc --object contacts
/attio-sync-sfdc --object contacts --direction sfdc-to-attio
/attio-sync-sfdc --object accounts --direction attio-to-sfdc --dry-run
/attio-sync-sfdc --object opportunities --direction bidirectional
/attio-sync-sfdc --object contacts --direction sfdc-to-attio --mapping contacts-map.json
```

## Options

| Option | Description | Default |
|--------|-------------|---------|
| `--direction` | Sync direction: `sfdc-to-attio`, `attio-to-sfdc`, or `bidirectional` | `sfdc-to-attio` |
| `--object` | Object pair to sync (see Object Mapping below) | Required |
| `--dry-run` | Analyze and plan without writing changes | `true` (default — must opt in to live sync) |
| `--mapping` | Path to a JSON field mapping file (skips auto-suggest step) | Auto-suggested |

## Object Mapping

| Salesforce Object | Attio Object | Notes |
|-------------------|--------------|-------|
| Contacts | People | Matched on email |
| Accounts | Companies | Matched on domain |
| Opportunities | Deals + List Entries | Opportunity → Deal record + entry in the target list |

Pass the Salesforce object name to `--object`:

```
--object contacts   →  Contacts ↔ People
--object accounts   →  Accounts ↔ Companies
--object opportunities  →  Opportunities ↔ Deals + List Entries
```

## Wizard Steps

### Step 1: Analyze

The wizard queries both platforms and produces a comparison report:

- Records in Salesforce only (would be created in Attio on sfdc-to-attio sync)
- Records in Attio only (would be created in Salesforce on attio-to-sfdc sync)
- Matched records with field-level diff (would be updated)
- Conflict detection for bidirectional sync (both sides modified since last sync)

### Step 2: Field Mapping

Auto-suggests field mappings based on attribute name similarity. Common mappings are pre-configured (e.g., `FirstName` → `first_name`, `Email` → `email_addresses`, `Website` → `domains`).

Override with a mapping file:

```json
{
  "FirstName": "first_name",
  "LastName": "last_name",
  "Email": "email_addresses",
  "Title": "job_title",
  "AccountId": "company_name"
}
```

### Step 3: Dry Run (Default)

Outputs the full sync plan without executing:

- Count of records to create, update, and skip per platform
- Field-level changes for updated records (sample of first 10)
- Conflicts requiring manual resolution (bidirectional mode only)

**No data is written until `--dry-run` is explicitly omitted or you confirm when prompted.**

### Step 4: Execute Sync

The wizard executes the sync plan using upsert semantics on both platforms:

- **Attio writes**: sequential at max 25 records/second (Attio API constraint)
- **Salesforce writes**: batched using the Bulk API where available
- Progress reported every 50 records
- Errors are collected and reported in a final summary without halting the sync

## Agent Delegation

Delegates to the **attio-salesforce-bridge** agent.

## Plugin Dependency

This command requires the **opspal-salesforce** plugin to be installed and authenticated. The wizard checks for the Salesforce plugin and active org connection before proceeding.

If opspal-salesforce is not detected:

```
opspal-salesforce plugin is required for /attio-sync-sfdc.
Install it with: /plugin install opspal-salesforce
```

## Notes

- Bidirectional sync uses a last-write-wins strategy by default; conflict resolution options (manual review, Salesforce wins, Attio wins) are presented when conflicts are detected
- Opportunities sync creates both a Deal record in Attio and a list entry in a configurable target list — specify the list slug via `--list deals-pipeline` if the default is not correct
- The sync does not delete records from either platform; deletions must be handled manually
- A sync log is written locally with the full record-level outcome for audit purposes
- Authentication for both platforms must be active before running; use `/attio-auth` and `/sf login` (or equivalent) to authenticate
