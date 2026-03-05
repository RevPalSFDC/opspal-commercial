#!/usr/bin/env node

/**
 * Validation Bypass Manager
 * 
 * Provides multiple strategies for bypassing Salesforce validation rules
 * during data operations, including custom settings, permission sets,
 * and staged data loading approaches.
 */

const { execSync } = require('child_process');
const fs = require('fs').promises;
const path = require('path');

class ValidationBypassManager {
  constructor(orgAlias) {
    this.orgAlias = orgAlias;
    this.activeBypass = null;
    this.bypassHistory = [];
    this.strategies = {
      CUSTOM_SETTING: 'customSetting',
      PERMISSION_SET: 'permissionSet',
      FIELD_POPULATION: 'fieldPopulation',
      STAGED_LOADING: 'stagedLoading',
      VALIDATION_DEACTIVATION: 'validationDeactivation'
    };
  }

  /**
   * Analyze validation rules and determine best bypass strategy
   */
  async analyzeAndRecommendStrategy(objectName, validationRules) {
    const analysis = {
      object: objectName,
      rules: validationRules.length,
      blockingPatterns: [],
      recommendedStrategy: null,
      alternativeStrategies: [],
      complexity: 'LOW'
    };

    // Analyze each validation rule
    for (const rule of validationRules) {
      const patterns = this.analyzeValidationFormula(rule.ErrorConditionFormula);
      analysis.blockingPatterns.push(...patterns);
    }

    // Determine complexity
    const hasPriorValue = analysis.blockingPatterns.some(p => p.type === 'PRIORVALUE');
    const hasIsChanged = analysis.blockingPatterns.some(p => p.type === 'ISCHANGED');
    const hasComplexLogic = analysis.blockingPatterns.some(p => p.type === 'COMPLEX');
    
    if (hasPriorValue || (hasIsChanged && hasComplexLogic)) {
      analysis.complexity = 'HIGH';
    } else if (hasIsChanged || hasComplexLogic) {
      analysis.complexity = 'MEDIUM';
    }

    // Recommend strategy based on patterns
    if (hasPriorValue) {
      analysis.recommendedStrategy = {
        type: this.strategies.CUSTOM_SETTING,
        reason: 'PRIORVALUE requires bypass that works with triggers/flows'
      };
      analysis.alternativeStrategies.push({
        type: this.strategies.VALIDATION_DEACTIVATION,
        reason: 'Temporarily deactivate rules if custom setting not available'
      });
    } else if (hasIsChanged) {
      analysis.recommendedStrategy = {
        type: this.strategies.STAGED_LOADING,
        reason: 'ISCHANGED can be avoided with staged data loading'
      };
      analysis.alternativeStrategies.push({
        type: this.strategies.PERMISSION_SET,
        reason: 'Permission set bypass for initial load'
      });
    } else {
      analysis.recommendedStrategy = {
        type: this.strategies.FIELD_POPULATION,
        reason: 'Simple required field validation'
      };
    }

    return analysis;
  }

  /**
   * Analyze validation formula for blocking patterns
   */
  analyzeValidationFormula(formula) {
    const patterns = [];
    
    // Check for PRIORVALUE
    if (formula.includes('PRIORVALUE')) {
      patterns.push({
        type: 'PRIORVALUE',
        impact: 'Blocks flows and triggers',
        severity: 'HIGH'
      });
    }
    
    // Check for ISCHANGED
    if (formula.includes('ISCHANGED')) {
      patterns.push({
        type: 'ISCHANGED',
        impact: 'Blocks updates',
        severity: 'MEDIUM'
      });
    }
    
    // Check for ISNEW
    if (formula.includes('ISNEW')) {
      patterns.push({
        type: 'ISNEW',
        impact: 'Blocks inserts',
        severity: 'MEDIUM'
      });
    }
    
    // Check for ISBLANK/ISNULL
    const requiredFieldPattern = /(ISBLANK|ISNULL)\s*\(\s*(\w+)\s*\)/g;
    let match;
    while ((match = requiredFieldPattern.exec(formula)) !== null) {
      patterns.push({
        type: 'REQUIRED_FIELD',
        field: match[2],
        impact: 'Requires field population',
        severity: 'LOW'
      });
    }
    
    // Check for complex cross-object references
    if (formula.includes('$User') || formula.includes('$Profile') || formula.includes('$Organization')) {
      patterns.push({
        type: 'COMPLEX',
        impact: 'May require specific user context',
        severity: 'MEDIUM'
      });
    }
    
    return patterns;
  }

