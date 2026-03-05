#!/bin/bash

# Claude Code Performance Monitor
# Monitors BashTool pre-flight checks and API performance

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_DIR="${PROJECT_ROOT:-${PROJECT_ROOT:-/path/to/project}}"
METRICS_FILE="$LOG_DIR/metrics.json"
ALERT_THRESHOLD=5000  # Alert if pre-flight check takes > 5 seconds

# Create log directory
mkdir -p "$LOG_DIR"

# Initialize metrics file if it doesn't exist
if [ ! -f "$METRICS_FILE" ]; then
    echo '{"checks": [], "alerts": []}' > "$METRICS_FILE"
fi

# Function to log performance metric
log_metric() {
    local event_type=$1
    local duration=$2
    local status=$3
    local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    
    # Update metrics file
    jq --arg type "$event_type" \
       --arg dur "$duration" \
       --arg stat "$status" \
       --arg ts "$timestamp" \
       '.checks += [{"timestamp": $ts, "type": $type, "duration": $dur | tonumber, "status": $stat}]' \
       "$METRICS_FILE" > "$METRICS_FILE.tmp" && mv "$METRICS_FILE.tmp" "$METRICS_FILE"
}

# Function to analyze recent performance
analyze_performance() {
    echo "=========================================="
    echo "Claude Code Performance Analysis"
    echo "=========================================="
    echo ""
    
    if [ ! -f "$METRICS_FILE" ]; then
        echo "No metrics data available yet"
        return
    fi
    
    # Get metrics from last 24 hours
    local cutoff_time=$(date -u -d '24 hours ago' +"%Y-%m-%dT%H:%M:%SZ")
    
    # Calculate statistics
    local avg_duration=$(jq -r --arg cutoff "$cutoff_time" '
        [.checks[] | select(.timestamp > $cutoff) | .duration] | 
        if length > 0 then add/length else 0 end' "$METRICS_FILE")
    
    local max_duration=$(jq -r --arg cutoff "$cutoff_time" '
        [.checks[] | select(.timestamp > $cutoff) | .duration] | 
        if length > 0 then max else 0 end' "$METRICS_FILE")
    
    local min_duration=$(jq -r --arg cutoff "$cutoff_time" '
        [.checks[] | select(.timestamp > $cutoff) | .duration] | 
        if length > 0 then min else 0 end' "$METRICS_FILE")
    
    local total_checks=$(jq -r --arg cutoff "$cutoff_time" '
        [.checks[] | select(.timestamp > $cutoff)] | length' "$METRICS_FILE")
    
    local failed_checks=$(jq -r --arg cutoff "$cutoff_time" '
        [.checks[] | select(.timestamp > $cutoff and .status == "failed")] | length' "$METRICS_FILE")
    
    local slow_checks=$(jq -r --arg cutoff "$cutoff_time" --arg threshold "$ALERT_THRESHOLD" '
        [.checks[] | select(.timestamp > $cutoff and (.duration | tonumber) > ($threshold | tonumber))] | length' "$METRICS_FILE")
    
    echo "Last 24 Hours Performance Summary:"
    echo "-----------------------------------"
    printf "Total checks:        %d\n" "$total_checks"
    printf "Failed checks:       %d\n" "$failed_checks"
    printf "Slow checks (>%dms): %d\n" "$ALERT_THRESHOLD" "$slow_checks"
    echo ""
    printf "Average duration:    %.0f ms\n" "$avg_duration"
    printf "Maximum duration:    %.0f ms\n" "$max_duration"
    printf "Minimum duration:    %.0f ms\n" "$min_duration"
    
    # Show recent slow checks
    if [ "$slow_checks" -gt 0 ]; then
        echo ""
        echo "Recent Slow Checks:"
        echo "-------------------"
        jq -r --arg cutoff "$cutoff_time" --arg threshold "$ALERT_THRESHOLD" '
            .checks[] | 
            select(.timestamp > $cutoff and (.duration | tonumber) > ($threshold | tonumber)) |
            "\(.timestamp): \(.duration)ms - \(.status)"' "$METRICS_FILE" | tail -5
    fi
    
    # Recommendations
    echo ""
    echo "Recommendations:"
    echo "----------------"
    if [ "$slow_checks" -gt 5 ]; then
        echo "⚠️  High number of slow checks detected. Consider:"
        echo "   - Running ./claude-instance-manager.sh clean"
        echo "   - Checking network connectivity"
        echo "   - Reviewing API rate limits"
    elif [ "$failed_checks" -gt 0 ]; then
        echo "⚠️  Failed checks detected. Check:"
        echo "   - API credentials"
        echo "   - Network connectivity"
        echo "   - Run with ANTHROPIC_LOG=debug for details"
    else
        echo "✓ Performance is within normal parameters"
    fi
}

# Function to monitor in real-time
monitor_realtime() {
    echo "Starting real-time performance monitoring..."
    echo "Press Ctrl+C to stop"
    echo ""
    
    # Tail Claude logs if they exist
    CLAUDE_LOG=$(find ${USER_CLAUDE_CONFIG:-~/.claude} -name "*.log" -type f 2>/dev/null | head -1)
    
    if [ -n "$CLAUDE_LOG" ]; then
        echo "Monitoring: $CLAUDE_LOG"
        tail -f "$CLAUDE_LOG" | while read -r line; do
            # Look for pre-flight check patterns
            if echo "$line" | grep -q "pre-flight check"; then
                timestamp=$(date +"%Y-%m-%d %H:%M:%S")
                
                # Extract duration if available
                duration=$(echo "$line" | grep -oE '[0-9]+ms' | grep -oE '[0-9]+')
                
                if [ -n "$duration" ]; then
                    status="success"
                    if [ "$duration" -gt "$ALERT_THRESHOLD" ]; then
                        status="slow"
                        echo "[$timestamp] ⚠️  SLOW: Pre-flight check took ${duration}ms"
                    else
                        echo "[$timestamp] ✓ Pre-flight check: ${duration}ms"
                    fi
                    log_metric "preflight" "$duration" "$status"
                fi
            fi
        done
    else
        echo "No Claude logs found. Make sure to run with ANTHROPIC_LOG=debug"
    fi
}

# Function to generate report
generate_report() {
    local report_file="$LOG_DIR/performance_report_$(date +%Y%m%d_%H%M%S).txt"
    
    {
        echo "Claude Code Performance Report"
        echo "Generated: $(date)"
        echo "========================================"
        echo ""
        analyze_performance
        echo ""
        echo "System Information:"
        echo "-------------------"
        echo "Memory: $(free -h | grep Mem | awk '{print "Used: " $3 " / Total: " $2}')"
        echo "CPU Load: $(uptime | awk -F'load average:' '{print $2}')"
        echo "Network Latency to API: $(ping -c 1 api.anthropic.com 2>/dev/null | grep -oE 'time=[0-9.]+' | cut -d= -f2)ms"
        echo ""
        echo "Environment Variables:"
        echo "----------------------"
        echo "ANTHROPIC_LOG: ${ANTHROPIC_LOG:-not set}"
        echo "CLAUDE_CODE_ENTRYPOINT: ${CLAUDE_CODE_ENTRYPOINT:-not set}"
    } > "$report_file"
    
    echo "Report saved to: $report_file"
}

# Main menu
case "${1:-help}" in
    analyze)
        analyze_performance
        ;;
    monitor)
        monitor_realtime
        ;;
    report)
        generate_report
        ;;
    test)
        # Test logging a metric
        echo "Testing metric logging..."
        duration=$((RANDOM % 10000))
        status="success"
        if [ "$duration" -gt "$ALERT_THRESHOLD" ]; then
            status="slow"
        fi
        log_metric "test" "$duration" "$status"
        echo "Logged test metric: ${duration}ms ($status)"
        ;;
    clean)
        # Clean old metrics (keep last 7 days)
        cutoff=$(date -u -d '7 days ago' +"%Y-%m-%dT%H:%M:%SZ")
        jq --arg cutoff "$cutoff" '.checks |= map(select(.timestamp > $cutoff))' \
            "$METRICS_FILE" > "$METRICS_FILE.tmp" && mv "$METRICS_FILE.tmp" "$METRICS_FILE"
        echo "Cleaned metrics older than 7 days"
        ;;
    help|*)
        echo "Usage: $0 {analyze|monitor|report|test|clean|help}"
        echo ""
        echo "Commands:"
        echo "  analyze  - Analyze recent performance metrics"
        echo "  monitor  - Monitor performance in real-time"
        echo "  report   - Generate detailed performance report"
        echo "  test     - Test metric logging"
        echo "  clean    - Remove metrics older than 7 days"
        echo "  help     - Show this help message"
        ;;
esac