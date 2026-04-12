---
description: Sequential loop import wizard for Attio records
argument-hint: "[--object people|companies] [--file path.csv] [--dry-run] [--matching-attribute slug]"
---

# /attio-bulk-import

A guided CSV or JSON import wizard that maps, validates, and sequentially imports records into Attio. Supports upsert via a configurable matching attribute.

## Usage

```
/attio-bulk-import --object people --file contacts.csv
/attio-bulk-import --object companies --file accounts.json
/attio-bulk-import --object people --file contacts.csv --matching-attribute email_addresses
/attio-bulk-import --object people --file contacts.csv --dry-run
/attio-bulk-import --object people --file contacts.csv --mapping '{"first_name":"First Name","email_addresses":"Email"}'
```

## Options

| Option | Description | Default |
|--------|-------------|---------|
| `--object` | Target object type: `people`, `companies`, or custom object slug | Required |
| `--file` | Path to input file (CSV or JSON) | Required |
| `--matching-attribute` | Attribute slug used for upsert matching | `email_addresses` for people, `domains` for companies |
| `--dry-run` | Parse, map, and validate without writing to Attio | `true` (default — must opt in to live import) |
| `--mapping` | JSON string of field mappings (skips auto-suggest step) | Auto-suggested |

## Import Steps

### Step 1: Parse Input File

The wizard reads and parses the input file:

- **CSV**: auto-detects delimiter (comma, tab, semicolon), reads headers from row 1
- **JSON**: accepts an array of objects or a `{ records: [] }` envelope

### Step 2: Field Mapping

The wizard inspects column names against the target object's attribute schema and auto-suggests mappings. You confirm or override before proceeding.

Use `--mapping` to skip this step and provide mappings directly:

```
--mapping '{"First Name":"first_name","Email":"email_addresses","Company":"company_name"}'
```

### Step 3: Payload Validation

Every mapped record is validated against the Attio attribute schema:

- Required attributes checked for presence
- Data types validated (email format, phone format, URL format, date parsing)
- Records failing validation are listed with reasons; import pauses for review

### Step 4: Dry Run (Default)

By default the wizard stops here and shows:

- Total records to import
- Breakdown: new records to create vs. existing records to update (based on matching attribute)
- Validation errors and warnings
- Sample of the first 5 payloads

**The import does not execute unless you remove `--dry-run` or confirm when prompted.**

### Step 5: Sequential Import

Attio has no bulk write API. Records are imported one at a time using upsert semantics:

- Rate: maximum 25 records/second (enforced by `attio-loop-executor.js`)
- Each record is created or updated based on the `--matching-attribute`
- Progress is reported every 50 records
- Errors are logged and collected; import continues for remaining records
- A final summary shows success count, update count, create count, and error count

## Agent Delegation

Delegates to the **attio-data-operations** agent, which invokes `attio-loop-executor.js` for the sequential write loop.

## Notes

- Large imports (1,000+ records) will take several minutes due to the sequential API constraint — plan accordingly
- The matching attribute must be a unique attribute on the object; using a non-unique attribute produces a warning
- Empty cells in CSV are treated as `null` and omit that attribute from the payload (existing values are preserved on update)
- Import state is written to a local progress file so interrupted imports can be resumed
