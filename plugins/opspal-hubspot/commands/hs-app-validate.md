---
name: hs-app-validate
description: Validate HubSpot app for deployment or marketplace submission
argument-hint: "[--marketplace]"
arguments:
  - name: marketplace
    description: Run full marketplace validation checks
    required: false
---

# /hs-app-validate - Validate HubSpot App

Comprehensive validation of HubSpot app project for deployment or marketplace submission.

## Usage

```bash
/hs-app-validate                  # Standard validation
/hs-app-validate --marketplace    # Full marketplace validation
```

## Validation Levels

### Standard Validation

Quick checks for deployment readiness:

- Project structure valid
- app.json schema correct
- TypeScript compiles
- Functions exportable
- Extensions render

### Marketplace Validation

Additional checks for marketplace submission:

- All standard checks
- Required fields complete
- Screenshots present
- Documentation exists
- Security review
- Accessibility compliance
- Performance requirements

## Workflow

### Step 1: Project Structure Check

```
Checking project structure...

✅ app.json exists
✅ package.json exists
✅ src/app/extensions/ exists
✅ src/functions/ exists
✅ tsconfig.json exists
```

### Step 2: Manifest Validation

```
Validating app.json...

✅ name: "My App"
✅ uid: "my-app"
✅ description: "App description" (52 chars)
✅ allowedAccountTypes: ["STANDARD"]
⚠️  public: false (set to true for marketplace)

OAuth Scopes:
✅ crm.objects.contacts.read - Appropriate for app functionality
✅ crm.objects.contacts.write - Appropriate for app functionality
```

### Step 3: Extension Validation

```
Validating extensions...

App Card: crm-record-card
✅ card.json valid
✅ Card.tsx compiles
✅ Location: crm.record.tab
✅ Object types defined

Settings: settings
✅ settings-hsmeta.json valid
✅ Settings.tsx compiles
✅ Entry point correct
```

### Step 4: Function Validation

```
Validating serverless functions...

✅ getData.js - exports.main defined
✅ getSettings.js - exports.main defined
✅ saveSettings.js - exports.main defined
```

### Step 5: TypeScript Compilation

```
Compiling TypeScript...

✅ No compilation errors
⚠️  1 warning: Unused variable 'temp' in Card.tsx:23
```

### Step 6: Marketplace Checks (if --marketplace)

```
Running marketplace validation...

Required Information:
✅ App name valid (no "HubSpot" in name)
✅ Description provided (min 50 chars)
❌ App icon missing (512x512 PNG required)
❌ Screenshots missing (min 3 required)
⚠️  Demo video not provided (recommended)

Documentation:
✅ README.md exists
❌ SETUP_GUIDE.md missing
❌ Privacy policy URL not set
❌ Terms of service URL not set

Security:
✅ No secrets in source code
✅ Scopes are minimal
✅ Error messages safe

Accessibility:
✅ ARIA labels present
⚠️  Color contrast may be insufficient in Card.tsx

Performance:
✅ Bundle size < 500KB
✅ No blocking operations detected
```

### Step 7: Summary Report

```
╔══════════════════════════════════════════════════════════╗
║                 VALIDATION SUMMARY                        ║
╠══════════════════════════════════════════════════════════╣
║  Status: NEEDS ATTENTION                                  ║
║                                                           ║
║  ✅ Passed:   12                                          ║
║  ⚠️  Warnings: 3                                          ║
║  ❌ Errors:   4                                           ║
╠══════════════════════════════════════════════════════════╣
║  ERRORS TO FIX:                                           ║
║                                                           ║
║  1. Add app icon (512x512 PNG)                           ║
║     → Create assets/icon.png                              ║
║                                                           ║
║  2. Add screenshots (min 3, 1280x800)                    ║
║     → Create assets/screenshots/                          ║
║                                                           ║
║  3. Create setup guide                                    ║
║     → Add SETUP_GUIDE.md to project root                 ║
║                                                           ║
║  4. Add privacy/terms URLs to app.json                   ║
║     → Update app.json with legal URLs                     ║
╚══════════════════════════════════════════════════════════╝

Run '/hs-app-validate' again after fixes.
```

## Validation Checks Reference

### Mandatory (All Apps)

| Check | Requirement |
|-------|-------------|
| app.json | Valid JSON, required fields |
| TypeScript | Compiles without errors |
| Functions | exports.main defined |
| Extensions | Valid configuration |
| Scopes | Match functionality |

### Marketplace Required

| Check | Requirement |
|-------|-------------|
| App icon | 512x512 PNG |
| Screenshots | Min 3, 1280x800 |
| Description | Min 50 characters |
| Setup guide | Documentation |
| Privacy policy | URL provided |
| Terms of service | URL provided |

### Marketplace Recommended

| Check | Recommendation |
|-------|----------------|
| Demo video | 2-5 minutes |
| Changelog | Version history |
| FAQ | Common questions |
| Support contact | Help resources |

## Error Resolution

### Common Errors

**"Missing exports.main":**
```javascript
// Ensure function exports main
exports.main = async (context) => {
  // Your code
};
```

**"TypeScript compilation error":**
```bash
# Check specific error
npx tsc --noEmit

# Common fix: Install types
npm install @types/node --save-dev
```

**"Invalid scope":**
```json
// Use specific scopes, not wildcards
"scopes": {
  "required": [
    "crm.objects.contacts.read",  // ✅ Specific
    // "crm.objects.all"          // ❌ Too broad
  ]
}
```

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | All checks passed |
| 1 | Warnings only |
| 2 | Errors found |

## Integration

```bash
# Pre-commit hook
/hs-app-validate || exit 1

# CI/CD pipeline
/hs-app-validate --marketplace
```

## Related Commands

- `/hs-app-deploy` - Deploy after validation
- `/hs-app-create` - Create new app
