#!/usr/bin/env node

/**
 * Stage Mapping Wizard
 *
 * Interactive wizard for configuring funnel stage mappings between standard
 * funnel positions and client-specific CRM stage names (Salesforce & HubSpot).
 *
 * @module stage-mapping-wizard
 * @version 1.0.0
 * @author RevPal Engineering
 *
 * Features:
 * - Auto-discovery of CRM stages from Salesforce and HubSpot
 * - Interactive mapping wizard (CLI prompts)
 * - Validation of stage mappings
 * - Configuration export to JSON
 * - Configuration import and update
 * - Support for multiple object types (Lead, Opportunity, Deal, Quote)
 * - Handles custom labels (e.g., "Order Form" instead of "Quote")
 *
 * Usage:
 *   const StageMapper = require('./stage-mapping-wizard');
 *   const mapper = new StageMapper({ platform: 'salesforce' });
 *   const mapping = await mapper.discoverAndMap('production');
 *
 * CLI:
 *   node stage-mapping-wizard.js --platform salesforce --org production --interactive
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

/**
 * Stage Mapping Wizard
 */
class StageMappingWizard {
  constructor(options = {}) {
    this.platform = options.platform || 'salesforce';
    this.verbose = options.verbose || false;
    this.configPath = options.configPath ||
      path.join(__dirname, '../../config/funnel-stage-definitions.json');

    // Load standard stage definitions
    this.standardStages = this.loadStandardStages();

    if (this.verbose) {
      console.log(`StageMappingWizard initialized for ${this.platform}`);
    }
  }

  /**
   * Load standard funnel stage definitions
   */
  loadStandardStages() {
    try {
      const config = JSON.parse(fs.readFileSync(this.configPath, 'utf-8'));
      return config.standardFunnelStages.stages;
    } catch (error) {
      // Fallback to default stages
      return [
        { position: 1, name: 'Prospecting', description: 'Outbound activity', metrics: ['activity_volume'] },
        { position: 2, name: 'Engagement', description: 'Initial contact made', metrics: ['connect_rate'] },
        { position: 3, name: 'Meetings', description: 'Meetings held', metrics: ['meeting_set_rate'] },
        { position: 4, name: 'Pipeline', description: 'Qualified opportunities', metrics: ['sql_rate'] },
        { position: 5, name: 'Closing', description: 'Final negotiation', metrics: ['win_rate'] },
        { position: 6, name: 'Closed-Won', description: 'Deal won', metrics: ['deal_size'] }
      ];
    }
  }

  /**
   * Discover stages from CRM
   *
   * @param {string} orgAlias - Salesforce org alias or HubSpot portal
   * @returns {Promise<Object>} Discovered stages by object type
   */
  async discoverStages(orgAlias) {
    if (this.verbose) {
      console.log(`\nDiscovering stages from ${this.platform} (${orgAlias})...\n`);
    }

    if (this.platform === 'salesforce') {
      return await this.discoverSalesforceStages(orgAlias);
    } else if (this.platform === 'hubspot') {
      return await this.discoverHubSpotStages(orgAlias);
    } else {
      throw new Error(`Unsupported platform: ${this.platform}`);
    }
  }

