/**
 * Integration Tests for Permission Set Assessment Workflow
 *
 * Tests the complete assessment workflow end-to-end:
 * Discovery → Analysis → Planning → Report Generation
 *
 * @author RevPal Engineering
 * @version 1.0.0
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Import modules to test
const PermissionSetReportGenerator = require('../scripts/lib/permission-set-report-generator');

/**
 * Mock test data generator
 */
class TestDataGenerator {
  /**
   * Generate mock discovery data
   */
  static generateDiscoveryData(orgAlias = 'test-org') {
    return {
      orgAlias,
      status: 'COMPLETE',
      timestamp: new Date().toISOString(),
      summary: {
        totalPermissionSets: 87,
        customPermissionSets: 45,
        managedPermissionSets: 42,
        initiativesDetected: 3,
        orphanedSets: 5,
        totalAssignments: 156
      },
      initiatives: [
        {
          initiativeName: 'CPQ',
          initiativeSlug: 'cpq',
          fragmentationScore: 85,
          riskLevel: 'HIGH',
          permissionSets: [
            { name: 'CPQ Phase 1 Users', assignmentCount: 15 },
            { name: 'CPQ Phase 2 Users', assignmentCount: 5 },
            { name: 'CPQ Users Extended', assignmentCount: 3 },
            { name: 'CPQ Admin', assignmentCount: 2 }
          ],
          totalAssignments: 25,
          activeUsers: 23,
          fragmentationIndicators: {
            multiplePhases: true,
            phaseCount: 2,
            inconsistentNaming: true,
            highUserCount: true,
            excessSets: true
          },
          consolidationOpportunity: {
            targetSetCount: 2,
            reductionPercentage: 50,
            complexity: 'Medium'
          }
        },
        {
          initiativeName: 'Subscription Management',
          initiativeSlug: 'subscription-management',
          fragmentationScore: 65,
          riskLevel: 'MEDIUM',
          permissionSets: [
            { name: 'Subscription Users', assignmentCount: 8 },
            { name: 'Subscription Admin', assignmentCount: 4 }
          ],
          totalAssignments: 12,
          activeUsers: 12,
          fragmentationIndicators: {
            multiplePhases: false,
            inconsistentNaming: false,
            highUserCount: false,
            excessSets: false
          },
          consolidationOpportunity: null
        },
        {
          initiativeName: 'Approval Workflow',
          initiativeSlug: 'approval-workflow',
          fragmentationScore: 20,
          riskLevel: 'LOW',
          permissionSets: [
            { name: 'Approval Users', assignmentCount: 3 },
            { name: 'Approval Admin', assignmentCount: 2 }
          ],
          totalAssignments: 5,
          activeUsers: 5,
          fragmentationIndicators: {
            multiplePhases: false,
            inconsistentNaming: false,
            highUserCount: false,
            excessSets: false
          },
          consolidationOpportunity: null
        }
      ],
      orphanedSets: [
        { name: 'Legacy Integration Users', assignmentCount: 2, description: 'Old integration' },
        { name: 'Test Permission Set', assignmentCount: 0, description: 'Testing only' }
      ],
      managedPackageSets: [
        { name: 'SBQQ__Base', namespacePrefix: 'SBQQ' },
        { name: 'SBQQ__Advanced', namespacePrefix: 'SBQQ' }
      ],
      recommendations: [
        {
          priority: 'HIGH',
          recommendation: 'Consolidate CPQ permission sets immediately',
          rationale: 'High fragmentation score (85) with 4 sets'
        },
        {
          priority: 'MEDIUM',
          recommendation: 'Review subscription management permissions',
          rationale: 'Medium fragmentation but well-structured'
        }
      ]
    };
  }

