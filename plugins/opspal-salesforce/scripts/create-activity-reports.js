#!/usr/bin/env node

/**
 * Create Activity/Task Reports
 * Uses the correct date format and proper report types
 */

const ReportsRestAPI = require('./lib/reports-rest-api');

async function createActivityReports() {
    const org = process.env.ORG;
    if (!org) {
        console.error('Set ORG environment variable first');
        process.exit(1);
    }

    // Check write permission
    if (process.env.ENABLE_WRITE !== '1') {
        console.error('Set ENABLE_WRITE=1 to create reports');
        process.exit(1);
    }

    console.log(`\nCreating Activity Reports in ${org}...\n`);

    try {
        const api = await ReportsRestAPI.fromSFAuth(org);
        
        // Get folders
        const folders = await api.getWritableFolders();
        if (folders.length === 0) {
            throw new Error('No writable folders found');
        }
        const folderId = folders[0].id;
        console.log(`Using folder: ${folders[0].name}\n`);
        
        // First, discover the correct report type
        const allTypes = await api.getReportTypes();
        
        // Try different possible type names
        const possibleTypes = ['Task', 'Activity', 'Activities', 'Tasks'];
        let taskReportType = null;
        
        for (const typeName of possibleTypes) {
            const found = allTypes.find(t => t.type === typeName);
            if (found) {
                taskReportType = found.type;
                console.log(`✓ Found report type: ${taskReportType}`);
                break;
            }
        }
        
        if (!taskReportType) {
            console.log('Standard task types not found, searching for alternatives...');
            const taskRelated = allTypes.find(t => 
                t.label?.toLowerCase().includes('task') ||
                t.label?.toLowerCase().includes('activity')
            );
            if (taskRelated) {
                taskReportType = taskRelated.type;
                console.log(`✓ Using alternative: ${taskReportType} (${taskRelated.label})`);
            }
        }
        
        if (!taskReportType) {
            throw new Error('No task/activity report type found in this org');
        }
        
        // Get available fields for this type
        const typeDetails = await api.describeReportType(taskReportType);
        const availableFields = typeDetails.fields.map(f => f.token);
        console.log(`Available fields: ${availableFields.length}\n`);
        
        // Helper to find best matching field
        const findField = (preferred) => {
            for (const field of preferred) {
                if (availableFields.includes(field)) return field;
            }
            // Try case-insensitive match
            for (const field of preferred) {
                const found = availableFields.find(f => 
                    f.toLowerCase() === field.toLowerCase()
                );
                if (found) return found;
            }
            return null;
        };
        
        // Define reports with field fallbacks
        const reports = [
            {
                name: 'Daily Calls by Rep',
                format: 'MATRIX',
                columns: [
                    findField(['SUBJECT', 'TASK.SUBJECT', 'Subject']),
                    findField(['WHO_NAME', 'TASK.WHO_NAME', 'WHO.NAME', 'Contact']),
                    findField(['WHAT_NAME', 'TASK.WHAT_NAME', 'WHAT.NAME', 'Related To'])
                ].filter(Boolean),
                groupingsAcross: [{
                    name: findField(['DUE_DATE', 'TASK.DUE_DATE', 'ACTIVITY_DATE', 'CREATED_DATE']),
                    sortOrder: 'ASC',
                    dateGranularity: 'DAY'  // Required for matrix
                }],
                groupingsDown: [{
                    name: findField(['ASSIGNED', 'TASK.ASSIGNED', 'OWNER_NAME', 'OWNER']),
                    sortOrder: 'ASC'
                }],
                filters: [{
                    column: findField(['TYPE', 'TASK.TYPE', 'TASK_SUBTYPE']),
                    operator: 'equals',
                    value: 'Call'
                }]
            },
            {
                name: 'Avg Daily Calls by Rep',
                format: 'SUMMARY',
                columns: [
                    findField(['SUBJECT', 'TASK.SUBJECT']),
                    findField(['STATUS', 'TASK.STATUS'])
                ].filter(Boolean),
                groupingsDown: [{
                    name: findField(['ASSIGNED', 'TASK.ASSIGNED', 'OWNER_NAME']),
                    sortOrder: 'ASC'
                }],
                aggregates: [{ name: 'RowCount' }],
                filters: [
                    {
                        column: findField(['TYPE', 'TASK.TYPE', 'TASK_SUBTYPE']),
                        operator: 'equals',
                        value: 'Call'
                    },
                    {
                        column: findField(['DUE_DATE', 'CREATED_DATE']),
                        operator: 'equals',
                        value: 'LAST_N_DAYS:90'  // Correct format!
                    }
                ]
            },
            {
                name: 'Talk Time Analysis',
                format: 'SUMMARY',
                columns: [
                    findField(['SUBJECT', 'TASK.SUBJECT']),
                    findField(['DURATION', 'CALL_DURATION', 'CallDurationInSeconds'])
                ].filter(Boolean),
                groupingsDown: [{
                    name: findField(['ASSIGNED', 'TASK.ASSIGNED', 'OWNER_NAME']),
                    sortOrder: 'DESC'
                }],
                aggregates: [
                    { name: 'RowCount' }
                ],
                filters: [{
                    column: findField(['TYPE', 'TASK.TYPE', 'TASK_SUBTYPE']),
                    operator: 'equals',
                    value: 'Call'
                }]
            }
        ];
        
        // Create each report
        for (const reportDef of reports) {
            console.log(`\nCreating: ${reportDef.name}`);
            
            try {
                // Build metadata
                const metadata = {
                    name: reportDef.name,
                    reportType: { type: taskReportType },
                    reportFormat: reportDef.format,
                    folderId: folderId,
                    detailColumns: reportDef.columns || []
                };
                
                // Add groupings if present
                if (reportDef.groupingsDown) {
                    metadata.groupingsDown = reportDef.groupingsDown.filter(g => g.name);
                }
                if (reportDef.groupingsAcross) {
                    metadata.groupingsAcross = reportDef.groupingsAcross.filter(g => g.name);
                }
                
                // Add filters if present
                if (reportDef.filters) {
                    metadata.reportFilters = reportDef.filters.filter(f => f.column);
                }
                
                // Add aggregates if present
                if (reportDef.aggregates) {
                    metadata.aggregates = reportDef.aggregates;
                }
                
                // Validate first
                console.log('  Validating...');
                const validation = await api.validateReportMetadata(metadata);
                
                if (!validation.valid) {
                    console.log(`  ⚠️  Validation warning: ${validation.message}`);
                    console.log('  Attempting to create anyway...');
                }
                
                // Create report
                const result = await api.createReport(metadata);
                console.log(`  ✅ Created: ${result.reportId}`);
                console.log(`  📊 View at: ${result.url}`);
                
            } catch (error) {
                console.log(`  ❌ Failed: ${error.message}`);
                
                // Try simplified version
                console.log('  Trying simplified version...');
                try {
                    const simple = {
                        name: reportDef.name + '_Simple',
                        reportType: { type: taskReportType },
                        reportFormat: 'TABULAR',
                        folderId: folderId,
                        detailColumns: availableFields.slice(0, 5)
                    };
                    
                    const result = await api.createReport(simple);
                    console.log(`  ✅ Created simplified: ${result.reportId}`);
                } catch (simpleError) {
                    console.log(`  ❌ Simple also failed: ${simpleError.message}`);
                }
            }
        }
        
        console.log('\n✅ Activity report creation complete!');
        
    } catch (error) {
        console.error('Fatal error:', error.message);
        process.exit(1);
    }
}

// Run
createActivityReports();