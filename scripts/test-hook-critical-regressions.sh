#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

run_test() {
  local label="$1"
  shift

  printf '[hook-regressions] %s\n' "$label"
  (
    cd "$REPO_ROOT"
    "$@"
  )
}

run_test "deploy-scope-resolver" node plugins/opspal-core/test/hooks/unit/deploy-scope-resolver.test.js
run_test "task-router-deployment-routing" node plugins/opspal-core/test/hooks/unit/task-router-deployment-routing.test.js
run_test "claude-debug-log-analyzer" node plugins/opspal-core/test/hooks/unit/claude-debug-log-analyzer.test.js
run_test "claude-runtime-replay-validator" node plugins/opspal-core/test/hooks/unit/claude-runtime-replay-validator.test.js
run_test "runtime-incident-fixtures" node plugins/opspal-core/test/hooks/unit/runtime-incident-fixtures.test.js
run_test "json-hook-contracts" node plugins/opspal-core/test/hooks/unit/json-hook-contracts.test.js
run_test "agent-tool-registry" node plugins/opspal-core/test/hooks/unit/agent-tool-registry.test.js
run_test "validate-routing-integrity" node plugins/opspal-core/test/hooks/unit/validate-routing-integrity.test.js
run_test "subagent-start-context" node plugins/opspal-core/test/hooks/unit/subagent-start-context.test.js
run_test "subagent-stop-capture" node plugins/opspal-core/test/hooks/unit/subagent-stop-capture.test.js
run_test "task-completed-metrics" node plugins/opspal-core/test/hooks/unit/task-completed-metrics.test.js
run_test "stop-session-silent-failure-summary" node plugins/opspal-core/test/hooks/unit/stop-session-silent-failure-summary.test.js
run_test "pre-deploy-agent-context-check" node plugins/opspal-core/test/hooks/unit/pre-deploy-agent-context-check.test.js
run_test "salesforce-pre-bash-dispatcher" node plugins/opspal-core/test/hooks/unit/salesforce-pre-bash-dispatcher.test.js
run_test "salesforce-post-bash-dispatcher" node plugins/opspal-core/test/hooks/unit/salesforce-post-bash-dispatcher.test.js
run_test "hook-settings-normalizer" node plugins/opspal-core/test/hooks/unit/hook-settings-normalizer.test.js
run_test "hook-merger" node plugins/opspal-core/test/hooks/unit/hook-merger.test.js
run_test "post-plugin-update-fixes" node plugins/opspal-core/test/hooks/unit/post-plugin-update-fixes.test.js
run_test "finish-opspal-update-script" node plugins/opspal-core/test/finish-opspal-update-script.test.js
run_test "gtm-pre-write-gtm-path-validator" node plugins/opspal-core/test/hooks/unit/gtm-pre-write-gtm-path-validator.test.js
run_test "okr-pre-write-okr-path-validator" node plugins/opspal-core/test/hooks/unit/okr-pre-write-okr-path-validator.test.js

run_test "data-hygiene-deprecation-warning" node plugins/opspal-core/test/hooks/unit/data-hygiene-deprecation-warning.test.js
run_test "gtm-session-start-gtm-context-loader" node plugins/opspal-core/test/hooks/unit/gtm-session-start-gtm-context-loader.test.js
run_test "okr-session-start-okr-context-loader" node plugins/opspal-core/test/hooks/unit/okr-session-start-okr-context-loader.test.js
run_test "gtm-pre-task-gtm-approval-gate" node plugins/opspal-core/test/hooks/unit/gtm-pre-task-gtm-approval-gate.test.js
run_test "pre-deploy-flow-validation" node plugins/opspal-core/test/hooks/unit/pre-deploy-flow-validation.test.js
run_test "pre-deploy-report-quality-gate" node plugins/opspal-core/test/hooks/unit/pre-deploy-report-quality-gate.test.js
run_test "pre-deployment-comprehensive-validation" node plugins/opspal-core/test/hooks/unit/pre-deployment-comprehensive-validation.test.js
run_test "pre-task-agent-validator" node plugins/opspal-core/test/hooks/unit/pre-task-agent-validator.test.js
run_test "routing-chain" node plugins/opspal-core/test/hooks/integration/routing-chain.test.js
