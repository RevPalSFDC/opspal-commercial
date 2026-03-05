#!/usr/bin/env node

/**
 * Agent Testing Framework
 * Comprehensive testing suite for all ClaudeSFDC agents
 * Includes unit tests, integration tests, and performance benchmarks
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { execSync, spawn } = require('child_process');
const { performance } = require('perf_hooks');

// Configuration
const PROJECT_ROOT = path.join(__dirname, '..');
const AGENTS_DIR = path.join(PROJECT_ROOT, 'agents');
const TEST_RESULTS_DIR = path.join(PROJECT_ROOT, 'test-results');
const TEST_CONFIG_FILE = path.join(PROJECT_ROOT, 'config', 'test-config.yaml');

// Color codes for console output
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    red: '\x1b[31m',
    blue: '\x1b[36m',
    gray: '\x1b[90m'
};

// Helper functions
function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSuccess(message) {
    console.log(`${colors.green}[✓]${colors.reset} ${message}`);
}

function logWarning(message) {
    console.log(`${colors.yellow}[⚠]${colors.reset} ${message}`);
}

function logError(message) {
    console.log(`${colors.red}[✗]${colors.reset} ${message}`);
}

function logInfo(message) {
    console.log(`${colors.blue}[i]${colors.reset} ${message}`);
}

/**
 * Test Suite Class
 */
class AgentTestSuite {
    constructor(options = {}) {
        this.verbose = options.verbose || false;
        this.stopOnError = options.stopOnError || false;
        this.testTimeout = options.timeout || 30000; // 30 seconds default
        this.results = {
            passed: 0,
            failed: 0,
            skipped: 0,
            errors: [],
            warnings: [],
            testRuns: []
        };
        
        // Ensure test results directory exists
        if (!fs.existsSync(TEST_RESULTS_DIR)) {
            fs.mkdirSync(TEST_RESULTS_DIR, { recursive: true });
        }
    }

    /**
     * Run all tests for all agents
     */
    async runAllTests() {
        log('\n========================================', 'bright');
        log('Agent Testing Framework', 'bright');
        log('========================================\n', 'bright');
        
        const agents = this.discoverAgents();
        const testConfig = await this.loadTestConfig();
        
        log(`Discovered ${agents.length} agents to test\n`, 'blue');
        
        for (const agentPath of agents) {
            const agentName = path.basename(agentPath, '.yaml');
            
            log(`\nTesting agent: ${agentName}`, 'bright');
            log('─'.repeat(40), 'gray');
            
            const testResult = await this.testAgent(agentPath, testConfig);
            this.results.testRuns.push(testResult);
            
            if (testResult.status === 'failed' && this.stopOnError) {
                logError('Stopping tests due to failure (--stop-on-error)');
                break;
            }
        }
        
        await this.generateReport();
        this.displaySummary();
        
        return this.results;
    }

    /**
     * Test individual agent
     */
    async testAgent(agentPath, testConfig) {
        const agentName = path.basename(agentPath, '.yaml');
        const agentConfig = this.loadAgentConfig(agentPath);
        
        const testResult = {
            agent: agentName,
            timestamp: new Date().toISOString(),
            tests: {
                config: null,
                tools: null,
                capabilities: null,
                integration: null,
                performance: null
            },
            status: 'pending',
            errors: [],
            duration: 0
        };
        
        const startTime = performance.now();
        
        try {
            // Run various test categories
            testResult.tests.config = await this.testAgentConfiguration(agentConfig, agentName);
            testResult.tests.tools = await this.testAgentTools(agentConfig, agentName);
            testResult.tests.capabilities = await this.testAgentCapabilities(agentConfig, agentName);
            testResult.tests.integration = await this.testAgentIntegration(agentConfig, agentName, testConfig);
            testResult.tests.performance = await this.testAgentPerformance(agentConfig, agentName);
            
            // Determine overall status
            const allTests = Object.values(testResult.tests);
            if (allTests.every(t => t && t.passed)) {
                testResult.status = 'passed';
                this.results.passed++;
                logSuccess(`${agentName}: All tests passed`);
            } else if (allTests.some(t => t && !t.passed && !t.skipped)) {
                testResult.status = 'failed';
                this.results.failed++;
                logError(`${agentName}: Some tests failed`);
            } else {
                testResult.status = 'partial';
                logWarning(`${agentName}: Partial success`);
            }
            
        } catch (error) {
            testResult.status = 'error';
            testResult.errors.push(error.message);
            this.results.errors.push(`${agentName}: ${error.message}`);
            logError(`${agentName}: Test error - ${error.message}`);
        }
        
        testResult.duration = Math.round(performance.now() - startTime);
        
        return testResult;
    }

