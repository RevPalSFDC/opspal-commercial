---
name: monday-files
description: Extract file attachments from Monday.com items, updates, or entire boards
allowed-tools: Read, Write, Bash, mcp__monday__*, WebFetch
thinking-mode: enabled
---

# Monday.com File Extraction

## OBJECTIVE

Extract and download file attachments from Monday.com boards, items, or updates.

## PARAMETERS

| Parameter | Description | Example |
|-----------|-------------|---------|
| `--item <id>` | Extract files from specific item | `--item 1234567890` |
| `--update <id>` | Extract files from specific update/comment | `--update 9876543210` |
| `--board <id>` | Extract all files from a board | `--board 1111111111` |
| `--output <dir>` | Download directory (default: ./monday-downloads) | `--output ./project-files` |
| `--include-updates` | Include files from updates when extracting board | Flag, no value |

## WORKFLOW

### 1. Parameter Validation
- Ensure at least one ID is provided (item, update, or board)
- Verify download directory is writable
- Check MONDAY_API_TOKEN is set

### 2. Query Monday.com for Assets
**Primary**: Use MCP tools (`mcp__monday__*`) when available
**Fallback**: Use custom GraphQL client for asset queries

```bash
# Using custom GraphQL client (fallback)
node .claude-plugins/opspal-core-plugin/packages/domains/monday/scripts/lib/monday-api-client.js item-assets <id>
```

### 3. Download Files
- Extract `public_url` from each asset
- Download via HTTP GET (no auth needed - URL is pre-authorized)
- **CRITICAL**: URLs expire after 1 hour - download immediately!

```bash
# Full extraction workflow
node .claude-plugins/opspal-core-plugin/packages/domains/monday/scripts/lib/monday-file-extractor.js --item <id> --output ./downloads
```

### 4. Generate Manifest
- Creates `manifest.json` with all download metadata
- Includes: filename, source, size, status, local path

## EXAMPLE USAGE

```bash
# Extract files from a single item
/monday-files --item 1234567890

# Extract files from an update/comment
/monday-files --update 9876543210

# Extract all files from a board
/monday-files --board 1111111111

# Board with update attachments included
/monday-files --board 1111111111 --include-updates

# Custom output directory
/monday-files --item 1234567890 --output ./project-files
```

## ERROR HANDLING

| Error | Cause | Resolution |
|-------|-------|------------|
| Rate limited (429) | Too many API requests | Wait per `Retry-After` header, then retry |
| HTTP 403/404 on download | URL expired (>1 hour old) | Re-query for fresh `public_url` |
| No public_url | File not accessible | Check permissions, file may be restricted |
| Invalid ID | Wrong ID format or not found | Verify ID from Monday.com URL |
| MONDAY_API_TOKEN missing | Environment not configured | Add token to `.env` file |

## IMPORTANT NOTES

1. **URL Expiration**: Monday.com `public_url` links expire after 1 hour. Always download immediately after querying.

2. **Rate Limits**: Monday.com API has complexity budgets. For large boards, the script handles pagination automatically.

3. **File Types**: All file types are supported. The `public_url` contains the actual file.

4. **Manifest**: Always generates `manifest.json` in the download directory for audit/tracking.

## OUTPUT FORMAT

After extraction, you'll see:
```
--- Extraction Complete ---
Total files:    15
Downloaded:     14
Failed:         1
Skipped:        0

Manifest: /path/to/downloads/manifest.json
Downloads: /path/to/downloads
```

## RELATED

- `node .claude-plugins/opspal-core-plugin/packages/domains/monday/scripts/lib/monday-api-client.js test` - Test API connection
- `node .claude-plugins/opspal-core-plugin/packages/domains/monday/scripts/lib/monday-file-extractor.js --help` - CLI help
