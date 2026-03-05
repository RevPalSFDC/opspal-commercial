---
name: hs-app-create
description: Initialize a new HubSpot app project with guided setup wizard
argument-hint: "[--name <app-name>] [--template <template>]"
arguments:
  - name: name
    description: Project name (optional - will prompt if not provided)
    required: false
  - name: template
    description: Template type (blank, crm-card, settings, full)
    required: false
---

# /hs-app-create - HubSpot App Project Creator

Interactive wizard to create a new HubSpot app project with all necessary configuration.

## Usage

```bash
/hs-app-create                           # Interactive mode
/hs-app-create --name my-app             # With name
/hs-app-create --template crm-card       # With template
```

## Prerequisites

Ensure HubSpot CLI is installed and authenticated:

```bash
# Check installation
hs --version

# If not installed
npm install -g @hubspot/cli

# Authenticate
hs auth
```

## Workflow

### Step 1: Gather Project Information

Ask the user for:
1. **Project name** - Used for folder and app.json
2. **Template type** - What components to include
3. **Target portal** - Which HubSpot account

### Step 2: Create Project Structure

Based on template selection, create:

**Blank template:**
```
{project-name}/
├── app.json
├── package.json
├── tsconfig.json
├── src/
│   └── functions/
└── README.md
```

**CRM Card template:**
```
{project-name}/
├── app.json
├── package.json
├── tsconfig.json
├── src/
│   ├── app/
│   │   └── extensions/
│   │       └── crm-record-card/
│   │           ├── card.json
│   │           └── Card.tsx
│   └── functions/
│       └── getData.js
└── README.md
```

**Settings template:**
```
{project-name}/
├── app.json
├── package.json
├── tsconfig.json
├── src/
│   ├── app/
│   │   └── settings/
│   │       ├── settings-hsmeta.json
│   │       └── Settings.tsx
│   └── functions/
│       ├── getSettings.js
│       └── saveSettings.js
└── README.md
```

**Full template:**
```
{project-name}/
├── app.json
├── package.json
├── tsconfig.json
├── src/
│   ├── app/
│   │   ├── extensions/
│   │   │   └── crm-record-card/
│   │   └── settings/
│   └── functions/
└── README.md
```

### Step 3: Initialize Configuration

Create `app.json`:

```json
{
  "name": "{project-name}",
  "uid": "{project-name}",
  "description": "HubSpot app created with /hs-app-create",
  "allowedAccountTypes": ["STANDARD"],
  "public": false,
  "extensions": {},
  "auth": {
    "type": "OAUTH",
    "scopes": {
      "required": [],
      "optional": []
    }
  }
}
```

### Step 4: Install Dependencies

```bash
cd {project-name}
npm install
```

### Step 5: Provide Next Steps

Display to user:

```
✅ Project created: {project-name}

Next steps:
1. cd {project-name}
2. hs project dev          # Start development
3. /hs-app-card-add        # Add app cards
4. /hs-settings-add        # Add settings page
5. hs project upload       # Deploy to HubSpot

Documentation:
- skills/hubspot-developer-platform/SKILL.md
- skills/hubspot-developer-platform/project-commands.md
```

## Template Options

| Template | Use Case |
|----------|----------|
| `blank` | Start from scratch |
| `crm-card` | App with CRM record card |
| `settings` | App with settings page |
| `full` | App with card + settings |

## Implementation Notes

1. Check HubSpot CLI is installed before proceeding
2. Verify authentication with `hs accounts list`
3. Use Context7 for latest package versions
4. Create .gitignore excluding hubspot.config.yml
5. Initialize git repository

## Error Handling

- **CLI not installed**: Provide installation instructions
- **Not authenticated**: Run `hs auth` first
- **Name conflict**: Suggest alternative name
- **Permission denied**: Check directory permissions
