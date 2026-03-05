#!/bin/bash

# Claude Code Wrapper with Retry Logic for Slow Pre-flight Checks
# This wrapper adds automatic retry and performance monitoring

# Configuration
MAX_RETRIES=3
RETRY_DELAY=2  # seconds
LOG_DIR="${PROJECT_ROOT:-${PROJECT_ROOT:-/path/to/project}}"
PERFORMANCE_LOG="$LOG_DIR/performance.log"
ERROR_LOG="$LOG_DIR/errors.log"

# Create log directory
mkdir -p "$LOG_DIR"

# Function to log messages
log_message() {
    local level=$1
    local message=$2
    local timestamp=$(date +"%Y-%m-%d %H:%M:%S")
    echo "[$timestamp] [$level] $message" >> "$PERFORMANCE_LOG"
    
    if [ "$level" = "ERROR" ]; then
        echo "[$timestamp] $message" >> "$ERROR_LOG"
    fi
    
    # Also output to console
    case $level in
        ERROR)
            echo "❌ $message" >&2
            ;;
        WARNING)
            echo "⚠️  $message"
            ;;
        SUCCESS)
            echo "✓ $message"
            ;;
        INFO)
            echo "ℹ️  $message"
            ;;
    esac
}

# Function to check for pre-flight delays
check_preflight_delay() {
    # Monitor for pre-flight check warnings in background
    (
        sleep 5  # Give Claude time to start
        
        # Check if Claude is still starting
        if ps aux | grep -q "[c]laude.*pre-flight"; then
            log_message "WARNING" "Pre-flight check detected as slow"
            
            # Send gentle interrupt to retry
            pkill -INT -f "claude.*pre-flight" 2>/dev/null || true
        fi
    ) &
    
    MONITOR_PID=$!
}

# Function to run Claude with monitoring
run_claude_with_monitoring() {
    local attempt=$1
    log_message "INFO" "Starting Claude Code (attempt $attempt/$MAX_RETRIES)"
    
    # Set performance environment variables
    export ANTHROPIC_LOG=${ANTHROPIC_LOG:-info}
    export CLAUDE_PREFLIGHT_TIMEOUT=5000
    export CLAUDE_API_RETRY=true
    
    # Start pre-flight monitoring
    check_preflight_delay
    
    # Run Claude Code with timeout monitoring
    timeout --preserve-status 10s claude "$@" 2>&1 | while IFS= read -r line; do
        # Check for pre-flight warning
        if echo "$line" | grep -q "Pre-flight check is taking longer than expected"; then
            log_message "WARNING" "Pre-flight check delay detected"
            
            # Log additional diagnostics
            log_message "INFO" "Checking system resources..."
            local mem_free=$(free -m | grep Mem | awk '{print $4}')
            local cpu_load=$(uptime | awk -F'load average:' '{print $2}')
            log_message "INFO" "Free memory: ${mem_free}MB, Load: $cpu_load"
            
            # Check for multiple instances
            local claude_count=$(ps aux | grep -c '[c]laude')
            if [ "$claude_count" -gt 1 ]; then
                log_message "WARNING" "Multiple Claude instances detected: $claude_count"
            fi
            
            # Return special code to trigger retry
            return 124
        fi
        
        # Pass through other output
        echo "$line"
    done
    
    local exit_code=$?
    
    # Kill monitor if still running
    kill $MONITOR_PID 2>/dev/null || true
    
    return $exit_code
}

# Function to cleanup zombie processes
cleanup_zombies() {
    log_message "INFO" "Cleaning up any zombie Claude processes..."
    
    # Find and kill hung Claude processes
    ps aux | grep '[c]laude' | grep -E 'defunct|<defunct>' | awk '{print $2}' | while read pid; do
        kill -9 "$pid" 2>/dev/null && log_message "INFO" "Killed zombie process: $pid"
    done
}

# Main execution with retry logic
main() {
    local success=false
    local attempt=1
    
    log_message "INFO" "Claude wrapper started with args: $*"
    
    while [ $attempt -le $MAX_RETRIES ] && [ "$success" = false ]; do
        # Clean up before attempt
        if [ $attempt -gt 1 ]; then
            log_message "INFO" "Waiting ${RETRY_DELAY}s before retry..."
            sleep $RETRY_DELAY
            cleanup_zombies
        fi
        
        # Run Claude with monitoring
        run_claude_with_monitoring $attempt "$@"
        local exit_code=$?
        
        case $exit_code in
            0)
                log_message "SUCCESS" "Claude Code completed successfully"
                success=true
                ;;
            124)
                log_message "WARNING" "Claude timed out or had pre-flight delay (attempt $attempt)"
                if [ $attempt -eq $MAX_RETRIES ]; then
                    log_message "ERROR" "Max retries reached. Consider:"
                    log_message "ERROR" "  1. Run: ./claude-instance-manager.sh clean"
                    log_message "ERROR" "  2. Set: export ANTHROPIC_LOG=debug"
                    log_message "ERROR" "  3. Check network: ping api.anthropic.com"
                fi
                ;;
            *)
                log_message "ERROR" "Claude exited with code: $exit_code"
                # Don't retry on other errors
                break
                ;;
        esac
        
        ((attempt++))
    done
    
    if [ "$success" = false ]; then
        log_message "ERROR" "Claude Code failed after $((attempt-1)) attempts"
        exit 1
    fi
}

# Handle script arguments
case "${1:-run}" in
    run)
        shift  # Remove 'run' command
        main "$@"
        ;;
    logs)
        echo "Recent performance logs:"
        tail -20 "$PERFORMANCE_LOG"
        ;;
    errors)
        echo "Recent errors:"
        tail -20 "$ERROR_LOG"
        ;;
    clean)
        echo "Cleaning log files older than 7 days..."
        find "$LOG_DIR" -name "*.log" -mtime +7 -delete
        echo "✓ Cleaned old log files"
        ;;
    help|*)
        echo "Usage: $0 [run] [claude-args...]"
        echo "       $0 {logs|errors|clean|help}"
        echo ""
        echo "This wrapper adds retry logic for Claude Code when pre-flight checks are slow."
        echo ""
        echo "Commands:"
        echo "  run     - Run Claude with retry logic (default)"
        echo "  logs    - Show recent performance logs"
        echo "  errors  - Show recent errors"
        echo "  clean   - Clean old log files"
        echo "  help    - Show this help message"
        echo ""
        echo "Example:"
        echo "  $0 run    # Run Claude interactively with retry"
        echo ""
        echo "To make this the default, add to ~/.bashrc:"
        echo "  alias claude='$0 run'"
        ;;
esac