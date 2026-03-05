---
name: monday-board-analyzer
description: Analyze Monday.com board exports to identify structure, columns, and generate configuration
model: sonnet
tools:
  - Read
  - Write
  - Bash
  - Glob
  - Grep
trigger_keywords:
  - analyze monday board
  - board structure
  - find columns
  - monday export analysis
  - column detection
  - board configuration
  - monday excel analysis
  - identify file columns
---

# Monday.com Board Analyzer

## Purpose

Analyze Monday.com board exports (Excel/CSV) to identify structure, detect file columns, and generate configuration dictionaries. Eliminates the trial-and-error process of manually finding column indices and header rows.

## When to Use

- Before running `monday-file-catalog-generator`
- When receiving a new Monday.com board export
- When you don't know the column structure of an export
- When building process_board.py configurations
- When troubleshooting catalog generation issues

## Pre-Requisites

**ALWAYS load the monday-data-patterns skill first:**
```
skill: monday-plugin:monday-data-patterns
```

## Workflow

### Phase 1: File Type Detection

**1.1 Detect Export Format**
```python
import os

def detect_export_format(file_path):
    """Detect export file format."""
    ext = os.path.splitext(file_path)[1].lower()

    FORMAT_MAP = {
        '.xlsx': 'excel',
        '.xls': 'excel_legacy',
        '.csv': 'csv',
        '.tsv': 'tsv'
    }

    return FORMAT_MAP.get(ext, 'unknown')
```

**1.2 Load Preview**
```python
import pandas as pd

def load_preview(file_path, format_type, preview_rows=15):
    """Load preview of export for analysis."""

    if format_type == 'excel':
        # Read without header to analyze structure
        df = pd.read_excel(file_path, header=None, nrows=preview_rows)
    elif format_type == 'csv':
        # Try common encodings
        for encoding in ['utf-8', 'latin-1', 'cp1252']:
            try:
                df = pd.read_csv(file_path, header=None, nrows=preview_rows, encoding=encoding)
                break
            except UnicodeDecodeError:
                continue
    else:
        raise ValueError(f"Unsupported format: {format_type}")

    return df
```

### Phase 2: Header Row Detection

**2.1 Find Header Row**
```python
HEADER_INDICATORS = [
    'Item ID', 'item_id', 'ID',
    'Name', 'Status', 'Date',
    'Person', 'Timeline', 'Numbers'
]

def find_header_row(df_preview):
    """
    Detect header row by scanning for indicator patterns.
    Monday.com exports often have metadata in early rows.

    Returns:
        int: Header row index (0-based)
        None: If header not found
    """
    for idx, row in df_preview.iterrows():
        # Convert row to searchable string
        row_text = ' '.join(str(v).lower() for v in row.values if pd.notna(v))

        # Check for header indicators
        indicators_found = sum(
            1 for ind in HEADER_INDICATORS
            if ind.lower() in row_text
        )

        # Header row typically has 2+ indicators
        if indicators_found >= 2:
            return idx

        # Strong single indicator (Item ID is definitive)
        if 'item id' in row_text or 'item_id' in row_text:
            return idx

    return None
```

**2.2 Extract Column Names**
```python
def extract_columns(df_preview, header_row):
    """Extract column names from header row."""
    columns = []

    for idx, value in enumerate(df_preview.iloc[header_row]):
        if pd.notna(value):
            col_name = str(value).strip()
        else:
            col_name = f"Unnamed_{idx}"
        columns.append({
            'index': idx,
            'name': col_name,
            'excel_col': index_to_excel_col(idx)
        })

    return columns

def index_to_excel_col(index):
    """Convert 0-based index to Excel column letter."""
    result = ""
    while index >= 0:
        result = chr(index % 26 + ord('A')) + result
        index = index // 26 - 1
    return result
```

### Phase 3: Column Classification

