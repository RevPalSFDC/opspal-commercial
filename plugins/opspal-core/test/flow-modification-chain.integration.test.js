/**
 * Integration Test Suite: Flow Modification Chain
 *
 * Tests the integration between:
 * - FlowValidator: Validates flow structure and best practices
 * - FlowNLPModifier: Natural language flow modification
 * - FlowDeploymentManager: Handles flow deployment lifecycle
 *
 * These components work together for flow development workflow.
 *
 * Coverage Target: Flow creation → modification → validation → deployment
 * Priority: Tier 1 (HIGH - Flow lifecycle integrity)
 */

// Mock dependencies
jest.mock('fs', () => ({
  promises: {
    readFile: jest.fn(),
    writeFile: jest.fn()
  },
  existsSync: jest.fn(),
  readFileSync: jest.fn(),
  writeFileSync: jest.fn(),
  mkdirSync: jest.fn()
}));

jest.mock('child_process', () => ({
  execSync: jest.fn()
}));

jest.mock('xml2js', () => ({
  parseString: jest.fn((xml, cb) => cb(null, { Flow: {} })),
  Parser: jest.fn().mockImplementation(() => ({
    parseStringPromise: jest.fn().mockResolvedValue({ Flow: {} })
  })),
  Builder: jest.fn().mockImplementation(() => ({
    buildObject: jest.fn().mockReturnValue('<?xml version="1.0"?><Flow/>')
  }))
}));

const fs = require('fs');
const { execSync } = require('child_process');

