#!/bin/bash
##############################################################################
# PDF Generation Setup Script
#
# Quick setup for the PDF generation system
# Run: bash setup-pdf-generation.sh
##############################################################################

set -e

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  PDF Generation System - Quick Setup"
echo "  Version: 1.4.0"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

cd "$(dirname "$0")"

echo "📍 Working directory: $(pwd)"
echo ""

PLUGIN_DIR=".claude-plugins/opspal-core"

if [ ! -d "$PLUGIN_DIR" ]; then
    echo "❌ OpsPal Core plugin not found at: $PLUGIN_DIR"
    exit 1
fi

# Phase 1: Dependencies
echo "━━━ Checking Dependencies ━━━"
echo ""

if npm --prefix "$PLUGIN_DIR" list md-to-pdf > /dev/null 2>&1; then
    echo "✅ md-to-pdf installed"
else
    echo "❌ md-to-pdf NOT installed"
    exit 1
fi

if npm --prefix "$PLUGIN_DIR" list pdf-lib > /dev/null 2>&1; then
    echo "✅ pdf-lib installed"
else
    echo "❌ pdf-lib NOT installed"
    exit 1
fi

echo ""

# Phase 2: Quick Test
echo "━━━ Running Quick Test ━━━"
echo ""

mkdir -p test/output

cat > test/output/quick-test.md << 'EOF'
# Quick Test

This is a quick validation test.

## Section 1
Content here.
EOF

echo "Generating test PDF..."
if node "$PLUGIN_DIR/scripts/lib/pdf-generator.js" test/output/quick-test.md test/output/quick-test.pdf 2>&1 | grep -q "PDF generated"; then
    echo "✅ Test PDF generated!"
    ls -lh test/output/quick-test.pdf
else
    echo "❌ PDF generation failed"
    exit 1
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ✅ Setup Complete!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📚 Next Steps:"
echo "  1. Review .claude-plugins/opspal-core/docs/PDF_GENERATION_INTEGRATION.md for full integration"
echo "  2. Run: node .claude-plugins/opspal-core/test/pdf-generator.test.js"
echo "  3. Test: node .claude-plugins/opspal-core/scripts/lib/pdf-generator.js input.md output.pdf"
echo ""
echo "📖 Documentation: .claude-plugins/opspal-core/docs/PDF_GENERATION_GUIDE.md"
echo ""
