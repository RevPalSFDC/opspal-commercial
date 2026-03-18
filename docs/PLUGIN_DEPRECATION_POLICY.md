# Plugin Deprecation Policy

This document defines lifecycle states and deprecation requirements for runtime `opspal-*` plugins.

## Lifecycle Status Values

- `active`: Production-supported plugin with ongoing maintenance.
- `experimental`: Feature-in-progress plugin with limited support and potential breaking changes.
- `deprecated`: Plugin scheduled for sunset and replacement.

## Required Manifest Fields

Each runtime plugin manifest (`plugins/opspal-*/.claude-plugin/plugin.json`) must include:

- `status`
- `owner`
- `stability`
- `last_reviewed_at`

Deprecated plugins must additionally include:

- `replaced_by`
- `deprecation_date`

## Review Cadence

- Lifecycle metadata warning threshold: `last_reviewed_at` older than 90 days.
- Lifecycle metadata failure threshold: `last_reviewed_at` older than 120 days.

## Deprecation Process

1. Set plugin `status` to `deprecated`.
2. Add `replaced_by` pointing to the replacement plugin.
3. Add `deprecation_date` (ISO date).
4. Update command docs and route docs to direct users to replacement paths.
5. Keep plugin available until migration completion criteria are met.

## Sunset Criteria

A deprecated plugin can be removed only when all conditions are met:

- No mandatory route targets depend on deprecated agents.
- Migration commands and documentation are published.
- Replacement plugin supports required capabilities.
- Historical scripts/assets needed for rollback are archived.

## Enforcement

The following gates enforce lifecycle policy:

- `npm run docs:verify-lifecycle-metadata`
- `npm run docs:verify-route-coverage`
- `npm run docs:verify-routing`
