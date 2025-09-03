#!/bin/bash

# Git Repository Cleanup Script for RevPal Agents
# Performs maintenance tasks to keep repository clean and optimized

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Track what was cleaned
BRANCHES_DELETED=0
TAGS_DELETED=0
ORIGINAL_SIZE=""
FINAL_SIZE=""

# Get repository size
get_repo_size() {
    git count-objects -vH | grep "size-pack" | awk '{print $2}'
}

# Clean merged branches
clean_merged_branches() {
    echo "🌿 Cleaning merged branches..."
    
    # Get list of merged branches (excluding main and current branch)
    local current_branch=$(git branch --show-current)
    local merged_branches=$(git branch --merged main | grep -v "^\*" | grep -v "main" | grep -v "master" || true)
    
    if [ -n "$merged_branches" ]; then
        echo "Found merged branches to delete:"
        echo "$merged_branches"
        echo ""
        
        read -p "Delete these branches? (y/n) " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            while IFS= read -r branch; do
                branch=$(echo "$branch" | xargs)
                git branch -d "$branch"
                BRANCHES_DELETED=$((BRANCHES_DELETED + 1))
                echo -e "${GREEN}✓${NC} Deleted branch: $branch"
            done <<< "$merged_branches"
        fi
    else
        echo "No merged branches to clean"
    fi
    echo ""
}

# Clean remote tracking branches
clean_remote_branches() {
    echo "🔗 Cleaning remote tracking branches..."
    
    # Prune remote branches
    git remote prune origin
    echo -e "${GREEN}✓${NC} Pruned remote tracking branches"
    echo ""
}

# Clean old tags (optional)
clean_old_tags() {
    echo "🏷️  Checking for old tags..."
    
    # Get tags older than 6 months
    local old_tags=$(git for-each-ref --format='%(refname:short) %(committerdate:unix)' refs/tags | \
        awk -v cutoff=$(date -d '6 months ago' +%s) '$2 < cutoff {print $1}' || true)
    
    if [ -n "$old_tags" ]; then
        echo "Found old tags (>6 months):"
        echo "$old_tags"
        echo ""
        
        read -p "Delete these old tags? (y/n) " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            while IFS= read -r tag; do
                git tag -d "$tag"
                TAGS_DELETED=$((TAGS_DELETED + 1))
                echo -e "${GREEN}✓${NC} Deleted tag: $tag"
            done <<< "$old_tags"
        fi
    else
        echo "No old tags to clean"
    fi
    echo ""
}

# Run git garbage collection
run_gc() {
    echo "🗑️  Running garbage collection..."
    
    # Aggressive GC
    git gc --aggressive --prune=now
    echo -e "${GREEN}✓${NC} Garbage collection complete"
    
    # Repack
    git repack -Ad
    echo -e "${GREEN}✓${NC} Repository repacked"
    echo ""
}

# Check for large files
check_large_files() {
    echo "📦 Checking for large files..."
    
    # Find files larger than 10MB
    local large_files=$(git ls-tree -r -l HEAD | awk '$4 > 10485760 {print $5, $4/1048576 "MB"}' || true)
    
    if [ -n "$large_files" ]; then
        echo -e "${YELLOW}Warning: Found large files (>10MB):${NC}"
        echo "$large_files"
        echo ""
        echo "Consider using Git LFS for these files"
    else
        echo "No large files found"
    fi
    echo ""
}

# Clean build artifacts and temp files
clean_artifacts() {
    echo "🧹 Cleaning build artifacts..."
    
    # Clean node_modules if it exists and is not gitignored
    if [ -d "node_modules" ] && git check-ignore node_modules > /dev/null 2>&1; then
        echo "node_modules is properly gitignored"
    fi
    
    # Remove .DS_Store files (macOS)
    find . -name ".DS_Store" -type f -delete 2>/dev/null || true
    
    # Remove Thumbs.db files (Windows)
    find . -name "Thumbs.db" -type f -delete 2>/dev/null || true
    
    # Remove vim swap files
    find . -name "*.swp" -type f -delete 2>/dev/null || true
    find . -name "*.swo" -type f -delete 2>/dev/null || true
    
    # Remove backup files
    find . -name "*~" -type f -delete 2>/dev/null || true
    find . -name "*.bak" -type f -delete 2>/dev/null || true
    
    echo -e "${GREEN}✓${NC} Cleaned temporary files"
    echo ""
}

# Verify repository integrity
verify_integrity() {
    echo "🔍 Verifying repository integrity..."
    
    # Check for corruption
    if git fsck --full --strict 2>&1 | grep -q "error"; then
        echo -e "${RED}Warning: Repository integrity issues detected${NC}"
        git fsck --full --strict
    else
        echo -e "${GREEN}✓${NC} Repository integrity verified"
    fi
    echo ""
}

# Show statistics
show_stats() {
    echo "📊 Repository Statistics"
    echo "========================"
    
    # Size information
    echo -e "Original size: ${YELLOW}$ORIGINAL_SIZE${NC}"
    echo -e "Final size: ${GREEN}$FINAL_SIZE${NC}"
    
    # Cleanup summary
    echo ""
    echo "Cleanup Summary:"
    echo "- Branches deleted: $BRANCHES_DELETED"
    echo "- Tags deleted: $TAGS_DELETED"
    
    # Current state
    echo ""
    echo "Current State:"
    local branch_count=$(git branch -a | wc -l)
    local tag_count=$(git tag | wc -l)
    local commit_count=$(git rev-list --all --count)
    
    echo "- Total branches: $branch_count"
    echo "- Total tags: $tag_count"
    echo "- Total commits: $commit_count"
    
    # Object counts
    echo ""
    git count-objects -vH
}

# Main execution
main() {
    echo "🧹 Claude SFDC Git Repository Cleanup"
    echo "====================================="
    echo ""
    
    # Check if in git repository
    if ! git rev-parse --git-dir > /dev/null 2>&1; then
        echo -e "${RED}Error: Not in a git repository${NC}"
        exit 1
    fi
    
    # Store original size
    ORIGINAL_SIZE=$(get_repo_size)
    
    # Parse arguments
    local skip_tags=false
    local aggressive=false
    
    while [[ $# -gt 0 ]]; do
        case $1 in
            --skip-tags)
                skip_tags=true
                shift
                ;;
            --aggressive)
                aggressive=true
                shift
                ;;
            --help|-h)
                echo "Usage: $0 [options]"
                echo ""
                echo "Options:"
                echo "  --skip-tags     Skip old tag cleanup"
                echo "  --aggressive    Perform aggressive cleanup"
                echo "  -h, --help     Show this help message"
                exit 0
                ;;
            *)
                echo -e "${RED}Unknown option: $1${NC}"
                exit 1
                ;;
        esac
    done
    
    # Run cleanup tasks
    clean_merged_branches
    clean_remote_branches
    
    if [ "$skip_tags" = false ]; then
        clean_old_tags
    fi
    
    clean_artifacts
    check_large_files
    verify_integrity
    run_gc
    
    # Get final size
    FINAL_SIZE=$(get_repo_size)
    
    # Show statistics
    show_stats
    
    echo ""
    echo -e "${GREEN}✨ Repository cleanup complete!${NC}"
}

# Run main function
main "$@"