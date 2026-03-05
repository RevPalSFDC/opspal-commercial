# Incident Troubleshooting

Primary source: `docs/runbooks/upsert-operations/09-troubleshooting.md`.

## Response path

1. Triage by error class and blast radius.
2. Validate routing, matching, and enrichment dependencies.
3. Retry with idempotency safeguards.
4. Escalate with operation ID and audit evidence.
