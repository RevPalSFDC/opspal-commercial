#!/usr/bin/env node

/**
 * Report Type Resolver
 * 
 * Discovers actual API tokens for report types (not UI labels)
 * and maps fields correctly for each type
 */

const ReportsRestAPI = require('./lib/reports-rest-api');
const fs = require('fs').promises;

class ReportTypeResolver {
    constructor(api) {
        this.api = api;
        this.typeCache = new Map();
        this.tokenMappings = {
            // Will be populated with discovered mappings
            uiToApi: {},
            fieldMappings: {},
            ownerFields: {}
        };
    }

    /**
     * Discover all report types and their API tokens
     */
    async discoverAllTypes() {
        console.log('🔍 Discovering Report Types...\n');
        
        const allTypes = await this.api.getReportTypes();
        console.log(`Found ${allTypes.length} report types\n`);
        
        // Categorize by common patterns
        const categories = {
            activities: [],
            accounts: [],
            contacts: [],
            leads: [],
            opportunities: [],
            cases: [],
            custom: [],
            other: []
        };
        
        for (const type of allTypes) {
            const typeToken = type.type;
            const label = type.label || '';
            
            // Store UI to API mapping
            this.tokenMappings.uiToApi[label] = typeToken;
            
            // Categorize
            if (typeToken.toLowerCase().includes('activity') || 
                label.toLowerCase().includes('activity') ||
                label.toLowerCase().includes('task') ||
                label.toLowerCase().includes('event')) {
                categories.activities.push(type);
            } else if (typeToken.toLowerCase().includes('account') || 
                       typeToken === 'AccountList') {
                categories.accounts.push(type);
            } else if (typeToken.toLowerCase().includes('contact') || 
                       typeToken === 'ContactList') {
                categories.contacts.push(type);
            } else if (typeToken.toLowerCase().includes('lead') || 
                       typeToken === 'LeadList') {
                categories.leads.push(type);
            } else if (typeToken.toLowerCase().includes('opportunity')) {
                categories.opportunities.push(type);
            } else if (typeToken.toLowerCase().includes('case')) {
                categories.cases.push(type);
            } else if (typeToken.includes('__c')) {
                categories.custom.push(type);
            } else {
                categories.other.push(type);
            }
        }
        
        // Display categorized results
        console.log('═══════════════════════════════════════════════════════════');
        console.log('REPORT TYPE API TOKENS (Use these, not UI labels!)');
        console.log('═══════════════════════════════════════════════════════════\n');
        
        for (const [category, types] of Object.entries(categories)) {
            if (types.length > 0) {
                console.log(`📁 ${category.toUpperCase()} (${types.length} types)`);
                console.log('─'.repeat(50));
                
                for (const type of types.slice(0, 5)) { // Show first 5
                    console.log(`  API Token: "${type.type}"`);
                    console.log(`  UI Label:  ${type.label}`);
                    console.log(`  Category:  ${type.category || 'N/A'}\n`);
                }
                
                if (types.length > 5) {
                    console.log(`  ... and ${types.length - 5} more\n`);
                }
            }
        }
        
        return categories;
    }

    /**
     * Describe a report type to get field tokens
     */
    async describeType(typeToken) {
        if (this.typeCache.has(typeToken)) {
            return this.typeCache.get(typeToken);
        }
        
        try {
            const response = await this.api.apiRequest(
                `/services/data/${this.api.apiVersion}/analytics/reportTypes/${typeToken}`
            );
            
            const fields = [];
            const sections = response.reportMetadata?.detailColumnInfo || {};
            
            // Extract all fields with their tokens
            for (const [sectionName, sectionFields] of Object.entries(sections)) {
                for (const [fieldToken, fieldInfo] of Object.entries(sectionFields)) {
                    fields.push({
                        token: fieldToken,
                        label: fieldInfo.label,
                        dataType: fieldInfo.dataType,
                        section: sectionName,
                        filterable: fieldInfo.filterable !== false,
                        groupable: fieldInfo.groupable !== false
                    });
                }
            }
            
            const description = {
                type: typeToken,
                label: response.reportMetadata?.developerName,
                fields: fields,
                totalFields: fields.length,
                sections: Object.keys(sections)
            };
            
            this.typeCache.set(typeToken, description);
            return description;
            
        } catch (error) {
            console.error(`Failed to describe ${typeToken}: ${error.message}`);
            return null;
        }
    }