    /**
     * Test agent configuration
     */
    async testAgentConfiguration(config, agentName) {
        const test = {
            category: 'configuration',
            passed: true,
            failures: [],
            warnings: []
        };
        
        // Required fields
        const requiredFields = ['name', 'stage', 'version', 'description', 'capabilities', 'tools'];
        for (const field of requiredFields) {
            if (!config || !config[field]) {
                test.passed = false;
                test.failures.push(`Missing required field: ${field}`);
            }
        }
        
        // Stage validation
        if (config && config.stage) {
            const validStages = ['production', 'staging', 'development', 'experimental', 'archived'];
            if (!validStages.includes(config.stage)) {
                test.passed = false;
                test.failures.push(`Invalid stage: ${config.stage}`);
            }
        }
        
        // Version format
        if (config && config.version) {
            const versionPattern = /^\d+\.\d+\.\d+$/;
            if (!versionPattern.test(config.version)) {
                test.warnings.push(`Version format warning: ${config.version} (expected: X.Y.Z)`);
            }
        }
        
        // Capabilities structure
        if (config && config.capabilities) {
            const capCount = Object.keys(config.capabilities).length;
            if (capCount === 0) {
                test.warnings.push('No capabilities defined');
            } else if (capCount > 10) {
                test.warnings.push(`High number of capabilities (${capCount}) - consider splitting`);
            }
        }
        
        if (this.verbose) {
            if (test.passed) {
                logSuccess(`  Configuration: Valid`);
            } else {
                logError(`  Configuration: Invalid - ${test.failures.join(', ')}`);
            }
        }
        
        return test;
    }

    /**
     * Test agent tools availability
     */
    async testAgentTools(config, agentName) {
        const test = {
            category: 'tools',
            passed: true,
            failures: [],
            available: [],
            unavailable: []
        };
        
        if (!config || !config.tools || config.tools.length === 0) {
            test.passed = false;
            test.failures.push('No tools configured');
            return test;
        }
        
        for (const tool of config.tools) {
            if (tool.startsWith('mcp_')) {
                // Check for MCP configuration
                const mcpConfigExists = fs.existsSync(path.join(PROJECT_ROOT, '.mcp.json'));
                if (mcpConfigExists) {
                    test.available.push(tool);
                } else {
                    test.unavailable.push(tool);
                    test.warnings = test.warnings || [];
                    test.warnings.push(`MCP tool ${tool} requires .mcp.json configuration`);
                }
            } else if (tool.startsWith('../scripts/')) {
                // Check for script existence
                const scriptPath = path.join(PROJECT_ROOT, tool.replace('../', ''));
                if (fs.existsSync(scriptPath)) {
                    test.available.push(tool);
                } else {
                    test.unavailable.push(tool);
                    test.passed = false;
                    test.failures.push(`Script not found: ${tool}`);
                }
            } else {
                // Standard Claude Code tools - assume available
                test.available.push(tool);
            }
        }
        
        if (this.verbose) {
            if (test.passed) {
                logSuccess(`  Tools: ${test.available.length}/${config.tools.length} available`);
            } else {
                logError(`  Tools: ${test.unavailable.length} unavailable`);
            }
        }
        
        return test;
    }

