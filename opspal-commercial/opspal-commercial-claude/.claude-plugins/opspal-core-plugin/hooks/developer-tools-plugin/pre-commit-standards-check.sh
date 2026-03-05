#!/bin/bash
# Pre-commit hook: Validates plugin standards before allowing commit
# Install: ln -sf $(pwd)/.claude-plugins/developer-tools-plugin/hooks/pre-commit-standards-check.sh .git/hooks/pre-commit

set -e

# Get repo root using git (works regardless of symlink location)
REPO_ROOT="$(git rev-parse --show-toplevel)"

echo "=== Plugin Standards Pre-Commit Check ==="

# Check if any command files are being committed
STAGED_COMMANDS=$(git diff --cached --name-only | grep -E '\.claude-plugins/.*/commands/.*\.md$' || true)

if [ -n "$STAGED_COMMANDS" ]; then
    echo "Checking command frontmatter..."

    # Run validator
    RESULT=$(node "$REPO_ROOT/.claude-plugins/developer-tools-plugin/scripts/lib/command-frontmatter-validator.js" --json 2>/dev/null)
    INVALID=$(echo "$RESULT" | jq -r '.invalid // 0')

    if [ "$INVALID" -gt 0 ]; then
        echo ""
        echo "ERROR: $INVALID command(s) missing required frontmatter!"
        echo ""
        echo "All commands MUST have YAML frontmatter with 'description' field:"
        echo ""
        echo "  ---"
        echo "  description: What this command does"
        echo "  argument-hint: \"[--flag <value>]\""
        echo "  ---"
        echo ""
        echo "Run for details:"
        echo "  node .claude-plugins/developer-tools-plugin/scripts/lib/command-frontmatter-validator.js"
        echo ""
        echo "See: docs/PLUGIN_DEVELOPMENT_STANDARDS.md"
        exit 1
    fi

    echo "All command frontmatter valid."
fi

# Check hook executability
STAGED_HOOKS=$(git diff --cached --name-only | grep -E '\.claude-plugins/.*/hooks/.*\.sh$' || true)

if [ -n "$STAGED_HOOKS" ]; then
    echo "Checking hook executability..."

    for hook in $STAGED_HOOKS; do
        if [ -f "$REPO_ROOT/$hook" ] && [ ! -x "$REPO_ROOT/$hook" ]; then
            echo ""
            echo "ERROR: Hook is not executable: $hook"
            echo "Run: chmod +x $hook"
            exit 1
        fi

        # Validate bash syntax
        if ! bash -n "$REPO_ROOT/$hook" 2>/dev/null; then
            echo ""
            echo "ERROR: Hook has syntax errors: $hook"
            echo "Run: bash -n $hook"
            exit 1
        fi
    done

    echo "All hooks valid."
fi

echo "Standards check passed."
exit 0
