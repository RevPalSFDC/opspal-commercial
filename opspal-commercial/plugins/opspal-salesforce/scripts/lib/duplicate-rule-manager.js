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
const { verifyDuplicateRuleActive } = require('./utils/verifiers');
const { API_VERSION } = require('../../config/apiVersion');

class DuplicateRuleManager extends EnhancedMCPTool {
    constructor(options = {}) {
        super({
            name: 'DuplicateRuleManager',
            version: '1.0.0',
            stage: options.stage || 'development',
            description: 'Activates or deactivates duplicate rules',
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

    async toggleDuplicateRule(params) {
        this.validateParams(params, ['objectName', 'ruleName', 'active']);
        const {
            objectName,
            ruleName,
            active,
            targetOrg,
            apiVersion = API_VERSION
        } = params;

        const alias = targetOrg || this.org;
        const member = `${objectName}.${ruleName}`;
        this.logOperation('duplicate_rule_toggle_start', { member, active });

        const tempRoot = await createTempDir('duplicate-rule', this.projectPath);
        await ensureProjectScaffold(tempRoot, apiVersion);

        const rulePath = await this.stageDuplicateRule(member, alias, apiVersion, tempRoot);
        if (!rulePath) {
            throw this.enhanceError(new Error(`Duplicate rule ${member} not found in target org`), {
                operation: 'toggleDuplicateRule',
                member
            });
        }

        const xml = await fs.promises.readFile(rulePath, 'utf8');
        const ruleDoc = await this.parser.parseStringPromise(xml);
        ruleDoc.DuplicateRule = ruleDoc.DuplicateRule || {};
        ruleDoc.DuplicateRule.isActive = [String(Boolean(active))];
        const updatedXml = this.builder.buildObject(ruleDoc);
        await fs.promises.writeFile(rulePath, updatedXml, 'utf8');

        const manifestPath = await writeManifest(tempRoot, { DuplicateRule: [member] }, apiVersion);

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

        const verified = await verifyDuplicateRuleActive(this, {
            objectName,
            ruleName,
            alias,
            apiVersion
        });
        if (Boolean(active) !== verified) {
            throw this.enhanceError(new Error('Duplicate rule state verification failed'), {
                operation: 'toggleDuplicateRule',
                member,
                expected: Boolean(active),
                actual: verified
            });
        }

        this.logOperation('duplicate_rule_toggle_success', { member, active });
        return {
            success: true,
            filePath: rulePath,
            auditTrail: this.getAuditTrail()
        };
    }

    async stageDuplicateRule(member, alias, apiVersion, tempRoot) {
        const localPath = path.join(this.projectPath, 'force-app', 'main', 'default', 'duplicateRules', `${member}.duplicateRule-meta.xml`);
        const relative = path.join('force-app', 'main', 'default', 'duplicateRules', `${member}.duplicateRule-meta.xml`);

        if (fs.existsSync(localPath)) {
            await stageFile(localPath, tempRoot, relative);
            return path.join(tempRoot, relative);
        }

        if (!alias) {
            return null;
        }

        try {
            const retrieveDir = await createTempDir('duplicate-rule-retrieve', this.projectPath);
            const command = `sf project retrieve start --metadata DuplicateRule:${member} --target-org ${alias} --api-version ${apiVersion} --output-dir "${retrieveDir}" --json`;
            const result = await this.executeCommand(command);
            this.parseJSON(result.stdout, { operation: 'retrieveDuplicateRule', member });
            const retrievedPath = path.join(retrieveDir, 'force-app', 'main', 'default', 'duplicateRules', `${member}.duplicateRule-meta.xml`);
            if (fs.existsSync(retrievedPath)) {
                await stageFile(retrievedPath, tempRoot, relative);
                return path.join(tempRoot, relative);
            }
        } catch (error) {
            this.logOperation('duplicate_rule_retrieve_warning', {
                member,
                message: firstLine(error.stderr || error.message)
            });
        }
        return null;
    }
}

module.exports = DuplicateRuleManager;
