---
name: notebook-sync
description: Sync a file or assessment report to NotebookLM knowledge base
argument-hint: "eta-corp ./reports/cpq-assessment.md"
allowed-tools:
  - mcp__notebooklm__source_add_text
  - mcp__notebooklm__source_add_url
  - mcp__notebooklm__source_list
  - mcp__notebooklm__source_delete
  - Read
  - Write
  - Bash
  - Grep
  - Glob
thinking-mode: enabled
arguments:
  - name: alias
    description: Client org alias (e.g., eta-corp, acme)
    required: true
  - name: path
    description: Path to file or directory to sync
    required: true
  - name: title
    description: Custom title for the source in NotebookLM
    required: false
  - name: tier
    description: Source tier (primary, detail, external)
    required: false
    default: auto
---

# Sync Source to NotebookLM

## Purpose

**What this command does**: Adds or updates a source document in a client's NotebookLM knowledge base, with automatic formatting and tier assignment.

**When to use it**:
- ✅ After completing an assessment
- ✅ When adding new documentation
- ✅ Syncing updated RUNBOOK.md or ORG_CONTEXT.json
- ✅ Adding external references (URLs, meeting notes)

**When NOT to use it**:
- ❌ Notebook doesn't exist (run `/notebook-init` first)
- ❌ File is too large (>100KB - will be chunked automatically)

## Usage

```bash
# Basic: Sync single file
/notebook-sync eta-corp ./reports/cpq-assessment.md

# With custom title
/notebook-sync acme ./Q4-findings.md --title "Q4 2024 Assessment Findings"

# Specify tier
/notebook-sync acme-corp ./meeting-notes.md --tier external

# Sync directory (all .md files)
/notebook-sync eta-corp ./reports/
```

## PROCESS

### 1) Load Registry and Validate

**Load notebook registry:**
```bash
REGISTRY_PATH="instances/${ALIAS}/notebooklm/notebook-registry.json"
NOTEBOOK_ID=$(jq -r '.notebooks.primary.notebookId' "$REGISTRY_PATH")
```

**Validate source exists:**
```bash
if [ ! -e "$PATH" ]; then
  echo "❌ Source not found: $PATH"
  exit 1
fi
```

### 2) Determine Source Type

**File type detection:**
| Extension | Type | Handling |
|-----------|------|----------|
| .md | text | Direct add |
| .json | text | Format as readable text |
| .txt | text | Direct add |
| .pdf | url | Upload to Drive first |
| .csv | text | Convert to markdown table |
| URL | url | Add as URL source |

**Directory handling:**
```bash
if [ -d "$PATH" ]; then
  # Find all markdown files
  find "$PATH" -name "*.md" -type f | while read file; do
    echo "Syncing: $file"
  done
fi
```

### 3) Format Content

**Use source formatter:**
```bash
node scripts/lib/notebooklm-source-formatter.js \
  --input "$PATH" \
  --output /tmp/formatted-source.txt \
  --max-size 50000
```

**Formatting rules:**
- Remove redundant headers (collapse multiple `#` lines)
- Convert JSON to human-readable format
- Chunk large files into linked parts
- Add metadata header (source path, date, type)

**Metadata header:**
```markdown
---
source: instances/eta-corp/reports/cpq-assessment.md
synced_at: 2025-01-23T10:00:00Z
assessment_type: CPQ
---
```

### 4) Determine Tier (if auto)

**Tier assignment rules:**
| Pattern | Tier | Reason |
|---------|------|--------|
| RUNBOOK.md | primary | Core operational knowledge |
| ORG_CONTEXT.json | primary | Structured context |
| *SUMMARY*.md | primary | Executive summaries |
| *EXECUTIVE*.md | primary | High-level overview |
| Full assessment reports | detail | Comprehensive findings |
| Meeting notes | external | Supplementary |
| URLs | external | Reference material |

**Auto-detection:**
```javascript
function detectTier(filename, content) {
  if (filename.includes('RUNBOOK') || filename.includes('CONTEXT')) return 'primary';
  if (filename.includes('SUMMARY') || filename.includes('EXECUTIVE')) return 'primary';
  if (content.length < 5000) return 'primary';  // Short = summary
  return 'detail';
}
```

### 5) Check for Existing Source

**List current sources:**
```
Tool: source_list
Params:
  - notebook_id: {notebook_id}
```

**Check for duplicate:**
- Compare titles
- Compare content hashes
- If exists: offer to update or skip

