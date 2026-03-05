---
name: hs-import-advanced
description: Advanced HubSpot data import with full V3 API features including multi-file imports, associations, and marketing flags
argument-hint: "[--file <path>] [--type single-file|multi-file]"
arguments:
  - name: file
    description: Path to CSV/JSON file to import
    required: false
  - name: type
    description: Import type (simple, advanced, multi-file)
    required: false
---

# /hs-import-advanced - Advanced HubSpot Import

Interactive wizard for advanced data imports using HubSpot's full Imports V3 API capabilities.

## Usage

```bash
/hs-import-advanced                          # Interactive mode
/hs-import-advanced --file=contacts.csv      # Import from file
/hs-import-advanced --type=multi-file        # Multi-file import
```

## Features

### V3 API Capabilities

| Feature | Description |
|---------|-------------|
| **Multi-file imports** | Import contacts and companies in one operation with automatic associations |
| **Marketing contacts** | Set `marketableContactImport` to mark contacts as marketing-eligible |
| **Auto-create lists** | Use `createContactListFromImport` to create static lists from imports |
| **Date formats** | Support for MONTH_DAY_YEAR, DAY_MONTH_YEAR, YEAR_MONTH_DAY |
| **Timezones** | Specify timezone for timestamp fields |
| **Column mapping** | Full control over column-to-property mapping |
| **Error retrieval** | Fetch detailed error information for failed rows |

## Import Types

### Simple Import

Basic single-object import (backward compatible):

```javascript
await importer.importRecords({
  objectType: 'contacts',
  records: data,
  mode: 'UPSERT'
});
```

### Advanced Import

Full V3 features for single object:

```javascript
await importer.importRecordsAdvanced({
  objectType: 'contacts',
  records: data,
  mode: 'UPSERT',
  marketableContactImport: true,
  createContactListFromImport: true,
  dateFormat: 'MONTH_DAY_YEAR',
  timeZone: 'America/New_York'
});
```

### Multi-File Import

Import multiple objects with associations:

```javascript
await importer.importMultiFile({
  files: [
    {
      objectType: 'contacts',
      records: contacts,
      isAssociationSource: true,
      commonColumn: 'email'
    },
    {
      objectType: 'companies',
      records: companies,
      associateWith: 'contacts',
      commonColumn: 'email'
    }
  ]
});
```

## Workflow

### Step 1: Select Import Type

```
Select import type:

1. Simple Import - Single object, basic options
2. Advanced Import - Single object, full V3 features
3. Multi-File Import - Multiple objects with associations
```

### Step 2: Configure Object(s)

**For simple/advanced:**
```
Object type:
- contacts
- companies
- deals
- tickets
- [custom object]

Import mode:
- UPSERT (create or update)
- CREATE (new records only)
- UPDATE (existing records only)
```

**For multi-file:**
```
File 1: contacts
  - Mode: UPSERT
  - Association source: Yes
  - Common column: email

File 2: companies
  - Mode: UPSERT
  - Associate with: contacts
  - Common column: email
```

### Step 3: V3 Options (Advanced/Multi-File)

```
Marketing Contact Import:
☑ Mark imported contacts as marketing contacts

Create List from Import:
☑ Create static list from imported contacts

Date Format: MONTH_DAY_YEAR
Timezone: America/New_York
```

### Step 4: Data Source

```
Data source:

1. CSV file path
2. JSON file path
3. Paste data
4. Query from external source
```

### Step 5: Column Mapping

```
Column Mapping:

File columns → HubSpot properties

email       → email (contacts)
first_name  → firstname (contacts)
last_name   → lastname (contacts)
company     → [skip or create association]
```

### Step 6: Validation

```
Pre-import validation:

✅ File format valid
✅ Required columns present
✅ 1,500 records to import
✅ Object type accessible
⚠️ 3 rows have missing email (will fail)

Proceed? (y/n)
```

### Step 7: Execute & Monitor

```
Importing to HubSpot...

Progress: ████████████████░░░░ 80%
Processed: 1,200 / 1,500
Succeeded: 1,180
Failed: 20

Status: PROCESSING
```

### Step 8: Results & Errors

```
Import Complete!

Summary:
  Import ID: 12345678
  Processed: 1,500
  Succeeded: 1,480
  Failed: 20
  Duration: 45s
  Success Rate: 98.67%

Errors (20):
  Row 15: Invalid email format
  Row 234: Duplicate record
  Row 456: Missing required field 'email'
  ... (17 more)

Export errors to CSV? (y/n)
```

## Configuration Reference

### Object Type IDs

| Object | Type ID |
|--------|---------|
| contacts | 0-1 |
| companies | 0-2 |
| deals | 0-3 |
| tickets | 0-5 |
| products | 0-7 |
| quotes | 0-14 |
| line_items | 0-8 |
| marketing_events | 0-54 |

### Date Formats

| Format | Example |
|--------|---------|
| MONTH_DAY_YEAR | 01/15/2024 |
| DAY_MONTH_YEAR | 15/01/2024 |
| YEAR_MONTH_DAY | 2024/01/15 |

### Association Types

| From | To | ID |
|------|----|----|
| Contact | Company | 1 |
| Company | Contact | 2 |
| Contact | Deal | 3 |
| Deal | Contact | 4 |
| Company | Deal | 5 |
| Deal | Company | 6 |

## File Format Requirements

### CSV Requirements

- Maximum 1,048,576 rows per file
- Maximum 512 MB per file
- UTF-8 encoding
- First row must be headers
- Headers must match column mapping

### JSON Format

```json
[
  {
    "email": "john@example.com",
    "firstname": "John",
    "lastname": "Doe"
  },
  {
    "email": "jane@example.com",
    "firstname": "Jane",
    "lastname": "Smith"
  }
]
```

## Error Handling

### Common Errors

| Error | Cause | Resolution |
|-------|-------|------------|
| 429 | File exceeds limits | Split into smaller files |
| Parse error | Invalid CSV/JSON | Check file format |
| Missing column | Column not in mapping | Add column mapping |
| Invalid property | Property doesn't exist | Check property names |

### Error Retrieval

```javascript
// Get errors after import
const errors = await importer.getImportErrors(importId);

errors.forEach(error => {
  console.log(`Row ${error.rowNumber}: ${error.errorMessage}`);
});
```

## Best Practices

### Performance

1. **Split large files** - Keep under 100k records per import
2. **Use unique identifiers** - Email for contacts, domain for companies
3. **Batch related imports** - Import contacts before deals

### Data Quality

1. **Validate before import** - Check required fields
2. **Use consistent formats** - Dates, phone numbers
3. **Handle duplicates** - Use UPSERT mode

### Associations

1. **Import source first** - Contacts before companies
2. **Use common column** - Email, domain, or custom ID
3. **Verify associations** - Check after import

## Related Commands

- `/hsenrich` - Enrich existing records
- `/hsdedup` - Remove duplicates before import
- `hubspot-data-operations-manager` - Full data operations agent

## Documentation

- `scripts/lib/imports-api-wrapper.js` - Full API wrapper
- `skills/hubspot-data-validation/import-validation.md` - Validation rules
