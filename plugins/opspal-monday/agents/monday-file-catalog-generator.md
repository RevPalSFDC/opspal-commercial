---
name: monday-file-catalog-generator
description: Transform Monday.com board exports into normalized file catalogs for CRM ingestion
color: blue
model: sonnet
tools:
  - Read
  - Write
  - Bash
  - Glob
  - Grep
trigger_keywords:
  - file catalog
  - monday files
  - board export
  - asset mapping
  - generate catalog
  - monday catalog
  - crm files
  - file inventory
---

# Monday.com File Catalog Generator

## Purpose

Transform Monday.com board exports (Excel/CSV) into normalized file catalogs suitable for CRM ingestion. Automates the multi-hour manual process of matching downloaded assets to board records.

## When to Use

- After downloading files from Monday.com using `monday-file-extractor`
- When you have an Excel/CSV export from a Monday.com board
- When building file inventories for Salesforce/HubSpot import
- When matching downloaded assets to their source records

## Pre-Requisites

**ALWAYS load the monday-data-patterns skill first:**
```
skill: opspal-monday:monday-data-patterns
```

## Workflow

### Phase 1: Board Structure Analysis

**1.1 Detect Header Row**
```python
# Scan rows 0-10 looking for header indicators
HEADER_INDICATORS = ['Item ID', 'Name', 'item_id', 'ID']

import pandas as pd
df_preview = pd.read_excel(export_path, header=None, nrows=15)

header_row = None
for idx, row in df_preview.iterrows():
    row_str = ' '.join(str(v) for v in row.values if pd.notna(v))
    if any(ind.lower() in row_str.lower() for ind in HEADER_INDICATORS):
        header_row = idx
        break

if header_row is None:
    raise ValueError("Could not detect header row. Check export format.")
```

**1.2 Identify Column Structure**
```python
# Re-read with correct header
df = pd.read_excel(export_path, header=header_row)

# Find gatekeeper column (Item ID)
gatekeeper_col = None
for col in df.columns:
    if 'item' in col.lower() and 'id' in col.lower():
        gatekeeper_col = col
        break

# Find file URL columns
FILE_PATTERNS = [r'monday\.com/resources/', r'files\.monday\.com']
file_columns = {}
for col in df.columns:
    sample_values = df[col].dropna().head(10).astype(str)
    for val in sample_values:
        if any(re.search(p, val) for p in FILE_PATTERNS):
            file_columns[col] = infer_document_type(col)
            break
```

### Phase 2: Build Asset Lookup

**2.1 Scan Assets Folder**
```python
def build_asset_lookup(assets_path):
    """
    Build resource_id → filename lookup from downloaded assets.

    Expects files named: {resource_id}_{original_filename}
    Example: 1458720369123_Contract_2024.pdf
    """
    lookup = {}
    if not os.path.exists(assets_path):
        raise FileNotFoundError(f"Assets folder not found: {assets_path}")

    for filename in os.listdir(assets_path):
        if filename.startswith('.'):
            continue
        # Pattern: {resource_id}_{original_filename}
        parts = filename.split('_', 1)
        if len(parts) >= 2 and parts[0].isdigit():
            resource_id = parts[0]
            lookup[resource_id] = filename

    return lookup
```

**2.2 Extract Resource IDs from URLs**
```python
def extract_resource_id(monday_url):
    """Extract resource_id from Monday.com file URL."""
    if pd.isna(monday_url) or not monday_url:
        return None

    # Pattern: /resources/{resource_id}/
    match = re.search(r'/resources/(\d+)/', str(monday_url))
    if match:
        return match.group(1)
    return None
```

### Phase 3: Generate Catalog

**3.1 Standard Catalog Schema**
```csv
object_type,record_label,source_id,filename,url,document_type,monday_item_id
```

