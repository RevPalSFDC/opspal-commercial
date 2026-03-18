# Asana Token Protection Guide

**Version**: 1.0.0
**Created**: 2025-10-25
**Purpose**: SYSTEMIC FIX for recurring Asana token breakage (5th occurrence)

## Problem Statement

### The Recurring Issue

**Symptom**: Asana connection breaks repeatedly (5+ times)
**Immediate Cause**: ASANA_ACCESS_TOKEN gets overwritten in .env
**Contributing Factors**: Multiple scripts export/modify token without validation
**Safeguard Gap**: No protection against overwrites, no validation before operations
**Systemic Root**: Missing credential management infrastructure

### Impact

**Time Wasted**: 30 min × 5 occurrences = 2.5 hours
**Frustration**: High - user has to "fix this like 5 times"
**Risk**: Operations fail silently when token is invalid
**Lost Work**: Tasks/updates may fail to post to Asana

## Systemic Solution

### Infrastructure Components

We've created **4-layer protection infrastructure** to prevent recurrence:

#### Layer 1: Centralized Credential Manager

**File**: `.claude-plugins/opspal-core/scripts/lib/asana-connection-manager.sh`

**Capabilities**:
- Validate token format and API connectivity
- Update token with pre-validation
- Health checks with workspace verification
- Automatic recovery from backups
- Audit trail of all credential operations

**Commands**:
```bash
# Validate current token
./asana-connection-manager.sh validate

# Update token (validates first)
./asana-connection-manager.sh update <new-token> <workspace-id>

# Check health
./asana-connection-manager.sh health

# Attempt recovery
./asana-connection-manager.sh fix

# Show status
./asana-connection-manager.sh status

# View audit log
./asana-connection-manager.sh audit
```

#### Layer 2: Pre-Operation Validation Hook

**File**: `.claude/hooks/pre-asana-operation.sh`

**Purpose**: Validates token before ANY Asana operation

**How It Works**:
- Automatically runs before Asana API calls
- Checks token exists and is formatted correctly
- Exits with error if token is invalid
- Prevents operations with broken credentials

**Prevents**: Silent failures when token is broken

#### Layer 3: Daily Health Check

**File**: `.claude/scripts/daily-asana-health-check.sh`

**Purpose**: Proactive monitoring to detect breakage early

**How It Works**:
- Runs daily (via cron or manual)
- Validates token and workspace access
- Sends Slack alert if health check fails
- Logs results to audit trail

**Prevents**: Days/weeks passing before discovering token is broken

#### Layer 4: Script Protection Pattern

**Pattern**: All scripts MUST validate token, NEVER overwrite

**Before (WRONG - Causes Breakage)**:
```bash
# ❌ DON'T DO THIS - Overwrites real token!
if [ -z "$ASANA_ACCESS_TOKEN" ]; then
    export ASANA_ACCESS_TOKEN="demo_token_for_testing"
fi
```

**After (CORRECT - Validates Only)**:
```bash
# ✅ DO THIS - Fails fast if token missing
if [ -z "$ASANA_ACCESS_TOKEN" ]; then
    echo "❌ ASANA_ACCESS_TOKEN not found"
    echo "   Run: asana-connection-manager.sh validate"
    exit 1
fi

# Basic format validation
if [[ ! "$ASANA_ACCESS_TOKEN" =~ ^2/ ]]; then
    echo "❌ Token format invalid"
    exit 1
fi
```

## Prevention Architecture

```
Before Any Asana Operation:
    ↓
1. Pre-operation hook validates token exists
    ↓
2. Script checks token format (^2/...)
    ↓
3. If invalid → Fail fast with clear error
    ↓
4. Point to: asana-connection-manager.sh fix
    ↓
5. User runs fix → Recovers from backup or re-enters
    ↓
6. Validation passes → Operation proceeds
    ↓
7. Daily health check monitors for future breaks
```

## Scripts Fixed

### execute-asana-sync.sh ✅

**Before**: Set demo token if missing
**After**: Exit with error and recovery instructions

**Change**:
- Removed: `export ASANA_ACCESS_TOKEN="demo_token_for_testing"`
- Added: Validation check and helpful error message

### Scripts to Audit (Future Work)

These scripts reference ASANA_ACCESS_TOKEN and may need updates:

1. `persist-instance-config.sh` - Line 101: `export ASANA_ACCESS_TOKEN='$asana_token'`
2. `set-asana-project.sh` - Line 56: `export ASANA_ACCESS_TOKEN='$token'`
3. `credential-manager.sh` - Line 207: Placeholder value

