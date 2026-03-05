---
name: project-connect
description: Set up or connect to customer project across GitHub, Google Drive, and Asana
argument-hint: "[options]"
---

# Project Connect

Orchestrate customer onboarding across multiple systems with intelligent connect-first strategy.

## What This Command Does

Automatically sets up or connects to a complete customer project infrastructure:

1. **Supabase**: Central customer directory and access log
2. **GitHub**: Private code repository for customer work
3. **Google Drive**: Document storage folder
4. **Asana**: Project management workspace

**Connect-First Strategy**: Always attempts to find and connect to existing resources before creating new ones.

## Usage

Invoke the command and provide customer information:

```
/project-connect
```

You'll be prompted for:
- **Customer Name** (auto-detected or prompted): Full customer name (e.g., "Acme Robotics")
- **Your Email** (auto-detected or prompted): For audit trail (see Auto-Detection below)
- **Customer Aliases** (optional): Alternative names (comma-separated)
- **Mode**: "plan" (review first) or "execute" (run immediately)
- **Dry Run**: "yes" (simulate) or "no" (make real changes)

### Customer Auto-Detection

When `--customer` is not provided, Project Connect checks these sources in order:

| Priority | Source | Example |
|----------|--------|---------|
| 1 | `ORG_SLUG` env var | `ORG_SLUG=acme-corp` |
| 2 | CWD path match | Working inside `orgs/acme-corp/...` |
| 3 | `CLIENT_ORG` / `SF_TARGET_ORG` env | `CLIENT_ORG=acme` |
| 4 | Single-org registry | Only 1 customer in registry |

If a match is found in the local registry, the customer name, ID, and aliases are pre-filled automatically. Explicit `--customer` always overrides auto-detection.

### Email Auto-Detection

Project Connect automatically detects your email in this priority order:
1. `USER_EMAIL` environment variable
2. `REVPAL_USER_EMAIL` environment variable
3. Git config (`git config user.email`)
4. Prompt if none found

**One-time setup** (choose one method):

```bash
# Option 1: Use your git config (most users already have this)
git config --global user.email "your.email@example.com"

# Option 2: Set environment variable (persistent)
echo 'export USER_EMAIL=your.email@example.com' >> ~/.bashrc
source ~/.bashrc

# Option 3: Set for current session only
export USER_EMAIL=your.email@example.com
```

Once configured, you'll never need to provide your email again!

## Example Interaction

```
User: /project-connect

Claude: I'll help you set up Project Connect for a customer. I need a few details:

1. Customer Name (required): [e.g., "Acme Robotics"]
2. Your Email (required): [e.g., "user@example.com"]
3. Customer Aliases (optional): [e.g., "Acme Robo, ACME-R"]
4. Mode: "plan" or "execute" (default: plan)
5. Dry Run: "yes" or "no" (default: yes)

Please provide the customer name and your email to get started.

User: Customer is "Acme Robotics", my email is cnacevedo@gmail.com

Claude: Thanks! Let me run Project Connect in plan mode with dry-run enabled first...

[Invokes project-connect agent]

✅ Plan Generated:
1. Query Supabase: No existing customer found
2. Generate ID: RP-ACM123456
3. Create resources:
   - GitHub Repo: revpal-rp-acm123456-acme-robotics (private)
   - Drive Folder: RevPal • Acme Robotics • RP-ACM123456
   - Asana Project: RevPal – Acme Robotics
4. Update Supabase directory
5. Log 4 access operations

Would you like me to execute this plan? (yes/no)

User: yes

Claude: Executing Project Connect (dry-run disabled)...

✅ Project Connect completed successfully for Acme Robotics (RP-ACM123456).
Created GitHub repository, Google Drive folder, and Asana project.
Updated Supabase directory and logged 4 access operations.
All resources are now linked and ready for team collaboration.

Resources:
- GitHub: https://github.com/org/revpal-rp-acm123456-acme-robotics
- Drive: https://drive.google.com/drive/folders/1aBcDeFgHiJkLmNoPqRsTuVwXyZ
- Asana: https://app.asana.com/0/1234567890
```

