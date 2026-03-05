#!/usr/bin/env node

/**
 * Gong List View Generator
 * Creates list view specifications for proactive deal management
 * Identifies gaps in Gong coverage and engagement issues
 */

const fs = require('fs');
const path = require('path');

// List view templates for different scenarios
const LIST_VIEW_TEMPLATES = {
    // Activity-based Views
    dealsWithoutRecentGongActivity: {
        name: 'No Gong Activity (14+ Days)',
        object: 'Opportunity',
        description: 'Open opportunities without Gong calls in the last 14 days',
        filters: [
            {
                field: 'StageName',
                operator: 'not equal to',
                value: 'Closed Won,Closed Lost'
            },
            {
                field: 'CloseDate',
                operator: 'greater or equal',
                value: 'TODAY'
            },
            {
                field: 'Gong__Last_Gong_Call_Date__c',
                operator: 'less than',
                value: 'LAST_N_DAYS:14',
                fallback: {
                    useFormula: true,
                    formula: 'TODAY() - Last_Activity_Date__c > 14'
                }
            }
        ],
        columns: [
            'Name',
            'Account.Name',
            'StageName',
            'Amount',
            'CloseDate',
            'Owner.Name',
            'LastActivityDate',
            'Gong__Last_Gong_Call_Date__c'
        ],
        sortBy: 'CloseDate',
        sortOrder: 'ASC',
        colorCoding: [
            { condition: 'CloseDate < TODAY + 7', color: 'red' },
            { condition: 'CloseDate < TODAY + 14', color: 'yellow' }
        ]
    },

    criticalDealsNoActivity: {
        name: 'Critical: No Activity (30+ Days)',
        object: 'Opportunity',
        description: 'High-value deals with no Gong activity for 30+ days',
        filters: [
            {
                field: 'StageName',
                operator: 'not equal to',
                value: 'Closed Won,Closed Lost'
            },
            {
                field: 'Amount',
                operator: 'greater than',
                value: '50000'
            },
            {
                field: 'Gong__Last_Gong_Call_Date__c',
                operator: 'less than',
                value: 'LAST_N_DAYS:30',
                fallback: {
                    useFormula: true,
                    formula: 'TODAY() - Last_Activity_Date__c > 30'
                }
            }
        ],
        columns: [
            'Name',
            'Account.Name',
            'Amount',
            'StageName',
            'CloseDate',
            'Owner.Name',
            'LastActivityDate'
        ],
        sortBy: 'Amount',
        sortOrder: 'DESC',
        alertSettings: {
            email: true,
            frequency: 'daily'
        }
    },

    upcomingClosesNoRecentActivity: {
        name: 'Closing Soon - Need Attention',
        object: 'Opportunity',
        description: 'Opportunities closing within 30 days without recent Gong activity',
        filters: [
            {
                field: 'CloseDate',
                operator: 'equals',
                value: 'NEXT_N_DAYS:30'
            },
            {
                field: 'StageName',
                operator: 'not equal to',
                value: 'Closed Won,Closed Lost'
            },
            {
                field: 'Gong__Last_Gong_Call_Date__c',
                operator: 'less than',
                value: 'LAST_N_DAYS:7'
            }
        ],
        columns: [
            'Name',
            'Account.Name',
            'StageName',
            'Amount',
            'CloseDate',
            'Days_Until_Close__c',
            'Owner.Name'
        ],
        sortBy: 'CloseDate',
        sortOrder: 'ASC',
        quickActions: ['Log a Call', 'Send Email', 'Create Task']
    },

    // Multi-threading Views
    singleThreadedDeals: {
        name: 'Single-Threaded Deals',
        object: 'Opportunity',
        description: 'Opportunities with only one contact engaged',
        filters: [
            {
                field: 'StageName',
                operator: 'not equal to',
                value: 'Closed Won,Closed Lost,Prospecting'
            },
            {
                field: 'Amount',
                operator: 'greater than',
                value: '25000'
            },
            {
                field: 'Gong__Unique_Participants__c',
                operator: 'less or equal',
                value: '1',
                fallback: {
                    useRelatedList: true,
                    relatedObject: 'OpportunityContactRole',
                    countCondition: '<= 1'
                }
            }
        ],
        columns: [
            'Name',
            'Account.Name',
            'Amount',
            'StageName',
            'Primary_Contact__c',
            'Gong__Unique_Participants__c',
            'Owner.Name'
        ],
        sortBy: 'Amount',
        sortOrder: 'DESC',
        actionableInsight: 'These deals need additional stakeholder engagement'
    },

    noExecutiveEngagement: {
        name: 'No Executive Engagement',
        object: 'Opportunity',
        description: 'Large deals without executive-level engagement',
        filters: [
            {
                field: 'Amount',
                operator: 'greater than',
                value: '100000'
            },
            {
                field: 'StageName',
                operator: 'in',
                value: 'Qualification,Needs Analysis,Value Proposition,Negotiation'
            },
            {
                field: 'Gong__Executive_Engaged__c',
                operator: 'equals',
                value: 'false',
                fallback: {
                    useQuery: true,
                    soql: 'SELECT Id FROM Opportunity WHERE Id NOT IN (SELECT OpportunityId FROM OpportunityContactRole WHERE Contact.Title LIKE \'%VP%\' OR Contact.Title LIKE \'%Chief%\' OR Contact.Title LIKE \'%Director%\')'
                }
            }
        ],
        columns: [
            'Name',
            'Account.Name',
            'Amount',
            'StageName',
            'CloseDate',
            'Contact_Roles__c',
            'Owner.Name'
        ],
        sortBy: 'Amount',
        sortOrder: 'DESC'
    },

    // Tracker-based Views
    noNextSteps: {
        name: 'Missing Next Steps',
        object: 'Opportunity',
        description: 'Active deals without clear next steps tracked',
        filters: [
            {
                field: 'StageName',
                operator: 'in',
                value: 'Qualification,Needs Analysis,Value Proposition'
            },
            {
                field: 'LastActivityDate',
                operator: 'equals',
                value: 'LAST_N_DAYS:7'
            },
            {
                field: 'Gong__Next_Steps_Count__c',
                operator: 'equals',
                value: '0',
                fallback: {
                    checkField: 'NextStep',
                    condition: 'is blank'
                }
            }
        ],
        columns: [
            'Name',
            'Account.Name',
            'StageName',
            'NextStep',
            'LastActivityDate',
            'Owner.Name'
        ],
        sortBy: 'LastActivityDate',
        sortOrder: 'DESC'
    },

    highCompetitorMentions: {
        name: 'High Competitor Activity',
        object: 'Opportunity',
        description: 'Deals with significant competitor mentions',
        filters: [
            {
                field: 'StageName',
                operator: 'not equal to',
                value: 'Closed Won,Closed Lost'
            },
            {
                field: 'Gong__Competitor_Mentions__c',
                operator: 'greater than',
                value: '5',
                fallback: {
                    useCustomMetric: true,
                    metric: 'CompetitorTrackerCount'
                }
            }
        ],
        columns: [
            'Name',
            'Account.Name',
            'StageName',
            'Amount',
            'Gong__Competitor_Mentions__c',
            'Competitor__c',
            'Owner.Name'
        ],
        sortBy: 'Gong__Competitor_Mentions__c',
        sortOrder: 'DESC',
        alertSettings: {
            chatter: true,
            notifyOwner: true
        }
    },

    // Stage-specific Views
    stuckInStage: {
        name: 'Stuck in Stage (30+ Days)',
        object: 'Opportunity',
        description: 'Opportunities stuck in the same stage for over 30 days',
        filters: [
            {
                field: 'StageName',
                operator: 'not in',
                value: 'Closed Won,Closed Lost,Prospecting'
            },
            {
                field: 'Stage_Duration_Days__c',
                operator: 'greater than',
                value: '30',
                fallback: {
                    useFormula: true,
                    formula: 'TODAY() - Last_Stage_Change_Date__c > 30'
                }
            }
        ],
        columns: [
            'Name',
            'Account.Name',
            'StageName',
            'Stage_Duration_Days__c',
            'Amount',
            'CloseDate',
            'Owner.Name'
        ],
        sortBy: 'Stage_Duration_Days__c',
        sortOrder: 'DESC'
    },

    negotiationWithoutPricing: {
        name: 'Negotiation - No Pricing Discussion',
        object: 'Opportunity',
        description: 'Deals in negotiation without pricing discussions',
        filters: [
            {
                field: 'StageName',
                operator: 'equals',
                value: 'Negotiation'
            },
            {
                field: 'Gong__Pricing_Discussion_Score__c',
                operator: 'less than',
                value: '10',
                fallback: {
                    checkTopic: 'Pricing',
                    minOccurrences: 0
                }
            }
        ],
        columns: [
            'Name',
            'Account.Name',
            'Amount',
            'CloseDate',
            'Gong__Pricing_Discussion_Score__c',
            'Owner.Name'
        ],
        sortBy: 'CloseDate',
        sortOrder: 'ASC'
    },

    // Team Performance Views
    myTeamLowActivity: {
        name: 'My Team - Low Gong Activity',
        object: 'Opportunity',
        description: 'Team opportunities with low Gong activity',
        filters: [
            {
                field: 'Owner.ManagerId',
                operator: 'equals',
                value: 'CURRENT_USER'
            },
            {
                field: 'StageName',
                operator: 'not equal to',
                value: 'Closed Won,Closed Lost'
            },
            {
                field: 'Gong__Call_Count_30_Days__c',
                operator: 'less than',
                value: '2'
            }
        ],
        columns: [
            'Name',
            'Account.Name',
            'Owner.Name',
            'StageName',
            'Amount',
            'Gong__Call_Count_30_Days__c',
            'LastActivityDate'
        ],
        sortBy: 'Owner.Name',
        sortOrder: 'ASC',
        groupBy: 'Owner.Name'
    }
};

