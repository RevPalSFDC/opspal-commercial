# OpsPal Core

Purpose:
- Authoritative home for cross-cutting orchestration, governance, lifecycle, and intelligence
- Shared services for all domain packages (Domain -> Core only)

Modules:
- routing-enforcement
- orchestration
- runbooks-playbooks
- reflection-intelligence
- instance-environment-management
- task-asana-lifecycle
- developer-tooling
- data-hygiene-quality
- integration-automation
- documentation-generation

Key asset roots:
- agents/
- scripts/
- commands/
- hooks/
- runbooks/

Dependency rules:
- Domain packages may depend on OpsPal Core only
- OpsPal Core must not depend on domain packages
