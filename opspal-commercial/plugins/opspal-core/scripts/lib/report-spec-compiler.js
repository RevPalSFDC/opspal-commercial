/**
 * Report Spec Compiler for RevOps Reporting
 *
 * Implements the 2-step pattern from reporting_starter_kit:
 * 1. Intent extraction (LLM produces minimal JSON)
 * 2. Spec assembly (deterministic code + schema index)
 *
 * @module report-spec-compiler
 * @version 1.0.0
 */

const fs = require('fs');
const path = require('path');

/**
 * Intent structure from LLM extraction
 * @typedef {Object} ReportIntent
 * @property {string} question - Business question to answer
 * @property {string} audience - Target audience (exec, manager, ic)
 * @property {string} cadence - Report cadence (weekly, monthly, quarterly)
 * @property {string} grain - Primary grain (opportunity, deal, account, contact)
 * @property {Array<string>} metrics - Required metrics
 * @property {Array<string>} dimensions - Grouping dimensions
 * @property {Array<Object>} filters - Data filters
 * @property {string} format - Output format (xlsx, google_sheets, pdf, csv)
 * @property {string|null} template - Template path if provided
 */

/**
 * Report Spec Compiler
 * Compiles user intent into a validated ReportSpec
 */
class ReportSpecCompiler {
    constructor(options = {}) {
        this.options = options;
        this.kpiDefinitions = null;
        this.schemaIndex = null;

        // Load KPI definitions
        this._loadKPIDefinitions();

        // Default metric mappings
        this.metricMappings = {
            // Revenue metrics
            'open_pipeline': {
                op: 'sum',
                field: 'Amount',
                where: [{ field: 'StageName', op: 'not_in', value: ['Closed Won', 'Closed Lost'] }]
            },
            'open_pipeline_amount': {
                op: 'sum',
                field: 'Amount',
                where: [{ field: 'IsClosed', op: '=', value: false }]
            },
            'won_amount': {
                op: 'sum',
                field: 'Amount',
                where: [{ field: 'IsWon', op: '=', value: true }]
            },
            'won_amount_30d': {
                op: 'sum',
                field: 'Amount',
                where: [
                    { field: 'IsWon', op: '=', value: true },
                    { field: 'CloseDate', op: '>=', value: 'today-30d' }
                ]
            },
            'arr': {
                op: 'sum',
                field: 'Amount',
                multiplier: 12,
                where: [{ field: 'Type', op: 'in', value: ['Renewal', 'Subscription'] }]
            },
            'mrr': {
                op: 'sum',
                field: 'Amount',
                where: [{ field: 'Type', op: 'in', value: ['Renewal', 'Subscription'] }]
            },
            'count_opps': {
                op: 'count',
                field: 'Id'
            },
            'avg_deal_size': {
                op: 'avg',
                field: 'Amount',
                where: [{ field: 'IsWon', op: '=', value: true }]
            },
            'win_rate': {
                op: 'ratio',
                numerator: { op: 'count', where: [{ field: 'IsWon', op: '=', value: true }] },
                denominator: { op: 'count', where: [{ field: 'IsClosed', op: '=', value: true }] }
            },
            // Retention metrics
            'nrr': {
                op: 'custom',
                formula: '(starting_mrr + expansion - contraction - churn) / starting_mrr * 100'
            },
            'grr': {
                op: 'custom',
                formula: '(starting_mrr - contraction - churn) / starting_mrr * 100'
            },
            'churn_rate': {
                op: 'ratio',
                numerator: { field: 'churned_customers' },
                denominator: { field: 'starting_customers' }
            }
        };

        // Dimension mappings
        this.dimensionMappings = {
            'stage': { salesforce: 'StageName', hubspot: 'dealstage' },
            'owner': { salesforce: 'Owner.Name', hubspot: 'hubspot_owner_id' },
            'segment': { salesforce: 'Account.Segment__c', hubspot: 'customer_segment', fallback: 'Account.Industry' },
            'industry': { salesforce: 'Account.Industry', hubspot: 'industry' },
            'region': { salesforce: 'Account.BillingState', hubspot: 'state' },
            'type': { salesforce: 'Type', hubspot: 'dealtype' },
            'source': { salesforce: 'LeadSource', hubspot: 'hs_analytics_source' },
            'product': { salesforce: 'Product_Family__c', hubspot: 'product_line' },
            'quarter': { salesforce: 'CALENDAR_QUARTER(CloseDate)', hubspot: 'closedate' },
            'month': { salesforce: 'CALENDAR_MONTH(CloseDate)', hubspot: 'closedate' }
        };

        // Time range mappings
        this.timeRangeMappings = {
            'this_quarter': { range: 'this_quarter' },
            'last_quarter': { range: 'last_quarter' },
            'this_year': { range: 'this_year' },
            'last_year': { range: 'last_year' },
            'last_30_days': { range: 'last_30_days' },
            'last_90_days': { range: 'last_90_days' },
            'last_180_days': { range: 'last_180_days' },
            'ytd': { range: 'year_to_date' },
            'qtd': { range: 'quarter_to_date' },
            'mtd': { range: 'month_to_date' }
        };
    }

