# Postdeploy State Verification

Primary source: `hooks/post-sf-command.sh`.

## Checks

- Verify deployed state matches intended state.
- Clear/update relevant caches after successful write operations.
- Emit non-blocking warnings for verification anomalies.