## What Gets Created

### GitHub Repository
- **Name**: `revpal-{customerId}-{customer-slug}`
- **Visibility**: Private
- **Description**: "{Customer} RevPal Project"
- **Example**: `revpal-rp-acm123456-acme-robotics`

### Google Drive Folder
- **Name**: `RevPal • {Customer} • {customerId}`
- **Location**: Parent folder (configurable)
- **Example**: `RevPal • Acme Robotics • RP-ACM123456`

### Asana Project
- **Name**: `RevPal – {Customer}`
- **Workspace**: Default workspace (from env)
- **Example**: `RevPal – Acme Robotics`

### Supabase Directory Entry
- **Customer ID**: Auto-generated (RP-{FIRST_3_LETTERS}{RANDOM_6_DIGITS})
- **Links**: All resource URLs stored centrally
- **Audit**: Created by, accessed by, timestamps

## Remote Discovery & Sync-Down

Browse customer repos on GitHub and clone them locally — useful when setting up a new machine or joining an existing project.

### List All Customer Repos

```bash
# Human-friendly output
node .claude-plugins/opspal-core/scripts/project-connect.js --list-repos

# Structured JSON (for agent consumption)
node .claude-plugins/opspal-core/scripts/project-connect.js --list-repos --json
```

Output shows sync status:
```
Found 5 customer repo(s):

  [OK] revpal-rp-acm123456-acme-robotics
      ID: RP-ACM123456 | Status: CLONED
      Path: orgs/acme-robotics/repo

  [  ] revpal-rp-xyz789012-beta-corp
      ID: RP-XYZ789012 | Status: REMOTE ONLY
```

### Clone a Customer Repo

```bash
# Clone a specific customer repo
node .claude-plugins/opspal-core/scripts/project-connect.js --sync-down "RP-ACM123456"

# Preview what would happen
node .claude-plugins/opspal-core/scripts/project-connect.js --sync-down "RP-ACM123456" --dry-run true

# Clone all uncloned repos
node .claude-plugins/opspal-core/scripts/project-connect.js --sync-down --all
```

Repos are cloned to `orgs/{customer-slug}/repo/` — the `orgs/` directory is gitignored so clones stay local per-machine. The registry tracks `localClonePath` for fast status checks.

### Agent-Mediated Flow

When the agent runs `/project-connect --list-repos`, it presents an interactive numbered list. You pick one (or more) and the agent calls `--sync-down` for each selection.

## Advanced Usage

For direct script invocation with more control:

```bash
node .claude-plugins/opspal-core/scripts/project-connect.js \
  --customer "Acme Robotics" \
  --aliases "Acme Robo,ACME-R" \
  --created-by "cnacevedo@gmail.com" \
  --mode execute \
  --dry-run false \
  --verbose
```

### Additional Options

- `--customer-id <id>` - Use specific customer ID
- `--github-org <name>` - GitHub organization name
- `--drive-parent <id>` - Parent folder ID for Drive
- `--drive-mode <mode>` - "auto", "api", or "manual"
- `--check-repo-sync` - Check repo sync status (local first, optional remote fallback)
- `--list-repos` - List all revpal-* repos from GitHub with local clone status
- `--sync-down <id>` - Clone a customer repo locally (use `--all` for all uncloned)
- `--json` - Output structured JSON (for `--list-repos` and `--sync-down`)
- `--stale-hours <hours>` - Local sync staleness threshold for fallback checks (default: `24`)
- `--no-remote-fallback` - Disable remote GitHub verification in check mode

### Repo Sync Check

Check whether a project repo is synced using the local project-connect registry:

```bash
node .claude-plugins/opspal-core/scripts/project-connect.js \
  --check-repo-sync \
  --customer-id "RP-ACM123456"
```

Or use the dedicated checker:

```bash
node .claude-plugins/opspal-core/scripts/project-connect-check.js \
  --customer-id "RP-ACM123456"
```

### Local Registry Artifacts

Project Connect persists local sync state for scriptable checks:

