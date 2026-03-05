---
name: file-catalog-patterns
description: Standard patterns for file catalog generation across source platforms (Monday.com, Airtable, Notion, etc.) for CRM ingestion. Use when transforming file exports into normalized catalogs, matching downloaded assets to source records, preparing file inventories for Salesforce/HubSpot import, or building cross-platform file migration workflows. Provides schema standards, matching strategies, and integration patterns.
allowed-tools: Read, Grep, Glob
---

# File Catalog Patterns

## When to Use This Skill

- Transforming file exports into normalized catalogs
- Matching downloaded assets to source records
- Preparing file inventories for Salesforce/HubSpot import
- Building cross-platform file migration workflows
- Standardizing file metadata from multiple sources
- Enriching catalogs with external URLs

## Quick Reference

### Standard File Catalog Schema

```csv
object_type,record_label,source_id,filename,local_path,document_type,source_record_id,resource_id,matched,external_url
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `object_type` | string | Yes | Target CRM object (Account, Contact, Lead, etc.) |
| `record_label` | string | Yes | Human-readable identifier for the record |
| `source_id` | string | No | CRM ID if record exists (Salesforce 18-char ID) |
| `filename` | string | Yes | Local filename of downloaded asset |
| `local_path` | string | Yes | Full path to file on disk |
| `document_type` | string | Yes | Classification (Contract, Proposal, Invoice, etc.) |
| `source_record_id` | string | Yes | ID from source system (Monday Item ID, etc.) |
| `resource_id` | string | No | Source system's file identifier |
| `matched` | boolean | Yes | Whether file was matched to local asset |
| `external_url` | string | No | External URL (Google Drive, S3, etc.) |

### File Matching Strategy Priority

| Priority | Strategy | When to Use | Reliability |
|----------|----------|-------------|-------------|
| 1 | Resource ID | Source provides unique file IDs | 99% |
| 2 | Hash Matching | Duplicate detection needed | 95% |
| 3 | Filename + Size | No unique IDs available | 80% |
| 4 | Normalized Filename | Last resort fallback | 60% |

### Document Type Classification

| Column/Context Pattern | Document Type |
|------------------------|---------------|
| contract, agreement, msa, nda | Contract |
| proposal, quote, estimate | Proposal |
| invoice, bill, receipt | Invoice |
| image, photo, logo, screenshot | Image |
| report, summary, analysis | Report |
| presentation, deck, slides | Presentation |
| spreadsheet, data, export | Data |
| default | Attachment |

### Cross-Platform Source Patterns

| Platform | URL Pattern | ID Extraction |
|----------|-------------|---------------|
| Monday.com | `monday.com/resources/{id}/` | `/resources/(\d+)/` |
| Airtable | `dl.airtable.com/.attachments/{id}/` | `.attachments/([^/]+)/` |
| Notion | `prod-files.notion-static.com/{id}/` | Not extractable |
| Google Drive | `drive.google.com/file/d/{id}/` | `/file/d/([^/]+)/` |
| Dropbox | `dropbox.com/s/{id}/` | `/s/([^/]+)/` |
| SharePoint | `sharepoint.com/:f:/{site}/{id}` | Complex extraction |
| AWS S3 | `s3.amazonaws.com/{bucket}/{key}` | Bucket + key |

## Detailed Documentation

See supporting files:
- `schema-reference.md` - Complete schema documentation
- `matching-strategies.md` - File matching algorithms
- `platform-patterns.md` - Platform-specific patterns
- `integration-guide.md` - CRM integration patterns
