# Release v2.2.0: Robust Configuration & Environment-First Discovery

## 🎯 Overview
This minor release introduces critical improvements to prevent configuration loss and ensure accurate Salesforce environment discovery. Based on real-world feedback from the Business Unit related list issue, we've implemented a robust, self-healing configuration system and mandatory environment-first discovery protocol.

## ✨ Key Features

### 1. Self-Healing Claude Code Configuration
- **Persistent Configuration**: All settings now stored in `.claude/` directory (source-controlled)
- **Validation Hooks**: Automatic checks on session start to detect missing components
- **Recovery Commands**: `/bootstrap` instantly repairs any missing configuration
- **Agent Persistence**: Agents stored as markdown files that won't "disappear" between sessions

### 2. Environment-First Discovery Protocol
- **Mandatory Org Queries**: MUST query Salesforce directly before ANY operation
- **No More Local File Assumptions**: Never rely on local files alone to understand org state
- **Comprehensive Discovery**: Complete command reference for querying Lightning Pages, Layouts, Fields
- **Real Example Applied**: Business Unit issue would have been prevented with these checks

### 3. Core Infrastructure
- **Project Agents Created**:
  - `release-coordinator.md` - Orchestrates releases
  - `claudesfdc.md` - Salesforce specialist with env-first discovery
  - `claudehubspot.md` - HubSpot specialist
  - `principal-engineer.md` - Top-level orchestrator
  
- **Essential Commands**:
  - `/bootstrap` - Initialize/repair configuration
  - `/ship-release` - Execute full release workflow
  - `/sfdc-discovery` - Salesforce discovery reference

- **Persistent Integrations**:
  - Slack notifications via webhook
  - MCP server configurations
  - Git-tracked settings

## 📊 What Changed

### Files Added
- `.claude/` directory structure with agents, commands, hooks
- `.mcp.json` for MCP server configuration
- `CLAUDE.md` with comprehensive project guidelines
- Discovery command reference and templates

### Files Modified
- Enhanced ClaudeSFDC agent with environment-first requirements
- Updated CLAUDE.md files with discovery protocols
- Added real-world examples from Business Unit issue

## 🔍 Problem Solved

**Before v2.2.0:**
- ❌ Agents would "disappear" between sessions
- ❌ Checked local files instead of querying Salesforce
- ❌ Missed existing configurations (like Org_Contact_Page)
- ❌ Created duplicate work and confusion

**After v2.2.0:**
- ✅ Configuration persists in source control
- ✅ Always queries Salesforce org directly first
- ✅ Discovers ALL existing configurations
- ✅ Self-healing with `/bootstrap` command

## 📝 Example: How It Prevents Issues

```bash
# OLD WAY (would miss existing pages)
ls force-app/main/default/flexipages/

# NEW WAY (discovers everything in org)
sf data query --query "SELECT DeveloperName FROM FlexiPage WHERE EntityDefinitionId = 'Contact'" --use-tooling-api
```

## 🚀 Upgrade Instructions

1. Pull the latest changes
2. Run `/bootstrap` to initialize configuration
3. Set environment variables:
   ```bash
   export SLACK_WEBHOOK_URL='your-webhook'
   export USE_BUILTIN_RIPGREP=0
   ```
4. Verify with `.claude/hooks/validate.sh`

## 🔧 Breaking Changes
None - This release is fully backward compatible.

## 🐛 Bug Fixes
- Fixed agents "disappearing" between Claude Code sessions
- Resolved issue where existing Salesforce configurations were not discovered
- Corrected local file dependency that missed org state

## 📚 Documentation
- Added comprehensive CLAUDE.md with project standards
- Created discovery command reference
- Documented Business Unit issue as learning example
- Included recovery procedures for common problems

## 🙏 Acknowledgments
Special thanks for the detailed feedback on the Business Unit related list issue, which directly led to these improvements.

## 📅 Release Date
September 4, 2025

---
*This release ensures your Claude Code configuration is robust, recoverable, and always checks the actual Salesforce environment first.*