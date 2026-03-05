# Monday.com Plugin

Monday.com integration for Claude Code - file extraction and board management.

## Version

1.0.0

## Features

- **File Extraction**: Download attachments from items, updates, or entire boards
- **MCP Integration**: Uses official Monday.com MCP server for standard operations
- **GraphQL Fallback**: Custom client for advanced queries not covered by MCP
- **Manifest Generation**: JSON logs of all extractions for audit trails

## Installation

This plugin is part of the OpsPal Internal Plugin Marketplace.

### Prerequisites

1. **Monday.com API Token**: Generate from Monday.com Developer settings
2. **Node.js**: v16 or higher

### Configuration

Add your Monday.com API token to `.env`:

```bash
MONDAY_API_TOKEN=your_api_token_here
```

The MCP server is automatically configured in `.mcp.json`.

## Usage

### Slash Command

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

### CLI Scripts

```bash
# Test API connection
node .claude-plugins/opspal-core-plugin/packages/domains/monday/scripts/lib/monday-api-client.js test

# Get item assets
node .claude-plugins/opspal-core-plugin/packages/domains/monday/scripts/lib/monday-api-client.js item-assets <id>

# Full extraction workflow
node .claude-plugins/opspal-core-plugin/packages/domains/monday/scripts/lib/monday-file-extractor.js --item <id>
```

### Agent

The `monday-file-extractor` agent automatically routes requests like:
- "download files from Monday"
- "extract attachments from Monday.com"
- "get PDFs from Monday board"

## Architecture

```
monday-plugin/
├── .claude-plugin/
│   └── plugin.json         # Plugin metadata
├── agents/
│   └── monday-file-extractor.md  # Autonomous extraction agent
├── commands/
│   └── monday-files.md     # Slash command
├── scripts/lib/
│   ├── monday-api-client.js      # GraphQL API client
│   └── monday-file-extractor.js  # File download logic
├── config/
│   └── monday-config.json  # Configuration defaults
└── README.md
```

## API Integration

### MCP Server (Primary)

Uses `@mondaydotcomorg/monday-api-mcp` for standard operations:
- Board queries
- Item management
- Update creation

### Custom GraphQL Client (Fallback)

For operations not covered by MCP:
- Asset queries (file attachments)
- Bulk extractions
- Rate limit handling

## Important Notes

### URL Expiration

Monday.com `public_url` links expire after **1 hour**. Always download files immediately after querying the API.

### Rate Limits

- **Requests per minute**: 60
- **Complexity budget**: 5,000,000 points/minute

The scripts handle rate limiting automatically with exponential backoff.

### Manifest Files

Every extraction creates a `manifest.json` file containing:
- Extraction timestamp
- Download statistics
- File metadata (name, size, source, status)
- Local file paths

## Troubleshooting

### "MONDAY_API_TOKEN environment variable is required"

Add your API token to `.env`:
```bash
echo "MONDAY_API_TOKEN=your_token" >> .env
```

### "Rate limited. Retry after Xs"

The script handles this automatically. If persistent, reduce batch sizes or wait between operations.

### "URL may have expired"

Re-run the extraction. URLs are only valid for 1 hour.

### "No public_url available"

The file may be restricted or the API token lacks permissions. Check your Monday.com account settings.

## Contributing

See the main [OpsPal Plugin Development Guide](../../CLAUDE.md) for contribution guidelines.

## License

Internal use only - RevPal Engineering