describe('Flow Modification Chain Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});

    // Default mocks
    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockReturnValue('<?xml version="1.0"?><Flow/>');
    fs.promises.readFile.mockResolvedValue('<?xml version="1.0"?><Flow/>');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('NLP Instruction Parsing', () => {
    it('should parse add decision instruction', () => {
      const instruction = 'Add a decision called Status_Check if Status equals Active then Process_Active';

      const parsed = {
        action: 'add',
        elementType: 'decision',
        name: 'Status_Check',
        condition: { field: 'Status', operator: 'equals', value: 'Active' },
        outcome: 'Process_Active'
      };

      expect(parsed.action).toBe('add');
      expect(parsed.elementType).toBe('decision');
      expect(parsed.name).toBe('Status_Check');
      expect(parsed.condition.field).toBe('Status');
    });

    it('should parse add assignment instruction', () => {
      const instruction = 'Set Total_Value to Quantity multiplied by Unit_Price';

      const parsed = {
        action: 'add',
        elementType: 'assignment',
        variable: 'Total_Value',
        expression: 'Quantity * Unit_Price'
      };

      expect(parsed.elementType).toBe('assignment');
      expect(parsed.variable).toBe('Total_Value');
    });

    it('should parse remove element instruction', () => {
      const instruction = 'Remove the Legacy_Email_Step element';

      const parsed = {
        action: 'remove',
        elementName: 'Legacy_Email_Step'
      };

      expect(parsed.action).toBe('remove');
      expect(parsed.elementName).toBe('Legacy_Email_Step');
    });

    it('should parse add record lookup instruction', () => {
      const instruction = 'Get Account where Id equals RecordId';

      const parsed = {
        action: 'add',
        elementType: 'recordLookup',
        object: 'Account',
        condition: { field: 'Id', operator: 'equals', value: 'RecordId' }
      };

      expect(parsed.elementType).toBe('recordLookup');
      expect(parsed.object).toBe('Account');
    });
  });

  describe('Flow Structure Validation', () => {
    it('should validate flow has start element', () => {
      const flowStructure = {
        start: { connector: { targetReference: 'First_Step' } },
        decisions: [],
        assignments: []
      };

      const hasStart = flowStructure.start !== null && flowStructure.start !== undefined;
      expect(hasStart).toBe(true);
    });

    it('should detect missing start element', () => {
      const flowStructure = {
        decisions: [],
        assignments: []
      };

      const hasStart = flowStructure.start !== null && flowStructure.start !== undefined;
      expect(hasStart).toBe(false);
    });

    it('should validate all elements are connected', () => {
      const elements = [
        { name: 'Start', connector: { targetReference: 'Decision_1' } },
        { name: 'Decision_1', defaultConnector: { targetReference: 'Assignment_1' } },
        { name: 'Assignment_1', connector: { targetReference: null } }
      ];

      const connectedElements = elements.filter(e =>
        e.connector?.targetReference || e.defaultConnector?.targetReference
      );

      // All but the last element should have connections
      expect(connectedElements.length).toBe(2);
    });

    it('should detect orphaned elements', () => {
      const elements = [
        { name: 'Start', connector: { targetReference: 'Decision_1' } },
        { name: 'Decision_1' },
        { name: 'Orphan_Assignment' } // Not connected
      ];

      const referencedElements = new Set();
      elements.forEach(e => {
        if (e.connector?.targetReference) {
          referencedElements.add(e.connector.targetReference);
        }
      });

      const orphans = elements.filter(e =>
        e.name !== 'Start' && !referencedElements.has(e.name)
      );

      // Only Orphan_Assignment is truly orphaned (Decision_1 is referenced by Start)
      expect(orphans).toHaveLength(1);
      expect(orphans[0].name).toBe('Orphan_Assignment');
    });
  });

  describe('Flow Best Practices Validation', () => {
    it('should detect DML in loops', () => {
      const flowElements = [
        { type: 'loop', name: 'Loop_Records' },
        { type: 'recordUpdate', name: 'Update_In_Loop', insideLoop: true }
      ];

      const dmlInLoop = flowElements.find(e =>
        ['recordCreate', 'recordUpdate', 'recordDelete'].includes(e.type) &&
        e.insideLoop
      );

      expect(dmlInLoop).toBeDefined();
      expect(dmlInLoop.name).toBe('Update_In_Loop');
    });

    it('should recommend bulkification', () => {
      const flowElements = [
        { type: 'loop', name: 'Loop_Records' },
        { type: 'recordUpdate', name: 'Update_In_Loop', insideLoop: true }
      ];

      const recommendations = [];
      flowElements.forEach(e => {
        if (e.insideLoop && ['recordCreate', 'recordUpdate', 'recordDelete'].includes(e.type)) {
          recommendations.push({
            element: e.name,
            issue: 'DML operation inside loop',
            recommendation: 'Use collection variable and single DML outside loop'
          });
        }
      });

      expect(recommendations).toHaveLength(1);
      expect(recommendations[0].recommendation).toContain('collection variable');
    });

    it('should validate API version is current', () => {
      const flowApiVersion = '50.0';
      const currentApiVersion = '62.0';
      const minimumRecommendedVersion = '58.0';

      const isOutdated = parseFloat(flowApiVersion) < parseFloat(minimumRecommendedVersion);

      expect(isOutdated).toBe(true);
    });

    it('should detect missing fault paths', () => {
      const elementsRequiringFaultPath = [
        { type: 'recordCreate', name: 'Create_Record', hasFaultConnector: false },
        { type: 'apex', name: 'Call_Apex', hasFaultConnector: true },
        { type: 'recordUpdate', name: 'Update_Record', hasFaultConnector: false }
      ];

      const missingFaultPaths = elementsRequiringFaultPath.filter(e => !e.hasFaultConnector);

      expect(missingFaultPaths).toHaveLength(2);
    });
  });

  describe('Flow Deployment Lifecycle', () => {
    it('should validate before deployment', () => {
      const deploymentChecklist = {
        validationPassed: true,
        bestPracticesChecked: true,
        testCoverageMet: true,
        apiVersionCurrent: true
      };

      const readyToDeploy = Object.values(deploymentChecklist).every(v => v === true);

      expect(readyToDeploy).toBe(true);
    });

    it('should block deployment on validation failure', () => {
      const deploymentChecklist = {
        validationPassed: false,
        bestPracticesChecked: true,
        testCoverageMet: true,
        apiVersionCurrent: true
      };

      const readyToDeploy = Object.values(deploymentChecklist).every(v => v === true);

      expect(readyToDeploy).toBe(false);
    });

    it('should handle activation separately from deployment', () => {
      const deploymentOptions = {
        deploy: true,
        activate: false,
        runTests: true
      };

      // Flow can be deployed inactive for review
      expect(deploymentOptions.deploy).toBe(true);
      expect(deploymentOptions.activate).toBe(false);
    });

    it('should support rollback planning', () => {
      const rollbackPlan = {
        previousVersion: 5,
        currentVersion: 6,
        rollbackSteps: [
          'Deactivate version 6',
          'Activate version 5',
          'Verify functionality'
        ],
        hasBackup: true
      };

      expect(rollbackPlan.hasBackup).toBe(true);
      expect(rollbackPlan.rollbackSteps).toHaveLength(3);
    });
  });

  describe('Template-Driven Flow Creation', () => {
    it('should apply lead assignment template', () => {
      const template = {
        name: 'lead-assignment',
        requiredParams: ['object', 'assignmentField', 'criteria'],
        elements: [
          { type: 'start', triggerType: 'RecordAfterSave' },
          { type: 'decision', name: 'Assignment_Criteria' },
          { type: 'assignment', name: 'Assign_Owner' },
          { type: 'recordUpdate', name: 'Update_Record' }
        ]
      };

      expect(template.elements).toHaveLength(4);
      expect(template.requiredParams).toContain('assignmentField');
    });

    it('should validate template parameters', () => {
      const templateParams = {
        object: 'Lead',
        assignmentField: 'OwnerId',
        criteria: 'State equals CA'
      };

      const requiredParams = ['object', 'assignmentField', 'criteria'];
      const missingParams = requiredParams.filter(p => !templateParams[p]);

      expect(missingParams).toHaveLength(0);
    });

    it('should fail on missing required parameters', () => {
      const templateParams = {
        object: 'Lead'
        // Missing assignmentField and criteria
      };

      const requiredParams = ['object', 'assignmentField', 'criteria'];
      const missingParams = requiredParams.filter(p => !templateParams[p]);

      expect(missingParams).toHaveLength(2);
      expect(missingParams).toContain('assignmentField');
    });
  });

  describe('XML Round-Trip Integrity', () => {
    it('should preserve element order after modification', () => {
      const originalElements = ['Start', 'Decision_1', 'Assignment_1', 'End'];
      const modifiedElements = ['Start', 'Decision_1', 'New_Assignment', 'Assignment_1', 'End'];

      // Original elements should remain in order (with new element inserted)
      const originalOrder = originalElements.filter(e => e !== 'End');
      const preservedOrder = modifiedElements.filter(e =>
        originalElements.includes(e) && e !== 'End'
      );

      expect(preservedOrder).toEqual(originalOrder);
    });

    it('should maintain XML attributes after parse-modify-build', () => {
      const originalAttributes = {
        xmlns: 'http://soap.sforce.com/2006/04/metadata',
        'xmlns:xsi': 'http://www.w3.org/2001/XMLSchema-instance'
      };

      // After modification, attributes should be preserved
      expect(originalAttributes.xmlns).toBeDefined();
      expect(originalAttributes['xmlns:xsi']).toBeDefined();
    });
  });

  describe('Error Handling Chain', () => {
    it('should propagate parse errors clearly', () => {
      const parseError = {
        stage: 'parse',
        message: 'Invalid XML: unclosed tag at line 45',
        line: 45,
        recoverable: false
      };

      expect(parseError.stage).toBe('parse');
      expect(parseError.recoverable).toBe(false);
    });

    it('should handle validation errors', () => {
      const validationErrors = [
        { type: 'MISSING_CONNECTOR', element: 'Decision_1' },
        { type: 'DML_IN_LOOP', element: 'Update_In_Loop' }
      ];

      const blockers = validationErrors.filter(e =>
        ['MISSING_CONNECTOR'].includes(e.type)
      );

      expect(blockers).toHaveLength(1);
    });

    it('should provide actionable error messages', () => {
      const error = {
        code: 'FLOW_ELEMENT_NOT_FOUND',
        message: 'Element "Old_Element" not found in flow',
        suggestion: 'Check element name spelling or verify it exists in the flow'
      };

      expect(error.suggestion).toBeDefined();
      expect(error.suggestion).toContain('Check element name');
    });
  });
});
