#!/usr/bin/env node

/**
 * Layout Template Engine for Salesforce
 *
 * Generates optimized FlexiPage (Lightning), Layout (Classic), and CompactLayout
 * metadata from persona templates with AI-guided customization.
 *
 * Features:
 * - Template selection and loading
 * - Field scoring and prioritization
 * - Section generation with optimal field distribution
 * - Component placement (Path, Activities, Highlights Panel, etc.)
 * - Conditional visibility rule generation
 * - Mobile optimization
 * - Metadata XML generation using proven fieldInstance pattern
 *
 * FlexiPage Pattern (Updated 2025-10-18):
 * This engine now uses the proven fieldInstance pattern for maximum compatibility:
 * - Individual <fieldInstance> elements with <fieldItem>Record.FieldName</fieldItem>
 * - Proper facet hierarchy: field facets → column facets → section facets → tab facets
 * - Uses flexipage:column and flexipage:fieldSection components
 * - Avoids Dynamic Forms API which has compatibility issues
 *
 * Pattern Hierarchy:
 * 1. Header Region (highlights panel)
 * 2. Field Facets (one per field with fieldInstance)
 * 3. Column Wrapper Facets (wrap field facets in flexipage:column)
 * 4. Columns Container Facet (combine column facets)
 * 5. Field Section Components Facet (flexipage:fieldSection for each section)
 * 6. Detail Tab Facet (combines all sections)
 * 7. Tabs Facet (wraps detail tab)
 * 8. Main Region (flexipage:tabset referencing Tabs Facet)
 * 9. Sidebar Region (related lists, activities)
 *
 * Usage:
 *   const engine = new LayoutTemplateEngine(orgAlias);
 *   await engine.init();
 *   const layout = await engine.generateLayout('Opportunity', 'sales-rep');
 *   const xml = engine.generateFlexiPageXML(layout.flexiPage);
 *
 * @version 2.0.0
 * @created 2025-10-18
 * @updated 2025-10-18 - Implemented fieldInstance pattern (v2.0.0)
 */

const fs = require('fs').promises;
const path = require('path');
const LayoutRuleEngine = require('./layout-rule-engine');
const LayoutMetadataService = require('./layout-metadata-service');

class LayoutTemplateEngine {
    /**
     * Initialize Template Engine
     * @param {string} orgAlias - Salesforce org alias
     * @param {Object} options - Configuration options
     */
    constructor(orgAlias, options = {}) {
        this.orgAlias = orgAlias;
        this.verbose = options.verbose || false;
        this.templatesDir = options.templatesDir || path.join(__dirname, '..', '..', 'templates', 'layouts');
        this.ruleEngine = new LayoutRuleEngine(orgAlias, options);
        this.metadataService = new LayoutMetadataService(orgAlias, options);
    }

    /**
     * Initialize template engine
     */
    async init() {
        await this.ruleEngine.init();
        await this.metadataService.init();

        if (this.verbose) {
            console.log(`✓ Layout Template Engine initialized for org: ${this.orgAlias}`);
        }
    }

    /**
     * Generate complete layout package for an object
     * @param {string} objectName - Salesforce object API name
     * @param {string} personaName - Persona template name
     * @param {Object} options - Generation options
     * @returns {Promise<Object>} Generated layout metadata
     */
    async generateLayout(objectName, personaName, options = {}) {
        if (this.verbose) {
            console.log(`\n🎨 Generating layout for ${objectName} (persona: ${personaName})...\n`);
        }

        // Load persona template
        const persona = await this.loadPersonaTemplate(personaName);

        // Score fields using rule engine
        const fieldScores = await this.ruleEngine.scoreFields(objectName, personaName, options);

        // Generate sections
        const sections = this.ruleEngine.generateSectionRecommendations(fieldScores, persona, objectName);

        // Generate FlexiPage (Lightning)
        const flexiPage = this.generateFlexiPage(objectName, personaName, persona, sections, fieldScores);

        // Generate Compact Layout
        const compactLayout = this.generateCompactLayout(objectName, personaName, persona, fieldScores);

        // Generate Classic Layout (optional, for backward compatibility)
        const classicLayout = options.includeClassicLayout
            ? this.generateClassicLayout(objectName, personaName, sections, fieldScores)
            : null;

        const result = {
            object: objectName,
            persona: personaName,
            timestamp: new Date().toISOString(),
            flexiPage: flexiPage,
            compactLayout: compactLayout,
            classicLayout: classicLayout,
            metadata: {
                totalFields: fieldScores.length,
                fieldsIncluded: sections.reduce((sum, s) => sum + s.fieldCount, 0),
                sectionsGenerated: sections.length,
                componentsIncluded: flexiPage.components.length
            }
        };

        if (this.verbose) {
            console.log(`✓ Layout generated successfully`);
            console.log(`   Sections: ${result.metadata.sectionsGenerated}`);
            console.log(`   Fields: ${result.metadata.fieldsIncluded}/${result.metadata.totalFields}`);
            console.log(`   Components: ${result.metadata.componentsIncluded}\n`);
        }

        return result;
    }

