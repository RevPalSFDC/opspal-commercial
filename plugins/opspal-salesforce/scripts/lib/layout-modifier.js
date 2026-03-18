'use strict';

// Salesforce Layout Modifier utility.
// Provides deterministic helpers for inspecting and updating *.layout-meta.xml files
// without relying on the Salesforce UI. Used by metadata MCP tools and agent workflows.

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const xml2js = require('xml2js');

const XML_BUILDER = new xml2js.Builder({
    xmldec: { version: '1.0', encoding: 'UTF-8' },
    renderOpts: { pretty: true, indent: '    ', newline: '\n' }
});

function fileExists(p) {
    try {
        fs.accessSync(p, fs.constants.R_OK);
        return true;
    } catch {
        return false;
    }
}

function ensureArray(value) {
    if (!value) return [];
    return Array.isArray(value) ? value : [value];
}

function normaliseLabel(label) {
    return (label || '').trim();
}

class LayoutModifier {
    constructor(options = {}) {
        this.projectPath = options.projectPath || process.cwd();
        this.org = options.org || process.env.SF_TARGET_ORG || null;
        this.stage = options.stage || 'production';
        this.logger = options.logger || console;
    }

    layoutFileName(objectName, layoutName) {
        return `${objectName}-${layoutName}.layout-meta.xml`;
    }

    layoutFilePath(objectName, layoutName) {
        return path.join(
            this.projectPath,
            'force-app',
            'main',
            'default',
            'layouts',
            this.layoutFileName(objectName, layoutName)
        );
    }

    async ensureField({
        objectName,
        layoutName,
        fieldApiName,
        sectionLabel,
        column = 0,
        behavior = 'Edit',
        autoRetrieve = true,
        createSectionIfMissing = true
    }) {
        if (!objectName || !layoutName || !fieldApiName) {
            throw new Error('objectName, layoutName, and fieldApiName are required');
        }

        const { layout, layoutPath } = await this.loadLayout(objectName, layoutName, { autoRetrieve });
        const sections = this.getLayoutSections(layout);
        const targetLabel = normaliseLabel(sectionLabel);

        let section = sections.find(sec => normaliseLabel(sec.label?.[0]) === targetLabel);
        if (!section && createSectionIfMissing) {
            section = this.buildSection(targetLabel || 'Auto Generated', 2);
            sections.push(section);
        }
        if (!section) {
            return { success: false, changed: false, message: `Section "${sectionLabel}" not found`, path: layoutPath };
        }

        const columns = this.ensureColumns(section, column + 1);
        const targetColumn = columns[column];
        targetColumn.layoutItems = ensureArray(targetColumn.layoutItems);

        const exists = targetColumn.layoutItems.some(item => ensureArray(item.field)[0] === fieldApiName);
        if (exists) {
            return { success: true, changed: false, message: 'Field already present', path: layoutPath };
        }

        targetColumn.layoutItems.push({
            behavior: [behavior],
            field: [fieldApiName]
        });

        await this.saveLayout(layoutPath, layout);
        return { success: true, changed: true, path: layoutPath };
    }

    async removeField({ objectName, layoutName, fieldApiName, autoRetrieve = true }) {
        if (!objectName || !layoutName || !fieldApiName) {
            throw new Error('objectName, layoutName, and fieldApiName are required');
        }

        const { layout, layoutPath } = await this.loadLayout(objectName, layoutName, { autoRetrieve });
        const sections = this.getLayoutSections(layout);
        let changed = false;

        for (const section of sections) {
            const columns = ensureArray(section.layoutColumns);
            columns.forEach((column) => {
                const items = ensureArray(column.layoutItems);
                const remaining = items.filter(item => ensureArray(item.field)[0] !== fieldApiName);
                if (remaining.length !== items.length) {
                    changed = true;
                    column.layoutItems = remaining;
                }
            });
        }

        if (!changed) {
            return { success: true, changed: false, path: layoutPath };
        }

        await this.saveLayout(layoutPath, layout);
        return { success: true, changed: true, path: layoutPath };
    }

    async moveField({
        objectName,
        layoutName,
        fieldApiName,
        sourceSection,
        targetSection,
        column = 0,
        autoRetrieve = true
    }) {
        await this.removeField({ objectName, layoutName, fieldApiName, autoRetrieve });
        return this.ensureField({
            objectName,
            layoutName,
            fieldApiName,
            sectionLabel: targetSection,
            column,
            autoRetrieve,
            createSectionIfMissing: true
        });
    }

    async listSections(objectName, layoutName, { autoRetrieve = true } = {}) {
        const { layout } = await this.loadLayout(objectName, layoutName, { autoRetrieve });
        const sections = this.getLayoutSections(layout);
        return sections.map(sec => ({
            label: normaliseLabel(sec.label?.[0]),
            style: sec.style?.[0] || null,
            columns: ensureArray(sec.layoutColumns).map(column =>
                ensureArray(column.layoutItems).map(item => ensureArray(item.field)[0])
            )
        }));
    }

