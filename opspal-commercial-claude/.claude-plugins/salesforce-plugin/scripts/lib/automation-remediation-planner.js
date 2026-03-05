#!/usr/bin/env node
/**
 * Automation Remediation Planner
 *
 * Generates detailed, actionable remediation plans from automation audit conflicts.
 * Creates phase-based implementation guides with code templates and testing strategies.
 *
 * Features:
 * - Phase-based remediation planning
 * - Code template generation for trigger handlers
 * - Test class scaffolding
 * - Rollback plan generation
 * - Risk assessment per change
 * - Timeline estimation with dependencies
 *
 * Usage:
 *   node automation-remediation-planner.js <audit-directory> [options]
 *
 * Options:
 *   --object=<ObjectName>  Generate plan for specific object only
 *   --phase=<1|2|3>        Generate specific phase only
 *   --templates            Generate code templates
 *
 * @version 1.0.0
 * @date 2025-10-08
 */

const fs = require('fs');
const path = require('path');

class AutomationRemediationPlanner {
  constructor(auditDir) {
    this.auditDir = auditDir;
    this.conflictsPath = path.join(auditDir, 'findings/Conflicts.json');
    this.rawDataPath = path.join(auditDir, 'raw/raw_data.json');
    this.plansDir = path.join(auditDir, 'remediation-plans');

    // Ensure plans directory exists
    if (!fs.existsSync(this.plansDir)) {
      fs.mkdirSync(this.plansDir, { recursive: true });
    }
  }

  /**
   * Load audit data
   */
  loadData() {
    console.log('Loading audit data...');
    this.conflicts = JSON.parse(fs.readFileSync(this.conflictsPath, 'utf8'));
    this.rawData = JSON.parse(fs.readFileSync(this.rawDataPath, 'utf8'));
    console.log(`Loaded ${this.conflicts.length} conflicts`);
  }

  /**
   * Group conflicts by phase based on severity
   */
  groupByPhase() {
    return {
      phase1: this.conflicts.filter(c => c.severity === 'CRITICAL'),
      phase2: this.conflicts.filter(c => c.severity === 'HIGH'),
      phase3: this.conflicts.filter(c => c.severity === 'MEDIUM' || c.severity === 'LOW')
    };
  }

