---
description: Switch or manage Marketo instances (production, sandbox, etc.)
---

# /marketo-instance

Manage multiple Marketo instances and switch between them.

## Usage

```
/marketo-instance [action] [instance-name]
```

## Actions

| Action | Description |
|--------|-------------|
| `list` | List all configured instances |
| `switch` | Switch to a different instance |
| `current` | Show current active instance |
| `add` | Add a new instance configuration |
| `remove` | Remove an instance configuration |

## Examples

### List Instances
```
/marketo-instance list

Configured Instances:
─────────────────────
✓ production (active)
  - Munchkin ID: 123-ABC-456
  - Environment: production

○ sandbox
  - Munchkin ID: 789-DEF-012
  - Environment: sandbox
```

### Switch Instance
```
/marketo-instance switch sandbox

Switched to instance: sandbox
Base URL: https://789-DEF-012.mktorest.com
```

### Show Current
```
/marketo-instance current

Current Instance: production
Munchkin ID: 123-ABC-456
Token Status: Valid (expires in 2847s)
```

### Add New Instance
```
/marketo-instance add staging

Adding new Marketo instance: staging
[Follow prompts for credentials]
```

## Instance Configuration

Each instance is stored in `portals/config.json`:

```json
{
  "instances": {
    "production": {
      "clientId": "xxx",
      "clientSecret": "xxx",
      "baseUrl": "https://123-ABC-456.mktorest.com",
      "munchkinId": "123-ABC-456",
      "environment": "production"
    }
  }
}
```

## Instance-Specific Data

Each instance has its own directory:

```
portals/
├── production/
│   ├── INSTANCE_CONTEXT.json
│   ├── INSTANCE_QUIRKS.json
│   ├── projects/
│   └── reports/
├── sandbox/
│   └── ...
└── config.json
```

## Best Practices

1. **Use Sandbox for Testing**
   - Always test changes in sandbox first
   - Keep sandbox data representative

2. **Name Instances Clearly**
   - Use descriptive names: `production`, `sandbox`, `staging`
   - Avoid generic names like `instance1`

3. **Verify Before Production**
   - Always check `/marketo-instance current` before operations
   - Use `[INSTANCE: name]` prefix in prompts for clarity

## Environment Override

Set instance via environment variable:

```bash
export MARKETO_INSTANCE_NAME="sandbox"
```

This overrides the default without switching.
