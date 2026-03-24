/**
 * TemplateRegistry - Manage Flow templates
 *
 * Features:
 * - Load templates from JSON files
 * - Parameter substitution
 * - Template validation
 * - Support for core, industry, and custom templates
 *
 * Part of Phase 4.1: Flow Template Library
 */

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

class TemplateRegistry {
    /**
     * @param {Object} [options]
     * @param {Object} [options.resolver] - Optional customization ResourceResolver
     * @param {Object} [options.store] - Optional CustomResourceStore for persistent saves
     */
    constructor(options = {}) {
        this.templates = new Map();
        this.templatesLoaded = false;
        // Optional customization resolver — when present, custom templates
        // are resolved from persistent storage before falling back to plugin files
        this.resolver = options.resolver || null;
        this.store = options.store || null;
    }

    /**
     * Load all templates from filesystem
     * @returns {Promise<void>}
     */
    async loadTemplates() {
        if (this.templatesLoaded) {
            return;
        }

        const templateDirs = [
            path.join(__dirname, 'core'),
            path.join(__dirname, 'industry'),
            path.join(__dirname, 'custom')
        ];

        for (const dir of templateDirs) {
            try {
                await this._loadFromDirectory(dir);
            } catch (error) {
                // Directory might not exist yet (especially custom)
                if (error.code !== 'ENOENT') {
                    throw error;
                }
            }
        }

        this.templatesLoaded = true;
    }

    /**
     * Load templates from a directory
     * @private
     */
    async _loadFromDirectory(dir) {
        const files = await fs.readdir(dir);

        for (const file of files) {
            if (file.endsWith('.json')) {
                const filePath = path.join(dir, file);
                const content = await fs.readFile(filePath, 'utf-8');
                const template = JSON.parse(content);

                // Validate template structure
                this._validateTemplate(template);

                // Store template
                this.templates.set(template.name, template);
            }
        }
    }

    /**
     * Validate template structure
     * @private
     */
    _validateTemplate(template) {
        const required = ['name', 'description', 'category', 'type', 'structure'];

        for (const field of required) {
            if (!template[field]) {
                throw new Error(`Template missing required field: ${field}`);
            }
        }

        // Validate parameters
        if (template.parameters) {
            for (const [key, config] of Object.entries(template.parameters)) {
                if (!config.type || !config.description) {
                    throw new Error(`Template parameter "${key}" missing type or description`);
                }
            }
        }
    }

    /**
     * Get a template by name
     * @param {string} name - Template name
     * @returns {Object|null} Template object or null if not found
     */
    async getTemplate(name) {
        // Check customization resolver first for custom Flow template overrides
        if (this.resolver) {
            try {
                const resolved = await this.resolver.resolveTemplate(name, 'flow');
                if (resolved?.content && resolved.record?.source_type === 'custom') {
                    const template = typeof resolved.content === 'string'
                        ? JSON.parse(resolved.content) : resolved.content;
                    return template;
                }
            } catch {
                // Resolver failed — fall through to in-memory registry
            }
        }

        await this.loadTemplates();
        return this.templates.get(name) || null;
    }

    /**
     * Get all templates
     * @param {string} category - Optional category filter
     * @returns {Array} Array of templates
     */
    async getAllTemplates(category = null) {
        await this.loadTemplates();

        const templates = Array.from(this.templates.values());

        if (category) {
            return templates.filter(t => t.category === category);
        }

        return templates;
    }

    /**
     * Apply a template to create a new Flow
     * @param {string} templateName - Name of template to apply
     * @param {string} flowName - Name for the new Flow
     * @param {Object} params - Template parameters
     * @param {Object} options - Additional options
     * @param {Object} options.author - FlowAuthor instance
     * @param {string} options.outputDir - Output directory
     * @returns {Promise<string>} Path to created Flow
     */
    async applyTemplate(templateName, flowName, params = {}, options = {}) {
        const template = await this.getTemplate(templateName);

        if (!template) {
            throw new Error(`Template "${templateName}" not found`);
        }

        // Merge default parameters
        const mergedParams = this._mergeParameters(template, params);

        // Create Flow structure from template
        const flowStructure = this._substituteParameters(template.structure, mergedParams);

        // Create Flow using FlowAuthor if provided
        if (options.author) {
            const author = options.author;

            // Create base Flow
            await author.createFlow(flowName, {
                type: template.type,
                description: template.description,
                ...flowStructure.metadata
            });

            // Add elements from template
            if (flowStructure.elements) {
                for (const element of flowStructure.elements) {
                    await author.addElement(element.instruction);
                }
            }

            // Save Flow
            const flowPath = await author.save();

            return flowPath;
        }

        // Otherwise, create Flow file directly
        const outputDir = options.outputDir || './flows';
        const flowPath = path.join(outputDir, `${flowName}.flow-meta.xml`);

        // Generate Flow XML from structure
        const flowXML = this._generateFlowXML(flowName, flowStructure);

        await fs.mkdir(outputDir, { recursive: true });
        await fs.writeFile(flowPath, flowXML);

        return flowPath;
    }

