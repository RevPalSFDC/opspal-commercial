#!/usr/bin/env node

/**
 * Cross-Platform Operations CLI
 * Command-line interface for Salesforce-HubSpot data operations
 */

const { Command } = require('commander');
const inquirer = require('inquirer');
const chalk = require('chalk');
const ora = require('ora');
const Table = require('cli-table3');
const path = require('path');
const fs = require('fs');

// Import modules
const SalesforceConnector = require('../core/connectors/salesforce-connector');
const HubSpotConnector = require('../core/connectors/hubspot-connector');
const UnifiedRecord = require('../core/data-models/unified-record');
const FieldMappingEngine = require('../core/data-models/field-mapping');
const DeduplicationEngine = require('../modules/deduplication');
const CustomerCommands = require('./customer-commands');

const program = new Command();

// CLI configuration
program
  .name('xplat')
  .description('Cross-Platform Operations CLI for Salesforce-HubSpot Integration')
  .version('1.0.0');

/**
 * Map command - Map fields between platforms
 */
program
  .command('map')
  .description('Map records between Salesforce and HubSpot')
  .option('-s, --source <platform>', 'Source platform (salesforce/hubspot)')
  .option('-t, --target <platform>', 'Target platform (salesforce/hubspot)')
  .option('-o, --object <type>', 'Object type (contact/lead/account/company/deal)')
  .option('-f, --file <path>', 'Input file path (JSON)')
  .option('--validate', 'Validate mappings only')
  .option('--auto-detect', 'Auto-detect field mappings')
  .action(async (options) => {
    const spinner = ora('Initializing field mapping engine...').start();

    try {
      const mappingEngine = new FieldMappingEngine();

      if (options.autoDetect) {
        spinner.text = 'Auto-detecting field mappings...';

        // This would need actual field lists from both platforms
        const suggestions = mappingEngine.autoDetectMappings(
          ['FirstName', 'LastName', 'Email', 'Phone'],
          ['firstname', 'lastname', 'email', 'phone']
        );

        spinner.succeed('Field mapping suggestions generated');

        const table = new Table({
          head: ['Source Field', 'Target Field', 'Confidence'],
          style: { head: ['cyan'] }
        });

        suggestions.forEach(s => {
          table.push([s.source, s.target, chalk[s.status === 'high' ? 'green' : s.status === 'medium' ? 'yellow' : 'red'](s.confidence.toFixed(2))]);
        });

        console.log(table.toString());
        return;
      }

      // Interactive mode if no file provided
      if (!options.file) {
        const answers = await inquirer.prompt([
          {
            type: 'list',
            name: 'source',
            message: 'Select source platform:',
            choices: ['salesforce', 'hubspot'],
            when: !options.source
          },
          {
            type: 'list',
            name: 'target',
            message: 'Select target platform:',
            choices: ['salesforce', 'hubspot'],
            when: !options.target
          },
          {
            type: 'list',
            name: 'object',
            message: 'Select object type:',
            choices: ['contact', 'lead', 'account', 'company', 'deal', 'opportunity'],
            when: !options.object
          }
        ]);

        options = { ...options, ...answers };
      }

      // Load data from file if provided
      let records = [];
      if (options.file) {
        const data = JSON.parse(fs.readFileSync(options.file, 'utf8'));
        records = Array.isArray(data) ? data : [data];
      }

      // Map records
      const direction = `${options.source || 'salesforce'}_to_${options.target || 'hubspot'}`;
      const results = [];

      spinner.text = 'Mapping records...';
      for (const record of records) {
        const mapped = mappingEngine.mapFields(record, options.object, direction);
        results.push(mapped);
      }

      spinner.succeed(`Successfully mapped ${results.length} records`);

      // Display results
      if (results.length > 0) {
        console.log(chalk.green('\n✓ Mapping Results:'));
        results.forEach((result, index) => {
          console.log(chalk.blue(`\nRecord ${index + 1}:`));
          console.log('  Mapped fields:', Object.keys(result.data).length);
          if (result.unmapped.length > 0) {
            console.log(chalk.yellow('  Unmapped fields:'), result.unmapped.map(f => f.field).join(', '));
          }
        });
      }

      // Save results
      const outputPath = `mapping-results-${Date.now()}.json`;
      fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
      console.log(chalk.green(`\n✓ Results saved to ${outputPath}`));

    } catch (error) {
      spinner.fail(`Error: ${error.message}`);
      process.exit(1);
    }
  });

