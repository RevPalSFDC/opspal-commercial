# CRM Integration Guide

## Overview

This guide covers integrating file catalogs with major CRM platforms for file attachment and association.

## Salesforce Integration

### ContentDocument / ContentVersion Model

Salesforce uses a two-object model for files:
- **ContentDocument**: The file itself
- **ContentVersion**: Versions of the file
- **ContentDocumentLink**: Links files to records

### Upload Workflow

```python
from simple_salesforce import Salesforce

def upload_file_to_salesforce(sf, file_path, linked_entity_id, title=None):
    """
    Upload file to Salesforce and link to a record.

    Args:
        sf: Salesforce connection
        file_path: Local file path
        linked_entity_id: Record ID to link to (Account, Contact, etc.)
        title: Optional title (defaults to filename)

    Returns:
        dict: ContentDocument and ContentDocumentLink IDs
    """
    import base64
    import os

    filename = os.path.basename(file_path)
    title = title or filename

    # Read and encode file
    with open(file_path, 'rb') as f:
        file_data = base64.b64encode(f.read()).decode('utf-8')

    # Create ContentVersion (automatically creates ContentDocument)
    content_version = sf.ContentVersion.create({
        'Title': title,
        'PathOnClient': filename,
        'VersionData': file_data
    })

    # Get ContentDocumentId
    cv_record = sf.ContentVersion.get(content_version['id'])
    content_document_id = cv_record['ContentDocumentId']

    # Create link to record
    link = sf.ContentDocumentLink.create({
        'ContentDocumentId': content_document_id,
        'LinkedEntityId': linked_entity_id,
        'ShareType': 'V',  # Viewer permission
        'Visibility': 'AllUsers'
    })

    return {
        'ContentDocumentId': content_document_id,
        'ContentVersionId': content_version['id'],
        'ContentDocumentLinkId': link['id']
    }
```

### Bulk Upload Pattern

```python
def bulk_upload_from_catalog(sf, catalog_df, base_path):
    """
    Bulk upload files from catalog to Salesforce.

    Args:
        sf: Salesforce connection
        catalog_df: DataFrame with catalog data
        base_path: Base path for local files

    Returns:
        dict: Upload statistics
    """
    import os

    results = {
        'uploaded': 0,
        'skipped': 0,
        'failed': 0,
        'errors': []
    }

    for idx, row in catalog_df.iterrows():
        # Skip unmatched files
        if row['matched'] != 'Yes':
            results['skipped'] += 1
            continue

        # Skip if no source_id (record doesn't exist in SF)
        if not row.get('source_id'):
            results['skipped'] += 1
            continue

        file_path = os.path.join(base_path, row['filename'])

        if not os.path.exists(file_path):
            results['failed'] += 1
            results['errors'].append(f"File not found: {file_path}")
            continue

        try:
            upload_result = upload_file_to_salesforce(
                sf=sf,
                file_path=file_path,
                linked_entity_id=row['source_id'],
                title=f"{row['document_type']} - {row['record_label']}"
            )
            results['uploaded'] += 1
        except Exception as e:
            results['failed'] += 1
            results['errors'].append(f"Upload failed for {row['filename']}: {str(e)}")

    return results
```

### Salesforce ID Validation

```python
import re

def validate_salesforce_id(id_string, object_type=None):
    """
    Validate Salesforce ID format.

    Args:
        id_string: The ID to validate
        object_type: Optional object type to validate prefix

    Returns:
        bool: Whether ID is valid
    """
    if not id_string:
        return False

    # 15 or 18 character alphanumeric
    if not re.match(r'^[a-zA-Z0-9]{15}([a-zA-Z0-9]{3})?$', id_string):
        return False

    # Object type prefix validation
    PREFIXES = {
        'Account': '001',
        'Contact': '003',
        'Lead': '00Q',
        'Opportunity': '006',
        'Case': '500',
        'ContentDocument': '069',
        'ContentVersion': '068'
    }

    if object_type and object_type in PREFIXES:
        return id_string.startswith(PREFIXES[object_type])

    return True
```

