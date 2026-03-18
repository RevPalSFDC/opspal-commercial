#!/usr/bin/env node

/**
 * Salesforce Query Performance & Limits Monitor
 * 
 * Monitors API usage, query performance, and automatically switches to Bulk API for large datasets.
 * Implements exponential backoff and provides real-time governance tracking.
 * 
 * Features:
 * - Read Sforce-Limit-Info headers from every API call
 * - Use EXPLAIN for query planning and optimization
 * - Auto-switch to Bulk API 2.0 for queries > 10k records
 * - Track API usage per operation
 * - Implement exponential backoff on rate limits
 */

const https = require('https');
const url = require('url');
const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

class QueryMonitor {
    constructor(instanceUrl, accessToken) {
        this.instanceUrl = instanceUrl;
        this.accessToken = accessToken;
        this.apiVersion = 'v64.0';
        
        // Limits tracking
        this.limits = {
            daily: {},
            concurrent: {},
            lastUpdated: null
        };
        
        // Performance metrics
        this.metrics = {
            queries: [],
            apiCalls: [],
            errors: []
        };
        
        // Configuration
        this.config = {
            bulkThreshold: 10000,        // Switch to Bulk API above this
            maxRetries: 3,                // Max retry attempts
            initialBackoff: 1000,         // Initial backoff in ms
            maxBackoff: 32000,            // Max backoff in ms
            warningThreshold: 0.8,        // Warn at 80% limit usage
            criticalThreshold: 0.95,      // Critical at 95% limit usage
            metricsRetention: 3600000     // Keep metrics for 1 hour
        };
        
        // Query plan cache
        this.queryPlanCache = new Map();
        
        // Start periodic limits refresh
        this.startLimitsMonitoring();
    }

    /**
     * Initialize from SF CLI authentication
     */
    static async fromSFAuth(orgAlias) {
        const authCmd = `sf org display --json${orgAlias ? ` --target-org ${orgAlias}` : ''}`;
        const result = await execAsync(authCmd);
        const authData = JSON.parse(result.stdout);
        
        if (!authData.result || !authData.result.accessToken) {
            throw new Error('Failed to get SF authentication');
        }

        return new QueryMonitor(
            authData.result.instanceUrl,
            authData.result.accessToken
        );
    }

    /**
     * Execute SOQL query with performance monitoring
     */
    async query(soql, options = {}) {
        const startTime = Date.now();
        
        // Check if query needs optimization
        const queryPlan = await this.explainQuery(soql);
        
        // Estimate result size
        const estimatedRows = this.estimateResultSize(queryPlan);
        
        // Decide execution strategy
        if (estimatedRows > this.config.bulkThreshold && !options.forceSynchronous) {
            console.log(`Query estimated to return ${estimatedRows} rows. Switching to Bulk API...`);
            return this.bulkQuery(soql, options);
        }
        
        // Execute synchronous query with paging
        const results = await this.executeQueryWithPaging(soql, options);
        
        // Record metrics
        this.recordQueryMetrics({
            query: soql,
            duration: Date.now() - startTime,
            rowCount: results.length,
            method: 'synchronous',
            timestamp: new Date().toISOString()
        });
        
        return results;
    }

    /**
     * Explain query plan
     */
    async explainQuery(soql) {
        // Check cache first
        const cacheKey = this.hashQuery(soql);
        if (this.queryPlanCache.has(cacheKey)) {
            return this.queryPlanCache.get(cacheKey);
        }
        
        try {
            const explainUrl = `/services/data/${this.apiVersion}/query?explain=${encodeURIComponent(soql)}`;
            const response = await this.makeRequest(explainUrl, 'GET');
            
            const plan = response.plans[0];
            
            // Cache the plan
            this.queryPlanCache.set(cacheKey, plan);
            
            // Analyze plan for optimization opportunities
            this.analyzeQueryPlan(plan, soql);
            
            return plan;
        } catch (error) {
            console.warn('Failed to explain query:', error.message);
            return null;
        }
    }

    /**
     * Analyze query plan for optimization opportunities
     */
    analyzeQueryPlan(plan, soql) {
        if (!plan) return;
        
        const warnings = [];
        
        // Check for table scans
        if (plan.leadingOperationType === 'TableScan') {
            warnings.push('Query performing full table scan - consider adding selective filters');
        }
        
        // Check cardinality
        if (plan.cardinality > 50000) {
            warnings.push(`High cardinality (${plan.cardinality}) - consider using Bulk API`);
        }
        
        // Check for non-selective filters
        if (plan.relativeCost > 1) {
            warnings.push(`High relative cost (${plan.relativeCost}) - query may be expensive`);
        }
        
        // Check for missing indexes
        if (plan.fields && plan.fields.some(f => !f.indexed && f.filterUsed)) {
            warnings.push('Query filtering on non-indexed fields');
        }
        
        if (warnings.length > 0) {
            console.warn('Query optimization warnings:');
            warnings.forEach(w => console.warn(`  - ${w}`));
            console.warn('Query:', soql.substring(0, 100) + '...');
        }
    }

