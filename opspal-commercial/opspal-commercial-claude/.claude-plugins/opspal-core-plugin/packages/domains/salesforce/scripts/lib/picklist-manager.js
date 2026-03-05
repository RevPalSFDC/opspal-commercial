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
const { verifyFieldValue } = require('./utils/verifiers');
const { API_VERSION } = require('../../config/apiVersion');

class PicklistManager extends EnhancedMCPTool {
    constructor(options = {}) {
        super({
            name: 'PicklistManager',
            version: '1.0.0',
            stage: options.stage || 'development',
            description: 'Adds and removes picklist values via metadata deploys',
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

    async addPicklistValues(params) {
        this.validateParams(params, ['objectName', 'fieldApiName', 'values']);
        const {
            objectName,
            fieldApiName,
            values,
            makeDefault,
            activate = true,
            targetOrg,
            apiVersion = API_VERSION
        } = params;

        const alias = targetOrg || this.org;
        const fieldState = await this.loadFieldMetadata(objectName, fieldApiName, alias, apiVersion);
        const definition = this.ensureValueSetDefinition(fieldState.doc);

        const existingValues = new Set((definition.value || []).map(entry => entry.fullName?.[0]));
        const newEntries = [];

        values.forEach(value => {
            if (!existingValues.has(value)) {
                newEntries.push({
                    fullName: [value],
                    default: [String(makeDefault === value)],
                    label: [value],
                    isActive: [String(Boolean(activate))]
                });
            }
        });

        if (newEntries.length === 0) {
            return { success: true, message: 'All values are already present.' };
        }

        definition.value = (definition.value || []).concat(newEntries);
        await this.writeFieldMetadata(fieldState.path, fieldState.doc);

        await this.deployField(objectName, fieldApiName, alias, apiVersion);

        const verified = await verifyFieldValue(this, {
            objectName,
            fieldApiName,
            value: values[0],
            alias,
            apiVersion
        });

        if (!verified) {
            throw this.enhanceError(new Error('Picklist verification failed after deploy.'), {
                operation: 'addPicklistValues',
                objectName,
                fieldApiName
            });
        }

        this.logOperation('picklist_add_success', { objectName, fieldApiName, added: newEntries.length });
        return {
            success: true,
            changed: true,
            added: newEntries.map(entry => entry.fullName[0]),
            auditTrail: this.getAuditTrail()
        };
    }

    async removePicklistValues(params) {
        this.validateParams(params, ['objectName', 'fieldApiName', 'values']);
        const {
            objectName,
            fieldApiName,
            values,
            targetOrg,
            apiVersion = API_VERSION
        } = params;

        const alias = targetOrg || this.org;
        const removalSet = new Set(values.map(v => v.toLowerCase()));
        const fieldState = await this.loadFieldMetadata(objectName, fieldApiName, alias, apiVersion);
        const definition = this.ensureValueSetDefinition(fieldState.doc);
        const originalLength = (definition.value || []).length;

        definition.value = (definition.value || []).filter(entry => !removalSet.has((entry.fullName?.[0] || '').toLowerCase()));

        if (definition.value.length === originalLength) {
            return { success: true, changed: false, message: 'No matching values found to remove.' };
        }

        await this.writeFieldMetadata(fieldState.path, fieldState.doc);
        await this.deployField(objectName, fieldApiName, alias, apiVersion);

        this.logOperation('picklist_remove_success', { objectName, fieldApiName, removed: values.length });
        return {
            success: true,
            changed: true,
            removed: values,
            auditTrail: this.getAuditTrail()
        };
    }

    async reorderPicklistValues(params) {
        this.validateParams(params, ['objectName', 'fieldApiName', 'order']);
        const {
            objectName,
            fieldApiName,
            order,
            targetOrg,
            apiVersion = API_VERSION
        } = params;

        const alias = targetOrg || this.org;
        const desiredOrder = order.map(value => value.toLowerCase());
        const fieldState = await this.loadFieldMetadata(objectName, fieldApiName, alias, apiVersion);
        const definition = this.ensureValueSetDefinition(fieldState.doc);

        if (!Array.isArray(definition.value)) {
            throw this.enhanceError(new Error('Picklist definition missing; cannot reorder values.'), {
                operation: 'reorderPicklistValues',
                objectName,
                fieldApiName
            });
        }

        const current = new Map();
        definition.value.forEach(entry => {
            const key = (entry.fullName?.[0] || '').toLowerCase();
            current.set(key, entry);
        });

        const reordered = [];
        desiredOrder.forEach(key => {
            if (current.has(key)) {
                reordered.push(current.get(key));
                current.delete(key);
            }
        });
        current.forEach(entry => reordered.push(entry));
        definition.value = reordered;
        definition.sorted = ['false'];

        await this.writeFieldMetadata(fieldState.path, fieldState.doc);
        await this.deployField(objectName, fieldApiName, alias, apiVersion);

        this.logOperation('picklist_reorder_success', { objectName, fieldApiName, order: order });
        return {
            success: true,
            changed: true,
            order,
            auditTrail: this.getAuditTrail()
        };
    }

    async loadFieldMetadata(objectName, fieldApiName, alias, apiVersion) {
        const localPath = path.join(this.projectPath, 'force-app', 'main', 'default', 'objects', objectName, 'fields', `${fieldApiName}.field-meta.xml`);
        if (!fs.existsSync(localPath)) {
            const command = `sf project retrieve start --metadata CustomField:${objectName}.${fieldApiName} --target-org ${alias} --api-version ${apiVersion} --output-dir "${this.projectPath}" --json`;
            try {
                const result = await this.executeCommand(command);
                this.parseJSON(result.stdout, { operation: 'retrieveField', objectName, fieldApiName });
            } catch (error) {
                const line = firstLine(error.stderr || error.message);
                throw this.enhanceError(new Error(`Unable to retrieve metadata for ${objectName}.${fieldApiName}: ${line}`), {
                    operation: 'loadFieldMetadata',
                    objectName,
                    fieldApiName
                });
            }
        }

        const xml = await fs.promises.readFile(localPath, 'utf8');
        const doc = await this.parser.parseStringPromise(xml);
        return { path: localPath, doc };
    }

    ensureValueSetDefinition(fieldDoc) {
        fieldDoc.CustomField = fieldDoc.CustomField || {};
        fieldDoc.CustomField.valueSet = fieldDoc.CustomField.valueSet || [{}];
        if (!Array.isArray(fieldDoc.CustomField.valueSet)) {
            fieldDoc.CustomField.valueSet = [fieldDoc.CustomField.valueSet];
        }
        const valueSet = fieldDoc.CustomField.valueSet[0];
        valueSet.valueSetDefinition = valueSet.valueSetDefinition || [{}];
        if (!Array.isArray(valueSet.valueSetDefinition)) {
            valueSet.valueSetDefinition = [valueSet.valueSetDefinition];
        }
        return valueSet.valueSetDefinition[0];
    }

    async writeFieldMetadata(fieldPath, fieldDoc) {
        const xml = this.builder.buildObject(fieldDoc);
        await fs.promises.writeFile(fieldPath, xml, 'utf8');
    }

    async deployField(objectName, fieldApiName, alias, apiVersion) {
        const tempRoot = await createTempDir('picklist', this.projectPath);
        await ensureProjectScaffold(tempRoot, apiVersion);

        const relativeField = path.join('force-app', 'main', 'default', 'objects', objectName, 'fields', `${fieldApiName}.field-meta.xml`);
        await stageFile(path.join(this.projectPath, relativeField), tempRoot, relativeField);

        const objectMetaPath = path.join(this.projectPath, 'force-app', 'main', 'default', 'objects', objectName, `${objectName}.object-meta.xml`);
        const manifestMembers = {
            CustomField: [`${objectName}.${fieldApiName}`]
        };
        if (fs.existsSync(objectMetaPath)) {
            await stageFile(objectMetaPath, tempRoot, path.join('force-app', 'main', 'default', 'objects', objectName, `${objectName}.object-meta.xml`));
            manifestMembers.CustomObject = [objectName];
        }

        const manifestPath = await writeManifest(tempRoot, manifestMembers, apiVersion);

        await projectDeployValidate(this, {
            projectDir: tempRoot,
            manifestPath,
            alias,
            apiVersion
        });

        try {
            await projectDeployWithPoll(this, {
                projectDir: tempRoot,
                manifestPath,
                alias,
                apiVersion
            });
        } catch (error) {
            throw this.enhanceError(error, {
                operation: 'deployFieldMetadata',
                objectName,
                fieldApiName,
                firstErrorLine: error.context?.firstErrorLine || error.message
            });
        }
    }
}

module.exports = PicklistManager;
