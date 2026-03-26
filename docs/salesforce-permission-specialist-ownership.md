# Salesforce Permission Specialist Ownership

## Canonical Entry Point

`opspal-salesforce:sfdc-permission-orchestrator` is the canonical specialist entry point for Salesforce permission/security write workflows.

Use it for:
- permission set creation and updates
- permission set assignments
- field-level security and object access writes
- profile-permission changes that should stay inside the routed specialist path
- production permission/security changes that require governed execution

## Downstream Specialist Use

`opspal-salesforce:sfdc-security-admin` remains available as a downstream specialist for:
- profile-default and UI-heavy profile operations
- role hierarchy and sharing-rule work
- security audits and verification
- other security tasks that the permission orchestrator delegates intentionally

Parent and main-context routing should not start with `sfdc-security-admin` for generic permission/security writes.

## Completion Policy

- Restricted permission/security execution must stay inside the specialist path after routing.
- Generated scripts or artifacts must not hand execution back to the parent in the normal path.
- Parent-context handoff is reserved for clearly documented runtime or policy restrictions that prevent specialist completion.
