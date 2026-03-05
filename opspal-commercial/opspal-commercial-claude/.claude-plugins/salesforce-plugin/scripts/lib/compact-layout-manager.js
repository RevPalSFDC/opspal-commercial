#!/usr/bin/env node

const path = require('path');
const fs = require('fs');
const xml2js = require('xml2js');
const EnhancedMCPTool = require('../../mcp-extensions/tools/base/enhanced-mcp-tool');

class CompactLayoutManager extends EnhancedMCPTool {
    constructor(options = {}) {
        super({
            name: 'CompactLayoutManager',
            version: '1.0.0',
            stage: options.stage || 'production',
            description: 'Salesforce compact layout creation and assignment toolkit',
            ...options
        });

        this.org = options.org || process.env.SF_TARGET_ORG;
        this.projectPath = options.projectPath || path.join(__dirname, '..', '..');
        this.parser = new xml2js.Parser();
        this.builder = new xml2js.Builder({
            xmldec: { version: '1.0', encoding: 'UTF-8' },
            renderOpts: { pretty: true, indent: '    ', newline: '\n' }
        });
    }

    async createCompactLayout(params) {
        this.validateParams(params, ['objectName', 'developerName', 'label', 'fields']);

        const {
            objectName,
            developerName,
            label,
            fields,
            targetOrg
        } = params;

        if (!Array.isArray(fields) || fields.length === 0) {
            throw new Error('fields must be a non-empty array');
        }

        this.logOperation('compact_layout_create_start', { objectName, developerName, fieldCount: fields.length });

        const compactDir = path.join(
            this.projectPath,
            'force-app',
            'main',
            'default',
            'objects',
            objectName,
            'compactLayouts'
        );
        await fs.promises.mkdir(compactDir, { recursive: true });

        const filePath = path.join(compactDir, `${developerName}.compactLayout-meta.xml`);
        const xml = this.buildCompactLayoutXml({ objectName, developerName, label, fields });
        await fs.promises.writeFile(filePath, xml, 'utf8');

        await this.deployCompactLayout(objectName, developerName, targetOrg);

        this.logOperation('compact_layout_create_success', { objectName, developerName });
        return {
            success: true,
            changed: true,
            filePath,
            auditTrail: this.getAuditTrail()
        };
    }

    async assignCompactLayout(params) {
        this.validateParams(params, ['objectName', 'developerName']);

        const {
            objectName,
            developerName,
            recordType,
            setDefault = false,
            targetOrg
        } = params;

        this.logOperation('compact_layout_assign_start', { objectName, developerName, recordType, setDefault });

        const org = targetOrg || this.org;
        const objectPath = await this.ensureObjectMetadata(objectName, org);
        const xmlContent = await fs.promises.readFile(objectPath, 'utf8');
        const objectObj = await this.parser.parseStringPromise(xmlContent);

        objectObj.CustomObject = objectObj.CustomObject || {};
        objectObj.CustomObject.compactLayoutAssignments = objectObj.CustomObject.compactLayoutAssignments || [];
        if (!Array.isArray(objectObj.CustomObject.compactLayoutAssignments)) {
            objectObj.CustomObject.compactLayoutAssignments = [objectObj.CustomObject.compactLayoutAssignments];
        }

        const layoutFullName = `${objectName}.${developerName}`;
        const assignment = {
            layout: [layoutFullName]
        };
        if (recordType) {
            assignment.recordType = [`${objectName}.${recordType}`];
        }

        // Remove any existing assignment for same record type/default pair to avoid duplicates
        objectObj.CustomObject.compactLayoutAssignments = objectObj.CustomObject.compactLayoutAssignments.filter(entry => {
            const matchesLayout = entry.layout?.[0] === layoutFullName;
            const matchesRecordType = (entry.recordType?.[0] || '') === (recordType ? `${objectName}.${recordType}` : undefined);
            return !(matchesLayout && matchesRecordType);
        });

        objectObj.CustomObject.compactLayoutAssignments.push(assignment);

        if (setDefault) {
            objectObj.CustomObject.defaultCompactLayout = [layoutFullName];
        }

        const updatedXml = this.builder.buildObject(objectObj);
        await fs.promises.writeFile(objectPath, updatedXml, 'utf8');

        const deployCommand = `sf project deploy start --metadata CustomObject:${objectName} --target-org ${org} --json`;
        await this.executeCommand(deployCommand);

        this.logOperation('compact_layout_assign_success', { objectName, developerName, recordType, setDefault });
        return {
            success: true,
            changed: true,
            assignment,
            auditTrail: this.getAuditTrail()
        };
    }

    buildCompactLayoutXml({ objectName, developerName, label, fields }) {
        const fieldXml = fields.map(field => `    <fields>${field}</fields>`).join('\n');
        return `<?xml version="1.0" encoding="UTF-8"?>
<CompactLayout xmlns="http://soap.sforce.com/2006/04/metadata">
    <fullName>${developerName}</fullName>
    <label>${label}</label>
    <object>${objectName}</object>
${fieldXml}
</CompactLayout>`;
    }

    async deployCompactLayout(objectName, developerName, targetOrg) {
        const command = `sf project deploy start --metadata CompactLayout:${objectName}.${developerName} --target-org ${targetOrg || this.org} --json`;
        await this.executeCommand(command);
    }

    async ensureObjectMetadata(objectName, targetOrg) {
        const objectPath = path.join(
            this.projectPath,
            'force-app',
            'main',
            'default',
            'objects',
            objectName,
            `${objectName}.object-meta.xml`
        );

        if (!fs.existsSync(objectPath)) {
            const command = `sf project retrieve start --metadata CustomObject:${objectName} --target-org ${targetOrg} --json`;
            await this.executeCommand(command);
        }

        if (!fs.existsSync(objectPath)) {
            throw new Error(`Unable to retrieve object metadata for ${objectName}`);
        }

        return objectPath;
    }
}

module.exports = CompactLayoutManager;