    /**
     * Find owner field for each report type
     */
    async findOwnerFields(categories) {
        console.log('\n🔍 Finding Owner Field Variations...\n');
        
        const ownerPatterns = ['owner', 'assigned', 'full_name', 'created_by', 'user'];
        const results = {};
        
        // Test key report types
        const testTypes = [
            categories.opportunities[0]?.type || 'Opportunity',
            categories.activities[0]?.type,
            categories.accounts[0]?.type,
            categories.contacts[0]?.type,
            categories.leads[0]?.type
        ].filter(Boolean);
        
        for (const typeToken of testTypes) {
            console.log(`Checking ${typeToken}...`);
            const description = await this.describeType(typeToken);
            
            if (description) {
                // Find owner-related fields
                const ownerFields = description.fields.filter(f => {
                    const tokenLower = f.token.toLowerCase();
                    return ownerPatterns.some(p => tokenLower.includes(p));
                });
                
                if (ownerFields.length > 0) {
                    results[typeToken] = ownerFields[0].token;
                    console.log(`  ✓ Owner field: ${ownerFields[0].token}`);
                    
                    // Store in mappings
                    this.tokenMappings.ownerFields[typeToken] = ownerFields[0].token;
                } else {
                    console.log(`  ✗ No owner field found`);
                }
            }
        }
        
        return results;
    }

    /**
     * Test report creation with correct tokens
     */
    async testReportCreation(typeToken, fields = []) {
        console.log(`\n🧪 Testing report creation with type: ${typeToken}`);
        
        // Get folder
        const folders = await this.api.getWritableFolders();
        if (folders.length === 0) {
            console.log('  ❌ No writable folders');
            return false;
        }
        
        const metadata = {
            name: `Test_${typeToken}_${Date.now()}`,
            reportType: { type: typeToken },
            reportFormat: 'TABULAR',
            folderId: folders[0].id,
            detailColumns: fields.slice(0, 5) // Max 5 fields for test
        };
        
        // Validate first
        console.log('  Validating...');
        const validation = await this.api.validateReportMetadata(metadata);
        
        if (validation.valid) {
            console.log('  ✅ Validation passed!');
            
            // Actually create if write enabled
            if (process.env.ENABLE_WRITE === '1') {
                try {
                    const result = await this.api.createReport(metadata);
                    console.log(`  ✅ Created: ${result.reportId}`);
                    return true;
                } catch (error) {
                    console.log(`  ❌ Creation failed: ${error.message}`);
                }
            } else {
                console.log('  ℹ️  Set ENABLE_WRITE=1 to actually create');
                return true; // Validation passed
            }
        } else {
            console.log(`  ❌ Validation failed: ${validation.message}`);
        }
        
        return false;
    }

    /**
     * Generate working examples
     */
    async generateExamples(categories) {
        console.log('\n📝 Generating Working Examples...\n');
        
        const examples = [];
        
        // Activities Example
        if (categories.activities.length > 0) {
            const activityType = categories.activities[0];
            const desc = await this.describeType(activityType.type);
            
            if (desc) {
                const example = {
                    name: 'Activity Report',
                    reportType: { type: activityType.type },
                    reportFormat: 'SUMMARY',
                    detailColumns: desc.fields.slice(0, 5).map(f => f.token),
                    groupingsDown: [{
                        name: this.tokenMappings.ownerFields[activityType.type] || desc.fields.find(f => f.token.toLowerCase().includes('assigned'))?.token,
                        sortOrder: 'ASC'
                    }],
                    reportFilters: [{
                        column: desc.fields.find(f => f.dataType === 'date')?.token,
                        operator: 'equals',
                        value: 'LAST_N_DAYS:90'
                    }]
                };
                examples.push({ category: 'Activities', metadata: example });
            }
        }
        
        // Accounts Example
        if (categories.accounts.length > 0) {
            const accountType = categories.accounts[0];
            const desc = await this.describeType(accountType.type);
            
            if (desc) {
                const example = {
                    name: 'Account Report',
                    reportType: { type: accountType.type },
                    reportFormat: 'TABULAR',
                    detailColumns: desc.fields.slice(0, 7).map(f => f.token)
                };
                examples.push({ category: 'Accounts', metadata: example });
            }
        }
        
        // Save examples
        const examplesFile = 'report-examples.json';
        await fs.writeFile(
            examplesFile,
            JSON.stringify({ 
                generated: new Date().toISOString(),
                tokenMappings: this.tokenMappings,
                examples: examples 
            }, null, 2)
        );
        
        console.log(`✅ Examples saved to ${examplesFile}`);
        
        return examples;
    }