  /**
   * Generate trigger handler template
   */
  generateTriggerHandlerTemplate(objectName, triggers) {
    const className = `${objectName}TriggerHandler`;

    // Collect all events from all triggers
    const events = new Set();
    triggers.forEach(trigger => {
      trigger.events.forEach(event => events.add(event));
    });

    const template = `/**
 * Handler for ${objectName} Trigger
 *
 * Consolidates logic from ${triggers.length} separate triggers:
${triggers.map(t => ` *   - ${t.name}`).join('\n')}
 *
 * Architecture:
 *   - Single entry point for all ${objectName} trigger events
 *   - Handler pattern for separation of concerns
 *   - Bulkified for governor limit efficiency
 *   - Explicit execution order for predictable behavior
 *
 * @version 1.0.0
 * @date ${new Date().toISOString().split('T')[0]}
 */
public with sharing class ${className} {

    // Static flags to prevent recursion
    private static Boolean isExecuting = false;
    private static Integer executionCount = 0;
    private static final Integer MAX_EXECUTIONS = 1;

    /**
     * Main entry point - called by trigger
     */
    public static void execute() {
        // Prevent recursion
        if (isExecuting || executionCount >= MAX_EXECUTIONS) {
            return;
        }

        isExecuting = true;
        executionCount++;

        try {
            // Route to appropriate handler based on trigger context
            if (Trigger.isBefore) {
                if (Trigger.isInsert) {
                    handleBeforeInsert(Trigger.new);
                } else if (Trigger.isUpdate) {
                    handleBeforeUpdate(Trigger.new, Trigger.oldMap);
                } else if (Trigger.isDelete) {
                    handleBeforeDelete(Trigger.old);
                }
            } else if (Trigger.isAfter) {
                if (Trigger.isInsert) {
                    handleAfterInsert(Trigger.new, Trigger.newMap);
                } else if (Trigger.isUpdate) {
                    handleAfterUpdate(Trigger.new, Trigger.newMap, Trigger.oldMap);
                } else if (Trigger.isDelete) {
                    handleAfterDelete(Trigger.old, Trigger.oldMap);
                } else if (Trigger.isUndelete) {
                    handleAfterUndelete(Trigger.new, Trigger.newMap);
                }
            }
        } finally {
            isExecuting = false;
        }
    }

    /**
     * Before Insert Handler
     * Phase 1: Data validation and defaults
     */
    private static void handleBeforeInsert(List<${objectName}> newRecords) {
        // TODO: Migrate logic from existing triggers
        // Order of execution:
        // 1. Data validation
        // 2. Set default field values
        // 3. Apply business rules
        // 4. Field-level calculations

        for (${objectName} record : newRecords) {
            // Example: Set defaults
            // if (record.SomeField__c == null) {
            //     record.SomeField__c = 'Default Value';
            // }
        }
    }

    /**
     * Before Update Handler
     * Phase 2: Pre-update validation
     */
    private static void handleBeforeUpdate(
        List<${objectName}> newRecords,
        Map<Id, ${objectName}> oldMap
    ) {
        // TODO: Migrate logic from existing triggers
        // Order of execution:
        // 1. Validate field changes
        // 2. Apply update rules
        // 3. Recalculate dependent fields

        for (${objectName} record : newRecords) {
            ${objectName} oldRecord = oldMap.get(record.Id);

            // Example: Detect field changes
            // if (record.Status__c != oldRecord.Status__c) {
            //     // Handle status change
            // }
        }
    }

    /**
     * Before Delete Handler
     * Phase 3: Deletion validation
     */
    private static void handleBeforeDelete(List<${objectName}> oldRecords) {
        // TODO: Migrate logic from existing triggers
        // Order of execution:
        // 1. Validate deletion is allowed
        // 2. Check for dependent records
        // 3. Prevent deletion if needed

        for (${objectName} record : oldRecords) {
            // Example: Prevent deletion
            // if (record.IsLocked__c) {
            //     record.addError('Cannot delete locked records');
            // }
        }
    }

    /**
     * After Insert Handler
     * Phase 4: Post-insert actions
     */
    private static void handleAfterInsert(
        List<${objectName}> newRecords,
        Map<Id, ${objectName}> newMap
    ) {
        // TODO: Migrate logic from existing triggers
        // Order of execution:
        // 1. Create related records
        // 2. Update parent/child relationships
        // 3. Send notifications
        // 4. Sync to external systems
        // 5. Log audit trail

        // Collect IDs for bulk operations
        Set<Id> recordIds = newMap.keySet();

        // Example: Create related records
        // List<RelatedObject__c> relatedRecords = new List<RelatedObject__c>();
        // for (${objectName} record : newRecords) {
        //     relatedRecords.add(new RelatedObject__c(
        //         Parent__c = record.Id
        //     ));
        // }
        // if (!relatedRecords.isEmpty()) {
        //     insert relatedRecords;
        // }
    }

    /**
     * After Update Handler
     * Phase 5: Post-update actions
     */
    private static void handleAfterUpdate(
        List<${objectName}> newRecords,
        Map<Id, ${objectName}> newMap,
        Map<Id, ${objectName}> oldMap
    ) {
        // TODO: Migrate logic from existing triggers
        // Order of execution:
        // 1. Detect significant field changes
        // 2. Update related records
        // 3. Cascade updates to children
        // 4. Sync changes to external systems
        // 5. Send change notifications
        // 6. Update audit log

        List<${objectName}> significantChanges = new List<${objectName}>();

        for (${objectName} record : newRecords) {
            ${objectName} oldRecord = oldMap.get(record.Id);

            // Example: Detect significant changes
            // if (hasSignificantChange(record, oldRecord)) {
            //     significantChanges.add(record);
            // }
        }

        if (!significantChanges.isEmpty()) {
            // Process significant changes
        }
    }

    /**
     * After Delete Handler
     * Phase 6: Post-deletion cleanup
     */
    private static void handleAfterDelete(
        List<${objectName}> oldRecords,
        Map<Id, ${objectName}> oldMap
    ) {
        // TODO: Migrate logic from existing triggers
        // Order of execution:
        // 1. Archive deleted data
        // 2. Clean up related records
        // 3. Update parent records
        // 4. Log deletion audit trail

        // Example: Archive to external system
        // archiveDeletedRecords(oldRecords);
    }

    /**
     * After Undelete Handler
     * Phase 7: Post-undelete restoration
     */
    private static void handleAfterUndelete(
        List<${objectName}> newRecords,
        Map<Id, ${objectName}> newMap
    ) {
        // TODO: Migrate logic from existing triggers
        // Order of execution:
        // 1. Restore related records
        // 2. Re-establish relationships
        // 3. Notify stakeholders
        // 4. Log restoration audit trail
    }

    /**
     * Helper method: Check if record has significant changes
     */
    private static Boolean hasSignificantChange(
        ${objectName} newRecord,
        ${objectName} oldRecord
    ) {
        // TODO: Define what constitutes a "significant" change
        // Example:
        // return newRecord.Status__c != oldRecord.Status__c ||
        //        newRecord.Amount__c != oldRecord.Amount__c;
        return false;
    }
}`;

    return template;
  }

