#!/bin/bash

###############################################################################
# MCP Health Monitor Script
# Monitors all MCP servers and ensures they stay healthy
# Runs as a daemon checking server health every 30 seconds
###############################################################################

set -euo pipefail

# Load project-local env defaults (Salesforce only)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -f "${SCRIPT_DIR}/lib/env.sh" ]]; then
    # shellcheck source=lib/env.sh
    source "${SCRIPT_DIR}/lib/env.sh"
fi

# Configuration
MANAGER_URL="http://localhost:3001"
CHECK_INTERVAL=30
MAX_MEMORY_MB=512
MAX_RESTART_COUNT=3
LOG_FILE="${LOG_DIR}/mcp-health-monitor.log"
PID_FILE="${RUNTIME_DIR}/mcp-health-monitor.pid"
ALERT_EMAIL="${MCP_ALERT_EMAIL:-}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to log messages
log_message() {
    local level=$1
    shift
    local message="$@"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    
    echo "[$timestamp] [$level] $message" >> "$LOG_FILE"
    
    # Also output to console if not daemonized
    if [ -t 1 ]; then
        case $level in
            ERROR)
                echo -e "${RED}[$level] $message${NC}"
                ;;
            WARN)
                echo -e "${YELLOW}[$level] $message${NC}"
                ;;
            INFO)
                echo -e "${GREEN}[$level] $message${NC}"
                ;;
            *)
                echo "[$level] $message"
                ;;
        esac
    fi
}

# Function to send alert
send_alert() {
    local subject="$1"
    local body="$2"
    
    log_message "ALERT" "$subject: $body"
    
    # Send email if configured
    if [ -n "$ALERT_EMAIL" ]; then
        echo "$body" | mail -s "[MCP Health Monitor] $subject" "$ALERT_EMAIL" 2>/dev/null || true
    fi
    
    # Send to Discord webhook if configured
    if [ -n "$DISCORD_WEBHOOK" ]; then
        curl -s -H "Content-Type: application/json" \
            -d "{\"content\":\"**MCP Health Alert**\\n$subject\\n$body\"}" \
            "$DISCORD_WEBHOOK" 2>/dev/null || true
    fi
    
    # Send to Slack webhook if configured
    if [ -n "$SLACK_WEBHOOK" ]; then
        curl -s -H "Content-Type: application/json" \
            -d "{\"text\":\"*MCP Health Alert*\\n$subject\\n$body\"}" \
            "$SLACK_WEBHOOK" 2>/dev/null || true
    fi
}

# Function to check if manager is running
check_manager() {
    if curl -s "${MANAGER_URL}/health" > /dev/null 2>&1; then
        return 0
    else
        return 1
    fi
}

# Function to start manager if not running
ensure_manager() {
    if ! check_manager; then
        log_message "WARN" "Manager not running, attempting to start..."
        
        cd "$(dirname "$0")/../mcp-manager"
        mkdir -p "${LOG_DIR}"
        nohup node index.js > "${LOG_DIR}/mcp-manager.log" 2>&1 &
        
        sleep 5
        
        if check_manager; then
            log_message "INFO" "Manager started successfully"
            return 0
        else
            log_message "ERROR" "Failed to start manager"
            send_alert "Manager Down" "Failed to start MCP Manager service"
            return 1
        fi
    fi
    return 0
}

# Function to get server health status
get_health_status() {
    local response=$(curl -s "${MANAGER_URL}/health" 2>/dev/null)
    
    if [ $? -eq 0 ]; then
        echo "$response"
    else
        echo "{}"
    fi
}