    async createSection({
        objectName,
        layoutName,
        sectionLabel,
        columns = 2,
        style,
        autoRetrieve = true
    }) {
        const { layout, layoutPath } = await this.loadLayout(objectName, layoutName, { autoRetrieve });
        const sections = this.getLayoutSections(layout);
        const label = normaliseLabel(sectionLabel);

        if (sections.some(sec => normaliseLabel(sec.label?.[0]) === label)) {
            return { success: true, changed: false, message: 'Section already exists', path: layoutPath };
        }

        const section = this.buildSection(label, columns, style);
        sections.push(section);
        await this.saveLayout(layoutPath, layout);
        return { success: true, changed: true, path: layoutPath };
    }

    async renameSection({ objectName, layoutName, currentLabel, newLabel, autoRetrieve = true }) {
        const { layout, layoutPath } = await this.loadLayout(objectName, layoutName, { autoRetrieve });
        const sections = this.getLayoutSections(layout);
        const sourceLabel = normaliseLabel(currentLabel);

        const section = sections.find(sec => normaliseLabel(sec.label?.[0]) === sourceLabel);
        if (!section) {
            return { success: false, changed: false, message: `Section "${currentLabel}" not found`, path: layoutPath };
        }

        const targetLabel = normaliseLabel(newLabel);
        section.label = [targetLabel];
        await this.saveLayout(layoutPath, layout);
        return { success: true, changed: true, path: layoutPath };
    }

    async deleteSection({ objectName, layoutName, sectionLabel, autoRetrieve = true }) {
        const { layout, layoutPath } = await this.loadLayout(objectName, layoutName, { autoRetrieve });
        const sections = this.getLayoutSections(layout);
        const before = sections.length;
        const targetLabel = normaliseLabel(sectionLabel);

        const remaining = sections.filter(sec => normaliseLabel(sec.label?.[0]) !== targetLabel);
        if (remaining.length === before) {
            return { success: true, changed: false, path: layoutPath };
        }

        layout.Layout.layoutSections = remaining;
        await this.saveLayout(layoutPath, layout);
        return { success: true, changed: true, path: layoutPath };
    }

    // --- internal helpers ---

    async loadLayout(objectName, layoutName, { autoRetrieve = true } = {}) {
        const layoutPath = this.layoutFilePath(objectName, layoutName);
        if (!fileExists(layoutPath)) {
            if (!autoRetrieve) {
                throw new Error(`Layout file not found: ${layoutPath}`);
            }
            await this.retrieveLayout(objectName, layoutName);
            if (!fileExists(layoutPath)) {
                throw new Error(`Layout file still missing after retrieval: ${layoutPath}`);
            }
        }

        const xml = await fs.promises.readFile(layoutPath, 'utf8');
        const parser = new xml2js.Parser();
        const layout = await parser.parseStringPromise(xml);
        return { layout, layoutPath };
    }

    async saveLayout(layoutPath, layout) {
        const xml = XML_BUILDER.buildObject(layout);
        await fs.promises.writeFile(layoutPath, `${xml}\n`, 'utf8');
    }

    getLayoutSections(layout) {
        layout.Layout = layout.Layout || {};
        layout.Layout.layoutSections = ensureArray(layout.Layout.layoutSections);
        return layout.Layout.layoutSections;
    }

    ensureColumns(section, desiredCount) {
        section.layoutColumns = ensureArray(section.layoutColumns).map(col => (typeof col === 'string' ? {} : col));
        while (section.layoutColumns.length < desiredCount) {
            section.layoutColumns.push({});
        }
        return section.layoutColumns;
    }

    buildSection(label, columns = 2, styleOverride) {
        const columnCount = Math.max(1, columns);
        const style = styleOverride || (columnCount === 1 ? 'OneColumn' : 'TwoColumnsTopToBottom');
        return {
            customLabel: ['false'],
            detailHeading: ['false'],
            editHeading: ['true'],
            label: [label],
            layoutColumns: Array.from({ length: columnCount }, () => ({})),
            style: [style]
        };
    }

    async retrieveLayout(objectName, layoutName) {
        if (!this.org) {
            throw new Error('Cannot auto-retrieve layout without an org context (set SF_TARGET_ORG or pass options.org)');
        }
        const metadataName = `${objectName}-${layoutName}`;
        const args = [
            'project',
            'retrieve',
            'start',
            '--metadata',
            `Layout:${metadataName}`,
            '--target-org',
            this.org,
            '--ignore-conflicts'
        ];
        const result = spawnSync('sf', args, { cwd: this.projectPath, encoding: 'utf8' });
        if (result.status !== 0) {
            throw new Error(`Failed to retrieve layout ${metadataName}: ${result.stderr || result.stdout || 'unknown error'}`);
        }
        this.logger.info?.(`[layout-modifier] Retrieved layout ${metadataName}`);
    }
}

module.exports = LayoutModifier;
