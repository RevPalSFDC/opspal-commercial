#!/usr/bin/env node

/**
 * SOQL Query Builder for Salesforce MCP Tools
 * 
 * A comprehensive query builder that prevents syntax errors, handles reserved keywords,
 * and scales with data volume through intelligent chunking and pagination.
 */

class SOQLQueryBuilder {
    constructor() {
        // Reserved SOQL keywords that need special handling
        this.RESERVED_KEYWORDS = new Set([
            'count', 'sum', 'avg', 'max', 'min', 'group', 'order', 'limit', 
            'offset', 'having', 'rollup', 'cube', 'format', 'update', 'tracking',
            'viewstat', 'data', 'category', 'above', 'below', 'above_or_below',
            'at', 'end', 'first', 'last', 'not', 'null', 'nulls', 'or', 'and',
            'asc', 'desc', 'excludes', 'includes', 'like', 'in', 'true', 'false',
            'yesterday', 'today', 'tomorrow', 'last_week', 'this_week', 'next_week',
            'last_month', 'this_month', 'next_month', 'last_quarter', 'this_quarter',
            'next_quarter', 'last_year', 'this_year', 'next_year', 'fiscal_quarter',
            'fiscal_year', 'day_in_month', 'day_in_week', 'day_in_year', 'week_in_month',
            'week_in_year', 'hour_in_day', 'calendar_month', 'calendar_quarter', 'calendar_year'
        ]);

        // Common aggregate functions
        // NOTE: COUNT(DISTINCT field) is NOT supported in SOQL
        // Use GROUP BY field to get unique values, then count the results
        this.AGGREGATE_FUNCTIONS = {
            'COUNT': { requiresField: true, defaultField: 'Id' },
            // COUNT_DISTINCT removed - not valid in SOQL
            'SUM': { requiresField: true, numericOnly: true },
            'AVG': { requiresField: true, numericOnly: true },
            'MIN': { requiresField: true },
            'MAX': { requiresField: true }
        };

        // Field type mappings for validation
        // NOTE: COUNT(DISTINCT) is not valid in SOQL - use GROUP BY instead
        this.FIELD_TYPES = {
            'Currency': ['SUM', 'AVG', 'MIN', 'MAX'],
            'Number': ['SUM', 'AVG', 'MIN', 'MAX'],
            'Double': ['SUM', 'AVG', 'MIN', 'MAX'],
            'Integer': ['SUM', 'AVG', 'MIN', 'MAX'],
            'Percent': ['SUM', 'AVG', 'MIN', 'MAX'],
            'Date': ['MIN', 'MAX'],
            'DateTime': ['MIN', 'MAX'],
            'String': ['MIN', 'MAX'],
            'Id': ['COUNT']  // Use GROUP BY for uniqueness, not COUNT(DISTINCT)
        };

        // Query components
        this.reset();
    }

    /**
     * Reset query builder to initial state
     */
    reset() {
        this.selectFields = [];
        this.fromObject = null;
        this.whereConditions = [];
        this.groupByFields = [];
        this.havingConditions = [];
        this.orderByFields = [];
        this.limitValue = null;
        this.offsetValue = null;
        this.withClauses = [];
        this.errors = [];
        this.warnings = [];
        return this;
    }

    /**
     * Sanitize alias to avoid reserved keyword conflicts
     */
    sanitizeAlias(alias) {
        if (!alias) return null;
        
        const lowerAlias = alias.toLowerCase();
        
        // If it's a reserved keyword, append suffix
        if (this.RESERVED_KEYWORDS.has(lowerAlias)) {
            return `${alias}_value`;
        }
        
        // Ensure alias starts with letter and contains only valid characters
        const sanitized = alias.replace(/[^a-zA-Z0-9_]/g, '_');
        if (!/^[a-zA-Z]/.test(sanitized)) {
            return `field_${sanitized}`;
        }
        
        return sanitized;
    }

    /**
     * Add SELECT field
     */
    select(field, alias = null) {
        if (Array.isArray(field)) {
            field.forEach(f => {
                if (typeof f === 'object' && f.field) {
                    this.select(f.field, f.alias);
                } else {
                    this.select(f);
                }
            });
            return this;
        }

        const fieldConfig = {
            field: field,
            alias: alias ? this.sanitizeAlias(alias) : null
        };

        this.selectFields.push(fieldConfig);
        return this;
    }

