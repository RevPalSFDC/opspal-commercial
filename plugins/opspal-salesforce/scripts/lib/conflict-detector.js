#!/usr/bin/env node

/**
 * Conflict Detection Framework for Salesforce Metadata
 * 
 * Detects and analyzes conflicts between planned changes and existing org state
 */

const { execSync } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const { safeExecSfCommand } = require('./safe-sf-result-parser');
const { generateReceipt } = require('./execution-receipt');

class ConflictDetector {
  constructor(orgAlias) {
    this.orgAlias = orgAlias;
    this.conflicts = [];
    this._lastReceipt = null;
  }

  /**
   * Main conflict detection entry point
   */
  async detectConflicts(objectName, plannedChanges) {
    console.log(`🔍 Detecting conflicts for ${objectName}...`);
    
    this.conflicts = [];
    
    // Get current org state
    const orgState = await this.getOrgState(objectName);
    
    if (!orgState.exists) {
      // Object doesn't exist - no conflicts possible
      return {
        hasConflicts: false,
        conflicts: [],
        objectExists: false
      };
    }
    
    // Check field conflicts
    if (plannedChanges.fields) {
      await this.detectFieldConflicts(orgState, plannedChanges.fields);
    }
    
    // Check validation rule conflicts
    if (plannedChanges.validationRules) {
      await this.detectValidationRuleConflicts(orgState, plannedChanges.validationRules);
    }
    
    // Check relationship conflicts
    if (plannedChanges.relationships) {
      await this.detectRelationshipConflicts(orgState, plannedChanges.relationships);
    }
    
    // Check permission conflicts
    await this.detectPermissionConflicts(objectName, plannedChanges);
    
    // Check automation conflicts
    await this.detectAutomationConflicts(objectName, plannedChanges);
    
    return {
      hasConflicts: this.conflicts.length > 0,
      conflicts: this.conflicts,
      objectExists: true,
      orgState: orgState,
      analysis: this.analyzeConflicts()
    };
  }