  /**
   * Strategy 1: Custom Setting Bypass
   */
  async implementCustomSettingBypass(objectName, validationRules) {
    console.log('📋 Implementing Custom Setting Bypass Strategy...');
    
    const bypass = {
      strategy: 'CUSTOM_SETTING',
      customSettingName: 'Validation_Bypass__c',
      fields: [],
      apexClass: null,
      implementation: []
    };

    // Step 1: Create or verify custom setting
    try {
      const customSettingMetadata = `<?xml version="1.0" encoding="UTF-8"?>
<CustomObject xmlns="http://soap.sforce.com/2006/04/metadata">
    <customSettingsType>Hierarchy</customSettingsType>
    <label>Validation Bypass</label>
    <visibility>Public</visibility>
    <fields>
        <fullName>Skip_All_Validation__c</fullName>
        <defaultValue>false</defaultValue>
        <label>Skip All Validation</label>
        <type>Checkbox</type>
    </fields>`;

      // Add specific bypass fields for each object
      for (const rule of validationRules) {
        const fieldName = `Skip_${objectName}_Validation__c`;
        bypass.fields.push(fieldName);
        
        customSettingMetadata += `
    <fields>
        <fullName>${fieldName}</fullName>
        <defaultValue>false</defaultValue>
        <label>Skip ${objectName} Validation</label>
        <type>Checkbox</type>
    </fields>`;
      }

      customSettingMetadata += '\n</CustomObject>';

      // Save custom setting metadata
      const metadataPath = `force-app/main/default/objects/Validation_Bypass__c/Validation_Bypass__c.object-meta.xml`;
      await this.saveMetadata(metadataPath, customSettingMetadata);
      bypass.implementation.push(`Created custom setting: ${metadataPath}`);

      // Step 2: Create Apex helper class
      const apexClass = `public with sharing class ValidationBypassHelper {
    private static Validation_Bypass__c bypassSettings;
    
    static {
        bypassSettings = Validation_Bypass__c.getInstance();
        if (bypassSettings == null) {
            bypassSettings = new Validation_Bypass__c();
        }
    }
    
    public static Boolean skipAllValidation() {
        return bypassSettings.Skip_All_Validation__c;
    }
    
    public static Boolean skip${objectName}Validation() {
        return bypassSettings.Skip_${objectName}_Validation__c || skipAllValidation();
    }
    
    public static void enableBypass() {
        bypassSettings.Skip_${objectName}_Validation__c = true;
        upsert bypassSettings;
    }
    
    public static void disableBypass() {
        bypassSettings.Skip_${objectName}_Validation__c = false;
        upsert bypassSettings;
    }
}`;

      const apexPath = `force-app/main/default/classes/ValidationBypassHelper.cls`;
      await this.saveMetadata(apexPath, apexClass);
      bypass.apexClass = 'ValidationBypassHelper';
      bypass.implementation.push(`Created Apex class: ${apexPath}`);

      // Step 3: Generate validation rule modifications
      bypass.validationRuleUpdates = validationRules.map(rule => ({
        ruleName: rule.Name,
        originalFormula: rule.ErrorConditionFormula,
        modifiedFormula: `AND(
    NOT($Setup.Validation_Bypass__c.Skip_${objectName}_Validation__c),
    NOT($Setup.Validation_Bypass__c.Skip_All_Validation__c),
    ${rule.ErrorConditionFormula}
)`
      }));

    } catch (error) {
      console.error('Error implementing custom setting bypass:', error);
      throw error;
    }

    return bypass;
  }

  /**
   * Strategy 2: Permission Set Bypass
   */
  async implementPermissionSetBypass(objectName) {
    console.log('🔐 Implementing Permission Set Bypass Strategy...');
    
    const bypass = {
      strategy: 'PERMISSION_SET',
      permissionSetName: `${objectName}_Validation_Bypass`,
      implementation: []
    };

    try {
      // Create permission set metadata
      const permissionSetMetadata = `<?xml version="1.0" encoding="UTF-8"?>
<PermissionSet xmlns="http://soap.sforce.com/2006/04/metadata">
    <label>${objectName} Validation Bypass</label>
    <description>Allows bypassing validation rules for ${objectName} data operations</description>
    <hasActivationRequired>false</hasActivationRequired>
    <customPermissions>
        <enabled>true</enabled>
        <name>Bypass_${objectName}_Validation</name>
    </customPermissions>
</PermissionSet>`;

      const permSetPath = `force-app/main/default/permissionsets/${bypass.permissionSetName}.permissionset-meta.xml`;
      await this.saveMetadata(permSetPath, permissionSetMetadata);
      bypass.implementation.push(`Created permission set: ${permSetPath}`);

      // Create custom permission
      const customPermMetadata = `<?xml version="1.0" encoding="UTF-8"?>
<CustomPermission xmlns="http://soap.sforce.com/2006/04/metadata">
    <label>Bypass ${objectName} Validation</label>
    <description>Allows users to bypass validation rules on ${objectName}</description>
</CustomPermission>`;

      const customPermPath = `force-app/main/default/customPermissions/Bypass_${objectName}_Validation.customPermission-meta.xml`;
      await this.saveMetadata(customPermPath, customPermMetadata);
      bypass.implementation.push(`Created custom permission: ${customPermPath}`);

      // Generate validation rule modification
      bypass.validationRuleUpdate = `$Permission.Bypass_${objectName}_Validation`;

    } catch (error) {
      console.error('Error implementing permission set bypass:', error);
      throw error;
    }

    return bypass;
  }

