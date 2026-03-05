#!/usr/bin/env node

/**
 * Gong Report Builder
 * Generates report specifications and formulas for Gong reporting in Salesforce
 * Works around the limitation of no custom field creation by using report formulas
 */

const fs = require('fs');
const path = require('path');

// Report templates for different Gong report types
const REPORT_TEMPLATES = {
    activeDealCoverage: {
        name: 'Active Deal Gong Coverage',
        reportType: 'Gong__Opportunities_with_Gong_Conversations_and_contacts',
        description: 'Shows opportunities with recent Gong activity and coverage metrics',
        filters: [
            { field: 'Opportunity.StageName', operator: 'not equal to', value: 'Closed Won,Closed Lost' },
            { field: 'Gong__Gong_Call__c.Gong__Call_Start__c', operator: 'equals', value: 'LAST_N_DAYS:14' }
        ],
        columns: [
            'Opportunity.Name',
            'Opportunity.StageName',
            'Opportunity.Amount',
            'Opportunity.CloseDate',
            'Gong__Gong_Call__c.Gong__Call_Start__c',
            'Gong__Gong_Call__c.Gong__Call_Duration__c',
            'Contact.Name',
            'Contact.Title'
        ],
        groupings: ['Opportunity.Name'],
        formulas: [
            {
                name: 'Days_Since_Last_Call',
                formula: 'TODAY() - MAX(Gong__Gong_Call__c.Gong__Call_Start__c)',
                dataType: 'Number',
                description: 'Number of days since last Gong call'
            },
            {
                name: 'Coverage_Score',
                formula: 'IF(COUNT(Gong__Gong_Call__c.Id) > 3, 100, (COUNT(Gong__Gong_Call__c.Id) / 3) * 100)',
                dataType: 'Percent',
                description: 'Coverage score based on number of calls'
            }
        ],
        chartConfig: {
            type: 'donut',
            title: 'Deal Coverage Distribution',
            grouping: 'Coverage_Score'
        }
    },

    multiThreadingAnalysis: {
        name: 'Multi-Threading Index Report',
        reportType: 'Gong__Opportunities_with_Gong_Conversations_and_contacts',
        description: 'Analyzes participant diversity and engagement depth',
        filters: [
            { field: 'Opportunity.StageName', operator: 'not equal to', value: 'Closed Won,Closed Lost' }
        ],
        columns: [
            'Opportunity.Name',
            'Opportunity.Amount',
            'Contact.Name',
            'Contact.Email',
            'Contact.Title',
            'Gong__Gong_Call__c.Gong__Call_Start__c'
        ],
        groupings: ['Opportunity.Name', 'Contact.Email'],
        formulas: [
            {
                name: 'Unique_Participants',
                formula: 'COUNT_DISTINCT(Contact.Email)',
                dataType: 'Number',
                description: 'Number of unique participants'
            },
            {
                name: 'Threading_Score',
                formula: 'IF(COUNT_DISTINCT(Contact.Email) >= 5, "High", IF(COUNT_DISTINCT(Contact.Email) >= 3, "Medium", "Low"))',
                dataType: 'Text',
                description: 'Multi-threading engagement level'
            },
            {
                name: 'Executive_Engaged',
                formula: 'IF(MAX(IF(CONTAINS(Contact.Title, "VP") || CONTAINS(Contact.Title, "Chief") || CONTAINS(Contact.Title, "Director"), 1, 0)) = 1, "Yes", "No")',
                dataType: 'Text',
                description: 'Executive engagement flag'
            }
        ],
        chartConfig: {
            type: 'bar',
            title: 'Multi-Threading Distribution',
            grouping: 'Threading_Score'
        }
    },

    pricingIntensity: {
        name: 'Pricing Discussion Intensity',
        reportType: 'Gong__Topics_appearing_in_Opportunities',
        description: 'Tracks pricing and negotiation discussion intensity',
        filters: [
            { field: 'Gong__Gong_Topic__c.Gong__Topic_Name__c', operator: 'equals', value: 'Pricing' },
            { field: 'Opportunity.StageName', operator: 'not equal to', value: 'Closed Won,Closed Lost' }
        ],
        columns: [
            'Opportunity.Name',
            'Opportunity.StageName',
            'Opportunity.Amount',
            'Gong__Gong_Topic__c.Gong__Topic_Name__c',
            'Gong__Topic_Duration_Percent__c',
            'Gong__Topic_Occurrences__c'
        ],
        groupings: ['Opportunity.Name'],
        formulas: [
            {
                name: 'Pricing_Intensity_Score',
                formula: 'Gong__Topic_Duration_Percent__c * Gong__Topic_Occurrences__c',
                dataType: 'Number',
                description: 'Composite pricing discussion intensity'
            },
            {
                name: 'Negotiation_Stage',
                formula: 'IF(Gong__Topic_Duration_Percent__c > 20, "Active Negotiation", IF(Gong__Topic_Duration_Percent__c > 10, "Price Discovery", "Early Stage"))',
                dataType: 'Text',
                description: 'Stage of pricing negotiation'
            }
        ],
        chartConfig: {
            type: 'scatter',
            title: 'Pricing Intensity vs Deal Size',
            xAxis: 'Opportunity.Amount',
            yAxis: 'Pricing_Intensity_Score'
        }
    },

    trackerTrends: {
        name: 'Gong Tracker Trends Analysis',
        reportType: 'Gong__Opportunities_with_Gong_Trackers',
        description: 'Analyzes tracker occurrence trends over time',
        filters: [
            { field: 'Gong__Gong_Call__c.Gong__Call_Start__c', operator: 'equals', value: 'LAST_N_DAYS:30' }
        ],
        columns: [
            'Opportunity.Name',
            'Gong__Gong_Tracker__c.Gong__Tracker_Name__c',
            'Gong__Tracker_Occurrences__c',
            'Gong__Gong_Call__c.Gong__Call_Start__c'
        ],
        groupings: ['Gong__Gong_Tracker__c.Gong__Tracker_Name__c', 'WEEK(Gong__Gong_Call__c.Gong__Call_Start__c)'],
        formulas: [
            {
                name: 'Weekly_Tracker_Velocity',
                formula: 'SUM(Gong__Tracker_Occurrences__c)',
                dataType: 'Number',
                description: 'Total tracker occurrences per week'
            },
            {
                name: 'Tracker_Trend',
                formula: 'IF(SUM(Gong__Tracker_Occurrences__c) > PREVGROUPVAL(SUM(Gong__Tracker_Occurrences__c), 1), "Increasing", "Decreasing")',
                dataType: 'Text',
                description: 'Week-over-week trend'
            }
        ],
        chartConfig: {
            type: 'line',
            title: 'Tracker Trends Over Time',
            xAxis: 'WEEK(Gong__Gong_Call__c.Gong__Call_Start__c)',
            yAxis: 'Weekly_Tracker_Velocity'
        }
    },

    dealsWithoutActivity: {
        name: 'Deals Without Recent Gong Activity',
        reportType: 'Gong__Opportunities_with_Gong_Conversations_and_contacts',
        description: 'Identifies opportunities lacking recent customer engagement',
        filters: [
            { field: 'Opportunity.StageName', operator: 'not equal to', value: 'Closed Won,Closed Lost' },
            { field: 'Opportunity.CloseDate', operator: 'greater or equal', value: 'TODAY' }
        ],
        columns: [
            'Opportunity.Name',
            'Opportunity.StageName',
            'Opportunity.Amount',
            'Opportunity.CloseDate',
            'Opportunity.Owner.Name',
            'Gong__Gong_Call__c.Gong__Call_Start__c'
        ],
        groupings: ['Opportunity.Name'],
        formulas: [
            {
                name: 'Days_Without_Activity',
                formula: 'IF(ISBLANK(MAX(Gong__Gong_Call__c.Gong__Call_Start__c)), 999, TODAY() - MAX(Gong__Gong_Call__c.Gong__Call_Start__c))',
                dataType: 'Number',
                description: 'Days since last Gong activity'
            },
            {
                name: 'Risk_Level',
                formula: 'IF(Days_Without_Activity > 30, "High Risk", IF(Days_Without_Activity > 14, "Medium Risk", "Low Risk"))',
                dataType: 'Text',
                description: 'Deal risk based on activity gap'
            },
            {
                name: 'Days_Until_Close',
                formula: 'Opportunity.CloseDate - TODAY()',
                dataType: 'Number',
                description: 'Days remaining until close date'
            }
        ],
        sortBy: 'Days_Without_Activity',
        sortOrder: 'DESC',
        chartConfig: {
            type: 'heatmap',
            title: 'Deal Risk Heat Map',
            metric: 'Risk_Level'
        }
    },

    nextStepsCompletion: {
        name: 'Next Steps Tracker Completion',
        reportType: 'Gong__Opportunities_with_Gong_Trackers',
        description: 'Tracks completion and follow-through on next steps',
        filters: [
            { field: 'Gong__Gong_Tracker__c.Gong__Tracker_Name__c', operator: 'equals', value: 'Next Steps' }
        ],
        columns: [
            'Opportunity.Name',
            'Opportunity.StageName',
            'Gong__Tracker_Occurrences__c',
            'Gong__Gong_Call__c.Gong__Call_Start__c',
            'Opportunity.LastActivityDate'
        ],
        groupings: ['Opportunity.Name', 'MONTH(Gong__Gong_Call__c.Gong__Call_Start__c)'],
        formulas: [
            {
                name: 'Next_Steps_Velocity',
                formula: 'SUM(Gong__Tracker_Occurrences__c) / COUNT_DISTINCT(Gong__Gong_Call__c.Id)',
                dataType: 'Number',
                description: 'Average next steps per call'
            },
            {
                name: 'Follow_Through_Score',
                formula: 'IF(Opportunity.LastActivityDate > MAX(Gong__Gong_Call__c.Gong__Call_Start__c), 100, 0)',
                dataType: 'Percent',
                description: 'Whether follow-up occurred after next steps'
            }
        ],
        chartConfig: {
            type: 'gauge',
            title: 'Next Steps Follow-Through Rate',
            metric: 'AVG(Follow_Through_Score)'
        }
    }
};

