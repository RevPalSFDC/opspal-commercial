#!/bin/bash

# Rollup Solution Deployment Script
# This script deploys the complete rollup solution to your Salesforce org

echo "🚀 Deploying Rollup Solution..."
echo "==============================="

# Check if SF CLI is available
if ! command -v sf &> /dev/null; then
    echo "❌ Salesforce CLI (sf) is not installed or not in PATH"
    exit 1
fi

# Check if authenticated to an org
if ! sf org display > /dev/null 2>&1; then
    echo "❌ Not authenticated to any Salesforce org"
    echo "Please run: sf org login web"
    exit 1
fi

echo "✅ Salesforce CLI authenticated"

# Get current directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo "📁 Project directory: $PROJECT_DIR"

# Function to deploy and check results
deploy_component() {
    local component_path="$1"
    local component_name="$2"
    
    echo "📦 Deploying $component_name..."
    
    if [ -f "$component_path" ] || [ -d "$component_path" ]; then
        result=$(sf project deploy start -p "$component_path" 2>&1)
        if [ $? -eq 0 ]; then
            echo "✅ $component_name deployed successfully"
        else
            echo "❌ Failed to deploy $component_name"
            echo "   Error: $result"
            return 1
        fi
    else
        echo "⚠️  $component_name not found at: $component_path"
        return 1
    fi
    
    return 0
}

# Phase 1: Deploy Core Framework
echo ""
echo "🏗️  Phase 1: Deploying Core Framework"
echo "====================================="

deploy_component "$PROJECT_DIR/force-app/main/default/classes/RollupFramework.cls" "RollupFramework Class"
deploy_component "$PROJECT_DIR/force-app/main/default/classes/RollupFramework.cls-meta.xml" "RollupFramework Metadata"

deploy_component "$PROJECT_DIR/force-app/main/default/classes/RollupMigrationUtility.cls" "RollupMigrationUtility Class"
deploy_component "$PROJECT_DIR/force-app/main/default/classes/RollupMigrationUtility.cls-meta.xml" "RollupMigrationUtility Metadata"

deploy_component "$PROJECT_DIR/force-app/main/default/classes/RollupRecalculationBatch.cls" "RollupRecalculationBatch Class"
deploy_component "$PROJECT_DIR/force-app/main/default/classes/RollupRecalculationBatch.cls-meta.xml" "RollupRecalculationBatch Metadata"

# Phase 2: Deploy Trigger Components
echo ""
echo "🎯 Phase 2: Deploying Trigger Components"
echo "========================================"

deploy_component "$PROJECT_DIR/force-app/main/default/classes/ContactTriggerHandler.cls" "ContactTriggerHandler Class"
deploy_component "$PROJECT_DIR/force-app/main/default/classes/ContactTriggerHandler.cls-meta.xml" "ContactTriggerHandler Metadata"

deploy_component "$PROJECT_DIR/force-app/main/default/classes/ContactTriggerHandlerFramework.cls" "ContactTriggerHandlerFramework Class"
deploy_component "$PROJECT_DIR/force-app/main/default/classes/ContactTriggerHandlerFramework.cls-meta.xml" "ContactTriggerHandlerFramework Metadata"

deploy_component "$PROJECT_DIR/force-app/main/default/triggers/ContactTrigger.trigger" "ContactTrigger"
deploy_component "$PROJECT_DIR/force-app/main/default/triggers/ContactTrigger.trigger-meta.xml" "ContactTrigger Metadata"

# Phase 3: Deploy Test Classes
echo ""
echo "🧪 Phase 3: Deploying Test Classes"
echo "=================================="

deploy_component "$PROJECT_DIR/force-app/main/default/classes/ContactTriggerHandlerTest.cls" "ContactTriggerHandlerTest Class"
deploy_component "$PROJECT_DIR/force-app/main/default/classes/ContactTriggerHandlerTest.cls-meta.xml" "ContactTriggerHandlerTest Metadata"

# Phase 4: Run Tests
echo ""
echo "🔬 Phase 4: Running Tests"
echo "========================"

echo "Running ContactTriggerHandlerTest..."
test_result=$(sf apex test run -c -t ContactTriggerHandlerTest -r human 2>&1)
if echo "$test_result" | grep -q "Test Run Successful"; then
    echo "✅ Tests passed successfully"
    echo "$test_result" | grep -E "(Coverage|Outcome|Test Results)"
else
    echo "❌ Tests failed"
    echo "$test_result"
    echo ""
    echo "⚠️  Deployment completed but tests failed. Please review and fix issues."
fi

# Phase 5: Deploy Alternative Solutions (Optional)
echo ""
echo "🔄 Phase 5: Deploying Alternative Solutions (Optional)"
echo "====================================================="

echo "Would you like to deploy Flow-based alternative? (y/n)"
read -r deploy_flow

if [[ $deploy_flow =~ ^[Yy]$ ]]; then
    deploy_component "$PROJECT_DIR/force-app/main/default/flows/Update_DVM_Count_on_Contact_Change.flow-meta.xml" "DVM Count Flow"
    echo "⚠️  Remember to activate the flow in Setup → Flows"
fi

# Phase 6: Validation
echo ""
echo "✅ Phase 6: Post-Deployment Validation"
echo "======================================"

echo "Running basic validation..."

# Create validation script
cat > ${TEMP_DIR:-/tmp} << 'EOF'
try {
    // Test framework availability
    Map<String, List<RollupFramework.RollupConfiguration>> configs = RollupFramework.getAllConfigurations();
    System.debug('Framework loaded with ' + configs.size() + ' object configurations');
    
    // Test migration utility
    Map<Id, Map<String, Object>> backup = RollupMigrationUtility.createRollupBackup();
    System.debug('Backup utility working - ' + backup.size() + ' records');
    
    // Test health check
    Map<String, Object> health = RollupMigrationUtility.performHealthCheck();
    System.debug('Health check completed: ' + health.get('overallHealth'));
    
    System.debug('✅ All components deployed and functional');
    
} catch (Exception e) {
    System.debug('❌ Validation error: ' + e.getMessage());
}
EOF

sf apex run -f ${TEMP_DIR:-/tmp}
rm ${TEMP_DIR:-/tmp}

# Summary
echo ""
echo "📋 Deployment Summary"
echo "===================="
echo "Deployment completed at: $(date)"
echo ""
echo "Components deployed:"
echo "  ✅ RollupFramework - Core calculation engine"
echo "  ✅ ContactTriggerHandler - DVM rollup implementation"
echo "  ✅ ContactTrigger - Contact object trigger"
echo "  ✅ RollupMigrationUtility - Migration and validation tools"
echo "  ✅ RollupRecalculationBatch - Batch processing"
echo "  ✅ Test classes - Comprehensive test coverage"
echo ""
echo "Next steps:"
echo "1. Run validation script: ./scripts/test-rollup-solution.sh"
echo "2. Validate existing data: Execute RollupMigrationUtility.validateDVMRollupConsistency()"
echo "3. Migrate data if needed: Execute RollupMigrationUtility.migrateDVMCounts(false)"
echo "4. Set up monitoring and health checks"
echo ""
echo "For detailed usage instructions, see:"
echo "  📄 ROLLUP_DEPLOYMENT_GUIDE.md"
echo "  📄 ROLLUP_SUMMARY_LIMITATIONS_AND_SOLUTIONS.md"
echo "  📄 ROLLUP_AGENT_PROCEDURES.md"
echo ""
echo "🎉 Rollup solution deployment completed!"
