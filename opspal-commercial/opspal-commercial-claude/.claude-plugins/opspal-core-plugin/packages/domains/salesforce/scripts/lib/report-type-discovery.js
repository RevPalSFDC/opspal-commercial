/**
 * Report Type Discovery Module
 * 
 * Solves the "UI names vs API names" problem by providing
 * comprehensive report type discovery and field mapping
 */

const ReportsRestAPI = require('./reports-rest-api');

class ReportTypeDiscovery {
    constructor(api) {
        this.api = api;
        this.typeCache = new Map();
        this.fieldCache = new Map();
    }

    /**
     * Initialize from Salesforce auth
     */
    static async fromSFAuth(orgAlias) {
        const api = await ReportsRestAPI.fromSFAuth(orgAlias);
        return new ReportTypeDiscovery(api);
    }

    /**
     * Discover Activities-related report types
     */
    async discoverActivitiesTypes() {
        const allTypes = await this.api.getReportTypes();
        
        // Common Activities patterns in Salesforce
        const patterns = [
            'activities',
            'task',
            'event',
            'activity',
            'call',
            'meeting',
            'email'
        ];
        
        const matches = [];
        
        for (const type of allTypes) {
            const label = type.label?.toLowerCase() || '';
            const typeStr = type.type?.toLowerCase() || '';
            
            if (patterns.some(p => label.includes(p) || typeStr.includes(p))) {
                // Get detailed information
                const details = await this.getTypeDetails(type.type);
                
                matches.push({
                    type: type.type,
                    label: type.label,
                    category: type.category,
                    isActivities: true,
                    hasGongFields: await this.hasGongFields(type.type),
                    fieldCount: details.fieldCount,
                    keyFields: details.keyFields
                });
            }
        }
        
        // Sort by relevance
        matches.sort((a, b) => {
            // Prefer types with "Activities" in the name
            if (a.label.includes('Activities') && !b.label.includes('Activities')) return -1;
            if (!a.label.includes('Activities') && b.label.includes('Activities')) return 1;
            // Then prefer types with more fields
            return b.fieldCount - a.fieldCount;
        });
        
        return matches;
    }

    /**
     * Discover Gong-related report types
     */
    async discoverGongTypes() {
        const allTypes = await this.api.getReportTypes();
        
        const matches = allTypes.filter(type => {
            const label = type.label?.toLowerCase() || '';
            const typeStr = type.type?.toLowerCase() || '';
            return label.includes('gong') || typeStr.includes('gong');
        });
        
        // Enhance with details
        const enhanced = [];
        for (const type of matches) {
            const details = await this.getTypeDetails(type.type);
            enhanced.push({
                type: type.type,
                label: type.label,
                category: type.category,
                isGong: true,
                fieldCount: details.fieldCount,
                conversationFields: details.conversationFields,
                metricsFields: details.metricsFields
            });
        }
        
        return enhanced;
    }

    /**
     * Get detailed information about a report type
     */
    async getTypeDetails(reportType) {
        if (this.typeCache.has(reportType)) {
            return this.typeCache.get(reportType);
        }
        
        try {
            const description = await this.api.describeReportType(reportType);
            
            // Analyze fields
            const keyFields = [];
            const conversationFields = [];
            const metricsFields = [];
            const dateFields = [];
            
            for (const field of description.fields) {
                const token = field.token?.toLowerCase() || '';
                const label = field.label?.toLowerCase() || '';
                
                // Categorize fields
                if (token.includes('date') || field.dataType === 'date' || field.dataType === 'datetime') {
                    dateFields.push(field);
                }
                
                if (token.includes('conversation') || token.includes('call') || label.includes('gong')) {
                    conversationFields.push(field);
                }
                
                if (token.includes('duration') || token.includes('count') || token.includes('score')) {
                    metricsFields.push(field);
                }
                
                // Identify key fields
                if (['subject', 'name', 'owner', 'status', 'type'].some(k => token.includes(k))) {
                    keyFields.push(field);
                }
            }
            
            const details = {
                type: reportType,
                label: description.label,
                baseObject: description.baseObject,
                fieldCount: description.fields.length,
                keyFields: keyFields,
                conversationFields: conversationFields,
                metricsFields: metricsFields,
                dateFields: dateFields,
                allFields: description.fields
            };
            
            this.typeCache.set(reportType, details);
            return details;
            
        } catch (error) {
            return {
                type: reportType,
                error: error.message,
                fieldCount: 0,
                keyFields: [],
                conversationFields: [],
                metricsFields: [],
                dateFields: []
            };
        }
    }

    /**
     * Check if report type has Gong fields
     */
    async hasGongFields(reportType) {
        const details = await this.getTypeDetails(reportType);
        return details.conversationFields.length > 0 || 
               details.allFields?.some(f => 
                   f.token?.toLowerCase().includes('gong') || 
                   f.label?.toLowerCase().includes('gong')
               );
    }

