# Post-Auth Org Quirks Sync

Primary source: `hooks/post-org-auth.sh`.

## Behavior

- Trigger org-quirks detection after successful auth.
- Extract alias from auth command variants.
- Run sync in background without blocking normal flow.