    /**
     * Create working reports with discovered tokens
     */
    async createWorkingReports(categories) {
        console.log('\n🚀 Creating Reports with Correct Tokens...\n');
        
        const reports = [];
        
        // 1. Lead Report (if available)
        if (categories.leads.length > 0) {
            const leadType = categories.leads[0].type;
            console.log(`Creating Lead Report using type: ${leadType}`);
            
            const desc = await this.describeType(leadType);
            if (desc) {
                const leadFields = desc.fields.filter(f => 
                    f.token.includes('NAME') || 
                    f.token.includes('COMPANY') || 
                    f.token.includes('STATUS')
                ).slice(0, 5).map(f => f.token);
                
                const success = await this.testReportCreation(leadType, leadFields);
                reports.push({ type: 'Lead', success });
            }
        }
        
        // 2. Contact Report (if available)
        if (categories.contacts.length > 0) {
            const contactType = categories.contacts[0].type;
            console.log(`Creating Contact Report using type: ${contactType}`);
            
            const desc = await this.describeType(contactType);
            if (desc) {
                const contactFields = desc.fields.slice(0, 5).map(f => f.token);
                const success = await this.testReportCreation(contactType, contactFields);
                reports.push({ type: 'Contact', success });
            }
        }
        
        // 3. Activity Report (if available)
        if (categories.activities.length > 0) {
            const activityType = categories.activities[0].type;
            console.log(`Creating Activity Report using type: ${activityType}`);
            
            const desc = await this.describeType(activityType);
            if (desc) {
                const activityFields = desc.fields.slice(0, 5).map(f => f.token);
                const success = await this.testReportCreation(activityType, activityFields);
                reports.push({ type: 'Activity', success });
            }
        }
        
        return reports;
    }
}

async function main() {
    const org = process.env.ORG;
    if (!org) {
        console.error('Set ORG environment variable first');
        process.exit(1);
    }
    
    console.log(`
═══════════════════════════════════════════════════════════════
REPORT TYPE RESOLVER - Finding Correct API Tokens
ORG: ${org}
═══════════════════════════════════════════════════════════════
`);
    
    try {
        const api = await ReportsRestAPI.fromSFAuth(org);
        const resolver = new ReportTypeResolver(api);
        
        // Step 1: Discover all report types
        const categories = await resolver.discoverAllTypes();
        
        // Step 2: Find owner fields
        await resolver.findOwnerFields(categories);
        
        // Step 3: Generate examples
        await resolver.generateExamples(categories);
        
        // Step 4: Create working reports
        if (process.env.ENABLE_WRITE === '1') {
            await resolver.createWorkingReports(categories);
        } else {
            console.log('\n📝 Set ENABLE_WRITE=1 to create actual reports');
        }
        
        console.log(`
═══════════════════════════════════════════════════════════════
KEY FINDINGS:

✅ Use API tokens (e.g., "ContactList"), NOT UI labels ("Contacts")
✅ Owner field varies: Opportunity uses FULL_NAME, others use ASSIGNED
✅ Date format must be LAST_N_DAYS:90
✅ Always describe report type first to get valid field tokens

See report-examples.json for working metadata
═══════════════════════════════════════════════════════════════
`);
        
    } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

module.exports = ReportTypeResolver;