    /**
     * Add aggregate function
     */
    aggregate(func, field = null, alias = null) {
        const upperFunc = func.toUpperCase();
        
        if (!this.AGGREGATE_FUNCTIONS[upperFunc]) {
            this.errors.push(`Unknown aggregate function: ${func}`);
            return this;
        }

        const funcConfig = this.AGGREGATE_FUNCTIONS[upperFunc];
        
        // Use default field if required but not provided
        if (funcConfig.requiresField && !field) {
            field = funcConfig.defaultField || 'Id';
        }

        // Generate automatic alias if not provided
        if (!alias) {
            if (field) {
                alias = `${func.toLowerCase()}_${field.toLowerCase()}`;
            } else {
                alias = func.toLowerCase();
            }
        }

        alias = this.sanitizeAlias(alias);

        const aggregateExpression = field ? `${upperFunc}(${field})` : upperFunc;
        
        this.selectFields.push({
            field: aggregateExpression,
            alias: alias,
            isAggregate: true,
            function: upperFunc,
            originalField: field
        });

        return this;
    }

    /**
     * Common aggregate shortcuts
     */
    count(field = 'Id', alias = null) {
        return this.aggregate('COUNT', field, alias || 'recordCount');
    }

    sum(field, alias = null) {
        return this.aggregate('SUM', field, alias || `total_${field.toLowerCase()}`);
    }

    avg(field, alias = null) {
        return this.aggregate('AVG', field, alias || `average_${field.toLowerCase()}`);
    }

    min(field, alias = null) {
        return this.aggregate('MIN', field, alias || `min_${field.toLowerCase()}`);
    }

    max(field, alias = null) {
        return this.aggregate('MAX', field, alias || `max_${field.toLowerCase()}`);
    }

    /**
     * Set FROM object
     */
    from(objectName) {
        this.fromObject = objectName;
        return this;
    }

    /**
     * Add WHERE condition
     */
    where(condition, operator = 'AND') {
        if (Array.isArray(condition)) {
            condition.forEach(c => this.where(c, operator));
            return this;
        }

        if (this.whereConditions.length > 0) {
            this.whereConditions.push({ operator: operator.toUpperCase(), condition });
        } else {
            this.whereConditions.push({ condition });
        }
        
        return this;
    }

    /**
     * Helper methods for common WHERE conditions
     */
    whereEquals(field, value) {
        const formattedValue = this.formatValue(value);
        return this.where(`${field} = ${formattedValue}`);
    }

    whereIn(field, values) {
        const formattedValues = values.map(v => this.formatValue(v)).join(', ');
        return this.where(`${field} IN (${formattedValues})`);
    }

    whereNotNull(field) {
        return this.where(`${field} != null`);
    }

    whereLike(field, pattern) {
        return this.where(`${field} LIKE '${pattern}'`);
    }

    whereDateRange(field, startDate, endDate) {
        return this.where(`${field} >= ${startDate} AND ${field} <= ${endDate}`);
    }

    /**
     * Add GROUP BY field
     */
    groupBy(field) {
        if (Array.isArray(field)) {
            this.groupByFields.push(...field);
        } else {
            this.groupByFields.push(field);
        }
        return this;
    }

    /**
     * Add HAVING condition
     */
    having(condition) {
        this.havingConditions.push(condition);
        return this;
    }

    /**
     * Add ORDER BY field
     */
    orderBy(field, direction = 'ASC') {
        const dir = direction.toUpperCase();
        if (dir !== 'ASC' && dir !== 'DESC') {
            this.warnings.push(`Invalid order direction: ${direction}, using ASC`);
            direction = 'ASC';
        }

        this.orderByFields.push({ field, direction: dir });
        return this;
    }

    /**
     * Set LIMIT
     */
    limit(value) {
        if (value > 50000) {
            this.warnings.push(`LIMIT ${value} exceeds Salesforce maximum of 50000`);
            value = 50000;
        }
        this.limitValue = value;
        return this;
    }

    /**
     * Set OFFSET
     */
    offset(value) {
        if (value > 2000) {
            this.warnings.push(`OFFSET ${value} exceeds Salesforce maximum of 2000`);
            value = 2000;
        }
        this.offsetValue = value;
        return this;
    }

    /**
     * Add WITH clause for security/sharing
     */
    withSecurity() {
        this.withClauses.push('SECURITY_ENFORCED');
        return this;
    }

    withSharing() {
        this.withClauses.push('WITH SHARING');
        return this;
    }

    /**
     * Format value for SOQL
     */
    formatValue(value, fieldType = null) {
        if (value === null || value === undefined) {
            return 'null';
        }
        
        // Check if value is a date string in ISO format (YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS)
        const datePattern = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?)?$/;
        if (typeof value === 'string' && datePattern.test(value)) {
            // Date values should NOT be quoted in SOQL
            return value;
        }
        
