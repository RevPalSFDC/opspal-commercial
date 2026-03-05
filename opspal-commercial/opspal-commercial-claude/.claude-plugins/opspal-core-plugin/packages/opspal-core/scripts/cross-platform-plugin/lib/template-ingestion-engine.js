/**
 * Template Ingestion Engine for RevOps Reporting
 *
 * Parses user-provided Excel/CSV templates and maps columns to CRM fields.
 * Based on patterns from reporting_starter_kit:
 * - Schema indexing with fuzzy matching
 * - Header anchor detection
 * - Column-to-field mapping with suggestions
 *
 * @module template-ingestion-engine
 * @version 1.0.0
 */

const fs = require('fs');
const path = require('path');

/**
 * Field information structure
 */
class FieldInfo {
    constructor({ source, entity, apiName, label, type, description = '', picklistValues = [] }) {
        this.source = source;           // 'salesforce' | 'hubspot'
        this.entity = entity;           // 'Opportunity', 'Account', 'deals', etc.
        this.apiName = apiName;         // 'Amount', 'CloseDate', etc.
        this.label = label;             // 'Amount', 'Close Date', etc.
        this.type = type;               // 'string' | 'number' | 'date' | 'currency' | 'picklist' | 'boolean'
        this.description = description;
        this.picklistValues = picklistValues;
    }

    /**
     * Get searchable text for fuzzy matching
     */
    getSearchText() {
        return [this.apiName, this.label, this.description].join(' ').toLowerCase();
    }
}

/**
 * Schema Index for field lookups with fuzzy matching
 * Pattern from: reporting_starter_kit/src/mapping/schema_index.py
 */
class SchemaIndex {
    constructor() {
        this.fields = [];
        this.entityAliases = {
            // Salesforce
            'opp': 'Opportunity',
            'opps': 'Opportunity',
            'opportunity': 'Opportunity',
            'acct': 'Account',
            'account': 'Account',
            'lead': 'Lead',
            'contact': 'Contact',
            'task': 'Task',
            'event': 'Event',
            // HubSpot
            'deal': 'deals',
            'deals': 'deals',
            'company': 'companies',
            'companies': 'companies',
            'contacts': 'contacts'
        };
    }

    /**
     * Add a field to the index
     */
    addField(fieldInfo) {
        this.fields.push(fieldInfo);
    }

    /**
     * Add multiple fields from a describe result
     */
    addFieldsFromDescribe(source, entity, describeResult) {
        for (const field of describeResult.fields || []) {
            this.addField(new FieldInfo({
                source,
                entity,
                apiName: field.name || field.apiName,
                label: field.label,
                type: this._normalizeType(field.type || field.fieldType),
                description: field.inlineHelpText || field.description || '',
                picklistValues: (field.picklistValues || []).map(p => p.value || p.label)
            }));
        }
    }

    /**
     * Normalize field types across platforms
     */
    _normalizeType(type) {
        const typeMap = {
            // Salesforce types
            'currency': 'currency',
            'double': 'number',
            'int': 'number',
            'integer': 'number',
            'percent': 'number',
            'date': 'date',
            'datetime': 'date',
            'boolean': 'boolean',
            'checkbox': 'boolean',
            'picklist': 'picklist',
            'multipicklist': 'picklist',
            'reference': 'reference',
            'id': 'string',
            'string': 'string',
            'textarea': 'string',
            'text': 'string',
            'email': 'string',
            'phone': 'string',
            'url': 'string',
            // HubSpot types
            'number': 'number',
            'enumeration': 'picklist'
        };
        return typeMap[(type || '').toLowerCase()] || 'string';
    }

    /**
     * Find candidate fields for a concept using fuzzy matching
     * @param {string} concept - The concept to search for (e.g., 'amount', 'close date')
     * @param {Object} options - Search options
     * @returns {Array<{field: FieldInfo, score: number}>} Scored candidates
     */
    findCandidates(concept, options = {}) {
        const { entity = null, source = null, topK = 8 } = options;
        const conceptNorm = concept.toLowerCase().trim();
        const scored = [];

        // Normalize entity alias
        const entityNorm = entity ? (this.entityAliases[entity.toLowerCase()] || entity) : null;

        for (const field of this.fields) {
            // Filter by entity if specified
            if (entityNorm && field.entity.toLowerCase() !== entityNorm.toLowerCase()) {
                continue;
            }
            // Filter by source if specified
            if (source && field.source.toLowerCase() !== source.toLowerCase()) {
                continue;
            }

            // Calculate similarity score
            let score = this._calculateSimilarity(conceptNorm, field);
            scored.push({ field, score });
        }

        // Sort by score descending
        scored.sort((a, b) => b.score - a.score);
        return scored.slice(0, topK);
    }

