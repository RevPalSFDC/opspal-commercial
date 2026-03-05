#!/usr/bin/env node

/**
 * Playbook Usage Validator
 * ========================
 * Validates that agents are properly using playbooks
 * Generates compliance reports and recommendations
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const PlaybookRegistry = require('./lib/playbook-registry');
const PlaybookResolver = require('./lib/playbook-resolver');

const COHORT_RUNBOOK_REQUIREMENTS = {
    'data-quality': [
        'plugins/opspal-salesforce/docs/runbooks/data-quality-operations/README.md',
        'plugins/opspal-hubspot/docs/runbooks/data-quality/README.md',
        'plugins/opspal-marketo/docs/runbooks/lead-management/lead-quality-maintenance.md'
    ],
    'config/env': [
        'plugins/opspal-salesforce/docs/runbooks/environment-configuration/README.md'
    ],
    'auth/permissions': [
        'plugins/opspal-salesforce/contexts/metadata-manager/fls-field-deployment.md',
        'plugins/opspal-salesforce/docs/PERMISSION_SET_USER_GUIDE.md'
    ],
    'prompt-mismatch': [
        'plugins/opspal-salesforce/docs/runbooks/automation-feasibility/README.md',
        'plugins/opspal-salesforce/docs/AUTO_AGENT_ROUTING.md',
        'docs/routing-help.md'
    ],
    'schema/parse': [
        'plugins/opspal-salesforce/docs/runbooks/territory-management/03-territory2-object-relationships.md',
        'plugins/opspal-salesforce/docs/runbooks/territory-management/10-troubleshooting-guide.md'
    ],
    'tool-contract': [
        'plugins/opspal-salesforce/docs/CLI_COMMAND_VALIDATOR_USAGE.md',
        'plugins/opspal-core/scripts/lib/tool-contract-validator.js',
        'plugins/opspal-core/scripts/lib/api-capability-checker.js'
    ]
};

class PlaybookValidator {
    constructor(options = {}) {
        const registryOptions = {
            ...options,
            playbooksDir: options.playbooksDir || path.join(__dirname, '../docs/runbooks'),
            // Keep generated registry artifacts out of agents/ for local validation runs.
            registryPath: options.registryPath || path.join(__dirname, '../.cache/playbook-registry.yaml')
        };

        this.registry = new PlaybookRegistry(registryOptions);
        this.resolver = new PlaybookResolver(registryOptions);
        this.agentsDir = options.agentsDir || path.join(__dirname, '../agents');
        this.logsDir = options.logsDir || path.join(process.cwd(), 'deployment-logs');
        this.workspaceRoot = options.workspaceRoot || path.resolve(__dirname, '../../..');
        this.validationResults = [];
    }

    /**
     * Initialize validator
     */
    async initialize() {
        await this.registry.initialize();
        await this.resolver.initialize();
        console.log('✅ Playbook Validator initialized');
    }

    /**
     * Validate all agents have playbook configurations
     */
    async validateAgentConfigurations() {
        console.log('\n🔍 Validating agent configurations...\n');

        const results = {
            total: 0,
            configured: 0,
            missing: [],
            incomplete: []
        };

        // Get all agent YAML files
        const agentFiles = fs.readdirSync(this.agentsDir)
            .filter(f => f.endsWith('.yaml'));

        for (const file of agentFiles) {
            const agentName = path.basename(file, '.yaml');
            results.total++;

            try {
                const filePath = path.join(this.agentsDir, file);
                const content = fs.readFileSync(filePath, 'utf8');
                const agent = yaml.load(content);

                // Check for playbook configuration
                if (agent.playbooks) {
                    results.configured++;

                    // Validate playbook references exist
                    const invalid = [];
                    for (const [name] of Object.entries(agent.playbooks)) {
                        const playbook = this.registry.getPlaybookMetadata(name);
                        if (!playbook) {
                            invalid.push(name);
                        }
                    }

                    if (invalid.length > 0) {
                        results.incomplete.push({
                            agent: agentName,
                            invalidPlaybooks: invalid
                        });
                    }
                } else {
                    results.missing.push(agentName);
                }

                // Check if agent should have playbooks based on capabilities
                const recommendedPlaybooks = await this.recommendPlaybooksForAgent(agent, agentName);
                if (recommendedPlaybooks.length > 0 && !agent.playbooks) {
                    console.log(`⚠️  ${agentName}: Should have playbooks based on capabilities`);
                    console.log(`   Recommended: ${recommendedPlaybooks.join(', ')}`);
                }

            } catch (error) {
                console.warn(`⚠️  Failed to validate ${file}:`, error.message);
            }
        }

        // Report results
        const configuredPct = results.total > 0
            ? ((results.configured / results.total) * 100).toFixed(0)
            : '0';
        console.log('\n📊 Agent Configuration Summary:');
        console.log(`  Total Agents: ${results.total}`);
        console.log(`  Configured: ${results.configured} (${configuredPct}%)`);
        console.log(`  Missing Playbooks: ${results.missing.length}`);
        console.log(`  Incomplete: ${results.incomplete.length}`);

        if (results.missing.length > 0) {
            console.log('\n❌ Agents missing playbook configuration:');
            results.missing.forEach(agent => console.log(`    - ${agent}`));
        }

        if (results.incomplete.length > 0) {
            console.log('\n⚠️  Agents with invalid playbook references:');
            results.incomplete.forEach(item => {
                console.log(`    - ${item.agent}: ${item.invalidPlaybooks.join(', ')}`);
            });
        }

        return results;
    }

    /**
     * Recommend playbooks for an agent based on capabilities
     */
    async recommendPlaybooksForAgent(agentConfig, agentName) {
        const recommendations = [];

        // Extract keywords from agent configuration
        const keywords = [];
        if (agentConfig.description) {
            const words = agentConfig.description.toLowerCase().split(/\s+/);
            keywords.push(...words.filter(w => w.length > 4));
        }

        if (agentConfig.capabilities) {
            const capText = JSON.stringify(agentConfig.capabilities).toLowerCase();
            if (capText.includes('deploy')) recommendations.push('pre-deployment-validation');
            if (capText.includes('rollback')) recommendations.push('deployment-rollback');
            if (capText.includes('bulk') || capText.includes('data')) recommendations.push('bulk-data-operations');
            if (capText.includes('metadata')) recommendations.push('metadata-retrieval');
            if (capText.includes('report') || capText.includes('dashboard')) recommendations.push('dashboard-report-hygiene');
            if (capText.includes('error') || capText.includes('recover')) recommendations.push('error-recovery');
        }

        return [...new Set(recommendations)];
    }

    /**
     * Validate execution logs for playbook compliance
     */
    async validateExecutionLogs(days = 7) {
        console.log(`\n🔍 Validating execution logs (last ${days} days)...\n`);

        const results = {
            totalExecutions: 0,
            playbookRecommended: 0,
            playbookFollowed: 0,
            violations: [],
            compliance: 0
        };

        // Get log files from last N days
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - days);

        if (!fs.existsSync(this.logsDir)) {
            console.log('No execution logs found');
            return results;
        }

        const logFiles = fs.readdirSync(this.logsDir)
            .filter(f => f.startsWith('agent-executions-') && f.endsWith('.jsonl'))
            .filter(f => {
                const dateStr = f.match(/(\d{4}-\d{2}-\d{2})/);
                if (dateStr) {
                    const fileDate = new Date(dateStr[1]);
                    return fileDate >= cutoffDate;
                }
                return false;
            });

        // Parse and analyze logs
        for (const logFile of logFiles) {
            const filePath = path.join(this.logsDir, logFile);
            const lines = fs.readFileSync(filePath, 'utf8').split('\n').filter(l => l);

            for (const line of lines) {
                try {
                    const entry = JSON.parse(line);
                    results.totalExecutions++;

                    // Check if playbooks were recommended
                    if (entry.playbooks && entry.playbooks.length > 0) {
                        results.playbookRecommended++;

                        // Check if any were required but not followed
                        const requiredPlaybook = entry.playbooks.find(p => p.required);
                        if (requiredPlaybook && !entry.activePlaybook) {
                            results.violations.push({
                                timestamp: entry.timestamp,
                                agent: entry.agent,
                                command: entry.command.substring(0, 100),
                                requiredPlaybook: requiredPlaybook.name,
                                reason: 'Required playbook not executed'
                            });
                        } else if (entry.activePlaybook) {
                            results.playbookFollowed++;
                        }
                    }
                } catch (error) {
                    // Skip invalid log entries
                }
            }
        }

        // Calculate compliance rate
        if (results.playbookRecommended > 0) {
            results.compliance = (results.playbookFollowed / results.playbookRecommended) * 100;
        }

        // Report results
        console.log('📊 Execution Log Summary:');
        console.log(`  Total Executions: ${results.totalExecutions}`);
        console.log(`  Playbook Recommended: ${results.playbookRecommended}`);
        console.log(`  Playbook Followed: ${results.playbookFollowed}`);
        console.log(`  Compliance Rate: ${results.compliance.toFixed(1)}%`);
        console.log(`  Violations: ${results.violations.length}`);

        if (results.violations.length > 0) {
            console.log('\n❌ Recent violations:');
            results.violations.slice(0, 5).forEach(v => {
                console.log(`    ${v.timestamp}: ${v.agent} - ${v.requiredPlaybook} not followed`);
                console.log(`      Command: ${v.command}`);
            });
        }

        return results;
    }

    /**
     * Validate playbook coverage
     */
    async validatePlaybookCoverage() {
        console.log('\n🔍 Validating playbook coverage...\n');

        const report = this.registry.generateReport();
        const coverage = {
            wellCovered: [],
            underutilized: [],
            unused: [],
            recommendations: []
        };

        // Analyze playbook usage
        for (const playbook of this.registry.registry.playbooks) {
            const agentCount = playbook.agents.length;

            if (agentCount === 0) {
                coverage.unused.push(playbook.name);
            } else if (agentCount < 2) {
                coverage.underutilized.push({
                    playbook: playbook.name,
                    agents: playbook.agents
                });
            } else {
                coverage.wellCovered.push({
                    playbook: playbook.name,
                    agentCount: agentCount
                });
            }
        }

        // Generate recommendations
        if (coverage.unused.length > 0) {
            coverage.recommendations.push('Review unused playbooks for relevance or removal');
        }

        if (coverage.underutilized.length > 0) {
            coverage.recommendations.push('Consider expanding playbook usage to more agents');
        }

        // Report results
        console.log('📊 Playbook Coverage Summary:');
        console.log(`  Well Covered: ${coverage.wellCovered.length} playbooks`);
        console.log(`  Underutilized: ${coverage.underutilized.length} playbooks`);
        console.log(`  Unused: ${coverage.unused.length} playbooks`);

        if (coverage.unused.length > 0) {
            console.log('\n❌ Unused playbooks:');
            coverage.unused.forEach(p => console.log(`    - ${p}`));
        }

        if (coverage.underutilized.length > 0) {
            console.log('\n⚠️  Underutilized playbooks:');
            coverage.underutilized.forEach(item => {
                console.log(`    - ${item.playbook} (only used by: ${item.agents.join(', ')})`);
            });
        }

        if (coverage.recommendations.length > 0) {
            console.log('\n💡 Recommendations:');
            coverage.recommendations.forEach(r => console.log(`    • ${r}`));
        }

        return coverage;
    }

    /**
     * Validate required runbook coverage for unresolved issue cohorts.
     * This is the runbook-first contract for remediation execution.
     */
    async validateCohortRunbookCoverage() {
        console.log('\n🔍 Validating cohort-to-runbook coverage...\n');

        const results = {
            totalCohorts: Object.keys(COHORT_RUNBOOK_REQUIREMENTS).length,
            fullyCovered: 0,
            partiallyCovered: 0,
            missingCoverage: 0,
            coveragePercent: 0,
            details: []
        };

        for (const [cohort, requiredArtifacts] of Object.entries(COHORT_RUNBOOK_REQUIREMENTS)) {
            const present = [];
            const missing = [];

            for (const relPath of requiredArtifacts) {
                const absPath = path.join(this.workspaceRoot, relPath);
                if (fs.existsSync(absPath)) {
                    present.push(relPath);
                } else {
                    missing.push(relPath);
                }
            }

            if (missing.length === 0) {
                results.fullyCovered++;
            } else if (present.length > 0) {
                results.partiallyCovered++;
            } else {
                results.missingCoverage++;
            }

            results.details.push({
                cohort,
                required: requiredArtifacts.length,
                present,
                missing
            });
        }

        results.coveragePercent = Math.round((results.fullyCovered / results.totalCohorts) * 100);

        console.log('📊 Cohort Coverage Summary:');
        console.log(`  Total Cohorts: ${results.totalCohorts}`);
        console.log(`  Fully Covered: ${results.fullyCovered}`);
        console.log(`  Partially Covered: ${results.partiallyCovered}`);
        console.log(`  Missing Coverage: ${results.missingCoverage}`);
        console.log(`  Coverage: ${results.coveragePercent}%`);

        const incomplete = results.details.filter(item => item.missing.length > 0);
        if (incomplete.length > 0) {
            console.log('\n❌ Cohorts missing required artifacts:');
            incomplete.forEach(item => {
                console.log(`    - ${item.cohort}`);
                item.missing.forEach(m => console.log(`      • ${m}`));
            });
        }

        return results;
    }

    /**
     * Test playbook resolution for common scenarios
     */
    async testPlaybookResolution() {
        console.log('\n🧪 Testing playbook resolution...\n');

        const testCases = [
            {
                task: 'Configure Salesforce environment for multi-context execution',
                expectedPlaybooks: ['04-multi-context-execution'],
                expectedRequired: false
            },
            {
                task: 'Diagnose Territory2 ObjectTerritory2Association query failures',
                expectedPlaybooks: ['03-territory2-object-relationships'],
                expectedRequired: false
            },
            {
                task: 'Monitor Salesforce field population and data quality anomalies',
                expectedPlaybooks: ['01-field-population-monitoring'],
                expectedRequired: false
            },
            {
                task: 'Assess screen flow automation feasibility and manual steps',
                expectedPlaybooks: ['01-screen-flow-automation-limits'],
                expectedRequired: false
            }
        ];

        const results = {
            passed: 0,
            failed: 0,
            details: []
        };

        for (const testCase of testCases) {
            const matches = await this.resolver.resolvePlaybooks(testCase.task);
            const matchedNames = matches.map(m => m.playbook);
            const hasRequired = matches.some(m => m.required);

            // Check if expected playbooks are found
            const foundExpected = testCase.expectedPlaybooks.every(expected =>
                matchedNames.some(name => name.includes(expected))
            );

            const requirementMet = hasRequired === testCase.expectedRequired;

            const passed = foundExpected && requirementMet;

            results.details.push({
                task: testCase.task,
                passed,
                expected: testCase.expectedPlaybooks,
                found: matchedNames.slice(0, 3),
                requirementMet
            });

            if (passed) {
                results.passed++;
                console.log(`✅ "${testCase.task}"`);
                console.log(`   Found: ${matchedNames.slice(0, 3).join(', ')}`);
            } else {
                results.failed++;
                console.log(`❌ "${testCase.task}"`);
                console.log(`   Expected: ${testCase.expectedPlaybooks.join(', ')}`);
                console.log(`   Found: ${matchedNames.slice(0, 3).join(', ')}`);
            }
        }

        console.log(`\n📊 Resolution Test Results: ${results.passed}/${testCases.length} passed`);

        return results;
    }

    /**
     * Generate full validation report
     */
    async generateFullReport() {
        console.log('\n' + '='.repeat(60));
        console.log('   PLAYBOOK INTEGRATION VALIDATION REPORT');
        console.log('='.repeat(60));

        const report = {
            timestamp: new Date().toISOString(),
            summary: {
                status: 'unknown',
                score: 0,
                recommendations: []
            },
            details: {}
        };

        // Run all validations
        report.details.agentConfigurations = await this.validateAgentConfigurations();
        report.details.executionLogs = await this.validateExecutionLogs();
        report.details.playbookCoverage = await this.validatePlaybookCoverage();
        report.details.cohortRunbookCoverage = await this.validateCohortRunbookCoverage();
        report.details.resolutionTests = await this.testPlaybookResolution();

        // Calculate overall score
        let score = 0;
        let maxScore = 0;

        // Agent configuration score (30 points)
        maxScore += 30;
        const configBase = report.details.agentConfigurations.total || 1;
        const configScore = (report.details.agentConfigurations.configured / configBase) * 30;
        score += configScore;

        // Execution compliance score (30 points)
        maxScore += 30;
        const complianceScore = (report.details.executionLogs.compliance / 100) * 30;
        score += complianceScore;

        // Coverage score (20 points)
        maxScore += 20;
        const totalPlaybooks = report.details.playbookCoverage.wellCovered.length +
                              report.details.playbookCoverage.underutilized.length +
                              report.details.playbookCoverage.unused.length;
        const coverageBase = totalPlaybooks || 1;
        const coverageScore = (report.details.playbookCoverage.wellCovered.length / coverageBase) * 20;
        score += coverageScore;

        // Cohort runbook coverage score (20 points)
        maxScore += 20;
        const cohortCoverageScore = (report.details.cohortRunbookCoverage.coveragePercent / 100) * 20;
        score += cohortCoverageScore;

        // Resolution test score (10 points)
        maxScore += 10;
        const totalResolutionTests = report.details.resolutionTests.passed + report.details.resolutionTests.failed;
        const resolutionBase = totalResolutionTests || 1;
        const testScore = (report.details.resolutionTests.passed / resolutionBase) * 10;
        score += testScore;

        report.summary.score = Math.round((score / maxScore) * 100);

        // Determine status
        if (report.summary.score >= 80) {
            report.summary.status = 'GOOD';
        } else if (report.summary.score >= 60) {
            report.summary.status = 'NEEDS_IMPROVEMENT';
        } else {
            report.summary.status = 'CRITICAL';
        }

        // Generate recommendations
        if (report.details.agentConfigurations.missing.length > 0) {
            report.summary.recommendations.push(
                `Add playbook configurations to ${report.details.agentConfigurations.missing.length} agents`
            );
        }

        if (report.details.executionLogs.compliance < 80) {
            report.summary.recommendations.push(
                'Improve playbook compliance in agent executions'
            );
        }

        if (report.details.playbookCoverage.unused.length > 0) {
            report.summary.recommendations.push(
                'Review and update unused playbooks'
            );
        }

        if (report.details.cohortRunbookCoverage.missingCoverage > 0 ||
            report.details.cohortRunbookCoverage.partiallyCovered > 0) {
            report.summary.recommendations.push(
                'Close cohort runbook coverage gaps before enabling strict runbook-first gates'
            );
        }

        // Display summary
        console.log('\n' + '='.repeat(60));
        console.log('   SUMMARY');
        console.log('='.repeat(60));
        console.log(`\nOverall Status: ${report.summary.status}`);
        console.log(`Score: ${report.summary.score}/100`);

        if (report.summary.recommendations.length > 0) {
            console.log('\n📋 Key Recommendations:');
            report.summary.recommendations.forEach((r, i) => {
                console.log(`${i + 1}. ${r}`);
            });
        }

        // Save report
        const reportDir = path.join(process.cwd(), 'reports');
        if (!fs.existsSync(reportDir)) {
            fs.mkdirSync(reportDir, { recursive: true });
        }

        const reportFile = path.join(reportDir, `playbook-validation-${Date.now()}.json`);
        fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
        console.log(`\n💾 Full report saved to: ${reportFile}`);

        return report;
    }
}