  /**
   * Generate mock analysis data
   */
  static generateAnalysisData(orgAlias = 'test-org', initiative = 'CPQ') {
    return {
      orgAlias,
      initiative,
      status: 'COMPLETE',
      timestamp: new Date().toISOString(),
      permissionSets: [
        {
          name: 'CPQ Phase 1 Users',
          assignmentCount: 15,
          tier: 'users',
          description: 'Phase 1 user permissions'
        },
        {
          name: 'CPQ Phase 2 Users',
          assignmentCount: 5,
          tier: 'users',
          description: 'Phase 2 user permissions'
        },
        {
          name: 'CPQ Users Extended',
          assignmentCount: 3,
          tier: 'users',
          description: 'Extended user permissions'
        },
        {
          name: 'CPQ Admin',
          assignmentCount: 2,
          tier: 'admin',
          description: 'Admin permissions'
        }
      ],
      metrics: {
        fragmentationScore: 85,
        averageOverlap: 72,
        totalUsers: 25,
        activeUsers: 23
      },
      riskLevel: 'MEDIUM',
      overlapAnalysis: {
        pairwiseOverlap: [
          {
            set1: 'CPQ Phase 1 Users',
            set2: 'CPQ Phase 2 Users',
            overlapPercentage: 78,
            commonFieldPermissions: 45,
            commonObjectPermissions: 8
          },
          {
            set1: 'CPQ Phase 1 Users',
            set2: 'CPQ Users Extended',
            overlapPercentage: 65,
            commonFieldPermissions: 38,
            commonObjectPermissions: 7
          },
          {
            set1: 'CPQ Phase 2 Users',
            set2: 'CPQ Users Extended',
            overlapPercentage: 73,
            commonFieldPermissions: 42,
            commonObjectPermissions: 7
          }
        ],
        topOverlappingPermissions: [
          {
            permission: 'Quote__c.Status__c',
            setCount: 3,
            sets: ['CPQ Phase 1 Users', 'CPQ Phase 2 Users', 'CPQ Users Extended']
          },
          {
            permission: 'Quote__c.Total_Price__c',
            setCount: 3,
            sets: ['CPQ Phase 1 Users', 'CPQ Phase 2 Users', 'CPQ Users Extended']
          },
          {
            permission: 'Quote_Line__c (object)',
            setCount: 2,
            sets: ['CPQ Phase 1 Users', 'CPQ Phase 2 Users']
          }
        ]
      },
      consolidationOpportunities: [
        {
          title: 'Consolidate 3 User-Tier Sets',
          confidence: 'HIGH',
          type: 'MERGE',
          description: 'Merge Phase 1, Phase 2, and Extended user sets into single "CPQ - Users" set',
          sourceSets: ['CPQ Phase 1 Users', 'CPQ Phase 2 Users', 'CPQ Users Extended'],
          targetSet: 'CPQ - Users',
          benefits: [
            'Eliminate 72% permission duplication',
            'Simplify user assignment process',
            'Reduce maintenance overhead'
          ],
          considerations: [
            '23 users need reassignment',
            'Test in sandbox first',
            'Maintain grace period'
          ]
        },
        {
          title: 'Rename Admin Set',
          confidence: 'MEDIUM',
          type: 'RENAME',
          description: 'Rename "CPQ Admin" to "CPQ - Admin" for naming consistency',
          sourceSets: ['CPQ Admin'],
          targetSet: 'CPQ - Admin',
          benefits: [
            'Consistent naming convention',
            'Easier to identify canonical sets'
          ],
          considerations: [
            'Low risk operation',
            '2 user assignments remain unchanged'
          ]
        }
      ],
      riskAssessment: {
        level: 'MEDIUM',
        score: 55,
        factors: [
          {
            factor: 'User Count',
            description: '23 user assignments to migrate',
            impact: 'MEDIUM',
            score: 25
          },
          {
            factor: 'Production Users',
            description: '3 production users affected',
            impact: 'MEDIUM',
            score: 15
          },
          {
            factor: 'Complexity',
            description: 'Moderate complexity with 4 permission sets',
            impact: 'MEDIUM',
            score: 15
          }
        ],
        mitigations: [
          {
            risk: 'User access disruption',
            mitigation: 'Test in sandbox first, maintain 30-day grace period'
          },
          {
            risk: 'Permission loss',
            mitigation: 'Accretive merge ensures no permissions removed'
          },
          {
            risk: 'Rollback needed',
            mitigation: 'Backup all permission sets before migration'
          }
        ]
      },
      recommendations: [
        {
          priority: 'HIGH',
          recommendation: 'Consolidate 3 user-tier sets into "CPQ - Users"',
          rationale: 'High overlap (72%) indicates significant duplication',
          estimatedEffort: '15 minutes'
        },
        {
          priority: 'HIGH',
          recommendation: 'Rename "CPQ Admin" to "CPQ - Admin"',
          rationale: 'Standardize naming convention',
          estimatedEffort: '5 minutes'
        },
        {
          priority: 'MEDIUM',
          recommendation: 'Test migration in sandbox before production',
          rationale: '23 users affected, production risk mitigation',
          estimatedEffort: '1 hour'
        }
      ],
      effortEstimation: {
        totalTime: '27 minutes + 30 days',
        activeTime: '27 minutes',
        gracePeriod: '30 days',
        breakdown: {
          Backup: '2 minutes',
          'Create Canonical Sets': '10 minutes',
          'Migrate Assignments': '12 minutes',
          Validation: '3 minutes'
        }
      }
    };
  }

