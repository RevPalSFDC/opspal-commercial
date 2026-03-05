#!/usr/bin/env node

/**
 * Agent Governance Wrapper
 *
 * Simplified interface for agents to integrate with the governance framework.
 * Handles risk assessment, approval workflows, and audit logging transparently.
 *
 * Usage:
 *   const AgentGovernance = require('./scripts/lib/agent-governance');
 *   const governance = new AgentGovernance('my-agent-name');
 *
 *   await governance.executeWithGovernance(operationDetails, async () => {
 *       return await myOperation();
 *   });
 *
 * @version 1.0.0
 * @created 2025-10-25
 */

const AgentRiskScorer = require('./agent-risk-scorer');
const HumanInTheLoopController = require('./human-in-the-loop-controller');
const AgentActionAuditLogger = require('./agent-action-audit-logger');
const fs = require('fs');
const path = require('path');

/**
 * Agent Governance class
 */
class AgentGovernance {
    constructor(agentName, options = {}) {
        this.agentName = agentName;
        this.verbose = options.verbose || false;

        // Initialize components
        this.riskScorer = new AgentRiskScorer({ verbose: this.verbose });
        this.approvalController = new HumanInTheLoopController({ verbose: this.verbose });
        this.auditLogger = new AgentActionAuditLogger({ verbose: this.verbose });

        // Load agent configuration
        this.agentConfig = this.loadAgentConfig();

        // Execution statistics
        this.stats = {
            totalOperations: 0,
            approvedOperations: 0,
            rejectedOperations: 0,
            blockedOperations: 0,
            overrideOperations: 0
        };
    }

    /**
     * Execute an operation with full governance (main entry point)
     *
     * @param {Object} operationDetails - Operation metadata
     * @param {Function} operationFn - Async function that executes the operation
     * @returns {Promise<Object>} Operation result with governance metadata
     */
    async executeWithGovernance(operationDetails, operationFn) {
        const startTime = Date.now();

        try {
            this.stats.totalOperations++;

            // STEP 1: Validate operation details
            this.validateOperationDetails(operationDetails);

            // STEP 2: Check emergency override
            const override = this.approvalController.checkEmergencyOverride();
            if (override) {
                console.warn(`\n⚠️  EMERGENCY OVERRIDE ACTIVE`);
                console.warn(`   Reason: ${override.reason}`);
                console.warn(`   Approver: ${override.approver}`);
                this.stats.overrideOperations++;

                // Log override usage
                await this.logOverride(override, operationDetails);

                // Execute with override
                const result = await this.executeOperation(operationFn, operationDetails, {
                    override: true
                });

                return {
                    ...result,
                    governance: {
                        override: true,
                        overrideReason: override.reason
                    }
                };
            }

            // STEP 3: Calculate risk score
            const risk = this.riskScorer.calculateRisk({
                type: operationDetails.type,
                agent: this.agentName,
                environment: operationDetails.environment || 'unknown',
                recordCount: operationDetails.recordCount || 0,
                componentCount: operationDetails.componentCount || 0,
                dependencies: operationDetails.dependencies || [],
                hasCircularDeps: operationDetails.hasCircularDeps || false,
                isRecursive: operationDetails.isRecursive || false,
                crossObject: operationDetails.crossObject || false
            });

            if (this.verbose) {
                console.log(`\n📊 Risk Assessment:`);
                console.log(`   Score: ${risk.riskScore}/100 (${risk.riskLevel})`);
            }

            // STEP 4: Check if blocked
            if (risk.blocked) {
                this.stats.blockedOperations++;

                console.error(`\n❌ OPERATION BLOCKED`);
                console.error(`   Risk Score: ${risk.riskScore}/100 (${risk.riskLevel})`);
                console.error(`   Reason: Risk score exceeds critical threshold (70)`);
                console.error(`\n   Recommendations:`);
                risk.recommendations.forEach((rec, i) => {
                    console.error(`   ${i + 1}. [${rec.type}] ${rec.message}`);
                    console.error(`       → ${rec.action}`);
                });

                // Log blocked operation
                await this.auditLogger.logAction({
                    agent: this.agentName,
                    operation: operationDetails.type,
                    risk: risk,
                    approval: { status: 'BLOCKED' },
                    execution: {
                        startTime: new Date().toISOString(),
                        endTime: new Date().toISOString(),
                        durationMs: Date.now() - startTime,
                        success: false,
                        errors: ['Operation blocked due to critical risk']
                    },
                    verification: { performed: false },
                    reasoning: {
                        intent: operationDetails.reasoning || '',
                        decisionRationale: 'Blocked by governance framework'
                    },
                    rollback: {
                        planExists: false
                    }
                });

                throw new Error(`Operation blocked due to critical risk (score: ${risk.riskScore}/100)`);
            }

            // STEP 5: Request approval if needed
            let approval = { status: 'NOT_REQUIRED', granted: true };

            if (risk.requiresApproval) {
                approval = await this.approvalController.requestApproval({
                    operation: operationDetails.type,
                    description: operationDetails.description,
                    agent: this.agentName,
                    target: operationDetails.environment,
                    risk: risk,
                    reasoning: operationDetails.reasoning || 'No reasoning provided',
                    rollbackPlan: operationDetails.rollbackPlan || 'No rollback plan provided',
                    affectedComponents: operationDetails.affectedComponents || [],
                    affectedUsers: operationDetails.affectedUsers || 0
                });

                if (!approval.granted) {
                    this.stats.rejectedOperations++;

                    console.error(`\n❌ OPERATION REJECTED`);
                    console.error(`   Reason: ${approval.reason || 'No reason provided'}`);

                    // Log rejection
                    await this.auditLogger.logAction({
                        agent: this.agentName,
                        operation: operationDetails.type,
                        risk: risk,
                        approval: approval,
                        execution: {
                            startTime: new Date().toISOString(),
                            endTime: new Date().toISOString(),
                            durationMs: Date.now() - startTime,
                            success: false,
                            errors: ['Operation rejected by approver']
                        },
                        verification: { performed: false },
                        reasoning: {
                            intent: operationDetails.reasoning || ''
                        },
                        rollback: {
                            planExists: !!operationDetails.rollbackPlan
                        }
                    });

                    throw new Error(`Operation rejected: ${approval.reason}`);
                }

                this.stats.approvedOperations++;
                console.log(`\n✅ Approval granted by ${approval.approver}`);
            }

            // STEP 6: Execute operation
            const result = await this.executeOperation(operationFn, operationDetails, {
                risk: risk,
                approval: approval
            });

            return result;

        } catch (error) {
            console.error(`\nGovernance execution failed:`, error.message);
            throw error;
        }
    }

