# Cross-Platform Operations Data Suite

A comprehensive data operations suite for managing Salesforce and HubSpot integration, providing powerful tools for record mapping, deduplication, data analysis, and synchronization.

## 🚀 Features

### Core Capabilities
- **Bidirectional Data Mapping** - Intelligent field mapping between Salesforce and HubSpot
- **Advanced Deduplication** - Multiple fuzzy matching algorithms (Levenshtein, Jaro-Winkler, Soundex, Metaphone)
- **Cross-Platform Sync** - Real-time and batch synchronization with conflict resolution
- **Data Quality Analysis** - Completeness scoring, validation, and quality metrics
- **Unified Data Model** - Standard format for cross-platform operations
- **MCP Server Integration** - Model Context Protocol tools for AI-assisted operations
- **Interactive CLI** - Powerful command-line interface for all operations

### Key Components
1. **Salesforce Connector** - Full CRUD operations with bulk processing
2. **HubSpot Connector** - API v3 integration with rate limiting
3. **Field Mapping Engine** - Auto-detection and custom mapping rules
4. **Deduplication Engine** - ML-based duplicate detection with confidence scoring
5. **Data Analysis Module** - Quality metrics and reporting
6. **Merger Module** - Conflict resolution strategies
7. **MCP Server** - AI-powered tools for cross-platform operations
8. **CLI Tools** - Interactive command-line interface

## 📦 Installation

```bash
# Clone the repository
cd platforms/cross-platform-ops

# Install dependencies
npm install

# Initialize configuration
npm run config:init
```

## 🔧 Configuration

### Quick Setup

1. **Salesforce Authentication**
```bash
# Login to Salesforce org
npm run sf:auth

# List available orgs
npm run sf:list
```

2. **HubSpot Configuration**
```bash
# Set up HubSpot API key
npm run xplat:config
```

3. **Environment Variables**
```bash
# Create .env file
SALESFORCE_ORG_ALIAS=production
HUBSPOT_API_KEY=your-api-key
HUBSPOT_PORTAL_ID=your-portal-id
```

## 💻 CLI Usage

### Interactive Mode
```bash
# Launch interactive CLI
npx xplat

# Or use the global command after installation
xplat
```

### Command Examples

#### Field Mapping
```bash
# Auto-detect field mappings
xplat map --auto-detect

# Map specific records
xplat map -s salesforce -t hubspot -o contact -f data.json

# Validate mappings
xplat map --validate
```

#### Deduplication
```bash
# Find duplicates in Salesforce
xplat dedupe -p salesforce -o contact

# Cross-platform duplicate detection
xplat dedupe --cross-platform -o contact

# Auto-merge with high confidence
xplat dedupe -p hubspot --auto-merge --threshold 0.95
```

#### Data Synchronization
```bash
# Sync Salesforce to HubSpot
xplat sync -d sf-to-hs -o contact

# Bidirectional sync with conflict resolution
xplat sync -d bidirectional -o deal --conflict newer

# Dry run mode
xplat sync -d hs-to-sf --dry-run
```

#### Data Analysis
```bash
# Analyze data quality
xplat analyze -p both -o contact

# Generate reports
xplat analyze --metrics completeness quality duplicates --export html
```

## 🤖 MCP Server Tools

The MCP server provides the following tools for AI-assisted operations:

- `xplat_map_records` - Map records between platforms
- `xplat_find_duplicates` - Find duplicates within or across platforms
- `xplat_sync_records` - Synchronize records
- `xplat_analyze_data` - Analyze data quality
- `xplat_merge_records` - Merge duplicate records
- `xplat_field_mapping` - Manage field mappings
- `xplat_validate_sync` - Validate sync configuration
- `xplat_export_report` - Generate analysis reports

### Starting the MCP Server
```bash
# Start MCP server
npm run mcp:start

# Debug mode
npm run mcp:debug
```

## 📊 NPM Scripts

### Core Operations
```bash
npm run xplat:map        # Field mapping operations
npm run xplat:dedupe     # Deduplication operations
npm run xplat:sync       # Synchronization operations
npm run xplat:analyze    # Data analysis
```