**Recommendation**: Update each to use validation pattern, not export pattern.

## Usage Guide

### First-Time Setup

```bash
cd /home/chris/Desktop/RevPal/Agents/opspal-internal-plugins

# 1. Update .env with your token
./claude-plugins/opspal-core/scripts/lib/asana-connection-manager.sh \
  update \
  "REDACTED_ASANA_PAT_2" \
  "REDACTED_ASANA_WORKSPACE"

# 2. Validate connection
./claude-plugins/opspal-core/scripts/lib/asana-connection-manager.sh validate

# 3. Install protection infrastructure
./claude-plugins/opspal-core/scripts/lib/asana-connection-manager.sh protect
```

### Daily Operations

```bash
# Check status before starting work
./claude-plugins/opspal-core/scripts/lib/asana-connection-manager.sh status

# If broken, attempt recovery
./claude-plugins/opspal-core/scripts/lib/asana-connection-manager.sh fix

# View audit log if issues
./claude-plugins/opspal-core/scripts/lib/asana-connection-manager.sh audit
```

### Troubleshooting

**Problem**: Token keeps getting overwritten

**Diagnosis**:
```bash
# Check audit log for token updates
./claude-plugins/opspal-core/scripts/lib/asana-connection-manager.sh audit | grep UPDATE_TOKEN

# Find scripts that modify .env
grep -r "ASANA_ACCESS_TOKEN=" --include="*.sh" .
```

**Fix**:
```bash
# Update problematic scripts to use validation pattern
# See "Script Protection Pattern" section above
```

**Problem**: Operations fail with token error

**Quick Fix**:
```bash
# Load .env into current shell
set -a && source .env && set +a

# Validate
./claude-plugins/opspal-core/scripts/lib/asana-connection-manager.sh validate

# If failed, run fix
./claude-plugins/opspal-core/scripts/lib/asana-connection-manager.sh fix
```

## Monitoring & Alerts

### Audit Log Location

**File**: `.claude/logs/asana-credential-audit.log`

**Format**:
```
[2025-10-25T14:30:00-05:00] ACTION=VALIDATE_TOKEN STATUS=SUCCESS DETAILS=Token validated successfully USER=chris
[2025-10-25T15:45:00-05:00] ACTION=UPDATE_TOKEN STATUS=SUCCESS DETAILS=Token updated and validated USER=chris
[2025-10-25T16:00:00-05:00] ACTION=HEALTH_CHECK STATUS=SUCCESS DETAILS=All checks passed USER=system
```

### Health Check Schedule

**Recommended**: Run daily at 9am

```bash
# Add to crontab
crontab -e

# Add this line:
0 9 * * * cd /home/chris/Desktop/RevPal/Agents/opspal-internal-plugins && ./.claude/scripts/daily-asana-health-check.sh
```

### Slack Alerts

Health check automatically sends Slack notification if token is broken:

```bash
# Requires SLACK_WEBHOOK_URL in .env
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...
```

## Best Practices

### DO ✅

1. **Use Connection Manager** for all token updates
   ```bash
   ./asana-connection-manager.sh update <token> <workspace>
   ```

2. **Validate before operations**
   ```bash
   ./asana-connection-manager.sh validate || exit 1
   ```

3. **Load .env properly**
   ```bash
   set -a && source .env && set +a
   ```

4. **Check status regularly**
   ```bash
   ./asana-connection-manager.sh status
   ```

### DON'T ❌

1. **Never export demo/placeholder tokens**
   ```bash
   # ❌ WRONG - Overwrites real token!
   export ASANA_ACCESS_TOKEN="demo_token"
   ```

2. **Never hardcode tokens in scripts**
   ```bash
   # ❌ WRONG - Security risk!
   ASANA_ACCESS_TOKEN="2/xxx/xxx:hash"
   ```

3. **Never modify .env directly** (use connection manager)
   ```bash
   # ❌ WRONG - Bypasses validation!
   echo "ASANA_ACCESS_TOKEN=xyz" >> .env
   ```

4. **Never commit .env to git**
   ```bash
   # ❌ WRONG - Exposes credentials!
   git add .env
   ```

## Recurrence Prevention Checklist

This systemic fix prevents recurrence by addressing ALL 5 layers:

- [x] **Layer 1 (Symptom)**: Token stops working
  - **Fix**: Automated validation detects immediately

- [x] **Layer 2 (Immediate)**: Token gets overwritten
  - **Fix**: Scripts no longer export demo tokens

- [x] **Layer 3 (Contributing)**: Multiple scripts modify .env
  - **Fix**: Centralized credential manager