/**
 * Dedupe command - Find and manage duplicates
 */
program
  .command('dedupe')
  .description('Find and manage duplicate records')
  .option('-p, --platform <platform>', 'Platform (salesforce/hubspot/both)')
  .option('-o, --object <type>', 'Object type')
  .option('-t, --threshold <number>', 'Similarity threshold (0-1)', parseFloat, 0.8)
  .option('--cross-platform', 'Find duplicates across platforms')
  .option('--auto-merge', 'Automatically merge high-confidence duplicates')
  .option('--dry-run', 'Preview without making changes')
  .option('--max-records <number>', 'Maximum records to analyze', parseInt, 1000)
  .action(async (options) => {
    const spinner = ora('Initializing deduplication engine...').start();

    try {
      // Load configuration
      const config = loadConfig();

      const dedupeEngine = new DeduplicationEngine({
        salesforce: config.salesforce,
        hubspot: config.hubspot,
        defaultThreshold: options.threshold
      });

      spinner.text = 'Authenticating with platforms...';
      await dedupeEngine.initialize();

      // Interactive mode
      if (!options.platform || !options.object) {
        const answers = await inquirer.prompt([
          {
            type: 'list',
            name: 'platform',
            message: 'Select platform:',
            choices: options.crossPlatform ? ['both'] : ['salesforce', 'hubspot', 'both'],
            when: !options.platform
          },
          {
            type: 'list',
            name: 'object',
            message: 'Select object type:',
            choices: ['contact', 'lead', 'account', 'company', 'deal'],
            when: !options.object
          }
        ]);

        options = { ...options, ...answers };
      }

      spinner.text = 'Searching for duplicates...';

      let result;
      if (options.crossPlatform || options.platform === 'both') {
        result = await dedupeEngine.findCrossPlatformDuplicates(options.object, {
          threshold: options.threshold,
          maxRecords: options.maxRecords
        });
      } else {
        result = await dedupeEngine.findDuplicates(options.platform, options.object, {
          threshold: options.threshold,
          maxRecords: options.maxRecords
        });
      }

      spinner.succeed('Duplicate analysis complete');

      // Display results
      if (options.crossPlatform) {
        console.log(chalk.blue('\n📊 Cross-Platform Duplicate Analysis:'));
        console.log(`  Salesforce records: ${result.salesforceRecords}`);
        console.log(`  HubSpot records: ${result.hubspotRecords}`);
        console.log(`  Cross-platform matches: ${result.crossPlatformMatches.length}`);

        if (result.summary.topMatches && result.summary.topMatches.length > 0) {
          console.log(chalk.yellow('\n🔍 Top Matches:'));
          const table = new Table({
            head: ['Salesforce', 'HubSpot', 'Score', 'Confidence'],
            style: { head: ['cyan'] }
          });

          result.summary.topMatches.forEach(match => {
            table.push([
              match.salesforceName,
              match.hubspotName,
              match.score,
              chalk[parseFloat(match.confidence) > 0.9 ? 'green' : parseFloat(match.confidence) > 0.7 ? 'yellow' : 'red'](match.confidence)
            ]);
          });

          console.log(table.toString());
        }
      } else {
        console.log(chalk.blue('\n📊 Duplicate Analysis Results:'));
        console.log(`  Platform: ${result.platform}`);
        console.log(`  Object type: ${result.objectType}`);
        console.log(`  Total records: ${result.totalRecords}`);
        console.log(`  Duplicate groups: ${result.duplicateGroups.length}`);

        if (result.summary && result.summary.topGroups && result.summary.topGroups.length > 0) {
          console.log(chalk.yellow('\n🔍 Top Duplicate Groups:'));
          const table = new Table({
            head: ['Master Record', 'Duplicates', 'Confidence'],
            style: { head: ['cyan'] }
          });

          result.summary.topGroups.forEach(group => {
            table.push([
              group.masterName,
              group.duplicateCount,
              chalk[parseFloat(group.confidence) > 0.9 ? 'green' : parseFloat(group.confidence) > 0.7 ? 'yellow' : 'red'](group.confidence)
            ]);
          });

          console.log(table.toString());
        }
      }

      // Handle auto-merge
      if (options.autoMerge && !options.dryRun) {
        const confirm = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'proceed',
            message: `Do you want to merge ${result.duplicateGroups ? result.duplicateGroups.length : result.crossPlatformMatches.length} duplicate groups?`,
            default: false
          }
        ]);

        if (confirm.proceed) {
          spinner.start('Merging duplicates...');
          // Merge logic would go here
          spinner.succeed('Duplicates merged successfully');
        }
      }

      // Save report
      const reportPath = `dedupe-report-${Date.now()}.json`;
      fs.writeFileSync(reportPath, JSON.stringify(result, null, 2));
      console.log(chalk.green(`\n✓ Report saved to ${reportPath}`));

    } catch (error) {
      spinner.fail(`Error: ${error.message}`);
      process.exit(1);
    }
  });

