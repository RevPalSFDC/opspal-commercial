---
name: sop-map
description: Create or update SOP target mappings — route work classifications to Asana boards, projects, and sections
argument-hint: "[classification] [--update] [--dry-run]"
visibility: user-invocable
tags:
  - sop
  - mapping
  - asana
allowed-tools:
  - AskUserQuestion
  - Read
  - Write
  - Bash
  - mcp__asana__asana_list_workspaces
  - mcp__asana__asana_search_projects
  - mcp__asana__asana_get_project
  - mcp__asana__asana_get_project_sections
---

# SOP Map — Configure Target Mappings

## Purpose

Create or update the classification-to-Asana-target routing used by SOP policies. Supports one-to-many routing: a single work event can update multiple boards/projects.

## Pre-check

Verify `config/sop/sop-config.yaml` exists. If not, advise: "Run `/sop-init` first."

If `--update` flag is present, load existing `config/sop/mappings/` and show current state before modifications.

## Interactive Wizard

**Step 1 — Discover workspaces**:
Call `mcp__asana__asana_list_workspaces` and present the list.
Ask: "Which workspace contains your SOP tracking projects?"

**Step 2 — Select classifications**:
Present the 7 classification types: `audit`, `report`, `build`, `migration`, `configuration`, `consultation`, `support`.
Ask: "Which classifications do you want to configure targets for?" (multi-select)

**Step 3 — For each selected classification**:
1. Search Asana: `mcp__asana__asana_search_projects` in the selected workspace
2. Ask: "Select the Asana project for `{classification}` work:" — user selects from list or provides GID manually
3. Fetch sections: `mcp__asana__asana_get_project_sections` for the selected project
4. Ask: "Which section should new tasks/comments land in by default?"
5. Ask: "Should this classification also route to any secondary projects?" — if yes, repeat project selection

**Step 4 — Preview**:
Show the YAML mapping that would be written. If `--dry-run`, stop here.

**Step 5 — Write**:
Write to `config/sop/mappings/standard-client-boards.yaml` (or a new mapping file if user specifies a custom name).

## Output Schema

```yaml
id: standard-client-boards
schema_version: "1.0.0"
version: "1.0.0"
workspace_gid: "<selected workspace>"
description: "Client delivery board routing"
targets:
  - asana_project_gid: "<selected>"
    asana_section_gid: "<selected>"
    board_name: "<project name>"
    match_criteria:
      classification: [audit]
  - asana_project_gid: "<selected>"
    asana_section_gid: "<selected>"
    board_name: "<project name>"
    match_criteria:
      classification: [build]
```

## Post-Map

Print: "Mapping saved. Run `/sop-review` to see the full effective configuration."