        // Check for date literals (TODAY, YESTERDAY, THIS_WEEK, etc.)
        const dateLiterals = [
            'YESTERDAY', 'TODAY', 'TOMORROW',
            'LAST_WEEK', 'THIS_WEEK', 'NEXT_WEEK',
            'LAST_MONTH', 'THIS_MONTH', 'NEXT_MONTH',
            'LAST_90_DAYS', 'NEXT_90_DAYS',
            'THIS_QUARTER', 'LAST_QUARTER', 'NEXT_QUARTER',
            'THIS_YEAR', 'LAST_YEAR', 'NEXT_YEAR',
            'THIS_FISCAL_QUARTER', 'LAST_FISCAL_QUARTER', 'NEXT_FISCAL_QUARTER',
            'THIS_FISCAL_YEAR', 'LAST_FISCAL_YEAR', 'NEXT_FISCAL_YEAR'
        ];
        
        if (typeof value === 'string' && dateLiterals.includes(value.toUpperCase())) {
            // Date literals should NOT be quoted
            return value.toUpperCase();
        }
        
        if (typeof value === 'string') {
            // Regular strings need quotes and escaped single quotes
            return `'${value.replace(/'/g, "\\'")}'`;
        }
        
        if (typeof value === 'boolean') {
            return value ? 'true' : 'false';
        }
        
        if (value instanceof Date) {
            // Format Date object as YYYY-MM-DD without quotes
            const year = value.getFullYear();
            const month = String(value.getMonth() + 1).padStart(2, '0');
            const day = String(value.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        }
        
        // Numbers don't need quotes
        return value.toString();
    }

    /**
     * Validate the query
     */
    validate() {
        this.errors = [];
        this.warnings = [];

        // Check required components
        if (this.selectFields.length === 0) {
            this.errors.push('No SELECT fields specified');
        }

        if (!this.fromObject) {
            this.errors.push('No FROM object specified');
        }

        // Check for aggregate/grouping consistency
        const hasAggregates = this.selectFields.some(f => f.isAggregate);
        const hasNonAggregates = this.selectFields.some(f => !f.isAggregate);

        if (hasAggregates && hasNonAggregates && this.groupByFields.length === 0) {
            this.errors.push('Query with aggregates and non-aggregates requires GROUP BY');
        }

        // Check HAVING without GROUP BY
        if (this.havingConditions.length > 0 && this.groupByFields.length === 0) {
            this.errors.push('HAVING clause requires GROUP BY');
        }

        // Check for duplicate aliases
        const aliases = this.selectFields.filter(f => f.alias).map(f => f.alias);
        const duplicates = aliases.filter((a, i) => aliases.indexOf(a) !== i);
        if (duplicates.length > 0) {
            this.errors.push(`Duplicate aliases found: ${duplicates.join(', ')}`);
        }

        return this.errors.length === 0;
    }

    /**
     * Build the SOQL query string
     */
    build() {
        if (!this.validate()) {
            throw new Error(`Query validation failed: ${this.errors.join('; ')}`);
        }

        let query = 'SELECT ';

        // Build SELECT clause
        const selectParts = this.selectFields.map(f => {
            if (f.alias) {
                return `${f.field} ${f.alias}`;
            }
            return f.field;
        });
        query += selectParts.join(', ');

        // FROM clause
        query += ` FROM ${this.fromObject}`;

        // WHERE clause
        if (this.whereConditions.length > 0) {
            query += ' WHERE ';
            query += this.whereConditions.map((w, i) => {
                if (i === 0) {
                    return w.condition;
                }
                return `${w.operator} ${w.condition}`;
            }).join(' ');
        }

        // GROUP BY clause
        if (this.groupByFields.length > 0) {
            query += ' GROUP BY ' + this.groupByFields.join(', ');
        }

        // HAVING clause
        if (this.havingConditions.length > 0) {
            query += ' HAVING ' + this.havingConditions.join(' AND ');
        }

        // ORDER BY clause
        if (this.orderByFields.length > 0) {
            query += ' ORDER BY ';
            query += this.orderByFields.map(o => `${o.field} ${o.direction}`).join(', ');
        }

        // LIMIT clause
        if (this.limitValue !== null) {
            query += ` LIMIT ${this.limitValue}`;
        }

        // OFFSET clause
        if (this.offsetValue !== null) {
            query += ` OFFSET ${this.offsetValue}`;
        }

        // WITH clauses
        if (this.withClauses.length > 0) {
            query += ' ' + this.withClauses.join(' ');
        }

        return query;
    }

