# HubSpot Bulk Operations Toolkit

Production-ready toolkit for bulk HubSpot operations handling 2M+ records with automatic chunking, resumability, and proper error handling.

## Quick Start

```bash
# Install dependencies
npm install

# Import contacts
import-contacts ./data/contacts.csv --name "Q4-import"

# Export contacts with filters
export-contacts ./exports --props email,firstname,lastname --filter '{"createdAt":{"operator":"GT","value":"2024-01-01"}}'

# Import companies with mapping
import-companies ./data/companies.csv --mapping ./mappings/company-fields.json

# Resume interrupted job
import-contacts ./data/large-file.csv --name "big-import" --resume
```

## Features

✅ **True Bulk Operations** - Uses HubSpot CRM Imports API (10M rows) not batch (100 rows)
✅ **Automatic Chunking** - Splits large files respecting 512MB/10M row limits
✅ **Resumability** - Interrupt and resume jobs without losing progress
✅ **Streaming** - Memory-safe processing of gigabyte files
✅ **Rate Limiting** - Intelligent backoff with circuit breaker
✅ **Error Recovery** - Detailed error CSVs with row-level information

## Architecture

```
lib/hubspot-bulk/
├── config.js       # Centralized tunables (limits, timeouts, paths)
├── auth.js         # OAuth/token management with scope validation
├── imports.js      # CRM Imports API with multipart upload
├── exports.js      # CRM Exports API with streaming download
├── rateLimit.js    # Exponential backoff and circuit breaker
└── index.js        # Main facade and convenience methods
```

## CLI Commands

### import-contacts / import-companies

```bash
import-contacts <files...> [options]

Options:
  -n, --name <name>      Job name for tracking and resumability
  -m, --mapping <file>   Column mapping JSON file
  --dry-run              Validate without importing
  --resume               Resume previous job if exists
  --no-progress          Disable progress display

Examples:
  # Simple import
  import-contacts contacts.csv

  # Multiple files with custom name
  import-contacts part1.csv part2.csv part3.csv --name "2024-Q1"

  # With column mapping
  import-contacts data.csv --mapping field-map.json

  # Resume interrupted import
  import-contacts large-file.csv --name "big-import" --resume
```

### export-contacts / export-companies

```bash
export-contacts <output-dir> [options]

Options:
  -p, --props <list>     Properties to export (comma-separated)
  -a, --assoc <type>     Include associations (company, deal, etc.)
  -f, --filter <json>    Filter JSON or file path
  -n, --name <name>      Export job name
  --resume               Resume previous export
  --no-unzip             Keep downloaded file compressed

Examples:
  # Export with specific properties
  export-contacts ./out --props email,firstname,lastname,company

  # Export with associations
  export-contacts ./out --assoc company

  # Export with filters (JSON)
  export-contacts ./out --filter '{"email":{"operator":"CONTAINS","value":"@example.com"}}'

  # Export with filter file
  export-contacts ./out --filter ./filters/active-contacts.json
```

## Configuration

All limits and tunables are in `lib/hubspot-bulk/config.js`:

```javascript
// Environment variables
HUBSPOT_ACCESS_TOKEN    # OAuth token (required)
HUBSPOT_PRIVATE_APP_KEY # Private app key (alternative)
HS_MAX_ROWS_PER_FILE    # Max rows per import file (default: 10M)
HS_MAX_FILE_SIZE_MB     # Max file size in MB (default: 512)
HS_POLL_INTERVAL_MS     # Poll interval for async jobs (default: 5000)
HS_DAILY_LIMIT          # Daily API request limit (default: 500k)
```

## Column Mapping

Create a mapping file to match CSV columns to HubSpot properties:

```json
{
  "Email Address": "email",
  "First Name": "firstname",
  "Last Name": "lastname",
  "Company Name": "company",
  "Phone Number": "phone",
  "Lead Source": "leadsource"
}
```

## Filter Examples

### Simple Filters
```json
{
  "email": "john@example.com",
  "firstname": "John"
}
```

### Advanced Filters
```json
[{
  "filters": [{
    "propertyName": "createdate",
    "operator": "GT",
    "value": "2024-01-01"
  }, {
    "propertyName": "lifecyclestage",
    "operator": "IN",
    "value": ["lead", "marketingqualifiedlead"]
  }]
}]
```

## Job State & Resumability

Jobs automatically save state to `.jobs/hubspot/`:

```bash
.jobs/hubspot/
├── import-1234567890.json    # Import job state
├── export-1234567890.json    # Export job state
└── big-import.json            # Named job state
```

Resume interrupted jobs with `--resume`:
- Checks existing job state
- Polls in-progress imports/exports
- Downloads completed exports
- Continues from last successful chunk

## Error Handling

Failed rows are saved to CSV with details:

```csv
row_number,error_type,message,invalid_value
2,INVALID_EMAIL,"Invalid email format","not-an-email"
5,DUPLICATE_VALUE,"Email already exists","duplicate@example.com"
10,MISSING_REQUIRED,"firstname is required",""
```

## Performance Guidelines

| Dataset Size | Recommended Approach | Expected Time |
|-------------|---------------------|---------------|
| < 10K | Direct import | < 1 minute |
| 10K - 100K | Single file import | 2-5 minutes |
| 100K - 1M | Auto-chunking | 10-30 minutes |
| 1M - 10M | Multi-file chunking | 30-120 minutes |
| > 10M | Batch processing | 2-8 hours |

## Troubleshooting

### Common Issues

**Rate Limiting**
```
Circuit breaker open until 2024-01-01T12:00:00Z
```
→ Wait for circuit to reset or reduce concurrency

**Daily Limit Reached**
```
Daily limit reached. Reset in 240 minutes
```
→ Wait for daily reset (midnight UTC) or upgrade API limits

**Import Stuck Processing**
```
Import PROCESSING: contacts.csv
```
→ Large imports can take hours. Use `--resume` if interrupted

**Memory Issues with Large Files**
→ Files are streamed, but ensure sufficient disk space for chunks

### Debug Mode

Enable debug logging:
```bash
HS_LOG_LEVEL=debug import-contacts data.csv
```

View rate limit status:
```javascript
const hubspot = new HubSpotBulk();
console.log(hubspot.getRateLimitStatus());
// {
//   burst: { second: "5/10", tenSeconds: "45/100" },
//   daily: { used: 15000, limit: 500000, remaining: 485000 },
//   circuitBreaker: "CLOSED"
// }
```

## Security Best Practices

1. **Never commit tokens** - Use environment variables
2. **Redact PII in logs** - Enabled by default
3. **Clean temp files** - Automatic cleanup on completion
4. **Validate CSVs** - Check encoding and format before import
5. **Use read-only tokens** for exports when possible

## API Limits Reference

| Limit Type | Value | Notes |
|-----------|-------|-------|
| Requests/second | 10 | Burst limit |
| Requests/10 seconds | 100 | Sustained limit |
| Daily requests | 500,000 | Standard tier |
| Import file size | 512 MB | Per file |
| Import rows | 10,000,000 | Per file |
| Export properties | 100 | Per export |
| Concurrent imports | 5 | Recommended |

## Support

- Check job state: `.jobs/hubspot/[job-name].json`
- View error details: `out/[job-name]_errors.csv`
- Review summaries: `out/[job-name].summary.json`
- Enable debug: `HS_LOG_LEVEL=debug`

For issues, check the [PR checklist](.github/PULL_REQUEST_TEMPLATE.md) requirements.