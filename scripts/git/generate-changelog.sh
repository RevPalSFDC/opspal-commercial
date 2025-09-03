#!/bin/bash

# Changelog Generator for RevPal Agents
# Generates changelog from git commit history

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Get all tags sorted by version
get_tags() {
    git tag -l --sort=-version:refname
}

# Get commits between two refs
get_commits() {
    local from=$1
    local to=$2
    
    if [ -z "$from" ]; then
        git log $to --pretty=format:"%h|%s|%an|%ad" --date=short
    else
        git log $from..$to --pretty=format:"%h|%s|%an|%ad" --date=short
    fi
}

# Parse commit message for type
get_commit_type() {
    local message=$1
    
    if [[ $message =~ ^feat(\(.*\))?: ]]; then
        echo "Features"
    elif [[ $message =~ ^fix(\(.*\))?: ]]; then
        echo "Bug Fixes"
    elif [[ $message =~ ^docs(\(.*\))?: ]]; then
        echo "Documentation"
    elif [[ $message =~ ^style(\(.*\))?: ]]; then
        echo "Styles"
    elif [[ $message =~ ^refactor(\(.*\))?: ]]; then
        echo "Code Refactoring"
    elif [[ $message =~ ^perf(\(.*\))?: ]]; then
        echo "Performance Improvements"
    elif [[ $message =~ ^test(\(.*\))?: ]]; then
        echo "Tests"
    elif [[ $message =~ ^chore(\(.*\))?: ]]; then
        echo "Chores"
    elif [[ $message =~ ^ci(\(.*\))?: ]]; then
        echo "CI/CD"
    else
        echo "Other Changes"
    fi
}

# Format commit message
format_commit() {
    local hash=$1
    local message=$2
    local author=$3
    
    # Remove type prefix from message
    message=$(echo "$message" | sed -E 's/^[a-z]+(\(.*\))?: //')
    
    # Capitalize first letter
    message="$(echo "${message:0:1}" | tr '[:lower:]' '[:upper:]')${message:1}"
    
    echo "- $message ([${hash}](https://github.com/RevPal/Agents/commit/${hash}))"
}

# Generate changelog for a version
generate_version_changelog() {
    local version=$1
    local from_ref=$2
    local to_ref=$3
    local date=$4
    
    echo "## [$version] - $date"
    echo ""
    
    # Group commits by type
    declare -A commit_groups
    
    while IFS='|' read -r hash message author date; do
        local type=$(get_commit_type "$message")
        local formatted=$(format_commit "$hash" "$message" "$author")
        
        if [ -z "${commit_groups[$type]}" ]; then
            commit_groups[$type]="$formatted"
        else
            commit_groups[$type]="${commit_groups[$type]}"$'\n'"$formatted"
        fi
    done < <(get_commits "$from_ref" "$to_ref")
    
    # Output grouped commits
    for type in "Features" "Bug Fixes" "Performance Improvements" "Documentation" "Code Refactoring" "Tests" "CI/CD" "Chores" "Styles" "Other Changes"; do
        if [ -n "${commit_groups[$type]}" ]; then
            echo "### $type"
            echo ""
            echo "${commit_groups[$type]}"
            echo ""
        fi
    done
}

# Generate full changelog
generate_full_changelog() {
    local output_file=${1:-CHANGELOG.md}
    
    echo "# Changelog"
    echo ""
    echo "All notable changes to RevPal Agents will be documented in this file."
    echo ""
    echo "The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),"
    echo "and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html)."
    echo ""
    
    # Get all tags
    local tags=($(get_tags))
    
    # Generate changelog for each version
    for i in "${!tags[@]}"; do
        local current_tag=${tags[$i]}
        local previous_tag=${tags[$((i+1))]-}
        local tag_date=$(git log -1 --format=%ad --date=short $current_tag)
        
        generate_version_changelog "${current_tag#v}" "$previous_tag" "$current_tag" "$tag_date"
    done
    
    # Add unreleased section if there are commits after last tag
    if [ ${#tags[@]} -gt 0 ]; then
        local latest_tag=${tags[0]}
        local unreleased_commits=$(git log $latest_tag..HEAD --oneline 2>/dev/null)
        
        if [ -n "$unreleased_commits" ]; then
            echo "## [Unreleased]"
            echo ""
            generate_version_changelog "Unreleased" "$latest_tag" "HEAD" "$(date +%Y-%m-%d)" | tail -n +3
        fi
    fi
}

# Main execution
main() {
    echo "📝 RevPal Agents Changelog Generator"
    echo "=================================="
    
    # Check if in git repository
    if ! git rev-parse --git-dir > /dev/null 2>&1; then
        echo -e "${RED}Error: Not in a git repository${NC}"
        exit 1
    fi
    
    local output_file="CHANGELOG.md"
    local mode="full"
    
    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --output|-o)
                output_file="$2"
                shift 2
                ;;
            --version|-v)
                mode="version"
                version="$2"
                shift 2
                ;;
            --help|-h)
                echo "Usage: $0 [options]"
                echo ""
                echo "Options:"
                echo "  -o, --output FILE    Output file (default: CHANGELOG.md)"
                echo "  -v, --version VER    Generate for specific version only"
                echo "  -h, --help          Show this help message"
                exit 0
                ;;
            *)
                echo -e "${RED}Unknown option: $1${NC}"
                exit 1
                ;;
        esac
    done
    
    echo -e "Output file: ${YELLOW}$output_file${NC}"
    echo ""
    
    if [ "$mode" = "full" ]; then
        echo "Generating full changelog..."
        generate_full_changelog > "$output_file"
    else
        echo "Generating changelog for version $version..."
        # Find the version tag and previous tag
        local tags=($(get_tags))
        local found=false
        local from_ref=""
        
        for i in "${!tags[@]}"; do
            if [ "${tags[$i]}" = "v$version" ] || [ "${tags[$i]}" = "$version" ]; then
                found=true
                from_ref=${tags[$((i+1))]-}
                local tag_date=$(git log -1 --format=%ad --date=short ${tags[$i]})
                generate_version_changelog "$version" "$from_ref" "${tags[$i]}" "$tag_date" > "$output_file"
                break
            fi
        done
        
        if [ "$found" = false ]; then
            echo -e "${RED}Error: Version $version not found${NC}"
            exit 1
        fi
    fi
    
    echo -e "${GREEN}✓${NC} Changelog generated successfully!"
    echo ""
    echo "Preview:"
    echo "--------"
    head -n 20 "$output_file"
    echo "..."
    echo ""
    echo -e "${BLUE}Full changelog written to: $output_file${NC}"
}

# Run main function
main "$@"