// CLI interface
if (require.main === module) {
    const validator = new PlaybookValidator();
    const command = process.argv[2] || 'help';

    const commands = {
        async agents() {
            await validator.initialize();
            await validator.validateAgentConfigurations();
        },

        async logs() {
            const days = parseInt(process.argv[3]) || 7;
            await validator.initialize();
            await validator.validateExecutionLogs(days);
        },

        async coverage() {
            await validator.initialize();
            await validator.validatePlaybookCoverage();
        },

        async cohorts() {
            await validator.initialize();
            const results = await validator.validateCohortRunbookCoverage();
            if (process.argv.includes('--strict') && results.missingCoverage > 0) {
                process.exitCode = 2;
            }
        },

        async test() {
            await validator.initialize();
            await validator.testPlaybookResolution();
        },

        async full() {
            await validator.initialize();
            await validator.generateFullReport();
        },

        async help() {
            console.log(`
Playbook Usage Validator

Usage: node scripts/validate-playbook-usage.js <command> [options]

Commands:
  agents    - Validate agent playbook configurations
  logs [days] - Validate execution logs (default: 7 days)
  coverage  - Validate playbook coverage
  cohorts [--strict] - Validate required runbook coverage for unresolved issue cohorts
  test      - Test playbook resolution
  full      - Run full validation and generate report
  help      - Show this help message

Examples:
  node validate-playbook-usage.js agents
  node validate-playbook-usage.js logs 30
  node validate-playbook-usage.js cohorts --strict
  node validate-playbook-usage.js full
            `);
        }
    };

    const cmd = commands[command];
    if (!cmd) {
        console.error(`Unknown command: ${command}\n`);
        commands.help().then(() => { process.exitCode = 1; });
    } else {
        cmd().catch((error) => {
            console.error(error);
            process.exitCode = 1;
        });
    }
}

module.exports = PlaybookValidator;
