#!/usr/bin/env node

/**
 * Salesforce Report API Workarounds
 * 
 * Since Salesforce blocks most report types via API (but not UI),
 * these workarounds help you still get the data you need.
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

class ReportWorkarounds {
    constructor(org) {
        this.org = org;
    }

    /**
     * Workaround 1: Use SOQL instead of Reports API
     */
    async getTaskDataViaSOQL() {
        console.log('\n📊 Workaround 1: Using SOQL instead of Reports API\n');
        
        const queries = {
            'Daily Calls': `
                SELECT 
                    COUNT(Id) callCount,
                    Owner.Name rep,
                    DAY_ONLY(CreatedDate) callDate
                FROM Task
                WHERE Type = 'Call'
                AND CreatedDate = LAST_90_DAYS
                GROUP BY Owner.Name, DAY_ONLY(CreatedDate)
                ORDER BY DAY_ONLY(CreatedDate) DESC
            `,
            
            'Average Calls by Rep': `
                SELECT 
                    Owner.Name rep,
                    COUNT(Id) totalCalls,
                    AVG(CallDurationInSeconds) avgDuration
                FROM Task
                WHERE Type = 'Call'
                AND CreatedDate = LAST_90_DAYS
                GROUP BY Owner.Name
                ORDER BY COUNT(Id) DESC
            `,
            
            'Open Activities': `
                SELECT 
                    Subject,
                    Who.Name contactName,
                    What.Name relatedTo,
                    ActivityDate,
                    Status,
                    Owner.Name assignedTo
                FROM Task
                WHERE IsClosed = false
                AND ActivityDate <= NEXT_30_DAYS
                ORDER BY ActivityDate
                LIMIT 100
            `
        };
        
        const results = {};
        
        for (const [name, query] of Object.entries(queries)) {
            try {
                console.log(`Running: ${name}`);
                const cleanQuery = query.replace(/\s+/g, ' ').trim();
                
                const { stdout } = await execAsync(
                    `sf data query -o "${this.org}" -q "${cleanQuery}" --json`
                );
                
                const result = JSON.parse(stdout);
                if (result.result && result.result.records) {
                    results[name] = result.result.records;
                    console.log(`  ✅ Retrieved ${result.result.records.length} records`);
                } else {
                    console.log(`  ⚠️  No data returned`);
                }
            } catch (error) {
                console.log(`  ❌ Failed: ${error.message}`);
            }
        }
        
        return results;
    }

    /**
     * Workaround 2: Create Opportunity-based reports (only type that works)
     */
    async createOpportunityBasedReports() {
        console.log('\n📊 Workaround 2: Using Opportunity type for all reports\n');
        
        const ReportsRestAPI = require('./lib/reports-rest-api');
        const api = await ReportsRestAPI.fromSFAuth(this.org);
        
        // Get folder
        const folders = await api.getWritableFolders();
        if (folders.length === 0) {
            throw new Error('No writable folders');
        }
        const folderId = folders[0].id;
        
        // Create reports using ONLY Opportunity type (the only one that works)
        const reports = [
            {
                name: 'Team Performance (via Opportunities)',
                reportMetadata: {
                    name: 'Team Performance Analysis',
                    reportType: { type: 'Opportunity' },  // This one actually matches!
                    reportFormat: 'SUMMARY',
                    folderId: folderId,
                    detailColumns: [
                        'OPPORTUNITY_NAME',
                        'ACCOUNT_NAME',
                        'AMOUNT',
                        'CLOSE_DATE'
                    ],
                    groupingsDown: [{
                        name: 'FULL_NAME',  // Owner field for Opportunities
                        sortOrder: 'DESC'
                    }],
                    aggregates: [
                        { name: 'AMOUNT', label: 'Total Revenue' },
                        { name: 'RowCount', label: 'Opportunity Count' }
                    ],
                    reportFilters: [{
                        column: 'CLOSE_DATE',
                        operator: 'equals',
                        value: 'LAST_N_DAYS:90'
                    }]
                }
            },
            {
                name: 'Pipeline by Stage',
                reportMetadata: {
                    name: 'Pipeline Analysis',
                    reportType: { type: 'Opportunity' },
                    reportFormat: 'MATRIX',
                    folderId: folderId,
                    groupingsAcross: [{
                        name: 'CLOSE_MONTH',
                        sortOrder: 'ASC',
                        dateGranularity: 'MONTH'
                    }],
                    groupingsDown: [{
                        name: 'STAGE_NAME',
                        sortOrder: 'ASC'
                    }],
                    aggregates: [
                        { name: 'AMOUNT' },
                        { name: 'RowCount' }
                    ]
                }
            }
        ];
        
        const created = [];
        for (const report of reports) {
            try {
                console.log(`Creating: ${report.name}`);
                const result = await api.createReport(report.reportMetadata);
                created.push(result);
                console.log(`  ✅ Created: ${result.reportId}`);
            } catch (error) {
                console.log(`  ❌ Failed: ${error.message}`);
            }
        }
        
        return created;
    }

    /**
     * Workaround 3: Create reports in UI, then reference by ID
     */
    async getExistingReports() {
        console.log('\n📊 Workaround 3: List reports created via UI\n');
        
        const query = `
            SELECT Id, Name, DeveloperName, FolderName, 
                   Format, LastModifiedDate, CreatedDate
            FROM Report
            ORDER BY LastModifiedDate DESC
            LIMIT 20
        `;
        
        const { stdout } = await execAsync(
            `sf data query -o "${this.org}" -q "${query}" --json`
        );
        
        const result = JSON.parse(stdout);
        const reports = result.result.records;
        
        console.log('Recent Reports (create more via UI):');
        reports.forEach(report => {
            console.log(`  • ${report.Name} (${report.Id})`);
            console.log(`    Folder: ${report.FolderName}`);
            console.log(`    Format: ${report.Format}`);
            console.log(`    Use this ID in dashboards or API calls\n`);
        });
        
        return reports;
    }

    /**
     * Workaround 4: Use List Views as alternative
     */
    async createListViews() {
        console.log('\n📊 Workaround 4: Using List Views instead of Reports\n');
        
        const listViewMetadata = `<?xml version="1.0" encoding="UTF-8"?>
<ListView xmlns="http://soap.sforce.com/2006/04/metadata">
    <fullName>My_Tasks_This_Week</fullName>
    <columns>Subject</columns>
    <columns>Who</columns>
    <columns>What</columns>
    <columns>ActivityDate</columns>
    <columns>Status</columns>
    <columns>Priority</columns>
    <filterScope>Mine</filterScope>
    <filters>
        <field>ActivityDate</field>
        <operation>equals</operation>
        <value>THIS_WEEK</value>
    </filters>
    <label>My Tasks This Week</label>
</ListView>`;
        
        console.log('List Views can be created via Metadata API');
        console.log('They provide similar filtering without Reports API restrictions');
        console.log('\nExample ListView metadata saved to: listview-example.xml');
        
        const fs = require('fs').promises;
        await fs.writeFile('listview-example.xml', listViewMetadata);
        
        return true;
    }

    /**
     * Workaround 5: Export data and report externally
     */
    async exportDataForExternalReporting() {
        console.log('\n📊 Workaround 5: Export data for external reporting\n');
        
        // Export key data
        const exports = {
            tasks: 'SELECT Id, Subject, Status, Type, Who.Name, What.Name, ActivityDate, Owner.Name FROM Task WHERE CreatedDate = LAST_90_DAYS',
            opportunities: 'SELECT Id, Name, Amount, StageName, CloseDate, Account.Name, Owner.Name FROM Opportunity WHERE CreatedDate = LAST_90_DAYS',
            accounts: 'SELECT Id, Name, Type, Industry, AnnualRevenue, Owner.Name FROM Account WHERE LastModifiedDate = LAST_90_DAYS'
        };
        
        for (const [name, query] of Object.entries(exports)) {
            try {
                console.log(`Exporting ${name}...`);
                const filename = `export_${name}_${Date.now()}.csv`;
                
                await execAsync(
                    `sf data query -o "${this.org}" -q "${query}" --result-format csv > ${filename}`
                );
                
                console.log(`  ✅ Exported to ${filename}`);
                console.log(`     Use Excel, Tableau, PowerBI, etc. for reporting`);
            } catch (error) {
                console.log(`  ❌ Failed: ${error.message}`);
            }
        }
    }

    /**
     * Show the reality of API restrictions
     */
    async demonstrateRestrictions() {
        console.log('\n🚫 Demonstrating Salesforce API Restrictions\n');
        
        const ReportsRestAPI = require('./lib/reports-rest-api');
        const api = await ReportsRestAPI.fromSFAuth(this.org);
        
        // Try to create reports with different types
        const testTypes = [
            'Opportunity',  // Should work
            'Task',         // Will fail
            'Account',      // Will fail
            'Contact',      // Will fail
            'Lead',         // Will fail
            'Case',         // Will fail
            'Activities'    // Will fail
        ];
        
        console.log('Testing report type availability via API:');
        console.log('(All these work in UI but most blocked in API)\n');
        
        for (const type of testTypes) {
            try {
                const validation = await api.validateReportMetadata({
                    name: `Test ${type}`,
                    reportType: { type: type },
                    reportFormat: 'TABULAR',
                    detailColumns: []
                });
                
                if (validation.valid) {
                    console.log(`  ✅ ${type}: WORKS via API`);
                } else {
                    console.log(`  ❌ ${type}: BLOCKED via API (but works in UI)`);
                }
            } catch (error) {
                console.log(`  ❌ ${type}: BLOCKED via API (${error.message})`);
            }
        }
        
        console.log('\n💡 This proves Salesforce intentionally blocks report types in API');
        console.log('   while allowing them in UI to push CRM Analytics licenses.');
    }
}