    /**
     * Execute the actual operation with monitoring
     */
    async executeOperation(operationFn, operationDetails, context) {
        const executionStartTime = Date.now();

        try {
            // Execute the operation
            const result = await operationFn();

            const executionEndTime = Date.now();
            const durationMs = executionEndTime - executionStartTime;

            // Log successful execution
            await this.auditLogger.logAction({
                agent: this.agentName,
                operation: operationDetails.type,
                risk: context.risk || {},
                approval: context.approval || { status: 'NOT_REQUIRED' },
                environment: {
                    org: operationDetails.environment,
                    orgId: operationDetails.orgId,
                    instanceUrl: operationDetails.instanceUrl
                },
                operationDetails: {
                    description: operationDetails.description,
                    affectedComponents: operationDetails.affectedComponents || [],
                    affectedUsers: operationDetails.affectedUsers || 0
                },
                execution: {
                    startTime: new Date(executionStartTime).toISOString(),
                    endTime: new Date(executionEndTime).toISOString(),
                    durationMs: durationMs,
                    success: true,
                    errors: []
                },
                verification: {
                    performed: result.verification?.performed || false,
                    passed: result.verification?.passed || false,
                    method: result.verification?.method || null
                },
                reasoning: {
                    intent: operationDetails.reasoning || '',
                    alternativesConsidered: operationDetails.alternativesConsidered || [],
                    decisionRationale: operationDetails.decisionRationale || ''
                },
                rollback: {
                    planExists: !!operationDetails.rollbackPlan,
                    planDescription: operationDetails.rollbackPlan || null,
                    rollbackCommand: operationDetails.rollbackCommand || null
                }
            });

            return {
                ...result,
                governance: {
                    riskScore: context.risk?.riskScore || 0,
                    riskLevel: context.risk?.riskLevel || 'UNKNOWN',
                    approvalRequired: context.risk?.requiresApproval || false,
                    approvalGranted: context.approval?.granted || false,
                    override: context.override || false,
                    auditLogged: true
                }
            };

        } catch (error) {
            const executionEndTime = Date.now();
            const durationMs = executionEndTime - executionStartTime;

            // Log failed execution
            await this.auditLogger.logAction({
                agent: this.agentName,
                operation: operationDetails.type,
                risk: context.risk || {},
                approval: context.approval || { status: 'NOT_REQUIRED' },
                environment: {
                    org: operationDetails.environment
                },
                execution: {
                    startTime: new Date(executionStartTime).toISOString(),
                    endTime: new Date(executionEndTime).toISOString(),
                    durationMs: durationMs,
                    success: false,
                    errors: [error.message]
                },
                verification: { performed: false },
                reasoning: {
                    intent: operationDetails.reasoning || ''
                },
                rollback: {
                    planExists: !!operationDetails.rollbackPlan
                }
            });

            throw error;
        }
    }

