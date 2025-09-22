# Contact Hygiene Pipeline

A unified, production-grade Salesforce contact data quality pipeline with advanced duplicate detection, classification rules, and safe bulk operations.

## Features

- **Unified Logic**: Single source of truth for scoring, classification, and duplicate detection
- **Graph-Based Duplicate Detection**: Union-find algorithm with edge confidence tracking
- **Safe Operations**: Dry-run mode, automatic snapshots, rollback support
- **Production Ready**: Retry logic, partial failure handling, detailed telemetry
- **Bulk API 2.0**: Optimized for large datasets (250k+ contacts)
- **Idempotent**: Skips already-classified contacts automatically

## Quick Start

### Installation

```bash
# Install dependencies
npm install

# Run tests
npm test

# Check environment
node bin/contact-hygiene.js --help
```

### Basic Usage

```bash
# Dry run on all contacts
node bin/contact-hygiene.js --mode all --dry-run

# Process only unprocessed contacts
node bin/contact-hygiene.js --mode unprocessed

# Full production run
node bin/contact-hygiene.js --mode all --batch-size 10000 --max-wait-sec 180

# Using npm scripts
npm run hygiene:dry      # Dry run
npm run hygiene:all      # Process all contacts
npm run hygiene:test     # Run tests
```

## Classification Rules

### 1. Deletion Rules (Clean_Status__c = 'Delete')
- **No Contact Info**: No email, phone, or mobile phone
- **Test Records**: Names/emails containing test, demo, fake, example
- **Invalid Domains**: noreply, no-reply, donotreply, spam, junk domains
- **No Activity 3+ Years**: Created 3+ years ago with no activity ever
- **Inactive 3+ Years**: Last activity was 3+ years ago

### 2. Archive Rules (Clean_Status__c = 'Archive')
- **Old Inactive**: Created 5+ years ago AND (no activity OR last activity 2+ years ago)

### 3. Duplicate Rules (Clean_Status__c = 'Duplicate' or 'Review')
- **High Confidence** (Duplicate): Matched by email or phone
- **Low Confidence** (Review): Matched only by name+company

### 4. Review Rules (Clean_Status__c = 'Review')
- **Missing Critical Info**: No LastName OR (no email AND no phone)
- **Email Issues**: Opted out or bounced emails
- **Potential Duplicates**: Low-confidence duplicate matches

### 5. OK Status (Clean_Status__c = 'OK')
- Contacts that don't match any other rules

## Scoring System

Standardized scoring used for duplicate master selection:

| Field | Points |
|-------|--------|
| Email | +10 |
| Phone | +8 |
| MobilePhone | +5 |
| FirstName | +3 |
| LastName | +3 |
| AccountId | +5 |
| Title | +2 |
| Department | +2 |
| MailingCity | +1 |
| MailingState | +1 |
| LastActivityDate (present) | +10 |
| HubSpot_Contact_ID__c | +5 |

**Tie-Breaking Order**:
1. Higher score wins
2. Newer LastModifiedDate wins
3. Older CreatedDate wins
4. Alphabetical ID (deterministic)

## Command Line Options

```
Options:
  --mode <all|unprocessed>   Process all contacts or only unprocessed (default: all)
  --dry-run                  Generate outputs without making changes
  --batch-size <number>      Batch size for bulk operations (default: 10000)
  --max-wait-sec <number>    Max wait time for bulk jobs (default: 180)
  --output-dir <path>        Output directory for reports (default: ./reports/contact-hygiene)
  --org <alias>              Salesforce org alias (default: rentable-production)
  --query-limit <number>     Records per SOQL query (default: 2000)
  --verbose                  Enable verbose logging
  --help                     Show help message
```

## Environment Variables

```bash
export ORG_ALIAS=production           # Default Salesforce org
export BATCH_SIZE=10000              # Default batch size
export MAX_WAIT_SEC=300              # Max wait for bulk jobs
export OUTPUT_DIR=./reports          # Output directory
```

## Output Files

Each run creates a timestamped directory with:

```
reports/contact-hygiene/run-2024-01-15T10-30-00-000Z/
├── snapshot-prechange.csv        # Rollback snapshot
├── batch-1.csv                   # Update batches
├── batch-1-failures.csv         # Failed records
├── batch-1-rerun.csv            # Auto-fixed rerun file
├── summary.json                 # Detailed statistics
└── summary.txt                  # Human-readable summary
```

## Rollback Procedure

### Automatic Snapshot

Before any changes, the system automatically exports current state:

```bash
# Snapshot location
reports/contact-hygiene/run-*/snapshot-prechange.csv
```

### Manual Rollback

If rollback is needed:

```bash
# 1. Locate the snapshot file
SNAPSHOT=$(ls -t reports/contact-hygiene/*/snapshot-prechange.csv | head -1)

# 2. Restore using Salesforce CLI
sf data upsert bulk \
  --sobject Contact \
  --file "$SNAPSHOT" \
  --external-id Id \
  --target-org production \
  --wait 180
```

### Rollback Specific Batch

