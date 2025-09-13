# OAuth Refresh Runbook

## Overview
This runbook covers proactive token refresh, rotation, and incident handling.

## Prerequisites
- `HUBSPOT_CLIENT_ID`, `HUBSPOT_CLIENT_SECRET`, `HUBSPOT_REFRESH_TOKEN` set.
- Optional: `TOKEN_CACHE_FILE` for local encrypted cache.

## Validate Refresh Locally
```bash
node scripts/ci/check-oauth.js --verbose
```

## Common Issues
- 401 after refresh → refresh token revoked. Re-authorize app and update secrets.
- 403 scope missing → install app with required scopes for the target portal.
- Clock skew → ensure NTP and use built-in skew buffer (5 minutes).

## Rotation
1. Create new refresh token via OAuth flow.
2. Update secret store and restart agents.
3. Validate using `check-oauth.js`.

## Incident Steps
- Capture correlation ID and recent logs.
- Retry with jitter/backoff capped at 3 attempts.
- If still failing, disable mutating jobs and escalate.

