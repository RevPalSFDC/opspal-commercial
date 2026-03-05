#!/bin/bash

# Claude Code Instance Management Dashboard
# Interactive CLI visual dashboard for managing Claude instances

# Colors and formatting
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
CYAN='\033[0;36m'
WHITE='\033[1;37m'
GRAY='\033[0;90m'
BOLD='\033[1m'
DIM='\033[2m'
ITALIC='\033[3m'
UNDERLINE='\033[4m'
BLINK='\033[5m'
REVERSE='\033[7m'
NC='\033[0m' # No Color
CLEAR_LINE='\033[2K'

# Dashboard configuration
REFRESH_RATE=2
SELECTED_ROW=1
SHOW_HELP=0
AUTO_REFRESH=1
VIEW_MODE="instances"  # instances, performance, logs

# Get terminal dimensions
update_terminal_size() {
    TERM_COLS=$(tput cols)
    TERM_ROWS=$(tput lines)
}

# Function to draw a box
draw_box() {
    local title="$1"
    local width="${2:-$TERM_COLS}"
    local start_col="${3:-1}"
    
    # Top border
    tput cup 0 $((start_col - 1))
    echo -ne "${CYAN}┌"
    printf '─%.0s' $(seq 1 $((width - 2)))
    echo -ne "┐${NC}"
    
    # Title
    if [ -n "$title" ]; then
        tput cup 0 $((start_col + 2))
        echo -ne "${CYAN}[${WHITE}${BOLD} $title ${NC}${CYAN}]${NC}"
    fi
}