    /**
     * Load KPI definitions from config
     */
    _loadKPIDefinitions() {
        try {
            const kpiPath = path.join(__dirname, '../../config/revops-kpi-definitions.json');
            if (fs.existsSync(kpiPath)) {
                this.kpiDefinitions = JSON.parse(fs.readFileSync(kpiPath, 'utf-8'));
            }
        } catch (err) {
            console.warn('Could not load KPI definitions:', err.message);
        }
    }

    /**
     * Extract intent from natural language request
     * This would be called by the LLM to produce a minimal JSON
     *
     * @param {string} request - Natural language request
     * @returns {ReportIntent} Extracted intent
     */
    extractIntent(request) {
        const requestLower = request.toLowerCase();

        // Detect metrics
        const metrics = this._detectMetrics(requestLower);

        // Detect dimensions
        const dimensions = this._detectDimensions(requestLower);

        // Detect time range
        const timeRange = this._detectTimeRange(requestLower);

        // Detect grain
        const grain = this._detectGrain(requestLower);

        // Detect format
        const format = this._detectFormat(requestLower);

        // Detect audience
        const audience = this._detectAudience(requestLower);

        return {
            question: request,
            audience,
            cadence: this._detectCadence(requestLower),
            grain,
            metrics,
            dimensions,
            filters: timeRange ? [{ field: 'CloseDate', range: timeRange }] : [],
            format,
            template: null,
            timeRange
        };
    }

    /**
     * Detect metrics from request
     */
    _detectMetrics(request) {
        const metricPatterns = {
            'open_pipeline': ['pipeline', 'open pipeline', 'active pipeline'],
            'won_amount': ['won', 'closed won', 'revenue', 'bookings'],
            'arr': ['arr', 'annual recurring', 'annual revenue'],
            'mrr': ['mrr', 'monthly recurring'],
            'count_opps': ['count', 'number of', 'how many'],
            'avg_deal_size': ['average deal', 'avg deal', 'deal size'],
            'win_rate': ['win rate', 'conversion rate', 'close rate'],
            'nrr': ['nrr', 'net retention', 'net revenue retention'],
            'grr': ['grr', 'gross retention'],
            'churn_rate': ['churn', 'attrition']
        };

        const detected = [];
        for (const [metric, patterns] of Object.entries(metricPatterns)) {
            if (patterns.some(p => request.includes(p))) {
                detected.push(metric);
            }
        }

        // Default to pipeline metrics if none detected
        if (detected.length === 0) {
            detected.push('open_pipeline', 'won_amount', 'count_opps');
        }

        return detected;
    }

    /**
     * Detect dimensions from request
     */
    _detectDimensions(request) {
        const dimensionPatterns = {
            'stage': ['by stage', 'per stage', 'stage breakdown'],
            'owner': ['by owner', 'by rep', 'per rep', 'by salesperson'],
            'segment': ['by segment', 'per segment', 'customer segment'],
            'industry': ['by industry', 'per industry'],
            'region': ['by region', 'per region', 'geographic'],
            'type': ['by type', 'per type'],
            'source': ['by source', 'lead source'],
            'product': ['by product', 'product line'],
            'quarter': ['quarterly', 'by quarter'],
            'month': ['monthly', 'by month']
        };

        const detected = [];
        for (const [dimension, patterns] of Object.entries(dimensionPatterns)) {
            if (patterns.some(p => request.includes(p))) {
                detected.push(dimension);
            }
        }

        return detected;
    }