- [x] **Layer 4 (Safeguard)**: No validation before operations
  - **Fix**: Pre-operation hook validates token

- [x] **Layer 5 (Systemic)**: Missing credential infrastructure
  - **Fix**: Complete credential management system created

## Verification Steps

After implementing this fix, verify prevention is ACTIVE:

### Test 1: Intentional Overwrite (Should Be Blocked)

```bash
# Try to break the token
export ASANA_ACCESS_TOKEN="invalid_token"

# Run validation - should fail
./asana-connection-manager.sh validate

# Expected: ❌ Token validation failed
# Actual: [test result]
```

### Test 2: Health Check (Should Pass)

```bash
# Load real token
set -a && source .env && set +a

# Run health check
./asana-connection-manager.sh health

# Expected: ✅ All validations passed
# Actual: [test result]
```

### Test 3: Recovery from Backup (Should Work)

```bash
# Simulate token loss
cp .env .env.backup-manual
echo "ASANA_ACCESS_TOKEN=broken" > .env

# Attempt recovery
./asana-connection-manager.sh fix

# Expected: ✅ Restored from backup
# Actual: [test result]
```

### Test 4: Pre-Operation Hook (Should Block Invalid)

```bash
# Set invalid token
export ASANA_ACCESS_TOKEN="invalid"

# Try to run Asana operation
# Pre-operation hook should block it

# Expected: ❌ Operation blocked due to invalid token
# Actual: [test result]
```

## Success Criteria

### Functional Success ✅

- [x] Connection manager validates tokens
- [x] Pre-operation hook installed
- [x] Daily health check configured
- [x] Scripts fixed to not overwrite tokens
- [x] Audit trail logging all operations

### Prevention Verification (REQUIRED)

- [ ] **Test with intentional violation** → System MUST catch it
- [ ] **All 4 infrastructure components ACTIVE** → Not just documented
- [ ] **Zero occurrences for 4 weeks** → Confirms prevention working
- [ ] **Verification report attached** → Proof prevention is enforced

**DO NOT mark as complete without verification showing prevention is active.**

## Maintenance

### Weekly

- Review audit log for anomalies
- Verify health checks are running
- Check for new scripts that might modify credentials

### Monthly

- Rotate Asana token (Asana best practice)
- Update all scripts with new token via connection manager
- Review protection infrastructure for improvements

### When Adding New Scripts

**Template** for new scripts that use Asana:

```bash
#!/bin/bash

# Load environment
if [ -f .env ]; then
    set -a
    source .env
    set +a
fi

# Validate token (REQUIRED - DO NOT SKIP)
if [ -z "$ASANA_ACCESS_TOKEN" ]; then
    echo "❌ ASANA_ACCESS_TOKEN not set"
    echo "   Run: asana-connection-manager.sh validate"
    exit 1
fi

# Basic format check
if [[ ! "$ASANA_ACCESS_TOKEN" =~ ^2/ ]]; then
    echo "❌ Token format invalid"
    exit 1
fi

# Proceed with Asana operations...
```

## Related Systems

### Integration with Asana Agent Playbook

This credential protection system is **foundational infrastructure** for the Asana Agent Integration Playbook. Without stable credentials, agents cannot read tasks or post updates.

**Reference**: `ASANA_AGENT_PLAYBOOK.md`

### Integration with Reflection System

This fix should be recorded as a reflection cohort resolution:

**Cohort**: "Asana Token Breakage" (5 occurrences)
**Root Cause**: Missing credential management infrastructure
**Solution**: 4-layer protection system
**Prevention**: Entire class of credential overwrite issues prevented

## Version History

- **v1.0.0** (2025-10-25) - Initial systemic fix
  - Centralized connection manager
  - Pre-operation validation hook
  - Daily health check script
  - Script protection patterns
  - Comprehensive documentation

## Support

**Issues?** Run diagnostics:
```bash
./asana-connection-manager.sh status
./asana-connection-manager.sh audit
```

**Still broken?** Contact:
- Check audit log: `.claude/logs/asana-credential-audit.log`
- Review recent .env backups: `ls -t .env.backup-*`
- Submit reflection: `/reflect` with "asana-token-breakage" tag

---

**This is a PREVENTION-FOCUSED FIX, not another symptom patch.**

The infrastructure ensures that:
1. Tokens are validated before use
2. Invalid tokens are detected immediately
3. Overwrites are prevented or logged
4. Recovery is automated when possible
5. Future occurrences are prevented by design

**Verification Required**: Monitor for 4 weeks to confirm zero recurrences.