    /**
     * Calculate similarity score between concept and field
     */
    _calculateSimilarity(concept, field) {
        let score = 0;
        const apiNameLower = field.apiName.toLowerCase();
        const labelLower = field.label.toLowerCase();
        const searchText = field.getSearchText();

        // Exact match on API name (highest score)
        if (apiNameLower === concept) {
            score += 1.0;
        }
        // Exact match on label
        else if (labelLower === concept) {
            score += 0.95;
        }
        // API name contains concept
        else if (apiNameLower.includes(concept)) {
            score += 0.7;
        }
        // Label contains concept
        else if (labelLower.includes(concept)) {
            score += 0.65;
        }
        // Concept contains API name
        else if (concept.includes(apiNameLower) && apiNameLower.length > 2) {
            score += 0.5;
        }
        // Concept contains label
        else if (concept.includes(labelLower) && labelLower.length > 2) {
            score += 0.45;
        }

        // Fuzzy match using Levenshtein-like scoring
        score += this._fuzzyScore(concept, apiNameLower) * 0.3;
        score += this._fuzzyScore(concept, labelLower) * 0.25;

        // Boost common RevOps field patterns
        const revopsPatterns = {
            'amount': ['amount', 'value', 'revenue', 'arr', 'mrr', 'price'],
            'date': ['date', 'closedate', 'createddate', 'startdate', 'enddate'],
            'stage': ['stage', 'status', 'phase', 'lifecycle'],
            'owner': ['owner', 'rep', 'assigned', 'user'],
            'account': ['account', 'company', 'customer', 'client'],
            'name': ['name', 'title', 'subject'],
            'type': ['type', 'category', 'kind', 'recordtype']
        };

        for (const [pattern, keywords] of Object.entries(revopsPatterns)) {
            if (keywords.some(k => concept.includes(k))) {
                if (keywords.some(k => apiNameLower.includes(k) || labelLower.includes(k))) {
                    score += 0.2;
                    break;
                }
            }
        }

        return Math.min(score, 1.0);
    }

    /**
     * Simple fuzzy score based on common subsequence
     */
    _fuzzyScore(a, b) {
        if (!a || !b) return 0;
        const longer = a.length > b.length ? a : b;
        const shorter = a.length > b.length ? b : a;

        if (longer.length === 0) return 1.0;

        // Count matching characters
        let matches = 0;
        for (const char of shorter) {
            if (longer.includes(char)) matches++;
        }

        return matches / longer.length;
    }

    /**
     * Get all fields for an entity
     */
    getFieldsForEntity(entity, source = null) {
        const entityNorm = this.entityAliases[entity.toLowerCase()] || entity;
        return this.fields.filter(f =>
            f.entity.toLowerCase() === entityNorm.toLowerCase() &&
            (!source || f.source.toLowerCase() === source.toLowerCase())
        );
    }

    /**
     * Validate field type compatibility
     */
    validateType(field, allowedTypes) {
        const allowed = allowedTypes.map(t => t.toLowerCase());
        if (!allowed.includes(field.type.toLowerCase())) {
            throw new Error(
                `Field ${field.entity}.${field.apiName} type=${field.type} not in allowed types: ${allowed.join(', ')}`
            );
        }
        return true;
    }
}

/**
 * Template Column Mapper
 * Maps template columns to CRM fields with intelligent suggestions
 */
class TemplateColumnMapper {
    constructor(schemaIndex) {
        this.schemaIndex = schemaIndex;
        this.mappings = new Map();
        this.unmappedColumns = [];
        this.ambiguousColumns = [];
    }

