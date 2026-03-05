# OpsPal Core Extension Point Contracts

## Contract Principles
- Core owns orchestration, routing, governance, and runbook execution.
- Domains provide declarative packs and adapters only.
- Core never imports domain code directly; it loads packs via declared interfaces.
- Contracts are versioned. Backward compatibility is required within a major version.

## Common Types
- CoreResult: { status, data, warnings, errors }
- CoreError: { code, message, severity, context }
- ArtifactRef: { id, type, uri, checksum }

## AgentManifest
Purpose: Register domain agents and capabilities with Core routing.

Required fields:
- id
- name
- description
- domain
- version
- capabilities
- trigger_keywords
- entrypoint

Optional fields:
- tools
- policies
- runbook_tags
- examples

## RoutingRulePack
Purpose: Provide domain-specific routing hints to Core.

Required fields:
- pack_id
- version
- keywords
- complexity_hints
- blocked_operations

Optional fields:
- synonyms
- risk_tags

## RunbookPack
Purpose: Provide domain runbook content to Core runbook engine.

Required fields:
- runbook_id
- version
- domain
- steps
- required_inputs
- outputs

Optional fields:
- state_schema
- validations
- tags

## PolicyPack
Purpose: Provide domain policy rules for Core governance.

Required fields:
- policy_id
- scope
- enforcement_stage (pre | post)
- rules

Optional fields:
- severity_map
- exemptions

## HookHandlers
Purpose: Register domain hook handlers with Core governance.

Required fields:
- hook_event
- handler_ref
- input_schema
- output_schema

Optional fields:
- allowed_tools
- timeout_ms

## ValidationRulePack
Purpose: Provide validation rules to Core quality engine.

Required fields:
- validator_id
- version
- apply_to
- rules

Optional fields:
- severity_map
- remediation

## InstanceProvider
Purpose: Provide domain context and instance access to Core.

Required fields:
- provider_id
- domain
- list_instances
- load_context
- save_context

Optional fields:
- state_schema
- cache_ttl

## TemplatePack
Purpose: Provide domain templates for shared services (PDF/PPTX/Slides/Diagrams).

Required fields:
- template_id
- artifact_type
- required_inputs
- placeholders

Optional fields:
- validation_rules
- example_payloads

## DataHygieneAdapter
Purpose: Domain adapter for Core data hygiene capability.

Required fields:
- adapter_id
- domain
- object_map
- normalization_rules
- dedup_keys

Optional fields:
- conflict_resolution
- quality_thresholds

## Versioning Rules
- Major version changes require explicit migration plans and shims.
- Minor versions may add fields but must not break existing clients.
- Patch versions are for bug fixes only.