  /**
   * Generate test class template
   */
  generateTestClassTemplate(objectName, className) {
    return `/**
 * Test class for ${className}
 *
 * Comprehensive test coverage for ${objectName} trigger handler
 * Target: 100% code coverage
 *
 * @version 1.0.0
 * @date ${new Date().toISOString().split('T')[0]}
 */
@isTest
private class ${className}_Test {

    /**
     * Test setup - create test data
     */
    @TestSetup
    static void setupTestData() {
        // Create test records
        // TODO: Add any required parent records first

        // Example:
        // List<${objectName}> testRecords = new List<${objectName}>();
        // for (Integer i = 0; i < 200; i++) {
        //     testRecords.add(new ${objectName}(
        //         Name = 'Test Record ' + i
        //         // Add required fields
        //     ));
        // }
        // insert testRecords;
    }

    /**
     * Test: Before Insert logic
     */
    @isTest
    static void testBeforeInsert() {
        Test.startTest();

        // Create records to trigger beforeInsert
        List<${objectName}> records = new List<${objectName}>();
        for (Integer i = 0; i < 200; i++) {
            records.add(new ${objectName}(
                Name = 'Test ' + i
                // Add required fields
            ));
        }

        insert records;

        Test.stopTest();

        // Verify expected behavior
        List<${objectName}> inserted = [SELECT Id, Name FROM ${objectName} WHERE Name LIKE 'Test%'];
        System.assertEquals(200, inserted.size(), 'Should insert 200 records');

        // TODO: Add specific assertions for your logic
        // System.assertEquals('Expected Value', inserted[0].SomeField__c);
    }

    /**
     * Test: Before Update logic
     */
    @isTest
    static void testBeforeUpdate() {
        // Get test records
        List<${objectName}> records = [SELECT Id FROM ${objectName} LIMIT 200];

        Test.startTest();

        // Update records to trigger beforeUpdate
        for (${objectName} record : records) {
            // Modify fields
            // record.SomeField__c = 'Updated Value';
        }
        update records;

        Test.stopTest();

        // Verify expected behavior
        // TODO: Add specific assertions
    }

    /**
     * Test: After Insert logic
     */
    @isTest
    static void testAfterInsert() {
        Test.startTest();

        List<${objectName}> records = new List<${objectName}>();
        for (Integer i = 0; i < 200; i++) {
            records.add(new ${objectName}(
                Name = 'Test After Insert ' + i
            ));
        }

        insert records;

        Test.stopTest();

        // Verify afterInsert actions occurred
        // TODO: Add specific assertions
        // Example: Check related records were created
    }

    /**
     * Test: After Update logic
     */
    @isTest
    static void testAfterUpdate() {
        List<${objectName}> records = [SELECT Id FROM ${objectName} LIMIT 200];

        Test.startTest();

        for (${objectName} record : records) {
            // Make significant change
            // record.Status__c = 'Updated';
        }
        update records;

        Test.stopTest();

        // Verify afterUpdate actions occurred
        // TODO: Add specific assertions
    }

    /**
     * Test: Delete and Undelete
     */
    @isTest
    static void testDeleteAndUndelete() {
        List<${objectName}> records = [SELECT Id FROM ${objectName} LIMIT 200];

        Test.startTest();

        // Test delete
        delete records;

        // Verify delete actions
        // TODO: Add assertions

        // Test undelete
        undelete records;

        Test.stopTest();

        // Verify undelete actions
        // TODO: Add assertions
    }

    /**
     * Test: Recursion prevention
     */
    @isTest
    static void testRecursionPrevention() {
        Test.startTest();

        ${objectName} record = new ${objectName}(
            Name = 'Recursion Test'
        );
        insert record;

        // Trigger multiple updates to test recursion guard
        for (Integer i = 0; i < 5; i++) {
            // record.SomeField__c = 'Update ' + i;
            update record;
        }

        Test.stopTest();

        // Verify no exceptions thrown
        // Handler should have prevented infinite recursion
        System.assert(true, 'Recursion guard should prevent infinite loops');
    }

    /**
     * Test: Bulk operations (governor limits)
     */
    @isTest
    static void testBulkOperations() {
        Test.startTest();

        // Test with 200 records (bulk context)
        List<${objectName}> records = new List<${objectName}>();
        for (Integer i = 0; i < 200; i++) {
            records.add(new ${objectName}(
                Name = 'Bulk Test ' + i
            ));
        }

        insert records;

        // Update all at once
        for (${objectName} record : records) {
            // record.SomeField__c = 'Bulk Update';
        }
        update records;

        Test.stopTest();

        // Verify no governor limit exceptions
        System.assertEquals(200, [SELECT COUNT() FROM ${objectName} WHERE Name LIKE 'Bulk Test%']);
    }
}`;
  }

