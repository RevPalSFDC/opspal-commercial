#!/usr/bin/env node

/**
 * Gong Dashboard Enhancer
 * Modifies existing Gong dashboards and creates component specifications
 * Works with existing dashboards to add new metrics without custom fields
 */

const fs = require('fs');
const path = require('path');

// Dashboard component templates
const DASHBOARD_COMPONENTS = {
    // Deal Activity Components
    dealCoverageGauge: {
        name: 'Deal Coverage Score',
        type: 'gauge',
        reportSource: 'Active Deal Gong Coverage',
        metric: 'Coverage_Score',
        ranges: [
            { min: 0, max: 33, color: '#FF0000', label: 'Low' },
            { min: 34, max: 66, color: '#FFA500', label: 'Medium' },
            { min: 67, max: 100, color: '#00FF00', label: 'High' }
        ],
        size: { width: 3, height: 3 },
        position: 'top-left'
    },

    dealsWithoutActivity: {
        name: 'Deals Without Recent Activity',
        type: 'table',
        reportSource: 'Deals Without Recent Gong Activity',
        columns: [
            'Opportunity.Name',
            'Days_Without_Activity',
            'Risk_Level',
            'Opportunity.Amount',
            'Days_Until_Close'
        ],
        sortBy: 'Days_Without_Activity',
        sortOrder: 'DESC',
        rowLimit: 10,
        conditionalFormatting: [
            { field: 'Risk_Level', value: 'High Risk', color: '#FF0000' },
            { field: 'Risk_Level', value: 'Medium Risk', color: '#FFA500' },
            { field: 'Days_Until_Close', condition: '< 14', color: '#FF0000' }
        ],
        size: { width: 6, height: 4 },
        position: 'top-right'
    },

    multiThreadingDistribution: {
        name: 'Multi-Threading Distribution',
        type: 'donut',
        reportSource: 'Multi-Threading Index Report',
        groupingField: 'Threading_Score',
        valueField: 'Record Count',
        colors: {
            'High': '#00FF00',
            'Medium': '#FFA500',
            'Low': '#FF0000'
        },
        showPercentages: true,
        size: { width: 3, height: 3 },
        position: 'middle-left'
    },

    // Tracker and Topic Components
    trackerTrendsChart: {
        name: 'Tracker Trends (30 Days)',
        type: 'line',
        reportSource: 'Gong Tracker Trends Analysis',
        xAxis: 'Week',
        yAxis: 'Weekly_Tracker_Velocity',
        series: ['Next Steps', 'BANT', 'Competitor', 'Pricing'],
        showDataLabels: false,
        showLegend: true,
        size: { width: 6, height: 4 },
        position: 'middle-center'
    },

    pricingIntensityScatter: {
        name: 'Pricing Discussion vs Deal Size',
        type: 'scatter',
        reportSource: 'Pricing Discussion Intensity',
        xAxis: 'Opportunity.Amount',
        yAxis: 'Pricing_Intensity_Score',
        bubbleSize: 'Gong__Topic_Occurrences__c',
        colorField: 'Negotiation_Stage',
        colors: {
            'Active Negotiation': '#FF0000',
            'Price Discovery': '#FFA500',
            'Early Stage': '#00FF00'
        },
        size: { width: 6, height: 4 },
        position: 'bottom-left'
    },

    // Engagement Quality Components
    executiveEngagementMetric: {
        name: 'Executive Engagement',
        type: 'metric',
        reportSource: 'Multi-Threading Index Report',
        calculation: 'PERCENT(COUNT(Executive_Engaged = "Yes") / COUNT(*))',
        format: 'percent',
        targetValue: 75,
        showTrend: true,
        size: { width: 2, height: 2 },
        position: 'top-center'
    },

    averageParticipants: {
        name: 'Avg Participants per Deal',
        type: 'metric',
        reportSource: 'Multi-Threading Index Report',
        calculation: 'AVG(Unique_Participants)',
        format: 'number',
        decimals: 1,
        targetValue: 3.5,
        showTrend: true,
        size: { width: 2, height: 2 },
        position: 'top-center'
    },

    nextStepsCompletion: {
        name: 'Next Steps Follow-Through',
        type: 'gauge',
        reportSource: 'Next Steps Tracker Completion',
        metric: 'AVG(Follow_Through_Score)',
        ranges: [
            { min: 0, max: 50, color: '#FF0000', label: 'Poor' },
            { min: 51, max: 75, color: '#FFA500', label: 'Fair' },
            { min: 76, max: 100, color: '#00FF00', label: 'Good' }
        ],
        size: { width: 3, height: 3 },
        position: 'middle-right'
    },

    // Deal Health Components
    dealHealthHeatmap: {
        name: 'Deal Health Heat Map',
        type: 'heatmap',
        reportSource: 'Deal Health Composite Score',
        rows: 'Opportunity.StageName',
        columns: 'Health_Score_Range',
        metric: 'Record Count',
        colorScale: {
            low: '#FF0000',
            medium: '#FFA500',
            high: '#00FF00'
        },
        size: { width: 6, height: 4 },
        position: 'bottom-center'
    },

    activityGapAlert: {
        name: 'Activity Gap Alerts',
        type: 'list',
        reportSource: 'Deals Without Recent Gong Activity',
        filter: 'Risk_Level = "Critical" OR Risk_Level = "High"',
        displayFields: ['Opportunity.Name', 'Days_Without_Activity', 'Owner.Name'],
        actionLinks: [
            { label: 'Schedule Call', action: 'task' },
            { label: 'View Opportunity', action: 'record' }
        ],
        highlightColor: '#FF0000',
        size: { width: 4, height: 3 },
        position: 'bottom-right'
    }
};