**3.1 Identify Column Types**
```python
def classify_columns(df, header_row, columns):
    """
    Classify each column by type based on content analysis.

    Types:
        - gatekeeper: Item ID column
        - file_url: Contains Monday.com file URLs
        - external_url: Contains external URLs (Drive, S3, etc.)
        - label: Suitable for record labels
        - source_id: External system IDs
        - metadata: Dates, status, numbers
    """
    # Re-read with correct header
    df_data = df.iloc[header_row + 1:].reset_index(drop=True)
    df_data.columns = [c['name'] for c in columns]

    classified = []

    for col in columns:
        col_name = col['name']
        col_data = df_data[col_name].dropna().head(20)

        classification = {
            **col,
            'type': 'unknown',
            'sample_values': col_data.head(3).tolist(),
            'non_null_count': len(col_data),
            'confidence': 0.0
        }

        # Check for gatekeeper (Item ID)
        if is_gatekeeper_column(col_name, col_data):
            classification['type'] = 'gatekeeper'
            classification['confidence'] = 0.95

        # Check for file URLs
        elif is_file_url_column(col_name, col_data):
            classification['type'] = 'file_url'
            classification['confidence'] = 0.9
            classification['document_type'] = infer_document_type(col_name)

        # Check for external URLs
        elif is_external_url_column(col_data):
            classification['type'] = 'external_url'
            classification['confidence'] = 0.85
            classification['url_type'] = detect_external_url_type(col_data)

        # Check for label candidates
        elif is_label_candidate(col_name, col_data):
            classification['type'] = 'label'
            classification['confidence'] = 0.7

        # Check for source IDs
        elif is_source_id_column(col_name, col_data):
            classification['type'] = 'source_id'
            classification['confidence'] = 0.8

        # Default to metadata
        else:
            classification['type'] = 'metadata'
            classification['confidence'] = 0.5

        classified.append(classification)

    return classified
```

**3.2 Column Type Detection Functions**
```python
import re

def is_gatekeeper_column(col_name, col_data):
    """Check if column is the Item ID column."""
    name_match = re.search(r'item[\s_]?id', col_name, re.IGNORECASE)

    if name_match:
        return True

    # Check if values look like Monday item IDs (10+ digit numbers)
    numeric_values = col_data.astype(str).str.match(r'^\d{10,}$')
    if numeric_values.mean() > 0.8:
        return True

    return False

def is_file_url_column(col_name, col_data):
    """Check if column contains Monday.com file URLs."""
    FILE_PATTERNS = [
        r'monday\.com/resources/',
        r'files\.monday\.com/',
        r'monday-files\.com/'
    ]

    for value in col_data.astype(str):
        if any(re.search(p, value) for p in FILE_PATTERNS):
            return True

    return False

def is_external_url_column(col_data):
    """Check if column contains external URLs."""
    EXTERNAL_PATTERNS = [
        r'drive\.google\.com',
        r'docs\.google\.com',
        r's3\.amazonaws\.com',
        r'sharepoint\.com',
        r'dropbox\.com'
    ]

    for value in col_data.astype(str):
        if any(re.search(p, value) for p in EXTERNAL_PATTERNS):
            return True

    return False

def detect_external_url_type(col_data):
    """Detect type of external URL."""
    for value in col_data.astype(str):
        if 'drive.google' in value or 'docs.google' in value:
            return 'google_drive'
        elif 's3.amazonaws' in value:
            return 's3'
        elif 'sharepoint' in value:
            return 'sharepoint'
        elif 'dropbox' in value:
            return 'dropbox'
    return 'unknown'

def is_label_candidate(col_name, col_data):
    """Check if column is suitable for record labels."""
    LABEL_INDICATORS = ['name', 'account', 'company', 'client', 'title', 'project']

    if any(ind in col_name.lower() for ind in LABEL_INDICATORS):
        return True

    # Check if values are string-like and varied
    unique_ratio = col_data.nunique() / len(col_data) if len(col_data) > 0 else 0
    avg_length = col_data.astype(str).str.len().mean()

    return unique_ratio > 0.5 and avg_length > 5

def is_source_id_column(col_name, col_data):
    """Check if column contains external system IDs."""
    ID_INDICATORS = ['external', 'source', 'sfdc', 'salesforce', 'hubspot', 'crm', 'reference']

    if any(ind in col_name.lower() for ind in ID_INDICATORS) and 'id' in col_name.lower():
        return True

    # Check for Salesforce-style IDs (15 or 18 chars, alphanumeric)
    sf_pattern = r'^[a-zA-Z0-9]{15}(?:[a-zA-Z0-9]{3})?$'
    if col_data.astype(str).str.match(sf_pattern).mean() > 0.5:
        return True

    return False

def infer_document_type(col_name):
    """Infer document type from column name."""
    col_lower = col_name.lower()

    TYPE_MAP = {
        'contract': 'Contract',
        'agreement': 'Contract',
        'proposal': 'Proposal',
        'quote': 'Proposal',
        'invoice': 'Invoice',
        'bill': 'Invoice',
        'image': 'Image',
        'photo': 'Image',
        'logo': 'Image',
        'report': 'Report',
        'summary': 'Report',
        'attachment': 'Attachment',
        'file': 'File'
    }

    for pattern, doc_type in TYPE_MAP.items():
        if pattern in col_lower:
            return doc_type

    return 'Document'
```