    /**
     * Generate FlexiPage (Lightning Record Page) metadata
     * @private
     */
    generateFlexiPage(objectName, personaName, persona, sections, fieldScores) {
        const pageName = `${objectName}_${personaName.replace(/-/g, '_')}_Page`;
        const pageLabel = `${objectName} - ${this.formatPersonaLabel(personaName)}`;

        const components = [];
        let componentOrder = 0;

        // 1. Highlights Panel (required for most personas)
        if (persona.bestPractices && persona.bestPractices.useHighlightsPanel) {
            components.push({
                order: componentOrder++,
                type: 'force:highlightsPanelDesktop',
                name: 'Highlights Panel',
                region: 'header'
            });
        }

        // 2. Path Component (for objects with stage/status)
        if (persona.bestPractices && persona.bestPractices.usePathComponent) {
            components.push({
                order: componentOrder++,
                type: 'runtime_sales_pathassistant:pathAssistant',
                name: 'Path',
                region: 'header'
            });
        }

        // 3. Field Sections (Dynamic Forms)
        if (persona.bestPractices && persona.bestPractices.useDynamicForms) {
            sections.forEach((section, index) => {
                components.push({
                    order: componentOrder++,
                    type: 'force:recordFieldSection',
                    name: section.label,
                    fields: section.fields,
                    region: 'main',
                    columns: 2
                });
            });
        } else {
            // Legacy Record Detail component
            components.push({
                order: componentOrder++,
                type: 'force:recordDetailPanelDesktop',
                name: 'Record Detail',
                region: 'main'
            });
        }

        // 4. Activities Component
        if (persona.components && persona.components.recommended &&
            persona.components.recommended.includes('Activities')) {
            components.push({
                order: componentOrder++,
                type: 'force:activityComposer',
                name: 'Activities',
                region: 'main'
            });
        }

        // 5. Related Lists
        if (persona.relatedLists && persona.relatedLists.priority) {
            const relatedListsToInclude = persona.relatedLists.priority.slice(0, persona.relatedLists.max || 5);

            relatedListsToInclude.forEach(relatedList => {
                components.push({
                    order: componentOrder++,
                    type: 'force:relatedListSingleContainer',
                    name: relatedList,
                    relatedObject: this.inferRelatedObject(relatedList),
                    region: 'sidebar'
                });
            });
        }

        // 6. Chatter (if recommended)
        if (persona.components && persona.components.recommended &&
            persona.components.recommended.includes('Chatter')) {
            components.push({
                order: componentOrder++,
                type: 'chatter:feed',
                name: 'Chatter',
                region: 'main'
            });
        }

        return {
            developerName: pageName,
            masterLabel: pageLabel,
            type: 'RecordPage',
            entityName: objectName,
            template: 'flexipage:recordHomeTemplateDesktop',
            components: components,
            description: `Generated layout for ${objectName} optimized for ${personaName} persona`
        };
    }

    /**
     * Generate CompactLayout metadata
     * @private
     */
    generateCompactLayout(objectName, personaName, persona, fieldScores) {
        const layoutName = `${objectName}_${personaName.replace(/-/g, '_')}_Compact`;

        // Get compact layout field recommendations from persona
        const objectKey = objectName.toLowerCase();
        let compactFields = [];

        if (persona.compactLayoutFields && persona.compactLayoutFields[objectKey]) {
            compactFields = persona.compactLayoutFields[objectKey];
        } else {
            const guidance = this.resolveObjectGuidance(persona, objectKey);
            if (guidance && Array.isArray(guidance.compactFields)) {
                compactFields = guidance.compactFields;
            }
        }

        if (compactFields.length === 0) {
            // Fallback to top-scoring fields when persona guidance is missing.
            compactFields = fieldScores
                .slice(0, 6)
                .map(f => f.fieldName);
        } else {
            compactFields = compactFields
                .filter(fieldName => fieldScores.find(f => f.fieldName === fieldName))
                .slice(0, 6);
        }

        if (compactFields.length < 4) {
            const chosen = new Set(compactFields);
            for (const scoredField of fieldScores) {
                if (compactFields.length >= 4) {
                    break;
                }
                if (!chosen.has(scoredField.fieldName)) {
                    compactFields.push(scoredField.fieldName);
                    chosen.add(scoredField.fieldName);
                }
            }
        }

        return {
            fullName: layoutName,
            label: `${objectName} ${this.formatPersonaLabel(personaName)} Compact`,
            fields: compactFields
        };
    }