  /**
   * Get current org state for an object
   */
  async getOrgState(objectName) {
    // Track execution branches for receipt generation
    const branches = [];

    try {
      // Describe the object — use safeExecSfCommand for receipt coverage.
      // NOTE: objectName is from internal caller configuration, not external user input.
      const describeResult = safeExecSfCommand(
        `sf sobject describe ${objectName} --target-org ${this.orgAlias} --json`
      );

      if (!describeResult.success) {
        branches.push({ name: 'sobject-describe', status: 'failed', recordCount: 0, error: (describeResult.error || '').substring(0, 100) });
        this._lastReceipt = this._buildReceipt(branches, 'failed', objectName);
        return { exists: false, error: describeResult.error };
      }

      branches.push({ name: 'sobject-describe', status: 'success', recordCount: 1 });
      const objectDesc = describeResult.data?.result || describeResult.data;

      // Each metadata query is isolated — one failure doesn't abort others.

      // Get validation rules
      let validationRules = [];
      const vrResult = safeExecSfCommand(
        `sf data query --query "SELECT Id, Active, ErrorConditionFormula, ErrorMessage FROM ValidationRule WHERE EntityDefinition.DeveloperName = '${objectName}'" --target-org ${this.orgAlias} --use-tooling-api --json`
      );
      if (vrResult.success) {
        validationRules = vrResult.records || [];
        branches.push({ name: 'ValidationRule', status: 'success', recordCount: validationRules.length });
      } else {
        branches.push({ name: 'ValidationRule', status: 'failed', recordCount: 0, failureType: vrResult.failureType, error: (vrResult.error || '').substring(0, 100) });
        console.warn(`    Warning: ValidationRule query failed for ${objectName}: ${vrResult.error}`);
      }

      // Get triggers
      let triggers = [];
      const trResult = safeExecSfCommand(
        `sf data query --query "SELECT Id, Name, Status FROM ApexTrigger WHERE TableEnumOrId = '${objectName}'" --target-org ${this.orgAlias} --use-tooling-api --json`
      );
      if (trResult.success) {
        triggers = trResult.records || [];
        branches.push({ name: 'ApexTrigger', status: 'success', recordCount: triggers.length });
      } else {
        branches.push({ name: 'ApexTrigger', status: 'failed', recordCount: 0, failureType: trResult.failureType, error: (trResult.error || '').substring(0, 100) });
        console.warn(`    Warning: ApexTrigger query failed for ${objectName}: ${trResult.error}`);
      }

      // Get flows — DeveloperName (not ApiName). FDV → Flow fallback.
      let flows = [];
      const flResult = safeExecSfCommand(
        `sf data query --query "SELECT Id, DeveloperName, ProcessType, IsActive FROM FlowDefinitionView WHERE IsActive = true" --target-org ${this.orgAlias} --use-tooling-api --json`
      );
      if (flResult.success) {
        flows = (flResult.records || []).filter(f =>
          f.ProcessType === 'AutoLaunchedFlow' || f.ProcessType === 'Flow'
        );
        branches.push({ name: 'FlowDefinitionView', status: 'success', recordCount: flows.length });
      } else {
        branches.push({ name: 'FlowDefinitionView', status: 'failed', recordCount: 0, failureType: flResult.failureType, error: (flResult.error || '').substring(0, 100) });
        console.warn(`    Warning: FlowDefinitionView unavailable, trying Flow: ${flResult.error}`);

        // Fallback to Flow object
        const fbResult = safeExecSfCommand(
          `sf data query --query "SELECT Id, DefinitionId, ProcessType, TriggerType, Status FROM Flow WHERE Status = 'Active'" --target-org ${this.orgAlias} --use-tooling-api --json`
        );
        if (fbResult.success) {
          flows = (fbResult.records || []).filter(f =>
            f.ProcessType === 'AutoLaunchedFlow' || f.ProcessType === 'Flow'
          );
          branches.push({ name: 'Flow-fallback', status: 'success', recordCount: flows.length, usedFallback: true });
        } else {
          branches.push({ name: 'Flow-fallback', status: 'failed', recordCount: 0, failureType: fbResult.failureType, error: (fbResult.error || '').substring(0, 100) });
          console.warn(`    Warning: Flow query also failed: ${fbResult.error}`);
        }
      }

      // Determine overall status
      const succeededBranches = branches.filter(b => b.status === 'success');
      const failedBranches = branches.filter(b => b.status === 'failed');
      let receiptStatus;
      if (failedBranches.length === 0) receiptStatus = 'complete';
      else if (succeededBranches.length <= 1) receiptStatus = 'failed'; // only describe succeeded
      else receiptStatus = 'partial';

      this._lastReceipt = this._buildReceipt(branches, receiptStatus, objectName);

      return {
        exists: true,
        name: objectDesc.name,
        label: objectDesc.label,
        fields: (objectDesc.fields || []).map(f => ({
          name: f.name,
          type: f.type,
          length: f.length,
          required: !f.nillable && !f.defaultedOnCreate,
          unique: f.unique,
          updateable: f.updateable,
          createable: f.createable,
          reference: f.referenceTo,
          picklistValues: f.picklistValues
        })),
        validationRules,
        triggers,
        flows,
        recordTypes: objectDesc.recordTypeInfos || []
      };
    } catch (error) {
      console.error(`Error getting org state: ${error.message}`);
      branches.push({ name: 'unexpected-error', status: 'failed', recordCount: 0, error: error.message });
      this._lastReceipt = this._buildReceipt(branches, 'failed', objectName);
      return { exists: false, error: error.message };
    }
  }

  /**
   * Build an execution receipt from branch results.
   * @private
   */
  _buildReceipt(branches, status, objectName) {
    const succeeded = {};
    const failed = {};
    for (const b of branches) {
      if (b.status === 'success') {
        succeeded[b.name] = { totalSize: b.recordCount || 0, records: [] };
      } else if (b.status === 'failed') {
        failed[b.name] = { error: b.error || 'unknown', failureType: b.failureType || 'unknown' };
      }
    }
    return generateReceipt({
      status,
      orgAlias: this.orgAlias,
      totalQueries: branches.length,
      succeededCount: Object.keys(succeeded).length,
      failedCount: Object.keys(failed).length,
      succeeded,
      failed,
      fallbacks: branches.filter(b => b.usedFallback).map(b => ({ name: b.name, note: 'fallback used' })),
      durationMs: 0
    }, { helper: `conflict-detector@${objectName || 'unknown'}` });
  }