    /**
     * Estimate result size from query plan
     */
    estimateResultSize(plan) {
        if (!plan) return 0;
        return plan.cardinality || 0;
    }

    /**
     * Execute query with automatic paging
     */
    async executeQueryWithPaging(soql, options = {}) {
        const results = [];
        let nextUrl = null;
        let done = false;
        
        const initialUrl = `/services/data/${this.apiVersion}/query?q=${encodeURIComponent(soql)}`;
        
        // First request
        const firstResponse = await this.makeRequestWithRetry(initialUrl, 'GET');
        results.push(...(firstResponse.records || []));
        done = firstResponse.done;
        nextUrl = firstResponse.nextRecordsUrl;
        
        // Page through results
        while (!done && nextUrl) {
            const response = await this.makeRequestWithRetry(nextUrl, 'GET');
            results.push(...(response.records || []));
            done = response.done;
            nextUrl = response.nextRecordsUrl;
            
            // Check if we should switch to Bulk API
            if (results.length > this.config.bulkThreshold && !options.forceSynchronous) {
                console.warn(`Query returned ${results.length} rows and still paging. Consider using Bulk API.`);
            }
        }
        
        return results;
    }

    /**
     * Execute bulk query for large datasets
     */
    async bulkQuery(soql, options = {}) {
        const startTime = Date.now();
        
        try {
            // Create bulk query job
            const jobResponse = await this.makeRequest(
                `/services/data/${this.apiVersion}/jobs/query`,
                'POST',
                {
                    operation: 'query',
                    query: soql,
                    contentType: 'CSV',
                    columnDelimiter: 'COMMA',
                    lineEnding: 'LF'
                }
            );
            
            const jobId = jobResponse.id;
            console.log(`Bulk query job created: ${jobId}`);
            
            // Poll for completion
            let jobInfo;
            let attempts = 0;
            const maxAttempts = 120; // 2 minutes max wait
            
            do {
                await this.sleep(1000); // Wait 1 second between polls
                jobInfo = await this.makeRequest(
                    `/services/data/${this.apiVersion}/jobs/query/${jobId}`,
                    'GET'
                );
                attempts++;
            } while (jobInfo.state === 'InProgress' && attempts < maxAttempts);
            
            if (jobInfo.state !== 'JobComplete') {
                throw new Error(`Bulk query failed: ${jobInfo.state} - ${jobInfo.stateMessage}`);
            }
            
            // Get results
            const resultsResponse = await this.makeRequest(
                `/services/data/${this.apiVersion}/jobs/query/${jobId}/results`,
                'GET',
                null,
                { Accept: 'text/csv' }
            );
            
            // Parse CSV results
            const results = this.parseCSV(resultsResponse);
            
            // Record metrics
            this.recordQueryMetrics({
                query: soql,
                duration: Date.now() - startTime,
                rowCount: results.length,
                method: 'bulk',
                jobId,
                timestamp: new Date().toISOString()
            });
            
            return results;
            
        } catch (error) {
            console.error('Bulk query failed:', error.message);
            throw error;
        }
    }

    /**
     * Get current org limits
     */
    async getLimits() {
        const response = await this.makeRequest(
            `/services/data/${this.apiVersion}/limits`,
            'GET'
        );
        
        this.limits.daily = response;
        this.limits.lastUpdated = new Date().toISOString();
        
        // Check for warnings
        this.checkLimitWarnings();
        
        return response;
    }

    /**
     * Parse Sforce-Limit-Info header
     */
    parseLimitHeader(headerValue) {
        if (!headerValue) return {};
        
        const limits = {};
        const parts = headerValue.split(',');
        
        parts.forEach(part => {
            const [key, value] = part.trim().split('=');
            if (key && value) {
                const [used, max] = value.split('/');
                limits[key] = {
                    used: parseInt(used, 10),
                    max: parseInt(max, 10),
                    percentage: (parseInt(used, 10) / parseInt(max, 10)) * 100
                };
            }
        });
        
        return limits;
    }