  /**
   * Generate trigger template
   */
  generateTriggerTemplate(objectName) {
    return `/**
 * Consolidated trigger for ${objectName}
 *
 * Single entry point - all logic in ${objectName}TriggerHandler
 *
 * @version 1.0.0
 * @date ${new Date().toISOString().split('T')[0]}
 */
trigger ${objectName}Trigger on ${objectName} (
    before insert, after insert,
    before update, after update,
    before delete, after delete,
    after undelete
) {
    ${objectName}TriggerHandler.execute();
}`;
  }

  /**
   * Generate remediation plan for a single conflict
   */
  generateConflictPlan(conflict) {
    const objectName = conflict.object;
    const triggers = conflict.involved || [];

    const plan = {
      conflictId: conflict.conflictId,
      object: objectName,
      severity: conflict.severity,
      currentState: {
        triggerCount: conflict.triggerCount,
        triggers: triggers.map(t => ({
          name: t.name,
          events: t.events,
          id: t.id
        }))
      },
      targetState: {
        triggerCount: 1,
        triggerName: `${objectName}Trigger`,
        handlerName: `${objectName}TriggerHandler`,
        testClassName: `${objectName}TriggerHandler_Test`
      },
      implementation: {
        estimatedTime: conflict.recommendation.estimatedTime,
        complexity: conflict.recommendation.complexity,
        steps: [
          {
            step: 1,
            title: 'Create Handler Class',
            description: `Create ${objectName}TriggerHandler.cls with consolidated logic`,
            artifacts: ['handler-class'],
            estimatedHours: this.parseTimeEstimate(conflict.recommendation.estimatedTime) * 0.4
          },
          {
            step: 2,
            title: 'Migrate Trigger Logic',
            description: `Copy logic from ${conflict.triggerCount} existing triggers to handler methods`,
            artifacts: ['migrated-logic'],
            estimatedHours: this.parseTimeEstimate(conflict.recommendation.estimatedTime) * 0.3
          },
          {
            step: 3,
            title: 'Create Test Class',
            description: `Implement comprehensive test coverage (target 100%)`,
            artifacts: ['test-class'],
            estimatedHours: this.parseTimeEstimate(conflict.recommendation.estimatedTime) * 0.2
          },
          {
            step: 4,
            title: 'Deploy to Sandbox',
            description: 'Test in sandbox environment for 1 week',
            artifacts: ['sandbox-deployment'],
            estimatedHours: 2
          },
          {
            step: 5,
            title: 'Create New Trigger',
            description: `Deploy single ${objectName}Trigger that calls handler`,
            artifacts: ['new-trigger'],
            estimatedHours: 1
          },
          {
            step: 6,
            title: 'Production Deployment',
            description: 'Deploy to production with monitoring',
            artifacts: ['production-deployment'],
            estimatedHours: 2
          },
          {
            step: 7,
            title: 'Deactivate Old Triggers',
            description: 'Deactivate old triggers after 2-week validation',
            artifacts: ['cleanup'],
            estimatedHours: 1
          }
        ]
      },
      rollbackPlan: {
        steps: [
          'Deactivate new consolidated trigger',
          'Reactivate original triggers',
          'Verify system returns to previous state',
          'Document issues encountered'
        ]
      },
      risks: [
        {
          risk: 'Logic migration errors',
          severity: 'HIGH',
          mitigation: 'Comprehensive testing with 100% code coverage'
        },
        {
          risk: 'Execution order changes',
          severity: 'MEDIUM',
          mitigation: 'Document current behavior, test thoroughly'
        },
        {
          risk: 'Performance impact',
          severity: 'LOW',
          mitigation: 'Bulk operations in handler, governor limit monitoring'
        }
      ],
      successCriteria: [
        'Single trigger per object deployed',
        '100% test coverage achieved',
        'Zero production errors for 2 weeks',
        'All business logic preserved',
        'Performance metrics stable or improved'
      ]
    };

    return plan;
  }