  /**
   * Get the last execution receipt (available after getOrgState completes)
   */
  getLastReceipt() {
    return this._lastReceipt || null;
  }

  /**
   * Detect field-level conflicts
   */
  async detectFieldConflicts(orgState, plannedFields) {
    for (const plannedField of plannedFields) {
      const existingField = orgState.fields.find(f => 
        f.name.toLowerCase() === plannedField.name.toLowerCase()
      );
      
      if (existingField) {
        // Field exists - check for conflicts
        
        // Type conflict
        if (plannedField.type && existingField.type !== plannedField.type) {
          this.conflicts.push({
            type: 'FIELD_TYPE_MISMATCH',
            severity: 'CRITICAL',
            field: plannedField.name,
            description: `Field ${plannedField.name} exists with type ${existingField.type} but planned type is ${plannedField.type}`,
            existing: existingField.type,
            planned: plannedField.type,
            autoResolvable: this.canAutoConvertType(existingField.type, plannedField.type),
            resolution: this.getTypeConflictResolution(existingField.type, plannedField.type)
          });
        }
        
        // Length conflict (for text fields)
        if (plannedField.length && existingField.length && 
            plannedField.length !== existingField.length) {
          this.conflicts.push({
            type: 'FIELD_LENGTH_MISMATCH',
            severity: plannedField.length < existingField.length ? 'HIGH' : 'MEDIUM',
            field: plannedField.name,
            description: `Field ${plannedField.name} has length ${existingField.length} but planned length is ${plannedField.length}`,
            existing: existingField.length,
            planned: plannedField.length,
            autoResolvable: plannedField.length > existingField.length,
            resolution: plannedField.length > existingField.length ? 
              'Increase field length' : 'Data truncation risk'
          });
        }
        
        // Required field conflict
        if (plannedField.required !== undefined && 
            plannedField.required !== existingField.required) {
          this.conflicts.push({
            type: 'FIELD_REQUIRED_MISMATCH',
            severity: plannedField.required && !existingField.required ? 'HIGH' : 'LOW',
            field: plannedField.name,
            description: `Field ${plannedField.name} required setting differs`,
            existing: existingField.required,
            planned: plannedField.required,
            autoResolvable: true,
            resolution: plannedField.required ? 
              'Will require data population before making required' : 
              'Can be made optional'
          });
        }
        
        // Unique constraint conflict
        if (plannedField.unique !== undefined && 
            plannedField.unique !== existingField.unique) {
          this.conflicts.push({
            type: 'FIELD_UNIQUE_MISMATCH',
            severity: plannedField.unique && !existingField.unique ? 'HIGH' : 'LOW',
            field: plannedField.name,
            description: `Field ${plannedField.name} unique constraint differs`,
            existing: existingField.unique,
            planned: plannedField.unique,
            autoResolvable: !plannedField.unique,
            resolution: plannedField.unique ? 
              'Must check for duplicates before adding unique constraint' : 
              'Can remove unique constraint'
          });
        }
      }
      
      // Check for field name collisions (case-insensitive)
      const similarFields = orgState.fields.filter(f => 
        f.name.toLowerCase() === plannedField.name.toLowerCase() &&
        f.name !== plannedField.name
      );
      
      if (similarFields.length > 0) {
        this.conflicts.push({
          type: 'FIELD_NAME_COLLISION',
          severity: 'MEDIUM',
          field: plannedField.name,
          description: `Field name ${plannedField.name} conflicts with existing field(s): ${similarFields.map(f => f.name).join(', ')}`,
          existing: similarFields.map(f => f.name),
          planned: plannedField.name,
          autoResolvable: false,
          resolution: 'Rename field to avoid collision'
        });
      }
    }
  }

