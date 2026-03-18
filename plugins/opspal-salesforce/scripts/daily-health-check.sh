#!/bin/bash

###############################################################################
# Daily Health Check for Salesforce Operation Tools
# 
# Monitors:
# - Error recovery effectiveness
# - Operation success rates
# - System performance
# - Timeout prevention
# - Pattern learning
###############################################################################

# Configuration
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
DATA_DIR="$PROJECT_DIR/data"
AUDIT_DIR="$DATA_DIR/audit"
REPORT_DIR="$DATA_DIR/health-reports"
ALERT_EMAIL="${ALERT_EMAIL:-admin@company.com}"
ALERT_THRESHOLD_RECOVERY=80
ALERT_THRESHOLD_SUCCESS=90
ALERT_THRESHOLD_TIME=120

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Create report directory
mkdir -p "$REPORT_DIR"

# Report file
REPORT_FILE="$REPORT_DIR/health_check_$(date +%Y%m%d_%H%M%S).txt"

# Start report
{
    echo "════════════════════════════════════════════════════════════"
    echo "    Daily Health Check Report - $(date)"
    echo "════════════════════════════════════════════════════════════"
    echo ""
    
    # Check 1: Error Recovery Effectiveness
    echo "📊 ERROR RECOVERY SYSTEM"
    echo "────────────────────────"
    
    cd "$PROJECT_DIR"
    RECOVERY_STATS=$(node -e "
    const ErrorRecoverySystem = require('./scripts/lib/error-recovery.js');
    const recovery = new ErrorRecoverySystem();
    const stats = recovery.getStatistics();
    console.log(JSON.stringify(stats));
    " 2>/dev/null || echo '{"overallSuccessRate":"0%"}')
    
    RECOVERY_RATE=$(echo "$RECOVERY_STATS" | jq -r '.overallSuccessRate' | tr -d '%')
    TOTAL_ERRORS=$(echo "$RECOVERY_STATS" | jq -r '.totalErrors // 0')
    RESOLVED_ERRORS=$(echo "$RECOVERY_STATS" | jq -r '.resolvedErrors // 0')
    
    echo "  Overall Success Rate: ${RECOVERY_RATE}%"
    echo "  Total Errors: $TOTAL_ERRORS"
    echo "  Resolved: $RESOLVED_ERRORS"
    echo ""
    
    # Pattern effectiveness
    echo "  Pattern Effectiveness:"
    echo "$RECOVERY_STATS" | jq -r '.patterns | to_entries[] | "    • \(.key): \(.value.successRate)"' 2>/dev/null || echo "    No patterns yet"
    echo ""
    
    # Alert if recovery rate is low
    if [ "$RECOVERY_RATE" -lt "$ALERT_THRESHOLD_RECOVERY" ]; then
        echo "  ⚠️  ALERT: Recovery rate below ${ALERT_THRESHOLD_RECOVERY}%"
        ALERT_RECOVERY=1
    else
        echo "  ✅ Recovery rate healthy"
    fi
    echo ""
    
    # Check 2: Operation Success Rates (Last 24 Hours)
    echo "📈 OPERATION METRICS (Last 24 Hours)"
    echo "────────────────────────────────────"
    
    # Find operations from last 24 hours
    OPERATIONS_24H=$(find "$AUDIT_DIR" -name "operation_*.json" -mtime -1 2>/dev/null | wc -l)
    
    if [ "$OPERATIONS_24H" -gt 0 ]; then
        OPERATION_STATS=$(find "$AUDIT_DIR" -name "operation_*.json" -mtime -1 -exec cat {} \; 2>/dev/null | \
            jq -s '{
                total: length,
                completed: [.[] | select(.status == "completed")] | length,
                failed: [.[] | select(.status == "failed")] | length,
                in_progress: [.[] | select(.status == "in_progress")] | length,
                rolled_back: [.[] | select(.status == "rolled_back")] | length,
                avg_duration: ([.[] | select(.duration) | .duration] | add / length / 1000),
                with_rollback: [.[] | select(.canRollback == true)] | length
            }' 2>/dev/null || echo '{"total":0}')
        
        TOTAL_OPS=$(echo "$OPERATION_STATS" | jq -r '.total')
        COMPLETED_OPS=$(echo "$OPERATION_STATS" | jq -r '.completed // 0')
        FAILED_OPS=$(echo "$OPERATION_STATS" | jq -r '.failed // 0')
        AVG_DURATION=$(echo "$OPERATION_STATS" | jq -r '.avg_duration // 0' | xargs printf "%.1f")
        WITH_ROLLBACK=$(echo "$OPERATION_STATS" | jq -r '.with_rollback // 0')
        
        SUCCESS_RATE=0
        if [ "$TOTAL_OPS" -gt 0 ]; then
            SUCCESS_RATE=$((COMPLETED_OPS * 100 / TOTAL_OPS))
        fi
        
        echo "  Total Operations: $TOTAL_OPS"
        echo "  Successful: $COMPLETED_OPS"
        echo "  Failed: $FAILED_OPS"
        echo "  Success Rate: ${SUCCESS_RATE}%"
        echo "  Avg Duration: ${AVG_DURATION}s"
        echo "  Rollback Ready: $WITH_ROLLBACK"
        
        # Alert if success rate is low
        if [ "$SUCCESS_RATE" -lt "$ALERT_THRESHOLD_SUCCESS" ] && [ "$TOTAL_OPS" -gt 0 ]; then
            echo "  ⚠️  ALERT: Success rate below ${ALERT_THRESHOLD_SUCCESS}%"
            ALERT_SUCCESS=1
        else
            echo "  ✅ Success rate healthy"
        fi
    else
        echo "  No operations in last 24 hours"
    fi
    echo ""
    
    # Check 3: Timeout Prevention
    echo "⏱️  TIMEOUT PREVENTION"
    echo "────────────────────────"
    
    LARGE_OPS=$(find "$AUDIT_DIR" -name "operation_*.json" -mtime -7 -exec \
        jq -r 'select(.metadata.recordCount > 100) | {id: .id, records: .metadata.recordCount, duration: (.duration/1000)}' {} \; 2>/dev/null)
    
    if [ -n "$LARGE_OPS" ]; then
        echo "  Large Operations (>100 records) in last 7 days:"
        echo "$LARGE_OPS" | jq -r '"    • \(.id[0:8]): \(.records) records in \(.duration)s"' 2>/dev/null
        
        TIMEOUTS_PREVENTED=$(echo "$LARGE_OPS" | wc -l)
        echo ""
        echo "  Potential timeouts prevented: $TIMEOUTS_PREVENTED"
    else
        echo "  No large operations in last 7 days"
    fi
    echo ""
    
    # Check 4: System Performance
    echo "⚡ SYSTEM PERFORMANCE"
    echo "────────────────────────"
    
    # Check pre-flight validation performance
    VALIDATION_PERF=$(find "$AUDIT_DIR" -name "operation_*.json" -mtime -1 -exec \
        jq -r 'select(.verifications) | {duration: .duration, verifications: (.verifications | length)}' {} \; 2>/dev/null | \
        jq -s '{
            avg_verification_time: ([.[].duration] | add / length / 1000),
            total_verifications: ([.[].verifications] | add)
        }' 2>/dev/null || echo '{"avg_verification_time":0}')
    
    AVG_VERIFY_TIME=$(echo "$VALIDATION_PERF" | jq -r '.avg_verification_time // 0' | xargs printf "%.2f")
    
    echo "  Avg Verification Time: ${AVG_VERIFY_TIME}s"
    
    # Check if operations are taking too long
    SLOW_OPS=$(find "$AUDIT_DIR" -name "operation_*.json" -mtime -1 -exec \
        jq -r 'select(.duration > 120000) | .id' {} \; 2>/dev/null | wc -l)
    
    if [ "$SLOW_OPS" -gt 0 ]; then
        echo "  ⚠️  Slow Operations (>2min): $SLOW_OPS"
        ALERT_PERFORMANCE=1
    else
        echo "  ✅ No slow operations detected"
    fi
    echo ""
    
    # Check 5: Error Pattern Learning
    echo "🧠 PATTERN LEARNING"
    echo "────────────────────────"
    
    if [ -f "$DATA_DIR/error-patterns.json" ]; then
        PATTERN_COUNT=$(jq 'length' "$DATA_DIR/error-patterns.json" 2>/dev/null || echo 0)
        ACTIVE_PATTERNS=$(jq '[.[] | select(.hitCount > 0)] | length' "$DATA_DIR/error-patterns.json" 2>/dev/null || echo 0)
        RECENT_PATTERNS=$(jq '[.[] | select(.lastUsed != null) | select((.lastUsed | fromdateiso8601) > (now - 86400))] | length' "$DATA_DIR/error-patterns.json" 2>/dev/null || echo 0)
        
        echo "  Total Patterns: $PATTERN_COUNT"
        echo "  Active Patterns: $ACTIVE_PATTERNS"
        echo "  Used in Last 24h: $RECENT_PATTERNS"
        
        # Most common errors
        echo ""
        echo "  Most Common Errors:"
        jq -r 'sort_by(.hitCount) | reverse | .[0:3] | .[] | "    • \(.id): \(.hitCount) occurrences"' "$DATA_DIR/error-patterns.json" 2>/dev/null || echo "    No patterns yet"
    else
        echo "  No error patterns configured"
    fi
    echo ""
    
    # Check 6: Storage and Cleanup
    echo "💾 STORAGE & CLEANUP"
    echo "────────────────────────"
    
    AUDIT_SIZE=$(du -sh "$AUDIT_DIR" 2>/dev/null | cut -f1 || echo "0")
    SNAPSHOT_SIZE=$(du -sh "$DATA_DIR/snapshots" 2>/dev/null | cut -f1 || echo "0")
    OLD_FILES=$(find "$AUDIT_DIR" -name "*.json" -mtime +30 2>/dev/null | wc -l)
    
    echo "  Audit Directory Size: $AUDIT_SIZE"
    echo "  Snapshot Directory Size: $SNAPSHOT_SIZE"
    echo "  Files Older Than 30 Days: $OLD_FILES"
    
    if [ "$OLD_FILES" -gt 100 ]; then
        echo "  ⚠️  Consider archiving old audit files"
    fi
    echo ""
    
    # Summary and Alerts
    echo "════════════════════════════════════════════════════════════"
    echo "                         SUMMARY"
    echo "════════════════════════════════════════════════════════════"
    
    TOTAL_ALERTS=0
    
    if [ -n "$ALERT_RECOVERY" ]; then
        echo "  🚨 Low error recovery rate"
        TOTAL_ALERTS=$((TOTAL_ALERTS + 1))
    fi
    
    if [ -n "$ALERT_SUCCESS" ]; then
        echo "  🚨 Low operation success rate"
        TOTAL_ALERTS=$((TOTAL_ALERTS + 1))
    fi
    
    if [ -n "$ALERT_PERFORMANCE" ]; then
        echo "  🚨 Performance degradation detected"
        TOTAL_ALERTS=$((TOTAL_ALERTS + 1))
    fi
    
    if [ "$TOTAL_ALERTS" -eq 0 ]; then
        echo "  ✅ All systems healthy"
    else
        echo ""
        echo "  Total Alerts: $TOTAL_ALERTS"
        echo "  Action Required: Review alerts above"
    fi
    
    echo ""
    echo "Report saved to: $REPORT_FILE"
    echo "════════════════════════════════════════════════════════════"
    
} | tee "$REPORT_FILE"

# Send email alert if issues found
if [ "$TOTAL_ALERTS" -gt 0 ] && command -v mail &> /dev/null; then
    echo "Sending alert email to $ALERT_EMAIL..."
    cat "$REPORT_FILE" | mail -s "Salesforce Operations Health Alert - $TOTAL_ALERTS issues" "$ALERT_EMAIL"
fi

# Create JSON summary for monitoring dashboard
cat > "$REPORT_DIR/latest_health.json" << EOF
{
  "timestamp": "$(date -Iseconds)",
  "recovery_rate": ${RECOVERY_RATE:-0},
  "operation_success_rate": ${SUCCESS_RATE:-0},
  "operations_24h": ${OPERATIONS_24H:-0},
  "avg_duration": ${AVG_DURATION:-0},
  "timeouts_prevented": ${TIMEOUTS_PREVENTED:-0},
  "slow_operations": ${SLOW_OPS:-0},
  "pattern_count": ${PATTERN_COUNT:-0},
  "alerts": ${TOTAL_ALERTS:-0}
}
EOF

# Exit with error code if alerts exist
exit $TOTAL_ALERTS