  /**
   * Parse time estimate string to hours
   */
  parseTimeEstimate(timeStr) {
    const match = timeStr.match(/(\d+)-(\d+)/);
    if (match) {
      return (parseInt(match[1]) + parseInt(match[2])) / 2;
    }
    return 8; // Default
  }

  /**
   * Generate complete remediation plan
   */
  generateMasterPlan() {
    console.log('Generating master remediation plan...');

    const phases = this.groupByPhase();

    const masterPlan = {
      auditDate: new Date().toISOString().split('T')[0],
      summary: {
        totalConflicts: this.conflicts.length,
        phase1Count: phases.phase1.length,
        phase2Count: phases.phase2.length,
        phase3Count: phases.phase3.length,
        estimatedTotalHours: this.conflicts.reduce((sum, c) => {
          return sum + this.parseTimeEstimate(c.recommendation.estimatedTime);
        }, 0),
        estimatedWeeks: 6
      },
      phases: {
        phase1: {
          title: 'Critical Conflicts (Weeks 1-2)',
          priority: 'CRITICAL',
          conflicts: phases.phase1.map(c => this.generateConflictPlan(c))
        },
        phase2: {
          title: 'High Priority Conflicts (Weeks 3-4)',
          priority: 'HIGH',
          conflicts: phases.phase2.map(c => this.generateConflictPlan(c))
        },
        phase3: {
          title: 'Medium/Low Priority Conflicts (Weeks 5-6)',
          priority: 'MEDIUM',
          conflicts: phases.phase3.map(c => this.generateConflictPlan(c))
        }
      }
    };

    const outputPath = path.join(this.plansDir, 'Master_Remediation_Plan.json');
    fs.writeFileSync(outputPath, JSON.stringify(masterPlan, null, 2), 'utf8');
    console.log(`✓ Master plan saved to: ${outputPath}`);

    return masterPlan;
  }