  /**
   * Detect validation rule conflicts
   */
  async detectValidationRuleConflicts(orgState, plannedRules) {
    // Check for PRIORVALUE usage
    const blockingRules = orgState.validationRules.filter(rule => 
      rule.Active && rule.ErrorConditionFormula.includes('PRIORVALUE')
    );
    
    if (blockingRules.length > 0) {
      this.conflicts.push({
        type: 'VALIDATION_RULE_BLOCKER',
        severity: 'HIGH',
        description: 'Validation rules with PRIORVALUE will block flows and triggers',
        rules: blockingRules.map(r => r.Id),
        autoResolvable: false,
        resolution: 'Deactivate during migration or refactor to avoid PRIORVALUE'
      });
    }
    
    // Check for required field validation
    const requiredFieldRules = orgState.validationRules.filter(rule => 
      rule.Active && (
        rule.ErrorConditionFormula.includes('ISBLANK') ||
        rule.ErrorConditionFormula.includes('ISNULL')
      )
    );
    
    if (requiredFieldRules.length > 0) {
      this.conflicts.push({
        type: 'REQUIRED_FIELD_VALIDATION',
        severity: 'MEDIUM',
        description: 'Validation rules enforce required fields that may block operations',
        rules: requiredFieldRules.length,
        autoResolvable: true,
        resolution: 'Ensure required fields are populated during migration'
      });
    }
  }

  /**
   * Detect relationship conflicts
   */
  async detectRelationshipConflicts(orgState, plannedRelationships) {
    for (const relationship of plannedRelationships) {
      const existingField = orgState.fields.find(f => 
        f.name === relationship.field
      );
      
      if (existingField && existingField.reference) {
        // Check if reference object changed
        if (relationship.referenceTo !== existingField.reference[0]) {
          this.conflicts.push({
            type: 'RELATIONSHIP_TARGET_MISMATCH',
            severity: 'CRITICAL',
            field: relationship.field,
            description: `Relationship ${relationship.field} points to ${existingField.reference[0]} but planned to point to ${relationship.referenceTo}`,
            existing: existingField.reference[0],
            planned: relationship.referenceTo,
            autoResolvable: false,
            resolution: 'Create new relationship field or migrate existing relationships'
          });
        }
      }
    }
  }

  /**
   * Detect permission conflicts
   */
  async detectPermissionConflicts(objectName, plannedChanges) {
    try {
      // Check object-level permissions
      const permQuery = `sf data query --query "SELECT Id, Parent.Name, SobjectType, PermissionsRead, PermissionsCreate, PermissionsEdit, PermissionsDelete FROM ObjectPermissions WHERE SobjectType = '${objectName}' LIMIT 5" --target-org ${this.orgAlias} --json`;
      const permResult = JSON.parse(execSync(permQuery, { encoding: 'utf8' }));
      
      if (permResult.result?.records) {
        const restrictedProfiles = permResult.result.records.filter(p => 
          !p.PermissionsCreate || !p.PermissionsEdit
        );
        
        if (restrictedProfiles.length > 0) {
          this.conflicts.push({
            type: 'PERMISSION_RESTRICTION',
            severity: 'MEDIUM',
            description: `Some profiles have restricted access to ${objectName}`,
            profiles: restrictedProfiles.length,
            autoResolvable: false,
            resolution: 'Review and update profile permissions as needed'
          });
        }
      }
    } catch (error) {
      // Permission check failed - non-critical
      console.warn(`Warning: Could not check permissions: ${error.message}`);
    }
  }

  /**
   * Detect automation conflicts
   */
  async detectAutomationConflicts(objectName, plannedChanges) {
    try {
      // Check for active flows on the object
      // FlowDefinitionView does not expose ObjectType. Use active flow count as a heuristic.
      const flowQuery = `sf data query --query "SELECT COUNT() FROM Flow WHERE Status = 'Active'" --target-org ${this.orgAlias} --use-tooling-api --json`;
      const flowResult = JSON.parse(execSync(flowQuery, { encoding: 'utf8' }));
      
      if (flowResult.result?.totalSize > 0) {
        this.conflicts.push({
          type: 'ACTIVE_AUTOMATION',
          severity: 'MEDIUM',
          description: `Active flows detected that may be affected by changes to ${objectName}`,
          count: flowResult.result.totalSize,
          autoResolvable: false,
          resolution: 'Review flows for compatibility with changes'
        });
      }
    } catch (error) {
      // Automation check failed - non-critical
      console.warn(`Warning: Could not check automation: ${error.message}`);
    }
  }

