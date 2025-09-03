#!/bin/bash

# Version Bump Script for RevPal Agents
# Automatically bumps version based on commit types

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Get current version from package.json
get_current_version() {
    grep '"version"' package.json | cut -d'"' -f4
}

# Determine bump type based on recent commits
determine_bump_type() {
    local last_tag=$(git describe --tags --abbrev=0 2>/dev/null || echo "")
    local bump_type="patch"
    
    if [ -z "$last_tag" ]; then
        echo "minor"
        return
    fi
    
    # Check commits since last tag
    local commits=$(git log $last_tag..HEAD --oneline)
    
    # Check for breaking changes (major)
    if echo "$commits" | grep -qE "BREAKING CHANGE:|feat!:|fix!:"; then
        bump_type="major"
    # Check for new features (minor)
    elif echo "$commits" | grep -q "feat:"; then
        bump_type="minor"
    # Default to patch for fixes and other changes
    else
        bump_type="patch"
    fi
    
    echo "$bump_type"
}

# Bump version number
bump_version() {
    local current_version=$1
    local bump_type=$2
    
    IFS='.' read -ra VERSION_PARTS <<< "$current_version"
    local major=${VERSION_PARTS[0]}
    local minor=${VERSION_PARTS[1]}
    local patch=${VERSION_PARTS[2]}
    
    case $bump_type in
        major)
            major=$((major + 1))
            minor=0
            patch=0
            ;;
        minor)
            minor=$((minor + 1))
            patch=0
            ;;
        patch)
            patch=$((patch + 1))
            ;;
    esac
    
    echo "$major.$minor.$patch"
}

# Update version in file
update_file_version() {
    local file=$1
    local old_version=$2
    local new_version=$3
    
    if [ -f "$file" ]; then
        sed -i "s/$old_version/$new_version/g" "$file"
        echo -e "${GREEN}✓${NC} Updated $file"
    fi
}

# Main execution
main() {
    echo "🚀 RevPal Agents Version Bump Script"
    echo "=================================="
    
    # Check if in git repository
    if ! git rev-parse --git-dir > /dev/null 2>&1; then
        echo -e "${RED}Error: Not in a git repository${NC}"
        exit 1
    fi
    
    # Get current version
    current_version=$(get_current_version)
    echo -e "Current version: ${YELLOW}$current_version${NC}"
    
    # Determine bump type or use provided argument
    if [ -n "$1" ] && [[ "$1" =~ ^(major|minor|patch)$ ]]; then
        bump_type=$1
        echo "Using specified bump type: $bump_type"
    else
        bump_type=$(determine_bump_type)
        echo "Auto-detected bump type: $bump_type"
    fi
    
    # Calculate new version
    new_version=$(bump_version "$current_version" "$bump_type")
    echo -e "New version: ${GREEN}$new_version${NC}"
    
    # Confirmation
    read -p "Proceed with version bump to $new_version? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Version bump cancelled"
        exit 0
    fi
    
    echo ""
    echo "Updating version references..."
    
    # Update package.json
    npm version $new_version --no-git-tag-version
    
    # Update README.md badge
    if [ -f "README.md" ]; then
        sed -i "s/version-$current_version-blue/version-$new_version-blue/g" README.md
        sed -i "s/Current Release: v$current_version/Current Release: v$new_version/g" README.md
        echo -e "${GREEN}✓${NC} Updated README.md"
    fi
    
    # Update other files that might contain version
    update_file_version "docs/CHANGELOG.md" "$current_version" "$new_version"
    update_file_version ".env.example" "$current_version" "$new_version"
    
    echo ""
    echo "Creating version commit..."
    
    # Stage changes
    git add -A
    
    # Create commit
    git commit -m "chore: bump version to $new_version

- Updated package.json version
- Updated README.md badges and references
- Prepared for v$new_version release

🤖 Generated with RevPal Agents Git Tools"
    
    echo -e "${GREEN}✓${NC} Created version commit"
    
    # Create tag
    echo "Creating git tag..."
    git tag -a "v$new_version" -m "Release v$new_version

Version bump from v$current_version to v$new_version
Bump type: $bump_type"
    
    echo -e "${GREEN}✓${NC} Created tag v$new_version"
    
    echo ""
    echo -e "${GREEN}Success!${NC} Version bumped to $new_version"
    echo ""
    echo "Next steps:"
    echo "1. Push changes: git push origin main"
    echo "2. Push tag: git push origin v$new_version"
    echo "3. Create release: gh release create v$new_version"
}

# Run main function
main "$@"