    /**
     * Detect time range from request
     */
    _detectTimeRange(request) {
        const timePatterns = {
            'this_quarter': ['this quarter', 'current quarter', 'q4', 'q1', 'q2', 'q3'],
            'last_quarter': ['last quarter', 'previous quarter'],
            'this_year': ['this year', 'current year', '2024', '2025'],
            'last_year': ['last year', 'previous year'],
            'last_30_days': ['last 30 days', 'past 30 days', 'past month'],
            'last_90_days': ['last 90 days', 'past 90 days', 'past quarter'],
            'ytd': ['ytd', 'year to date'],
            'qtd': ['qtd', 'quarter to date']
        };

        for (const [range, patterns] of Object.entries(timePatterns)) {
            if (patterns.some(p => request.includes(p))) {
                return range;
            }
        }

        return 'last_90_days'; // Default
    }

    /**
     * Detect primary grain
     */
    _detectGrain(request) {
        if (request.includes('account') || request.includes('customer')) return 'account';
        if (request.includes('contact') || request.includes('lead')) return 'contact';
        if (request.includes('deal')) return 'deal';
        return 'opportunity'; // Default
    }

    /**
     * Detect output format
     */
    _detectFormat(request) {
        if (request.includes('google sheet') || request.includes('sheets')) return 'google_sheets';
        if (request.includes('csv')) return 'csv';
        if (request.includes('pdf')) return 'pdf';
        return 'xlsx'; // Default
    }

    /**
     * Detect target audience
     */
    _detectAudience(request) {
        if (request.includes('executive') || request.includes('board') || request.includes('leadership')) return 'exec';
        if (request.includes('manager') || request.includes('team lead')) return 'manager';
        return 'ic'; // Default
    }

    /**
     * Detect cadence
     */
    _detectCadence(request) {
        if (request.includes('daily')) return 'daily';
        if (request.includes('weekly')) return 'weekly';
        if (request.includes('monthly')) return 'monthly';
        if (request.includes('quarterly')) return 'quarterly';
        return 'weekly'; // Default
    }

    /**
     * Compile intent into a full ReportSpec
     * Step 2 of the 2-step pattern: deterministic spec assembly
     *
     * @param {ReportIntent} intent - Extracted intent
     * @param {Object} options - Compilation options
     * @returns {Object} Complete ReportSpec
     */
    compileSpec(intent, options = {}) {
        const {
            primarySource = 'salesforce',
            apiVersion = '62.0',
            timezone = 'America/Los_Angeles'
        } = options;

        const specId = `report_${Date.now()}`;

        // Build sources
        const sources = this._buildSources(primarySource, apiVersion);

        // Build datasets
        const datasets = this._buildDatasets(intent, primarySource);

        // Build sections
        const sections = this._buildSections(intent, datasets);

        // Build output config
        const output = this._buildOutput(intent);

        return {
            id: specId,
            title: this._generateTitle(intent),
            owner: 'revops',
            question: intent.question,
            grain: intent.grain,
            time: {
                range: intent.timeRange || 'last_90_days',
                timezone
            },
            sources,
            datasets,
            sections,
            output,
            appendix: {
                enabled: true,
                include: [
                    'data_dictionary',
                    'query_log',
                    'metric_formulas',
                    'assumptions',
                    'qa_results',
                    'run_metadata'
                ]
            },
            qa: {
                checks: ['row_count', 'null_rate', 'duplicates', 'amount_negative']
            }
        };
    }

    /**
     * Build sources configuration
     */
    _buildSources(primarySource, apiVersion) {
        const sources = [];

        if (primarySource === 'salesforce' || primarySource === 'both') {
            sources.push({
                id: 'sf',
                type: 'salesforce',
                config: { api_version: apiVersion }
            });
        }

        if (primarySource === 'hubspot' || primarySource === 'both') {
            sources.push({
                id: 'hs',
                type: 'hubspot',
                config: {}
            });
        }

        return sources;
    }