  /**
   * Check if field types can be auto-converted
   */
  canAutoConvertType(fromType, toType) {
    const compatibleConversions = {
      'string': ['textarea', 'email', 'phone', 'url'],
      'double': ['currency', 'percent'],
      'int': ['double', 'currency'],
      'picklist': ['string', 'textarea'],
      'date': ['datetime'],
      'checkbox': ['string']
    };
    
    return compatibleConversions[fromType]?.includes(toType) || false;
  }

  /**
   * Get resolution strategy for type conflicts
   */
  getTypeConflictResolution(existingType, plannedType) {
    if (this.canAutoConvertType(existingType, plannedType)) {
      return {
        strategy: 'AUTO_CONVERT',
        steps: [
          `Convert ${existingType} to ${plannedType}`,
          'Verify data compatibility',
          'Update field metadata'
        ]
      };
    }
    
    // Cannot auto-convert
    return {
      strategy: 'RECREATE_FIELD',
      steps: [
        `Create new field with suffix _New as ${plannedType}`,
        'Migrate data from old field to new field',
        'Update all references',
        'Delete old field',
        'Rename new field to original name'
      ]
    };
  }

  /**
   * Analyze detected conflicts
   */
  analyzeConflicts() {
    const analysis = {
      summary: {
        total: this.conflicts.length,
        critical: this.conflicts.filter(c => c.severity === 'CRITICAL').length,
        high: this.conflicts.filter(c => c.severity === 'HIGH').length,
        medium: this.conflicts.filter(c => c.severity === 'MEDIUM').length,
        low: this.conflicts.filter(c => c.severity === 'LOW').length
      },
      autoResolvable: this.conflicts.filter(c => c.autoResolvable).length,
      manualRequired: this.conflicts.filter(c => !c.autoResolvable).length,
      blockers: this.conflicts.filter(c => c.severity === 'CRITICAL'),
      recommendations: this.generateRecommendations()
    };
    
    return analysis;
  }

  /**
   * Generate recommendations based on conflicts
   */
  generateRecommendations() {
    const recommendations = [];
    
    if (this.conflicts.some(c => c.type === 'FIELD_TYPE_MISMATCH')) {
      recommendations.push({
        priority: 'HIGH',
        action: 'Review field type conflicts and plan migration strategy',
        details: 'Field type mismatches require careful data migration planning'
      });
    }
    
    if (this.conflicts.some(c => c.type === 'VALIDATION_RULE_BLOCKER')) {
      recommendations.push({
        priority: 'HIGH',
        action: 'Temporarily deactivate blocking validation rules',
        details: 'PRIORVALUE validation rules will block automated operations'
      });
    }
    
    if (this.conflicts.some(c => c.type === 'REQUIRED_FIELD_VALIDATION')) {
      recommendations.push({
        priority: 'MEDIUM',
        action: 'Prepare default values for required fields',
        details: 'Ensure all required fields have values during migration'
      });
    }
    
    if (this.conflicts.some(c => c.type === 'ACTIVE_AUTOMATION')) {
      recommendations.push({
        priority: 'MEDIUM',
        action: 'Review and test automation compatibility',
        details: 'Active flows and triggers may need updates'
      });
    }
    
    return recommendations;
  }
}

// CLI interface
if (require.main === module) {
  async function main() {
    const [,, command, ...args] = process.argv;
    
    if (command === 'analyze') {
      const objectName = args[0];
      const plannedFieldsFile = args[1];
      const orgAlias = args[2] || process.env.SF_TARGET_ORG;
      
      if (!objectName || !plannedFieldsFile || !orgAlias) {
        console.error('Usage: conflict-detector.js analyze <object> <planned-fields.json> <org-alias>');
        process.exit(1);
      }
      
      try {
        const plannedChanges = JSON.parse(
          await fs.readFile(plannedFieldsFile, 'utf8')
        );
        
        const detector = new ConflictDetector(orgAlias);
        const result = await detector.detectConflicts(objectName, plannedChanges);
        
        console.log(JSON.stringify(result, null, 2));
        
        if (result.hasConflicts) {
          process.exit(1); // Exit with error if conflicts found
        }
      } catch (error) {
        console.error(`Error: ${error.message}`);
        process.exit(1);
      }
    } else {
      console.log('Usage: conflict-detector.js analyze <object> <planned-fields.json> <org-alias>');
      process.exit(1);
    }
  }
  
  main();
}

module.exports = ConflictDetector;
