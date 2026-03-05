/**
 * Test Suite: Flow XML Validator
 *
 * Tests the Flow XML validation system that prevents deployment failures
 * by catching syntax errors, semantic issues, and UI component dependencies.
 *
 * Coverage Target: >90%
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const FlowXMLValidator = require('../scripts/lib/flow-xml-validator');

describe('FlowXMLValidator', () => {
  let validator;
  let tempDir;

  beforeEach(() => {
    validator = new FlowXMLValidator({ verbose: false, autoFix: false });
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-test-'));
  });

  afterEach(() => {
    // Clean up temp directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('Constructor', () => {
    it('should initialize with default options', () => {
      assert.strictEqual(validator.verbose, false);
      assert.strictEqual(validator.autoFix, false);
      assert.ok(Array.isArray(validator.errors));
      assert.ok(Array.isArray(validator.warnings));
    });

    it('should respect verbose option', () => {
      const verboseValidator = new FlowXMLValidator({ verbose: true });
      assert.strictEqual(verboseValidator.verbose, true);
    });

    it('should respect autoFix option', () => {
      const autoFixValidator = new FlowXMLValidator({ autoFix: true });
      assert.strictEqual(autoFixValidator.autoFix, true);
    });
  });

  describe('.CurrentItem Syntax Validation', () => {
    it('should detect invalid $CurrentItem syntax', () => {
      const flowXML = `<?xml version="1.0"?>
        <Flow xmlns="http://soap.sforce.com/2006/04/metadata">
          <assignments>
            <assignmentItems>
              <assignToReference>loopRecord</assignToReference>
              <value>
                <elementReference>$CurrentItem</elementReference>
              </value>
            </assignmentItems>
          </assignments>
        </Flow>`;

      const flowPath = path.join(tempDir, 'test-flow.flow-meta.xml');
      fs.writeFileSync(flowPath, flowXML);

      const result = validator.validateFlow(flowPath);

      assert.strictEqual(result.valid, false);
      assert.ok(result.errors.some(e => e.type === 'CURRENTITEM_SYNTAX'));
      assert.ok(result.errors[0].message.includes('$CurrentItem'));
    });

    it('should detect missing dot in CurrentItem reference', () => {
      const flowXML = `<?xml version="1.0"?>
        <Flow>
          <assignments>
            <value>{!CurrentItem}</value>
          </assignments>
        </Flow>`;

      const flowPath = path.join(tempDir, 'missing-dot.flow-meta.xml');
      fs.writeFileSync(flowPath, flowXML);

      const result = validator.validateFlow(flowPath);

      assert.ok(result.errors.some(e => e.type === 'CURRENTITEM_SYNTAX'));
    });

    it('should accept valid .CurrentItem syntax', () => {
      const flowXML = `<?xml version="1.0"?>
        <Flow>
          <assignments>
            <value>{!loopVar.CurrentItem.FieldName}</value>
          </assignments>
        </Flow>`;

      const flowPath = path.join(tempDir, 'valid-currentitem.flow-meta.xml');
      fs.writeFileSync(flowPath, flowXML);

      const result = validator.validateFlow(flowPath);

      assert.strictEqual(result.errors.filter(e => e.type === 'CURRENTITEM_SYNTAX').length, 0);
    });

    it('should provide fix suggestions for CurrentItem errors', () => {
      const flowXML = `<?xml version="1.0"?>
        <Flow>
          <value>$CurrentItem</value>
        </Flow>`;

      const flowPath = path.join(tempDir, 'fixable.flow-meta.xml');
      fs.writeFileSync(flowPath, flowXML);

      const result = validator.validateFlow(flowPath);

      assert.ok(result.fixes.length > 0);
      assert.ok(result.fixes.some(f => f.type === 'CURRENTITEM_SYNTAX'));
    });
  });

  describe('Duplicate Field Assignment Detection', () => {
    it('should detect duplicate field assignments in same block', () => {
      const flowXML = `<?xml version="1.0"?>
        <Flow>
          <assignments>
            <assignToReference>recordVar</assignToReference>
            <assignmentItems>
              <field>Status__c</field>
              <value>Active</value>
            </assignmentItems>
            <assignmentItems>
              <field>Status__c</field>
              <value>Inactive</value>
            </assignmentItems>
          </assignments>
        </Flow>`;

      const flowPath = path.join(tempDir, 'duplicate-assign.flow-meta.xml');
      fs.writeFileSync(flowPath, flowXML);

      const result = validator.validateFlow(flowPath);

      assert.ok(result.errors.some(e => e.type === 'DUPLICATE_ASSIGNMENT'));
      assert.ok(result.errors[0].message.includes('Status__c'));
    });

    it('should allow same field assignment in different blocks', () => {
      const flowXML = `<?xml version="1.0"?>
        <Flow>
          <assignments>
            <name>Assignment1</name>
            <assignToReference>record1</assignToReference>
            <assignmentItems>
              <field>Status__c</field>
            </assignmentItems>
          </assignments>
          <assignments>
            <name>Assignment2</name>
            <assignToReference>record2</assignToReference>
            <assignmentItems>
              <field>Status__c</field>
            </assignmentItems>
          </assignments>
        </Flow>`;

      const flowPath = path.join(tempDir, 'different-blocks.flow-meta.xml');
      fs.writeFileSync(flowPath, flowXML);

      const result = validator.validateFlow(flowPath);

      assert.strictEqual(result.errors.filter(e => e.type === 'DUPLICATE_ASSIGNMENT').length, 0);
    });
  });

  describe('Invalid Reference Detection', () => {
    it('should detect references to non-existent elements', () => {
      const flowXML = `<?xml version="1.0"?>
        <Flow>
          <start>
            <connector>
              <targetReference>NonExistentElement</targetReference>
            </connector>
          </start>
        </Flow>`;

      const flowPath = path.join(tempDir, 'invalid-ref.flow-meta.xml');
      fs.writeFileSync(flowPath, flowXML);

      const result = validator.validateFlow(flowPath);

      assert.ok(result.errors.some(e => e.type === 'INVALID_REFERENCE'));
      assert.ok(result.errors[0].message.includes('NonExistentElement'));
    });

    it('should accept valid element references', () => {
      const flowXML = `<?xml version="1.0"?>
        <Flow>
          <decisions>
            <name>Check_Status</name>
          </decisions>
          <start>
            <connector>
              <targetReference>Check_Status</targetReference>
            </connector>
          </start>
        </Flow>`;

      const flowPath = path.join(tempDir, 'valid-ref.flow-meta.xml');
      fs.writeFileSync(flowPath, flowXML);

      const result = validator.validateFlow(flowPath);

      assert.strictEqual(result.errors.filter(e => e.type === 'INVALID_REFERENCE').length, 0);
    });
  });

  describe('Screen Flow Component Detection', () => {
    it('should detect Screen Flow UI components', () => {
      const flowXML = `<?xml version="1.0"?>
        <Flow>
          <screens>
            <name>User_Input</name>
            <fields>
              <fieldType>RadioButtons</fieldType>
            </fields>
          </screens>
        </Flow>`;

      const flowPath = path.join(tempDir, 'screen-flow.flow-meta.xml');
      fs.writeFileSync(flowPath, flowXML);

      const result = validator.validateFlow(flowPath);

      assert.ok(result.warnings.some(w => w.type === 'SCREEN_UI_COMPONENT'));
      assert.ok(result.warnings[0].message.includes('RadioButtons'));
    });

    it('should detect multiple UI component types', () => {
      const flowXML = `<?xml version="1.0"?>
        <Flow>
          <screens>
            <name>Screen1</name>
            <fields>
              <fieldType>RadioButtons</fieldType>
            </fields>
            <fields>
              <fieldType>DropdownBox</fieldType>
            </fields>
            <fields>
              <fieldType>ComponentInstance</fieldType>
            </fields>
          </screens>
        </Flow>`;

      const flowPath = path.join(tempDir, 'multiple-components.flow-meta.xml');
      fs.writeFileSync(flowPath, flowXML);

      const result = validator.validateFlow(flowPath);

      const componentWarnings = result.warnings.filter(w => w.type === 'SCREEN_UI_COMPONENT');
      assert.ok(componentWarnings.length >= 3);
    });
  });

  describe('Formula Syntax Validation', () => {
    it('should detect unbalanced parentheses in formulas', () => {
      const flowXML = `<?xml version="1.0"?>
        <Flow>
          <formulas>
            <name>BadFormula</name>
            <expression>IF(Status = 'Active', TRUE</expression>
          </formulas>
        </Flow>`;

      const flowPath = path.join(tempDir, 'unbalanced-parens.flow-meta.xml');
      fs.writeFileSync(flowPath, flowXML);

      const result = validator.validateFlow(flowPath);

      assert.ok(result.errors.some(e => e.type === 'FORMULA_SYNTAX'));
      assert.ok(result.errors[0].message.includes('unbalanced'));
    });

    it('should detect extra closing parentheses', () => {
      const flowXML = `<?xml version="1.0"?>
        <Flow>
          <formulas>
            <name>BadFormula</name>
            <expression>IF(TRUE, 1, 2))</expression>
          </formulas>
        </Flow>`;

      const flowPath = path.join(tempDir, 'extra-parens.flow-meta.xml');
      fs.writeFileSync(flowPath, flowXML);

      const result = validator.validateFlow(flowPath);

      assert.ok(result.errors.some(e => e.type === 'FORMULA_SYNTAX'));
    });

    it('should accept valid formula syntax', () => {
      const flowXML = `<?xml version="1.0"?>
        <Flow>
          <formulas>
            <name>GoodFormula</name>
            <expression>IF(Status__c = 'Active', TRUE, FALSE)</expression>
          </formulas>
        </Flow>`;

      const flowPath = path.join(tempDir, 'valid-formula.flow-meta.xml');
      fs.writeFileSync(flowPath, flowXML);

      const result = validator.validateFlow(flowPath);

      assert.strictEqual(result.errors.filter(e => e.type === 'FORMULA_SYNTAX').length, 0);
    });
  });

  describe('Loop Validation', () => {
    it('should detect loops without collection reference', () => {
      const flowXML = `<?xml version="1.0"?>
        <Flow>
          <loops>
            <name>Loop_Records</name>
          </loops>
        </Flow>`;

      const flowPath = path.join(tempDir, 'missing-collection.flow-meta.xml');
      fs.writeFileSync(flowPath, flowXML);

      const result = validator.validateFlow(flowPath);

      assert.ok(result.errors.some(e => e.type === 'LOOP_COLLECTION'));
    });

    it('should accept loops with collection reference', () => {
      const flowXML = `<?xml version="1.0"?>
        <Flow>
          <loops>
            <name>Loop_Records</name>
            <collectionReference>AccountList</collectionReference>
          </loops>
        </Flow>`;

      const flowPath = path.join(tempDir, 'valid-loop.flow-meta.xml');
      fs.writeFileSync(flowPath, flowXML);

      const result = validator.validateFlow(flowPath);

      assert.strictEqual(result.errors.filter(e => e.type === 'LOOP_COLLECTION').length, 0);
    });
  });

  describe('Decision Logic Validation', () => {
    it('should warn about decisions without rules', () => {
      const flowXML = `<?xml version="1.0"?>
        <Flow>
          <decisions>
            <name>Empty_Decision</name>
          </decisions>
        </Flow>`;

      const flowPath = path.join(tempDir, 'no-rules.flow-meta.xml');
      fs.writeFileSync(flowPath, flowXML);

      const result = validator.validateFlow(flowPath);

      assert.ok(result.warnings.some(w => w.type === 'DECISION_LOGIC'));
    });

    it('should warn about decisions without default connector', () => {
      const flowXML = `<?xml version="1.0"?>
        <Flow>
          <decisions>
            <name>Decision_No_Default</name>
            <rules>
              <name>Rule1</name>
            </rules>
          </decisions>
        </Flow>`;

      const flowPath = path.join(tempDir, 'no-default.flow-meta.xml');
      fs.writeFileSync(flowPath, flowXML);

      const result = validator.validateFlow(flowPath);

      assert.ok(result.warnings.some(w => w.type === 'DECISION_DEFAULT'));
    });

    it('should accept decisions with rules and default connector', () => {
      const flowXML = `<?xml version="1.0"?>
        <Flow>
          <decisions>
            <name>Valid_Decision</name>
            <rules>
              <name>Rule1</name>
            </rules>
            <defaultConnector>
              <targetReference>DefaultPath</targetReference>
            </defaultConnector>
          </decisions>
        </Flow>`;

      const flowPath = path.join(tempDir, 'valid-decision.flow-meta.xml');
      fs.writeFileSync(flowPath, flowXML);

      const result = validator.validateFlow(flowPath);

      assert.strictEqual(result.warnings.filter(w => w.type === 'DECISION_LOGIC').length, 0);
      assert.strictEqual(result.warnings.filter(w => w.type === 'DECISION_DEFAULT').length, 0);
    });
  });

  describe('Record Lookup Validation', () => {
    it('should warn about lookups without filters', () => {
      const flowXML = `<?xml version="1.0"?>
        <Flow>
          <recordLookups>
            <name>Lookup_Without_Filter</name>
          </recordLookups>
        </Flow>`;

      const flowPath = path.join(tempDir, 'no-filters.flow-meta.xml');
      fs.writeFileSync(flowPath, flowXML);

      const result = validator.validateFlow(flowPath);

      assert.ok(result.warnings.some(w => w.type === 'RECORD_LOOKUP'));
    });

    it('should accept lookups with filters', () => {
      const flowXML = `<?xml version="1.0"?>
        <Flow>
          <recordLookups>
            <name>Lookup_With_Filter</name>
            <filters>
              <field>Status__c</field>
              <value>Active</value>
            </filters>
          </recordLookups>
        </Flow>`;

      const flowPath = path.join(tempDir, 'with-filters.flow-meta.xml');
      fs.writeFileSync(flowPath, flowXML);

      const result = validator.validateFlow(flowPath);

      assert.strictEqual(result.warnings.filter(w => w.type === 'RECORD_LOOKUP').length, 0);
    });
  });

  describe('Report Generation', () => {
    it('should format comprehensive validation report', () => {
      const result = {
        flowName: 'TestFlow',
        valid: false,
        errors: [
          {
            type: 'CURRENTITEM_SYNTAX',
            severity: 'HIGH',
            message: 'Invalid .CurrentItem syntax',
            details: 'Use {!loopVar.CurrentItem}',
            location: 'Line 45'
          }
        ],
        warnings: [
          {
            type: 'SCREEN_UI_COMPONENT',
            message: 'Contains UI components',
            details: 'Requires manual configuration'
          }
        ],
        fixes: [
          {
            type: 'CURRENTITEM_SYNTAX',
            description: 'Fix CurrentItem reference',
            automated: true
          }
        ]
      };

      const report = validator.formatReport(result);

      assert.ok(report.includes('TestFlow'));
      assert.ok(report.includes('❌ INVALID'));
      assert.ok(report.includes('CURRENTITEM_SYNTAX'));
      assert.ok(report.includes('SCREEN_UI_COMPONENT'));
      assert.ok(report.includes('AVAILABLE FIXES'));
    });

    it('should show valid status for flows with no issues', () => {
      const result = {
        flowName: 'ValidFlow',
        valid: true,
        errors: [],
        warnings: [],
        fixes: []
      };

      const report = validator.formatReport(result);

      assert.ok(report.includes('✅ VALID'));
      assert.ok(report.includes('Errors: 0'));
    });
  });

  describe('Auto-Fix Functionality', () => {
    it('should apply fixes when autoFix is enabled', () => {
      const autoFixValidator = new FlowXMLValidator({ verbose: false, autoFix: true });

      const flowXML = `<?xml version="1.0"?>
        <Flow>
          <value>$CurrentItem</value>
        </Flow>`;

      const flowPath = path.join(tempDir, 'auto-fix.flow-meta.xml');
      fs.writeFileSync(flowPath, flowXML);

      const result = autoFixValidator.validateFlow(flowPath);

      // Check that backup was created
      const backupPath = flowPath.replace('.flow-meta.xml', '.flow-meta.xml.bak');
      assert.ok(fs.existsSync(backupPath));

      // Verify fixes were applied
      assert.ok(result.fixes.length > 0);
    });

    it('should not modify file when autoFix is disabled', () => {
      const flowXML = `<?xml version="1.0"?>
        <Flow>
          <value>$CurrentItem</value>
        </Flow>`;

      const flowPath = path.join(tempDir, 'no-auto-fix.flow-meta.xml');
      fs.writeFileSync(flowPath, flowXML);

      const originalContent = fs.readFileSync(flowPath, 'utf-8');
      validator.validateFlow(flowPath);
      const afterContent = fs.readFileSync(flowPath, 'utf-8');

      assert.strictEqual(originalContent, afterContent);
    });
  });

  describe('Edge Cases', () => {
    it('should handle non-existent file gracefully', () => {
      const result = validator.validateFlow('/nonexistent/file.flow-meta.xml');

      assert.strictEqual(result.valid, false);
      assert.ok(result.errors.some(e => e.type === 'PARSE_ERROR'));
    });

    it('should handle malformed XML', () => {
      const malformedXML = '<Flow><unclosed>';
      const flowPath = path.join(tempDir, 'malformed.flow-meta.xml');
      fs.writeFileSync(flowPath, malformedXML);

      const result = validator.validateFlow(flowPath);

      // Should not crash, should return error
      assert.strictEqual(result.valid, false);
    });

    it('should handle empty file', () => {
      const flowPath = path.join(tempDir, 'empty.flow-meta.xml');
      fs.writeFileSync(flowPath, '');

      const result = validator.validateFlow(flowPath);

      assert.strictEqual(result.valid, false);
    });
  });
});

// Simple test runner
if (require.main === module) {
  console.log('Running Flow XML Validator Tests...\n');

  const runQuickTests = () => {
    let passed = 0;
    let failed = 0;

    const tests = [
      {
        name: 'CurrentItem Syntax Detection',
        fn: () => {
          const validator = new FlowXMLValidator({ verbose: false });
          const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-'));
          const flowPath = path.join(tempDir, 'test.flow-meta.xml');
          fs.writeFileSync(flowPath, '<Flow><value>$CurrentItem</value></Flow>');
          const result = validator.validateFlow(flowPath);
          fs.rmSync(tempDir, { recursive: true });
          assert.ok(result.errors.some(e => e.type === 'CURRENTITEM_SYNTAX'));
        }
      },
      {
        name: 'Duplicate Assignment Detection',
        fn: () => {
          const validator = new FlowXMLValidator({ verbose: false });
          const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-'));
          const flowPath = path.join(tempDir, 'test.flow-meta.xml');
          const xml = `<Flow><assignments><assignToReference>r</assignToReference>
            <assignmentItems><field>F</field></assignmentItems>
            <assignmentItems><field>F</field></assignmentItems></assignments></Flow>`;
          fs.writeFileSync(flowPath, xml);
          const result = validator.validateFlow(flowPath);
          fs.rmSync(tempDir, { recursive: true });
          assert.ok(result.errors.some(e => e.type === 'DUPLICATE_ASSIGNMENT'));
        }
      },
      {
        name: 'Formula Validation',
        fn: () => {
          const validator = new FlowXMLValidator({ verbose: false });
          const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-'));
          const flowPath = path.join(tempDir, 'test.flow-meta.xml');
          const xml = '<Flow><formulas><name>F</name><expression>IF(TRUE</expression></formulas></Flow>';
          fs.writeFileSync(flowPath, xml);
          const result = validator.validateFlow(flowPath);
          fs.rmSync(tempDir, { recursive: true });
          assert.ok(result.errors.some(e => e.type === 'FORMULA_SYNTAX'));
        }
      }
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

  runQuickTests();
}

module.exports = {};