    /**
     * Resolve object guidance block for an object key (case-insensitive).
     * @private
     */
    resolveObjectGuidance(persona, objectKey) {
        if (!persona.objectGuidance || !objectKey) {
            return null;
        }

        const match = Object.entries(persona.objectGuidance).find(
            ([key]) => key.toLowerCase() === objectKey
        );

        return match ? match[1] : null;
    }

    /**
     * Generate Classic Layout metadata (optional)
     * @private
     */
    generateClassicLayout(objectName, personaName, sections, fieldScores) {
        const layoutName = `${objectName}-${personaName.replace(/-/g, ' ')}`;

        const layoutSections = sections.map(section => ({
            label: section.label,
            columns: 2,
            fields: section.fields.map(fieldName => ({
                field: fieldName,
                behavior: this.getFieldBehavior(fieldName, fieldScores)
            }))
        }));

        return {
            fullName: layoutName,
            layoutSections: layoutSections,
            showEmailCheckbox: false,
            showHighlightsPanel: true,
            showRunAssignmentRulesCheckbox: false,
            showSubmitAndAttachButton: false
        };
    }

    /**
     * Get field behavior (Required, Edit, Readonly)
     * @private
     */
    getFieldBehavior(fieldName, fieldScores) {
        const field = fieldScores.find(f => f.fieldName === fieldName);

        if (!field) return 'Edit';

        // Check if field is required (would need actual metadata)
        // For now, assume Edit for all fields
        return 'Edit';
    }

    /**
     * Infer related object from related list name
     * @private
     */
    inferRelatedObject(relatedListName) {
        const mappings = {
            'Contacts': 'Contact',
            'Opportunities': 'Opportunity',
            'Cases': 'Case',
            'Tasks': 'Task',
            'Events': 'Event',
            'Open Tasks': 'Task',
            'Activities': 'ActivityHistory',
            'Notes': 'Note',
            'Attachments': 'Attachment',
            'Files': 'ContentDocument'
        };

        return mappings[relatedListName] || relatedListName;
    }

    /**
     * Format persona name for display
     * @private
     */
    formatPersonaLabel(personaName) {
        return personaName
            .split('-')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
    }

    /**
     * Load persona template from file
     * @private
     */
    async loadPersonaTemplate(personaName) {
        const templatePath = path.join(this.templatesDir, 'personas', `${personaName}.json`);

        try {
            const templateContent = await fs.readFile(templatePath, 'utf8');
            return JSON.parse(templateContent);
        } catch (error) {
            throw new Error(`Failed to load persona template '${personaName}': ${error.message}`);
        }
    }