### Phase 4: Generate Configuration

**4.1 Build BOARD_CONFIG**
```python
def generate_board_config(file_path, header_row, classified_columns):
    """
    Generate BOARD_CONFIG dictionary for process_board.py.

    Returns:
        dict: Configuration dictionary
        str: Python code representation
    """
    config = {
        'export_path': file_path,
        'assets_path': './monday-downloads/',
        'output_path': './file_catalog.csv',
        'header_row': header_row,
        'gatekeeper_col': None,
        'label_cols': [],
        'file_cols': {},
        'source_id_col': None,
        'external_url_col': None,
        'object_type': 'Record'
    }

    for col in classified_columns:
        if col['type'] == 'gatekeeper':
            config['gatekeeper_col'] = col['name']

        elif col['type'] == 'file_url':
            config['file_cols'][col['name']] = col.get('document_type', 'Document')

        elif col['type'] == 'label':
            config['label_cols'].append(col['name'])

        elif col['type'] == 'source_id':
            config['source_id_col'] = col['name']

        elif col['type'] == 'external_url':
            config['external_url_col'] = col['name']

    # Ensure at least one label column
    if not config['label_cols'] and config['gatekeeper_col']:
        config['label_cols'] = [config['gatekeeper_col']]

    return config

def config_to_python(config):
    """Convert config dict to Python code string."""
    lines = ["BOARD_CONFIG = {"]

    for key, value in config.items():
        if isinstance(value, str):
            lines.append(f"    '{key}': '{value}',")
        elif isinstance(value, list):
            if value:
                items = ', '.join(f"'{v}'" for v in value)
                lines.append(f"    '{key}': [{items}],")
            else:
                lines.append(f"    '{key}': [],")
        elif isinstance(value, dict):
            if value:
                lines.append(f"    '{key}': {{")
                for k, v in value.items():
                    lines.append(f"        '{k}': '{v}',")
                lines.append("    },")
            else:
                lines.append(f"    '{key}': {{}},")
        elif value is None:
            lines.append(f"    '{key}': None,")
        else:
            lines.append(f"    '{key}': {value},")

    lines.append("}")
    return '\n'.join(lines)
```

### Phase 5: Generate Report

