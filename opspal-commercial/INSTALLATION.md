# Installation Guide - Prevention System

**Version**: 1.0.0
**Date**: 2025-11-10

---

## Quick Start (Recommended)

### Automatic Setup

Run the setup script to automatically register hooks:

```bash
bash .claude-plugins/opspal-core/scripts/setup-prevention-system.sh
```

This script will:
- ✅ Register prevention hooks in `.claude/settings.json`
- ✅ Verify all required files exist
- ✅ Optionally create `.env` from template
- ✅ Check dependencies (jq)

**Setup time**: < 1 minute

---

## Manual Setup (Alternative)

If you prefer manual setup or the script fails:

### 1. Check Dependencies

The prevention system requires `jq` for JSON processing:

```bash
# Check if installed
which jq

# Install if needed
# macOS:
brew install jq

# Linux:
sudo apt-get install jq

# Windows:
choco install jq
```

### 2. Register Hooks

Add to `.claude/settings.json`:

```json
{
  "hooks": {
    "UserPromptSubmit": {
      "command": "bash ${CLAUDE_PLUGIN_ROOT}/.claude-plugins/opspal-core/hooks/master-prompt-handler.sh",
      "timeout": 10000,
      "description": "Master prompt handler - chains Prevention System (Phases 1-3) with Sub-Agent Utilization Booster"
    },
    "SessionStart": {
      "command": "bash -c '${CLAUDE_PLUGIN_ROOT}/.claude-plugins/opspal-salesforce/hooks/session-start-agent-reminder.sh && ${CLAUDE_PLUGIN_ROOT}/.claude-plugins/opspal-core/hooks/session-context-loader.sh'",
      "timeout": 5000,
      "description": "Session initialization - loads cross-session context (Phase 3.3)"
    }
  }
}
```

### 3. Configuration (Optional)

Copy environment template:

```bash
cp .env.example .env
```

All variables are optional - the system works with defaults.

---

## Verification

Test the installation:

### 1. Check Hooks Registered

```bash
cat .claude/settings.json | jq '.hooks | keys'
# Should show: ["UserPromptSubmit", "SessionStart"]
```

### 2. Test Hook Execution

```bash
echo '{"message":"Update all Opportunity fields"}' | \
  bash .claude-plugins/opspal-core/hooks/master-prompt-handler.sh
# Should output JSON with systemMessage
```

### 3. Start Claude Code Session

Start a new session and look for:
```
📋 Session Context Available
```

If you see this, the SessionStart hook is working.

---

## What Gets Installed

### Hooks (Automatic)
- **UserPromptSubmit** - Runs before each user request
  - Prevention system checks (safety validation)
  - Sub-agent utilization boost (delegation guidance)

- **SessionStart** - Runs at session start
  - Loads cross-session context
  - Displays available contexts

### Libraries (Already Included)
- 12 prevention libraries (6,000+ lines)
- Operation registry for idempotency
- Session context manager
- Error recovery system
- Cohort fix planner

### Documentation (Already Included)
- `PREVENTION_SYSTEM_GUIDE.md` - Complete user guide
- `.env.example` - Configuration template
- `COHORT_FIX_PLANNER_INTEGRATION.md` - Integration notes

---

## Configuration Options

### Master Controls

```bash
# Master enable/disable
MASTER_HOOK_ENABLED=1                # Enable master prompt handler (default: 1)
PREVENTION_SYSTEM_ENABLED=1          # Enable prevention hooks (default: 1)
SUBAGENT_BOOST_ENABLED=1             # Enable sub-agent boost (default: 1)
PREVENTION_SYSTEM_VERBOSE=0          # Verbose output (default: 0)
```

### Phase 1: Immediate Prevention

```bash
ROUTING_CLARITY_ENABLED=1            # Routing explanations (default: 1)
ROUTING_CLARITY_VERBOSE=0            # Detailed analysis (default: 0)

ENV_VALIDATION_ENABLED=1             # Environment validation (default: 1)
ENV_VALIDATION_STRICT=0              # Block on failure (default: 0)

EDIT_VERIFICATION_ENABLED=1          # Edit verification (default: 1)
EDIT_VERIFICATION_BLOCK_ON_FAIL=1    # Block until verified (default: 1)
EDIT_VERIFICATION_THRESHOLD=0.9      # 90% completion minimum (default: 0.9)
```

### Phase 2: Process Prevention

```bash
IDEMPOTENCY_CHECK_ENABLED=1          # Duplicate detection (default: 1)
IDEMPOTENCY_CHECK_STRICT=0           # Block concurrent ops (default: 0)
IDEMPOTENCY_AUTO_CLEANUP=1           # Auto-cleanup stale (default: 1)

PLAN_VALIDATION_ENABLED=1            # Scope validation (default: 1)
PLAN_VALIDATION_STRICT=0             # Block on any risk (default: 0)
PLAN_AUTO_ANALYZE=1                  # Auto-analyze requests (default: 1)

AGENT_RECOMMENDATION_ENABLED=1       # Agent recommendations (default: 1)
AGENT_RECOMMENDATION_VERBOSE=0       # Full analysis (default: 0)
```