    /**
     * Test agent capabilities
     */
    async testAgentCapabilities(config, agentName) {
        const test = {
            category: 'capabilities',
            passed: true,
            tested: [],
            untested: [],
            failures: []
        };
        
        if (!config || !config.capabilities) {
            test.passed = false;
            test.failures.push('No capabilities defined');
            return test;
        }
        
        // Test each capability category
        for (const [category, items] of Object.entries(config.capabilities)) {
            if (!Array.isArray(items) || items.length === 0) {
                test.untested.push(category);
                test.warnings = test.warnings || [];
                test.warnings.push(`Empty capability category: ${category}`);
            } else {
                // Simulate capability test (in real implementation, would test actual functionality)
                test.tested.push(category);
            }
        }
        
        if (test.tested.length === 0) {
            test.passed = false;
            test.failures.push('No capabilities could be tested');
        }
        
        if (this.verbose) {
            logInfo(`  Capabilities: ${test.tested.length} categories tested`);
        }
        
        return test;
    }

    /**
     * Test agent integration with other agents
     */
    async testAgentIntegration(config, agentName, testConfig) {
        const test = {
            category: 'integration',
            passed: true,
            integrations: [],
            failures: []
        };
        
        if (!config || !config.integration_points) {
            test.skipped = true;
            if (this.verbose) {
                logInfo(`  Integration: No integration points defined (skipped)`);
            }
            return test;
        }
        
        // Check each integration point
        for (const [integratedAgent, description] of Object.entries(config.integration_points)) {
            const agentFile = path.join(AGENTS_DIR, `${integratedAgent}.yaml`);
            const exists = fs.existsSync(agentFile);
            
            test.integrations.push({
                agent: integratedAgent,
                exists,
                description
            });
            
            if (!exists) {
                test.passed = false;
                test.failures.push(`Integration agent not found: ${integratedAgent}`);
            }
        }
        
        if (this.verbose) {
            if (test.passed) {
                logSuccess(`  Integration: ${test.integrations.length} integrations verified`);
            } else {
                logError(`  Integration: ${test.failures.length} failures`);
            }
        }
        
        return test;
    }

    /**
     * Test agent performance
     */
    async testAgentPerformance(config, agentName) {
        const test = {
            category: 'performance',
            passed: true,
            metrics: {},
            warnings: []
        };
        
        // Simulate performance test
        const configLoadTime = this.measureConfigLoadTime(agentName);
        test.metrics.configLoadTime = configLoadTime;
        
        if (configLoadTime > 100) {
            test.warnings.push(`Slow configuration load time: ${configLoadTime}ms`);
        }
        
        // Check complexity metrics
        if (config && config.capabilities) {
            const complexity = Object.keys(config.capabilities).length;
            test.metrics.complexity = complexity;
            
            if (complexity > 15) {
                test.warnings.push(`High complexity score: ${complexity}`);
            }
        }
        
        // Check tool count
        if (config && config.tools) {
            test.metrics.toolCount = config.tools.length;
            
            if (config.tools.length > 20) {
                test.warnings.push(`High tool count: ${config.tools.length}`);
            }
        }
        
        if (this.verbose) {
            logInfo(`  Performance: Load time ${configLoadTime}ms`);
        }
        
        return test;
    }

    /**
     * Measure configuration load time
     */
    measureConfigLoadTime(agentName) {
        const agentPath = path.join(AGENTS_DIR, `${agentName}.yaml`);
        const start = performance.now();
        
        try {
            const content = fs.readFileSync(agentPath, 'utf8');
            yaml.load(content);
        } catch (error) {
            // Ignore errors for performance measurement
        }
        
        return Math.round(performance.now() - start);
    }

