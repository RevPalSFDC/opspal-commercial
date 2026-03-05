---
name: monday-data-patterns
description: Monday.com data structure patterns, URL formats, and file matching strategies
trigger_keywords:
  - monday files
  - monday url
  - resource id
  - board export
  - asset matching
  - file catalog
  - monday excel
---

# Monday.com Data Patterns Reference

## URL Structure

### Monday.com File URLs
```
https://monday.com/resources/{resource_id}/{filename}
```

**Components:**
- `resource_id`: Unique numeric identifier (e.g., `1234567890123`)
- `filename`: Original filename with URL encoding

**Example:**
```
https://monday.com/resources/1458720369123/Contract_2024.pdf
```

### Asset File Naming Convention
When files are downloaded, they follow this pattern:
```
{resource_id}_{normalized_filename}
```

**Example:**
```
1458720369123_Contract_2024.pdf
```

---

## Excel Export Quirks

### Variable Header Row Location
Monday.com Excel exports do NOT always have headers in row 1:
- **Row 1**: May contain board name or metadata
- **Rows 2-5**: May contain sub-item groupings or empty rows
- **Header Row**: Usually contains "Item ID" in first data column

**Detection Strategy:**
```python
# Scan rows 1-10 looking for header indicators
HEADER_INDICATORS = ['Item ID', 'Name', 'Status', 'Date']

for row_idx in range(10):
    if any(indicator in str(row[0]) for indicator in HEADER_INDICATORS):
        header_row = row_idx
        break
```

### Sub-Item Filtering
Exports may include both items and sub-items:
- Items have numeric `Item ID`
- Sub-items may have prefixed IDs (e.g., `sub_123456`)
- Filter by checking `Item ID` format

### Column Index Calculation
Excel columns use letters (A, B, C...), Python uses 0-based indices:

| Excel | Index | Offset |
|-------|-------|--------|
| A | 0 | - |
| B | 1 | - |
| Z | 25 | - |
| AA | 26 | - |

**Formula:**
```python
def excel_col_to_index(col_letter):
    result = 0
    for char in col_letter.upper():
        result = result * 26 + (ord(char) - ord('A') + 1)
    return result - 1  # 0-based index
```

---

## File Matching Strategies

### Primary Strategy: Resource ID Matching (Preferred)

**Why Resource ID > Filename:**
1. Resource IDs are unique and immutable
2. Filenames can be duplicated across items
3. Filename normalization introduces errors (spaces, special chars)

**Workflow:**
1. Extract `resource_id` from Monday.com URL in export
2. Build lookup: `resource_id` → local filename
3. Match by resource_id prefix in local files

```python
def build_resource_lookup(assets_folder):
    """Build resource_id → filename lookup from assets folder."""
    lookup = {}
    for filename in os.listdir(assets_folder):
        # Pattern: {resource_id}_{original_filename}
        parts = filename.split('_', 1)
        if len(parts) == 2 and parts[0].isdigit():
            resource_id = parts[0]
            lookup[resource_id] = filename
    return lookup

def match_url_to_file(monday_url, lookup):
    """Match Monday.com URL to local file."""
    # Extract resource_id from URL
    # URL format: https://monday.com/resources/{resource_id}/{filename}
    match = re.search(r'/resources/(\d+)/', monday_url)
    if match:
        resource_id = match.group(1)
        return lookup.get(resource_id)
    return None
```

### Fallback Strategy: Filename Normalization

Only use when resource_id is unavailable:

```python
def normalize_filename(filename):
    """Normalize filename for matching."""
    # Remove URL encoding
    filename = urllib.parse.unquote(filename)
    # Lowercase
    filename = filename.lower()
    # Remove special characters
    filename = re.sub(r'[^a-z0-9.]', '', filename)
    return filename
```

---

## File Catalog Schema

### Standard Output Format (CSV)
```csv
object_type,record_label,source_id,filename,url,document_type
Account,Acme Corp,001xxx,contract.pdf,/path/to/contract.pdf,Contract
```

### Required Fields
| Field | Description | Source |
|-------|-------------|--------|
| object_type | CRM object type | Fixed value or inferred |
| record_label | Human-readable identifier | Composite from columns |
| source_id | External system ID | Item ID or custom field |
| filename | Local filename | Asset lookup |
| url | Full path or URL | Constructed |
| document_type | Classification | Column name or inferred |

### Composite Label Construction
When single column doesn't provide unique identifier:

```python
# Example: {Account Name} - {Opportunity Name}
label = f"{row['Account Name']} - {row['Opportunity Name']}"
```

---

## Multi-Column File Handling

### Detecting File Columns
Monday.com URLs follow predictable patterns:

```python
FILE_URL_PATTERNS = [
    r'monday\.com/resources/\d+/',
    r'monday-files\.com/',
    r'files\.monday\.com/'
]

def is_file_column(column_values):
    """Check if column contains Monday.com file URLs."""
    for value in column_values[:10]:  # Check first 10 rows
        if any(re.search(p, str(value)) for p in FILE_URL_PATTERNS):
            return True
    return False
```

### Document Type Classification
When multiple file columns exist, classify by column name:

| Column Name Pattern | Document Type |
|--------------------|---------------|
| `contract`, `agreement` | Contract |
| `proposal`, `quote` | Proposal |
| `invoice`, `bill` | Invoice |
| `image`, `photo`, `logo` | Image |
| `report`, `summary` | Report |

---

## External URL Enrichment

### Google Drive URLs
```
https://drive.google.com/file/d/{file_id}/view
https://docs.google.com/document/d/{doc_id}/edit
```

### S3 URLs
```
https://{bucket}.s3.amazonaws.com/{key}
s3://{bucket}/{key}
```

### Enrichment Workflow
1. Check for external URL columns in export
2. Prefer external URLs over Monday.com URLs (more permanent)
3. Use Monday.com URL as fallback

---

## Common Gotchas

### 1. URL Expiration
Monday.com file URLs expire after ~1 hour. Always download immediately.

### 2. Duplicate Resource IDs
Rare but possible - same file attached to multiple items.
Handle by using `{item_id}_{resource_id}` as key.

### 3. Missing Files
Files may be referenced in export but deleted from Monday.com.
Always validate file existence before catalog generation.

### 4. Character Encoding
Monday.com exports may use different encodings.
Try UTF-8 first, fall back to latin-1.

---

## Board Configuration Template

For process_board.py or similar scripts:

```python
BOARD_CONFIG = {
    'header_row': 2,              # 0-indexed row containing headers
    'gatekeeper_col': 0,          # Column with Item ID
    'label_cols': [1, 2],         # Columns to combine for record_label
    'file_cols': {
        5: 'Contract',            # Column index → document_type
        7: 'Proposal',
        9: 'Image'
    },
    'external_url_col': 10,       # Column with external URLs (optional)
    'source_id_col': 3,           # Column with external system ID
    'object_type': 'Account'      # Fixed object type for all rows
}
```

---

## Quick Reference

| Task | Strategy |
|------|----------|
| Match files | Resource ID > Filename |
| Find header row | Scan for "Item ID" |
| Calculate column index | Excel letter → 0-based |
| Handle multiple files | Classify by column name |
| Build catalog | Standard schema + composite labels |
| External URLs | Enrich with Google Drive/S3 if available |
