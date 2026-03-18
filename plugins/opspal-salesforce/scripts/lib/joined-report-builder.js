/**
 * Joined Report Builder
 *
 * Programmatically generates Salesforce Joined Report XML for Metadata API deployment.
 * REST API cannot create joined reports - this builder creates the XML structure
 * required for sf project deploy.
 *
 * @version 1.0.0
 * @see ../docs/runbooks/report-api-development/05-joined-reports-basics.md
 * @see ../docs/runbooks/report-api-development/06-joined-reports-advanced.md
 *
 * Usage:
 *   const builder = new JoinedReportBuilder('Year_Over_Year_Revenue');
 *   builder.setDescription('Compare revenue between years');
 *   builder.setFolder('Revenue_Reports');
 *   builder.addBlock({
 *     id: 'B1',
 *     reportType: 'Opportunity',
 *     columns: ['Opportunity$Name', 'Opportunity$Amount'],
 *     filters: [{ field: 'Opportunity$StageName', operator: 'equals', value: 'Closed Won' }]
 *   });
 *   builder.addBlock({
 *     id: 'B2',
 *     reportType: 'Opportunity',
 *     columns: ['Opportunity$Name', 'Opportunity$Amount'],
 *     filters: [{ field: 'Opportunity$StageName', operator: 'equals', value: 'Closed Won' }]
 *   });
 *   builder.setCommonGrouping('ACCOUNT_NAME');
 *   builder.addCrossBlockFormula({
 *     name: 'Growth_Rate',
 *     formula: 'IF(BB2#B2_Revenue != 0, (BB1#B1_Revenue - BB2#B2_Revenue) / BB2#B2_Revenue * 100, 0)',
 *     datatype: 'percent'
 *   });
 *   const xml = builder.build();
 */

const fs = require('fs');
const path = require('path');

// =============================================================================
// CONSTANTS AND CONFIGURATION
// =============================================================================

/**
 * Joined report constraints
 */
const JOINED_REPORT_LIMITS = {
    MIN_BLOCKS: 2,
    MAX_BLOCKS: 5,
    MAX_ROWS_PER_BLOCK: 2000,
    MAX_COLUMNS_PER_BLOCK: 50,
    MAX_FILTERS_PER_BLOCK: 20,
    MAX_AGGREGATES_PER_BLOCK: 25,
    MAX_CROSS_BLOCK_FORMULAS: 10,
    MAX_GROUPINGS_DOWN: 3
};

/**
 * Valid operators for joined report filters
 */
const VALID_OPERATORS = [
    'equals', 'notEqual', 'lessThan', 'greaterThan',
    'lessOrEqual', 'greaterOrEqual', 'contains', 'notContain',
    'startsWith', 'includes', 'excludes', 'within'
];

/**
 * Valid aggregate functions
 */
const AGGREGATE_FUNCTIONS = ['SUM', 'AVG', 'MIN', 'MAX', 'UNIQUE'];

/**
 * Valid data types for aggregates
 */
const AGGREGATE_DATA_TYPES = ['number', 'currency', 'percent', 'text'];

/**
 * Valid date granularities
 */
const DATE_GRANULARITIES = ['None', 'Day', 'Week', 'Month', 'Quarter', 'Year', 'FiscalQuarter', 'FiscalYear'];

/**
 * Common report type patterns for joined reports
 */
const COMMON_REPORT_TYPE_PATTERNS = {
    opportunity: 'Opportunity',
    account: 'Account',
    contact: 'Contact',
    lead: 'Lead',
    case: 'Case',
    task: 'Task',
    event: 'Event',
    campaign: 'Campaign',
    accountOpportunity: 'AccountOpportunity',
    contactOpportunity: 'ContactOpportunity',
    quote: 'Quote',
    contract: 'Contract',
    order: 'Order'
};

// =============================================================================
// JOINED REPORT BUILDER CLASS
// =============================================================================

class JoinedReportBuilder {
    /**
     * Create a new JoinedReportBuilder
     * @param {string} reportName - The report name (DeveloperName)
     */
    constructor(reportName) {
        if (!reportName || typeof reportName !== 'string') {
            throw new Error('Report name is required and must be a string');
        }

        // Validate report name format (API name rules)
        if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(reportName)) {
            throw new Error('Report name must start with a letter and contain only letters, numbers, and underscores');
        }

