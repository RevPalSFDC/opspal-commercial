#!/bin/bash

# Claude Code Monitor - Simplified visual CLI for instance management
# A lightweight alternative to the full dashboard

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
WHITE='\033[1;37m'
GRAY='\033[0;90m'
BOLD='\033[1m'
NC='\033[0m'

# Configuration
WATCH_MODE=0
COMPACT_MODE=0

# Function to print colored text
print_color() {
    local color=$1
    shift
    echo -e "${color}$@${NC}"
}

# Function to print header
print_header() {
    echo
    print_color "$CYAN" "┌────────────────────────────────────────────────────────────────────┐"
    print_color "$CYAN" "│                   ${WHITE}${BOLD}Claude Code Instance Monitor${NC}${CYAN}                   │"
    print_color "$CYAN" "└────────────────────────────────────────────────────────────────────┘"
    echo
}

# Function to get instance status
get_instance_status() {
    local instances=$(ps aux | grep -c '[c]laude')
    local status_color="$GREEN"
    local status_text="✓ Healthy"
    local status_icon="✓"
    
    if [ "$instances" -eq 0 ]; then
        status_color="$GRAY"
        status_text="No instances running"
        status_icon="○"
    elif [ "$instances" -eq 1 ]; then
        status_color="$GREEN"
        status_text="Optimal (1 instance)"
        status_icon="✓"
    elif [ "$instances" -le 3 ]; then
        status_color="$YELLOW"
        status_text="Warning ($instances instances)"
        status_icon="⚠"
    else
        status_color="$RED"
        status_text="Critical ($instances instances)"
        status_icon="✗"
    fi
    
    echo -e "${status_color}${status_icon} Status: ${status_text}${NC}"
}

# Function to show instances in a table
show_instances() {
    local format="%-8s %-7s %-7s %-12s %-8s %s\n"
    
    print_color "$CYAN" "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    printf "${BOLD}${WHITE}$format${NC}" "PID" "CPU%" "MEM%" "Started" "TTY" "Status"
    print_color "$CYAN" "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    
    local total_cpu=0
    local total_mem=0
    local count=0
    
    ps aux | grep -E '[c]laude' | while read -r line; do
        local pid=$(echo "$line" | awk '{print $2}')
        local cpu=$(echo "$line" | awk '{print $3}')
        local mem=$(echo "$line" | awk '{print $4}')
        local start=$(echo "$line" | awk '{print $9}')
        local tty=$(echo "$line" | awk '{print $7}')
        local stat=$(echo "$line" | awk '{print $8}')
        
        # Color based on CPU usage
        local row_color=""
        if (( $(echo "$cpu > 50" | bc -l) )); then
            row_color="$RED"
        elif (( $(echo "$cpu > 20" | bc -l) )); then
            row_color="$YELLOW"
        else
            row_color="$GREEN"
        fi
        
        printf "${row_color}$format${NC}" "$pid" "${cpu}%" "${mem}%" "$start" "$tty" "$stat"
        
        # Track totals
        total_cpu=$(echo "$total_cpu + $cpu" | bc)
        total_mem=$(echo "$total_mem + $mem" | bc)
        ((count++))
    done
    
    if [ "$count" -gt 0 ]; then
        print_color "$CYAN" "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        echo -e "${WHITE}${BOLD}Total:${NC} $count instances | CPU: ${YELLOW}${total_cpu}%${NC} | Memory: ${CYAN}${total_mem}%${NC}"
    else
        print_color "$GRAY" "  No Claude instances currently running"
    fi
}

# Function to show system metrics
show_metrics() {
    echo
    print_color "$WHITE$BOLD" "System Metrics:"
    print_color "$CYAN" "─────────────────────────────────────────────────────────────────────"
    
    # CPU Load
    local load=$(uptime | awk -F'load average:' '{print $2}')
    echo -e "${WHITE}Load Average:${NC} $load"
    
    # Memory
    local mem_info=$(free -h | grep "^Mem")
    local mem_used=$(echo "$mem_info" | awk '{print $3}')
    local mem_total=$(echo "$mem_info" | awk '{print $2}')
    echo -e "${WHITE}Memory Usage:${NC} $mem_used / $mem_total"
    
    # API Connectivity
    echo -ne "${WHITE}API Status:${NC} "
    if ping -c 1 -W 1 api.anthropic.com &>/dev/null; then
        local latency=$(ping -c 1 -W 1 api.anthropic.com 2>/dev/null | grep -oE 'time=[0-9.]+' | cut -d= -f2)
        print_color "$GREEN" "✓ Connected (${latency}ms)"
    else
        print_color "$RED" "✗ Unreachable"
    fi
    
    # Debug Mode
    echo -ne "${WHITE}Debug Mode:${NC} "
    if [ -n "$ANTHROPIC_LOG" ]; then
        print_color "$GREEN" "✓ Enabled ($ANTHROPIC_LOG)"
    else
        print_color "$GRAY" "○ Disabled"
    fi
}

