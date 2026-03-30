---
name: asana-link
description: Link Asana project(s) to current working directory (platform-agnostic)
argument-hint: "[options]"
allowed-tools:
  - Read
  - Write
  - Bash
  - mcp__asana__asana_list_workspaces
  - mcp__asana__asana_search_projects
  - mcp__asana__asana_get_project
thinking-mode: enabled
---

# Link Asana Projects to Current Directory (Centralized)

## OBJECTIVE
Associate one or more Asana projects with the current working directory by creating a `.asana-links.json` file. This enables the `/asana-update` command to know which Asana projects to update based on local work.

**Platform-agnostic**: Works with Salesforce, HubSpot, Marketo, or any project type.

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
  "platform_context": {
    "type": "salesforce|hubspot|marketo|other",
    "instance_name": "string",
    "instance_id": "string (optional)"
  },
  "last_updated": "ISO-8601 timestamp"
}
```

### 4. Confirm to User
Display:
- Number of projects linked
- Project names and URLs
- Platform context (Salesforce org, platform instance, etc.)
- Location of configuration file
- Next steps (use `/asana-update` to sync work)

## INTERACTION FLOW

1. **Get workspace** (if not already known):
   - List available workspaces using MCP tool
   - If multiple, ask user to select
   - If single, use it automatically

2. **Get platform context** (auto-detect):
   - Salesforce: Read from `.sf/`, `sfdx-project.json`, or `SF_TARGET_ORG`
   - HubSpot: Read from `.current-portal`, `.env`, or `HUBSPOT_PORTAL_ID`
   - Marketo: Read from `.env` or `MARKETO_INSTANCE`
   - Other: Allow manual entry or skip

3. **Search for projects**:
   - Ask user for search criteria (project name pattern)
   - Display matching projects
   - Allow user to select one or multiple
   - Support fuzzy matching

4. **Create/Update config**:
   - If `.asana-links.json` exists, ask to add or replace
   - Write configuration file
   - Set appropriate permissions

5. **Validate**:
   - Confirm all project GIDs are valid
   - Test accessibility
   - Report any issues

## EXAMPLES

**Example 1: Link single project for HubSpot work**
```
User: /asana-link
Assistant: Let me search for Asana projects...
Assistant: Current platform instance: production (12345678)
Assistant: Found 5 projects. Which would you like to link?
  1. HubSpot Portal Management
  2. Marketing Automation Setup
  3. Data Migration Project
  ...
User: 1
Assistant: ✓ Linked "HubSpot Portal Management" to this directory
Assistant: Portal context: production (12345678)
```

**Example 2: Link multiple projects**
```
User: /asana-link
Assistant: Enter project name pattern (or * for all): hubspot
Assistant: Found 3 matching projects:
  1. HubSpot Portal Setup
  2. HubSpot Integration Work
  3. HubSpot Data Migration
Assistant: Select projects (comma-separated numbers or 'all'): 1,2
Assistant: ✓ Linked 2 projects to this directory
```

**Example 3: Update existing links**
```
User: /asana-link
Assistant: Found existing .asana-links.json with 1 linked project.
  Current: "HubSpot Portal Management"
  Portal: production (12345678)
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
- 🎯 platform instance context
- 📁 Path to `.asana-links.json`
- 💡 Suggestion to use `/asana-update` next

## ERROR HANDLING

- **No workspace access**: Guide user to configure ASANA_ACCESS_TOKEN
- **No projects found**: Suggest broader search or manual GID entry
- **Permission denied**: Check file system permissions
- **Invalid project**: Validate GID exists and is accessible
- **No platform context**: Warn if platform instance not detected

## CONSTRAINTS

- Configuration file must be in current directory only (no traversal)
- Must validate all project GIDs before writing config
- Must handle missing environment variables gracefully
- Should support both interactive and non-interactive modes
- Must capture platform instance context for reference

## HUBSPOT-SPECIFIC FEATURES

- Detects current platform instance automatically
- Includes portal ID in Asana task titles for clarity
- Links to HubSpot-specific Asana projects
- Supports multiple portals (production, sandbox, etc.)
