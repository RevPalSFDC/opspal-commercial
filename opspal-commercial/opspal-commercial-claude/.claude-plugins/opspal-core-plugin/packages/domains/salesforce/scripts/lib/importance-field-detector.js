#!/usr/bin/env node
/**
 * Importance Field Detector
 *
 * Purpose: Instance-agnostic detection of "importance" fields for deduplication
 * survivor selection. Automatically discovers fields that indicate account priority,
 * customer status, revenue, and integration IDs without hardcoding field names.
 *
 * Key Features:
 * - Pattern-based field detection (Type, Status, Stage, Category, Revenue)
 * - Picklist value analysis for importance keywords
 * - Integration ID field detection (externalId flag, ID patterns)
 * - Relationship count analysis (Contacts, Opportunities, Cases)
 * - B2G/PropTech adaptations (reduced domain matching weight)
 * - Configurable scoring weights
 *
 * Usage:
 *   node importance-field-detector.js Account rentable-production
 *   node importance-field-detector.js Account rentable-production --verbose
 *   node importance-field-detector.js Account rentable-production --output-format json
 *
 * Output:
 *   - Field importance scores (0-100)
 *   - Suggested weights for survivor selection
 *   - Importance field map (JSON)
 *   - Picklist value insights
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class ImportanceFieldDetector {
    constructor(options = {}) {
        this.sobject = options.sobject || 'Account';
        this.orgAlias = options.orgAlias;
        this.verbose = options.verbose || false;
        this.outputFormat = options.outputFormat || 'table'; // table, json, markdown
        this.outputDir = options.outputDir || './field-importance-reports';

        // P0 Enhancement: ENOBUFS retry configuration
        this.maxRetries = options.maxRetries || 3;
        this.retryDelay = options.retryDelay || 5000; // 5 seconds base delay
        this.processPool = options.processPool || 5; // Max concurrent processes (not used yet)

        // P1 Enhancement: Cache configuration
        this.enableCache = options.enableCache !== false; // Default true
        this.cacheTTL = options.cacheTTL || 24 * 60 * 60 * 1000; // 24 hours in milliseconds
        this.cacheDir = path.join(this.outputDir, '.cache');

        // Field pattern categories (instance-agnostic, spec-compliant v2)
        // Patterns aligned with spec regex:
        //   Status: /stage|lifecycle|status|customer|subscription|tier|segment|type/
        //   Revenue: /revenue|arr|mrr|acv|tcv|bookings|invoice|amount|spend/
        //   Integration: /external.?id|integration|erp|billing|invoice|account.?id|stripe|netsuite|quick.?books|sap|zendesk/
        this.fieldPatterns = {
            customerType: {
                patterns: [/type/i, /category/i, /classification/i, /segment/i, /tier/i],
                weight: 90,
                description: 'Customer type/classification fields'
            },
            customerStatus: {
                patterns: [/status/i, /state/i, /stage/i, /phase/i, /lifecycle/i, /subscription/i, /customer/i],
                weight: 95,
                description: 'Customer status/stage/subscription fields'
            },
            revenue: {
                patterns: [/revenue/i, /mrr/i, /arr/i, /acv/i, /tcv/i, /value/i, /amount/i, /bookings/i, /invoice/i, /spend/i],
                weight: 85,
                description: 'Revenue indicator fields'
            },
            integrationId: {
                patterns: [
                    /id$/i, /_id$/i, /identifier/i,
                    /external.?id/i, /integration/i,
                    /erp/i, /billing/i, /account.?id/i,
                    /stripe/i, /netsuite/i, /quick.?books/i, /sap/i, /zendesk/i
                ],
                weight: 100,
                description: 'Integration ID fields (ERP, billing, external systems)'
            },
            ownership: {
                patterns: [/owner/i, /assigned/i, /manager/i],
                weight: 60,
                description: 'Ownership fields'
            },
            contact: {
                patterns: [/email/i, /phone/i, /contact/i],
                weight: 50,
                description: 'Contact information fields'
            },
            location: {
                patterns: [/city/i, /state/i, /country/i, /region/i, /territory/i],
                weight: 40,
                description: 'Location fields'
            }
        };

        // Importance keywords for picklist value analysis (spec-compliant v2)
        // Aligned with spec's synonym sets:
        //   activeCustomerSynonyms: active, current, customer, client, paying, live, subscribed
        //   prospectSynonyms: prospect, lead, trial, evaluation
        //   formerSynonyms: former, ex, churned, cancelled, canceled, inactive
        this.importanceKeywords = {
            high: ['customer', 'active', 'paying', 'premium', 'enterprise', 'platinum', 'gold', 'current', 'client', 'live', 'subscribed'],
            medium: ['prospect', 'qualified', 'engaged', 'silver', 'trial', 'evaluation'],
            low: ['lead', 'cold', 'inactive', 'churned', 'bronze', 'suspended', 'former', 'ex', 'cancelled', 'canceled']
        };

        // B2G/PropTech adaptations
        this.sectorAdaptations = {
            proptech: {
                genericNamePatterns: [/housing authority/i, /city of/i, /county of/i, /chamber of/i],
                reduceFieldWeights: { location: 0.5 }, // Reduce location matching importance
                description: 'PropTech sector adaptations'
            },
            b2g: {
                genericNamePatterns: [/department of/i, /ministry of/i, /government/i, /municipality/i],
                reduceFieldWeights: { location: 0.5 },
                description: 'B2G sector adaptations'
            }
        };

        // Ensure output directory exists
        if (!fs.existsSync(this.outputDir)) {
            fs.mkdirSync(this.outputDir, { recursive: true });
        }

        // P1 Enhancement: Ensure cache directory exists
        if (this.enableCache && !fs.existsSync(this.cacheDir)) {
            fs.mkdirSync(this.cacheDir, { recursive: true });
        }
    }

    /**
     * P0 Enhancement: Sleep helper for retry delays
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * P1 Enhancement: Generate cache key based on org, sobject, and field metadata hash
     */
    getCacheKey(fieldCount) {
        // Cache key: org-sobject-fieldCount
        // Field count serves as a simple versioning mechanism
        // If fields change (add/remove), field count changes -> new cache key
        const key = `${this.orgAlias}-${this.sobject}-${fieldCount}`;
        const hash = crypto.createHash('md5').update(key).digest('hex');
        return `importance-${hash}.json`;
    }

    /**
     * P1 Enhancement: Check if cache is valid (exists and not expired)
     */
    isCacheValid(cacheFile) {
        if (!this.enableCache) {
            return false;
        }

        const cachePath = path.join(this.cacheDir, cacheFile);

        if (!fs.existsSync(cachePath)) {
            return false;
        }

        try {
            const stats = fs.statSync(cachePath);
            const age = Date.now() - stats.mtimeMs;

            if (age > this.cacheTTL) {
                this.log(`Cache expired (age: ${Math.round(age / 1000 / 60)} minutes, TTL: ${this.cacheTTL / 1000 / 60} minutes)`, 'INFO');
                return false;
            }

            this.log(`Cache valid (age: ${Math.round(age / 1000 / 60)} minutes)`, 'SUCCESS');
            return true;

        } catch (error) {
            this.log(`Cache check failed: ${error.message}`, 'WARN');
            return false;
        }
    }

    /**
     * P1 Enhancement: Load results from cache
     */
    loadFromCache(cacheFile) {
        try {
            const cachePath = path.join(this.cacheDir, cacheFile);
            const data = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));

            console.log(`\n💾 Loaded from cache: ${cacheFile}`);
            console.log(`   Cache age: ${Math.round((Date.now() - data.cachedAt) / 1000 / 60)} minutes`);
            console.log(`   Original detection: ${new Date(data.originalTimestamp).toISOString()}`);

            return data.result;

        } catch (error) {
            this.log(`Failed to load from cache: ${error.message}`, 'ERROR');
            return null;
        }
    }

    /**
     * P1 Enhancement: Save results to cache
     */
    saveToCache(cacheFile, result) {
        if (!this.enableCache) {
            return;
        }

        try {
            const cachePath = path.join(this.cacheDir, cacheFile);
            const cacheData = {
                cacheKey: cacheFile,
                cachedAt: Date.now(),
                originalTimestamp: new Date().toISOString(),
                ttl: this.cacheTTL,
                org: this.orgAlias,
                sobject: this.sobject,
                result: result
            };

            fs.writeFileSync(cachePath, JSON.stringify(cacheData, null, 2));
            this.log(`Saved to cache: ${cachePath}`, 'SUCCESS');

        } catch (error) {
            this.log(`Failed to save to cache: ${error.message}`, 'WARN');
            // Don't throw - caching is optional
        }
    }

    /**
     * P0 Enhancement: Log method with timestamp
     */
    log(message, level = 'INFO') {
        const timestamp = new Date().toISOString();
        const prefix = {
            'INFO': 'ℹ',
            'WARN': '⚠️',
            'ERROR': '❌',
            'SUCCESS': '✅'
        }[level] || 'ℹ';

        if (level === 'INFO' && !this.verbose) {
            return; // Skip verbose logs unless verbose mode enabled
        }

        console.log(`${prefix} [${timestamp}] ${message}`);
    }

    /**
     * Main detection method (with P1 caching enhancement)
     */
    async detectImportanceFields() {
        console.log('\n🔍 Importance Field Detector');
        console.log('═'.repeat(70));
        console.log(`Object: ${this.sobject}`);
        console.log(`Org: ${this.orgAlias}`);
        console.log('');

        try {
            // Step 1: Get all fields for the object
            console.log('📋 Step 1: Retrieving field metadata...');
            const fields = await this.getObjectFields();
            console.log(`  ✅ Retrieved ${fields.length} fields\n`);

            // P1 Enhancement: Check cache before analysis
            const cacheKey = this.getCacheKey(fields.length);
            if (this.isCacheValid(cacheKey)) {
                const cachedResult = this.loadFromCache(cacheKey);
                if (cachedResult) {
                    console.log('✅ Detection complete (from cache)!');
                    console.log('═'.repeat(70));
                    return cachedResult;
                }
            }

            // Step 2: Analyze fields for importance patterns
            console.log('🔎 Step 2: Analyzing field patterns...');
            const analyzedFields = await this.analyzeFields(fields);
            console.log(`  ✅ Analyzed ${analyzedFields.length} fields\n`);

            // Step 3: Detect integration ID fields
            console.log('🔗 Step 3: Detecting integration ID fields...');
            const integrationIdFields = this.detectIntegrationIds(analyzedFields);
            console.log(`  ✅ Found ${integrationIdFields.length} integration ID fields\n`);

            // Step 4: Analyze picklist values for importance keywords
            console.log('📊 Step 4: Analyzing picklist values...');
            const picklistAnalysis = await this.analyzePicklistValues(analyzedFields);
            console.log(`  ✅ Analyzed ${picklistAnalysis.length} picklist fields\n`);

            // Step 5: Calculate field importance scores
            console.log('⚖️  Step 5: Calculating importance scores...');
            const scoredFields = this.calculateImportanceScores(analyzedFields, integrationIdFields, picklistAnalysis);
            console.log(`  ✅ Scored ${scoredFields.length} fields\n`);

            // Step 6: Generate suggested weights for survivor selection
            console.log('🎯 Step 6: Generating survivor selection weights...');
            const suggestedWeights = this.generateSurvivorWeights(scoredFields);
            console.log(`  ✅ Generated ${Object.keys(suggestedWeights).length} weight categories\n`);

            // Step 7: Generate and save report
            const report = this.generateReport({
                sobject: this.sobject,
                orgAlias: this.orgAlias,
                totalFields: fields.length,
                scoredFields,
                integrationIdFields,
                picklistAnalysis,
                suggestedWeights
            });

            this.saveReport(report);

            console.log('✅ Detection complete!');
            console.log('═'.repeat(70));

            const result = {
                scoredFields,
                integrationIdFields,
                picklistAnalysis,
                suggestedWeights,
                report
            };

            // P1 Enhancement: Save to cache for future runs
            this.saveToCache(cacheKey, result);

            return result;

        } catch (error) {
            console.error('\n❌ Detection failed:', error.message);
            throw error;
        }
    }

    /**
     * Get all fields for the object using sf CLI (with P0 ENOBUFS retry logic)
     */
    async getObjectFields() {
        let lastError = null;

        for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
            try {
                this.log(`Attempting field retrieval (attempt ${attempt}/${this.maxRetries})`, 'INFO');
                return await this.getObjectFieldsInternal();

            } catch (error) {
                lastError = error;

                // Check if error is ENOBUFS (resource limit)
                const isResourceError = error.message.includes('ENOBUFS') ||
                                       error.message.includes('ENOMEM') ||
                                       error.message.includes('too many open files');

                if (isResourceError && attempt < this.maxRetries) {
                    // Exponential backoff: delay increases with each attempt
                    const delay = this.retryDelay * attempt;
                    this.log(`Resource limit hit (ENOBUFS), retrying in ${delay}ms (attempt ${attempt}/${this.maxRetries})`, 'WARN');
                    await this.sleep(delay);
                } else if (attempt < this.maxRetries) {
                    // Non-resource error, retry with shorter delay
                    const delay = this.retryDelay;
                    this.log(`Field retrieval failed: ${error.message}, retrying in ${delay}ms`, 'WARN');
                    await this.sleep(delay);
                } else {
                    // Final attempt failed
                    this.log(`Field retrieval failed after ${this.maxRetries} attempts`, 'ERROR');
                    throw error;
                }
            }
        }

        throw lastError;
    }

    /**
     * Internal method: Get all fields for the object using sf CLI
     */
    async getObjectFieldsInternal() {
        try {
            const cmd = `sf sobject describe --sobject ${this.sobject} --json --target-org ${this.orgAlias}`;
            const result = execSync(cmd, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
            const data = JSON.parse(result);

            if (data.status !== 0 || !data.result || !data.result.fields) {
                throw new Error('Failed to retrieve field information');
            }

            this.log('Field retrieval successful', 'SUCCESS');

            return data.result.fields.map(field => ({
                name: field.name,
                label: field.label,
                type: field.type,
                length: field.length,
                required: field.nillable === false,
                unique: field.unique || false,
                externalId: field.externalId || false,
                custom: field.custom || false,
                picklistValues: field.picklistValues || [],
                referenceTo: field.referenceTo || [],
                calculated: field.calculated || false,
                createdDate: field.createdDate
            }));

        } catch (error) {
            throw new Error(`Failed to get fields: ${error.message}`);
        }
    }

    /**
     * Analyze fields for importance patterns
     */
    async analyzeFields(fields) {
        const analyzed = [];

        for (const field of fields) {
            const analysis = {
                ...field,
                importanceCategories: [],
                patternMatches: []
            };

            // Check field name against all patterns
            for (const [category, config] of Object.entries(this.fieldPatterns)) {
                for (const pattern of config.patterns) {
                    if (pattern.test(field.name) || pattern.test(field.label)) {
                        analysis.importanceCategories.push(category);
                        analysis.patternMatches.push({
                            category,
                            pattern: pattern.toString(),
                            baseWeight: config.weight,
                            description: config.description
                        });
                        break; // Only count first match per category
                    }
                }
            }

            analyzed.push(analysis);
        }

        return analyzed;
    }

    /**
     * Detect integration ID fields (externalId flag or ID patterns)
     */
    detectIntegrationIds(fields) {
        const integrationIds = [];

        for (const field of fields) {
            // High confidence: externalId flag is set
            if (field.externalId) {
                integrationIds.push({
                    name: field.name,
                    label: field.label,
                    confidence: 'high',
                    reason: 'externalId flag set',
                    importance: 100
                });
                continue;
            }

            // Medium confidence: Name pattern matches ID convention
            if (field.name.toLowerCase().includes('id') &&
                !field.name.toLowerCase().startsWith('id') && // Exclude Salesforce Id
                field.type !== 'reference') { // Exclude lookups

                integrationIds.push({
                    name: field.name,
                    label: field.label,
                    confidence: 'medium',
                    reason: 'ID naming pattern',
                    importance: 80
                });
            }
        }

        return integrationIds;
    }

    /**
     * Analyze picklist values for importance keywords
     */
    async analyzePicklistValues(fields) {
        const picklistFields = fields.filter(f => f.picklistValues && f.picklistValues.length > 0);
        const analysis = [];

        for (const field of picklistFields) {
            const valueAnalysis = {
                fieldName: field.name,
                fieldLabel: field.label,
                values: [],
                highImportanceValues: [],
                mediumImportanceValues: [],
                lowImportanceValues: []
            };

            for (const value of field.picklistValues) {
                const valueLower = value.value.toLowerCase();
                let importanceLevel = 'normal';

                // Check against importance keywords
                if (this.importanceKeywords.high.some(kw => valueLower.includes(kw))) {
                    importanceLevel = 'high';
                    valueAnalysis.highImportanceValues.push(value.value);
                } else if (this.importanceKeywords.medium.some(kw => valueLower.includes(kw))) {
                    importanceLevel = 'medium';
                    valueAnalysis.mediumImportanceValues.push(value.value);
                } else if (this.importanceKeywords.low.some(kw => valueLower.includes(kw))) {
                    importanceLevel = 'low';
                    valueAnalysis.lowImportanceValues.push(value.value);
                }

                valueAnalysis.values.push({
                    value: value.value,
                    label: value.label,
                    importanceLevel
                });
            }

            // Only include picklists that have importance values
            if (valueAnalysis.highImportanceValues.length > 0 ||
                valueAnalysis.mediumImportanceValues.length > 0) {
                analysis.push(valueAnalysis);
            }
        }

        return analysis;
    }

    /**
     * Calculate importance scores for all fields
     */
    calculateImportanceScores(fields, integrationIds, picklistAnalysis) {
        const scored = [];

        for (const field of fields) {
            let score = 0;
            const scoreBreakdown = [];

            // Base score from pattern matches
            if (field.patternMatches && field.patternMatches.length > 0) {
                const maxWeight = Math.max(...field.patternMatches.map(m => m.baseWeight));
                score += maxWeight;
                scoreBreakdown.push({
                    factor: 'pattern_match',
                    value: maxWeight,
                    details: field.patternMatches.map(m => m.category).join(', ')
                });
            }

            // Bonus for integration ID fields
            const isIntegrationId = integrationIds.find(id => id.name === field.name);
            if (isIntegrationId) {
                score += isIntegrationId.importance;
                scoreBreakdown.push({
                    factor: 'integration_id',
                    value: isIntegrationId.importance,
                    details: isIntegrationId.reason
                });
            }

            // Bonus for picklist fields with importance values
            const picklistInfo = picklistAnalysis.find(p => p.fieldName === field.name);
            if (picklistInfo) {
                const picklistBonus = picklistInfo.highImportanceValues.length * 20 +
                                     picklistInfo.mediumImportanceValues.length * 10;
                if (picklistBonus > 0) {
                    score += Math.min(picklistBonus, 50); // Cap picklist bonus at 50
                    scoreBreakdown.push({
                        factor: 'picklist_importance',
                        value: Math.min(picklistBonus, 50),
                        details: `${picklistInfo.highImportanceValues.length} high, ${picklistInfo.mediumImportanceValues.length} medium`
                    });
                }
            }

            // Bonus for required fields
            if (field.required) {
                score += 10;
                scoreBreakdown.push({
                    factor: 'required',
                    value: 10,
                    details: 'Required field'
                });
            }

            // Bonus for unique fields
            if (field.unique) {
                score += 15;
                scoreBreakdown.push({
                    factor: 'unique',
                    value: 15,
                    details: 'Unique constraint'
                });
            }

            // Only include fields with non-zero scores
            if (score > 0) {
                scored.push({
                    name: field.name,
                    label: field.label,
                    type: field.type,
                    score: Math.min(score, 100), // Cap at 100
                    scoreBreakdown,
                    categories: field.importanceCategories,
                    isIntegrationId: !!isIntegrationId,
                    hasImportancePicklist: !!picklistInfo
                });
            }
        }

        // Sort by score descending
        return scored.sort((a, b) => b.score - a.score);
    }

    /**
     * Generate suggested weights for survivor selection algorithm
     */
    generateSurvivorWeights(scoredFields) {
        const weights = {
            // Base relationship weights (highest priority)
            relationshipScore: {
                weight: 100,
                description: '(Contacts + Opportunities) × multiplier',
                formula: 'contacts + opportunities',
                notes: 'Prioritize accounts with more relationships'
            }
        };

        // Add top importance fields as weight categories
        const topFields = scoredFields.slice(0, 10); // Top 10 importance fields

        for (const field of topFields) {
            const weightKey = field.name.replace(/__c$/, '').toLowerCase();

            // Calculate suggested weight based on importance score
            let suggestedWeight = Math.round(field.score * 0.5); // Scale to 0-50 range

            // Boost integration IDs
            if (field.isIntegrationId) {
                suggestedWeight += 50;
            }

            weights[weightKey] = {
                weight: suggestedWeight,
                fieldName: field.name,
                description: field.label,
                importanceScore: field.score,
                categories: field.categories,
                notes: field.scoreBreakdown.map(b => b.details).join('; ')
            };
        }

        return weights;
    }

    /**
     * Generate comprehensive report
     */
    generateReport(data) {
        const { sobject, orgAlias, totalFields, scoredFields, integrationIdFields, picklistAnalysis, suggestedWeights } = data;

        let report = '';

        // Header
        report += '═'.repeat(70) + '\n';
        report += 'IMPORTANCE FIELD DETECTION REPORT\n';
        report += '═'.repeat(70) + '\n';
        report += `Object: ${sobject}\n`;
        report += `Org: ${orgAlias}\n`;
        report += `Total Fields: ${totalFields}\n`;
        report += `Important Fields Detected: ${scoredFields.length}\n`;
        report += `Timestamp: ${new Date().toISOString()}\n`;
        report += '\n';

        // Top Importance Fields
        report += '🏆 TOP IMPORTANCE FIELDS\n';
        report += '─'.repeat(70) + '\n';
        const top10 = scoredFields.slice(0, 10);
        top10.forEach((field, index) => {
            report += `${index + 1}. ${field.name} (${field.label})\n`;
            report += `   Score: ${field.score}/100\n`;
            report += `   Type: ${field.type}\n`;
            report += `   Categories: ${field.categories.join(', ') || 'N/A'}\n`;
            report += `   Breakdown:\n`;
            field.scoreBreakdown.forEach(b => {
                report += `     - ${b.factor}: +${b.value} (${b.details})\n`;
            });
            report += '\n';
        });

        // Integration ID Fields
        if (integrationIdFields.length > 0) {
            report += '🔗 INTEGRATION ID FIELDS\n';
            report += '─'.repeat(70) + '\n';
            integrationIdFields.forEach(id => {
                report += `• ${id.name} (${id.label})\n`;
                report += `  Confidence: ${id.confidence}\n`;
                report += `  Reason: ${id.reason}\n`;
                report += `  Importance: ${id.importance}/100\n`;
                report += '\n';
            });
        }

        // Picklist Importance Analysis
        if (picklistAnalysis.length > 0) {
            report += '📊 PICKLIST IMPORTANCE ANALYSIS\n';
            report += '─'.repeat(70) + '\n';
            picklistAnalysis.forEach(p => {
                report += `${p.fieldName} (${p.fieldLabel})\n`;
                if (p.highImportanceValues.length > 0) {
                    report += `  High Importance Values: ${p.highImportanceValues.join(', ')}\n`;
                }
                if (p.mediumImportanceValues.length > 0) {
                    report += `  Medium Importance Values: ${p.mediumImportanceValues.join(', ')}\n`;
                }
                report += '\n';
            });
        }

        // Suggested Survivor Selection Weights
        report += '🎯 SUGGESTED SURVIVOR SELECTION WEIGHTS\n';
        report += '─'.repeat(70) + '\n';
        report += 'Use these weights in your deduplication survivor scoring algorithm:\n\n';
        Object.entries(suggestedWeights).forEach(([key, config]) => {
            report += `${key}:\n`;
            report += `  Weight: ${config.weight}\n`;
            if (config.fieldName) {
                report += `  Field: ${config.fieldName}\n`;
            }
            report += `  Description: ${config.description}\n`;
            if (config.notes) {
                report += `  Notes: ${config.notes}\n`;
            }
            report += '\n';
        });

        report += '═'.repeat(70) + '\n';

        return report;
    }

    /**
     * Save report to file
     */
    saveReport(report) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '-').slice(0, 19);
        const reportPath = path.join(this.outputDir, `importance-fields-${this.sobject}-${timestamp}.txt`);

        fs.writeFileSync(reportPath, report);
        console.log(`\n📄 Report saved: ${reportPath}`);
    }
}

