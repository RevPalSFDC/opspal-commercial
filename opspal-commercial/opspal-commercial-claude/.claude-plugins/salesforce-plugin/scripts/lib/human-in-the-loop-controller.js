#!/usr/bin/env node

/**
 * Human-in-the-Loop Controller
 *
 * Manages approval workflows for high-risk autonomous agent operations.
 * Provides multiple approval mechanisms: interactive, Slack, email, and file-based.
 *
 * Features:
 * - Risk-based approval routing
 * - Multi-approver support
 * - Timeout handling
 * - Emergency override
 * - Approval audit trail
 *
 * @version 1.0.0
 * @created 2025-10-25
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const readline = require('readline');
const { DataAccessError } = require('../../../cross-platform-plugin/scripts/lib/data-access-error');
const { monitoringUtils } = require('../monitoring/monitoring-utils');

// Import Change Ticket Manager for Jira integration (Phase 2)
let ChangeTicketManager;
try {
    ChangeTicketManager = require('./change-ticket-manager');
} catch (error) {
    // Change ticket manager not available (pre-Phase 2)
    ChangeTicketManager = null;
}

/**
 * Human-in-the-Loop Controller class
 */
class HumanInTheLoopController {
    constructor(options = {}) {
        this.verbose = options.verbose || false;

        // Approval directory
        const defaultApprovalDir = path.join(
            process.env.HOME || process.env.USERPROFILE,
            '.claude',
            'approvals'
        );
        this.approvalDir = options.approvalDir || defaultApprovalDir;
        this.ensureApprovalDirectory();

        // Load permission matrix
        this.permissionMatrix = this.loadPermissionMatrix();

        // Approval timeout (default 4 hours)
        this.defaultTimeout = options.timeout || 4 * 60 * 60 * 1000;

        // Notification configuration
        this.slackWebhook = process.env.SLACK_WEBHOOK_URL;
        this.notificationEmail = process.env.NOTIFICATION_EMAIL;
    }

    /**
     * Request approval for a high-risk operation
     *
     * @param {Object} request - Approval request
     * @param {string} request.operation - Operation type
     * @param {string} request.agent - Agent name
     * @param {string} request.target - Target environment/org
     * @param {Object} request.risk - Risk assessment
     * @param {string} request.reasoning - Why this operation is needed
     * @param {string} request.rollbackPlan - How to undo if issues occur
     * @param {Array<string>} request.affectedComponents - Components affected
     * @param {number} request.affectedUsers - Number of users affected
     * @returns {Promise<Object>} Approval result
     */
    async requestApproval(request) {
        const startTime = Date.now();

        try {
            // Validate request
            this.validateRequest(request);

            // Generate request ID
            const requestId = this.generateRequestId();

            // Determine required approvers
            const approvers = this.determineApprovers(request);

            // Create approval request record
            const approvalRequest = {
                requestId,
                timestamp: new Date().toISOString(),
                agent: request.agent,
                operation: {
                    type: request.operation,
                    description: request.description || '',
                    target: request.target,
                    affectedUsers: request.affectedUsers || 0,
                    affectedComponents: request.affectedComponents || []
                },
                riskScore: request.risk.riskScore,
                riskLevel: request.risk.riskLevel,
                riskFactors: this.extractRiskFactors(request.risk),
                reasoning: request.reasoning,
                rollbackPlan: request.rollbackPlan,
                requiredApprovers: approvers,
                approvalDeadline: new Date(Date.now() + this.defaultTimeout).toISOString(),
                status: 'PENDING',
                approvals: [],
                rejections: []
            };

            // Save request to disk
            this.saveApprovalRequest(approvalRequest);

            // Send notifications
            await this.sendNotifications(approvalRequest);

            // Create change ticket if HIGH or CRITICAL risk (Phase 2)
            if (ChangeTicketManager && (request.risk.riskLevel === 'HIGH' || request.risk.riskLevel === 'CRITICAL')) {
                try {
                    const ticketManager = new ChangeTicketManager({ verbose: this.verbose });
                    const ticket = await ticketManager.createTicket(
                        {
                            agent: request.agent,
                            type: request.operation,
                            target: request.target
                        },
                        request.risk,
                        approvalRequest
                    );

                    if (ticket) {
                        approvalRequest.changeTicket = {
                            system: ticket.system,
                            ticketId: ticket.ticketId,
                            ticketUrl: ticket.ticketUrl,
                            created: ticket.created
                        };

                        // Save updated request with ticket info
                        this.saveApprovalRequest(approvalRequest);

                        console.log(`\n📋 Change ticket created: ${ticket.ticketId}`);
                        console.log(`   View: ${ticket.ticketUrl}\n`);
                    }
                } catch (error) {
                    console.warn(`Failed to create change ticket: ${error.message}`);
                    // Continue with approval process even if ticket creation fails
                }
            }

            // Check for interactive mode
            if (process.stdin.isTTY && !process.env.CI) {
                // Interactive approval
                const result = await this.requestInteractiveApproval(approvalRequest);
                return result;
            } else {
                // Non-interactive - use file-based or async approval
                return await this.requestAsyncApproval(approvalRequest);
            }

        } catch (error) {
            console.error('Failed to request approval:', error);
            return {
                granted: false,
                reason: error.message,
                duration: Date.now() - startTime
            };
        }
    }

