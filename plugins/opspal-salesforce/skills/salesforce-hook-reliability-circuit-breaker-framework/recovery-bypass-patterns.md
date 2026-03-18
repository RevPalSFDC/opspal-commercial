# Recovery and Bypass Patterns

Primary source: `hooks/hook-circuit-breaker.sh`.

## Patterns

- Bypass with clear user/system warning while OPEN.
- Retry one execution in HALF-OPEN.
- Re-open immediately on failed recovery attempt.
