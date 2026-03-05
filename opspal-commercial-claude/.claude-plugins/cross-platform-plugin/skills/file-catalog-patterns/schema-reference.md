# File Catalog Schema Reference

## Core Schema

### Standard CSV Format

```csv
object_type,record_label,source_id,filename,local_path,document_type,source_record_id,resource_id,matched,external_url
Account,Acme Corp,001ABC123DEF456GH,1234567890_contract.pdf,./downloads/1234567890_contract.pdf,Contract,9876543210,1234567890,Yes,
Account,Acme Corp,001ABC123DEF456GH,1234567891_proposal.pdf,./downloads/1234567891_proposal.pdf,Proposal,9876543210,1234567891,Yes,https://drive.google.com/...
Contact,John Doe,,,,Invoice,9876543211,,No,
```

## Field Specifications

### object_type (Required)

CRM object type for file association.

**Valid Values:**
- `Account` - Company/organization records
- `Contact` - Individual person records
- `Lead` - Prospective customer records
- `Opportunity` - Sales deal records
- `Case` - Support case records
- `Custom` - Custom object (specify in metadata)

**Usage:**
```python
object_type = 'Account'
```

### record_label (Required)

Human-readable identifier for record matching and display.

**Best Practices:**
- Use composite labels for uniqueness
- Format: `{Primary Field} - {Secondary Field}`
- Max length: 255 characters

**Examples:**
```python
# Simple
record_label = 'Acme Corporation'

# Composite (recommended)
record_label = 'Acme Corporation - Enterprise Deal 2024'

# Multi-field
record_label = f"{row['Account Name']} - {row['Opportunity Name']}"
```

### source_id (Optional)

External CRM ID if record already exists.

**Formats:**
| Platform | Format | Example |
|----------|--------|---------|
| Salesforce | 18-char alphanumeric | `001ABC123DEF456GHI` |
| HubSpot | Numeric | `12345678901` |
| Dynamics | GUID | `a1b2c3d4-e5f6-...` |

**Validation:**
```python
# Salesforce ID validation
import re

def is_valid_sfdc_id(id_str):
    pattern = r'^[a-zA-Z0-9]{15}([a-zA-Z0-9]{3})?$'
    return bool(re.match(pattern, id_str))
```

### filename (Required)

Local filename of downloaded asset.

**Naming Convention:**
```
{resource_id}_{original_filename}
```

**Examples:**
```
1234567890_Contract_2024.pdf
1234567891_Acme_Proposal_v2.docx
1234567892_logo.png
```

### local_path (Required)

Full path to file on local disk.

**Format:**
- Use forward slashes
- Can be relative or absolute
- Must be valid file path

**Examples:**
```python
local_path = './downloads/1234567890_Contract_2024.pdf'
local_path = '/Users/chris/projects/monday-downloads/file.pdf'
```

### document_type (Required)

Classification of document content.

**Standard Types:**
| Type | Description | File Extensions |
|------|-------------|-----------------|
| Contract | Legal agreements | .pdf, .docx |
| Proposal | Sales proposals | .pdf, .pptx, .docx |
| Invoice | Billing documents | .pdf, .xlsx |
| Image | Visual assets | .png, .jpg, .gif, .svg |
| Report | Analysis documents | .pdf, .xlsx, .docx |
| Presentation | Slide decks | .pptx, .pdf |
| Data | Data files | .csv, .xlsx, .json |
| Attachment | Generic files | Any |

### source_record_id (Required)

ID from the source platform.

**Examples by Platform:**
```python
# Monday.com Item ID
source_record_id = '9876543210123'

# Airtable Record ID
source_record_id = 'recABC123XYZ'

# Notion Page ID
source_record_id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
```

### resource_id (Optional)

Source platform's file identifier.

**Used For:**
- Matching files to catalog entries
- Deduplication
- Tracking file versions

**Examples:**
```python
# Monday.com resource ID (from URL)
resource_id = '1458720369123'

# Airtable attachment ID
resource_id = 'attABC123XYZ'
```

### matched (Required)

Boolean indicating successful file matching.

**Values:**
- `Yes` - File found on disk
- `No` - File not found (URL only)

**Usage in Reports:**
```python
# Match rate calculation
total = len(catalog)
matched = sum(1 for row in catalog if row['matched'] == 'Yes')
match_rate = (matched / total) * 100
print(f"Match rate: {match_rate:.1f}%")
```

### external_url (Optional)

URL to external file storage.

**Supported Providers:**
- Google Drive
- AWS S3
- Dropbox
- SharePoint
- OneDrive
- Box

## Extended Schema

### Optional Metadata Fields

```csv
...external_url,created_date,modified_date,file_size,checksum,version,tags
```

| Field | Type | Description |
|-------|------|-------------|
| `created_date` | ISO 8601 | File creation timestamp |
| `modified_date` | ISO 8601 | Last modification timestamp |
| `file_size` | integer | File size in bytes |
| `checksum` | string | MD5/SHA256 hash for deduplication |
| `version` | string | Version identifier |
| `tags` | string | Comma-separated tags |

## JSON Schema

For validation and API integration:

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["object_type", "record_label", "filename", "local_path", "document_type", "source_record_id", "matched"],
  "properties": {
    "object_type": {
      "type": "string",
      "enum": ["Account", "Contact", "Lead", "Opportunity", "Case", "Custom"]
    },
    "record_label": {
      "type": "string",
      "maxLength": 255
    },
    "source_id": {
      "type": "string",
      "pattern": "^[a-zA-Z0-9]{15,18}$"
    },
    "filename": {
      "type": "string"
    },
    "local_path": {
      "type": "string"
    },
    "document_type": {
      "type": "string",
      "enum": ["Contract", "Proposal", "Invoice", "Image", "Report", "Presentation", "Data", "Attachment"]
    },
    "source_record_id": {
      "type": "string"
    },
    "resource_id": {
      "type": "string"
    },
    "matched": {
      "type": "string",
      "enum": ["Yes", "No"]
    },
    "external_url": {
      "type": "string",
      "format": "uri"
    }
  }
}
```