    /**
     * Generate FlexiPage XML metadata using proven fieldInstance pattern
     * @param {Object} flexiPage - FlexiPage definition
     * @returns {string} XML metadata
     */
    generateFlexiPageXML(flexiPage) {
        const componentsByRegion = this.groupComponentsByRegion(flexiPage.components);
        const fieldSections = componentsByRegion.main.filter(c => c.type === 'force:recordFieldSection');

        let xml = `<?xml version="1.0" encoding="UTF-8"?>
<FlexiPage xmlns="http://soap.sforce.com/2006/04/metadata">`;

        // 1. Header region (highlights panel)
        xml += this.generateHeaderRegion(componentsByRegion.header);

        // 2. Generate field facets for each section
        let facetCounter = 1;
        const sectionFacets = [];

        fieldSections.forEach((section, sectionIndex) => {
            const columnFacets = [];

            // Split fields into two columns
            const fieldsPerColumn = Math.ceil(section.fields.length / 2);
            const column1Fields = section.fields.slice(0, fieldsPerColumn);
            const column2Fields = section.fields.slice(fieldsPerColumn);

            // Generate column 1 field facets
            const col1FieldFacets = this.generateFieldFacets(column1Fields, facetCounter);
            facetCounter += col1FieldFacets.facets.length;
            xml += col1FieldFacets.xml;

            const col1FacetName = `Facet-${section.name.replace(/\s+/g, '')}Col1`;
            columnFacets.push(col1FacetName);

            // Generate column 2 field facets
            const col2FieldFacets = this.generateFieldFacets(column2Fields, facetCounter);
            facetCounter += col2FieldFacets.facets.length;
            xml += col2FieldFacets.xml;

            const col2FacetName = `Facet-${section.name.replace(/\s+/g, '')}Col2`;
            columnFacets.push(col2FacetName);

            // Generate column wrapper facets
            xml += this.generateColumnWrapperFacets(
                [col1FieldFacets.facets, col2FieldFacets.facets],
                [col1FacetName, col2FacetName]
            );

            // Generate columns container facet
            const columnsFacetName = `Facet-${section.name.replace(/\s+/g, '')}Columns`;
            xml += this.generateColumnsContainerFacet(columnFacets, columnsFacetName);

            sectionFacets.push({
                name: section.name,
                columnsFacet: columnsFacetName
            });
        });

        // 3. Generate field section components facet
        const detailTabFacetName = 'Facet-DetailTab';
        xml += this.generateFieldSectionComponentsFacet(sectionFacets, detailTabFacetName);

        // 4. Generate tabs facet
        xml += this.generateTabsFacet(detailTabFacetName);

        // 5. Generate main region (tabset)
        xml += this.generateMainRegion();

        // 6. Sidebar region (related lists, activities)
        xml += this.generateSidebarRegion(componentsByRegion.sidebar);

        xml += `
    <masterLabel>${flexiPage.masterLabel}</masterLabel>
    <sobjectType>${flexiPage.entityName}</sobjectType>
    <template>
        <name>${flexiPage.template}</name>
    </template>
    <type>${flexiPage.type}</type>
</FlexiPage>`;

        return xml;
    }

    /**
     * Generate field facets using fieldInstance pattern
     * @private
     */
    generateFieldFacets(fields, startCounter) {
        let xml = '';
        const facets = [];

        fields.forEach((fieldName, index) => {
            const facetName = `Facet-${startCounter + index}`;
            facets.push(facetName);

            // Determine if field is required (Name is typically required)
            const isRequired = fieldName === 'Name';

            xml += `
    <flexiPageRegions>
        <itemInstances>
            <fieldInstance>
                <fieldInstanceProperties>
                    <name>uiBehavior</name>
                    <value>${isRequired ? 'required' : 'none'}</value>
                </fieldInstanceProperties>
                <fieldItem>Record.${fieldName}</fieldItem>
                <identifier>Record${fieldName}Field</identifier>
            </fieldInstance>
        </itemInstances>
        <name>${facetName}</name>
        <type>Facet</type>
    </flexiPageRegions>`;
        });

        return { xml, facets };
    }

    /**
     * Generate column wrapper facets
     * @private
     */
    generateColumnWrapperFacets(fieldFacetsArrays, columnFacetNames) {
        let xml = '';

        columnFacetNames.forEach((columnFacetName, index) => {
            const fieldFacets = fieldFacetsArrays[index];

            xml += `
    <flexiPageRegions>`;

            fieldFacets.forEach(facetName => {
                xml += `
        <itemInstances>
            <componentInstance>
                <componentInstanceProperties>
                    <name>body</name>
                    <value>${facetName}</value>
                </componentInstanceProperties>
                <componentName>flexipage:column</componentName>
                <identifier>flexipage_column_${facetName}</identifier>
            </componentInstance>
        </itemInstances>`;
            });

            xml += `
        <name>${columnFacetName}</name>
        <type>Facet</type>
    </flexiPageRegions>`;
        });

        return xml;
    }

    /**
     * Generate columns container facet
     * @private
     */
    generateColumnsContainerFacet(columnFacets, facetName) {
        let xml = `
    <flexiPageRegions>`;

        columnFacets.forEach((columnFacet, index) => {
            xml += `
        <itemInstances>
            <componentInstance>
                <componentInstanceProperties>
                    <name>body</name>
                    <value>${columnFacet}</value>
                </componentInstanceProperties>
                <componentName>flexipage:column</componentName>
                <identifier>flexipage_column${index + 1}</identifier>
            </componentInstance>
        </itemInstances>`;
        });

        xml += `
        <name>${facetName}</name>
        <type>Facet</type>
    </flexiPageRegions>`;

        return xml;
    }

