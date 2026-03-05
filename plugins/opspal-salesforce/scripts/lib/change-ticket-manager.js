#!/usr/bin/env node

/**
 * Change Ticket Manager
 *
 * Integrates with Asana (primary), Jira (optional), and ServiceNow (optional)
 * for governance change management.
 *
 * Features:
 * - Auto-create tickets based on risk routing
 * - Bidirectional sync (approval ↔ ticket status)
 * - Ticket closure with operation evidence
 * - Provider-agnostic ticket references
 *
 * @version 2.0.0
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
            return this.resolveEnvVars(config);
        } catch (error) {
            console.error(`Error loading config: ${error.message}`);
            return this.getDefaultConfig();
        }
    }

    /**
     * Resolve environment variables in config.
     * Supports:
     * - ${VAR}
     * - ${VAR:-default}
     */
    resolveEnvVars(obj) {
        if (Array.isArray(obj)) {
            return obj.map((item) => this.resolveEnvVars(item));
        }

        if (!obj || typeof obj !== 'object') {
            if (typeof obj === 'string') {
                const fullMatch = obj.match(/^\$\{([A-Za-z_][A-Za-z0-9_]*)(:-([^}]*))?\}$/);
                if (!fullMatch) return obj;

                const envVar = fullMatch[1];
                const fallback = fullMatch[3];
                const envValue = process.env[envVar];

                if (envValue !== undefined && envValue !== '') {
                    return envValue;
                }

                return fallback !== undefined ? fallback : obj;
            }

            return obj;
        }

        const resolved = {};
        for (const [key, value] of Object.entries(obj)) {
            resolved[key] = this.resolveEnvVars(value);
        }

        return resolved;
    }

    /**
     * Get default configuration
     */
    getDefaultConfig() {
        return {
            asana: {
                enabled: true,
                accessToken: process.env.ASANA_ACCESS_TOKEN || '',
                workspaceId: process.env.ASANA_WORKSPACE_ID || '',
                projectId: process.env.ASANA_PROJECT_ID || ''
            },
            jira: {
                enabled: false,
                url: '',
                email: '',
                apiToken: '',
                projectKey: 'SFDC',
                issueType: 'Change Request'
            },
            serviceNow: {
                enabled: false
            },
            routing: {
                LOW: null,
                MEDIUM: null,
                HIGH: 'asana',
                CRITICAL: 'asana'
            }
        };
    }

    /**
     * Determine which system to use based on risk level
     */
    determineSystem(riskLevel) {
        const configured = this.config.routing?.[riskLevel] || null;
        if (!configured) return null;

        const system = configured.toLowerCase();
        if (!['asana', 'jira', 'servicenow'].includes(system)) {
            if (this.verbose) {
                console.warn(`Unknown ticket system in routing: ${configured}`);
            }
            return null;
        }

        return system;
    }

    /**
     * Parse ticket reference into { system, ticketId }
     * Accepts:
     * - "jira:ABC-123"
     * - "asana:123456"
     * - "ABC-123" with systemHint='jira'
     * - "123456" with systemHint='asana'
     */
    parseTicketRef(ticketRef, systemHint = null) {
        if (!ticketRef || typeof ticketRef !== 'string') {
            return { system: null, ticketId: null };
        }

        const normalized = ticketRef.trim();
        const prefixMatch = normalized.match(/^(jira|asana|servicenow):(.+)$/i);
        if (prefixMatch) {
            return {
                system: prefixMatch[1].toLowerCase(),
                ticketId: prefixMatch[2].trim()
            };
        }

        if (systemHint) {
            return {
                system: String(systemHint).toLowerCase(),
                ticketId: normalized
            };
        }

        // Backward-compatible inference
        if (/^[A-Z][A-Z0-9_]+-\d+$/i.test(normalized)) {
            return { system: 'jira', ticketId: normalized };
        }

        if (/^\d+$/.test(normalized)) {
            return { system: 'asana', ticketId: normalized };
        }

        return { system: null, ticketId: normalized };
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

        if (system === 'asana') {
            return this.createAsanaTicket(operation, risk, approvalRequest);
        }

        if (system === 'jira') {
            return this.createJiraTicket(operation, risk, approvalRequest);
        }

        if (system === 'servicenow') {
            return this.createServiceNowTicket(operation, risk, approvalRequest);
        }

        return null;
    }

    /**
     * Create Asana ticket/task
     */
    async createAsanaTicket(operation, risk, approvalRequest) {
        const asana = this.config.asana || {};
        const accessToken = asana.accessToken || process.env.ASANA_ACCESS_TOKEN;
        const projectId = asana.projectId || process.env.ASANA_PROJECT_ID;

        if (!asana.enabled) {
            if (this.verbose) console.warn('Asana integration disabled. Skipping ticket creation.');
            return null;
        }

        if (!accessToken || !projectId) {
            if (this.verbose) {
                console.warn('Asana integration not fully configured (ASANA_ACCESS_TOKEN/ASANA_PROJECT_ID missing). Skipping ticket creation.');
            }
            return null;
        }

        const taskName = `[${risk.riskLevel}] ${operation.agent} - ${operation.type} (${operation.target})`;
        const taskNotes = this.formatAsanaDescription(operation, risk, approvalRequest);

        const payload = {
            name: taskName,
            notes: taskNotes,
            projects: [projectId],
            due_on: approvalRequest?.approvalDeadline
                ? String(approvalRequest.approvalDeadline).slice(0, 10)
                : undefined,
            assignee: asana.defaultAssigneeGid || undefined,
            tags: Array.isArray(asana.defaultTagIds) ? asana.defaultTagIds : undefined
        };

        // Remove undefined keys
        Object.keys(payload).forEach((k) => payload[k] === undefined && delete payload[k]);

        try {
            const result = await this.makeAsanaRequest(accessToken, 'POST', '/api/1.0/tasks', payload);
            const gid = result?.data?.gid;
            const permalink = result?.data?.permalink_url || `https://app.asana.com/0/${projectId}/${gid}`;

            if (!gid) {
                throw new Error('Asana API returned no task gid');
            }

            return {
                system: 'asana',
                ticketId: gid,
                ticketUrl: permalink,
                createdAt: new Date().toISOString(),
                created: new Date().toISOString()
            };
        } catch (error) {
            console.error(`Failed to create Asana task: ${error.message}`);
            return null;
        }
    }

    /**
     * Format Asana ticket description
     */
    formatAsanaDescription(operation, risk, approvalRequest) {
        const components = approvalRequest?.operation?.affectedComponents || [];
        const users = approvalRequest?.operation?.affectedUsers || 0;

        return [
            'Agent Operation Approval Required',
            '',
            `Risk Score: ${risk.riskScore}/100 (${risk.riskLevel})`,
            '',
            `Agent: ${operation.agent}`,
            `Operation: ${operation.type}`,
            `Target Environment: ${operation.target}`,
            '',
            'Risk Breakdown:',
            risk.breakdown
                ? Object.entries(risk.breakdown)
                    .map(([factor, data]) => `- ${factor}: ${data.score}/${data.maxScore} ${data.details ? `- ${data.details}` : ''}`)
                    .join('\n')
                : '- No detailed breakdown available',
            '',
            `Reasoning: ${approvalRequest?.reasoning || 'Not provided'}`,
            '',
            'Affected Components:',
            components.length > 0 ? components.map((c) => `- ${c}`).join('\n') : '- None specified',
            `Affected Users: ${users}`,
            '',
            'Rollback Plan:',
            approvalRequest?.rollbackPlan || 'No rollback plan provided',
            '',
            'Approval Required From:',
            approvalRequest?.requiredApprovers?.length
                ? approvalRequest.requiredApprovers.map((a) => `- ${a}`).join('\n')
                : '- Not specified',
            '',
            `Deadline: ${approvalRequest?.approvalDeadline || 'Not specified'}`,
            '',
            'Actions:',
            '1. Review operation details',
            '2. Comment APPROVED or REJECTED with rationale',
            '3. Track execution evidence on completion',
            '',
            'Generated by Salesforce Agent Governance System'
        ].join('\n');
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

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Jira API error (${response.status}): ${errorText}`);
            }

            const result = await response.json();
            const createdAt = new Date().toISOString();
            return {
                system: 'jira',
                ticketId: result.key,
                ticketUrl: `${this.config.jira.url}/browse/${result.key}`,
                createdAt,
                created: createdAt
            };
        } catch (error) {
            console.error(`Failed to create Jira ticket: ${error.message}`);
            return null;
        }
    }

    /**
     * Create ServiceNow change request (optional provider)
     */
    async createServiceNowTicket(_operation, _risk, _approvalRequest) {
        if (!this.config.serviceNow?.enabled) {
            if (this.verbose) {
                console.warn('ServiceNow integration disabled. Skipping ticket creation.');
            }
            return null;
        }

        console.warn('ServiceNow integration enabled but not implemented. Configure Jira or Asana routing.');
        return null;
    }

    /**
     * Map risk level to Jira priority
     */
    mapRiskToPriority(riskLevel) {
        const mapping = {
            CRITICAL: { name: 'Highest' },
            HIGH: { name: 'High' },
            MEDIUM: { name: 'Medium' },
            LOW: { name: 'Low' }
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
        const auth = Buffer.from(`${this.config.jira.email}:${this.config.jira.apiToken}`).toString('base64');

        const options = {
            method,
            headers: {
                Authorization: `Basic ${auth}`,
                'Content-Type': 'application/json',
                Accept: 'application/json'
            }
        };

        if (body) {
            options.body = JSON.stringify(body);
        }

        return fetch(url, options);
    }

    /**
     * Make authenticated Asana API request
     */
    async makeAsanaRequest(accessToken, method, endpoint, body = null) {
        const options = {
            method,
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            }
        };

        if (body) {
            options.body = JSON.stringify({ data: body });
        }

        const response = await fetch(`https://app.asana.com${endpoint}`, options);

        if (!response.ok) {
            const text = await response.text();
            throw new Error(`Asana API error (${response.status}): ${text}`);
        }

        return response.json();
    }

    /**
     * Add comment to ticket
     */
    async addTicketComment(ticketRef, comment, systemHint = null) {
        const { system, ticketId } = this.parseTicketRef(ticketRef, systemHint);
        if (!system || !ticketId) return;

        if (system === 'jira') {
            await this.addJiraComment(ticketId, comment);
            return;
        }

        if (system === 'asana') {
            await this.addAsanaComment(ticketId, comment);
            return;
        }

        if (this.verbose) {
            console.warn(`Comment API not implemented for system: ${system}`);
        }
    }

    /**
     * Update ticket status based on approval.
     * Backward-compatible signature:
     * updateTicketStatus(ticketId, status, comment)
     * New signature:
     * updateTicketStatus(ticketRef, status, comment, systemHint)
     */
    async updateTicketStatus(ticketRef, status, comment = '', systemHint = null) {
        const { system, ticketId } = this.parseTicketRef(ticketRef, systemHint);
        if (!ticketId || !system) {
            if (this.verbose) {
                console.warn(`Could not resolve ticket system for ref: ${ticketRef}`);
            }
            return;
        }

        if (system === 'jira') {
            await this.updateJiraStatus(ticketId, status, comment);
            return;
        }

        if (system === 'asana') {
            await this.updateAsanaStatus(ticketId, status, comment);
            return;
        }

        if (this.verbose) {
            console.warn(`Status update not implemented for system: ${system}`);
        }
    }

    /**
     * Update Jira ticket status
     */
    async updateJiraStatus(ticketId, status, comment = '') {
        const transitionName = status === 'GRANTED'
            ? 'Approved'
            : status === 'REJECTED'
                ? 'Rejected'
                : status === 'COMPLETE'
                    ? (this.config.jira?.workflows?.defaultTransitions?.complete || 'Done')
                    : status;

        try {
            if (comment) {
                await this.addJiraComment(ticketId, comment);
            }

            const transitionsRes = await this.makeJiraRequest('GET', `/rest/api/3/issue/${ticketId}/transitions`);
            if (!transitionsRes.ok) {
                throw new Error(`Failed to get transitions: ${transitionsRes.status}`);
            }

            const transitionsData = await transitionsRes.json();
            const targetTransition = transitionsData.transitions?.find(
                (t) => String(t.name).toLowerCase() === String(transitionName).toLowerCase()
            );

            if (!targetTransition) {
                if (this.verbose) {
                    console.warn(`No "${transitionName}" transition available for ${ticketId}`);
                }
                return;
            }

            const transitionRes = await this.makeJiraRequest(
                'POST',
                `/rest/api/3/issue/${ticketId}/transitions`,
                { transition: { id: targetTransition.id } }
            );

            if (!transitionRes.ok) {
                throw new Error(`Failed to transition: ${transitionRes.status}`);
            }

            if (this.verbose) {
                console.log(`✅ Jira ticket ${ticketId} transitioned to ${transitionName}`);
            }
        } catch (error) {
            console.error(`Failed to update Jira ticket status: ${error.message}`);
        }
    }

    /**
     * Update Asana task status
     */
    async updateAsanaStatus(taskId, status, comment = '') {
        const accessToken = this.config.asana?.accessToken || process.env.ASANA_ACCESS_TOKEN;
        if (!accessToken) {
            if (this.verbose) {
                console.warn('Cannot update Asana status: ASANA_ACCESS_TOKEN missing');
            }
            return;
        }

        try {
            if (comment) {
                await this.addAsanaComment(taskId, comment);
            }

            // Apply completion state only for COMPLETE. GRANTED/REJECTED are comment-only states.
            if (status === 'COMPLETE') {
                await this.makeAsanaRequest(accessToken, 'PUT', `/api/1.0/tasks/${taskId}`, {
                    completed: true
                });
            }

            if (status === 'REJECTED') {
                await this.addAsanaComment(taskId, 'Status update: REJECTED. Operation must not proceed.');
            }

            if (status === 'GRANTED') {
                await this.addAsanaComment(taskId, 'Status update: GRANTED. Operation approved to proceed.');
            }

            if (this.verbose) {
                console.log(`✅ Asana task ${taskId} updated for status ${status}`);
            }
        } catch (error) {
            console.error(`Failed to update Asana task status: ${error.message}`);
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
                                content: [{ type: 'text', text: comment }]
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
     * Add comment to Asana task
     */
    async addAsanaComment(taskId, comment) {
        const accessToken = this.config.asana?.accessToken || process.env.ASANA_ACCESS_TOKEN;
        if (!accessToken) {
            if (this.verbose) {
                console.warn('Cannot add Asana comment: ASANA_ACCESS_TOKEN missing');
            }
            return;
        }

        try {
            await this.makeAsanaRequest(accessToken, 'POST', `/api/1.0/tasks/${taskId}/stories`, {
                text: comment
            });
        } catch (error) {
            console.error(`Failed to add Asana comment: ${error.message}`);
        }
    }

    /**
     * Close ticket with operation evidence
     */
    async closeTicket(ticketRef, evidence, systemHint = null) {
        const { system, ticketId } = this.parseTicketRef(ticketRef, systemHint);
        if (!ticketId || !system) {
            if (this.verbose) {
                console.warn(`Unable to close ticket. Could not parse ticket reference: ${ticketRef}`);
            }
            return;
        }

        const comment = this.formatEvidenceComment(evidence);

        try {
            await this.addTicketComment(`${system}:${ticketId}`, comment, system);
            await this.updateTicketStatus(`${system}:${ticketId}`, 'COMPLETE', '', system);

            if (this.verbose) {
                console.log(`✅ Closed ${system} ticket ${ticketId} with evidence`);
            }
        } catch (error) {
            console.error(`Failed to close ticket: ${error.message}`);
        }
    }

    /**
     * Format evidence comment
     */
    formatEvidenceComment(evidence) {
        return [
            'Operation Complete',
            '',
            `Status: ${evidence.success ? 'SUCCESS ✅' : 'FAILED ❌'}`,
            `Duration: ${evidence.durationMs}ms`,
            `Verification: ${evidence.verification?.passed ? 'PASSED ✅' : 'NOT PERFORMED'}`,
            `Audit Trail: ${evidence.auditLogId || 'Not available'}`,
            '',
            evidence.errors && evidence.errors.length > 0
                ? `Errors:\n${evidence.errors.map((e) => `- ${e}`).join('\n')}`
                : '',
            '',
            'Generated by Salesforce Agent Governance System'
        ].join('\n');
    }

    /**
     * Get ticket status
     */
    async getTicketStatus(ticketRef, systemHint = null) {
        const { system, ticketId } = this.parseTicketRef(ticketRef, systemHint);
        if (!ticketId || !system) {
            throw new Error(`Could not determine ticket system for ref: ${ticketRef}`);
        }

        if (system === 'jira') {
            try {
                const response = await this.makeJiraRequest('GET', `/rest/api/3/issue/${ticketId}`);
                if (!response.ok) {
                    throw new Error(`Failed to get ticket: ${response.status}`);
                }

                const data = await response.json();
                return {
                    system,
                    ticketId: data.key,
                    status: data.fields.status.name,
                    assignee: data.fields.assignee?.displayName || 'Unassigned',
                    created: data.fields.created,
                    updated: data.fields.updated
                };
            } catch (error) {
                console.error(`Failed to get Jira ticket status: ${error.message}`);
                return null;
            }
        }

        if (system === 'asana') {
            const accessToken = this.config.asana?.accessToken || process.env.ASANA_ACCESS_TOKEN;
            if (!accessToken) {
                throw new Error('ASANA_ACCESS_TOKEN missing');
            }

            try {
                const result = await this.makeAsanaRequest(
                    accessToken,
                    'GET',
                    `/api/1.0/tasks/${ticketId}?opt_fields=name,completed,completed_at,assignee.name,created_at,modified_at,permalink_url`
                );

                return {
                    system,
                    ticketId,
                    status: result?.data?.completed ? 'Completed' : 'Open',
                    assignee: result?.data?.assignee?.name || 'Unassigned',
                    created: result?.data?.created_at,
                    updated: result?.data?.modified_at,
                    ticketUrl: result?.data?.permalink_url
                };
            } catch (error) {
                console.error(`Failed to get Asana task status: ${error.message}`);
                return null;
            }
        }

        console.warn(`Status lookup not implemented for system: ${system}`);
        return null;
    }
}

// CLI interface
if (require.main === module) {
    const args = process.argv.slice(2);
    const command = args[0];

    const manager = new ChangeTicketManager({ verbose: true });

    const getFlag = (name) => {
        const idx = args.indexOf(name);
        if (idx === -1) return null;
        return args[idx + 1] || null;
    };

    (async () => {
        switch (command) {
            case 'create': {
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

                if (!ticket) {
                    console.error('❌ Failed to create ticket');
                    process.exit(1);
                }

                console.log('✅ Ticket created successfully:');
                console.log(JSON.stringify(ticket, null, 2));
                break;
            }

            case 'status': {
                const ticketRef = args[1];
                const system = getFlag('--system');
                if (!ticketRef) {
                    console.error('Error: ticket reference required');
                    process.exit(1);
                }

                const status = await manager.getTicketStatus(ticketRef, system);
                console.log(JSON.stringify(status, null, 2));
                break;
            }

            case 'comment': {
                const ticketRef = args[1];
                const comment = args[2];
                const system = getFlag('--system');

                if (!ticketRef || !comment) {
                    console.error('Error: ticket reference and comment required');
                    process.exit(1);
                }

                await manager.addTicketComment(ticketRef, comment, system);
                console.log('✅ Comment added successfully');
                break;
            }

            case 'close': {
                const ticketRef = args[1];
                const system = getFlag('--system');
                if (!ticketRef) {
                    console.error('Error: ticket reference required');
                    process.exit(1);
                }

                await manager.closeTicket(
                    ticketRef,
                    {
                        success: true,
                        durationMs: 5000,
                        verification: { passed: true },
                        auditLogId: 'test-audit-log-123'
                    },
                    system
                );
                console.log('✅ Ticket closed successfully');
                break;
            }

            case 'post-operation': {
                const ticketRef = process.env.CHANGE_TICKET_ID || args[1];
                const system = process.env.CHANGE_TICKET_SYSTEM || getFlag('--system');

                if (!ticketRef) {
                    console.log('No change ticket reference provided. Skipping post-operation update.');
                    process.exit(0);
                }

                const success = String(process.env.OPERATION_SUCCESS || 'true').toLowerCase() === 'true';
                const durationMs = Number(process.env.OPERATION_DURATION || '0');
                const verificationPassed = String(process.env.VERIFICATION_PASSED || 'false').toLowerCase() === 'true';
                const auditLogId = process.env.AUDIT_LOG_ID || 'not-available';

                const evidence = {
                    success,
                    durationMs,
                    verification: { passed: verificationPassed },
                    auditLogId,
                    errors: process.env.OPERATION_ERRORS ? [process.env.OPERATION_ERRORS] : []
                };

                await manager.closeTicket(ticketRef, evidence, system);
                console.log(`✅ Post-operation ticket update complete: ${ticketRef}`);
                break;
            }

            case '--help':
            case 'help':
            default:
                console.log(`
Change Ticket Manager - Asana/Jira/ServiceNow Integration

Usage:
  node change-ticket-manager.js create
  node change-ticket-manager.js status <ticketRef> [--system asana|jira|servicenow]
  node change-ticket-manager.js comment <ticketRef> <comment> [--system asana|jira|servicenow]
  node change-ticket-manager.js close <ticketRef> [--system asana|jira|servicenow]
  node change-ticket-manager.js post-operation [ticketRef] [--system asana|jira|servicenow]

Ticket references:
  jira:ABC-123
  asana:123456789
  ABC-123 (with --system jira)
  123456789 (with --system asana)

Environment Variables:
  ASANA_ACCESS_TOKEN / ASANA_PROJECT_ID
  JIRA_EMAIL / JIRA_API_TOKEN / JIRA_URL
`);
                if (!['--help', 'help'].includes(command || '')) {
                    process.exit(1);
                }
        }
    })().catch((error) => {
        console.error(error.message);
        process.exit(1);
    });
}

module.exports = ChangeTicketManager;
