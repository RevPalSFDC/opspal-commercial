---
description: Create a new plugin with proper structure, manifests, and boilerplate code
argument-hint: "[--interactive] [--name <name>] [--domain <domain>]"
---

# Scaffold New Plugin

Create a new plugin with proper structure, manifests, and boilerplate code.

## Task

You are scaffolding a new plugin for the OpsPal Plugin Marketplace.

**Steps:**

1. **Run the interactive scaffolding wizard**:
   ```bash
   node .claude-plugins/developer-tools-plugin/scripts/scaffold-plugin.js --interactive
   ```

2. **Answer the wizard questions**:
   - Plugin name (lowercase-hyphen-plugin format)
   - Description (1-2 sentences)
   - Domain (salesforce/hubspot/gtm/cross-platform/dev-tools/custom)
   - Number of initial agents
   - Include commands? (y/n)
   - Include hooks? (y/n)
   - Initial version (default: 1.0.0)

3. **Review the generated plugin**:
   - Plugin location: `.claude-plugins/<plugin-name>/`
   - Generated files: plugin.json, README.md, agents/, scripts/
   - Git initialized with initial commit

4. **Next steps**:
   - Review and customize placeholder agents
   - Add implementation to scripts/lib/
   - Test installation: `/plugin install <plugin-name>@revpal-internal-plugins`
   - Validate quality: `/plugin-validate <plugin-name>`

## Quick Start (Non-Interactive)

For automated creation:

```bash
node .claude-plugins/developer-tools-plugin/scripts/scaffold-plugin.js \
  --name "my-awesome-plugin" \
  --description "My plugin description" \
  --domain "salesforce" \
  --agents 3 \
  --commands \
  --version "1.0.0"
```

## Expected Output

```
🏗️  Plugin Scaffolding Wizard

Plugin name: my-awesome-plugin
Description: My awesome plugin for doing awesome things
Domain: salesforce

📁 Creating plugin structure...
📝 Generating plugin.json...
📄 Generating README.md...
🤖 Creating 3 placeholder agents...
🚫 Creating .gitignore...
🪝 Creating post-install hook...
🔧 Initializing git repository...
📦 Adding to marketplace.json...

✅ Plugin scaffolded successfully!

📍 Location: .claude-plugins/my-awesome-plugin/

📋 Next steps:
   1. Review README.md for plugin overview
   2. Customize placeholder agents in agents/
   3. Add scripts to scripts/lib/
   4. Test installation: /plugin install my-awesome-plugin@revpal-internal-plugins
   5. Run validation: /plugin-validate my-awesome-plugin
```

## Domain Templates

The scaffolder includes domain-specific templates:

- **Salesforce**: Includes sf CLI, jq, org metadata utilities
- **HubSpot**: Includes axios, API client utilities
- **GTM**: Territory planning and quota modeling structure
- **Cross-Platform**: Multi-platform orchestration
- **Dev-Tools**: Agent development and testing utilities
- **Custom**: Basic plugin structure

## Validation

After scaffolding, validate your plugin:

```bash
/plugin-validate <plugin-name>
```

## Troubleshooting

**Plugin name already exists**:
- Choose a different name
- Check `.claude-plugins/` directory
- Review marketplace.json

**Invalid plugin name**:
- Must end with `-plugin`
- Use lowercase with hyphens
- Example: `my-awesome-plugin`

**Scaffolding failed**:
- Check permissions on .claude-plugins/ directory
- Ensure git is installed
- Verify Node.js is available

## Notes

- All plugins start at version 1.0.0 (or 0.1.0 for POC)
- Placeholder agents are created with standard structure
- Git repository is initialized automatically
- Plugin is added to marketplace.json automatically
- Post-install hook validates dependencies

Remember: Scaffolding creates the structure - you customize the implementation!
