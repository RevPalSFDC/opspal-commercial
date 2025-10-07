# Blocked Action Policy

When a requirement fails (permissions, subscription, or architectural gate):

1. Stop immediately and do not attempt alternatives.
2. Emit a BLOCKED report including:
   - What failed and why (status code, endpoint, scope/subscription note).
   - Options A/B/C with pros and cons.
   - Required approvals and artifacts (ACR, rollback plan).
3. Exit non‑zero and wait for explicit approval.