    /**
     * Find the best report type for a use case
     */
    async findBestReportType(useCase) {
        const allTypes = await this.api.getReportTypes();
        const scores = [];
        
        for (const type of allTypes) {
            let score = 0;
            const label = type.label?.toLowerCase() || '';
            const typeStr = type.type?.toLowerCase() || '';
            const useCaseLower = useCase.toLowerCase();
            
            // Score based on match
            if (label.includes(useCaseLower)) score += 10;
            if (typeStr.includes(useCaseLower)) score += 10;
            
            // Partial matches
            const words = useCaseLower.split(/\s+/);
            words.forEach(word => {
                if (label.includes(word)) score += 2;
                if (typeStr.includes(word)) score += 2;
            });
            
            // Special cases
            if (useCaseLower.includes('call') && label.includes('activities')) score += 5;
            if (useCaseLower.includes('task') && label.includes('activities')) score += 5;
            if (useCaseLower.includes('gong') && (label.includes('gong') || label.includes('conversation'))) score += 10;
            
            if (score > 0) {
                scores.push({ type: type.type, label: type.label, score });
            }
        }
        
        // Sort by score
        scores.sort((a, b) => b.score - a.score);
        
        // Return top matches with details
        const topMatches = scores.slice(0, 5);
        const detailed = [];
        
        for (const match of topMatches) {
            const details = await this.getTypeDetails(match.type);
            detailed.push({
                ...match,
                fieldCount: details.fieldCount,
                hasRequiredFields: details.keyFields.length > 0
            });
        }
        
        return detailed;
    }

    /**
     * Map UI field names to API tokens
     */
    async mapFieldNames(reportType, uiFieldNames) {
        const details = await this.getTypeDetails(reportType);
        const mappings = [];
        
        for (const uiName of uiFieldNames) {
            const uiNameLower = uiName.toLowerCase().replace(/\s+/g, '');
            
            // Try exact match first
            let field = details.allFields.find(f => 
                f.label?.toLowerCase() === uiName.toLowerCase()
            );
            
            // Try token match
            if (!field) {
                field = details.allFields.find(f => 
                    f.token?.toLowerCase() === uiNameLower
                );
            }
            
            // Try partial match
            if (!field) {
                field = details.allFields.find(f => 
                    f.label?.toLowerCase().replace(/\s+/g, '').includes(uiNameLower) ||
                    f.token?.toLowerCase().includes(uiNameLower)
                );
            }
            
            mappings.push({
                uiName: uiName,
                apiToken: field?.token,
                label: field?.label,
                dataType: field?.dataType,
                found: !!field,
                suggestions: !field ? this.getSimilarFields(uiName, details.allFields) : []
            });
        }
        
        return mappings;
    }

    /**
     * Get similar fields for suggestions
     */
    getSimilarFields(targetName, fields) {
        const targetLower = targetName.toLowerCase().replace(/\s+/g, '');
        const scored = [];
        
        for (const field of fields) {
            const labelLower = field.label?.toLowerCase().replace(/\s+/g, '') || '';
            const tokenLower = field.token?.toLowerCase() || '';
            
            // Calculate similarity score
            let score = 0;
            
            // Check for common substrings
            const minLength = Math.min(targetLower.length, labelLower.length);
            for (let i = 0; i < minLength; i++) {
                if (targetLower[i] === labelLower[i]) score++;
            }
            
            // Check for word matches
            const targetWords = targetName.toLowerCase().split(/\s+/);
            const labelWords = field.label?.toLowerCase().split(/\s+/) || [];
            
            targetWords.forEach(word => {
                if (labelWords.includes(word)) score += 5;
                if (tokenLower.includes(word)) score += 3;
            });
            
            if (score > 0) {
                scored.push({ field, score });
            }
        }
        
        // Sort by score and return top 3
        scored.sort((a, b) => b.score - a.score);
        return scored.slice(0, 3).map(s => ({
            token: s.field.token,
            label: s.field.label
        }));
    }

