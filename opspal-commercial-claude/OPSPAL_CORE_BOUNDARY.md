# OpsPal Core Boundary

## Purpose
Establish enforceable boundaries between OpsPal Core (cross-platform orchestration and governance) and domain plugins (Salesforce, HubSpot, GTM, etc.). This keeps domain plugins thin and declarative, and prevents Core from depending on any domain.

## Core Ownership (Exclusive)
- Routing engine, agent registry, and complexity scoring.
- Orchestration engine, workflow lifecycle, scheduling, and cross-domain coordination.
- Runbook and playbook engine (execution, validation, versioning, state).
- Governance, policy enforcement, and safety hooks (pre/post checks, guardrails, error prevention).
- Reflection system, taxonomy, cohort detection, and improvement planning.
- Instance/context management (platform-agnostic context, state, metadata caches).
- Data hygiene, quality, and validation frameworks (schema validation, plugin validation, quality scoring).
- Developer experience and tooling (schemas, plugin validation, diagnostics, standards enforcement).
- Shared services reused across domains (PDF/PPTX/Slides/diagram generation, Asana integration, diagnostics).
- Observability/diagnostics and reporting infrastructure for Core workflows.

## Domain Ownership (Exclusive)
- Domain-specific agents, prompts, and workflows (Salesforce/HubSpot/GTM/etc.).
- Domain API usage, objects, schemas, and business rules.
- Domain runbook content (steps, data mappings, remediation instructions).
- Domain-specific templates, reports, and outputs not reused by other domains.
- Domain-specific configuration and credentials.

## Designated Plugin Roles
- developer-tools-plugin: Core module (DevX and validation). It must never depend on a domain.
- data-hygiene-plugin: Core capability with thin, domain-specific adapters living in domain plugins.
- ai-consult-plugin: Domain plugin. It must consume Core interfaces and must not own orchestration, routing, or governance.

## Forbidden in Domain Plugins
- Implementing or forking routing logic, agent registries, or complexity scoring.
- Implementing cross-domain orchestration or lifecycle management.
- Creating standalone governance frameworks, hook runtimes, or policy engines.
- Building independent reflection pipelines or taxonomy systems.
- Creating shared utilities without registering them as Core modules.
- Direct domain-to-domain dependencies (Domain to Domain is forbidden).

## Allowed Dependency Direction
- Domain to Core: allowed and expected.
- Core to Domain: forbidden. Core may only call domain logic through declared extension interfaces.
- Domain to Domain: forbidden. Use Core orchestration as the mediator.

## Extension Points (Core Interfaces for Domains)
- Agent registration: `AgentManifest` (capabilities, trigger keywords, tool access).
- Routing rules: `RoutingRulePack` (keywords, disallowed operations, complexity hints).
- Runbooks: `RunbookPack` (domain-specific runbook definitions).
- Policies/hooks: `PolicyPack` and `HookHandlers` for domain validations.
- Validation: `ValidationRulePack` and `SchemaAdapters`.
- Instance adapters: `InstanceProvider` for domain contexts and state.
- Output templates: `TemplatePack` for PDFs, slides, diagrams, and reports.

## Enforcement
- Every new cross-cutting capability must be implemented in Core or as a Core extension pack.
- Domain plugins must reference Core interfaces instead of embedding shared logic.
- PR review checklist: verify no new routing, hook frameworks, or reflection pipelines are added to domains.
- Core modules publish versioned interfaces; domain plugins may only depend on public Core interfaces.

## Backward Compatibility
- Domain plugins retain existing commands/agents via shims that delegate to Core.
- Deprecated domain implementations remain read-only until migration is complete.
- Runbooks remain executable; domain-specific content migrates without changing identifiers.
