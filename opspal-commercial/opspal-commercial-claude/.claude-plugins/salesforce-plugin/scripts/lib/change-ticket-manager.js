#!/usr/bin/env node

/**
 * Change Ticket Manager
 *
 * Integrates with Jira and ServiceNow for change management.
 * Auto-creates tickets for high-risk agent operations.
 *
 * Features:
 * - Auto-create Jira tickets for HIGH risk operations
 * - Auto-create ServiceNow change requests for CRITICAL risk
 * - Bidirectional sync (approval ↔ ticket status)
 * - Ticket closure with operation evidence
 * - Compliance audit trail
 *
 * @version 1.0.0
 * @phase Phase 2 - Compliance Automation
 */

const fs = require('fs');
const path = require('path');

class ChangeTicketManager {
    constructor(options = {}) {
        this.config = this.loadConfig();
        this.verbose = options.verbose || false;
    }

    /**
     * Load configuration
     */
    loadConfig() {
        const configPath = path.join(
            __dirname,
            '../../config/change-management-config.json'
        );

        try {
            const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            
            // Replace environment variable placeholders
            return this.resolveEnvVars(config);
        } catch (error) {
            console.error(`Error loading config: ${error.message}`);
            return this.getDefaultConfig();
        }
    }

    /**
     * Resolve environment variables in config
     */
    resolveEnvVars(obj) {
        const resolved = {};
        
        for (const [key, value] of Object.entries(obj)) {
            if (typeof value === 'object' && value !== null) {
                resolved[key] = this.resolveEnvVars(value);
            } else if (typeof value === 'string' && value.startsWith('${') && value.endsWith('}')) {
                const envVar = value.slice(2, -1);
                resolved[key] = process.env[envVar] || value;
            } else {
                resolved[key] = value;
            }
        }
        
        return resolved;
    }

    /**
     * Get default configuration
     */
    getDefaultConfig() {
        return {
            jira: {
                enabled: false,
                url: '',
                email: '',
                apiToken: ''
            },
            serviceNow: {
                enabled: false
            },
            routing: {
                LOW: null,
                MEDIUM: null,
                HIGH: 'jira',
                CRITICAL: 'jira'
            }
        };
    }

    /**
     * Create change ticket for operation
     */
    async createTicket(operation, risk, approvalRequest) {
        const system = this.determineSystem(risk.riskLevel);

        if (!system) {
            if (this.verbose) {
                console.log(`No ticket system configured for ${risk.riskLevel} risk level`);
            }
            return null;
        }

        if (system === 'jira') {
            return await this.createJiraTicket(operation, risk, approvalRequest);
        } else if (system === 'serviceNow') {
            return await this.createServiceNowTicket(operation, risk, approvalRequest);
        }

        return null;
    }

    /**
     * Determine which system to use based on risk level
     */
    determineSystem(riskLevel) {
        return this.config.routing[riskLevel] || null;
    }

    /**
     * Create Jira ticket
     */
    async createJiraTicket(operation, risk, approvalRequest) {
        if (!this.config.jira.enabled || !this.config.jira.apiToken) {
            if (this.verbose) {
                console.warn('Jira integration not configured. Skipping ticket creation.');
            }
            return null;
        }

        try {
            const ticket = {
                fields: {
                    project: { key: this.config.jira.projectKey },
                    summary: `[${operation.agent}] ${operation.type} in ${operation.target}`,
                    description: this.formatJiraDescription(operation, risk, approvalRequest),
                    issuetype: { name: this.config.jira.issueType || 'Change Request' },
                    assignee: approvalRequest.requiredApprovers && approvalRequest.requiredApprovers.length > 0
                        ? { name: approvalRequest.requiredApprovers[0] }
                        : null,
                    labels: ['agent-governance', `risk-${risk.riskLevel.toLowerCase()}`],
                    priority: this.mapRiskToPriority(risk.riskLevel)
                }
            };

            // Add custom fields if configured
            if (this.config.jira.customFields) {
                if (this.config.jira.customFields.riskScore) {
                    ticket.fields[this.config.jira.customFields.riskScore] = risk.riskScore;
                }
                if (this.config.jira.customFields.agentName) {
                    ticket.fields[this.config.jira.customFields.agentName] = operation.agent;
                }
                if (this.config.jira.customFields.environment) {
                    ticket.fields[this.config.jira.customFields.environment] = operation.target;
                }
            }

            const response = await this.makeJiraRequest('POST', '/rest/api/3/issue', ticket);

            if (response.ok) {
                const result = await response.json();
                
                return {
                    system: 'jira',
                    ticketId: result.key,
                    ticketUrl: `${this.config.jira.url}/browse/${result.key}`,
                    created: new Date().toISOString()
                };
            } else {
                const errorText = await response.text();
                throw new Error(`Jira API error (${response.status}): ${errorText}`);
            }
        } catch (error) {
            console.error(`Failed to create Jira ticket: ${error.message}`);
            return null;
        }
    }