**3.2 Catalog Generation**
```python
def generate_catalog(df, config, asset_lookup, output_path):
    """
    Generate file catalog from board export.

    Args:
        df: DataFrame with board export data
        config: Board configuration dict
        asset_lookup: resource_id → filename mapping
        output_path: Output CSV path
    """
    catalog_rows = []

    for idx, row in df.iterrows():
        # Skip rows without valid Item ID
        item_id = row.get(config['gatekeeper_col'])
        if pd.isna(item_id):
            continue

        # Build record label from configured columns
        label_parts = []
        for col in config.get('label_cols', []):
            val = row.get(col)
            if pd.notna(val):
                label_parts.append(str(val).strip())
        record_label = ' - '.join(label_parts) if label_parts else str(item_id)

        # Get source ID if configured
        source_id = ''
        if config.get('source_id_col'):
            source_id = row.get(config['source_id_col'], '')

        # Process each file column
        for file_col, doc_type in config.get('file_cols', {}).items():
            url = row.get(file_col)
            if pd.isna(url) or not url:
                continue

            resource_id = extract_resource_id(url)
            local_filename = asset_lookup.get(resource_id, '')

            catalog_rows.append({
                'object_type': config.get('object_type', 'Record'),
                'record_label': record_label,
                'source_id': source_id,
                'filename': local_filename,
                'url': os.path.join(config.get('assets_path', ''), local_filename) if local_filename else '',
                'document_type': doc_type,
                'monday_item_id': item_id,
                'resource_id': resource_id,
                'matched': 'Yes' if local_filename else 'No'
            })

    # Write catalog
    catalog_df = pd.DataFrame(catalog_rows)
    catalog_df.to_csv(output_path, index=False)

    # Report statistics
    total = len(catalog_rows)
    matched = sum(1 for r in catalog_rows if r['matched'] == 'Yes')
    print(f"Catalog generated: {total} entries, {matched} matched ({matched/total*100:.1f}%)")

    return catalog_df
```

### Phase 4: External URL Enrichment (Optional)

**4.1 Detect External URLs**
```python
EXTERNAL_URL_PATTERNS = {
    'google_drive': r'drive\.google\.com|docs\.google\.com',
    's3': r's3\.amazonaws\.com|s3://',
    'sharepoint': r'sharepoint\.com',
    'dropbox': r'dropbox\.com'
}

def detect_external_url_columns(df):
    """Find columns containing external file URLs."""
    external_cols = {}
    for col in df.columns:
        sample = df[col].dropna().head(10).astype(str)
        for val in sample:
            for url_type, pattern in EXTERNAL_URL_PATTERNS.items():
                if re.search(pattern, val):
                    external_cols[col] = url_type
                    break
    return external_cols
```

**4.2 Enrich Catalog with External URLs**
```python
def enrich_with_external_urls(catalog_df, df, external_url_col, item_id_col):
    """Add external URLs to catalog entries."""
    # Build item_id → external_url mapping
    url_map = {}
    for idx, row in df.iterrows():
        item_id = row.get(item_id_col)
        ext_url = row.get(external_url_col)
        if pd.notna(item_id) and pd.notna(ext_url):
            url_map[str(item_id)] = ext_url

    # Enrich catalog
    catalog_df['external_url'] = catalog_df['monday_item_id'].apply(
        lambda x: url_map.get(str(x), '')
    )

    return catalog_df
```

## Configuration Template

```python
BOARD_CONFIG = {
    # File paths
    'export_path': './monday_export.xlsx',
    'assets_path': './monday-downloads/',
    'output_path': './file_catalog.csv',

    # Board structure
    'header_row': None,           # Auto-detect if None
    'gatekeeper_col': 'Item ID',  # Column with Monday item ID

    # Record identification
    'label_cols': ['Name', 'Account'],  # Columns for record_label
    'source_id_col': 'External ID',     # Column with CRM ID (optional)
    'object_type': 'Account',           # CRM object type

    # File columns: column_name → document_type
    'file_cols': {
        'Contract Files': 'Contract',
        'Proposal Files': 'Proposal',
        'Logo': 'Image'
    },

    # External URL enrichment (optional)
    'external_url_col': 'Google Drive Link'
}
```