    /**
     * Build datasets from intent
     */
    _buildDatasets(intent, primarySource) {
        const datasets = [];
        const entityMap = {
            opportunity: { salesforce: 'Opportunity', hubspot: 'deals' },
            deal: { salesforce: 'Opportunity', hubspot: 'deals' },
            account: { salesforce: 'Account', hubspot: 'companies' },
            contact: { salesforce: 'Contact', hubspot: 'contacts' },
            lead: { salesforce: 'Lead', hubspot: 'contacts' }
        };

        const entity = entityMap[intent.grain] || entityMap.opportunity;
        const sourceId = primarySource === 'hubspot' ? 'hs' : 'sf';
        const entityName = primarySource === 'hubspot' ? entity.hubspot : entity.salesforce;

        // Determine required fields
        const fields = this._getRequiredFields(intent, primarySource, entityName);

        // Build where clauses
        const where = this._buildWhereClause(intent);

        datasets.push({
            id: `${entityName.toLowerCase()}_data`,
            source: sourceId,
            entity: entityName,
            fields,
            where,
            limit: 50000
        });

        return datasets;
    }

    /**
     * Get required fields for the report
     */
    _getRequiredFields(intent, source, entity) {
        const baseFields = {
            Opportunity: ['Id', 'Name', 'Amount', 'CloseDate', 'StageName', 'IsWon', 'IsClosed', 'Type', 'Owner.Name', 'Account.Name'],
            Account: ['Id', 'Name', 'Industry', 'AnnualRevenue', 'Type', 'BillingState'],
            Contact: ['Id', 'Name', 'Email', 'Account.Name', 'LeadSource'],
            Lead: ['Id', 'Name', 'Email', 'Company', 'Status', 'LeadSource'],
            deals: ['id', 'dealname', 'amount', 'closedate', 'dealstage', 'pipeline', 'hubspot_owner_id'],
            companies: ['id', 'name', 'industry', 'annualrevenue'],
            contacts: ['id', 'email', 'lifecyclestage', 'hs_lead_status']
        };

        const fields = [...(baseFields[entity] || [])];

        // Add dimension fields
        for (const dim of intent.dimensions) {
            const mapping = this.dimensionMappings[dim];
            if (mapping) {
                const field = source === 'hubspot' ? mapping.hubspot : mapping.salesforce;
                if (field && !fields.includes(field)) {
                    fields.push(field);
                }
            }
        }

        return fields;
    }

    /**
     * Build WHERE clause from intent
     */
    _buildWhereClause(intent) {
        const where = [];

        // Add time filter
        if (intent.timeRange) {
            const timeConfig = this.timeRangeMappings[intent.timeRange];
            if (timeConfig) {
                where.push({
                    field: 'CloseDate',
                    op: '>=',
                    value: this._getDateValue(intent.timeRange)
                });
            }
        }

        // Add any explicit filters
        for (const filter of intent.filters || []) {
            if (filter.field && filter.field !== 'CloseDate') {
                where.push(filter);
            }
        }

        return where;
    }

    /**
     * Get date value for time range
     */
    _getDateValue(timeRange) {
        const now = new Date();
        switch (timeRange) {
            case 'last_30_days':
                return `today-30d`;
            case 'last_90_days':
                return `today-90d`;
            case 'last_180_days':
                return `today-180d`;
            case 'this_quarter':
                return 'THIS_QUARTER';
            case 'last_quarter':
                return 'LAST_QUARTER';
            case 'this_year':
                return 'THIS_YEAR';
            case 'last_year':
                return 'LAST_YEAR';
            default:
                return `today-90d`;
        }
    }

    /**
     * Build sections from intent
     */
    _buildSections(intent, datasets) {
        const sections = [];
        const datasetId = datasets[0]?.id;

        // KPI Grid section (always first for exec audience)
        if (intent.audience === 'exec' || intent.metrics.length > 0) {
            sections.push({
                id: 'kpis',
                type: 'kpi_grid',
                dataset: datasetId,
                title: 'Executive Summary',
                metrics: intent.metrics.slice(0, 6).map(metricId => {
                    const mapping = this.metricMappings[metricId];
                    return {
                        id: metricId,
                        label: this._formatMetricLabel(metricId),
                        op: mapping?.op || 'sum',
                        field: mapping?.field || 'Amount',
                        where: mapping?.where || []
                    };
                })
            });
        }

        // Pivot section for each dimension
        for (const dimension of intent.dimensions) {
            const dimMapping = this.dimensionMappings[dimension];
            if (dimMapping) {
                sections.push({
                    id: `by_${dimension}`,
                    type: 'pivot',
                    dataset: datasetId,
                    title: `By ${this._formatDimensionLabel(dimension)}`,
                    group_by: [dimMapping.salesforce || dimension],
                    metrics: intent.metrics.slice(0, 3).map(metricId => {
                        const mapping = this.metricMappings[metricId];
                        return {
                            label: this._formatMetricLabel(metricId),
                            op: mapping?.op || 'sum',
                            field: mapping?.field || 'Amount'
                        };
                    }),
                    filters: []
                });
            }
        }

        // Detail table section
        sections.push({
            id: 'detail',
            type: 'table',
            dataset: datasetId,
            title: 'Detail',
            columns: this._buildDetailColumns(intent, datasets[0]),
            filters: [],
            sort: [{ field: 'CloseDate', direction: 'desc' }]
        });

        return sections;
    }

