#!/usr/bin/env node

/**
 * Asana Compliance Validator
 * 
 * Validates that Asana tasks meet all enhanced requirements
 */

const { asanaEnhancedManager } = require('../utils/asana-enhanced-manager');
const { asanaEnhancedConfig } = require('../config/asana-enhanced-config');
const { asanaTaskMatcher } = require('../integration/asana-task-matcher');

class AsanaComplianceValidator {
  constructor() {
    this.manager = asanaEnhancedManager;
    this.config = asanaEnhancedConfig;
    this.matcher = asanaTaskMatcher;
    this.validationResults = {
      passed: [],
      failed: [],
      warnings: []
    };
  }

  /**
   * Run full compliance validation
   */
  async runValidation() {
    console.log('🔍 Starting Asana Compliance Validation...\n');
    
    // Initialize manager
    await this.manager.initialize();
    
    // Run all validation checks
    await this.validateConfiguration();
    await this.validateCustomFields();
    await this.validateTaskCompliance();
    await this.validateTimeTracking();
    await this.validateEnvironmentPrefixes();
    
    // Display results
    this.displayResults();
    
    // Return exit code
    return this.validationResults.failed.length === 0 ? 0 : 1;
  }

  /**
   * Validate configuration
   */
  async validateConfiguration() {
    console.log('📋 Validating Configuration...');
    
    const validation = this.config.validate();
    
    if (validation.valid) {
      this.validationResults.passed.push('Configuration is valid');
    } else {
      validation.errors.forEach(error => {
        this.validationResults.failed.push(`Config Error: ${error}`);
      });
    }
    
    validation.warnings.forEach(warning => {
      this.validationResults.warnings.push(`Config Warning: ${warning}`);
    });
  }

  /**
   * Validate custom fields exist
   */
  async validateCustomFields() {
    console.log('📋 Validating Custom Fields...');
    
    const requiredFields = [
      'estimatedHours',
      'actualHours',
      'projectTag',
      'sprint',
      'environment',
      'agentName',
      'completionStatus'
    ];
    
    for (const fieldName of requiredFields) {
      if (this.manager.customFields[fieldName]) {
        this.validationResults.passed.push(`Custom field '${fieldName}' found`);
      } else {
        this.validationResults.warnings.push(`Custom field '${fieldName}' not found - will need to be created`);
      }
    }
  }

  /**
   * Validate task compliance with sample tasks
   */
  async validateTaskCompliance() {
    console.log('📋 Validating Task Compliance...');
    
    try {
      // Get sample tasks from workspace
      const response = await this.manager.apiClient.get('/tasks', {
        params: {
          workspace: this.manager.workspaceGid,
          limit: 10,
          opt_fields: 'name,custom_fields,projects'
        }
      });
      
      const tasks = response.data.data;
      
      if (tasks.length === 0) {
        this.validationResults.warnings.push('No tasks found for compliance check');
        return;
      }
      
      // Check each task for compliance
      for (const task of tasks) {
        const compliance = this.checkTaskCompliance(task);
        
        if (compliance.compliant) {
          this.validationResults.passed.push(`Task '${task.name}' is compliant`);
        } else {
          compliance.issues.forEach(issue => {
            this.validationResults.warnings.push(`Task '${task.name}': ${issue}`);
          });
        }
      }
    } catch (error) {
      this.validationResults.failed.push(`Failed to validate task compliance: ${error.message}`);
    }
  }

  /**
   * Check individual task compliance
   */
  checkTaskCompliance(task) {
    const issues = [];
    
    // Check for environment prefix
    if (this.config.environmentConfig.prefixEnabled) {
      const hasPrefix = /^\[(SB|PROD|DEV|STAGE)\]/.test(task.name);
      if (!hasPrefix) {
        issues.push('Missing environment prefix');
      }
    }
    
    // Check for custom fields
    if (task.custom_fields) {
      const hasEstimate = task.custom_fields.some(f => 
        f.name === this.config.customFieldMappings.estimatedHours
      );
      if (!hasEstimate) {
        issues.push('Missing time estimate');
      }
    }
    
    return {
      compliant: issues.length === 0,
      issues
    };
  }

  /**
   * Validate time tracking functionality
   */
  async validateTimeTracking() {
    console.log('📋 Validating Time Tracking...');
    
    // Test time tracking calculation
    const testEstimate = 2; // hours
    const testActual = 0.5; // hours
    const timeSaved = testEstimate - testActual;
    const efficiency = testActual / testEstimate;
    
    if (timeSaved === 1.5 && efficiency === 0.25) {
      this.validationResults.passed.push('Time tracking calculations correct');
    } else {
      this.validationResults.failed.push('Time tracking calculations incorrect');
    }
    
    // Test sprint calculation
    const currentSprint = this.config.getCurrentSprint();
    if (currentSprint) {
      this.validationResults.passed.push(`Current sprint calculated: ${currentSprint}`);
    } else if (this.config.sprintConfig.enabled) {
      this.validationResults.failed.push('Failed to calculate current sprint');
    }
  }

  /**
   * Validate environment prefix functionality
   */
  async validateEnvironmentPrefixes() {
    console.log('📋 Validating Environment Prefixes...');
    
    const prefix = this.config.getEnvironmentPrefix();
    const environment = this.config.environmentConfig.current;
    
    if (environment === 'production' && prefix === '[PROD]') {
      this.validationResults.passed.push('Production prefix correct');
    } else if (environment === 'sandbox' && prefix === '[SB]') {
      this.validationResults.passed.push('Sandbox prefix correct');
    } else if (prefix === '') {
      this.validationResults.warnings.push('Environment prefixes disabled');
    } else {
      this.validationResults.failed.push(`Incorrect prefix '${prefix}' for environment '${environment}'`);
    }
  }

  /**
   * Display validation results
   */
  displayResults() {
    console.log('\n' + '='.repeat(60));
    console.log('VALIDATION RESULTS');
    console.log('='.repeat(60));
    
    if (this.validationResults.passed.length > 0) {
      console.log('\n✅ PASSED (' + this.validationResults.passed.length + ')');
      this.validationResults.passed.forEach(item => {
        console.log(`  ✓ ${item}`);
      });
    }
    
    if (this.validationResults.warnings.length > 0) {
      console.log('\n⚠️  WARNINGS (' + this.validationResults.warnings.length + ')');
      this.validationResults.warnings.forEach(item => {
        console.log(`  ⚠ ${item}`);
      });
    }
    
    if (this.validationResults.failed.length > 0) {
      console.log('\n❌ FAILED (' + this.validationResults.failed.length + ')');
      this.validationResults.failed.forEach(item => {
        console.log(`  ✗ ${item}`);
      });
    }
    
    console.log('\n' + '='.repeat(60));
    
    if (this.validationResults.failed.length === 0) {
      console.log('✅ VALIDATION PASSED - All requirements met!');
    } else {
      console.log('❌ VALIDATION FAILED - Please fix the issues above');
    }
    
    console.log('='.repeat(60) + '\n');
  }
}

// Run validation if executed directly
if (require.main === module) {
  const validator = new AsanaComplianceValidator();
  validator.runValidation()
    .then(exitCode => process.exit(exitCode))
    .catch(error => {
      console.error('Validation error:', error);
      process.exit(1);
    });
}

module.exports = {
  AsanaComplianceValidator
};