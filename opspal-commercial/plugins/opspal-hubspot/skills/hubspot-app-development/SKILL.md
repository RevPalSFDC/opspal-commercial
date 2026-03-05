---
name: hubspot-app-development
description: HubSpot app development lifecycle from creation to marketplace. Use when building HubSpot apps, adding CRM cards, configuring settings, or deploying to marketplace.
allowed-tools:
  - Read
  - Grep
  - Glob
---

# HubSpot App Development

## When to Use This Skill

- Creating new HubSpot apps
- Adding CRM cards to apps
- Configuring app settings pages
- Deploying apps to sandbox/production
- Validating apps for marketplace submission

## Quick Reference

### Development Lifecycle

| Phase | Command | Output |
|-------|---------|--------|
| 1. Create | `/hs-app-create` | App scaffold with manifest |
| 2. Add Cards | `/hs-app-card-add` | CRM card component |
| 3. Add Settings | `/hs-settings-add` | Settings page |
| 4. Validate | `/hs-app-validate` | Validation report |
| 5. Deploy | `/hs-app-deploy` | Deployed app |

### App Types

| Type | Use Case | Auth Type |
|------|----------|-----------|
| **Private** | Internal tools, single portal | API key |
| **Public** | Multi-portal, marketplace | OAuth 2.0 |
| **Custom CRM** | CRM customization | OAuth 2.0 |
| **Sales Extension** | Sales process tools | OAuth 2.0 |

### Commands

```bash
# Create app
/hs-app-create --name "My App" --type private
/hs-app-create --name "My App" --type public --scopes "crm.objects.contacts.read"

# Add components
/hs-app-card-add --app "My App" --object contact --card-type timeline
/hs-settings-add --app "My App" --page "Configuration"

# Validate and deploy
/hs-app-validate --app "My App"
/hs-app-deploy --app "My App" --env sandbox
```

## App Manifest Structure

```json
{
  "name": "My HubSpot App",
  "description": "App description",
  "uid": "my-app-unique-id",
  "scopes": [
    "crm.objects.contacts.read",
    "crm.objects.contacts.write"
  ],
  "auth": {
    "type": "oauth",
    "redirectUrls": ["https://myapp.com/oauth/callback"],
    "requiredScopes": ["crm.objects.contacts.read"]
  },
  "extensions": {
    "crm": {
      "cards": []
    }
  }
}
```

## CRM Card Types

### Timeline Card
Shows events in contact/company timeline.

```json
{
  "type": "timeline",
  "objectTypes": ["contact", "company"],
  "title": "Activity Timeline",
  "fetch": {
    "targetUrl": "https://myapp.com/api/timeline",
    "objectTypes": [
      { "name": "CONTACT", "propertiesToSend": ["email"] }
    ]
  }
}
```

### Data Card
Displays custom data panels.

```json
{
  "type": "crm",
  "title": "Customer Insights",
  "fetch": {
    "targetUrl": "https://myapp.com/api/insights"
  },
  "display": {
    "properties": [
      { "name": "score", "label": "Health Score" },
      { "name": "lastActivity", "label": "Last Activity" }
    ]
  }
}
```

### Action Card
Provides interactive actions.

```json
{
  "type": "crm",
  "title": "Quick Actions",
  "actions": [
    {
      "type": "ACTION_HOOK",
      "httpMethod": "POST",
      "uri": "https://myapp.com/api/actions/sync",
      "label": "Sync to External System"
    }
  ]
}
```

## OAuth Scopes Reference

### CRM Scopes
| Scope | Description |
|-------|-------------|
| `crm.objects.contacts.read` | Read contacts |
| `crm.objects.contacts.write` | Create/update contacts |
| `crm.objects.companies.read` | Read companies |
| `crm.objects.deals.read` | Read deals |
| `crm.schemas.contacts.read` | Read contact schema |

### Marketing Scopes
| Scope | Description |
|-------|-------------|
| `content` | CMS content access |
| `forms` | Forms access |
| `files` | File manager access |

### Automation Scopes
| Scope | Description |
|-------|-------------|
| `automation` | Workflows access |
| `timeline` | Timeline events |

## Validation Checklist

### Required for Marketplace

- [ ] App manifest complete and valid
- [ ] OAuth flow implemented correctly
- [ ] All scopes justified in description
- [ ] Error handling implemented
- [ ] Rate limiting respected
- [ ] Webhook signatures validated
- [ ] Privacy policy URL provided
- [ ] Support documentation complete

### Security Requirements

| Requirement | Check |
|-------------|-------|
| HTTPS endpoints | All URLs must be HTTPS |
| Token storage | Secure, encrypted storage |
| Webhook validation | Signature verification |
| Scope minimization | Request only needed scopes |

## Deployment Environments

### Sandbox
```bash
/hs-app-deploy --app "My App" --env sandbox
```
- Test portal without affecting production
- Full API access for testing
- No marketplace review needed

### Production
```bash
/hs-app-deploy --app "My App" --env production
```
- Requires validation pass
- Updates live portal
- For private apps only

### Marketplace
```bash
/hs-app-deploy --app "My App" --env marketplace --submit
```
- Requires HubSpot review
- Public listing
- Must meet all marketplace requirements

## Detailed Documentation

See supporting files:
- `oauth-guide.md` - OAuth implementation details
- `cards-reference.md` - CRM card configuration
- `marketplace-requirements.md` - Submission checklist
