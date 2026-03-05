# OpsPal Core Phase 0 Enforcement Checklist

## Scope
- Applies to any change in Core or domain plugins.
- Use as PR checklist and as a CI lint gate.
- Core means: OpsPal Core plus developer-tools plugin and Core portions of data hygiene.

## Blocking Checks (Must Pass)
- [ ] No Core code depends on domain plugins, domain agents, or domain runbooks.
- [ ] No Domain plugin implements routing, orchestration, runbook engine, or governance frameworks.
- [ ] No Domain to Domain dependency introduced (direct or indirect).
- [ ] Any new shared utility is registered as a Core module or Core extension point.
- [ ] Any new agent routing rule is defined through Core routing packs, not in domains.
- [ ] Any new runbook execution logic is defined in Core; domains only provide runbook content.
- [ ] ai-consult-plugin does not own orchestration, routing, or governance.
- [ ] developer-tools-plugin does not reference domain assets.

## Required Checks (Non-Blocking in Phase 0, Warning Only)
- [ ] Domain changes declare which Core extension points they use.
- [ ] Data hygiene changes are split: core logic in Core; domain adapters in domain plugins.
- [ ] New hooks in domains are handlers only and register through Core governance hooks.
- [ ] New commands in domains are shims that delegate to Core services.

## Evidence Required
- [ ] Paths of touched files recorded.
- [ ] Extension points referenced are listed by name and version.
- [ ] Any exception is added to the exception registry with owner and expiry.

## Violation Severity
- Blocking: introduces Core to Domain dependency, new domain orchestrator, or new domain routing logic.
- Warning: domain owns shared utility, unregistered runbook content, or new hook logic without Core registration.