    /**
     * Request interactive approval (CLI)
     */
    async requestInteractiveApproval(approvalRequest) {
        console.log('\n' + '='.repeat(70));
        console.log('APPROVAL REQUIRED');
        console.log('='.repeat(70));
        console.log(`\nRequest ID: ${approvalRequest.requestId}`);
        console.log(`Agent: ${approvalRequest.agent}`);
        console.log(`Operation: ${approvalRequest.operation.type}`);
        console.log(`Target: ${approvalRequest.operation.target}`);
        console.log(`\nRisk Score: ${approvalRequest.riskScore}/100 (${approvalRequest.riskLevel})`);

        console.log(`\nRisk Factors:`);
        approvalRequest.riskFactors.forEach(f => console.log(`  - ${f}`));

        console.log(`\nReasoning:`);
        console.log(`  ${approvalRequest.reasoning}`);

        if (approvalRequest.operation.affectedUsers > 0) {
            console.log(`\nAffected Users: ${approvalRequest.operation.affectedUsers}`);
        }

        if (approvalRequest.operation.affectedComponents.length > 0) {
            console.log(`\nAffected Components:`);
            approvalRequest.operation.affectedComponents.forEach(c => console.log(`  - ${c}`));
        }

        console.log(`\nRollback Plan:`);
        console.log(`  ${approvalRequest.rollbackPlan}`);

        console.log(`\nRequired Approvers: ${approvalRequest.requiredApprovers.join(', ')}`);
        console.log('='.repeat(70));

        // Prompt for approval
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        return new Promise((resolve) => {
            rl.question('\nApprove this operation? (yes/no/details): ', async (answer) => {
                rl.close();

                const normalized = answer.toLowerCase().trim();

                if (normalized === 'yes' || normalized === 'y') {
                    // Request approver identity
                    const rl2 = readline.createInterface({
                        input: process.stdin,
                        output: process.stdout
                    });

                    rl2.question('Enter your email for audit trail: ', async (email) => {
                        rl2.close();

                        const approval = {
                            granted: true,
                            approver: email,
                            approvalTime: new Date().toISOString(),
                            method: 'interactive',
                            requestId: approvalRequest.requestId
                        };

                        // Update request status
                        approvalRequest.status = 'GRANTED';
                        approvalRequest.approvals.push(approval);
                        this.saveApprovalRequest(approvalRequest);

                        // Update change ticket if exists (Phase 2)
                        await this.updateChangeTicket(approvalRequest, 'GRANTED', `Approved by ${email}`);

                        console.log('\n✅ Operation approved');
                        resolve(approval);
                    });

                } else if (normalized === 'no' || normalized === 'n') {
                    // Request reason
                    const rl3 = readline.createInterface({
                        input: process.stdin,
                        output: process.stdout
                    });

                    rl3.question('Reason for rejection: ', async (reason) => {
                        rl3.close();

                        const rejection = {
                            granted: false,
                            reason: reason || 'Rejected by approver',
                            approvalTime: new Date().toISOString(),
                            method: 'interactive',
                            requestId: approvalRequest.requestId
                        };

                        // Update request status
                        approvalRequest.status = 'REJECTED';
                        approvalRequest.rejections.push(rejection);
                        this.saveApprovalRequest(approvalRequest);

                        // Update change ticket if exists (Phase 2)
                        await this.updateChangeTicket(approvalRequest, 'REJECTED', reason);

                        console.log('\n❌ Operation rejected');
                        resolve(rejection);
                    });

                } else if (normalized === 'details') {
                    // Show full details as JSON
                    console.log('\nFull Request Details:');
                    console.log(JSON.stringify(approvalRequest, null, 2));

                    // Re-prompt
                    const result = await this.requestInteractiveApproval(approvalRequest);
                    resolve(result);

                } else {
                    console.log('\n❌ Invalid response. Operation blocked.');
                    resolve({
                        granted: false,
                        reason: 'Invalid approval response',
                        method: 'interactive'
                    });
                }
            });
        });
    }

