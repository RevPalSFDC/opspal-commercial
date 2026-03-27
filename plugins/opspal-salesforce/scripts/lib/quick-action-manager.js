#!/usr/bin/env node

const path = require('path');
const fs = require('fs');
const xml2js = require('xml2js');
const EnhancedMCPTool = require('../../mcp-extensions/tools/base/enhanced-mcp-tool');
const {
    createTempDir,
    ensureProjectScaffold,
    firstLine,
    projectDeployValidate,
    projectDeployWithPoll,
    stageFile,
    writeManifest
} = require('./utils/mcp-helpers');
const {
    withNamespace,
    layoutMember,
    assertLayoutNotNamespaced
} = require('./utils/namespace');
const {
    verifyQuickAction
} = require('./utils/verifiers');
const { API_VERSION } = require('../../config/apiVersion');

class QuickActionManager extends EnhancedMCPTool {
    constructor(options = {}) {
        super({
            name: 'QuickActionManager',
            version: '1.0.0',
            stage: options.stage || 'development',
            description: 'Creates, deploys, and places Salesforce quick actions',
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

    async createQuickAction(params) {
        this.validateParams(params, ['developerName', 'label', 'actionType']);
        const {
            objectName,
            developerName,
            label,
            description = '',
            actionType,
            targetObject,
            targetParentField,
            flowApiName,
            lightningComponent,
            visualforcePage,
            fields = [],
            targetOrg,
            namespacePrefix
        } = params;

        const alias = targetOrg || this.org;
        const apiVersion = params.apiVersion || API_VERSION;
        const isGlobal = !objectName;
        const scopedObjectName = objectName ? withNamespace(objectName, namespacePrefix) : null;
        const scopedDeveloperName = withNamespace(developerName, namespacePrefix);
        const manifestActionMember = isGlobal ? scopedDeveloperName : `${scopedObjectName}.${scopedDeveloperName}`;

        this.logOperation('quick_action_create_start', {
            developerName,
            scope: isGlobal ? 'global' : objectName,
            namespace: namespacePrefix || ''
        });

        const tempRoot = await createTempDir('quick-action', this.projectPath);
        await ensureProjectScaffold(tempRoot, apiVersion);
        const quickActionDir = isGlobal
            ? path.join(tempRoot, 'force-app', 'main', 'default', 'globalQuickActions')
            : path.join(tempRoot, 'force-app', 'main', 'default', 'objects', objectName, 'quickActions');
        await fs.promises.mkdir(quickActionDir, { recursive: true });
        const actionFilePath = path.join(quickActionDir, `${developerName}.quickAction-meta.xml`);

        const xml = this.buildQuickActionXml({
            isGlobal,
            objectName,
            namespacePrefix,
            developerName,
            label,
            description,
            actionType,
            targetObject,
            targetParentField,
            flowApiName,
            lightningComponent,
            visualforcePage,
            fields
        });
        await fs.promises.writeFile(actionFilePath, xml, 'utf8');

        const manifestMembers = {
            [isGlobal ? 'GlobalQuickAction' : 'QuickAction']: [manifestActionMember]
        };

        if (!isGlobal && objectName) {
            manifestMembers.CustomObject = [scopedObjectName];
            const layoutNames = await this.stageLayoutDependencies(objectName, namespacePrefix, alias, apiVersion, tempRoot);
            if (layoutNames.length > 0) {
                manifestMembers.Layout = layoutNames;
            }
        }

        const manifestPath = await writeManifest(tempRoot, manifestMembers, apiVersion);

        await projectDeployValidate(this, {
            projectDir: tempRoot,
            manifestPath,
            alias,
            apiVersion
        });

        await projectDeployWithPoll(this, {
            projectDir: tempRoot,
            manifestPath,
            alias,
            apiVersion
        });

        const verified = await verifyQuickAction(this, {
            objectName: objectName || (targetObject || ''),
            developerName,
            alias
        });

        if (!verified) {
            throw this.enhanceError(new Error('Quick action deploy completed, but verification failed.'), {
                operation: 'createQuickAction',
                developerName,
                objectName
            });
        }

        this.logOperation('quick_action_create_success', {
            developerName,
            scope: isGlobal ? 'global' : objectName
        });

        return {
            success: true,
            filePath: actionFilePath,
            manifestMembers,
            auditTrail: this.getAuditTrail()
        };
    }

    async assignQuickActionToLayout(params) {
        this.validateParams(params, ['objectName', 'layoutName', 'actionName']);
        const {
            objectName,
            layoutName,
            actionName,
            namespacePrefix,
            targetOrg,
            apiVersion = API_VERSION
        } = params;

        const alias = targetOrg || this.org;
        const layoutMemberName = layoutMember(objectName, layoutName);
        assertLayoutNotNamespaced(layoutMemberName);

        const qaFullName = withNamespace(actionName, namespacePrefix);

        const localLayoutPath = path.join(this.projectPath, 'force-app', 'main', 'default', 'layouts', `${layoutMemberName}.layout-meta.xml`);
        if (fs.existsSync(localLayoutPath)) {
            const localXml = await fs.promises.readFile(localLayoutPath, 'utf8');
            if (this.layoutHasAction(localXml, qaFullName)) {
                this.logOperation('quick_action_assign_noop', {
                    reason: 'already_present_local'
                });
                return { success: true, message: 'Quick action already placed on layout.' };
            }
        }

        this.logOperation('quick_action_assign_start', {
            objectName,
            layoutName,
            actionName: qaFullName
        });

        const layoutState = await this.retrieveLayout(objectName, layoutName, { alias, apiVersion });
        if (this.layoutHasAction(layoutState.xml, qaFullName)) {
            this.logOperation('quick_action_assign_noop', {
                reason: 'already_present'
            });
            return { success: true, message: 'Quick action already placed on layout.' };
        }

        const updatedXml = this.insertQuickAction(layoutState.xml, qaFullName);
        const tempRoot = await createTempDir('quick-action-layout', this.projectPath);
        await ensureProjectScaffold(tempRoot, apiVersion);
        const relative = path.join('force-app', 'main', 'default', 'layouts', `${layoutMemberName}.layout-meta.xml`);

        if (!alias && layoutState.path) {
            await fs.promises.writeFile(layoutState.path, updatedXml, 'utf8');
        }

        await stageFile(layoutState.path, tempRoot, relative);
        await fs.promises.writeFile(path.join(tempRoot, relative), updatedXml, 'utf8');

        const manifestPath = await writeManifest(tempRoot, { Layout: [layoutMemberName] }, apiVersion);

        await projectDeployValidate(this, {
            projectDir: tempRoot,
            manifestPath,
            alias,
            apiVersion
        });

        await projectDeployWithPoll(this, {
            projectDir: tempRoot,
            manifestPath,
            alias,
            apiVersion
        });

        let verificationXml = null;
        if (alias) {
            const verification = await this.retrieveLayout(objectName, layoutName, { alias, apiVersion });
            verificationXml = verification.xml;
            if (!this.layoutHasAction(verification.xml, qaFullName)) {
                throw this.enhanceError(new Error('Layout placement verification failed.'), {
                    operation: 'assignQuickActionToLayout',
                    layoutName,
                    actionName: qaFullName
                });
            }
        }

        const finalXml = verificationXml || updatedXml;
        if (fs.existsSync(localLayoutPath)) {
            await fs.promises.writeFile(localLayoutPath, finalXml, 'utf8');
        }

        this.logOperation('quick_action_assign_success', {
            objectName,
            layoutName,
            actionName: qaFullName
        });

        return {
            success: true,
            layout: layoutMemberName,
            auditTrail: this.getAuditTrail()
        };
    }

    buildQuickActionXml({
        isGlobal,
        objectName,
        namespacePrefix,
        developerName,
        label,
        description,
        actionType,
        targetObject,
        targetParentField,
        flowApiName,
        lightningComponent,
        visualforcePage,
        fields
    }) {
        const scopedObject = objectName ? withNamespace(objectName, namespacePrefix) : null;
        const scopedDeveloper = withNamespace(developerName, namespacePrefix);
        const fullName = isGlobal ? scopedDeveloper : `${scopedObject}.${scopedDeveloper}`;
        const target = isGlobal ? '' : (targetObject ? withNamespace(targetObject, namespacePrefix) : scopedObject);
        const layoutXml = this.buildQuickActionLayout(actionType, fields);
        const childCreateTargets = new Set(['Case', 'Contact', 'Opportunity']);

        if (
            actionType === 'Create' &&
            targetObject &&
            childCreateTargets.has(targetObject) &&
            objectName &&
            !targetParentField
        ) {
            throw new Error(
                `Quick Action Create for ${objectName} -> ${targetObject} requires targetParentField to define the parent lookup field.`
            );
        }

        let actionSpecific = '';
        switch (actionType) {
            case 'Flow':
                actionSpecific = `    <flowDefinition>${withNamespace(flowApiName, namespacePrefix)}</flowDefinition>`;
                break;
            case 'LightningComponent':
                actionSpecific = `    <lightningComponent>${lightningComponent}</lightningComponent>`;
                break;
            case 'Visualforce':
                actionSpecific = `    <visualforcePage>${visualforcePage}</visualforcePage>`;
                break;
            case 'Update':
                actionSpecific = layoutXml;
                break;
            default:
                actionSpecific = '';
        }

        const targetTag = !isGlobal ? `    <targetObject>${target}</targetObject>\n` : '';
        const targetParentFieldTag = targetParentField
            ? `    <targetParentField>${targetParentField}</targetParentField>\n`
            : '';
        const optionsBlock = actionType === 'Update'
            ? `    <optionsCreateFeedItem>false</optionsCreateFeedItem>\n    <optionsShowQuickActionVfHeader>false</optionsShowQuickActionVfHeader>\n    <optionsShowSubmitter>false</optionsShowSubmitter>\n`
            : '';

        return `<?xml version="1.0" encoding="UTF-8"?>\n<QuickAction xmlns="http://soap.sforce.com/2006/04/metadata">\n    <fullName>${fullName}</fullName>\n    <label>${label}</label>\n    <description>${description}</description>\n${optionsBlock}    <type>${actionType}</type>\n${targetTag}${targetParentFieldTag}${actionSpecific}\n</QuickAction>`;
    }

    buildQuickActionLayout(actionType, fields = []) {
        if (actionType !== 'Update' || !fields || fields.length === 0) {
            return '';
        }

        const selected = fields.slice(0, 4);
        const fieldLines = selected.map(field => `                <fields>${field}</fields>`).join('\n');

        return `    <quickActionLayout>\n        <layoutSectionStyle>TwoColumnsTopToBottom</layoutSectionStyle>\n        <quickActionLayoutColumn>\n            <quickActionLayoutItem>\n${fieldLines}\n            </quickActionLayoutItem>\n        </quickActionLayoutColumn>\n    </quickActionLayout>`;
    }

    async stageLayoutDependencies(objectName, namespacePrefix, alias, apiVersion, tempRoot) {
        const layoutNames = [];
        const layoutDir = path.join(this.projectPath, 'force-app', 'main', 'default', 'layouts');

        if (fs.existsSync(layoutDir)) {
            const entries = await fs.promises.readdir(layoutDir);
            for (const entry of entries) {
                if (!entry.startsWith(`${objectName}-`) || !entry.endsWith('.layout-meta.xml')) {
                    continue;
                }
                const member = layoutMember(objectName, entry.replace(`${objectName}-`, '').replace('.layout-meta.xml', ''));
                assertLayoutNotNamespaced(member);
                layoutNames.push(member);
                const relative = path.join('force-app', 'main', 'default', 'layouts', entry);
                await stageFile(path.join(layoutDir, entry), tempRoot, relative);
            }
        }

        if (layoutNames.length > 0) {
            return layoutNames;
        }

        if (!alias) {
            return layoutNames;
        }

        const defaultLayout = `${objectName} Layout`;
        const member = layoutMember(objectName, defaultLayout);
        assertLayoutNotNamespaced(member);
        try {
            const retrieveDir = await createTempDir('layout-retrieve', this.projectPath);
            const command = `sf project retrieve start --metadata Layout:"${member}" --target-org ${alias} --api-version ${apiVersion} --output-dir "${retrieveDir}" --json`;
            const result = await this.executeCommand(command);
            this.parseJSON(result.stdout, { operation: 'retrieveLayout', member });
            const layoutPath = path.join(retrieveDir, 'force-app', 'main', 'default', 'layouts', `${member}.layout-meta.xml`);
            if (fs.existsSync(layoutPath)) {
                await stageFile(layoutPath, tempRoot, path.join('force-app', 'main', 'default', 'layouts', `${member}.layout-meta.xml`));
                layoutNames.push(member);
            }
        } catch (error) {
            this.logOperation('layout_dependency_warning', {
                layout: member,
                message: firstLine(error.stderr || error.message)
            });
        }

        return layoutNames;
    }

    layoutHasAction(layoutXml, actionFullName) {
        return layoutXml.includes(`<quickAction>${actionFullName}</quickAction>`) ||
            layoutXml.includes(`<actionName>${actionFullName}</actionName>`);
    }

    insertQuickAction(layoutXml, actionFullName) {
        const block = `    <platformActionList>\n        <actionListContext>Record</actionListContext>\n        <platformActionListItems>\n            <actionName>${actionFullName}</actionName>\n            <actionType>QuickAction</actionType>\n        </platformActionListItems>\n    </platformActionList>`;
        if (layoutXml.includes('<platformActionList>')) {
            return layoutXml.replace('<platformActionList>', `<platformActionList>\n${block}`);
        }
        return layoutXml.replace('</Layout>', `${block}\n</Layout>`);
    }

    async retrieveLayout(objectName, layoutName, { alias, apiVersion }) {
        const member = layoutMember(objectName, layoutName);
        const localPath = path.join(this.projectPath, 'force-app', 'main', 'default', 'layouts', `${member}.layout-meta.xml`);

        if (!alias && fs.existsSync(localPath)) {
            const xml = await fs.promises.readFile(localPath, 'utf8');
            return { xml, path: localPath };
        }

        const tempRoot = await createTempDir('layout-check', this.projectPath);
        const command = `sf project retrieve start --metadata Layout:"${member}" --target-org ${alias} --api-version ${apiVersion} --output-dir "${tempRoot}" --json`;
        const result = await this.executeCommand(command);
        this.parseJSON(result.stdout, { operation: 'retrieveLayout', member });
        const layoutPath = path.join(tempRoot, 'force-app', 'main', 'default', 'layouts', `${member}.layout-meta.xml`);
        const xml = await fs.promises.readFile(layoutPath, 'utf8');
        return { xml, path: layoutPath };
    }
}

module.exports = QuickActionManager;
