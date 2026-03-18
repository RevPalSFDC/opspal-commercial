/**
 * Flow XML Validator Tests
 */

const FlowXMLValidator = require('../flow-xml-validator.js');
const fs = require('fs');
const path = require('path');

// Mock fs module
jest.mock('fs');

describe('FlowXMLValidator', () => {
    let validator;

    beforeEach(() => {
        validator = new FlowXMLValidator({ verbose: false });
        jest.clearAllMocks();
    });

    describe('Constructor', () => {
        test('should initialize with default options', () => {
            const v = new FlowXMLValidator();
            expect(v.verbose).toBe(true);
            expect(v.autoFix).toBe(false);
            expect(v.errors).toEqual([]);
            expect(v.warnings).toEqual([]);
            expect(v.fixes).toEqual([]);
        });

        test('should accept custom options', () => {
            const v = new FlowXMLValidator({ verbose: false, autoFix: true });
            expect(v.verbose).toBe(false);
            expect(v.autoFix).toBe(true);
        });
    });

    describe('validateFlow', () => {
        test('should return error for non-existent file', () => {
            fs.existsSync.mockReturnValue(false);

            const result = validator.validateFlow('/path/to/missing.flow-meta.xml');

            expect(result.valid).toBe(false);
            expect(result.errors[0].type).toBe('PARSE_ERROR');
            expect(result.errors[0].message).toContain('not found');
        });

        test('should return error for empty file', () => {
            fs.existsSync.mockReturnValue(true);
            fs.readFileSync.mockReturnValue('');

            const result = validator.validateFlow('/path/to/empty.flow-meta.xml');

            expect(result.valid).toBe(false);
            // Empty file causes DOMParser to throw, resulting in PARSE_ERROR
            // The validator catches this and returns a parse error
            expect(result.errors.some(e =>
                e.type === 'EMPTY_FILE' || e.type === 'PARSE_ERROR'
            )).toBe(true);
        });

        test('should validate well-formed flow XML', () => {
            const validFlow = `<?xml version="1.0" encoding="UTF-8"?>
<Flow xmlns="http://soap.sforce.com/2006/04/metadata">
    <apiVersion>62.0</apiVersion>
    <start>
        <name>Start</name>
    </start>
</Flow>`;

            fs.existsSync.mockReturnValue(true);
            fs.readFileSync.mockReturnValue(validFlow);

            const result = validator.validateFlow('/path/to/Valid_Flow.flow-meta.xml');

            expect(result.valid).toBe(true);
            expect(result.flowName).toBe('Valid_Flow');
            expect(result.errors).toEqual([]);
        });

        test('should detect malformed XML structure', () => {
            const malformedXML = `<?xml version="1.0" encoding="UTF-8"?>
<Flow xmlns="http://soap.sforce.com/2006/04/metadata">
    <start>
        <name>Start</name>
    <!-- Missing closing tag -->
</Flow>`;

            fs.existsSync.mockReturnValue(true);
            fs.readFileSync.mockReturnValue(malformedXML);

            const result = validator.validateFlow('/path/to/Malformed.flow-meta.xml');

            expect(result.errors.some(e => e.type === 'XML_STRUCTURE_ERROR')).toBe(true);
        });
    });

    describe('checkCurrentItemSyntax', () => {
        test('should detect $CurrentItem syntax error', () => {
            const flowXML = `<Flow>
    <formulas>
        <expression>{!$CurrentItem.Name}</expression>
    </formulas>
</Flow>`;

            validator.checkCurrentItemSyntax(null, flowXML);

            expect(validator.errors.length).toBe(1);
            expect(validator.errors[0].type).toBe('CURRENTITEM_SYNTAX');
            expect(validator.errors[0].message).toContain('$CurrentItem');
        });

        test('should detect {!CurrentItem syntax error', () => {
            const flowXML = `<Flow>
    <value>{!CurrentItem.Field__c}</value>
</Flow>`;

            validator.checkCurrentItemSyntax(null, flowXML);

            expect(validator.errors.length).toBe(1);
            expect(validator.errors[0].type).toBe('CURRENTITEM_SYNTAX');
        });

        test('should detect {!loop.CurrentItem syntax error', () => {
            const flowXML = `<Flow>
    <value>{!loop.CurrentItem.Id}</value>
</Flow>`;

            validator.checkCurrentItemSyntax(null, flowXML);

            expect(validator.errors.length).toBe(1);
            expect(validator.errors[0].type).toBe('CURRENTITEM_SYNTAX');
        });

        test('should not flag valid CurrentItem syntax', () => {
            const flowXML = `<Flow>
    <value>{!loopVar.CurrentItem.Name}</value>
</Flow>`;

            validator.checkCurrentItemSyntax(null, flowXML);

            expect(validator.errors.length).toBe(0);
        });

        test('should add fix suggestions', () => {
            const flowXML = `<Flow>
    <expression>{!$CurrentItem.Name}</expression>
</Flow>`;

            validator.checkCurrentItemSyntax(null, flowXML);

            expect(validator.fixes.length).toBe(1);
            expect(validator.fixes[0].type).toBe('CURRENTITEM_SYNTAX');
            expect(validator.fixes[0].automated).toBe(true);
        });
    });

    describe('checkDuplicateFieldAssignments', () => {
        test('should detect duplicate field assignments', () => {
            const flowXML = `<?xml version="1.0" encoding="UTF-8"?>
<Flow>
    <assignments>
        <name>Assign_Fields</name>
        <assignToReference>recordVar</assignToReference>
        <assignmentItems>
            <field>Name</field>
            <value><stringValue>Test</stringValue></value>
        </assignmentItems>
        <assignmentItems>
            <field>Name</field>
            <value><stringValue>Test2</stringValue></value>
        </assignmentItems>
    </assignments>
</Flow>`;

            const { DOMParser } = require('@xmldom/xmldom');
            const parser = new DOMParser();
            const doc = parser.parseFromString(flowXML, 'text/xml');

            validator.checkDuplicateFieldAssignments(doc);

            expect(validator.errors.length).toBe(1);
            expect(validator.errors[0].type).toBe('DUPLICATE_ASSIGNMENT');
            expect(validator.errors[0].message).toContain('Name');
        });

        test('should allow different field assignments', () => {
            const flowXML = `<?xml version="1.0" encoding="UTF-8"?>
<Flow>
    <assignments>
        <name>Assign_Fields</name>
        <assignToReference>recordVar</assignToReference>
        <assignmentItems>
            <field>Name</field>
            <value><stringValue>Test</stringValue></value>
        </assignmentItems>
        <assignmentItems>
            <field>Description</field>
            <value><stringValue>Test Description</stringValue></value>
        </assignmentItems>
    </assignments>
</Flow>`;

            const { DOMParser } = require('@xmldom/xmldom');
            const parser = new DOMParser();
            const doc = parser.parseFromString(flowXML, 'text/xml');

            validator.checkDuplicateFieldAssignments(doc);

            expect(validator.errors.length).toBe(0);
        });
    });

    describe('checkElementOrdering', () => {
        test('should detect canonical top-level ordering issues and add one reorder fix', () => {
            const flowXML = `<?xml version="1.0" encoding="UTF-8"?>
<Flow xmlns="http://soap.sforce.com/2006/04/metadata">
    <variables>
        <name>LateVariable</name>
    </variables>
    <decisions>
        <name>Decision_First</name>
    </decisions>
</Flow>`;

            const { DOMParser } = require('@xmldom/xmldom');
            const parser = new DOMParser();
            const doc = parser.parseFromString(flowXML, 'text/xml');

            validator.checkElementOrdering(doc);

            expect(validator.errors.some(error =>
                error.type === 'ELEMENT_ORDERING' && error.severity === 'MEDIUM'
            )).toBe(true);
            expect(validator.fixes.filter(fix => fix.type === 'ELEMENT_ORDERING')).toHaveLength(1);
        });

        test('should auto-fix canonical ordering while preserving XML declaration and unknown tags', () => {
            const flowXML = `<?xml version="1.0" encoding="UTF-8"?>
<Flow xmlns="http://soap.sforce.com/2006/04/metadata">
    <!-- keep-comment -->
    <variables>
        <name>LateVariable</name>
    </variables>
    <customThing>
        <name>KeepMe</name>
    </customThing>
    <decisions>
        <name>Decision_First</name>
    </decisions>
</Flow>`;

            fs.existsSync.mockReturnValue(true);
            fs.readFileSync.mockReturnValue(flowXML);

            const autoFixValidator = new FlowXMLValidator({ verbose: false, autoFix: true });
            autoFixValidator.validateFlow('/path/to/Ordering.flow-meta.xml');

            expect(fs.writeFileSync).toHaveBeenCalledTimes(2);
            const updatedXML = fs.writeFileSync.mock.calls[1][1];
            expect(updatedXML.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
            expect(updatedXML).toContain('<customThing>');
            expect(updatedXML).toContain('<!-- keep-comment -->');
            expect(updatedXML.indexOf('<decisions>')).toBeLessThan(updatedXML.indexOf('<variables>'));
        });
    });

    describe('checkInvalidReferences', () => {
        test('should detect invalid element references', () => {
            const flowXML = `<?xml version="1.0" encoding="UTF-8"?>
<Flow>
    <decisions>
        <name>Check_Status</name>
        <connector>
            <targetReference>NonExistent_Element</targetReference>
        </connector>
    </decisions>
</Flow>`;

            const { DOMParser } = require('@xmldom/xmldom');
            const parser = new DOMParser();
            const doc = parser.parseFromString(flowXML, 'text/xml');

            validator.checkInvalidReferences(doc);

            expect(validator.errors.length).toBe(1);
            expect(validator.errors[0].type).toBe('INVALID_REFERENCE');
            expect(validator.errors[0].message).toContain('NonExistent_Element');
        });

        test('should accept valid element references', () => {
            const flowXML = `<?xml version="1.0" encoding="UTF-8"?>
<Flow>
    <decisions>
        <name>Check_Status</name>
        <connector>
            <targetReference>Valid_Assignment</targetReference>
        </connector>
    </decisions>
    <assignments>
        <name>Valid_Assignment</name>
    </assignments>
</Flow>`;

            const { DOMParser } = require('@xmldom/xmldom');
            const parser = new DOMParser();
            const doc = parser.parseFromString(flowXML, 'text/xml');

            validator.checkInvalidReferences(doc);

            expect(validator.errors.length).toBe(0);
        });
    });

    describe('checkScreenFlowComponents', () => {
        test('should warn about RadioButtons component', () => {
            const flowXML = `<?xml version="1.0" encoding="UTF-8"?>
<Flow>
    <screens>
        <name>Selection_Screen</name>
        <fields>
            <fieldType>RadioButtons</fieldType>
        </fields>
    </screens>
</Flow>`;

            const { DOMParser } = require('@xmldom/xmldom');
            const parser = new DOMParser();
            const doc = parser.parseFromString(flowXML, 'text/xml');

            validator.checkScreenFlowComponents(doc);

            expect(validator.warnings.length).toBe(1);
            expect(validator.warnings[0].type).toBe('SCREEN_UI_COMPONENT');
            expect(validator.warnings[0].message).toContain('RadioButtons');
        });

        test('should warn about DropdownBox component', () => {
            const flowXML = `<?xml version="1.0" encoding="UTF-8"?>
<Flow>
    <screens>
        <name>Input_Screen</name>
        <fields>
            <fieldType>DropdownBox</fieldType>
        </fields>
    </screens>
</Flow>`;

            const { DOMParser } = require('@xmldom/xmldom');
            const parser = new DOMParser();
            const doc = parser.parseFromString(flowXML, 'text/xml');

            validator.checkScreenFlowComponents(doc);

            expect(validator.warnings.length).toBe(1);
            expect(validator.warnings[0].message).toContain('DropdownBox');
        });

        test('should warn about ComponentInstance', () => {
            const flowXML = `<?xml version="1.0" encoding="UTF-8"?>
<Flow>
    <screens>
        <name>Custom_Screen</name>
        <fields>
            <fieldType>ComponentInstance</fieldType>
        </fields>
    </screens>
</Flow>`;

            const { DOMParser } = require('@xmldom/xmldom');
            const parser = new DOMParser();
            const doc = parser.parseFromString(flowXML, 'text/xml');

            validator.checkScreenFlowComponents(doc);

            expect(validator.warnings.length).toBe(1);
            expect(validator.warnings[0].message).toContain('ComponentInstance');
        });

        test('should not warn about standard components', () => {
            const flowXML = `<?xml version="1.0" encoding="UTF-8"?>
<Flow>
    <screens>
        <name>Standard_Screen</name>
        <fields>
            <fieldType>InputField</fieldType>
        </fields>
    </screens>
</Flow>`;

            const { DOMParser } = require('@xmldom/xmldom');
            const parser = new DOMParser();
            const doc = parser.parseFromString(flowXML, 'text/xml');

            validator.checkScreenFlowComponents(doc);

            expect(validator.warnings.length).toBe(0);
        });
    });

    describe('checkFormulaBalancedParentheses', () => {
        test('should detect missing closing parenthesis', () => {
            validator.checkFormulaBalancedParentheses('TestFormula', 'IF(ISBLANK(Field__c, "Default")');

            expect(validator.errors.length).toBe(1);
            expect(validator.errors[0].type).toBe('FORMULA_SYNTAX');
            expect(validator.errors[0].message).toContain('unbalanced');
        });

        test('should detect missing opening parenthesis', () => {
            validator.checkFormulaBalancedParentheses('TestFormula', 'IF ISBLANK(Field__c), "Default")');

            expect(validator.errors.length).toBe(1);
            expect(validator.errors[0].type).toBe('FORMULA_SYNTAX');
        });

        test('should accept balanced parentheses', () => {
            validator.checkFormulaBalancedParentheses('TestFormula', 'IF(ISBLANK(Field__c), "Default", Field__c)');

            expect(validator.errors.length).toBe(0);
        });

        test('should handle nested parentheses', () => {
            validator.checkFormulaBalancedParentheses('TestFormula', 'IF(AND(OR(A, B), NOT(C)), "Yes", "No")');

            expect(validator.errors.length).toBe(0);
        });

        test('should detect early closing parenthesis', () => {
            validator.checkFormulaBalancedParentheses('TestFormula', 'IF)A, B, C(');

            expect(validator.errors.length).toBe(1);
            expect(validator.errors[0].details).toContain('Closing parenthesis without matching');
        });
    });

    describe('checkFormulaFieldReferences', () => {
        test('should warn about incorrect $Record reference', () => {
            validator.checkFormulaFieldReferences('TestFormula', '$Record.Field__c. + 1');

            expect(validator.warnings.length).toBe(1);
            expect(validator.warnings[0].type).toBe('FORMULA_REFERENCE');
        });

        test('should not warn about valid references', () => {
            validator.checkFormulaFieldReferences('TestFormula', '{!$Record.Field__c} + 1');

            expect(validator.warnings.length).toBe(0);
        });
    });

    describe('checkLoopReferences', () => {
        test('should detect missing collection reference', () => {
            const flowXML = `<?xml version="1.0" encoding="UTF-8"?>
<Flow>
    <loops>
        <name>Loop_Records</name>
    </loops>
</Flow>`;

            const { DOMParser } = require('@xmldom/xmldom');
            const parser = new DOMParser();
            const doc = parser.parseFromString(flowXML, 'text/xml');

            validator.checkLoopReferences(doc);

            expect(validator.errors.length).toBe(1);
            expect(validator.errors[0].type).toBe('LOOP_COLLECTION');
            expect(validator.errors[0].message).toContain('missing collection reference');
        });

        test('should accept loop with collection reference', () => {
            const flowXML = `<?xml version="1.0" encoding="UTF-8"?>
<Flow>
    <loops>
        <name>Loop_Records</name>
        <collectionReference>myRecords</collectionReference>
    </loops>
</Flow>`;

            const { DOMParser } = require('@xmldom/xmldom');
            const parser = new DOMParser();
            const doc = parser.parseFromString(flowXML, 'text/xml');

            validator.checkLoopReferences(doc);

            expect(validator.errors.length).toBe(0);
        });
    });

    describe('checkDecisionLogic', () => {
        test('should warn about decision with no rules', () => {
            const flowXML = `<?xml version="1.0" encoding="UTF-8"?>
<Flow>
    <decisions>
        <name>Empty_Decision</name>
    </decisions>
</Flow>`;

            const { DOMParser } = require('@xmldom/xmldom');
            const parser = new DOMParser();
            const doc = parser.parseFromString(flowXML, 'text/xml');

            validator.checkDecisionLogic(doc);

            expect(validator.warnings.some(w => w.type === 'DECISION_LOGIC')).toBe(true);
        });

        test('should warn about decision with no default path', () => {
            const flowXML = `<?xml version="1.0" encoding="UTF-8"?>
<Flow>
    <decisions>
        <name>No_Default_Decision</name>
        <rules>
            <name>Rule1</name>
        </rules>
    </decisions>
</Flow>`;

            const { DOMParser } = require('@xmldom/xmldom');
            const parser = new DOMParser();
            const doc = parser.parseFromString(flowXML, 'text/xml');

            validator.checkDecisionLogic(doc);

            expect(validator.warnings.some(w => w.type === 'DECISION_DEFAULT')).toBe(true);
        });

        test('should accept decision with rules and default', () => {
            const flowXML = `<?xml version="1.0" encoding="UTF-8"?>
<Flow>
    <decisions>
        <name>Complete_Decision</name>
        <rules>
            <name>Rule1</name>
        </rules>
        <defaultConnector>
            <targetReference>Default_Path</targetReference>
        </defaultConnector>
    </decisions>
</Flow>`;

            const { DOMParser } = require('@xmldom/xmldom');
            const parser = new DOMParser();
            const doc = parser.parseFromString(flowXML, 'text/xml');

            validator.checkDecisionLogic(doc);

            // Only checking for decision-specific warnings (no rules / no default)
            const decisionWarnings = validator.warnings.filter(
                w => w.type === 'DECISION_LOGIC' || w.type === 'DECISION_DEFAULT'
            );
            expect(decisionWarnings.length).toBe(0);
        });
    });

    describe('checkRecordLookups', () => {
        test('should warn about lookup without filters', () => {
            const flowXML = `<?xml version="1.0" encoding="UTF-8"?>
<Flow>
    <recordLookups>
        <name>Get_Records</name>
        <object>Account</object>
    </recordLookups>
</Flow>`;

            const { DOMParser } = require('@xmldom/xmldom');
            const parser = new DOMParser();
            const doc = parser.parseFromString(flowXML, 'text/xml');

            validator.checkRecordLookups(doc);

            expect(validator.warnings.length).toBe(1);
            expect(validator.warnings[0].type).toBe('RECORD_LOOKUP');
            expect(validator.warnings[0].message).toContain('no filters');
        });

        test('should accept lookup with filters', () => {
            const flowXML = `<?xml version="1.0" encoding="UTF-8"?>
<Flow>
    <recordLookups>
        <name>Get_Records</name>
        <object>Account</object>
        <filters>
            <field>Name</field>
            <operator>EqualTo</operator>
            <value><stringValue>Test</stringValue></value>
        </filters>
    </recordLookups>
</Flow>`;

            const { DOMParser } = require('@xmldom/xmldom');
            const parser = new DOMParser();
            const doc = parser.parseFromString(flowXML, 'text/xml');

            validator.checkRecordLookups(doc);

            expect(validator.warnings.length).toBe(0);
        });
    });

    describe('findLineNumber', () => {
        test('should find correct line number', () => {
            const xml = `Line 1
Line 2
Target Line
Line 4`;

            const lineNum = validator.findLineNumber(xml, 'Target Line');

            expect(lineNum).toBe('Line 3');
        });

        test('should return Unknown for missing text', () => {
            const xml = `Line 1
Line 2`;

            const lineNum = validator.findLineNumber(xml, 'Not Found');

            expect(lineNum).toBe('Unknown');
        });
    });

    describe('generateSummary', () => {
        test('should generate success summary', () => {
            validator.errors = [];
            validator.warnings = [];
            validator.fixes = [];

            const summary = validator.generateSummary();

            expect(summary).toContain('passed');
            expect(summary).toContain('no issues');
        });

        test('should include error count', () => {
            validator.errors = [{ type: 'ERROR1' }, { type: 'ERROR2' }];
            validator.warnings = [];
            validator.fixes = [];

            const summary = validator.generateSummary();

            expect(summary).toContain('2 error(s)');
        });

        test('should include warning count', () => {
            validator.errors = [];
            validator.warnings = [{ type: 'WARN1' }];
            validator.fixes = [];

            const summary = validator.generateSummary();

            expect(summary).toContain('1 warning(s)');
        });

        test('should include fix count', () => {
            validator.errors = [{ type: 'ERROR1' }];
            validator.warnings = [];
            validator.fixes = [{ type: 'FIX1' }, { type: 'FIX2' }];

            const summary = validator.generateSummary();

            expect(summary).toContain('2 auto-fix(es)');
        });
    });

    describe('formatReport', () => {
        test('should format valid flow report', () => {
            const result = {
                flowName: 'Test_Flow',
                valid: true,
                errors: [],
                warnings: [],
                fixes: []
            };

            const report = validator.formatReport(result);

            expect(report).toContain('Test_Flow');
            expect(report).toContain('VALID');
            expect(report).toContain('Errors: 0');
            expect(report).toContain('Warnings: 0');
        });

        test('should format invalid flow report with errors', () => {
            const result = {
                flowName: 'Bad_Flow',
                valid: false,
                errors: [
                    {
                        type: 'CURRENTITEM_SYNTAX',
                        message: 'Invalid syntax',
                        details: 'Use correct format',
                        location: 'Line 10'
                    }
                ],
                warnings: [],
                fixes: []
            };

            const report = validator.formatReport(result);

            expect(report).toContain('INVALID');
            expect(report).toContain('ERRORS');
            expect(report).toContain('CURRENTITEM_SYNTAX');
            expect(report).toContain('Invalid syntax');
        });

        test('should include warnings in report', () => {
            const result = {
                flowName: 'Warning_Flow',
                valid: true,
                errors: [],
                warnings: [
                    {
                        type: 'SCREEN_UI_COMPONENT',
                        message: 'RadioButtons component',
                        recommendation: 'Verify configuration'
                    }
                ],
                fixes: []
            };

            const report = validator.formatReport(result);

            expect(report).toContain('WARNINGS');
            expect(report).toContain('RadioButtons');
            expect(report).toContain('Recommendation');
        });

        test('should include fixes in report', () => {
            const result = {
                flowName: 'Fixable_Flow',
                valid: false,
                errors: [],
                warnings: [],
                fixes: [
                    { description: 'Fix CurrentItem syntax', automated: true },
                    { description: 'Remove duplicate', automated: false }
                ]
            };

            const report = validator.formatReport(result);

            expect(report).toContain('AVAILABLE FIXES');
            expect(report).toContain('Fix CurrentItem syntax');
            expect(report).toContain('(automated)');
            expect(report).toContain('(manual)');
            expect(report).toContain('--fix');
        });
    });

    describe('applyFixes', () => {
        test('should apply automated fixes', () => {
            const flowXML = '{!$CurrentItem.Name}';
            const flowPath = '/path/to/flow.flow-meta.xml';

            fs.readFileSync.mockReturnValue(flowXML);
            fs.writeFileSync.mockImplementation(() => {});

            validator.autoFix = true;
            validator.fixes = [
                {
                    type: 'CURRENTITEM_SYNTAX',
                    description: 'Fix CurrentItem',
                    automated: true,
                    from: '$CurrentItem',
                    to: 'loopVar.CurrentItem'
                }
            ];

            validator.applyFixes(flowPath, null);

            // Should create backup
            expect(fs.writeFileSync).toHaveBeenCalledWith(
                expect.stringContaining('.bak'),
                expect.anything()
            );

            // Should write fixed content
            expect(fs.writeFileSync).toHaveBeenCalledWith(
                flowPath,
                expect.stringContaining('loopVar.CurrentItem')
            );
        });

        test('should skip non-automated fixes', () => {
            const flowXML = 'original content';
            const flowPath = '/path/to/flow.flow-meta.xml';

            fs.readFileSync.mockReturnValue(flowXML);
            fs.writeFileSync.mockImplementation(() => {});

            validator.autoFix = true;
            validator.fixes = [
                {
                    type: 'MANUAL_FIX',
                    description: 'Manual fix required',
                    automated: false
                }
            ];

            validator.applyFixes(flowPath, null);

            // Should still write files but content unchanged
            expect(fs.writeFileSync).toHaveBeenCalledWith(
                flowPath,
                'original content'
            );
        });
    });

    describe('Integration Tests', () => {
        test('should validate complete flow with multiple issues', () => {
            const flowXML = `<?xml version="1.0" encoding="UTF-8"?>
<Flow xmlns="http://soap.sforce.com/2006/04/metadata">
    <apiVersion>62.0</apiVersion>
    <loops>
        <name>Loop_Accounts</name>
    </loops>
    <formulas>
        <name>Calc_Total</name>
        <expression>IF(ISBLANK(Field__c, "Default"</expression>
    </formulas>
    <decisions>
        <name>Check_Value</name>
    </decisions>
    <recordLookups>
        <name>Get_Contacts</name>
        <object>Contact</object>
    </recordLookups>
    <screens>
        <name>Input_Screen</name>
        <fields>
            <fieldType>RadioButtons</fieldType>
        </fields>
    </screens>
</Flow>`;

            fs.existsSync.mockReturnValue(true);
            fs.readFileSync.mockReturnValue(flowXML);

            const result = validator.validateFlow('/path/to/Complex_Flow.flow-meta.xml');

            // Should detect multiple issues
            expect(result.valid).toBe(false);

            // Loop missing collection reference
            expect(result.errors.some(e => e.type === 'LOOP_COLLECTION')).toBe(true);

            // Formula unbalanced parentheses
            expect(result.errors.some(e => e.type === 'FORMULA_SYNTAX')).toBe(true);

            // Decision no rules warning
            expect(result.warnings.some(w => w.type === 'DECISION_LOGIC')).toBe(true);

            // Record lookup no filters warning
            expect(result.warnings.some(w => w.type === 'RECORD_LOOKUP')).toBe(true);

            // Screen component warning
            expect(result.warnings.some(w => w.type === 'SCREEN_UI_COMPONENT')).toBe(true);
        });

        test('should pass valid complete flow', () => {
            const flowXML = `<?xml version="1.0" encoding="UTF-8"?>
<Flow xmlns="http://soap.sforce.com/2006/04/metadata">
    <apiVersion>62.0</apiVersion>
    <assignments>
        <name>Update_Record</name>
        <assignToReference>currentItem</assignToReference>
        <assignmentItems>
            <field>Description</field>
            <value><stringValue>Updated</stringValue></value>
        </assignmentItems>
    </assignments>
    <decisions>
        <name>Check_Status</name>
        <rules>
            <name>Is_Active</name>
            <connector>
                <targetReference>Update_Record</targetReference>
            </connector>
        </rules>
        <defaultConnector>
            <targetReference>Loop_Records</targetReference>
        </defaultConnector>
    </decisions>
    <formulas>
        <name>Calculate_Value</name>
        <expression>IF(ISBLANK({!Field__c}), 0, {!Field__c})</expression>
    </formulas>
    <loops>
        <name>Loop_Records</name>
        <collectionReference>Get_Records</collectionReference>
        <connector>
            <targetReference>Update_Record</targetReference>
        </connector>
    </loops>
    <recordLookups>
        <name>Get_Records</name>
        <object>Account</object>
        <filters>
            <field>Type</field>
            <operator>EqualTo</operator>
            <value><stringValue>Customer</stringValue></value>
        </filters>
        <connector>
            <targetReference>Loop_Records</targetReference>
        </connector>
    </recordLookups>
    <start>
        <name>Start</name>
        <connector>
            <targetReference>Get_Records</targetReference>
        </connector>
    </start>
</Flow>`;

            fs.existsSync.mockReturnValue(true);
            fs.readFileSync.mockReturnValue(flowXML);

            const result = validator.validateFlow('/path/to/Valid_Complete_Flow.flow-meta.xml');

            // Should pass validation
            expect(result.valid).toBe(true);
            expect(result.errors.length).toBe(0);
        });
    });

    describe('Edge Cases', () => {
        test('should handle flow with no elements', () => {
            const flowXML = `<?xml version="1.0" encoding="UTF-8"?>
<Flow xmlns="http://soap.sforce.com/2006/04/metadata">
    <apiVersion>62.0</apiVersion>
</Flow>`;

            fs.existsSync.mockReturnValue(true);
            fs.readFileSync.mockReturnValue(flowXML);

            const result = validator.validateFlow('/path/to/Empty_Flow.flow-meta.xml');

            expect(result.valid).toBe(true);
            expect(result.errors.length).toBe(0);
        });

        test('should handle flow with special characters', () => {
            const flowXML = `<?xml version="1.0" encoding="UTF-8"?>
<Flow xmlns="http://soap.sforce.com/2006/04/metadata">
    <formulas>
        <name>Special_Formula</name>
        <expression>IF({!Field__c} &gt; 100, "High", "Low")</expression>
    </formulas>
</Flow>`;

            fs.existsSync.mockReturnValue(true);
            fs.readFileSync.mockReturnValue(flowXML);

            const result = validator.validateFlow('/path/to/Special_Flow.flow-meta.xml');

            expect(result.valid).toBe(true);
        });

        test('should handle multiple loops correctly', () => {
            const flowXML = `<?xml version="1.0" encoding="UTF-8"?>
<Flow>
    <loops>
        <name>Loop_1</name>
        <collectionReference>collection1</collectionReference>
    </loops>
    <loops>
        <name>Loop_2</name>
    </loops>
</Flow>`;

            const { DOMParser } = require('@xmldom/xmldom');
            const parser = new DOMParser();
            const doc = parser.parseFromString(flowXML, 'text/xml');

            validator.checkLoopReferences(doc);

            // Only one loop missing collection reference
            expect(validator.errors.length).toBe(1);
            expect(validator.errors[0].message).toContain('Loop_2');
        });

        test('should handle whitespace-only file', () => {
            fs.existsSync.mockReturnValue(true);
            fs.readFileSync.mockReturnValue('   \n\t\n   ');

            const result = validator.validateFlow('/path/to/whitespace.flow-meta.xml');

            expect(result.valid).toBe(false);
            expect(result.errors.some(e => e.type === 'EMPTY_FILE')).toBe(true);
        });
    });
});
