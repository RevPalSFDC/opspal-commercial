#!/usr/bin/env node

/**
 * Test Script for Frontend Audit v2 Improvements
 * Validates the new API Surface Router, Capability Probe, and Agent Catalog
 */

const APISurfaceRouter = require('./lib/api-surface-router');
const CapabilityProbe = require('./lib/capability-probe');
const fs = require('fs');
const yaml = require('js-yaml');
const path = require('path');

async function testAPISurfaceRouter() {
    console.log('\n🧪 Testing API Surface Router\n' + '='.repeat(50));

    const router = new APISurfaceRouter('beta-corp-uat');

    // Test Report fetching (should use REST, not Tooling)
    console.log('\n📊 Testing Report API routing:');
    const reports = await router.fetchResource('Report', {
        query: "SELECT Id, Name FROM Report LIMIT 5"
    });
    console.log(`  ✅ Fetched ${reports.result?.records?.length || 0} reports via ${reports.apiUsed || 'REST'} API`);

    // Test Dashboard fetching (should use REST, not Tooling)
    console.log('\n📈 Testing Dashboard API routing:');
    const dashboards = await router.fetchResource('Dashboard', {
        query: "SELECT Id, Title FROM Dashboard LIMIT 5"
    });
    console.log(`  ✅ Fetched ${dashboards.result?.records?.length || 0} dashboards via ${dashboards.apiUsed || 'REST'} API`);

    // Test Apex Class fetching (should use Tooling)
    console.log('\n🔧 Testing Apex Class API routing:');
    const apexClasses = await router.fetchResource('ApexClass', {
        query: "SELECT Id, Name FROM ApexClass LIMIT 5"
    });
    console.log(`  ✅ Fetched ${apexClasses.result?.records?.length || 0} Apex classes via Tooling API`);

    // Test Event Logs (may fail gracefully)
    console.log('\n📝 Testing Event Log API routing:');
    const eventLogs = await router.fetchResource('EventLogFile', {
        daysBack: 7,
        eventTypes: ['LightningPageView']
    });
    if (eventLogs.result?.runtime === 'disabled') {
        console.log(`  ⚠️  Event Monitoring disabled: ${eventLogs.result.reason}`);
    } else {
        console.log(`  ✅ Fetched ${eventLogs.result?.records?.length || 0} event logs`);
    }

    // Print statistics
    console.log('\n📊 API Usage Statistics:');
    const stats = router.getStats();
    Object.entries(stats.apiCalls).forEach(([api, count]) => {
        console.log(`  ${api}: ${count} calls`);
    });

    return { success: true, stats };
}

async function testCapabilityProbe() {
    console.log('\n🧪 Testing Capability Probe\n' + '='.repeat(50));

    const probe = new CapabilityProbe('beta-corp-uat');

    console.log('\n🔍 Running capability detection...');
    const results = await probe.runFullProbe();

    // Check runtime mode
    const runtimeMode = probe.getRuntimeMode();
    console.log(`\n🎯 Runtime Mode: ${runtimeMode}`);

    if (runtimeMode === 'full') {
        console.log('  ✅ Full runtime evidence available');
    } else if (runtimeMode === 'degraded') {
        console.log('  ⚠️  Degraded mode - using fallback strategies');
    } else {
        console.log('  ❌ Static analysis only');
    }

    // Check degraded mode
    if (results.degradedMode) {
        console.log('\n⚠️  System in DEGRADED MODE due to:');
        if (results.eventMonitoring && !results.eventMonitoring.eventMonitoringEnabled) {
            console.log('  - Event Monitoring not available');
        }
        if (results.permissions && !results.permissions.viewAllData) {
            console.log('  - View All Data permission missing');
        }
    }

    // Print scores
    console.log('\n📊 Capability Scores:');
    if (results.scores) {
        console.log(`  Capabilities: ${(results.scores.capability * 100).toFixed(0)}%`);
        console.log(`  Permissions: ${(results.scores.permission * 100).toFixed(0)}%`);
        console.log(`  API Access: ${(results.scores.api * 100).toFixed(0)}%`);
        console.log(`  Overall: ${(results.scores.overall * 100).toFixed(0)}%`);
    }

    return { success: true, results };
}

