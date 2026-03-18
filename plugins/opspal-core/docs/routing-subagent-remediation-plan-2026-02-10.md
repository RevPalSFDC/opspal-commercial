# Routing and Sub-Agent Delegation Remediation Plan

Date: 2026-02-10
Owner: opspal-core routing

## Goal
Restore reliable sub-agent routing by eliminating dark agents, reducing ambiguous misroutes, preventing stale cache pollution, and making complexity enforcement meaningful.

## Issue Map

1. Dark agents never routed
- Root cause: brittle frontmatter parsing only handled `triggerKeywords`, missed `keywords`, `trigger_keywords`, `triggers`, `routing.keywords`, and inline "TRIGGER KEYWORDS" text.
- Fix: switched index builder to YAML parsing with fallback extraction and derived-keyword safety net.
- Status: complete. Routing index now shows `265/265` agents with keywords.

2. Ambiguous prompt misroutes
- Root cause: match ranking favored raw match count over phrase specificity and keyword rarity.
- Fix: weighted keyword scoring in `task-router` (phrase length + inverse keyword frequency + weak-token suppression), plus specific routing rules for RevOps reporting and Marketo lead scoring models.
- Status: complete for reported prompts.

3. Stale plugin cache pollution (old versions in alternatives)
- Root cause: alias resolver could scan version-cache directory layouts and treat semver folders as plugin names.
- Fix: plugin-root discovery now prefers real plugin directories, supports nested version layouts by selecting latest version, ignores bare semver directories, and invalidates polluted caches.
- Status: complete.

4. Complexity scoring always 0.0
- Root cause: narrow lexical factor set and no agent-tier floor.
- Fix: expanded complexity factors (design/audit/reporting/cross-platform/scope) and added agent-tier complexity floor logic.
- Status: complete.

5. Missing agent descriptions in alternatives
- Root cause: hardcoded descriptions covered only a small subset.
- Fix: hydrate descriptions/capabilities/tier from `routing-index.json` with description-based tier inference.
- Status: complete.

## Validation Executed

- Rebuilt routing index:
  - `node plugins/opspal-core/scripts/lib/routing-index-builder.js`
  - Result: `totalAgents=265`, `agentsWithKeywords=265`, `totalKeywords=1274`
- Rebuilt alias caches:
  - `node plugins/opspal-core/scripts/lib/agent-alias-resolver.js rebuild`
  - `node plugins/opspal-core/scripts/lib/agent-alias-resolver.js rebuild-commands`
- Prompt checks:
  - "build a lead scoring model in marketo" -> `opspal-marketo:marketo-lead-scoring-architect`
  - "generate a revops report on pipeline health" -> `opspal-core:revops-reporting-assistant`
  - "Run a comprehensive RevOps assessment ..." -> `opspal-salesforce:sfdc-revops-auditor`
- CI routing validation:
  - `bash plugins/opspal-core/scripts/ci/validate-routing.sh --verbose`
  - Result: passed with `Warnings: 0`, `Failed: 0`.

## Remaining Work (Optional Hardening)

1. Monitor guardrail telemetry trendline
- Review `routing-alerts.jsonl` for recurring semver pollution events and trigger automated cache rebuild if count exceeds threshold.

2. Expand semantic platform-intent dictionaries
- Add more provider aliases if new platform namespaces are introduced (e.g., additional GTM/data-system plugins).

## Success Criteria

- Dark agents: 0
- Version-prefixed alternative agents: 0
- Reported misroutes: 0
- Complexity score non-zero for specialist prompts with clear design/audit/reporting intent

## Phase 2 Completion (2026-02-10)

Completed after initial remediation:
- `validate-routing.sh` now validates keyword presence and coverage using canonical routing index data (including `agentsByFull` when present).
- Routing index now includes collision-safe fields:
  - `agentsByFull`
  - `agentsByShort`
  - `byKeywordFull`
  - `duplicateShortNames`
- Duplicate short names are now namespaced in routing index coverage checks (`268/268`).
- Complexity high-risk check in CI now parses numeric score and validates `>= 0.7` robustly.

Current CI routing validation status:
- Passed
- Warnings: 0

## Phase 3 Completion (2026-02-10)

Completed after Phase 2:
- Migrated remaining routing-index consumers to prefer collision-safe maps:
  - `scripts/lib/semantic-router.js`
  - `scripts/lib/agent-composer.js`
  - `scripts/lib/routing-clarity-enhancer.js`
- Added legacy-safe metadata resolution in `routing-clarity-enhancer` for full/short agent names.
- Normalized confidence scale in `routing-clarity-enhancer` (semantic router emits 0-100, clarity layer now normalizes to 0-1).
- Verified:
  - `npx jest plugins/opspal-core/test/task-router.test.js plugins/opspal-core/scripts/lib/__tests__/agent-alias-resolver.test.js --runInBand`
  - `bash plugins/opspal-core/scripts/ci/validate-routing.sh --verbose`

## Phase 4 Completion (2026-02-10)

Completed after Phase 3:
- Added semver-leak runtime guardrail in `scripts/lib/task-router.js`:
  - Filters semver-prefixed agents from index keyword ingestion.
  - Sanitizes primary and alternative recommendations if a semver-prefixed agent appears.
  - Emits guardrail telemetry entries to `routing-alerts.jsonl`.
- Added semver-leak runtime guardrail in `hooks/unified-router.sh`:
  - Blocks semver-prefixed recommended agent names.
  - Emits guardrail metadata and context messages.
  - Uses resilient log append fallback to `/tmp/.claude/logs` when home log path is not writable.
- Added semantic-only platform intent tuning in `scripts/lib/semantic-router.js`:
  - Detects explicit platform mentions in prompts.
  - Applies platform-aware similarity boost/penalty.
  - Reported prompt now routes correctly in semantic-only mode:
    - "build a lead scoring model in marketo" -> `opspal-marketo:marketo-lead-scoring-architect`
- Added CI guardrail check in `scripts/ci/validate-routing.sh`:
  - New Check 9 validates no semver-prefixed agent leaks in index, pattern config, or task-router output.
- Added tests:
  - `scripts/lib/__tests__/semantic-router.test.js` (platform intent tuning)
  - `scripts/lib/__tests__/task-router.test.js` updates for semver guardrail behavior

## Phase 5 Completion (2026-02-12)

Completed after Phase 4:
- Added transcript-aware input normalization in `hooks/unified-router.sh`:
  - Prefers latest user-intent fields (`user_message`, `userPrompt`, `prompt`) before generic `message`.
  - Extracts `Original prompt:` payloads from transcript-style hook messages.
  - Filters common task-log noise before pattern matching.
- Added adaptive continue fallback (feature-flagged):
  - `ROUTING_ADAPTIVE_CONTINUE=1` enables soft-block behavior for non-mandatory high-complexity matches when prompts look like continuation/noisy context.
  - Mandatory/destructive routing remains fail-closed.
  - Added tuning flags:
    - `ROUTING_CONTINUE_LOW_SIGNAL_THRESHOLD` (default `0.65`)
    - `ROUTING_TRANSCRIPT_NOISE_THRESHOLD` (default `0.35`)
- Extended routing telemetry with:
  - `continue_intent`
  - `transcript_noise_score`
  - `adaptive_fallback_applied`
  - normalized message preview fields
- Added tests:
  - `test/hooks/unit/unified-router.test.js` adaptive continue + transcript normalization coverage
  - `test/hooks/integration/routing-chain.test.js` adaptive fallback chain behavior
