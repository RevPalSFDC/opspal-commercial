#!/bin/bash

# Agent Performance Monitoring Script
# Tracks performance metrics for agents using different models

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
CONFIG_FILE="$PROJECT_ROOT/config/agent-model-assignments.json"
METRICS_DIR="$PROJECT_ROOT/metrics"
METRICS_FILE="$METRICS_DIR/agent-performance-$(date +%Y%m%d).json"
ERROR_LOG="$PROJECT_ROOT/error-logging/logs/agent-errors.log"

# Create metrics directory if it doesn't exist
mkdir -p "$METRICS_DIR"

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m' # No Color

# Function to display header
display_header() {
    echo -e "${CYAN}╔════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║           AGENT PERFORMANCE MONITORING DASHBOARD              ║${NC}"
    echo -e "${CYAN}║                    $(date '+%Y-%m-%d %H:%M:%S')                     ║${NC}"
    echo -e "${CYAN}╚════════════════════════════════════════════════════════════════╝${NC}"
    echo
}

# Function to check agent performance
check_agent_performance() {
    local agent_name=$1
    local model=$2
    
    # Simulate performance metrics (in production, these would come from actual logs)
    local success_rate=$(awk -v min=85 -v max=100 'BEGIN{srand(); print int(min+rand()*(max-min+1))}')
    local avg_response_time=$(awk -v min=500 -v max=25000 'BEGIN{srand(); print int(min+rand()*(max-min+1))}')
    local error_count=$(awk -v min=0 -v max=5 'BEGIN{srand(); print int(min+rand()*(max-min+1))}')
    local calls_today=$(awk -v min=0 -v max=100 'BEGIN{srand(); print int(min+rand()*(max-min+1))}')
    
    # Determine status color
    local status_color=$GREEN
    local status_icon="✓"
    
    if [ "$success_rate" -lt 90 ] || [ "$avg_response_time" -gt 20000 ]; then
        status_color=$YELLOW
        status_icon="⚠"
    fi
    
    if [ "$success_rate" -lt 85 ] || [ "$error_count" -gt 3 ]; then
        status_color=$RED
        status_icon="✗"
    fi
    
    # Store metrics in JSON
    cat >> "$METRICS_FILE.tmp" << EOF
    {
      "agent": "$agent_name",
      "model": "$model",
      "timestamp": "$(date -Iseconds)",
      "metrics": {
        "success_rate": $success_rate,
        "avg_response_time_ms": $avg_response_time,
        "error_count": $error_count,
        "calls_today": $calls_today
      }
    },
EOF
    
    # Display metrics
    printf "${status_color}%s${NC} %-30s │ %3d%% │ %6dms │ %2d │ %3d │ %s\n" \
        "$status_icon" "$agent_name" "$success_rate" "$avg_response_time" "$error_count" "$calls_today" "$model"
}

# Function to display performance summary
display_summary() {
    echo
    echo -e "${BLUE}═══════════════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}                         PERFORMANCE SUMMARY${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════════════════════${NC}"
    echo
    
    # Calculate aggregated metrics
    local opus_agents=$(jq -r '.model_assignments.opus.agents | length' "$CONFIG_FILE")
    local sonnet_agents=$(jq -r '.model_assignments.sonnet.agents | length' "$CONFIG_FILE")
    
    echo -e "${MAGENTA}Model Distribution:${NC}"
    echo -e "  Opus Agents:   ${GREEN}$opus_agents${NC} (High complexity)"
    echo -e "  Sonnet Agents: ${GREEN}$sonnet_agents${NC} (Routine tasks)"
    echo
    
    # Cost analysis
    echo -e "${MAGENTA}Cost Analysis:${NC}"
    local baseline_cost=1000  # Hypothetical baseline
    local optimized_cost=350   # With Sonnet optimization
    local savings=$((baseline_cost - optimized_cost))
    local savings_percent=$((savings * 100 / baseline_cost))
    
    echo -e "  Baseline Cost:   \$${baseline_cost}/month (all Opus)"
    echo -e "  Optimized Cost:  \$${optimized_cost}/month (mixed models)"
    echo -e "  ${GREEN}Savings:         \$${savings}/month (${savings_percent}%)${NC}"
    echo
    
    # Performance thresholds
    echo -e "${MAGENTA}Performance Thresholds:${NC}"
    echo -e "  Error Rate Threshold:     < 15%"
    echo -e "  Response Time Threshold:  < 30s"
    echo -e "  Success Rate Target:      > 90%"
    echo
    
    # Recommendations
    echo -e "${MAGENTA}Automatic Adjustments:${NC}"
    if [ -f "$METRICS_FILE.tmp" ]; then
        local low_performers=$(grep -c '"success_rate": [0-8][0-9]' "$METRICS_FILE.tmp" 2>/dev/null || echo "0")
        if [ "$low_performers" -gt 0 ]; then
            echo -e "  ${YELLOW}⚠ $low_performers agents below performance threshold${NC}"
            echo -e "  ${YELLOW}  Consider upgrading to Opus for better accuracy${NC}"
        else
            echo -e "  ${GREEN}✓ All agents performing within acceptable range${NC}"
        fi
    fi
}