// Dashboard layouts for different use cases
const DASHBOARD_LAYOUTS = {
    dealActivity: {
        name: 'Gong Deal Activity Dashboard',
        description: 'Comprehensive view of deal activity and coverage',
        components: [
            'dealCoverageGauge',
            'dealsWithoutActivity',
            'executiveEngagementMetric',
            'averageParticipants',
            'activityGapAlert',
            'dealHealthHeatmap'
        ],
        filters: [
            { field: 'Opportunity.StageName', operator: 'not equal to', value: 'Closed Won,Closed Lost' },
            { field: 'Opportunity.CloseDate', operator: 'greater or equal', value: 'THIS_QUARTER' }
        ],
        refreshInterval: 3600 // 1 hour in seconds
    },

    competitiveIntelligence: {
        name: 'Gong Competitive Intelligence',
        description: 'Tracker and topic analysis for competitive insights',
        components: [
            'trackerTrendsChart',
            'pricingIntensityScatter',
            'multiThreadingDistribution'
        ],
        filters: [
            { field: 'Opportunity.Type', operator: 'equals', value: 'New Business' }
        ],
        refreshInterval: 7200 // 2 hours
    },

    engagementQuality: {
        name: 'Gong Engagement Quality',
        description: 'Quality metrics for customer engagement',
        components: [
            'multiThreadingDistribution',
            'executiveEngagementMetric',
            'averageParticipants',
            'nextStepsCompletion'
        ],
        filters: [
            { field: 'Opportunity.Amount', operator: 'greater than', value: '50000' }
        ],
        refreshInterval: 14400 // 4 hours
    }
};

/**
 * Generate dashboard specification
 */
function generateDashboardSpec(layoutName) {
    const layout = DASHBOARD_LAYOUTS[layoutName];
    if (!layout) {
        throw new Error(`Layout '${layoutName}' not found`);
    }

    const spec = {
        metadata: {
            name: layout.name,
            description: layout.description,
            folder: 'Gong Dashboards',
            runningUser: 'viewer',
            refreshInterval: layout.refreshInterval,
            generatedAt: new Date().toISOString()
        },
        components: [],
        filters: layout.filters || [],
        layout: {
            columns: 12,
            rows: 12
        }
    };

    // Add component specifications
    for (const componentName of layout.components) {
        const component = DASHBOARD_COMPONENTS[componentName];
        if (component) {
            spec.components.push({
                ...component,
                id: `component_${spec.components.length + 1}`
            });
        }
    }

    return spec;
}

/**
 * Generate enhancement plan for existing dashboard
 */
function generateEnhancementPlan(existingDashboardName, componentsToAdd) {
    const plan = {
        targetDashboard: existingDashboardName,
        enhancements: [],
        instructions: [],
        estimatedTime: 0
    };

    for (const componentName of componentsToAdd) {
        const component = DASHBOARD_COMPONENTS[componentName];
        if (component) {
            plan.enhancements.push({
                component: component.name,
                type: component.type,
                reportRequired: component.reportSource,
                position: component.position
            });
            plan.estimatedTime += 5; // 5 minutes per component
        }
    }

    // Generate step-by-step instructions
    plan.instructions = generateEnhancementInstructions(existingDashboardName, plan.enhancements);

    return plan;
}

/**
 * Generate manual enhancement instructions
 */
function generateEnhancementInstructions(dashboardName, enhancements) {
    const instructions = [
        `### Enhancing "${dashboardName}" Dashboard`,
        '',
        '**Prerequisites:**',
        '1. Ensure all required reports are created',
        '2. Have edit access to the dashboard',
        '3. Dashboard is not locked',
        '',
        '**Step 1: Open Dashboard for Editing**',
        `1. Navigate to the "${dashboardName}" dashboard`,
        '2. Click the dropdown arrow → Edit Dashboard',
        '3. The dashboard opens in edit mode',
        ''
    ];

    enhancements.forEach((enhancement, index) => {
        instructions.push(`**Step ${index + 2}: Add ${enhancement.component}**`);
        instructions.push(`1. Click "+ Component" button`);
        instructions.push(`2. Select component type: ${enhancement.type}`);
        instructions.push(`3. Choose source report: "${enhancement.reportRequired}"`);
        instructions.push(`4. Configure the component settings`);
        instructions.push(`5. Position in ${enhancement.position} area`);
        instructions.push(`6. Resize as needed`);
        instructions.push('');
    });

    instructions.push('**Final Steps:**');
    instructions.push('1. Review dashboard layout');
    instructions.push('2. Test all filters work correctly');
    instructions.push('3. Click "Save"');
    instructions.push('4. Click "Done" to exit edit mode');

    return instructions.join('\n');
}

