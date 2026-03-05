#!/bin/bash

# Claude Code Instance Manager
# Helps manage multiple Claude Code instances to prevent API rate limiting

echo "=========================================="
echo "Claude Code Instance Manager"
echo "=========================================="

# Function to list all Claude instances
list_instances() {
    echo "Current Claude Code instances:"
    echo ""
    printf "%-8s %-10s %-10s %-20s %s\n" "PID" "CPU%" "MEM%" "START_TIME" "TERMINAL"
    echo "------------------------------------------------------------------------"
    
    ps aux | grep -E '[c]laude' | while read -r line; do
        PID=$(echo "$line" | awk '{print $2}')
        CPU=$(echo "$line" | awk '{print $3}')
        MEM=$(echo "$line" | awk '{print $4}')
        START=$(echo "$line" | awk '{print $9}')
        TTY=$(echo "$line" | awk '{print $7}')
        printf "%-8s %-10s %-10s %-20s %s\n" "$PID" "$CPU%" "$MEM%" "$START" "$TTY"
    done
}

# Function to check instance health
check_health() {
    local pid=$1
    if [ -z "$pid" ]; then
        echo "Error: PID required"
        return 1
    fi
    
    if ps -p "$pid" > /dev/null; then
        echo "Instance $pid is running"
        
        # Check CPU usage
        CPU=$(ps -p "$pid" -o %cpu= | tr -d ' ')
        if (( $(echo "$CPU > 50" | bc -l) )); then
            echo "⚠️  Warning: High CPU usage ($CPU%)"
        fi
        
        # Check memory usage
        MEM=$(ps -p "$pid" -o %mem= | tr -d ' ')
        if (( $(echo "$MEM > 10" | bc -l) )); then
            echo "⚠️  Warning: High memory usage ($MEM%)"
        fi
    else
        echo "Instance $pid is not running"
    fi
}

# Function to safely terminate an instance
terminate_instance() {
    local pid=$1
    if [ -z "$pid" ]; then
        echo "Error: PID required"
        return 1
    fi
    
    echo "Attempting to gracefully terminate Claude instance $pid..."
    kill -TERM "$pid" 2>/dev/null
    
    # Wait for process to terminate
    local count=0
    while ps -p "$pid" > /dev/null 2>&1 && [ $count -lt 10 ]; do
        sleep 1
        ((count++))
    done
    
    if ps -p "$pid" > /dev/null 2>&1; then
        echo "Process didn't terminate gracefully, forcing..."
        kill -KILL "$pid" 2>/dev/null
    fi
    
    echo "✓ Instance $pid terminated"
}

# Function to recommend which instances to keep/terminate
analyze_instances() {
    echo ""
    echo "Analysis and Recommendations:"
    echo "------------------------------"
    
    local count=$(ps aux | grep -c '[c]laude')
    
    if [ "$count" -eq 0 ]; then
        echo "✓ No Claude Code instances running"
    elif [ "$count" -eq 1 ]; then
        echo "✓ Only one instance running (optimal)"
    else
        echo "⚠️  Multiple instances detected ($count total)"
        echo ""
        echo "Recommendations:"
        echo "1. Keep the instance you're actively using"
        echo "2. Terminate idle instances to prevent API rate limiting"
        echo "3. Consider the following before terminating:"
        echo "   - Save any unsaved work"
        echo "   - Note the working directory of each instance"
        echo ""
        
        # Show instances sorted by CPU usage (most active first)
        echo "Instances by activity (most active first):"
        ps aux | grep '[c]laude' | sort -rn -k3 | head -5 | \
            awk '{printf "  PID %s - CPU: %s%% - TTY: %s\n", $2, $3, $7}'
    fi
}

# Main menu
case "${1:-list}" in
    list)
        list_instances
        analyze_instances
        ;;
    health)
        if [ -z "$2" ]; then
            echo "Usage: $0 health <PID>"
            exit 1
        fi
        check_health "$2"
        ;;
    terminate)
        if [ -z "$2" ]; then
            echo "Usage: $0 terminate <PID>"
            exit 1
        fi
        terminate_instance "$2"
        ;;
    clean)
        echo "This will terminate all Claude instances except the most active one."
        read -p "Are you sure? (y/N) " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            # Get most active instance
            KEEP_PID=$(ps aux | grep '[c]laude' | sort -rn -k3 | head -1 | awk '{print $2}')
            
            ps aux | grep '[c]laude' | awk '{print $2}' | while read -r pid; do
                if [ "$pid" != "$KEEP_PID" ]; then
                    echo "Terminating $pid..."
                    terminate_instance "$pid"
                fi
            done
            echo "✓ Cleanup complete. Kept instance: $KEEP_PID"
        fi
        ;;
    *)
        echo "Usage: $0 {list|health <PID>|terminate <PID>|clean}"
        echo ""
        echo "Commands:"
        echo "  list       - List all Claude instances and recommendations"
        echo "  health     - Check health of a specific instance"
        echo "  terminate  - Safely terminate a specific instance"
        echo "  clean      - Terminate all but the most active instance"
        exit 1
        ;;
esac