    /**
     * Request async approval (file-based or external system)
     */
    async requestAsyncApproval(approvalRequest) {
        console.log(`\n⏳ Approval request created: ${approvalRequest.requestId}`);
        console.log(`   Waiting for approval...`);
        console.log(`   Check: ${this.getApprovalFilePath(approvalRequest.requestId)}`);
        console.log(`   Deadline: ${approvalRequest.approvalDeadline}`);

        // In async mode, return pending status
        // Actual approval will be checked later via checkApprovalStatus()
        return {
            granted: false,
            status: 'PENDING',
            requestId: approvalRequest.requestId,
            approvalFile: this.getApprovalFilePath(approvalRequest.requestId),
            instructions: 'To approve: Create file with {"granted": true, "approver": "your-email@example.com"}'
        };
    }

    /**
     * Check approval status (for async workflows)
     */
    checkApprovalStatus(requestId) {
        const requestFile = this.getApprovalFilePath(requestId);

        if (!fs.existsSync(requestFile)) {
            return {
                status: 'NOT_FOUND',
                granted: false,
                reason: 'Approval request not found'
            };
        }

        const request = JSON.parse(fs.readFileSync(requestFile, 'utf8'));

        // Check timeout
        const deadline = new Date(request.approvalDeadline);
        if (new Date() > deadline && request.status === 'PENDING') {
            request.status = 'TIMEOUT';
            this.saveApprovalRequest(request);
            return {
                status: 'TIMEOUT',
                granted: false,
                reason: 'Approval deadline exceeded'
            };
        }

        return {
            status: request.status,
            granted: request.status === 'GRANTED',
            approvals: request.approvals,
            rejections: request.rejections
        };
    }

    /**
     * Determine required approvers based on operation and risk
     */
    determineApprovers(request) {
        const riskLevel = request.risk.riskLevel;
        const operation = request.operation.toUpperCase();

        // Get approval routing config
        const routing = this.permissionMatrix?.approvalRouting?.[riskLevel];

        if (!routing || !routing.requiresApproval) {
            return [];
        }

        // Determine operation category
        let category = 'dataOperations'; // default

        if (operation.includes('DEPLOY') || operation.includes('METADATA')) {
            category = 'metadataDeployment';
        } else if (operation.includes('SECURITY') || operation.includes('PERMISSION') ||
                   operation.includes('PROFILE') || operation.includes('ROLE')) {
            category = 'securityChanges';
        } else if (operation.includes('DELETE')) {
            category = 'destructiveOperations';
        }

        return routing.approvers?.[category] || ['team-lead'];
    }

    /**
     * Extract risk factors for display
     */
    extractRiskFactors(risk) {
        const factors = [];

        if (risk.breakdown?.impactScore) {
            factors.push(`Impact: ${risk.breakdown.impactScore.score}/30 (${risk.breakdown.impactScore.factors.join(', ')})`);
        }

        if (risk.breakdown?.environmentRisk) {
            factors.push(`Environment: ${risk.breakdown.environmentRisk.score}/25 (${risk.breakdown.environmentRisk.environment})`);
        }

        if (risk.breakdown?.volumeRisk) {
            const vol = risk.breakdown.volumeRisk;
            if (vol.recordCount > 0 || vol.componentCount > 0) {
                factors.push(`Volume: ${vol.score}/20 (${vol.recordCount || vol.componentCount} items)`);
            }
        }

        if (risk.breakdown?.historicalRisk) {
            const hist = risk.breakdown.historicalRisk;
            if (hist.failureRate > 0) {
                factors.push(`Historical: ${hist.score}/15 (${(hist.failureRate * 100).toFixed(1)}% failure rate)`);
            }
        }

        if (risk.breakdown?.complexityRisk) {
            factors.push(`Complexity: ${risk.breakdown.complexityRisk.score}/10 (${risk.breakdown.complexityRisk.factors.join(', ')})`);
        }

        return factors;
    }