    /**
     * Assess risk without executing
     */
    async assessRisk(operationDetails) {
        return this.riskScorer.calculateRisk({
            type: operationDetails.type,
            agent: this.agentName,
            environment: operationDetails.environment || 'unknown',
            recordCount: operationDetails.recordCount || 0,
            componentCount: operationDetails.componentCount || 0,
            dependencies: operationDetails.dependencies || [],
            hasCircularDeps: operationDetails.hasCircularDeps || false,
            isRecursive: operationDetails.isRecursive || false,
            crossObject: operationDetails.crossObject || false
        });
    }

    /**
     * Request approval only (without execution)
     */
    async requestApproval(operationDetails, risk) {
        return await this.approvalController.requestApproval({
            operation: operationDetails.type,
            description: operationDetails.description,
            agent: this.agentName,
            target: operationDetails.environment,
            risk: risk,
            reasoning: operationDetails.reasoning || 'No reasoning provided',
            rollbackPlan: operationDetails.rollbackPlan || 'No rollback plan provided',
            affectedComponents: operationDetails.affectedComponents || [],
            affectedUsers: operationDetails.affectedUsers || 0
        });
    }

    /**
     * Log action only (without execution)
     */
    async logAction(operationDetails, risk, approval, execution) {
        return await this.auditLogger.logAction({
            agent: this.agentName,
            operation: operationDetails.type,
            risk: risk,
            approval: approval,
            environment: {
                org: operationDetails.environment
            },
            execution: execution,
            reasoning: {
                intent: operationDetails.reasoning || ''
            },
            rollback: {
                planExists: !!operationDetails.rollbackPlan
            }
        });
    }

    /**
     * Validate operation details
     */
    validateOperationDetails(details) {
        if (!details) {
            throw new Error('Operation details are required');
        }

        if (!details.type) {
            throw new Error('Operation type is required');
        }

        if (!details.environment) {
            console.warn('Warning: Environment not specified, defaulting to unknown');
        }
    }

    /**
     * Load agent configuration from permission matrix
     */
    loadAgentConfig() {
        try {
            const matrixPath = path.join(
                __dirname,
                '..',
                '..',
                'config',
                'agent-permission-matrix.json'
            );

            if (fs.existsSync(matrixPath)) {
                const matrix = JSON.parse(fs.readFileSync(matrixPath, 'utf8'));
                return matrix.agents?.[this.agentName] || null;
            }
        } catch (error) {
            if (this.verbose) {
                console.warn('Could not load agent configuration:', error.message);
            }
        }

        return null;
    }

    /**
     * Log emergency override usage
     */
    async logOverride(override, operationDetails) {
        console.warn(`\n🚨 EMERGENCY OVERRIDE LOGGED`);
        console.warn(`   Agent: ${this.agentName}`);
        console.warn(`   Operation: ${operationDetails.type}`);
        console.warn(`   Reason: ${override.reason}`);
        console.warn(`   Approver: ${override.approver}`);
        console.warn(`   Timestamp: ${override.timestamp}`);

        // Send immediate notification
        if (process.env.SLACK_WEBHOOK_URL) {
            try {
                await fetch(process.env.SLACK_WEBHOOK_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        text: `🚨 EMERGENCY OVERRIDE USED`,
                        blocks: [
                            {
                                type: 'header',
                                text: {
                                    type: 'plain_text',
                                    text: '🚨 Emergency Override Used'
                                }
                            },
                            {
                                type: 'section',
                                fields: [
                                    { type: 'mrkdwn', text: `*Agent:*\n${this.agentName}` },
                                    { type: 'mrkdwn', text: `*Operation:*\n${operationDetails.type}` },
                                    { type: 'mrkdwn', text: `*Reason:*\n${override.reason}` },
                                    { type: 'mrkdwn', text: `*Approver:*\n${override.approver}` }
                                ]
                            }
                        ]
                    })
                });
            } catch (error) {
                console.error('Failed to send override notification:', error.message);
            }
        }
    }

    /**
     * Get execution statistics
     */
    getStats() {
        return {
            ...this.stats,
            approvalRate: this.stats.totalOperations > 0 ?
                this.stats.approvedOperations / this.stats.totalOperations : 0,
            rejectionRate: this.stats.totalOperations > 0 ?
                this.stats.rejectedOperations / this.stats.totalOperations : 0,
            blockRate: this.stats.totalOperations > 0 ?
                this.stats.blockedOperations / this.stats.totalOperations : 0
        };
    }
}

