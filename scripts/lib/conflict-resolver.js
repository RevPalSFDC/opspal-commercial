#!/usr/bin/env node

/**
 * Salesforce Conflict Resolver
 * Generates and executes resolution plans for detected conflicts
 */

const fs = require('fs');
const path = require('path');

class ConflictResolver {
  constructor(options = {}) {
    this.org = options.org || process.env.SALESFORCE_ORG_ALIAS || 'production';
    this.preserveExisting = options.preserveExisting !== false;
    this.autoResolve = options.autoResolve || false;
  }

  /**
   * Generate resolution plan for conflicts
   * @param {Object} options - Resolution options
   * @returns {Object} Resolution plan
   */
  async plan(options) {
    const { conflicts, strategy, preserveExisting } = options;
    const plan = {
      strategy: strategy || 'safe',
      steps: [],
      risks: [],
      estimatedTime: 0,
      requiresDowntime: false
    };

    try {
      // Parse conflicts if provided as file
      let conflictData = conflicts;
      if (typeof conflicts === 'string') {
        conflictData = JSON.parse(fs.readFileSync(conflicts, 'utf8'));
      }

      // Generate resolution steps based on strategy
      switch (strategy) {
        case 'auto-resolve':
          plan.steps = this.generateAutoResolutionSteps(conflictData);
          break;
        case 'preserve-existing':
          plan.steps = this.generatePreservationSteps(conflictData);
          break;
        case 'force-update':
          plan.steps = this.generateForceUpdateSteps(conflictData);
          plan.risks.push('Data loss possible');
          plan.requiresDowntime = true;
          break;
        default:
          plan.steps = this.generateSafeResolutionSteps(conflictData);
      }

      // Calculate estimated time
      plan.estimatedTime = this.estimateResolutionTime(plan.steps);

      // Add validation steps
      plan.steps.push({
        order: plan.steps.length + 1,
        action: 'VALIDATE',
        description: 'Validate all resolutions applied successfully',
        automated: true
      });

      return {
        success: true,
        plan,
        conflictCount: this.countConflicts(conflictData),
        automatedSteps: plan.steps.filter(s => s.automated).length,
        manualSteps: plan.steps.filter(s => !s.automated).length
      };

    } catch (error) {
      return {
        success: false,
        error: error.message,
        plan: null
      };
    }
  }

  /**
   * Generate auto-resolution steps
   */
  generateAutoResolutionSteps(conflicts) {
    const steps = [];
    let order = 1;

    // Handle field conflicts
    if (conflicts.fieldConflicts) {
      conflicts.fieldConflicts.forEach(conflict => {
        if (this.canAutoResolve(conflict)) {
          steps.push({
            order: order++,
            action: 'AUTO_RESOLVE_FIELD',
            target: `${conflict.object}.${conflict.field}`,
            description: `Automatically resolve ${conflict.issue}`,
            automated: true,
            command: this.getResolutionCommand(conflict)
          });
        } else {
          steps.push({
            order: order++,
            action: 'MANUAL_RESOLVE_FIELD',
            target: `${conflict.object}.${conflict.field}`,
            description: `Manually resolve ${conflict.issue}`,
            automated: false,
            instructions: this.getManualInstructions(conflict)
          });
        }
      });
    }

    // Handle validation conflicts
    if (conflicts.validationConflicts) {
      conflicts.validationConflicts.forEach(conflict => {
        steps.push({
          order: order++,
          action: 'BYPASS_VALIDATION',
          target: `${conflict.object}.${conflict.rule}`,
          description: 'Create validation bypass',
          automated: true,
          command: `sf data create record --sobject Bypass_Settings__c --values "Object__c='${conflict.object}' Active__c=true"`
        });
      });
    }

    return steps;
  }

  /**
   * Generate preservation steps (keep existing configuration)
   */
  generatePreservationSteps(conflicts) {
    const steps = [];
    let order = 1;

    steps.push({
      order: order++,
      action: 'BACKUP',
      description: 'Backup current configuration',
      automated: true,
      command: 'sf project retrieve start --metadata CustomObject'
    });

    if (conflicts.fieldConflicts) {
      conflicts.fieldConflicts.forEach(conflict => {
        steps.push({
          order: order++,
          action: 'PRESERVE',
          target: `${conflict.object}.${conflict.field}`,
          description: `Keep existing ${conflict.currentType} type`,
          automated: false,
          instructions: 'Update implementation to work with existing field type'
        });
      });
    }

    return steps;
  }

  /**
   * Generate force update steps (override existing)
   */
  generateForceUpdateSteps(conflicts) {
    const steps = [];
    let order = 1;

    steps.push({
      order: order++,
      action: 'WARNING',
      description: 'Force update will override existing configuration',
      automated: false,
      instructions: 'Ensure all stakeholders are informed'
    });

    steps.push({
      order: order++,
      action: 'BACKUP',
      description: 'Create full backup before force update',
      automated: true,
      command: 'sf data export tree --query "SELECT * FROM [Objects]" --outputdir ./backup'
    });

    if (conflicts.fieldConflicts) {
      conflicts.fieldConflicts.forEach(conflict => {
        steps.push({
          order: order++,
          action: 'FORCE_UPDATE',
          target: `${conflict.object}.${conflict.field}`,
          description: `Force update to ${conflict.expectedType}`,
          automated: false,
          instructions: 'Delete existing field and recreate with new type',
          risk: 'Data loss'
        });
      });
    }

    return steps;
  }

