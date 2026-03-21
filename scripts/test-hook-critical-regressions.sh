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
run_test "subagent-start-context" node plugins/opspal-core/test/hooks/unit/subagent-start-context.test.js
run_test "subagent-stop-capture" node plugins/opspal-core/test/hooks/unit/subagent-stop-capture.test.js
run_test "task-completed-metrics" node plugins/opspal-core/test/hooks/unit/task-completed-metrics.test.js
run_test "stop-session-silent-failure-summary" node plugins/opspal-core/test/hooks/unit/stop-session-silent-failure-summary.test.js
run_test "pre-deploy-agent-context-check" node plugins/opspal-core/test/hooks/unit/pre-deploy-agent-context-check.test.js
run_test "salesforce-pre-bash-dispatcher" node plugins/opspal-core/test/hooks/unit/salesforce-pre-bash-dispatcher.test.js
run_test "salesforce-post-bash-dispatcher" node plugins/opspal-core/test/hooks/unit/salesforce-post-bash-dispatcher.test.js
run_test "gtm-pre-write-gtm-path-validator" node plugins/opspal-core/test/hooks/unit/gtm-pre-write-gtm-path-validator.test.js
run_test "okr-pre-write-okr-path-validator" node plugins/opspal-core/test/hooks/unit/okr-pre-write-okr-path-validator.test.js
run_test "mcp-client-pre-opspal-compute" node plugins/opspal-core/test/hooks/unit/mcp-client-pre-opspal-compute.test.js
run_test "mcp-client-pre-opspal-scoring" node plugins/opspal-core/test/hooks/unit/mcp-client-pre-opspal-scoring.test.js
run_test "data-hygiene-deprecation-warning" node plugins/opspal-core/test/hooks/unit/data-hygiene-deprecation-warning.test.js
run_test "gtm-session-start-gtm-context-loader" node plugins/opspal-core/test/hooks/unit/gtm-session-start-gtm-context-loader.test.js
run_test "okr-session-start-okr-context-loader" node plugins/opspal-core/test/hooks/unit/okr-session-start-okr-context-loader.test.js
run_test "gtm-pre-task-gtm-approval-gate" node plugins/opspal-core/test/hooks/unit/gtm-pre-task-gtm-approval-gate.test.js
run_test "pre-deploy-flow-validation" node plugins/opspal-core/test/hooks/unit/pre-deploy-flow-validation.test.js
run_test "pre-deploy-report-quality-gate" node plugins/opspal-core/test/hooks/unit/pre-deploy-report-quality-gate.test.js
run_test "pre-deployment-comprehensive-validation" node plugins/opspal-core/test/hooks/unit/pre-deployment-comprehensive-validation.test.js
run_test "pre-task-agent-validator" node plugins/opspal-core/test/hooks/unit/pre-task-agent-validator.test.js
run_test "routing-chain" node plugins/opspal-core/test/hooks/integration/routing-chain.test.js
