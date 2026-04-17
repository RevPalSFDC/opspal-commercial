# OpsPal Commercial

Commercial Claude Code marketplace for RevOps delivery across Salesforce, HubSpot, Marketo, GTM planning, and executive reporting. This repo currently ships 8 plugins with 298 agents, 282 commands, and 189 hooks.

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
| `opspal-core` | 2.55.8 | active | 80 | 126 | 94 |
| `opspal-gtm-planning` | 2.3.10 | active | 13 | 16 | 4 |
| `opspal-hubspot` | 3.9.31 | active | 59 | 33 | 15 |
| `opspal-marketo` | 2.6.40 | active | 30 | 30 | 24 |
| `opspal-monday` | 1.4.10 | experimental | 6 | 1 | 2 |
| `opspal-okrs` | 3.0.13 | active | 14 | 14 | 4 |
| `opspal-salesforce` | 3.87.11 | active | 94 | 59 | 45 |

## Support

- Product site: https://opspal.gorevpal.com
- Setup guide: https://opspal.gorevpal.com/support.html#setup
- Release notes: https://opspal.gorevpal.com/release-notes.html
- Issues: https://github.com/RevPalSFDC/opspal-commercial/issues

## Repository Stats

| Metric | Count |
|--------|-------|
| Plugins | 9 |
| Agents | 298 |
| Commands | 310 |
| Skills | 164 |
| Hooks | 226 |
| Scripts | 1856 |


## Plugin Overview

Install `opspal-core` first, then add only the domain plugins you actually need.

| Plugin | Version | Status | Agents | Commands | Focus |
|--------|---------|--------|--------|----------|-------|
| [`opspal-ai-consult`](plugins/opspal-ai-consult) | 1.4.15 | active | 2 | 3 | Cross-model AI consultation plugin - get second opinions from Google Gemini. Features: non-interactive Gemi... |
| [`opspal-attio`](plugins/opspal-attio) | 2.0.1 | active | 0 | 28 | Attio CRM: record management, pipeline intelligence, attribute schema, historic values, data operations, we... |
| [`opspal-core`](plugins/opspal-core) | 2.55.27 | active | 80 | 126 | OpsPal Core - Cross-platform pipeline orchestration with parallel execution, environment preflight & self-h... |
| [`opspal-gtm-planning`](plugins/opspal-gtm-planning) | 2.3.12 | active | 13 | 16 | GTM Annual Planning framework with strategic reporting templates and session governance hooks. Includes ter... |
| [`opspal-hubspot`](plugins/opspal-hubspot) | 3.9.35 | active | 59 | 33 | HubSpot operations: workflows, contacts, deals, marketing campaigns, CMS blog management, HubDB, serverless... |
| [`opspal-marketo`](plugins/opspal-marketo) | 2.6.43 | active | 30 | 30 | Marketo marketing automation: leads, smart campaigns, email, landing pages, programs, analytics, Salesforce... |
| [`opspal-monday`](plugins/opspal-monday) | 1.4.11 | experimental | 6 | 1 | [EXPERIMENTAL] Monday.com board and item management: CRUD operations, batch processing, file catalog genera... |
| [`opspal-okrs`](plugins/opspal-okrs) | 3.0.13 | active | 14 | 14 | Data-driven OKR generation from live revenue data. Derives objectives and key results from Salesforce, HubS... |
| [`opspal-salesforce`](plugins/opspal-salesforce) | 3.87.23 | active | 94 | 59 | Salesforce metadata, CPQ/RevOps assessments, Flow automation with intelligent segmentation, layout manageme... |

