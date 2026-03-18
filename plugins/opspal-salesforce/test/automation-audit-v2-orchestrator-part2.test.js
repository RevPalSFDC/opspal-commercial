/**
 * Test Suite: Automation Audit v2.0 Orchestrator - Part 2
 *
 * Tests additional utility methods, report generation, and helper functions
 * for the automation audit orchestrator.
 *
 * Coverage Target: >80%
 * Priority: Phase 3 (Complex Orchestrator)
 *
 * Part 2 covers:
 * - Executive Summary generation
 * - Quick Reference generation
 * - Master Inventory CSV generation
 * - Helper methods (extractTriggerEvents, determineSeverity, formatDate, etc.)
 * - Report generation patterns
 */

const assert = require('assert');

describe('AutomationAuditV2Orchestrator - Part 2', () => {

  // ============================================================
  // Helper method implementations for testing (standalone)
  // ============================================================

  /**
   * Extract trigger events from trigger record
   */
  function extractTriggerEvents(trigger) {
    const events = [];

    if (trigger.UsageBeforeInsert) events.push('Before Insert');
    if (trigger.UsageAfterInsert) events.push('After Insert');
    if (trigger.UsageBeforeUpdate) events.push('Before Update');
    if (trigger.UsageAfterUpdate) events.push('After Update');
    if (trigger.UsageBeforeDelete) events.push('Before Delete');
    if (trigger.UsageAfterDelete) events.push('After Delete');
    if (trigger.UsageAfterUndelete) events.push('After Undelete');

    return events.length > 0 ? events.join(', ') : 'Unknown';
  }

  /**
   * Determine severity based on conflicts
   */
  function determineSeverity(componentName, conflicts) {
    if (!conflicts || conflicts.length === 0) {
      return 'None';
    }

    // Check for CRITICAL conflicts
    const hasCritical = conflicts.some(c =>
      c.severity === 'CRITICAL' ||
      c.type === 'FIELD_COLLISION' && c.writers?.length > 3
    );
    if (hasCritical) return 'CRITICAL';

    // Check for HIGH conflicts
    const hasHigh = conflicts.some(c =>
      c.severity === 'HIGH' ||
      c.type === 'FIELD_COLLISION' && c.writers?.length > 2
    );
    if (hasHigh) return 'HIGH';

    // Check for MEDIUM conflicts
    const hasMedium = conflicts.some(c =>
      c.severity === 'MEDIUM' ||
      c.type === 'ORDER_DEPENDENT'
    );
    if (hasMedium) return 'MEDIUM';

    return 'LOW';
  }

  /**
   * Format date for CSV
   */
  function formatDate(dateString) {
    if (!dateString) return '';

    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return '';

      return date.toISOString().split('T')[0];
    } catch (e) {
      return '';
    }
  }

  /**
   * Get risk score for component
   */
  function getRiskScore(componentName, riskResults) {
    if (!riskResults?.components) return 0;

    const component = riskResults.components.find(c => c.name === componentName);
    return component?.riskScore || 0;
  }

  /**
   * Get recursion risk level for component
   */
  function getRecursionRisk(componentName, componentType, recursionRisks) {
    if (!recursionRisks?.risks) return 'None';

    const risk = recursionRisks.risks.find(r =>
      r.name === componentName && r.type === componentType
    );

    return risk?.riskLevel || 'None';
  }

  /**
   * Get hardcoded artifacts count for component
   */
  function getHardcodedArtifactsCount(componentName, componentType, hardcodedArtifacts) {
    if (!hardcodedArtifacts?.artifacts) return 0;

    const artifacts = hardcodedArtifacts.artifacts.filter(a =>
      a.componentName === componentName && a.componentType === componentType
    );

    return artifacts.length;
  }

  /**
   * Generate executive summary metrics
   */
  function generateExecutiveMetrics(results) {
    const metrics = {
      totalComponents: 0,
      totalConflicts: 0,
      fieldCollisions: 0,
      managedPackages: 0,
      customCode: 0,
      validationRules: 0,
      cascadeChains: 0,
      migrationCandidates: 0
    };

    // Count components
    metrics.totalComponents =
      (results.v1?.triggers?.length || 0) +
      (results.v1?.apexClasses?.length || 0) +
      (results.v1?.flows?.length || 0);

    // Count conflicts
    metrics.totalConflicts = results.v1?.conflicts?.length || 0;

    // Field collisions
    metrics.fieldCollisions = results.fieldCollisions?.stats?.collisions || 0;

    // Namespace stats
    metrics.managedPackages = results.namespace?.summary?.managedPackages || 0;
    metrics.customCode = results.namespace?.summary?.customCode || 0;

    // Validation rules
    metrics.validationRules = results.validation?.summary?.totalRules || 0;

    // Cascade chains
    metrics.cascadeChains = results.cascades?.cascades?.length || 0;

    // Migration candidates
    metrics.migrationCandidates =
      results.migration?.summary?.recommendations?.MIGRATE_TO_FLOW || 0;

    return metrics;
  }

  /**
   * Generate quick reference metrics
   */
  function generateQuickReferenceMetrics(results) {
    return {
      'Total Components': (results.v1?.triggers?.length || 0) +
                         (results.v1?.flows?.length || 0),
      'Conflicts': results.v1?.conflicts?.length || 0,
      'Managed Packages': results.namespace?.summary?.managedPackages || 0,
      'Validation Rules': results.validation?.summary?.totalRules || 0,
      'Migration Candidates': results.migration?.summary?.recommendations?.MIGRATE_TO_FLOW || 0
    };
  }

  /**
   * Escape CSV value
   */
  function escapeCSVValue(value) {
    if (value === null || value === undefined) return '""';
    const str = String(value);
    return `"${str.replace(/"/g, '""')}"`;
  }

  /**
   * Generate CSV row from values
   */
  function generateCSVRow(values) {
    return values.map(escapeCSVValue).join(',');
  }

  /**
   * Check if component should be filtered from inventory
   */
  function shouldFilterFromInventory(component, nsData, options = {}) {
    const { excludeManaged = true, managedPrefixes = [] } = options;

    // Filter managed packages if option enabled
    if (excludeManaged && nsData.packageType === 'MANAGED') {
      return true;
    }

    // Filter by prefix
    const componentName = component.Name || '';
    if (managedPrefixes.some(prefix => componentName.startsWith(prefix))) {
      return true;
    }

    return false;
  }

  /**
   * Generate risk distribution summary
   */
  function generateRiskDistribution(riskResults) {
    const distribution = {
      HIGH: 0,
      MEDIUM: 0,
      LOW: 0
    };

    if (!riskResults?.components) return distribution;

    riskResults.components.forEach(comp => {
      const level = comp.riskLevel || 'LOW';
      distribution[level] = (distribution[level] || 0) + 1;
    });

    return distribution;
  }

  /**
   * Generate process distribution summary
   */
  function generateProcessDistribution(classificationResults) {
    const distribution = {};

    if (!classificationResults?.classifiedComponents) return distribution;

    classificationResults.classifiedComponents.forEach(comp => {
      const stage = comp.classification?.businessStage || 'Unknown';
      distribution[stage] = (distribution[stage] || 0) + 1;
    });

    return distribution;
  }

  /**
   * Generate department distribution summary
   */
  function generateDepartmentDistribution(classificationResults) {
    const distribution = {};

    if (!classificationResults?.classifiedComponents) return distribution;

    classificationResults.classifiedComponents.forEach(comp => {
      const dept = comp.classification?.department || 'Unknown';
      distribution[dept] = (distribution[dept] || 0) + 1;
    });

    return distribution;
  }

  /**
   * Format schedule for display
   */
  function formatSchedule(scheduleData) {
    if (!scheduleData) return 'N/A';

    if (scheduleData.type === 'SCHEDULED_FLOW') {
      return `Flow: ${scheduleData.schedule || 'Unknown schedule'}`;
    }

    if (scheduleData.type === 'SCHEDULED_APEX') {
      return `Apex: ${scheduleData.cronExpression || 'Unknown cron'}`;
    }

    return 'N/A';
  }

  /**
   * Categorize artifacts by risk
   */
  function categorizeArtifactsByRisk(artifacts) {
    const categories = {
      CRITICAL: [],
      HIGH: [],
      MEDIUM: [],
      LOW: []
    };

    if (!artifacts) return categories;

    artifacts.forEach(artifact => {
      const level = artifact.riskLevel || 'LOW';
      categories[level].push(artifact);
    });

    return categories;
  }

  // ============================================================
  // Tests: extractTriggerEvents()
  // ============================================================

  describe('extractTriggerEvents()', () => {
    it('should extract single trigger event', () => {
      const trigger = { UsageBeforeInsert: true };
      const result = extractTriggerEvents(trigger);
      assert.strictEqual(result, 'Before Insert');
    });

    it('should extract multiple trigger events', () => {
      const trigger = {
        UsageBeforeInsert: true,
        UsageAfterInsert: true,
        UsageBeforeUpdate: true
      };
      const result = extractTriggerEvents(trigger);
      assert.strictEqual(result, 'Before Insert, After Insert, Before Update');
    });

    it('should extract all trigger events', () => {
      const trigger = {
        UsageBeforeInsert: true,
        UsageAfterInsert: true,
        UsageBeforeUpdate: true,
        UsageAfterUpdate: true,
        UsageBeforeDelete: true,
        UsageAfterDelete: true,
        UsageAfterUndelete: true
      };
      const result = extractTriggerEvents(trigger);
      const expected = 'Before Insert, After Insert, Before Update, After Update, Before Delete, After Delete, After Undelete';
      assert.strictEqual(result, expected);
    });

    it('should return Unknown for empty trigger', () => {
      const trigger = {};
      const result = extractTriggerEvents(trigger);
      assert.strictEqual(result, 'Unknown');
    });

    it('should ignore false values', () => {
      const trigger = {
        UsageBeforeInsert: false,
        UsageAfterInsert: true,
        UsageBeforeUpdate: false
      };
      const result = extractTriggerEvents(trigger);
      assert.strictEqual(result, 'After Insert');
    });
  });

  // ============================================================
  // Tests: determineSeverity()
  // ============================================================

  describe('determineSeverity()', () => {
    it('should return None for empty conflicts', () => {
      const result = determineSeverity('TestTrigger', []);
      assert.strictEqual(result, 'None');
    });

    it('should return None for null conflicts', () => {
      const result = determineSeverity('TestTrigger', null);
      assert.strictEqual(result, 'None');
    });

    it('should return CRITICAL for critical severity conflict', () => {
      const conflicts = [{ severity: 'CRITICAL' }];
      const result = determineSeverity('TestTrigger', conflicts);
      assert.strictEqual(result, 'CRITICAL');
    });

    it('should return CRITICAL for field collision with 4+ writers', () => {
      const conflicts = [{
        type: 'FIELD_COLLISION',
        writers: ['A', 'B', 'C', 'D']
      }];
      const result = determineSeverity('TestTrigger', conflicts);
      assert.strictEqual(result, 'CRITICAL');
    });

    it('should return HIGH for high severity conflict', () => {
      const conflicts = [{ severity: 'HIGH' }];
      const result = determineSeverity('TestTrigger', conflicts);
      assert.strictEqual(result, 'HIGH');
    });

    it('should return HIGH for field collision with 3 writers', () => {
      const conflicts = [{
        type: 'FIELD_COLLISION',
        writers: ['A', 'B', 'C']
      }];
      const result = determineSeverity('TestTrigger', conflicts);
      assert.strictEqual(result, 'HIGH');
    });

    it('should return MEDIUM for medium severity conflict', () => {
      const conflicts = [{ severity: 'MEDIUM' }];
      const result = determineSeverity('TestTrigger', conflicts);
      assert.strictEqual(result, 'MEDIUM');
    });

    it('should return MEDIUM for order-dependent conflict', () => {
      const conflicts = [{ type: 'ORDER_DEPENDENT' }];
      const result = determineSeverity('TestTrigger', conflicts);
      assert.strictEqual(result, 'MEDIUM');
    });

    it('should return LOW for other conflicts', () => {
      const conflicts = [{ severity: 'LOW' }];
      const result = determineSeverity('TestTrigger', conflicts);
      assert.strictEqual(result, 'LOW');
    });

    it('should prioritize highest severity', () => {
      const conflicts = [
        { severity: 'LOW' },
        { severity: 'CRITICAL' },
        { severity: 'MEDIUM' }
      ];
      const result = determineSeverity('TestTrigger', conflicts);
      assert.strictEqual(result, 'CRITICAL');
    });
  });

  // ============================================================
  // Tests: formatDate()
  // ============================================================

  describe('formatDate()', () => {
    it('should format valid ISO date', () => {
      const result = formatDate('2025-06-15T10:30:00.000Z');
      assert.strictEqual(result, '2025-06-15');
    });

    it('should format date without time', () => {
      const result = formatDate('2025-06-15');
      assert.strictEqual(result, '2025-06-15');
    });

    it('should return empty string for null', () => {
      const result = formatDate(null);
      assert.strictEqual(result, '');
    });

    it('should return empty string for undefined', () => {
      const result = formatDate(undefined);
      assert.strictEqual(result, '');
    });

    it('should return empty string for invalid date', () => {
      const result = formatDate('not-a-date');
      assert.strictEqual(result, '');
    });

    it('should return empty string for empty string', () => {
      const result = formatDate('');
      assert.strictEqual(result, '');
    });
  });

  // ============================================================
  // Tests: getRiskScore()
  // ============================================================

  describe('getRiskScore()', () => {
    it('should return risk score for component', () => {
      const riskResults = {
        components: [
          { name: 'AccountTrigger', riskScore: 75 },
          { name: 'ContactTrigger', riskScore: 50 }
        ]
      };
      const result = getRiskScore('AccountTrigger', riskResults);
      assert.strictEqual(result, 75);
    });

    it('should return 0 for unknown component', () => {
      const riskResults = {
        components: [
          { name: 'AccountTrigger', riskScore: 75 }
        ]
      };
      const result = getRiskScore('UnknownTrigger', riskResults);
      assert.strictEqual(result, 0);
    });

    it('should return 0 for null results', () => {
      const result = getRiskScore('AccountTrigger', null);
      assert.strictEqual(result, 0);
    });

    it('should return 0 for empty components', () => {
      const riskResults = { components: [] };
      const result = getRiskScore('AccountTrigger', riskResults);
      assert.strictEqual(result, 0);
    });
  });

  // ============================================================
  // Tests: getRecursionRisk()
  // ============================================================

  describe('getRecursionRisk()', () => {
    it('should return risk level for component', () => {
      const recursionRisks = {
        risks: [
          { name: 'AccountTrigger', type: 'ApexTrigger', riskLevel: 'HIGH' },
          { name: 'ContactFlow', type: 'Flow', riskLevel: 'MEDIUM' }
        ]
      };
      const result = getRecursionRisk('AccountTrigger', 'ApexTrigger', recursionRisks);
      assert.strictEqual(result, 'HIGH');
    });

    it('should return None for unknown component', () => {
      const recursionRisks = {
        risks: [
          { name: 'AccountTrigger', type: 'ApexTrigger', riskLevel: 'HIGH' }
        ]
      };
      const result = getRecursionRisk('UnknownTrigger', 'ApexTrigger', recursionRisks);
      assert.strictEqual(result, 'None');
    });

    it('should match both name and type', () => {
      const recursionRisks = {
        risks: [
          { name: 'Account', type: 'ApexTrigger', riskLevel: 'HIGH' },
          { name: 'Account', type: 'Flow', riskLevel: 'LOW' }
        ]
      };
      const result = getRecursionRisk('Account', 'Flow', recursionRisks);
      assert.strictEqual(result, 'LOW');
    });

    it('should return None for null results', () => {
      const result = getRecursionRisk('AccountTrigger', 'ApexTrigger', null);
      assert.strictEqual(result, 'None');
    });
  });

  // ============================================================
  // Tests: getHardcodedArtifactsCount()
  // ============================================================

  describe('getHardcodedArtifactsCount()', () => {
    it('should count artifacts for component', () => {
      const hardcodedArtifacts = {
        artifacts: [
          { componentName: 'AccountTrigger', componentType: 'ApexTrigger', id: '001xxx' },
          { componentName: 'AccountTrigger', componentType: 'ApexTrigger', id: '002xxx' },
          { componentName: 'ContactTrigger', componentType: 'ApexTrigger', id: '003xxx' }
        ]
      };
      const result = getHardcodedArtifactsCount('AccountTrigger', 'ApexTrigger', hardcodedArtifacts);
      assert.strictEqual(result, 2);
    });

    it('should return 0 for unknown component', () => {
      const hardcodedArtifacts = {
        artifacts: [
          { componentName: 'AccountTrigger', componentType: 'ApexTrigger', id: '001xxx' }
        ]
      };
      const result = getHardcodedArtifactsCount('UnknownTrigger', 'ApexTrigger', hardcodedArtifacts);
      assert.strictEqual(result, 0);
    });

    it('should return 0 for null results', () => {
      const result = getHardcodedArtifactsCount('AccountTrigger', 'ApexTrigger', null);
      assert.strictEqual(result, 0);
    });

    it('should match both name and type', () => {
      const hardcodedArtifacts = {
        artifacts: [
          { componentName: 'Account', componentType: 'ApexTrigger', id: '001xxx' },
          { componentName: 'Account', componentType: 'Flow', id: '002xxx' },
          { componentName: 'Account', componentType: 'Flow', id: '003xxx' }
        ]
      };
      const result = getHardcodedArtifactsCount('Account', 'Flow', hardcodedArtifacts);
      assert.strictEqual(result, 2);
    });
  });

  // ============================================================
  // Tests: generateExecutiveMetrics()
  // ============================================================

  describe('generateExecutiveMetrics()', () => {
    it('should calculate total components', () => {
      const results = {
        v1: {
          triggers: [{ Name: 'T1' }, { Name: 'T2' }],
          apexClasses: [{ Name: 'C1' }],
          flows: [{ DeveloperName: 'F1' }, { DeveloperName: 'F2' }, { DeveloperName: 'F3' }]
        }
      };
      const metrics = generateExecutiveMetrics(results);
      assert.strictEqual(metrics.totalComponents, 6);
    });

    it('should count conflicts', () => {
      const results = {
        v1: {
          conflicts: [{ id: 1 }, { id: 2 }, { id: 3 }]
        }
      };
      const metrics = generateExecutiveMetrics(results);
      assert.strictEqual(metrics.totalConflicts, 3);
    });

    it('should count field collisions', () => {
      const results = {
        fieldCollisions: {
          stats: { collisions: 15 }
        }
      };
      const metrics = generateExecutiveMetrics(results);
      assert.strictEqual(metrics.fieldCollisions, 15);
    });

    it('should count namespace stats', () => {
      const results = {
        namespace: {
          summary: {
            managedPackages: 10,
            customCode: 25
          }
        }
      };
      const metrics = generateExecutiveMetrics(results);
      assert.strictEqual(metrics.managedPackages, 10);
      assert.strictEqual(metrics.customCode, 25);
    });

    it('should handle empty results', () => {
      const results = {};
      const metrics = generateExecutiveMetrics(results);
      assert.strictEqual(metrics.totalComponents, 0);
      assert.strictEqual(metrics.totalConflicts, 0);
      assert.strictEqual(metrics.fieldCollisions, 0);
    });

    it('should count migration candidates', () => {
      const results = {
        migration: {
          summary: {
            recommendations: {
              MIGRATE_TO_FLOW: 5,
              KEEP_AS_APEX: 3
            }
          }
        }
      };
      const metrics = generateExecutiveMetrics(results);
      assert.strictEqual(metrics.migrationCandidates, 5);
    });
  });

  // ============================================================
  // Tests: escapeCSVValue()
  // ============================================================

  describe('escapeCSVValue()', () => {
    it('should wrap value in quotes', () => {
      const result = escapeCSVValue('test');
      assert.strictEqual(result, '"test"');
    });

    it('should escape quotes', () => {
      const result = escapeCSVValue('test "value"');
      assert.strictEqual(result, '"test ""value"""');
    });

    it('should handle empty string', () => {
      const result = escapeCSVValue('');
      assert.strictEqual(result, '""');
    });

    it('should handle null', () => {
      const result = escapeCSVValue(null);
      assert.strictEqual(result, '""');
    });

    it('should handle undefined', () => {
      const result = escapeCSVValue(undefined);
      assert.strictEqual(result, '""');
    });

    it('should handle numbers', () => {
      const result = escapeCSVValue(123);
      assert.strictEqual(result, '"123"');
    });

    it('should handle special characters', () => {
      const result = escapeCSVValue('test,with,commas');
      assert.strictEqual(result, '"test,with,commas"');
    });

    it('should handle newlines', () => {
      const result = escapeCSVValue('line1\nline2');
      assert.strictEqual(result, '"line1\nline2"');
    });
  });

  // ============================================================
  // Tests: generateCSVRow()
  // ============================================================

  describe('generateCSVRow()', () => {
    it('should generate row from values', () => {
      const values = ['Name', 'Type', 'Status'];
      const result = generateCSVRow(values);
      assert.strictEqual(result, '"Name","Type","Status"');
    });

    it('should handle mixed types', () => {
      const values = ['Test', 123, true, null];
      const result = generateCSVRow(values);
      assert.strictEqual(result, '"Test","123","true",""');
    });

    it('should escape quotes in values', () => {
      const values = ['Normal', 'With "quotes"'];
      const result = generateCSVRow(values);
      assert.strictEqual(result, '"Normal","With ""quotes"""');
    });

    it('should handle empty array', () => {
      const result = generateCSVRow([]);
      assert.strictEqual(result, '');
    });
  });

  // ============================================================
  // Tests: shouldFilterFromInventory()
  // ============================================================

  describe('shouldFilterFromInventory()', () => {
    it('should filter managed package components', () => {
      const component = { Name: 'ManagedClass' };
      const nsData = { packageType: 'MANAGED' };
      const result = shouldFilterFromInventory(component, nsData, { excludeManaged: true });
      assert.strictEqual(result, true);
    });

    it('should not filter custom components', () => {
      const component = { Name: 'CustomClass' };
      const nsData = { packageType: 'CUSTOM' };
      const result = shouldFilterFromInventory(component, nsData, { excludeManaged: true });
      assert.strictEqual(result, false);
    });

    it('should filter by prefix', () => {
      const component = { Name: 'PS_IntegrationClass' };
      const nsData = { packageType: 'CUSTOM' };
      const result = shouldFilterFromInventory(component, nsData, {
        excludeManaged: true,
        managedPrefixes: ['PS_', 'MC_']
      });
      assert.strictEqual(result, true);
    });

    it('should not filter when prefix does not match', () => {
      const component = { Name: 'CustomClass' };
      const nsData = { packageType: 'CUSTOM' };
      const result = shouldFilterFromInventory(component, nsData, {
        excludeManaged: true,
        managedPrefixes: ['PS_', 'MC_']
      });
      assert.strictEqual(result, false);
    });

    it('should not filter managed when excludeManaged is false', () => {
      const component = { Name: 'ManagedClass' };
      const nsData = { packageType: 'MANAGED' };
      const result = shouldFilterFromInventory(component, nsData, { excludeManaged: false });
      assert.strictEqual(result, false);
    });
  });

  // ============================================================
  // Tests: generateRiskDistribution()
  // ============================================================

  describe('generateRiskDistribution()', () => {
    it('should count risk levels', () => {
      const riskResults = {
        components: [
          { name: 'C1', riskLevel: 'HIGH' },
          { name: 'C2', riskLevel: 'HIGH' },
          { name: 'C3', riskLevel: 'MEDIUM' },
          { name: 'C4', riskLevel: 'LOW' },
          { name: 'C5', riskLevel: 'LOW' },
          { name: 'C6', riskLevel: 'LOW' }
        ]
      };
      const result = generateRiskDistribution(riskResults);
      assert.strictEqual(result.HIGH, 2);
      assert.strictEqual(result.MEDIUM, 1);
      assert.strictEqual(result.LOW, 3);
    });

    it('should default to LOW for missing level', () => {
      const riskResults = {
        components: [
          { name: 'C1' }, // no riskLevel
          { name: 'C2', riskLevel: 'HIGH' }
        ]
      };
      const result = generateRiskDistribution(riskResults);
      assert.strictEqual(result.LOW, 1);
      assert.strictEqual(result.HIGH, 1);
    });

    it('should handle empty components', () => {
      const riskResults = { components: [] };
      const result = generateRiskDistribution(riskResults);
      assert.strictEqual(result.HIGH, 0);
      assert.strictEqual(result.MEDIUM, 0);
      assert.strictEqual(result.LOW, 0);
    });

    it('should handle null results', () => {
      const result = generateRiskDistribution(null);
      assert.strictEqual(result.HIGH, 0);
      assert.strictEqual(result.MEDIUM, 0);
      assert.strictEqual(result.LOW, 0);
    });
  });

  // ============================================================
  // Tests: generateProcessDistribution()
  // ============================================================

  describe('generateProcessDistribution()', () => {
    it('should count by business stage', () => {
      const classificationResults = {
        classifiedComponents: [
          { name: 'C1', classification: { businessStage: 'Lead' } },
          { name: 'C2', classification: { businessStage: 'Lead' } },
          { name: 'C3', classification: { businessStage: 'Opportunity' } },
          { name: 'C4', classification: { businessStage: 'Account' } }
        ]
      };
      const result = generateProcessDistribution(classificationResults);
      assert.strictEqual(result['Lead'], 2);
      assert.strictEqual(result['Opportunity'], 1);
      assert.strictEqual(result['Account'], 1);
    });

    it('should handle Unknown stage', () => {
      const classificationResults = {
        classifiedComponents: [
          { name: 'C1', classification: {} }, // no businessStage
          { name: 'C2', classification: { businessStage: 'Lead' } }
        ]
      };
      const result = generateProcessDistribution(classificationResults);
      assert.strictEqual(result['Unknown'], 1);
      assert.strictEqual(result['Lead'], 1);
    });

    it('should handle empty components', () => {
      const result = generateProcessDistribution({ classifiedComponents: [] });
      assert.deepStrictEqual(result, {});
    });
  });

  // ============================================================
  // Tests: generateDepartmentDistribution()
  // ============================================================

  describe('generateDepartmentDistribution()', () => {
    it('should count by department', () => {
      const classificationResults = {
        classifiedComponents: [
          { name: 'C1', classification: { department: 'Sales' } },
          { name: 'C2', classification: { department: 'Sales' } },
          { name: 'C3', classification: { department: 'Marketing' } },
          { name: 'C4', classification: { department: 'Operations' } }
        ]
      };
      const result = generateDepartmentDistribution(classificationResults);
      assert.strictEqual(result['Sales'], 2);
      assert.strictEqual(result['Marketing'], 1);
      assert.strictEqual(result['Operations'], 1);
    });

    it('should handle Unknown department', () => {
      const classificationResults = {
        classifiedComponents: [
          { name: 'C1', classification: {} }, // no department
          { name: 'C2' } // no classification
        ]
      };
      const result = generateDepartmentDistribution(classificationResults);
      assert.strictEqual(result['Unknown'], 2);
    });
  });

  // ============================================================
  // Tests: formatSchedule()
  // ============================================================

  describe('formatSchedule()', () => {
    it('should format scheduled flow', () => {
      const scheduleData = {
        type: 'SCHEDULED_FLOW',
        schedule: 'Daily at 6:00 AM'
      };
      const result = formatSchedule(scheduleData);
      assert.strictEqual(result, 'Flow: Daily at 6:00 AM');
    });

    it('should format scheduled apex', () => {
      const scheduleData = {
        type: 'SCHEDULED_APEX',
        cronExpression: '0 0 6 * * ?'
      };
      const result = formatSchedule(scheduleData);
      assert.strictEqual(result, 'Apex: 0 0 6 * * ?');
    });

    it('should return N/A for null', () => {
      const result = formatSchedule(null);
      assert.strictEqual(result, 'N/A');
    });

    it('should return N/A for unknown type', () => {
      const scheduleData = { type: 'UNKNOWN' };
      const result = formatSchedule(scheduleData);
      assert.strictEqual(result, 'N/A');
    });

    it('should handle missing schedule details', () => {
      const scheduleData = { type: 'SCHEDULED_FLOW' };
      const result = formatSchedule(scheduleData);
      assert.strictEqual(result, 'Flow: Unknown schedule');
    });
  });

  // ============================================================
  // Tests: categorizeArtifactsByRisk()
  // ============================================================

  describe('categorizeArtifactsByRisk()', () => {
    it('should categorize artifacts by risk level', () => {
      const artifacts = [
        { id: '1', riskLevel: 'CRITICAL' },
        { id: '2', riskLevel: 'HIGH' },
        { id: '3', riskLevel: 'HIGH' },
        { id: '4', riskLevel: 'MEDIUM' },
        { id: '5', riskLevel: 'LOW' }
      ];
      const result = categorizeArtifactsByRisk(artifacts);
      assert.strictEqual(result.CRITICAL.length, 1);
      assert.strictEqual(result.HIGH.length, 2);
      assert.strictEqual(result.MEDIUM.length, 1);
      assert.strictEqual(result.LOW.length, 1);
    });

    it('should default to LOW for missing risk level', () => {
      const artifacts = [
        { id: '1' }, // no riskLevel
        { id: '2', riskLevel: 'HIGH' }
      ];
      const result = categorizeArtifactsByRisk(artifacts);
      assert.strictEqual(result.LOW.length, 1);
      assert.strictEqual(result.HIGH.length, 1);
    });

    it('should handle null artifacts', () => {
      const result = categorizeArtifactsByRisk(null);
      assert.deepStrictEqual(result.CRITICAL, []);
      assert.deepStrictEqual(result.HIGH, []);
      assert.deepStrictEqual(result.MEDIUM, []);
      assert.deepStrictEqual(result.LOW, []);
    });

    it('should handle empty array', () => {
      const result = categorizeArtifactsByRisk([]);
      assert.deepStrictEqual(result.CRITICAL, []);
      assert.deepStrictEqual(result.HIGH, []);
      assert.deepStrictEqual(result.MEDIUM, []);
      assert.deepStrictEqual(result.LOW, []);
    });
  });

  // ============================================================
  // Tests: Quick Reference Metrics
  // ============================================================

  describe('generateQuickReferenceMetrics()', () => {
    it('should calculate all metrics', () => {
      const results = {
        v1: {
          triggers: [{ Name: 'T1' }, { Name: 'T2' }],
          flows: [{ DeveloperName: 'F1' }],
          conflicts: [{ id: 1 }]
        },
        namespace: {
          summary: { managedPackages: 5 }
        },
        validation: {
          summary: { totalRules: 10 }
        },
        migration: {
          summary: {
            recommendations: { MIGRATE_TO_FLOW: 3 }
          }
        }
      };
      const metrics = generateQuickReferenceMetrics(results);
      assert.strictEqual(metrics['Total Components'], 3);
      assert.strictEqual(metrics['Conflicts'], 1);
      assert.strictEqual(metrics['Managed Packages'], 5);
      assert.strictEqual(metrics['Validation Rules'], 10);
      assert.strictEqual(metrics['Migration Candidates'], 3);
    });

    it('should handle missing data', () => {
      const results = {};
      const metrics = generateQuickReferenceMetrics(results);
      assert.strictEqual(metrics['Total Components'], 0);
      assert.strictEqual(metrics['Conflicts'], 0);
      assert.strictEqual(metrics['Managed Packages'], 0);
      assert.strictEqual(metrics['Validation Rules'], 0);
      assert.strictEqual(metrics['Migration Candidates'], 0);
    });
  });

  // ============================================================
  // Tests: Report Structure Validation
  // ============================================================

  describe('Report Structure Validation', () => {

    describe('Recursion Risk Report Structure', () => {
      function generateRecursionRiskReport(recursionRisks, orgAlias) {
        if (!recursionRisks || recursionRisks.summary.total === 0) {
          return null;
        }

        let report = `# Recursion Risk Report\n\n`;
        report += `**Organization**: ${orgAlias}\n`;
        report += `**Audit Date**: ${new Date().toISOString().split('T')[0]}\n\n`;
        report += `## Summary\n\n`;
        report += `- **Total Risks**: ${recursionRisks.summary.total}\n`;
        report += `- **HIGH Risk**: ${recursionRisks.summary.high}\n`;
        report += `- **MEDIUM Risk**: ${recursionRisks.summary.medium}\n`;
        report += `- **LOW Risk**: ${recursionRisks.summary.low}\n\n`;

        return report;
      }

      it('should generate recursion risk report', () => {
        const recursionRisks = {
          summary: { total: 5, high: 2, medium: 2, low: 1 },
          risks: []
        };
        const report = generateRecursionRiskReport(recursionRisks, 'test-org');
        assert.ok(report.includes('# Recursion Risk Report'));
        assert.ok(report.includes('test-org'));
        assert.ok(report.includes('Total Risks**: 5'));
        assert.ok(report.includes('HIGH Risk**: 2'));
      });

      it('should return null for no risks', () => {
        const recursionRisks = {
          summary: { total: 0, high: 0, medium: 0, low: 0 }
        };
        const report = generateRecursionRiskReport(recursionRisks, 'test-org');
        assert.strictEqual(report, null);
      });
    });

    describe('Hardcoded Artifacts Report Structure', () => {
      function generateArtifactsReportHeader(summary, orgAlias) {
        let report = `# Hardcoded Artifacts Report\n\n`;
        report += `**Organization**: ${orgAlias}\n`;
        report += `**Audit Date**: ${new Date().toISOString().split('T')[0]}\n\n`;
        report += `## Summary\n\n`;
        report += `- **Files Scanned**: ${summary.totalScanned}\n`;
        report += `- **Files with Artifacts**: ${summary.withArtifacts}\n`;
        report += `- **Total Hardcoded IDs**: ${summary.totalIds}\n`;
        report += `- **Total Hardcoded URLs**: ${summary.totalUrls}\n\n`;

        return report;
      }

      it('should generate artifacts report header', () => {
        const summary = {
          totalScanned: 100,
          withArtifacts: 15,
          totalIds: 25,
          totalUrls: 5
        };
        const report = generateArtifactsReportHeader(summary, 'test-org');
        assert.ok(report.includes('# Hardcoded Artifacts Report'));
        assert.ok(report.includes('Files Scanned**: 100'));
        assert.ok(report.includes('Files with Artifacts**: 15'));
        assert.ok(report.includes('Total Hardcoded IDs**: 25'));
      });
    });

    describe('Execution Order Report Structure', () => {
      function generateExecutionOrderHeader(collisionCount, withAnalysisCount, orgAlias) {
        let report = `# Execution Order Analysis - Final Writer Determinations\n\n`;
        report += `**Organization**: ${orgAlias}\n`;
        report += `**Audit Date**: ${new Date().toISOString().split('T')[0]}\n\n`;
        report += `## Summary\n\n`;
        report += `- **Total Field Collisions**: ${collisionCount}\n`;
        report += `- **With Final Writer Analysis**: ${withAnalysisCount}\n\n`;

        return report;
      }

      it('should generate execution order report header', () => {
        const report = generateExecutionOrderHeader(20, 15, 'test-org');
        assert.ok(report.includes('# Execution Order Analysis'));
        assert.ok(report.includes('Total Field Collisions**: 20'));
        assert.ok(report.includes('With Final Writer Analysis**: 15'));
      });
    });
  });

  // ============================================================
  // Tests: CSV Header Generation
  // ============================================================

  describe('CSV Header Generation', () => {
    const MASTER_INVENTORY_HEADER = 'Name,Type,Status,Object(s),Trigger Events,Entry Conditions,Purpose/Description,Entry Points,Async Patterns,Security,Data Ops,Governor Risks,Code Coverage %,Schedule,Recursion Risk,Hardcoded Artifacts,Risk Score,Conflicts Detected,Severity,Last Modified,API Version,Namespace,Package Type,Automation ID';

    it('should have correct column count', () => {
      const columns = MASTER_INVENTORY_HEADER.split(',');
      assert.strictEqual(columns.length, 24);
    });

    it('should have Name as first column', () => {
      const columns = MASTER_INVENTORY_HEADER.split(',');
      assert.strictEqual(columns[0], 'Name');
    });

    it('should have Automation ID as last column', () => {
      const columns = MASTER_INVENTORY_HEADER.split(',');
      assert.strictEqual(columns[columns.length - 1], 'Automation ID');
    });

    it('should include v3.29.0 columns', () => {
      assert.ok(MASTER_INVENTORY_HEADER.includes('Schedule'));
      assert.ok(MASTER_INVENTORY_HEADER.includes('Recursion Risk'));
      assert.ok(MASTER_INVENTORY_HEADER.includes('Hardcoded Artifacts'));
    });

    it('should include v3.28.2 columns', () => {
      assert.ok(MASTER_INVENTORY_HEADER.includes('Entry Points'));
      assert.ok(MASTER_INVENTORY_HEADER.includes('Async Patterns'));
      assert.ok(MASTER_INVENTORY_HEADER.includes('Security'));
      assert.ok(MASTER_INVENTORY_HEADER.includes('Data Ops'));
      assert.ok(MASTER_INVENTORY_HEADER.includes('Governor Risks'));
      assert.ok(MASTER_INVENTORY_HEADER.includes('Code Coverage %'));
    });
  });

  // ============================================================
  // Tests: Audit Scope Section Generation
  // ============================================================

  describe('Audit Scope Section Generation', () => {
    function generateAuditScopeSection(auditScope, results) {
      let section = '';
      section += '## Audit Scope & Coverage\n\n';

      // Components Successfully Analyzed
      section += '### Components Successfully Analyzed:\n\n';
      section += `- **Apex Triggers**: ${auditScope.analyzed['Apex Triggers'] || 0} analyzed\n`;
      section += `- **Apex Classes**: ${auditScope.analyzed['Apex Classes'] || 0} analyzed\n`;
      section += `- **Flows**: ${auditScope.analyzed['Flows'] || 0} analyzed\n`;

      // v2.0 Enhanced Analysis
      if (results.namespace || results.validation) {
        section += '\n### v2.0 Enhanced Analysis Performed:\n\n';

        if (results.namespace) {
          const managed = results.namespace.summary?.managedPackages || 0;
          const custom = results.namespace.summary?.customComponents || 0;
          section += `- Managed Package Detection (${managed} managed, ${custom} custom)\n`;
        }

        if (results.validation) {
          const total = results.validation.summary?.totalRules || 0;
          section += `- Validation Rules Audit (${total} rules analyzed)\n`;
        }
      }

      // Errors
      if (auditScope.errors.length > 0) {
        section += '\n### Errors Encountered:\n\n';
        auditScope.errors.forEach(err => {
          section += `- **${err.component}**: ${err.error}\n`;
        });
      }

      return section;
    }

    it('should generate analyzed components section', () => {
      const auditScope = {
        analyzed: {
          'Apex Triggers': 10,
          'Apex Classes': 50,
          'Flows': 25
        },
        errors: []
      };
      const results = {};

      const section = generateAuditScopeSection(auditScope, results);
      assert.ok(section.includes('Apex Triggers**: 10'));
      assert.ok(section.includes('Apex Classes**: 50'));
      assert.ok(section.includes('Flows**: 25'));
    });

    it('should include v2.0 enhancements when present', () => {
      const auditScope = {
        analyzed: {},
        errors: []
      };
      const results = {
        namespace: {
          summary: { managedPackages: 5, customComponents: 20 }
        },
        validation: {
          summary: { totalRules: 15 }
        }
      };

      const section = generateAuditScopeSection(auditScope, results);
      assert.ok(section.includes('v2.0 Enhanced Analysis'));
      assert.ok(section.includes('Managed Package Detection'));
      assert.ok(section.includes('5 managed, 20 custom'));
      assert.ok(section.includes('15 rules analyzed'));
    });

    it('should include errors when present', () => {
      const auditScope = {
        analyzed: {},
        errors: [
          { component: 'Flows', error: 'FlowDefinitionView not supported' }
        ]
      };
      const results = {};

      const section = generateAuditScopeSection(auditScope, results);
      assert.ok(section.includes('Errors Encountered'));
      assert.ok(section.includes('**Flows**'));
      assert.ok(section.includes('FlowDefinitionView not supported'));
    });
  });

  // ============================================================
  // Tests: Top 10 Hotspots with Scheduled Collisions
  // ============================================================

  describe('Top 10 Hotspots - Scheduled Collision Detection', () => {
    function detectScheduledCollisions(fieldCollisions, scheduledAutomation) {
      const scheduledCollisions = [];

      if (!fieldCollisions?.collisions || !scheduledAutomation?.scheduled) {
        return scheduledCollisions;
      }

      const scheduledWriters = new Set();
      scheduledAutomation.scheduled.forEach(sched => {
        scheduledWriters.add(sched.name);
      });

      fieldCollisions.collisions.forEach(collision => {
        const hasScheduledWriter = collision.writers &&
          collision.writers.some(w => scheduledWriters.has(w.automationName || w.sourceName));

        if (hasScheduledWriter && collision.writers.length > 1) {
          scheduledCollisions.push({
            object: collision.object,
            field: collision.field,
            scheduledWriter: collision.writers.find(w =>
              scheduledWriters.has(w.automationName || w.sourceName)
            ),
            totalWriters: collision.writers.length
          });
        }
      });

      return scheduledCollisions;
    }

    it('should detect scheduled collision', () => {
      const fieldCollisions = {
        collisions: [{
          object: 'Account',
          field: 'Status__c',
          writers: [
            { automationName: 'DailyCleanup' },
            { automationName: 'AccountTrigger' }
          ]
        }]
      };
      const scheduledAutomation = {
        scheduled: [{ name: 'DailyCleanup', schedule: 'Daily' }]
      };

      const result = detectScheduledCollisions(fieldCollisions, scheduledAutomation);
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].object, 'Account');
      assert.strictEqual(result[0].field, 'Status__c');
    });

    it('should not detect collision without scheduled writer', () => {
      const fieldCollisions = {
        collisions: [{
          object: 'Account',
          field: 'Status__c',
          writers: [
            { automationName: 'AccountTrigger' },
            { automationName: 'AccountFlow' }
          ]
        }]
      };
      const scheduledAutomation = {
        scheduled: [{ name: 'DailyCleanup', schedule: 'Daily' }]
      };

      const result = detectScheduledCollisions(fieldCollisions, scheduledAutomation);
      assert.strictEqual(result.length, 0);
    });

    it('should require multiple writers', () => {
      const fieldCollisions = {
        collisions: [{
          object: 'Account',
          field: 'Status__c',
          writers: [
            { automationName: 'DailyCleanup' }
          ]
        }]
      };
      const scheduledAutomation = {
        scheduled: [{ name: 'DailyCleanup', schedule: 'Daily' }]
      };

      const result = detectScheduledCollisions(fieldCollisions, scheduledAutomation);
      assert.strictEqual(result.length, 0);
    });

    it('should handle null inputs', () => {
      const result = detectScheduledCollisions(null, null);
      assert.deepStrictEqual(result, []);
    });
  });
});
