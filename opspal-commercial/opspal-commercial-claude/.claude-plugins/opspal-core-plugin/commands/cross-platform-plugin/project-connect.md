---
name: project-connect
description: Set up or connect to customer project across GitHub, Google Drive, and Asana
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
- **Customer Name** (required): Full customer name (e.g., "Acme Robotics")
- **Your Email** (auto-detected or prompted): For audit trail (see Auto-Detection below)
- **Customer Aliases** (optional): Alternative names (comma-separated)
- **Mode**: "plan" (review first) or "execute" (run immediately)
- **Dry Run**: "yes" (simulate) or "no" (make real changes)

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

## Advanced Usage

For direct script invocation with more control:

```bash
node .claude-plugins/cross-platform-plugin/scripts/project-connect.js \
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
node .claude-plugins/cross-platform-plugin/scripts/lib/dependency-checker.js
```

**Example Output:**
```
🔍 Checking dependencies...

✓ GitHub CLI (gh) - gh version 2.81.0
✓ Git (git) - git version 2.43.0
✓ cURL (curl) - curl 8.5.0
✓ Node.js (node) - v22.15.1
✓ Supabase Project URL (SUPABASE_URL)
✓ Supabase Service Role Key (SUPABASE_SERVICE_ROLE_KEY)
✓ JSON processor (jq)
⚠ Google Drive OAuth Credentials Path (GOOGLE_APPLICATION_CREDENTIALS) - NOT SET (optional)

══════════════════════════════════════════════════════════════════════
Dependency Check Results
══════════════════════════════════════════════════════════════════════

Required Dependencies: 6/6 ✓
Optional Dependencies: 2/3 ✓

✅ All required dependencies satisfied!
ℹ️  Some optional features may not be available.
```

## When to Use

**Use Project Connect when:**
- ✅ Onboarding a new customer
- ✅ Setting up infrastructure for customer work
- ✅ Linking existing resources to central directory
- ✅ Auditing customer resource access
- ✅ Ensuring all team members have access to customer materials

**Don't use for:**
- ❌ Internal projects (use standard /asana-link instead)
- ❌ Temporary test environments
- ❌ Personal repositories

## Related Commands

- `/asana-link` - Link Asana project to current directory
- `/asana-update` - Post work updates to Asana
- `/diagram` - Generate architecture diagrams

## Implementation Status

**Current Version**: 1.0.0

**Implemented**:
- ✅ Supabase directory and access log tables
- ✅ GitHub repository management
- ✅ Google Drive folder management (API + manual modes)
- ✅ Supabase integration
- ✅ Connect-first strategy
- ✅ Idempotent operations
- ✅ Rollback on failure
- ✅ Comprehensive logging

**Pending**:
- ⏳ Automated team permission assignment
- ⏳ Slack notifications on project setup
- ⏳ Asana project creation via API (currently manual with instructions)

---

**Questions?** Use `/reflect` to submit feedback or suggestions for Project Connect.