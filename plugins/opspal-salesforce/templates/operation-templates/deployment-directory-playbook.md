# Deployment Directory Playbook

Use this reference when a task must write, inspect, or package artifacts in a deployment directory.

## Operating Rules

- Keep deployable metadata grouped by operation scope.
- Preserve package manifests, source paths, and rollback artifacts together.
- Record the exact target org and command sequence alongside the deployment bundle.
- Do not mix exploratory scratch work with deploy-ready assets.

## Required Checks

- Confirm the directory contains only the metadata needed for the deployment.
- Confirm package manifests and referenced files are in sync.
- Confirm any generated artifacts are reproducible from tracked inputs.
- Confirm rollback or recovery steps are documented before promotion.

## Recommended Layout

- `force-app/` or package source tree for deployable metadata
- `manifest/` for package XML or related selectors
- `reports/` or `artifacts/` for validation evidence
- `rollback/` for recovery assets when the change is high risk
