/**
 * Test Suite: Flow Trigger Validator
 *
 * Tests validation of record-triggered flow registration in Salesforce.
 * Detects AutoLaunchedFlow misregistration that prevents trigger execution.
 *
 * Coverage Target: >80%
 * Priority: Tier 2 (High-Impact Validator)
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Mock dependencies
jest.mock('child_process', () => ({
  execSync: jest.fn()
}));

const FlowTriggerValidator = require('../scripts/lib/flow-trigger-validator');

describe('FlowTriggerValidator', () => {
  let tempDir;
  const mockExecSync = require('child_process').execSync;

  beforeEach(() => {
    jest.clearAllMocks();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-trigger-test-'));
    // Suppress console output during tests
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    jest.restoreAllMocks();
  });

  describe('Constructor', () => {
    it('should initialize with org alias', () => {
      const validator = new FlowTriggerValidator('test-org');
      assert.strictEqual(validator.orgAlias, 'test-org');
    });
  });

  describe('parseFlowMetadata()', () => {
    let validator;

    beforeEach(() => {
      validator = new FlowTriggerValidator('test-org');
    });

    it('should parse record-triggered flow metadata', async () => {
      const flowXml = `<?xml version="1.0" encoding="UTF-8"?>
<Flow xmlns="http://soap.sforce.com/2006/04/metadata">
  <label>Account Trigger Flow</label>
  <start>
    <triggerType>RecordAfterSave</triggerType>
    <recordTriggerType>Create</recordTriggerType>
    <object>Account</object>
  </start>
</Flow>`;

      const flowFile = path.join(tempDir, 'TestFlow.flow-meta.xml');
      fs.writeFileSync(flowFile, flowXml);

      const result = await validator.parseFlowMetadata(flowFile);

      assert.strictEqual(result.isRecordTriggered, true);
      assert.strictEqual(result.triggerType, 'RecordAfterSave');
      assert.strictEqual(result.recordTriggerType, 'Create');
      assert.strictEqual(result.object, 'Account');
    });

    it('should identify non-record-triggered flows', async () => {
      const flowXml = `<?xml version="1.0" encoding="UTF-8"?>
<Flow xmlns="http://soap.sforce.com/2006/04/metadata">
  <label>Screen Flow</label>
  <start>
    <connector>
      <targetReference>Screen1</targetReference>
    </connector>
  </start>
</Flow>`;

      const flowFile = path.join(tempDir, 'ScreenFlow.flow-meta.xml');
      fs.writeFileSync(flowFile, flowXml);

      const result = await validator.parseFlowMetadata(flowFile);

      assert.strictEqual(result.isRecordTriggered, false);
      assert.strictEqual(result.triggerType, undefined);
    });

    it('should handle flow with no start element', async () => {
      const flowXml = `<?xml version="1.0" encoding="UTF-8"?>
<Flow xmlns="http://soap.sforce.com/2006/04/metadata">
  <label>Empty Flow</label>
</Flow>`;

      const flowFile = path.join(tempDir, 'EmptyFlow.flow-meta.xml');
      fs.writeFileSync(flowFile, flowXml);

      const result = await validator.parseFlowMetadata(flowFile);

      assert.strictEqual(result.isRecordTriggered, false);
      assert.strictEqual(result.triggerType, null);
    });

    it('should extract master label from flow', async () => {
      const flowXml = `<?xml version="1.0" encoding="UTF-8"?>
<Flow xmlns="http://soap.sforce.com/2006/04/metadata">
  <label>My Custom Label</label>
  <start>
    <triggerType>RecordAfterSave</triggerType>
    <recordTriggerType>Update</recordTriggerType>
    <object>Contact</object>
  </start>
</Flow>`;

      const flowFile = path.join(tempDir, 'LabeledFlow.flow-meta.xml');
      fs.writeFileSync(flowFile, flowXml);

      const result = await validator.parseFlowMetadata(flowFile);

      assert.strictEqual(result.masterLabel, 'My Custom Label');
    });

    it('should use filename as label when label element missing', async () => {
      const flowXml = `<?xml version="1.0" encoding="UTF-8"?>
<Flow xmlns="http://soap.sforce.com/2006/04/metadata">
  <start>
    <triggerType>RecordBeforeSave</triggerType>
    <recordTriggerType>Create</recordTriggerType>
    <object>Opportunity</object>
  </start>
</Flow>`;

      const flowFile = path.join(tempDir, 'NoLabel.flow-meta.xml');
      fs.writeFileSync(flowFile, flowXml);

      const result = await validator.parseFlowMetadata(flowFile);

      assert.strictEqual(result.masterLabel, 'NoLabel');
    });

    it('should throw error for invalid XML', async () => {
      const flowFile = path.join(tempDir, 'Invalid.flow-meta.xml');
      fs.writeFileSync(flowFile, 'not valid xml');

      await assert.rejects(
        async () => validator.parseFlowMetadata(flowFile),
        /Failed to parse flow metadata/
      );
    });

    it('should throw error for missing Flow element', async () => {
      const flowXml = `<?xml version="1.0" encoding="UTF-8"?>
<SomethingElse xmlns="http://soap.sforce.com/2006/04/metadata">
  <label>Not a Flow</label>
</SomethingElse>`;

      const flowFile = path.join(tempDir, 'NotFlow.flow-meta.xml');
      fs.writeFileSync(flowFile, flowXml);

      await assert.rejects(
        async () => validator.parseFlowMetadata(flowFile),
        /Invalid flow metadata XML/
      );
    });

    it('should throw error for missing file', async () => {
      await assert.rejects(
        async () => validator.parseFlowMetadata('/nonexistent/file.flow-meta.xml'),
        /Failed to parse flow metadata/
      );
    });
  });

  describe('queryFlowRegistration()', () => {
    let validator;

    beforeEach(() => {
      validator = new FlowTriggerValidator('test-org');
    });

    it('should return flow registration details', () => {
      mockExecSync.mockReturnValue(JSON.stringify({
        status: 0,
        result: {
          records: [{
            Id: '301xxx',
            Definition: { DeveloperName: 'TestFlow' },
            MasterLabel: 'Test Flow Label',
            VersionNumber: 3,
            Status: 'Active',
            ProcessType: 'Workflow'
          }]
        }
      }));

      const result = validator.queryFlowRegistration('TestFlow');

      assert.ok(result);
      assert.strictEqual(result.id, '301xxx');
      assert.strictEqual(result.developerName, 'TestFlow');
      assert.strictEqual(result.masterLabel, 'Test Flow Label');
      assert.strictEqual(result.versionNumber, 3);
      assert.strictEqual(result.status, 'Active');
      assert.strictEqual(result.processType, 'Workflow');
    });

    it('should return null when flow not found', () => {
      mockExecSync.mockReturnValue(JSON.stringify({
        status: 0,
        result: {
          records: []
        }
      }));

      const result = validator.queryFlowRegistration('NonExistent');

      assert.strictEqual(result, null);
    });

    it('should throw error on query failure', () => {
      mockExecSync.mockReturnValue(JSON.stringify({
        status: 1,
        message: 'Query failed'
      }));

      assert.throws(
        () => validator.queryFlowRegistration('TestFlow'),
        /Failed to query flow/
      );
    });

    it('should handle execSync errors', () => {
      mockExecSync.mockImplementation(() => {
        throw new Error('Connection refused');
      });

      assert.throws(
        () => validator.queryFlowRegistration('TestFlow'),
        /Failed to query flow/
      );
    });
  });

  describe('validate()', () => {
    let validator;

    beforeEach(() => {
      validator = new FlowTriggerValidator('test-org');
    });

    it('should pass for non-record-triggered flow', async () => {
      const flowXml = `<?xml version="1.0" encoding="UTF-8"?>
<Flow xmlns="http://soap.sforce.com/2006/04/metadata">
  <label>Screen Flow</label>
  <start>
    <connector>
      <targetReference>Screen1</targetReference>
    </connector>
  </start>
</Flow>`;

      const flowFile = path.join(tempDir, 'ScreenFlow.flow-meta.xml');
      fs.writeFileSync(flowFile, flowXml);

      const result = await validator.validate(flowFile);

      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.reason, 'not-record-triggered');
    });

    it('should return warning when flow not deployed', async () => {
      const flowXml = `<?xml version="1.0" encoding="UTF-8"?>
<Flow xmlns="http://soap.sforce.com/2006/04/metadata">
  <label>New Flow</label>
  <start>
    <triggerType>RecordAfterSave</triggerType>
    <recordTriggerType>Create</recordTriggerType>
    <object>Account</object>
  </start>
</Flow>`;

      const flowFile = path.join(tempDir, 'NewFlow.flow-meta.xml');
      fs.writeFileSync(flowFile, flowXml);

      mockExecSync.mockReturnValue(JSON.stringify({
        status: 0,
        result: { records: [] }
      }));

      const result = await validator.validate(flowFile);

      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.reason, 'not-deployed');
      assert.strictEqual(result.warning, true);
    });

    it('should fail when flow registered as AutoLaunchedFlow', async () => {
      const flowXml = `<?xml version="1.0" encoding="UTF-8"?>
<Flow xmlns="http://soap.sforce.com/2006/04/metadata">
  <label>Broken Flow</label>
  <start>
    <triggerType>RecordAfterSave</triggerType>
    <recordTriggerType>Create</recordTriggerType>
    <object>Account</object>
  </start>
</Flow>`;

      const flowFile = path.join(tempDir, 'BrokenFlow.flow-meta.xml');
      fs.writeFileSync(flowFile, flowXml);

      mockExecSync.mockReturnValue(JSON.stringify({
        status: 0,
        result: {
          records: [{
            Id: '301xxx',
            Definition: { DeveloperName: 'BrokenFlow' },
            MasterLabel: 'Broken Flow',
            VersionNumber: 1,
            Status: 'Active',
            ProcessType: 'AutoLaunchedFlow'
          }]
        }
      }));

      const result = await validator.validate(flowFile);

      assert.strictEqual(result.valid, false);
      assert.strictEqual(result.reason, 'process-type-mismatch');
      assert.strictEqual(result.actual, 'AutoLaunchedFlow');
    });

    it('should pass when flow correctly registered as Workflow', async () => {
      const flowXml = `<?xml version="1.0" encoding="UTF-8"?>
<Flow xmlns="http://soap.sforce.com/2006/04/metadata">
  <label>Correct Flow</label>
  <start>
    <triggerType>RecordAfterSave</triggerType>
    <recordTriggerType>Create</recordTriggerType>
    <object>Account</object>
  </start>
</Flow>`;

      const flowFile = path.join(tempDir, 'CorrectFlow.flow-meta.xml');
      fs.writeFileSync(flowFile, flowXml);

      mockExecSync.mockReturnValue(JSON.stringify({
        status: 0,
        result: {
          records: [{
            Id: '301xxx',
            Definition: { DeveloperName: 'CorrectFlow' },
            MasterLabel: 'Correct Flow',
            VersionNumber: 1,
            Status: 'Active',
            ProcessType: 'Workflow'
          }]
        }
      }));

      const result = await validator.validate(flowFile);

      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.reason, 'correct-registration');
      assert.strictEqual(result.processType, 'Workflow');
    });

    it('should pass for Flow processType', async () => {
      const flowXml = `<?xml version="1.0" encoding="UTF-8"?>
<Flow xmlns="http://soap.sforce.com/2006/04/metadata">
  <label>Flow Type Flow</label>
  <start>
    <triggerType>RecordBeforeSave</triggerType>
    <recordTriggerType>Update</recordTriggerType>
    <object>Contact</object>
  </start>
</Flow>`;

      const flowFile = path.join(tempDir, 'FlowTypeFlow.flow-meta.xml');
      fs.writeFileSync(flowFile, flowXml);

      mockExecSync.mockReturnValue(JSON.stringify({
        status: 0,
        result: {
          records: [{
            Id: '301xxx',
            Definition: { DeveloperName: 'FlowTypeFlow' },
            MasterLabel: 'Flow Type Flow',
            VersionNumber: 1,
            Status: 'Active',
            ProcessType: 'Flow'
          }]
        }
      }));

      const result = await validator.validate(flowFile);

      assert.strictEqual(result.valid, true);
    });

    it('should extract flow name from filename', async () => {
      const flowXml = `<?xml version="1.0" encoding="UTF-8"?>
<Flow xmlns="http://soap.sforce.com/2006/04/metadata">
  <label>Test</label>
  <start>
    <triggerType>RecordAfterSave</triggerType>
    <recordTriggerType>Create</recordTriggerType>
    <object>Lead</object>
  </start>
</Flow>`;

      const flowFile = path.join(tempDir, 'My_Custom_Flow.flow-meta.xml');
      fs.writeFileSync(flowFile, flowXml);

      mockExecSync.mockReturnValue(JSON.stringify({
        status: 0,
        result: { records: [] }
      }));

      await validator.validate(flowFile);

      // Verify the query was called with correct flow name
      const callArg = mockExecSync.mock.calls[0][0];
      assert.ok(callArg.includes('My_Custom_Flow'));
    });
  });

  describe('Different Trigger Types', () => {
    let validator;

    beforeEach(() => {
      validator = new FlowTriggerValidator('test-org');
    });

    it('should recognize RecordBeforeSave trigger', async () => {
      const flowXml = `<?xml version="1.0" encoding="UTF-8"?>
<Flow xmlns="http://soap.sforce.com/2006/04/metadata">
  <label>Before Save Flow</label>
  <start>
    <triggerType>RecordBeforeSave</triggerType>
    <recordTriggerType>CreateAndUpdate</recordTriggerType>
    <object>Case</object>
  </start>
</Flow>`;

      const flowFile = path.join(tempDir, 'BeforeSave.flow-meta.xml');
      fs.writeFileSync(flowFile, flowXml);

      const result = await validator.parseFlowMetadata(flowFile);

      assert.strictEqual(result.isRecordTriggered, true);
      assert.strictEqual(result.triggerType, 'RecordBeforeSave');
      assert.strictEqual(result.recordTriggerType, 'CreateAndUpdate');
    });

    it('should recognize RecordBeforeDelete trigger', async () => {
      const flowXml = `<?xml version="1.0" encoding="UTF-8"?>
<Flow xmlns="http://soap.sforce.com/2006/04/metadata">
  <label>Before Delete Flow</label>
  <start>
    <triggerType>RecordBeforeDelete</triggerType>
    <recordTriggerType>Delete</recordTriggerType>
    <object>Task</object>
  </start>
</Flow>`;

      const flowFile = path.join(tempDir, 'BeforeDelete.flow-meta.xml');
      fs.writeFileSync(flowFile, flowXml);

      const result = await validator.parseFlowMetadata(flowFile);

      assert.strictEqual(result.isRecordTriggered, true);
      assert.strictEqual(result.triggerType, 'RecordBeforeDelete');
    });
  });
});