## Example Usage

### Minimal Example
```bash
# 1. Download files from Monday.com board
/monday-files --board 1234567890 --output ./monday-downloads

# 2. Export board to Excel from Monday.com UI

# 3. Generate file catalog
# Agent will:
#   - Auto-detect header row
#   - Find file URL columns
#   - Build asset lookup
#   - Generate normalized catalog
```

### Full Workflow
```
User: Generate a file catalog from the Monday.com export at ./exports/accounts.xlsx
      matching against downloaded files in ./monday-downloads/
      Use Account Name and Opportunity Name as the record label.
      The files are Contracts in column G and Proposals in column I.
      Output to ./catalogs/account_files.csv

Agent:
1. Load monday-data-patterns skill
2. Read export file, detect header row
3. Build asset lookup from ./monday-downloads/
4. Map file columns G (Contract) and I (Proposal)
5. Generate catalog with composite labels
6. Report match statistics
```

## Output Format

### Generated Catalog (CSV)
```csv
object_type,record_label,source_id,filename,url,document_type,monday_item_id,resource_id,matched
Account,Acme Corp - Enterprise Deal,001ABC,1458720369123_Contract_2024.pdf,./monday-downloads/1458720369123_Contract_2024.pdf,Contract,9876543210,1458720369123,Yes
Account,Acme Corp - Enterprise Deal,001ABC,1458720369456_Proposal_v2.pdf,./monday-downloads/1458720369456_Proposal_v2.pdf,Proposal,9876543210,1458720369456,Yes
Account,Beta Inc - Renewal,,,,Contract,9876543211,,No
```

### Match Statistics
```
Catalog Generation Complete
============================
Total entries: 150
Matched files: 142 (94.7%)
Unmatched: 8 (5.3%)

Unmatched items:
- Beta Inc - Renewal (Contract): resource_id 1458720369789 not found
- Gamma LLC (Proposal): No URL in export
```

## Error Handling

### Common Issues

| Issue | Detection | Resolution |
|-------|-----------|------------|
| Header not found | No "Item ID" in first 10 rows | Manual header_row in config |
| No file columns | No Monday.com URLs detected | Verify export has file columns |
| Low match rate | <80% matched | Check asset folder, re-download |
| Duplicate resource IDs | Multiple files same ID | Use item_id prefix |

### Validation Checks
```python
def validate_catalog(catalog_df):
    """Validate generated catalog."""
    issues = []

    # Check match rate
    match_rate = (catalog_df['matched'] == 'Yes').mean()
    if match_rate < 0.8:
        issues.append(f"Low match rate: {match_rate:.1%}")

    # Check for empty labels
    empty_labels = catalog_df['record_label'].isna().sum()
    if empty_labels > 0:
        issues.append(f"Empty record labels: {empty_labels}")

    # Check for duplicate entries
    dupes = catalog_df.duplicated(subset=['resource_id']).sum()
    if dupes > 0:
        issues.append(f"Duplicate resource IDs: {dupes}")

    return issues
```

## Integration

### CRM Import Preparation
The generated catalog can be used directly for:
- **Salesforce Files**: Map to ContentDocument/ContentVersion
- **HubSpot Files**: Use with Files API
- **Custom Import**: Standard schema works with most systems

### Post-Processing
```python
# Filter to matched files only
matched = catalog_df[catalog_df['matched'] == 'Yes']

# Group by object for batch import
for obj_type in matched['object_type'].unique():
    subset = matched[matched['object_type'] == obj_type]
    subset.to_csv(f'./import_{obj_type.lower()}_files.csv', index=False)
```

## Dependencies

- pandas (for Excel/CSV processing)
- openpyxl (for .xlsx files)
- re (standard library)

## Related

- `monday-file-extractor` - Download files from Monday.com
- `monday-board-analyzer` - Analyze board structure before processing
- `monday-data-patterns` skill - URL patterns and matching strategies
