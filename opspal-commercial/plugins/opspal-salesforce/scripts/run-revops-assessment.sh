#!/bin/bash

# RevOps Assessment Runner
# Usage: ./run-revops-assessment.sh <org_alias> [output_file]

set -e

ORG_ALIAS="$1"
OUTPUT_FILE="${2:-revops-assessment-$(date +%Y%m%d-%H%M%S).json}"

if [ -z "$ORG_ALIAS" ]; then
    echo "Usage: $0 <org_alias> [output_file]"
    echo "Example: $0 example-company-production"
    exit 1
fi

echo "🔍 Starting comprehensive RevOps assessment for: $ORG_ALIAS"
echo "📊 Instance type detection and statistical analysis will be performed"
echo ""

# Check if org is authenticated
echo "🔐 Verifying Salesforce authentication..."
if ! sf org display --targetusername "$ORG_ALIAS" --json > /dev/null 2>&1; then
    echo "❌ Error: Org '$ORG_ALIAS' is not authenticated or doesn't exist"
    echo "Please authenticate first using: sf org login web --alias $ORG_ALIAS"
    exit 1
fi

echo "✅ Authentication verified"
echo ""

# Get script directory + plugin root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Ensure path conventions resolve to this plugin root
export CLAUDE_PLUGIN_ROOT="$PLUGIN_ROOT"
export WORKSPACE_DIR="$PLUGIN_ROOT"

# Run org alias preflight (prevents invalid/expired orgs)
echo "🧪 Running org preflight validation..."
if ! node "$SCRIPT_DIR/lib/org-alias-validator.js" preflight "$ORG_ALIAS" > /dev/null 2>&1; then
    echo "❌ Preflight validation failed: org alias is invalid or cannot connect."
    echo "   Fix auth (sf org login web --alias $ORG_ALIAS) and re-run."
    exit 1
fi
echo "✅ Preflight passed"
echo ""

# Enforce framework selection/lock (records framework metadata)
PROJECT_METADATA="$PLUGIN_ROOT/PROJECT_METADATA.json"
if [ ! -f "$PROJECT_METADATA" ] || ! grep -q "\"framework\"" "$PROJECT_METADATA"; then
    node "$SCRIPT_DIR/lib/framework-selector.js" lock sfdc-revops-auditor@2.0 --project "$PLUGIN_ROOT" > /dev/null 2>&1 || true
fi

# Set environment variables
export SF_TARGET_ORG="$ORG_ALIAS"
# Enforce strict data integrity in the agent (fail on query errors)
export DATA_INTEGRITY_STRICT=1

echo "🚀 Running comprehensive RevOps assessment..."
echo "This may take several minutes depending on data volume..."
echo ""

# QA-006: Validate capability registry before starting
CORE_PLUGIN="$PLUGIN_ROOT/../opspal-core"
CAPABILITY_LOADER="$CORE_PLUGIN/scripts/lib/capability-registry-loader.js"

if [ -f "$CAPABILITY_LOADER" ]; then
    echo "🔧 Validating diagnostic capabilities..."
    CAPABILITY_FLAGS=""
    if [ "${DATA_INTEGRITY_STRICT:-0}" = "1" ]; then
        CAPABILITY_FLAGS="--strict"
    fi

    if ! node "$CAPABILITY_LOADER" validate revops-assessment $CAPABILITY_FLAGS 2>/dev/null; then
        if [ "${DATA_INTEGRITY_STRICT:-0}" = "1" ]; then
            echo "❌ CRITICAL: Required diagnostic capabilities missing in strict mode"
            exit 1
        else
            echo "⚠️  Some diagnostic capabilities may be unavailable"
        fi
    else
        echo "✅ All diagnostic capabilities validated"
    fi
    echo ""
else
    echo "ℹ️  Capability registry loader not found, skipping validation"
fi

# Run the assessment
cd "$PLUGIN_ROOT"
OUTPUT_PATH="$PLUGIN_ROOT/$OUTPUT_FILE"
LOG_PATH="${OUTPUT_PATH%.json}.log"
python3 scripts/assessments/run_revops_assessment.py "$ORG_ALIAS" --output "$OUTPUT_PATH" 2>&1 | tee "$LOG_PATH"

