---
description: Authenticate Google Workspace CLI (gws) for Drive, Sheets, Gmail, Calendar, Docs, Slides, and Tasks access
argument-hint: "[check|login|status]"
allowed-tools:
  - Bash
  - Read
  - Write
---

# Google Workspace Login Command

Authenticate and manage Google Workspace CLI (`gws`) credentials for RevPal operations.

## Usage

```
/googlelogin [subcommand]
```

## Subcommands

- `login` (default) - Authenticate with Google Workspace (opens browser for OAuth)
- `check` - Verify `gws` is installed and credentials exist (no browser)
- `status` - Test authentication by listing Drive files

## Implementation

### Step 1: Parse Subcommand

Default to `login` if no argument provided. Accept: `login`, `check`, `status`.

### Step 2: Verify Prerequisites

Check that `gws` CLI is installed:

```bash
which gws && gws --version
```

If not installed, offer to install:

```bash
npm install -g @googleworkspace/cli
```

### Step 3: Set OAuth Credentials

The Google Workspace CLI requires OAuth client credentials. These MUST be set before any `gws` command:

```bash
export GOOGLE_WORKSPACE_CLI_CLIENT_ID="986726315143-uuc172iv389l6eqsauek2stha4412rkf.apps.googleusercontent.com"
export GOOGLE_WORKSPACE_CLI_CLIENT_SECRET="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"
```

**IMPORTANT**: Always export these env vars before running any `gws` command in this session.

### Step 4: Execute Subcommand

#### `check` - Quick validation (no API call)

1. Verify `gws` is installed
2. Check if credentials file exists:
   ```bash
   ls -la ~/.config/gws/credentials.enc
   ```
3. Verify env vars are set
4. Report status

#### `login` - Full authentication flow

1. Run prerequisites check
2. Export OAuth credentials (Step 3)
3. Run authentication:
   ```bash
   gws auth login
   ```
4. This opens a browser for OAuth consent. Inform the user:
   - If "Google hasn't verified this app" warning appears: click **Advanced** → **Go to app**
   - If "Access blocked" error: add their Google account as a test user in the OAuth consent screen
5. After browser auth completes, verify with a quick Drive list

#### `status` - Test authentication

1. Export OAuth credentials (Step 3)
2. Test by listing 3 Drive files:
   ```bash
   gws drive files list --params '{"pageSize": 3}'
   ```
3. Report authenticated account and available scopes

## Output Format

### Success (check)
```
Google Workspace CLI Status
  gws version: X.X.X
  Credentials: ~/.config/gws/credentials.enc (exists)
  OAuth Client: Configured (RevPalInternal)
  Status: Ready
```

### Success (login)
```
Google Workspace Authentication
  Authenticated as: user@domain.com
  Scopes: Drive, Sheets, Gmail, Calendar, Docs, Slides, Tasks
  Credentials saved to: ~/.config/gws/credentials.enc
```

### Success (status)
```
Google Workspace Connection Test
  Account: user@domain.com
  Drive Access: OK (3 files listed)
  Status: Connected
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GOOGLE_WORKSPACE_CLI_CLIENT_ID` | Yes | OAuth client ID (RevPalInternal project) |
| `GOOGLE_WORKSPACE_CLI_CLIENT_SECRET` | Yes | OAuth client secret |

These are set automatically by this command and should also be in `~/.bashrc` for persistence.

## GCP Project

- **Project**: RevPalInternal
- **Client ID**: `986726315143-uuc172iv389l6eqsauek2stha4412rkf.apps.googleusercontent.com`
- **OAuth Type**: Desktop app

## Scopes Granted

| Scope | API |
|-------|-----|
| `drive` | Google Drive |
| `spreadsheets` | Google Sheets |
| `gmail.modify` | Gmail |
| `calendar` | Google Calendar |
| `documents` | Google Docs |
| `presentations` | Google Slides |
| `tasks` | Google Tasks |

## Related

- Google Workspace CLI: https://github.com/googleworkspace/cli
- `/notebook-init` - NotebookLM integration (uses Google auth)
