# Query Sizing Signals

Detect large-result risk from:
- oversized command/query length,
- large `IN (...)` clause cardinality,
- post-query truncation indicators.

Escalate from inline query to chunked or bulk-safe extraction path.