```
⚠️ Source already exists: "CPQ Assessment Summary"
   Last synced: 2025-01-15

   Options:
   1. Update existing source
   2. Add as new version
   3. Skip
```

### 6) Add Source

**Via MCP tool:**
```
Tool: source_add_text
Params:
  - notebook_id: {notebook_id}
  - title: {title}
  - content: {formatted_content}
```

**Capture source ID from response.**

### 7) Update Manifest

**Add to source-manifest.json:**
```javascript
{
  "sourceId": "src_new123",
  "title": "CPQ Assessment Summary",
  "type": "text",
  "origin": "reports/cpq-assessment.md",
  "tier": "primary",
  "addedAt": "2025-01-23T10:00:00Z",
  "lastUpdated": "2025-01-23T10:00:00Z",
  "contentHash": "sha256_abc123"
}
```

**Add sync history entry:**
```javascript
{
  "timestamp": "2025-01-23T10:00:00Z",
  "action": "add",
  "sourceId": "src_new123",
  "origin": "reports/cpq-assessment.md",
  "status": "success"
}
```

### 8) Report Success

```
✅ Source Synced Successfully!

📄 Title: CPQ Assessment Summary
🆔 Source ID: src_new123
📁 Origin: reports/cpq-assessment.md
📊 Tier: primary
📏 Size: 4,523 characters

📚 Notebook Sources:
   Primary: 3 sources
   Detail: 5 sources
   External: 2 sources

💡 Query this content: /notebook-query eta-corp "What are the CPQ findings?"
```

## Examples

### Example 1: Sync Assessment Report

```
User: /notebook-sync eta-corp ./reports/q2c-audit/Q2C-AUDIT-SUMMARY.md

Agent:
📄 Reading source: Q2C-AUDIT-SUMMARY.md (8,234 chars)

🔧 Formatting...
   ✓ Added metadata header
   ✓ Optimized headings

📊 Auto-detected tier: primary (executive summary)

📤 Syncing to NotebookLM...
   ✓ Added as "Q2C Audit Summary - January 2025"

✅ Sync complete!
```

### Example 2: Sync Updated Runbook

```
User: /notebook-sync acme ./instances/acme/RUNBOOK.md

Agent:
⚠️ Source exists: "Operational Runbook"
   Last synced: 2025-01-10

   Detecting changes...
   ✓ 3 new sections added
   ✓ 2 sections updated

📤 Updating source...
   ✓ Source updated

✅ Runbook synced! Content refreshed.
```

### Example 3: Sync Directory

```
User: /notebook-sync acme-corp ./reports/

Agent:
📁 Scanning directory: ./reports/

📄 Found 4 markdown files:
   1. executive-summary.md → primary
   2. detailed-findings.md → detail
   3. recommendations.md → primary
   4. appendix.md → detail

📤 Syncing...
   ✓ executive-summary.md
   ✓ detailed-findings.md
   ✓ recommendations.md
   ✓ appendix.md

✅ Synced 4 sources (2 primary, 2 detail)
```

### Example 4: Sync URL

```
User: /notebook-sync eta-corp "https://docs.google.com/document/d/abc123" --title "Architecture Decision Record"

Agent:
🔗 Detected URL source

📤 Adding URL to NotebookLM...
   ✓ URL added as external source

📊 Tier: external

✅ URL synced: Architecture Decision Record
```

## Large File Handling

**Files >50KB are automatically chunked:**

```
⚠️ Large file detected: 125,432 characters

🔧 Chunking into 3 parts:
   Part 1: Sections 1-3 (45,000 chars)
   Part 2: Sections 4-6 (48,000 chars)
   Part 3: Sections 7-9 (32,432 chars)

📤 Syncing parts...
   ✓ CPQ Assessment (Part 1 of 3)
   ✓ CPQ Assessment (Part 2 of 3)
   ✓ CPQ Assessment (Part 3 of 3)

📝 Parts are cross-referenced in source manifest
```

## Error Handling

| Error | Resolution |
|-------|------------|
| Notebook not found | Run `/notebook-init {alias}` |
| File not found | Check path, use absolute path |
| Source too large | Automatically chunked |
| Auth expired | Run `/setup-notebooklm` |
| Duplicate source | Choose update or skip |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| NOTEBOOKLM_MAX_SOURCE_SIZE | 50000 | Max chars before chunking |
| NOTEBOOKLM_AUTO_TIER | true | Auto-detect source tier |