    /**
     * Map a single column header to CRM fields
     * @param {string} columnHeader - The column header from template
     * @param {Object} hints - Optional hints for mapping
     * @returns {Object} Mapping result
     */
    mapColumn(columnHeader, hints = {}) {
        const { entity, source, forceField } = hints;

        // If force field is specified, use it directly
        if (forceField) {
            return {
                column: columnHeader,
                status: 'mapped',
                field: forceField,
                confidence: 1.0,
                alternatives: []
            };
        }

        // Find candidates
        const candidates = this.schemaIndex.findCandidates(columnHeader, { entity, source });

        if (candidates.length === 0) {
            this.unmappedColumns.push(columnHeader);
            return {
                column: columnHeader,
                status: 'unmapped',
                field: null,
                confidence: 0,
                alternatives: [],
                suggestion: 'No matching fields found. Consider adding a custom field mapping.'
            };
        }

        const bestMatch = candidates[0];

        // High confidence match
        if (bestMatch.score >= 0.8) {
            this.mappings.set(columnHeader, bestMatch.field);
            return {
                column: columnHeader,
                status: 'mapped',
                field: bestMatch.field,
                confidence: bestMatch.score,
                alternatives: candidates.slice(1, 4).map(c => ({
                    field: c.field,
                    score: c.score
                }))
            };
        }

        // Medium confidence - needs confirmation
        if (bestMatch.score >= 0.5) {
            this.ambiguousColumns.push({
                column: columnHeader,
                topCandidate: bestMatch,
                alternatives: candidates.slice(1, 4)
            });
            return {
                column: columnHeader,
                status: 'ambiguous',
                field: bestMatch.field,
                confidence: bestMatch.score,
                alternatives: candidates.slice(1, 4).map(c => ({
                    field: c.field,
                    score: c.score
                })),
                requiresConfirmation: true
            };
        }

        // Low confidence - needs manual mapping
        this.unmappedColumns.push(columnHeader);
        return {
            column: columnHeader,
            status: 'low_confidence',
            field: bestMatch.field,
            confidence: bestMatch.score,
            alternatives: candidates.slice(0, 4).map(c => ({
                field: c.field,
                score: c.score
            })),
            suggestion: 'Low confidence match. Please verify or provide manual mapping.'
        };
    }

    /**
     * Map all columns from a template
     * @param {Array<string>} columns - Column headers
     * @param {Object} hints - Mapping hints
     * @returns {Object} Complete mapping result
     */
    mapAllColumns(columns, hints = {}) {
        const results = [];
        const mappedFields = new Set();

        for (const column of columns) {
            const result = this.mapColumn(column, hints);

            // Check for duplicate mappings
            if (result.field && mappedFields.has(result.field.apiName)) {
                result.warning = `Field ${result.field.apiName} is already mapped to another column`;
            } else if (result.field) {
                mappedFields.add(result.field.apiName);
            }

            results.push(result);
        }

        return {
            mappings: results,
            summary: {
                total: columns.length,
                mapped: results.filter(r => r.status === 'mapped').length,
                ambiguous: results.filter(r => r.status === 'ambiguous').length,
                unmapped: results.filter(r => r.status === 'unmapped' || r.status === 'low_confidence').length
            },
            needsReview: this.ambiguousColumns.length > 0 || this.unmappedColumns.length > 0
        };
    }

    /**
     * Confirm an ambiguous mapping
     */
    confirmMapping(column, fieldInfo) {
        this.mappings.set(column, fieldInfo);
        this.ambiguousColumns = this.ambiguousColumns.filter(a => a.column !== column);
    }

    /**
     * Get the final confirmed mappings
     */
    getFinalMappings() {
        return Object.fromEntries(this.mappings);
    }
}

/**
 * Template Parser
 * Parses Excel/CSV templates and extracts structure
 */
class TemplateParser {
    constructor() {
        this.supportedFormats = ['xlsx', 'xls', 'csv', 'tsv'];
    }

    /**
     * Parse a template file
     * @param {string} filePath - Path to template file
     * @returns {Object} Parsed template structure
     */
    async parseTemplate(filePath) {
        const ext = path.extname(filePath).toLowerCase().slice(1);

        if (!this.supportedFormats.includes(ext)) {
            throw new Error(`Unsupported template format: ${ext}. Supported: ${this.supportedFormats.join(', ')}`);
        }

        if (ext === 'csv' || ext === 'tsv') {
            return this._parseCSV(filePath, ext === 'tsv' ? '\t' : ',');
        } else {
            return this._parseExcel(filePath);
        }
    }

