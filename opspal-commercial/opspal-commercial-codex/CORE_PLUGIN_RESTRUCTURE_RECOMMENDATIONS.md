# OpsPal Internal Plugins — CORE + Specialist Modules Restructuring Recommendations (No Dev Plugins)

**Repository reviewed:** `/home/chris/Desktop/RevPal/Agents/opspal-internal-plugins`

**Installable bundles today:** `/home/chris/Desktop/RevPal/Agents/opspal-internal-plugins/.claude-plugins/*`

**Excluded from this proposal:**
- `/home/chris/Desktop/RevPal/Agents/opspal-internal-plugins/dev-internal`
- `/home/chris/Desktop/RevPal/Agents/opspal-internal-plugins/.claude-plugins/developer-tools-plugin`

---

## 1) Executive Summary

Introduce a single **CORE plugin** that owns cross-cutting primitives (shared libs, hook implementations, common workflows, shared docs/templates), and refactor each existing “production” plugin into a **specialist module/plugin** that is domain-specific (Salesforce, HubSpot, Marketo, Monday, Data Hygiene, GTM Planning, AI Consult, Cross-Platform utilities).

Key outcomes:
- Remove duplicated code and hooks across bundles.
- Reduce installable plugin size and “bundle drift”.
- Standardize safety/error-handling and config validation.
- Keep specialist plugins installable and self-contained (no fragile cross-plugin imports).

---

## 2) Current Observations (Why restructure)

### 2.1 Duplication across production plugins

Examples observed across existing installable bundles:
- **Shared library duplicates**: `data-access-error.js` exists (verbatim) in:
  - `.claude-plugins/cross-platform-plugin/scripts/lib/data-access-error.js`
  - `.claude-plugins/hubspot-plugin/scripts/lib/data-access-error.js`
  - `.claude-plugins/salesforce-plugin/scripts/lib/data-access-error.js`
- **Shared workflow utilities duplicated** (not exhaustive):
  - reflection/query/init/dependency-check patterns present across `.claude-plugins/hubspot-plugin/scripts/lib/*` and `.claude-plugins/salesforce-plugin/scripts/lib/*`
- **Shared hook scripts duplicated** across HubSpot + Salesforce:
  - `.claude-plugins/*/hooks/pre-task-context-loader.sh`
  - `.claude-plugins/*/hooks/pre-task-mandatory.sh`
  - `.claude-plugins/*/hooks/pre-reflect.sh`
  - `.claude-plugins/*/hooks/post-reflect.sh`

### 2.2 Bundles include large/non-runtime artifacts

Several plugins include directories like `node_modules/`, `coverage/`, and various test-output/cache directories inside installable bundles. This complicates:
- keeping bundles lean,
- verifying “what ships”, and
- avoiding inconsistent behavior between plugins.

### 2.3 Multiple “plugin roots” in repo

There is an installable HubSpot plugin under `.claude-plugins/hubspot-plugin`, and also a top-level `/home/chris/Desktop/RevPal/Agents/opspal-internal-plugins/hubspot-plugin` directory. That increases confusion about the canonical source-of-truth.

---

## 3) Design Goals

1. **Single source-of-truth** for shared code and shared hook logic.
2. **Self-contained installable bundles** (no runtime dependency on other plugins’ filesystem paths).
3. **Stable external interfaces** (agents/commands remain discoverable; minimal user-facing disruption).
4. **Clear ownership boundaries** (CORE owns cross-cutting; modules own domains).
5. **Bundle hygiene** (ship only what must ship).

---

## 4) Proposed Architecture

### 4.1 Core concept

- **CORE plugin** provides the platform substrate: shared libraries + shared hook implementations + shared docs/templates + shared workflow scaffolding.
- **Specialist plugins** remain installable but become thin wrappers around domain-specific assets, consuming CORE primitives via a controlled distribution approach.

### 4.2 Source-of-truth vs. installable output

Treat `.claude-plugins/` as the **installable output** directory rather than the main authoring location.

Recommended high-level layout:

- `core/` (authoring)
  - `core/plugin/` → CORE installable plugin content (agents/commands/hooks/docs/templates)
  - `core/lib/` → shared CommonJS library
  - `core/shared-assets/` → shared docs/templates/snippets
- `modules/` (authoring)
  - `modules/salesforce/`
  - `modules/hubspot/`
  - `modules/marketo/`
  - `modules/monday/`
  - `modules/data-hygiene/`
  - `modules/gtm-planning/`
  - `modules/ai-consult/`
  - `modules/cross-platform/` (recommended; see 5.7)
- `.claude-plugins/` (generated installable bundles)
  - `.claude-plugins/opspal-core-plugin/`
  - `.claude-plugins/salesforce-plugin/`
  - `.claude-plugins/hubspot-plugin/`
  - `.claude-plugins/marketo-plugin/`
  - `.claude-plugins/monday-plugin/`
  - `.claude-plugins/data-hygiene-plugin/`
  - `.claude-plugins/gtm-planning-plugin/`
  - `.claude-plugins/ai-consult-plugin/`
  - `.claude-plugins/cross-platform-plugin/` (or renamed later)

### 4.3 Avoiding fragile cross-plugin imports

Do **not** have `salesforce-plugin` import files from `hubspot-plugin` (or vice versa).

Instead:
- CORE code is **vendored** into each installable bundle during packaging, or
- CORE ships a small “runtime shim” copied into each plugin bundle (same bytes, same path, per bundle).

Either approach preserves “bundle is self-contained”.

---

## 5) What Goes Where (Ownership Boundaries)

### 5.1 CORE plugin responsibilities

CORE should own anything that is:
- reused across 2+ plugins,
- a safety standard, or
- a lifecycle invariant (session/task/reflect hooks).

Recommended CORE contents:

**A) Shared Node library (`core/lib`)**
- `DataAccessError` and other safety primitives (stop duplicating).
- Config loaders and env validation helpers (single way to validate creds and required env vars).
- Logging helpers (structured JSON logs, consistent file locations).
- Retry/backoff/rate-limit helpers (used by Monday/Marketo/HubSpot/etc).
- “Workflow scaffolding”: approval gates, idempotency ledger helpers, snapshot/rollback patterns.
- Shared reflection utilities currently duplicated in HubSpot/Salesforce.

**B) Shared hook implementations (CORE-owned)**
- `SessionStart` context loading patterns.
- `PreToolUse`/`PostToolUse` validation patterns (where safe/appropriate).
- Reflection pre/post hooks (standardized).
- The hook entrypoints in specialist plugins can remain, but they should delegate to CORE.

**C) Shared docs/templates**
- Shared docs that currently live in multiple plugins (or get copied around).
- Canonical “how to write agents” standards that apply across domains.

### 5.2 Specialist plugins responsibilities

Specialist plugins should contain only domain-specific assets:
- domain agents, domain commands, domain scripts, domain skills, domain templates/runbooks, domain MCP servers.

They should **not** contain shared platform code that CORE provides.

---

## 6) Proposed Specialist Modules Mapping (From current installables)

### 6.1 Salesforce module (`salesforce-plugin`)

Keep domain-specific:
- Flow authoring/testing/scanner integration, metadata deploy logic, permissions, territory, reports, org context specifics.

Move to CORE:
- shared reflection libs
- shared error/config/log primitives
- shared pre-task/reflect hook logic

### 6.2 HubSpot module (`hubspot-plugin`)

Keep domain-specific:
- CRM ops, workflows, CMS, SEO suite, HubSpot-specific integrations.

Move to CORE:
- shared reflection libs
- shared hook logic duplicated with Salesforce
- shared error/config/log primitives

### 6.3 Marketo module (`marketo-plugin`)

Keep:
- MCP server and Marketo tool implementations, Marketo agents/commands.

Use CORE for:
- auth/config validation patterns
- error + retry/backoff primitives
- standardized logging/reporting

### 6.4 Monday module (`monday-plugin`)