/**
 * Standalone functions for quick governance checks
 */

/**
 * Quick risk check
 */
async function quickRiskCheck(agentName, operationType, environment, options = {}) {
    const scorer = new AgentRiskScorer({ verbose: options.verbose });

    return scorer.calculateRisk({
        type: operationType,
        agent: agentName,
        environment: environment,
        recordCount: options.recordCount || 0,
        componentCount: options.componentCount || 0,
        dependencies: options.dependencies || [],
        hasCircularDeps: options.hasCircularDeps || false,
        isRecursive: options.isRecursive || false,
        crossObject: options.crossObject || false
    });
}

/**
 * Check if agent has permission
 */
function checkAgentPermission(agentName, permission, environment = 'production') {
    try {
        const matrixPath = path.join(
            __dirname,
            '..',
            '..',
            'config',
            'agent-permission-matrix.json'
        );

        if (!fs.existsSync(matrixPath)) {
            return false;
        }

        const matrix = JSON.parse(fs.readFileSync(matrixPath, 'utf8'));
        const agentConfig = matrix.agents?.[agentName];

        if (!agentConfig) {
            return false;
        }

        // Check if permission is in agent's permission array
        const permissions = agentConfig.permissions || [];
        return permissions.some(p =>
            p === permission || p.startsWith(permission + ':') || p === '*'
        );

    } catch (error) {
        console.error('Error checking agent permission:', error.message);
        return false;
    }
}

/**
 * CLI interface
 */
if (require.main === module) {
    const args = process.argv.slice(2);
    const command = args[0];

    if (!command || command === '--help' || command === '-h') {
        console.log(`
Agent Governance Wrapper - Simplified governance interface for agents

Commands:
  check-permissions <agent>   Check agent permissions
  list-by-tier <tier>         List agents by permission tier
  validate-agent <agent>      Validate agent configuration
  activity-summary <agent>    Show agent activity summary
  stats                       Show governance statistics

Examples:
  # Check agent permissions
  node agent-governance.js check-permissions sfdc-security-admin

  # List tier 4 agents
  node agent-governance.js list-by-tier 4

  # Validate agent
  node agent-governance.js validate-agent sfdc-metadata-manager
`);
        process.exit(0);
    }

    (async () => {
        try {
            if (command === 'check-permissions') {
                const agentName = args[1];
                if (!agentName) {
                    throw new Error('Agent name required');
                }

                const matrixPath = path.join(
                    __dirname,
                    '..',
                    '..',
                    'config',
                    'agent-permission-matrix.json'
                );

                const matrix = JSON.parse(fs.readFileSync(matrixPath, 'utf8'));
                const config = matrix.agents?.[agentName];

                if (!config) {
                    console.error(`Agent not found: ${agentName}`);
                    process.exit(1);
                }

                console.log(`\nAgent: ${agentName}`);
                console.log(`Tier: ${config.tier}`);
                console.log(`Permissions: ${config.permissions.join(', ')}`);
                console.log(`Requires Approval: ${JSON.stringify(config.requiresApproval, null, 2)}`);

            } else if (command === 'list-by-tier') {
                const tier = parseInt(args[1], 10);
                if (isNaN(tier)) {
                    throw new Error('Tier number required');
                }

                const matrixPath = path.join(
                    __dirname,
                    '..',
                    '..',
                    'config',
                    'agent-permission-matrix.json'
                );

                const matrix = JSON.parse(fs.readFileSync(matrixPath, 'utf8'));
                const agents = Object.entries(matrix.agents || {})
                    .filter(([name, config]) => config.tier === tier)
                    .map(([name, config]) => ({
                        name,
                        description: config.description,
                        permissions: config.permissions
                    }));

                console.log(`\nTier ${tier} Agents (${agents.length}):\n`);
                agents.forEach(agent => {
                    console.log(`  ${agent.name}`);
                    console.log(`    ${agent.description}`);
                    console.log(`    Permissions: ${agent.permissions.join(', ')}\n`);
                });

            } else {
                throw new Error(`Unknown command: ${command}`);
            }

            process.exit(0);

        } catch (error) {
            console.error('Error:', error.message);
            process.exit(1);
        }
    })();
}

module.exports = AgentGovernance;
module.exports.quickRiskCheck = quickRiskCheck;
module.exports.checkAgentPermission = checkAgentPermission;