    /**
     * Send notifications to approvers
     */
    async sendNotifications(approvalRequest) {
        const notifications = [];

        // Slack notification
        if (this.slackWebhook) {
            notifications.push(this.sendSlackNotification(approvalRequest));
        }

        // Email notification
        if (this.notificationEmail) {
            notifications.push(this.sendEmailNotification(approvalRequest));
        }

        await Promise.allSettled(notifications);
    }

    /**
     * Send Slack notification
     */
    async sendSlackNotification(approvalRequest) {
        try {
            const message = {
                text: `🚨 Agent Approval Required`,
                blocks: [
                    {
                        type: 'header',
                        text: {
                            type: 'plain_text',
                            text: '🚨 Agent Approval Required'
                        }
                    },
                    {
                        type: 'section',
                        fields: [
                            {
                                type: 'mrkdwn',
                                text: `*Request ID:*\n${approvalRequest.requestId}`
                            },
                            {
                                type: 'mrkdwn',
                                text: `*Agent:*\n${approvalRequest.agent}`
                            },
                            {
                                type: 'mrkdwn',
                                text: `*Operation:*\n${approvalRequest.operation.type}`
                            },
                            {
                                type: 'mrkdwn',
                                text: `*Target:*\n${approvalRequest.operation.target}`
                            },
                            {
                                type: 'mrkdwn',
                                text: `*Risk Score:*\n${approvalRequest.riskScore}/100 (${approvalRequest.riskLevel})`
                            },
                            {
                                type: 'mrkdwn',
                                text: `*Deadline:*\n${new Date(approvalRequest.approvalDeadline).toLocaleString()}`
                            }
                        ]
                    },
                    {
                        type: 'section',
                        text: {
                            type: 'mrkdwn',
                            text: `*Reasoning:*\n${approvalRequest.reasoning}`
                        }
                    },
                    {
                        type: 'section',
                        text: {
                            type: 'mrkdwn',
                            text: `*Rollback Plan:*\n${approvalRequest.rollbackPlan}`
                        }
                    },
                    {
                        type: 'context',
                        elements: [
                            {
                                type: 'mrkdwn',
                                text: `Approvers: ${approvalRequest.requiredApprovers.join(', ')}`
                            }
                        ]
                    },
                    {
                        type: 'actions',
                        elements: [
                            {
                                type: 'button',
                                text: {
                                    type: 'plain_text',
                                    text: 'View Details'
                                },
                                url: `file://${this.getApprovalFilePath(approvalRequest.requestId)}`
                            }
                        ]
                    }
                ]
            };

            const response = await fetch(this.slackWebhook, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(message)
            });

            if (!response.ok) {
                throw new Error(`Slack returned ${response.status}`);
            }

            if (this.verbose) {
                console.log('✅ Slack notification sent');
            }

        } catch (error) {
            if (this.verbose) {
                console.error('Failed to send Slack notification:', error.message);
            }
        }
    }

    /**
     * Send email notification
     */
    async sendEmailNotification(approvalRequest) {
        if (!this.notificationEmail) {
            return false;
        }

        const recipients = this.notificationEmail
            .split(',')
            .map(value => value.trim())
            .filter(Boolean);

        if (recipients.length === 0) {
            return false;
        }

        const subject = `Approval required: ${approvalRequest.operation.type} (${approvalRequest.riskLevel})`;
        const body = `
Approval required for high-risk operation.

Request ID: ${approvalRequest.requestId}
Agent: ${approvalRequest.agent}
Operation: ${approvalRequest.operation.type}
Target: ${approvalRequest.operation.target}
Risk: ${approvalRequest.riskScore}/100 (${approvalRequest.riskLevel})
Deadline: ${new Date(approvalRequest.approvalDeadline).toLocaleString()}

Reasoning:
${approvalRequest.reasoning}

Rollback Plan:
${approvalRequest.rollbackPlan}

Approvers: ${approvalRequest.requiredApprovers.join(', ')}

Approval file:
${this.getApprovalFilePath(approvalRequest.requestId)}
        `.trim();

        const sent = await monitoringUtils.sendEmailAlert(
            subject,
            body,
            recipients,
            [],
            { force: true }
        );

        if (!sent && this.verbose) {
            console.warn('Email notification failed to send');
        }

        return sent;
    }

    /**
     * Validate approval request
     */
    validateRequest(request) {
        if (!request) {
            throw new Error('Approval request is required');
        }

        const required = ['operation', 'agent', 'target', 'risk', 'reasoning', 'rollbackPlan'];
        for (const field of required) {
            if (!request[field]) {
                throw new Error(`${field} is required in approval request`);
            }
        }

        if (!request.risk.riskScore || !request.risk.riskLevel) {
            throw new Error('Risk assessment must include riskScore and riskLevel');
        }
    }

    /**
     * Generate unique request ID
     */
    generateRequestId() {
        const date = new Date().toISOString().split('T')[0];
        const time = Date.now();
        const random = crypto.randomBytes(2).toString('hex');
        return `AR-${date}-${time}-${random}`.toUpperCase();
    }

    /**
     * Get approval file path
     */
    getApprovalFilePath(requestId) {
        return path.join(this.approvalDir, 'pending', `${requestId}.json`);
    }

    /**
     * Save approval request to disk
     */
    saveApprovalRequest(request) {
        const filePath = this.getApprovalFilePath(request.requestId);
        const dir = path.dirname(filePath);

        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        fs.writeFileSync(filePath, JSON.stringify(request, null, 2), 'utf8');
    }

    /**
     * Ensure approval directory exists
     */
    ensureApprovalDirectory() {
        const dirs = [
            this.approvalDir,
            path.join(this.approvalDir, 'pending'),
            path.join(this.approvalDir, 'approved'),
            path.join(this.approvalDir, 'rejected'),
            path.join(this.approvalDir, 'timeout')
        ];

        for (const dir of dirs) {
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
        }
    }

    /**
     * Load permission matrix
     */
    loadPermissionMatrix() {
        try {
            const matrixPath = path.join(
                __dirname,
                '..',
                '..',
                'config',
                'agent-permission-matrix.json'
            );

            if (fs.existsSync(matrixPath)) {
                return JSON.parse(fs.readFileSync(matrixPath, 'utf8'));
            }
        } catch (error) {
            if (this.verbose) {
                console.warn('Could not load permission matrix:', error.message);
            }
        }

        return null;
    }

    /**
     * Check for emergency override
     */
    checkEmergencyOverride() {
        if (!process.env.AGENT_GOVERNANCE_OVERRIDE) {
            return null;
        }

        const override = {
            enabled: true,
            reason: process.env.OVERRIDE_REASON || 'No reason provided',
            approver: process.env.OVERRIDE_APPROVER || 'Unknown',
            code: process.env.OVERRIDE_APPROVAL_CODE || null,
            timestamp: new Date().toISOString()
        };

        // Validate override code if required
        if (this.permissionMatrix?.emergencyOverride?.requiresCode) {
            if (!override.code) {
                console.error('❌ Emergency override code required but not provided');
                return null;
            }

            const validation = this.validateOverrideCode(override);
            if (!validation.valid) {
                throw new DataAccessError(
                    'Human_In_The_Loop_Security',
                    'Emergency override code validation failed',
                    {
                        method: 'getEmergencyOverride',
                        status: 'invalid',
                        reason: validation.reason,
                        codeSource: validation.source,
                        expiresAt: validation.expiresAt || null,
                        recommendation: 'Provide a valid override code or use standard approval workflows',
                        tracking_issue: 'https://github.com/RevPalSFDC/opspal-plugin-internal-marketplace/issues/TBD'
                    }
                );
            }

            override.codeValidated = true;
            override.codeSource = validation.source;
            override.codeExpiresAt = validation.expiresAt || null;
        }

        return override;
    }

    validateOverrideCode(override) {
        const now = new Date();
        const config = this.permissionMatrix?.emergencyOverride || {};
        const validityMinutes = config.codeValidityMinutes;
        const issuedAtEnv = process.env.OVERRIDE_CODE_ISSUED_AT;

        if (issuedAtEnv && validityMinutes) {
            const issuedAt = new Date(issuedAtEnv);
            const expiresAt = new Date(issuedAt.getTime() + validityMinutes * 60 * 1000);
            if (Number.isNaN(issuedAt.getTime())) {
                return { valid: false, reason: 'invalid_issued_at', source: 'env' };
            }
            if (now > expiresAt) {
                return { valid: false, reason: 'expired', source: 'env', expiresAt: expiresAt.toISOString() };
            }
        }

        const envHash = process.env.AGENT_GOVERNANCE_OVERRIDE_CODE_HASH;
        if (envHash) {
            const salt = process.env.AGENT_GOVERNANCE_OVERRIDE_CODE_SALT || '';
            const hashed = this.hashOverrideCode(override.code, salt);
            const matches = this.safeCompare(hashed, envHash);
            return {
                valid: matches,
                reason: matches ? null : 'hash_mismatch',
                source: 'env_hash'
            };
        }

        const envCode = process.env.AGENT_GOVERNANCE_OVERRIDE_CODE;
        if (envCode) {
            const matches = this.safeCompare(override.code, envCode);
            return {
                valid: matches,
                reason: matches ? null : 'code_mismatch',
                source: 'env_code'
            };
        }

        const registry = this.loadOverrideCodeRegistry();
        if (registry?.codes?.length) {
            for (const entry of registry.codes) {
                if (entry.used) {
                    continue;
                }
                const expiresAt = entry.expiresAt ? new Date(entry.expiresAt) : null;
                if (expiresAt && now > expiresAt) {
                    continue;
                }
                if (entry.issuedAt && validityMinutes) {
                    const issuedAt = new Date(entry.issuedAt);
                    const computedExpiry = new Date(issuedAt.getTime() + validityMinutes * 60 * 1000);
                    if (now > computedExpiry) {
                        continue;
                    }
                }

                let matches = false;
                if (entry.hash) {
                    const salt = entry.salt || process.env.AGENT_GOVERNANCE_OVERRIDE_CODE_SALT || '';
                    const hashed = this.hashOverrideCode(override.code, salt);
                    matches = this.safeCompare(hashed, entry.hash);
                } else if (entry.code) {
                    matches = this.safeCompare(override.code, entry.code);
                }

                if (matches) {
                    entry.used = true;
                    entry.usedAt = now.toISOString();
                    this.persistOverrideCodeRegistry(registry);
                    return {
                        valid: true,
                        source: 'registry',
                        expiresAt: expiresAt ? expiresAt.toISOString() : null
                    };
                }
            }

            return { valid: false, reason: 'registry_mismatch', source: 'registry' };
        }

        return { valid: false, reason: 'no_codes_configured', source: 'none' };
    }

    hashOverrideCode(code, salt) {
        return crypto.createHash('sha256').update(`${salt}${code}`).digest('hex');
    }

    safeCompare(a, b) {
        if (!a || !b) {
            return false;
        }
        const bufA = Buffer.from(String(a));
        const bufB = Buffer.from(String(b));
        if (bufA.length !== bufB.length) {
            return false;
        }
        return crypto.timingSafeEqual(bufA, bufB);
    }

    loadOverrideCodeRegistry() {
        const registryPath = process.env.AGENT_GOVERNANCE_OVERRIDE_CODES_FILE
            || path.join(this.approvalDir, 'override-codes.json');
        if (!fs.existsSync(registryPath)) {
            return null;
        }
        try {
            const data = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
            return { path: registryPath, codes: data.codes || [] };
        } catch (error) {
            if (this.verbose) {
                console.warn('Failed to load override code registry:', error.message);
            }
            return null;
        }
    }

    persistOverrideCodeRegistry(registry) {
        if (!registry || !registry.path) {
            return;
        }
        try {
            fs.writeFileSync(registry.path, JSON.stringify({ codes: registry.codes }, null, 2), 'utf8');
        } catch (error) {
            if (this.verbose) {
                console.warn('Failed to persist override code registry:', error.message);
            }
        }
    }

    /**
     * List pending approvals
     */
    listPendingApprovals() {
        const pendingDir = path.join(this.approvalDir, 'pending');

        if (!fs.existsSync(pendingDir)) {
            return [];
        }

        const files = fs.readdirSync(pendingDir);
        const approvals = [];

        for (const file of files) {
            try {
                const filePath = path.join(pendingDir, file);
                const request = JSON.parse(fs.readFileSync(filePath, 'utf8'));

                // Check if timed out
                const deadline = new Date(request.approvalDeadline);
                if (new Date() > deadline) {
                    request.status = 'TIMEOUT';
                    this.saveApprovalRequest(request);
                    this.moveToTimeout(request.requestId);
                    continue;
                }

                approvals.push({
                    requestId: request.requestId,
                    agent: request.agent,
                    operation: request.operation.type,
                    target: request.operation.target,
                    riskScore: request.riskScore,
                    riskLevel: request.riskLevel,
                    deadline: request.approvalDeadline,
                    requiredApprovers: request.requiredApprovers
                });

            } catch (error) {
                console.error(`Error reading ${file}:`, error.message);
            }
        }

        return approvals;
    }

    /**
     * Move approval to archive
     */
    moveToArchive(requestId, status) {
        const sourceFile = this.getApprovalFilePath(requestId);
        const targetDir = path.join(this.approvalDir, status.toLowerCase());
        const targetFile = path.join(targetDir, `${requestId}.json`);

        if (fs.existsSync(sourceFile)) {
            fs.renameSync(sourceFile, targetFile);
        }
    }

    /**
     * Move approval to timeout directory
     */
    moveToTimeout(requestId) {
        this.moveToArchive(requestId, 'timeout');
    }

    /**
     * Update change ticket status (Phase 2 - Jira Integration)
     *
     * @param {Object} approvalRequest - The approval request
     * @param {string} status - Status ('GRANTED', 'REJECTED', 'COMPLETE')
     * @param {string} comment - Comment to add to ticket
     */
    async updateChangeTicket(approvalRequest, status, comment = '') {
        // Only update if ticket exists
        if (!approvalRequest.changeTicket || !ChangeTicketManager) {
            return;
        }

        try {
            const ticketManager = new ChangeTicketManager({ verbose: this.verbose });

            await ticketManager.updateTicketStatus(
                approvalRequest.changeTicket.ticketId,
                status,
                comment
            );

            if (this.verbose) {
                console.log(`✅ Updated ticket ${approvalRequest.changeTicket.ticketId} to ${status}`);
            }
        } catch (error) {
            console.warn(`Failed to update change ticket: ${error.message}`);
            // Don't fail approval process if ticket update fails
        }
    }

    /**
     * Close change ticket with operation evidence (Phase 2)
     *
     * @param {Object} approvalRequest - The approval request
     * @param {Object} evidence - Operation execution evidence
     */
    async closeChangeTicket(approvalRequest, evidence) {
        if (!approvalRequest.changeTicket || !ChangeTicketManager) {
            return;
        }

        try {
            const ticketManager = new ChangeTicketManager({ verbose: this.verbose });

            await ticketManager.closeTicket(
                approvalRequest.changeTicket.ticketId,
                evidence
            );

            if (this.verbose) {
                console.log(`✅ Closed ticket ${approvalRequest.changeTicket.ticketId} with evidence`);
            }
        } catch (error) {
            console.warn(`Failed to close change ticket: ${error.message}`);
        }
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
Human-in-the-Loop Controller - Manage approval workflows for agent operations

Commands:
  request <request.json>      Request approval for operation
  check <request-id>          Check approval status
  approve <request-id>        Approve pending request
  reject <request-id>         Reject pending request
  list                        List pending approvals
  stats                       Show approval statistics

Examples:
  # Request approval
  node human-in-the-loop-controller.js request approval-request.json

  # Check status
  node human-in-the-loop-controller.js check AR-2025-10-25-001

  # List pending
  node human-in-the-loop-controller.js list
`);
        process.exit(0);
    }

    const controller = new HumanInTheLoopController({ verbose: true });

    (async () => {
        try {
            if (command === 'request') {
                const requestFile = args[1];
                if (!requestFile) {
                    throw new Error('Request JSON file required');
                }

                const request = JSON.parse(fs.readFileSync(requestFile, 'utf8'));
                const result = await controller.requestApproval(request);
                console.log(JSON.stringify(result, null, 2));

            } else if (command === 'check') {
                const requestId = args[1];
                if (!requestId) {
                    throw new Error('Request ID required');
                }

                const status = controller.checkApprovalStatus(requestId);
                console.log(JSON.stringify(status, null, 2));

            } else if (command === 'list') {
                const pending = controller.listPendingApprovals();
                console.log(JSON.stringify(pending, null, 2));

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

module.exports = HumanInTheLoopController;