/**
 * Generate list view specification
 */
function generateListViewSpec(templateName) {
    const template = LIST_VIEW_TEMPLATES[templateName];
    if (!template) {
        throw new Error(`Template '${templateName}' not found`);
    }

    const spec = {
        metadata: {
            fullName: template.name.replace(/\s+/g, '_'),
            label: template.name,
            description: template.description,
            object: template.object,
            filterScope: 'Everything',
            generatedAt: new Date().toISOString()
        },
        filters: processFilters(template.filters),
        columns: template.columns,
        sortBy: template.sortBy,
        sortOrder: template.sortOrder,
        additionalSettings: {
            colorCoding: template.colorCoding || [],
            quickActions: template.quickActions || [],
            alertSettings: template.alertSettings || {},
            actionableInsight: template.actionableInsight || null,
            groupBy: template.groupBy || null
        },
        manualInstructions: generateManualInstructions(template)
    };

    return spec;
}

/**
 * Process filters with fallback options
 */
function processFilters(filters) {
    return filters.map(filter => {
        const processed = {
            field: filter.field,
            operator: filter.operator,
            value: filter.value
        };

        if (filter.fallback) {
            processed.fallback = filter.fallback;
            processed.fallbackInstructions = generateFallbackInstructions(filter.fallback);
        }

        return processed;
    });
}

