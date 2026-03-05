# OpsPal Plugin Marketplace - Dependencies

This document outlines all dependencies required by plugins in the marketplace.

## Quick Dependency Check

```bash
# Check all installed plugins
/check-deps

# Check specific plugin
node scripts/check-dependencies.js --plugin=<name>
```

## Common Dependencies

### Node.js (Required by All Plugins)
- **Version**: 18.0.0 or higher
- **Install**: https://nodejs.org/
- **Used by**: All 8 plugins
- **Purpose**: JavaScript runtime for all plugin scripts

### jq (Commonly Required)
- **Install (Mac)**: `brew install jq`
- **Install (Linux)**: `sudo apt-get install jq`
- **Install (Windows)**: `choco install jq`
- **Used by**: salesforce-plugin, hubspot-core-plugin
- **Purpose**: JSON processing and CLI output parsing

## Per-Plugin Requirements

### Salesforce Plugin (v3.2.0) 🔵

**Required**:
- **Salesforce CLI** (>=2.0.0)
  - Install: `npm install -g @salesforce/cli`
  - Purpose: Metadata operations, org authentication, deployments

- **Node.js** (>=18.0.0)
  - Install: https://nodejs.org/
  - Purpose: Script execution

- **jq**
  - Install: See common dependencies above
  - Purpose: JSON processing

**Optional**:
- **xmllint**
  - Install (Mac): `brew install libxml2`
  - Install (Linux): `sudo apt-get install libxml2-utils`
  - Purpose: Enhanced metadata validation

**Quick Setup (Mac)**:
```bash
npm install -g @salesforce/cli
brew install jq libxml2
/check-deps
```

---

### HubSpot Core Plugin (v1.0.0) 🟠

**Required**:
- **Node.js** (>=18.0.0)
  - Install: https://nodejs.org/
  - Purpose: Script execution

- **curl**
  - Install (Mac): `brew install curl`
  - Install (Linux): `sudo apt-get install curl`
  - Purpose: HubSpot API requests

**Optional**:
- **jq**
  - Install: See common dependencies above
  - Purpose: JSON processing (optional)

**Quick Setup (Mac)**:
```bash
brew install curl jq
/check-deps
```

---

### HubSpot Marketing & Sales Plugin (v1.0.0) 🟠

**Plugin Dependencies**:
- **hubspot-core-plugin** (^1.0.0)
  - Install: `/plugin install hubspot-core-plugin@revpal-internal-plugins`

All CLI/system dependencies inherited from hubspot-core-plugin.

---

### HubSpot Analytics & Governance Plugin (v1.0.0) 🟠

**Plugin Dependencies**:
- **hubspot-core-plugin** (^1.0.0)
  - Install: `/plugin install hubspot-core-plugin@revpal-internal-plugins`

All CLI/system dependencies inherited from hubspot-core-plugin.

---

### HubSpot Integrations Plugin (v1.0.0) 🟠

**Plugin Dependencies**:
- **hubspot-core-plugin** (^1.0.0)
  - Install: `/plugin install hubspot-core-plugin@revpal-internal-plugins`

All CLI/system dependencies inherited from hubspot-core-plugin.

---

### GTM Planning Plugin (v1.5.0) 📊

**Required**:
- **Node.js** (>=18.0.0)
  - Install: https://nodejs.org/
  - Purpose: Planning scripts and simulations

**Quick Setup**:
```bash
# Node.js only - no additional dependencies
node --version  # Verify >=18.0.0
```

---

### Cross-Platform Plugin (v1.1.0) 🔄

**Required**:
- **Node.js** (>=18.0.0)
  - Install: https://nodejs.org/
  - Purpose: Cross-platform scripts

**Quick Setup**:
```bash
# Node.js only - no additional dependencies
node --version  # Verify >=18.0.0
```

---

### Developer Tools Plugin (v1.0.0) 🛠️

**Required**:
- **Node.js** (>=18.0.0)
  - Install: https://nodejs.org/
  - Purpose: Development tools

