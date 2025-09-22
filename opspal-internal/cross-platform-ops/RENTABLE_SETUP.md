# Rentable Production Environment Setup Guide

## 🚨 PRODUCTION ENVIRONMENT - LIVE DATA 🚨

This guide helps you connect the Cross-Platform Operations suite to Rentable's **PRODUCTION** environments for both Salesforce and HubSpot.

## Prerequisites

1. **Salesforce Production Access**
   - Username: `chrisacevedo@gorevpal.com`
   - Instance: `https://rentable.my.salesforce.com`

2. **HubSpot Production Access**
   - You'll need the Rentable HubSpot Production API key
   - You'll need the Rentable Portal ID

## Quick Setup (3 Steps)

### Step 1: Navigate to the cross-platform-ops directory
```bash
cd platforms/cross-platform-ops
```

### Step 2: Install dependencies (if not already done)
```bash
npm install
```

### Step 3: Connect to Rentable Production
```bash
npm run rentable:connect
```

This interactive script will:
- ✅ Verify your Salesforce production connection
- ✅ Prompt for HubSpot production API credentials
- ✅ Test both connections
- ✅ Set up production safeguards
- ✅ Create production-safe command shortcuts

## Available Commands

### Environment Management
```bash
# Switch to Rentable production environment
npm run rentable:switch

# Test current connections
npm run rentable:test

# Show current environment
npm run env:current
```

### Production-Safe Operations (with --dry-run by default)
```bash
# Analyze data quality (dry run, limited to 100 records)
npm run prod:analyze

# Preview duplicate detection (dry run, high threshold)
npm run prod:dedupe-preview

# Preview sync operations (dry run, limited to 10 records)
npm run prod:sync-preview

# Validate field mappings only (no changes)
npm run prod:validate
```

### Full Operations (USE WITH CAUTION in Production)
```bash
# Find duplicates across platforms
npm run xplat:dedupe -- --cross-platform --dry-run

# Sync specific records
npm run xplat:sync -- -d sf-to-hs --dry-run --ids ID1 ID2

# Analyze all data
npm run xplat:analyze -- -p both --dry-run

# Map fields between platforms
npm run xplat:map -- --auto-detect --validate
```

## Safety Features

### Automatic Protections in Production Mode:
- ✅ **Dry Run Default** - All operations preview changes first
- ✅ **Confirmation Required** - Must confirm before executing changes
- ✅ **Batch Size Limits** - Maximum 50 records per batch
- ✅ **No Auto-Merge** - Duplicates must be manually reviewed
- ✅ **Audit Trail** - All operations logged to `logs/rentable-production-audit.log`
- ✅ **Rollback Support** - Can undo merge operations

## Configuration Files

### Environment Configuration
- **Production Config**: `config/rentable-production-config.json`
- **Environment Variables**: `.env.rentable-production`
- **Active Connection**: `config/active-connection.json`

### Logs
- **Operation Logs**: `logs/rentable-production-xplat.log`
- **Audit Trail**: `logs/rentable-production-audit.log`

## Typical Workflow

### 1. Initial Analysis (Safe - Read Only)
```bash
# Check data quality
npm run prod:analyze

# Find potential duplicates
npm run prod:dedupe-preview

# Validate field mappings
npm run prod:validate
```

### 2. Test with Small Batch
```bash
# Test with 5 specific records
npm run xplat:sync -- --dry-run --ids REC001 REC002 REC003 REC004 REC005

# If dry run looks good, remove --dry-run (will prompt for confirmation)
npm run xplat:sync -- --ids REC001 REC002 REC003 REC004 REC005
```

### 3. Production Operations
```bash
# Always start with dry run
npm run xplat:dedupe -- --cross-platform --dry-run --threshold 0.95

# Review the output carefully
# If satisfied, run without --dry-run (will prompt for confirmation)
npm run xplat:dedupe -- --cross-platform --threshold 0.95
```

## Best Practices

### Before Any Operation:
1. **Backup Critical Data** - Export records before mass operations
2. **Test in Sandbox First** - If possible, test complex operations in sandbox
3. **Use High Thresholds** - For deduplication, use threshold ≥ 0.9
4. **Start Small** - Test with 5-10 records before larger batches
5. **Monitor Both Systems** - Check both SF and HS after operations

### During Operations:
1. **Always Use --dry-run First** - Preview all changes
2. **Review Logs** - Check operation logs before confirming
3. **Work in Small Batches** - Process 50-100 records at a time
4. **Document Changes** - Keep notes of what was changed

### After Operations:
1. **Verify in Both Systems** - Check records in SF and HS
2. **Review Audit Logs** - Ensure operations completed as expected
3. **Monitor for Issues** - Watch for sync errors or data issues
4. **Keep Rollback Ready** - Know how to undo changes if needed

## Troubleshooting

### Connection Issues

#### Salesforce Not Connected
```bash
# Login to Rentable Production
sf org login web --alias rentable-production --instance-url https://rentable.my.salesforce.com
```

#### HubSpot API Error
1. Check API key is correct
2. Verify Portal ID matches
3. Ensure API key has necessary scopes

### Rate Limiting
- **Salesforce**: 15,000 API calls/day
- **HubSpot**: 500,000 API calls/day, 100 calls/10 seconds

### Common Errors

1. **"Rate limit exceeded"** - Wait and retry with smaller batches
2. **"Authentication failed"** - Re-run `npm run rentable:connect`
3. **"Object not accessible"** - Check user permissions in both systems

## Support

### Logs Location
- Operation logs: `logs/rentable-production-xplat.log`
- Audit trail: `logs/rentable-production-audit.log`
- Error details: Check specific operation output

### Quick Checks
```bash
# Verify environment
npm run env:current

# Test connections
npm run rentable:test

# Check Salesforce connection
sf org display --target-org rentable-production

# View recent operations
tail -n 50 logs/rentable-production-audit.log
```

## Emergency Procedures

### To Stop an Operation
- Press `Ctrl+C` to interrupt
- Check logs for partial completion
- Use rollback if available

### To Rollback a Merge
```javascript
// Use the merge ID from the audit log
const merger = require('./modules/merger');
await merger.rollbackMerge('merge-id-from-log');
```

### To Disconnect from Production
```bash
# Switch to a safer environment
npm run env:switch rentable-sandbox

# Or clear the configuration
rm config/active-connection.json
```

---

⚠️ **REMEMBER**: You're working with PRODUCTION data. Always use caution, test thoroughly, and have a rollback plan.

For additional help, check the main [README](README.md) or the [Cross-Platform Operations documentation](docs/).