  /**
   * Strategy 3: Field Population Strategy
   */
  async implementFieldPopulationStrategy(objectName, requiredFields) {
    console.log('📝 Implementing Field Population Strategy...');
    
    const strategy = {
      strategy: 'FIELD_POPULATION',
      object: objectName,
      fieldDefaults: {},
      implementation: []
    };

    try {
      // Determine default values for required fields
      for (const field of requiredFields) {
        const defaultValue = await this.determineFieldDefault(objectName, field);
        strategy.fieldDefaults[field.name] = defaultValue;
      }

      // Create data transformation function
      strategy.transformFunction = `
function populateRequiredFields(records, fieldDefaults) {
  return records.map(record => {
    const populated = { ...record };
    
    for (const [field, defaultValue] of Object.entries(fieldDefaults)) {
      if (!populated[field] && populated[field] !== 0 && populated[field] !== false) {
        populated[field] = defaultValue;
      }
    }
    
    return populated;
  });
}`;

      strategy.implementation.push('Generated field population function');

    } catch (error) {
      console.error('Error implementing field population strategy:', error);
      throw error;
    }

    return strategy;
  }

  /**
   * Strategy 4: Staged Loading Strategy
   */
  async implementStagedLoadingStrategy(objectName, validationRules) {
    console.log('🎭 Implementing Staged Loading Strategy...');
    
    const strategy = {
      strategy: 'STAGED_LOADING',
      object: objectName,
      stages: [],
      implementation: []
    };

    try {
      // Analyze validation rules to determine stages
      const requiredFields = new Set();
      const conditionalFields = new Set();
      
      for (const rule of validationRules) {
        const fields = this.extractFieldsFromFormula(rule.ErrorConditionFormula);
        
        if (rule.ErrorConditionFormula.includes('ISCHANGED')) {
          fields.forEach(f => conditionalFields.add(f));
        } else {
          fields.forEach(f => requiredFields.add(f));
        }
      }

      // Stage 1: Insert with minimal required fields
      strategy.stages.push({
        phase: 1,
        operation: 'INSERT',
        description: 'Insert records with minimal required fields',
        fields: Array.from(requiredFields),
        validation: 'MINIMAL'
      });

      // Stage 2: Update with conditional fields
      if (conditionalFields.size > 0) {
        strategy.stages.push({
          phase: 2,
          operation: 'UPDATE',
          description: 'Update records with conditional fields',
          fields: Array.from(conditionalFields),
          validation: 'BYPASS_ISCHANGED'
        });
      }

      // Stage 3: Final update with complete data
      strategy.stages.push({
        phase: 3,
        operation: 'UPDATE',
        description: 'Final update with complete data',
        fields: 'ALL',
        validation: 'FULL'
      });

      strategy.implementation.push(`Generated ${strategy.stages.length}-stage loading plan`);

    } catch (error) {
      console.error('Error implementing staged loading strategy:', error);
      throw error;
    }

    return strategy;
  }