**Quick Setup**:
```bash
# Node.js only - no additional dependencies
node --version  # Verify >=18.0.0
```

---

## Complete Setup Guide

### macOS (Homebrew)

```bash
# Install all common dependencies
brew install node jq libxml2 curl

# Install Salesforce CLI
npm install -g @salesforce/cli

# Verify
/check-deps
```

### Linux (Debian/Ubuntu)

```bash
# Install all common dependencies
sudo apt-get update
sudo apt-get install -y nodejs npm jq libxml2-utils curl

# Install Salesforce CLI
npm install -g @salesforce/cli

# Verify
/check-deps
```

### Windows (Chocolatey)

```powershell
# Install all common dependencies
choco install nodejs jq curl xsltproc

# Install Salesforce CLI
npm install -g @salesforce/cli

# Verify
/check-deps
```

---

## Automated Dependency Check

The marketplace includes an automated dependency checker that runs:

1. **After plugin installation** (post-install hook)
2. **On demand** via `/check-deps` command
3. **Per-plugin** via `--plugin=<name>` flag

### Example Output

```
🔍 Checking Plugin Dependencies...

✅ node: 22.15.1
✅ curl: 8.5.0
✅ jq: installed
✅ sf: 2.108.6
⚠️  xmllint: not found (optional for: salesforce-plugin)
   Install: sudo apt-get install libxml2-utils

============================================================

📊 Summary:
  • 8 plugins installed
  • 5 unique dependencies checked
  • 1 optional dependencies missing ⚠️
```

---

## Dependency Summary Table

| Plugin | Node | SF CLI | curl | jq | xmllint | Plugin Deps |
|--------|------|--------|------|----|---------| ------------|
| Salesforce | ✅ | ✅ | - | ✅ | ⚠️ | - |
| HubSpot Core | ✅ | - | ✅ | ⚠️ | - | - |
| HubSpot Marketing & Sales | ✅ | - | - | - | - | hubspot-core |
| HubSpot Analytics & Gov | ✅ | - | - | - | - | hubspot-core |
| HubSpot Integrations | ✅ | - | - | - | - | hubspot-core |
| GTM Planning | ✅ | - | - | - | - | - |
| Cross-Platform | ✅ | - | - | - | - | - |
| Developer Tools | ✅ | - | - | - | - | - |

**Legend**: ✅ Required | ⚠️ Optional | - Not needed

---

## Troubleshooting

### "Command not found" Errors

**Solution**: Install the missing tool using your platform's package manager.

```bash
# macOS
brew install <tool>

# Linux
sudo apt-get install <tool>

# Windows
choco install <tool>
```

### Version Mismatch Warnings

**Solution**: Update to the required version.

```bash
# Example: Update Salesforce CLI
npm update -g @salesforce/cli

# Verify
sf --version
```

### Plugin Dependency Not Found

**Solution**: Install the required plugin first.

```bash
/plugin install hubspot-core-plugin@revpal-internal-plugins
```

---

## Best Practices

### For Users

1. **Run `/check-deps` after installing plugins**
2. **Install all required dependencies** before using plugins
3. **Keep tools updated** - `npm update -g`, `brew upgrade`
4. **Check platform-specific instructions** - Mac, Linux, Windows differ

### For Plugin Developers

1. **Declare all dependencies in plugin.json**
2. **Distinguish required vs optional**
3. **Provide platform-specific install commands**
4. **Test in clean environment** - verify dependency checker catches everything

---

## Support

- **Check Dependencies**: `/check-deps`
- **Plugin Issues**: https://github.com/RevPalSFDC/opspal-plugin-internal-marketplace/issues
- **Documentation**: [Plugin Dependency Management Guide](../docs/PLUGIN_DEPENDENCY_MANAGEMENT.md)

---

**Last Updated**: 2025-10-09
**Marketplace Version**: 1.1.0 (8 plugins, 100 agents)