/**
 * Generate component JSON for API creation
 */
function generateComponentJSON(component) {
    const json = {
        componentType: component.type.toUpperCase(),
        reportId: `[REPORT_ID_FOR_${component.reportSource.replace(/\s+/g, '_').toUpperCase()}]`,
        properties: {
            title: component.name,
            showTitle: true,
            showFooter: false
        }
    };

    // Add type-specific properties
    switch (component.type) {
        case 'gauge':
            json.properties.gaugeMin = 0;
            json.properties.gaugeMax = 100;
            json.properties.ranges = component.ranges;
            break;
        
        case 'table':
            json.properties.columns = component.columns;
            json.properties.sortBy = component.sortBy;
            json.properties.sortOrder = component.sortOrder;
            json.properties.rowLimit = component.rowLimit;
            break;
        
        case 'donut':
        case 'pie':
            json.properties.showPercentages = component.showPercentages;
            json.properties.showLegend = true;
            break;
        
        case 'line':
        case 'bar':
            json.properties.showDataLabels = component.showDataLabels;
            json.properties.showLegend = component.showLegend;
            break;
        
        case 'metric':
            json.properties.metricFormat = component.format;
            json.properties.targetValue = component.targetValue;
            json.properties.showTrend = component.showTrend;
            break;
    }

    json.gridLayout = {
        columns: component.size.width,
        rows: component.size.height
    };

    return json;
}

/**
 * Main execution
 */
function main() {
    const args = process.argv.slice(2);
    const command = args[0] || 'help';

    switch (command) {
        case 'create':
            // Create new dashboard specification
            const layoutName = args[1];
            if (!layoutName) {
                console.error('Please provide a layout name');
                console.log('Available layouts:', Object.keys(DASHBOARD_LAYOUTS).join(', '));
                process.exit(1);
            }
            
            const spec = generateDashboardSpec(layoutName);
            const outputPath = args[2] || path.join(__dirname, '..', 'output', `${layoutName}-dashboard.json`);
            
            const dir = path.dirname(outputPath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            
            fs.writeFileSync(outputPath, JSON.stringify(spec, null, 2));
            console.log(`✅ Dashboard specification created: ${outputPath}`);
            break;

        case 'enhance':
            // Generate enhancement plan
            const dashboardName = args[1];
            const components = args.slice(2);
            
            if (!dashboardName || components.length === 0) {
                console.error('Usage: enhance <dashboard-name> <component1> [component2] ...');
                console.log('Available components:', Object.keys(DASHBOARD_COMPONENTS).join(', '));
                process.exit(1);
            }
            
            const plan = generateEnhancementPlan(dashboardName, components);
            console.log(plan.instructions);
            console.log(`\n⏱️  Estimated time: ${plan.estimatedTime} minutes`);
            break;

        case 'list':
            // List available components and layouts
            console.log('Available Dashboard Layouts:');
            Object.entries(DASHBOARD_LAYOUTS).forEach(([key, layout]) => {
                console.log(`  ${key}: ${layout.description}`);
            });
            
            console.log('\nAvailable Components:');
            Object.entries(DASHBOARD_COMPONENTS).forEach(([key, component]) => {
                console.log(`  ${key}: ${component.name} (${component.type})`);
            });
            break;

        case 'export-all':
            // Export all dashboard specifications
            const outputDir = args[1] || path.join(__dirname, '..', 'output', 'dashboards');
            
            if (!fs.existsSync(outputDir)) {
                fs.mkdirSync(outputDir, { recursive: true });
            }
            
            for (const layoutName of Object.keys(DASHBOARD_LAYOUTS)) {
                const spec = generateDashboardSpec(layoutName);
                const filePath = path.join(outputDir, `${layoutName}-dashboard.json`);
                fs.writeFileSync(filePath, JSON.stringify(spec, null, 2));
                console.log(`✅ Created: ${filePath}`);
            }
            
            console.log(`\n📁 All dashboards exported to: ${outputDir}`);
            break;

        default:
            console.log(`
Gong Dashboard Enhancer

Usage: node gong-dashboard-enhancer.js [command] [args]

Commands:
  create <layout> [output]     Create dashboard specification
  enhance <name> <components>  Generate enhancement plan for existing dashboard
  list                         List available layouts and components
  export-all [directory]       Export all dashboard specifications
  help                         Show this help message

Examples:
  node gong-dashboard-enhancer.js create dealActivity
  node gong-dashboard-enhancer.js enhance "Gong pipeline analysis" dealCoverageGauge activityGapAlert
  node gong-dashboard-enhancer.js export-all ./dashboards
            `);
    }
}

// Export for use by other scripts
module.exports = {
    DASHBOARD_COMPONENTS,
    DASHBOARD_LAYOUTS,
    generateDashboardSpec,
    generateEnhancementPlan,
    generateComponentJSON
};

// Run if executed directly
if (require.main === module) {
    main();
}