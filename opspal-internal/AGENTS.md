# Repository Guidelines

## Project Structure & Module Organization
- `cross-platform-ops/` hosts the shared CLI and MCP runtime; code sits in `core/`, `modules/`, `cli/`, with configs in `config/` and automations in `workflows/`.
- `SFDC/` contains Salesforce automation, instance assets (`instances/`), orchestration scripts (`scripts/`), and Jest suites (`tests/`).
- `HS/` mirrors the HubSpot stack with integration libs in `lib/`, portal materials in `instances/`, and operational scripts in `scripts/`.
- Governance and agent metadata live in `agents/`; shared exports and infra tooling reside in `data/`, `backups/`, and `infrastructure/`.

## Build, Test, and Development Commands
- Use Node 18+ (`nvm use 18`) and install dependencies per module.
- Cross-platform: `cd cross-platform-ops && npm install && npm run cli` for the local CLI, `npm run start` for MCP services, `npm run lint` before commits.
- Salesforce: `cd SFDC && npm install && npm test`; run `npm run config:validate` against the target org.
- HubSpot: `cd HS && npm install && npm test`; onboarding flows rely on `npm run setup` or `npm run setup:oauth`.
- Switch customer contexts with `cross-platform-ops/scripts/switch-environment.sh` or `npm run env:list` / `env:switch`.

## Coding Style & Naming Conventions
- Stick with CommonJS, match surrounding indentation (4 spaces in `SFDC`, 2 spaces elsewhere), and keep files under 120 columns.
- Commands and directories stay kebab-case; exported datasets remain snake_case.
- `.env.customer-environment` naming is mandatory; do not commit credentials or generated exports.

## Testing Guidelines
- Place specs under `test/` or `tests/` using `.test.js`.
- Cross-platform logic uses Jest (`npm run test`, `npm run test:coverage`) with NYC coverage gates.
- Salesforce offers targeted suites: `npm run test:unit`, `npm run test:integration`, `npm run test:coverage`.
- HubSpot executes via `test/test-suite.js` plus `npm run test:agents` and `npm run test:performance`; capture CLI output when validating tenants.

## Commit & Pull Request Guidelines
- Follow Conventional Commits (`feat(scope):`, `fix:`); include the affected module in the scope when relevant.
- Bundle related changes and paste executed validation commands in the message body.
- PRs should outline customer impact, link tickets, attach test or CLI transcripts, and flag risky config edits for cross-team review.

## Agent & Environment Notes
- Update `instance-pairings.json` alongside any customer move and rerun `cross-platform-ops && npm run validate`.
- Local agent checks live under `cross-platform-ops/agents`; use `npm run agents:start` and share sample payloads in PRs.
- Maintain tenant `.env` files outside version control and rotate tokens after staging or production incidents.