    /**
     * Parse CSV/TSV file
     */
    _parseCSV(filePath, delimiter = ',') {
        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.split('\n').filter(l => l.trim());

        if (lines.length === 0) {
            throw new Error('Template file is empty');
        }

        const headers = this._parseCSVLine(lines[0], delimiter);
        const sampleData = [];

        // Get sample data (up to 5 rows)
        for (let i = 1; i < Math.min(lines.length, 6); i++) {
            const values = this._parseCSVLine(lines[i], delimiter);
            sampleData.push(values);
        }

        // Infer column types from sample data
        const columnTypes = this._inferColumnTypes(headers, sampleData);

        return {
            format: 'csv',
            sheets: [{
                name: 'Sheet1',
                headers,
                headerRow: 1,
                sampleData,
                columnTypes,
                totalRows: lines.length - 1
            }],
            metadata: {
                filePath,
                parseDate: new Date().toISOString()
            }
        };
    }

    /**
     * Parse a CSV line handling quoted values
     */
    _parseCSVLine(line, delimiter) {
        const result = [];
        let current = '';
        let inQuotes = false;

        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char === '"') {
                if (inQuotes && line[i + 1] === '"') {
                    current += '"';
                    i++;
                } else {
                    inQuotes = !inQuotes;
                }
            } else if (char === delimiter && !inQuotes) {
                result.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        }
        result.push(current.trim());
        return result;
    }

    /**
     * Parse Excel file (simplified - returns structure for header detection)
     * In production, this would use xlsx or exceljs library
     */
    _parseExcel(filePath) {
        // Check if file exists
        if (!fs.existsSync(filePath)) {
            throw new Error(`Template file not found: ${filePath}`);
        }

        // Return a structure that indicates Excel parsing is needed
        return {
            format: 'xlsx',
            requiresLibrary: true,
            filePath,
            parseInstructions: `
                To fully parse this Excel file, use the xlsx or exceljs library:

                const XLSX = require('xlsx');
                const workbook = XLSX.readFile('${filePath}');

                For each sheet:
                1. Find header row (first row with 3+ non-empty cells)
                2. Extract headers
                3. Get sample data rows
                4. Infer column types
            `,
            metadata: {
                filePath,
                parseDate: new Date().toISOString()
            }
        };
    }

    /**
     * Infer column types from sample data
     */
    _inferColumnTypes(headers, sampleData) {
        const types = {};

        for (let i = 0; i < headers.length; i++) {
            const values = sampleData.map(row => row[i]).filter(v => v !== undefined && v !== '');

            if (values.length === 0) {
                types[headers[i]] = 'unknown';
                continue;
            }

            // Check for dates
            if (values.every(v => this._isDate(v))) {
                types[headers[i]] = 'date';
            }
            // Check for numbers
            else if (values.every(v => this._isNumber(v))) {
                types[headers[i]] = 'number';
            }
            // Check for currency
            else if (values.every(v => this._isCurrency(v))) {
                types[headers[i]] = 'currency';
            }
            // Check for percentage
            else if (values.every(v => this._isPercentage(v))) {
                types[headers[i]] = 'percentage';
            }
            // Check for boolean
            else if (values.every(v => this._isBoolean(v))) {
                types[headers[i]] = 'boolean';
            }
            // Default to string
            else {
                types[headers[i]] = 'string';
            }
        }

        return types;
    }

    _isDate(value) {
        if (!value) return false;
        const datePatterns = [
            /^\d{4}-\d{2}-\d{2}$/,           // 2024-01-15
            /^\d{1,2}\/\d{1,2}\/\d{2,4}$/,   // 1/15/24 or 01/15/2024
            /^\d{1,2}-\d{1,2}-\d{2,4}$/,     // 1-15-24
            /^[A-Za-z]{3}\s+\d{1,2},?\s+\d{4}$/ // Jan 15, 2024
        ];
        return datePatterns.some(p => p.test(String(value).trim()));
    }

    _isNumber(value) {
        if (!value) return false;
        const cleaned = String(value).replace(/,/g, '').trim();
        return !isNaN(parseFloat(cleaned)) && isFinite(cleaned);
    }

    _isCurrency(value) {
        if (!value) return false;
        return /^[\$£€¥]?\s*[\d,]+\.?\d*$/.test(String(value).trim());
    }

    _isPercentage(value) {
        if (!value) return false;
        return /^[\d.]+\s*%$/.test(String(value).trim());
    }

    _isBoolean(value) {
        if (!value) return false;
        const boolValues = ['true', 'false', 'yes', 'no', '1', '0', 'y', 'n'];
        return boolValues.includes(String(value).toLowerCase().trim());
    }
}

