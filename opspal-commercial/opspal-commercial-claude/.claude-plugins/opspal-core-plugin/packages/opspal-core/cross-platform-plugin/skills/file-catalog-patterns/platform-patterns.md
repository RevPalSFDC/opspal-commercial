# Platform-Specific Patterns

## Monday.com

### URL Patterns

```
# Standard file URL
https://monday.com/resources/{resource_id}/{filename}

# Files subdomain (newer)
https://files.monday.com/{resource_id}/{filename}

# Legacy format
https://monday-files.com/{resource_id}/{filename}
```

### Resource ID Extraction

```python
import re

MONDAY_PATTERNS = [
    r'monday\.com/resources/(\d+)/',
    r'files\.monday\.com/(\d+)/',
    r'monday-files\.com/(\d+)/'
]

def extract_monday_resource_id(url):
    for pattern in MONDAY_PATTERNS:
        match = re.search(pattern, str(url))
        if match:
            return match.group(1)
    return None
```

### Asset Naming Convention

```
{resource_id}_{original_filename}
Example: 1458720369123_Contract_2024.pdf
```

### Export Quirks

| Issue | Description | Solution |
|-------|-------------|----------|
| Variable header row | Headers can be in rows 1-10 | Scan for "Item ID" indicator |
| Sub-items included | Export may include sub-items | Filter by Item ID format |
| URL expiration | URLs expire after ~1 hour | Download immediately |
| Multiple file columns | Board may have many file fields | Detect by URL pattern |

### Configuration Template

```python
MONDAY_CONFIG = {
    'platform': 'monday',
    'export_path': './monday_export.xlsx',
    'assets_path': './monday-downloads/',
    'header_indicators': ['Item ID', 'item_id', 'ID'],
    'url_patterns': MONDAY_PATTERNS,
    'naming_convention': '{resource_id}_{original_filename}'
}
```

---

## Airtable

### URL Patterns

```
# Attachment URL
https://dl.airtable.com/.attachments/{attachment_id}/{filename}

# Thumbnail URL
https://dl.airtable.com/.attachmentThumbnails/{attachment_id}/{filename}
```

### Attachment ID Extraction

```python
AIRTABLE_PATTERNS = [
    r'\.attachments/([^/]+)/',
    r'\.attachmentThumbnails/([^/]+)/'
]

def extract_airtable_attachment_id(url):
    for pattern in AIRTABLE_PATTERNS:
        match = re.search(pattern, str(url))
        if match:
            return match.group(1)
    return None
```

### Record ID Format

```
# Airtable Record IDs
rec{17_alphanumeric_chars}
Example: recABC123XYZ789012
```

### Export Format (JSON)

```json
{
  "records": [
    {
      "id": "recABC123XYZ789012",
      "fields": {
        "Name": "Acme Corp",
        "Contract": [
          {
            "id": "attDEF456UVW321",
            "url": "https://dl.airtable.com/.attachments/...",
            "filename": "contract.pdf",
            "size": 245678,
            "type": "application/pdf"
          }
        ]
      }
    }
  ]
}
```

### Configuration Template

```python
AIRTABLE_CONFIG = {
    'platform': 'airtable',
    'export_path': './airtable_export.json',
    'assets_path': './airtable-downloads/',
    'record_id_pattern': r'^rec[a-zA-Z0-9]{14,17}$',
    'url_patterns': AIRTABLE_PATTERNS,
    'naming_convention': '{attachment_id}_{original_filename}'
}
```

---

## Notion

### URL Patterns

```
# Secure file URL (signed, expires)
https://prod-files-secure.s3.us-west-2.amazonaws.com/{path}?{signature}

# Static file URL
https://www.notion.so/image/{encoded_url}
```

### Challenges

| Challenge | Description | Workaround |
|-----------|-------------|------------|
| Signed URLs | URLs expire quickly | Download immediately |
| No stable ID | File IDs change | Use page ID + filename |
| Block-based | Files attached to blocks | Track block_id |

### Page ID Format

```
# Notion Page/Block IDs (UUID format)
{8}-{4}-{4}-{4}-{12}
Example: a1b2c3d4-e5f6-7890-abcd-ef1234567890
```

### Configuration Template

```python
NOTION_CONFIG = {
    'platform': 'notion',
    'export_path': './notion_export/',
    'assets_path': './notion-downloads/',
    'page_id_pattern': r'[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}',
    'naming_convention': '{page_id}_{block_id}_{original_filename}'
}
```

---

## Google Drive

### URL Patterns

```
# File view URL
https://drive.google.com/file/d/{file_id}/view

# Direct download URL
https://drive.google.com/uc?id={file_id}&export=download

# Docs/Sheets/Slides
https://docs.google.com/document/d/{doc_id}/edit
https://docs.google.com/spreadsheets/d/{sheet_id}/edit
https://docs.google.com/presentation/d/{presentation_id}/edit
```

