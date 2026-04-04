# SOP Policy Schema Changelog

## Version 1.0.0 (2026-04-03)

Initial schema release.

### Fields
- `id` — Unique policy identifier (kebab-case, `sop-` prefix)
- `schema_version` — Schema version for forward compatibility
- `version` — Policy content version
- `enabled` — Whether this policy is active
- `scope` — Policy scope layer (global, revpal-internal, client-delivery)
- `event` — Canonical event type (dot-namespaced)
- `mode` — Execution mode (off, recommend, enforce, dry_run)
- `priority` — Higher priority wins on conflict (default 50)
- `when` — Condition array (AND logic)
- `actions` — Action array (at least one required)
- `mapping_ref` — Reference to target mapping definition
- `templates` — Reusable action template references
- `idempotency` — Idempotency key configuration
- `allow_backward_transition` — Allow work-index backward state transitions
- `description` — Human-readable description
- `created_at` / `updated_at` — Timestamps

### Condition Operators
- `eq`, `neq`, `in`, `nin`, `exists`, `regex`
- `allow_inferred_low` — Meta-condition for confidence handling

### Action Types
- `asana` — Create/update Asana tasks, add comments
- `work-index` — Append/update work index entries
- `log` — Structured event logging

### Deprecation Policy
- Deprecated fields accepted for 2 minor versions, then rejected
- Migration scripts at `scripts/lib/sop/migrations/`