        this.reportName = reportName;
        this.description = '';
        this.folder = 'unfiled$public';
        this.blocks = [];
        this.commonGroupings = [];
        this.crossBlockFormulas = [];
        this.settings = {
            currency: 'USD',
            scope: 'organization',
            showDetails: true,
            showGrandTotal: true,
            showSubTotals: true,
            timeFrameFilter: null
        };
        this.errors = [];
        this.warnings = [];
    }

    // =========================================================================
    // BASIC CONFIGURATION METHODS
    // =========================================================================

    /**
     * Set report description
     * @param {string} description - Report description
     * @returns {JoinedReportBuilder} this for chaining
     */
    setDescription(description) {
        this.description = description || '';
        return this;
    }

    /**
     * Set report folder
     * @param {string} folder - Folder API name
     * @returns {JoinedReportBuilder} this for chaining
     */
    setFolder(folder) {
        this.folder = folder || 'unfiled$public';
        return this;
    }

    /**
     * Set report currency
     * @param {string} currency - Currency code (e.g., 'USD', 'EUR')
     * @returns {JoinedReportBuilder} this for chaining
     */
    setCurrency(currency) {
        this.settings.currency = currency || 'USD';
        return this;
    }

    /**
     * Set report scope
     * @param {string} scope - 'organization', 'user', 'team', etc.
     * @returns {JoinedReportBuilder} this for chaining
     */
    setScope(scope) {
        this.settings.scope = scope || 'organization';
        return this;
    }

    /**
     * Set whether to show detail rows
     * @param {boolean} show - Show details
     * @returns {JoinedReportBuilder} this for chaining
     */
    setShowDetails(show) {
        this.settings.showDetails = show !== false;
        return this;
    }

    /**
     * Set whether to show grand totals
     * @param {boolean} show - Show grand totals
     * @returns {JoinedReportBuilder} this for chaining
     */
    setShowGrandTotal(show) {
        this.settings.showGrandTotal = show !== false;
        return this;
    }

    /**
     * Set whether to show subtotals
     * @param {boolean} show - Show subtotals
     * @returns {JoinedReportBuilder} this for chaining
     */
    setShowSubTotals(show) {
        this.settings.showSubTotals = show !== false;
        return this;
    }

    /**
     * Set standard time frame filter
     * @param {Object} filter - Time frame filter config
     * @param {string} filter.column - Date column to filter on
     * @param {string} filter.interval - Interval (e.g., 'INTERVAL_CURFY', 'INTERVAL_LASTFY')
     * @returns {JoinedReportBuilder} this for chaining
     */
    setTimeFrameFilter(filter) {
        if (filter && filter.column && filter.interval) {
            this.settings.timeFrameFilter = {
                dateColumn: filter.column,
                interval: filter.interval
            };
        }
        return this;
    }

    // =========================================================================
    // BLOCK MANAGEMENT METHODS
    // =========================================================================

    /**
     * Add a block to the joined report
     * @param {Object} blockConfig - Block configuration
     * @param {string} blockConfig.id - Block ID (e.g., 'B1', 'B2')
     * @param {string} blockConfig.reportType - Report type for this block
     * @param {string[]} blockConfig.columns - Column fields (Object$FieldName format)
     * @param {Object[]} [blockConfig.filters] - Block-specific filters
     * @param {Object[]} [blockConfig.aggregates] - Block aggregates
     * @param {string} [blockConfig.label] - Human-readable block label
     * @returns {JoinedReportBuilder} this for chaining
     */
    addBlock(blockConfig) {
        // Validate block count
        if (this.blocks.length >= JOINED_REPORT_LIMITS.MAX_BLOCKS) {
            this.errors.push(`Cannot add more than ${JOINED_REPORT_LIMITS.MAX_BLOCKS} blocks`);
            return this;
        }

        // Validate required fields
        if (!blockConfig.id) {
            this.errors.push('Block ID is required');
            return this;
        }

        if (!blockConfig.reportType) {
            this.errors.push(`Block ${blockConfig.id}: Report type is required`);
            return this;
        }

        if (!blockConfig.columns || !Array.isArray(blockConfig.columns) || blockConfig.columns.length === 0) {
            this.errors.push(`Block ${blockConfig.id}: At least one column is required`);
            return this;
        }

        // Validate block ID format
        if (!/^B\d+$/.test(blockConfig.id)) {
            this.warnings.push(`Block ID '${blockConfig.id}' does not follow B1, B2, B3... convention`);
        }

        // Check for duplicate block IDs
        if (this.blocks.find(b => b.id === blockConfig.id)) {
            this.errors.push(`Duplicate block ID: ${blockConfig.id}`);
            return this;
        }

        // Validate column count
        if (blockConfig.columns.length > JOINED_REPORT_LIMITS.MAX_COLUMNS_PER_BLOCK) {
            this.errors.push(`Block ${blockConfig.id}: Cannot have more than ${JOINED_REPORT_LIMITS.MAX_COLUMNS_PER_BLOCK} columns`);
            return this;
        }

        // Validate column format
        blockConfig.columns.forEach(col => {
            if (!col.includes('$')) {
                this.warnings.push(`Block ${blockConfig.id}: Column '${col}' should use Object$FieldName format for joined reports`);
            }
        });

        // Validate filters
        if (blockConfig.filters) {
            if (blockConfig.filters.length > JOINED_REPORT_LIMITS.MAX_FILTERS_PER_BLOCK) {
                this.errors.push(`Block ${blockConfig.id}: Cannot have more than ${JOINED_REPORT_LIMITS.MAX_FILTERS_PER_BLOCK} filters`);
                return this;
            }

            blockConfig.filters.forEach((filter, idx) => {
                if (!filter.field || !filter.operator) {
                    this.errors.push(`Block ${blockConfig.id}: Filter ${idx + 1} requires field and operator`);
                }
                if (filter.operator && !VALID_OPERATORS.includes(filter.operator)) {
                    this.errors.push(`Block ${blockConfig.id}: Invalid operator '${filter.operator}'`);
                }
            });
        }

        // Validate aggregates
        if (blockConfig.aggregates) {
            if (blockConfig.aggregates.length > JOINED_REPORT_LIMITS.MAX_AGGREGATES_PER_BLOCK) {
                this.errors.push(`Block ${blockConfig.id}: Cannot have more than ${JOINED_REPORT_LIMITS.MAX_AGGREGATES_PER_BLOCK} aggregates`);
                return this;
            }
        }

        // Create block object
        const block = {
            id: blockConfig.id,
            reportType: blockConfig.reportType,
            columns: blockConfig.columns,
            filters: blockConfig.filters || [],
            aggregates: blockConfig.aggregates || [],
            label: blockConfig.label || `Block ${blockConfig.id}`
        };

        this.blocks.push(block);
        return this;
    }

    /**
     * Add a simple block with minimal configuration
     * @param {string} id - Block ID
     * @param {string} reportType - Report type
     * @param {string[]} fields - Field names (will be converted to Object$Field format)
     * @returns {JoinedReportBuilder} this for chaining
     */
    addSimpleBlock(id, reportType, fields) {
        // Derive object name from report type
        const objectName = this._deriveObjectFromReportType(reportType);

        // Convert fields to Object$Field format
        const columns = fields.map(field => {
            if (field.includes('$')) return field;
            return `${objectName}$${field}`;
        });

        return this.addBlock({
            id,
            reportType,
            columns
        });
    }

    /**
     * Add an aggregate to a block
     * @param {string} blockId - Block ID to add aggregate to
     * @param {Object} aggregateConfig - Aggregate configuration
     * @param {string} aggregateConfig.name - Aggregate developer name
     * @param {string} aggregateConfig.label - Aggregate label
     * @param {string} aggregateConfig.formula - Aggregate formula (e.g., 'Object$Field:SUM')
     * @param {string} aggregateConfig.datatype - Data type (number, currency, percent)
     * @param {number} [aggregateConfig.scale=2] - Decimal places
     * @returns {JoinedReportBuilder} this for chaining
     */
    addBlockAggregate(blockId, aggregateConfig) {
        const block = this.blocks.find(b => b.id === blockId);
        if (!block) {
            this.errors.push(`Block ${blockId} not found`);
            return this;
        }

        if (block.aggregates.length >= JOINED_REPORT_LIMITS.MAX_AGGREGATES_PER_BLOCK) {
            this.errors.push(`Block ${blockId}: Cannot add more than ${JOINED_REPORT_LIMITS.MAX_AGGREGATES_PER_BLOCK} aggregates`);
            return this;
        }

        if (!aggregateConfig.name || !aggregateConfig.formula) {
            this.errors.push(`Block ${blockId}: Aggregate requires name and formula`);
            return this;
        }

        block.aggregates.push({
            name: aggregateConfig.name,
            label: aggregateConfig.label || aggregateConfig.name,
            formula: aggregateConfig.formula,
            datatype: aggregateConfig.datatype || 'number',
            scale: aggregateConfig.scale !== undefined ? aggregateConfig.scale : 2
        });

        return this;
    }

    /**
     * Add a filter to a block
     * @param {string} blockId - Block ID to add filter to
     * @param {string} field - Field to filter (Object$FieldName format)
     * @param {string} operator - Filter operator
     * @param {string} value - Filter value
     * @returns {JoinedReportBuilder} this for chaining
     */
    addBlockFilter(blockId, field, operator, value) {
        const block = this.blocks.find(b => b.id === blockId);
        if (!block) {
            this.errors.push(`Block ${blockId} not found`);
            return this;
        }

        if (block.filters.length >= JOINED_REPORT_LIMITS.MAX_FILTERS_PER_BLOCK) {
            this.errors.push(`Block ${blockId}: Cannot add more than ${JOINED_REPORT_LIMITS.MAX_FILTERS_PER_BLOCK} filters`);
            return this;
        }

        if (!VALID_OPERATORS.includes(operator)) {
            this.errors.push(`Invalid operator: ${operator}`);
            return this;
        }

        block.filters.push({ field, operator, value });
        return this;
    }

    // =========================================================================
    // GROUPING METHODS
    // =========================================================================

    /**
     * Set the common grouping field (required for joined reports)
     * @param {string} field - Field to group by
     * @param {Object} [options] - Grouping options
     * @param {string} [options.sortOrder='Asc'] - Sort order
     * @param {string} [options.dateGranularity='None'] - Date granularity
     * @returns {JoinedReportBuilder} this for chaining
     */
    setCommonGrouping(field, options = {}) {
        if (!field) {
            this.errors.push('Common grouping field is required for joined reports');
            return this;
        }

        // Clear existing groupings and set the primary one
        this.commonGroupings = [{
            field,
            sortOrder: options.sortOrder || 'Asc',
            dateGranularity: options.dateGranularity || 'None'
        }];

        return this;
    }

    /**
     * Add an additional grouping level
     * @param {string} field - Field to group by
     * @param {Object} [options] - Grouping options
     * @returns {JoinedReportBuilder} this for chaining
     */
    addGrouping(field, options = {}) {
        if (this.commonGroupings.length >= JOINED_REPORT_LIMITS.MAX_GROUPINGS_DOWN) {
            this.errors.push(`Cannot add more than ${JOINED_REPORT_LIMITS.MAX_GROUPINGS_DOWN} groupings`);
            return this;
        }

        if (options.dateGranularity && !DATE_GRANULARITIES.includes(options.dateGranularity)) {
            this.errors.push(`Invalid date granularity: ${options.dateGranularity}`);
            return this;
        }

        this.commonGroupings.push({
            field,
            sortOrder: options.sortOrder || 'Asc',
            dateGranularity: options.dateGranularity || 'None'
        });

        return this;
    }

    // =========================================================================
    // CROSS-BLOCK FORMULA METHODS
    // =========================================================================

    /**
     * Add a cross-block formula
     * @param {Object} formulaConfig - Formula configuration
     * @param {string} formulaConfig.name - Formula developer name
     * @param {string} formulaConfig.label - Formula label
     * @param {string} formulaConfig.formula - Formula expression (e.g., 'BB1#Agg1 - BB2#Agg2')
     * @param {string} formulaConfig.datatype - Data type
     * @param {number} [formulaConfig.scale=2] - Decimal places
     * @param {string} [formulaConfig.groupingContext='GRAND_SUMMARY'] - Where to show the formula
     * @returns {JoinedReportBuilder} this for chaining
     */
    addCrossBlockFormula(formulaConfig) {
        if (this.crossBlockFormulas.length >= JOINED_REPORT_LIMITS.MAX_CROSS_BLOCK_FORMULAS) {
            this.errors.push(`Cannot add more than ${JOINED_REPORT_LIMITS.MAX_CROSS_BLOCK_FORMULAS} cross-block formulas`);
            return this;
        }

        if (!formulaConfig.name || !formulaConfig.formula) {
            this.errors.push('Cross-block formula requires name and formula');
            return this;
        }

        // Validate formula syntax (should reference B{blockId}#{aggregateName})
        const blockRefs = formulaConfig.formula.match(/BB?\d+#\w+/g) || [];
        if (blockRefs.length === 0) {
            this.warnings.push(`Formula '${formulaConfig.name}' does not contain cross-block references (B{id}#{aggregate})`);
        }

        // Check that referenced blocks exist
        blockRefs.forEach(ref => {
            const match = ref.match(/B(\d+)/);
            if (match) {
                const blockId = `B${match[1]}`;
                if (!this.blocks.find(b => b.id === blockId)) {
                    this.warnings.push(`Formula '${formulaConfig.name}' references non-existent block ${blockId}`);
                }
            }
        });

        this.crossBlockFormulas.push({
            name: formulaConfig.name,
            label: formulaConfig.label || formulaConfig.name,
            formula: formulaConfig.formula,
            datatype: formulaConfig.datatype || 'number',
            scale: formulaConfig.scale !== undefined ? formulaConfig.scale : 2,
            groupingContext: formulaConfig.groupingContext || 'GRAND_SUMMARY'
        });

        return this;
    }

    /**
     * Add a variance formula (Block1 - Block2)
     * @param {string} name - Formula name
     * @param {string} block1Aggregate - Block 1 aggregate name (e.g., 'B1_Amount')
     * @param {string} block2Aggregate - Block 2 aggregate name (e.g., 'B2_Amount')
     * @param {string} [datatype='currency'] - Data type
     * @returns {JoinedReportBuilder} this for chaining
     */
    addVarianceFormula(name, block1Aggregate, block2Aggregate, datatype = 'currency') {
        return this.addCrossBlockFormula({
            name,
            label: `${name.replace(/_/g, ' ')}`,
            formula: `BB1#${block1Aggregate} - BB2#${block2Aggregate}`,
            datatype
        });
    }

    /**
     * Add a growth rate formula ((B1 - B2) / B2 * 100)
     * @param {string} name - Formula name
     * @param {string} block1Aggregate - Block 1 (current) aggregate name
     * @param {string} block2Aggregate - Block 2 (previous) aggregate name
     * @returns {JoinedReportBuilder} this for chaining
     */
    addGrowthRateFormula(name, block1Aggregate, block2Aggregate) {
        return this.addCrossBlockFormula({
            name,
            label: `${name.replace(/_/g, ' ')} %`,
            formula: `IF(BB2#${block2Aggregate} != 0, (BB1#${block1Aggregate} - BB2#${block2Aggregate}) / BB2#${block2Aggregate} * 100, 0)`,
            datatype: 'percent',
            scale: 2
        });
    }

    /**
     * Add a ratio formula (B1 / B2)
     * @param {string} name - Formula name
     * @param {string} numeratorAggregate - Numerator aggregate (from B1)
     * @param {string} denominatorAggregate - Denominator aggregate (from B2)
     * @param {string} [datatype='number'] - Data type
     * @returns {JoinedReportBuilder} this for chaining
     */
    addRatioFormula(name, numeratorAggregate, denominatorAggregate, datatype = 'number') {
        return this.addCrossBlockFormula({
            name,
            label: `${name.replace(/_/g, ' ')}`,
            formula: `IF(BB2#${denominatorAggregate} != 0, BB1#${numeratorAggregate} / BB2#${denominatorAggregate}, 0)`,
            datatype
        });
    }

    // =========================================================================
    // TEMPLATE METHODS
    // =========================================================================

    /**
     * Create a Year-over-Year comparison report
     * @param {string} reportType - Report type (e.g., 'Opportunity')
     * @param {string} amountField - Amount field name
     * @param {string} groupingField - Common grouping field
     * @param {Object} [currentYearFilter] - Filter for current year block
     * @param {Object} [previousYearFilter] - Filter for previous year block
     * @returns {JoinedReportBuilder} this for chaining
     */
    createYoYComparison(reportType, amountField, groupingField, currentYearFilter, previousYearFilter) {
        const objectName = this._deriveObjectFromReportType(reportType);
        const amountCol = `${objectName}$${amountField}`;

        // Block 1: Current Year
        this.addBlock({
            id: 'B1',
            reportType,
            columns: [`${objectName}$Name`, amountCol],
            filters: currentYearFilter ? [currentYearFilter] : [],
            aggregates: [{
                name: 'B1_Amount',
                label: 'Current Year Amount',
                formula: `${amountCol}:SUM`,
                datatype: 'currency'
            }]
        });

        // Block 2: Previous Year
        this.addBlock({
            id: 'B2',
            reportType,
            columns: [`${objectName}$Name`, amountCol],
            filters: previousYearFilter ? [previousYearFilter] : [],
            aggregates: [{
                name: 'B2_Amount',
                label: 'Previous Year Amount',
                formula: `${amountCol}:SUM`,
                datatype: 'currency'
            }]
        });

        // Common grouping
        this.setCommonGrouping(groupingField);

        // Cross-block formulas
        this.addVarianceFormula('YoY_Variance', 'B1_Amount', 'B2_Amount');
        this.addGrowthRateFormula('YoY_Growth', 'B1_Amount', 'B2_Amount');

        return this;
    }

    /**
     * Create a Forecast vs Actual comparison report
     * @param {string} actualReportType - Report type for actual data
     * @param {string} forecastReportType - Report type for forecast data
     * @param {string} amountField - Amount field name
     * @param {string} groupingField - Common grouping field
     * @returns {JoinedReportBuilder} this for chaining
     */
    createForecastVsActual(actualReportType, forecastReportType, amountField, groupingField) {
        const actualObject = this._deriveObjectFromReportType(actualReportType);
        const forecastObject = this._deriveObjectFromReportType(forecastReportType);

        // Block 1: Actual
        this.addBlock({
            id: 'B1',
            reportType: actualReportType,
            columns: [`${actualObject}$Name`, `${actualObject}$${amountField}`],
            aggregates: [{
                name: 'B1_Actual',
                label: 'Actual',
                formula: `${actualObject}$${amountField}:SUM`,
                datatype: 'currency'
            }]
        });

        // Block 2: Forecast
        this.addBlock({
            id: 'B2',
            reportType: forecastReportType,
            columns: [`${forecastObject}$Name`, `${forecastObject}$${amountField}`],
            aggregates: [{
                name: 'B2_Forecast',
                label: 'Forecast',
                formula: `${forecastObject}$${amountField}:SUM`,
                datatype: 'currency'
            }]
        });

        // Common grouping
        this.setCommonGrouping(groupingField);

        // Cross-block formulas
        this.addVarianceFormula('Variance', 'B1_Actual', 'B2_Forecast');
        this.addCrossBlockFormula({
            name: 'Attainment',
            label: 'Attainment %',
            formula: 'IF(BB2#B2_Forecast != 0, BB1#B1_Actual / BB2#B2_Forecast * 100, 0)',
            datatype: 'percent'
        });

        return this;
    }

    /**
     * Create a Pipeline vs Closed comparison report
     * @param {string} groupingField - Common grouping field (e.g., 'ACCOUNT_NAME')
     * @returns {JoinedReportBuilder} this for chaining
     */
    createPipelineVsClosed(groupingField = 'ACCOUNT_NAME') {
        // Block 1: Open Pipeline
        this.addBlock({
            id: 'B1',
            reportType: 'Opportunity',
            columns: ['Opportunity$Name', 'Opportunity$Amount', 'Opportunity$StageName'],
            filters: [{ field: 'Opportunity$IsClosed', operator: 'equals', value: 'false' }],
            aggregates: [{
                name: 'B1_Pipeline',
                label: 'Open Pipeline',
                formula: 'Opportunity$Amount:SUM',
                datatype: 'currency'
            }]
        });

        // Block 2: Closed Won
        this.addBlock({
            id: 'B2',
            reportType: 'Opportunity',
            columns: ['Opportunity$Name', 'Opportunity$Amount', 'Opportunity$CloseDate'],
            filters: [{ field: 'Opportunity$StageName', operator: 'equals', value: 'Closed Won' }],
            aggregates: [{
                name: 'B2_Won',
                label: 'Closed Won',
                formula: 'Opportunity$Amount:SUM',
                datatype: 'currency'
            }]
        });

        // Common grouping
        this.setCommonGrouping(groupingField);

        // Cross-block formulas
        this.addCrossBlockFormula({
            name: 'Total_Potential',
            label: 'Total Potential',
            formula: 'BB1#B1_Pipeline + BB2#B2_Won',
            datatype: 'currency'
        });

        this.addCrossBlockFormula({
            name: 'Win_Rate',
            label: 'Win Rate %',
            formula: 'IF(BB1#B1_Pipeline + BB2#B2_Won != 0, BB2#B2_Won / (BB1#B1_Pipeline + BB2#B2_Won) * 100, 0)',
            datatype: 'percent'
        });

        return this;
    }

    /**
     * Create a Customer 360 view (Opportunities, Cases, Activities)
     * @param {string} groupingField - Common grouping field (typically 'ACCOUNT_NAME')
     * @returns {JoinedReportBuilder} this for chaining
     */
    createCustomer360(groupingField = 'ACCOUNT_NAME') {
        // Block 1: Opportunities
        this.addBlock({
            id: 'B1',
            reportType: 'AccountOpportunity',
            columns: ['Account$Name', 'Opportunity$Name', 'Opportunity$Amount'],
            aggregates: [{
                name: 'B1_Revenue',
                label: 'Total Revenue',
                formula: 'Opportunity$Amount:SUM',
                datatype: 'currency'
            }]
        });

        // Block 2: Cases
        this.addBlock({
            id: 'B2',
            reportType: 'AccountCase',
            columns: ['Account$Name', 'Case$CaseNumber', 'Case$Status'],
            aggregates: [{
                name: 'B2_Cases',
                label: 'Total Cases',
                formula: 'RowCount',
                datatype: 'number'
            }]
        });

        // Block 3: Activities
        this.addBlock({
            id: 'B3',
            reportType: 'AccountActivity',
            columns: ['Account$Name', 'Task$Subject', 'Task$Status'],
            aggregates: [{
                name: 'B3_Activities',
                label: 'Total Activities',
                formula: 'RowCount',
                datatype: 'number'
            }]
        });

        // Common grouping
        this.setCommonGrouping(groupingField);

        return this;
    }

    // =========================================================================
    // VALIDATION METHODS
    // =========================================================================

    /**
     * Validate the report configuration
     * @returns {Object} Validation result with isValid, errors, warnings
     */
    validate() {
        const validationErrors = [...this.errors];
        const validationWarnings = [...this.warnings];

        // Check minimum blocks
        if (this.blocks.length < JOINED_REPORT_LIMITS.MIN_BLOCKS) {
            validationErrors.push(`Joined reports require at least ${JOINED_REPORT_LIMITS.MIN_BLOCKS} blocks`);
        }

        // Check common grouping
        if (this.commonGroupings.length === 0) {
            validationErrors.push('Common grouping is required for joined reports');
        }

        // Check that all blocks have compatible report types for the grouping
        if (this.commonGroupings.length > 0) {
            const groupingField = this.commonGroupings[0].field;
            // Warning: This is a basic check, real validation would need to query org metadata
            this.blocks.forEach(block => {
                validationWarnings.push(
                    `Verify that '${groupingField}' exists in report type '${block.reportType}'`
                );
            });
        }

        // Check cross-block formulas reference existing blocks
        this.crossBlockFormulas.forEach(formula => {
            const refs = formula.formula.match(/BB?(\d+)/g) || [];
            refs.forEach(ref => {
                const blockNum = ref.replace(/B+/, '');
                const blockId = `B${blockNum}`;
                if (!this.blocks.find(b => b.id === blockId)) {
                    validationErrors.push(
                        `Cross-block formula '${formula.name}' references non-existent block ${blockId}`
                    );
                }
            });
        });

        return {
            isValid: validationErrors.length === 0,
            errors: validationErrors,
            warnings: validationWarnings
        };
    }

    // =========================================================================
    // BUILD METHODS
    // =========================================================================

    /**
     * Build the XML for the joined report
     * @param {Object} [options] - Build options
     * @param {boolean} [options.validate=true] - Validate before building
     * @param {boolean} [options.includeComments=true] - Include XML comments
     * @returns {string} XML string
     */
    build(options = {}) {
        const { validate = true, includeComments = true } = options;

        // Validate if requested
        if (validate) {
            const validation = this.validate();
            if (!validation.isValid) {
                throw new Error(`Validation failed:\n${validation.errors.join('\n')}`);
            }
        }

        const lines = [];

        // XML declaration
        lines.push('<?xml version="1.0" encoding="UTF-8"?>');

        // Header comment
        if (includeComments) {
            lines.push('<!--');
            lines.push(`    Joined Report: ${this.reportName}`);
            lines.push(`    Generated by OpsPal by RevPal`);
            lines.push(`    Date: ${new Date().toISOString()}`);
            lines.push('-->');
        }

        // Report root element
        lines.push('<Report xmlns="http://soap.sforce.com/2006/04/metadata">');

        // Basic metadata
        lines.push(`    <name>${this._escapeXml(this.reportName)}</name>`);
        if (this.description) {
            lines.push(`    <description>${this._escapeXml(this.description)}</description>`);
        }
        lines.push('    <format>MultiBlock</format>');
        lines.push(`    <reportFolder>${this._escapeXml(this.folder)}</reportFolder>`);

        // Blocks
        this.blocks.forEach(block => {
            lines.push('');
            if (includeComments) {
                lines.push(`    <!-- Block: ${block.label} -->`);
            }
            lines.push('    <block>');
            lines.push('        <blockInfo>');
            lines.push(`            <blockId>${block.id}</blockId>`);
            lines.push(`            <joinTable>${block.reportType}</joinTable>`);
            lines.push('        </blockInfo>');
            lines.push(`        <reportType>${block.reportType}</reportType>`);

            // Columns
            block.columns.forEach(col => {
                lines.push('        <columns>');
                lines.push(`            <field>${this._escapeXml(col)}</field>`);
                lines.push('        </columns>');
            });

            // Filters
            if (block.filters.length > 0) {
                lines.push('        <filter>');
                block.filters.forEach(filter => {
                    lines.push('            <criteriaItems>');
                    lines.push(`                <column>${this._escapeXml(filter.field)}</column>`);
                    lines.push(`                <operator>${filter.operator}</operator>`);
                    lines.push(`                <value>${this._escapeXml(filter.value)}</value>`);
                    lines.push('            </criteriaItems>');
                });
                lines.push('        </filter>');
            }

            // Aggregates
            block.aggregates.forEach(agg => {
                lines.push('        <aggregates>');
                lines.push(`            <acrossGroupingContext>${block.id}</acrossGroupingContext>`);
                lines.push(`            <calculatedFormula>${this._escapeXml(agg.formula)}</calculatedFormula>`);
                lines.push(`            <datatype>${agg.datatype}</datatype>`);
                lines.push(`            <developerName>${agg.name}</developerName>`);
                lines.push('            <downGroupingContext>GRAND_SUMMARY</downGroupingContext>');
                lines.push('            <isActive>true</isActive>');
                lines.push(`            <masterLabel>${this._escapeXml(agg.label)}</masterLabel>`);
                lines.push(`            <scale>${agg.scale}</scale>`);
                lines.push('        </aggregates>');
            });

            lines.push('    </block>');
        });

        // Common groupings
        if (this.commonGroupings.length > 0) {
            lines.push('');
            if (includeComments) {
                lines.push('    <!-- Common Groupings -->');
            }
            this.commonGroupings.forEach(grouping => {
                lines.push('    <groupingsDown>');
                lines.push(`        <dateGranularity>${grouping.dateGranularity}</dateGranularity>`);
                lines.push(`        <field>${this._escapeXml(grouping.field)}</field>`);
                lines.push(`        <sortOrder>${grouping.sortOrder}</sortOrder>`);
                lines.push('    </groupingsDown>');
            });
        }

        // Cross-block formulas
        if (this.crossBlockFormulas.length > 0) {
            lines.push('');
            if (includeComments) {
                lines.push('    <!-- Cross-Block Formulas -->');
            }
            this.crossBlockFormulas.forEach(formula => {
                lines.push('    <customSummaryFormulas>');
                lines.push('        <aggregate>Sum</aggregate>');
                lines.push(`        <calculatedFormula>${this._escapeXml(formula.formula)}</calculatedFormula>`);
                lines.push(`        <datatype>${formula.datatype}</datatype>`);
                lines.push(`        <developerName>${formula.name}</developerName>`);
                lines.push(`        <downGroupingContext>${formula.groupingContext}</downGroupingContext>`);
                lines.push('        <isActive>true</isActive>');
                lines.push(`        <masterLabel>${this._escapeXml(formula.label)}</masterLabel>`);
                lines.push(`        <scale>${formula.scale}</scale>`);
                lines.push('    </customSummaryFormulas>');
            });
        }

        // Settings
        lines.push('');
        if (includeComments) {
            lines.push('    <!-- Report Settings -->');
        }
        lines.push(`    <currency>${this.settings.currency}</currency>`);
        lines.push(`    <scope>${this.settings.scope}</scope>`);
        lines.push(`    <showDetails>${this.settings.showDetails}</showDetails>`);
        lines.push(`    <showGrandTotal>${this.settings.showGrandTotal}</showGrandTotal>`);
        lines.push(`    <showSubTotals>${this.settings.showSubTotals}</showSubTotals>`);

        // Time frame filter
        if (this.settings.timeFrameFilter) {
            lines.push('    <timeFrameFilter>');
            lines.push(`        <dateColumn>${this.settings.timeFrameFilter.dateColumn}</dateColumn>`);
            lines.push(`        <interval>${this.settings.timeFrameFilter.interval}</interval>`);
            lines.push('    </timeFrameFilter>');
        }

        lines.push('</Report>');

        return lines.join('\n');
    }

    /**
     * Build and save to file
     * @param {string} outputPath - Path to save the file
     * @param {Object} [options] - Build options
     * @returns {string} Path to saved file
     */
    buildAndSave(outputPath, options = {}) {
        const xml = this.build(options);

        // Ensure directory exists
        const dir = path.dirname(outputPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        // Add .report-meta.xml extension if not present
        let finalPath = outputPath;
        if (!outputPath.endsWith('.report-meta.xml')) {
            if (outputPath.endsWith('.xml')) {
                finalPath = outputPath.replace('.xml', '.report-meta.xml');
            } else {
                finalPath = `${outputPath}.report-meta.xml`;
            }
        }

        fs.writeFileSync(finalPath, xml, 'utf8');
        return finalPath;
    }

    /**
     * Export the report configuration as JSON (for debugging/documentation)
     * @returns {Object} JSON configuration
     */
    toJSON() {
        return {
            reportName: this.reportName,
            description: this.description,
            folder: this.folder,
            format: 'MultiBlock',
            blocks: this.blocks.map(b => ({
                id: b.id,
                reportType: b.reportType,
                columns: b.columns,
                filters: b.filters,
                aggregates: b.aggregates,
                label: b.label
            })),
            commonGroupings: this.commonGroupings,
            crossBlockFormulas: this.crossBlockFormulas,
            settings: this.settings
        };
    }

    // =========================================================================
    // PRIVATE HELPER METHODS
    // =========================================================================

    /**
     * Derive object name from report type
     * @private
     */
    _deriveObjectFromReportType(reportType) {
        // Handle standard report types
        if (reportType === 'AccountOpportunity') return 'Opportunity';
        if (reportType === 'ContactOpportunity') return 'Opportunity';
        if (reportType === 'AccountCase') return 'Case';
        if (reportType === 'AccountActivity') return 'Task';

        // For simple types, just return the type name
        return reportType;
    }

    /**
     * Escape special XML characters
     * @private
     */
    _escapeXml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
    }
}