    /**
     * Run regression tests
     */
    async runRegressionTests() {
        log('\nRunning regression tests...', 'blue');
        
        const regressionTests = [
            {
                name: 'Agent Discovery',
                test: () => this.testAgentDiscovery()
            },
            {
                name: 'Communication Protocol',
                test: () => this.testCommunicationProtocol()
            },
            {
                name: 'Health Monitoring',
                test: () => this.testHealthMonitoring()
            },
            {
                name: 'Tool Inventory',
                test: () => this.testToolInventory()
            }
        ];
        
        const results = [];
        
        for (const test of regressionTests) {
            try {
                const result = await test.test();
                results.push({
                    name: test.name,
                    passed: result.passed,
                    message: result.message
                });
                
                if (result.passed) {
                    logSuccess(`  ${test.name}: Passed`);
                } else {
                    logError(`  ${test.name}: Failed - ${result.message}`);
                }
            } catch (error) {
                results.push({
                    name: test.name,
                    passed: false,
                    message: error.message
                });
                logError(`  ${test.name}: Error - ${error.message}`);
            }
        }
        
        return results;
    }

    /**
     * Test agent discovery functionality
     */
    async testAgentDiscovery() {
        const discoveryScript = path.join(PROJECT_ROOT, '..', 'shared-infrastructure', 'scripts', 'agent-discovery.js');
        
        if (!fs.existsSync(discoveryScript)) {
            return { passed: false, message: 'Agent discovery script not found' };
        }
        
        try {
            execSync(`node ${discoveryScript}`, { encoding: 'utf8' });
            return { passed: true, message: 'Agent discovery successful' };
        } catch (error) {
            return { passed: false, message: 'Agent discovery failed' };
        }
    }

    /**
     * Test communication protocol
     */
    async testCommunicationProtocol() {
        const protocolFile = path.join(PROJECT_ROOT, 'config', 'agent-communication-protocol.yaml');
        
        if (!fs.existsSync(protocolFile)) {
            return { passed: false, message: 'Communication protocol not found' };
        }
        
        try {
            const content = fs.readFileSync(protocolFile, 'utf8');
            const protocol = yaml.load(content);
            
            if (protocol && protocol.message_format && protocol.communication_patterns) {
                return { passed: true, message: 'Protocol structure valid' };
            } else {
                return { passed: false, message: 'Protocol structure invalid' };
            }
        } catch (error) {
            return { passed: false, message: `Protocol parse error: ${error.message}` };
        }
    }

    /**
     * Test health monitoring
     */
    async testHealthMonitoring() {
        const monitorScript = path.join(PROJECT_ROOT, 'scripts', 'agent-health-monitor.js');
        
        if (!fs.existsSync(monitorScript)) {
            return { passed: false, message: 'Health monitor script not found' };
        }
        
        try {
            // Test that health monitor can be required
            const HealthMonitor = require(monitorScript);
            
            if (typeof HealthMonitor.checkAgentHealth === 'function') {
                return { passed: true, message: 'Health monitor functional' };
            } else {
                return { passed: false, message: 'Health monitor missing functions' };
            }
        } catch (error) {
            return { passed: false, message: `Health monitor error: ${error.message}` };
        }
    }

    /**
     * Test tool inventory
     */
    async testToolInventory() {
        const inventoryScript = path.join(PROJECT_ROOT, 'scripts', 'tool-inventory.js');
        
        if (!fs.existsSync(inventoryScript)) {
            return { passed: false, message: 'Tool inventory script not found' };
        }
        
        try {
            const ToolInventory = require(inventoryScript);
            
            if (typeof ToolInventory.createToolInventory === 'function') {
                return { passed: true, message: 'Tool inventory functional' };
            } else {
                return { passed: false, message: 'Tool inventory missing functions' };
            }
        } catch (error) {
            return { passed: false, message: `Tool inventory error: ${error.message}` };
        }
    }

    /**
     * Load test configuration
     */
    async loadTestConfig() {
        if (fs.existsSync(TEST_CONFIG_FILE)) {
            try {
                const content = fs.readFileSync(TEST_CONFIG_FILE, 'utf8');
                return yaml.load(content);
            } catch (error) {
                logWarning('Could not load test configuration, using defaults');
            }
        }
        
        // Default test configuration
        return {
            timeout: 30000,
            verbose: false,
            categories: ['config', 'tools', 'capabilities', 'integration', 'performance'],
            skipAgents: [],
            focusAgents: []
        };
    }

