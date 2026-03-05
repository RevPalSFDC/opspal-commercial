#!/usr/bin/env bash

#
# CI Gate: Cohort Runbook Coverage
#
# Fails when required runbook/artifact mappings for unresolved reflection cohorts
# are incomplete. This enforces runbook-first remediation readiness.
#
# Usage:
#   bash scripts/ci/validate-cohort-runbook-coverage.sh
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_DIR="$(dirname "$SCRIPT_DIR")"

echo "==> Validating cohort runbook coverage (strict mode)"
node "$PLUGIN_DIR/validate-playbook-usage.js" cohorts --strict

echo "==> Cohort runbook coverage validation passed"
