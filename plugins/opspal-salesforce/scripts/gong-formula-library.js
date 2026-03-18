#!/usr/bin/env node

/**
 * Gong Formula Library
 * Pre-built Salesforce report formulas for Gong metrics
 * Provides copy-paste ready formulas that work without custom fields
 */

const fs = require('fs');
const path = require('path');

// Formula library organized by category
const FORMULA_LIBRARY = {
    // Activity and Coverage Metrics
    activity: {
        daysSinceLastCall: {
            name: 'Days Since Last Gong Call',
            formula: 'TODAY() - MAX(Gong__Gong_Call__c.Gong__Call_Start__c)',
            dataType: 'Number',
            description: 'Number of days since the last Gong call on this opportunity',
            usage: 'Add as custom summary formula grouped by Opportunity'
        },
        
        callsLast14Days: {
            name: 'Calls in Last 14 Days',
            formula: 'IF(MAX(Gong__Gong_Call__c.Gong__Call_Start__c) >= TODAY() - 14, COUNT(Gong__Gong_Call__c.Id), 0)',
            dataType: 'Number',
            description: 'Count of calls in the last 14 days',
            usage: 'Helps identify active vs stale opportunities'
        },
        
        averageCallDuration: {
            name: 'Average Call Duration (Minutes)',
            formula: 'AVG(Gong__Gong_Call__c.Gong__Call_Duration__c) / 60',
            dataType: 'Number',
            description: 'Average duration of Gong calls in minutes',
            usage: 'Indicates engagement depth'
        },
        
        coverageScore: {
            name: 'Gong Coverage Score',
            formula: 'IF(COUNT(Gong__Gong_Call__c.Id) >= 5, 100, IF(COUNT(Gong__Gong_Call__c.Id) >= 3, 75, IF(COUNT(Gong__Gong_Call__c.Id) >= 1, 50, 0)))',
            dataType: 'Percent',
            description: 'Score based on number of Gong calls (0-100%)',
            usage: 'Traffic light scoring for deal coverage'
        },
        
        weeklyCallVelocity: {
            name: 'Weekly Call Velocity',
            formula: 'COUNT(Gong__Gong_Call__c.Id) / ((TODAY() - MIN(Gong__Gong_Call__c.Gong__Call_Start__c)) / 7)',
            dataType: 'Number',
            description: 'Average calls per week since first call',
            usage: 'Measures engagement velocity'
        }
    },

    // Multi-threading Metrics
    multiThreading: {
        uniqueParticipants: {
            name: 'Unique Participant Count',
            formula: 'COUNT_DISTINCT(Contact.Email)',
            dataType: 'Number',
            description: 'Number of unique contacts engaged',
            usage: 'Group by Opportunity to get participant count'
        },
        
        threadingLevel: {
            name: 'Multi-Threading Level',
            formula: 'IF(COUNT_DISTINCT(Contact.Email) >= 5, "Champion", IF(COUNT_DISTINCT(Contact.Email) >= 3, "Good", IF(COUNT_DISTINCT(Contact.Email) >= 2, "Fair", "Single-Threaded")))',
            dataType: 'Text',
            description: 'Categorizes multi-threading depth',
            usage: 'Quick visual indicator of relationship breadth'
        },
        
        executiveEngagement: {
            name: 'Executive Engaged',
            formula: 'IF(MAX(IF(CONTAINS(UPPER(Contact.Title), "VP") || CONTAINS(UPPER(Contact.Title), "CHIEF") || CONTAINS(UPPER(Contact.Title), "PRESIDENT") || CONTAINS(UPPER(Contact.Title), "DIRECTOR"), 1, 0)) = 1, "Yes", "No")',
            dataType: 'Text',
            description: 'Indicates if executives are engaged',
            usage: 'Critical for enterprise deals'
        },
        
        participantDiversity: {
            name: 'Department Diversity Score',
            formula: 'COUNT_DISTINCT(Contact.Department) * 20',
            dataType: 'Percent',
            description: 'Score based on department diversity (max 100%)',
            usage: 'Indicates cross-functional buy-in'
        },
        
        contactEngagementRatio: {
            name: 'Contact Engagement Ratio',
            formula: 'COUNT_DISTINCT(Contact.Id) / COUNT(Contact.Id)',
            dataType: 'Percent',
            description: 'Ratio of unique contacts to total interactions',
            usage: 'Higher ratio means broader engagement'
        }
    },

    // Conversation Quality Metrics
    conversationQuality: {
        talkRatio: {
            name: 'Customer Talk Ratio',
            formula: 'AVG(Gong__Gong_Call__c.Gong__Customer_Talk_Ratio__c)',
            dataType: 'Percent',
            description: 'Average customer talk time percentage',
            usage: 'Ideal range is 40-60% for discovery calls'
        },
        
        interactivityScore: {
            name: 'Call Interactivity Score',
            formula: 'IF(AVG(Gong__Gong_Call__c.Gong__Longest_Monologue__c) < 120, 100, IF(AVG(Gong__Gong_Call__c.Gong__Longest_Monologue__c) < 180, 75, 50))',
            dataType: 'Number',
            description: 'Score based on monologue length (shorter is better)',
            usage: 'Indicates conversation balance'
        },
        
        questionDensity: {
            name: 'Questions Per Call',
            formula: 'SUM(Gong__Gong_Call__c.Gong__Questions_Asked__c) / COUNT(Gong__Gong_Call__c.Id)',
            dataType: 'Number',
            description: 'Average questions asked per call',
            usage: 'Higher indicates discovery focus'
        },
        
        engagementTrend: {
            name: 'Engagement Trend',
            formula: 'IF(AVG(Gong__Gong_Call__c.Gong__Call_Duration__c) > PREVGROUPVAL(AVG(Gong__Gong_Call__c.Gong__Call_Duration__c), 1), "Increasing", "Decreasing")',
            dataType: 'Text',
            description: 'Trend in call duration over time',
            usage: 'Indicates growing or waning interest'
        }
    },

    // Tracker and Topic Metrics
    trackers: {
        nextStepsIntensity: {
            name: 'Next Steps Intensity',
            formula: 'SUM(IF(Gong__Gong_Tracker__c.Gong__Tracker_Name__c = "Next Steps", Gong__Tracker_Occurrences__c, 0)) / COUNT(Gong__Gong_Call__c.Id)',
            dataType: 'Number',
            description: 'Average next steps mentions per call',
            usage: 'Higher indicates action-oriented conversations'
        },
        
        competitorMentions: {
            name: 'Competitor Discussion Score',
            formula: 'SUM(IF(CONTAINS(Gong__Gong_Tracker__c.Gong__Tracker_Name__c, "Competitor"), Gong__Tracker_Occurrences__c, 0))',
            dataType: 'Number',
            description: 'Total competitor mentions across calls',
            usage: 'Indicates competitive pressure'
        },
        
        pricingIntensity: {
            name: 'Pricing Discussion Intensity',
            formula: '(SUM(IF(Gong__Gong_Topic__c.Gong__Topic_Name__c = "Pricing", Gong__Topic_Duration_Percent__c, 0)) * SUM(IF(Gong__Gong_Topic__c.Gong__Topic_Name__c = "Pricing", Gong__Topic_Occurrences__c, 0))) / 100',
            dataType: 'Number',
            description: 'Composite score of pricing discussion',
            usage: 'Higher score indicates active negotiation'
        },
        
        bantScore: {
            name: 'BANT Coverage Score',
            formula: '(IF(MAX(IF(CONTAINS(Gong__Gong_Tracker__c.Gong__Tracker_Name__c, "Budget"), 1, 0)) = 1, 25, 0) + IF(MAX(IF(CONTAINS(Gong__Gong_Tracker__c.Gong__Tracker_Name__c, "Authority"), 1, 0)) = 1, 25, 0) + IF(MAX(IF(CONTAINS(Gong__Gong_Tracker__c.Gong__Tracker_Name__c, "Need"), 1, 0)) = 1, 25, 0) + IF(MAX(IF(CONTAINS(Gong__Gong_Tracker__c.Gong__Tracker_Name__c, "Timeline"), 1, 0)) = 1, 25, 0))',
            dataType: 'Percent',
            description: 'Percentage of BANT criteria covered',
            usage: 'Indicates qualification completeness'
        },
        
        riskIndicators: {
            name: 'Risk Indicator Count',
            formula: 'SUM(IF(CONTAINS(LOWER(Gong__Gong_Tracker__c.Gong__Tracker_Name__c), "concern") || CONTAINS(LOWER(Gong__Gong_Tracker__c.Gong__Tracker_Name__c), "budget") || CONTAINS(LOWER(Gong__Gong_Tracker__c.Gong__Tracker_Name__c), "competitor"), Gong__Tracker_Occurrences__c, 0))',
            dataType: 'Number',
            description: 'Count of risk-related tracker mentions',
            usage: 'Early warning system for deal risks'
        }
    },

    // Deal Health and Risk Metrics
    dealHealth: {
        activityGap: {
            name: 'Activity Gap Risk',
            formula: 'IF(TODAY() - MAX(Gong__Gong_Call__c.Gong__Call_Start__c) > 30, "Critical", IF(TODAY() - MAX(Gong__Gong_Call__c.Gong__Call_Start__c) > 14, "High", IF(TODAY() - MAX(Gong__Gong_Call__c.Gong__Call_Start__c) > 7, "Medium", "Low")))',
            dataType: 'Text',
            description: 'Risk level based on days without activity',
            usage: 'Prioritize deals needing attention'
        },
        
        closeProximityScore: {
            name: 'Close Date Proximity Score',
            formula: 'IF(Opportunity.CloseDate - TODAY() < 0, 0, IF(Opportunity.CloseDate - TODAY() <= 30, (30 - (Opportunity.CloseDate - TODAY())) * 3.33, 100))',
            dataType: 'Percent',
            description: 'Urgency score based on close date (0-100%)',
            usage: 'Higher score means closer to close date'
        },
        
        dealMomentum: {
            name: 'Deal Momentum Score',
            formula: '(COUNT(IF(Gong__Gong_Call__c.Gong__Call_Start__c >= TODAY() - 30, Gong__Gong_Call__c.Id, null)) / COUNT(IF(Gong__Gong_Call__c.Gong__Call_Start__c >= TODAY() - 60 AND Gong__Gong_Call__c.Gong__Call_Start__c < TODAY() - 30, Gong__Gong_Call__c.Id, null))) * 100',
            dataType: 'Percent',
            description: 'Recent activity vs prior period',
            usage: 'Shows acceleration or deceleration'
        },
        
        healthScore: {
            name: 'Composite Deal Health Score',
            formula: '(IF(COUNT(Gong__Gong_Call__c.Id) > 3, 25, 0) + IF(COUNT_DISTINCT(Contact.Email) > 2, 25, 0) + IF(TODAY() - MAX(Gong__Gong_Call__c.Gong__Call_Start__c) < 14, 25, 0) + IF(AVG(Gong__Gong_Call__c.Gong__Call_Duration__c) > 1800, 25, 0))',
            dataType: 'Percent',
            description: 'Overall deal health (0-100%)',
            usage: 'Quick health assessment combining multiple factors'
        },
        
        stageAlignment: {
            name: 'Stage Activity Alignment',
            formula: 'IF(Opportunity.StageName = "Prospecting" AND COUNT(Gong__Gong_Call__c.Id) < 2, "Under-engaged", IF(Opportunity.StageName = "Negotiation" AND COUNT(Gong__Gong_Call__c.Id) < 5, "Under-engaged", "Aligned"))',
            dataType: 'Text',
            description: 'Checks if activity level matches stage',
            usage: 'Identifies misaligned opportunities'
        }
    },

    // Time-based Metrics
    timeBased: {
        weeklyTrend: {
            name: 'Weekly Activity Trend',
            formula: 'COUNT(Gong__Gong_Call__c.Id) - PREVGROUPVAL(COUNT(Gong__Gong_Call__c.Id), 1)',
            dataType: 'Number',
            description: 'Week-over-week change in activity',
            usage: 'Use with weekly grouping'
        },
        
        timeToFirstCall: {
            name: 'Days to First Call',
            formula: 'MIN(Gong__Gong_Call__c.Gong__Call_Start__c) - Opportunity.CreatedDate',
            dataType: 'Number',
            description: 'Days from opportunity creation to first call',
            usage: 'Indicates speed of engagement'
        },
        
        averageCallCadence: {
            name: 'Average Days Between Calls',
            formula: '(MAX(Gong__Gong_Call__c.Gong__Call_Start__c) - MIN(Gong__Gong_Call__c.Gong__Call_Start__c)) / (COUNT(Gong__Gong_Call__c.Id) - 1)',
            dataType: 'Number',
            description: 'Average days between calls',
            usage: 'Shows engagement frequency'
        },
        
        quarterlyVelocity: {
            name: 'Quarterly Call Velocity',
            formula: 'COUNT(IF(Gong__Gong_Call__c.Gong__Call_Start__c >= QUARTER_START, Gong__Gong_Call__c.Id, null))',
            dataType: 'Number',
            description: 'Calls in current quarter',
            usage: 'For quarterly business reviews'
        }
    }
};

