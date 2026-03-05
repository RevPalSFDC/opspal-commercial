---
description: Update or create Asana tasks based on work completed in linked project
allowed-tools: Read, Write, Bash, Grep, Glob, mcp__asana__asana_search_tasks, mcp__asana__asana_create_task, mcp__asana__asana_update_task, mcp__asana__asana_get_task, mcp__asana__asana_create_task_story
thinking-mode: enabled
---

# Update Asana Tasks from Local Work

## OBJECTIVE
Analyze work completed in the current directory and either update existing Asana tasks or create new ones in the linked Asana projects. Uses `.asana-links.json` to determine which projects to update.

## PREREQUISITES
- `.asana-links.json` must exist in current directory (created by `/asana-link`)
- ASANA_ACCESS_TOKEN must be configured in environment

## PROCESS

### 1. Load Project Links
- Read `.asana-links.json` from current directory
- Validate all linked projects are still accessible
- Get workspace and project GIDs

### 2. Analyze Local Work
Examine the current directory for indicators of completed work:
- **Git commits**: Recent commits (last 24 hours or since last sync)
- **Modified files**: File changes with timestamps
- **README/docs**: Look for completion markers, task lists
- **Scripts**: New or modified script files
- **Data files**: Processed data, reports generated
- **Backup timestamps**: Backup files indicating completed operations

Extract key information:
- What was done (summary)
- Files involved
- Completion status
- Any blockers or notes

### 3. Search for Existing Tasks
For each piece of work identified:
- Search linked Asana projects for matching tasks
- Use fuzzy matching on task names
- Check task descriptions for file path references
- Identify tasks that might need updates

### 4. Update or Create Tasks

**For Matching Tasks:**
- Add comment with work completed
- Update completion status if applicable
- Add file references
- Update assignee if needed

**For New Work:**
- Create new task in appropriate project
- Set meaningful title from work summary
- Add description with file paths and details
- Set due date if applicable
- Assign to current user (if configured)

### 5. Track Sync
Update `.asana-links.json` with:
```json
{
  "workspace_id": "string",
  "projects": [...],
  "last_sync": "ISO-8601 timestamp",
  "sync_history": [
    {
      "timestamp": "ISO-8601",
      "tasks_updated": 3,
      "tasks_created": 2,
      "summary": "Updated deployment tasks, created backup task"
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

# Completion markers in docs
grep -r "✅\|COMPLETED\|DONE" *.md README.md 2>/dev/null
```

### Project-Specific Detection
- **SFDC Projects**: Look for deployment summaries, backup JSONs, completion reports
- **Data Projects**: Check for processed CSVs, analysis reports
- **Script Projects**: Identify new/modified .js/.sh files

## TASK CREATION RULES

**Title Format:**
```
[Directory]: Brief summary of work
```
Example: `[contact-cleanup]: Processed 184 contacts with fuzzy matching`

**Description Template:**
```markdown
## Work Completed
[Auto-generated summary]

## Files Modified/Created
- file1.js
- file2.csv
- report.md

## Completion Status
[Auto-detected or user-specified]

## Notes
[Any relevant details]

---
Auto-generated from local work on [timestamp]
```

**Task Properties:**
- **Assignee**: Current user (from environment or config)
- **Project**: First linked project (or user-specified)
- **Completion**: Auto-set if work appears finished
- **Due Date**: Today (for completed work) or user-specified

## INTERACTION MODES

### Mode 1: Automatic (Default)
Analyze work and present changes for approval before applying.

**Flow:**
1. Scan directory for work indicators
2. Generate summary of detected work
3. Show proposed task updates/creations
4. Ask for confirmation
5. Apply changes
6. Report results

### Mode 2: Interactive
Ask user to describe work completed.

**Flow:**
1. Prompt: "Describe the work you completed:"
2. User provides summary
3. Confirm files/changes
4. Generate task(s)
5. Apply to Asana

### Mode 3: Git-Commit Based
Use most recent git commit as task basis.

**Flow:**
1. Get last commit message and files
2. Create task matching commit
3. Link files changed
4. Mark as completed
5. Apply to Asana

## EXAMPLES

**Example 1: Automatic detection**
```
User: /asana-update
Assistant: Scanning directory for completed work...
Assistant: Detected:
  • 3 git commits in last 24 hours
  • Modified: scripts/renewal-import.js, data/renewals-processed.csv
  • Created: reports/COMPLETION_SUMMARY.md

Assistant: Proposed updates:
  1. UPDATE existing task "Renewal Import Script"
     → Add comment: "Completed renewal import for 184 opportunities"
  2. CREATE new task "Renewal Data Processing"
     → Status: Complete
     → Files: renewals-processed.csv, COMPLETION_SUMMARY.md

A: Apply these changes? (y/n): y
A: ✅ Updated 1 task, created 1 task
A: 🔗 View in Asana: [links...]
```

**Example 2: Interactive mode**
```
User: /asana-update
Assistant: No recent git commits detected. Would you like to describe your work?
User: I finished the contact cleanup project - processed 184 contacts with fuzzy matching
Assistant: Great! I'll create a task for this work.
Assistant: Which linked project?
  1. Salesforce Data Cleanup
  2. Contact Management
User: 1
Assistant: ✅ Created task "Contact Cleanup - 184 contacts processed"
```

**Example 3: No linked projects**
```
User: /asana-update
Assistant: ❌ No .asana-links.json found in current directory
Assistant: 💡 Run /asana-link first to link Asana projects
```

## OUTPUT FORMAT

Always provide clear feedback:
```
📊 Work Analysis Summary
  • Git commits: [count]
  • Files modified: [count]
  • Completion markers: [count]

📝 Proposed Changes
  [List of updates/creates]

✅ Results (after confirmation)
  • Tasks updated: [count]
  • Tasks created: [count]
  • Comments added: [count]

🔗 Asana Links
  [Task URLs]
```

## ERROR HANDLING

- **No .asana-links.json**: Prompt to run `/asana-link` first
- **No work detected**: Offer interactive mode or manual task creation
- **Asana API errors**: Report clearly, suggest retry
- **Permission issues**: Check ASANA_ACCESS_TOKEN configuration
- **Duplicate tasks**: Warn user, offer to skip or force create

## SMART MATCHING RULES

When searching for existing tasks:
1. **Exact match**: Task title contains directory name
2. **File path match**: Task description mentions modified files
3. **Time-based**: Tasks created/modified in last 7 days
4. **Keyword match**: Task title contains key terms from work summary

## CONSTRAINTS

- Must check for `.asana-links.json` before proceeding
- Must get user confirmation before creating/updating tasks
- Must not create duplicate tasks (check for similar existing tasks)
- Must handle rate limiting gracefully
- Should batch operations when possible
- Must track sync history for auditing

## SYNC HISTORY TRACKING

Maintain sync log in `.asana-links.json`:
```json
{
  "sync_history": [
    {
      "timestamp": "2025-10-03T14:30:00Z",
      "mode": "automatic|interactive|git-based",
      "tasks_updated": 2,
      "tasks_created": 1,
      "files_analyzed": 15,
      "git_commits": 3,
      "user_confirmed": true,
      "summary": "Brief description of changes"
    }
  ]
}
```

Limit history to last 50 syncs to keep file size manageable.