### File ID Extraction

```python
GDRIVE_PATTERNS = [
    r'drive\.google\.com/file/d/([^/]+)/',
    r'drive\.google\.com/uc\?id=([^&]+)',
    r'docs\.google\.com/document/d/([^/]+)/',
    r'docs\.google\.com/spreadsheets/d/([^/]+)/',
    r'docs\.google\.com/presentation/d/([^/]+)/'
]

def extract_gdrive_file_id(url):
    for pattern in GDRIVE_PATTERNS:
        match = re.search(pattern, str(url))
        if match:
            return match.group(1)
    return None
```

### Configuration Template

```python
GDRIVE_CONFIG = {
    'platform': 'google_drive',
    'url_patterns': GDRIVE_PATTERNS,
    'naming_convention': '{file_id}_{original_filename}',
    'export_formats': {
        'document': 'application/pdf',
        'spreadsheet': 'text/csv',
        'presentation': 'application/pdf'
    }
}
```

---

## AWS S3

### URL Patterns

```
# Virtual-hosted style
https://{bucket}.s3.amazonaws.com/{key}
https://{bucket}.s3.{region}.amazonaws.com/{key}

# Path style (legacy)
https://s3.amazonaws.com/{bucket}/{key}
https://s3.{region}.amazonaws.com/{bucket}/{key}

# S3 URI
s3://{bucket}/{key}
```

### Extraction

```python
S3_PATTERNS = [
    r'([^.]+)\.s3\.amazonaws\.com/(.+)',
    r'([^.]+)\.s3\.[^.]+\.amazonaws\.com/(.+)',
    r's3\.amazonaws\.com/([^/]+)/(.+)',
    r's3://([^/]+)/(.+)'
]

def extract_s3_location(url):
    for pattern in S3_PATTERNS:
        match = re.search(pattern, str(url))
        if match:
            return {
                'bucket': match.group(1),
                'key': match.group(2)
            }
    return None
```

### Configuration Template

```python
S3_CONFIG = {
    'platform': 's3',
    'url_patterns': S3_PATTERNS,
    'naming_convention': '{bucket}_{key_basename}',
    'requires_auth': True
}
```

---

## SharePoint / OneDrive

### URL Patterns

```
# SharePoint file
https://{tenant}.sharepoint.com/:f:/{site}/{library}/{file}

# OneDrive personal
https://onedrive.live.com/?id={file_id}

# OneDrive for Business
https://{tenant}-my.sharepoint.com/:f:/g/personal/{user}/{file}
```

### Challenges

| Challenge | Description | Workaround |
|-----------|-------------|------------|
| Auth required | Most URLs need authentication | Use Graph API |
| Complex URLs | Encoded paths and IDs | Decode carefully |
| Tenant-specific | URLs include tenant name | Extract dynamically |

### Configuration Template

```python
SHAREPOINT_CONFIG = {
    'platform': 'sharepoint',
    'requires_auth': True,
    'auth_method': 'oauth2',
    'naming_convention': '{site}_{library}_{filename}'
}
```

---

## Dropbox

### URL Patterns

```
# Shared link
https://www.dropbox.com/s/{share_id}/{filename}?dl=0

# Direct download (change dl=0 to dl=1)
https://www.dropbox.com/s/{share_id}/{filename}?dl=1

# Scoped link
https://www.dropbox.com/scl/fi/{file_id}/{filename}?dl=0
```

### Extraction

```python
DROPBOX_PATTERNS = [
    r'dropbox\.com/s/([^/]+)/([^?]+)',
    r'dropbox\.com/scl/fi/([^/]+)/([^?]+)'
]

def extract_dropbox_info(url):
    for pattern in DROPBOX_PATTERNS:
        match = re.search(pattern, str(url))
        if match:
            return {
                'share_id': match.group(1),
                'filename': match.group(2)
            }
    return None
```

### Configuration Template

```python
DROPBOX_CONFIG = {
    'platform': 'dropbox',
    'url_patterns': DROPBOX_PATTERNS,
    'naming_convention': '{share_id}_{filename}',
    'download_param': 'dl=1'
}
```

---

## Universal Platform Detector

```python
def detect_platform(url):
    """Detect file hosting platform from URL."""

    PLATFORM_INDICATORS = {
        'monday': ['monday.com/resources', 'files.monday.com'],
        'airtable': ['dl.airtable.com', '.attachments'],
        'google_drive': ['drive.google.com', 'docs.google.com'],
        's3': ['s3.amazonaws.com', '.s3.'],
        'sharepoint': ['sharepoint.com'],
        'dropbox': ['dropbox.com'],
        'notion': ['notion.so', 'prod-files-secure.s3']
    }

    url_lower = str(url).lower()

    for platform, indicators in PLATFORM_INDICATORS.items():
        if any(ind in url_lower for ind in indicators):
            return platform

    return 'unknown'
```