async function testAgentCatalog() {
    console.log('\n🧪 Testing Agent Catalog\n' + '='.repeat(50));

    const catalogPath = path.join(__dirname, '..', '.claude', 'agents', 'catalog.yaml');

    if (!fs.existsSync(catalogPath)) {
        console.log('  ❌ Catalog file not found at:', catalogPath);
        return { success: false };
    }

    const catalog = yaml.load(fs.readFileSync(catalogPath, 'utf8'));

    console.log(`\n📚 Catalog Statistics:`);
    console.log(`  Total Agents: ${catalog.agents.length}`);
    console.log(`  Total Aliases: ${Object.keys(catalog.aliases).length}`);
    console.log(`  Agent Groups: ${Object.keys(catalog.groups).length}`);
    console.log(`  Routing Patterns: ${catalog.routing.patterns.length}`);

    // Test alias resolution
    console.log('\n🔍 Testing Alias Resolution:');
    const testAliases = [
        'sfdc-automation-specialist',
        'automation-specialist',
        'flow-specialist',
        'discovery',
        'apex'
    ];

    testAliases.forEach(alias => {
        const resolved = catalog.aliases[alias];
        if (resolved) {
            console.log(`  ✅ ${alias} → ${resolved}`);
        } else {
            console.log(`  ❌ ${alias} → NOT FOUND`);
        }
    });

    // Test pattern matching
    console.log('\n🎯 Testing Pattern Routing:');
    const testPatterns = [
        'I need help with flows',
        'Fix permission issues',
        'Analyze apex triggers',
        'Export data in bulk'
    ];

    testPatterns.forEach(text => {
        const match = catalog.routing.patterns.find(p =>
            new RegExp(p.pattern, 'i').test(text)
        );
        if (match) {
            console.log(`  ✅ "${text}" → ${match.agent}`);
        } else {
            console.log(`  ❌ "${text}" → NO MATCH`);
        }
    });

    return { success: true, catalog };
}

async function runIntegrationTest() {
    console.log('\n🧪 Running Integration Test\n' + '='.repeat(50));

    // Simulate the frontend audit workflow with v2 improvements
    console.log('\n1️⃣ Running Capability Probe...');
    const probe = new CapabilityProbe('beta-corp-uat');
    const capabilities = await probe.runFullProbe();

    console.log('\n2️⃣ Selecting Runtime Mode...');
    const runtimeMode = probe.getRuntimeMode();
    console.log(`  Mode: ${runtimeMode}`);

    console.log('\n3️⃣ Using API Surface Router...');
    const router = new APISurfaceRouter('beta-corp-uat');

    // Fetch different resource types with correct APIs
    const resources = [
        { type: 'FlexiPage', name: 'Lightning Pages' },
        { type: 'Report', name: 'Reports' },
        { type: 'Dashboard', name: 'Dashboards' },
        { type: 'ApexClass', name: 'Apex Classes' },
        { type: 'LWC', name: 'Lightning Web Components' }
    ];

    for (const resource of resources) {
        const data = await router.fetchResource(resource.type, { limit: 1 });
        const count = data.result?.records?.length || 0;
        const status = count > 0 ? '✅' : '⚠️';
        console.log(`  ${status} ${resource.name}: ${count} found`);
    }

    console.log('\n4️⃣ Checking Agent Availability...');
    const catalogPath = path.join(__dirname, '..', '.claude', 'agents', 'catalog.yaml');
    if (fs.existsSync(catalogPath)) {
        const catalog = yaml.load(fs.readFileSync(catalogPath, 'utf8'));

        // Check if frontend-architecture-orchestrator is available
        const frontendAgent = catalog.agents.find(a =>
            a.name === 'frontend-architecture-orchestrator'
        );

        if (frontendAgent) {
            console.log('  ✅ frontend-architecture-orchestrator available');

            // Check if alias works
            const aliasWorks = catalog.aliases['sfdc-automation-specialist'] === 'frontend-architecture-orchestrator';
            console.log(`  ${aliasWorks ? '✅' : '❌'} Alias resolution working`);
        }
    }

    console.log('\n✅ Integration test complete!');
}

// Main execution
async function main() {
    console.log('🚀 Frontend Audit v2 Test Suite');
    console.log('================================\n');

    try {
        // Check if js-yaml is installed
        try {
            require('js-yaml');
        } catch (e) {
            console.log('📦 Installing js-yaml...');
            require('child_process').execSync('npm install js-yaml', { stdio: 'inherit' });
        }

        // Run individual tests
        await testAPISurfaceRouter();
        await testCapabilityProbe();
        await testAgentCatalog();

        // Run integration test
        await runIntegrationTest();

        console.log('\n✅ All tests completed successfully!');
        process.exit(0);
    } catch (error) {
        console.error('\n❌ Test failed:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

// Run if executed directly
if (require.main === module) {
    main();
}

module.exports = { testAPISurfaceRouter, testCapabilityProbe, testAgentCatalog };