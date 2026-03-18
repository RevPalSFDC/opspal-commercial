---
name: notebook-init
description: Create a new NotebookLM notebook for a client org or project
argument-hint: "eta-corp"
allowed-tools:
  - mcp__notebooklm__notebook_create
  - mcp__notebooklm__notebook_list
  - mcp__notebooklm__notebook_get
  - mcp__notebooklm__source_add_text
  - Read
  - Write
  - Bash
  - Grep
  - Glob
thinking-mode: enabled
arguments:
  - name: alias
    description: Client org alias or project name (e.g., eta-corp, acme, opspal-dev)
    required: true
  - name: type
    description: Notebook type (client, project, internal)
    required: false
    default: client
  - name: sources
    description: Initial sources to add (comma-separated paths)
    required: false
---

# Initialize NotebookLM Notebook

## Purpose

**What this command does**: Creates a new NotebookLM notebook for a client, project, or internal use, and optionally populates it with initial sources.

**When to use it**:
- ✅ First assessment for a new client
- ✅ Starting a new internal project that needs knowledge tracking
- ✅ Setting up knowledge base for cross-assessment context

**When NOT to use it**:
- ❌ Notebook already exists (use `/notebook-sync` to add sources)
- ❌ NotebookLM not configured (run `/setup-notebooklm` first)

## Usage

```bash
# Basic: Create client notebook
/notebook-init eta-corp

# With type specification
/notebook-init opspal-dev --type project

# With initial sources
/notebook-init acme --sources "./RUNBOOK.md,./ORG_CONTEXT.json"
```

## PROCESS

### 1) Verify Prerequisites

**Check auth exists:**
```bash
if [ ! -f "$HOME/.notebooklm-mcp/auth.json" ]; then
  echo "❌ NotebookLM not configured. Run /setup-notebooklm first."
  exit 1
fi
```

**Check MCP server available:**
- List MCP servers
- Verify notebooklm is responding

### 2) Check for Existing Notebook

**Query notebook_list:**
- Search for notebooks matching the alias pattern
- If found, ask user if they want to use existing or create new

**Report findings:**
```
🔍 Checking for existing notebooks...
   Found: eta-corp - GTM Architecture (nlm_abc123)

   Would you like to:
   1. Use existing notebook
   2. Create new notebook
   3. Cancel
```

### 3) Gather Client Metadata (for type=client)

**Auto-detect from instance directory:**
```bash
# Check multiple possible locations
INSTANCE_PATHS=(
  "instances/salesforce/${ALIAS}/"
  "instances/${ALIAS}/"
  "orgs/${ALIAS}/platforms/salesforce/"
)

for path in "${INSTANCE_PATHS[@]}"; do
  if [ -d "$path" ]; then
    INSTANCE_PATH="$path"
    break
  fi
done
```

**Extract display name:**
- From RUNBOOK.md header
- From ORG_CONTEXT.json `displayName` field
- Fallback: Capitalize alias

**Example metadata:**
```json
{
  "alias": "eta-corp",
  "displayName": "eta-corp",
  "instancePath": "instances/salesforce/eta-corp/",
  "platforms": ["salesforce"],
  "hasRunbook": true,
  "hasOrgContext": true
}
```

### 4) Create Notebook

**Naming Convention (Hybrid):**
- **Internal ID**: `{alias}-gtm` (e.g., `eta-corp-gtm`)
- **Display Name**: `{DisplayName} - GTM Architecture` or `{DisplayName} - {Type} Knowledge Base`

**Create via MCP:**
```
Tool: notebook_create
Params:
  - name: "eta-corp - GTM Architecture"
```

**Capture notebook ID from response.**

### 5) Add Initial Sources (if available)

**Auto-detect sources for client type:**
```bash
# Priority sources
SOURCES=(
  "${INSTANCE_PATH}/RUNBOOK.md"
  "${INSTANCE_PATH}/ORG_CONTEXT.json"
)

# Optional: Recent assessment reports
find "${INSTANCE_PATH}" -name "*SUMMARY*.md" -mtime -30 | head -5
```

**Add each source via MCP:**
```
Tool: source_add_text
Params:
  - notebook_id: {notebook_id}
  - title: "Operational Runbook"
  - content: {file_content}
```

**Source hierarchy assignment:**
| Source Type | Tier |
|-------------|------|
| RUNBOOK.md | Primary |
| ORG_CONTEXT.json | Primary |
| Executive summaries | Primary |
| Full assessment reports | Detail |
| Meeting notes | External |

### 6) Create Registry Files