  /**
   * Generate mock migration plan data
   */
  static generateMigrationPlanData(orgAlias = 'test-org', initiative = 'CPQ') {
    return {
      planId: `plan-${Date.now()}-test123`,
      orgAlias,
      initiative,
      initiativeSlug: 'cpq',
      status: 'PENDING_APPROVAL',
      timestamp: new Date().toISOString(),
      currentState: {
        permissionSets: [
          { name: 'CPQ Phase 1 Users', assignmentCount: 15 },
          { name: 'CPQ Phase 2 Users', assignmentCount: 5 },
          { name: 'CPQ Users Extended', assignmentCount: 3 },
          { name: 'CPQ Admin', assignmentCount: 2 }
        ]
      },
      targetState: {
        permissionSets: [
          { name: 'CPQ - Users', sourceCount: 3, description: 'Consolidated user permissions' },
          { name: 'CPQ - Admin', sourceCount: 1, description: 'Admin permissions' }
        ]
      },
      metrics: {
        setsBefore: 4,
        setsAfter: 2,
        reduction: 50,
        usersAffected: 25
      },
      timeline: {
        activeTime: '27 minutes',
        gracePeriod: '30 days',
        totalDuration: '27 minutes + 30 days'
      },
      migrationSteps: [
        {
          step: 1,
          phase: 'BACKUP',
          action: 'Backup existing permission sets',
          description: 'Create backup of all permission sets before making changes',
          command: 'sf project retrieve start --metadata PermissionSet:CPQ*',
          estimatedTime: '2 minutes',
          critical: true,
          dependencies: [],
          validations: ['Backup files created', 'All 4 permission sets retrieved']
        },
        {
          step: 2,
          phase: 'CREATE_CANONICAL',
          action: 'Create "CPQ - Users" permission set',
          description: 'Create canonical Users permission set with merged permissions',
          command: 'node permission-set-cli.js --input cpq-migration-users.json --org test-org',
          estimatedTime: '5 minutes',
          critical: true,
          dependencies: [1],
          validations: ['CPQ - Users created', 'All permissions present']
        },
        {
          step: 3,
          phase: 'CREATE_CANONICAL',
          action: 'Rename "CPQ Admin" to "CPQ - Admin"',
          description: 'Update admin permission set name for consistency',
          command: 'node permission-set-cli.js --input cpq-migration-admin.json --org test-org',
          estimatedTime: '5 minutes',
          critical: true,
          dependencies: [1],
          validations: ['CPQ - Admin exists', 'Permissions unchanged']
        },
        {
          step: 4,
          phase: 'MIGRATE_ASSIGNMENTS',
          action: 'Migrate user assignments',
          description: 'Reassign 23 users from old sets to new canonical sets',
          command: 'node migrate-permission-set-assignments.js --plan cpq-migration.json',
          estimatedTime: '12 minutes',
          critical: true,
          dependencies: [2, 3],
          validations: ['All 23 users reassigned', 'No orphaned assignments'],
          notes: 'Phased approach: 10 users at a time'
        },
        {
          step: 5,
          phase: 'VALIDATION',
          action: 'Run validation checks',
          description: 'Verify all users have correct access',
          command: 'node validate-permission-migration.js --plan cpq-migration.json',
          estimatedTime: '3 minutes',
          critical: true,
          dependencies: [4],
          validations: [
            'Canonical sets exist',
            'All users assigned',
            'No lost object access',
            'Field-level security preserved',
            'No duplicate assignments'
          ]
        },
        {
          step: 6,
          phase: 'GRACE_PERIOD',
          action: 'Monitor during grace period',
          description: 'Allow 30 days for users to report issues',
          estimatedTime: '30 days',
          critical: false,
          dependencies: [5],
          notes: 'Keep old permission sets active but unassigned'
        },
        {
          step: 7,
          phase: 'DEACTIVATE',
          action: 'Deactivate old permission sets',
          description: 'Deactivate old sets after grace period',
          command: 'node deactivate-permission-sets.js --sets "CPQ Phase 1 Users,CPQ Phase 2 Users,CPQ Users Extended"',
          estimatedTime: '4 minutes',
          critical: false,
          dependencies: [6],
          notes: 'Keep for additional 30 days before deletion'
        }
      ],
      rollbackPlan: {
        estimatedTime: '15-20 minutes',
        backupLocation: 'backups/test-org/2025-10-22-143052/',
        steps: [
          {
            action: 'Restore from backup',
            command: 'sf project deploy start --source-dir backups/test-org/2025-10-22-143052/',
            description: 'Deploy backed up permission sets'
          },
          {
            action: 'Reassign users to original sets',
            command: 'node restore-assignments.js --backup backup-assignments.json',
            description: 'Restore original user assignments'
          },
          {
            action: 'Delete canonical sets',
            command: 'sf project delete source --metadata PermissionSet:"CPQ - Users","CPQ - Admin"',
            description: 'Remove new permission sets'
          },
          {
            action: 'Validate rollback',
            command: 'node validate-permission-migration.js --rollback',
            description: 'Verify all users have access'
          },
          {
            action: 'Document issues',
            description: 'Record what went wrong for next attempt'
          }
        ]
      },
      validationChecks: [
        {
          check: 'Canonical permission sets exist',
          command: 'sf data query --query "SELECT Id, Name FROM PermissionSet WHERE Name LIKE \'CPQ -%\'"',
          expectedResult: '2 records (CPQ - Users, CPQ - Admin)'
        },
        {
          check: 'All users assigned to canonical sets',
          command: 'sf data query --query "SELECT COUNT() FROM PermissionSetAssignment WHERE PermissionSet.Name LIKE \'CPQ -%\'"',
          expectedResult: '25 assignments'
        },
        {
          check: 'No assignments to old sets',
          command: 'sf data query --query "SELECT COUNT() FROM PermissionSetAssignment WHERE PermissionSet.Name IN (\'CPQ Phase 1 Users\', \'CPQ Phase 2 Users\', \'CPQ Users Extended\')"',
          expectedResult: '0 assignments'
        },
        {
          check: 'Field-level security preserved',
          expectedResult: 'All field permissions present in canonical sets'
        },
        {
          check: 'Object access maintained',
          expectedResult: 'All object permissions present in canonical sets'
        }
      ],
      riskAssessment: {
        level: 'MEDIUM',
        risks: [
          {
            risk: 'User access disruption during migration',
            severity: 'MEDIUM',
            mitigation: 'Phased migration (10 users at a time) with immediate rollback if issues'
          },
          {
            risk: 'Permission loss',
            severity: 'LOW',
            mitigation: 'Accretive merge ensures no permissions removed'
          },
          {
            risk: 'Production downtime',
            severity: 'LOW',
            mitigation: 'Migration runs in background, no system downtime required'
          }
        ]
      }
    };
  }
}

