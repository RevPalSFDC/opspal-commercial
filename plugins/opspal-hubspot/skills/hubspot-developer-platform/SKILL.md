---
name: hubspot-developer-platform
description: HubSpot Developer Platform patterns for building apps with app cards, settings components, and marketplace submission workflows.
---

# HubSpot Developer Platform Skill

Comprehensive knowledge base for building HubSpot apps using the Developer Platform.

## Skill Documents

| Document | Purpose |
|----------|---------|
| `app-cards.md` | App card development patterns and UI components |
| `settings-components.md` | Settings page creation and form patterns |
| `project-commands.md` | HubSpot CLI project commands reference |
| `marketplace-submission.md` | Marketplace requirements and submission process |

## Quick Decision Matrix

### When to Use Which Agent

| Task | Route To |
|------|----------|
| Full app development orchestration | `hubspot-app-developer` |
| Creating CRM record cards | `hubspot-app-card-builder` |
| Creating preview panel cards | `hubspot-app-card-builder` |
| Creating settings pages | `hubspot-settings-builder` |
| Serverless functions | `hubspot-cms-theme-manager` |
| OAuth and webhooks | `hubspot-api` |

### When to Use CLI vs API

| Task | Use CLI | Use API |
|------|---------|---------|
| Create new project | `hs project create` | - |
| Add app card | `hs project add` | - |
| Local development | `hs project dev` | - |
| Deploy to portal | `hs project upload` | - |
| Validate for marketplace | `hs project validate` | - |
| Read CRM data | - | HubSpot APIs |
| Write CRM data | - | HubSpot APIs |
| Manage workflows | - | HubSpot APIs |

## Prerequisites

```bash
# Required: HubSpot CLI 2025.2+
npm install -g @hubspot/cli

# Verify version
hs --version

# Authenticate
hs auth
```

## Project Structure

```
my-hubspot-app/
├── hubspot.config.yml         # CLI config (gitignored)
├── app.json                   # App manifest
├── src/
│   ├── app/
│   │   ├── extensions/        # App cards
│   │   └── settings/          # Settings pages
│   └── functions/             # Serverless functions
├── package.json
└── tsconfig.json
```

## Key Concepts

### App Cards

Custom UI components displayed within HubSpot:
- **CRM Record Tab** - Full-width cards on record pages
- **CRM Sidebar** - Side panel cards
- **Preview Panel** - Hover preview cards
- **Help Desk** - Service Hub integration
- **Sales Workspace** - Sales Hub integration

### Settings Components

React-based configuration pages:
- Allow per-account customization
- Use Panel, Tabs, Accordion for organization
- Persist via serverless functions
- Required for marketplace apps

### Serverless Functions

Backend logic for apps:
- Pre-authenticated HubSpot client
- Secrets management
- External API integration
- Data processing

### OAuth

Authentication for app access:
- Required scopes per feature
- Automatic token management
- Secure credential handling

## Common Patterns

### Data Flow

```
User Action → App Card → Serverless Function → HubSpot API → Response → UI Update
```

### Settings Flow

```
User Opens Settings → Load from Storage → Edit Form → Save to Storage → Confirmation
```

### Error Handling

```tsx
try {
  const result = await runServerlessFunction('getData');
  setData(result.response);
} catch (error) {
  setError('Failed to load data');
  console.error(error);
}
```

## Related Skills

- `skills/hubspot-cli-patterns/` - CMS CLI operations
- `skills/hubspot-agent-standards/` - API patterns
- `skills/hubspot-workflow-patterns/` - Workflow automation