  /**
   * Generate code templates for specific object
   */
  generateCodeTemplates(objectName) {
    console.log(`Generating code templates for ${objectName}...`);

    const conflict = this.conflicts.find(c => c.object === objectName);
    if (!conflict) {
      console.error(`No conflict found for object: ${objectName}`);
      return null;
    }

    const objectDir = path.join(this.plansDir, objectName);
    if (!fs.existsSync(objectDir)) {
      fs.mkdirSync(objectDir, { recursive: true });
    }

    // Generate handler
    const handlerCode = this.generateTriggerHandlerTemplate(objectName, conflict.involved);
    fs.writeFileSync(
      path.join(objectDir, `${objectName}TriggerHandler.cls`),
      handlerCode,
      'utf8'
    );

    // Generate test class
    const testCode = this.generateTestClassTemplate(objectName, `${objectName}TriggerHandler`);
    fs.writeFileSync(
      path.join(objectDir, `${objectName}TriggerHandler_Test.cls`),
      testCode,
      'utf8'
    );

    // Generate trigger
    const triggerCode = this.generateTriggerTemplate(objectName);
    fs.writeFileSync(
      path.join(objectDir, `${objectName}Trigger.trigger`),
      triggerCode,
      'utf8'
    );

    console.log(`✓ Code templates saved to: ${objectDir}/`);

    return objectDir;
  }

  /**
   * Generate all remediation artifacts
   */
  generateAll() {
    console.log('\n=== Automation Remediation Planner ===\n');
    console.log(`Audit Directory: ${this.auditDir}\n`);

    this.loadData();

    // Generate master plan
    const masterPlan = this.generateMasterPlan();

    // Generate code templates for critical conflicts
    const criticalObjects = this.conflicts
      .filter(c => c.severity === 'CRITICAL')
      .map(c => c.object);

    console.log(`\nGenerating code templates for ${criticalObjects.length} critical objects...`);
    criticalObjects.forEach(obj => {
      this.generateCodeTemplates(obj);
    });

    console.log('\n=== Remediation Planning Complete ===\n');
    console.log(`Master Plan: ${this.plansDir}/Master_Remediation_Plan.json`);
    console.log(`Code Templates: ${this.plansDir}/<ObjectName>/`);
    console.log('');

    return masterPlan;
  }
}

// CLI Execution
if (require.main === module) {
  const auditDir = process.argv[2];
  const objectArg = process.argv.find(arg => arg.startsWith('--object='));
  const objectName = objectArg ? objectArg.split('=')[1] : null;

  if (!auditDir) {
    console.error('Usage: node automation-remediation-planner.js <audit-directory> [--object=ObjectName]');
    console.error('');
    console.error('Examples:');
    console.error('  node automation-remediation-planner.js instances/neonone/automation-audit-1234567890/');
    console.error('  node automation-remediation-planner.js instances/neonone/automation-audit-1234567890/ --object=Account');
    process.exit(1);
  }

  if (!fs.existsSync(auditDir)) {
    console.error(`Error: Audit directory not found: ${auditDir}`);
    process.exit(1);
  }

  const planner = new AutomationRemediationPlanner(auditDir);

  try {
    if (objectName) {
      planner.loadData();
      planner.generateCodeTemplates(objectName);
    } else {
      planner.generateAll();
    }

    console.log('✓ Remediation plans generated successfully');
    process.exit(0);
  } catch (error) {
    console.error('Error generating remediation plans:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

module.exports = AutomationRemediationPlanner;
