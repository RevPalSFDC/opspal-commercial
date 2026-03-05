#!/usr/bin/env node

/**
 * Capability Assessment Protocol (Phase 3.2)
 *
 * Provides pre-cleanup assessment to determine feasibility before claiming
 * automation capabilities. Prevents over-promising on tasks that require
 * manual intervention.
 *
 * Features:
 * - Screen Flow detection (requires manual activation flag)
 * - API limitation matrix (Quick Actions, verbose operators)
 * - Feasibility scorer before claiming automation
 * - Pre-task capability assessment
 * - Disclosure generation for limitations
 *
 * Prevention Target: Over-promising automation, missing manual steps, partial cleanup
 * ROI: $105K annual value (per Phase 3.2 specification)
 *
 * Usage:
 *   const CapabilityAssessmentProtocol = require('./capability-assessment-protocol');
 *   const assessor = new CapabilityAssessmentProtocol();
 *
 *   // Assess automation feasibility
 *   const assessment = await assessor.assess(taskDescription, { platform: 'salesforce' });
 *
 *   // Check if task is feasible
 *   if (assessment.feasibilityScore < 70) {
 *     console.log('Limitations:', assessment.disclosures);
 *   }
 *
 * CLI:
 *   node capability-assessment-protocol.js assess "Deploy and activate screen flow"
 *   node capability-assessment-protocol.js limitations
 *   node capability-assessment-protocol.js flows <org-alias>
 *
 * @module capability-assessment-protocol
 * @version 1.0.0
 * @created 2025-12-09
 * @addresses Cohort - Pre-Cleanup Assessment Protocol ($105K ROI)
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class CapabilityAssessmentProtocol {
    constructor(options = {}) {
        this.verbose = options.verbose || false;
        this.disclosureThreshold = options.disclosureThreshold || 0.7; // 70% = disclose limitations

        // API Limitation Matrix
        this.apiLimitations = {
            salesforce: {
                // Flow-related limitations
                screenFlowActivation: {
                    type: 'MANUAL_REQUIRED',
                    description: 'Screen Flows require manual activation in Setup UI',
                    detection: ['screen flow', 'screen_flow', 'FlowType="Screen"'],
                    workaround: 'Deploy flow, then manually activate in Setup > Flows',
                    impact: -0.30 // 30% feasibility reduction
                },
                autoLaunchedBypass: {
                    type: 'RESTRICTED',
                    description: 'Auto-launched flows can bypass user permissions',
                    detection: ['auto-launched', 'autolaunched', 'ProcessType="AutoLaunchedFlow"'],
                    workaround: 'Ensure proper permission checks in flow logic',
                    impact: -0.10
                },

                // Quick Action limitations
                quickActionDeploy: {
                    type: 'PARTIAL',
                    description: 'Quick Actions require Layout assignment after deployment',
                    detection: ['quick action', 'quickaction', 'QuickAction'],
                    workaround: 'Deploy action, then add to page layout',
                    impact: -0.15
                },

                // Approval Process limitations
                approvalProcessActivation: {
                    type: 'MANUAL_REQUIRED',
                    description: 'Approval Processes require manual activation',
                    detection: ['approval process', 'approvalprocess', 'ApprovalProcess'],
                    workaround: 'Deploy process, then activate in Setup',
                    impact: -0.25
                },

                // Workflow Rule limitations
                workflowRuleActivation: {
                    type: 'DEPRECATED',
                    description: 'Workflow Rules are deprecated; migrate to Flows',
                    detection: ['workflow rule', 'workflowrule', 'WorkflowRule'],
                    workaround: 'Convert to Flow before deployment',
                    impact: -0.20
                },

                // Process Builder limitations
                processBuilderActivation: {
                    type: 'DEPRECATED',
                    description: 'Process Builder is deprecated; migrate to Flows',
                    detection: ['process builder', 'processbuilder', 'ProcessDefinition'],
                    workaround: 'Convert to Flow before deployment',
                    impact: -0.20
                },

                // Sharing Rule limitations
                sharingRuleCalculation: {
                    type: 'ASYNC',
                    description: 'Sharing Rules require async recalculation',
                    detection: ['sharing rule', 'sharingrule', 'SharingRule'],
                    workaround: 'Deploy rule, then monitor recalculation',
                    impact: -0.10
                },

                // Field deletion limitations
                fieldDeletion: {
                    type: 'STAGED',
                    description: 'Fields must be removed from layouts before deletion',
                    detection: ['delete field', 'remove field', 'field deletion'],
                    workaround: 'Remove from layouts, wait 48h, then delete',
                    impact: -0.35
                },

                // Object deletion limitations
                objectDeletion: {
                    type: 'RESTRICTED',
                    description: 'Custom objects with data require confirmation',
                    detection: ['delete object', 'remove object', 'object deletion'],
                    workaround: 'Export data, remove dependencies, then delete',
                    impact: -0.40
                },

                // Report type limitations
                reportTypeCreation: {
                    type: 'LIMITED',
                    description: 'Custom Report Types have relationship depth limits',
                    detection: ['report type', 'reporttype', 'ReportType'],
                    workaround: 'Limit to 4 object relationships',
                    impact: -0.05
                }
            },
            hubspot: {
                workflowEnrollment: {
                    type: 'REQUIRES_TOGGLE',
                    description: 'Workflows require manual enrollment toggle',
                    detection: ['workflow', 'automation'],
                    workaround: 'Create workflow, then enable enrollment',
                    impact: -0.15
                },
                dealPipeline: {
                    type: 'MANUAL_STAGES',
                    description: 'Deal pipeline stages require manual ordering',
                    detection: ['deal pipeline', 'pipeline stages'],
                    workaround: 'Create pipeline, then arrange stages in UI',
                    impact: -0.20
                },
                customProperty: {
                    type: 'GROUP_REQUIRED',
                    description: 'Properties require group assignment',
                    detection: ['custom property', 'property group'],
                    workaround: 'Create property group first, then property',
                    impact: -0.05
                }
            }
        };

        // Task complexity indicators
        this.complexityIndicators = {
            high: [
                'all', 'every', 'entire', 'complete', 'comprehensive',
                'migrate', 'restructure', 'overhaul', 'redesign'
            ],
            medium: [
                'update', 'modify', 'change', 'enhance', 'improve',
                'add', 'create', 'implement'
            ],
            low: [
                'check', 'verify', 'review', 'analyze', 'inspect',
                'query', 'list', 'show'
            ]
        };

        // Statistics
        this.stats = {
            assessmentsRun: 0,
            disclosuresGenerated: 0,
            highComplexity: 0,
            manualRequired: 0
        };
    }

    /**
     * Assess automation feasibility for a task
     *
     * @param {string} taskDescription - Task description to assess
     * @param {Object} options - Assessment options
     * @returns {Object} Assessment result with feasibility score and disclosures
     */
    assess(taskDescription, options = {}) {
        const { platform = 'salesforce', orgAlias = null } = options;

        const assessment = {
            taskDescription,
            platform,
            timestamp: new Date().toISOString(),
            feasibilityScore: 100,
            complexity: 'LOW',
            limitations: [],
            disclosures: [],
            manualSteps: [],
            recommendations: [],
            canAutomate: true,
            requiresDisclosure: false
        };

        const taskLower = taskDescription.toLowerCase();

        // Get platform-specific limitations
        const platformLimitations = this.apiLimitations[platform] || {};

        // Check each limitation
        for (const [limitName, limitation] of Object.entries(platformLimitations)) {
            const detected = limitation.detection.some(pattern => {
                if (typeof pattern === 'string') {
                    return taskLower.includes(pattern.toLowerCase());
                }
                return pattern.test(taskDescription);
            });

            if (detected) {
                assessment.limitations.push({
                    name: limitName,
                    type: limitation.type,
                    description: limitation.description,
                    workaround: limitation.workaround,
                    impact: limitation.impact
                });

                assessment.feasibilityScore += limitation.impact * 100;

                // Add disclosure
                assessment.disclosures.push(
                    `⚠️ ${limitation.description}. Workaround: ${limitation.workaround}`
                );

                // Track manual steps
                if (limitation.type === 'MANUAL_REQUIRED' || limitation.type === 'STAGED') {
                    assessment.manualSteps.push({
                        step: limitation.workaround,
                        reason: limitation.description
                    });
                }
            }
        }

        // Assess complexity
        assessment.complexity = this._assessComplexity(taskLower);
        if (assessment.complexity === 'HIGH') {
            assessment.feasibilityScore -= 15;
            this.stats.highComplexity++;
        } else if (assessment.complexity === 'MEDIUM') {
            assessment.feasibilityScore -= 5;
        }

        // Normalize score
        assessment.feasibilityScore = Math.max(0, Math.min(100, assessment.feasibilityScore));

        // Determine if disclosure required
        assessment.requiresDisclosure = assessment.feasibilityScore < this.disclosureThreshold * 100;
        assessment.canAutomate = assessment.limitations.filter(l =>
            l.type === 'MANUAL_REQUIRED' || l.type === 'RESTRICTED'
        ).length === 0;

        // Generate recommendations
        assessment.recommendations = this._generateRecommendations(assessment);

        // Update stats
        this.stats.assessmentsRun++;
        if (assessment.disclosures.length > 0) {
            this.stats.disclosuresGenerated++;
        }
        if (assessment.manualSteps.length > 0) {
            this.stats.manualRequired++;
        }

        if (this.verbose) {
            const status = assessment.feasibilityScore >= 70 ? '✅' : '⚠️';
            console.log(`${status} Feasibility: ${assessment.feasibilityScore}% | Complexity: ${assessment.complexity} | Limitations: ${assessment.limitations.length}`);
        }

        return assessment;
    }

    /**
     * Detect Screen Flows in an org that require manual activation
     *
     * @param {string} orgAlias - Salesforce org alias
     * @returns {Object} Screen Flow detection result
     */
    async detectScreenFlows(orgAlias) {
        const result = {
            orgAlias,
            timestamp: new Date().toISOString(),
            screenFlows: [],
            requiresManualActivation: 0,
            totalFlows: 0
        };

        try {
            // Query for Screen Flows using Flow object (ProcessType is on Flow, not FlowDefinition)
            // Screen Flows have ProcessType = 'Flow', Auto-launched have ProcessType = 'AutoLaunchedFlow'
            const query = `SELECT Id, Definition.DeveloperName, ProcessType, Status, Description FROM Flow WHERE ProcessType = 'Flow' AND Status = 'Active' ORDER BY Definition.DeveloperName`;
            const cmd = `sf data query --query "${query}" --use-tooling-api --target-org ${orgAlias} --json`;

            const output = execSync(cmd, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
            const queryResult = JSON.parse(output);

            if (queryResult.status === 0 && queryResult.result?.records) {
                for (const flow of queryResult.result.records) {
                    result.totalFlows++;

                    // Screen Flows have ProcessType = 'Flow' (not AutoLaunchedFlow)
                    result.screenFlows.push({
                        developerName: flow.Definition?.DeveloperName || 'Unknown',
                        id: flow.Id,
                        isActive: flow.Status === 'Active',
                        processType: flow.ProcessType,
                        description: flow.Description,
                        requiresManualActivation: true // Screen Flows always require manual activation
                    });

                    // Count inactive Screen Flows that need manual activation
                    if (flow.Status !== 'Active') {
                        result.requiresManualActivation++;
                    }
                }
            }

            if (this.verbose) {
                console.log(`🔍 Found ${result.screenFlows.length} Screen Flows (${result.requiresManualActivation} require manual activation)`);
            }

        } catch (error) {
            result.error = error.message;
        }

        return result;
    }

    /**
     * Get all known API limitations
     *
     * @param {string} platform - Platform name (salesforce, hubspot)
     * @returns {Object} Limitations for platform
     */
    getLimitations(platform = null) {
        if (platform) {
            return this.apiLimitations[platform] || {};
        }
        return this.apiLimitations;
    }

    /**
     * Generate disclosure statement for a task
     *
     * @param {Object} assessment - Assessment result
     * @returns {string} Disclosure statement
     */
    generateDisclosure(assessment) {
        if (!assessment.requiresDisclosure && assessment.disclosures.length === 0) {
            return 'This task can be fully automated without manual intervention.';
        }

        let disclosure = '## Automation Limitations Disclosure\n\n';
        disclosure += `**Feasibility Score**: ${assessment.feasibilityScore}%\n`;
        disclosure += `**Complexity**: ${assessment.complexity}\n\n`;

        if (assessment.limitations.length > 0) {
            disclosure += '### Detected Limitations\n\n';
            assessment.limitations.forEach(limit => {
                disclosure += `- **${limit.name}** (${limit.type}): ${limit.description}\n`;
            });
            disclosure += '\n';
        }

        if (assessment.manualSteps.length > 0) {
            disclosure += '### Required Manual Steps\n\n';
            assessment.manualSteps.forEach((step, i) => {
                disclosure += `${i + 1}. ${step.step}\n`;
                disclosure += `   *Reason: ${step.reason}*\n`;
            });
            disclosure += '\n';
        }

        if (assessment.recommendations.length > 0) {
            disclosure += '### Recommendations\n\n';
            assessment.recommendations.forEach(rec => {
                disclosure += `- ${rec}\n`;
            });
        }

        return disclosure;
    }

    /**
     * Get statistics
     */
    getStats() {
        return { ...this.stats };
    }

    // =========================================================================
    // Private Helper Methods
    // =========================================================================

    _assessComplexity(taskLower) {
        // Check for high complexity indicators
        for (const indicator of this.complexityIndicators.high) {
            if (taskLower.includes(indicator)) {
                return 'HIGH';
            }
        }

        // Check for medium complexity
        for (const indicator of this.complexityIndicators.medium) {
            if (taskLower.includes(indicator)) {
                return 'MEDIUM';
            }
        }

        // Default to low
        return 'LOW';
    }

    _generateRecommendations(assessment) {
        const recommendations = [];

        if (assessment.feasibilityScore < 50) {
            recommendations.push('Consider breaking this task into smaller, more automatable steps');
        }

        if (assessment.manualSteps.length > 0) {
            recommendations.push(`Document ${assessment.manualSteps.length} manual step(s) in task notes`);
        }

        if (assessment.limitations.some(l => l.type === 'DEPRECATED')) {
            recommendations.push('Migrate deprecated components before proceeding');
        }

        if (assessment.complexity === 'HIGH') {
            recommendations.push('High complexity detected - consider using sequential-planner agent');
        }

        if (assessment.limitations.some(l => l.name === 'screenFlowActivation')) {
            recommendations.push('Screen Flows require manual activation - add to post-deployment checklist');
        }

        return recommendations;
    }
}

