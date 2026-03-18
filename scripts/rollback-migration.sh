#!/bin/bash
# Rollback script for top-level directory separation migration
# Run this if the migration causes issues

set -e

echo "=== Rolling back top-level directory separation ==="

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "ERROR: Run this from the repository root"
    exit 1
fi

# Check if migration has been applied
if [ -L ".claude-plugins" ] && [ -d "plugins" ]; then
    echo "Migration detected. Rolling back..."

    # Remove symlink
    rm -f .claude-plugins

    # Recreate .claude-plugins directory
    mkdir -p .claude-plugins

    # Move plugins back
    if [ -d "plugins" ]; then
        echo "Moving plugins back to .claude-plugins/..."
        for plugin in plugins/*/; do
            if [ -d "$plugin" ]; then
                plugin_name=$(basename "$plugin")
                echo "  - $plugin_name"
                mv "$plugin" ".claude-plugins/"
            fi
        done

        # Move shared resources back
        for item in plugins/*; do
            if [ -e "$item" ] && [ ! -d "$item" ]; then
                echo "  - $(basename "$item")"
                mv "$item" ".claude-plugins/"
            fi
        done

        rmdir plugins 2>/dev/null || true
    fi

    # Move developer-tools-plugin back
    if [ -d "dev-tools/developer-tools-plugin" ]; then
        echo "Moving developer-tools-plugin back..."
        mv dev-tools/developer-tools-plugin .claude-plugins/
        rmdir dev-tools 2>/dev/null || true
    fi

    # Restore .gitignore from backup tag
    echo "Restoring .gitignore..."
    git checkout pre-migration-backup -- .gitignore 2>/dev/null || echo "Warning: Could not restore .gitignore from tag"

    echo ""
    echo "=== Rollback complete ==="
    echo "Review changes with: git status"
    echo "You may need to manually restore .mcp.json and other configs"

else
    echo "Migration not detected or already rolled back."
    echo ""
    echo "Current state:"
    echo "  .claude-plugins is symlink: $([ -L ".claude-plugins" ] && echo "yes" || echo "no")"
    echo "  plugins/ exists: $([ -d "plugins" ] && echo "yes" || echo "no")"
    echo "  .claude-plugins/ exists: $([ -d ".claude-plugins" ] && echo "yes" || echo "no")"
fi
