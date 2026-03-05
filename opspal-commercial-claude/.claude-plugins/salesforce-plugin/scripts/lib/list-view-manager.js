#!/usr/bin/env node

const path = require('path');
const fs = require('fs');
const xml2js = require('xml2js');
const EnhancedMCPTool = require('../../mcp-extensions/tools/base/enhanced-mcp-tool');

class ListViewManager extends EnhancedMCPTool {
    constructor(options = {}) {
        super({
            name: 'ListViewManager',
            version: '1.0.0',
            stage: options.stage || 'production',
            description: 'Salesforce list view creation and management toolkit',
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

    async createListView(params) {
        this.validateParams(params, ['objectName', 'developerName', 'label']);

        const {
            objectName,
            developerName,
            label,
            columns = [],
            filters = [],
            filterLogic,
            limit,
            targetOrg
        } = params;

        this.logOperation('list_view_create_start', { objectName, developerName, columns: columns.length, filters: filters.length });

        const listViewDir = path.join(
            this.projectPath,
            'force-app',
            'main',
            'default',
            'objects',
            objectName,
            'listViews'
        );
        await fs.promises.mkdir(listViewDir, { recursive: true });

        const filePath = path.join(listViewDir, `${developerName}.listView-meta.xml`);
        const xml = this.buildListViewXml({ developerName, label, columns, filters, filterLogic, limit });
        await fs.promises.writeFile(filePath, xml, 'utf8');

        await this.deployListView(objectName, developerName, targetOrg);

        this.logOperation('list_view_create_success', { objectName, developerName });
        return {
            success: true,
            changed: true,
            filePath,
            auditTrail: this.getAuditTrail()
        };
    }

    async cloneListView(params) {
        this.validateParams(params, ['objectName', 'sourceDeveloperName', 'newDeveloperName', 'label']);

        const {
            objectName,
            sourceDeveloperName,
            newDeveloperName,
            label,
            targetOrg
        } = params;

        this.logOperation('list_view_clone_start', { objectName, sourceDeveloperName, newDeveloperName });

        const org = targetOrg || this.org;
        const listViewPath = await this.ensureListViewMetadata(objectName, sourceDeveloperName, org);
        const xmlContent = await fs.promises.readFile(listViewPath, 'utf8');
        const listViewObj = await this.parser.parseStringPromise(xmlContent);

        listViewObj.ListView.fullName = [newDeveloperName];
        listViewObj.ListView.label = [label];
        listViewObj.ListView.developerName = [newDeveloperName];

        const newPath = path.join(path.dirname(listViewPath), `${newDeveloperName}.listView-meta.xml`);
        const newXml = this.builder.buildObject(listViewObj);
        await fs.promises.writeFile(newPath, newXml, 'utf8');

        await this.deployListView(objectName, newDeveloperName, targetOrg);

        this.logOperation('list_view_clone_success', { objectName, sourceDeveloperName, newDeveloperName });
        return {
            success: true,
            changed: true,
            filePath: newPath,
            auditTrail: this.getAuditTrail()
        };
    }

    buildListViewXml({ developerName, label, columns, filters, filterLogic, limit }) {
        const columnXml = columns.map(column => `    <columns>${column}</columns>`).join('\n');
        const filterXml = filters.map(filter => `    <filters>
        <field>${filter.field}</field>
        <operation>${filter.operation || 'equals'}</operation>
        <value>${filter.value}</value>
    </filters>`).join('\n');

        return `<?xml version="1.0" encoding="UTF-8"?>
<ListView xmlns="http://soap.sforce.com/2006/04/metadata">
    <fullName>${developerName}</fullName>
    <label>${label}</label>
${columnXml}
${filterXml}
${filterLogic ? `    <filterLogic>${filterLogic}</filterLogic>` : ''}
${limit ? `    <limit>${limit}</limit>` : ''}
    <filterScope>Everything</filterScope>
</ListView>`;
    }

    async ensureListViewMetadata(objectName, developerName, targetOrg) {
        const listViewPath = path.join(
            this.projectPath,
            'force-app',
            'main',
            'default',
            'objects',
            objectName,
            'listViews',
            `${developerName}.listView-meta.xml`
        );

        if (!fs.existsSync(listViewPath)) {
            const command = `sf project retrieve start --metadata ListView:${objectName}.${developerName} --target-org ${targetOrg || this.org} --json`;
            await this.executeCommand(command);
        }

        if (!fs.existsSync(listViewPath)) {
            throw new Error(`Unable to retrieve list view ${objectName}.${developerName}`);
        }

        return listViewPath;
    }

    async deployListView(objectName, developerName, targetOrg) {
        const command = `sf project deploy start --metadata ListView:${objectName}.${developerName} --target-org ${targetOrg || this.org} --json`;
        await this.executeCommand(command);
    }
}

module.exports = ListViewManager;