  /**
   * Discover Salesforce stages
   */
  async discoverSalesforceStages(orgAlias) {
    const { execSync } = require('child_process');
    const stages = {};

    try {
      // Lead stages
      const leadQuery = `SELECT ApiName, MasterLabel FROM LeadStatus WHERE IsConverted = false ORDER BY SortOrder`;
      const leadResult = execSync(
        `sf data query --query "${leadQuery}" --use-tooling-api --target-org ${orgAlias} --json`,
        { encoding: 'utf-8' }
      );
      const leadData = JSON.parse(leadResult);
      stages.Lead = (leadData.result?.records || []).map(r => ({
        apiName: r.ApiName,
        label: r.MasterLabel
      }));

      // Opportunity stages
      const oppQuery = `SELECT ApiName, MasterLabel, IsClosed, IsWon FROM OpportunityStage ORDER BY SortOrder`;
      const oppResult = execSync(
        `sf data query --query "${oppQuery}" --use-tooling-api --target-org ${orgAlias} --json`,
        { encoding: 'utf-8' }
      );
      const oppData = JSON.parse(oppResult);
      stages.Opportunity = (oppData.result?.records || []).map(r => ({
        apiName: r.ApiName,
        label: r.MasterLabel,
        isClosed: r.IsClosed,
        isWon: r.IsWon
      }));

      // Check for CPQ Quote stages (custom labels)
      const quoteQuery = `SELECT Id, DeveloperName, MasterLabel FROM RecordType WHERE SObjectType = 'SBQQ__Quote__c' LIMIT 10`;
      try {
        const quoteResult = execSync(
          `sf data query --query "${quoteQuery}" --use-tooling-api --target-org ${orgAlias} --json`,
          { encoding: 'utf-8' }
        );
        const quoteData = JSON.parse(quoteResult);
        if (quoteData.result?.records?.length > 0) {
          stages.Quote = quoteData.result.records.map(r => ({
            apiName: r.DeveloperName,
            label: r.MasterLabel
          }));
        }
      } catch (error) {
        // Quote object may not exist
        if (this.verbose) {
          console.log('No SBQQ__Quote__c object found (CPQ not installed)');
        }
      }

      if (this.verbose) {
        console.log(`✓ Discovered ${Object.keys(stages).length} object types with stages`);
      }

      return stages;

    } catch (error) {
      console.error('Error discovering Salesforce stages:', error.message);
      return {};
    }
  }

  /**
   * Discover HubSpot stages (placeholder)
   */
  async discoverHubSpotStages(portalId) {
    // Placeholder for HubSpot integration
    // Will be implemented when HubSpot MCP tools are available
    console.warn('HubSpot stage discovery not yet implemented (awaiting MCP tools)');
    return {
      Deal: [
        { apiName: 'appointmentscheduled', label: 'Appointment Scheduled' },
        { apiName: 'qualifiedtobuy', label: 'Qualified To Buy' },
        { apiName: 'presentationscheduled', label: 'Presentation Scheduled' },
        { apiName: 'decisionmakerboughtin', label: 'Decision Maker Bought-In' },
        { apiName: 'contractsent', label: 'Contract Sent' },
        { apiName: 'closedwon', label: 'Closed Won' },
        { apiName: 'closedlost', label: 'Closed Lost' }
      ]
    };
  }

  /**
   * Interactive mapping wizard
   *
   * @param {Object} discoveredStages - Stages from discoverStages()
   * @returns {Promise<Object>} Complete stage mapping configuration
   */
  async runInteractiveWizard(discoveredStages) {
    console.log('\n=== Stage Mapping Wizard ===\n');
    console.log('This wizard will help you map your CRM stages to standard funnel positions.\n');

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    const prompt = (question) => new Promise(resolve => rl.question(question, resolve));

    const mapping = {
      platform: this.platform,
      objectMappings: {},
      createdAt: new Date().toISOString()
    };

    for (const [objectType, stages] of Object.entries(discoveredStages)) {
      console.log(`\n--- Mapping ${objectType} Stages ---\n`);
      console.log(`Discovered ${stages.length} stages:\n`);

      stages.forEach((stage, idx) => {
        console.log(`  ${idx + 1}. ${stage.label} (${stage.apiName})`);
      });

      console.log('\nStandard Funnel Positions:\n');
      this.standardStages.forEach(s => {
        console.log(`  ${s.position}. ${s.name} - ${s.description}`);
      });

      const objectMapping = {};

      for (const standardStage of this.standardStages) {
        console.log(`\nMap "${standardStage.name}" (position ${standardStage.position}):`);

        const answer = await prompt(`  Enter stage number(s) or 'skip': `);

        if (answer.toLowerCase() === 'skip') {
          console.log(`  Skipped ${standardStage.name}`);
          continue;
        }

        const stageNumbers = answer.split(',').map(n => parseInt(n.trim()) - 1);
        const mappedStages = stageNumbers
          .filter(n => n >= 0 && n < stages.length)
          .map(n => stages[n].apiName);

        if (mappedStages.length > 0) {
          objectMapping[standardStage.name] = mappedStages;
          console.log(`  ✓ Mapped to: ${mappedStages.join(', ')}`);
        }
      }

      mapping.objectMappings[objectType] = objectMapping;
    }

    rl.close();

    return mapping;
  }

