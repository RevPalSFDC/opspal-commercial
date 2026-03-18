#!/usr/bin/env node

/**
 * Discover Task/Activity Report Types
 * Finds the correct report type name for creating task/activity reports
 */

const ReportsRestAPI = require('./lib/reports-rest-api');

async function discoverTaskReportTypes() {
    const org = process.env.ORG;
    if (!org) {
        console.error('Set ORG environment variable first');
        process.exit(1);
    }

    console.log(`\nDiscovering report types in ${org}...\n`);

    try {
        // Initialize API
        const api = await ReportsRestAPI.fromSFAuth(org);
        
        // Get all report types
        const allTypes = await api.getReportTypes();
        
        // Find task/activity related types
        const taskPatterns = [
            'task', 'activity', 'activities', 'call', 'event', 
            'meeting', 'email', 'todo', 'action'
        ];
        
        const matches = [];
        
        for (const type of allTypes) {
            const typeLower = (type.type || '').toLowerCase();
            const labelLower = (type.label || '').toLowerCase();
            
            for (const pattern of taskPatterns) {
                if (typeLower.includes(pattern) || labelLower.includes(pattern)) {
                    matches.push({
                        type: type.type,
                        label: type.label,
                        category: type.category,
                        pattern: pattern
                    });
                    break;
                }
            }
        }
        
        console.log('Found Task/Activity Report Types:');
        console.log('═'.repeat(60));
        
        if (matches.length === 0) {
            console.log('❌ No task/activity report types found');
            console.log('\nTrying alternative: Looking for "Task" object reports...');
            
            // Try finding Task as a standard object
            const taskType = allTypes.find(t => t.type === 'Task');
            if (taskType) {
                console.log(`✓ Found: ${taskType.type} - ${taskType.label}`);
                matches.push(taskType);
            }
        } else {
            // Sort by relevance
            matches.sort((a, b) => {
                // Prioritize exact matches
                if (a.type === 'Task') return -1;
                if (b.type === 'Task') return 1;
                if (a.type === 'Activity') return -1;
                if (b.type === 'Activity') return 1;
                return 0;
            });
            
            matches.forEach(match => {
                console.log(`✓ Type: "${match.type}"`);
                console.log(`  Label: ${match.label}`);
                console.log(`  Category: ${match.category || 'N/A'}`);
                console.log();
            });
        }
        
        // Describe the most likely type to get fields
        if (matches.length > 0) {
            const bestMatch = matches[0];
            console.log(`\nDescribing best match: ${bestMatch.type}`);
            console.log('═'.repeat(60));
            
            try {
                const description = await api.describeReportType(bestMatch.type);
                
                // Show key fields
                const keyFields = description.fields.filter(f => {
                    const token = f.token.toLowerCase();
                    return token.includes('subject') ||
                           token.includes('who') ||
                           token.includes('what') ||
                           token.includes('status') ||
                           token.includes('due') ||
                           token.includes('owner') ||
                           token.includes('assigned');
                }).slice(0, 10);
                
                console.log('Key Fields Available:');
                keyFields.forEach(field => {
                    console.log(`  • ${field.token} (${field.label})`);
                });
                
                console.log(`\n✅ SOLUTION: Use report type "${bestMatch.type}"`);
                console.log('\nExample metadata for this type:');
                console.log(JSON.stringify({
                    reportMetadata: {
                        name: "Task Report",
                        reportType: { type: bestMatch.type },
                        reportFormat: "TABULAR",
                        detailColumns: keyFields.slice(0, 5).map(f => f.token)
                    }
                }, null, 2));
                
            } catch (error) {
                console.error(`Could not describe ${bestMatch.type}: ${error.message}`);
            }
        }
        
        // Also check for custom task/activity objects
        console.log('\n\nChecking for custom task-related objects:');
        console.log('═'.repeat(60));
        
        const customTaskTypes = allTypes.filter(t => 
            t.type.includes('__c') && 
            (t.label.toLowerCase().includes('task') || 
             t.label.toLowerCase().includes('activity'))
        );
        
        if (customTaskTypes.length > 0) {
            customTaskTypes.forEach(type => {
                console.log(`✓ Custom: ${type.type} - ${type.label}`);
            });
        } else {
            console.log('No custom task/activity objects found');
        }
        
    } catch (error) {
        console.error('Error:', error.message);
    }
}

// Run discovery
discoverTaskReportTypes();