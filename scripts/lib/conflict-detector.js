#!/usr/bin/env node

/**
 * Salesforce Conflict Detector
 * Analyzes planned changes against current org state to detect conflicts
 */

const fs = require('fs');
const path = require('path');

class ConflictDetector {
  constructor(options = {}) {
    this.org = options.org || process.env.SALESFORCE_ORG_ALIAS || 'production';
    this.verbose = options.verbose || false;
  }

  /**
   * Analyze conflicts between planned fields and existing org state
   * @param {Object} options - Analysis options
   * @returns {Object} Conflict analysis results
   */
  async analyze(options) {
    const { object, plannedFields, org } = options;
    const conflicts = [];
    const warnings = [];

    try {
      // Validate inputs
      if (!object) throw new Error('Object name required');
      if (!plannedFields) throw new Error('Planned fields required');

      // Load existing fields (would normally query Salesforce)
      const existingFields = await this.getExistingFields(object, org || this.org);

      // Compare planned vs existing
      for (const planned of plannedFields) {
        const existing = existingFields.find(f => f.name === planned.name);

        if (existing) {
          // Check for type conflicts
          if (existing.type !== planned.type) {
            conflicts.push({
              field: planned.name,
              type: 'TYPE_MISMATCH',
              existing: existing.type,
              planned: planned.type,
              severity: 'HIGH',
              resolution: this.suggestResolution(existing.type, planned.type)
            });
          }

          // Check for property conflicts
          if (existing.required !== planned.required) {
            warnings.push({
              field: planned.name,
              type: 'REQUIREMENT_CHANGE',
              existing: existing.required,
              planned: planned.required,
              severity: 'MEDIUM'
            });
          }
        }
      }

      return {
        success: true,
        object,
        conflicts,
        warnings,
        conflictCount: conflicts.length,
        warningCount: warnings.length,
        canDeploy: conflicts.length === 0
      };

    } catch (error) {
      return {
        success: false,
        error: error.message,
        conflicts: [],
        warnings: [],
        canDeploy: false
      };
    }
  }

  /**
   * Get existing fields from Salesforce org
   * @param {string} object - Object name
   * @param {string} org - Org alias
   * @returns {Array} Existing fields
   */
  async getExistingFields(object, org) {
    // In production, this would use sf/sfdx CLI or API
    // For now, return mock data for demonstration
    return [
      { name: 'Name', type: 'Text', required: true },
      { name: 'Status__c', type: 'Picklist', required: false },
      { name: 'Amount__c', type: 'Currency', required: false }
    ];
  }

  /**
   * Suggest resolution for type conflicts
   * @param {string} existingType - Current field type
   * @param {string} plannedType - Desired field type
   * @returns {string} Resolution suggestion
   */
  suggestResolution(existingType, plannedType) {
    const conversions = {
      'Text->Number': 'Create new field with suffix _New, migrate data, deprecate old',
      'Picklist->Text': 'Direct conversion possible via metadata API',
      'Number->Text': 'Direct conversion possible, no data loss',
      'Currency->Number': 'Create formula field for conversion',
      'Checkbox->Picklist': 'Create new picklist with Yes/No values, migrate'
    };

    const key = `${existingType}->${plannedType}`;
    return conversions[key] || 'Manual migration required - consult Salesforce documentation';
  }
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];

  if (command === 'analyze') {
    const options = {
      object: args[args.indexOf('--object') + 1],
      plannedFields: args[args.indexOf('--planned-fields') + 1],
      org: args[args.indexOf('--org') + 1]
    };

    if (options.plannedFields) {
      try {
        options.plannedFields = JSON.parse(fs.readFileSync(options.plannedFields, 'utf8'));
      } catch (e) {
        console.error('Error reading planned fields file:', e.message);
        process.exit(1);
      }
    }

    const detector = new ConflictDetector();
    detector.analyze(options).then(result => {
      console.log(JSON.stringify(result, null, 2));
      process.exit(result.canDeploy ? 0 : 1);
    });
  } else {
    console.log('Usage: conflict-detector.js analyze --object <name> --planned-fields <file> --org <alias>');
    process.exit(1);
  }
}

module.exports = ConflictDetector;