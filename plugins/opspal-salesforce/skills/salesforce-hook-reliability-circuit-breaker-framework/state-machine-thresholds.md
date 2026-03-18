# State Machine and Thresholds

Primary source: `hooks/hook-circuit-breaker.sh`.

## States

- CLOSED: normal operation.
- OPEN: bypass after repeated failures.
- HALF-OPEN: controlled recovery probe.
