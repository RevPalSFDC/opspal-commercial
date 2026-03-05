#!/bin/bash

# ============================================================================
# Organization Monitoring Dashboard
# Real-time display of organization compliance metrics
# ============================================================================

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
PURPLE='\033[0;35m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BASE_DIR="$(dirname "$SCRIPT_DIR")"
ORG_ENFORCER="$BASE_DIR/scripts/lib/organization-enforcer.js"
TODAY=$(date +%Y-%m-%d)
REFRESH_INTERVAL=5

# Clear screen and set up
clear

# Function to draw a box
draw_box() {
    local width=$1
    echo -e "${CYAN}╔$(printf '═%.0s' $(seq 1 $width))╗${NC}"
}

draw_box_bottom() {
    local width=$1
    echo -e "${CYAN}╚$(printf '═%.0s' $(seq 1 $width))╝${NC}"
}

# Function to center text
center_text() {
    local text="$1"
    local width=$2
    local text_length=${#text}
    local padding=$(( (width - text_length) / 2 ))
    printf "%*s%s%*s" $padding "" "$text" $(( width - text_length - padding )) ""
}

# Main dashboard loop
while true; do
    # Clear and reposition
    clear

    # Header
    draw_box 60
    echo -e "${CYAN}║${NC}$(center_text "${BOLD}📊 ORGANIZATION COMPLIANCE DASHBOARD${NC}" 60)${CYAN}║${NC}"
    echo -e "${CYAN}║${NC}$(center_text "$(date '+%Y-%m-%d %H:%M:%S')" 60)${CYAN}║${NC}"
    draw_box_bottom 60
    echo

    # Run compliance check
    if [ -f "$ORG_ENFORCER" ]; then
        CHECK_OUTPUT=$(node "$ORG_ENFORCER" check 2>&1)
        TOTAL_VIOLATIONS=$(echo "$CHECK_OUTPUT" | grep -oE "[0-9]+ violations found" | grep -oE "[0-9]+" || echo "0")
        ERRORS=$(echo "$CHECK_OUTPUT" | grep "Errors:" | awk '{print $2}' || echo "0")
        WARNINGS=$(echo "$CHECK_OUTPUT" | grep "Warnings:" | awk '{print $2}' || echo "0")
    else
        TOTAL_VIOLATIONS=0
        ERRORS=0
        WARNINGS=0
    fi

    # Calculate compliance score
    COMPLIANCE_SCORE=100
    if [ "$ERRORS" -gt 0 ]; then
        COMPLIANCE_SCORE=$((COMPLIANCE_SCORE - ERRORS * 10))
    fi
    if [ "$WARNINGS" -gt 0 ]; then
        COMPLIANCE_SCORE=$((COMPLIANCE_SCORE - WARNINGS * 5))
    fi
    if [ "$COMPLIANCE_SCORE" -lt 0 ]; then
        COMPLIANCE_SCORE=0
    fi

    # Compliance Status
    echo -e "${BOLD}${BLUE}COMPLIANCE STATUS${NC}"
    echo -e "${BLUE}─────────────────────────────────────────${NC}"

    # Score display with color coding
    if [ "$COMPLIANCE_SCORE" -ge 95 ]; then
        SCORE_COLOR=$GREEN
        STATUS="🌟 EXCELLENT"
    elif [ "$COMPLIANCE_SCORE" -ge 80 ]; then
        SCORE_COLOR=$GREEN
        STATUS="✅ GOOD"
    elif [ "$COMPLIANCE_SCORE" -ge 60 ]; then
        SCORE_COLOR=$YELLOW
        STATUS="⚠️  NEEDS IMPROVEMENT"
    else
        SCORE_COLOR=$RED
        STATUS="❌ POOR"
    fi

    echo -e "Compliance Score: ${SCORE_COLOR}${BOLD}${COMPLIANCE_SCORE}/100${NC} ${STATUS}"
    echo

    # Metrics
    echo -e "${BOLD}${BLUE}CURRENT METRICS${NC}"
    echo -e "${BLUE}─────────────────────────────────────────${NC}"

    if [ "$ERRORS" -eq 0 ]; then
        echo -e "Errors:    ${GREEN}$ERRORS ✓${NC}"
    else
        echo -e "Errors:    ${RED}$ERRORS ✗${NC}"
    fi

    if [ "$WARNINGS" -eq 0 ]; then
        echo -e "Warnings:  ${GREEN}$WARNINGS ✓${NC}"
    else
        echo -e "Warnings:  ${YELLOW}$WARNINGS ⚠${NC}"
    fi

    echo -e "Total:     $TOTAL_VIOLATIONS violations"
    echo

    # Project Status
    echo -e "${BOLD}${BLUE}PROJECT STATUS${NC}"
    echo -e "${BLUE}─────────────────────────────────────────${NC}"

    # Count projects
    PROJECT_COUNT=$(find "$BASE_DIR" -maxdepth 1 -type d -name "*-????-??-??" 2>/dev/null | wc -l)
    echo -e "Active Projects: ${CYAN}$PROJECT_COUNT${NC}"

    # Check if in project directory
    if [ -f "config/project.json" ]; then
        PROJECT_NAME=$(cat config/project.json 2>/dev/null | grep '"projectName"' | cut -d'"' -f4)
        echo -e "Current Project: ${GREEN}$PROJECT_NAME${NC}"
    else
        echo -e "Current Project: ${YELLOW}Not in project directory${NC}"
    fi

    # Files in root check
    ROOT_FILES=$(find "$BASE_DIR" -maxdepth 1 -type f \( -name "*.js" -o -name "*.csv" -o -name "*.json" \) 2>/dev/null | grep -v package | wc -l)
    if [ "$ROOT_FILES" -eq 0 ]; then
        echo -e "Root Files:      ${GREEN}$ROOT_FILES ✓${NC}"
    else
        echo -e "Root Files:      ${RED}$ROOT_FILES ✗${NC}"
    fi
    echo

    # Recent Activity
    echo -e "${BOLD}${BLUE}RECENT ACTIVITY${NC}"
    echo -e "${BLUE}─────────────────────────────────────────${NC}"

    # Show recent file modifications
    RECENT_FILES=$(find "$BASE_DIR" -type f -mmin -60 -name "*.js" -o -name "*.csv" 2>/dev/null | head -3)
    if [ -n "$RECENT_FILES" ]; then
        echo "Modified in last hour:"
        echo "$RECENT_FILES" | while read file; do
            basename_file=$(basename "$file")
            dir_file=$(dirname "$file" | sed "s|$BASE_DIR/||")
            echo -e "  ${PURPLE}•${NC} $dir_file/$basename_file"
        done
    else
        echo "No recent file activity"
    fi
    echo

    # Quick Actions
    echo -e "${BOLD}${BLUE}QUICK ACTIONS${NC}"
    echo -e "${BLUE}─────────────────────────────────────────${NC}"
    echo -e "  ${YELLOW}[C]${NC} Check violations    ${YELLOW}[F]${NC} Fix violations"
    echo -e "  ${YELLOW}[P]${NC} Create project      ${YELLOW}[R]${NC} Generate report"
    echo -e "  ${YELLOW}[Q]${NC} Quit dashboard"
    echo

    # Violations Preview (if any)
    if [ "$TOTAL_VIOLATIONS" -gt 0 ]; then
        echo -e "${BOLD}${RED}TOP VIOLATIONS${NC}"
        echo -e "${RED}─────────────────────────────────────────${NC}"
        echo "$CHECK_OUTPUT" | grep -E "File:|Issue:" | head -3
        echo
    fi

    # Status bar
    echo -e "${CYAN}────────────────────────────────────────────────────────────${NC}"
    echo -e "Auto-refresh in $REFRESH_INTERVAL seconds | Press any key for menu"

    # Check for user input with timeout
    read -t $REFRESH_INTERVAL -n 1 key

    if [ -n "$key" ]; then
        case $key in
            c|C)
                echo
                echo -e "${YELLOW}Running full compliance check...${NC}"
                node "$ORG_ENFORCER" check
                echo
                echo "Press any key to continue..."
                read -n 1
                ;;
            f|F)
                echo
                echo -e "${YELLOW}Generating fix script...${NC}"
                node "$ORG_ENFORCER" fix
                echo
                echo "Press any key to continue..."
                read -n 1
                ;;
            p|P)
                echo
                echo -e "${YELLOW}Create new project:${NC}"
                read -p "Project name: " proj_name
                read -p "Org alias: " org_alias
                read -p "Type (data-cleanup/deployment/analysis): " proj_type
                "$BASE_DIR/scripts/init-project.sh" "$proj_name" "$org_alias" --type "$proj_type"
                echo
                echo "Press any key to continue..."
                read -n 1
                ;;
            r|R)
                echo
                echo -e "${YELLOW}Generating compliance report...${NC}"
                "$BASE_DIR/scripts/daily-organization-check.sh"
                echo
                echo "Press any key to continue..."
                read -n 1
                ;;
            q|Q)
                echo
                echo -e "${GREEN}Exiting dashboard...${NC}"
                exit 0
                ;;
        esac
    fi
done