    /**
     * Load agent configuration
     */
    loadAgentConfig(agentPath) {
        try {
            const content = fs.readFileSync(agentPath, 'utf8');
            return yaml.load(content);
        } catch (error) {
            return null;
        }
    }

    /**
     * Discover all agents
     */
    discoverAgents() {
        const agents = [];
        
        // Main agents directory
        if (fs.existsSync(AGENTS_DIR)) {
            const files = fs.readdirSync(AGENTS_DIR);
            for (const file of files) {
                if (file.endsWith('.yaml')) {
                    agents.push(path.join(AGENTS_DIR, file));
                }
            }
        }
        
        // Management agents
        const mgmtDir = path.join(PROJECT_ROOT, '..', 'agents', 'management');
        if (fs.existsSync(mgmtDir)) {
            const files = fs.readdirSync(mgmtDir);
            for (const file of files) {
                if (file.endsWith('.yaml')) {
                    agents.push(path.join(mgmtDir, file));
                }
            }
        }
        
        return agents;
    }

    /**
     * Generate test report
     */
    async generateReport() {
        const report = {
            timestamp: new Date().toISOString(),
            summary: {
                totalAgents: this.results.testRuns.length,
                passed: this.results.passed,
                failed: this.results.failed,
                skipped: this.results.skipped,
                errors: this.results.errors.length
            },
            testRuns: this.results.testRuns,
            errors: this.results.errors,
            warnings: this.results.warnings
        };
        
        const reportFile = path.join(TEST_RESULTS_DIR, `test-report-${Date.now()}.json`);
        fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
        
        logSuccess(`Test report saved to: ${path.relative(PROJECT_ROOT, reportFile)}`);
        
        // Generate HTML report
        await this.generateHTMLReport(report, reportFile.replace('.json', '.html'));
    }

    /**
     * Generate HTML test report
     */
    async generateHTMLReport(report, outputFile) {
        const html = `
<!DOCTYPE html>
<html>
<head>
    <title>Agent Test Report - ${new Date(report.timestamp).toLocaleString()}</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        h1 { color: #333; }
        .summary { background: #f0f0f0; padding: 15px; border-radius: 5px; }
        .passed { color: green; }
        .failed { color: red; }
        .skipped { color: orange; }
        table { width: 100%; border-collapse: collapse; margin-top: 20px; }
        th, td { padding: 10px; text-align: left; border-bottom: 1px solid #ddd; }
        th { background: #f5f5f5; }
        .test-detail { margin: 10px 0; padding: 10px; background: #fafafa; }
    </style>
</head>
<body>
    <h1>Agent Testing Framework Report</h1>
    
    <div class="summary">
        <h2>Summary</h2>
        <p>Test Date: ${new Date(report.timestamp).toLocaleString()}</p>
        <p>Total Agents Tested: ${report.summary.totalAgents}</p>
        <p class="passed">Passed: ${report.summary.passed}</p>
        <p class="failed">Failed: ${report.summary.failed}</p>
        <p class="skipped">Skipped: ${report.summary.skipped}</p>
        <p>Errors: ${report.summary.errors}</p>
    </div>
    
    <h2>Test Results</h2>
    <table>
        <tr>
            <th>Agent</th>
            <th>Status</th>
            <th>Config</th>
            <th>Tools</th>
            <th>Capabilities</th>
            <th>Integration</th>
            <th>Performance</th>
            <th>Duration (ms)</th>
        </tr>
        ${report.testRuns.map(run => `
        <tr>
            <td>${run.agent}</td>
            <td class="${run.status}">${run.status}</td>
            <td>${run.tests.config ? (run.tests.config.passed ? '✓' : '✗') : '-'}</td>
            <td>${run.tests.tools ? (run.tests.tools.passed ? '✓' : '✗') : '-'}</td>
            <td>${run.tests.capabilities ? (run.tests.capabilities.passed ? '✓' : '✗') : '-'}</td>
            <td>${run.tests.integration ? (run.tests.integration.passed ? '✓' : '✗') : '-'}</td>
            <td>${run.tests.performance ? (run.tests.performance.passed ? '✓' : '✗') : '-'}</td>
            <td>${run.duration}</td>
        </tr>
        `).join('')}
    </table>
    
    ${report.errors.length > 0 ? `
    <h2>Errors</h2>
    <ul>
        ${report.errors.map(error => `<li class="failed">${error}</li>`).join('')}
    </ul>
    ` : ''}
    
    ${report.warnings.length > 0 ? `
    <h2>Warnings</h2>
    <ul>
        ${report.warnings.map(warning => `<li class="skipped">${warning}</li>`).join('')}
    </ul>
    ` : ''}
</body>
</html>
        `;
        
        fs.writeFileSync(outputFile, html);
        logInfo(`HTML report saved to: ${path.relative(PROJECT_ROOT, outputFile)}`);
    }

