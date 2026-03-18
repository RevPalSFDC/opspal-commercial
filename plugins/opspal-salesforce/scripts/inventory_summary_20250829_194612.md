# Script Inventory Summary Report

Generated: 2025-08-29 19:46:12

## Statistics

- **Total Scripts**: 144
- **Shell Scripts**: 98
- **Python Scripts**: 46
- **Total Lines**: 31,199
- **Total Functions**: 525
- **Scripts with Issues**: 111

## Scripts by Category

### Data Operations (2 scripts)
- `smart-import-orchestrator.sh` - critical priority - Issues: potential_credentials
- `safe-bulk-import.sh` - critical priority - Issues: uses_eval

### Deployment (37 scripts)
- `deploy-revenue-fields-enhanced.sh` - normal priority
- `deploy-revenue-fields.sh` - normal priority
- `deploy-rollup-solution.sh` - normal priority - Issues: missing_set_e
- `deploy-flow-removal.sh` - normal priority
- `run_deploy.sh` - normal priority - Issues: missing_set_e
- ... and 32 more

### Error Handling (6 scripts)
- `fix-flow-debug-actions.sh` - normal priority - Issues: missing_set_e
- `smart-retry.sh` - normal priority
- `claude-with-retry.sh` - medium priority - Issues: missing_set_e
- `error-prevention-guard.sh` - critical priority - Issues: uses_eval
- `error-pattern-learner.py` - critical priority - Issues: missing_type_hints, potential_credentials
- ... and 1 more

### General (23 scripts)
- `update-agent-models.sh` - normal priority
- `smart-operation-wrapper.py` - normal priority
- `verify-implementation.sh` - normal priority
- `safe-soql-query.sh` - normal priority
- `persist-instance-config.sh` - normal priority
- ... and 18 more

### Integration (9 scripts)
- `cleanup-mcp.sh` - normal priority
- `claude-instance-manager.sh` - normal priority - Issues: missing_set_e
- `mcp-wrapper.sh` - normal priority
- `setup-claude-tools.sh` - normal priority - Issues: missing_set_e
- `install-mcp-service.sh` - normal priority
- ... and 4 more

### Monitoring (5 scripts)
- `monitor-agent-performance.sh` - normal priority
- `mcp-health-monitor.sh` - medium priority
- `claude-performance-monitor.sh` - medium priority - Issues: missing_set_e
- `claude-monitor.sh` - medium priority - Issues: missing_set_e
- `job-monitor.sh` - critical priority - Issues: uses_eval, potential_credentials

### Setup (2 scripts)
- `init-salesforce-instance.sh` - critical priority - Issues: potential_credentials
- `setup-asana-integration.sh` - critical priority - Issues: potential_credentials

### Testing (22 scripts)
- `test-renewal-automation.sh` - normal priority - Issues: missing_set_e
- `test-error-management.sh` - normal priority
- `test-rollup-solution.sh` - normal priority - Issues: missing_set_e
- `test-agent-field-verification.sh` - normal priority
- `test-renewal-opportunity-tracking.sh` - normal priority - Issues: missing_set_e
- ... and 17 more

### Utilities (27 scripts)
- `exec_direct.sh` - normal priority - Issues: missing_set_e
- `switch-instance.sh` - normal priority - Issues: missing_set_e
- `exec_retrieve.py` - normal priority - Issues: missing_type_hints
- `simple_retrieve.sh` - normal priority - Issues: missing_set_e
- `retrieve_contact_layout.sh` - normal priority - Issues: missing_set_e
- ... and 22 more

### Validation (11 scripts)
- `validate-soql.sh` - normal priority
- `validate-file-placement.sh` - normal priority
- `run_contract_validation_analysis.sh` - normal priority
- `check-and-remove.sh` - normal priority
- `check_sf_cli.py` - normal priority - Issues: missing_type_hints
- ... and 6 more

## Critical Issues

- **run-revops-assessment.sh**: potential_credentials
- **validation-rule-manager.sh**: uses_eval, potential_credentials
- **smart-import-orchestrator.sh**: potential_credentials
- **agent-investigator.sh**: potential_credentials
- **error-prevention-guard.sh**: uses_eval
- **safe-bulk-import.sh**: uses_eval
- **safe-json-parser.py**: bare_except, potential_credentials
- **investigation-engine.py**: potential_credentials
- **audit-logger.py**: potential_credentials
- **job-monitor.sh**: uses_eval, potential_credentials
- **error-pattern-learner.py**: missing_type_hints, potential_credentials
- **analyze-contract-validation-rules.sh**: potential_credentials
- **init-salesforce-instance.sh**: potential_credentials
- **test-contract-creation-flow.sh**: uses_eval, potential_credentials
- **agent-auto-resolver.sh**: uses_eval, potential_credentials
- **auto-fix-engine.py**: bare_except, potential_credentials
- **claude-dashboard.sh**: missing_set_e, potential_credentials
- **test-verification-system.sh**: uses_eval
- **verify-field-accessibility.sh**: uses_eval
- **update-verifier.py**: potential_credentials
- **pre-import-validator.sh**: uses_eval
- **test-auto-fix.sh**: uses_eval
- **response-validator.py**: potential_credentials
- **generate-script-inventory.py**: bare_except, potential_credentials, has_todo_items
- **set-asana-project.sh**: missing_set_e, potential_credentials
- **setup-asana-integration.sh**: potential_credentials
- **execute-asana-sync.sh**: missing_set_e, potential_credentials
- **direct_search.py**: bare_except, missing_type_hints, potential_credentials
- **update_asana_audit_findings.py**: missing_type_hints, potential_credentials
- **update_asana_specific_findings.py**: missing_type_hints, potential_credentials
- **security_analysis.py**: missing_type_hints, potential_credentials
- **cleanup-main-directory.sh**: potential_credentials
- **manual_search_results.py**: missing_type_hints, potential_credentials
- **salesforce-deployment-utils.sh**: missing_set_e, uses_eval, potential_credentials

## Large Scripts (>500 lines)

- `investigation-engine.py`: 1303 lines
- `diagnostic-toolkit.sh`: 826 lines
- `soql_helper.py`: 796 lines
- `claude-dashboard.sh`: 763 lines
- `auto-fix-engine.py`: 740 lines
- `audit-logger.py`: 732 lines
- `update-verifier.py`: 618 lines
- `test-contract-creation-flow.sh`: 598 lines
- `chunked-operations.py`: 571 lines
- `smart-import-orchestrator.sh`: 560 lines
- `response-validator.py`: 550 lines
- `agent-investigator.sh`: 545 lines
- `job-monitor.sh`: 541 lines
- `safe-update.sh`: 539 lines
- `test-verification-system.sh`: 515 lines
- `test-auto-fix.sh`: 509 lines
- `validation-rule-manager.sh`: 504 lines

## High Optimization Potential

- `investigation-engine.py`: 1303 lines, 1 issues
- `diagnostic-toolkit.sh`: 826 lines, 0 issues
- `claude-dashboard.sh`: 763 lines, 2 issues
- `auto-fix-engine.py`: 740 lines, 2 issues
- `audit-logger.py`: 732 lines, 1 issues
- `update-verifier.py`: 618 lines, 1 issues
- `test-contract-creation-flow.sh`: 598 lines, 2 issues
- `chunked-operations.py`: 571 lines, 1 issues
- `smart-import-orchestrator.sh`: 560 lines, 1 issues
- `response-validator.py`: 550 lines, 1 issues