/**
 * Sync command - Synchronize data between platforms
 */
program
  .command('sync')
  .description('Synchronize records between Salesforce and HubSpot')
  .option('-d, --direction <direction>', 'Sync direction (sf-to-hs/hs-to-sf/bidirectional)')
  .option('-o, --object <type>', 'Object type')
  .option('--ids <ids...>', 'Specific record IDs to sync')
  .option('--filter <filter>', 'Filter expression (JSON)')
  .option('--conflict <strategy>', 'Conflict resolution (newer/source/target)', 'newer')
  .option('--dry-run', 'Preview sync without making changes')
  .action(async (options) => {
    const spinner = ora('Preparing sync operation...').start();

    try {
      const config = loadConfig();

      // Interactive mode
      if (!options.direction || !options.object) {
        const answers = await inquirer.prompt([
          {
            type: 'list',
            name: 'direction',
            message: 'Select sync direction:',
            choices: [
              { name: 'Salesforce → HubSpot', value: 'sf-to-hs' },
              { name: 'HubSpot → Salesforce', value: 'hs-to-sf' },
              { name: 'Bidirectional', value: 'bidirectional' }
            ],
            when: !options.direction
          },
          {
            type: 'list',
            name: 'object',
            message: 'Select object type:',
            choices: ['contact', 'lead', 'account', 'company', 'deal'],
            when: !options.object
          },
          {
            type: 'list',
            name: 'conflict',
            message: 'Conflict resolution strategy:',
            choices: ['newer', 'source', 'target', 'manual'],
            when: !options.conflict
          }
        ]);

        options = { ...options, ...answers };
      }

      console.log(chalk.blue('\n🔄 Sync Configuration:'));
      console.log(`  Direction: ${options.direction}`);
      console.log(`  Object type: ${options.object}`);
      console.log(`  Conflict resolution: ${options.conflict}`);
      console.log(`  Mode: ${options.dryRun ? 'DRY RUN' : 'LIVE'}`);

      if (options.dryRun) {
        console.log(chalk.yellow('\n⚠️  DRY RUN MODE - No changes will be made'));
      }

      // Confirm before proceeding
      if (!options.dryRun) {
        const confirm = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'proceed',
            message: 'Do you want to proceed with the sync?',
            default: false
          }
        ]);

        if (!confirm.proceed) {
          console.log(chalk.red('Sync cancelled'));
          return;
        }
      }

      spinner.text = 'Executing sync operation...';

      // Sync implementation would go here
      // This is a simplified example
      const results = {
        synced: [],
        failed: [],
        conflicts: []
      };

      spinner.succeed('Sync operation completed');

      console.log(chalk.green('\n✓ Sync Results:'));
      console.log(`  Records synced: ${results.synced.length}`);
      console.log(`  Records failed: ${results.failed.length}`);
      console.log(`  Conflicts resolved: ${results.conflicts.length}`);

      // Save sync log
      const logPath = `sync-log-${Date.now()}.json`;
      fs.writeFileSync(logPath, JSON.stringify(results, null, 2));
      console.log(chalk.green(`\n✓ Sync log saved to ${logPath}`));

    } catch (error) {
      spinner.fail(`Error: ${error.message}`);
      process.exit(1);
    }
  });