// CLI Interface
if (require.main === module) {
    const args = process.argv.slice(2);

    if (args.length < 2 || args.includes('--help')) {
        console.log(`
Importance Field Detector

Usage:
  node importance-field-detector.js <sobject> <org-alias> [options]

Arguments:
  sobject          Salesforce object to analyze (e.g., Account)
  org-alias        Target Salesforce org alias

Options:
  --verbose            Show detailed debug output
  --output-format      Output format: table, json, markdown (default: table)
  --output-dir <path>  Custom output directory (default: ./field-importance-reports)

Examples:
  # Analyze Account fields
  node importance-field-detector.js Account rentable-production

  # Verbose mode
  node importance-field-detector.js Account rentable-production --verbose

  # JSON output
  node importance-field-detector.js Account rentable-production --output-format json

Output:
  - Field importance scores (0-100)
  - Integration ID field detection
  - Picklist value importance analysis
  - Suggested survivor selection weights
        `);
        process.exit(0);
    }

    const sobject = args[0];
    const orgAlias = args[1];

    const options = {
        sobject,
        orgAlias,
        verbose: args.includes('--verbose')
    };

    // Parse output format
    const formatIndex = args.indexOf('--output-format');
    if (formatIndex !== -1 && args[formatIndex + 1]) {
        options.outputFormat = args[formatIndex + 1];
    }

    // Parse output directory
    const dirIndex = args.indexOf('--output-dir');
    if (dirIndex !== -1 && args[dirIndex + 1]) {
        options.outputDir = args[dirIndex + 1];
    }

    // Execute detection
    (async () => {
        try {
            const detector = new ImportanceFieldDetector(options);
            const result = await detector.detectImportanceFields();

            console.log('\n✅ Detection completed successfully!');
            process.exit(0);

        } catch (error) {
            console.error('\n❌ Detection failed:', error.message);
            if (options.verbose && error.stack) {
                console.error('\nStack trace:');
                console.error(error.stack);
            }
            process.exit(1);
        }
    })();
}

module.exports = ImportanceFieldDetector;
