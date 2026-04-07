# OpsPal Commercial

Commercial Claude Code marketplace for RevOps delivery across Salesforce, HubSpot, Marketo, GTM planning, and executive reporting. This repo currently ships 8 plugins with 298 agents, 282 commands, and 186 hooks.

## Prerequisites

- [Claude Code](https://claude.ai/code) installed
- [Node.js 22+](https://nodejs.org)
- [Git](https://git-scm.com) (pre-installed on macOS/Linux; Windows users need [Git for Windows](https://gitforwindows.org))

## Quick Start

### One-Line Installer

**macOS / Linux / WSL:**
```bash
curl -fsSL https://opspal.gorevpal.com/bootstrap-opspal.sh | bash
```

**Windows PowerShell:**
```powershell
irm https://opspal.gorevpal.com/bootstrap-opspal.ps1 | iex
```

**Windows CMD (with Git Bash):**
```cmd
"C:\Program Files\Git\bin\bash.exe" -c "curl -fsSL https://opspal.gorevpal.com/bootstrap-opspal.sh | bash"
```

The installer adds the marketplace, enables auto-update, and installs the full plugin suite. For a dry-run first, append `bash -s -- --dry-run`.

### Manual Install

```bash
# Step 1: Add the marketplace
/plugin marketplace add RevPalSFDC/opspal-commercial

# Step 2: Install plugins (opspal-core first, then platform-specific)
/plugin install opspal-core@opspal-commercial
/plugin install opspal-salesforce@opspal-commercial
/plugin install opspal-hubspot@opspal-commercial
/plugin install opspal-marketo@opspal-commercial
/plugin install opspal-gtm-planning@opspal-commercial
/plugin install opspal-okrs@opspal-commercial

# Step 3: Enable auto-update from the marketplace detail view
```

### Verify Installation

After restarting Claude Code, run `/agents` to confirm plugins are loaded.

## Update

Plugins update automatically if auto-update is enabled. To update manually:

```bash
cd ~/.claude/plugins/marketplaces/opspal-commercial
git pull origin main
```

## License Activation

```bash
/activate-license <license-key> <email>
/license-status
```

## Plugin Catalog

| Plugin | Version | Status | Agents | Commands | Hooks |
|--------|---------|--------|--------|----------|-------|
| `opspal-ai-consult` | 1.4.14 | active | 2 | 3 | 1 |
| `opspal-core` | 2.54.3 | active | 80 | 126 | 93 |
| `opspal-gtm-planning` | 2.3.8 | active | 13 | 16 | 4 |
| `opspal-hubspot` | 3.9.22 | active | 59 | 33 | 14 |
| `opspal-marketo` | 2.6.31 | active | 30 | 30 | 23 |
| `opspal-monday` | 1.4.9 | experimental | 6 | 1 | 2 |
| `opspal-okrs` | 3.0.11 | active | 14 | 14 | 4 |
| `opspal-salesforce` | 3.87.3 | active | 94 | 59 | 45 |

## Support

- Product site: https://opspal.gorevpal.com
- Setup guide: https://opspal.gorevpal.com/support.html#setup
- Release notes: https://opspal.gorevpal.com/release-notes.html
- Issues: https://github.com/RevPalSFDC/opspal-commercial/issues
