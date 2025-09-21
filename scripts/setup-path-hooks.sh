#!/bin/bash
# Setup script for path validation hooks

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
HOOKS_DIR="$PROJECT_ROOT/.githooks"
GIT_HOOKS_DIR="$PROJECT_ROOT/.git/hooks"

echo "🔧 Setting up path validation hooks..."

# Ensure directories exist
mkdir -p "$HOOKS_DIR"
mkdir -p "$GIT_HOOKS_DIR"

# Make hook executable
chmod +x "$HOOKS_DIR/pre-commit-path-check"

# Create the main pre-commit hook
cat > "$GIT_HOOKS_DIR/pre-commit" << 'EOF'
#!/bin/bash
# Git pre-commit hook that runs multiple checks

# Run path validation
if [ -f ".githooks/pre-commit-path-check" ]; then
    echo "Running path validation..."
    node .githooks/pre-commit-path-check
    if [ $? -ne 0 ]; then
        echo "❌ Path validation failed. Commit aborted."
        exit 1
    fi
fi

# Run other checks if they exist
if [ -f ".githooks/pre-commit-lint" ]; then
    .githooks/pre-commit-lint
fi

if [ -f ".githooks/pre-commit-test" ]; then
    .githooks/pre-commit-test
fi

exit 0
EOF

# Make git hook executable
chmod +x "$GIT_HOOKS_DIR/pre-commit"

# Create package.json scripts if not exists
if [ -f "$PROJECT_ROOT/package.json" ]; then
    echo "📦 Adding npm scripts..."

    # Check if scripts section exists
    if ! grep -q '"scripts"' "$PROJECT_ROOT/package.json"; then
        echo "⚠️  No scripts section found in package.json. Please add manually:"
        echo '  "scripts": {'
        echo '    "scan-paths": "node scripts/path-scanner.js",'
        echo '    "refactor-paths": "node scripts/refactor-paths.js",'
        echo '    "check-paths": "node .githooks/pre-commit-path-check",'
        echo '    "setup-hooks": "bash scripts/setup-path-hooks.sh"'
        echo '  }'
    else
        echo "✅ package.json scripts section exists. Add these scripts if missing:"
        echo '  "scan-paths": "node scripts/path-scanner.js",'
        echo '  "refactor-paths": "node scripts/refactor-paths.js",'
        echo '  "check-paths": "node .githooks/pre-commit-path-check",'
        echo '  "setup-hooks": "bash scripts/setup-path-hooks.sh"'
    fi
fi

# Install dotenv if needed
if [ -f "$PROJECT_ROOT/package.json" ] && ! grep -q '"dotenv"' "$PROJECT_ROOT/package.json"; then
    echo "📦 Installing dotenv package..."
    cd "$PROJECT_ROOT"
    npm install dotenv --save
fi

echo ""
echo "✅ Path validation hooks installed successfully!"
echo ""
echo "📋 Available commands:"
echo "  npm run scan-paths     - Scan for hard-coded paths"
echo "  npm run refactor-paths - Automatically refactor paths"
echo "  npm run check-paths    - Manually run path validation"
echo ""
echo "🔒 The pre-commit hook will now:"
echo "  1. Check for hard-coded absolute paths"
echo "  2. Block commits with forbidden paths"
echo "  3. Suggest fixes for violations"
echo ""
echo "💡 To bypass the hook (not recommended):"
echo "  git commit --no-verify"
echo ""
echo "📝 Next steps:"
echo "  1. Run: npm run scan-paths"
echo "  2. Review: reports/PATH_SCAN_REPORT.md"
echo "  3. Run: npm run refactor-paths (optional)"
echo "  4. Copy .env.template to .env and configure"