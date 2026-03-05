#!/usr/bin/env node
/**
 * Batch add variations to report templates
 * Usage: node scripts/add-report-variations.js [category]
 * Categories: customer-success, marketing, sales-reps, sales-managers, sales-executive
 */

const fs = require('fs');
const path = require('path');

const REPORTS_DIR = path.join(__dirname, '..', 'templates', 'reports');

// Variation configurations by report category
const VARIATION_CONFIGS = {
  'customer-success': {
    availableVariations: ['simple', 'standard', 'enterprise', 'high-touch'],
    defaultVariation: 'standard',
    variationOverrides: {
      simple: {
        description: 'Simplified report with essential columns only',
        reportOverrides: { maxColumns: 5 }
      },
      standard: {
        description: 'Full report with all standard columns'
      },
      enterprise: {
        description: 'Enterprise focus with ARR-weighted metrics',
        filterOverrides: [
          { column: 'Account.ARR__c', operator: 'greaterOrEqual', value: '100000' }
        ]
      },
      'high-touch': {
        description: 'High-touch CS model with engagement metrics',
        additionalColumns: ['Last_Touch_Date__c', 'Engagement_Score__c']
      }
    },
    fieldFallbacks: {
      HealthScore: {
        patterns: ['Health_Score__c', 'Customer_Health__c', 'Account_Health__c', 'Risk_Level__c'],
        dataType: 'picklist'
      },
      ARR: {
        patterns: ['ARR__c', 'Annual_Recurring_Revenue__c', 'MRR__c'],
        cpqPatterns: ['SBQQ__RenewedAmount__c'],
        dataType: 'currency'
      },
      NPS: {
        patterns: ['NPS_Score__c', 'NPS__c', 'Net_Promoter_Score__c'],
        dataType: 'number'
      }
    }
  },
  'marketing': {
    availableVariations: ['simple', 'standard', 'plg', 'abm'],
    defaultVariation: 'standard',
    variationOverrides: {
      simple: {
        description: 'Simplified marketing report',
        reportOverrides: { maxColumns: 5 }
      },
      standard: {
        description: 'Full marketing report'
      },
      plg: {
        description: 'Product-led growth focus',
        filterOverrides: [
          { column: 'LeadSource', operator: 'contains', value: 'Product' }
        ]
      },
      abm: {
        description: 'Account-based marketing focus',
        filterOverrides: [
          { column: 'Campaign.Type', operator: 'equals', value: 'ABM' }
        ]
      }
    },
    fieldFallbacks: {
      MQLDate: {
        patterns: ['MQL_Date__c', 'Marketing_Qualified_Date__c', 'Qualified_Date__c'],
        dataType: 'date'
      },
      LeadScore: {
        patterns: ['Lead_Score__c', 'Score__c', 'Marketing_Score__c'],
        dataType: 'number'
      },
      CampaignCost: {
        patterns: ['ActualCost', 'BudgetedCost', 'Campaign_Spend__c'],
        dataType: 'currency'
      }
    }
  },
  'sales-reps': {
    availableVariations: ['simple', 'standard', 'cpq', 'enterprise'],
    defaultVariation: 'standard',
    variationOverrides: {
      simple: {
        description: 'Simplified individual rep report',
        reportOverrides: { maxColumns: 5 }
      },
      standard: {
        description: 'Full individual rep report'
      },
      cpq: {
        description: 'CPQ-enabled with quote metrics',
        fieldSubstitutions: {
          Amount: 'SBQQ__NetAmount__c'
        }
      },
      enterprise: {
        description: 'Enterprise deal focus',
        filterOverrides: [
          { column: 'Amount', operator: 'greaterOrEqual', value: '50000' }
        ]
      }
    },
    fieldFallbacks: {
      Amount: {
        patterns: ['Amount', 'Total_Amount__c'],
        cpqPatterns: ['SBQQ__NetAmount__c'],
        dataType: 'currency'
      },
      Quota: {
        patterns: ['Quota__c', 'Quarterly_Quota__c', 'Target__c'],
        dataType: 'currency'
      }
    }
  },
  'sales-managers': {
    availableVariations: ['simple', 'standard', 'cpq', 'enterprise', 'smb'],
    defaultVariation: 'standard',
    variationOverrides: {
      simple: {
        description: 'Simplified team report',
        reportOverrides: { maxColumns: 6 }
      },
      standard: {
        description: 'Full team management report'
      },
      cpq: {
        description: 'CPQ-enabled team metrics',
        fieldSubstitutions: {
          Amount: 'SBQQ__NetAmount__c'
        }
      },
      enterprise: {
        description: 'Enterprise team focus',
        filterOverrides: [
          { column: 'Amount', operator: 'greaterOrEqual', value: '100000' }
        ]
      },
      smb: {
        description: 'SMB team with higher volume targets',
        metricAdjustments: {
          activityTarget: { target: 30 }
        }
      }
    },
    fieldFallbacks: {
      TeamPipeline: {
        patterns: ['Team_Pipeline__c', 'Pipeline__c'],
        cpqPatterns: ['SBQQ__NetAmount__c'],
        dataType: 'currency'
      },
      QuotaAttainment: {
        patterns: ['Quota_Attainment__c', 'Attainment__c', 'Quota_Pct__c'],
        dataType: 'percent'
      }
    }
  },
  'sales-executive': {
    availableVariations: ['simple', 'standard', 'cpq', 'enterprise'],
    defaultVariation: 'standard',
    variationOverrides: {
      simple: {
        description: 'Executive summary report',
        reportOverrides: { maxColumns: 5 }
      },
      standard: {
        description: 'Full executive report'
      },
      cpq: {
        description: 'CPQ-enabled executive metrics',
        fieldSubstitutions: {
          Amount: 'SBQQ__NetAmount__c',
          'Quote.TotalPrice': 'SBQQ__Quote__c.SBQQ__NetAmount__c'
        }
      },
      enterprise: {
        description: 'Enterprise executive focus with higher thresholds',
        filterOverrides: [
          { column: 'Amount', operator: 'greaterOrEqual', value: '250000' }
        ]
      }
    },
    fieldFallbacks: {
      Revenue: {
        patterns: ['Amount', 'Revenue__c', 'Total_Revenue__c'],
        cpqPatterns: ['SBQQ__NetAmount__c'],
        dataType: 'currency'
      },
      WinRate: {
        patterns: ['Win_Rate__c', 'Conversion_Rate__c'],
        dataType: 'percent'
      }
    }
  }
};