// =============================================================================
// STATIC FACTORY METHODS
// =============================================================================

/**
 * Create a builder from template
 * @param {string} template - Template name
 * @param {string} reportName - Report name
 * @param {Object} [config] - Additional configuration
 * @returns {JoinedReportBuilder} Configured builder
 */
JoinedReportBuilder.fromTemplate = function(template, reportName, config = {}) {
    const builder = new JoinedReportBuilder(reportName);

    switch (template) {
        case 'yoy':
        case 'year-over-year':
            builder.createYoYComparison(
                config.reportType || 'Opportunity',
                config.amountField || 'Amount',
                config.groupingField || 'ACCOUNT_NAME',
                config.currentYearFilter,
                config.previousYearFilter
            );
            break;

        case 'forecast-vs-actual':
            builder.createForecastVsActual(
                config.actualReportType || 'Opportunity',
                config.forecastReportType || 'Forecast',
                config.amountField || 'Amount',
                config.groupingField || 'ACCOUNT_NAME'
            );
            break;

        case 'pipeline-vs-closed':
            builder.createPipelineVsClosed(config.groupingField || 'ACCOUNT_NAME');
            break;

        case 'customer-360':
            builder.createCustomer360(config.groupingField || 'ACCOUNT_NAME');
            break;

        default:
            throw new Error(`Unknown template: ${template}`);
    }

    // Apply additional config
    if (config.description) builder.setDescription(config.description);
    if (config.folder) builder.setFolder(config.folder);
    if (config.currency) builder.setCurrency(config.currency);
    if (config.timeFrameFilter) builder.setTimeFrameFilter(config.timeFrameFilter);

    return builder;
};