/**
 * Generate report specification
 */
function generateReportSpec(templateName) {
    const template = REPORT_TEMPLATES[templateName];
    if (!template) {
        throw new Error(`Template '${templateName}' not found`);
    }

    const spec = {
        metadata: {
            name: template.name,
            description: template.description,
            reportType: template.reportType,
            format: 'Tabular',
            scope: 'organization',
            showDetails: true,
            generatedAt: new Date().toISOString()
        },
        structure: {
            columns: template.columns,
            filters: template.filters,
            groupings: template.groupings || [],
            sortBy: template.sortBy || template.columns[0],
            sortOrder: template.sortOrder || 'ASC'
        },
        formulas: template.formulas || [],
        visualization: template.chartConfig || null,
        manualInstructions: generateManualInstructions(template)
    };

    return spec;
}

/**
 * Generate manual creation instructions
 */
function generateManualInstructions(template) {
    const instructions = [
        `### Creating "${template.name}" Report`,
        '',
        '**Step 1: Navigate to Reports**',
        '1. Go to Reports tab in Salesforce',
        '2. Click "New Report"',
        `3. Select report type: "${template.reportType}"`,
        '4. Click "Continue"',
        '',
        '**Step 2: Configure Filters**'
    ];

    template.filters.forEach((filter, index) => {
        instructions.push(`${index + 1}. Add filter: ${filter.field} ${filter.operator} "${filter.value}"`);
    });

    instructions.push('', '**Step 3: Add Columns**');
    template.columns.forEach((column, index) => {
        instructions.push(`${index + 1}. Add column: ${column}`);
    });

    if (template.groupings && template.groupings.length > 0) {
        instructions.push('', '**Step 4: Configure Groupings**');
        template.groupings.forEach((grouping, index) => {
            instructions.push(`${index + 1}. Group by: ${grouping}`);
        });
    }

    if (template.formulas && template.formulas.length > 0) {
        instructions.push('', '**Step 5: Add Custom Summary Formulas**');
        template.formulas.forEach((formula, index) => {
            instructions.push(`${index + 1}. Create formula:`);
            instructions.push(`   - Name: ${formula.name}`);
            instructions.push(`   - Formula: ${formula.formula}`);
            instructions.push(`   - Data Type: ${formula.dataType}`);
            instructions.push(`   - Description: ${formula.description}`);
        });
    }

    if (template.chartConfig) {
        instructions.push('', '**Step 6: Add Chart**');
        instructions.push(`1. Click "Add Chart"`);
        instructions.push(`2. Select chart type: ${template.chartConfig.type}`);
        instructions.push(`3. Configure as: ${template.chartConfig.title}`);
    }

    instructions.push('', '**Step 7: Save Report**');
    instructions.push(`1. Click "Save"`);
    instructions.push(`2. Name: ${template.name}`);
    instructions.push(`3. Folder: Gong Reports`);
    instructions.push(`4. Click "Save and Run"`);

    return instructions.join('\n');
}