/**
 * Template Ingestion Engine
 * Main orchestrator for template ingestion workflow
 */
class TemplateIngestionEngine {
    constructor(options = {}) {
        this.schemaIndex = new SchemaIndex();
        this.parser = new TemplateParser();
        this.mapper = null;
        this.options = options;
    }

    /**
     * Initialize schema index from CRM metadata
     * @param {Object} salesforceDescribe - Salesforce describe results
     * @param {Object} hubspotSchema - HubSpot property schema
     */
    initializeSchema(salesforceDescribe = {}, hubspotSchema = {}) {
        // Add Salesforce fields
        for (const [entity, describe] of Object.entries(salesforceDescribe)) {
            this.schemaIndex.addFieldsFromDescribe('salesforce', entity, describe);
        }

        // Add HubSpot fields
        for (const [entity, schema] of Object.entries(hubspotSchema)) {
            const fields = (schema.properties || schema.results || []).map(p => ({
                name: p.name,
                label: p.label,
                type: p.type,
                description: p.description || ''
            }));
            this.schemaIndex.addFieldsFromDescribe('hubspot', entity, { fields });
        }

        // Add common RevOps fields if schema is empty
        if (this.schemaIndex.fields.length === 0) {
            this._addDefaultRevOpsFields();
        }
    }

    /**
     * Add default RevOps fields for demonstration
     */
    _addDefaultRevOpsFields() {
        const defaultFields = [
            // Salesforce Opportunity
            { source: 'salesforce', entity: 'Opportunity', apiName: 'Amount', label: 'Amount', type: 'currency' },
            { source: 'salesforce', entity: 'Opportunity', apiName: 'CloseDate', label: 'Close Date', type: 'date' },
            { source: 'salesforce', entity: 'Opportunity', apiName: 'StageName', label: 'Stage', type: 'picklist' },
            { source: 'salesforce', entity: 'Opportunity', apiName: 'Name', label: 'Opportunity Name', type: 'string' },
            { source: 'salesforce', entity: 'Opportunity', apiName: 'Type', label: 'Type', type: 'picklist' },
            { source: 'salesforce', entity: 'Opportunity', apiName: 'Probability', label: 'Probability', type: 'number' },
            { source: 'salesforce', entity: 'Opportunity', apiName: 'IsWon', label: 'Won', type: 'boolean' },
            { source: 'salesforce', entity: 'Opportunity', apiName: 'IsClosed', label: 'Closed', type: 'boolean' },
            { source: 'salesforce', entity: 'Opportunity', apiName: 'CreatedDate', label: 'Created Date', type: 'date' },
            // Salesforce Account
            { source: 'salesforce', entity: 'Account', apiName: 'Name', label: 'Account Name', type: 'string' },
            { source: 'salesforce', entity: 'Account', apiName: 'Industry', label: 'Industry', type: 'picklist' },
            { source: 'salesforce', entity: 'Account', apiName: 'AnnualRevenue', label: 'Annual Revenue', type: 'currency' },
            { source: 'salesforce', entity: 'Account', apiName: 'NumberOfEmployees', label: 'Employees', type: 'number' },
            { source: 'salesforce', entity: 'Account', apiName: 'Type', label: 'Account Type', type: 'picklist' },
            // HubSpot Deals
            { source: 'hubspot', entity: 'deals', apiName: 'amount', label: 'Amount', type: 'currency' },
            { source: 'hubspot', entity: 'deals', apiName: 'closedate', label: 'Close Date', type: 'date' },
            { source: 'hubspot', entity: 'deals', apiName: 'dealstage', label: 'Deal Stage', type: 'picklist' },
            { source: 'hubspot', entity: 'deals', apiName: 'dealname', label: 'Deal Name', type: 'string' },
            { source: 'hubspot', entity: 'deals', apiName: 'pipeline', label: 'Pipeline', type: 'picklist' },
            // HubSpot Contacts
            { source: 'hubspot', entity: 'contacts', apiName: 'email', label: 'Email', type: 'string' },
            { source: 'hubspot', entity: 'contacts', apiName: 'lifecyclestage', label: 'Lifecycle Stage', type: 'picklist' },
            { source: 'hubspot', entity: 'contacts', apiName: 'hs_lead_status', label: 'Lead Status', type: 'picklist' }
        ];

        for (const f of defaultFields) {
            this.schemaIndex.addField(new FieldInfo(f));
        }
    }

