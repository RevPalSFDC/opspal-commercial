# Deployment and Troubleshooting

Primary sources:
- `docs/runbooks/triggers/05-deployment-monitoring.md`
- `docs/runbooks/triggers/06-troubleshooting-optimization.md`

## Deployment gates

- Tests pass in sandbox.
- Governor headroom validated.
- Observability path defined (logs/alerts).

## Common incident classes

- Recursion or cascading automation loops.
- SOQL/DML limit exceptions.
- Row lock/contention regressions.
