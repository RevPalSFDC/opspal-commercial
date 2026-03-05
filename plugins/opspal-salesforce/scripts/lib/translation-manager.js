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
const { withNamespace } = require('./utils/namespace');
const { verifyGlobalValueSetTranslation } = require('./utils/verifiers');
const { API_VERSION } = require('../../config/apiVersion');

class TranslationManager extends EnhancedMCPTool {
    constructor(options = {}) {
        super({
            name: 'TranslationManager',
            version: '1.0.0',
            stage: options.stage || 'development',
            description: 'Ensures Translation Workbench assets are deployed',
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

    async ensureGlobalPicklistTranslation(params) {
        this.validateParams(params, ['locale', 'globalValueSet', 'value', 'translation']);
        const {
            locale,
            globalValueSet,
            value,
            translation,
            targetOrg,
            namespacePrefix,
            apiVersion = API_VERSION
        } = params;

        const alias = targetOrg || this.org;
        const translationPath = await this.ensureTranslationMetadata(locale, alias, apiVersion);
        const xml = await fs.promises.readFile(translationPath, 'utf8');
        const doc = await this.parser.parseStringPromise(xml);

        doc.Translations = doc.Translations || {};
        doc.Translations.globalValueSetTranslations = doc.Translations.globalValueSetTranslations || [];
        if (!Array.isArray(doc.Translations.globalValueSetTranslations)) {
            doc.Translations.globalValueSetTranslations = [doc.Translations.globalValueSetTranslations];
        }

        const scopedName = withNamespace(globalValueSet, namespacePrefix);
        let gvsNode = doc.Translations.globalValueSetTranslations.find(entry => entry.name?.[0] === scopedName);
        if (!gvsNode) {
            gvsNode = { name: [scopedName], values: [] };
            doc.Translations.globalValueSetTranslations.push(gvsNode);
        }

        gvsNode.values = gvsNode.values || [];
        if (!Array.isArray(gvsNode.values)) {
            gvsNode.values = [gvsNode.values];
        }

        gvsNode.values = gvsNode.values.filter(entry => entry.name?.[0] !== value);
        gvsNode.values.push({
            name: [value],
            label: [translation]
        });

        const updatedXml = this.builder.buildObject(doc);
        await fs.promises.writeFile(translationPath, updatedXml, 'utf8');

        const tempRoot = await createTempDir('translation', this.projectPath);
        await ensureProjectScaffold(tempRoot, apiVersion);
        const relTranslation = path.join('force-app', 'main', 'default', 'translations', `${locale}.translation-meta.xml`);
        await stageFile(translationPath, tempRoot, relTranslation);

        const manifestMembers = {
            Translations: [locale]
        };

        // parent global value set
        const gvsRelative = path.join('force-app', 'main', 'default', 'globalValueSets', `${globalValueSet}.globalValueSet-meta.xml`);
        const localGvsPath = path.join(this.projectPath, gvsRelative);
        if (fs.existsSync(localGvsPath)) {
            await stageFile(localGvsPath, tempRoot, gvsRelative);
            manifestMembers.GlobalValueSet = [withNamespace(globalValueSet, namespacePrefix)];
        }

        const translationMember = `${withNamespace(globalValueSet, namespacePrefix)}-${locale}`;
        const localGvsTranslation = path.join(this.projectPath, 'force-app', 'main', 'default', 'globalValueSetTranslations', `${translationMember}.globalValueSetTranslation-meta.xml`);
        if (fs.existsSync(localGvsTranslation)) {
            await stageFile(localGvsTranslation, tempRoot, path.join('force-app', 'main', 'default', 'globalValueSetTranslations', `${translationMember}.globalValueSetTranslation-meta.xml`));
        }
        manifestMembers.GlobalValueSetTranslation = [translationMember];

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

        const verified = await verifyGlobalValueSetTranslation(this, {
            globalValueSet,
            locale,
            alias,
            apiVersion,
            namespacePrefix
        });

        if (!verified) {
            throw this.enhanceError(new Error('Translation verification failed.'), {
                operation: 'ensureGlobalPicklistTranslation',
                globalValueSet,
                locale
            });
        }

        this.logOperation('translation_global_picklist_success', {
            globalValueSet,
            locale
        });

        return {
            success: true,
            filePath: translationPath,
            auditTrail: this.getAuditTrail()
        };
    }

    async ensureTranslationMetadata(locale, alias, apiVersion) {
        const translationPath = path.join(this.projectPath, 'force-app', 'main', 'default', 'translations', `${locale}.translation-meta.xml`);
        if (fs.existsSync(translationPath)) {
            return translationPath;
        }

        if (!alias) {
            await fs.promises.mkdir(path.dirname(translationPath), { recursive: true });
            await fs.promises.writeFile(translationPath, this.emptyTranslationSkeleton(), 'utf8');
            return translationPath;
        }

        try {
            const retrieveDir = await createTempDir('translation-retrieve', this.projectPath);
            const command = `sf project retrieve start --metadata Translations:${locale} --target-org ${alias} --api-version ${apiVersion} --output-dir "${retrieveDir}" --json`;
            const result = await this.executeCommand(command);
            this.parseJSON(result.stdout, { operation: 'retrieveTranslations', locale });
            const retrievedPath = path.join(retrieveDir, 'force-app', 'main', 'default', 'translations', `${locale}.translation-meta.xml`);
            if (fs.existsSync(retrievedPath)) {
                await fs.promises.mkdir(path.dirname(translationPath), { recursive: true });
                await fs.promises.copyFile(retrievedPath, translationPath);
                return translationPath;
            }
        } catch (error) {
            const line = firstLine(error.stderr || error.message);
            if (line.toLowerCase().includes('locale') && line.toLowerCase().includes('not enabled')) {
                throw this.enhanceError(new Error(`Locale ${locale} is not enabled in target org`), {
                    operation: 'ensureTranslationMetadata',
                    locale,
                    code: 'LocaleDisabled'
                });
            }
            this.logOperation('translation_retrieve_warning', {
                locale,
                message: line
            });
        }

        await fs.promises.mkdir(path.dirname(translationPath), { recursive: true });
        await fs.promises.writeFile(translationPath, this.emptyTranslationSkeleton(), 'utf8');
        return translationPath;
    }

    emptyTranslationSkeleton() {
        return `<?xml version="1.0" encoding="UTF-8"?>\n<Translations xmlns="http://soap.sforce.com/2006/04/metadata">\n    <customLabels/>\n</Translations>`;
    }
}

module.exports = TranslationManager;