  /**
   * Strategy 5: Validation Rule Deactivation
   */
  async implementValidationDeactivation(objectName, validationRules) {
    console.log('🚫 Implementing Validation Rule Deactivation Strategy...');
    
    const strategy = {
      strategy: 'VALIDATION_DEACTIVATION',
      object: objectName,
      rules: [],
      implementation: []
    };

    try {
      // Generate deactivation script
      for (const rule of validationRules) {
        strategy.rules.push({
          id: rule.Id,
          name: rule.Name,
          currentState: rule.Active,
          targetState: false
        });

        // Create metadata for deactivation
        const ruleMetadata = `<?xml version="1.0" encoding="UTF-8"?>
<ValidationRule xmlns="http://soap.sforce.com/2006/04/metadata">
    <fullName>${rule.Name}</fullName>
    <active>false</active>
    <errorConditionFormula>${rule.ErrorConditionFormula}</errorConditionFormula>
    <errorMessage>${rule.ErrorMessage}</errorMessage>
</ValidationRule>`;

        const rulePath = `force-app/main/default/objects/${objectName}/validationRules/${rule.Name}.validationRule-meta.xml`;
        strategy.implementation.push({
          action: 'DEACTIVATE',
          path: rulePath,
          metadata: ruleMetadata
        });
      }

      // Create reactivation plan
      strategy.reactivationPlan = strategy.rules.map(rule => ({
        id: rule.id,
        name: rule.name,
        action: 'REACTIVATE',
        targetState: true
      }));

    } catch (error) {
      console.error('Error implementing validation deactivation:', error);
      throw error;
    }

    return strategy;
  }

  /**
   * Enable bypass using selected strategy
   */
  async enableBypass(strategy, context = {}) {
    console.log(`🔓 Enabling bypass using ${strategy.strategy} strategy...`);
    
    const bypass = {
      strategy: strategy.strategy,
      startTime: new Date().toISOString(),
      context: context,
      success: false
    };

    try {
      switch (strategy.strategy) {
        case 'CUSTOM_SETTING':
          await this.enableCustomSettingBypass(context.objectName);
          break;
          
        case 'PERMISSION_SET':
          await this.assignPermissionSet(strategy.permissionSetName, context.userId);
          break;
          
        case 'FIELD_POPULATION':
          // No enable action needed - applied during data transformation
          bypass.fieldDefaults = strategy.fieldDefaults;
          break;
          
        case 'STAGED_LOADING':
          // No enable action needed - applied during execution
          bypass.stages = strategy.stages;
          break;
          
        case 'VALIDATION_DEACTIVATION':
          await this.deactivateValidationRules(strategy.rules);
          break;
      }

      bypass.success = true;
      this.activeBypass = bypass;
      this.bypassHistory.push(bypass);

    } catch (error) {
      bypass.error = error.message;
      console.error('Error enabling bypass:', error);
      throw error;
    }

    return bypass;
  }

  /**
   * Disable bypass
   */
  async disableBypass() {
    if (!this.activeBypass) {
      console.log('No active bypass to disable');
      return;
    }

    console.log(`🔒 Disabling ${this.activeBypass.strategy} bypass...`);
    
    try {
      switch (this.activeBypass.strategy) {
        case 'CUSTOM_SETTING':
          await this.disableCustomSettingBypass(this.activeBypass.context.objectName);
          break;
          
        case 'PERMISSION_SET':
          await this.removePermissionSet(
            this.activeBypass.permissionSetName,
            this.activeBypass.context.userId
          );
          break;
          
        case 'VALIDATION_DEACTIVATION':
          await this.reactivateValidationRules(this.activeBypass.reactivationPlan);
          break;
      }

      this.activeBypass.endTime = new Date().toISOString();
      this.activeBypass = null;

    } catch (error) {
      console.error('Error disabling bypass:', error);
      throw error;
    }
  }

  /**
   * Helper: Enable custom setting bypass
   */
  async enableCustomSettingBypass(objectName) {
    const apexCode = `ValidationBypassHelper.enableBypass();`;
    return this.executeAnonymousApex(apexCode);
  }

  /**
   * Helper: Disable custom setting bypass
   */
  async disableCustomSettingBypass(objectName) {
    const apexCode = `ValidationBypassHelper.disableBypass();`;
    return this.executeAnonymousApex(apexCode);
  }

  /**
   * Helper: Assign permission set
   */
  async assignPermissionSet(permissionSetName, userId) {
    const cmd = `sf data create record --sobject PermissionSetAssignment --values "PermissionSetId='${permissionSetName}' AssigneeId='${userId}'" --target-org ${this.orgAlias}`;
    return execSync(cmd, { encoding: 'utf8' });
  }

  /**
   * Helper: Remove permission set
   */
  async removePermissionSet(permissionSetName, userId) {
    const query = `SELECT Id FROM PermissionSetAssignment WHERE PermissionSetId='${permissionSetName}' AND AssigneeId='${userId}'`;
    const result = JSON.parse(execSync(
      `sf data query --query "${query}" --json --target-org ${this.orgAlias}`,
      { encoding: 'utf8' }
    ));
    
    if (result.result.records.length > 0) {
      const assignmentId = result.result.records[0].Id;
      const cmd = `sf data delete record --sobject PermissionSetAssignment --record-id ${assignmentId} --target-org ${this.orgAlias}`;
      return execSync(cmd, { encoding: 'utf8' });
    }
  }