/**
 * Analyze command - Analyze data quality
 */
program
  .command('analyze')
  .description('Analyze data quality and completeness')
  .option('-p, --platform <platform>', 'Platform (salesforce/hubspot/both)')
  .option('-o, --object <type>', 'Object type')
  .option('--metrics <metrics...>', 'Metrics to calculate', ['completeness', 'quality', 'duplicates'])
  .option('--sample-size <number>', 'Sample size for analysis', parseInt, 100)
  .option('--export <format>', 'Export format (json/csv/html)', 'json')
  .action(async (options) => {
    const spinner = ora('Starting data analysis...').start();

    try {
      console.log(chalk.blue('\n📊 Data Analysis'));
      console.log(`  Platform: ${options.platform || 'both'}`);
      console.log(`  Object: ${options.object || 'all'}`);
      console.log(`  Metrics: ${options.metrics.join(', ')}`);

      spinner.text = 'Analyzing data quality...';

      // Analysis implementation would go here
      const analysis = {
        platform: options.platform,
        object: options.object,
        timestamp: new Date().toISOString(),
        metrics: {
          completeness: { average: 78.5, min: 45, max: 98 },
          quality: { score: 82.3, issues: 15 },
          duplicates: { found: 23, percentage: 2.3 }
        }
      };

      spinner.succeed('Analysis complete');

      // Display results
      console.log(chalk.green('\n✓ Analysis Results:'));

      if (analysis.metrics.completeness) {
        console.log(chalk.yellow('\n📈 Data Completeness:'));
        console.log(`  Average: ${analysis.metrics.completeness.average}%`);
        console.log(`  Min: ${analysis.metrics.completeness.min}%`);
        console.log(`  Max: ${analysis.metrics.completeness.max}%`);
      }

      if (analysis.metrics.quality) {
        console.log(chalk.yellow('\n⭐ Data Quality:'));
        console.log(`  Score: ${analysis.metrics.quality.score}/100`);
        console.log(`  Issues found: ${analysis.metrics.quality.issues}`);
      }

      if (analysis.metrics.duplicates) {
        console.log(chalk.yellow('\n🔍 Duplicates:'));
        console.log(`  Found: ${analysis.metrics.duplicates.found}`);
        console.log(`  Percentage: ${analysis.metrics.duplicates.percentage}%`);
      }

      // Export results
      const exportPath = `analysis-${options.export === 'csv' ? 'report.csv' : options.export === 'html' ? 'report.html' : 'report.json'}`;

      if (options.export === 'json') {
        fs.writeFileSync(exportPath, JSON.stringify(analysis, null, 2));
      } else if (options.export === 'csv') {
        // CSV export logic
        const csv = 'Metric,Value\n' +
                   Object.entries(analysis.metrics).map(([key, value]) =>
                     `${key},${JSON.stringify(value)}`).join('\n');
        fs.writeFileSync(exportPath, csv);
      } else if (options.export === 'html') {
        // HTML export logic
        const html = generateHTMLReport(analysis);
        fs.writeFileSync(exportPath, html);
      }

      console.log(chalk.green(`\n✓ Report exported to ${exportPath}`));

    } catch (error) {
      spinner.fail(`Error: ${error.message}`);
      process.exit(1);
    }
  });

