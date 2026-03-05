/**
 * Test Suite: Metadata Dependency Analyzer
 *
 * Tests the comprehensive field dependency analysis system that prevents
 * deployment failures by detecting ALL field references.
 *
 * Coverage Target: >90%
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const MetadataDependencyAnalyzer = require('../scripts/lib/metadata-dependency-analyzer');

// Mock execSync for testing
const { execSync } = require('child_process');
const originalExecSync = execSync;

describe('MetadataDependencyAnalyzer', () => {
  let analyzer;
  const mockOrgAlias = 'test-org';

  beforeEach(() => {
    analyzer = new MetadataDependencyAnalyzer(mockOrgAlias, { verbose: false });
  });

  afterEach(() => {
    // Restore original execSync
    require('child_process').execSync = originalExecSync;
  });

  describe('Constructor', () => {
    it('should initialize with org alias', () => {
      assert.strictEqual(analyzer.orgAlias, mockOrgAlias);
    });

    it('should set verbose mode from options', () => {
      const verboseAnalyzer = new MetadataDependencyAnalyzer(mockOrgAlias, { verbose: true });
      assert.strictEqual(verboseAnalyzer.verbose, true);
    });

    it('should create cache directory if it does not exist', () => {
      const cacheDir = analyzer.cacheDir;
      assert.ok(fs.existsSync(cacheDir));
    });
  });

  describe('Flow Reference Detection', () => {
    it('should detect field references in flow XML with {!$Record.FieldName} syntax', () => {
      const flowXML = `
        <Flow>
          <assignments>
            <field>{!$Record.CustomField__c}</field>
          </assignments>
        </Flow>
      `;

      const result = analyzer.flowReferencesField(flowXML, 'Account', 'CustomField__c');
      assert.strictEqual(result, true);
    });

    it('should detect field references with <field> tags', () => {
      const flowXML = `
        <Flow>
          <assignments>
            <field>CustomField__c</field>
          </assignments>
        </Flow>
      `;

      const result = analyzer.flowReferencesField(flowXML, 'Account', 'CustomField__c');
      assert.strictEqual(result, true);
    });

    it('should detect {!$Record__Prior.FieldName} references', () => {
      const flowXML = `
        <Flow>
          <decisions>
            <conditions>
              <leftValueReference>{!$Record__Prior.Status__c}</leftValueReference>
            </conditions>
          </decisions>
        </Flow>
      `;

      const result = analyzer.flowReferencesField(flowXML, 'Account', 'Status__c');
      assert.strictEqual(result, true);
    });

    it('should NOT detect field when not referenced', () => {
      const flowXML = `
        <Flow>
          <assignments>
            <field>OtherField__c</field>
          </assignments>
        </Flow>
      `;

      const result = analyzer.flowReferencesField(flowXML, 'Account', 'CustomField__c');
      assert.strictEqual(result, false);
    });

    it('should identify flow reference types correctly', () => {
      const flowXMLWithAssignment = `
        <Flow>
          <assignments>
            <field>CustomField__c</field>
          </assignments>
        </Flow>
      `;

      const types = analyzer.identifyFlowReferenceType(flowXMLWithAssignment, 'CustomField__c');
      assert.ok(types.includes('Assignment'));
    });

    it('should detect screen field references', () => {
      const flowXMLWithScreen = `
        <Flow>
          <screens>
            <screenField>
              <field>CustomField__c</field>
            </screenField>
          </screens>
        </Flow>
      `;

      const types = analyzer.identifyFlowReferenceType(flowXMLWithScreen, 'CustomField__c');
      assert.ok(types.includes('Screen'));
    });
  });

  describe('Formula Reference Detection', () => {
    it('should detect field references in formulas (case insensitive)', () => {
      const formula = 'ISBLANK(CustomField__c)';
      const result = analyzer.formulaReferencesField(formula, 'CustomField__c');
      assert.strictEqual(result, true);
    });

    it('should detect field references without __c suffix', () => {
      const formula = 'CustomField + 100';
      const result = analyzer.formulaReferencesField(formula, 'CustomField__c');
      assert.strictEqual(result, true);
    });

    it('should handle complex formula expressions', () => {
      const formula = 'IF(ISBLANK(Status__c), "Default", Status__c)';
      const result = analyzer.formulaReferencesField(formula, 'Status__c');
      assert.strictEqual(result, true);
    });

    it('should NOT detect when field is not in formula', () => {
      const formula = 'ISBLANK(OtherField__c)';
      const result = analyzer.formulaReferencesField(formula, 'CustomField__c');
      assert.strictEqual(result, false);
    });

    it('should handle null/undefined formulas gracefully', () => {
      assert.strictEqual(analyzer.formulaReferencesField(null, 'Field__c'), false);
      assert.strictEqual(analyzer.formulaReferencesField(undefined, 'Field__c'), false);
      assert.strictEqual(analyzer.formulaReferencesField('', 'Field__c'), false);
    });
  });

  describe('Query Execution', () => {
    it('should execute SOQL query via SF CLI', () => {
      // Mock execSync to return sample data
      const childProcess = require('child_process');
      childProcess.execSync = (cmd) => {
        if (cmd.includes('sf data query')) {
          return JSON.stringify({
            status: 0,
            result: {
              records: [
                { DeveloperName: 'TestFlow', ActiveVersionId: '300xx000000XXXX' }
              ]
            }
          });
        }
        return originalExecSync(cmd);
      };

      const query = 'SELECT DeveloperName FROM FlowDefinitionView LIMIT 1';
      const result = analyzer.executeQuery(query, true);

      assert.ok(Array.isArray(result));
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].DeveloperName, 'TestFlow');
    });

    it('should handle query errors gracefully', () => {
      const childProcess = require('child_process');
      childProcess.execSync = () => {
        throw new Error('Query failed');
      };

      const query = 'INVALID QUERY';
      const result = analyzer.executeQuery(query);

      assert.ok(Array.isArray(result));
      assert.strictEqual(result.length, 0);
    });

    it('should use Tooling API flag when specified', () => {
      const childProcess = require('child_process');
      let capturedCommand = '';
      childProcess.execSync = (cmd) => {
        capturedCommand = cmd;
        return JSON.stringify({ status: 0, result: { records: [] } });
      };

      analyzer.executeQuery('SELECT Name FROM Account', true);
      assert.ok(capturedCommand.includes('--use-tooling-api'));
    });
  });

  describe('Report Generation', () => {
    it('should generate comprehensive dependency report', () => {
      const dependencies = {
        object: 'Account',
        field: 'CustomField__c',
        totalReferences: 3,
        canDelete: false,
        blockers: [
          {
            type: 'Flow',
            name: 'Account_Validation',
            message: 'Flow references this field',
            action: 'Update flow definition'
          }
        ],
        references: {
          flows: [
            { name: 'Account_Validation', risk: 'HIGH' }
          ],
          validationRules: [
            { name: 'Status_Check', risk: 'MEDIUM', formula: 'ISBLANK(CustomField__c)' }
          ],
          formulaFields: [],
          layouts: [],
          processBuilders: [],
          workflowRules: []
        }
      };

      const report = analyzer.generateReport(dependencies);

      assert.ok(report.includes('Account.CustomField__c'));
      assert.ok(report.includes('Total References: 3'));
      assert.ok(report.includes('Can Delete: ❌ NO'));
      assert.ok(report.includes('Account_Validation'));
      assert.ok(report.includes('Status_Check'));
    });

    it('should indicate when field can be safely deleted', () => {
      const dependencies = {
        object: 'Account',
        field: 'SafeField__c',
        totalReferences: 0,
        canDelete: true,
        blockers: [],
        references: {
          flows: [],
          validationRules: [],
          formulaFields: [],
          layouts: [],
          processBuilders: [],
          workflowRules: []
        }
      };

      const report = analyzer.generateReport(dependencies);

      assert.ok(report.includes('Can Delete: ✅ YES'));
    });

    it('should include blocker details in report', () => {
      const dependencies = {
        object: 'Account',
        field: 'BlockedField__c',
        totalReferences: 2,
        canDelete: false,
        blockers: [
          {
            type: 'ValidationRule',
            name: 'Email_Check',
            message: 'Validation rule uses this field',
            action: 'Update formula'
          },
          {
            type: 'FormulaField',
            name: 'Score__c',
            message: 'Formula field references this field',
            action: 'Update formula'
          }
        ],
        references: {
          flows: [],
          validationRules: [{ name: 'Email_Check', risk: 'MEDIUM' }],
          formulaFields: [{ name: 'Score__c', risk: 'HIGH' }],
          layouts: [],
          processBuilders: [],
          workflowRules: []
        }
      };

      const report = analyzer.generateReport(dependencies);

      assert.ok(report.includes('🚫 BLOCKERS'));
      assert.ok(report.includes('Email_Check'));
      assert.ok(report.includes('Score__c'));
      assert.ok(report.includes('Update formula'));
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty flow XML', () => {
      const result = analyzer.flowReferencesField('', 'Account', 'Field__c');
      assert.strictEqual(result, false);
    });

    it('should handle null flow XML', () => {
      const result = analyzer.flowReferencesField(null, 'Account', 'Field__c');
      assert.strictEqual(result, false);
    });

    it('should handle special characters in field names', () => {
      const flowXML = '<Flow><field>Field_With_Underscores__c</field></Flow>';
      const result = analyzer.flowReferencesField(flowXML, 'Account', 'Field_With_Underscores__c');
      assert.strictEqual(result, true);
    });

    it('should be case-sensitive for field names in flow XML', () => {
      const flowXML = '<Flow><field>customfield__c</field></Flow>';
      const result = analyzer.flowReferencesField(flowXML, 'Account', 'CustomField__c');
      assert.strictEqual(result, false);
    });

    it('should handle multiple references to same field', () => {
      const flowXML = `
        <Flow>
          <assignments>
            <field>Status__c</field>
            <field>Status__c</field>
          </assignments>
        </Flow>
      `;

      const result = analyzer.flowReferencesField(flowXML, 'Account', 'Status__c');
      assert.strictEqual(result, true);
    });
  });

  describe('Integration Tests', () => {
    it('should analyze field with no dependencies', async () => {
      // Mock all query methods
      analyzer.checkFlowReferences = async () => {};
      analyzer.checkValidationRules = async () => {};
      analyzer.checkFormulaFields = async () => {};
      analyzer.checkPageLayouts = async () => {};
      analyzer.checkProcessBuilders = async () => {};
      analyzer.checkWorkflowRules = async () => {};

      const result = await analyzer.analyzeField('Account', 'UnusedField__c');

      assert.strictEqual(result.object, 'Account');
      assert.strictEqual(result.field, 'UnusedField__c');
      assert.strictEqual(result.totalReferences, 0);
      assert.strictEqual(result.canDelete, true);
    });

    it('should calculate total references correctly', async () => {
      const mockDependencies = {
        object: 'Account',
        field: 'TestField__c',
        totalReferences: 0,
        canDelete: true,
        blockers: [],
        references: {
          flows: [{ name: 'Flow1' }, { name: 'Flow2' }],
          validationRules: [{ name: 'Rule1' }],
          formulaFields: [],
          layouts: [{ name: 'Layout1' }],
          processBuilders: [],
          workflowRules: []
        }
      };

      analyzer.checkFlowReferences = async (obj, field, deps) => {
        deps.references.flows = mockDependencies.references.flows;
      };
      analyzer.checkValidationRules = async (obj, field, deps) => {
        deps.references.validationRules = mockDependencies.references.validationRules;
      };
      analyzer.checkFormulaFields = async () => {};
      analyzer.checkPageLayouts = async (obj, field, deps) => {
        deps.references.layouts = mockDependencies.references.layouts;
      };
      analyzer.checkProcessBuilders = async () => {};
      analyzer.checkWorkflowRules = async () => {};

      const result = await analyzer.analyzeField('Account', 'TestField__c');

      assert.strictEqual(result.totalReferences, 4); // 2 flows + 1 rule + 1 layout
    });
  });

  describe('Performance', () => {
    it('should complete analysis in reasonable time', async function() {
      // this.timeout(5000); // Removed for Jest compatibility - use jest.setTimeout(5000) if needed // 5 second timeout

      // Mock quick responses
      analyzer.checkFlowReferences = async () => {};
      analyzer.checkValidationRules = async () => {};
      analyzer.checkFormulaFields = async () => {};
      analyzer.checkPageLayouts = async () => {};
      analyzer.checkProcessBuilders = async () => {};
      analyzer.checkWorkflowRules = async () => {};

      const startTime = Date.now();
      await analyzer.analyzeField('Account', 'TestField__c');
      const duration = Date.now() - startTime;

      assert.ok(duration < 1000, `Analysis took ${duration}ms, should be <1000ms`);
    });
  });
});

// Test runner
if (require.main === module) {
  console.log('Running Metadata Dependency Analyzer Tests...\n');

  // Simple test runner
  const runTests = async () => {
    let passed = 0;
    let failed = 0;

    const tests = [
      { name: 'Flow Reference Detection - {!$Record} syntax', fn: () => {
        const analyzer = new MetadataDependencyAnalyzer('test', { verbose: false });
        const flowXML = '<Flow><field>{!$Record.Test__c}</field></Flow>';
        assert.strictEqual(analyzer.flowReferencesField(flowXML, 'Account', 'Test__c'), true);
      }},
      { name: 'Formula Reference Detection', fn: () => {
        const analyzer = new MetadataDependencyAnalyzer('test', { verbose: false });
        assert.strictEqual(analyzer.formulaReferencesField('ISBLANK(Test__c)', 'Test__c'), true);
      }},
      { name: 'Report Generation', fn: () => {
        const analyzer = new MetadataDependencyAnalyzer('test', { verbose: false });
        const deps = {
          object: 'Account',
          field: 'Test__c',
          totalReferences: 1,
          canDelete: false,
          blockers: [],
          references: { flows: [], validationRules: [], formulaFields: [], layouts: [], processBuilders: [], workflowRules: [] }
        };
        const report = analyzer.generateReport(deps);
        assert.ok(report.includes('Account.Test__c'));
      }}
    ];

    for (const test of tests) {
      try {
        test.fn();
        console.log(`✅ ${test.name}`);
        passed++;
      } catch (error) {
        console.log(`❌ ${test.name}`);
        console.log(`   ${error.message}`);
        failed++;
      }
    }

    console.log(`\n📊 Results: ${passed} passed, ${failed} failed`);
    process.exit(failed > 0 ? 1 : 0);
  };

  runTests();
}

module.exports = {};
