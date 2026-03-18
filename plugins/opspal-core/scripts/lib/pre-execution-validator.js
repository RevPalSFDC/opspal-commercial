#!/usr/bin/env node

/**
 * Pre-Execution Validator - Validates routing decisions before execution
 *
 * Ensures that high-risk operations are routed to appropriate agents and
 * blocks direct execution when necessary.
 *
 * @version 1.0.0
 * @date 2025-01-08
 */

const fs = require('fs');
const path = require('path');

class PreExecutionValidator {
    constructor(options = {}) {
        this.verbose = options.verbose || false;
        this.strict = options.strict || false;

        // Load routing index if available
        const indexPath = path.join(__dirname, '../../../opspal-core/routing-index.json');
        if (fs.existsSync(indexPath)) {
            this.routingIndex = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
        }

        // Mandatory routing rules - operations that MUST use specific agents
        this.mandatoryRules = [
            {
                pattern: /(?:\b(production|prod|live)\b.*\b(deploy|release|push)\b|\b(deploy|release|push)\b.*\b(production|prod|live)\b)/i,
                requiredAgent: 'release-coordinator',
                reason: 'Production deployments require change control and rollback planning',
                severity: 'CRITICAL',
                complexityScore: 0.9
            },
            {
                pattern: /\bmerge\b.*\b(\d+|many|multiple|bulk|all)\b.*\b(account|contact|lead|duplicate)\b/i,
                requiredAgent: 'sfdc-merge-orchestrator',
                reason: 'Bulk merge operations require safety validation and conflict detection',
                severity: 'CRITICAL',
                complexityScore: 0.85
            },
            {
                pattern: /\b(conflict|deployment failed|metadata error)\b/i,
                requiredAgent: 'sfdc-conflict-resolver',
                reason: 'Conflicts require dependency analysis and resolution planning',
                severity: 'HIGH',
                complexityScore: 0.75
            },
            {
                pattern: /\bcross[-\s]platform\b.*\b(salesforce|hubspot)\b/i,
                requiredAgent: 'unified-orchestrator',
                reason: 'Cross-platform operations require multi-system coordination',
                severity: 'HIGH',
                complexityScore: 0.8
            },
            {
                pattern: /\b(delete|remove|destroy)\b.*\b(all|bulk|multiple|production)\b/i,
                requiredAgent: null, // No single agent - block entirely
                reason: 'Destructive bulk operations in production are extremely high risk',
                severity: 'CRITICAL',
                complexityScore: 1.0,
                block: true
            }
        ];

        // Recommended routing rules - operations that SHOULD use specific agents
        this.recommendedRules = [
            {
                pattern: /\b(cpq|pricing|quote|steelbrick|sbqq)\b.*\b(assess|audit|analyz)\b/i,
                recommendedAgent: 'sfdc-cpq-assessor',
                reason: 'CPQ assessments benefit from specialized data quality checks',
                confidence: 0.85
            },
            {
                pattern: /\b(revops|revenue operations)\b.*\b(audit|assess|analyz)\b/i,
                recommendedAgent: 'sfdc-revops-auditor',
                reason: 'RevOps assessments require statistical analysis and business process evaluation',
                confidence: 0.9
            },
            {
                pattern: /\b(permission|profile|security|fls)\b.*\b(manage|deploy|update)\b/i,
                recommendedAgent: 'sfdc-permission-orchestrator',
                reason: 'Permission changes benefit from two-tier architecture and merge-safe operations',
                confidence: 0.8
            },
            {
                pattern: /\b(diagram|flowchart|erd|visualiz|architecture)\b/i,
                recommendedAgent: 'diagram-generator',
                reason: 'Diagram generation requires specialized visualization tools',
                confidence: 0.95
            }
        ];
    }