Keep:
- file extraction + GraphQL fallback + manifests.

Use CORE for:
- config validation
- rate limiting helpers
- logging/reporting conventions

### 6.5 Data Hygiene module (`data-hygiene-plugin`)

Keep:
- the 6-phase dedup workflow and domain logic.

Use CORE for:
- idempotency ledger framework
- snapshot/rollback scaffolding
- error/log/config primitives

### 6.6 GTM Planning module (`gtm-planning-plugin`)

Keep:
- planning workflow, scenario modeling, fairness validation.

Use CORE for:
- approval-gated workflow scaffolding
- standardized output/report packaging

### 6.7 Cross-Platform utilities (`cross-platform-plugin`)

Recommendation:
- Treat this as a specialist “Ops Utilities” module (Asana, Slides, PDF, diagram generation, UAT helpers).
- Extract any generally reusable routing/session/hook logic into CORE; keep platform-specific utilities here.

### 6.8 AI Consult (`ai-consult-plugin`)

Keep:
- Gemini CLI invocation, synthesis, triggers.

Use CORE for:
- shared “signal detection” helpers and telemetry/logging

---

## 7) Bundle Hygiene Recommendations (Installable outputs)

For installable bundles under `.claude-plugins/*`, ship only:
- `agents/`, `commands/`, `hooks/`, `scripts/`, `skills/`, `templates/`, `docs/`, `.claude-plugin/`, plus minimal runtime deps.

Avoid shipping:
- `coverage/`, large `test-output/`, transient caches, and ideally `node_modules/` unless required by the plugin runtime environment (if required, ensure it’s reproducible and minimal).

---

## 8) Migration Plan (Incremental, Low Risk)

### Phase 0 — Inventory + freeze interfaces (1–2 days)
- Declare the “public surface” for each plugin: commands, agent names, hook registrations.
- Decide naming for CORE plugin: recommended `opspal-core-plugin` (installable name).

### Phase 1 — CORE extraction without behavior change (2–5 days)
- Create `core/lib` and move first wave of shared libs (starting with `DataAccessError`).
- Add specialist “shim” files so existing require-paths in plugins don’t churn all at once.
- Extract shared reflection utilities into CORE.
- Extract duplicated hook implementations into CORE; keep existing hook entrypoints delegating to CORE.

### Phase 2 — Standardize lifecycle + config validation (3–7 days)
- Make HubSpot + Salesforce use the same CORE lifecycle hook implementations.
- Adopt one CORE config validation style across all specialists.

### Phase 3 — Bundle hygiene + source-of-truth cleanup (ongoing)
- Establish a packaging rule so `.claude-plugins/*` becomes generated output.
- Consolidate/retire the duplicate top-level `hubspot-plugin` directory (choose canonical source-of-truth).

### Phase 4 (Optional) — Further modularization inside large domains
- After CORE is stable, consider splitting Salesforce/HubSpot into submodules only if it materially improves deployability or ownership. Don’t do this upfront.

---

## 9) Acceptance Criteria (How you know it worked)

- No duplicated “platform primitives” across installable bundles (error handling, config validation, reflection utilities, lifecycle hooks).
- Specialist plugins remain installable and functional independently (self-contained bundles).
- Hook behavior is consistent across domains (same failure modes, same guardrails).
- `.claude-plugins/*` contains only shippable runtime artifacts.
- A new engineer can answer “where does this logic live?” with one rule: CORE for cross-cutting, modules for domain.

---

## 10) Immediate Next Actions (Recommended)

1. Confirm CORE plugin name (recommend: `opspal-core-plugin`).
2. Decide “source-of-truth” approach:
   - author in `core/` + `modules/`, generate `.claude-plugins/*`, or
   - keep authoring in `.claude-plugins/*` but still centralize shared code in a CORE-owned directory (less ideal).
3. Start Phase 1 with:
   - `DataAccessError` dedupe
   - HubSpot/Salesforce reflection utility dedupe
   - HubSpot/Salesforce duplicated hooks dedupe