// CLI interface
if (require.main === module) {
    const [,, command, ...args] = process.argv;

    const showHelp = () => {
        console.log(`
Capability Assessment Protocol (Phase 3.2)

Usage:
  node capability-assessment-protocol.js <command> [args]

Commands:
  assess "<task>"              Assess automation feasibility
  limitations [platform]       Show API limitations
  flows <org-alias>            Detect Screen Flows requiring manual activation
  stats                        Show assessment statistics

Platforms:
  - salesforce (default)
  - hubspot

Examples:
  node capability-assessment-protocol.js assess "Deploy and activate screen flow"
  node capability-assessment-protocol.js assess "Create quick action" --platform salesforce
  node capability-assessment-protocol.js limitations salesforce
  node capability-assessment-protocol.js flows myorg
        `);
    };

    if (!command) {
        showHelp();
        process.exit(1);
    }

    const assessor = new CapabilityAssessmentProtocol({ verbose: true });

    async function main() {
        switch (command) {
            case 'assess': {
                const task = args.join(' ');
                if (!task) {
                    console.error('Error: task description required');
                    showHelp();
                    process.exit(1);
                }

                console.log(`Assessing: "${task}"\n`);
                const assessment = assessor.assess(task);

                console.log('\nAssessment Result:');
                console.log('═'.repeat(60));
                console.log(`  Feasibility Score: ${assessment.feasibilityScore}%`);
                console.log(`  Complexity: ${assessment.complexity}`);
                console.log(`  Can Fully Automate: ${assessment.canAutomate ? 'Yes' : 'No'}`);
                console.log(`  Requires Disclosure: ${assessment.requiresDisclosure ? 'Yes' : 'No'}`);

                if (assessment.limitations.length > 0) {
                    console.log('\nLimitations Detected:');
                    assessment.limitations.forEach(limit => {
                        console.log(`  ⚠️  ${limit.name}: ${limit.description}`);
                    });
                }

                if (assessment.manualSteps.length > 0) {
                    console.log('\nManual Steps Required:');
                    assessment.manualSteps.forEach((step, i) => {
                        console.log(`  ${i + 1}. ${step.step}`);
                    });
                }

                if (assessment.recommendations.length > 0) {
                    console.log('\nRecommendations:');
                    assessment.recommendations.forEach(rec => {
                        console.log(`  • ${rec}`);
                    });
                }

                if (assessment.requiresDisclosure) {
                    console.log('\n' + '─'.repeat(60));
                    console.log('DISCLOSURE REQUIRED');
                    console.log('─'.repeat(60));
                    console.log(assessor.generateDisclosure(assessment));
                }
                break;
            }

            case 'limitations': {
                const platform = args[0] || 'all';

                console.log(`API Limitations${platform !== 'all' ? ` for ${platform}` : ''}:\n`);

                const limitations = assessor.getLimitations(platform === 'all' ? null : platform);

                for (const [platformName, platformLimits] of Object.entries(limitations)) {
                    if (platform !== 'all' && platformName !== platform) continue;

                    console.log(`\n${platformName.toUpperCase()}`);
                    console.log('─'.repeat(60));

                    for (const [name, limit] of Object.entries(platformLimits)) {
                        console.log(`  ${name} (${limit.type})`);
                        console.log(`    ${limit.description}`);
                        console.log(`    Impact: ${Math.abs(limit.impact * 100)}% reduction`);
                        console.log(`    Workaround: ${limit.workaround}\n`);
                    }
                }
                break;
            }

            case 'flows': {
                const orgAlias = args[0];
                if (!orgAlias) {
                    console.error('Error: org-alias required');
                    showHelp();
                    process.exit(1);
                }

                console.log(`Detecting Screen Flows in org: ${orgAlias}...\n`);
                const result = await assessor.detectScreenFlows(orgAlias);

                if (result.error) {
                    console.error(`Error: ${result.error}`);
                    process.exit(1);
                }

                console.log('Screen Flow Detection Result:');
                console.log('═'.repeat(60));
                console.log(`  Total Screen Flows: ${result.screenFlows.length}`);
                console.log(`  Require Manual Activation: ${result.requiresManualActivation}`);

                if (result.screenFlows.length > 0) {
                    console.log('\nScreen Flows:');
                    result.screenFlows.forEach(flow => {
                        const status = flow.isActive ? '✅' : '⚠️';
                        console.log(`  ${status} ${flow.developerName} ${flow.isActive ? '(active)' : '(inactive - manual activation required)'}`);
                    });
                }
                break;
            }

            case 'stats': {
                console.log('Assessment Statistics:');
                console.log('─'.repeat(40));
                const stats = assessor.getStats();
                Object.entries(stats).forEach(([key, value]) => {
                    console.log(`  ${key}: ${value}`);
                });
                break;
            }

            default:
                console.error(`Unknown command: ${command}`);
                showHelp();
                process.exit(1);
        }
    }

    main().catch(error => {
        console.error('Error:', error.message);
        process.exit(1);
    });
}

module.exports = CapabilityAssessmentProtocol;