/**
 * Generate fallback instructions for filters
 */
function generateFallbackInstructions(fallback) {
    if (fallback.useFormula) {
        return `If field doesn't exist, use formula: ${fallback.formula}`;
    } else if (fallback.useRelatedList) {
        return `Count related ${fallback.relatedObject} records ${fallback.countCondition}`;
    } else if (fallback.useQuery) {
        return `Use SOQL query for advanced filtering`;
    } else if (fallback.checkField) {
        return `Check if ${fallback.checkField} field ${fallback.condition}`;
    }
    return 'Use alternative filtering method';
}

/**
 * Generate manual creation instructions
 */
function generateManualInstructions(template) {
    const instructions = [
        `### Creating "${template.name}" List View`,
        '',
        `**Object:** ${template.object}`,
        `**Description:** ${template.description}`,
        '',
        '**Step 1: Navigate to List Views**',
        `1. Go to ${template.object} tab`,
        '2. Click the gear icon → "New"',
        `3. Name: ${template.name}`,
        '4. API Name: Auto-populates',
        '5. Select "All users can see this list view"',
        '',
        '**Step 2: Set Filters**'
    ];

    template.filters.forEach((filter, index) => {
        instructions.push(`${index + 1}. Filter:`);
        instructions.push(`   - Field: ${filter.field}`);
        instructions.push(`   - Operator: ${filter.operator}`);
        instructions.push(`   - Value: ${filter.value}`);
        
        if (filter.fallback) {
            instructions.push(`   - Note: ${generateFallbackInstructions(filter.fallback)}`);
        }
    });

    instructions.push('', '**Step 3: Select Columns to Display**');
    template.columns.forEach((column, index) => {
        instructions.push(`${index + 1}. ${column}`);
    });

    instructions.push('', '**Step 4: Set Sort Order**');
    instructions.push(`- Sort by: ${template.sortBy}`);
    instructions.push(`- Order: ${template.sortOrder}`);

    if (template.colorCoding && template.colorCoding.length > 0) {
        instructions.push('', '**Step 5: Add Conditional Highlighting (Optional)**');
        template.colorCoding.forEach((rule, index) => {
            instructions.push(`${index + 1}. If ${rule.condition}, highlight in ${rule.color}`);
        });
    }

    if (template.quickActions && template.quickActions.length > 0) {
        instructions.push('', '**Step 6: Add Quick Actions**');
        template.quickActions.forEach((action, index) => {
            instructions.push(`${index + 1}. ${action}`);
        });
    }

    instructions.push('', '**Step 7: Save**');
    instructions.push('1. Click "Save"');
    instructions.push('2. The list view is now available');

    if (template.alertSettings && Object.keys(template.alertSettings).length > 0) {
        instructions.push('', '**Optional: Set Up Alerts**');
        if (template.alertSettings.email) {
            instructions.push('- Configure email alert for this view');
        }
        if (template.alertSettings.chatter) {
            instructions.push('- Post to Chatter when records appear');
        }
    }

    return instructions.join('\n');
}

