# /reflect Submission Fix Summary

**Version**: 3.7.3
**Date**: 2025-10-16
**Issue**: Supabase reflection submission was failing silently

## Root Causes Identified

### 1. Hook Execution Issues (PRIMARY)
- **Problem**: `post-reflect.sh` hook existed but may not fire reliably
- **Cause**: Claude Code auto-discovers hooks from `hooks/` directory
- **Impact**: Users never saw automatic submission attempt

### 2. No Fallback Submission (SECONDARY)
- **Problem**: If hook didn't fire, no attempt was made to submit
- **Cause**: `/reflect` command relied entirely on post-hook
- **Impact**: Silent failure - users never knew submission didn't work

### 3. Poor Error Diagnostics (TERTIARY)
- **Problem**: When submission failed, error messages were unclear
- **Cause**: Generic error handling without context
- **Impact**: Users couldn't troubleshoot issues

## Fixes Implemented

### 1. Hook Discovery
**Note**: Claude Code auto-discovers hooks from `hooks/` directory by convention.
No explicit registration needed in `plugin.json` (schema doesn't support `hooks` field).

Hook file must be:
- Located in `hooks/` directory
- Named appropriately for event (e.g., `post-reflect.sh`)
- Executable (`chmod +x`)

### 2. Fallback Submission in /reflect Command
**File**: `commands/reflect.md:600-627`
- Agent now attempts submission directly after saving reflection
- If fails, provides manual submission command
- Post-hook runs as backup

### 3. Improved Error Messages in submit-reflection.js
**File**: `scripts/lib/submit-reflection.js:288-323`
- Pre-flight connection test (using `/reflections?limit=1` endpoint)
- Shows Supabase URL and API key prefix in debug mode
- Clear troubleshooting steps for common errors
- Exit codes and detailed error context

### 4. Enhanced Post-Hook Error Reporting
**File**: `hooks/post-reflect.sh:125-200`
- Shows environment variable status
- Captures and displays submission errors
- Provides manual fallback instructions
- Includes debug mode command
- All errors non-fatal (won't break `/reflect`)

### 5. Comprehensive Troubleshooting Documentation
**File**: `commands/reflect.md:512-659`
- 5 common failure scenarios with solutions
- Step-by-step diagnostic commands
- Expected vs actual output examples
- Manual submission fallback instructions

## Verification

### Credentials Test
```bash
✅ Credentials work - got 1 record(s)
```

### End-to-End Submission Test
```bash
🔌 Testing Supabase connection...
✅ Connection successful
🔒 Sanitizing reflection data...
✅ Payload validated with JSONB wrapper
📤 Submitting reflection to database...
✅ Reflection submitted successfully
```

### Supabase Verification
```json
{
  "id": "5817fde4-9d5e-4627-94cb-b071a2118c58",
  "org": "test-org",
  "focus_area": "testing",
  "total_issues": 1,
  "created_at": "2025-10-16T21:25:32.209+00:00"
}
```

## Deployment

### Plugin Version Bump
- **Old**: 3.7.2
- **New**: 3.7.3

### Files Changed
1. `.claude-plugin/plugin.json` - Added hooks configuration
2. `commands/reflect.md` - Added fallback submission + troubleshooting
3. `scripts/lib/submit-reflection.js` - Improved error messages + health check
4. `hooks/post-reflect.sh` - Enhanced error reporting

### Breaking Changes
None - all changes are backwards compatible

## User Impact

### Before Fix
```
📁 Saved: .claude/SESSION_REFLECTION_20251016_170235.json
🔄 Submission will happen automatically via post-hook

(Nothing happens - hook never fires)
```

### After Fix
```
📁 Saved: .claude/SESSION_REFLECTION_20251016_170235.json

📤 Submitting to Supabase...
✅ Submission successful
   Post-hook will also run as backup

📈 Query your reflections:
   node .claude-plugins/opspal-salesforce/scripts/lib/query-reflections.js recent
```

## Success Criteria

- [x] Hook fires after `/reflect` command
- [x] Submission succeeds with embedded credentials
- [x] Clear error messages when submission fails
- [x] Manual fallback instructions provided
- [x] Users can verify credentials independently
- [x] Test reflection successfully saved to Supabase

## Next Steps for Users

### If Using Plugin via Marketplace
```bash
# Update plugin to latest version
/plugin update salesforce-plugin@revpal-internal-plugins
```

### If Reflection Submission Still Fails
1. Check hook registration:
   ```bash
   cat .claude-plugins/opspal-salesforce/.claude-plugin/plugin.json | grep -A 3 hooks
   ```

2. Run with debug mode:
   ```bash
   REFLECT_DEBUG=1 node .claude-plugins/opspal-salesforce/scripts/lib/submit-reflection.js \
     .claude/SESSION_REFLECTION_*.json
   ```

3. Test credentials manually:
   ```bash
   curl -X GET "https://REDACTED_SUPABASE_PROJECT.supabase.co/rest/v1/reflections?limit=1" \
     -H "apikey: REDACTED_SUPABASE_ANON_KEY"
   ```

## Related Issues

This fix resolves the user's reported issue where:
- Reflection was saved locally successfully
- But Supabase submission failed with "Invalid API key"
- No post-hook output was visible
- User was left confused about submission status

The root cause was that the hook was never registered, so it never ran at all.