    /**
     * Generate report metadata from high-level description
     */
    async generateReportMetadata(description) {
        // Parse the description
        const parsed = this.parseDescription(description);
        
        // Find best report type
        const reportTypes = await this.findBestReportType(parsed.subject);
        if (reportTypes.length === 0) {
            throw new Error(`No report type found for: ${parsed.subject}`);
        }
        
        const selectedType = reportTypes[0];
        const typeDetails = await this.getTypeDetails(selectedType.type);
        
        // Build metadata
        const metadata = {
            name: parsed.name || `${parsed.subject} Report`,
            reportType: { type: selectedType.type },
            reportFormat: this.determineFormat(parsed),
            detailColumns: [],
            reportFilters: [],
            groupingsDown: [],
            aggregates: []
        };
        
        // Add columns based on description
        if (parsed.columns.length > 0) {
            const mappedColumns = await this.mapFieldNames(selectedType.type, parsed.columns);
            metadata.detailColumns = mappedColumns
                .filter(m => m.found)
                .map(m => m.apiToken);
        } else {
            // Use default key fields
            metadata.detailColumns = typeDetails.keyFields
                .slice(0, 6)
                .map(f => f.token);
        }
        
        // Add date filters if mentioned
        if (parsed.timeframe) {
            const dateField = typeDetails.dateFields[0];
            if (dateField) {
                metadata.reportFilters.push({
                    column: dateField.token,
                    operator: 'equals',
                    value: this.mapTimeframe(parsed.timeframe)
                });
            }
        }
        
        // Add groupings for summary/matrix reports
        if (metadata.reportFormat !== 'TABULAR' && parsed.groupBy.length > 0) {
            const mappedGroups = await this.mapFieldNames(selectedType.type, parsed.groupBy);
            metadata.groupingsDown = mappedGroups
                .filter(m => m.found)
                .map(m => ({
                    name: m.apiToken,
                    sortOrder: 'ASC',
                    dateGranularity: m.dataType === 'date' ? 'DAY' : undefined
                }));
        }
        
        return metadata;
    }

    /**
     * Parse natural language description
     */
    parseDescription(description) {
        const lower = description.toLowerCase();
        
        return {
            name: description.match(/"([^"]+)"/)?.[1] || null,
            subject: this.extractSubject(lower),
            columns: this.extractColumns(lower),
            groupBy: this.extractGroupBy(lower),
            timeframe: this.extractTimeframe(lower),
            format: this.extractFormat(lower)
        };
    }

    extractSubject(text) {
        if (text.includes('activities') || text.includes('task')) return 'Activities';
        if (text.includes('opportunity') || text.includes('opps')) return 'Opportunities';
        if (text.includes('account')) return 'Accounts';
        if (text.includes('lead')) return 'Leads';
        if (text.includes('contact')) return 'Contacts';
        if (text.includes('gong') || text.includes('call')) return 'Gong Conversations';
        return 'Opportunities'; // Default
    }

    extractColumns(text) {
        const columns = [];
        const patterns = [
            /show(?:ing)?\s+([^,]+(?:,\s*[^,]+)*)/i,
            /columns?:\s*([^,]+(?:,\s*[^,]+)*)/i,
            /fields?:\s*([^,]+(?:,\s*[^,]+)*)/i
        ];
        
        for (const pattern of patterns) {
            const match = text.match(pattern);
            if (match) {
                columns.push(...match[1].split(',').map(c => c.trim()));
            }
        }
        
        return columns;
    }

    extractGroupBy(text) {
        const groups = [];
        const patterns = [
            /group(?:ed)?\s+by\s+([^,]+(?:,\s*[^,]+)*)/i,
            /by\s+([^,]+(?:,\s*[^,]+)*)/i
        ];
        
        for (const pattern of patterns) {
            const match = text.match(pattern);
            if (match) {
                groups.push(...match[1].split(',').map(g => g.trim()));
            }
        }
        
        return groups;
    }

    extractTimeframe(text) {
        if (text.includes('today')) return 'TODAY';
        if (text.includes('yesterday')) return 'YESTERDAY';
        if (text.includes('this week')) return 'THIS_WEEK';
        if (text.includes('last week')) return 'LAST_WEEK';
        if (text.includes('this month')) return 'THIS_MONTH';
        if (text.includes('last month')) return 'LAST_MONTH';
        if (text.includes('this quarter')) return 'THIS_QUARTER';
        if (text.includes('last quarter')) return 'LAST_QUARTER';
        if (text.includes('this year')) return 'THIS_YEAR';
        if (text.includes('last year')) return 'LAST_YEAR';
        if (text.match(/last\s+(\d+)\s+days/)) {
            const days = text.match(/last\s+(\d+)\s+days/)[1];
            return `LAST_N_DAYS:${days}`;
        }
        return null;
    }

    extractFormat(text) {
        if (text.includes('matrix') || text.includes('pivot')) return 'MATRIX';
        if (text.includes('summary') || text.includes('group')) return 'SUMMARY';
        return 'TABULAR';
    }

    determineFormat(parsed) {
        if (parsed.format) return parsed.format;
        if (parsed.groupBy.length > 0) return 'SUMMARY';
        return 'TABULAR';
    }

    mapTimeframe(timeframe) {
        // Already in correct format
        return timeframe;
    }
}

module.exports = ReportTypeDiscovery;