    /**
     * Generate field section components facet
     * @private
     */
    generateFieldSectionComponentsFacet(sectionFacets, detailTabFacetName) {
        let xml = `
    <flexiPageRegions>`;

        sectionFacets.forEach((section, index) => {
            xml += `
        <itemInstances>
            <componentInstance>
                <componentInstanceProperties>
                    <name>columns</name>
                    <value>${section.columnsFacet}</value>
                </componentInstanceProperties>
                <componentInstanceProperties>
                    <name>horizontalAlignment</name>
                    <value>false</value>
                </componentInstanceProperties>
                <componentInstanceProperties>
                    <name>label</name>
                    <value>${this.escapeXml(section.name)}</value>
                </componentInstanceProperties>
                <componentName>flexipage:fieldSection</componentName>
                <identifier>flexipage_fieldSection${index + 1}</identifier>
            </componentInstance>
        </itemInstances>`;
        });

        xml += `
        <name>${detailTabFacetName}</name>
        <type>Facet</type>
    </flexiPageRegions>`;

        return xml;
    }

    /**
     * Generate tabs facet
     * @private
     */
    generateTabsFacet(detailTabFacetName) {
        return `
    <flexiPageRegions>
        <itemInstances>
            <componentInstance>
                <componentInstanceProperties>
                    <name>active</name>
                    <value>true</value>
                </componentInstanceProperties>
                <componentInstanceProperties>
                    <name>body</name>
                    <value>${detailTabFacetName}</value>
                </componentInstanceProperties>
                <componentInstanceProperties>
                    <name>title</name>
                    <value>Standard.Tab.detail</value>
                </componentInstanceProperties>
                <componentName>flexipage:tab</componentName>
                <identifier>detailTab</identifier>
            </componentInstance>
        </itemInstances>
        <name>Facet-Tabs</name>
        <type>Facet</type>
    </flexiPageRegions>`;
    }

    /**
     * Generate header region
     * @private
     */
    generateHeaderRegion(headerComponents) {
        if (!headerComponents || headerComponents.length === 0) {
            return `
    <flexiPageRegions>
        <itemInstances>
            <componentInstance>
                <componentInstanceProperties>
                    <name>collapsed</name>
                    <value>false</value>
                </componentInstanceProperties>
                <componentName>force:highlightsPanel</componentName>
                <identifier>force_highlightsPanel</identifier>
            </componentInstance>
        </itemInstances>
        <name>header</name>
        <type>Region</type>
    </flexiPageRegions>`;
        }

        let xml = `
    <flexiPageRegions>`;

        headerComponents.forEach(component => {
            xml += `
        <itemInstances>
            <componentInstance>
                <componentName>${component.type}</componentName>
                <identifier>${component.type.replace(/:/g, '_')}</identifier>
            </componentInstance>
        </itemInstances>`;
        });

        xml += `
        <name>header</name>
        <type>Region</type>
    </flexiPageRegions>`;

        return xml;
    }

    /**
     * Generate main region
     * @private
     */
    generateMainRegion() {
        return `
    <flexiPageRegions>
        <itemInstances>
            <componentInstance>
                <componentInstanceProperties>
                    <name>tabs</name>
                    <value>Facet-Tabs</value>
                </componentInstanceProperties>
                <componentName>flexipage:tabset</componentName>
                <identifier>flexipage_tabset</identifier>
            </componentInstance>
        </itemInstances>
        <name>main</name>
        <type>Region</type>
    </flexiPageRegions>`;
    }

