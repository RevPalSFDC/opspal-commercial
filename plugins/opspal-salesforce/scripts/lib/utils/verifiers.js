const path = require('path');
const fs = require('fs');
const { createTempDir, stageFile } = require('./mcp-helpers');
const { withNamespace } = require('./namespace');

async function verifyQuickAction(tool, { objectName, developerName, alias }) {
    if (!alias) {
        return true;
    }
    const soql = `SELECT Id FROM QuickActionDefinition WHERE DeveloperName='${developerName}' AND SobjectType='${objectName}' LIMIT 1`;
    try {
        const result = await tool.executeCommand(`sf data query --json --query "${soql}" --target-org ${alias}`);
        const parsed = tool.parseJSON(result.stdout, { operation: 'verifyQuickAction' });
        return (parsed.result?.records?.length || 0) > 0;
    } catch (error) {
        tool.logOperation?.('verify_quick_action_warning', {
            objectName,
            developerName,
            message: error.message
        });
        return false;
    }
}

async function retrieveMetadataFile(tool, { metadata, alias, apiVersion, namespacePrefix, member, tempLabel }) {
    const memberName = namespacePrefix ? withNamespace(member, namespacePrefix) : member;
    const localPath = path.join(tool.projectPath || '', 'force-app', 'main', 'default');
    const nestedPath = metadata === 'DuplicateRule'
        ? path.join(localPath, 'duplicateRules', `${memberName}.duplicateRule-meta.xml`)
        : metadata === 'GlobalValueSetTranslation'
            ? path.join(localPath, 'globalValueSetTranslations', `${memberName}.globalValueSetTranslation-meta.xml`)
            : metadata === 'CustomField'
                ? null
                : null;

    if (!alias && nestedPath && fs.existsSync(nestedPath)) {
        const tempRoot = await createTempDir(tempLabel || 'verification-local');
        const relative = nestedPath.split(`${tool.projectPath}/`)[1];
        await stageFile(nestedPath, tempRoot, relative);
        return { tempRoot };
    }

    const tempRoot = await createTempDir(tempLabel || 'verification');

    if (!alias) {
        return { tempRoot, failed: true };
    }

    const command = `sf project retrieve start --metadata ${metadata}:${memberName} --target-org ${alias} --api-version ${apiVersion} --output-dir "${tempRoot}" --json`;
    try {
        const result = await tool.executeCommand(command);
        tool.parseJSON(result.stdout, { operation: 'retrieveMetadata', metadata, member: memberName });
        return { tempRoot };
    } catch (error) {
        tool.logOperation?.('verification_retrieve_warning', {
            metadata,
            member: memberName,
            message: error.message
        });
        return { tempRoot, failed: true };
    }
}

async function verifyGlobalValueSetTranslation(tool, { globalValueSet, locale, alias, apiVersion, namespacePrefix }) {
    if (!alias) {
        return true;
    }
    const member = `${withNamespace(globalValueSet, namespacePrefix)}-${locale}`;
    const { tempRoot, failed } = await retrieveMetadataFile(tool, {
        metadata: 'GlobalValueSetTranslation',
        member,
        alias,
        apiVersion,
        tempLabel: 'verify-gvs-translation'
    });
    if (failed) {
        return false;
    }
    const filePath = path.join(tempRoot, 'force-app', 'main', 'default', 'globalValueSetTranslations', `${member}.globalValueSetTranslation-meta.xml`);
    try {
        const xml = await fs.promises.readFile(filePath, 'utf8');
        return xml.includes(`<language>${locale}</language>`);
    } catch (error) {
        return false;
    }
}

async function verifyFieldValue(tool, { objectName, fieldApiName, value, alias, apiVersion }) {
    if (!alias) {
        return true;
    }
    const member = `${objectName}.${fieldApiName}`;
    const { tempRoot, failed } = await retrieveMetadataFile(tool, {
        metadata: 'CustomField',
        member,
        alias,
        apiVersion,
        tempLabel: 'verify-field'
    });
    if (failed) {
        return false;
    }
    const filePath = path.join(tempRoot, 'force-app', 'main', 'default', 'objects', objectName, 'fields', `${fieldApiName}.field-meta.xml`);
    try {
        const xml = await fs.promises.readFile(filePath, 'utf8');
        return xml.includes(`<fullName>${value}</fullName>`);
    } catch (error) {
        return false;
    }
}

async function verifyDuplicateRuleActive(tool, { objectName, ruleName, alias, apiVersion }) {
    if (!alias) {
        return true;
    }
    const member = `${objectName}.${ruleName}`;
    const { tempRoot, failed } = await retrieveMetadataFile(tool, {
        metadata: 'DuplicateRule',
        member,
        alias,
        apiVersion,
        tempLabel: 'verify-duplicate-rule'
    });
    if (failed) {
        return false;
    }
    const filePath = path.join(tempRoot, 'force-app', 'main', 'default', 'duplicateRules', `${member}.duplicateRule-meta.xml`);
    try {
        const xml = await fs.promises.readFile(filePath, 'utf8');
        return /<isActive>\s*true\s*<\/isActive>/.test(xml);
    } catch (error) {
        return false;
    }
}

module.exports = {
    verifyQuickAction,
    verifyGlobalValueSetTranslation,
    verifyFieldValue,
    verifyDuplicateRuleActive
};