/**
 * Generate all list view specifications
 */
function generateAllListViews() {
    const listViews = {};
    const categories = {
        activity: [],
        multiThreading: [],
        trackers: [],
        stageSpecific: [],
        teamPerformance: []
    };

    for (const [key, template] of Object.entries(LIST_VIEW_TEMPLATES)) {
        listViews[key] = generateListViewSpec(key);
        
        // Categorize
        if (key.includes('Activity') || key.includes('Recent')) {
            categories.activity.push(template.name);
        } else if (key.includes('Thread') || key.includes('Executive')) {
            categories.multiThreading.push(template.name);
        } else if (key.includes('Next') || key.includes('Competitor')) {
            categories.trackers.push(template.name);
        } else if (key.includes('Stage') || key.includes('Negotiation')) {
            categories.stageSpecific.push(template.name);
        } else if (key.includes('Team')) {
            categories.teamPerformance.push(template.name);
        }
    }

    return {
        listViews,
        summary: {
            totalViews: Object.keys(listViews).length,
            categories,
            generatedAt: new Date().toISOString()
        }
    };
}

/**
 * Main execution
 */
function main() {
    const args = process.argv.slice(2);
    const command = args[0] || 'help';

    switch (command) {
        case 'create':
            // Create specific list view
            const templateName = args[1];
            if (!templateName) {
                console.error('Please provide a template name');
                console.log('Available templates:', Object.keys(LIST_VIEW_TEMPLATES).join(', '));
                process.exit(1);
            }
            
            const spec = generateListViewSpec(templateName);
            const outputPath = args[2] || path.join(__dirname, '..', 'output', `${templateName}-listview.json`);
            
            const dir = path.dirname(outputPath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            
            fs.writeFileSync(outputPath, JSON.stringify(spec, null, 2));
            console.log(`✅ List view specification created: ${outputPath}`);
            break;

        case 'all':
            // Generate all list views
            const allViews = generateAllListViews();
            const allOutputPath = args[1] || path.join(__dirname, '..', 'output', 'gong-listviews');
            
            if (!fs.existsSync(allOutputPath)) {
                fs.mkdirSync(allOutputPath, { recursive: true });
            }
            
            // Save summary
            fs.writeFileSync(
                path.join(allOutputPath, 'listview-summary.json'),
                JSON.stringify(allViews.summary, null, 2)
            );
            
            // Save individual specs
            for (const [key, spec] of Object.entries(allViews.listViews)) {
                fs.writeFileSync(
                    path.join(allOutputPath, `${key}.json`),
                    JSON.stringify(spec, null, 2)
                );
            }
            
            console.log(`✅ Generated ${allViews.summary.totalViews} list view specifications`);
            console.log(`📁 Output directory: ${allOutputPath}`);
            break;

        case 'list':
            // List available templates
            console.log('Available List View Templates:\n');
            Object.entries(LIST_VIEW_TEMPLATES).forEach(([key, template]) => {
                console.log(`${key}:`);
                console.log(`  Name: ${template.name}`);
                console.log(`  Description: ${template.description}`);
                console.log('');
            });
            break;

        default:
            console.log(`
Gong List View Generator

Usage: node gong-list-view-generator.js [command] [args]

Commands:
  create <template> [output]  Create specific list view specification
  all [directory]             Generate all list view specifications
  list                        List available templates
  help                        Show this help message

Examples:
  node gong-list-view-generator.js create dealsWithoutRecentGongActivity
  node gong-list-view-generator.js all ./output/listviews
  node gong-list-view-generator.js list
            `);
    }
}

// Export for use by other scripts
module.exports = {
    LIST_VIEW_TEMPLATES,
    generateListViewSpec,
    generateAllListViews
};

// Run if executed directly
if (require.main === module) {
    main();
}