    /**
     * Build detail columns
     */
    _buildDetailColumns(intent, dataset) {
        const columns = [];
        const entityFields = {
            Opportunity: [
                { field: 'Name', label: 'Opportunity' },
                { field: 'Account.Name', label: 'Account' },
                { field: 'StageName', label: 'Stage' },
                { field: 'Amount', label: 'Amount' },
                { field: 'CloseDate', label: 'Close Date' },
                { field: 'Owner.Name', label: 'Owner' }
            ],
            deals: [
                { field: 'dealname', label: 'Deal' },
                { field: 'amount', label: 'Amount' },
                { field: 'dealstage', label: 'Stage' },
                { field: 'closedate', label: 'Close Date' }
            ]
        };

        const entity = dataset?.entity || 'Opportunity';
        return entityFields[entity] || entityFields.Opportunity;
    }

    /**
     * Build output configuration
     */
    _buildOutput(intent) {
        const output = {
            format: intent.format === 'google_sheets' ? 'google_sheets' : 'xlsx',
            template: {
                kind: intent.template ? 'xlsx_file' : 'none',
                path: intent.template || undefined
            }
        };

        return output;
    }

    /**
     * Generate report title from intent
     */
    _generateTitle(intent) {
        const metricStr = intent.metrics.slice(0, 2).map(m => this._formatMetricLabel(m)).join(' & ');
        const dimStr = intent.dimensions.length > 0
            ? ` by ${intent.dimensions.map(d => this._formatDimensionLabel(d)).join(', ')}`
            : '';
        const timeStr = intent.timeRange ? ` (${this._formatTimeRange(intent.timeRange)})` : '';

        return `${metricStr}${dimStr}${timeStr}`;
    }

    /**
     * Format metric label
     */
    _formatMetricLabel(metricId) {
        const labels = {
            'open_pipeline': 'Open Pipeline',
            'won_amount': 'Won Amount',
            'arr': 'ARR',
            'mrr': 'MRR',
            'count_opps': 'Opportunity Count',
            'avg_deal_size': 'Avg Deal Size',
            'win_rate': 'Win Rate',
            'nrr': 'NRR',
            'grr': 'GRR',
            'churn_rate': 'Churn Rate'
        };
        return labels[metricId] || metricId.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    }

    /**
     * Format dimension label
     */
    _formatDimensionLabel(dimension) {
        const labels = {
            'stage': 'Stage',
            'owner': 'Owner',
            'segment': 'Segment',
            'industry': 'Industry',
            'region': 'Region',
            'type': 'Type',
            'source': 'Source',
            'product': 'Product',
            'quarter': 'Quarter',
            'month': 'Month'
        };
        return labels[dimension] || dimension.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    }

    /**
     * Format time range for display
     */
    _formatTimeRange(timeRange) {
        const labels = {
            'this_quarter': 'This Quarter',
            'last_quarter': 'Last Quarter',
            'this_year': 'This Year',
            'last_year': 'Last Year',
            'last_30_days': 'Last 30 Days',
            'last_90_days': 'Last 90 Days',
            'last_180_days': 'Last 180 Days',
            'ytd': 'YTD',
            'qtd': 'QTD'
        };
        return labels[timeRange] || timeRange;
    }