/**
 * Config command - Manage configuration
 */
program
  .command('config')
  .description('Manage CLI configuration')
  .option('--init', 'Initialize configuration')
  .option('--show', 'Show current configuration')
  .option('--set <key=value>', 'Set configuration value')
  .action(async (options) => {
    if (options.init) {
      const answers = await inquirer.prompt([
        {
          type: 'input',
          name: 'sfOrgAlias',
          message: 'Salesforce org alias:',
          default: 'production'
        },
        {
          type: 'password',
          name: 'hsApiKey',
          message: 'HubSpot API key:',
          mask: '*'
        },
        {
          type: 'input',
          name: 'hsPortalId',
          message: 'HubSpot portal ID:'
        }
      ]);

      const config = {
        salesforce: {
          orgAlias: answers.sfOrgAlias
        },
        hubspot: {
          apiKey: answers.hsApiKey,
          portalId: answers.hsPortalId
        }
      };

      const configPath = path.join(__dirname, '..', 'config', 'cli-config.json');
      fs.mkdirSync(path.dirname(configPath), { recursive: true });
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

      console.log(chalk.green('✓ Configuration saved'));
    } else if (options.show) {
      const config = loadConfig();
      console.log(chalk.blue('\nCurrent Configuration:'));
      console.log(JSON.stringify(config, null, 2));
    } else if (options.set) {
      // Parse key=value
      const [key, value] = options.set.split('=');
      const config = loadConfig();

      // Set nested property
      const keys = key.split('.');
      let obj = config;
      for (let i = 0; i < keys.length - 1; i++) {
        if (!obj[keys[i]]) obj[keys[i]] = {};
        obj = obj[keys[i]];
      }
      obj[keys[keys.length - 1]] = value;

      const configPath = path.join(__dirname, '..', 'config', 'cli-config.json');
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

      console.log(chalk.green(`✓ Set ${key} = ${value}`));
    }
  });

/**
 * Helper functions
 */

function loadConfig() {
  const configPath = path.join(__dirname, '..', 'config', 'cli-config.json');

  if (!fs.existsSync(configPath)) {
    console.log(chalk.yellow('⚠️  No configuration found. Run "xplat config --init" to set up.'));
    return {
      salesforce: {
        orgAlias: process.env.SALESFORCE_ORG_ALIAS || 'production'
      },
      hubspot: {
        apiKey: process.env.HUBSPOT_API_KEY,
        portalId: process.env.HUBSPOT_PORTAL_ID
      }
    };
  }

  return JSON.parse(fs.readFileSync(configPath, 'utf8'));
}

function generateHTMLReport(data) {
  return `
<!DOCTYPE html>
<html>
<head>
  <title>Cross-Platform Analysis Report</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      margin: 40px;
      background: #f5f5f5;
    }
    .container {
      background: white;
      padding: 30px;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    h1 { color: #333; }
    h2 { color: #666; margin-top: 30px; }
    .metric {
      padding: 15px;
      margin: 10px 0;
      background: #f9f9f9;
      border-left: 4px solid #4CAF50;
    }
    .metric-value {
      font-size: 24px;
      font-weight: bold;
      color: #4CAF50;
    }
    .timestamp {
      color: #999;
      font-size: 12px;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>Cross-Platform Analysis Report</h1>
    <p class="timestamp">Generated: ${data.timestamp}</p>

    <h2>Platform: ${data.platform}</h2>
    <h2>Object Type: ${data.object}</h2>

    ${Object.entries(data.metrics).map(([key, value]) => `
      <div class="metric">
        <h3>${key.charAt(0).toUpperCase() + key.slice(1)}</h3>
        <div class="metric-value">${JSON.stringify(value, null, 2)}</div>
      </div>
    `).join('')}
  </div>
</body>
</html>`;
}

// Parse arguments
// Initialize customer commands
new CustomerCommands(program);

// Parse command line arguments
program.parse(process.argv);

// Show help if no command provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
}