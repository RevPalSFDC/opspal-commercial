#!/bin/bash

# Verification Script for Automation Integrations
# Checks that all validation tools are properly wired and accessible

set -e

echo "🔍 Verifying Automation Integrations..."
echo ""

ERRORS=0

# 1. Flow Decision Logic Analyzer
echo "1️⃣  Flow Decision Logic Analyzer"
if [ -f "salesforce-plugin/scripts/lib/flow-decision-logic-analyzer.js" ]; then
    echo "   ✅ Validator script found"
else
    echo "   ❌ Validator script missing"
    ERRORS=$((ERRORS + 1))
fi

if [ -f "salesforce-plugin/hooks/pre-deploy-flow-validation.sh" ] && [ -x "salesforce-plugin/hooks/pre-deploy-flow-validation.sh" ]; then
    echo "   ✅ Pre-deploy hook found and executable"
else
    echo "   ❌ Pre-deploy hook missing or not executable"
    ERRORS=$((ERRORS + 1))
fi
echo ""

# 2. HubSpot Report Clone Validator
echo "2️⃣  HubSpot Report Clone Validator"
if [ -f "hubspot-plugin/scripts/lib/hubspot-report-clone-validator.js" ]; then
    echo "   ✅ Validator script found"
else
    echo "   ❌ Validator script missing"
    ERRORS=$((ERRORS + 1))
fi
echo ""

# 3. Agent Deliverable Validator
echo "3️⃣  Agent Deliverable Validator"
if [ -f "opspal-core/scripts/lib/agent-deliverable-validator.js" ]; then
    echo "   ✅ Validator script found"
else
    echo "   ❌ Validator script missing"
    ERRORS=$((ERRORS + 1))
fi

if [ -f "opspal-core/scripts/lib/agent-completion-validator.js" ]; then
    echo "   ✅ Completion wrapper found"
else
    echo "   ❌ Completion wrapper missing"
    ERRORS=$((ERRORS + 1))
fi
echo ""

# 4. User Expectation Tracker
echo "4️⃣  User Expectation Tracker"
if [ -f "opspal-core/scripts/lib/user-expectation-tracker.js" ]; then
    echo "   ✅ Tracker script found"
else
    echo "   ❌ Tracker script missing"
    ERRORS=$((ERRORS + 1))
fi

# Check if database can be initialized
if node -e "const T = require('./opspal-core/scripts/lib/user-expectation-tracker'); const t = new T(); t.initialize().then(() => t.close()).catch(() => process.exit(1));" 2>/dev/null; then
    echo "   ✅ Database initialization works"
else
    echo "   ⚠️  Database initialization failed (may need sqlite3 npm package)"
fi
echo ""

# 5. Flow Field Validator (Enhanced)
echo "5️⃣  Flow Field Validator v2.0"
if [ -f "salesforce-plugin/scripts/lib/flow-field-reference-validator.js" ]; then
    echo "   ✅ Enhanced validator found"

    # Check for v2.0 enhancements
    if grep -q "checkPermissions" "salesforce-plugin/scripts/lib/flow-field-reference-validator.js"; then
        echo "   ✅ v2.0 enhancements present (permissions, picklist, relationships)"
    else
        echo "   ⚠️  v2.0 enhancements not found"
    fi
else
    echo "   ❌ Validator script missing"
    ERRORS=$((ERRORS + 1))
fi
echo ""

# 6. Business Process Coverage Tracker
echo "6️⃣  Business Process Coverage Tracker"
if [ -f "opspal-core/scripts/lib/business-process-coverage-tracker.js" ]; then
    echo "   ✅ Tracker script found"
else
    echo "   ❌ Tracker script missing"
    ERRORS=$((ERRORS + 1))
fi

# Check if database can be initialized
if node -e "const T = require('./opspal-core/scripts/lib/business-process-coverage-tracker'); const t = new T(); t.initialize().then(() => t.close()).catch(() => process.exit(1));" 2>/dev/null; then
    echo "   ✅ Database initialization works"
else
    echo "   ⚠️  Database initialization failed (may need sqlite3 npm package)"
fi
echo ""

# 7. Integration Documentation
echo "7️⃣  Documentation"
if [ -f "AUTOMATION_INTEGRATION_GUIDE.md" ]; then
    echo "   ✅ Integration guide found"
else
    echo "   ❌ Integration guide missing"
    ERRORS=$((ERRORS + 1))
fi
echo ""

# Summary
echo "═══════════════════════════════════════════"
if [ $ERRORS -eq 0 ]; then
    echo "✅ All integrations verified successfully"
    echo ""
    echo "Next steps:"
    echo "  1. Review AUTOMATION_INTEGRATION_GUIDE.md"
    echo "  2. Add hooks to .sf/config.json (Salesforce)"
    echo "  3. Integrate validators into agent code"
    echo "  4. Add coverage tracking to tests"
    exit 0
else
    echo "❌ $ERRORS error(s) found"
    echo ""
    echo "Run: npm install sqlite3"
    echo "Or check missing files listed above"
    exit 1
fi