  /**
   * Auto-map stages using intelligent matching
   *
   * @param {Object} discoveredStages - Stages from discoverStages()
   * @returns {Object} Automatically generated mapping
   */
  autoMapStages(discoveredStages) {
    if (this.verbose) {
      console.log('\nAuto-mapping stages using intelligent matching...\n');
    }

    const mapping = {
      platform: this.platform,
      objectMappings: {},
      autoGenerated: true,
      createdAt: new Date().toISOString()
    };

    for (const [objectType, stages] of Object.entries(discoveredStages)) {
      const objectMapping = {};

      for (const standardStage of this.standardStages) {
        const matchedStages = this.findMatchingStages(standardStage, stages);

        if (matchedStages.length > 0) {
          objectMapping[standardStage.name] = matchedStages.map(s => s.apiName);

          if (this.verbose) {
            console.log(`✓ ${objectType}.${standardStage.name} → ${matchedStages.map(s => s.label).join(', ')}`);
          }
        }
      }

      mapping.objectMappings[objectType] = objectMapping;
    }

    return mapping;
  }

  /**
   * Find matching stages using keywords
   */
  findMatchingStages(standardStage, crmStages) {
    const keywords = {
      'Prospecting': ['prospecting', 'new', 'unqualified', 'lead', 'open'],
      'Engagement': ['engaged', 'contact', 'responded', 'working'],
      'Meetings': ['meeting', 'demo', 'appointment', 'scheduled', 'qualified'],
      'Pipeline': ['qualified', 'proposal', 'negotiation', 'verbal', 'opportunity'],
      'Closing': ['closing', 'contract', 'final', 'pending'],
      'Closed-Won': ['won', 'closed won', 'complete', 'success']
    };

    const stageKeywords = keywords[standardStage.name] || [];
    const matches = [];

    for (const crmStage of crmStages) {
      const label = crmStage.label.toLowerCase();
      const apiName = crmStage.apiName.toLowerCase();

      for (const keyword of stageKeywords) {
        if (label.includes(keyword) || apiName.includes(keyword)) {
          matches.push(crmStage);
          break;
        }
      }
    }

    return matches;
  }