**Create directory structure:**
```bash
mkdir -p "${INSTANCE_PATH}/notebooklm"
mkdir -p "${INSTANCE_PATH}/notebooklm/drafts"
mkdir -p "${INSTANCE_PATH}/notebooklm/approved"
mkdir -p "${INSTANCE_PATH}/notebooklm/delivered"
```

**Create notebook-registry.json:**
```json
{
  "version": "1.0.0",
  "lastUpdated": "2025-01-23T00:00:00Z",
  "orgAlias": "eta-corp",
  "displayName": "eta-corp",
  "notebooks": {
    "primary": {
      "notebookId": "nlm_abc123",
      "displayName": "eta-corp - GTM Architecture",
      "internalId": "eta-corp-gtm",
      "purpose": "gtm-architecture",
      "createdAt": "2025-01-23T00:00:00Z",
      "lastSyncedAt": "2025-01-23T00:00:00Z"
    }
  },
  "driveConfig": {
    "enabled": false,
    "folderPaths": [],
    "lastResearchAt": null
  }
}
```

**Create source-manifest.json:**
```json
{
  "version": "1.0.0",
  "lastUpdated": "2025-01-23T00:00:00Z",
  "sources": {
    "primary": [],
    "detail": [],
    "external": [],
    "discovered": []
  },
  "syncHistory": []
}
```

### 7) For Project Type

**Alternative registry location:**
```bash
mkdir -p "$HOME/.notebooklm-mcp/projects"
# Registry: ~/.notebooklm-mcp/projects/{alias}-registry.json
```

### 8) Report Success

```
✅ Notebook Created Successfully!

📓 Notebook: eta-corp - GTM Architecture
🆔 ID: nlm_abc123
📁 Registry: instances/salesforce/eta-corp/notebooklm/notebook-registry.json

📚 Sources Added:
   ✓ Operational Runbook (RUNBOOK.md)
   ✓ Org Context (ORG_CONTEXT.json)

📋 Next Steps:
   1. Sync more sources: /notebook-sync eta-corp <path>
   2. Query context: /notebook-query eta-corp "What are the key findings?"
   3. Configure Drive: Add folder paths to notebook-registry.json

💡 Tip: After assessments, sources auto-sync if NOTEBOOKLM_AUTO_SYNC=true
```

## Examples

### Example 1: New Client

```
User: /notebook-init eta-corp

Agent:
🔍 Checking prerequisites...
✓ NotebookLM auth valid
✓ Instance found: instances/salesforce/eta-corp/

📝 Creating notebook...
   Display: eta-corp - GTM Architecture
   Internal ID: eta-corp-gtm

📚 Adding initial sources...
   ✓ RUNBOOK.md → Primary
   ✓ ORG_CONTEXT.json → Primary

📁 Registry created: instances/salesforce/eta-corp/notebooklm/

✅ Notebook initialized!
```

### Example 2: Project Notebook

```
User: /notebook-init opspal-v2 --type project

Agent:
🔍 Checking prerequisites...
✓ NotebookLM auth valid

📝 Creating project notebook...
   Display: OpsPal V2 - Project Knowledge Base
   Internal ID: opspal-v2-project

📁 Registry: ~/.notebooklm-mcp/projects/opspal-v2-registry.json

✅ Project notebook initialized!
```

### Example 3: With Custom Sources

```
User: /notebook-init acme --sources "./docs/architecture.md,./docs/decisions.md"

Agent:
📝 Creating notebook: Acme Corp - GTM Architecture

📚 Adding sources...
   ✓ architecture.md → Primary
   ✓ decisions.md → Primary
   ✓ RUNBOOK.md (auto-detected) → Primary

✅ Notebook initialized with 3 sources!
```

## Error Handling

| Error | Resolution |
|-------|------------|
| Auth not found | Run `/setup-notebooklm` |
| Notebook already exists | Offer to use existing or create new |
| Instance not found | Prompt for instance path |
| Source file not found | Warn and continue with available sources |
| MCP timeout | Retry with increased timeout |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| NOTEBOOKLM_AUTO_SYNC | true | Auto-sync after assessments |
| NOTEBOOKLM_DEFAULT_TYPE | client | Default notebook type |

## Registry Locations

| Type | Registry Path |
|------|---------------|
| client | `instances/{org}/notebooklm/notebook-registry.json` |
| project | `~/.notebooklm-mcp/projects/{alias}-registry.json` |
| internal | `.claude-plugins/opspal-core/notebooklm/{alias}-registry.json` |
