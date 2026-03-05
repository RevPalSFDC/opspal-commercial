# Paging Strategy

Apply progressive strategy:
1. add selective filters,
2. apply `LIMIT` + stable ordering,
3. page using cursor/offset or batch key windows,
4. use bulk extraction for very large sets.

Maintain idempotent chunk boundaries.