/**
 * Create a builder from JSON configuration
 * @param {Object} json - JSON configuration
 * @returns {JoinedReportBuilder} Configured builder
 */
JoinedReportBuilder.fromJSON = function(json) {
    const builder = new JoinedReportBuilder(json.reportName);

    if (json.description) builder.setDescription(json.description);
    if (json.folder) builder.setFolder(json.folder);

    // Add blocks
    (json.blocks || []).forEach(block => builder.addBlock(block));

    // Add groupings
    (json.commonGroupings || []).forEach((grouping, idx) => {
        if (idx === 0) {
            builder.setCommonGrouping(grouping.field, grouping);
        } else {
            builder.addGrouping(grouping.field, grouping);
        }
    });

    // Add cross-block formulas
    (json.crossBlockFormulas || []).forEach(formula => builder.addCrossBlockFormula(formula));

    // Apply settings
    if (json.settings) {
        if (json.settings.currency) builder.setCurrency(json.settings.currency);
        if (json.settings.scope) builder.setScope(json.settings.scope);
        if (json.settings.showDetails !== undefined) builder.setShowDetails(json.settings.showDetails);
        if (json.settings.showGrandTotal !== undefined) builder.setShowGrandTotal(json.settings.showGrandTotal);
        if (json.settings.showSubTotals !== undefined) builder.setShowSubTotals(json.settings.showSubTotals);
        if (json.settings.timeFrameFilter) builder.setTimeFrameFilter(json.settings.timeFrameFilter);
    }

    return builder;
};

