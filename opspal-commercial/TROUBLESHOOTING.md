# Plugin Marketplace Troubleshooting Guide

## Quick Fix

If you see "2 plugins available" but only see one plugin displayed:

```bash
# 1. Update marketplace catalog
claude marketplace update revpal-internal-plugins

# 2. If that doesn't work, remove and re-add
claude marketplace remove revpal-internal-plugins
claude marketplace add RevPalSFDC/opspal-plugin-internal-marketplace --name revpal-internal-plugins

# 3. Verify both plugins appear
claude plugin search --marketplace revpal-internal-plugins
```

## Common Plugin Errors

### Error: "Invalid path in marketplace entry"

**Cause**: Marketplace catalog has incorrect plugin source paths

**Fix**:
```bash
# Update to latest catalog
claude marketplace update revpal-internal-plugins
```

**Check locally** (in this repo):
```bash
cat .claude-plugin/marketplace.json | jq '.plugins[] | {name, source}'
```

Expected output:
```json
{
  "name": "hubspot-plugin",
  "source": "./.claude-plugins/opspal-hubspot"
}
{
  "name": "salesforce-plugin",
  "source": "./.claude-plugins/opspal-salesforce"
}
```

### Error: "Manifest conflicts" or "Duplicate plugin"

**Cause**: Multiple versions of the same plugin installed

**Fix**:
```bash
# List all installed plugins
claude plugin list

# Uninstall duplicates
claude plugin uninstall salesforce-plugin
claude plugin uninstall hubspot-plugin

# Reinstall from marketplace
claude plugin install salesforce-plugin@revpal-internal-plugins
claude plugin install hubspot-plugin@revpal-internal-plugins
```

### Error: "Git/Network issues"

**Cause**: Cannot access GitHub repository

**Check**:
```bash
# Test GitHub access
curl -I https://github.com/RevPalSFDC/opspal-plugin-internal-marketplace

# Test raw.githubusercontent.com access
curl -I https://raw.githubusercontent.com/RevPalSFDC/opspal-plugin-internal-marketplace/main/.claude-plugin/marketplace.json
```

**Fix**:
- Check firewall/proxy settings
- Verify GitHub is accessible
- Try connecting to a different network

### Error: "Plugin not showing in marketplace"

**Symptoms**: Marketplace says "2 plugins available" but only shows 1

**Common Causes**:
1. **Invalid JSON** - Syntax error in plugin.json
2. **Cache issue** - Marketplace cache not updated
3. **Missing required fields** - Plugin manifest missing required fields (name, version, description)

**Diagnostic Steps**:
```bash
# 1. Run debug mode
claude --debug

# 2. Check marketplace cache
cat ~/.claude/marketplaces/revpal-internal-plugins/marketplace-catalog.json | jq '.plugins'

# 3. Verify plugin manifests on GitHub
curl -s https://raw.githubusercontent.com/RevPalSFDC/opspal-plugin-internal-marketplace/main/.claude-plugins/opspal-salesforce/.claude-plugin/plugin.json | jq '.name, .version, .description'
```

**Fix**:
```bash
# Clear cache and refresh
rm -rf ~/.claude/marketplaces/revpal-internal-plugins
claude marketplace update revpal-internal-plugins
```

## Manual Verification

### Check Plugin Structure

```bash
# Verify plugin manifest exists
test -f .claude-plugins/opspal-salesforce/.claude-plugin/plugin.json && echo "✅ Exists"

# Validate JSON
cat .claude-plugins/opspal-salesforce/.claude-plugin/plugin.json | jq '.'

# Check required fields
cat .claude-plugins/opspal-salesforce/.claude-plugin/plugin.json | jq '{name, version, description, author, keywords, license}'
```

### Check Agent Files

```bash
# Count agents
ls -1 .claude-plugins/opspal-salesforce/agents/*.md | wc -l

# List agent files
ls -1 .claude-plugins/opspal-salesforce/agents/ | head -10
```

### Verify on GitHub

```bash
# Check if files are committed
git ls-tree -r --name-only origin/main .claude-plugins/opspal-salesforce/ | head -20

# Check marketplace catalog on GitHub
gh api repos/RevPalSFDC/opspal-plugin-internal-marketplace/contents/.claude-plugin/marketplace.json --jq '.content' | base64 -d | jq '.plugins'
```

## Known Issues

### Issue: Plugin shows in catalog but not in UI

**Status**: Fixed in commit 965fc6f

**Solution**: salesforce-plugin manifest was updated with correct metadata fields.

### Issue: Missing dependencies blocking plugin load

**Status**: Fixed in commit 171fd1b

**Problem**: jq and fast-xml-parser were marked as "required: true", preventing plugin from loading if not installed.

**Solution**: Changed to "required: false" (optional). Plugin now loads without these, but some advanced features may require them.

**Required Dependencies** (must be installed):
- `sf` - Salesforce CLI
- `node` - Node.js (v18+)

**Optional Dependencies** (enhance functionality):
- `jq` - JSON processing for scripts
- `fast-xml-parser` - Advanced metadata operations
- `xmllint` - XML validation

**To install optional dependencies**:
```bash
# Install jq
sudo apt-get install jq        # Linux
brew install jq                 # macOS
choco install jq                # Windows

# Install fast-xml-parser
npm install -g fast-xml-parser

# Or install locally in plugin directory
cd ~/.claude/plugins/marketplaces/revpal-internal-plugins/.claude-plugins/opspal-salesforce
npm install fast-xml-parser
```

### Issue: Only 5 plugins display in marketplace UI

**Status**: Expected behavior

**Explanation**: Claude Code limits marketplace display to 5 plugins. We've reduced visible plugins to 2 (salesforce-plugin, hubspot-plugin). Other plugins remain on GitHub but hidden from marketplace listing.

## Debugging Tools

### Claude Debug Mode

Use Claude's built-in debug mode to see detailed plugin loading information:

```bash
claude --debug
```

This reveals:
- Which plugins are being loaded
- Errors in plugin manifests
- Command, agent, and hook registration
- MCP server initialization

### Common Debug Findings

| Debug Output | Issue | Fix |
|-------------|-------|-----|
| "Plugin manifest invalid" | JSON syntax error | Validate with `jq '.' plugin.json` |
| "Commands not registered" | Wrong directory | Ensure `commands/` at plugin root |
| "Hook failed to execute" | Not executable | Run `chmod +x hook.sh` |
| "Path not found" | Absolute path used | Use `${CLAUDE_PLUGIN_ROOT}` |

## Support

If issues persist after following this guide:

1. **Run debug mode first**:
   ```bash
   claude --debug
   ```

2. Check Claude Code logs:
   ```bash
   tail -f ~/.claude/logs/claude.log
   ```

3. Check for updates:
   ```bash
   git pull origin main
   ```

4. Review manual verification steps above to diagnose the issue

## Version History

- **2025-10-12**: Removed internal development files from repository
- **2025-10-12**: Completed optional plugin enhancements (CLAUDE_PLUGIN_ROOT, explicit paths)
- **2025-10-12**: Fixed plugin schema violations (removed invalid agents/hooks fields)
- **2025-10-11**: Added troubleshooting guide
- **2025-10-11**: Fixed salesforce-plugin metadata (commit 965fc6f)
- **2025-10-11**: Streamlined marketplace to 2 visible plugins (commit c327339)