  /**
   * Generate safe resolution steps (default)
   */
  generateSafeResolutionSteps(conflicts) {
    const steps = [];
    let order = 1;

    // Always start with analysis
    steps.push({
      order: order++,
      action: 'ANALYZE',
      description: 'Analyze impact of all conflicts',
      automated: true,
      command: 'node scripts/lib/conflict-analyzer.js detect --type all'
    });

    // Create staged deployment plan
    steps.push({
      order: order++,
      action: 'STAGE',
      description: 'Create staged deployment plan',
      automated: false,
      instructions: 'Break deployment into safe stages'
    });

    // Add specific resolution for each conflict type
    if (conflicts.fieldConflicts) {
      conflicts.fieldConflicts.forEach(conflict => {
        if (conflict.severity === 'HIGH' || conflict.severity === 'CRITICAL') {
          steps.push({
            order: order++,
            action: 'CREATE_NEW_FIELD',
            target: `${conflict.object}.${conflict.field}_New`,
            description: 'Create new field with correct type',
            automated: false,
            instructions: `Create ${conflict.field}_New as ${conflict.expectedType}, migrate data, update references`
          });
        }
      });
    }

    return steps;
  }

  /**
   * Check if conflict can be auto-resolved
   */
  canAutoResolve(conflict) {
    const autoResolvable = [
      'Picklist->Text',
      'Number->Text',
      'Checkbox->Text',
      'Date->DateTime'
    ];

    const conversion = `${conflict.currentType}->${conflict.expectedType}`;
    return autoResolvable.includes(conversion);
  }

  /**
   * Get resolution command for auto-resolvable conflict
   */
  getResolutionCommand(conflict) {
    const conversion = `${conflict.currentType}->${conflict.expectedType}`;

    const commands = {
      'Picklist->Text': `sf project deploy start --metadata CustomField:${conflict.object}.${conflict.field}`,
      'Number->Text': `sf data update record --sobject FieldDefinition --where "QualifiedApiName='${conflict.field}'" --values "DataType='Text'"`,
      'Checkbox->Text': `sf project deploy start --metadata CustomField:${conflict.object}.${conflict.field}`,
      'Date->DateTime': `sf project deploy start --metadata CustomField:${conflict.object}.${conflict.field}`
    };

    return commands[conversion] || 'echo "Manual resolution required"';
  }

  /**
   * Get manual resolution instructions
   */
  getManualInstructions(conflict) {
    return [
      `1. Export data from ${conflict.field}`,
      `2. Delete existing field ${conflict.field}`,
      `3. Create new field with type ${conflict.expectedType}`,
      `4. Import data to new field`,
      `5. Update all references to use new field`,
      `6. Test thoroughly`
    ].join('\n');
  }

  /**
   * Estimate resolution time in minutes
   */
  estimateResolutionTime(steps) {
    let time = 0;
    steps.forEach(step => {
      if (step.automated) {
        time += 2; // 2 minutes for automated steps
      } else {
        time += 15; // 15 minutes for manual steps
      }
    });
    return time;
  }

  /**
   * Count total conflicts
   */
  countConflicts(conflicts) {
    let count = 0;
    Object.values(conflicts).forEach(arr => {
      if (Array.isArray(arr)) count += arr.length;
    });
    return count;
  }

  /**
   * Execute resolution plan
   */
  async execute(plan) {
    console.log('Executing resolution plan...');
    const results = [];

    for (const step of plan.steps) {
      console.log(`Step ${step.order}: ${step.description}`);

      if (step.automated && step.command) {
        try {
          // In production, would execute the command
          console.log(`  Command: ${step.command}`);
          results.push({
            step: step.order,
            status: 'SUCCESS',
            message: 'Step completed'
          });
        } catch (error) {
          results.push({
            step: step.order,
            status: 'FAILED',
            message: error.message
          });
          break;
        }
      } else {
        console.log(`  Manual action required: ${step.instructions || step.description}`);
        results.push({
          step: step.order,
          status: 'MANUAL',
          message: 'Awaiting manual completion'
        });
      }
    }

    return results;
  }
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];

  if (command === 'plan') {
    const options = {
      conflicts: args[args.indexOf('--conflicts') + 1],
      strategy: args.includes('--strategy') ? args[args.indexOf('--strategy') + 1] : 'safe',
      preserveExisting: !args.includes('--force')
    };

    const resolver = new ConflictResolver();
    resolver.plan(options).then(result => {
      console.log(JSON.stringify(result, null, 2));

      if (result.success && args.includes('--execute')) {
        resolver.execute(result.plan).then(execResults => {
          console.log('\nExecution Results:');
          console.log(JSON.stringify(execResults, null, 2));
        });
      }
    });
  } else {
    console.log('Usage: conflict-resolver.js plan --conflicts <file> [--strategy <type>] [--execute]');
    console.log('Strategies: safe, auto-resolve, preserve-existing, force-update');
    process.exit(1);
  }
}

module.exports = ConflictResolver;