    /**
     * Generate sidebar region
     * @private
     */
    generateSidebarRegion(sidebarComponents) {
        if (!sidebarComponents || sidebarComponents.length === 0) {
            return `
    <flexiPageRegions>
        <itemInstances>
            <componentInstance>
                <componentName>runtime_sales_activities:activityPanel</componentName>
                <identifier>runtime_sales_activities_activityPanel</identifier>
            </componentInstance>
        </itemInstances>
        <itemInstances>
            <componentInstance>
                <componentName>force:relatedListContainer</componentName>
                <identifier>force_relatedListContainer</identifier>
            </componentInstance>
        </itemInstances>
        <name>sidebar</name>
        <type>Region</type>
    </flexiPageRegions>`;
        }

        let xml = `
    <flexiPageRegions>`;

        sidebarComponents.forEach(component => {
            xml += `
        <itemInstances>
            <componentInstance>`;

            if (component.type === 'force:relatedListSingleContainer' && component.relatedObject) {
                xml += `
                <componentInstanceProperties>
                    <name>relatedListApiName</name>
                    <value>${component.relatedObject}</value>
                </componentInstanceProperties>`;
            }

            xml += `
                <componentName>${component.type}</componentName>
                <identifier>${component.type.replace(/:/g, '_')}_${component.name.replace(/\s+/g, '')}</identifier>
            </componentInstance>
        </itemInstances>`;
        });

        xml += `
        <name>sidebar</name>
        <type>Region</type>
    </flexiPageRegions>`;

        return xml;
    }

    /**
     * Escape XML special characters
     * @private
     */
    escapeXml(str) {
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
    }

    /**
     * Group components by region
     * @private
     */
    groupComponentsByRegion(components) {
        const grouped = { header: [], main: [], sidebar: [] };

        components
            .sort((a, b) => a.order - b.order)
            .forEach(component => {
                const region = component.region || 'main';
                if (grouped[region]) {
                    grouped[region].push(component);
                }
            });

        return grouped;
    }

    /**
     * Generate CompactLayout XML metadata
     * @param {Object} compactLayout - CompactLayout definition
     * @returns {string} XML metadata
     */
    generateCompactLayoutXML(compactLayout) {
        const fields = compactLayout.fields
            .map(field => `        <fields>${field}</fields>`)
            .join('\n');

        return `<?xml version="1.0" encoding="UTF-8"?>
<CompactLayout xmlns="http://soap.sforce.com/2006/04/metadata">
${fields}
    <label>${compactLayout.label}</label>
</CompactLayout>`;
    }

    /**
     * Generate Classic Layout XML metadata
     * @param {Object} classicLayout - Classic Layout definition
     * @returns {string} XML metadata
     */
    generateClassicLayoutXML(classicLayout) {
        let xml = `<?xml version="1.0" encoding="UTF-8"?>
<Layout xmlns="http://soap.sforce.com/2006/04/metadata">`;

        // Generate layout sections
        classicLayout.layoutSections.forEach(section => {
            xml += `
    <layoutSections>
        <label>${section.label}</label>
        <layoutColumns>`;

            // Split fields into two columns
            const midpoint = Math.ceil(section.fields.length / 2);
            const leftColumn = section.fields.slice(0, midpoint);
            const rightColumn = section.fields.slice(midpoint);

            // Left column
            leftColumn.forEach(field => {
                xml += `
            <layoutItems>
                <behavior>${field.behavior}</behavior>
                <field>${field.field}</field>
            </layoutItems>`;
            });

            xml += `
        </layoutColumns>
        <layoutColumns>`;

            // Right column
            rightColumn.forEach(field => {
                xml += `
            <layoutItems>
                <behavior>${field.behavior}</behavior>
                <field>${field.field}</field>
            </layoutItems>`;
            });

            xml += `
        </layoutColumns>
        <style>TwoColumnsTopToBottom</style>
    </layoutSections>`;
        });

        // Add related lists if specified
        if (classicLayout.relatedLists) {
            classicLayout.relatedLists.forEach(relatedList => {
                xml += `
    <relatedLists>
        <relatedList>${relatedList}</relatedList>
    </relatedLists>`;
            });
        }

        xml += `
    <showEmailCheckbox>${classicLayout.showEmailCheckbox || false}</showEmailCheckbox>
    <showHighlightsPanel>${classicLayout.showHighlightsPanel !== false}</showHighlightsPanel>
    <showRunAssignmentRulesCheckbox>${classicLayout.showRunAssignmentRulesCheckbox || false}</showRunAssignmentRulesCheckbox>
    <showSubmitAndAttachButton>${classicLayout.showSubmitAndAttachButton || false}</showSubmitAndAttachButton>
</Layout>`;

        return xml;
    }
}

module.exports = LayoutTemplateEngine;