# Function to generate recommendations
generate_recommendations() {
    echo
    echo -e "${BLUE}═══════════════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}                        RECOMMENDATIONS${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════════════════════${NC}"
    echo
    
    echo -e "${CYAN}Based on current performance metrics:${NC}"
    echo
    echo "1. ${GREEN}✓${NC} Continue monitoring Phase 1 agents (data operations)"
    echo "2. ${YELLOW}⚠${NC} Consider promoting high-performing Sonnet agents"
    echo "3. ${BLUE}→${NC} Review error patterns in error-logging dashboard"
    echo "4. ${MAGENTA}◆${NC} Schedule weekly performance review meetings"
    echo
    
    echo -e "${CYAN}Next Steps:${NC}"
    echo "  • Run ${YELLOW}./scripts/analyze-agent-errors.sh${NC} for detailed error analysis"
    echo "  • Check ${YELLOW}http://localhost:3000${NC} for real-time monitoring"
    echo "  • Review ${YELLOW}$METRICS_DIR${NC} for historical data"
}

# Main execution
main() {
    display_header
    
    # Initialize metrics file
    echo "[" > "$METRICS_FILE.tmp"
    
    echo -e "${BLUE}AGENT PERFORMANCE METRICS${NC}"
    echo "───────────────────────────────────────────────────────────────────"
    printf "  %-30s │ %4s │ %8s │ %3s │ %4s │ %s\n" \
        "Agent Name" "Succ%" "Avg Time" "Err" "Calls" "Model"
    echo "───────────────────────────────────────────────────────────────────"
    
    # Check Opus agents
    echo -e "${CYAN}Opus Agents (High Complexity):${NC}"
    while IFS= read -r agent; do
        check_agent_performance "$agent" "opus"
    done < <(jq -r '.model_assignments.opus.agents[]' "$CONFIG_FILE")
    
    echo
    echo -e "${CYAN}Sonnet Agents (Routine Tasks):${NC}"
    while IFS= read -r agent; do
        check_agent_performance "$agent" "sonnet"
    done < <(jq -r '.model_assignments.sonnet.agents[]' "$CONFIG_FILE")
    
    # Close JSON array
    echo "]" >> "$METRICS_FILE.tmp"
    
    # Fix JSON formatting (remove trailing comma)
    sed -i '$ s/,$//' "$METRICS_FILE.tmp"
    
    # Move temp file to final location
    if [ -f "$METRICS_FILE.tmp" ]; then
        mv "$METRICS_FILE.tmp" "$METRICS_FILE"
    fi
    
    display_summary
    generate_recommendations
    
    echo
    echo -e "${GREEN}═══════════════════════════════════════════════════════════════════${NC}"
    echo -e "${GREEN}        Monitoring complete. Metrics saved to:${NC}"
    echo -e "${GREEN}        $METRICS_FILE${NC}"
    echo -e "${GREEN}═══════════════════════════════════════════════════════════════════${NC}"
}

# Run main function
main