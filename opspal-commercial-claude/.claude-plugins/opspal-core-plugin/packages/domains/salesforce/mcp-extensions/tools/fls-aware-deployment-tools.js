#!/usr/bin/env node

/**
 * MCP Tools for FLS-Aware Field Deployment
 *
 * Exposes the FLS-aware field deployment workflow as MCP tools
 * for use by Claude Code agents.
 *
 * Tools provided:
 * - generate_custom_field: Generate CustomField metadata XML
 * - ensure_permission_set: Ensure PermissionSet with field FLS
 * - deploy_source: Deploy field + permission set together
 * - assign_permset: Assign permission set to user
 * - verify_field_exists: Verify field via schema (no FLS required)
 * - verify_fls_applied: Verify FLS via FieldPermissions queries
 */

const FLSAwareFieldDeployer = require('../../scripts/lib/fls-aware-field-deployer');

class FLSAwareDeploymentTools {
    constructor() {
        this.tools = {
            generate_custom_field: {
                name: 'generate_custom_field',
                description: 'Generate CustomField metadata XML for deployment',
                inputSchema: {
                    type: 'object',
                    properties: {
                        objectName: {
                            type: 'string',
                            description: 'Salesforce object API name (e.g., Account, CustomObject__c)'
                        },
                        fieldName: {
                            type: 'string',
                            description: 'Field API name with __c suffix (e.g., CustomField__c)'
                        },
                        fieldType: {
                            type: 'string',
                            description: 'Field type: Text, Number, Currency, Date, DateTime, Checkbox, Picklist, Lookup',
                            enum: ['Text', 'Number', 'Currency', 'Date', 'DateTime', 'Checkbox', 'Picklist', 'Lookup']
                        },
                        label: {
                            type: 'string',
                            description: 'Field label (defaults to field name without __c)'
                        },
                        length: {
                            type: 'number',
                            description: 'Length for Text fields (default: 255)'
                        },
                        precision: {
                            type: 'number',
                            description: 'Precision for Number/Currency fields (default: 18)'
                        },
                        scale: {
                            type: 'number',
                            description: 'Scale for Number/Currency fields (default: 0 for Number, 2 for Currency)'
                        },
                        required: {
                            type: 'boolean',
                            description: 'Whether field is required (default: false)'
                        },
                        description: {
                            type: 'string',
                            description: 'Field description'
                        }
                    },
                    required: ['objectName', 'fieldName', 'fieldType']
                }
            },

            ensure_permission_set: {
                name: 'ensure_permission_set',
                description: 'Ensure PermissionSet exists with field-level security configured',
                inputSchema: {
                    type: 'object',
                    properties: {
                        objectName: {
                            type: 'string',
                            description: 'Salesforce object API name'
                        },
                        fieldName: {
                            type: 'string',
                            description: 'Field API name'
                        },
                        permissionSetName: {
                            type: 'string',
                            description: 'Permission set name (default: AgentAccess)',
                            default: 'AgentAccess'
                        },
                        read: {
                            type: 'boolean',
                            description: 'Grant read permission (default: true)',
                            default: true
                        },
                        edit: {
                            type: 'boolean',
                            description: 'Grant edit permission (default: true)',
                            default: true
                        },
                        orgAlias: {
                            type: 'string',
                            description: 'Salesforce org alias'
                        }
                    },
                    required: ['objectName', 'fieldName', 'orgAlias']
                }
            },

            deploy_field_with_fls: {
                name: 'deploy_field_with_fls',
                description: 'Deploy custom field with FLS in single atomic transaction (RECOMMENDED)',
                inputSchema: {
                    type: 'object',
                    properties: {
                        objectName: {
                            type: 'string',
                            description: 'Salesforce object API name'
                        },
                        fieldMetadata: {
                            type: 'object',
                            description: 'Complete field metadata object',
                            properties: {
                                fullName: { type: 'string' },
                                label: { type: 'string' },
                                type: { type: 'string' },
                                length: { type: 'number' },
                                precision: { type: 'number' },
                                scale: { type: 'number' },
                                required: { type: 'boolean' },
                                description: { type: 'string' }
                            },
                            required: ['fullName', 'type']
                        },
                        orgAlias: {
                            type: 'string',
                            description: 'Salesforce org alias'
                        },
                        permissionSetName: {
                            type: 'string',
                            description: 'Permission set name (default: AgentAccess)',
                            default: 'AgentAccess'
                        },
                        read: {
                            type: 'boolean',
                            description: 'Grant read permission (default: true)',
                            default: true
                        },
                        edit: {
                            type: 'boolean',
                            description: 'Grant edit permission (default: true)',
                            default: true
                        },
                        dryRun: {
                            type: 'boolean',
                            description: 'Preview deployment without executing (default: false)',
                            default: false
                        }
                    },
                    required: ['objectName', 'fieldMetadata', 'orgAlias']
                }
            },

            assign_permset: {
                name: 'assign_permset',
                description: 'Assign permission set to integration user',
                inputSchema: {
                    type: 'object',
                    properties: {
                        permissionSetName: {
                            type: 'string',
                            description: 'Permission set name to assign',
                            default: 'AgentAccess'
                        },
                        orgAlias: {
                            type: 'string',
                            description: 'Salesforce org alias'
                        }
                    },
                    required: ['orgAlias']
                }
            },

            verify_field_exists: {
                name: 'verify_field_exists',
                description: 'Verify field exists via schema API (does not require FLS)',
                inputSchema: {
                    type: 'object',
                    properties: {
                        objectName: {
                            type: 'string',
                            description: 'Salesforce object API name'
                        },
                        fieldName: {
                            type: 'string',
                            description: 'Field API name to verify'
                        },
                        orgAlias: {
                            type: 'string',
                            description: 'Salesforce org alias'
                        }
                    },
                    required: ['objectName', 'fieldName', 'orgAlias']
                }
            },

            verify_fls_applied: {
                name: 'verify_fls_applied',
                description: 'Verify FLS was applied via FieldPermissions and PermissionSetAssignment queries',
                inputSchema: {
                    type: 'object',
                    properties: {
                        objectName: {
                            type: 'string',
                            description: 'Salesforce object API name'
                        },
                        fieldName: {
                            type: 'string',
                            description: 'Field API name'
                        },
                        permissionSetName: {
                            type: 'string',
                            description: 'Permission set name (default: AgentAccess)',
                            default: 'AgentAccess'
                        },
                        orgAlias: {
                            type: 'string',
                            description: 'Salesforce org alias'
                        }
                    },
                    required: ['objectName', 'fieldName', 'orgAlias']
                }
            }
        };
    }

