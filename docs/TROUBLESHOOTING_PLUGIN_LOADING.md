# Troubleshooting Plugin Loading Issues

## Quick Diagnosis

If you encounter errors like:
- "Plugin 'X' from marketplace 'Y' failed to load"
- "Common causes: invalid path in marketplace entry, git/network issues, or manifest conflicts"

Follow these steps:

### 1. Validate Plugin Manifest (Start Here)

```bash
claude plugin validate .claude-plugins/<plugin-name>/.claude-plugin/plugin.json
```

**Common issues**:
- ❌ Invalid JSON syntax
- ❌ Unsupported fields in manifest (agents, commands, hooks in wrong format)
- ❌ Missing required fields (name, version, description)

**Fix**: If validation fails, the error message will tell you what to fix.

### 2. Test in Clean Environment

```bash
# Create fresh test directory
mkdir -p /tmp/plugin-test/.claude

# Configure marketplace
cat > /tmp/plugin-test/.claude/settings.json <<EOF
{
  "marketplaces": [
    {
      "url": "https://github.com/RevPalSFDC/opspal-commercial",
      "name": "opspal-commercial"
    }
  ]
}
EOF

# Try installation
cd /tmp/plugin-test
claude plugin install <plugin-name>@opspal-commercial
```

### 3. Check Plugin Structure

Verify these files exist:
```
.claude-plugins/<plugin>/
├── .claude-plugin/
│   └── plugin.json       # Required manifest
├── agents/               # At least one .md file
│   └── *.md
├── commands/             # Optional
│   └── *.md
└── README.md             # Recommended
```

## Common Issues & Fixes

### Issue: "agents: Invalid input: must end with .md"

**Cause**: Plugin manifest contains `"agents": "./agents"` field, which doesn't match schema.

**Fix**: Remove the field from plugin.json. Claude Code auto-discovers agents from the directory.

```bash
# Option 1: Edit manually
# Remove these lines from plugin.json:
#   "agents": "./agents",
#   "commands": "./commands",

# Option 2: Use jq
jq 'del(.agents, .commands)' plugin.json > plugin.json.tmp
mv plugin.json.tmp plugin.json
```

### Issue: "hooks: Invalid input"

**Cause**: Plugin manifest contains hooks in unsupported format.

**Fix**: Remove hooks field. Note that SessionStart hooks are not currently supported in plugin manifests.

```bash
jq 'del(.hooks)' plugin.json > plugin.json.tmp
mv plugin.json.tmp plugin.json
```

### Issue: Model Version Not Recognized

**Symptoms**: Plugin loads on some systems but not others.

**Cause**: Explicit model versions (like `claude-sonnet-4-5-20250929`) may not be recognized by older Claude Code versions.

**Fix**: Use generic model aliases in agent/command frontmatter:

```yaml
# ❌ Might not work on older versions
model: claude-sonnet-4-5-20250929

# ✅ Works on all versions
model: sonnet
```

### Issue: Plugin Installs But Agents Not Found

**Cause**: Agents directory is empty or .md files have invalid frontmatter.

**Fix**:
1. Verify agents exist: `ls .claude-plugins/<plugin>/agents/`
2. Check frontmatter format:
   ```yaml
   ---
   name: agent-name
   model: sonnet
   description: Brief description
   tools: Read, Write, Bash
   ---
   ```

## Prevention

### For Plugin Developers

**Pre-commit validation**:
```bash
# Validate before committing
claude plugin validate .claude-plugins/<plugin>/.claude-plugin/plugin.json
```

**Test before release**:
```bash
# Test installation in clean environment
# (For internal developers with access to test script)
.claude/scripts/lib/test-plugin-installation.sh <plugin-name> --cleanup
```

### For Plugin Users

**Always test new installations**:
```bash
# After installation
/plugin list        # Verify plugin appears
/agents             # Verify agents discovered
```

**Keep Claude Code updated**:
```bash
# Check for updates
claude --version
```

## Getting Help

If you've tried these steps and still having issues:

1. **Check the plugin's README**: `.claude-plugins/<plugin>/README.md`
2. **Report an issue**: https://github.com/RevPalSFDC/opspal-commercial/issues
3. **Include in your report**:
   - Error message (full text)
   - Output of `claude plugin validate`
   - Plugin name and version
   - Claude Code version (`claude --version`)
   - Operating system

## Technical Details

### Plugin Schema Requirements

Valid plugin.json must include:
```json
{
  "name": "plugin-name",
  "version": "1.0.0",
  "description": "Brief description",
  "author": {
    "name": "Your Name",
    "email": "email@example.com"
  },
  "dependencies": {
    "plugins": [],
    "cli": {},
    "system": {}
  }
}
```

**Auto-discovered**:
- Agents from `./agents/*.md`
- Commands from `./commands/*.md`
- Scripts from `./scripts/**/*.js` or `./scripts/**/*.sh`

**Not supported in manifest**:
- `"agents": "./agents"` (use directory auto-discovery)
- `"commands": "./commands"` (use directory auto-discovery)
- `"hooks": {...}` (SessionStart hooks not supported in current schema)

### Compatibility

**Recommended**:
- Use generic model aliases (`sonnet`, `opus`, `haiku`)
- Validate manifests before release
- Test in clean environment

**Avoid**:
- Explicit model versions (may not work on older Claude Code)
- Custom schema fields not in official spec
- Hardcoded paths in scripts

---

**Last Updated**: 2025-10-13
**Related**: [Plugin Development Guide](PLUGIN_DEVELOPMENT_GUIDE.md), [Internal vs Plugins](../INTERNAL_VS_PLUGINS.md)
