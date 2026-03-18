#!/bin/bash

###############################################################################
# MCP Cleanup Script
# Kills all MCP server processes and cleans up locks
# Use this for emergency cleanup or before system maintenance
###############################################################################

set -euo pipefail

# Load project-local env defaults (Salesforce only)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -f "${SCRIPT_DIR}/lib/env.sh" ]]; then
    # shellcheck source=lib/env.sh
    source "${SCRIPT_DIR}/lib/env.sh"
fi

# Configuration
LOCK_DIR="${TMP_DIR}/mcp-locks"
LOG_DIR="${LOG_DIR}"
PID_DIR="${RUNTIME_DIR}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print usage
usage() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  --all, -a        Kill all MCP processes and clean everything"
    echo "  --processes, -p  Kill processes only"
    echo "  --locks, -l      Clean lock files only"
    echo "  --logs           Clean old log files (> 7 days)"
    echo "  --force, -f      Force kill (SIGKILL) instead of graceful shutdown"
    echo "  --dry-run        Show what would be done without doing it"
    echo "  --help, -h       Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 --all                 # Full cleanup"
    echo "  $0 --processes --force   # Force kill all processes"
    echo "  $0 --dry-run --all       # Preview cleanup actions"
}

# Parse arguments
KILL_PROCESSES=false
CLEAN_LOCKS=false
CLEAN_LOGS=false
FORCE_KILL=false
DRY_RUN=false

if [ $# -eq 0 ]; then
    KILL_PROCESSES=true
    CLEAN_LOCKS=true
fi

while [[ $# -gt 0 ]]; do
    case $1 in
        --all|-a)
            KILL_PROCESSES=true
            CLEAN_LOCKS=true
            CLEAN_LOGS=true
            shift
            ;;
        --processes|-p)
            KILL_PROCESSES=true
            shift
            ;;
        --locks|-l)
            CLEAN_LOCKS=true
            shift
            ;;
        --logs)
            CLEAN_LOGS=true
            shift
            ;;
        --force|-f)
            FORCE_KILL=true
            shift
            ;;
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --help|-h)
            usage
            exit 0
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            usage
            exit 1
            ;;
    esac
done

# Function to execute or preview command
execute() {
    if [ "$DRY_RUN" = true ]; then
        echo -e "${YELLOW}[DRY RUN] $@${NC}"
    else
        "$@"
    fi
}

# Function to find MCP processes
find_mcp_processes() {
    # Find all MCP-related processes
    ps aux | grep -E "(mcp-server|@roychri/mcp|@salesforce/mcp|mcp-manager|mcp-health-monitor)" | grep -v grep | grep -v "$0" || true
}

# Function to kill processes
kill_processes() {
    echo -e "${BLUE}=== Killing MCP Processes ===${NC}"
    
    local processes=$(find_mcp_processes)
    
    if [ -z "$processes" ]; then
        echo -e "${GREEN}No MCP processes found${NC}"
        return
    fi
    
    echo -e "${YELLOW}Found processes:${NC}"
    echo "$processes"
    echo ""
    
    # Extract PIDs
    local pids=$(echo "$processes" | awk '{print $2}')
    
    for pid in $pids; do
        if [ "$FORCE_KILL" = true ]; then
            echo -e "${RED}Force killing process $pid${NC}"
            execute kill -9 $pid 2>/dev/null || true
        else
            echo -e "${YELLOW}Terminating process $pid${NC}"
            execute kill -TERM $pid 2>/dev/null || true
        fi
    done
    
    if [ "$DRY_RUN" = false ] && [ "$FORCE_KILL" = false ]; then
        # Wait for graceful shutdown
        echo -e "${BLUE}Waiting for processes to terminate...${NC}"
        sleep 3
        
        # Check for remaining processes
        local remaining=$(find_mcp_processes)
        if [ -n "$remaining" ]; then
            echo -e "${YELLOW}Some processes still running, force killing...${NC}"
            echo "$remaining" | awk '{print $2}' | xargs -r kill -9 2>/dev/null || true
        fi
    fi
    
    echo -e "${GREEN}✓ Processes cleaned up${NC}"
}

# Function to clean lock files
clean_locks() {
    echo -e "${BLUE}=== Cleaning Lock Files ===${NC}"
    
    if [ ! -d "$LOCK_DIR" ]; then
        echo -e "${GREEN}Lock directory doesn't exist${NC}"
        return
    fi
    
    local lock_count=$(find "$LOCK_DIR" -name "*.lock" 2>/dev/null | wc -l)
    
    if [ $lock_count -eq 0 ]; then
        echo -e "${GREEN}No lock files found${NC}"
        return
    fi
    
    echo -e "${YELLOW}Found $lock_count lock files${NC}"
    
    if [ "$DRY_RUN" = false ]; then
        find "$LOCK_DIR" -name "*.lock" -exec rm -f {} \;
        echo -e "${GREEN}✓ Lock files removed${NC}"
    else
        find "$LOCK_DIR" -name "*.lock" -exec echo "[DRY RUN] Would remove: {}" \;
    fi
}

