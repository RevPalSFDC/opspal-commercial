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
3. Routing index is present and up-to-date
4. Environment variables are configured
5. Required scripts are available
6. Test routing functionality
7. Recent metrics (if available)

## Health Check Steps

### 1. Configuration Check
- Verify hook is configured in .claude/settings.json
- Check environment variables (ENABLE_AUTO_ROUTING, thresholds)
- Validate configuration values

### 2. File System Check
- Hook file exists: `.claude-plugins/opspal-core/hooks/user-prompt-router.sh`
- Hook is executable
- Routing index exists: `routing-index.json`
- Required scripts present

### 3. Functionality Test
- Run test routing: "Deploy to production"
- Verify recommendation returned
- Check confidence and complexity scores

### 4. Metrics Check (if available)
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
chmod +x .claude-plugins/opspal-core/hooks/user-prompt-router.sh
```

### Routing Index Missing
**Symptom**: ✗ Routing index not found

**Solution**:
```bash
node .claude-plugins/opspal-core/scripts/lib/routing-index-builder.js
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
3. Check logs: `tail -f /tmp/routing-hook.log`

## Related Commands

- `/route` - Manually analyze routing for a task
- `/agents` - List all available agents

## Implementation

This command runs the health check script:
```bash
.claude-plugins/opspal-core/scripts/routing-health-check.sh
```