    /**
     * Validate a ReportSpec against the schema
     */
    validateSpec(spec) {
        const errors = [];
        const warnings = [];

        // Required fields
        const required = ['id', 'title', 'grain', 'sources', 'sections', 'output', 'appendix'];
        for (const field of required) {
            if (!spec[field]) {
                errors.push(`Missing required field: ${field}`);
            }
        }

        // Validate sources
        if (spec.sources) {
            if (spec.sources.length === 0) {
                errors.push('At least one source is required');
            }
            for (const source of spec.sources) {
                if (!source.id || !source.type) {
                    errors.push('Source must have id and type');
                }
                if (!['salesforce', 'hubspot', 'csv', 'excel', 'google_sheets', 'warehouse'].includes(source.type)) {
                    errors.push(`Invalid source type: ${source.type}`);
                }
            }
        }

        // Validate sections
        if (spec.sections) {
            for (const section of spec.sections) {
                if (!section.id || !section.type || !section.dataset) {
                    errors.push(`Section ${section.id || 'unknown'} missing required fields`);
                }
                if (!['table', 'pivot', 'chart', 'text', 'kpi_grid'].includes(section.type)) {
                    warnings.push(`Unknown section type: ${section.type}`);
                }
            }

            // Complexity limits
            if (spec.datasets && spec.datasets.length > 3) {
                warnings.push('More than 3 datasets may impact performance');
            }
            if (spec.sections.length > 10) {
                warnings.push('More than 10 sections may be overwhelming');
            }
        }

        // Validate output
        if (spec.output) {
            if (!['xlsx', 'google_sheets', 'pdf', 'csv'].includes(spec.output.format)) {
                errors.push(`Invalid output format: ${spec.output.format}`);
            }
        }

        return {
            valid: errors.length === 0,
            errors,
            warnings
        };
    }

    /**
     * Generate SOQL from dataset spec
     */
    generateSOQL(dataset) {
        const fields = dataset.fields.join(', ');
        let soql = `SELECT ${fields} FROM ${dataset.entity}`;

        if (dataset.where && dataset.where.length > 0) {
            const whereClauses = dataset.where.map(w => {
                if (w.op === '=') return `${w.field} = ${this._formatValue(w.value)}`;
                if (w.op === '!=') return `${w.field} != ${this._formatValue(w.value)}`;
                if (w.op === '>=') return `${w.field} >= ${this._formatValue(w.value)}`;
                if (w.op === '<=') return `${w.field} <= ${this._formatValue(w.value)}`;
                if (w.op === 'in') return `${w.field} IN (${w.value.map(v => this._formatValue(v)).join(', ')})`;
                if (w.op === 'not_in') return `${w.field} NOT IN (${w.value.map(v => this._formatValue(v)).join(', ')})`;
                return '';
            }).filter(c => c);

            if (whereClauses.length > 0) {
                soql += ` WHERE ${whereClauses.join(' AND ')}`;
            }
        }

        if (dataset.limit) {
            soql += ` LIMIT ${dataset.limit}`;
        }

        return soql;
    }

    /**
     * Format value for SOQL
     */
    _formatValue(value) {
        if (typeof value === 'string') {
            if (value.startsWith('today')) return value.toUpperCase().replace('TODAY', 'TODAY').replace('D', '');
            if (['THIS_QUARTER', 'LAST_QUARTER', 'THIS_YEAR', 'LAST_YEAR'].includes(value)) return value;
            return `'${value}'`;
        }
        if (typeof value === 'boolean') return value ? 'true' : 'false';
        return value;
    }
}

// Export
module.exports = { ReportSpecCompiler };

// CLI interface
if (require.main === module) {
    const compiler = new ReportSpecCompiler();

    console.log('Report Spec Compiler - Demo\n');
    console.log('============================\n');

    // Test intent extraction
    const testRequests = [
        'Show me pipeline by stage for this quarter',
        'Monthly ARR report with breakdown by segment',
        'Win rate analysis by owner for last 90 days'
    ];

    for (const request of testRequests) {
        console.log(`Request: "${request}"\n`);

        const intent = compiler.extractIntent(request);
        console.log('Extracted Intent:');
        console.log(JSON.stringify(intent, null, 2));

        const spec = compiler.compileSpec(intent);
        console.log('\nGenerated ReportSpec:');
        console.log(JSON.stringify(spec, null, 2));

        const validation = compiler.validateSpec(spec);
        console.log('\nValidation:', validation.valid ? 'PASSED' : 'FAILED');
        if (validation.warnings.length > 0) {
            console.log('Warnings:', validation.warnings);
        }

        // Generate SOQL for first dataset
        if (spec.datasets && spec.datasets.length > 0) {
            const soql = compiler.generateSOQL(spec.datasets[0]);
            console.log('\nGenerated SOQL:');
            console.log(soql);
        }

        console.log('\n' + '='.repeat(50) + '\n');
    }
}