    /**
     * Validate a task before execution
     * @param {string} taskDescription - Task to validate
     * @param {string} currentAgent - Agent currently selected (if any)
     * @returns {Object} Validation result
     */
    validate(taskDescription, currentAgent = null) {
        const result = {
            valid: true,
            blocked: false,
            warnings: [],
            errors: [],
            recommendations: [],
            requiredAgent: null,
            currentAgent: currentAgent,
            severity: 'LOW'
        };

        // Check mandatory rules
        for (const rule of this.mandatoryRules) {
            if (rule.pattern.test(taskDescription)) {
                if (rule.block) {
                    // This operation should be blocked entirely
                    result.valid = false;
                    result.blocked = true;
                    result.severity = rule.severity;
                    result.errors.push({
                        type: 'BLOCKED_OPERATION',
                        message: `Operation BLOCKED: ${rule.reason}`,
                        severity: rule.severity,
                        complexityScore: rule.complexityScore
                    });
                } else if (!currentAgent || currentAgent !== rule.requiredAgent) {
                    // Operation requires specific agent
                    result.valid = false;
                    result.severity = rule.severity;
                    result.requiredAgent = rule.requiredAgent;
                    result.errors.push({
                        type: 'MISSING_REQUIRED_AGENT',
                        message: `Required agent: ${rule.requiredAgent}`,
                        reason: rule.reason,
                        severity: rule.severity,
                        complexityScore: rule.complexityScore
                    });
                }
            }
        }

        // Check recommended rules
        for (const rule of this.recommendedRules) {
            if (rule.pattern.test(taskDescription)) {
                if (!currentAgent || currentAgent !== rule.recommendedAgent) {
                    result.recommendations.push({
                        type: 'RECOMMENDED_AGENT',
                        agent: rule.recommendedAgent,
                        reason: rule.reason,
                        confidence: rule.confidence
                    });
                }
            }
        }

        // Add warnings if agent is missing but recommended
        if (result.recommendations.length > 0 && !currentAgent) {
            result.warnings.push({
                type: 'NO_AGENT_SELECTED',
                message: 'No agent selected, but specialized agent is recommended',
                recommendations: result.recommendations
            });
        }

        return result;
    }

    /**
     * Check if agent exists in routing index
     * @param {string} agentName - Agent to check
     * @returns {boolean} Whether agent exists
     */
    agentExists(agentName) {
        if (!this.routingIndex || (!this.routingIndex.agents && !this.routingIndex.agentsByFull)) {
            return false;
        }

        if (this.routingIndex.agents && agentName in this.routingIndex.agents) {
            return true;
        }
        if (this.routingIndex.agentsByFull && agentName in this.routingIndex.agentsByFull) {
            return true;
        }

        // Fallback: resolve short names against fully-qualified index map.
        if (this.routingIndex.agentsByShort && this.routingIndex.agentsByShort[agentName]) {
            return this.routingIndex.agentsByShort[agentName].length > 0;
        }

        return false;
    }

    /**
     * Get agent metadata from routing index
     * @param {string} agentName - Agent name
     * @returns {Object|null} Agent metadata
     */
    getAgentMetadata(agentName) {
        if (!this.routingIndex || (!this.routingIndex.agents && !this.routingIndex.agentsByFull)) {
            return null;
        }

        if (this.routingIndex.agents && this.routingIndex.agents[agentName]) {
            return this.routingIndex.agents[agentName];
        }
        if (this.routingIndex.agentsByFull && this.routingIndex.agentsByFull[agentName]) {
            return this.routingIndex.agentsByFull[agentName];
        }
        if (this.routingIndex.agentsByShort && this.routingIndex.agentsByShort[agentName] && this.routingIndex.agentsByFull) {
            const firstFull = this.routingIndex.agentsByShort[agentName][0];
            return this.routingIndex.agentsByFull[firstFull] || null;
        }

        return null;
    }

