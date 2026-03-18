---
description: Update or create Asana tasks based on work completed in linked project (platform-agnostic)
argument-hint: "[options]"
allowed-tools:
  - Read
  - Write
  - Bash
  - Grep
  - Glob
  - mcp__asana__asana_search_tasks
  - mcp__asana__asana_create_task
  - mcp__asana__asana_update_task
  - mcp__asana__asana_get_task
  - mcp__asana__asana_create_task_story
thinking-mode: enabled
---

# Update Asana Tasks from Local Work (Centralized)

## OBJECTIVE
Analyze work completed in the current directory and either update existing Asana tasks or create new ones in the linked Asana projects. Uses `.asana-links.json` to determine which projects to update.

**Platform-agnostic**: Works with Salesforce, HubSpot, Marketo, or any project type.

## PREREQUISITES
- `.asana-links.json` must exist in current directory (created by `/asana-link`)
- ASANA_ACCESS_TOKEN must be configured in environment

## PROCESS

### 1. Load Project Links
- Read `.asana-links.json` from current directory
- Validate all linked projects are still accessible
- Get workspace, project GIDs, and platform instance context

### 2. Analyze Local HubSpot Work
Examine the current directory for indicators of completed work:
- **Git commits**: Recent commits (last 24 hours or since last sync)
- **Modified files**: File changes with timestamps
- **HubSpot scripts**: New or modified workflow/automation scripts
- **Data files**: Processed contact/company CSVs, import results
- **README/docs**: Look for completion markers, task lists
- **Portal changes**: Workflow activations, property creations
- **API logs**: Successful operations from logs

Extract key information:
- What HubSpot operations were performed
- Portal/environment affected
- Files involved
- Completion status
- Any blockers or notes

### 3. Search for Existing Tasks
For each piece of work identified:
- Search linked Asana projects for matching tasks
- Use fuzzy matching on task names
- Include portal name in search (e.g., "production portal")
- Check task descriptions for file path references
- Identify tasks that might need updates

> **WARNING (GOTCHA-001)**: When searching by section (`sections_any`), ALWAYS include `projects_any` to prevent workspace-scoped leakage. Without it, tasks from unrelated projects will be included. If using sections_any, post-filter results with `AsanaProjectFilter.filterByProject()` as a safety net. See `docs/ASANA_API_GOTCHAS.md`.

### 4. Update or Create Tasks

**For Matching Tasks:**
- Add comment with work completed
- Update completion status if applicable
- Add file references
- Include platform context (which platform instance)
- Update assignee if needed

**For New Work:**
- Create new task in appropriate project
- Set meaningful title including portal name
- Add description with file paths and details
- Include platform instance ID in description
- Set due date if applicable
- Assign to current user (if configured)

### 5. Track Sync
Update `.asana-links.json` with:
```json
{
  "workspace_id": "string",
  "projects": [...],
  "portal_context": {
    "type": "hubspot",
    "portal_name": "production",
    "portal_id": "12345678"
  },
  "last_sync": "ISO-8601 timestamp",
  "sync_history": [
    {
      "timestamp": "ISO-8601",
      "tasks_updated": 3,
      "tasks_created": 2,
      "portal": "production",
      "summary": "Updated workflow tasks, created property migration task"
    }
  ]
}
```

## WORK DETECTION STRATEGIES

### Git-Based Detection (Primary)
```bash
# Recent commits
git log --since="24 hours ago" --pretty=format:"%h - %s" --name-only

# Changed files
git status --short
```

### File-Based Detection (Fallback)
```bash
# Recent modifications
find . -type f -mtime -1 -not -path '*/\.*'

# HubSpot-specific patterns
find . -name "*workflow*" -o -name "*property*" -o -name "*contact*" -mtime -1

# Completion markers in docs
grep -r "✅\|COMPLETED\|DONE" *.md README.md 2>/dev/null
```

### HubSpot-Specific Detection
- **Portal changes**: Check for portal config updates in `.env`, `.current-portal`
- **Workflow files**: Detect new/modified workflow JSON files
- **Property definitions**: Changes to property configuration
- **Data imports**: CSV files in data/ or import-results/
- **Script runs**: Check for script execution logs
- **API logs**: Parse HubSpot API call logs for successful operations

## TASK CREATION RULES

**Title Format:**
```
[Portal: {portal_name}] {directory}: Brief summary of work
```
Example: `[Portal: production] workflow-automation: Created lead nurture sequence`

**Description Template:**
```markdown
## HubSpot Work Completed
Portal: {portal_name} ({portal_id})
[Auto-generated summary]

## Files Modified/Created
- workflow-config.json
- properties/lead_score.json
- scripts/activate-workflow.js

## HubSpot Operations
- Created 3 new workflows
- Added 5 custom properties
- Imported 1,200 contacts

## Completion Status
[Auto-detected or user-specified]

## Notes
[Any relevant details]

---
Auto-generated from local work on [timestamp]
Portal: {portal_name}
```

**Task Properties:**
- **Assignee**: Current user (from environment or config)
- **Project**: First linked project (or user-specified)
- **Completion**: Auto-set if work appears finished
- **Due Date**: Today (for completed work) or user-specified
- **Tags**: "HubSpot", portal name, operation type

## INTERACTION MODES

### Mode 1: Automatic (Default)
Analyze work and present changes for approval before applying.

**Flow:**
1. Scan directory for local work indicators
2. Detect current portal from environment
3. Generate summary of detected work
4. Show proposed task updates/creations
5. Ask for confirmation
6. Apply changes
7. Report results

### Mode 2: Interactive
Ask user to describe local work completed.

**Flow:**
1. Prompt: "Describe the local work you completed:"
2. Ask: "Which portal? (production/sandbox/staging)"
3. User provides summary and portal
4. Confirm files/changes
5. Generate task(s) with platform context
6. Apply to Asana

### Mode 3: Git-Commit Based
Use most recent git commit as task basis.

**Flow:**
1. Get last commit message and files
2. Detect portal from file paths or .env
3. Create task matching commit
4. Include platform context
5. Link files changed
6. Mark as completed
7. Apply to Asana

## EXAMPLES

**Example 1: Automatic detection with platform context**
```
User: /asana-update
Assistant: Scanning directory for completed local work...
Assistant: Current portal: production (12345678)
Assistant: Detected:
  • 3 git commits in last 24 hours
  • Modified: workflows/lead-nurture.json, scripts/activate.js
  • Created: reports/WORKFLOW_SUMMARY.md
  • Portal: production