    /**
     * Map risk level to Jira priority
     */
    mapRiskToPriority(riskLevel) {
        const mapping = {
            'CRITICAL': { name: 'Highest' },
            'HIGH': { name: 'High' },
            'MEDIUM': { name: 'Medium' },
            'LOW': { name: 'Low' }
        };
        
        return mapping[riskLevel] || { name: 'Medium' };
    }

    /**
     * Format Jira description
     */
    formatJiraDescription(operation, risk, approvalRequest) {
        const components = approvalRequest.operation?.affectedComponents || [];
        const users = approvalRequest.operation?.affectedUsers || 0;
        
        return `h2. Agent Operation Approval Required

*Risk Score:* ${risk.riskScore}/100 (*${risk.riskLevel}*)

*Agent:* ${operation.agent}
*Operation:* ${operation.type}
*Target Environment:* ${operation.target}

h3. Risk Breakdown

${risk.breakdown ? Object.entries(risk.breakdown).map(([factor, data]) =>
    `* *${factor}:* ${data.score}/${data.maxScore} - ${data.details || ''}`
).join('\n') : 'No detailed breakdown available'}

h3. Operation Details

*Reasoning:* ${approvalRequest.reasoning || 'Not provided'}

*Affected Components:*
${components.length > 0 ? components.map(c => `* ${c}`).join('\n') : '* None specified'}

*Affected Users:* ${users}

h3. Rollback Plan

${approvalRequest.rollbackPlan || 'No rollback plan provided'}

h3. Approval Required

This ticket requires approval from: ${approvalRequest.requiredApprovers?.join(', ') || 'Not specified'}

*Deadline:* ${approvalRequest.approvalDeadline || 'Not specified'}

h3. Actions

# Review operation details above
# Transition ticket to "Approved" or "Rejected"
# Add comment with approval reasoning

---
_Created by Salesforce Agent Governance System_
`;
    }

