---
name: hs-app-deploy
description: Deploy HubSpot app to a portal with validation and confirmation
argument-hint: "[--account <name>] [--force]"
arguments:
  - name: account
    description: Target HubSpot account (optional - uses default)
    required: false
  - name: force
    description: Skip confirmation prompt
    required: false
---

# /hs-app-deploy - Deploy HubSpot App

Safely deploy a HubSpot app with pre-deployment validation and optional confirmation.

## Usage

```bash
/hs-app-deploy                      # Deploy to default account
/hs-app-deploy --account=production # Deploy to specific account
/hs-app-deploy --force              # Skip confirmation
```

## Prerequisites

- Valid HubSpot app project with `app.json`
- HubSpot CLI authenticated
- Project dependencies installed (`hs project install-deps`)

## Workflow

### Step 1: Verify Project

```bash
# Check project structure
- [ ] app.json exists
- [ ] package.json exists
- [ ] src/ directory exists
- [ ] No uncommitted changes (warning if present)
```

### Step 2: Pre-Deployment Validation

Run `hs project validate` equivalent checks:

```
Validating HubSpot App...

✅ app.json schema valid
✅ All extension files found
✅ TypeScript compilation passes
✅ Serverless functions valid
✅ OAuth scopes appropriate
⚠️  Warning: Uncommitted git changes detected

Validation complete: 5 passed, 1 warning, 0 errors
```

### Step 3: Display Deployment Summary

```
Deployment Summary
==================

App: {app-name}
Target: {account-name} (Portal ID: {portal-id})

Components to deploy:
- App Cards: 2 (crm-record-card, preview-panel)
- Settings: 1 (settings page)
- Functions: 3 (getData, getSettings, saveSettings)

OAuth Scopes:
- crm.objects.contacts.read
- crm.objects.contacts.write
```

### Step 4: Confirm Deployment

Unless `--force` is set:

```
Proceed with deployment? (y/n)
```

### Step 5: Execute Deployment

```bash
hs project upload --account={account}
```

Show progress:

```
Deploying to {account}...

[1/4] Compiling TypeScript...  ✅
[2/4] Uploading functions...   ✅
[3/4] Uploading extensions...  ✅
[4/4] Registering app...       ✅

✅ Deployment complete!

App URL: https://app.hubspot.com/private-apps/{portal-id}/{app-id}
```

### Step 6: Post-Deployment Verification

Optional verification steps:

```
Post-deployment checks:

✅ App registered in portal
✅ Extensions accessible
✅ Functions responding

Your app is now live!
```

## Error Handling

### Validation Failures

```
❌ Validation failed:

- app.json: Missing required field 'description'
- Card 'my-card': TypeScript compilation error at line 45
- Function 'getData': Missing exports.main

Fix these issues and try again.
```

### Deployment Failures

```
❌ Deployment failed:

Error: Insufficient permissions
- Your API key lacks 'developer.apps.write' scope

Resolution:
1. Go to HubSpot Settings > Integrations > Private Apps
2. Edit your app's scopes
3. Add 'developer.apps.write'
4. Generate new access key
5. Re-authenticate: hs auth
```

### Rollback Guidance

If deployment causes issues:

```
Rollback Instructions:

1. Previous version available in HubSpot Developer Portal
2. Or revert git changes and redeploy:
   git checkout HEAD~1
   /hs-app-deploy --force
```

## Safety Features

1. **Validation before deploy** - Catches errors early
2. **Confirmation prompt** - Prevents accidental deployments
3. **Git status check** - Warns about uncommitted changes
4. **Account verification** - Confirms target portal
5. **Post-deploy verification** - Validates deployment success

## Integration with CI/CD

For automated deployments:

```bash
# In CI/CD pipeline
export HUBSPOT_PERSONAL_ACCESS_KEY=$HS_KEY
/hs-app-deploy --account=production --force
```

## Related Commands

- `/hs-app-create` - Create new app project
- `/hs-app-validate` - Validate without deploying
- `/hs-app-card-add` - Add app cards
- `/hs-settings-add` - Add settings page