# Function to clean log files
clean_logs() {
    echo -e "${BLUE}=== Cleaning Log Files ===${NC}"
    
    # Find old MCP log files
    local old_logs=$(find "$LOG_DIR" -name "mcp-*.log" -mtime +7 2>/dev/null | wc -l)
    local large_logs=$(find "$LOG_DIR" -name "mcp-*.log" -size +100M 2>/dev/null | wc -l)
    
    if [ $old_logs -eq 0 ] && [ $large_logs -eq 0 ]; then
        echo -e "${GREEN}No log files to clean${NC}"
        return
    fi
    
    if [ $old_logs -gt 0 ]; then
        echo -e "${YELLOW}Found $old_logs log files older than 7 days${NC}"
        if [ "$DRY_RUN" = false ]; then
            find "$LOG_DIR" -name "mcp-*.log" -mtime +7 -exec rm -f {} \;
            echo -e "${GREEN}✓ Old logs removed${NC}"
        else
            find "$LOG_DIR" -name "mcp-*.log" -mtime +7 -exec echo "[DRY RUN] Would remove: {}" \;
        fi
    fi
    
    if [ $large_logs -gt 0 ]; then
        echo -e "${YELLOW}Found $large_logs large log files (>100MB)${NC}"
        if [ "$DRY_RUN" = false ]; then
            find "$LOG_DIR" -name "mcp-*.log" -size +100M -exec gzip {} \;
            echo -e "${GREEN}✓ Large logs compressed${NC}"
        else
            find "$LOG_DIR" -name "mcp-*.log" -size +100M -exec echo "[DRY RUN] Would compress: {}" \;
        fi
    fi
}

# Function to clean PID files
clean_pid_files() {
    echo -e "${BLUE}=== Cleaning PID Files ===${NC}"
    
    local pid_files=$(find "$PID_DIR" -name "mcp-*.pid" 2>/dev/null | wc -l)
    
    if [ $pid_files -eq 0 ]; then
        echo -e "${GREEN}No PID files found${NC}"
        return
    fi
    
    echo -e "${YELLOW}Found $pid_files PID files${NC}"
    
    if [ "$DRY_RUN" = false ]; then
        find "$PID_DIR" -name "mcp-*.pid" -exec rm -f {} \;
        echo -e "${GREEN}✓ PID files removed${NC}"
    else
        find "$PID_DIR" -name "mcp-*.pid" -exec echo "[DRY RUN] Would remove: {}" \;
    fi
}

# Function to check for orphaned ports
check_ports() {
    echo -e "${BLUE}=== Checking for Orphaned Ports ===${NC}"
    
    local ports=$(lsof -i :3000-9999 | grep LISTEN | grep -E "(node|npm)" | awk '{print $2}' | sort -u)
    
    if [ -z "$ports" ]; then
        echo -e "${GREEN}No orphaned ports found${NC}"
        return
    fi
    
    echo -e "${YELLOW}Found processes holding ports:${NC}"
    for pid in $ports; do
        ps -p $pid -o pid,comm,args | tail -n +2
    done
    
    if [ "$KILL_PROCESSES" = true ]; then
        for pid in $ports; do
            echo -e "${YELLOW}Killing process $pid holding port${NC}"
            execute kill -TERM $pid 2>/dev/null || true
        done
    fi
}

# Function to show summary
show_summary() {
    echo ""
    echo -e "${BLUE}=== Cleanup Summary ===${NC}"
    
    if [ "$DRY_RUN" = true ]; then
        echo -e "${YELLOW}DRY RUN MODE - No changes were made${NC}"
    fi
    
    # Check current state
    local remaining_processes=$(find_mcp_processes | wc -l)
    local remaining_locks=$(find "$LOCK_DIR" -name "*.lock" 2>/dev/null | wc -l)
    
    echo "Remaining MCP processes: $remaining_processes"
    echo "Remaining lock files: $remaining_locks"
    
    if [ $remaining_processes -eq 0 ] && [ $remaining_locks -eq 0 ]; then
        echo -e "${GREEN}✓ System is clean${NC}"
    else
        echo -e "${YELLOW}⚠ Some items may still need cleanup${NC}"
    fi
}

# Main execution
echo -e "${BLUE}╔════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║          MCP Cleanup Utility              ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════╝${NC}"
echo ""

if [ "$DRY_RUN" = true ]; then
    echo -e "${YELLOW}Running in DRY RUN mode - no changes will be made${NC}"
    echo ""
fi

# Execute cleanup tasks
if [ "$KILL_PROCESSES" = true ]; then
    kill_processes
    echo ""
fi

if [ "$CLEAN_LOCKS" = true ]; then
    clean_locks
    clean_pid_files
    echo ""
fi

if [ "$CLEAN_LOGS" = true ]; then
    clean_logs
    echo ""
fi

# Always check ports if killing processes
if [ "$KILL_PROCESSES" = true ]; then
    check_ports
    echo ""
fi

# Show summary
show_summary

echo ""
echo -e "${GREEN}Cleanup complete!${NC}"

# Exit with appropriate code
if [ "$DRY_RUN" = false ]; then
    # Check if cleanup was successful
    remaining=$(find_mcp_processes | wc -l)
    if [ $remaining -gt 0 ]; then
        exit 1
    fi
fi

exit 0