- `project-connect/registry-index.json` - central index keyed by `customerId`
- `project-connect/customers/{customerId}.json` - customer-level sync detail and check history
- `project-connect/.schema-version` - schema version marker (auto-managed)

### Schema Management

The registry uses schema versioning to handle data structure evolution:

- **Version 1.1.0** (current): Added `orgSlug` to index entries and customer records, `localClonePath` to customer records
- **Auto-migration**: When the code version is newer than the on-disk `.schema-version`, migration runs automatically on first load
- **Deterministic JSON**: All registry files use sorted keys and trailing newlines to minimize merge conflicts across machines

## Safety Features

### Connect-First Strategy
- Always searches for existing resources first
- Only creates when nothing found
- Prevents duplicate resources

### Idempotency
- Safe to run multiple times
- Second run connects to existing resources
- Updates only timestamps and access logs

### Dry-Run Mode
- Test without making changes
- See exactly what would happen
- Review plan before executing

### Rollback on Failure
- Automatically cleans up partial work
- Deletes created resources if workflow fails
- Logs errors for debugging

## Troubleshooting

### "Google Drive API not available"
**Solution**: Falls back to manual mode. Follow displayed instructions to create folder manually and provide folder ID.

### "GitHub CLI not found"
**Solution**: Install GitHub CLI from https://cli.github.com/

### "Supabase environment variables missing"
**Solution**: Set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in `.env`

### "Customer already exists"
**Result**: Connects to existing resources, updates access timestamps, logs operations. No duplicate creation.

### "Auto-detect didn't find my customer"
**Possible causes**:
- `ORG_SLUG` not set or doesn't match any registry entry
- Customer was created on another machine and registry hasn't been synced
- Try `--list-repos` to see available repos, then `--sync-down` to clone

## Requirements

Project Connect automatically checks all dependencies on startup and provides installation instructions for anything missing.

### Required Dependencies

**Command-line Tools:**
- `gh` (GitHub CLI) - Repository management
- `git` - Email detection and operations
- `curl` - API calls
- `node` - Runtime (v14.0.0+)

**Environment Variables:**
```bash
export SUPABASE_URL=https://your-project.supabase.co
export SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

### Optional Dependencies

**For Asana Integration:**
```bash
export ASANA_ACCESS_TOKEN=your-personal-token
```
See: [Asana Authentication Guide](../docs/ASANA_PER_USER_AUTHENTICATION.md)

**For Google Drive API:**
```bash
export GOOGLE_APPLICATION_CREDENTIALS=/path/to/credentials.json
npm install googleapis @google-cloud/local-auth
```
See: [Google Drive Authentication Guide](../docs/GOOGLE_DRIVE_PER_USER_AUTHENTICATION.md)

**Manual Dependency Check:**
```bash
node .claude-plugins/opspal-core/scripts/lib/dependency-checker.js
```

## When to Use

**Use Project Connect when:**
- Onboarding a new customer
- Setting up infrastructure for customer work
- Linking existing resources to central directory
- Auditing customer resource access
- Ensuring all team members have access to customer materials
- Setting up a new machine and need to clone customer repos

**Don't use for:**
- Internal projects (use standard /asana-link instead)
- Temporary test environments
- Personal repositories

## Related Commands

- `/asana-link` - Link Asana project to current directory
- `/asana-update` - Post work updates to Asana
- `/diagram` - Generate architecture diagrams

## Implementation Status

**Current Version**: 1.1.0

**Implemented**:
- Supabase directory and access log tables
- GitHub repository management
- Google Drive folder management (API + manual modes)
- Supabase integration
- Connect-first strategy
- Idempotent operations
- Rollback on failure
- Comprehensive logging
- Local sync registry with schema versioning
- Org context auto-detection (ORG_SLUG, CWD, env fallbacks)
- Remote repo discovery (`--list-repos`)
- Repo sync-down (`--sync-down`)
- Deterministic JSON for merge-safe registry files

**Pending**:
- Automated team permission assignment
- Slack notifications on project setup
- Asana project creation via API (currently manual with instructions)

---

**Questions?** Use `/reflect` to submit feedback or suggestions for Project Connect.