# Function to show recommendations
show_recommendations() {
    local instances=$(ps aux | grep -c '[c]laude')
    
    if [ "$instances" -gt 1 ]; then
        echo
        print_color "$YELLOW$BOLD" "⚠ Recommendations:"
        print_color "$CYAN" "─────────────────────────────────────────────────────────────────────"
        
        if [ "$instances" -gt 3 ]; then
            print_color "$RED" "  • Critical: Too many instances detected!"
            print_color "$WHITE" "    Run: ./scripts/claude-instance-manager.sh clean"
        else
            print_color "$YELLOW" "  • Multiple instances may cause slow pre-flight checks"
            print_color "$WHITE" "    Consider keeping only one active instance"
        fi
        
        # Get PIDs for cleanup command
        local pids=$(ps aux | grep '[c]laude' | awk '{print $2}' | tail -n +2 | tr '\n' ' ')
        if [ -n "$pids" ]; then
            print_color "$GRAY" "    To clean: kill $pids"
        fi
    elif [ "$instances" -eq 0 ]; then
        echo
        print_color "$GRAY" "  No active instances. Start Claude Code to begin monitoring."
    else
        echo
        print_color "$GREEN$BOLD" "✓ Optimal Configuration"
        print_color "$CYAN" "─────────────────────────────────────────────────────────────────────"
        print_color "$GREEN" "  • Single instance running - no action needed"
    fi
}

# Function for compact display
show_compact() {
    local instances=$(ps aux | grep -c '[c]laude')
    local status_icon="✓"
    local status_color="$GREEN"
    
    if [ "$instances" -eq 0 ]; then
        status_icon="○"
        status_color="$GRAY"
    elif [ "$instances" -gt 1 ]; then
        status_icon="⚠"
        status_color="$YELLOW"
        if [ "$instances" -gt 3 ]; then
            status_icon="✗"
            status_color="$RED"
        fi
    fi
    
    # One-line summary
    echo -ne "${status_color}${status_icon}${NC} Claude: "
    
    if [ "$instances" -eq 0 ]; then
        echo -e "${GRAY}No instances${NC}"
    else
        echo -ne "${WHITE}$instances${NC} instance"
        [ "$instances" -gt 1 ] && echo -ne "s"
        
        # Show total CPU/MEM
        local total_cpu=$(ps aux | grep '[c]laude' | awk '{sum+=$3} END {print sum}')
        local total_mem=$(ps aux | grep '[c]laude' | awk '{sum+=$4} END {print sum}')
        
        echo -e " | CPU: ${YELLOW}${total_cpu}%${NC} | Mem: ${CYAN}${total_mem}%${NC}"
        
        if [ "$instances" -gt 1 ]; then
            echo -e "  ${YELLOW}⚠ Run: ./scripts/claude-instance-manager.sh clean${NC}"
        fi
    fi
}

# Function for watch mode
watch_mode() {
    while true; do
        clear
        print_header
        get_instance_status
        echo
        show_instances
        show_metrics
        show_recommendations
        echo
        print_color "$GRAY" "Refreshing every 2 seconds... Press Ctrl+C to exit"
        sleep 2
    done
}

# Main execution
case "${1:-show}" in
    show|status)
        print_header
        get_instance_status
        echo
        show_instances
        show_metrics
        show_recommendations
        ;;
    compact|c)
        show_compact
        ;;
    watch|w)
        trap 'echo -e "\n${GREEN}Monitoring stopped${NC}"; exit' INT
        watch_mode
        ;;
    kill-all)
        instances=$(ps aux | grep -c '[c]laude')
        if [ "$instances" -gt 0 ]; then
            echo -e "${YELLOW}⚠ This will terminate ALL Claude instances${NC}"
            read -p "Are you sure? (y/N): " -n 1 -r
            echo
            if [[ $REPLY =~ ^[Yy]$ ]]; then
                ps aux | grep '[c]laude' | awk '{print $2}' | xargs kill -TERM 2>/dev/null
                echo -e "${GREEN}✓ All instances terminated${NC}"
            fi
        else
            echo -e "${GRAY}No instances to terminate${NC}"
        fi
        ;;
    clean)
        # Keep most active, kill others
        instances=$(ps aux | grep -c '[c]laude')
        if [ "$instances" -gt 1 ]; then
            keep_pid=$(ps aux | grep '[c]laude' | sort -rn -k3 | head -1 | awk '{print $2}')
            echo -e "${YELLOW}Keeping most active instance: PID $keep_pid${NC}"
            ps aux | grep '[c]laude' | awk '{print $2}' | grep -v "$keep_pid" | xargs kill -TERM 2>/dev/null
            echo -e "${GREEN}✓ Cleaned up extra instances${NC}"
        else
            echo -e "${GRAY}Nothing to clean (≤1 instance)${NC}"
        fi
        ;;
    help|--help|-h)
        echo "Claude Code Monitor - Visual CLI for instance management"
        echo
        echo "Usage: $0 [command]"
        echo
        echo "Commands:"
        echo "  show, status    Display current instances and metrics (default)"
        echo "  compact, c      Show compact one-line summary"
        echo "  watch, w        Continuous monitoring (updates every 2s)"
        echo "  kill-all        Terminate all Claude instances"
        echo "  clean           Keep most active instance, terminate others"
        echo "  help            Show this help message"
        echo
        echo "Examples:"
        echo "  $0              # Show current status"
        echo "  $0 watch        # Monitor continuously"
        echo "  $0 compact      # Quick one-line check"
        echo "  $0 clean        # Clean up extra instances"
        ;;
    *)
        print_header
        get_instance_status
        echo
        show_instances
        show_metrics
        show_recommendations
        ;;
esac