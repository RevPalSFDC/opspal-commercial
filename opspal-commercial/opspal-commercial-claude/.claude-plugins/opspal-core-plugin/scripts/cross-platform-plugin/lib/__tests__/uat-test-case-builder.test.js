/**
 * UAT Test Case Builder Tests
 *
 * Unit tests for the question-based test case builder.
 * Coverage target: 85%+ (pure functions, well-defined inputs/outputs)
 */

const path = require('path');
const fs = require('fs');
const UATTestCaseBuilder = require('../uat-test-case-builder');
const {
  QuestionPhase,
  ACTION_OPTIONS,
  EXPECTED_OUTCOMES,
  SALESFORCE_OBJECTS,
  HUBSPOT_OBJECTS
} = require('../uat-test-case-builder');

describe('UATTestCaseBuilder', () => {
  let builder;

  beforeEach(() => {
    builder = new UATTestCaseBuilder();
  });

  describe('constructor', () => {
    it('should initialize with default options', () => {
      expect(builder.platform).toBe('salesforce');
      expect(builder.verbose).toBe(false);
      expect(builder.steps).toEqual([]);
      expect(builder.epic).toBe('');
    });

    it('should accept custom options', () => {
      const customBuilder = new UATTestCaseBuilder({
        platform: 'hubspot',
        verbose: true
      });
      expect(customBuilder.platform).toBe('hubspot');
      expect(customBuilder.verbose).toBe(true);
    });
  });

  describe('getObjectOptions()', () => {
    it('should return Salesforce objects by default', () => {
      const options = builder.getObjectOptions();
      expect(options).toBe(SALESFORCE_OBJECTS);
      expect(options.some(o => o.label === 'Account')).toBe(true);
      expect(options.some(o => o.label === 'Quote (CPQ)')).toBe(true);
    });

    it('should return HubSpot objects when platform is hubspot', () => {
      builder.platform = 'hubspot';
      const options = builder.getObjectOptions();
      expect(options).toBe(HUBSPOT_OBJECTS);
      expect(options.some(o => o.label === 'Company')).toBe(true);
      expect(options.some(o => o.label === 'Deal')).toBe(true);
    });
  });

  describe('getInitialQuestions()', () => {
    it('should return questions with correct structure', () => {
      const result = builder.getInitialQuestions();
      expect(result.questions).toBeDefined();
      expect(result.questions.length).toBe(2);
    });

    it('should include Epic question', () => {
      const result = builder.getInitialQuestions();
      const epicQuestion = result.questions.find(q => q.header === 'Epic');
      expect(epicQuestion).toBeDefined();
      expect(epicQuestion.options.length).toBeGreaterThan(0);
      expect(epicQuestion.multiSelect).toBe(false);
    });

    it('should include Platform question', () => {
      const result = builder.getInitialQuestions();
      const platformQuestion = result.questions.find(q => q.header === 'Platform');
      expect(platformQuestion).toBeDefined();
      expect(platformQuestion.options.some(o => o.label === 'Salesforce')).toBe(true);
      expect(platformQuestion.options.some(o => o.label === 'HubSpot')).toBe(true);
    });
  });

  describe('getStepQuestions()', () => {
    it('should include step number in question', () => {
      const result = builder.getStepQuestions(3);
      expect(result.questions[0].question).toContain('Step 3');
    });

    it('should have Action, Object, and Expected questions', () => {
      const result = builder.getStepQuestions(1);
      const headers = result.questions.map(q => q.header);
      expect(headers).toContain('Action');
      expect(headers).toContain('Object');
      expect(headers).toContain('Expected');
    });

    it('should include platform-specific objects for HubSpot', () => {
      builder.platform = 'hubspot';
      const result = builder.getStepQuestions(1);
      const objectQuestion = result.questions.find(q => q.header === 'Object');
      expect(objectQuestion.question).toContain('HubSpot');
    });
  });

  describe('getPreconditionQuestion()', () => {
    it('should return precondition question', () => {
      const result = builder.getPreconditionQuestion();
      expect(result.questions.length).toBe(1);
      expect(result.questions[0].header).toBe('Precondition');
    });

    it('should include None option', () => {
      const result = builder.getPreconditionQuestion();
      expect(result.questions[0].options.some(o => o.label === 'None')).toBe(true);
    });
  });

  describe('getAddMoreStepsQuestion()', () => {
    it('should include current step count', () => {
      builder.steps = [{}, {}, {}];
      const result = builder.getAddMoreStepsQuestion();
      expect(result.questions[0].question).toContain('3 step(s)');
    });
  });

  describe('processInitialAnswers()', () => {
    it('should set epic from answer', () => {
      builder.processInitialAnswers({ Epic: 'CPQ Workflow', Platform: 'Salesforce' });
      expect(builder.epic).toBe('CPQ Workflow');
    });

    it('should handle Custom epic', () => {
      builder.processInitialAnswers({ Epic: 'Custom', Other: 'My Custom Epic', Platform: 'Salesforce' });
      expect(builder.epic).toBe('My Custom Epic');
    });

    it('should set platform', () => {
      builder.processInitialAnswers({ Epic: 'Test', Platform: 'HubSpot' });
      expect(builder.platform).toBe('hubspot');
    });

    it('should return this for chaining', () => {
      const result = builder.processInitialAnswers({ Epic: 'Test', Platform: 'Salesforce' });
      expect(result).toBe(builder);
    });
  });

  describe('setUserStory()', () => {
    it('should set user story', () => {
      builder.setUserStory('As a user, I want to do something');
      expect(builder.userStory).toBe('As a user, I want to do something');
    });

    it('should return this for chaining', () => {
      const result = builder.setUserStory('Test');
      expect(result).toBe(builder);
    });
  });

  describe('setAcceptanceCriteria()', () => {
    it('should set acceptance criteria', () => {
      builder.setAcceptanceCriteria('Given X, When Y, Then Z');
      expect(builder.acceptanceCriteria).toBe('Given X, When Y, Then Z');
    });

    it('should return this for chaining', () => {
      const result = builder.setAcceptanceCriteria('Test');
      expect(result).toBe(builder);
    });
  });

  describe('normalizeAction()', () => {
    it('should map Create Record to create', () => {
      expect(builder.normalizeAction('Create Record')).toBe('create');
    });

    it('should map Update Record to update', () => {
      expect(builder.normalizeAction('Update Record')).toBe('update');
    });

    it('should map Verify Field to verify', () => {
      expect(builder.normalizeAction('Verify Field')).toBe('verify');
    });

    it('should map Navigate to navigate', () => {
      expect(builder.normalizeAction('Navigate')).toBe('navigate');
    });

    it('should map Submit for Approval to submit_approval', () => {
      expect(builder.normalizeAction('Submit for Approval')).toBe('submit_approval');
    });

    it('should return manual for unknown actions', () => {
      expect(builder.normalizeAction('Unknown Action')).toBe('manual');
    });
  });

  describe('normalizeObject()', () => {
    it('should map Quote (CPQ) to SBQQ__Quote__c', () => {
      expect(builder.normalizeObject('Quote (CPQ)')).toBe('SBQQ__Quote__c');
    });

    it('should map Quote Line to SBQQ__QuoteLine__c', () => {
      expect(builder.normalizeObject('Quote Line')).toBe('SBQQ__QuoteLine__c');
    });

    it('should pass through standard objects', () => {
      expect(builder.normalizeObject('Account')).toBe('Account');
      expect(builder.normalizeObject('Opportunity')).toBe('Opportunity');
    });

    it('should pass through unknown objects', () => {
      expect(builder.normalizeObject('CustomObject__c')).toBe('CustomObject__c');
    });
  });

  describe('normalizeExpectedOutcome()', () => {
    it('should return success type for Success', () => {
      const result = builder.normalizeExpectedOutcome('Success');
      expect(result.type).toBe('success');
    });

    it('should return blocked type for Action blocked', () => {
      const result = builder.normalizeExpectedOutcome('Action blocked');
      expect(result.type).toBe('blocked');
    });

    it('should return custom type for unknown outcomes', () => {
      const result = builder.normalizeExpectedOutcome('Custom outcome');
      expect(result.type).toBe('custom');
      expect(result.message).toBe('Custom outcome');
    });
  });

  describe('buildStepFromAnswers()', () => {
    it('should build step with correct action', () => {
      const step = builder.buildStepFromAnswers({
        Action: 'Create Record',
        Object: 'Account',
        Expected: 'Success'
      });
      expect(step.action).toBe('create');
    });

    it('should build step with correct object', () => {
      const step = builder.buildStepFromAnswers({
        Action: 'Create Record',
        Object: 'Quote (CPQ)',
        Expected: 'Success'
      });
      expect(step.object).toBe('SBQQ__Quote__c');
    });

    it('should generate raw text', () => {
      const step = builder.buildStepFromAnswers({
        Action: 'Navigate',
        Object: 'Account',
        Expected: 'Success'
      });
      expect(step.raw).toBe('From Account');
    });

    it('should set step number based on existing steps', () => {
      builder.steps = [{}, {}];
      const step = builder.buildStepFromAnswers({
        Action: 'Create Record',
        Object: 'Account',
        Expected: 'Success'
      });
      expect(step.stepNumber).toBe(3);
    });
  });

  describe('addPreconditionToLastStep()', () => {
    beforeEach(() => {
      builder.addStep({ stepNumber: 1, action: 'create' });
    });

    it('should add stage precondition', () => {
      builder.addPreconditionToLastStep('After Qualification');
      expect(builder.steps[0].precondition).toEqual({ stage: 'Qualification' });
    });

    it('should not add precondition for None', () => {
      builder.addPreconditionToLastStep('None');
      expect(builder.steps[0].precondition).toBeUndefined();
    });

    it('should handle Primary Quote precondition', () => {
      builder.addPreconditionToLastStep('Primary Quote exists');
      expect(builder.steps[0].precondition).toEqual({ requires: 'primaryQuote' });
    });

    it('should handle custom precondition', () => {
      builder.addPreconditionToLastStep('Custom precondition');
      expect(builder.steps[0].precondition).toEqual({ custom: 'Custom precondition' });
    });

    it('should do nothing if no steps', () => {
      builder.steps = [];
      builder.addPreconditionToLastStep('After Qualification');
      expect(builder.steps.length).toBe(0);
    });
  });

  describe('addStep()', () => {
    it('should add step to array', () => {
      builder.addStep({ action: 'create' });
      expect(builder.steps.length).toBe(1);
    });

    it('should return this for chaining', () => {
      const result = builder.addStep({ action: 'create' });
      expect(result).toBe(builder);
    });
  });

  describe('removeLastStep()', () => {
    it('should remove last step', () => {
      builder.addStep({ action: 'create' });
      builder.addStep({ action: 'update' });
      builder.removeLastStep();
      expect(builder.steps.length).toBe(1);
      expect(builder.steps[0].action).toBe('create');
    });

    it('should return this for chaining', () => {
      builder.addStep({ action: 'create' });
      const result = builder.removeLastStep();
      expect(result).toBe(builder);
    });
  });

  describe('reset()', () => {
    it('should clear all data', () => {
      builder.epic = 'Test';
      builder.userStory = 'Story';
      builder.steps = [{}];
      builder.reset();
      expect(builder.epic).toBe('');
      expect(builder.userStory).toBe('');
      expect(builder.steps).toEqual([]);
    });

    it('should return this for chaining', () => {
      const result = builder.reset();
      expect(result).toBe(builder);
    });
  });

  describe('getScenarioSummary()', () => {
    it('should include epic', () => {
      builder.epic = 'CPQ Workflow';
      const summary = builder.getScenarioSummary();
      expect(summary).toContain('CPQ Workflow');
    });

    it('should show (not set) for empty user story', () => {
      const summary = builder.getScenarioSummary();
      expect(summary).toContain('(not set)');
    });

    it('should join step raw texts', () => {
      builder.addStep({ raw: 'Create Account' });
      builder.addStep({ raw: 'Create Opp' });
      const summary = builder.getScenarioSummary();
      expect(summary).toContain('Create Account -> Create Opp');
    });
  });

  describe('build()', () => {
    beforeEach(() => {
      builder.epic = 'CPQ Workflow';
      builder.userStory = 'As a sales rep, I want to create quotes';
      builder.acceptanceCriteria = 'Given Account, When quote created, Then linked';
      builder.addStep({ raw: 'From Account', action: 'navigate', object: 'Account' });
      builder.addStep({ raw: 'Create Quote', action: 'create', object: 'SBQQ__Quote__c' });
    });

    it('should include all fields', () => {
      const result = builder.build();
      expect(result.epic).toBe('CPQ Workflow');
      expect(result.userStory).toBe('As a sales rep, I want to create quotes');
      expect(result.acceptanceCriteria).toBe('Given Account, When quote created, Then linked');
    });

    it('should build scenario from steps', () => {
      const result = builder.build();
      expect(result.scenario).toBe('From Account -> Create Quote');
    });

    it('should include metadata', () => {
      const result = builder.build();
      expect(result.metadata.platform).toBe('salesforce');
      expect(result.metadata.stepCount).toBe(2);
      expect(result.metadata.createdAt).toBeDefined();
    });

    it('should renumber steps', () => {
      const result = builder.build();
      expect(result.steps[0].stepNumber).toBe(1);
      expect(result.steps[1].stepNumber).toBe(2);
    });
  });

  describe('toCSV()', () => {
    it('should generate CSV row', () => {
      builder.epic = 'CPQ Workflow';
      builder.addStep({ raw: 'Create Account' });
      const csv = builder.toCSV();
      expect(csv).toContain('CPQ Workflow');
    });

    it('should escape commas', () => {
      builder.epic = 'Epic, with comma';
      const csv = builder.toCSV();
      expect(csv).toContain('"Epic, with comma"');
    });

    it('should escape quotes', () => {
      builder.epic = 'Epic "quoted"';
      const csv = builder.toCSV();
      expect(csv).toContain('"Epic ""quoted"""');
    });
  });

  describe('toJSON()', () => {
    it('should return valid JSON', () => {
      builder.epic = 'Test';
      const json = builder.toJSON();
      const parsed = JSON.parse(json);
      expect(parsed.epic).toBe('Test');
    });

    it('should support pretty printing', () => {
      builder.epic = 'Test';
      const pretty = builder.toJSON(true);
      const compact = builder.toJSON(false);
      expect(pretty.length).toBeGreaterThan(compact.length);
    });
  });

  describe('saveToFile()', () => {
    const testDir = path.join(__dirname, '../__fixtures__/results/builder-output');

    afterEach(() => {
      // Cleanup
      try {
        if (fs.existsSync(testDir)) {
          const files = fs.readdirSync(testDir);
          files.forEach(f => fs.unlinkSync(path.join(testDir, f)));
          fs.rmdirSync(testDir);
        }
      } catch (e) {
        // Ignore cleanup errors
      }
    });

    it('should save JSON file', () => {
      builder.epic = 'Test';
      const outputPath = path.join(testDir, 'test.json');
      const result = builder.saveToFile(outputPath, 'json');

      expect(result.success).toBe(true);
      expect(fs.existsSync(outputPath)).toBe(true);

      const content = JSON.parse(fs.readFileSync(outputPath, 'utf-8'));
      expect(content.epic).toBe('Test');
    });

    it('should save CSV file with header', () => {
      builder.epic = 'Test';
      const outputPath = path.join(testDir, 'test.csv');
      const result = builder.saveToFile(outputPath, 'csv');

      expect(result.success).toBe(true);
      expect(fs.existsSync(outputPath)).toBe(true);

      const content = fs.readFileSync(outputPath, 'utf-8');
      expect(content).toContain('Epic,User Story');
      expect(content).toContain('Test');
    });

    it('should create directory if not exists', () => {
      const outputPath = path.join(testDir, 'subdir', 'test.json');
      builder.epic = 'Test';
      const result = builder.saveToFile(outputPath);

      expect(result.success).toBe(true);

      // Cleanup subdir
      fs.unlinkSync(outputPath);
      fs.rmdirSync(path.dirname(outputPath));
    });

    it('should return error on failure', () => {
      // Try to write to invalid path
      const result = builder.saveToFile('/root/invalid/path/file.json');
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('fromTestCase()', () => {
    it('should create builder from existing test case', () => {
      const testCase = {
        epic: 'Existing Epic',
        userStory: 'Existing Story',
        acceptanceCriteria: 'Criteria',
        steps: [{ action: 'create' }],
        metadata: { platform: 'hubspot' }
      };

      const newBuilder = UATTestCaseBuilder.fromTestCase(testCase);

      expect(newBuilder.epic).toBe('Existing Epic');
      expect(newBuilder.userStory).toBe('Existing Story');
      expect(newBuilder.platform).toBe('hubspot');
      expect(newBuilder.steps.length).toBe(1);
    });

    it('should handle missing metadata', () => {
      const testCase = { epic: 'Test' };
      const newBuilder = UATTestCaseBuilder.fromTestCase(testCase);

      expect(newBuilder.platform).toBe('salesforce');
    });
  });

  describe('exports', () => {
    it('should export QuestionPhase enum', () => {
      expect(QuestionPhase.EPIC).toBe('epic');
      expect(QuestionPhase.STEP_ACTION).toBe('step_action');
    });

    it('should export ACTION_OPTIONS', () => {
      expect(ACTION_OPTIONS.length).toBeGreaterThan(0);
      expect(ACTION_OPTIONS[0].label).toBeDefined();
    });

    it('should export EXPECTED_OUTCOMES', () => {
      expect(EXPECTED_OUTCOMES.length).toBeGreaterThan(0);
    });

    it('should export SALESFORCE_OBJECTS', () => {
      expect(SALESFORCE_OBJECTS.some(o => o.label === 'Account')).toBe(true);
    });

    it('should export HUBSPOT_OBJECTS', () => {
      expect(HUBSPOT_OBJECTS.some(o => o.label === 'Company')).toBe(true);
    });
  });

  describe('getReviewQuestion()', () => {
    it('should include scenario summary', () => {
      builder.epic = 'CPQ Workflow';
      builder.addStep({ raw: 'Create Account' });
      const result = builder.getReviewQuestion();
      expect(result.questions[0].question).toContain('CPQ Workflow');
      expect(result.questions[0].question).toContain('Create Account');
    });

    it('should have confirm options', () => {
      const result = builder.getReviewQuestion();
      const options = result.questions[0].options;
      expect(options.some(o => o.label === 'Generate Test Case')).toBe(true);
      expect(options.some(o => o.label === 'Add More Steps')).toBe(true);
      expect(options.some(o => o.label === 'Start Over')).toBe(true);
    });
  });
});
