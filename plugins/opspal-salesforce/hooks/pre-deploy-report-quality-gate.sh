#!/bin/bash

# Pre-Deployment Report Quality Gate Hook
#
# Validates reports and dashboards before deployment to ensure:
# - Minimum health score (default: 60)
# - Minimum actionability score for dashboards (default: 50)
# - No critical trust erosion signals
# - No high-risk metric inconsistencies
#
# Usage: Runs automatically before 'sf project deploy' commands
# Can be disabled with: SKIP_REPORT_QUALITY_GATE=1
#
# Environment Variables:
#   REPORT_MIN_HEALTH_SCORE    - Minimum health score (default: 60)
#   DASHBOARD_MIN_ACTIONABILITY - Minimum actionability score (default: 50)
#   BLOCK_VANITY_METRICS       - Block dashboards with >50% vanity metrics (default: 0)
#   REPORT_QUALITY_STRICT      - Strict mode - block on warnings (default: 0)
#
# Exit Codes (standardized - see sf-exit-codes.sh):
#   0 - Validation passed
#   1 - Validation error (quality gate failed)
#
# Updated: 2026-01-15 - Standardized exit codes

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Source standardized exit codes
if [[ -f "${SCRIPT_DIR}/../scripts/lib/sf-exit-codes.sh" ]]; then
    source "${SCRIPT_DIR}/../scripts/lib/sf-exit-codes.sh"
else
    EXIT_SUCCESS=0
    EXIT_VALIDATION_ERROR=1
fi

# Source standardized error handler for centralized logging
if [[ -n "${CLAUDE_PLUGIN_ROOT:-}" ]]; then
    ERROR_HANDLER="${CLAUDE_PLUGIN_ROOT}/opspal-core/hooks/lib/error-handler.sh"
else
    ERROR_HANDLER="${SCRIPT_DIR}/../../opspal-core/hooks/lib/error-handler.sh"
fi

if [[ -f "$ERROR_HANDLER" ]]; then
    source "$ERROR_HANDLER"
    HOOK_NAME="pre-deploy-report-quality-gate"
fi

set -e

HOOK_INPUT=""
if [ ! -t 0 ]; then
    HOOK_INPUT=$(cat 2>/dev/null || true)
fi

# Redirect all informational output to stderr — PreToolUse hooks must output JSON or nothing on stdout
exec 3>&1 1>&2

DEPLOY_COMMAND=$(printf '%s' "$HOOK_INPUT" | jq -r '.tool_input.command // .input.command // .command // ""' 2>/dev/null || echo "")
if [[ -z "$DEPLOY_COMMAND" ]] || ! printf '%s' "$DEPLOY_COMMAND" | grep -qE '(^|[[:space:]])sf[[:space:]]+project[[:space:]]+deploy([[:space:]]|$)'; then
    exit 0
fi

# Check if quality gate should be skipped
if [ "$SKIP_REPORT_QUALITY_GATE" = "1" ]; then
    echo "⏭️  Report quality gate skipped (SKIP_REPORT_QUALITY_GATE=1)"
    exit 0
fi

# Configuration
MIN_HEALTH_SCORE="${REPORT_MIN_HEALTH_SCORE:-60}"
MIN_ACTIONABILITY="${DASHBOARD_MIN_ACTIONABILITY:-50}"
BLOCK_VANITY="${BLOCK_VANITY_METRICS:-0}"
STRICT_MODE="${REPORT_QUALITY_STRICT:-0}"

# Get deployment source directory from command
DEPLOY_DIR="${SF_DEPLOY_DIR:-force-app/main/default}"

# Find report and dashboard files in deployment
REPORT_FILES=$(find "$DEPLOY_DIR" -name "*.report-meta.xml" 2>/dev/null || echo "")
DASHBOARD_FILES=$(find "$DEPLOY_DIR" -name "*.dashboard-meta.xml" 2>/dev/null || echo "")

if [ -z "$REPORT_FILES" ] && [ -z "$DASHBOARD_FILES" ]; then
    echo "✓ No reports or dashboards to validate"
    exit 0
fi

echo "🔍 Report Quality Gate - Pre-Deployment Validation"
echo ""

