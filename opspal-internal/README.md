# Platform-Specific Modules

This directory contains platform-specific implementations for the RevPal Agent System.

## Directory Structure

```
platforms/
├── SFDC/       # Salesforce platform module (formerly ClaudeSFDC)
└── HS/         # HubSpot platform module (formerly ClaudeHubSpot)
```

## Platform Modules

### SFDC (Salesforce)
The Salesforce platform module contains:
- Salesforce-specific agents and tools
- Metadata management utilities
- APEX development tools
- Flow and validation rule management
- Error logging and monitoring system

**Key Files:**
- `CLAUDE.md` - Salesforce development guidelines
- `AGENT_CATALOG.md` - Complete list of SFDC agents
- `package.json` - Dependencies and scripts

### HS (HubSpot)
The HubSpot platform module contains:
- HubSpot-specific agents and tools
- Workflow automation tools
- Property management utilities
- API integration helpers
- OAuth authentication setup

**Key Files:**
- `README.md` - HubSpot platform overview
- `QUICK_REFERENCE.md` - Quick command reference
- `package.json` - Dependencies and scripts

## Usage

To work with a specific platform:

```bash
# Navigate to Salesforce module
cd platforms/SFDC

# Navigate to HubSpot module
cd platforms/HS
```

## Platform References

When referencing these modules in configuration files or imports:
- Use `platforms/SFDC` instead of `ClaudeSFDC`
- Use `platforms/HS` instead of `ClaudeHubSpot`

Example:
```yaml
# In CLAUDE.md or other config files
@import platforms/SFDC/CLAUDE.md
@import platforms/HS/README.md
```

## Development

Each platform module is independently maintained with its own:
- Package dependencies
- Test suites
- Documentation
- Release cycles

## Migration Note

These modules were renamed from:
- `ClaudeSFDC` → `platforms/SFDC`
- `ClaudeHubSpot` → `platforms/HS`

The rename was done to:
1. Provide cleaner, shorter names
2. Group platform-specific code logically
3. Improve project organization

---
*Last Updated: 2025-09-10*