/**
 * Generate formula documentation
 */
function generateFormulaDoc(category, formula) {
    return {
        name: formula.name,
        formula: formula.formula,
        dataType: formula.dataType,
        description: formula.description,
        usage: formula.usage,
        category: category
    };
}

/**
 * Get all formulas as list
 */
function getAllFormulas() {
    const formulas = [];
    
    for (const [category, categoryFormulas] of Object.entries(FORMULA_LIBRARY)) {
        for (const [key, formula] of Object.entries(categoryFormulas)) {
            formulas.push({
                key: `${category}.${key}`,
                ...generateFormulaDoc(category, formula)
            });
        }
    }
    
    return formulas;
}

/**
 * Generate markdown documentation for all formulas
 */
function generateMarkdown() {
    const doc = [
        '# Gong Formula Library for Salesforce Reports',
        '',
        'Copy-paste ready formulas for Gong reporting without custom fields.',
        '',
        `Generated: ${new Date().toISOString()}`,
        '',
        '## Table of Contents',
        ''
    ];

    // Add TOC
    for (const category of Object.keys(FORMULA_LIBRARY)) {
        const categoryTitle = category.charAt(0).toUpperCase() + category.slice(1).replace(/([A-Z])/g, ' $1');
        doc.push(`- [${categoryTitle}](#${category.toLowerCase().replace(/\s+/g, '-')})`);
    }
    doc.push('');

    // Add formulas by category
    for (const [category, formulas] of Object.entries(FORMULA_LIBRARY)) {
        const categoryTitle = category.charAt(0).toUpperCase() + category.slice(1).replace(/([A-Z])/g, ' $1');
        doc.push(`## ${categoryTitle}`);
        doc.push('');

        for (const [key, formula] of Object.entries(formulas)) {
            doc.push(`### ${formula.name}`);
            doc.push('');
            doc.push(`**Description:** ${formula.description}`);
            doc.push('');
            doc.push(`**Data Type:** ${formula.dataType}`);
            doc.push('');
            doc.push(`**Usage:** ${formula.usage}`);
            doc.push('');
            doc.push('**Formula:**');
            doc.push('```');
            doc.push(formula.formula);
            doc.push('```');
            doc.push('');
        }
    }

    return doc.join('\n');
}