### Specific Tasks
```bash
npm run dedupe:sf        # Deduplicate Salesforce records
npm run dedupe:hs        # Deduplicate HubSpot records
npm run dedupe:cross     # Cross-platform deduplication

npm run sync:sf-to-hs    # Sync Salesforce to HubSpot
npm run sync:hs-to-sf    # Sync HubSpot to Salesforce
npm run sync:bidirectional # Bidirectional sync

npm run map:auto         # Auto-detect mappings
npm run analyze:all      # Comprehensive analysis
```

### Reports
```bash
npm run report:duplicates # Generate duplicate report
npm run report:sync      # Generate sync status report
npm run report:quality   # Generate data quality report
```

## 🏗️ Architecture

```
cross-platform-ops/
├── core/
│   ├── connectors/          # Platform connectors
│   │   ├── salesforce-connector.js
│   │   └── hubspot-connector.js
│   ├── data-models/         # Data models
│   │   ├── unified-record.js
│   │   └── field-mapping.js
│   └── services/            # Core services
├── modules/
│   ├── record-mapper/       # Record mapping logic
│   ├── deduplication/       # Deduplication algorithms
│   ├── data-analysis/       # Analysis tools
│   └── merger/              # Merge operations
├── cli/                     # CLI tools
├── config/                  # Configuration files
└── mcp-server.js           # MCP server implementation
```

## 🔄 Data Flow

1. **Data Ingestion** → Fetch from Salesforce/HubSpot
2. **Transformation** → Convert to unified format
3. **Processing** → Apply operations (dedupe, map, analyze)
4. **Synchronization** → Push changes back to platforms
5. **Reporting** → Generate insights and reports

## 🎯 Use Cases

### 1. Initial Data Migration
```bash
# Analyze current data
xplat analyze -p salesforce -o contact

# Find and resolve duplicates
xplat dedupe -p salesforce --auto-merge

# Map fields
xplat map --auto-detect -s salesforce -t hubspot

# Sync to HubSpot
xplat sync -d sf-to-hs -o contact
```

### 2. Ongoing Synchronization
```bash
# Set up bidirectional sync
xplat sync -d bidirectional -o deal --conflict newer

# Monitor sync status
xplat analyze --metrics sync_status
```

### 3. Data Quality Management
```bash
# Regular quality checks
xplat analyze -p both --metrics quality completeness

# Find cross-platform duplicates
xplat dedupe --cross-platform

# Generate quality report
xplat analyze --export html
```

## 🧪 Testing

```bash
# Run all tests
npm test

# Watch mode
npm run test:watch

# Coverage report
npm run test:coverage
```

## 🔍 Deduplication Algorithms

### Supported Algorithms
- **Levenshtein Distance** - Character-level edit distance
- **Jaro-Winkler** - Optimized for short strings like names
- **Soundex** - Phonetic matching for similar-sounding names
- **Metaphone** - Advanced phonetic algorithm
- **Token Set** - Word-order independent matching

### Confidence Scoring
- High (>90%) - Automatic merge candidate
- Medium (70-90%) - Manual review recommended
- Low (<70%) - Likely different records

## 🔐 Security

- API keys stored in environment variables
- OAuth 2.0 for Salesforce authentication
- Rate limiting and retry logic
- Audit trail for all operations
- No hardcoded credentials

## 📈 Performance

- Batch processing for large datasets
- Intelligent caching
- Parallel processing where possible
- Rate limit compliance
- Progress tracking and resumable operations

## 🤝 Integration with Existing Tools

This suite leverages and extends existing tools from:
- `platforms/SFDC` - Salesforce-specific operations
- `platforms/HS` - HubSpot-specific operations
- Shared infrastructure components
- MCP server ecosystem

## 🚦 Status Indicators

- ✅ **Completed** - Core functionality implemented
- 🚧 **In Progress** - Data analysis and merger modules
- 📋 **Planned** - Advanced ML features, real-time webhooks

## 📝 License

MIT

## 🙏 Acknowledgments

Built on top of the RevPal Agent System infrastructure, leveraging existing Salesforce and HubSpot platform tools.

---

For more information, see the [detailed documentation](docs/) or run `xplat --help`.