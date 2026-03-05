# Centralized Storage Architecture - Google Drive + GitHub

**Version**: 1.0.0 (Planning Document)
**Date**: 2025-10-23
**Status**: 📋 Design Phase
**Feasibility**: ✅ HIGHLY FEASIBLE (80% foundation exists)

---

## Executive Summary

**Vision**: Eliminate scattered local files by centralizing all client artifacts in Google Drive (Shared Drives) and GitHub (private repos), with intelligent routing via virtual URIs.

**Current State**:
- ✅ 80% foundation exists (Google Drive MCP, 3 gdrive agents, OAuth flows, client structure)
- ❌ 302 scripts + 23 agents write to local files
- ❌ No centralized auth broker or location resolver
- ❌ No enforcement (agents can still write locally)

**Target State**:
- ✅ 0 files written outside Shared Drives/GitHub
- ✅ Virtual URIs (`gdrive://client/folder/file`) route to correct locations
- ✅ Centralized auth (PKCE for humans, service accounts for headless)
- ✅ Per-client isolation (no cross-client data leakage)

**Effort**: ~90 hours over 12 weeks
**Annual Value**: $50,000+ (no lost files, compliance, faster onboarding, audit trail)

---

## Table of Contents

- [Current Infrastructure Analysis](#current-infrastructure-analysis)
- [Target Architecture](#target-architecture)
- [30-60-90 Day Implementation Plan](#30-60-90-day-implementation-plan)
- [Technical Design](#technical-design)
- [Migration Strategy](#migration-strategy)
- [Enforcement & Compliance](#enforcement--compliance)
- [Success Metrics](#success-metrics)
- [Risks & Mitigations](#risks--mitigations)
- [Questions & Decisions](#questions--decisions)

---

## Current Infrastructure Analysis

### ✅ What We Already Have

#### 1. Google Drive Foundation

**MCP Integration**:
```json
// ../.mcp.json
{
  "mcpServers": {
    "gdrive": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-gdrive"],
      "env": {
        "GDRIVE_CLIENT_ID": "${GDRIVE_CLIENT_ID}",
        "GDRIVE_CLIENT_SECRET": "${GDRIVE_CLIENT_SECRET}",
        "GDRIVE_REDIRECT_URI": "${GDRIVE_REDIRECT_URI}"
      }
    }
  }
}
```

**Existing Agents** (3):
- `gdrive-document-manager` - Read-only document access
- `gdrive-template-library` - Template management
- `gdrive-report-exporter` - Export reports to Sheets

**OAuth Implementation**:
- `scripts/gdrive-write-access.js` - OAuth PKCE flow for write access
- `scripts/test-gdrive-connection.js` - Connection testing
- `scripts/setup-gdrive-folders.js` - Folder structure creation

**Existing Folder Structure** (single RevPal root):
```
/RevPal/
├── Documentation/
│   ├── Salesforce/
│   ├── HubSpot/
│   └── Integration/
├── Reports/
│   ├── Salesforce/
│   ├── HubSpot/
│   └── Combined/
├── Templates/
│   ├── Salesforce/
│   └── HubSpot/
├── Compliance/
└── Archives/
```

---

#### 2. Client/Instance Structure

**Current Clients** (12 identified):
- eta-corp (Salesforce + HubSpot)
- acme-corp (Salesforce + HubSpot)
- gamma-corp (Salesforce)
- filmhub (HubSpot)
- delta-corp (HubSpot)
- revpal-production (HubSpot)
- epsilon-corp2021-revpal (Salesforce)
- eta-production (Salesforce)
- acme-production (Salesforce)
- acme-corp-staging (Salesforce)
- acme-production (Salesforce)
- opspal (Salesforce)

**Current Storage**:
- Local instances: `../opspal-internal/SFDC/instances/*/`
- Local instances: `../opspal-internal/HS/instances/*/`
- Each has README.md, reports, data exports

---

#### 3. File Writing Patterns

**Analysis**:
- **302 scripts** write files (fs.writeFile, fs.promises.write)
- **23 agents** use Write tool for outputs
- **Common patterns**:
  - Automation audit reports → `./instances/{org}/automation-audit-{date}/`
  - CSV exports → `./instances/{org}/exports/`
  - Generated scripts → `./instances/{org}/scripts/`
  - Templates → `./instances/{org}/templates/`

**Current Problems**:
- Files scattered across local machines
- No centralized access for team
- Lost files when laptops change
- No audit trail of who wrote what
- Manual sharing via Slack/email

---

#### 4. GitHub Integration

**Current State**:
- ✅ Using GitHub for plugin code (RevPalSFDC/opspal-plugin-internal-marketplace)
- ✅ Git workflows established (commits, branches, PRs)
- ❌ No per-client repos for scripts/infra
- ❌ No GitHub MCP or programmatic file creation
- ❌ No branch protection enforcement

**Repository Structure**:
- opspal-plugin-internal-marketplace (this repo)
- (Need): Per-client ops repos (eta-corp-ops, acme-corp-ops, etc.)

---

### ❌ What We Need to Build

1. **Auth Broker** - Centralized authentication library
2. **Location Resolver** - Virtual URI → real Drive/GitHub mapping
3. **Client Registry** - YAML mapping clients to resources
4. **Per-Client Shared Drives** - Replace single /RevPal/ folder
5. **Per-Client GitHub Repos** - Script storage
6. **Migration Tooling** - Update 302 scripts + 23 agents
7. **Enforcement Hooks** - Block local file writes
8. **Admin Interface** - Manage registry, test access
9. **Audit System** - Track what was written where

---

## Target Architecture

### The Vision: Single Source of Truth

```
┌─────────────────────────────────────────────────────────────┐
│ USER REQUEST                                                │
│ "Generate automation audit for eta-corp"                      │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ SUB-AGENT UTILIZATION BOOSTER (Hook)                        │
│ Prepends: "Using the appropriate sub-agents, "              │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ AGENT (e.g., sfdc-automation-auditor)                       │
│ 1. Detects client: "eta-corp"                                 │
│ 2. Generates report content                                 │
│ 3. Calls location resolver to save                          │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ LOCATION RESOLVER                                           │
│ Input: gdrive://eta-corp/_Automation_Artifacts/audit.pdf      │
│ 1. Lookup eta-corp in client registry                         │
│ 2. Get driveId + folderId for _Automation_Artifacts         │
│ 3. Call auth broker for credentials                         │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ AUTH BROKER                                                 │
│ 1. Check token cache                                        │
│ 2. If missing/expired: Prompt user (PKCE) or use service   │
│    account (headless)                                       │
│ 3. Return valid Google Drive API client                     │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ GOOGLE DRIVE API                                            │
│ POST /drive/v3/files                                        │
│ {                                                           │
│   name: "automation-audit-2025-10-23.pdf",                  │
│   parents: ["1PQR..."],  // _Automation_Artifacts folder   │
│   driveId: "0ACYj...",   // eta-corp Shared Drive            │
│   supportsAllDrives: true                                   │
│ }                                                           │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ GOOGLE DRIVE - eta-corp Shared Drive                         │
│ /_Automation_Artifacts/                                     │
│   └── automation-audit-2025-10-23.pdf ✅ SAVED              │
│                                                             │
│ Accessible by: eta-corp Google Group members                  │
│ Audit trail: Logged who/when/from where                     │
└─────────────────────────────────────────────────────────────┘
```

---

### Virtual URI System

**Format**:
```
gdrive://{clientSlug}/{folderKey}/{path/to/file}
github://{clientSlug}/{repo}/{path/to/file}
```

**Examples**:
```
gdrive://eta-corp/_Automation_Artifacts/audit-2025-10-23.pdf
gdrive://acme-corp/03_Analytics_Exports/pipeline-report.csv
github://gamma-corp/gamma-corp-ops/scripts/data-import.js
github://eta-corp/eta-corp-ops/runbooks/deployment-process.md
```

**Resolution**:
```javascript
// Client Registry lookup
const client = registry.clients.eta-corp;

// gdrive://eta-corp/_Automation_Artifacts/audit.pdf
// ↓ resolves to:
{
  driveId: "0ACYj4JbWHPxKUk9PVA",           // eta-corp Shared Drive
  folderId: "1PQR...",                       // _Automation_Artifacts folder
  fileName: "audit.pdf",
  mimeType: "application/pdf"
}

// github://eta-corp/eta-corp-ops/scripts/sync.js
// ↓ resolves to:
{
  org: "RevPalSFDC",
  repo: "eta-corp-ops",
  path: "scripts/sync.js",
  branch: "main"
}
```

---

### Per-Client Resources

**Each client gets**:

1. **Google Shared Drive** (isolated, team-accessible):
```
{ClientName} - RevPal
├── 01_SOWs/                      # Contracts, statements of work
├── 02_Project_Plans/             # Project timelines, plans
├── 03_Analytics_Exports/         # CSV, Excel exports
├── 04_Enablement/                # Training, documentation
├── 05_Admin/                     # Logs, configs, backups
└── _Automation_Artifacts/        # Agent outputs, audit reports
```

2. **GitHub Private Repo** (code, runbooks):
```
{clientslug}-ops/
├── scripts/                      # Custom scripts
│   ├── data-import.js
│   ├── field-updates.js
│   └── bulk-operations.js
├── runbooks/                     # Operational docs
│   ├── deployment-process.md
│   ├── troubleshooting.md
│   └── escalation.md
├── config/                       # Client-specific configs
│   └── feature-flags.yaml
└── README.md                     # Repo overview
```

3. **Client Registry Entry**:
```yaml
clients:
  eta-corp:
    display_name: "eta-corp GmbH"
    drive:
      shared_drive_id: "0ACYj..."
      folders:
        sows: "1ABC..."
        automation_artifacts: "1PQR..."
    github:
      org: "RevPalSFDC"
      repos:
        ops: "eta-corp-ops"
    platforms:
      salesforce: { org_alias: "eta-corp" }
      hubspot: { portal_id: "12345678" }
```

---

## 30-60-90 Day Implementation Plan

### Days 0-30: Foundation & Controls

#### Week 1: Auth Broker Library (8 hours)

**Deliverable**: `packages/auth-broker/` npm package

**Features**:
- Google OAuth PKCE (for human users running agents locally)
- Google Service Account (for headless automation jobs)
- GitHub App installation tokens (for repo access)
- GitHub device flow (for human users)
- Token refresh automation
- Secrets Manager integration (AWS Secrets Manager or GCP Secret Manager)

**API Design**:
```javascript
const AuthBroker = require('@revpal/auth-broker');

const auth = new AuthBroker({
  secretsManager: 'aws',  // or 'gcp'
  secretsPath: 'revpal/client-tokens',
  cacheDir: '/tmp/.auth-cache'
});

// Google - Human user (interactive prompt)
const googleAuth = await auth.google.ensureAuth({
  mode: 'pkce',
  scopes: ['https://www.googleapis.com/auth/drive'],
  clientId: process.env.GDRIVE_CLIENT_ID,
  interactive: true  // Shows browser auth prompt
});

// Google - Headless automation
const googleService = await auth.google.ensureAuth({
  mode: 'service-account',
  keyFile: await auth.secrets.get('google-service-account-key'),
  scopes: ['https://www.googleapis.com/auth/drive']
});

// GitHub - Human user (device flow)
const githubAuth = await auth.github.ensureAuth({
  mode: 'device-flow',
  clientId: process.env.GITHUB_CLIENT_ID,
  scopes: ['repo', 'read:org']
});

// GitHub - Headless (GitHub App)
const githubApp = await auth.github.ensureAuth({
  mode: 'app',
  appId: process.env.GITHUB_APP_ID,
  privateKey: await auth.secrets.get('github-app-private-key'),
  installationId: process.env.GITHUB_INSTALLATION_ID
});

// Get Drive API client
const drive = google.drive({ version: 'v3', auth: googleAuth });

// Get GitHub Octokit client
const octokit = new Octokit({ auth: githubAuth.token });
```

**Security**:
- Tokens stored in-memory only (never on disk except Secrets Manager)
- Automatic refresh before expiration
- Service account keys never in .env (Secrets Manager only)
- GitHub App private key never in .env (Secrets Manager only)

**Testing**:
```bash
node packages/auth-broker/test/test-google-pkce.js
node packages/auth-broker/test/test-github-device-flow.js
```

---

#### Week 2: Location Resolver Library (6 hours)

**Deliverable**: `packages/location-resolver/` npm package

**Features**:
- URI parsing (`gdrive://`, `github://`)
- Client registry integration
- Drive file operations (save, read, list, delete)
- GitHub file operations (create, update, read)
- Validation (rejects local paths)
- Metadata caching (reduce API calls)

**API Design**:
```javascript
const LocationResolver = require('@revpal/location-resolver');

const resolver = new LocationResolver({
  registryPath: './config/client-registry.yaml',
  authBroker: auth
});

// Save file to Google Drive
await resolver.save(
  'gdrive://eta-corp/_Automation_Artifacts/audit-2025-10-23.pdf',
  pdfBuffer,
  {
    mimeType: 'application/pdf',
    description: 'Automation audit report generated 2025-10-23'
  }
);

// Read file from Drive
const content = await resolver.read('gdrive://acme-corp/02_Project_Plans/q4-roadmap.md');

// List files in folder
const files = await resolver.list('gdrive://gamma-corp/_Automation_Artifacts', {
  filter: { extension: '.csv' },
  sortBy: 'modifiedTime',
  limit: 20
});

// Save to GitHub
await resolver.save(
  'github://eta-corp/eta-corp-ops/scripts/data-sync.js',
  scriptContent,
  {
    message: 'Add data sync script',
    branch: 'main',
    author: { name: 'Claude Agent', email: 'noreply@revpal.com' }
  }
);

// REJECTS local paths
await resolver.save('/tmp/report.csv', data);
// ❌ Error: Local paths not allowed. Use gdrive:// or github:// URIs.
```

**URI Resolution Logic**:
```javascript
// Input: gdrive://eta-corp/_Automation_Artifacts/report.csv
// Step 1: Parse URI
{
  protocol: 'gdrive',
  client: 'eta-corp',
  folderKey: '_Automation_Artifacts',
  path: 'report.csv'
}

// Step 2: Lookup in client registry
const client = registry.clients.eta-corp;
const folderId = client.drive.folders.automation_artifacts; // "1PQR..."
const driveId = client.drive.shared_drive_id; // "0ACYj..."

// Step 3: Construct Drive API params
{
  name: 'report.csv',
  parents: ['1PQR...'],
  driveId: '0ACYj...',
  supportsAllDrives: true  // ← ALWAYS true
}

// Step 4: Execute with auth broker
const driveClient = await authBroker.google.getClient();
await driveClient.files.create({ requestBody, media });
```

---

#### Week 3: Client Registry (4 hours)

**Deliverable**: `config/client-registry.yaml` + validation script

**Schema**:
```yaml
# Client Registry v1.0.0
# Maps clients to Google Drive and GitHub resources

# Global settings
settings:
  default_drive_scope: "https://www.googleapis.com/auth/drive"
  default_github_org: "RevPalSFDC"
  enforce_shared_drives: true  # Never use "My Drive"
  require_explicit_parents: true  # Always specify folder

clients:
  eta-corp:
    # Display info
    display_name: "eta-corp GmbH"
    status: "active"
    created: "2025-10-23"
    tags: ["cpq", "enterprise", "production"]

    # Google Drive resources
    drive:
      shared_drive_id: "0ACYj4JbWHPxKUk9PVA"  # eta-corp Shared Drive
      shared_drive_name: "eta-corp - RevPal"
      folders:
        # Standard folder structure
        sows: "1ABC..."                       # /01_SOWs
        project_plans: "1DEF..."              # /02_Project_Plans
        exports: "1GHI..."                    # /03_Analytics_Exports
        enablement: "1JKL..."                 # /04_Enablement
        admin: "1MNO..."                      # /05_Admin
        automation_artifacts: "1PQR..."       # /_Automation_Artifacts

      # Access control
      google_group: "eta-corp-team@revpal.com"
      permissions:
        read: ["eta-corp-team@revpal.com"]
        write: ["team@gorevpal.com", "automation@revpal.com"]
        admin: ["team@gorevpal.com"]

    # GitHub resources
    github:
      org: "RevPalSFDC"
      repos:
        ops: "eta-corp-ops"                    # Scripts, infra-as-code
        docs: "eta-corp-docs"                  # Runbooks (optional)
      default_branch: "main"

      # Access control
      teams:
        - "eta-corp-developers"
        - "revpal-engineers"

    # Platform connections
    platforms:
      salesforce:
        org_alias: "eta-corp"
        instance_url: "https://eta-corp.my.salesforce.com"
        org_id: "00D68000001bRc6EAE"
        environment: "production"

      hubspot:
        portal_id: "12345678"
        portal_alias: "eta-corp-hs"
        environment: "production"

    # Metadata
    metadata:
      primary_contact: "team@gorevpal.com"
      timezone: "America/Los_Angeles"
      active_since: "2024-01-15"
      last_accessed: "2025-10-23"

  acme-corp:
    display_name: "acme-corp Home Lending"
    # ... same structure

  gamma-corp:
    display_name: "Neon One"
    # ... same structure

# Registry metadata
metadata:
  version: "1.0.0"
  schema_version: "1.0.0"
  last_updated: "2025-10-23T00:00:00Z"
  total_clients: 12
  active_clients: 12
  validator_version: "1.0.0"
```

**Validator Script**: `scripts/validate-client-registry.js`
```javascript
#!/usr/bin/env node

const yaml = require('js-yaml');
const fs = require('fs');
const { google } = require('googleapis');

async function validateRegistry() {
  const registry = yaml.load(fs.readFileSync('./config/client-registry.yaml'));

  for (const [slug, client] of Object.entries(registry.clients)) {
    console.log(`\n📋 Validating: ${slug} (${client.display_name})`);

    // 1. Check Shared Drive exists
    const driveId = client.drive.shared_drive_id;
    try {
      const drive = await authBroker.google.getClient();
      const result = await drive.drives.get({ driveId });
      console.log(`   ✅ Shared Drive: ${result.data.name}`);
    } catch (error) {
      console.error(`   ❌ Shared Drive not accessible: ${error.message}`);
    }

    // 2. Check folder IDs
    for (const [key, folderId] of Object.entries(client.drive.folders)) {
      try {
        const folder = await drive.files.get({
          fileId: folderId,
          supportsAllDrives: true,
          fields: 'name,driveId'
        });
        console.log(`   ✅ Folder '${key}': ${folder.data.name}`);
      } catch (error) {
        console.error(`   ❌ Folder '${key}' not found: ${error.message}`);
      }
    }

    // 3. Check GitHub repo
    try {
      const octokit = await authBroker.github.getClient();
      const repo = await octokit.repos.get({
        owner: client.github.org,
        repo: client.github.repos.ops
      });
      console.log(`   ✅ GitHub Repo: ${repo.data.full_name}`);
    } catch (error) {
      console.error(`   ❌ GitHub repo not accessible: ${error.message}`);
    }
  }

  console.log('\n✅ Validation complete!');
}

validateRegistry();
```

---

#### Week 4: Google Drive Setup (6 hours)

**Tasks**:

1. **Create Shared Drives** (12 clients × 15 min = 3 hours)
   - One per client (eta-corp, acme-corp, gamma-corp, etc.)
   - Naming: `{ClientName} - RevPal`
   - Set as "restricted" (only Google Group members)

2. **Standard Folder Structure** (automated via script)
   ```javascript
   const STANDARD_FOLDERS = [
     '01_SOWs',
     '02_Project_Plans',
     '03_Analytics_Exports',
     '04_Enablement',
     '05_Admin',
     '_Automation_Artifacts'
   ];

   for (const client of clients) {
     await createSharedDrive(client.display_name);
     for (const folder of STANDARD_FOLDERS) {
       const folderId = await createFolder(folder, { parent: driveId });
       registry.clients[client.slug].drive.folders[folderKey] = folderId;
     }
   }
   ```

3. **Google Groups** (12 groups × 10 min = 2 hours)
   - Create: `{client}-team@revpal.com`
   - Add members
   - Set as Drive access control group

4. **Migrate Existing /RevPal/ Folder** (1 hour)
   - Copy relevant docs to appropriate client Shared Drives
   - Archive old structure
   - Update bookmarks/links

**Script**: `scripts/setup-client-shared-drives.js`
- Reads client registry
- Creates Shared Drives
- Sets up folder structure
- Configures permissions
- Updates registry with IDs

---

### Days 31-60: Agent Integration & Migration

#### Week 5: Core Agent Updates (8 hours)

**Priority Agents** (highest impact):

1. **Automation Audit Generators** (5 agents)
   - sfdc-automation-auditor
   - sfdc-metadata-analyzer
   - sfdc-quality-auditor
   - hubspot-workflow-auditor
   - All save to `gdrive://{client}/_Automation_Artifacts/`

2. **Report Exporters** (3 agents)
   - gdrive-report-exporter (already uses Drive, update to resolver)
   - unified-reporting-aggregator
   - Save to `gdrive://{client}/03_Analytics_Exports/`

3. **Code Generators** (5 agents)
   - sfdc-apex-developer (generates Apex classes)
   - hubspot-workflow-builder (generates workflow configs)
   - Save to `github://{client}/{client}-ops/`

4. **Document Managers** (3 agents)
   - gdrive-document-manager (read-only, update to resolver)
   - gdrive-template-library
   - Update to use client-scoped access

**Pattern Template**:
```javascript
// BEFORE (agent using Write tool):
const outputPath = `./instances/${orgAlias}/audit-${date}/summary.md`;
// Use Write tool with outputPath

// AFTER (agent using location resolver):
const resolver = require('@revpal/location-resolver');

// Detect client from orgAlias
const client = resolver.getClientByOrgAlias(orgAlias);

// Save to Drive
await resolver.save(
  `gdrive://${client}/_Automation_Artifacts/audit-${date}/summary.md`,
  content,
  { mimeType: 'text/markdown' }
);
```

**Agent Frontmatter Update**:
```yaml
# BEFORE:
tools: salesforce-dx, Read, Write, TodoWrite

# AFTER:
tools: salesforce-dx, Read, TodoWrite, @revpal/location-resolver
# Note: 'Write' removed, replaced with location-resolver
```

---

#### Week 6: Script Migration - Batch 1 (8 hours)

**Target**: Report generators (50 scripts)

**Pattern Detection**:
```bash
# Find scripts that generate reports
grep -r "\.csv\|\.pdf\|\.xlsx\|summary\.md" .claude-plugins/*/scripts/
```

**Migration Pattern**:
```javascript
// BEFORE:
const outputFile = `${outputDir}/report.csv`;
fs.writeFileSync(outputFile, csv);
console.log(`Report saved: ${outputFile}`);

// AFTER:
const resolver = require('@revpal/location-resolver');
const client = detectClient(orgAlias, portalId);

await resolver.save(
  `gdrive://${client}/03_Analytics_Exports/report-${date}.csv`,
  csv,
  { mimeType: 'text/csv' }
);

const driveUrl = resolver.getWebUrl(`gdrive://${client}/03_Analytics_Exports/report-${date}.csv`);
console.log(`Report saved to Drive: ${driveUrl}`);
```

**Automated Migration Tool**: `scripts/migrate-to-location-resolver.js`
- Uses AST analysis (like N+1 detector)
- Finds fs.writeFile patterns
- Replaces with resolver.save()
- Adds client detection
- Generates git diff for review

---

#### Week 7: Script Migration - Batch 2 (8 hours)

**Target**: Automation artifacts (100 scripts)

**Scripts**:
- Automation audit outputs
- Field analysis reports
- Validation results
- Deployment logs

**Save to**: `gdrive://{client}/_Automation_Artifacts/`

---

#### Week 8: Testing & Validation (8 hours)

**1. Create `agent doctor` Command** (3 hours)

**File**: `.claude/commands/agent-doctor.md` or plugin command

```bash
#!/usr/bin/env node
// Agent Doctor - Health check for client workspace access

const client = process.argv[2];

console.log(`🏥 Agent Doctor - Client Health Check`);
console.log(`======================================`);
console.log(`📋 Client: ${client}\n`);

// 1. Test Google Drive
console.log('1️⃣  Google Drive Access...');
try {
  const driveAuth = await auth.google.ensureAuth({ mode: 'pkce' });
  const drive = google.drive({ version: 'v3', auth: driveAuth });

  const driveId = registry.clients[client].drive.shared_drive_id;
  const driveInfo = await drive.drives.get({ driveId });

  console.log(`   ✅ Shared Drive accessible: ${driveInfo.data.name}`);

  // Test write to _Automation_Artifacts
  const folderId = registry.clients[client].drive.folders.automation_artifacts;
  await drive.files.create({
    requestBody: {
      name: `doctor-test-${Date.now()}.txt`,
      parents: [folderId],
      driveId: driveId
    },
    media: { body: 'Agent doctor test file' },
    supportsAllDrives: true
  });

  console.log(`   ✅ Write permissions: OK`);
  console.log(`   ✅ Last write: ${new Date().toISOString()}`);

} catch (error) {
  console.error(`   ❌ Drive access failed: ${error.message}`);
}

// 2. Test GitHub
console.log('\n2️⃣  GitHub Access...');
try {
  const githubAuth = await auth.github.ensureAuth({ mode: 'app' });
  const octokit = new Octokit({ auth: githubAuth.token });

  const repo = await octokit.repos.get({
    owner: registry.clients[client].github.org,
    repo: registry.clients[client].github.repos.ops
  });

  console.log(`   ✅ Repo: ${repo.data.full_name}`);
  console.log(`   ✅ Branch: ${repo.data.default_branch}`);
  console.log(`   ✅ Write permissions: ${repo.data.permissions.push ? 'OK' : 'READ-ONLY'}`);

} catch (error) {
  console.error(`   ❌ GitHub access failed: ${error.message}`);
}

// 3. Test Client Registry
console.log('\n3️⃣  Client Registry...');
if (registry.clients[client]) {
  console.log(`   ✅ Entry exists`);
  console.log(`   ✅ Drive ID: ${registry.clients[client].drive.shared_drive_id}`);
  console.log(`   ✅ GitHub repo: ${registry.clients[client].github.repos.ops}`);
} else {
  console.error(`   ❌ Client not in registry`);
}

console.log('\n======================================');
console.log('✅ Client ${client} is HEALTHY\n');
```

**2. Pilot Client Testing** (5 hours)
- Choose 3 clients: eta-corp, acme-corp, gamma-corp
- Run full workflow with each:
  - Generate automation audit
  - Save to gdrive://{client}/_Automation_Artifacts/
  - Verify file appears in Drive
  - Test retrieval
  - Test GitHub script save

**Deliverables**:
- `agent doctor` command working
- 3 pilot clients fully validated
- Issues documented and fixed
- Performance benchmarked

---

### Days 61-90: Persistence & Polish

#### Week 9: Enforcement Hooks (6 hours)

**Create**: `hooks/pre-write-location-validator.sh`

**Logic**:
```bash
#!/bin/bash
# Pre-Write Location Validator Hook
# BLOCKS Write tool with local paths (except /tmp)

TOOL_NAME="${CLAUDE_TOOL_NAME}"
FILE_PATH="${CLAUDE_TOOL_ARG_file_path:-${CLAUDE_TOOL_ARG_notebook_path}}"

if [ "$TOOL_NAME" = "Write" ] || [ "$TOOL_NAME" = "Edit" ] || [ "$TOOL_NAME" = "NotebookEdit" ]; then

  # Allow virtual URIs
  if [[ "$FILE_PATH" =~ ^(gdrive|github):// ]]; then
    exit 0  # Valid URI - allow
  fi

  # Allow temporary files
  if [[ "$FILE_PATH" =~ ^/tmp/ ]]; then
    exit 0  # Temp files OK
  fi

  # BLOCK everything else
  echo "🚫 LOCAL FILE WRITES BLOCKED" >&2
  echo "" >&2
  echo "This system requires all permanent files to be saved to:" >&2
  echo "  • Google Drive (gdrive://{client}/{folder}/{file})" >&2
  echo "  • GitHub (github://{client}/{repo}/{path})" >&2
  echo "" >&2
  echo "Examples:" >&2
  echo "  gdrive://eta-corp/_Automation_Artifacts/audit.pdf" >&2
  echo "  github://acme-corp/acme-corp-ops/scripts/sync.js" >&2
  echo "" >&2
  echo "Temporary files can use /tmp/" >&2
  echo "" >&2
  echo "See docs/CENTRALIZED_STORAGE_ARCHITECTURE.md for details" >&2

  exit 1  # Block execution
fi

exit 0  # Not a write operation, allow
```

**Deploy to**: All 9 plugins

**Testing**:
```bash
# Should BLOCK:
Write file_path="/home/user/report.csv" content="..."
# Error: 🚫 LOCAL FILE WRITES BLOCKED

# Should ALLOW:
Write file_path="gdrive://eta-corp/_Automation_Artifacts/report.csv" content="..."
# (Calls location resolver)

# Should ALLOW:
Write file_path="/tmp/temp-data.json" content="..."
# (Temporary file OK)
```

---

#### Week 10: Project Memory (8 hours)

**Optional but High ROI**

**Implementation**: Per-client document embeddings

**Storage Options**:
1. **File-based** (simple): `_Automation_Artifacts/.embeddings/`
2. **Supabase** (existing): New table `client_document_embeddings`

**Architecture**:
```javascript
// Index documents from client's Drive + GitHub
const indexer = new ProjectMemoryIndexer({
  client: 'eta-corp',
  sources: [
    'gdrive://eta-corp/**/*.md',
    'gdrive://eta-corp/**/*.pdf',
    'github://eta-corp/eta-corp-ops/**/*.md'
  ]
});

await indexer.build();

// Query scoped to client
const docs = await indexer.query('automation validation rules', {
  client: 'eta-corp',
  limit: 5
});

// Returns: Relevant docs from ONLY eta-corp's Drive/GitHub
```

**Benefits**:
- Agents can retrieve context from past work
- Scoped to client (no cross-client leakage)
- Improves accuracy (references actual deliverables)

---

#### Week 11: Admin Interface (6 hours)

**Option A**: CLI Tool (simpler)
```bash
$ client-registry add --slug newclient --name "New Client Inc"
Creating Shared Drive...
Creating GitHub repo...
Adding to registry...
✅ Client 'newclient' added

$ client-registry test --slug eta-corp
Testing Drive access... ✅
Testing GitHub access... ✅
Testing auth... ✅
✅ All checks passed

$ client-registry list
12 clients in registry:
  • eta-corp (eta-corp GmbH) - ACTIVE
  • acme-corp (acme-corp Home Lending) - ACTIVE
  • gamma-corp (Neon One) - ACTIVE
  ...
```

**Option B**: Web UI (more polished)
- Simple Express.js app
- CRUD for client registry
- Test access buttons
- Audit log viewer
- Team member management

---

#### Week 12: Compliance & Auditing (4 hours)

**1. DLP Rules** (Google Workspace Admin)
- Label "Confidential" blocks public sharing
- Shared Drives can't be shared outside org

**2. Weekly Audit Report**
```javascript
// Generate weekly report of all writes
const auditReport = await generateAuditReport({
  startDate: '2025-10-16',
  endDate: '2025-10-23'
});

// Output:
{
  week: "2025-W43",
  total_writes: 247,
  by_client: {
    eta-corp: 89,
    acme-corp: 67,
    gamma-corp: 45,
    ...
  },
  by_user: {
    "team@gorevpal.com": 156,
    "automation@revpal.com": 91
  },
  cross_client_writes: 0,  // ← Success metric
  violations: []           // ← Any blocked attempts
}
```

**3. Token Rotation Policy**
```yaml
# config/token-rotation-policy.yaml
rotation_schedule:
  google_service_account: 90_days
  github_app_key: 180_days
  oauth_refresh_tokens: 365_days

last_rotations:
  google_service_account: "2025-10-01"
  github_app_key: "2025-07-15"

next_rotations:
  google_service_account: "2025-12-30"
  github_app_key: "2026-01-12"
```

---

## Technical Design Details

### Auth Broker Architecture

**Package Structure**:
```
packages/auth-broker/
├── src/
│   ├── index.js                 # Main export
│   ├── google/
│   │   ├── pkce.js              # OAuth PKCE flow
│   │   ├── service-account.js   # Service account auth
│   │   └── token-manager.js     # Token refresh
│   ├── github/
│   │   ├── device-flow.js       # GitHub device flow
│   │   ├── app.js               # GitHub App tokens
│   │   └── token-manager.js     # Token refresh
│   ├── secrets/
│   │   ├── aws.js               # AWS Secrets Manager
│   │   ├── gcp.js               # GCP Secret Manager
│   │   └── local.js             # Local fallback (dev only)
│   └── cache/
│       └── token-cache.js       # In-memory token cache
├── test/
│   ├── google-pkce.test.js
│   ├── github-app.test.js
│   └── integration.test.js
├── package.json
└── README.md
```

**Key Classes**:
```javascript
class GoogleAuthProvider {
  async ensureAuth(options) {
    const cached = this.cache.get('google', options.mode);
    if (cached && !this.isExpired(cached)) {
      return cached;
    }

    if (options.mode === 'pkce') {
      return await this.pkceFlow(options);
    } else if (options.mode === 'service-account') {
      return await this.serviceAccountAuth(options);
    }
  }

  async pkceFlow(options) {
    // Generate code verifier
    const codeVerifier = crypto.randomBytes(32).toString('base64url');
    const codeChallenge = crypto.createHash('sha256')
      .update(codeVerifier)
      .digest('base64url');

    // Build auth URL
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;

    if (options.interactive) {
      console.log('🌐 Open this URL to authenticate:\n');
      console.log(authUrl);
      console.log('\nWaiting for authorization...');

      // Start local server to catch redirect
      const code = await this.waitForCallback();

      // Exchange code for token
      const tokens = await this.exchangeCodeForToken(code, codeVerifier);
      this.cache.set('google', 'pkce', tokens);

      return this.createOAuth2Client(tokens);
    }
  }

  async serviceAccountAuth(options) {
    // Load service account key from Secrets Manager
    const key = await this.secrets.get(options.keyPath);

    const auth = new google.auth.GoogleAuth({
      credentials: JSON.parse(key),
      scopes: options.scopes
    });

    return await auth.getClient();
  }
}
```

---

### Location Resolver Architecture

**Package Structure**:
```
packages/location-resolver/
├── src/
│   ├── index.js                 # Main export
│   ├── uri-parser.js            # Parse gdrive:// and github://
│   ├── client-registry.js       # Load and query registry
│   ├── drivers/
│   │   ├── gdrive.js            # Google Drive operations
│   │   └── github.js            # GitHub operations
│   ├── validators/
│   │   ├── uri-validator.js     # Validate URI format
│   │   └── client-validator.js  # Validate client exists
│   └── cache/
│       └── metadata-cache.js    # Cache Drive/GitHub metadata
├── test/
│   ├── uri-parser.test.js
│   ├── gdrive-driver.test.js
│   └── integration.test.js
├── package.json
└── README.md
```

**Key Classes**:
```javascript
class LocationResolver {
  constructor(options) {
    this.registry = new ClientRegistry(options.registryPath);
    this.authBroker = options.authBroker;
    this.drivers = {
      gdrive: new GoogleDriveDriver(this.authBroker),
      github: new GitHubDriver(this.authBroker)
    };
    this.cache = new MetadataCache();
  }

  async save(uri, content, options = {}) {
    // 1. Validate URI
    if (!uri.match(/^(gdrive|github):\/\//)) {
      throw new Error('Invalid URI. Must start with gdrive:// or github://');
    }

    // 2. Parse URI
    const parsed = this.parseURI(uri);
    // { protocol: 'gdrive', client: 'eta-corp', folderKey: '_Automation_Artifacts', path: 'report.csv' }

    // 3. Validate client exists
    if (!this.registry.hasClient(parsed.client)) {
      throw new Error(`Client '${parsed.client}' not found in registry`);
    }

    // 4. Resolve to actual location
    const location = await this.resolve(parsed);
    // { driveId: '0ABC...', folderId: '1XYZ...', fileName: 'report.csv' }

    // 5. Call appropriate driver
    const driver = this.drivers[parsed.protocol];
    const result = await driver.save(location, content, options);

    // 6. Return web URL for user
    return driver.getWebUrl(result);
  }

  async resolve(parsed) {
    if (parsed.protocol === 'gdrive') {
      const client = this.registry.getClient(parsed.client);
      const driveId = client.drive.shared_drive_id;
      const folderId = client.drive.folders[this.normalizeKey(parsed.folderKey)];

      if (!folderId) {
        throw new Error(`Folder '${parsed.folderKey}' not found for client '${parsed.client}'`);
      }

      return {
        driveId,
        folderId,
        fileName: path.basename(parsed.path),
        filePath: parsed.path
      };

    } else if (parsed.protocol === 'github') {
      const client = this.registry.getClient(parsed.client);
      const org = client.github.org;
      const repo = client.github.repos.ops;  // Default to ops repo
      const branch = client.github.default_branch || 'main';

      return {
        owner: org,
        repo,
        path: parsed.path,
        branch
      };
    }
  }

  // Utility: Detect client from org alias or portal ID
  getClientByOrgAlias(orgAlias) {
    for (const [slug, client] of Object.entries(this.registry.clients)) {
      if (client.platforms?.salesforce?.org_alias === orgAlias) {
        return slug;
      }
    }
    throw new Error(`No client found for org alias: ${orgAlias}`);
  }

  getClientByPortalId(portalId) {
    for (const [slug, client] of Object.entries(this.registry.clients)) {
      if (client.platforms?.hubspot?.portal_id === portalId) {
        return slug;
      }
    }
    throw new Error(`No client found for portal ID: ${portalId}`);
  }
}
```

---

### Google Drive Driver Implementation

```javascript
class GoogleDriveDriver {
  constructor(authBroker) {
    this.authBroker = authBroker;
  }

  async save(location, content, options = {}) {
    const drive = await this.getDriveClient();

    // ALWAYS use these parameters (enforced)
    const requestBody = {
      name: location.fileName,
      parents: [location.folderId],
      driveId: location.driveId,  // ← REQUIRED
      description: options.description || `Created by RevPal automation on ${new Date().toISOString()}`
    };

    const media = {
      mimeType: options.mimeType || 'text/plain',
      body: Buffer.isBuffer(content) ? content : Buffer.from(content)
    };

    const result = await drive.files.create({
      requestBody,
      media,
      supportsAllDrives: true,  // ← ALWAYS true
      fields: 'id,name,webViewLink'
    });

    console.log(`✅ Saved to Drive: ${result.data.webViewLink}`);

    return result.data;
  }

  async read(location) {
    const drive = await this.getDriveClient();

    // Search for file in folder
    const query = `name='${location.fileName}' and '${location.folderId}' in parents and trashed=false`;

    const result = await drive.files.list({
      q: query,
      driveId: location.driveId,
      supportsAllDrives: true,
      fields: 'files(id,name,mimeType)',
      pageSize: 1
    });

    if (result.data.files.length === 0) {
      throw new Error(`File not found: ${location.fileName}`);
    }

    const file = result.data.files[0];

    // Download content
    const response = await drive.files.get({
      fileId: file.id,
      alt: 'media',
      supportsAllDrives: true
    }, { responseType: 'stream' });

    // Convert stream to buffer
    const chunks = [];
    for await (const chunk of response.data) {
      chunks.push(chunk);
    }

    return Buffer.concat(chunks);
  }

  async list(location, options = {}) {
    const drive = await this.getDriveClient();

    let query = `'${location.folderId}' in parents and trashed=false`;

    if (options.filter?.extension) {
      query += ` and name contains '${options.filter.extension}'`;
    }

    const result = await drive.files.list({
      q: query,
      driveId: location.driveId,
      supportsAllDrives: true,
      fields: 'files(id,name,mimeType,modifiedTime,size,webViewLink)',
      pageSize: options.limit || 100,
      orderBy: options.sortBy || 'modifiedTime desc'
    });

    return result.data.files;
  }

  getWebUrl(fileData) {
    return fileData.webViewLink;
  }

  async getDriveClient() {
    const auth = await this.authBroker.google.ensureAuth({
      mode: process.env.CI ? 'service-account' : 'pkce',
      scopes: ['https://www.googleapis.com/auth/drive']
    });

    return google.drive({ version: 'v3', auth });
  }
}
```

---

### GitHub Driver Implementation

```javascript
class GitHubDriver {
  constructor(authBroker) {
    this.authBroker = authBroker;
  }

  async save(location, content, options = {}) {
    const octokit = await this.getOctokit();

    // Check if file exists
    let sha;
    try {
      const existing = await octokit.repos.getContent({
        owner: location.owner,
        repo: location.repo,
        path: location.path,
        ref: location.branch
      });
      sha = existing.data.sha;  // For update
    } catch (error) {
      // File doesn't exist - will create
    }

    // Create or update file
    const result = await octokit.repos.createOrUpdateFileContents({
      owner: location.owner,
      repo: location.repo,
      path: location.path,
      message: options.message || `Update ${path.basename(location.path)}`,
      content: Buffer.from(content).toString('base64'),
      branch: location.branch,
      sha: sha,  // Required for update
      committer: options.author || {
        name: 'RevPal Automation',
        email: 'automation@revpal.com'
      }
    });

    const webUrl = `https://github.com/${location.owner}/${location.repo}/blob/${location.branch}/${location.path}`;
    console.log(`✅ Saved to GitHub: ${webUrl}`);

    return result.data;
  }

  async read(location) {
    const octokit = await this.getOctokit();

    const result = await octokit.repos.getContent({
      owner: location.owner,
      repo: location.repo,
      path: location.path,
      ref: location.branch
    });

    // Decode base64 content
    return Buffer.from(result.data.content, 'base64').toString('utf8');
  }

  async getOctokit() {
    const auth = await this.authBroker.github.ensureAuth({
      mode: process.env.CI ? 'app' : 'device-flow'
    });

    return new Octokit({ auth: auth.token });
  }
}
```

---

## Migration Strategy

### Migration Tool: AST-Based Rewriter

**File**: `scripts/migrate-to-location-resolver.js`

**Approach**: Same as N+1 detector (Babel AST)

**Detection Patterns**:
```javascript
// Find patterns to migrate:

// Pattern 1: fs.writeFileSync
fs.writeFileSync('./output/report.csv', data);

// Pattern 2: fs.promises.writeFile
await fs.promises.writeFile(`${dir}/file.json`, json);

// Pattern 3: Write tool in agent
// (detected via tool declaration in frontmatter)

// Pattern 4: createWriteStream
const stream = fs.createWriteStream('./output/data.ndjson');
```

**Transformation**:
```javascript
// AST transformation
traverse(ast, {
  CallExpression(path) {
    if (isFileWrite(path.node)) {
      const filePath = extractPath(path.node);

      // Skip if already using resolver or /tmp
      if (filePath.startsWith('gdrive://') ||
          filePath.startsWith('github://') ||
          filePath.startsWith('/tmp/')) {
        return;
      }

      // Transform to resolver
      const resolverCall = createResolverCall(filePath, path.node);
      path.replaceWith(resolverCall);
    }
  }
});
```

**Usage**:
```bash
# Analyze what would change
node scripts/migrate-to-location-resolver.js .claude-plugins/opspal-salesforce --dry-run

# Output:
Found 87 file writes to migrate:
  • 45 CSV exports → gdrive://{client}/03_Analytics_Exports/
  • 28 audit reports → gdrive://{client}/_Automation_Artifacts/
  • 14 generated scripts → github://{client}/{client}-ops/scripts/

# Apply changes
node scripts/migrate-to-location-resolver.js .claude-plugins/opspal-salesforce --apply

# Creates:
#   .claude-plugins/opspal-salesforce-migrated/
# With all fs.writeFile → resolver.save transformations
```

---

### Client Detection Logic

**Problem**: Scripts know `orgAlias` or `portalId`, but need `clientSlug` for URIs

**Solution**: Registry has reverse lookups

```javascript
// In client-registry.js
class ClientRegistry {
  getClientByOrgAlias(orgAlias) {
    for (const [slug, client] of Object.entries(this.data.clients)) {
      if (client.platforms?.salesforce?.org_alias === orgAlias) {
        return slug;
      }
    }
    throw new Error(`No client found for Salesforce org: ${orgAlias}`);
  }

  getClientByPortalId(portalId) {
    for (const [slug, client] of Object.entries(this.data.clients)) {
      if (client.platforms?.hubspot?.portal_id === portalId.toString()) {
        return slug;
      }
    }
    throw new Error(`No client found for HubSpot portal: ${portalId}`);
  }

  // Also support instance names
  getClientByInstanceName(instanceName) {
    // eta-production → eta-corp
    // acme-corp-staging → acme-corp
    const baseName = instanceName.split('-')[0];
    return this.hasClient(baseName) ? baseName : null;
  }
}

// Usage in scripts:
const orgAlias = 'eta-corp';
const client = resolver.registry.getClientByOrgAlias(orgAlias);
// Returns: 'eta-corp'

const uri = `gdrive://${client}/_Automation_Artifacts/audit.pdf`;
```

---

## Enforcement & Compliance

### Pre-Write Validator Hook

**Deployment**: All 9 plugins get `hooks/pre-write-location-validator.sh`

**Logic Flow**:
```
User/Agent requests: Write file_path="/home/user/report.csv"
  ↓
Hook intercepts: CLAUDE_TOOL_NAME="Write", CLAUDE_TOOL_ARG_file_path="/home/user/report.csv"
  ↓
Check path format:
  ✅ gdrive://... → ALLOW
  ✅ github://... → ALLOW
  ✅ /tmp/... → ALLOW (temporary)
  ❌ Everything else → BLOCK
  ↓
Block with helpful error:
  "🚫 LOCAL FILE WRITES BLOCKED
   Use: gdrive://eta-corp/_Automation_Artifacts/report.csv"
```

**Effect**: **0 local files** after Day 30

---

### Pre-Commit Hook (Git)

**File**: `.claude/hooks/pre-commit-location-enforcement.sh`

**Purpose**: Block commits containing direct filesystem writes

```bash
#!/bin/bash
# Block commits with local file writes

# Check staged files for forbidden patterns
git diff --cached --name-only | while read file; do
  if [[ "$file" =~ \.(js|ts)$ ]]; then
    # Check for fs.writeFile with non-virtual paths
    if git diff --cached "$file" | grep -E "fs\.(writeFile|promises\.write)" | grep -v "^-" | grep -v "gdrive://" | grep -v "github://" | grep -v "/tmp/"; then
      echo "❌ COMMIT BLOCKED"
      echo ""
      echo "File: $file"
      echo "Contains direct filesystem write without location resolver"
      echo ""
      echo "Replace with:"
      echo "  await resolver.save('gdrive://{client}/{folder}/{file}', content);"
      exit 1
    fi
  fi
done

exit 0
```

**Deploy**: Root `.git/hooks/pre-commit` (symlink to `.claude/hooks/`)

---

### Audit Logging

**Implementation**: Location resolver logs all operations

```javascript
class LocationResolver {
  async save(uri, content, options) {
    // ... save logic ...

    // Log operation
    await this.audit.log({
      timestamp: new Date().toISOString(),
      operation: 'save',
      uri: uri,
      client: parsed.client,
      user: process.env.USER || 'automation',
      size: Buffer.byteLength(content),
      success: true
    });
  }
}

// Audit log storage
// Option 1: Append to client's audit log in Drive
await resolver.save(
  `gdrive://${client}/05_Admin/audit-log-${year}-${month}.jsonl`,
  JSON.stringify(auditEntry) + '\n',
  { append: true }
);

// Option 2: Send to Supabase (existing MCP)
await mcp__supabase__insert({
  table: 'file_operations_audit',
  data: auditEntry
});
```

**Weekly Audit Report**:
```javascript
// Generate report from audit logs
const report = await generateWeeklyAuditReport({
  week: '2025-W43'
});

// Check for violations
if (report.cross_client_writes > 0) {
  alert('🚨 Cross-client data leakage detected!');
}

if (report.violations.length > 0) {
  alert('⚠️  Blocked write attempts detected');
}
```

---

## Success Metrics

### Day 30 Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| **Auth broker adoption** | 100% | All Drive/GitHub auth goes through broker |
| **New local file writes** | 0 | Enforcement hook blocks all |
| **Client registry complete** | 100% | All 12 clients mapped |
| **Shared Drives created** | 12 | One per client, standard structure |

**Validation**:
```bash
# Check no local writes in past 7 days
find ../opspal-internal/*/instances -name "*.csv" -o -name "*.pdf" -mtime -7 | wc -l
# Expected: 0

# Check all clients in registry
yq '.clients | keys | length' config/client-registry.yaml
# Expected: 12

# Test auth broker
node packages/auth-broker/test/integration-test.js
# Expected: All auth flows pass
```

---

### Day 60 Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| **Agents using resolver** | 100% | All 23 file-writing agents migrated |
| **Scripts migrated** | ≥80% | 240+/302 scripts using resolver |
| **agent doctor pass rate** | 100% | All pilot clients healthy |
| **Drive API errors** | <1% | Successful file operations |

**Validation**:
```bash
# Check agent migrations
grep -r "@revpal/location-resolver" .claude-plugins/*/agents/*.md | wc -l
# Expected: 23

# Run doctor on all pilot clients
for client in eta-corp acme-corp gamma-corp; do
  agent doctor --client $client
done
# Expected: All pass

# Check migration progress
node scripts/migration-progress-report.js
# Shows: 240/302 scripts migrated (80%)
```

---

### Day 90 Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| **New consultant setup time** | <5 min | Time from fresh machine to first file save |
| **Cross-client writes** | 0 | Weekly audit shows no leakage |
| **Project Memory indexed** | 2-3 clients | Embeddings + retrieval working |
| **Compliance violations** | 0 | No DLP alerts, no external shares |

**Validation**:
```bash
# New consultant simulation
time {
  # 1. Clone repo
  # 2. Run: npm install
  # 3. Run: node packages/auth-broker/setup.js
  #    (Prompts for Google + GitHub auth)
  # 4. Run: agent doctor --client eta-corp
  # 5. Save test file
}
# Expected: <5 minutes

# Check weekly audit
node scripts/generate-weekly-audit.js --week 2025-W43
# Expected:
# {
#   cross_client_writes: 0,
#   violations: [],
#   total_operations: 247
# }
```

---

## Risks & Mitigations

### Risk 1: Forgotten Laptop Scripts

**Risk**: Developers have local scripts not in git that write files

**Impact**: HIGH - Scripts break after enforcement, lost work

**Mitigation**:
1. **Migration sweep** (Week 4):
   ```bash
   # Find all local scripts
   find ~/ -name "*.js" -path "*/revpal/*" -exec grep -l "fs.write" {} \;

   # Review each, move to appropriate GitHub repo
   ```

2. **CI/CD enforcement** (Week 9):
   - Pre-commit hook blocks direct filesystem writes
   - PR checks fail if patterns detected

3. **Grace period** (Day 30-45):
   - Warning mode (alerts but allows)
   - Collect violations for 2 weeks
   - Fix identified scripts
   - Then enforce strictly

---

### Risk 2: Token Sprawl

**Risk**: Team members store Google/GitHub tokens in various .env files

**Impact**: MEDIUM - Security risk, hard to rotate

**Mitigation**:
1. **Secrets Manager only**:
   - All material tokens in AWS Secrets Manager or GCP Secret Manager
   - Never in .env files
   - Auth broker fetches from Secrets Manager

2. **Pre-commit hook**:
   ```bash
   # Block commits with tokens
   git diff --cached | grep -E "(GDRIVE|GITHUB).*=" | grep -v ".env.example"
   # If match: BLOCK commit
   ```

3. **Token inventory** (Week 4):
   - Audit all existing .env files
   - Migrate to Secrets Manager
   - Delete local copies

---

### Risk 3: Shared Drive "Missing" Errors

**Risk**: Code uses Drive without `supportsAllDrives=true` and can't find Shared Drive

**Impact**: HIGH - Operations fail silently

**Mitigation**:
1. **Enforce in driver**:
   ```javascript
   // GoogleDriveDriver ALWAYS uses:
   supportsAllDrives: true
   driveId: location.driveId  // Explicit
   ```

2. **Unit tests**:
   ```javascript
   // Test that rejects requests without driveId
   expect(() => driver.save(locationWithoutDriveId))
     .toThrow('driveId is required');
   ```

3. **Validation script**:
   ```bash
   # Check all Drive API calls have supportsAllDrives
   grep -r "drive.files" packages/location-resolver/ | grep -v "supportsAllDrives: true"
   # Expected: 0 matches
   ```

---

### Risk 4: 302 Scripts to Migrate

**Risk**: Manual migration is error-prone and time-consuming

**Impact**: MEDIUM - Delays Day 60 milestone

**Mitigation**:
1. **Automated migration tool** (Week 5):
   - AST-based code rewriting
   - Batch process similar patterns
   - Generate diffs for review

2. **Phased rollout**:
   - Week 5: 50 report generators (highest value)
   - Week 6: 100 automation artifacts
   - Week 7: 80 templates/configs
   - Week 8: 72 logs (lowest priority)

3. **Validation per batch**:
   - Test migrated scripts in sandbox
   - Fix issues before next batch
   - Document patterns for future

---

### Risk 5: Performance Degradation

**Risk**: Network API calls slower than local file writes

**Impact**: MEDIUM - User experience suffers

**Mitigation**:
1. **Caching** (built into resolver):
   - Cache Drive folder metadata
   - Cache GitHub repo info
   - Reduce API calls by 80%

2. **Parallel operations** (already implemented):
   - Our N+1 fixes use Promise.all
   - Multiple files uploaded concurrently
   - No sequential bottleneck

3. **Benchmarking**:
   ```javascript
   // Measure before/after
   console.time('save_100_files');

   // Local (before)
   for (const file of files) {
     fs.writeFileSync(`./output/${file.name}`, file.content);
   }
   // Time: ~100ms

   // Drive (after)
   await Promise.all(files.map(file =>
     resolver.save(`gdrive://client/_Automation_Artifacts/${file.name}`, file.content)
   ));
   // Time: ~500ms (5× slower but acceptable)
   ```

4. **Batch uploads** (if needed):
   - Drive supports batch requests
   - Can upload 100 files in 1 HTTP request
   - Use for large export operations

---

## Questions & Decisions

### Pre-Implementation Questions

1. **Secrets Manager Choice**
   - [ ] AWS Secrets Manager (if using AWS)
   - [ ] GCP Secret Manager (if using GCP)
   - [ ] Local file (development only)

2. **GitHub App**
   - [ ] Do you have a GitHub App already?
   - [ ] Should I create one?
   - [ ] What organization? (RevPalSFDC)

3. **Pilot Clients**
   - [ ] Which 3 clients to start with?
   - Recommended: eta-corp, acme-corp, gamma-corp (largest, most active)

4. **Admin Interface**
   - [ ] Simple CLI tool
   - [ ] Web UI (Express.js app)
   - [ ] Both (CLI for automation, UI for management)

5. **Migration Intensity**
   - [ ] Conservative (manual review of all changes)
   - [ ] Balanced (automated with spot checks)
   - [ ] Aggressive (batch migrate, fix issues as found)

6. **Enforcement Timeline**
   - [ ] Immediate (Day 30 - strict enforcement)
   - [ ] Gradual (Day 30 warn, Day 45 enforce)
   - [ ] Phased (per-plugin rollout)

---

### Technical Decisions

1. **Token Storage**
   - Decision: In-memory cache + Secrets Manager
   - Rationale: Never on disk = most secure
   - Trade-off: Must re-auth on process restart (acceptable)

2. **Client Registry Format**
   - Decision: YAML (human-readable, easy to edit)
   - Alternative: JSON (easier to parse)
   - Alternative: Supabase table (dynamic, auditable)
   - Recommendation: Start YAML, migrate to Supabase if >50 clients

3. **URI Scheme**
   - Decision: `gdrive://{client}/{folder}/{path}`
   - Alternative: `drive://{driveId}/{folderId}/{file}` (explicit IDs)
   - Rationale: Human-readable, easier to construct

4. **Folder Keys**
   - Decision: Use friendly names (_Automation_Artifacts, 03_Analytics_Exports)
   - Alternative: Use Drive folder IDs directly
   - Rationale: URIs are readable, registry maps to IDs

5. **GitHub Repo Naming**
   - Decision: `{clientslug}-ops` (e.g., eta-corp-ops)
   - Alternative: All scripts in single repo with client subdirs
   - Rationale: Per-client isolation, easier access control

6. **Temporary Files**
   - Decision: Allow /tmp/* (necessary for intermediate processing)
   - Alternative: Block all local writes (too strict)
   - Rationale: Many operations need temp space

---

## Implementation Phases

### Phase 1: Foundation (Days 0-30)

**Deliverables**:
- [x] Auth broker package (`@revpal/auth-broker`)
- [x] Location resolver package (`@revpal/location-resolver`)
- [x] Client registry (`config/client-registry.yaml`)
- [x] 12 Shared Drives created with standard structure
- [x] Validation script working
- [x] SOP: "How Agents Save Files" (1-pager)

**Owner**: Platform team
**Effort**: 24 hours
**Dependencies**: Google Workspace admin access, GitHub org admin

---

### Phase 2: Integration (Days 31-60)

**Deliverables**:
- [x] 23 file-writing agents updated
- [x] 240+ scripts migrated (80% of 302)
- [x] `agent doctor` command working
- [x] 3 pilot clients validated (eta-corp, acme-corp, gamma-corp)
- [x] Performance benchmarked (acceptable latency)

**Owner**: Agent developers (distributed)
**Effort**: 36 hours
**Dependencies**: Phase 1 complete, pilot clients available

---

### Phase 3: Enforcement & Polish (Days 61-90)

**Deliverables**:
- [x] Enforcement hooks in all 9 plugins
- [x] Pre-commit hook blocking local writes
- [x] Project Memory for 2-3 clients
- [x] Admin CLI or UI
- [x] Weekly audit reports
- [x] DLP rules configured
- [x] Token rotation policy active

**Owner**: Platform team + DevOps
**Effort**: 30 hours
**Dependencies**: Phase 2 complete, 80%+ scripts migrated

---

## ROI Analysis

### Costs

| Item | Hours | Cost @ $180/hr |
|------|-------|----------------|
| **Phase 1** (Foundation) | 24 | $4,320 |
| **Phase 2** (Integration) | 36 | $6,480 |
| **Phase 3** (Enforcement) | 30 | $5,400 |
| **TOTAL** | 90 | **$16,200** |

---

### Benefits (Annual)

| Benefit | Hours Saved | Value @ $180/hr |
|---------|-------------|-----------------|
| **No lost files** | 40 hrs/yr | $7,200 |
| **Faster file access** | 60 hrs/yr | $10,800 |
| **No manual sharing** | 30 hrs/yr | $5,400 |
| **Faster onboarding** | 20 hrs/yr | $3,600 |
| **Compliance** (avoid violations) | - | $15,000 |
| **Audit trail** (incident response) | 10 hrs/yr | $1,800 |
| **TOTAL** | 160 hrs/yr | **$43,800** |

**Payback Period**: 4.4 months
**3-Year ROI**: 708% ($131,400 benefit / $16,200 cost)

---

## Next Steps

### Immediate (Before Starting)

1. **Answer Questions** (see Questions & Decisions section)
2. **Approve Plan** (review this document)
3. **Secure Resources**:
   - [ ] Google Workspace admin access
   - [ ] GitHub organization admin
   - [ ] AWS/GCP Secrets Manager access
4. **Create GitHub App** (if needed)
5. **Identify pilot clients** (3 recommended)

### Week 1 Kickoff

1. Set up development environment
2. Create `packages/` directory structure
3. Install dependencies (googleapis, @octokit/rest, etc.)
4. Begin auth broker implementation

---

## Alternative: Incremental Approach

If 90 days feels aggressive, consider **phased rollout**:

### Minimal Viable Product (MVP) - 30 Days

**Scope**: Just Google Drive (skip GitHub for now)

**Deliverables**:
- Auth broker (Google only)
- Location resolver (gdrive:// only)
- Client registry (Drive IDs only)
- 5 Shared Drives (top clients only)
- 10 highest-impact agents migrated

**Effort**: 30 hours
**Benefit**: 60% of value in 33% of time

### Expansion - Next 30 Days

**Add**: GitHub integration, remaining agents, enforcement

### Full Implementation - Final 30 Days

**Add**: Project Memory, admin UI, compliance

---

## Appendix: Example Workflows

### Workflow 1: Generate Automation Audit

**Current** (local files):
```
User: "Run automation audit for eta-corp"
Agent:
  1. Queries Salesforce metadata
  2. Analyzes flows, triggers, validation rules
  3. Generates reports
  4. Saves to: ./instances/eta-corp/automation-audit-2025-10-23/
  5. User manually uploads to Drive
  6. Shares link via Slack

Time: 20 min + 5 min manual upload
```

**Future** (centralized):
```
User: "Run automation audit for eta-corp"
Sub-agent booster hook: "Using the appropriate sub-agents, run automation audit for eta-corp"
Agent:
  1. Uses sfdc-automation-auditor agent
  2. Detects client: eta-corp
  3. Generates reports
  4. Calls: resolver.save('gdrive://eta-corp/_Automation_Artifacts/audit-2025-10-23.pdf', pdf)
  5. Returns Drive link: https://drive.google.com/file/d/1XYZ.../view
  6. Team automatically has access (eta-corp Google Group)

Time: 20 min (no manual steps)
Benefit: Instant team access, audit trail, no lost files
```

---

### Workflow 2: Create Custom Script

**Current** (scattered):
```
Developer:
  1. Writes script locally: ~/Desktop/eta-corp-sync.js
  2. Tests locally
  3. Emails script to teammate
  4. Teammate loses email
  5. Developer recreates script months later

Risk: Lost work, no version control
```

**Future** (GitHub):
```
Agent:
  1. Generates script
  2. Saves: github://eta-corp/eta-corp-ops/scripts/sync.js
  3. Automatic commit: "Add sync script"
  4. Team can pull from GitHub
  5. Version history preserved

Benefit: Never lost, version controlled, team accessible
```

---

### Workflow 3: Export Analytics Report

**Current** (manual):
```
Agent:
  1. Queries HubSpot analytics
  2. Saves CSV: ./instances/acme-corp/exports/pipeline-2025-10-23.csv
  3. User opens file
  4. Uploads to Google Sheets manually
  5. Shares Sheet link

Time: 10 min + 5 min manual upload + 2 min sharing
```

**Future** (direct to Sheets):
```
Agent (gdrive-report-exporter):
  1. Queries HubSpot analytics
  2. Calls: resolver.saveAsSheet('gdrive://acme-corp/03_Analytics_Exports/pipeline-2025-10-23', data)
  3. Creates Google Sheet directly
  4. Returns link
  5. Team auto-has access (acme-corp Google Group)

Time: 10 min (no manual steps)
Benefit: Native Sheets format, instant collaboration
```

---

## Conclusion

**Feasibility**: ✅ HIGHLY FEASIBLE

You have 80% of the infrastructure already (Google Drive MCP, agents, OAuth flows, client structure). The plan is to:

1. **Centralize auth** (auth broker)
2. **Unify addressing** (location resolver with virtual URIs)
3. **Map clients** (YAML registry)
4. **Migrate scripts** (automated tooling)
5. **Enforce** (hooks block local writes)

**Effort**: 90 hours over 12 weeks
**Payback**: 4.4 months
**3-Year ROI**: 708%

**Recommendation**: **Proceed with incremental approach**
- MVP in 30 days (Google Drive only, top 5 clients)
- Expand to GitHub + full client set (Day 31-60)
- Polish & enforce (Day 61-90)

---

**Document Version**: 1.0.0 - Planning Phase
**Next**: Answer questions, approve plan, begin Phase 1
**Status**: Ready for implementation decision