// =============================================================================
// CLI INTERFACE
// =============================================================================

if (require.main === module) {
    const args = process.argv.slice(2);

    if (args.length === 0 || args[0] === '--help') {
        console.log(`
Joined Report Builder
=====================

Programmatically generate Salesforce Joined Report XML for Metadata API deployment.

Usage:
  node joined-report-builder.js --template <template> --name <reportName> [options]
  node joined-report-builder.js --from-json <path> [--output <path>]

Templates:
  yoy, year-over-year      Year-over-Year comparison
  forecast-vs-actual       Forecast vs Actual comparison
  pipeline-vs-closed       Pipeline vs Closed Won
  customer-360             Customer 360 view (Opps, Cases, Activities)

Options:
  --name <name>            Report name (required)
  --template <template>    Template to use
  --from-json <path>       Build from JSON configuration file
  --output <path>          Output file path (default: stdout)
  --folder <folder>        Report folder (default: unfiled$public)
  --description <desc>     Report description
  --no-comments            Exclude XML comments
  --validate-only          Only validate, don't generate

Examples:
  # Generate YoY report
  node joined-report-builder.js --template yoy --name YoY_Revenue_Report --output ./reports/

  # Generate from JSON config
  node joined-report-builder.js --from-json ./config/my-report.json --output ./force-app/main/default/reports/

  # Validate a configuration
  node joined-report-builder.js --from-json ./config/my-report.json --validate-only
        `);
        process.exit(0);
    }

    // Parse arguments
    const getArg = (flag) => {
        const idx = args.indexOf(flag);
        return idx !== -1 && args[idx + 1] ? args[idx + 1] : null;
    };

    const hasFlag = (flag) => args.includes(flag);

    try {
        let builder;

        const fromJson = getArg('--from-json');
        const template = getArg('--template');
        const name = getArg('--name');

        if (fromJson) {
            // Build from JSON file
            const jsonConfig = JSON.parse(fs.readFileSync(fromJson, 'utf8'));
            builder = JoinedReportBuilder.fromJSON(jsonConfig);
        } else if (template && name) {
            // Build from template
            builder = JoinedReportBuilder.fromTemplate(template, name, {
                folder: getArg('--folder'),
                description: getArg('--description')
            });
        } else {
            console.error('Error: Either --from-json or (--template and --name) required');
            process.exit(1);
        }

        // Validate only?
        if (hasFlag('--validate-only')) {
            const validation = builder.validate();
            console.log('Validation Result:');
            console.log(`  Valid: ${validation.isValid}`);
            if (validation.errors.length > 0) {
                console.log('  Errors:');
                validation.errors.forEach(e => console.log(`    - ${e}`));
            }
            if (validation.warnings.length > 0) {
                console.log('  Warnings:');
                validation.warnings.forEach(w => console.log(`    - ${w}`));
            }
            process.exit(validation.isValid ? 0 : 1);
        }

        // Build
        const xml = builder.build({
            includeComments: !hasFlag('--no-comments')
        });

        // Output
        const output = getArg('--output');
        if (output) {
            const savedPath = builder.buildAndSave(output, { includeComments: !hasFlag('--no-comments') });
            console.log(`Report saved to: ${savedPath}`);
        } else {
            console.log(xml);
        }

    } catch (err) {
        console.error(`Error: ${err.message}`);
        process.exit(1);
    }
}

// =============================================================================
// EXPORTS
// =============================================================================

module.exports = {
    JoinedReportBuilder,
    JOINED_REPORT_LIMITS,
    VALID_OPERATORS,
    AGGREGATE_FUNCTIONS,
    AGGREGATE_DATA_TYPES,
    DATE_GRANULARITIES,
    COMMON_REPORT_TYPE_PATTERNS
};