/**
 * Generate all report specifications
 */
function generateAllReports() {
    const reports = {};
    const summaryInstructions = [];

    for (const [key, template] of Object.entries(REPORT_TEMPLATES)) {
        reports[key] = generateReportSpec(key);
        summaryInstructions.push(`- ${template.name}`);
    }

    return {
        reports,
        summary: {
            totalReports: Object.keys(reports).length,
            reportTypes: [...new Set(Object.values(REPORT_TEMPLATES).map(t => t.reportType))],
            totalFormulas: Object.values(REPORT_TEMPLATES)
                .reduce((sum, t) => sum + (t.formulas ? t.formulas.length : 0), 0),
            generatedAt: new Date().toISOString(),
            reportList: summaryInstructions
        }
    };
}

/**
 * Export report specification to file
 */
function exportReportSpec(spec, outputPath) {
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(outputPath, JSON.stringify(spec, null, 2));
    console.log(`✅ Report specification exported to: ${outputPath}`);
}

/**
 * Generate markdown documentation
 */
function generateMarkdownDoc(specs) {
    const doc = [
        '# Gong Report Specifications',
        '',
        `Generated: ${new Date().toISOString()}`,
        '',
        '## Summary',
        `- Total Reports: ${specs.summary.totalReports}`,
        `- Total Formulas: ${specs.summary.totalFormulas}`,
        '',
        '## Report List',
        ...specs.summary.reportList,
        '',
        '---',
        ''
    ];

    for (const [key, spec] of Object.entries(specs.reports)) {
        doc.push(`## ${spec.metadata.name}`);
        doc.push('');
        doc.push(`**Description:** ${spec.metadata.description}`);
        doc.push(`**Report Type:** ${spec.metadata.reportType}`);
        doc.push('');
        
        if (spec.formulas && spec.formulas.length > 0) {
            doc.push('### Custom Formulas');
            spec.formulas.forEach(formula => {
                doc.push(`- **${formula.name}**: \`${formula.formula}\``);
                doc.push(`  - ${formula.description}`);
            });
            doc.push('');
        }

        doc.push('### Manual Creation Instructions');
        doc.push(spec.manualInstructions);
        doc.push('');
        doc.push('---');
        doc.push('');
    }

    return doc.join('\n');
}