---

## HubSpot Integration

### Files API

HubSpot uses a Files API for attachments.

### Upload Workflow

```python
import requests
import os

def upload_file_to_hubspot(access_token, file_path, folder_path='/'):
    """
    Upload file to HubSpot Files.

    Args:
        access_token: HubSpot API token
        file_path: Local file path
        folder_path: HubSpot folder path

    Returns:
        dict: File metadata including ID and URL
    """
    filename = os.path.basename(file_path)

    # Upload file
    url = 'https://api.hubapi.com/files/v3/files'
    headers = {
        'Authorization': f'Bearer {access_token}'
    }

    with open(file_path, 'rb') as f:
        files = {
            'file': (filename, f),
            'folderPath': (None, folder_path),
            'options': (None, '{"access": "PUBLIC_INDEXABLE"}')
        }
        response = requests.post(url, headers=headers, files=files)

    if response.status_code == 201:
        return response.json()
    else:
        raise Exception(f"Upload failed: {response.text}")

def associate_file_with_record(access_token, file_id, object_type, record_id):
    """
    Associate uploaded file with a HubSpot record via note.

    Args:
        access_token: HubSpot API token
        file_id: HubSpot file ID
        object_type: contacts, companies, deals
        record_id: HubSpot record ID

    Returns:
        dict: Note/engagement data
    """
    # Create engagement with file attachment
    url = 'https://api.hubapi.com/engagements/v1/engagements'
    headers = {
        'Authorization': f'Bearer {access_token}',
        'Content-Type': 'application/json'
    }

    data = {
        'engagement': {
            'type': 'NOTE'
        },
        'associations': {
            object_type: [int(record_id)]
        },
        'attachments': [
            {'id': file_id}
        ],
        'metadata': {
            'body': 'File attachment from catalog import'
        }
    }

    response = requests.post(url, headers=headers, json=data)

    if response.status_code == 200:
        return response.json()
    else:
        raise Exception(f"Association failed: {response.text}")
```

### Bulk Upload Pattern

```python
def bulk_upload_to_hubspot(access_token, catalog_df, base_path, object_type='companies'):
    """
    Bulk upload files from catalog to HubSpot.

    Args:
        access_token: HubSpot API token
        catalog_df: DataFrame with catalog data
        base_path: Base path for local files
        object_type: HubSpot object type

    Returns:
        dict: Upload statistics
    """
    results = {
        'uploaded': 0,
        'skipped': 0,
        'failed': 0,
        'errors': []
    }

    # Create folder for organized uploads
    folder_path = f'/catalog-imports/{catalog_df["object_type"].iloc[0]}'

    for idx, row in catalog_df.iterrows():
        if row['matched'] != 'Yes' or not row.get('source_id'):
            results['skipped'] += 1
            continue

        file_path = os.path.join(base_path, row['filename'])

        if not os.path.exists(file_path):
            results['failed'] += 1
            continue

        try:
            # Upload file
            file_result = upload_file_to_hubspot(
                access_token=access_token,
                file_path=file_path,
                folder_path=folder_path
            )

            # Associate with record
            associate_file_with_record(
                access_token=access_token,
                file_id=file_result['id'],
                object_type=object_type,
                record_id=row['source_id']
            )

            results['uploaded'] += 1

        except Exception as e:
            results['failed'] += 1
            results['errors'].append(str(e))

    return results
```

---

## Pre-Import Validation

### Record Existence Check