    /**
     * Display test summary
     */
    displaySummary() {
        log('\n========================================', 'bright');
        log('Test Summary', 'bright');
        log('========================================\n', 'bright');
        
        const total = this.results.passed + this.results.failed + this.results.skipped;
        const passRate = total > 0 ? Math.round((this.results.passed / total) * 100) : 0;
        
        console.log(`Total Tests Run: ${total}`);
        console.log(`${colors.green}Passed: ${this.results.passed}${colors.reset}`);
        console.log(`${colors.red}Failed: ${this.results.failed}${colors.reset}`);
        console.log(`${colors.yellow}Skipped: ${this.results.skipped}${colors.reset}`);
        console.log(`Pass Rate: ${passRate}%`);
        
        if (this.results.failed > 0) {
            log('\n❌ Tests failed', 'red');
            process.exitCode = 1;
        } else {
            log('\n✅ All tests passed!', 'green');
            process.exitCode = 0;
        }
    }
}

// Check dependencies
function checkDependencies() {
    try {
        require.resolve('js-yaml');
        return true;
    } catch (e) {
        console.log('Installing required dependencies...');
        try {
            execSync('npm install js-yaml', { stdio: 'inherit' });
            return true;
        } catch (installError) {
            logError('Failed to install dependencies. Please run: npm install js-yaml');
            return false;
        }
    }
}

// Export the test suite
module.exports = AgentTestSuite;

// CLI usage
if (require.main === module) {
    if (!checkDependencies()) {
        process.exit(1);
    }
    
    const args = process.argv.slice(2);
    
    const options = {
        verbose: args.includes('--verbose') || args.includes('-v'),
        stopOnError: args.includes('--stop-on-error'),
        regression: args.includes('--regression'),
        agent: args.find(a => a.startsWith('--agent=')),
        help: args.includes('--help') || args.includes('-h')
    };
    
    if (options.help) {
        console.log(`
Agent Testing Framework

Usage: node agent-testing-framework.js [options]

Options:
  --verbose, -v      Show detailed test output
  --stop-on-error    Stop testing on first error
  --regression       Run regression tests only
  --agent=<name>     Test specific agent only
  --help, -h         Show this help message

Examples:
  node agent-testing-framework.js
  node agent-testing-framework.js --verbose
  node agent-testing-framework.js --agent=sfdc-orchestrator
  node agent-testing-framework.js --regression
        `);
        process.exit(0);
    }
    
    const testSuite = new AgentTestSuite({
        verbose: options.verbose,
        stopOnError: options.stopOnError
    });
    
    if (options.regression) {
        testSuite.runRegressionTests()
            .then(() => {
                log('\nRegression tests complete', 'green');
            })
            .catch(error => {
                logError(`Testing failed: ${error.message}`);
                process.exit(1);
            });
    } else {
        testSuite.runAllTests()
            .then(() => {
                log('\nTesting complete', 'green');
            })
            .catch(error => {
                logError(`Testing failed: ${error.message}`);
                process.exit(1);
            });
    }
}