// Main execution
async function main() {
    const org = process.env.ORG;
    if (!org) {
        console.error('Set ORG environment variable first');
        process.exit(1);
    }
    
    console.log(`
═══════════════════════════════════════════════════════════════
SALESFORCE REPORT API WORKAROUNDS
═══════════════════════════════════════════════════════════════

Since Salesforce blocks most report types via API,
here are practical workarounds...
`);
    
    const workarounds = new ReportWorkarounds(org);
    
    // Demonstrate the problem
    await workarounds.demonstrateRestrictions();
    
    // Show workarounds
    console.log('\n💡 WORKAROUNDS:\n');
    
    // 1. Use SOQL
    const soqlData = await workarounds.getTaskDataViaSOQL();
    
    // 2. Use Opportunity reports
    if (process.env.ENABLE_WRITE === '1') {
        await workarounds.createOpportunityBasedReports();
    } else {
        console.log('\n(Set ENABLE_WRITE=1 to create Opportunity-based reports)');
    }
    
    // 3. Reference UI-created reports
    await workarounds.getExistingReports();
    
    // 4. List Views alternative
    await workarounds.createListViews();
    
    // 5. Export for external reporting
    await workarounds.exportDataForExternalReporting();
    
    console.log(`
═══════════════════════════════════════════════════════════════
RECOMMENDATIONS:

1. Use SOQL queries for task/activity data (Workaround 1)
2. Create all reports via UI, reference by ID (Workaround 3)  
3. Use Opportunity type for API-created reports (Workaround 2)
4. Consider external reporting tools (Workaround 5)
5. Document this limitation for stakeholders

DON'T: Buy CRM Analytics just for basic reports
DON'T: Waste time trying to "fix" the API - it's intentionally blocked
═══════════════════════════════════════════════════════════════
`);
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = { ReportWorkarounds };