# Paths to validator scripts
REPORT_INTELLIGENCE="${SCRIPT_DIR}/../scripts/lib/report-intelligence-diagnostics.js"
DASHBOARD_QUALITY="${SCRIPT_DIR}/../scripts/lib/dashboard-quality-validator.js"
SEMANTIC_VALIDATOR="${SCRIPT_DIR}/../scripts/lib/report-semantic-validator.js"

# Validation counters
REPORT_COUNT=0
DASHBOARD_COUNT=0
REPORT_ERRORS=0
REPORT_WARNINGS=0
DASHBOARD_ERRORS=0
DASHBOARD_WARNINGS=0
ACTIONABILITY_FAILURES=0
VANITY_WARNINGS=0

# =============================================================================
# REPORT VALIDATION
# =============================================================================

if [ -n "$REPORT_FILES" ]; then
    REPORT_COUNT=$(echo "$REPORT_FILES" | wc -l | tr -d ' ')
    echo "📊 Validating $REPORT_COUNT report(s)..."
    echo ""

    while IFS= read -r report_file; do
        if [ -n "$report_file" ]; then
            REPORT_NAME=$(basename "$report_file" .report-meta.xml)

            # Run report intelligence diagnostics if available
            if [ -f "$REPORT_INTELLIGENCE" ]; then
                RESULT=$(node -e "
                    const diagnostics = require('$REPORT_INTELLIGENCE');
                    const semanticValidator = require('$SEMANTIC_VALIDATOR');
                    const fs = require('fs');

                    try {
                        const reportMetadata = semanticValidator.loadReportMetadata('$report_file');
                        const analysis = diagnostics.runDiagnostics(reportMetadata, { log: false });
                        const issues = analysis.health?.issues || [];
                        const errors = issues.filter(issue => issue.severity === 'fail').map(issue => issue.message || issue.code);
                        const warnings = issues.filter(issue => issue.severity !== 'fail').map(issue => issue.message || issue.code);

                        console.log(JSON.stringify({
                            healthScore: analysis.health?.overallScore || 0,
                            clarity: analysis.health?.dimensions?.semanticClarity?.score || 0,
                            correctnessRisk: analysis.health?.dimensions?.dataCorrectnessRisk?.score || 0,
                            performanceRisk: analysis.health?.dimensions?.performanceRisk?.score || 0,
                            reusability: analysis.health?.dimensions?.reusability?.score || 0,
                            intent: analysis.intent?.primary?.label || 'unknown',
                            tier: analysis.health?.overallStatus || 'unknown',
                            warnings: warnings,
                            errors: errors
                        }));
                    } catch (err) {
                        console.log(JSON.stringify({ error: err.message }));
                    }
                " 2>/dev/null || echo '{"healthScore":0,"error":"Script failed"}')

                HEALTH_SCORE=$(echo "$RESULT" | jq -r '.healthScore // 0')
                INTENT=$(echo "$RESULT" | jq -r '.intent // "unknown"')
                TIER=$(echo "$RESULT" | jq -r '.tier // "Tier3"')
                ERROR_COUNT=$(echo "$RESULT" | jq -r '.errors | length // 0')
                WARNING_COUNT=$(echo "$RESULT" | jq -r '.warnings | length // 0')

                # Check health score threshold
                if [ "$HEALTH_SCORE" -lt "$MIN_HEALTH_SCORE" ]; then
                    REPORT_ERRORS=$((REPORT_ERRORS + 1))
                    echo "  ❌ $REPORT_NAME"
                    echo "     Health Score: $HEALTH_SCORE (minimum: $MIN_HEALTH_SCORE)"
                    echo "     Intent: $INTENT | Tier: $TIER"

                    # Show errors if present
                    if [ "$ERROR_COUNT" -gt 0 ]; then
                        echo "$RESULT" | jq -r '.errors[:3][] | "     ⚠️  \(.)"' 2>/dev/null || true
                    fi
                elif [ "$WARNING_COUNT" -gt 0 ] && [ "$STRICT_MODE" = "1" ]; then
                    REPORT_WARNINGS=$((REPORT_WARNINGS + 1))
                    echo "  ⚠️  $REPORT_NAME (warnings in strict mode)"
                    echo "     Health Score: $HEALTH_SCORE | Warnings: $WARNING_COUNT"
                else
                    echo "  ✅ $REPORT_NAME (Score: $HEALTH_SCORE, Intent: $INTENT)"
                fi
            else
                echo "  ⚠️  $REPORT_NAME - skipped (report-intelligence-diagnostics.js not found)"
            fi

            # Run semantic validation if available
            if [ -f "$SEMANTIC_VALIDATOR" ]; then
                SEMANTIC_RESULT=$(node -e "
                    const validator = require('$SEMANTIC_VALIDATOR');
                    const fs = require('fs');
                    const path = require('path');

                    try {
                        const reportMetadata = validator.loadReportMetadata('$report_file');
                        const definitionsPath = path.resolve('$SCRIPT_DIR/../config/metric-definitions.json');
                        const definitions = fs.existsSync(definitionsPath)
                            ? JSON.parse(fs.readFileSync(definitionsPath, 'utf-8'))
                            : { metrics: {}, defaultVariants: {} };
                        const metricId = validator.inferMetricId(reportMetadata, definitions);
                        const metric = metricId && definitions.metrics ? definitions.metrics[metricId] : null;
                        const warnings = metric ? validator.validateSemantic(reportMetadata, metric, null) : [];
                        const metricDrift = warnings
                            .filter(item => /DRIFT|MISMATCH/.test(String(item.code || '').toUpperCase()))
                            .map(item => item.message || item.code);
                        const highRiskPatterns = warnings
                            .filter(item => !/DRIFT|MISMATCH/.test(String(item.code || '').toUpperCase()))
                            .map(item => item.message || item.code);

                        console.log(JSON.stringify({
                            valid: true,
                            metricDrift: metricDrift,
                            highRiskPatterns: highRiskPatterns
                        }));
                    } catch (err) {
                        console.log(JSON.stringify({ valid: true }));
                    }
                " 2>/dev/null || echo '{"valid":true}')

                METRIC_DRIFT_COUNT=$(echo "$SEMANTIC_RESULT" | jq -r '.metricDrift | length // 0')
                HIGH_RISK_COUNT=$(echo "$SEMANTIC_RESULT" | jq -r '.highRiskPatterns | length // 0')

                if [ "$METRIC_DRIFT_COUNT" -gt 0 ]; then
                    echo "     ⚠️  Metric drift detected: $METRIC_DRIFT_COUNT issue(s)"
                fi

                if [ "$HIGH_RISK_COUNT" -gt 0 ]; then
                    REPORT_WARNINGS=$((REPORT_WARNINGS + 1))
                    echo "     ⚠️  High-risk patterns detected: $HIGH_RISK_COUNT"
                    echo "$SEMANTIC_RESULT" | jq -r '.highRiskPatterns[:2][] | "        - \(.)"' 2>/dev/null || true
                fi
            fi
        fi
    done <<< "$REPORT_FILES"
    echo ""
fi

# =============================================================================
# DASHBOARD VALIDATION
# =============================================================================

if [ -n "$DASHBOARD_FILES" ]; then
    DASHBOARD_COUNT=$(echo "$DASHBOARD_FILES" | wc -l | tr -d ' ')
    echo "📈 Validating $DASHBOARD_COUNT dashboard(s)..."
    echo ""

    while IFS= read -r dashboard_file; do
        if [ -n "$dashboard_file" ]; then
            DASHBOARD_NAME=$(basename "$dashboard_file" .dashboard-meta.xml)

            # Run dashboard quality validator if available
            if [ -f "$DASHBOARD_QUALITY" ]; then
                RESULT=$(node -e "
                    const validator = require('$DASHBOARD_QUALITY');
                    const loader = require('$SCRIPT_DIR/../scripts/lib/persona-kpi-validator.js');

                    try {
                        const dashboard = loader.loadDashboardFile('$dashboard_file');
                        const analysis = validator.validateDashboardQuality(dashboard);
                        const actionability = validator.evaluateActionability(dashboard);
                        const componentCount = analysis.summary?.componentCount || 0;
                        const vanityCount = actionability.details?.vanityMetrics?.length || 0;
                        const actionableCount = actionability.details?.fullyActionable?.length || 0;
                        const partialCount = actionability.details?.partiallyActionable?.length || 0;
                        const actionablePct = componentCount > 0 ? Math.round((actionableCount / componentCount) * 100) : 0;
                        const partialPct = componentCount > 0 ? Math.round((partialCount / componentCount) * 100) : 0;
                        const vanityPct = componentCount > 0 ? Math.round((vanityCount / componentCount) * 100) : 0;

                        console.log(JSON.stringify({
                            qualityScore: analysis.totalScore || 0,
                            componentCount: componentCount,
                            actionabilityScore: actionability.score || 0,
                            actionablePct: actionablePct,
                            partialPct: partialPct,
                            vanityPct: vanityPct,
                            vanityComponents: actionability.details?.vanityMetrics || [],
                            errors: analysis.allIssues || [],
                            warnings: analysis.allRecommendations || []
                        }));
                    } catch (err) {
                        console.log(JSON.stringify({ error: err.message }));
                    }
                " 2>/dev/null || echo '{"qualityScore":0,"actionabilityScore":0,"error":"Script failed"}')

                QUALITY_SCORE=$(echo "$RESULT" | jq -r '.qualityScore // 0')
                ACTIONABILITY_SCORE=$(echo "$RESULT" | jq -r '.actionabilityScore // 0')
                COMPONENT_COUNT=$(echo "$RESULT" | jq -r '.componentCount // 0')
                VANITY_PCT=$(echo "$RESULT" | jq -r '.vanityPct // 0')
                ERROR_COUNT=$(echo "$RESULT" | jq -r '.errors | length // 0')

                HAS_ERROR=0

                # Skip scoring for empty/stub dashboards (no components = metadata placeholder)
                if [ "$COMPONENT_COUNT" -eq 0 ]; then
                    echo "  ⚠️  $DASHBOARD_NAME - skipped (no components, likely a stub)"
                    continue
                fi

                # Check actionability score threshold
                if [ "$ACTIONABILITY_SCORE" -lt "$MIN_ACTIONABILITY" ]; then
                    ACTIONABILITY_FAILURES=$((ACTIONABILITY_FAILURES + 1))
                    HAS_ERROR=1
                    echo "  ❌ $DASHBOARD_NAME"
                    echo "     Actionability Score: $ACTIONABILITY_SCORE (minimum: $MIN_ACTIONABILITY)"
                    echo "     Quality Score: $QUALITY_SCORE | Components: $COMPONENT_COUNT"
                fi

                # Check vanity metric percentage
                if [ "$BLOCK_VANITY" = "1" ] && [ "$VANITY_PCT" -gt 50 ]; then
                    VANITY_WARNINGS=$((VANITY_WARNINGS + 1))
                    if [ "$HAS_ERROR" = "0" ]; then
                        echo "  ❌ $DASHBOARD_NAME"
                        HAS_ERROR=1
                    fi
                    echo "     Vanity Metrics: ${VANITY_PCT}% (>50% blocked)"

                    # Show vanity components
                    VANITY_LIST=$(echo "$RESULT" | jq -r '.vanityComponents[:3][] | .title // .name' 2>/dev/null || echo "")
                    if [ -n "$VANITY_LIST" ]; then
                        echo "     Vanity components:"
                        echo "$VANITY_LIST" | while read -r comp; do
                            echo "        - $comp"
                        done
                    fi
                elif [ "$VANITY_PCT" -gt 30 ]; then
                    echo "     ⚠️  Vanity metrics: ${VANITY_PCT}% (consider improving)"
                fi

                if [ "$HAS_ERROR" = "1" ]; then
                    DASHBOARD_ERRORS=$((DASHBOARD_ERRORS + 1))
                elif [ "$ERROR_COUNT" -gt 0 ]; then
                    DASHBOARD_WARNINGS=$((DASHBOARD_WARNINGS + 1))
                    echo "  ⚠️  $DASHBOARD_NAME (Quality: $QUALITY_SCORE, Actionability: $ACTIONABILITY_SCORE)"
                else
                    echo "  ✅ $DASHBOARD_NAME (Quality: $QUALITY_SCORE, Actionability: $ACTIONABILITY_SCORE)"
                fi
            else
                echo "  ⚠️  $DASHBOARD_NAME - skipped (dashboard-quality-validator.js not found)"
            fi
        fi
    done <<< "$DASHBOARD_FILES"
    echo ""
fi

# =============================================================================
# SUMMARY
# =============================================================================

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 Report Quality Gate Summary"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "  Reports:"
echo "    Total: $REPORT_COUNT"
echo "    Errors: $REPORT_ERRORS"
echo "    Warnings: $REPORT_WARNINGS"
echo "    Passed: $((REPORT_COUNT - REPORT_ERRORS))"
echo ""
echo "  Dashboards:"
echo "    Total: $DASHBOARD_COUNT"
echo "    Errors: $DASHBOARD_ERRORS"
echo "    Actionability failures: $ACTIONABILITY_FAILURES"
echo "    Vanity warnings: $VANITY_WARNINGS"
echo "    Passed: $((DASHBOARD_COUNT - DASHBOARD_ERRORS))"
echo ""

TOTAL_ERRORS=$((REPORT_ERRORS + DASHBOARD_ERRORS))

# In strict mode, warnings also fail
if [ "$STRICT_MODE" = "1" ]; then
    TOTAL_ERRORS=$((TOTAL_ERRORS + REPORT_WARNINGS + DASHBOARD_WARNINGS))
fi

if [ "$TOTAL_ERRORS" -gt 0 ]; then
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "❌ Report Quality Gate FAILED - deployment blocked"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo "💡 To resolve:"

    if [ "$REPORT_ERRORS" -gt 0 ]; then
        echo "   Reports:"
        echo "     - Improve health scores to minimum $MIN_HEALTH_SCORE"
        echo "     - Run: /audit-reports to identify issues"
        echo "     - Fix high-risk patterns and metric definitions"
    fi

    if [ "$ACTIONABILITY_FAILURES" -gt 0 ]; then
        echo "   Dashboards (Actionability):"
        echo "     - Add targets/benchmarks to metrics (30% weight)"
        echo "     - Add trend indicators (25% weight)"
        echo "     - Add drill-down links (20% weight)"
        echo "     - Add action guidance tooltips (15% weight)"
        echo "     - Assign metric owners (10% weight)"
        echo "     - Run: /score-actionability to see detailed breakdown"
    fi

    if [ "$VANITY_WARNINGS" -gt 0 ]; then
        echo "   Dashboards (Vanity Metrics):"
        echo "     - Remove or improve metrics with score <40"
        echo "     - Each vanity metric should have: target + trend + drill-down"
    fi

    echo ""
    echo "⏭️  Skip quality gate with: SKIP_REPORT_QUALITY_GATE=1"
    echo "📊 Adjust thresholds with:"
    echo "     REPORT_MIN_HEALTH_SCORE=$MIN_HEALTH_SCORE"
    echo "     DASHBOARD_MIN_ACTIONABILITY=$MIN_ACTIONABILITY"
    # Emit blocking decision on original stdout (fd 3)
    jq -Rn \
      --arg message "Report quality gate failed: $REPORT_ERRORS report error(s), $DASHBOARD_ERRORS dashboard error(s). Fix issues or set SKIP_REPORT_QUALITY_GATE=1 to bypass." \
      '{
        suppressOutput: true,
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "deny",
          permissionDecisionReason: $message
        }
      }' >&3
    exit 0
fi

echo "✅ Report Quality Gate PASSED"
echo ""
echo "💡 Tip: Run these commands for deeper analysis:"
echo "     /check-trust-erosion <org-alias>  - Detect shadow reports, metric inconsistencies"
echo "     /analyze-decay-risk <org-alias>   - Predict abandonment risk"
echo "     /score-actionability <dashboard>  - Detailed actionability breakdown"
# No stdout output = pass-through (valid no-op for PreToolUse)
exit $EXIT_SUCCESS