    /**
     * Merge template parameters with defaults
     * @private
     */
    _mergeParameters(template, params) {
        const merged = { ...params };

        // Add defaults for missing parameters
        if (template.parameters) {
            for (const [key, config] of Object.entries(template.parameters)) {
                if (merged[key] === undefined && config.default !== undefined) {
                    merged[key] = config.default;
                }
            }
        }

        return merged;
    }

    /**
     * Substitute parameters in template structure
     * @private
     */
    _substituteParameters(structure, params) {
        const json = JSON.stringify(structure);

        let substituted = json;

        // Replace {{paramName}} with values
        for (const [key, value] of Object.entries(params)) {
            const placeholder = new RegExp(`{{${key}}}`, 'g');
            substituted = substituted.replace(placeholder, value);
        }

        return JSON.parse(substituted);
    }

    /**
     * Generate Flow XML from structure
     * @private
     */
    _generateFlowXML(flowName, structure) {
        // Basic Flow XML template
        let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
        xml += '<Flow xmlns="http://soap.sforce.com/2006/04/metadata">\n';

        // Add elements
        if (structure.elements) {
            structure.elements.forEach(element => {
                xml += this._elementToXML(element);
            });
        }

        // Add metadata
        xml += `    <apiVersion>${structure.metadata?.apiVersion || '62.0'}</apiVersion>\n`;
        xml += `    <description>${structure.metadata?.description || ''}</description>\n`;
        xml += `    <label>${flowName}</label>\n`;

        if (structure.metadata?.processType) {
            xml += `    <processType>${structure.metadata.processType}</processType>\n`;
        }

        if (structure.metadata?.status) {
            xml += `    <status>${structure.metadata.status}</status>\n`;
        }

        xml += '</Flow>\n';

        return xml;
    }

    /**
     * Convert element object to XML
     * @private
     */
    _elementToXML(element) {
        let xml = `    <${element.type}>\n`;

        for (const [key, value] of Object.entries(element)) {
            if (key !== 'type') {
                if (typeof value === 'object' && !Array.isArray(value)) {
                    xml += `        <${key}>\n`;
                    for (const [subKey, subValue] of Object.entries(value)) {
                        xml += `            <${subKey}>${subValue}</${subKey}>\n`;
                    }
                    xml += `        </${key}>\n`;
                } else if (Array.isArray(value)) {
                    value.forEach(item => {
                        xml += `        <${key}>${item}</${key}>\n`;
                    });
                } else {
                    xml += `        <${key}>${value}</${key}>\n`;
                }
            }
        }

        xml += `    </${element.type}>\n`;

        return xml;
    }

    /**
     * Create a new template from existing Flow
     * @param {string} templateName - Name for the template
     * @param {string} flowPath - Path to existing Flow
     * @param {Object} metadata - Template metadata
     * @returns {Promise<string>} Path to created template
     */
    async createTemplate(templateName, flowPath, metadata = {}) {
        // Read existing Flow
        const flowContent = await fs.readFile(flowPath, 'utf-8');

        // Create template object
        const template = {
            name: templateName,
            description: metadata.description || `Template: ${templateName}`,
            category: metadata.category || 'custom',
            type: metadata.type || 'AutoLaunchedFlow',
            parameters: metadata.parameters || {},
            structure: {
                metadata: {
                    apiVersion: '62.0',
                    processType: 'AutoLaunchedFlow',
                    status: 'Draft'
                },
                elements: []
            },
            createdAt: new Date().toISOString()
        };

        // Prefer persistent customization store (survives plugin updates)
        if (this.store) {
            const contentStr = JSON.stringify(template, null, 2);
            const checksum = 'sha256:' + crypto.createHash('sha256').update(contentStr, 'utf8').digest('hex');
            const record = {
                resource_id: `template:flow:${templateName}`,
                resource_type: 'template',
                scope: 'site',
                source_type: 'custom',
                source_resource_id: null,
                source_version: null,
                source_checksum: null,
                schema_version: '1',
                status: 'published',
                title: template.name,
                content: template,
                storage_uri: null,
                metadata: { subType: 'flow', fileType: 'json', category: template.category },
                checksum,
                created_by: process.env.CLAUDE_AGENT_NAME || 'claude-code',
                updated_by: process.env.CLAUDE_AGENT_NAME || 'claude-code'
            };
            await this.store.saveRecord(record, 'site');
            if (this.resolver) this.resolver.invalidateCache(`template:flow:${templateName}`);
            this.templatesLoaded = false;
            return `customization-store://template:flow:${templateName}`;
        }

        // Fallback: save to plugin-local custom directory (legacy behavior)
        const customDir = path.join(__dirname, 'custom');
        await fs.mkdir(customDir, { recursive: true });

        const templatePath = path.join(customDir, `${templateName}.json`);
        await fs.writeFile(templatePath, JSON.stringify(template, null, 2));

        // Reload templates
        this.templatesLoaded = false;

        return templatePath;
    }
}

module.exports = {
    TemplateRegistry
};
