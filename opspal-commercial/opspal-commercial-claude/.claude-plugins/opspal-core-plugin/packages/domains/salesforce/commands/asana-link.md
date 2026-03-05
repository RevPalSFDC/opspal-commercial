---
description: Link Asana project(s) to current working directory
allowed-tools: Read, Write, Bash, mcp__asana__asana_list_workspaces, mcp__asana__asana_search_projects, mcp__asana__asana_get_project
thinking-mode: enabled
---

# Link Asana Projects to Current Directory

## OBJECTIVE
Associate one or more Asana projects with the current working directory by creating a `.asana-links.json` file. This enables the `/asana-update` command to know which Asana projects to update based on local work.

## PROCESS

### 1. Determine Current Directory
Get the current working directory to understand the project context.

### 2. Search for Asana Projects
Use the Asana MCP tools to:
- List available workspaces
- Search for projects matching user's criteria
- Allow user to select which projects to link

### 3. Create Link Configuration
Create or update `.asana-links.json` in the current directory with:
```json
{
  "workspace_id": "string",
  "projects": [
    {
      "gid": "string",
      "name": "string",
      "permalink_url": "string",
      "linked_at": "ISO-8601 timestamp"
    }
  ],
  "last_updated": "ISO-8601 timestamp"
}
```

### 4. Confirm to User
Display:
- Number of projects linked
- Project names and URLs
- Location of configuration file
- Next steps (use `/asana-update` to sync work)

## INTERACTION FLOW

1. **Get workspace** (if not already known):
   - List available workspaces using MCP tool
   - If multiple, ask user to select
   - If single, use it automatically

2. **Search for projects**:
   - Ask user for search criteria (project name pattern)
   - Display matching projects
   - Allow user to select one or multiple
   - Support fuzzy matching

3. **Create/Update config**:
   - If `.asana-links.json` exists, ask to add or replace
   - Write configuration file
   - Set appropriate permissions

4. **Validate**:
   - Confirm all project GIDs are valid
   - Test accessibility
   - Report any issues

## EXAMPLES

**Example 1: Link single project**
```
User: /asana-link
Assistant: Let me search for Asana projects...
Assistant: Found 5 projects. Which would you like to link?
  1. Salesforce RevOps Audit
  2. sample-org Implementation
  3. Data Cleanup Initiative
  ...
User: 1
Assistant: ✓ Linked "Salesforce RevOps Audit" to this directory
```

**Example 2: Link multiple projects**
```
User: /asana-link
Assistant: Enter project name pattern (or * for all): sample-org
Assistant: Found 2 matching projects:
  1. sample-org Implementation
  2. sample-org UAT Testing
Assistant: Select projects (comma-separated numbers or 'all'): all
Assistant: ✓ Linked 2 projects to this directory
```

**Example 3: Update existing links**
```
User: /asana-link
Assistant: Found existing .asana-links.json with 1 linked project.
  Current: "Salesforce RevOps Audit"
Assistant: Would you like to:
  1. Add more projects
  2. Replace with new projects
  3. Cancel
User: 1
Assistant: [continues with project search...]
```

## OUTPUT

Always provide:
- ✅ Success confirmation
- 📋 List of linked projects with URLs
- 📁 Path to `.asana-links.json`
- 💡 Suggestion to use `/asana-update` next

## ERROR HANDLING

- **No workspace access**: Guide user to configure ASANA_ACCESS_TOKEN
- **No projects found**: Suggest broader search or manual GID entry
- **Permission denied**: Check file system permissions
- **Invalid project**: Validate GID exists and is accessible

## CONSTRAINTS

- Configuration file must be in current directory only (no traversal)
- Must validate all project GIDs before writing config
- Must handle missing environment variables gracefully
- Should support both interactive and non-interactive modes
