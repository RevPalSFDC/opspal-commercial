# OpsPal Core Boundaries

## Purpose
Define explicit ownership and dependency boundaries so OpsPal Core becomes the authoritative home for cross-cutting governance, orchestration, lifecycle, and intelligence logic.

## Package Model
OpsPal ships as a modular package set:
- Core package: `./.claude-plugins/opspal-core-plugin/packages/opspal-core/`
- Domain packages: `./.claude-plugins/opspal-core-plugin/packages/domains/<domain>/`
- Legacy layout: `./.claude-plugins/opspal-core-plugin/<type>/<plugin>/` remains for backward compatibility

The packages layout is the authoritative product structure. The legacy layout is compatibility-only and will be retired after migration.

Package-local compatibility roots exist under `opspal-core/` for legacy-style paths (e.g., `cross-platform-plugin`, `developer-tools-plugin`) and are surfaced to domain packages via symlinks. These shims must not introduce new logic.

## Core Package Ownership (Exclusive)
OpsPal Core exclusively owns:
- Routing, policy enforcement, and governance registries
- Cross-platform orchestration, scheduling, and lifecycle coordination
- Shared runbooks/playbooks and generator tooling
- Reflection, diagnostics, and intelligence workflows
- Instance and environment management utilities
- Task/Asana lifecycle orchestration
- Developer tooling, validation, and plugin health checks

## Shared Functions Catalog (Core-Owned)
These shared functions are authoritative in Core and must be consumed by all domain packages:
- Routing & enforcement: routing registries, policy validators, and enforcement hooks
- Orchestration: workflow orchestration, scheduling, and task-graph coordination
- Runbooks & playbooks: shared operational guidance and runbook generators
- Reflection & intelligence: diagnostics, audits, and reflection pipelines
- Instance & environment: provisioning, backups, sync, and environment profiles
- Task & Asana lifecycle: task orchestration and lifecycle coordination
- Developer tooling: plugin health checks, validation utilities, and diagnostics
- Data hygiene & quality: shared deduplication and validation workflows
- Integration automation: automation builders and workflow lifecycle helpers
- Documentation generation: diagram, PDF, and presentation generators

## Domain Module Responsibilities (Allowed)
Domain packages MAY:
- Implement domain-specific adapters and connectors
- Provide domain-specific task steps called by core orchestrators
- Contribute domain runbooks that are registered in core-owned runbook indices
- Supply data extractors/validators called by core data hygiene tooling

## Dependency Direction (Enforced)
- Domain packages may depend on OpsPal Core only
- OpsPal Core MUST NOT import or depend on domain packages
- Domain packages MUST NOT depend on each other

## Forbidden Patterns (Must Not Implement in Domain Packages)
These rules are intended to be enforced via CI/linting later:
- Domain packages MUST NOT introduce top-level directories or files matching:
  - `routing*`, `router*`, `policy*`, `governance*`, `enforce*`
  - `scheduler*`, `orchestration*`, `lifecycle*`, `task-graph*`
- Domain packages MUST NOT create or update routing registries (e.g., `routing-index.json`) outside OpsPal Core
- Domain packages MUST NOT define cross-package hooks; hooks in domain packages must be local-only
- Domain packages MUST NOT define new shared runbooks/playbooks outside OpsPal Core once migration begins
- Domain packages MUST NOT add cross-domain imports or references

## Approved Extension Mechanisms
- Domain adapters that call OpsPal Core scripts/agents without duplicating orchestration logic
- Domain runbooks/playbooks registered under OpsPal Core runbook indices
- Domain-specific routing rules provided as declarative configs consumed by Core

## Enforcement Targets (CI/Lint-Ready)
- Block additions under `./.claude-plugins/*/routing*`, `*/scheduler*`, `*/governance*`, `*/policy*` for non-core packages
- Block any new files matching `routing-index.json` outside `./.claude-plugins/opspal-core-plugin/`
- Block imports from `./.claude-plugins/opspal-core-plugin/packages/domains/*` into OpsPal Core
- Block cross-domain imports between `./.claude-plugins/opspal-core-plugin/packages/domains/*`
- Run `scripts/validate-opspal-packages.js` to enforce canonical package paths in domain docs

## Assumptions
- Ownership boundaries will be tightened as core adoption increases
- Heuristics used in Phase 0 classification require manual validation for edge cases
