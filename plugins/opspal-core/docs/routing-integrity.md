# Routing Integrity

This document defines the routing integrity contract for `opspal-core` and dependent plugins.

## Canonical Authority

- `plugins/opspal-core/config/routing-patterns.json` is the canonical prompt-routing authority.
- `plugins/opspal-core/config/routable-agent-metadata.json` supplies required metadata for routed agents when the agent markdown does not declare it directly.
- `plugins/opspal-core/routing-index.json` is a generated artifact. Rebuild it from canonical sources; do not hand-edit it.
- `TaskRouter` may keep a small set of explicit non-canonical helper exceptions for internal orchestration paths that are not driven by `UserPromptSubmit` routing. Those exceptions must remain fully qualified and documented in code.

## Routable Agent Requirements

Every agent referenced by canonical routing, capability rules, or approved fallbacks must satisfy all of the following:

- The fully qualified agent ID resolves to a real on-disk agent file.
- The agent exposes `triggerKeywords`.
- The agent exposes `actorType`.
- The agent exposes `capabilities`.
- The declared tools match the operational instructions in the body.

If an agent cannot satisfy those requirements, remove it from routing references instead of leaving it partially routable.

## Tool and Body Consistency

Routed agents must not instruct workflows they cannot execute.

Required examples:

- Any routed agent body that includes shell workflows, `sf`, `sfdx`, `curl`, `jq`, `node scripts/...`, or fenced `bash` examples must declare `Bash`.
- Any routed agent body that instructs `Task(...)`, sub-agent delegation, or “Use Task tool” workflows must declare `Task`/`Agent`.
- Any routed agent body that references Context7 must declare a Context7 tool.

The validator enforces these checks against routed agents.

## Capability-Fit Enforcement

Route selection alone is not sufficient.

- Preferred agents must satisfy their required capabilities and allowed actor types.
- Spawn-time validation must reject selected agents that are outside the cleared family or fail route capability fit.
- Sub-agent tool execution may bypass parent-context routing only after the route was cleared for that specific approved agent family and the selected agent still satisfies route requirements.
- Blanket “sub-agent may proceed” assumptions are not allowed.

## Adding or Updating Agents Safely

When adding a new routable agent:

1. Add or update the canonical route in `routing-patterns.json`.
2. Ensure the target agent file exists and is referenced by its fully qualified ID.
3. Add `actorType` and `capabilities` in frontmatter or `routable-agent-metadata.json`.
4. Ensure the body does not require undeclared tools.
5. Rebuild generated artifacts:
   - `node plugins/opspal-core/scripts/lib/routing-index-builder.js`
   - `node plugins/opspal-core/scripts/lib/routing-docs-generator.js generate`
6. Run integrity validation:
   - `node plugins/opspal-core/scripts/lib/validate-routing-integrity.js`
   - `bash plugins/opspal-core/scripts/ci/validate-routing.sh --strict`

## Validation and CI

The routing integrity validator checks:

- Canonical targets resolve to real agents.
- Routed agents have complete metadata.
- Routed agent bodies are consistent with declared tools.
- Capability-rule preferred agents satisfy their own requirements.
- Stale short-name aliases do not remain in routing authorities.
- Generated routing artifacts stay in sync with canonical definitions.
- Mixed Salesforce cleanup routes remain orchestrator-led and preserve the approved specialist family.
- Route-requirements derivation preserves required tools for Bash-capable Salesforce specialists.
- Representative prompt probes route to the intended agent.

CI entry points:

- `node plugins/opspal-core/scripts/lib/validate-routing-integrity.js`
- `node scripts/verify-routing-runtime-integrity.js`
- `bash plugins/opspal-core/scripts/ci/validate-routing.sh --strict`
- `npm run verify:routing-integrity`
- `npm run verify:routing-runtime-integrity`

If any of these fail, treat the route as broken until the canonical source, metadata, and executable path all agree.

Operator triage:

- See `docs/ROUTING_RUNTIME_TRIAGE.md` for repo drift vs routing/enforcement vs host-runtime projection-loss triage.
