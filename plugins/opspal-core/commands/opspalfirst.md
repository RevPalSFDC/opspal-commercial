---
name: opspalfirst
description: Interactive first-run guide for activating your OpsPal license
argument-hint: ""
intent: walk a new user through license activation with guided prompts
visibility: user-invocable
tags:
  - licensing
  - setup
  - first-run
  - onboarding
---

# /opspalfirst Command

Interactive first-run walkthrough for new OpsPal users. Checks current license status, explains tiers, and guides through activation.

## Implementation

Run the first-run detection script:

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/lib/license-first-run.js
```

Parse the JSON output and follow the flow below.

## Flow

### 1. Run detection

Execute the script above and parse the JSON result.

### 2. If `mode === "already_activated"`

The user already has an active license. Display:

- Current tier and organization
- Assets unlocked (e.g., "24/37 encrypted assets unlocked")
- Offer to run `/license-canary --expect-tier {tier}` for a live rollout check
- Offer `/license-status` for full details

Then stop — no further action needed.

### 3. If `mode === "first_run"`

Display the `welcome_text` from the JSON output (it contains a formatted tier comparison table).

Then **ask the user** for their license key with a prompt like:

> Enter your OpsPal license key (starts with `OPSPAL-`), or type "skip" to continue without a license:

### 4. Validate key format

If the user provides a key:
- It **must** start with `OPSPAL-`
- If it doesn't, tell them the expected format and ask again

If the user types "skip" or "no" or similar:
- Explain that plugins will work but premium features will be unavailable
- Point them to `/activate-license <key>` when they're ready
- Stop

### 5. Activate

Run the activation script with the user's key:

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/lib/license-activation-manager.js activate <KEY>
```

Show the output to the user.

### 6. Post-activation

If activation succeeded:
- Tell the user to start a new Claude Code session to decrypt assets
- Suggest running `/license-canary --expect-tier <tier>` to validate
- Suggest running `/license-status` to check status anytime

If activation failed:
- Show the error message from the script
- If the error is `server_unreachable`, suggest checking network
- Offer to try again or skip for now
