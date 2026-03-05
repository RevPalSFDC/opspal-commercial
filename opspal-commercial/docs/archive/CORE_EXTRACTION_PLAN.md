# OpsPal Core Extraction Plan

## Goals
- Centralize cross-cutting orchestration, governance, and shared services into OpsPal Core.
- Keep domain plugins thin, declarative, and domain-specific.
- Preserve backward compatibility via shims.
- Prepare for future framework/LangGraph extraction without forcing it now.

## Phase 0: Catalog & Boundary Enforcement (No Refactors)
**Objectives**
- Complete asset inventory and classification (see `OPSPAL_CORE_CATALOG.json`).
- Establish enforceable Core vs Domain boundaries.
- Prevent new cross-cutting logic from being implemented in domain plugins.

**Deliverables**
- Architecture boundary guide (`OPSPAL_CORE_BOUNDARY.md`).
- Core module map with owned assets and interfaces.
- CI/PR checklist updates for boundary enforcement.

**Guardrails**
- Block new routing/governance/runbook frameworks inside domain plugins.
- Require all shared utilities to be registered as Core modules.

## Phase 1: Core-First Orchestration With Domain Shims
**Objectives**
- Extract Core modules from cross-platform, data-hygiene, developer-tools, and ai-consult plugins.
- Insert domain shims to preserve existing command/agent entry points.
- Ensure domain plugins depend on Core interfaces only.

**Key Steps**
1. **Module extraction**
   - Routing & Agent Registry
   - Orchestration & Workflow Engine
   - Runbook & Playbook Engine
   - Governance & Safety
   - Instance & Context Management
   - Reflection & Learning
   - Quality & Validation
   - Shared Services & Integrations
   - External Consultation
2. **Shim layer**
   - Maintain existing domain command/agent names.
   - Redirect domain hooks to Core governance hooks.
3. **Shared services migration**
   - Move shared scripts and templates to Core packages.
   - Replace duplicated utilities with Core imports.

**Risks**
- Routing and governance changes can block operations if interfaces drift.
- Runbook engine migration may alter state paths or checkpoints.

**Mitigations**
- Strict compatibility tests for routing decisions and hook behavior.
- Runbook execution in shadow mode before cutover.

## Phase 2: Framework Readiness (Future)
**Objectives**
- Provide framework-agnostic Core service interfaces.
- Prepare adapters for LangGraph or future orchestrators.

**Key Steps**
- Define Core service contracts as stable APIs.
- Add event bus/adapters for external orchestration frameworks.
- Document migration strategy for domain packs.

## Duplication & Drift Findings (Consolidation Targets)
**High-Signal Duplicates**
- Shared hooks repeated across multiple plugins (e.g., `post-install.sh`, `post-reflect.sh`).
- Shared commands duplicated in cross-platform and salesforce plugins (e.g., `/asana-link`, `/asana-update`).
- Shared agent references duplicated across plugins (e.g., `shared/playbook-reference.yaml`).
- Shared utilities duplicated across domain plugins (e.g., `lib/data-access-error.js`, `check-plugin-updates.sh`).

**Consolidation Recommendations**
- Move shared hooks into Core Governance & Safety and have domains register hook handlers only.
- Move shared commands into Core Shared Services; domains register only capabilities.
- Promote shared agent references to Core-owned prompt libraries.
- Consolidate shared scripts into Core Utilities with versioned interfaces.

## Guardrails & Validation
- Every phase requires regression checks for routing, hooks, and runbook execution.
- Domain plugin PRs must declare which Core extension points they use.
- Core must never depend on domain implementations; use adapter interfaces only.