    /**
     * Check for limit warnings
     */
    checkLimitWarnings() {
        const warnings = [];
        const critical = [];
        
        for (const [limitName, limitData] of Object.entries(this.limits.daily)) {
            if (limitData.Max && limitData.Remaining !== undefined) {
                const used = limitData.Max - limitData.Remaining;
                const percentage = (used / limitData.Max);
                
                if (percentage >= this.config.criticalThreshold) {
                    critical.push({
                        limit: limitName,
                        used,
                        max: limitData.Max,
                        percentage: (percentage * 100).toFixed(1)
                    });
                } else if (percentage >= this.config.warningThreshold) {
                    warnings.push({
                        limit: limitName,
                        used,
                        max: limitData.Max,
                        percentage: (percentage * 100).toFixed(1)
                    });
                }
            }
        }
        
        if (critical.length > 0) {
            console.error('🚨 CRITICAL: Approaching API limits:');
            critical.forEach(c => {
                console.error(`  ${c.limit}: ${c.used}/${c.max} (${c.percentage}%)`);
            });
        }
        
        if (warnings.length > 0) {
            console.warn('⚠️  WARNING: High API usage:');
            warnings.forEach(w => {
                console.warn(`  ${w.limit}: ${w.used}/${w.max} (${w.percentage}%)`);
            });
        }
        
        return { warnings, critical };
    }

    /**
     * Make HTTP request with retry and backoff
     */
    async makeRequestWithRetry(endpoint, method, data = null, headers = {}, retryCount = 0) {
        try {
            const response = await this.makeRequest(endpoint, method, data, headers);
            return response;
        } catch (error) {
            // Check if we should retry
            if (this.shouldRetry(error, retryCount)) {
                const backoff = this.calculateBackoff(retryCount);
                console.log(`Request failed, retrying in ${backoff}ms... (attempt ${retryCount + 1}/${this.config.maxRetries})`);
                
                await this.sleep(backoff);
                return this.makeRequestWithRetry(endpoint, method, data, headers, retryCount + 1);
            }
            
            throw error;
        }
    }

    /**
     * Determine if request should be retried
     */
    shouldRetry(error, retryCount) {
        if (retryCount >= this.config.maxRetries) {
            return false;
        }
        
        // Retry on rate limits and temporary errors
        const retryableCodes = [429, 503, 504, 522, 524];
        const statusCode = error.statusCode || (error.message && error.message.match(/\((\d+)\)/)?.[1]);
        
        return retryableCodes.includes(parseInt(statusCode, 10));
    }

    /**
     * Calculate exponential backoff
     */
    calculateBackoff(retryCount) {
        const backoff = Math.min(
            this.config.initialBackoff * Math.pow(2, retryCount),
            this.config.maxBackoff
        );
        
        // Add jitter to prevent thundering herd
        const jitter = Math.random() * 0.3 * backoff;
        
        return Math.floor(backoff + jitter);
    }

