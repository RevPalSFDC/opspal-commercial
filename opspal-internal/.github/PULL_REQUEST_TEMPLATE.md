## Description
Brief description of changes

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Performance improvement
- [ ] Documentation update
- [ ] Refactoring

## HubSpot Bulk Operations Checklist

### Required for ALL HubSpot Operations
- [ ] Uses `/lib/hubspot-bulk/*` for HubSpot operations (no ad-hoc per-record calls)
- [ ] All HubSpot API calls wrapped with retry logic and exponential backoff
- [ ] Async job polling implemented with max-wait and cancellation support
- [ ] CSV processing uses streaming (no unbounded memory usage)
- [ ] Unique identifier present for updates (email/domain/recordId)

### Data & Output Requirements
- [ ] Emits structured JSON logs with correlationId and jobId
- [ ] Generates summary artifacts (`.summary.json` files)
- [ ] Error rows persisted to CSV with clear column headers
- [ ] No PII in logs (emails/names redacted or hashed)

### Configuration & Limits
- [ ] No magic numbers - all limits in `/lib/hubspot-bulk/config.js`
- [ ] Batch sizes, rate limits, timeouts configurable via environment variables
- [ ] Respects HubSpot API limits (10M rows/import, 512MB/file)

### Testing & Documentation
- [ ] Unit tests added/updated with mocked HubSpot responses
- [ ] Large file handling tested (or documented as tested locally)
- [ ] README updated with usage examples
- [ ] Command-line help text is clear and complete

### Resumability & Idempotency
- [ ] Jobs are resumable (state persisted to `.jobs/` directory)
- [ ] Operations are idempotent (safe to retry)
- [ ] Temp files cleaned up on success and failure

## Testing
Describe testing performed:
- [ ] Tested with small dataset (<100 records)
- [ ] Tested with medium dataset (1K-10K records)
- [ ] Tested with large dataset (100K+ records) or documented approach
- [ ] Tested job resumability (kill and restart)
- [ ] Tested error handling (malformed CSV, auth failure, rate limits)

## Breaking Changes
List any breaking changes:

## Additional Notes