    /**
     * Ingest a template file
     * @param {string} templatePath - Path to template file
     * @param {Object} options - Ingestion options
     * @returns {Object} Ingestion result with mappings
     */
    async ingestTemplate(templatePath, options = {}) {
        const { entity, source, customMappings = {} } = options;

        // Parse template
        const template = await this.parser.parseTemplate(templatePath);

        // Initialize mapper
        this.mapper = new TemplateColumnMapper(this.schemaIndex);

        // Get headers from first sheet
        const sheets = template.sheets || [];
        if (sheets.length === 0 && template.requiresLibrary) {
            return {
                status: 'requires_parsing',
                template,
                message: 'Excel file requires xlsx/exceljs library for full parsing'
            };
        }

        const results = [];

        for (const sheet of sheets) {
            // Apply custom mappings first
            const hints = { entity, source };
            for (const header of sheet.headers) {
                if (customMappings[header]) {
                    hints.forceField = customMappings[header];
                }
            }

            const mappingResult = this.mapper.mapAllColumns(sheet.headers, hints);

            results.push({
                sheet: sheet.name,
                headerRow: sheet.headerRow,
                columnCount: sheet.headers.length,
                mappings: mappingResult.mappings,
                summary: mappingResult.summary,
                columnTypes: sheet.columnTypes,
                sampleData: sheet.sampleData
            });
        }

        return {
            status: 'parsed',
            template: {
                format: template.format,
                filePath: templatePath,
                metadata: template.metadata
            },
            sheets: results,
            overallSummary: {
                totalSheets: results.length,
                totalColumns: results.reduce((sum, r) => sum + r.columnCount, 0),
                totalMapped: results.reduce((sum, r) => sum + r.summary.mapped, 0),
                totalAmbiguous: results.reduce((sum, r) => sum + r.summary.ambiguous, 0),
                totalUnmapped: results.reduce((sum, r) => sum + r.summary.unmapped, 0)
            },
            needsReview: results.some(r => r.summary.ambiguous > 0 || r.summary.unmapped > 0)
        };
    }

    /**
     * Generate a ReportSpec from template and mappings
     * Pattern from: reporting_starter_kit/src/planner/prompt_to_spec.md
     */
    generateReportSpec(ingestionResult, options = {}) {
        const {
            id = `template_report_${Date.now()}`,
            title = 'Template-Based Report',
            grain = 'record',
            timeRange = 'last_90_days',
            primarySource = 'salesforce'
        } = options;

        const sheets = ingestionResult.sheets || [];
        const datasets = [];
        const sections = [];

        for (const sheet of sheets) {
            const mappedFields = sheet.mappings
                .filter(m => m.status === 'mapped' || m.status === 'ambiguous')
                .map(m => m.field);

            if (mappedFields.length === 0) continue;

            // Group fields by entity
            const fieldsByEntity = {};
            for (const field of mappedFields) {
                const entity = field.entity;
                if (!fieldsByEntity[entity]) {
                    fieldsByEntity[entity] = [];
                }
                fieldsByEntity[entity].push(field.apiName);
            }

            // Create dataset for each entity
            for (const [entity, fields] of Object.entries(fieldsByEntity)) {
                const datasetId = `${entity.toLowerCase()}_data`;
                datasets.push({
                    id: datasetId,
                    source: primarySource === 'hubspot' ? 'hs' : 'sf',
                    entity,
                    fields,
                    where: [],
                    limit: 50000
                });

                // Create table section for this entity
                sections.push({
                    id: `${sheet.name.toLowerCase().replace(/\s+/g, '_')}_${entity.toLowerCase()}`,
                    type: 'table',
                    dataset: datasetId,
                    title: `${sheet.name} - ${entity}`,
                    columns: sheet.mappings
                        .filter(m => m.field && m.field.entity === entity)
                        .map(m => ({
                            field: m.field.apiName,
                            label: m.column
                        }))
                });
            }
        }

        return {
            id,
            title,
            grain,
            time: {
                range: timeRange,
                timezone: 'America/Los_Angeles'
            },
            sources: [
                primarySource === 'hubspot'
                    ? { id: 'hs', type: 'hubspot', config: {} }
                    : { id: 'sf', type: 'salesforce', config: { api_version: '62.0' } }
            ],
            datasets,
            sections,
            output: {
                format: 'xlsx',
                template: {
                    kind: 'xlsx_file',
                    path: ingestionResult.template.filePath,
                    mapping: this._generateTemplateMapping(sheets)
                }
            },
            appendix: {
                enabled: true,
                include: ['data_dictionary', 'query_log', 'metric_formulas', 'assumptions', 'qa_results', 'run_metadata']
            },
            qa: {
                checks: ['row_count', 'null_rate', 'duplicates']
            }
        };
    }