```bash
# Revert a specific batch
sf data upsert bulk \
  --sobject Contact \
  --file "reports/contact-hygiene/run-*/batch-2-original.csv" \
  --external-id Id \
  --target-org production
```

## Field Safety

### Fields We Update
- `Clean_Status__c` - Classification status
- `Delete_Reason__c` - Reason for deletion/review
- `Is_Duplicate__c` - Boolean duplicate flag
- `Master_Contact_Id__c` - ID of master record
- `Duplicate_Type__c` - Type of duplicate match
- `Sync_Status__c` - Per policy (see below)

### Fields We NEVER Update
- `Description` - Never overwritten
- Any standard Salesforce system fields
- Custom fields not listed above

### Sync_Status__c Policy
- Set to 'Not Synced' for: Delete, Duplicate, Review statuses
- Preserved as-is for: OK, Archive statuses
- Invalid values default to 'Not Synced'

## Performance Optimization

### Batch Processing
- Default: 10,000 records per batch
- Bulk API 2.0 for optimal performance
- Automatic retry on failures
- Parallel batch submission available

### Memory Management
- Stream processing for large datasets
- 2,000 records per SOQL query
- Efficient in-memory duplicate detection
- Graph components computed incrementally

### Expected Performance
- ~250,000 contacts in 10-15 minutes
- ~28,000 records/minute processing
- 87-95% first-pass success rate

## Testing

### Run Unit Tests
```bash
npm test
# or
mocha test/contactHygiene.test.js
```

### Test Coverage
```bash
npm run test:coverage
```

### Integration Test
```bash
# Test with small dataset
node bin/contact-hygiene.js \
  --mode all \
  --dry-run \
  --query-limit 100
```

## Monitoring

### Real-Time Progress
- Progress indicators during processing
- Batch completion notifications
- Error reporting with context

### Summary Reports
- Classification breakdown
- Delete reason analysis
- Duplicate component samples
- Batch success/failure rates
- Execution time metrics

## Troubleshooting

### Common Issues

#### 1. Picklist Value Errors
```
Error: Invalid picklist value 'Duplicate' for Clean_Status__c
```
**Solution**: Activate picklist value in Salesforce Setup > Object Manager > Contact > Fields

#### 2. Permission Errors
```
Error: Insufficient access rights on object Contact
```
**Solution**: Ensure user has Modify All permission on Contact object

#### 3. Memory Issues
```
Error: JavaScript heap out of memory
```
**Solution**: Reduce batch size or query limit
```bash
node --max-old-space-size=4096 bin/contact-hygiene.js --batch-size 5000
```

#### 4. Bulk API Limits
```
Error: Bulk API limit exceeded
```
**Solution**: Wait for limit reset or reduce batch size

### Debug Mode
```bash
# Enable verbose logging
node bin/contact-hygiene.js --verbose --mode all --dry-run

# Check failed records
cat reports/contact-hygiene/run-*/batch-*-failures.csv

# Review rerun files
cat reports/contact-hygiene/run-*/batch-*-rerun.csv
```

## Architecture

### Core Library (`lib/contactHygiene.js`)
- `scoreContact()` - Standardized scoring algorithm
- `buildDuplicateGraph()` - Union-find duplicate detection
- `selectMaster()` - Deterministic master selection
- `classifyContact()` - Rule-based classification
- `normalizePhone()` - Phone number normalization
- `normalizeEmail()` - Email normalization
- `validatePicklistValues()` - Picklist validation

### CLI Application (`bin/contact-hygiene.js`)
- Command-line argument parsing
- Salesforce org connection
- Batch processing orchestration
- Bulk API operations
- Report generation

### Test Suite (`test/contactHygiene.test.js`)
- Unit tests for all core functions
- Edge case coverage
- Integration test fixtures

## Best Practices

### Before Production Run
1. ✅ Run pre-flight validation
2. ✅ Test with 100-record dry run
3. ✅ Check org API limits
4. ✅ Verify field configurations
5. ✅ Document current state

### During Execution
1. 📊 Monitor progress indicators
2. 🔍 Check error logs if failures occur
3. 💾 Keep snapshot location noted
4. ⏱️ Allow sufficient time for completion

### After Completion
1. 📈 Review summary reports
2. ✅ Verify classification counts
3. 🔄 Process any failure reruns
4. 📝 Document any manual fixes
5. 🗃️ Archive run artifacts

## CI/CD Integration

### GitHub Action (example)
```yaml
name: Contact Hygiene
on:
  schedule:
    - cron: '0 2 * * SUN'  # Weekly Sunday 2 AM
  workflow_dispatch:

jobs:
  hygiene:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm install
      - run: npm test
      - run: npm run hygiene:dry
      - run: npm run hygiene:unprocessed
```

## Support

### Documentation
- API Reference: `lib/contactHygiene.js`
- CLI Usage: `bin/contact-hygiene.js --help`
- Test Examples: `test/contactHygiene.test.js`

### Maintenance
- Regular dependency updates
- Quarterly rule reviews
- Performance optimization
- Test coverage expansion

## License

MIT - See LICENSE file for details

---

**Version**: 1.0.0
**Last Updated**: 2024-01-15
**Maintained By**: RevPal Engineering Team