    /**
     * Handle tool invocations
     */
    async handleToolCall(toolName, params) {
        const deployer = new FLSAwareFieldDeployer({
            orgAlias: params.orgAlias,
            agentPermissionSet: params.permissionSetName || 'AgentAccess',
            verbose: true,
            dryRun: params.dryRun || false
        });

        switch (toolName) {
            case 'generate_custom_field':
                return this.generateCustomField(deployer, params);

            case 'ensure_permission_set':
                return this.ensurePermissionSet(deployer, params);

            case 'deploy_field_with_fls':
                return this.deployFieldWithFLS(deployer, params);

            case 'assign_permset':
                return this.assignPermSet(deployer, params);

            case 'verify_field_exists':
                return this.verifyFieldExists(deployer, params);

            case 'verify_fls_applied':
                return this.verifyFLSApplied(deployer, params);

            default:
                throw new Error(`Unknown tool: ${toolName}`);
        }
    }

    /**
     * Tool implementations
     */

    async generateCustomField(deployer, params) {
        const fieldMetadata = {
            fullName: params.fieldName,
            label: params.label || params.fieldName.replace('__c', '').replace(/_/g, ' '),
            type: params.fieldType,
            length: params.length,
            precision: params.precision,
            scale: params.scale,
            required: params.required || false,
            description: params.description
        };

        const xml = deployer.generateFieldXML(params.objectName, fieldMetadata);

        return {
            success: true,
            xml,
            metadata: fieldMetadata
        };
    }

    async ensurePermissionSet(deployer, params) {
        const permissions = {
            read: params.read !== false,
            edit: params.edit !== false
        };

        const xml = await deployer.ensurePermissionSetWithFLS(
            params.objectName,
            params.fieldName,
            permissions
        );

        return {
            success: true,
            xml,
            permissionSet: params.permissionSetName || 'AgentAccess'
        };
    }

    async deployFieldWithFLS(deployer, params) {
        const options = {
            permissions: {
                read: params.read !== false,
                edit: params.edit !== false
            }
        };

        const result = await deployer.deployFieldWithFLS(
            params.objectName,
            params.fieldMetadata,
            options
        );

        return result;
    }

    async assignPermSet(deployer, params) {
        const result = await deployer.assignPermissionSet();
        return result;
    }

    async verifyFieldExists(deployer, params) {
        const result = await deployer.verifyFieldViaSchema(
            params.objectName,
            params.fieldName
        );
        return result;
    }

    async verifyFLSApplied(deployer, params) {
        const result = await deployer.assertFLSApplied(
            params.objectName,
            params.fieldName
        );
        return result;
    }

    /**
     * Get tool definitions for MCP server
     */
    getToolDefinitions() {
        return Object.values(this.tools);
    }
}

// MCP Server Implementation
if (require.main === module) {
    const toolsHandler = new FLSAwareDeploymentTools();

    // Simple MCP server protocol
    const readline = require('readline');
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        terminal: false
    });

    rl.on('line', async (line) => {
        try {
            const request = JSON.parse(line);

            if (request.method === 'tools/list') {
                const response = {
                    jsonrpc: '2.0',
                    id: request.id,
                    result: {
                        tools: toolsHandler.getToolDefinitions()
                    }
                };
                console.log(JSON.stringify(response));
            } else if (request.method === 'tools/call') {
                const result = await toolsHandler.handleToolCall(
                    request.params.name,
                    request.params.arguments
                );

                const response = {
                    jsonrpc: '2.0',
                    id: request.id,
                    result: {
                        content: [{
                            type: 'text',
                            text: JSON.stringify(result, null, 2)
                        }]
                    }
                };
                console.log(JSON.stringify(response));
            }
        } catch (error) {
            const errorResponse = {
                jsonrpc: '2.0',
                id: null,
                error: {
                    code: -32603,
                    message: error.message
                }
            };
            console.error(JSON.stringify(errorResponse));
        }
    });
}

module.exports = FLSAwareDeploymentTools;