### Phase 3: Strategic Improvements

```bash
ERROR_RECOVERY_ENABLED=1             # State snapshots (default: 1)
ERROR_RECOVERY_AUTO_ROLLBACK=1       # Auto-rollback on failure (default: 1)
ERROR_RECOVERY_VERBOSE=0             # Snapshot details (default: 0)

SESSION_CONTEXT_ENABLED=1            # Context loading (default: 1)
SESSION_CONTEXT_AUTO_DISPLAY=1       # Auto-display at start (default: 1)
SESSION_CONTEXT_TTL_DAYS=7           # 7-day TTL (default: 7)
```

### Quick Profiles

**Development** (verbose, permissive):
```bash
PREVENTION_SYSTEM_VERBOSE=1
ROUTING_CLARITY_VERBOSE=1
ENV_VALIDATION_STRICT=0
PLAN_VALIDATION_STRICT=0
```

**Production** (strict, minimal output):
```bash
ENV_VALIDATION_STRICT=1
PLAN_VALIDATION_STRICT=1
IDEMPOTENCY_CHECK_STRICT=1
```

**Testing** (everything enabled, very verbose):
```bash
PREVENTION_SYSTEM_VERBOSE=1
ROUTING_CLARITY_VERBOSE=1
AGENT_RECOMMENDATION_VERBOSE=1
ERROR_RECOVERY_VERBOSE=1
DEBUG_ROUTING=1
DEBUG_IDEMPOTENCY=1
```

---

## Troubleshooting

### Hooks Not Running

**Symptom**: No prevention messages appear

**Fix**:
```bash
# Check hooks registered
cat .claude/settings.json | jq '.hooks | keys'

# Verify hooks executable
ls -la .claude-plugins/opspal-core/hooks/*.sh

# Check master hook exists
test -f .claude-plugins/opspal-core/hooks/master-prompt-handler.sh && echo "Found"
```

### jq Not Installed

**Symptom**: "jq: command not found" error

**Fix**:
```bash
# Install jq
brew install jq              # macOS
sudo apt-get install jq      # Linux
choco install jq             # Windows

# Or use plugin dependency checker
/checkdependencies --install
```

### Hook Timeout Errors

**Symptom**: "Hook timed out" errors

**Fix**:
```bash
# Increase timeout in .claude/settings.json
# Change "timeout": 10000 to "timeout": 15000
```

### False Positives

**Symptom**: Operations blocked unnecessarily

**Fix**:
```bash
# Disable strict mode
export PLAN_VALIDATION_STRICT=0
export IDEMPOTENCY_CHECK_STRICT=0

# Or disable specific check
export ENV_VALIDATION_ENABLED=0
```

### Verbose Output Overwhelming

**Symptom**: Too much prevention output

**Fix**:
```bash
# Disable verbose modes
export PREVENTION_SYSTEM_VERBOSE=0
export ROUTING_CLARITY_VERBOSE=0
export AGENT_RECOMMENDATION_VERBOSE=0
```

---

## Uninstallation

To completely remove the prevention system:

### 1. Remove Hooks

Edit `.claude/settings.json` and remove the `hooks` section.

### 2. Delete Configuration (Optional)

```bash
rm .env  # If you created it
```

### 3. Disable Without Uninstalling

Temporarily disable:
```bash
export PREVENTION_SYSTEM_ENABLED=0
```

Disable permanently in `.env`:
```bash
PREVENTION_SYSTEM_ENABLED=0
```

---

## Support

### Documentation
- **User Guide**: `PREVENTION_SYSTEM_GUIDE.md` - Complete feature reference
- **Configuration**: `.env.example` - All configuration variables
- **Test Report**: `reports/end-to-end-hook-test-2025-11-10.md` - System verification

### Getting Help
1. Review troubleshooting section above
2. Check hook logs in `~/.claude/logs/`
3. Submit feedback via `/reflect` command
4. Open issue on GitHub

---

## What's Next

After installation:
1. ✅ Start a new Claude Code session
2. ✅ Prevention hooks run automatically
3. ✅ Review `PREVENTION_SYSTEM_GUIDE.md` for details
4. ✅ Customize `.env` if needed (optional)

The system is now operational and will automatically prevent 84 types of errors identified in user reflections.

---

**Installation Guide Version**: 1.0.0
**Prevention System Version**: 1.0.0
**Last Updated**: 2025-11-10
**Annual ROI**: $126K (time saved from prevented errors)