    /**
     * Build query for pagination (returns array of queries)
     */
    buildPaginated(pageSize = 2000) {
        const queries = [];
        let offset = 0;
        const maxOffset = 2000; // Salesforce limit

        // Store original values
        const originalLimit = this.limitValue;
        const originalOffset = this.offsetValue;

        this.limitValue = pageSize;

        while (offset <= maxOffset) {
            this.offsetValue = offset;
            queries.push({
                query: this.build(),
                offset: offset,
                limit: pageSize
            });
            
            offset += pageSize;
            
            // Stop if we've reached the original limit
            if (originalLimit && offset >= originalLimit) {
                break;
            }
        }

        // Restore original values
        this.limitValue = originalLimit;
        this.offsetValue = originalOffset;

        return queries;
    }

    /**
     * Generate query for large dataset handling
     */
    buildChunked(chunkField = 'CreatedDate', chunkSize = 10000) {
        const queries = [];
        
        // Build base query to get date range
        const rangeQuery = new SOQLQueryBuilder()
            .select('MIN(' + chunkField + ')', 'minDate')
            .select('MAX(' + chunkField + ')', 'maxDate')
            .select('COUNT(Id)', 'totalRecords')
            .from(this.fromObject)
            .build();

        queries.push({
            type: 'range',
            query: rangeQuery,
            purpose: 'Get date range for chunking'
        });

        // Note: Actual chunking would require the results from range query
        // This returns the structure for the caller to implement
        queries.push({
            type: 'chunked',
            baseQuery: this.build(),
            chunkField: chunkField,
            chunkSize: chunkSize,
            note: 'Execute range query first, then generate chunks based on results'
        });

        return queries;
    }

    /**
     * Common query patterns
     */
    static recordCount(objectName, whereClause = null) {
        const builder = new SOQLQueryBuilder()
            .count()
            .from(objectName);
        
        if (whereClause) {
            builder.where(whereClause);
        }
        
        return builder.build();
    }

    static aggregateSummary(objectName, measureField, groupField = null) {
        const builder = new SOQLQueryBuilder()
            .count('Id', 'recordCount')
            .sum(measureField)
            .avg(measureField)
            .min(measureField)
            .max(measureField)
            .from(objectName);
        
        if (groupField) {
            builder.select(groupField).groupBy(groupField);
        }
        
        return builder.build();
    }

    static recentRecords(objectName, limit = 10) {
        return new SOQLQueryBuilder()
            .select(['Id', 'Name', 'CreatedDate', 'LastModifiedDate'])
            .from(objectName)
            .orderBy('LastModifiedDate', 'DESC')
            .limit(limit)
            .build();
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SOQLQueryBuilder;
}

// CLI interface for testing
if (require.main === module) {
    const args = process.argv.slice(2);
    
    if (args.length === 0) {
        console.log('SOQL Query Builder - Usage Examples:\n');
        
        // Example 1: Fix the original error
        console.log('1. Fixed aggregation query:');
        const query1 = new SOQLQueryBuilder()
            .count('Id')
            .sum('Amount')
            .avg('Amount')
            .from('Opportunity')
            .build();
        console.log('   ' + query1 + '\n');
        
        // Example 2: Complex aggregation with grouping
        console.log('2. Aggregation with grouping:');
        const query2 = new SOQLQueryBuilder()
            .select('StageName')
            .count('Id')
            .sum('Amount', 'totalRevenue')
            .avg('Amount', 'avgDealSize')
            .from('Opportunity')
            .where('CloseDate = THIS_YEAR')
            .groupBy('StageName')
            .having('COUNT(Id) > 5')
            .orderBy('SUM(Amount)', 'DESC')
            .build();
        console.log('   ' + query2 + '\n');
        
        // Example 3: Paginated query
        console.log('3. Paginated queries for large datasets:');
        const builder = new SOQLQueryBuilder()
            .select(['Id', 'Name', 'Amount'])
            .from('Opportunity')
            .where('Amount > 10000')
            .orderBy('Amount', 'DESC');
        
        const paginatedQueries = builder.buildPaginated(1000);
        paginatedQueries.slice(0, 2).forEach((q, i) => {
            console.log(`   Page ${i + 1}: ${q.query}`);
        });
        
    } else if (args[0] === '--validate') {
        // Validate a query passed as argument
        const queryString = args.slice(1).join(' ');
        console.log(`Validating: ${queryString}`);
        console.log('Note: Direct query validation requires parsing - use builder methods instead');
    } else if (args[0] === '--fix') {
        // Attempt to fix a malformed query
        const queryString = args.slice(1).join(' ');
        console.log(`Original: ${queryString}`);
        
        // Simple fix for the common error
        if (queryString.includes('COUNT(Id) count')) {
            const fixed = queryString.replace('COUNT(Id) count', 'COUNT(Id) recordCount')
                                     .replace('SUM(Amount) total', 'SUM(Amount) totalAmount')
                                     .replace('AVG(Amount)', 'AVG(Amount) averageAmount');
            console.log(`Fixed: ${fixed}`);
        }
    }
}