# Function to draw header
draw_header() {
    clear
    update_terminal_size
    
    # Main header
    tput cup 0 0
    echo -ne "${CYAN}╔"
    printf '═%.0s' $(seq 1 $((TERM_COLS - 2)))
    echo -ne "╗${NC}"
    
    tput cup 1 0
    echo -ne "${CYAN}║${NC}"
    
    local header_text="Claude Code Instance Dashboard"
    local header_len=${#header_text}
    local padding=$(( (TERM_COLS - header_len - 2) / 2 ))
    tput cup 1 $padding
    echo -ne "${WHITE}${BOLD}$header_text${NC}"
    
    tput cup 1 $((TERM_COLS - 1))
    echo -ne "${CYAN}║${NC}"
    
    tput cup 2 0
    echo -ne "${CYAN}╠"
    printf '═%.0s' $(seq 1 $((TERM_COLS - 2)))
    echo -ne "╣${NC}"
}

# Function to get instance details
get_instances() {
    ps aux | grep -E '[c]laude' | while read -r line; do
        local pid=$(echo "$line" | awk '{print $2}')
        local user=$(echo "$line" | awk '{print $1}')
        local cpu=$(echo "$line" | awk '{print $3}')
        local mem=$(echo "$line" | awk '{print $4}')
        local vsz=$(echo "$line" | awk '{print $5}')
        local rss=$(echo "$line" | awk '{print $6}')
        local tty=$(echo "$line" | awk '{print $7}')
        local stat=$(echo "$line" | awk '{print $8}')
        local start=$(echo "$line" | awk '{print $9}')
        local time=$(echo "$line" | awk '{print $10}')
        local cmd=$(echo "$line" | awk '{for(i=11;i<=NF;i++) printf "%s ", $i}')
        
        # Get additional process info
        local cwd="unknown"
        if [ -e "/proc/$pid/cwd" ]; then
            cwd=$(readlink "/proc/$pid/cwd" 2>/dev/null || echo "unknown")
        fi
        
        # Truncate long paths
        if [ ${#cwd} -gt 40 ]; then
            cwd="...${cwd: -37}"
        fi
        
        echo "$pid|$cpu|$mem|$start|$tty|$stat|$cwd"
    done
}

# Function to draw instance table
draw_instance_table() {
    local row=4
    
    # Table header
    tput cup $row 2
    echo -ne "${CYAN}${BOLD}"
    printf "%-8s %-8s %-8s %-12s %-8s %-8s %-40s${NC}\n" \
        "PID" "CPU%" "MEM%" "Started" "TTY" "Status" "Working Directory"
    
    ((row++))
    tput cup $row 2
    echo -ne "${GRAY}"
    printf '─%.0s' $(seq 1 $((TERM_COLS - 4)))
    echo -ne "${NC}"
    
    ((row++))
    
    # Get instances and display
    local instance_count=0
    local total_cpu=0
    local total_mem=0
    local selected_pid=""
    
    while IFS='|' read -r pid cpu mem start tty stat cwd; do
        ((instance_count++))
        
        # Calculate totals
        total_cpu=$(echo "$total_cpu + $cpu" | bc)
        total_mem=$(echo "$total_mem + $mem" | bc)
        
        # Highlight selected row
        if [ $instance_count -eq $SELECTED_ROW ]; then
            echo -ne "${REVERSE}"
            selected_pid=$pid
        fi
        
        # Color code based on CPU usage
        local color="${GREEN}"
        if (( $(echo "$cpu > 50" | bc -l) )); then
            color="${RED}"
        elif (( $(echo "$cpu > 20" | bc -l) )); then
            color="${YELLOW}"
        fi
        
        tput cup $row 2
        echo -ne "$color"
        printf "%-8s ${NC}" "$pid"
        
        # CPU with color
        echo -ne "$color"
        printf "%-8s ${NC}" "${cpu}%"
        
        # Memory with color
        local mem_color="${GREEN}"
        if (( $(echo "$mem > 10" | bc -l) )); then
            mem_color="${YELLOW}"
        fi
        if (( $(echo "$mem > 20" | bc -l) )); then
            mem_color="${RED}"
        fi
        echo -ne "$mem_color"
        printf "%-8s ${NC}" "${mem}%"
        
        # Other fields
        printf "%-12s %-8s %-8s %-40s" "$start" "$tty" "$stat" "$cwd"
        
        # Reset reverse if selected
        if [ $instance_count -eq $SELECTED_ROW ]; then
            echo -ne "${NC}"
        fi
        
        ((row++))
        
        # Stop if we're running out of space
        if [ $row -gt $((TERM_ROWS - 10)) ]; then
            break
        fi
    done < <(get_instances)
    
    # Summary section
    ((row++))
    tput cup $row 2
    echo -ne "${GRAY}"
    printf '─%.0s' $(seq 1 $((TERM_COLS - 4)))
    echo -ne "${NC}"
    
    ((row++))
    tput cup $row 2
    echo -ne "${WHITE}${BOLD}Summary: ${NC}"
    echo -ne "Instances: ${CYAN}$instance_count${NC}  "
    echo -ne "Total CPU: ${YELLOW}${total_cpu}%${NC}  "
    echo -ne "Total Mem: ${MAGENTA}${total_mem}%${NC}"
    
    # Store selected PID for actions
    echo "$selected_pid" > ${TEMP_DIR:-/tmp}
    
    return $row
}

# Function to draw performance metrics
draw_performance_metrics() {
    local row=4
    
    tput cup $row 2
    echo -ne "${CYAN}${BOLD}System Performance Metrics${NC}"
    
    ((row+=2))
    
    # CPU Usage
    local cpu_usage=$(top -bn1 | grep "Cpu(s)" | awk '{print $2}' | cut -d'%' -f1)
    tput cup $row 2
    echo -ne "${WHITE}CPU Usage:${NC} "
    draw_progress_bar "$cpu_usage" 100 30
    echo -ne " ${YELLOW}${cpu_usage}%${NC}"
    
    ((row+=2))
    
    # Memory Usage
    local mem_info=$(free -m | grep "^Mem")
    local mem_total=$(echo "$mem_info" | awk '{print $2}')
    local mem_used=$(echo "$mem_info" | awk '{print $3}')
    local mem_percent=$((mem_used * 100 / mem_total))
    
    tput cup $row 2
    echo -ne "${WHITE}Memory:${NC} "
    draw_progress_bar "$mem_percent" 100 30
    echo -ne " ${MAGENTA}${mem_used}/${mem_total}MB (${mem_percent}%)${NC}"
    
    ((row+=2))
    
    # Network Latency
    tput cup $row 2
    echo -ne "${WHITE}API Latency:${NC} "
    local latency=$(ping -c 1 -W 1 api.anthropic.com 2>/dev/null | grep -oE 'time=[0-9.]+' | cut -d= -f2)
    if [ -n "$latency" ]; then
        local lat_val=${latency%.*}
        local lat_color="${GREEN}"
        if [ $lat_val -gt 100 ]; then
            lat_color="${RED}"
        elif [ $lat_val -gt 50 ]; then
            lat_color="${YELLOW}"
        fi
        echo -ne "${lat_color}${latency}ms${NC}"
    else
        echo -ne "${RED}Unreachable${NC}"
    fi
    
    ((row+=2))
    
    # Load Average
    local load_avg=$(uptime | awk -F'load average:' '{print $2}')
    tput cup $row 2
    echo -ne "${WHITE}Load Average:${NC} ${CYAN}$load_avg${NC}"
    
    return $row
}

# Function to draw progress bar
draw_progress_bar() {
    local current=$1
    local max=$2
    local width=$3
    local percent=$((current * 100 / max))
    local filled=$((current * width / max))
    
    echo -ne "["
    
    # Determine color based on percentage
    local color="${GREEN}"
    if [ $percent -gt 80 ]; then
        color="${RED}"
    elif [ $percent -gt 60 ]; then
        color="${YELLOW}"
    fi
    
    echo -ne "$color"
    
    # Draw filled portion
    for ((i=0; i<filled; i++)); do
        echo -ne "█"
    done
    
    echo -ne "${GRAY}"
    
    # Draw empty portion
    for ((i=filled; i<width; i++)); do
        echo -ne "░"
    done
    
    echo -ne "${NC}]"
}

# Function to draw action menu
draw_action_menu() {
    local row=$1
    ((row+=2))
    
    tput cup $row 0
    echo -ne "${CYAN}╠"
    printf '═%.0s' $(seq 1 $((TERM_COLS - 2)))
    echo -ne "╣${NC}"
    
    ((row++))
    tput cup $row 2
    echo -ne "${WHITE}${BOLD}Actions:${NC} "
    
    if [ "$VIEW_MODE" = "instances" ]; then
        echo -ne "${GREEN}[↑↓]${NC} Select  "
        echo -ne "${GREEN}[k]${NC} Kill  "
        echo -ne "${GREEN}[K]${NC} Kill All But Active  "
        echo -ne "${GREEN}[i]${NC} Info  "
    fi
    
    echo -ne "${GREEN}[v]${NC} Toggle View  "
    echo -ne "${GREEN}[r]${NC} Refresh  "
    echo -ne "${GREEN}[a]${NC} Auto-refresh: "
    
    if [ $AUTO_REFRESH -eq 1 ]; then
        echo -ne "${GREEN}ON${NC}  "
    else
        echo -ne "${RED}OFF${NC}  "
    fi
    
    echo -ne "${GREEN}[h]${NC} Help  "
    echo -ne "${GREEN}[q]${NC} Quit"
    
    return $row
}

# Function to draw status bar
draw_status_bar() {
    local row=$((TERM_ROWS - 2))
    
    tput cup $row 0
    echo -ne "${CYAN}╠"
    printf '═%.0s' $(seq 1 $((TERM_COLS - 2)))
    echo -ne "╣${NC}"
    
    ((row++))
    tput cup $row 0
    echo -ne "${CYAN}║${NC}"
    
    # Status message
    local status_msg="Last Updated: $(date '+%H:%M:%S')"
    tput cup $row 2
    echo -ne "${GRAY}$status_msg${NC}"
    
    # View mode indicator
    local view_indicator="View: $VIEW_MODE"
    tput cup $row $((TERM_COLS - ${#view_indicator} - 2))
    echo -ne "${WHITE}$view_indicator${NC}"
    
    tput cup $row $((TERM_COLS - 1))
    echo -ne "${CYAN}║${NC}"
    
    # Bottom border
    ((row++))
    tput cup $row 0
    echo -ne "${CYAN}╚"
    printf '═%.0s' $(seq 1 $((TERM_COLS - 2)))
    echo -ne "╝${NC}"
}

# Function to show help
show_help_screen() {
    clear
    draw_header
    
    local row=4
    tput cup $row 2
    echo -ne "${CYAN}${BOLD}Claude Dashboard Help${NC}"
    
    ((row+=2))
    tput cup $row 2
    echo -ne "${WHITE}${BOLD}Navigation:${NC}"
    
    ((row++))
    tput cup $row 4
    echo -ne "${GREEN}↑/k${NC} - Move selection up"
    
    ((row++))
    tput cup $row 4
    echo -ne "${GREEN}↓/j${NC} - Move selection down"
    
    ((row+=2))
    tput cup $row 2
    echo -ne "${WHITE}${BOLD}Actions:${NC}"
    
    ((row++))
    tput cup $row 4
    echo -ne "${GREEN}k${NC} - Kill selected instance"
    
    ((row++))
    tput cup $row 4
    echo -ne "${GREEN}K${NC} - Kill all instances except most active"
    
    ((row++))
    tput cup $row 4
    echo -ne "${GREEN}i${NC} - Show detailed info for selected instance"
    
    ((row++))
    tput cup $row 4
    echo -ne "${GREEN}v${NC} - Toggle between views (instances/performance)"
    
    ((row++))
    tput cup $row 4
    echo -ne "${GREEN}r${NC} - Manual refresh"
    
    ((row++))
    tput cup $row 4
    echo -ne "${GREEN}a${NC} - Toggle auto-refresh"
    
    ((row++))
    tput cup $row 4
    echo -ne "${GREEN}h${NC} - Show this help screen"
    
    ((row++))
    tput cup $row 4
    echo -ne "${GREEN}q${NC} - Quit dashboard"
    
    ((row+=2))
    tput cup $row 2
    echo -ne "${WHITE}${BOLD}Color Coding:${NC}"
    
    ((row++))
    tput cup $row 4
    echo -ne "${GREEN}Green${NC} - Normal (CPU < 20%)"
    
    ((row++))
    tput cup $row 4
    echo -ne "${YELLOW}Yellow${NC} - Warning (CPU 20-50%)"
    
    ((row++))
    tput cup $row 4
    echo -ne "${RED}Red${NC} - High (CPU > 50%)"
    
    ((row+=2))
    tput cup $row 2
    echo -ne "${GRAY}Press any key to return...${NC}"
    
    read -n 1 -s
    SHOW_HELP=0
}

# Function to kill instance
kill_instance() {
    local pid=$1
    if [ -z "$pid" ]; then
        return
    fi
    
    # Confirm
    local row=$((TERM_ROWS - 4))
    tput cup $row 2
    echo -ne "${YELLOW}Kill instance $pid? (y/N): ${NC}"
    read -n 1 -s confirm
    
    if [[ "$confirm" =~ ^[Yy]$ ]]; then
        kill -TERM "$pid" 2>/dev/null
        
        # Wait for graceful termination
        local count=0
        while ps -p "$pid" > /dev/null 2>&1 && [ $count -lt 5 ]; do
            sleep 0.5
            ((count++))
        done
        
        # Force kill if still running
        if ps -p "$pid" > /dev/null 2>&1; then
            kill -KILL "$pid" 2>/dev/null
        fi
        
        tput cup $row 2
        echo -ne "${CLEAR_LINE}${GREEN}✓ Instance $pid terminated${NC}"
        sleep 1
    fi
}

# Function to kill all but active
kill_all_but_active() {
    local row=$((TERM_ROWS - 4))
    tput cup $row 2
    echo -ne "${YELLOW}Kill all instances except most active? (y/N): ${NC}"
    read -n 1 -s confirm
    
    if [[ "$confirm" =~ ^[Yy]$ ]]; then
        # Get most active instance
        local keep_pid=$(ps aux | grep '[c]laude' | sort -rn -k3 | head -1 | awk '{print $2}')
        
        ps aux | grep '[c]laude' | awk '{print $2}' | while read -r pid; do
            if [ "$pid" != "$keep_pid" ]; then
                kill -TERM "$pid" 2>/dev/null
            fi
        done
        
        tput cup $row 2
        echo -ne "${CLEAR_LINE}${GREEN}✓ Kept only instance $keep_pid${NC}"
        sleep 1
    fi
}

# Function to show instance info
show_instance_info() {
    local pid=$1
    if [ -z "$pid" ] || [ "$pid" = "" ]; then
        return
    fi
    
    clear
    draw_header
    
    local row=4
    tput cup $row 2
    echo -ne "${CYAN}${BOLD}Instance Details - PID: $pid${NC}"
    
    ((row+=2))
    
    # Get detailed process info
    if ps -p "$pid" > /dev/null 2>&1; then
        # Basic info
        local info=$(ps -p "$pid" -o pid,ppid,user,cpu,mem,vsz,rss,tty,stat,start,time,comm --no-headers)
        
        tput cup $row 2
        echo -ne "${WHITE}Process Info:${NC}"
        ((row++))
        tput cup $row 4
        echo -ne "$info"
        
        ((row+=2))
        
        # Working directory
        if [ -e "/proc/$pid/cwd" ]; then
            local cwd=$(readlink "/proc/$pid/cwd" 2>/dev/null)
            tput cup $row 2
            echo -ne "${WHITE}Working Directory:${NC} $cwd"
            ((row++))
        fi
        
        # Command line
        if [ -r "/proc/$pid/cmdline" ]; then
            ((row++))
            local cmdline=$(tr '\0' ' ' < "/proc/$pid/cmdline")
            tput cup $row 2
            echo -ne "${WHITE}Command:${NC}"
            ((row++))
            tput cup $row 4
            # Wrap long command
            echo "$cmdline" | fold -w $((TERM_COLS - 6)) | head -5 | while read -r line; do
                tput cup $row 4
                echo -ne "$line"
                ((row++))
            done
        fi
        
        # Open files count
        if [ -d "/proc/$pid/fd" ]; then
            ((row++))
            local fd_count=$(ls -1 /proc/$pid/fd 2>/dev/null | wc -l)
            tput cup $row 2
            echo -ne "${WHITE}Open Files:${NC} $fd_count"
        fi
        
        # Environment variables (selected)
        if [ -r "/proc/$pid/environ" ]; then
            ((row+=2))
            tput cup $row 2
            echo -ne "${WHITE}Key Environment Variables:${NC}"
            ((row++))
            
            for var in ANTHROPIC_LOG CLAUDE_CODE_ENTRYPOINT PWD USER HOME; do
                local value=$(tr '\0' '\n' < "/proc/$pid/environ" | grep "^$var=" | cut -d= -f2-)
                if [ -n "$value" ]; then
                    tput cup $row 4
                    echo -ne "${GREEN}$var${NC}=$value"
                    ((row++))
                fi
            done
        fi
    else
        tput cup $row 2
        echo -ne "${RED}Process $pid not found${NC}"
    fi
    
    ((row+=2))
    tput cup $row 2
    echo -ne "${GRAY}Press any key to return...${NC}"
    
    read -n 1 -s
}

# Main loop
main_loop() {
    # Hide cursor
    tput civis
    
    # Trap to restore cursor on exit
    trap 'tput cnorm; clear; exit' INT TERM EXIT
    
    while true; do
        if [ $SHOW_HELP -eq 1 ]; then
            show_help_screen
            continue
        fi
        
        draw_header
        
        local last_row=0
        case "$VIEW_MODE" in
            "instances")
                draw_instance_table
                last_row=$?
                ;;
            "performance")
                draw_performance_metrics
                last_row=$?
                ;;
        esac
        
        draw_action_menu $last_row
        last_row=$?
        
        draw_status_bar
        
        # Handle input with timeout for auto-refresh
        if [ $AUTO_REFRESH -eq 1 ]; then
            read -t $REFRESH_RATE -n 1 -s key
        else
            read -n 1 -s key
        fi
        
        # Process input
        case "$key" in
            'q'|'Q')
                break
                ;;
            'A') # Up arrow
                if [ $SELECTED_ROW -gt 1 ]; then
                    ((SELECTED_ROW--))
                fi
                ;;
            'B') # Down arrow
                local max_rows=$(get_instances | wc -l)
                if [ $SELECTED_ROW -lt $max_rows ]; then
                    ((SELECTED_ROW++))
                fi
                ;;
            'j')
                local max_rows=$(get_instances | wc -l)
                if [ $SELECTED_ROW -lt $max_rows ]; then
                    ((SELECTED_ROW++))
                fi
                ;;
            'k')
                if [ "$VIEW_MODE" = "instances" ]; then
                    if [ -f ${TEMP_DIR:-/tmp} ]; then
                        kill_instance "$(cat ${TEMP_DIR:-/tmp})"
                    fi
                else
                    if [ $SELECTED_ROW -gt 1 ]; then
                        ((SELECTED_ROW--))
                    fi
                fi
                ;;
            'K')
                if [ "$VIEW_MODE" = "instances" ]; then
                    kill_all_but_active
                fi
                ;;
            'i'|'I')
                if [ "$VIEW_MODE" = "instances" ] && [ -f ${TEMP_DIR:-/tmp} ]; then
                    show_instance_info "$(cat ${TEMP_DIR:-/tmp})"
                fi
                ;;
            'v'|'V')
                if [ "$VIEW_MODE" = "instances" ]; then
                    VIEW_MODE="performance"
                else
                    VIEW_MODE="instances"
                fi
                ;;
            'r'|'R')
                continue
                ;;
            'a'|'A')
                if [ $AUTO_REFRESH -eq 1 ]; then
                    AUTO_REFRESH=0
                else
                    AUTO_REFRESH=1
                fi
                ;;
            'h'|'H'|'?')
                SHOW_HELP=1
                ;;
        esac
    done
    
    # Cleanup
    rm -f ${TEMP_DIR:-/tmp}
    
    # Restore cursor
    tput cnorm
    clear
}

# Check dependencies
check_dependencies() {
    local missing_deps=()
    
    for cmd in tput bc ps top free ping; do
        if ! command -v "$cmd" &> /dev/null; then
            missing_deps+=("$cmd")
        fi
    done
    
    if [ ${#missing_deps[@]} -gt 0 ]; then
        echo "Missing required commands: ${missing_deps[*]}"
        echo "Please install them and try again."
        exit 1
    fi
}

# Main execution
case "${1:-run}" in
    run)
        check_dependencies
        main_loop
        ;;
    help|--help|-h)
        echo "Claude Code Instance Dashboard"
        echo ""
        echo "Usage: $0 [run|help]"
        echo ""
        echo "An interactive CLI dashboard for managing Claude Code instances."
        echo ""
        echo "Features:"
        echo "  - Real-time instance monitoring"
        echo "  - Process management (kill instances)"
        echo "  - Performance metrics visualization"
        echo "  - Auto-refresh capability"
        echo "  - Color-coded status indicators"
        echo ""
        echo "Run '$0' to start the dashboard."
        ;;
    *)
        check_dependencies
        main_loop
        ;;
esac