/**
 * Test Suite
 */
describe('Permission Set Assessment Integration Tests', () => {
  const testDir = path.join(__dirname, '.test-temp');
  const testDataGenerator = TestDataGenerator;
  let reportGenerator;

  beforeAll(() => {
    // Create test directory
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
    reportGenerator = new PermissionSetReportGenerator();
  });

  afterAll(() => {
    // Clean up test directory
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('Discovery Report Generation', () => {
    test('should generate discovery report from JSON', () => {
      const discoveryData = testDataGenerator.generateDiscoveryData('test-org');
      const markdown = reportGenerator.generateDiscoveryReport(discoveryData);

      expect(markdown).toContain('# Permission Set Discovery Report');
      expect(markdown).toContain('test-org');
      expect(markdown).toContain('Total Permission Sets');
      expect(markdown).toContain('CPQ');
      expect(markdown).toContain('Fragmentation Score');
    });

    test('should include all priority levels', () => {
      const discoveryData = testDataGenerator.generateDiscoveryData('test-org');
      const markdown = reportGenerator.generateDiscoveryReport(discoveryData);

      expect(markdown).toContain('🔴 **HIGH Priority**');
      expect(markdown).toContain('🟡 **MEDIUM Priority**');
      expect(markdown).toContain('🟢 **LOW Priority**');
    });

    test('should include orphaned sets', () => {
      const discoveryData = testDataGenerator.generateDiscoveryData('test-org');
      const markdown = reportGenerator.generateDiscoveryReport(discoveryData);

      expect(markdown).toContain('Orphaned Permission Sets');
      expect(markdown).toContain('Legacy Integration Users');
    });

    test('should include next steps', () => {
      const discoveryData = testDataGenerator.generateDiscoveryData('test-org');
      const markdown = reportGenerator.generateDiscoveryReport(discoveryData);

      expect(markdown).toContain('Next Steps');
      expect(markdown).toContain('permission-set-analyzer.js');
    });
  });

  describe('Analysis Report Generation', () => {
    test('should generate analysis report from JSON', () => {
      const analysisData = testDataGenerator.generateAnalysisData('test-org', 'CPQ');
      const markdown = reportGenerator.generateAnalysisReport(analysisData);

      expect(markdown).toContain('# Permission Set Analysis Report: CPQ');
      expect(markdown).toContain('test-org');
      expect(markdown).toContain('Overlap Analysis');
      expect(markdown).toContain('Consolidation Opportunities');
    });

    test('should include overlap matrix', () => {
      const analysisData = testDataGenerator.generateAnalysisData('test-org', 'CPQ');
      const markdown = reportGenerator.generateAnalysisReport(analysisData);

      expect(markdown).toContain('Pairwise Overlap Matrix');
      expect(markdown).toContain('CPQ Phase 1 Users ↔ CPQ Phase 2 Users');
      expect(markdown).toContain('78% overlap');
    });

    test('should include risk assessment', () => {
      const analysisData = testDataGenerator.generateAnalysisData('test-org', 'CPQ');
      const markdown = reportGenerator.generateAnalysisReport(analysisData);

      expect(markdown).toContain('Risk Assessment');
      expect(markdown).toContain('Risk Factors');
      expect(markdown).toContain('Risk Mitigations');
    });

    test('should include recommendations', () => {
      const analysisData = testDataGenerator.generateAnalysisData('test-org', 'CPQ');
      const markdown = reportGenerator.generateAnalysisReport(analysisData);

      expect(markdown).toContain('Recommendations');
      expect(markdown).toContain('HIGH Priority');
      expect(markdown).toContain('MEDIUM Priority');
    });
  });

  describe('Migration Plan Report Generation', () => {
    test('should generate migration plan report from JSON', () => {
      const planData = testDataGenerator.generateMigrationPlanData('test-org', 'CPQ');
      const markdown = reportGenerator.generateMigrationPlanReport(planData);

      expect(markdown).toContain('# Permission Set Migration Plan: CPQ');
      expect(markdown).toContain('test-org');
      expect(markdown).toContain('Migration Steps');
      expect(markdown).toContain('Rollback Plan');
    });

    test('should include all migration steps', () => {
      const planData = testDataGenerator.generateMigrationPlanData('test-org', 'CPQ');
      const markdown = reportGenerator.generateMigrationPlanReport(planData);

      expect(markdown).toContain('Step 1: Backup existing permission sets');
      expect(markdown).toContain('Step 2: Create "CPQ - Users" permission set');
      expect(markdown).toContain('Step 7: Deactivate old permission sets');
      expect(markdown).toContain('🔴 **CRITICAL**');
    });

    test('should include validation checks', () => {
      const planData = testDataGenerator.generateMigrationPlanData('test-org', 'CPQ');
      const markdown = reportGenerator.generateMigrationPlanReport(planData);

      expect(markdown).toContain('Validation Checks');
      expect(markdown).toContain('Canonical permission sets exist');
      expect(markdown).toContain('All users assigned to canonical sets');
    });

    test('should include execution instructions', () => {
      const planData = testDataGenerator.generateMigrationPlanData('test-org', 'CPQ');
      const markdown = reportGenerator.generateMigrationPlanReport(planData);

      expect(markdown).toContain('Execution Instructions');
      expect(markdown).toContain('permission-set-cli.js');
      expect(markdown).toContain('--dry-run');
    });

    test('should include pre-execution checklist', () => {
      const planData = testDataGenerator.generateMigrationPlanData('test-org', 'CPQ');
      const markdown = reportGenerator.generateMigrationPlanReport(planData);

      expect(markdown).toContain('Pre-Execution Checklist');
      expect(markdown).toContain('reviewed and approved');
      expect(markdown).toContain('Tested successfully in sandbox');
    });
  });

  describe('Complete Workflow Tests', () => {
    test('should generate all reports from complete assessment', () => {
      const discoveryData = testDataGenerator.generateDiscoveryData('test-org');
      const analysisData = testDataGenerator.generateAnalysisData('test-org', 'CPQ');
      const planData = testDataGenerator.generateMigrationPlanData('test-org', 'CPQ');

      const outputDir = path.join(testDir, 'complete-workflow');
      const reports = reportGenerator.generateAllReports(
        discoveryData,
        analysisData,
        planData,
        outputDir
      );

      expect(reports.discovery).toBeDefined();
      expect(reports.analysis).toBeDefined();
      expect(reports.plan).toBeDefined();

      expect(fs.existsSync(reports.discovery)).toBe(true);
      expect(fs.existsSync(reports.analysis)).toBe(true);
      expect(fs.existsSync(reports.plan)).toBe(true);
    });

    test('should generate valid markdown files', () => {
      const discoveryData = testDataGenerator.generateDiscoveryData('test-org');
      const outputDir = path.join(testDir, 'markdown-validation');
      const reports = reportGenerator.generateAllReports(discoveryData, null, null, outputDir);

      const content = fs.readFileSync(reports.discovery, 'utf-8');
      expect(content).toMatch(/^#\s+/m); // Has h1 heading
      expect(content).toContain('---'); // Has horizontal rules
      expect(content).toMatch(/\*\*.*\*\*/); // Has bold text
      expect(content).toMatch(/^-\s+/m); // Has list items
    });
  });

  describe('Edge Cases', () => {
    test('should handle empty initiatives', () => {
      const discoveryData = {
        orgAlias: 'empty-org',
        status: 'COMPLETE',
        summary: {
          totalPermissionSets: 0,
          customPermissionSets: 0,
          managedPermissionSets: 0,
          initiativesDetected: 0
        },
        initiatives: [],
        orphanedSets: [],
        managedPackageSets: []
      };

      const markdown = reportGenerator.generateDiscoveryReport(discoveryData);
      expect(markdown).toContain('# Permission Set Discovery Report');
      expect(markdown).toContain('empty-org');
    });

    test('should handle missing optional fields', () => {
      const analysisData = {
        orgAlias: 'minimal-org',
        initiative: 'Test',
        permissionSets: []
      };

      const markdown = reportGenerator.generateAnalysisReport(analysisData);
      expect(markdown).toContain('# Permission Set Analysis Report: Test');
    });
  });

  describe('Report Quality', () => {
    test('discovery report should have proper structure', () => {
      const discoveryData = testDataGenerator.generateDiscoveryData('test-org');
      const markdown = reportGenerator.generateDiscoveryReport(discoveryData);

      // Check for required sections
      expect(markdown).toContain('## Executive Summary');
      expect(markdown).toContain('## Detailed Findings');
      expect(markdown).toContain('## Next Steps');
      expect(markdown).toContain('## Appendix');
    });

    test('analysis report should have proper structure', () => {
      const analysisData = testDataGenerator.generateAnalysisData('test-org', 'CPQ');
      const markdown = reportGenerator.generateAnalysisReport(analysisData);

      // Check for required sections
      expect(markdown).toContain('## Executive Summary');
      expect(markdown).toContain('## Overlap Analysis');
      expect(markdown).toContain('## Consolidation Opportunities');
      expect(markdown).toContain('## Risk Assessment');
      expect(markdown).toContain('## Recommendations');
    });

    test('migration plan should have proper structure', () => {
      const planData = testDataGenerator.generateMigrationPlanData('test-org', 'CPQ');
      const markdown = reportGenerator.generateMigrationPlanReport(planData);

      // Check for required sections
      expect(markdown).toContain('## Executive Summary');
      expect(markdown).toContain('## Migration Steps');
      expect(markdown).toContain('## Rollback Plan');
      expect(markdown).toContain('## Validation Checks');
      expect(markdown).toContain('## Pre-Execution Checklist');
    });
  });
});

/**
 * Run tests
 */
if (require.main === module) {
  console.log('Running Permission Set Assessment Integration Tests...');
  console.log('');

  // Simple test runner (use Jest or Mocha for production)
  const tests = [
    { name: 'Discovery Report Generation', fn: () => {
      const gen = new PermissionSetReportGenerator();
      const data = TestDataGenerator.generateDiscoveryData('test-org');
      const md = gen.generateDiscoveryReport(data);
      console.assert(md.includes('# Permission Set Discovery Report'), 'Discovery report header missing');
      console.assert(md.includes('test-org'), 'Org alias missing');
      console.log('✓ Discovery report generation passed');
    }},
    { name: 'Analysis Report Generation', fn: () => {
      const gen = new PermissionSetReportGenerator();
      const data = TestDataGenerator.generateAnalysisData('test-org', 'CPQ');
      const md = gen.generateAnalysisReport(data);
      console.assert(md.includes('# Permission Set Analysis Report: CPQ'), 'Analysis report header missing');
      console.assert(md.includes('Overlap Analysis'), 'Overlap analysis missing');
      console.log('✓ Analysis report generation passed');
    }},
    { name: 'Migration Plan Generation', fn: () => {
      const gen = new PermissionSetReportGenerator();
      const data = TestDataGenerator.generateMigrationPlanData('test-org', 'CPQ');
      const md = gen.generateMigrationPlanReport(data);
      console.assert(md.includes('# Permission Set Migration Plan: CPQ'), 'Plan report header missing');
      console.assert(md.includes('Migration Steps'), 'Migration steps missing');
      console.log('✓ Migration plan generation passed');
    }},
    { name: 'Complete Workflow', fn: () => {
      const testDir = path.join(__dirname, '.test-temp-manual');
      if (!fs.existsSync(testDir)) {
        fs.mkdirSync(testDir, { recursive: true });
      }

      const gen = new PermissionSetReportGenerator();
      const discovery = TestDataGenerator.generateDiscoveryData('test-org');
      const analysis = TestDataGenerator.generateAnalysisData('test-org', 'CPQ');
      const plan = TestDataGenerator.generateMigrationPlanData('test-org', 'CPQ');

      const reports = gen.generateAllReports(discovery, analysis, plan, testDir);
      console.assert(fs.existsSync(reports.discovery), 'Discovery report file not created');
      console.assert(fs.existsSync(reports.analysis), 'Analysis report file not created');
      console.assert(fs.existsSync(reports.plan), 'Plan report file not created');

      // Cleanup
      fs.rmSync(testDir, { recursive: true, force: true });
      console.log('✓ Complete workflow passed');
    }}
  ];

  let passed = 0;
  let failed = 0;

  tests.forEach(test => {
    try {
      test.fn();
      passed++;
    } catch (error) {
      console.error(`✗ ${test.name} failed:`, error.message);
      failed++;
    }
  });

  console.log('');
  console.log(`Tests completed: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

module.exports = {
  TestDataGenerator,
  PermissionSetReportGenerator
};