**5.1 Analysis Report**
```python
def generate_analysis_report(file_path, header_row, classified_columns, config):
    """Generate human-readable analysis report."""

    report = []
    report.append("=" * 60)
    report.append("MONDAY.COM BOARD EXPORT ANALYSIS")
    report.append("=" * 60)
    report.append("")
    report.append(f"File: {file_path}")
    report.append(f"Header Row: {header_row} (0-indexed)")
    report.append(f"Total Columns: {len(classified_columns)}")
    report.append("")

    # Column summary by type
    report.append("COLUMN SUMMARY BY TYPE")
    report.append("-" * 40)

    type_counts = {}
    for col in classified_columns:
        t = col['type']
        type_counts[t] = type_counts.get(t, 0) + 1

    for t, count in sorted(type_counts.items()):
        report.append(f"  {t}: {count}")

    report.append("")

    # Key columns identified
    report.append("KEY COLUMNS IDENTIFIED")
    report.append("-" * 40)

    gatekeeper = next((c for c in classified_columns if c['type'] == 'gatekeeper'), None)
    if gatekeeper:
        report.append(f"  Gatekeeper (Item ID): {gatekeeper['name']} (Column {gatekeeper['excel_col']})")
    else:
        report.append("  Gatekeeper: NOT FOUND (Manual configuration required)")

    file_cols = [c for c in classified_columns if c['type'] == 'file_url']
    if file_cols:
        report.append(f"  File URL Columns: {len(file_cols)}")
        for fc in file_cols:
            report.append(f"    - {fc['name']} (Column {fc['excel_col']}) → {fc.get('document_type', 'Document')}")
    else:
        report.append("  File URL Columns: NONE FOUND")

    label_cols = [c for c in classified_columns if c['type'] == 'label']
    if label_cols:
        report.append(f"  Label Candidates: {len(label_cols)}")
        for lc in label_cols:
            report.append(f"    - {lc['name']} (Column {lc['excel_col']})")

    source_id = next((c for c in classified_columns if c['type'] == 'source_id'), None)
    if source_id:
        report.append(f"  Source ID Column: {source_id['name']} (Column {source_id['excel_col']})")

    external_url = next((c for c in classified_columns if c['type'] == 'external_url'), None)
    if external_url:
        report.append(f"  External URL Column: {external_url['name']} ({external_url.get('url_type', 'unknown')})")

    report.append("")

    # All columns detail
    report.append("ALL COLUMNS")
    report.append("-" * 40)
    report.append(f"{'Index':<6} {'Excel':<6} {'Type':<15} {'Name':<30}")
    report.append("-" * 60)

    for col in classified_columns:
        report.append(
            f"{col['index']:<6} "
            f"{col['excel_col']:<6} "
            f"{col['type']:<15} "
            f"{col['name'][:30]:<30}"
        )

    report.append("")

    # Generated configuration
    report.append("GENERATED CONFIGURATION")
    report.append("-" * 40)
    report.append(config_to_python(config))

    report.append("")
    report.append("=" * 60)

    return '\n'.join(report)
```

## Configuration Template

```python
# Minimal config (auto-generated)
BOARD_CONFIG = {
    'export_path': './monday_export.xlsx',
    'assets_path': './monday-downloads/',
    'output_path': './file_catalog.csv',
    'header_row': 2,
    'gatekeeper_col': 'Item ID',
    'label_cols': ['Name', 'Account'],
    'file_cols': {
        'Contract Files': 'Contract',
        'Proposal Files': 'Proposal'
    },
    'source_id_col': 'Salesforce ID',
    'external_url_col': 'Google Drive Link',
    'object_type': 'Account'
}
```

## Example Usage

### Basic Analysis
```bash
# Agent analyzes export file and outputs configuration
User: Analyze the Monday.com export at ./exports/accounts.xlsx

Agent:
1. Detects file format (Excel)
2. Scans rows 0-15 for header
3. Finds header at row 3
4. Classifies 12 columns
5. Generates BOARD_CONFIG
6. Outputs analysis report
```

### Full Workflow
```
User: I have a Monday.com board export but I don't know the column structure.
      The file is at ./exports/contracts_board.xlsx

Agent:
1. Load monday-data-patterns skill
2. Read preview of export file
3. Detect header row (found at row 2)
4. Classify all columns:
   - Column A (Item ID): gatekeeper
   - Column B (Company Name): label
   - Column C (Contract Number): source_id
   - Column F (Contract PDF): file_url → Contract
   - Column H (Amendment Files): file_url → Amendment
5. Generate BOARD_CONFIG
6. Save analysis report to ./exports/contracts_board_analysis.txt
7. Output configuration for copy/paste
```

## Output Format