# Function to check individual server health
check_server_health() {
    local server_name=$1
    local health_data=$2
    
    # Extract server data from JSON (using python for simplicity)
    local server_info=$(echo "$health_data" | python3 -c "
import sys, json
data = json.load(sys.stdin)
servers = data.get('servers', [])
for server in servers:
    if server['name'] == '$server_name':
        print(json.dumps(server))
        break
" 2>/dev/null)
    
    if [ -z "$server_info" ]; then
        return 1
    fi
    
    # Check memory usage
    local memory=$(echo "$server_info" | python3 -c "
import sys, json
data = json.load(sys.stdin)
print(data.get('memory', 0))
" 2>/dev/null)
    
    local memory_mb=$((memory / 1024 / 1024))
    
    if [ $memory_mb -gt $MAX_MEMORY_MB ]; then
        log_message "WARN" "Server $server_name using ${memory_mb}MB (limit: ${MAX_MEMORY_MB}MB)"
        return 2  # Memory exceeded
    fi
    
    # Check restart count
    local restart_count=$(echo "$server_info" | python3 -c "
import sys, json
data = json.load(sys.stdin)
print(data.get('restartCount', 0))
" 2>/dev/null)
    
    if [ $restart_count -ge $MAX_RESTART_COUNT ]; then
        log_message "ERROR" "Server $server_name has restarted $restart_count times"
        send_alert "Server Unstable" "Server $server_name has restarted $restart_count times and may be unstable"
        return 3  # Too many restarts
    fi
    
    # Check if server is actually running
    local pid=$(echo "$server_info" | python3 -c "
import sys, json
data = json.load(sys.stdin)
print(data.get('pid', 0))
" 2>/dev/null)
    
    if [ "$pid" = "0" ] || [ -z "$pid" ]; then
        log_message "ERROR" "Server $server_name is not running"
        return 4  # Not running
    fi
    
    return 0
}

# Function to restart unhealthy server
restart_server() {
    local server_name=$1
    local reason=$2
    
    log_message "INFO" "Restarting $server_name due to: $reason"
    
    local response=$(curl -s -X POST "${MANAGER_URL}/restart/${server_name}" 2>/dev/null)
    
    if echo "$response" | grep -q '"success":true'; then
        log_message "INFO" "Successfully restarted $server_name"
        return 0
    else
        log_message "ERROR" "Failed to restart $server_name"
        send_alert "Restart Failed" "Failed to restart $server_name after detecting: $reason"
        return 1
    fi
}

# Function to clean up zombie processes
cleanup_zombies() {
    # Find and kill zombie MCP processes
    local zombies=$(ps aux | grep -E "mcp-server|@roychri|@salesforce/mcp" | grep -v grep | grep "<defunct>" | awk '{print $2}')
    
    if [ -n "$zombies" ]; then
        log_message "WARN" "Found zombie processes: $zombies"
        for pid in $zombies; do
            kill -9 $pid 2>/dev/null || true
        done
    fi
    
    # Find orphaned MCP processes not managed by our manager
    local orphans=$(ps aux | grep -E "mcp-server-asana|@salesforce/mcp" | grep -v grep | grep -v "node.*index.js" | awk '{print $2}')
    
    # Check each process against our managed list
    for pid in $orphans; do
        local managed=false
        local health_data=$(get_health_status)
        
        # Check if this PID is in our managed list
        if echo "$health_data" | grep -q "\"pid\":$pid"; then
            managed=true
        fi
        
        if [ "$managed" = "false" ]; then
            log_message "WARN" "Found orphaned process $pid, terminating..."
            kill -TERM $pid 2>/dev/null || true
            sleep 2
            kill -9 $pid 2>/dev/null || true
        fi
    done
}

# Function to monitor disk space
check_disk_space() {
    local usage=$(df "${LOG_DIR}" | tail -1 | awk '{print $5}' | sed 's/%//')
    
    if [ $usage -gt 90 ]; then
        log_message "WARN" "Disk usage at ${usage}%"
        
        # Rotate logs if disk is getting full
        find "${LOG_DIR}" -name "mcp-*.log" -mtime +7 -delete 2>/dev/null || true
        
        # Compress old logs
        find "${LOG_DIR}" -name "mcp-*.log" -size +100M -exec gzip {} \; 2>/dev/null || true
    fi
}

# Function to generate health report
generate_health_report() {
    local health_data=$1
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    
    cat <<EOF
===== MCP Health Report =====
Timestamp: $timestamp

Manager Status: $(check_manager && echo "Running" || echo "Down")

Servers:
$(echo "$health_data" | python3 -c "
import sys, json
data = json.load(sys.stdin)
servers = data.get('servers', [])
for server in servers:
    print(f\"  - {server['name']}:\")
    print(f\"    PID: {server.get('pid', 'N/A')}\")
    print(f\"    Status: {server.get('status', 'unknown')}\")
    print(f\"    Memory: {server.get('memory', 0) / 1024 / 1024:.1f}MB\")
    print(f\"    Uptime: {server.get('uptime', 0) / 1000 / 60:.1f} minutes\")
    print(f\"    Restarts: {server.get('restartCount', 0)}\")
" 2>/dev/null || echo "  Unable to parse server data")

System:
  Disk Usage: $(df "${LOG_DIR}" | tail -1 | awk '{print $5}')
  Load Average: $(uptime | awk -F'load average:' '{print $2}')
  
=============================
EOF
}

# Function to run health check cycle
run_health_check() {
    log_message "INFO" "Starting health check cycle"
    
    # Ensure manager is running
    if ! ensure_manager; then
        return 1
    fi
    
    # Get current health status
    local health_data=$(get_health_status)
    
    # Check each server
    local servers=("asana" "salesforce" "error-logging")
    
    for server in "${servers[@]}"; do
        check_server_health "$server" "$health_data"
        local status=$?
        
        case $status in
            0)
                # Server is healthy
                ;;
            2)
                # Memory exceeded
                restart_server "$server" "memory limit exceeded"
                ;;
            3)
                # Too many restarts
                log_message "ERROR" "Server $server is unstable, manual intervention required"
                ;;
            4)
                # Not running (but should be)
                log_message "INFO" "Attempting to start $server"
                curl -s -X POST "${MANAGER_URL}/start/${server}" > /dev/null 2>&1
                ;;
        esac
    done
    
    # Clean up zombies
    cleanup_zombies
    
    # Check disk space
    check_disk_space
    
    log_message "INFO" "Health check cycle completed"
}

# Function to run as daemon
run_daemon() {
    # Check if already running
    if [ -f "$PID_FILE" ]; then
        local old_pid=$(cat "$PID_FILE")
        if ps -p "$old_pid" > /dev/null 2>&1; then
            echo "Health monitor already running with PID $old_pid"
            exit 1
        fi
    fi
    
    # Save PID
    echo $$ > "$PID_FILE"
    
    log_message "INFO" "Health monitor started (PID: $$)"
    
    # Main monitoring loop
    while true; do
        run_health_check
        sleep $CHECK_INTERVAL
    done
}

# Function to stop daemon
stop_daemon() {
    if [ -f "$PID_FILE" ]; then
        local pid=$(cat "$PID_FILE")
        if ps -p "$pid" > /dev/null 2>&1; then
            log_message "INFO" "Stopping health monitor (PID: $pid)"
            kill "$pid"
            rm -f "$PID_FILE"
            echo "Health monitor stopped"
        else
            echo "Health monitor not running"
            rm -f "$PID_FILE"
        fi
    else
        echo "Health monitor not running"
    fi
}

# Function to show status
show_status() {
    if [ -f "$PID_FILE" ]; then
        local pid=$(cat "$PID_FILE")
        if ps -p "$pid" > /dev/null 2>&1; then
            echo -e "${GREEN}Health monitor is running (PID: $pid)${NC}"
            
            # Generate and display health report
            local health_data=$(get_health_status)
            generate_health_report "$health_data"
        else
            echo -e "${YELLOW}Health monitor PID file exists but process is not running${NC}"
        fi
    else
        echo -e "${YELLOW}Health monitor is not running${NC}"
    fi
}

# Signal handlers
trap 'log_message "INFO" "Received shutdown signal"; exit 0' SIGTERM SIGINT

# Main execution
case "${1:-run}" in
    start)
        echo -e "${BLUE}Starting MCP Health Monitor as daemon${NC}"
        nohup "$0" daemon > /dev/null 2>&1 &
        sleep 2
        show_status
        ;;
        
    daemon)
        run_daemon
        ;;
        
    stop)
        stop_daemon
        ;;
        
    restart)
        stop_daemon
        sleep 2
        "$0" start
        ;;
        
    status)
        show_status
        ;;
        
    check)
        # Run single health check
        run_health_check
        ;;
        
    report)
        # Generate health report
        local health_data=$(get_health_status)
        generate_health_report "$health_data"
        ;;
        
    run)
        # Run in foreground
        echo -e "${BLUE}Running health monitor in foreground mode${NC}"
        while true; do
            run_health_check
            echo "Sleeping for ${CHECK_INTERVAL} seconds..."
            sleep $CHECK_INTERVAL
        done
        ;;
        
    *)
        echo "Usage: $0 {start|stop|restart|status|check|report|run}"
        echo ""
        echo "Commands:"
        echo "  start   - Start as daemon"
        echo "  stop    - Stop daemon"
        echo "  restart - Restart daemon"
        echo "  status  - Show status and health report"
        echo "  check   - Run single health check"
        echo "  report  - Generate health report"
        echo "  run     - Run in foreground"
        exit 1
        ;;
esac
