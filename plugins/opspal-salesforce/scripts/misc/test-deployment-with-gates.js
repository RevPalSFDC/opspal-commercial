#!/usr/bin/env node

/**
 * Test Deployment with Gates
 * ===========================
 * Test wrapper for validating gate system with actual Salesforce orgs
 */

const DeploymentBridge = require('./agents/execution/deployment-bridge');
const path = require('path');

// Color output for better visibility
const colors = {
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    reset: '\x1b[0m'
};

async function testDeployment() {
    const args = process.argv.slice(2);
    const targetOrg = args[0] || process.env.SALESFORCE_ORG_ALIAS || 'sandbox';
    const sourcePath = args[1] || './force-app';
    const dryRun = args.includes('--execute') ? false : true;
    const withFallback = args.includes('--fallback');
    
    console.log(`${colors.blue}========================================${colors.reset}`);
    console.log(`${colors.blue}  Gate Validation Test${colors.reset}`);
    console.log(`${colors.blue}========================================${colors.reset}\n`);
    
    console.log(`Target Org: ${colors.yellow}${targetOrg}${colors.reset}`);
    console.log(`Source Path: ${colors.yellow}${sourcePath}${colors.reset}`);
    console.log(`Mode: ${dryRun ? colors.green + 'DRY RUN' : colors.red + 'EXECUTE'}${colors.reset}`);
    console.log(`Fallback: ${withFallback ? 'Enabled' : 'Disabled'}\n`);
    
    const bridge = new DeploymentBridge();
    
    try {
        console.log('Initializing deployment bridge...');
        await bridge.initialize();
        console.log(`✅ Bridge initialized with ${Object.keys(bridge.policies).length} policies\n`);
        
        // Prepare deployment context
        const deployment = {
            targetOrg,
            sourcePath,
            dryRun,
            operator: 'manual-test',
            sessionId: `test-${Date.now()}`
        };
        
        // Add fallback justification if MCP is down
        if (withFallback) {
            deployment.fallbackJustification = {
                reason: 'MCP_SERVER_DOWN',
                mcp_status: {
                    state: 'down',
                    last_check: new Date().toISOString(),
                    error_message: 'Test mode - MCP not available'
                },
                attempted_recovery: {
                    attempts: 1,
                    actions: [{
                        action: 'check_connectivity',
                        result: 'failed',
                        timestamp: new Date().toISOString()
                    }]
                },
                operator: {
                    agent_name: 'test-wrapper',
                    user_context: process.env.USER || 'unknown'
                },
                timestamp: new Date().toISOString(),
                operation_details: {
                    type: 'deployment',
                    target: {
                        org: targetOrg,
                        environment: targetOrg.includes('prod') ? 'production' : 'sandbox'
                    },
                    scope: {
                        components: ['metadata']
                    }
                },
                incident_reference: 'TEST-MODE'
            };
            console.log('📝 Added fallback justification for MCP unavailability\n');
        }
        
        // If production, might need emergency override
        if (targetOrg.includes('prod')) {
            if (args.includes('--emergency')) {
                deployment.emergencyOverride = true;
                console.log('🚨 Emergency override enabled\n');
            }
            if (args.includes('--approved')) {
                deployment.approvalReceived = true;
                deployment.approvalId = 'TEST-APPROVAL';
                console.log('✅ Pre-approval flag set\n');
            }
        }
        
        console.log(`${colors.blue}Running deployment through gates...${colors.reset}\n`);
        
        // Test just the gates first
        console.log('Step 1: Pre-deployment Gate Validation');
        console.log('----------------------------------------');
        
        const gateContext = { ...deployment };
        
        try {
            const gateResults = await bridge.preDeployGate(gateContext);
            
            console.log(`\n${colors.green}✅ All gates passed!${colors.reset}\n`);
            console.log('Gate checks performed:');
            for (const check of gateResults.checks) {
                const status = check.passed ? '✅' : '⚠️';
                console.log(`  ${status} ${check.name}: ${check.message || check.status}`);
            }
            
            if (gateResults.warnings && gateResults.warnings.length > 0) {
                console.log(`\n${colors.yellow}Warnings:${colors.reset}`);
                gateResults.warnings.forEach(w => console.log(`  ⚠️ ${w}`));
            }
            
        } catch (error) {
            if (error.gateResults) {
                console.log(`\n${colors.red}❌ Gate validation failed${colors.reset}\n`);
                console.log('Gate checks:');
                for (const check of error.gateResults.checks) {
                    const status = check.passed === false ? '❌' : check.passed ? '✅' : '⚠️';
                    console.log(`  ${status} ${check.name}: ${check.message || check.status || 'Unknown'}`);
                }
                
                if (error.gateResults.blockers && error.gateResults.blockers.length > 0) {
                    console.log(`\n${colors.red}Blockers:${colors.reset}`);
                    error.gateResults.blockers.forEach(b => console.log(`  ❌ ${b}`));
                }
                
                console.log('\nTo resolve:');
                if (error.gateResults.blockers.some(b => b.includes('MCP'))) {
                    console.log('  - Add --fallback flag to provide MCP fallback justification');
                }
                if (error.gateResults.blockers.some(b => b.includes('Approval'))) {
                    console.log('  - Add --approved flag to simulate approval');
                }
                if (error.gateResults.blockers.some(b => b.includes('maintenance window'))) {
                    console.log('  - Add --emergency flag for emergency override');
                }
                
                process.exit(1);
            }
            throw error;
        }
        
        // If gates passed and not dry run, attempt deployment
        if (!dryRun) {
            console.log(`\n${colors.yellow}Step 2: Executing Deployment${colors.reset}`);
            console.log('----------------------------------------');
            
            const result = await bridge.deploy(deployment);
            
            console.log(`\n${colors.green}✅ Deployment completed successfully!${colors.reset}`);
            console.log('\nDeployment details:');
            console.log(`  ID: ${result.id}`);
            console.log(`  Status: ${result.status}`);
            console.log(`  Rollback Plan: ${result.rollbackPlan?.id || 'None'}`);
            
            if (result.result) {
                console.log(`  Components Deployed: ${result.result.numberComponentsDeployed || 0}`);
            }
        } else {
            console.log(`\n${colors.green}✅ Dry run completed - deployment would proceed${colors.reset}`);
        }
        
        // Show rollback plan if created
        if (gateContext.environment) {
            console.log(`\nEnvironment detected: ${colors.yellow}${gateContext.environment}${colors.reset}`);
        }
        
        console.log('\nNext steps:');
        if (dryRun) {
            console.log('  - Add --execute flag to perform actual deployment');
        }
        console.log('  - Review gate decision logs in: deployment-logs/');
        console.log('  - Check policies in: config/policies/');
        
    } catch (error) {
        console.error(`\n${colors.red}❌ Error: ${error.message}${colors.reset}`);
        if (error.stack && process.env.DEBUG) {
            console.error(error.stack);
        }
        process.exit(1);
    }
}

// Show help
if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log(`
Usage: node test-deployment-with-gates.js [TARGET_ORG] [SOURCE_PATH] [OPTIONS]

Arguments:
  TARGET_ORG    Target Salesforce org alias (default: sandbox)
  SOURCE_PATH   Path to source files (default: ./force-app)

Options:
  --execute     Perform actual deployment (default is dry-run)
  --fallback    Add fallback justification for MCP unavailability
  --approved    Simulate approval received (for production)
  --emergency   Enable emergency override (bypass maintenance windows)
  --help        Show this help message

Examples:
  # Test gates for sandbox (dry run)
  node test-deployment-with-gates.js sandbox

  # Test with MCP fallback
  node test-deployment-with-gates.js sandbox --fallback

  # Test production with approvals
  node test-deployment-with-gates.js production --approved --fallback

  # Execute actual deployment
  node test-deployment-with-gates.js sandbox --execute --fallback

Environment Variables:
  SALESFORCE_ORG_ALIAS   Default org if not specified
  DEBUG                  Show detailed error stacks
`);
    process.exit(0);
}

// Run the test
testDeployment().catch(error => {
    console.error(`\n${colors.red}Unexpected error: ${error.message}${colors.reset}`);
    process.exit(1);
});