---
description: Create new HubSpot portal configuration and project folder structure
argument-hint: "[--name=<portal>] [--portal-id=<id>] [--api-key=<key>]"
---

# 🚀 Create New HubSpot Environment & Project

This command helps you set up a new HubSpot portal and optionally create a project folder structure.

## What This Does

1. **Adds Portal Configuration** - Registers new portal in `portals/config.json`
2. **Creates Portal Directory** - Sets up `portals/{name}/` structure
3. **Creates Project Folder** (optional) - Sets up assessment/project workspace
4. **Runs Initial Discovery** - Auto-detects portal quirks and metadata

---

## Quick Start

**Step 1: Add the portal configuration**

Run this command with your portal details:

```bash
# Interactive mode (recommended)
.claude-plugins/opspal-core-plugin/packages/domains/hubspot/scripts/switch-portal.sh add

# Or manual mode
node .claude-plugins/opspal-core-plugin/packages/domains/hubspot/scripts/lib/add-portal-config.js \
  --name "production" \
  --portal-id "12345678" \
  --api-key "your-api-key-here"
```

**What you'll need:**
- Portal name (e.g., "production", "sandbox", "staging")
- Portal ID (find in HubSpot settings → Account & Billing)
- API Key (create in HubSpot settings → Integrations → Private Apps)

---

**Step 2: Create project folder (optional)**

If you're starting a specific project or assessment:

```bash
# Create assessment project
node .claude-plugins/opspal-core-plugin/packages/domains/hubspot/scripts/lib/create-project.js \
  --portal "production" \
  --name "marketing-automation-audit" \
  --type "assessment"

# Create data project
node .claude-plugins/opspal-core-plugin/packages/domains/hubspot/scripts/lib/create-project.js \
  --portal "production" \
  --name "contact-import-2025" \
  --type "data-operation"

# Create integration project
node .claude-plugins/opspal-core-plugin/packages/domains/hubspot/scripts/lib/create-project.js \
  --portal "production" \
  --name "salesforce-sync-setup" \
  --type "integration"
```

**Project types:**
- `assessment` - RevOps, marketing, data quality assessments
- `data-operation` - Imports, exports, migrations
- `integration` - API, webhook, sync projects
- `workflow` - Workflow creation/optimization
- `general` - General projects

---

**Step 3: Run initial discovery**

Automatically detect portal quirks and cache metadata:

```bash
# Auto-detect portal customizations
node .claude-plugins/opspal-core-plugin/packages/domains/hubspot/scripts/lib/portal-quirks-detector.js generate-docs production

# Initialize metadata cache (5-10 min)
node .claude-plugins/opspal-core-plugin/packages/domains/hubspot/scripts/lib/hubspot-metadata-cache.js init production

# View portal info
.claude-plugins/opspal-core-plugin/packages/domains/hubspot/scripts/switch-portal.sh info production
```

---

## Complete Example Workflow

```bash
# 1. Add portal (interactive)
.claude-plugins/opspal-core-plugin/packages/domains/hubspot/scripts/switch-portal.sh add
# Enter: Name: production
# Enter: Portal ID: 12345678
# Enter: API Key: pat-na1-xxxx

# 2. Switch to new portal
/hs production

# 3. Create assessment project
node .claude-plugins/opspal-core-plugin/packages/domains/hubspot/scripts/lib/create-project.js \
  --portal "production" \
  --name "q4-marketing-audit" \
  --type "assessment"

# 4. Run discovery (runs automatically, or manually:)
node .claude-plugins/opspal-core-plugin/packages/domains/hubspot/scripts/lib/portal-quirks-detector.js generate-docs production

# 5. Start working
cd portals/production/projects/q4-marketing-audit-2025-10-04/
```

---

## Portal Directory Structure

After setup, you'll have:

```
portals/production/
├── PORTAL_QUIRKS.json          # Auto-detected customizations
├── PORTAL_CONTEXT.json         # Assessment history
├── QUICK_REFERENCE.md          # Quick lookup guide
├── OBJECT_MAPPINGS.txt         # Property reference
├── projects/                   # Project folders
│   └── q4-marketing-audit-2025-10-04/
│       ├── scripts/            # Project scripts
│       ├── data/              # Data files
│       ├── reports/           # Reports and findings
│       └── README.md          # Project documentation
└── reports/                   # Portal-level reports
```

---

## Project Folder Structure

Each project gets:

```
portals/{portal}/projects/{project-name}-{date}/
├── scripts/              # Executable scripts
├── data/                # CSV files, imports, exports
├── reports/             # Assessment reports, summaries
├── backups/             # Data backups
└── README.md           # Auto-generated project info
```

---

## Available Scripts After Setup

Once your portal is configured, you can use:

**Portal Management:**
- `/hs production` - Quick switch to portal
- `/hslist` - List all portals
- `/hscurrent` - Show current portal
- `/hsinfo production` - Portal details

**Discovery:**
- `node .claude-plugins/opspal-core-plugin/packages/domains/hubspot/scripts/lib/portal-quirks-detector.js generate-docs production`
- `node .claude-plugins/opspal-core-plugin/packages/domains/hubspot/scripts/lib/hubspot-metadata-cache.js init production`
- `node .claude-plugins/opspal-core-plugin/packages/domains/hubspot/scripts/lib/portal-context-manager.js load production`

**Project Creation:**
- `node .claude-plugins/opspal-core-plugin/packages/domains/hubspot/scripts/lib/create-project.js --help`

---

## Tips

**API Key Setup:**
1. Go to HubSpot → Settings → Integrations → Private Apps
2. Create new private app
3. Required scopes: `crm.objects.contacts.read`, `crm.objects.companies.read`, etc.
4. Copy the access token (starts with `pat-na1-`)

**Portal ID:**
1. Go to HubSpot → Settings → Account & Billing
2. Look for "Hub ID" - this is your portal ID

**Security:**
- Never commit API keys to git
- Use environment variables for sensitive data
- Portals config is gitignored by default

---

## Automation Features

After setup, these run automatically:

✅ **Post-Authentication Hook** - Runs quirks detection after login
✅ **Pre-Task Context Loader** - Loads portal context before tasks
✅ **Agent Routing Validator** - Suggests correct agents
✅ **Path Validator** - Enforces project structure

---

## Troubleshooting

**Portal not found**
- Check spelling in `portals/config.json`
- Verify portal ID is correct
- Re-run `.claude-plugins/opspal-core-plugin/packages/domains/hubspot/scripts/switch-portal.sh add`

**API authentication failed**
- Verify API key is valid
- Check required scopes are enabled
- Regenerate token if expired

**Project creation failed**
- Ensure portal exists first
- Check permissions on portals/ directory
- Use absolute paths if needed

---

## Quick Reference Card

| Command | Purpose |
|---------|---------|
| `.claude-plugins/opspal-core-plugin/packages/domains/hubspot/scripts/switch-portal.sh add` | Add new portal |
| `node .claude-plugins/opspal-core-plugin/packages/domains/hubspot/scripts/lib/create-project.js --help` | Create project |
| `/hs <name>` | Switch to portal |
| `node .claude-plugins/opspal-core-plugin/packages/domains/hubspot/scripts/lib/portal-quirks-detector.js generate-docs <portal>` | Run discovery |
| `/hsinfo <name>` | View portal info |

---

**Ready to get started?** Run:

```bash .claude-plugins/opspal-core-plugin/packages/domains/hubspot/scripts/switch-portal.sh add
```

Then follow the interactive prompts!
