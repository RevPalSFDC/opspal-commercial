#!/usr/bin/env node

const path = require('path');
const fs = require('fs');
const xml2js = require('xml2js');
const EnhancedMCPTool = require('../../mcp-extensions/tools/base/enhanced-mcp-tool');

class PermissionSetGroupManager extends EnhancedMCPTool {
    constructor(options = {}) {
        super({
            name: 'PermissionSetGroupManager',
            version: '1.0.0',
            stage: options.stage || 'production',
            description: 'Manages Permission Set Groups and their assignments',
            ...options
        });

        this.org = options.org || process.env.SF_TARGET_ORG;
        this.projectPath = options.projectPath || path.join(__dirname, '..', '..');
    }

    async createGroup(params) {
        this.validateParams(params, ['groupName', 'label']);

        const {
            groupName,
            label,
            description = '',
            permissionSets = [],
            targetOrg
        } = params;

        this.logOperation('psg_create_start', { groupName, permissionSets: permissionSets.length });

        const groupDir = path.join(this.projectPath, 'force-app', 'main', 'default', 'permissionSetGroups');
        await fs.promises.mkdir(groupDir, { recursive: true });

        const filePath = path.join(groupDir, `${groupName}.permissionSetGroup-meta.xml`);
        const xml = this.buildGroupXml({ groupName, label, description, permissionSets });
        await fs.promises.writeFile(filePath, xml, 'utf8');

        const command = `sf project deploy start --metadata PermissionSetGroup:${groupName} --target-org ${targetOrg || this.org} --json`;
        const result = await this.executeCommand(command);

        this.logOperation('psg_create_success', { groupName });
        return {
            success: true,
            filePath,
            output: this.parseJSON(result.stdout, { operation: 'createPermissionSetGroup' }),
            error: result.stderr,
            auditTrail: this.getAuditTrail()
        };
    }

    async updateGroupMembers(params) {
        this.validateParams(params, ['groupName', 'permissionSets']);
        const { groupName, permissionSets, targetOrg } = params;

        this.logOperation('psg_update_start', { groupName, permissionSets: permissionSets.length });

        const filePath = path.join(this.projectPath, 'force-app', 'main', 'default', 'permissionSetGroups', `${groupName}.permissionSetGroup-meta.xml`);

        if (!fs.existsSync(filePath)) {
            const retrieveCommand = `sf project retrieve start --metadata PermissionSetGroup:${groupName} --target-org ${targetOrg || this.org} --json`;
            await this.executeCommand(retrieveCommand);
        }

        if (!fs.existsSync(filePath)) {
            throw new Error(`Permission Set Group ${groupName} not found locally`);
        }

        const xml = await fs.promises.readFile(filePath, 'utf8');
        const parsed = await new xml2js.Parser().parseStringPromise(xml);
        const existingLabel = parsed.PermissionSetGroup?.label?.[0];
        const existingDescription = parsed.PermissionSetGroup?.description?.[0];

        const updatedXml = this.buildGroupXml({
            groupName,
            label: params.label || existingLabel,
            description: params.description !== undefined ? params.description : existingDescription,
            permissionSets
        });
        await fs.promises.writeFile(filePath, updatedXml, 'utf8');

        const deployCommand = `sf project deploy start --metadata PermissionSetGroup:${groupName} --target-org ${targetOrg || this.org} --json`;
        await this.executeCommand(deployCommand);

        this.logOperation('psg_update_success', { groupName });
        return {
            success: true,
            filePath,
            permissionSets,
            auditTrail: this.getAuditTrail()
        };
    }

    async toggleGroupStatus(params) {
        this.validateParams(params, ['groupName', 'status']);

        const { groupName, status, targetOrg } = params;
        this.logOperation('psg_toggle_start', { groupName, status });
        const org = targetOrg || this.org;
        const queryCommand = `sf data query --query "SELECT Id FROM PermissionSetGroup WHERE DeveloperName = '${groupName}'" --target-org ${org} --json`;
        const queryResult = await this.executeCommand(queryCommand);
        const queryOutput = this.parseJSON(queryResult.stdout, { operation: 'fetchPermissionSetGroup' });

        const groupId = queryOutput.result?.records?.[0]?.Id;
        if (!groupId) {
            this.logOperation('psg_toggle_error', { groupName, reason: 'not_found' });
            throw new Error(`Permission Set Group ${groupName} not found`);
        }

        const updateCommand = `sf data update record --sobject PermissionSetGroup --record-id ${groupId} --values Status=${status} --target-org ${org} --json`;
        const result = await this.executeCommand(updateCommand);

        this.logOperation('psg_toggle_success', { groupName, status });
        return {
            success: true,
            output: this.parseJSON(result.stdout, { operation: 'togglePermissionSetGroupStatus' }),
            auditTrail: this.getAuditTrail()
        };
    }

    buildGroupXml({ groupName, label, description, permissionSets }) {
        const permXml = (permissionSets || []).map(ps => `    <permissionSets>${ps}</permissionSets>`).join('\n');
        return `<?xml version="1.0" encoding="UTF-8"?>
<PermissionSetGroup xmlns="http://soap.sforce.com/2006/04/metadata">
    <fullName>${groupName}</fullName>
    <label>${label || groupName}</label>
    <description>${description || ''}</description>
${permXml}
</PermissionSetGroup>`;
    }
}

module.exports = PermissionSetGroupManager;