if [ $? -eq 0 ]; then
    echo "✅ Assessment completed successfully!"
    echo "📄 Report saved to: $OUTPUT_PATH"
    echo "🧾 Log saved to: $LOG_PATH"
    echo ""
    echo "📋 Report Summary:"
    echo "=================="
    
    # Extract key metrics from the report
    if command -v jq > /dev/null 2>&1; then
        echo "Overall Health Score: $(jq -r '.executive_summary.overall_health_score // "N/A"' "$OUTPUT_PATH")/100"
        echo "Total Findings: $(jq -r '.executive_summary.total_findings // "N/A"' "$OUTPUT_PATH")"
        echo "High Priority Issues: $(jq -r '.executive_summary.high_priority_findings // "N/A"' "$OUTPUT_PATH")"
        echo "Instance Type: $(jq -r '.methodology.instance_type // "N/A"' "$OUTPUT_PATH")"
        echo ""
        echo "🔍 View full report: cat $OUTPUT_PATH | jq ."
    else
        echo "Install 'jq' to view formatted summary: sudo apt-get install jq"
        echo "View raw report: cat $OUTPUT_PATH"
    fi

    # QA-003: Run diagnostics with proper error handling (no more || true patterns)
    REPORTS_DIR="$PLUGIN_ROOT/instances/salesforce/$ORG_ALIAS/reports"
    DIAGNOSTICS_FAILED=0

    if [ -d "$REPORTS_DIR" ]; then
        mapfile -t REPORT_FILES < <(find "$REPORTS_DIR" -type f \( -name "*.report-meta.xml" -o -name "*report*.json" \) ! -name "*diagnostics*" ! -name "*manifest*" 2>/dev/null)
        if [ ${#REPORT_FILES[@]} -gt 0 ]; then
            echo "🔎 Running report intelligence diagnostics on ${#REPORT_FILES[@]} report artifact(s)..."
            for report_file in "${REPORT_FILES[@]}"; do
                if ! node "$SCRIPT_DIR/lib/report-intelligence-diagnostics.js" --report "$report_file" --org "$ORG_ALIAS" --output json > /dev/null 2>&1; then
                    echo "⚠️  Diagnostics failed for $report_file"
                    DIAGNOSTICS_FAILED=$((DIAGNOSTICS_FAILED + 1))
                fi
            done
        else
            echo "ℹ️  No report metadata found for diagnostics in $REPORTS_DIR"
        fi

        mapfile -t DASHBOARD_FILES < <(find "$REPORTS_DIR" -type f \( -name "*.dashboard-meta.xml" -o -name "*dashboard*.json" \) 2>/dev/null)
        if [ ${#DASHBOARD_FILES[@]} -gt 0 ]; then
            echo "🧭 Running persona KPI validation on ${#DASHBOARD_FILES[@]} dashboard artifact(s)..."
            # QA-003: Use enforce mode when DATA_INTEGRITY_STRICT is set
            KPI_FLAGS="--org $ORG_ALIAS --format json"
            if [ "${DATA_INTEGRITY_STRICT:-0}" = "1" ]; then
                KPI_FLAGS="$KPI_FLAGS --enforce"
                echo "   (enforce mode enabled due to DATA_INTEGRITY_STRICT=1)"
            fi

            if ! node "$SCRIPT_DIR/lib/persona-kpi-validator.js" --dashboards-dir "$REPORTS_DIR" $KPI_FLAGS; then
                echo "❌ Persona KPI validation failed"
                if [ "${DATA_INTEGRITY_STRICT:-0}" = "1" ]; then
                    echo "   Critical KPI violations detected in strict mode"
                    exit 1
                fi
                DIAGNOSTICS_FAILED=$((DIAGNOSTICS_FAILED + 1))
            fi
        else
            echo "ℹ️  No dashboard metadata found for persona KPI validation in $REPORTS_DIR"
        fi
    else
        echo "ℹ️  Reports directory not found: $REPORTS_DIR (skipping diagnostics)"
    fi

    # Report diagnostics summary
    if [ $DIAGNOSTICS_FAILED -gt 0 ]; then
        echo "⚠️  $DIAGNOSTICS_FAILED diagnostic check(s) had issues"
    fi

    # Record framework usage (non-blocking)
    node "$SCRIPT_DIR/lib/framework-selector.js" record "$ORG_ALIAS" --type revops --framework sfdc-revops-auditor --version 2.0 --project "$PLUGIN_ROOT" > /dev/null 2>&1 || true
    
else
    echo "❌ Assessment failed. Check the output file for details:"
    echo "cat $OUTPUT_PATH"
    exit 1
fi
