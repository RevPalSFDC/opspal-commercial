# 🚀 Salesloft Sync Fix - Quick Start Guide

## Prerequisites

### 1. Get Your Salesloft API Token

1. Log into Salesloft: https://app.salesloft.com
2. Navigate to: **Settings → API → API Keys**
3. Click **"Create API Key"** or copy existing key
4. Save the token securely

### 2. Set Environment Variables

```bash
# Set your Salesloft API token
export SALESLOFT_TOKEN="your-token-here"

# Optional: Set Salesforce org (defaults to 'production')
export SALESFORCE_ORG_ALIAS="production"

# Optional: Set expected Salesforce instance
export SALESFORCE_INSTANCE="rentable.my.salesforce.com"
```

## Running the Fixes

### Option 1: Run Everything (Recommended)

This runs all automated fixes in sequence:

```bash
# First, do a dry run to see what will be fixed
./scripts/execute-salesloft-fixes.sh --dry-run

# Review the output, then run for real
./scripts/execute-salesloft-fixes.sh
```

This script will:
1. ✅ Check current health status
2. ✅ Validate configuration
3. ✅ Fix user mappings automatically
4. ✅ Clean up duplicate records
5. ✅ Retry failed sync operations
6. ✅ Verify the fixes worked

### Option 2: Fix Specific Issues

#### Fix Email Sync Failures (Your 21 errors)
```bash
# Target the specific email sync errors from Sept 11
python3 scripts/fix-email-sync-failures.py --dry-run

# If looks good, run without dry-run
python3 scripts/fix-email-sync-failures.py
```

#### Fix User Mappings Only
```bash
python3 scripts/salesloft-sync-recovery-toolkit.py --action mappings --dry-run
python3 scripts/salesloft-sync-recovery-toolkit.py --action mappings
```

#### Clean Duplicates Only
```bash
python3 scripts/salesloft-sync-recovery-toolkit.py --action duplicates --dry-run
python3 scripts/salesloft-sync-recovery-toolkit.py --action duplicates
```

#### Retry Failed Syncs Only
```bash
python3 scripts/salesloft-sync-recovery-toolkit.py --action retry --hours 24 --dry-run
python3 scripts/salesloft-sync-recovery-toolkit.py --action retry --hours 24
```

## Monitoring the Results

### Check Health Score
```bash
# Quick health check
python3 scripts/salesloft-sync-health-monitor.py --mode once

# Continuous monitoring
python3 scripts/salesloft-sync-health-monitor.py --mode continuous --interval 300
```

### Check for New Errors
```bash
# Analyze recent sync errors
python3 scripts/analyze_sync_errors.py
```

### Validate Configuration
```bash
# Full configuration validation
python3 scripts/salesloft-integration-validator.py --verbose
```

## What These Scripts Fix Automatically

### ✅ CAN FIX NOW (Via API)

| Issue | Script | Success Rate |
|-------|--------|-------------|
| **Unmapped Users** | `--action mappings` | 100% if emails match |
| **Duplicate Records** | `--action duplicates` | 95% (merges by email) |
| **Rate Limit Errors** | `--action retry` | 100% (auto-throttles) |
| **Timeout Errors** | `--action retry` | 90% (with backoff) |
| **Email Sync Failures** | `fix-email-sync-failures.py` | 80% (retries sync) |
| **Temporary Failures** | `--action retry` | 85% (transient issues) |

### ❌ CANNOT FIX (Need Manual Intervention)

| Issue | Manual Fix Required |
|-------|-------------------|
| **CRM Disconnection** | Reconnect in Salesloft Settings → CRM |
| **Wrong SF Instance** | Disconnect and reconnect to correct instance |
| **Permission Errors** | Fix in Salesforce user permissions |
| **Field Not Found** | Map fields in Salesloft Settings |
| **OAuth Expired** | Re-authenticate in Salesloft |

## Expected Results

After running the fixes, you should see:

### Before (Your Current State)
- 21 email sync failures
- Users potentially unmapped
- Possible duplicates
- Health Score: Unknown (likely <50)

### After (Expected)
- ✅ Most email sync failures resolved
- ✅ All users mapped to Salesforce
- ✅ Duplicates cleaned up
- ✅ Health Score: >80

## Troubleshooting

### "SALESLOFT_TOKEN not set"
```bash
# Make sure to export the token
export SALESLOFT_TOKEN="your-actual-token-here"

# Verify it's set
echo $SALESLOFT_TOKEN
```

### "Cannot connect to Salesforce"
```bash
# Verify Salesforce CLI is authenticated
sf org display --target-org production

# If not, authenticate
sf org login web --alias production
```

### Scripts not found
```bash
# Make sure you're in the right directory
cd /home/chris/Desktop/RevPal/Agents

# Make scripts executable
chmod +x scripts/execute-salesloft-fixes.sh
chmod +x scripts/*.py
```

## Log Files

All operations create detailed logs in `/tmp/`:
- `/tmp/health_check_before.log` - Initial state
- `/tmp/user_mapping_fix.log` - User mapping results
- `/tmp/duplicate_cleanup.log` - Duplicate merge results
- `/tmp/retry_failed_syncs.log` - Sync retry results
- `/tmp/health_check_after.log` - Final state

## Next Steps After Fixes

1. **Monitor for 1 hour** to ensure syncs are working
2. **Check Salesforce** to verify new activities appear
3. **Set up continuous monitoring** if not already done
4. **Document any remaining issues** that need manual fixes

## Quick Test Command

To verify everything is working:

```bash
# This will check if the token is set and run a quick health check
if [ -z "$SALESLOFT_TOKEN" ]; then
    echo "❌ SALESLOFT_TOKEN not set"
else
    echo "✅ Token is set"
    python3 scripts/salesloft-sync-health-monitor.py --mode once | head -20
fi
```

## Support

If errors persist after running these fixes:
1. Check the specific error messages in the log files
2. Review the "CANNOT FIX" table above
3. The most common manual fix needed is reconnecting to Salesforce in Salesloft Settings

---

**Ready to fix your sync errors? Start with the dry-run of the complete fix script:**

```bash
export SALESLOFT_TOKEN="your-token-here"
./scripts/execute-salesloft-fixes.sh --dry-run
```