// CLI usage
if (require.main === module) {
    const args = process.argv.slice(2);

    const parseCliArgs = (argv) => {
        const options = {
            orgAlias: null,
            objectName: null,
            personaName: null,
            verbose: false,
            includeClassicLayout: false,
            outputDir: null,
            help: false
        };
        const positional = [];

        for (let i = 0; i < argv.length; i += 1) {
            const arg = argv[i];
            if (!arg.startsWith('--')) {
                positional.push(arg);
                continue;
            }

            switch (arg) {
                case '--org':
                case '--org-alias':
                    options.orgAlias = argv[i + 1];
                    i += 1;
                    break;
                case '--object':
                case '--sobject':
                    options.objectName = argv[i + 1];
                    i += 1;
                    break;
                case '--persona':
                    options.personaName = argv[i + 1];
                    i += 1;
                    break;
                case '--output':
                case '--output-dir':
                    options.outputDir = argv[i + 1];
                    i += 1;
                    break;
                case '--verbose':
                    options.verbose = true;
                    break;
                case '--include-classic':
                    options.includeClassicLayout = true;
                    break;
                case '--help':
                    options.help = true;
                    break;
                default:
                    break;
            }
        }

        if (!options.orgAlias && positional.length > 0) {
            options.orgAlias = positional[0];
        }
        if (!options.objectName && positional.length > 1) {
            options.objectName = positional[1];
        }
        if (!options.personaName && positional.length > 2) {
            options.personaName = positional[2];
        }

        return options;
    };

    const parsed = parseCliArgs(args);

    if (parsed.help || !parsed.orgAlias || !parsed.objectName || !parsed.personaName) {
        console.log(`
Usage: node layout-template-engine.js <org-alias> <object-name> <persona> [options]
   or: node layout-template-engine.js --org <alias> --object <name> --persona <name> [options]

Options:
  --verbose              Show detailed generation output
  --include-classic      Generate Classic layout in addition to Lightning
  --output <path>        Save generated metadata to directory
  --output-dir <path>    Alias for --output
  --help                 Show this help message

Examples:
  node layout-template-engine.js my-org Opportunity sales-rep --verbose
  node layout-template-engine.js --org prod --object Account --persona executive --output ./generated
        `);
        process.exit(parsed.help ? 0 : 1);
    }

    const orgAlias = parsed.orgAlias;
    const objectName = parsed.objectName;
    const personaName = parsed.personaName;
    const verbose = parsed.verbose;
    const includeClassicLayout = parsed.includeClassicLayout;
    const outputDir = parsed.outputDir;

    (async () => {
        try {
            const engine = new LayoutTemplateEngine(orgAlias, { verbose });
            await engine.init();

            const layout = await engine.generateLayout(objectName, personaName, {
                includeClassicLayout,
                includeUsage: false
            });

            console.log('\n📦 Generated Layout Package:\n');
            console.log(JSON.stringify(layout, null, 2));

            if (outputDir) {
                await fs.mkdir(outputDir, { recursive: true });

                // Save FlexiPage XML
                const flexiPageXML = engine.generateFlexiPageXML(layout.flexiPage);
                const flexiPagePath = path.join(outputDir, `${layout.flexiPage.developerName}.flexipage-meta.xml`);
                await fs.writeFile(flexiPagePath, flexiPageXML);
                console.log(`\n✓ Saved FlexiPage to: ${flexiPagePath}`);

                // Save CompactLayout XML
                const compactLayoutXML = engine.generateCompactLayoutXML(layout.compactLayout);
                const compactLayoutPath = path.join(outputDir, `${layout.compactLayout.fullName}.compactLayout-meta.xml`);
                await fs.writeFile(compactLayoutPath, compactLayoutXML);
                console.log(`✓ Saved CompactLayout to: ${compactLayoutPath}`);

                // Save Classic Layout XML (if generated)
                if (layout.classicLayout) {
                    const classicLayoutXML = engine.generateClassicLayoutXML(layout.classicLayout);
                    const classicLayoutPath = path.join(outputDir, `${layout.classicLayout.fullName}.layout-meta.xml`);
                    await fs.writeFile(classicLayoutPath, classicLayoutXML);
                    console.log(`✓ Saved Classic Layout to: ${classicLayoutPath}`);
                }

                // Save JSON
                const jsonPath = path.join(outputDir, `${objectName}_${personaName}_layout.json`);
                await fs.writeFile(jsonPath, JSON.stringify(layout, null, 2));
                console.log(`✓ Saved JSON to: ${jsonPath}\n`);
            }

            console.log('✓ Complete\n');

        } catch (error) {
            console.error('❌ Error:', error.message);
            process.exit(1);
        }
    })();
}