function addVariationsToReport(filePath, category) {
  const config = VARIATION_CONFIGS[category];
  if (!config) {
    console.log(`  [SKIP] No config for category: ${category}`);
    return false;
  }

  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const report = JSON.parse(content);

    // Skip if already has variations
    if (report.variations) {
      console.log(`  [SKIP] Already has variations: ${path.basename(filePath)}`);
      return false;
    }

    // Add variations section
    report.variations = {
      schemaVersion: '1.0',
      availableVariations: config.availableVariations,
      defaultVariation: config.defaultVariation,
      variationOverrides: config.variationOverrides
    };

    // Add orgAdaptation section
    report.orgAdaptation = {
      adaptationStrategy: 'graceful-degradation',
      minimumFidelity: 0.7,
      fieldFallbacks: config.fieldFallbacks
    };

    // Bump version
    if (report.templateMetadata?.templateVersion) {
      const version = report.templateMetadata.templateVersion;
      if (version.includes('.')) {
        const parts = version.split('.');
        parts[1] = String(parseInt(parts[1] || '0') + 1);
        report.templateMetadata.templateVersion = parts.join('.');
      } else {
        report.templateMetadata.templateVersion = '1.1';
      }
    }

    // Write back
    fs.writeFileSync(filePath, JSON.stringify(report, null, 2) + '\n');
    console.log(`  [OK] Updated: ${path.basename(filePath)}`);
    return true;
  } catch (err) {
    console.log(`  [ERR] ${path.basename(filePath)}: ${err.message}`);
    return false;
  }
}

function processCategory(category) {
  const categoryDir = path.join(REPORTS_DIR, category);

  if (!fs.existsSync(categoryDir)) {
    console.log(`Category directory not found: ${categoryDir}`);
    return { updated: 0, skipped: 0, errors: 0 };
  }

  console.log(`\nProcessing: ${category}`);
  console.log('─'.repeat(50));

  const files = fs.readdirSync(categoryDir).filter(f => f.endsWith('.json'));
  let updated = 0, skipped = 0, errors = 0;

  for (const file of files) {
    const filePath = path.join(categoryDir, file);
    const result = addVariationsToReport(filePath, category);
    if (result === true) updated++;
    else if (result === false) skipped++;
    else errors++;
  }

  console.log(`\n  Summary: ${updated} updated, ${skipped} skipped, ${errors} errors`);
  return { updated, skipped, errors };
}

// Main
const args = process.argv.slice(2);
const targetCategory = args[0];

console.log('=== Report Template Variation Updater ===\n');

const categories = targetCategory
  ? [targetCategory]
  : Object.keys(VARIATION_CONFIGS);

let totalUpdated = 0, totalSkipped = 0, totalErrors = 0;

for (const category of categories) {
  const result = processCategory(category);
  totalUpdated += result.updated;
  totalSkipped += result.skipped;
  totalErrors += result.errors;
}

console.log('\n' + '='.repeat(50));
console.log(`TOTAL: ${totalUpdated} updated, ${totalSkipped} skipped, ${totalErrors} errors`);