/**
 * Search formulas by keyword
 */
function searchFormulas(keyword) {
    const results = [];
    const searchTerm = keyword.toLowerCase();
    
    for (const formula of getAllFormulas()) {
        if (formula.name.toLowerCase().includes(searchTerm) ||
            formula.description.toLowerCase().includes(searchTerm) ||
            formula.usage.toLowerCase().includes(searchTerm) ||
            formula.category.toLowerCase().includes(searchTerm)) {
            results.push(formula);
        }
    }
    
    return results;
}

/**
 * Main execution
 */
function main() {
    const args = process.argv.slice(2);
    const command = args[0] || 'help';

    switch (command) {
        case 'list':
            // List all formulas
            const allFormulas = getAllFormulas();
            console.log('Available Formulas:');
            allFormulas.forEach(f => {
                console.log(`  ${f.key}: ${f.name}`);
            });
            console.log(`\nTotal: ${allFormulas.length} formulas`);
            break;

        case 'search':
            // Search formulas
            const keyword = args[1];
            if (!keyword) {
                console.error('Please provide a search keyword');
                process.exit(1);
            }
            
            const results = searchFormulas(keyword);
            if (results.length === 0) {
                console.log(`No formulas found matching "${keyword}"`);
            } else {
                console.log(`Found ${results.length} formulas matching "${keyword}":`);
                results.forEach(f => {
                    console.log(`\n${f.name} (${f.category})`);
                    console.log(`  ${f.description}`);
                    console.log(`  Formula: ${f.formula.substring(0, 100)}...`);
                });
            }
            break;

        case 'export':
            // Export to markdown
            const outputPath = args[1] || path.join(__dirname, '..', 'output', 'GONG_FORMULA_LIBRARY.md');
            const markdown = generateMarkdown();
            
            const dir = path.dirname(outputPath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            
            fs.writeFileSync(outputPath, markdown);
            console.log(`✅ Formula library exported to: ${outputPath}`);
            break;

        case 'get':
            // Get specific formula
            const formulaKey = args[1];
            if (!formulaKey) {
                console.error('Please provide a formula key (e.g., activity.daysSinceLastCall)');
                process.exit(1);
            }
            
            const [category, key] = formulaKey.split('.');
            const formula = FORMULA_LIBRARY[category]?.[key];
            
            if (!formula) {
                console.error(`Formula not found: ${formulaKey}`);
                process.exit(1);
            }
            
            console.log(`\n${formula.name}`);
            console.log('='.repeat(formula.name.length));
            console.log(`\nDescription: ${formula.description}`);
            console.log(`Data Type: ${formula.dataType}`);
            console.log(`Usage: ${formula.usage}`);
            console.log('\nFormula:');
            console.log(formula.formula);
            break;

        default:
            console.log(`
Gong Formula Library

Usage: node gong-formula-library.js [command] [args]

Commands:
  list              List all available formulas
  search <keyword>  Search formulas by keyword
  get <key>         Get specific formula (e.g., activity.daysSinceLastCall)
  export [path]     Export all formulas to markdown
  help              Show this help message

Examples:
  node gong-formula-library.js list
  node gong-formula-library.js search "multi-thread"
  node gong-formula-library.js get activity.coverageScore
  node gong-formula-library.js export ./formulas.md
            `);
    }
}

// Export for use by other scripts
module.exports = {
    FORMULA_LIBRARY,
    getAllFormulas,
    searchFormulas,
    generateMarkdown
};

// Run if executed directly
if (require.main === module) {
    main();
}