### Analysis Report
```
============================================================
MONDAY.COM BOARD EXPORT ANALYSIS
============================================================

File: ./exports/accounts.xlsx
Header Row: 2 (0-indexed)
Total Columns: 12

COLUMN SUMMARY BY TYPE
----------------------------------------
  file_url: 3
  gatekeeper: 1
  label: 2
  metadata: 5
  source_id: 1

KEY COLUMNS IDENTIFIED
----------------------------------------
  Gatekeeper (Item ID): Item ID (Column A)
  File URL Columns: 3
    - Contract Files (Column F) → Contract
    - Proposal Files (Column H) → Proposal
    - Supporting Docs (Column J) → Document
  Label Candidates: 2
    - Account Name (Column B)
    - Opportunity Name (Column C)
  Source ID Column: Salesforce ID (Column D)

ALL COLUMNS
----------------------------------------
Index  Excel  Type            Name
------------------------------------------------------------
0      A      gatekeeper      Item ID
1      B      label           Account Name
2      C      label           Opportunity Name
3      D      source_id       Salesforce ID
4      E      metadata        Status
5      F      file_url        Contract Files
6      G      metadata        Contract Date
7      H      file_url        Proposal Files
8      I      metadata        Amount
9      J      file_url        Supporting Docs
10     K      metadata        Created Date
11     L      metadata        Owner

GENERATED CONFIGURATION
----------------------------------------
BOARD_CONFIG = {
    'export_path': './exports/accounts.xlsx',
    'assets_path': './monday-downloads/',
    'output_path': './file_catalog.csv',
    'header_row': 2,
    'gatekeeper_col': 'Item ID',
    'label_cols': ['Account Name', 'Opportunity Name'],
    'file_cols': {
        'Contract Files': 'Contract',
        'Proposal Files': 'Proposal',
        'Supporting Docs': 'Document',
    },
    'source_id_col': 'Salesforce ID',
    'external_url_col': None,
    'object_type': 'Record',
}

============================================================
```

## Error Handling

### Common Issues

| Issue | Detection | Resolution |
|-------|-----------|------------|
| Header not found | No indicators in rows 0-15 | Extend scan range or manual input |
| No file columns | Zero Monday.com URLs detected | Verify export has file columns |
| Multiple gatekeepers | >1 Item ID column | Use first found, warn user |
| Unknown encoding | UnicodeDecodeError | Try latin-1, cp1252 fallbacks |

### Validation Checks
```python
def validate_analysis(classified_columns, config):
    """Validate analysis results."""
    issues = []
    warnings = []

    # Must have gatekeeper
    if not config['gatekeeper_col']:
        issues.append("No Item ID column detected - manual configuration required")

    # Should have file columns for catalog generation
    if not config['file_cols']:
        warnings.append("No file URL columns found - export may not contain files")

    # Should have label columns
    if not config['label_cols']:
        warnings.append("No label columns detected - using Item ID for labels")

    # Check for low confidence classifications
    low_confidence = [c for c in classified_columns if c['confidence'] < 0.6]
    if low_confidence:
        warnings.append(f"{len(low_confidence)} columns have low classification confidence")

    return {
        'valid': len(issues) == 0,
        'issues': issues,
        'warnings': warnings
    }
```

## Integration

### With monday-file-catalog-generator
```python
# 1. Run analyzer first
analysis = analyze_board_export('./exports/accounts.xlsx')

# 2. Review and adjust config if needed
config = analysis['config']
config['object_type'] = 'Account'  # Set CRM object type

# 3. Pass to catalog generator
generate_catalog(df, config, asset_lookup, output_path)
```

### With monday-file-extractor
```python
# Analyzer can identify which columns need file extraction
file_cols = [c for c in analysis['columns'] if c['type'] == 'file_url']
for col in file_cols:
    print(f"Extract files from column: {col['name']}")
```

## Dependencies

- pandas (for Excel/CSV processing)
- openpyxl (for .xlsx files)
- re (standard library)

## Related

- `monday-file-catalog-generator` - Generate catalogs using this config
- `monday-file-extractor` - Download files from Monday.com
- `monday-data-patterns` skill - URL patterns and matching strategies