  /**
   * Validate stage mapping
   */
  validateMapping(mapping) {
    const errors = [];
    const warnings = [];

    if (!mapping.platform) {
      errors.push('Missing platform specification');
    }

    if (!mapping.objectMappings || Object.keys(mapping.objectMappings).length === 0) {
      errors.push('No object mappings defined');
    }

    for (const [objectType, objectMapping] of Object.entries(mapping.objectMappings || {})) {
      const mappedPositions = Object.keys(objectMapping);

      // Warn if critical positions missing
      if (!mappedPositions.includes('Pipeline')) {
        warnings.push(`${objectType}: Missing "Pipeline" mapping (critical for analysis)`);
      }

      if (!mappedPositions.includes('Closed-Won')) {
        warnings.push(`${objectType}: Missing "Closed-Won" mapping (needed for win rate)`);
      }

      // Check for empty mappings
      for (const [position, stages] of Object.entries(objectMapping)) {
        if (!stages || stages.length === 0) {
          warnings.push(`${objectType}.${position}: Empty stage mapping`);
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Save mapping to file
   */
  saveMapping(mapping, outputPath) {
    try {
      // Load existing config
      const config = JSON.parse(fs.readFileSync(this.configPath, 'utf-8'));

      // Generate client identifier
      const clientId = `${mapping.platform}_${Date.now()}`;

      // Add to clientSpecificMappings
      if (!config.clientSpecificMappings) {
        config.clientSpecificMappings = {};
      }

      config.clientSpecificMappings[clientId] = mapping;

      // Save updated config
      fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2));

      console.log(`\n✓ Mapping saved to ${this.configPath}`);
      console.log(`  Client ID: ${clientId}`);

      // Also save standalone mapping file if outputPath provided
      if (outputPath) {
        fs.writeFileSync(outputPath, JSON.stringify(mapping, null, 2));
        console.log(`✓ Standalone mapping saved to ${outputPath}`);
      }

      return clientId;

    } catch (error) {
      console.error('Error saving mapping:', error.message);
      throw error;
    }
  }

  /**
   * Load mapping from file
   */
  loadMapping(clientId) {
    try {
      const config = JSON.parse(fs.readFileSync(this.configPath, 'utf-8'));

      if (config.clientSpecificMappings && config.clientSpecificMappings[clientId]) {
        return config.clientSpecificMappings[clientId];
      }

      throw new Error(`Client mapping not found: ${clientId}`);

    } catch (error) {
      console.error('Error loading mapping:', error.message);
      throw error;
    }
  }
}

/**
 * CLI Interface
 */
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Stage Mapping Wizard - CLI Usage

Usage:
  node stage-mapping-wizard.js [options]

Options:
  --platform <name>     Platform (salesforce or hubspot) (required)
  --org <alias>         Org alias or portal ID (required)
  --interactive         Run interactive mapping wizard
  --auto                Auto-map stages using intelligent matching
  --output <file>       Output file for mapping JSON (optional)
  --validate <file>     Validate existing mapping file
  --verbose             Enable verbose logging
  --help, -h            Show this help message

Examples:
  # Interactive wizard
  node stage-mapping-wizard.js \\
    --platform salesforce \\
    --org production \\
    --interactive

  # Auto-mapping
  node stage-mapping-wizard.js \\
    --platform salesforce \\
    --org production \\
    --auto \\
    --output ./stage-mapping.json

  # Validate mapping
  node stage-mapping-wizard.js \\
    --validate ./stage-mapping.json
`);
    process.exit(0);
  }

  const platform = args.includes('--platform') ? args[args.indexOf('--platform') + 1] : null;
  const org = args.includes('--org') ? args[args.indexOf('--org') + 1] : null;
  const interactive = args.includes('--interactive');
  const auto = args.includes('--auto');
  const outputFile = args.includes('--output') ? args[args.indexOf('--output') + 1] : null;
  const validateFile = args.includes('--validate') ? args[args.indexOf('--validate') + 1] : null;
  const verbose = args.includes('--verbose');

  // Validation mode
  if (validateFile) {
    try {
      const mapping = JSON.parse(fs.readFileSync(validateFile, 'utf-8'));
      const wizard = new StageMappingWizard({ verbose });
      const validation = wizard.validateMapping(mapping);

      console.log('\n=== Validation Results ===\n');
      console.log(`Valid: ${validation.valid ? '✓ Yes' : '✗ No'}`);

      if (validation.errors.length > 0) {
        console.log('\nErrors:');
        validation.errors.forEach(err => console.log(`  ✗ ${err}`));
      }

      if (validation.warnings.length > 0) {
        console.log('\nWarnings:');
        validation.warnings.forEach(warn => console.log(`  ⚠ ${warn}`));
      }

      if (validation.valid && validation.warnings.length === 0) {
        console.log('\n✓ Mapping is valid with no warnings');
      }

      process.exit(validation.valid ? 0 : 1);

    } catch (error) {
      console.error('Error validating mapping:', error.message);
      process.exit(1);
    }
  }

  // Discovery and mapping mode
  if (!platform || !org) {
    console.error('Error: --platform and --org are required');
    console.error('Run with --help for usage information');
    process.exit(1);
  }

  if (!interactive && !auto) {
    console.error('Error: Either --interactive or --auto is required');
    process.exit(1);
  }

  (async () => {
    try {
      const wizard = new StageMappingWizard({ platform, verbose });

      // Discover stages
      const discoveredStages = await wizard.discoverStages(org);

      if (Object.keys(discoveredStages).length === 0) {
        console.error('No stages discovered. Check org authentication and permissions.');
        process.exit(1);
      }

      // Generate mapping
      let mapping;

      if (interactive) {
        mapping = await wizard.runInteractiveWizard(discoveredStages);
      } else if (auto) {
        mapping = wizard.autoMapStages(discoveredStages);
      }

      // Validate mapping
      const validation = wizard.validateMapping(mapping);

      if (!validation.valid) {
        console.error('\n✗ Mapping validation failed:');
        validation.errors.forEach(err => console.error(`  ${err}`));
        process.exit(1);
      }

      if (validation.warnings.length > 0) {
        console.warn('\n⚠ Warnings:');
        validation.warnings.forEach(warn => console.warn(`  ${warn}`));
      }

      // Save mapping
      const clientId = wizard.saveMapping(mapping, outputFile);

      console.log('\n✓ Stage mapping complete!');
      console.log(`\nTo use this mapping in diagnostics, reference client ID: ${clientId}`);

    } catch (error) {
      console.error('Error:', error.message);
      if (verbose) {
        console.error(error.stack);
      }
      process.exit(1);
    }
  })();
}

module.exports = StageMappingWizard;