    /**
     * Format validation result for display
     * @param {Object} result - Validation result
     * @returns {string} Formatted output
     */
    format(result) {
        const lines = [];

        // Status
        if (result.blocked) {
            lines.push('🚫 VALIDATION FAILED: Operation BLOCKED');
        } else if (!result.valid) {
            lines.push('❌ VALIDATION FAILED: Missing Required Agent');
        } else if (result.warnings.length > 0) {
            lines.push('⚠️  VALIDATION WARNING: Recommendations Available');
        } else {
            lines.push('✅ VALIDATION PASSED');
        }

        lines.push('');

        // Errors
        if (result.errors.length > 0) {
            lines.push('Errors:');
            for (const error of result.errors) {
                lines.push(`  [${error.severity}] ${error.message}`);
                if (error.reason) {
                    lines.push(`    Reason: ${error.reason}`);
                }
                if (error.complexityScore) {
                    lines.push(`    Complexity: ${error.complexityScore}`);
                }
            }
            lines.push('');
        }

        // Required agent
        if (result.requiredAgent) {
            lines.push(`Required Agent: ${result.requiredAgent}`);
            lines.push('');
        }

        // Warnings
        if (result.warnings.length > 0) {
            lines.push('Warnings:');
            for (const warning of result.warnings) {
                lines.push(`  ${warning.message}`);
            }
            lines.push('');
        }

        // Recommendations
        if (result.recommendations.length > 0) {
            lines.push('Recommendations:');
            for (const rec of result.recommendations) {
                lines.push(`  • ${rec.agent} (confidence: ${(rec.confidence * 100).toFixed(0)}%)`);
                lines.push(`    ${rec.reason}`);
            }
            lines.push('');
        }

        // Current agent
        if (result.currentAgent) {
            lines.push(`Current Agent: ${result.currentAgent}`);
        } else {
            lines.push('Current Agent: None (direct execution)');
        }

        return lines.join('\n');
    }

    /**
     * Get validation summary statistics
     * @param {Object} result - Validation result
     * @returns {Object} Statistics
     */
    getStats(result) {
        return {
            valid: result.valid,
            blocked: result.blocked,
            errorCount: result.errors.length,
            warningCount: result.warnings.length,
            recommendationCount: result.recommendations.length,
            severity: result.severity,
            hasRequiredAgent: result.requiredAgent !== null,
            hasCurrentAgent: result.currentAgent !== null
        };
    }
}

// CLI interface
if (require.main === module) {
    const args = process.argv.slice(2);

    if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
        console.log('Usage: pre-execution-validator.js [options] <task description>');
        console.log('');
        console.log('Options:');
        console.log('  --help, -h        Show this help message');
        console.log('  --agent <name>    Current agent selected');
        console.log('  --verbose, -v     Show detailed validation');
        console.log('  --strict          Fail on warnings');
        console.log('');
        console.log('Examples:');
        console.log('  pre-execution-validator.js "Deploy to production"');
        console.log('  pre-execution-validator.js --agent release-coordinator "Deploy to production"');
        console.log('  pre-execution-validator.js "Merge 50 duplicate accounts"');
        process.exit(0);
    }

    const verbose = args.includes('--verbose') || args.includes('-v');
    const strict = args.includes('--strict');

    let currentAgent = null;
    const agentIndex = args.indexOf('--agent');
    if (agentIndex !== -1 && args[agentIndex + 1]) {
        currentAgent = args[agentIndex + 1];
    }

    const taskDescription = args
        .filter((a, i) => !a.startsWith('-') && (i === 0 || args[i - 1] !== '--agent'))
        .join(' ');

    if (!taskDescription) {
        console.error('Error: No task description provided');
        process.exit(1);
    }

    const validator = new PreExecutionValidator({ verbose, strict });
    const result = validator.validate(taskDescription, currentAgent);

    console.log(validator.format(result));

    // Exit with appropriate code
    if (result.blocked || !result.valid) {
        process.exit(1);
    } else if (strict && result.warnings.length > 0) {
        process.exit(2);
    }

    process.exit(0);
}

module.exports = { PreExecutionValidator };