  /**
   * Helper: Deactivate validation rules
   */
  async deactivateValidationRules(rules) {
    for (const rule of rules) {
      // Deploy deactivated metadata
      console.log(`Deactivating rule: ${rule.name}`);
      // Implementation would deploy the deactivated metadata
    }
  }

  /**
   * Helper: Reactivate validation rules
   */
  async reactivateValidationRules(rules) {
    for (const rule of rules) {
      // Deploy reactivated metadata
      console.log(`Reactivating rule: ${rule.name}`);
      // Implementation would deploy the reactivated metadata
    }
  }

  /**
   * Helper: Execute anonymous Apex
   */
  async executeAnonymousApex(apexCode) {
    const tempFile = `require('os').tmpdir())}.apex`;
    await fs.writeFile(tempFile, apexCode);
    
    try {
      const cmd = `sf apex run --file ${tempFile} --target-org ${this.orgAlias}`;
      const result = execSync(cmd, { encoding: 'utf8' });
      return result;
    } finally {
      await fs.unlink(tempFile);
    }
  }

  /**
   * Helper: Determine field default value
   */
  async determineFieldDefault(objectName, field) {
    // Logic to determine appropriate default based on field type
    const typeDefaults = {
      'STRING': '',
      'TEXTAREA': '',
      'EMAIL': 'placeholder@example.com',
      'PHONE': '555-0000',
      'NUMBER': 0,
      'CURRENCY': 0,
      'PERCENT': 0,
      'DATE': new Date().toISOString().split('T')[0],
      'DATETIME': new Date().toISOString(),
      'BOOLEAN': false,
      'PICKLIST': null, // Would need to query for default
      'REFERENCE': null // Would need special handling
    };
    
    return typeDefaults[field.type] || null;
  }

  /**
   * Helper: Extract fields from validation formula
   */
  extractFieldsFromFormula(formula) {
    const fields = new Set();
    const fieldPattern = /\b([A-Za-z_][A-Za-z0-9_]*__c)\b/g;
    let match;
    
    while ((match = fieldPattern.exec(formula)) !== null) {
      fields.add(match[1]);
    }
    
    return Array.from(fields);
  }

  /**
   * Helper: Save metadata file
   */
  async saveMetadata(filePath, content) {
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(filePath, content);
  }

  /**
   * Generate bypass report
   */
  generateBypassReport() {
    return {
      activeBypass: this.activeBypass,
      history: this.bypassHistory,
      statistics: {
        totalBypasses: this.bypassHistory.length,
        byStrategy: this.bypassHistory.reduce((acc, bypass) => {
          acc[bypass.strategy] = (acc[bypass.strategy] || 0) + 1;
          return acc;
        }, {}),
        averageDuration: this.calculateAverageBypassDuration()
      }
    };
  }

  /**
   * Calculate average bypass duration
   */
  calculateAverageBypassDuration() {
    const completedBypasses = this.bypassHistory.filter(b => b.endTime);
    if (completedBypasses.length === 0) return 0;
    
    const totalDuration = completedBypasses.reduce((sum, bypass) => {
      const duration = new Date(bypass.endTime) - new Date(bypass.startTime);
      return sum + duration;
    }, 0);
    
    return Math.round(totalDuration / completedBypasses.length / 1000); // seconds
  }
}

// Export for use in other modules
module.exports = ValidationBypassManager;

// CLI interface
if (require.main === module) {
  const [,, command, ...args] = process.argv;
  
  async function main() {
    const orgAlias = process.env.SF_TARGET_ORG || 'myorg';
    const manager = new ValidationBypassManager(orgAlias);
    
    try {
      switch (command) {
        case 'analyze':
          const objectName = args[0];
          // Would need to fetch validation rules from org
          const analysis = await manager.analyzeAndRecommendStrategy(objectName, []);
          console.log(JSON.stringify(analysis, null, 2));
          break;
          
        case 'report':
          const report = manager.generateBypassReport();
          console.log(JSON.stringify(report, null, 2));
          break;
          
        default:
          console.log('Usage: validation-bypass-manager.js [analyze|report] [args...]');
      }
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  }
  
  main();
}

// Export for use in other modules
module.exports = { ValidationBypassManager };