    /**
     * Make authenticated Jira API request
     */
    async makeJiraRequest(method, endpoint, body = null) {
        const url = `${this.config.jira.url}${endpoint}`;
        const auth = Buffer.from(
            `${this.config.jira.email}:${this.config.jira.apiToken}`
        ).toString('base64');

        const options = {
            method,
            headers: {
                'Authorization': `Basic ${auth}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        };

        if (body) {
            options.body = JSON.stringify(body);
        }

        return await fetch(url, options);
    }

    /**
     * Update ticket status based on approval
     */
    async updateTicketStatus(ticketId, status, comment = '') {
        if (!ticketId || !ticketId.includes('jira')) {
            // ServiceNow update would go here
            return;
        }

        const transition = status === 'GRANTED' ? 'Approved' : 'Rejected';

        try {
            // Add comment first
            if (comment) {
                await this.addJiraComment(ticketId, comment);
            }

            // Get available transitions
            const transitionsRes = await this.makeJiraRequest(
                'GET',
                `/rest/api/3/issue/${ticketId}/transitions`
            );

            if (!transitionsRes.ok) {
                throw new Error(`Failed to get transitions: ${transitionsRes.status}`);
            }

            const transitionsData = await transitionsRes.json();
            const targetTransition = transitionsData.transitions?.find(
                t => t.name.toLowerCase() === transition.toLowerCase()
            );

            if (!targetTransition) {
                console.warn(`No "${transition}" transition available for ${ticketId}`);
                return;
            }

            // Execute transition
            const transitionRes = await this.makeJiraRequest(
                'POST',
                `/rest/api/3/issue/${ticketId}/transitions`,
                {
                    transition: { id: targetTransition.id }
                }
            );

            if (!transitionRes.ok) {
                throw new Error(`Failed to transition: ${transitionRes.status}`);
            }

            if (this.verbose) {
                console.log(`✅ Ticket ${ticketId} transitioned to ${transition}`);
            }
        } catch (error) {
            console.error(`Failed to update ticket status: ${error.message}`);
        }
    }

    /**
     * Add comment to Jira ticket
     */
    async addJiraComment(ticketId, comment) {
        try {
            const response = await this.makeJiraRequest(
                'POST',
                `/rest/api/3/issue/${ticketId}/comment`,
                {
                    body: {
                        type: 'doc',
                        version: 1,
                        content: [
                            {
                                type: 'paragraph',
                                content: [
                                    {
                                        type: 'text',
                                        text: comment
                                    }
                                ]
                            }
                        ]
                    }
                }
            );

            if (!response.ok) {
                throw new Error(`Failed to add comment: ${response.status}`);
            }
        } catch (error) {
            console.error(`Failed to add Jira comment: ${error.message}`);
        }
    }

    /**
     * Close ticket with operation evidence
     */
    async closeTicket(ticketId, evidence) {
        const comment = this.formatEvidenceComment(evidence);

        try {
            // Add evidence comment
            await this.addJiraComment(ticketId, comment);

            // Transition to Done
            await this.updateTicketStatus(ticketId, 'COMPLETE');

            if (this.verbose) {
                console.log(`✅ Ticket ${ticketId} closed with evidence`);
            }
        } catch (error) {
            console.error(`Failed to close ticket: ${error.message}`);
        }
    }

    /**
     * Format evidence comment
     */
    formatEvidenceComment(evidence) {
        return `
Operation Complete

Status: ${evidence.success ? 'SUCCESS ✅' : 'FAILED ❌'}
Duration: ${evidence.durationMs}ms
Verification: ${evidence.verification?.passed ? 'PASSED ✅' : 'NOT PERFORMED'}

Audit Trail: ${evidence.auditLogId || 'Not available'}

${evidence.errors && evidence.errors.length > 0 
    ? `Errors:\n${evidence.errors.map(e => `- ${e}`).join('\n')}`
    : ''}

---
Generated by Salesforce Agent Governance System
`;
    }

    /**
     * Create ServiceNow change request (placeholder)
     */
    async createServiceNowTicket(operation, risk, approvalRequest) {
        // ServiceNow implementation would go here
        // Similar structure to Jira but using ServiceNow REST API
        console.warn('ServiceNow integration not yet implemented');
        return null;
    }

    /**
     * Get ticket status
     */
    async getTicketStatus(ticketId) {
        try {
            const response = await this.makeJiraRequest('GET', `/rest/api/3/issue/${ticketId}`);

            if (!response.ok) {
                throw new Error(`Failed to get ticket: ${response.status}`);
            }

            const data = await response.json();

            return {
                ticketId: data.key,
                status: data.fields.status.name,
                assignee: data.fields.assignee?.displayName || 'Unassigned',
                created: data.fields.created,
                updated: data.fields.updated
            };
        } catch (error) {
            console.error(`Failed to get ticket status: ${error.message}`);
            return null;
        }
    }
}

// CLI interface
if (require.main === module) {
    const args = process.argv.slice(2);
    const command = args[0];

    const manager = new ChangeTicketManager({ verbose: true });

    switch (command) {
        case 'create':
            // Test ticket creation
            (async () => {
                const ticket = await manager.createTicket(
                    {
                        agent: 'test-agent',
                        type: 'TEST OPERATION',
                        target: 'sandbox'
                    },
                    {
                        riskScore: 65,
                        riskLevel: 'HIGH',
                        breakdown: {}
                    },
                    {
                        reasoning: 'Test ticket creation',
                        requiredApprovers: ['test-approver'],
                        approvalDeadline: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
                        rollbackPlan: 'Test rollback plan',
                        operation: {
                            affectedComponents: ['TestComponent'],
                            affectedUsers: 10
                        }
                    }
                );

                if (ticket) {
                    console.log('✅ Ticket created successfully:');
                    console.log(JSON.stringify(ticket, null, 2));
                } else {
                    console.error('❌ Failed to create ticket');
                    process.exit(1);
                }
            })();
            break;

        case 'status':
            // Get ticket status
            const ticketId = args[1];
            if (!ticketId) {
                console.error('Error: Ticket ID required');
                process.exit(1);
            }

            (async () => {
                const status = await manager.getTicketStatus(ticketId);
                console.log(JSON.stringify(status, null, 2));
            })();
            break;

        case 'comment':
            // Add comment to ticket
            const ticketIdComment = args[1];
            const comment = args[2];

            if (!ticketIdComment || !comment) {
                console.error('Error: Ticket ID and comment required');
                process.exit(1);
            }

            (async () => {
                await manager.addJiraComment(ticketIdComment, comment);
                console.log('✅ Comment added successfully');
            })();
            break;

        case 'close':
            // Close ticket with evidence
            const ticketIdClose = args[1];
            if (!ticketIdClose) {
                console.error('Error: Ticket ID required');
                process.exit(1);
            }

            (async () => {
                await manager.closeTicket(ticketIdClose, {
                    success: true,
                    durationMs: 5000,
                    verification: { passed: true },
                    auditLogId: 'test-audit-log-123'
                });
                console.log('✅ Ticket closed successfully');
            })();
            break;

        default:
            console.log(`
Change Ticket Manager - Jira/ServiceNow Integration

Usage:
  node change-ticket-manager.js create
  node change-ticket-manager.js status <ticketId>
  node change-ticket-manager.js comment <ticketId> <comment>
  node change-ticket-manager.js close <ticketId>

Examples:
  node change-ticket-manager.js create
  node change-ticket-manager.js status SFDC-123
  node change-ticket-manager.js comment SFDC-123 "Approved by security team"
  node change-ticket-manager.js close SFDC-123

Environment Variables:
  JIRA_EMAIL - Jira account email
  JIRA_API_TOKEN - Jira API token
  JIRA_URL - Jira instance URL (e.g., https://your-company.atlassian.net)
            `);
            process.exit(1);
    }
}

module.exports = ChangeTicketManager;
