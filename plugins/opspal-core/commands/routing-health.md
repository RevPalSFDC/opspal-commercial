---
name: routing-health
description: Check the health and status of the automatic agent routing system
argument-hint: "[options]"
stage: stable
---

# Routing Health Check

This command performs a comprehensive health check of the automatic agent routing system, verifying configuration, testing functionality, and reporting status.

## What This Command Does

The routing health check validates:
1. Hook configuration in settings.json
2. Hook file exists and is executable
3. Routing index is present and generated from the canonical registry
4. Canonical routing integrity validation passes
5. Environment variables are configured
6. Required scripts are available
7. Test routing functionality
8. Recent metrics (if available)

## Health Check Steps

### 1. Configuration Check
- Verify hook is configured in .claude/settings.json
- Check environment variables (ENABLE_AUTO_ROUTING, thresholds)
- Validate configuration values

### 2. File System Check
- Hook file exists: `.claude-plugins/opspal-core/hooks/unified-router.sh`
- Hook is executable
- Routing index exists: `routing-index.json`
- Required scripts present
- Canonical routing validator available: `scripts/lib/validate-routing-integrity.js`
- Routing-state semantics validator available: `scripts/lib/validate-routing-state-semantics.js`
- Legacy prompt-router artifacts and references are absent

### 3. Canonical Integrity Check
- `routing-patterns.json` remains the routing authority
- Routed targets resolve to real, fully qualified agents
- Routable metadata and generated artifacts stay in sync
- Routed agent bodies do not require undeclared tools

### 4. Functionality Test
- Run test routing: "Deploy to production"
- Verify recommendation returned
- Check confidence and complexity scores

### 5. Metrics Check (if available)
- Recent routing decisions (last 24 hours)
- Auto-routing rate
- Success rate
- Top agents

## Usage

```bash
/routing-health
```

## Output Format

```
╔════════════════════════════════════════════════════════╗
║     Routing System Health Check                        ║
╚════════════════════════════════════════════════════════╝

CONFIGURATION
─────────────────────────────────────────────────────────
✓ Hook configured: .claude/settings.json
✓ Auto-routing enabled: true
✓ Confidence threshold: 0.7
✓ Complexity threshold: 0.7

FILE SYSTEM
─────────────────────────────────────────────────────────
✓ Hook file present and executable
✓ Routing index present (137 agents, 199 keywords)
✓ All required scripts available

FUNCTIONALITY
─────────────────────────────────────────────────────────
✓ Test routing successful
  Task: "Deploy to production"
  → release-coordinator (90% confidence, 0.8 complexity)

RECENT METRICS (Last 24 hours)
─────────────────────────────────────────────────────────
Total routings: 45
Auto-routed: 36 (80.0%)
Success rate: 95.6%
Top agent: sfdc-revops-auditor (12 uses)

╔════════════════════════════════════════════════════════╗
║  Status: HEALTHY ✓                                     ║
╚════════════════════════════════════════════════════════╝
```

## Troubleshooting

### Hook Not Configured
**Symptom**: ✗ Hook not found in settings.json

**Solution**:
```bash
# Run setup script
.claude-plugins/opspal-core/scripts/setup-auto-routing.sh
```

### Hook Not Executable
**Symptom**: ✗ Hook file not executable

**Solution**:
```bash
chmod +x .claude-plugins/opspal-core/hooks/unified-router.sh
```

### Routing Index Missing
**Symptom**: ✗ Routing index not found

**Solution**:
```bash
# Source shared path resolver
RESOLVE_SCRIPT=""
for _candidate in \
  "${CLAUDE_PLUGIN_ROOT:+${CLAUDE_PLUGIN_ROOT}/scripts/resolve-script.sh}" \
  "$HOME/.claude/plugins/cache/opspal-commercial/opspal-core"/*/scripts/resolve-script.sh \
  "$HOME/.claude/plugins/marketplaces"/*/plugins/opspal-core/scripts/resolve-script.sh \
  "$PWD/plugins/opspal-core/scripts/resolve-script.sh" \
  "$PWD/.claude-plugins/opspal-core/scripts/resolve-script.sh"; do
  [ -n "$_candidate" ] && [ -f "$_candidate" ] && RESOLVE_SCRIPT="$_candidate" && break
done
if [ -z "$RESOLVE_SCRIPT" ]; then echo "ERROR: Cannot locate opspal-core resolve-script.sh"; exit 1; fi
source "$RESOLVE_SCRIPT"

node "$(find_script "routing-index-builder.js")"
```

### Test Routing Failed
**Symptom**: ✗ Test routing returned no recommendation

**Possible causes**:
- Routing index out of date
- Node.js not available
- Script execution error

**Solutions**:
1. Rebuild index: `node scripts/lib/routing-index-builder.js`
2. Check Node.js: `which node`
3. Run integrity validator: `node scripts/lib/validate-routing-integrity.js`
4. Run routing-state semantics validator: `node scripts/lib/validate-routing-state-semantics.js`
5. Check logs: `tail -f /tmp/routing-hook.log`

## Related Commands

- `/route` - Manually analyze routing for a task
- `/agents` - List all available agents
- `node plugins/opspal-core/scripts/lib/validate-routing-integrity.js` - Validate route, metadata, and tool-fit integrity

## Implementation

This command runs the health check script:
```bash
.claude-plugins/opspal-core/scripts/routing-health-check.sh
```