```python
def validate_source_ids(sf, catalog_df, object_type):
    """
    Validate that source_ids exist in Salesforce.

    Args:
        sf: Salesforce connection
        catalog_df: DataFrame with catalog data
        object_type: Salesforce object type

    Returns:
        dict: Validation results
    """
    source_ids = catalog_df['source_id'].dropna().unique().tolist()

    if not source_ids:
        return {'valid': [], 'invalid': [], 'missing': source_ids}

    # Query for existing records
    id_list = "', '".join(source_ids)
    query = f"SELECT Id FROM {object_type} WHERE Id IN ('{id_list}')"

    results = sf.query_all(query)
    found_ids = {r['Id'] for r in results['records']}

    valid = [id for id in source_ids if id in found_ids]
    invalid = [id for id in source_ids if id not in found_ids]

    return {
        'valid': valid,
        'invalid': invalid,
        'valid_count': len(valid),
        'invalid_count': len(invalid),
        'validation_rate': f"{len(valid)/len(source_ids)*100:.1f}%" if source_ids else "N/A"
    }
```

### File Size Limits

```python
CRM_FILE_LIMITS = {
    'salesforce': {
        'max_file_size': 2 * 1024 * 1024 * 1024,  # 2GB
        'max_attachment_size': 25 * 1024 * 1024,   # 25MB for Attachments
        'max_content_version': 2 * 1024 * 1024 * 1024  # 2GB for ContentVersion
    },
    'hubspot': {
        'max_file_size': 512 * 1024 * 1024  # 512MB
    }
}

def validate_file_sizes(catalog_df, base_path, platform='salesforce'):
    """
    Validate file sizes against platform limits.

    Returns:
        dict: Files that exceed limits
    """
    import os

    limits = CRM_FILE_LIMITS.get(platform, {})
    max_size = limits.get('max_file_size', float('inf'))

    oversized = []

    for idx, row in catalog_df.iterrows():
        if row['matched'] != 'Yes':
            continue

        file_path = os.path.join(base_path, row['filename'])
        if os.path.exists(file_path):
            size = os.path.getsize(file_path)
            if size > max_size:
                oversized.append({
                    'filename': row['filename'],
                    'size': size,
                    'size_mb': size / (1024 * 1024),
                    'limit_mb': max_size / (1024 * 1024)
                })

    return oversized
```

---

## Post-Import Verification

### Verify Uploads

```python
def verify_salesforce_uploads(sf, upload_results):
    """
    Verify files were uploaded successfully.

    Args:
        sf: Salesforce connection
        upload_results: List of ContentDocumentIds

    Returns:
        dict: Verification results
    """
    if not upload_results:
        return {'verified': 0, 'missing': 0}

    doc_ids = [r['ContentDocumentId'] for r in upload_results]
    id_list = "', '".join(doc_ids)

    query = f"SELECT Id, Title FROM ContentDocument WHERE Id IN ('{id_list}')"
    results = sf.query_all(query)

    found_ids = {r['Id'] for r in results['records']}

    return {
        'verified': len(found_ids),
        'missing': len(doc_ids) - len(found_ids),
        'verification_rate': f"{len(found_ids)/len(doc_ids)*100:.1f}%"
    }
```

---

## Error Handling

### Common Errors

| Error | Cause | Solution |
|-------|-------|----------|
| `INVALID_CROSS_REFERENCE_KEY` | Record doesn't exist | Validate source_ids before upload |
| `STORAGE_LIMIT_EXCEEDED` | Org storage full | Check org limits, archive old files |
| `FIELD_INTEGRITY_EXCEPTION` | Invalid ContentDocumentLink | Verify LinkedEntityId is valid |
| `FILE_SIZE_LIMIT_EXCEEDED` | File too large | Split or compress file |
| `UNABLE_TO_LOCK_ROW` | Concurrent modification | Implement retry with backoff |

### Retry Pattern

```python
import time

def upload_with_retry(upload_func, max_retries=3, backoff_factor=2):
    """
    Retry upload with exponential backoff.

    Args:
        upload_func: Function to call
        max_retries: Maximum retry attempts
        backoff_factor: Backoff multiplier

    Returns:
        Result of successful upload or raises exception
    """
    last_exception = None

    for attempt in range(max_retries):
        try:
            return upload_func()
        except Exception as e:
            last_exception = e
            if 'UNABLE_TO_LOCK_ROW' in str(e):
                wait_time = backoff_factor ** attempt
                time.sleep(wait_time)
            else:
                raise

    raise last_exception
```