/**
 * Main execution
 */
function main() {
    const args = process.argv.slice(2);
    const command = args[0] || 'all';
    const outputDir = args[1] || path.join(__dirname, '..', 'output', 'gong-reports');

    switch (command) {
        case 'all':
            // Generate all report specifications
            const allSpecs = generateAllReports();
            
            // Export JSON specification
            exportReportSpec(allSpecs, path.join(outputDir, 'gong-report-specs.json'));
            
            // Generate markdown documentation
            const markdown = generateMarkdownDoc(allSpecs);
            fs.writeFileSync(path.join(outputDir, 'GONG_REPORTS_MANUAL.md'), markdown);
            
            console.log(`✅ Generated ${allSpecs.summary.totalReports} report specifications`);
            console.log(`📁 Output directory: ${outputDir}`);
            break;

        case 'list':
            // List available templates
            console.log('Available Report Templates:');
            Object.keys(REPORT_TEMPLATES).forEach(key => {
                console.log(`  - ${key}: ${REPORT_TEMPLATES[key].name}`);
            });
            break;

        default:
            // Generate specific report
            if (REPORT_TEMPLATES[command]) {
                const spec = generateReportSpec(command);
                exportReportSpec(spec, path.join(outputDir, `${command}.json`));
                console.log(`✅ Generated report: ${spec.metadata.name}`);
            } else {
                console.error(`❌ Unknown command or template: ${command}`);
                console.log('Usage: node gong-report-builder.js [all|list|<template-name>] [output-dir]');
                process.exit(1);
            }
    }
}

// Export for use by other scripts
module.exports = {
    REPORT_TEMPLATES,
    generateReportSpec,
    generateAllReports,
    generateManualInstructions,
    generateMarkdownDoc
};

// Run if executed directly
if (require.main === module) {
    main();
}