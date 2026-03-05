#!/bin/bash
# Pre-Commit Hook: Validate All Plugin Manifests
#
# Triggered before: Every git commit
# Purpose: Prevent commits with invalid plugin manifests
#
# Exit Codes:
#   0 - All validations passed, commit allowed
#   1 - Validation failed, commit blocked

set -e

# Find the validation script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VALIDATION_SCRIPT="$SCRIPT_DIR/../../scripts/lib/validate-all-plugins.sh"

# Check if validation script exists
if [ ! -f "$VALIDATION_SCRIPT" ]; then
  echo "⚠️  Warning: Plugin validation script not found"
  echo "   Expected: $VALIDATION_SCRIPT"
  echo "   Skipping validation..."
  exit 0
fi

# Run validation
echo "🔍 Validating all plugin manifests..."
echo ""

if bash "$VALIDATION_SCRIPT"; then
  exit 0
else
  echo ""
  echo "❌ Pre-commit validation failed!"
  echo ""
  echo "💡 To fix:"
  echo "   1. Run: $VALIDATION_SCRIPT --fix"
  echo "   2. Review and commit changes"
  echo ""
  echo "Or bypass (NOT RECOMMENDED):"
  echo "   git commit --no-verify"
  exit 1
fi