    /**
     * Generate template mapping for output
     */
    _generateTemplateMapping(sheets) {
        const mapping = {};
        for (const sheet of sheets) {
            mapping[sheet.sheet] = {};
            for (const m of sheet.mappings) {
                if (m.field) {
                    mapping[sheet.sheet][m.column] = `${m.field.entity}.${m.field.apiName}`;
                }
            }
        }
        return mapping;
    }

    /**
     * Get questions for ambiguous mappings
     */
    getAmbiguousMappingQuestions(ingestionResult) {
        const questions = [];

        for (const sheet of ingestionResult.sheets || []) {
            for (const mapping of sheet.mappings) {
                if (mapping.status === 'ambiguous' && mapping.alternatives.length > 0) {
                    questions.push({
                        column: mapping.column,
                        sheet: sheet.sheet,
                        question: `Which field should "${mapping.column}" map to?`,
                        options: [
                            {
                                label: `${mapping.field.entity}.${mapping.field.apiName} (${mapping.field.label})`,
                                value: mapping.field,
                                confidence: mapping.confidence,
                                recommended: true
                            },
                            ...mapping.alternatives.map(alt => ({
                                label: `${alt.field.entity}.${alt.field.apiName} (${alt.field.label})`,
                                value: alt.field,
                                confidence: alt.score,
                                recommended: false
                            }))
                        ]
                    });
                }
            }
        }

        return questions;
    }
}

// Export classes and factory function
module.exports = {
    TemplateIngestionEngine,
    SchemaIndex,
    TemplateColumnMapper,
    TemplateParser,
    FieldInfo
};

// CLI interface for testing
if (require.main === module) {
    const engine = new TemplateIngestionEngine();

    // Initialize with default fields
    engine.initializeSchema();

    console.log('Template Ingestion Engine - Demo\n');
    console.log('================================\n');

    // Demo: Find candidates for common RevOps terms
    const testConcepts = ['amount', 'close date', 'stage', 'revenue', 'customer'];

    console.log('Field Mapping Demo:\n');
    for (const concept of testConcepts) {
        const candidates = engine.schemaIndex.findCandidates(concept, { topK: 3 });
        console.log(`"${concept}" -> Top matches:`);
        for (const { field, score } of candidates) {
            console.log(`  ${(score * 100).toFixed(0)}% | ${field.source}.${field.entity}.${field.apiName} (${field.label})`);
        }
        console.log();
    }

    // Demo: Parse a CSV template
    const testCSV = `Account Name,Amount,Close Date,Stage,Owner
Acme Corp,$50000,2024-12-15,Negotiation,John Smith
TechCo,$25000,2024-11-30,Proposal,Jane Doe`;

    const tempFile = '/tmp/test-template.csv';
    fs.writeFileSync(tempFile, testCSV);

    console.log('\nCSV Template Parsing Demo:\n');
    engine.ingestTemplate(tempFile).then(result => {
        console.log('Parsing Result:');
        console.log(JSON.stringify(result, null, 2));

        // Generate ReportSpec
        console.log('\n\nGenerated ReportSpec:');
        const spec = engine.generateReportSpec(result, {
            title: 'Pipeline Report from Template',
            grain: 'opportunity'
        });
        console.log(JSON.stringify(spec, null, 2));
    }).catch(err => {
        console.error('Error:', err.message);
    });
}