    /**
     * Make HTTP request to Salesforce
     */
    makeRequest(endpoint, method, data = null, additionalHeaders = {}) {
        return new Promise((resolve, reject) => {
            const parsedUrl = url.parse(this.instanceUrl);
            const fullPath = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
            
            const options = {
                hostname: parsedUrl.hostname,
                port: parsedUrl.port || 443,
                path: fullPath,
                method: method,
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    ...additionalHeaders
                }
            };

            const req = https.request(options, (res) => {
                let responseData = '';

                res.on('data', (chunk) => {
                    responseData += chunk;
                });

                res.on('end', () => {
                    // Parse limit header
                    const limitHeader = res.headers['sforce-limit-info'];
                    if (limitHeader) {
                        this.limits.concurrent = this.parseLimitHeader(limitHeader);
                        this.checkLimitWarnings();
                    }
                    
                    // Record API call
                    this.recordApiCall({
                        endpoint: fullPath,
                        method,
                        statusCode: res.statusCode,
                        limits: this.limits.concurrent,
                        timestamp: new Date().toISOString()
                    });
                    
                    try {
                        const result = additionalHeaders.Accept === 'text/csv' 
                            ? responseData 
                            : JSON.parse(responseData);
                        
                        if (res.statusCode >= 200 && res.statusCode < 300) {
                            resolve(result);
                        } else {
                            const error = new Error(`API Error (${res.statusCode}): ${JSON.stringify(result)}`);
                            error.statusCode = res.statusCode;
                            reject(error);
                        }
                    } catch (e) {
                        reject(new Error(`Failed to parse response: ${responseData}`));
                    }
                });
            });

            req.on('error', reject);

            if (data) {
                req.write(JSON.stringify(data));
            }

            req.end();
        });
    }

    /**
     * Start periodic limits monitoring
     */
    startLimitsMonitoring() {
        // Refresh limits every 5 minutes
        setInterval(() => {
            this.getLimits().catch(err => {
                console.error('Failed to refresh limits:', err.message);
            });
        }, 300000);
        
        // Clean old metrics every hour
        setInterval(() => {
            this.cleanOldMetrics();
        }, 3600000);
        
        // Initial limits fetch
        this.getLimits().catch(err => {
            console.error('Failed to get initial limits:', err.message);
        });
    }

    /**
     * Record query metrics
     */
    recordQueryMetrics(metrics) {
        this.metrics.queries.push(metrics);
        
        // Keep only recent metrics
        const cutoff = Date.now() - this.config.metricsRetention;
        this.metrics.queries = this.metrics.queries.filter(
            q => new Date(q.timestamp).getTime() > cutoff
        );
    }

    /**
     * Record API call metrics
     */
    recordApiCall(metrics) {
        this.metrics.apiCalls.push(metrics);
        
        // Keep only recent metrics
        const cutoff = Date.now() - this.config.metricsRetention;
        this.metrics.apiCalls = this.metrics.apiCalls.filter(
            a => new Date(a.timestamp).getTime() > cutoff
        );
    }

    /**
     * Clean old metrics
     */
    cleanOldMetrics() {
        const cutoff = Date.now() - this.config.metricsRetention;
        
        this.metrics.queries = this.metrics.queries.filter(
            q => new Date(q.timestamp).getTime() > cutoff
        );
        
        this.metrics.apiCalls = this.metrics.apiCalls.filter(
            a => new Date(a.timestamp).getTime() > cutoff
        );
        
        this.metrics.errors = this.metrics.errors.filter(
            e => new Date(e.timestamp).getTime() > cutoff
        );
    }

    /**
     * Get performance report
     */
    getPerformanceReport() {
        const report = {
            summary: {
                totalQueries: this.metrics.queries.length,
                totalApiCalls: this.metrics.apiCalls.length,
                totalErrors: this.metrics.errors.length,
                averageQueryTime: this.calculateAverage(this.metrics.queries, 'duration'),
                totalRows: this.metrics.queries.reduce((sum, q) => sum + (q.rowCount || 0), 0)
            },
            limits: this.limits,
            topQueries: this.getTopQueries(),
            apiUsage: this.getApiUsageByEndpoint(),
            recommendations: this.generateRecommendations()
        };
        
        return report;
    }

    /**
     * Get top queries by duration
     */
    getTopQueries() {
        return [...this.metrics.queries]
            .sort((a, b) => b.duration - a.duration)
            .slice(0, 10)
            .map(q => ({
                query: q.query.substring(0, 100) + '...',
                duration: q.duration,
                rows: q.rowCount,
                method: q.method
            }));
    }

    /**
     * Get API usage by endpoint
     */
    getApiUsageByEndpoint() {
        const usage = {};
        
        this.metrics.apiCalls.forEach(call => {
            const endpoint = call.endpoint.split('?')[0];
            if (!usage[endpoint]) {
                usage[endpoint] = { count: 0, errors: 0 };
            }
            usage[endpoint].count++;
            if (call.statusCode >= 400) {
                usage[endpoint].errors++;
            }
        });
        
        return usage;
    }

    /**
     * Generate performance recommendations
     */
    generateRecommendations() {
        const recommendations = [];
        
        // Check for slow queries
        const slowQueries = this.metrics.queries.filter(q => q.duration > 5000);
        if (slowQueries.length > 0) {
            recommendations.push({
                type: 'performance',
                message: `${slowQueries.length} slow queries detected (>5s). Consider optimization.`,
                severity: 'warning'
            });
        }
        
        // Check for large result sets
        const largeQueries = this.metrics.queries.filter(q => q.rowCount > 5000);
        if (largeQueries.length > 0) {
            recommendations.push({
                type: 'performance',
                message: `${largeQueries.length} queries returned >5000 rows. Consider using Bulk API.`,
                severity: 'info'
            });
        }
        
        // Check API limits
        const { warnings, critical } = this.checkLimitWarnings();
        if (critical.length > 0) {
            recommendations.push({
                type: 'limits',
                message: 'Critical API limit usage detected. Reduce API calls immediately.',
                severity: 'critical'
            });
        }
        
        return recommendations;
    }

    /**
     * Utility functions
     */
    
    hashQuery(query) {
        // Simple hash for caching
        let hash = 0;
        for (let i = 0; i < query.length; i++) {
            const char = query.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return hash.toString(36);
    }

    calculateAverage(array, field) {
        if (array.length === 0) return 0;
        const sum = array.reduce((acc, item) => acc + (item[field] || 0), 0);
        return Math.round(sum / array.length);
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    parseCSV(csv) {
        const lines = csv.split('\n');
        const headers = lines[0].split(',').map(h => h.trim());
        const results = [];
        
        for (let i = 1; i < lines.length; i++) {
            if (lines[i].trim()) {
                const values = lines[i].split(',');
                const record = {};
                headers.forEach((header, index) => {
                    record[header] = values[index]?.trim();
                });
                results.push(record);
            }
        }
        
        return results;
    }
}

// Export for use in other modules
module.exports = QueryMonitor;

// CLI interface
if (require.main === module) {
    const args = process.argv.slice(2);
    
    if (args.length === 0) {
        console.log(`
Salesforce Query Performance Monitor

Usage:
  node query-monitor.js <command> [options]

Commands:
  query <soql>         Execute query with monitoring
  explain <soql>       Explain query plan
  limits               Get current org limits
  report               Generate performance report
  monitor              Start interactive monitoring

Options:
  --org <alias>        Target org alias
  --bulk               Force bulk API usage
  --sync               Force synchronous execution
  --output <file>      Output file (default: stdout)

Examples:
  node query-monitor.js query "SELECT Id, Name FROM Account" --org myorg
  node query-monitor.js explain "SELECT Id FROM Contact WHERE Email != null"
  node query-monitor.js limits --org production
  node query-monitor.js report --output performance.json
        `);
        process.exit(0);
    }

    const command = args[0];
    const orgAlias = args.includes('--org') ? args[args.indexOf('--org') + 1] : null;
    const outputFile = args.includes('--output') ? args[args.indexOf('--output') + 1] : null;

    (async () => {
        try {
            const monitor = await QueryMonitor.fromSFAuth(orgAlias);
            let result;

            switch (command) {
                case 'query': {
                    const soql = args[1];
                    if (!soql) throw new Error('SOQL query required');
                    
                    const options = {
                        forceBulk: args.includes('--bulk'),
                        forceSynchronous: args.includes('--sync')
                    };
                    
                    result = await monitor.query(soql, options);
                    break;
                }

                case 'explain': {
                    const soql = args[1];
                    if (!soql) throw new Error('SOQL query required');
                    
                    result = await monitor.explainQuery(soql);
                    break;
                }

                case 'limits': {
                    result = await monitor.getLimits();
                    break;
                }

                case 'report': {
                    result = monitor.getPerformanceReport();
                    break;
                }

                case 'monitor': {
                    console.log('Starting interactive monitoring...');
                    console.log('Press Ctrl+C to stop\n');
                    
                    // Display limits every 10 seconds
                    setInterval(async () => {
                        const limits = await monitor.getLimits();
                        console.clear();
                        console.log('=== Salesforce API Limits ===');
                        console.log(new Date().toLocaleString());
                        console.log('');
                        
                        for (const [name, data] of Object.entries(limits)) {
                            if (data.Max) {
                                const used = data.Max - data.Remaining;
                                const percentage = ((used / data.Max) * 100).toFixed(1);
                                const bar = '█'.repeat(Math.floor(percentage / 5)) + '░'.repeat(20 - Math.floor(percentage / 5));
                                
                                console.log(`${name.padEnd(25)} ${bar} ${percentage}% (${used}/${data.Max})`);
                            }
                        }
                        
                        const report = monitor.getPerformanceReport();
                        console.log('\n=== Performance Metrics ===');
                        console.log(`Queries: ${report.summary.totalQueries}`);
                        console.log(`API Calls: ${report.summary.totalApiCalls}`);
                        console.log(`Avg Query Time: ${report.summary.averageQueryTime}ms`);
                        console.log(`Total Rows: ${report.summary.totalRows}`);
                        
                        if (report.recommendations.length > 0) {
                            console.log('\n=== Recommendations ===');
                            report.recommendations.forEach(rec => {
                                const icon = rec.severity === 'critical' ? '🚨' : 
                                           rec.severity === 'warning' ? '⚠️' : 'ℹ️';
                                console.log(`${icon} ${rec.message}`);
                            });
                        }
                    }, 10000);
                    
                    // Keep process running
                    await new Promise(() => {});
                    break;
                }

                default:
                    throw new Error(`Unknown command: ${command}`);
            }

            const output = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
            
            if (outputFile) {
                await fs.writeFile(outputFile, output);
                console.log(`Output written to ${outputFile}`);
            } else {
                console.log(output);
            }

        } catch (error) {
            console.error('Error:', error.message);
            if (error.stack && process.env.DEBUG) {
                console.error(error.stack);
            }
            process.exit(1);
        }
    })();
}