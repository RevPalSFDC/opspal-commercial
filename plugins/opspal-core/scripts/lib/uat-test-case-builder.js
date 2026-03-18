/**
 * UAT Test Case Builder
 *
 * Generates test cases through structured question workflow.
 * Compatible with Claude's AskUserQuestion tool pattern.
 *
 * Workflow:
 * 1. Epic/User Story selection
 * 2. Step-by-step test building
 * 3. Expected outcome definition
 * 4. Export to CSV/JSON
 *
 * @version 1.0.0
 * @author RevPal Engineering
 */

const fs = require('fs');
const path = require('path');

/**
 * Question types for the builder workflow
 */
const QuestionPhase = {
  EPIC: 'epic',
  USER_STORY: 'user_story',
  STEP_ACTION: 'step_action',
  STEP_OBJECT: 'step_object',
  STEP_EXPECTED: 'step_expected',
  STEP_PRECONDITION: 'step_precondition',
  ADD_MORE_STEPS: 'add_more_steps',
  REVIEW: 'review'
};

/**
 * Common Salesforce object options
 */
const SALESFORCE_OBJECTS = [
  { label: 'Account', description: 'Customer or prospect account' },
  { label: 'Opportunity', description: 'Sales opportunity / deal' },
  { label: 'Quote (CPQ)', description: 'SBQQ__Quote__c for CPQ quotes' },
  { label: 'Quote Line', description: 'SBQQ__QuoteLine__c for line items' },
  { label: 'Product', description: 'Product2 catalog item' },
  { label: 'Contact', description: 'Person associated with account' }
];

/**
 * Common HubSpot object options
 */
const HUBSPOT_OBJECTS = [
  { label: 'Company', description: 'HubSpot company record' },
  { label: 'Contact', description: 'HubSpot contact record' },
  { label: 'Deal', description: 'HubSpot deal / opportunity' },
  { label: 'Ticket', description: 'Support ticket' },
  { label: 'Quote', description: 'HubSpot quote' }
];

/**
 * Action options for test steps
 */
const ACTION_OPTIONS = [
  { label: 'Create Record', description: 'Create a new record' },
  { label: 'Update Record', description: 'Modify an existing record' },
  { label: 'Verify Field', description: 'Check field equals expected value' },
  { label: 'Verify Rollup', description: 'Confirm rollup calculation' },
  { label: 'Navigate', description: 'Navigate to object/page' },
  { label: 'Submit for Approval', description: 'Trigger approval workflow' },
  { label: 'Check Permission', description: 'Verify user can/cannot perform action' }
];

/**
 * Expected outcome options
 */
const EXPECTED_OUTCOMES = [
  { label: 'Success', description: 'Operation completes successfully' },
  { label: 'Field matches value', description: 'Field equals specific value' },
  { label: 'Action blocked', description: 'Validation or permission blocks action' },
  { label: 'Rollup correct', description: 'Calculated values are accurate' },
  { label: 'Approval pending', description: 'Record enters approval queue' }
];

/**
 * UATTestCaseBuilder
 *
 * Builds test cases through interactive question workflow
 */
class UATTestCaseBuilder {
  /**
   * @param {Object} options
   * @param {string} options.platform - 'salesforce' or 'hubspot'
   * @param {boolean} options.verbose - Enable verbose logging
   */
  constructor(options = {}) {
    this.platform = options.platform || 'salesforce';
    this.verbose = options.verbose || false;

    // Test case data
    this.epic = '';
    this.userStory = '';
    this.acceptanceCriteria = '';
    this.steps = [];

    // State tracking
    this.currentPhase = QuestionPhase.EPIC;
    this.currentStepIndex = 0;
    this.tempStep = {};
  }

  /**
   * Get objects based on platform
   * @returns {Array} Object options
   */
  getObjectOptions() {
    return this.platform === 'hubspot' ? HUBSPOT_OBJECTS : SALESFORCE_OBJECTS;
  }

  /**
   * Get the initial questions to start the builder
   * @returns {Object} Questions for AskUserQuestion tool
   */
  getInitialQuestions() {
    return {
      questions: [
        {
          question: 'What Epic does this test belong to?',
          header: 'Epic',
          options: [
            { label: 'CPQ Workflow', description: 'Quote-to-cash process tests' },
            { label: 'Lead Management', description: 'Lead conversion and routing' },
            { label: 'Account Management', description: 'Account and contact operations' },
            { label: 'Custom', description: 'Enter a custom epic name' }
          ],
          multiSelect: false
        },
        {
          question: 'What platform are you testing?',
          header: 'Platform',
          options: [
            { label: 'Salesforce', description: 'Salesforce CRM operations' },
            { label: 'HubSpot', description: 'HubSpot CRM operations' }
          ],
          multiSelect: false
        }
      ]
    };
  }

  /**
   * Get questions for building a single test step
   * @param {number} stepNumber - The step number (1-indexed)
   * @returns {Object} Questions for AskUserQuestion tool
   */
  getStepQuestions(stepNumber) {
    return {
      questions: [
        {
          question: `Step ${stepNumber}: What action should this step perform?`,
          header: 'Action',
          options: ACTION_OPTIONS,
          multiSelect: false
        },
        {
          question: `Which ${this.platform === 'hubspot' ? 'HubSpot' : 'Salesforce'} object?`,
          header: 'Object',
          options: [...this.getObjectOptions(), { label: 'Other', description: 'Specify a different object' }],
          multiSelect: false
        },
        {
          question: 'What is the expected outcome?',
          header: 'Expected',
          options: EXPECTED_OUTCOMES,
          multiSelect: false
        }
      ]
    };
  }

  /**
   * Get precondition question (optional for steps)
   * @returns {Object} Question for AskUserQuestion tool
   */
  getPreconditionQuestion() {
    return {
      questions: [
        {
          question: 'Does this step have any preconditions?',
          header: 'Precondition',
          options: [
            { label: 'None', description: 'No preconditions required' },
            { label: 'After Qualification', description: 'Opp must be at/after Qualification stage' },
            { label: 'After Proposal', description: 'Opp must be at/after Proposal stage' },
            { label: 'Primary Quote exists', description: 'A Primary quote must exist' },
            { label: 'Custom', description: 'Specify custom precondition' }
          ],
          multiSelect: false
        }
      ]
    };
  }

  /**
   * Get question to ask if user wants to add more steps
   * @returns {Object} Question for AskUserQuestion tool
   */
  getAddMoreStepsQuestion() {
    return {
      questions: [
        {
          question: `You have ${this.steps.length} step(s). Would you like to add another?`,
          header: 'More Steps',
          options: [
            { label: 'Add Another Step', description: 'Continue building test steps' },
            { label: 'Done Building', description: 'Finish and generate test case' }
          ],
          multiSelect: false
        }
      ]
    };
  }

  /**
   * Get review question before finalizing
   * @returns {Object} Question for AskUserQuestion tool
   */
  getReviewQuestion() {
    const summary = this.getScenarioSummary();
    return {
      questions: [
        {
          question: `Review your test case:\n${summary}\n\nLooks good?`,
          header: 'Confirm',
          options: [
            { label: 'Generate Test Case', description: 'Create the test case file' },
            { label: 'Add More Steps', description: 'Continue adding steps' },
            { label: 'Start Over', description: 'Discard and begin again' }
          ],
          multiSelect: false
        }
      ]
    };
  }

  /**
   * Process answers from initial questions
   * @param {Object} answers - User answers
   * @returns {UATTestCaseBuilder} this for chaining
   */
  processInitialAnswers(answers) {
    this.epic = answers['Epic'] === 'Custom' ? (answers['Other'] || 'Custom Epic') : answers['Epic'];
    this.platform = (answers['Platform'] || 'Salesforce').toLowerCase();
    this.currentPhase = QuestionPhase.STEP_ACTION;
    return this;
  }

  /**
   * Set the user story
   * @param {string} userStory - User story text
   * @returns {UATTestCaseBuilder} this for chaining
   */
  setUserStory(userStory) {
    this.userStory = userStory;
    return this;
  }

  /**
   * Set acceptance criteria
   * @param {string} criteria - Acceptance criteria text
   * @returns {UATTestCaseBuilder} this for chaining
   */
  setAcceptanceCriteria(criteria) {
    this.acceptanceCriteria = criteria;
    return this;
  }

  /**
   * Convert action label to action code
   * @param {string} label - Action label from user
   * @returns {string} Action code
   */
  normalizeAction(label) {
    const actionMap = {
      'Create Record': 'create',
      'Update Record': 'update',
      'Verify Field': 'verify',
      'Verify Rollup': 'verify',
      'Navigate': 'navigate',
      'Submit for Approval': 'submit_approval',
      'Check Permission': 'permission'
    };
    return actionMap[label] || 'manual';
  }

  /**
   * Convert object label to API name
   * @param {string} label - Object label from user
   * @returns {string} API name
   */
  normalizeObject(label) {
    const objectMap = {
      'Account': 'Account',
      'Opportunity': 'Opportunity',
      'Quote (CPQ)': 'SBQQ__Quote__c',
      'Quote Line': 'SBQQ__QuoteLine__c',
      'Product': 'Product2',
      'Contact': 'Contact',
      'Company': 'Company',
      'Deal': 'Deal',
      'Ticket': 'Ticket',
      'Quote': 'Quote'
    };
    return objectMap[label] || label;
  }

  /**
   * Convert expected outcome label to structured data
   * @param {string} label - Expected outcome label
   * @returns {Object} Expected outcome data
   */
  normalizeExpectedOutcome(label) {
    const outcomeMap = {
      'Success': { type: 'success', message: 'Operation completed successfully' },
      'Field matches value': { type: 'field_match', message: 'Field equals expected value' },
      'Action blocked': { type: 'blocked', message: 'Action is blocked by validation/permission' },
      'Rollup correct': { type: 'rollup', message: 'Rollup values are correct' },
      'Approval pending': { type: 'approval', message: 'Record submitted for approval' }
    };
    return outcomeMap[label] || { type: 'custom', message: label };
  }

  /**
   * Build a step from user answers
   * @param {Object} answers - User answers from step questions
   * @returns {Object} Step object
   */
  buildStepFromAnswers(answers) {
    const action = this.normalizeAction(answers['Action']);
    const object = this.normalizeObject(answers['Object']);
    const expected = this.normalizeExpectedOutcome(answers['Expected']);

    // Build raw text representation
    let raw = '';
    switch (action) {
      case 'create':
        raw = `Create ${object}`;
        break;
      case 'update':
        raw = `Update ${object}`;
        break;
      case 'verify':
        raw = `Verify ${object}`;
        break;
      case 'navigate':
        raw = `From ${object}`;
        break;
      case 'submit_approval':
        raw = 'Submit for approval';
        break;
      case 'permission':
        raw = `Check permission on ${object}`;
        break;
      default:
        raw = `${answers['Action']} ${object}`;
    }

    return {
      stepNumber: this.steps.length + 1,
      raw,
      action,
      object,
      expectedOutcome: expected.type,
      data: {}
    };
  }

  /**
   * Add precondition to the last step
   * @param {string} precondition - Precondition label
   * @returns {UATTestCaseBuilder} this for chaining
   */
  addPreconditionToLastStep(precondition) {
    if (this.steps.length > 0 && precondition !== 'None') {
      const lastStep = this.steps[this.steps.length - 1];

      if (precondition === 'After Qualification') {
        lastStep.precondition = { stage: 'Qualification' };
      } else if (precondition === 'After Proposal') {
        lastStep.precondition = { stage: 'Proposal' };
      } else if (precondition === 'Primary Quote exists') {
        lastStep.precondition = { requires: 'primaryQuote' };
      } else {
        lastStep.precondition = { custom: precondition };
      }
    }
    return this;
  }

  /**
   * Add a step to the test case
   * @param {Object} step - Step object
   * @returns {UATTestCaseBuilder} this for chaining
   */
  addStep(step) {
    this.steps.push(step);
    return this;
  }

  /**
   * Remove the last step
   * @returns {UATTestCaseBuilder} this for chaining
   */
  removeLastStep() {
    this.steps.pop();
    return this;
  }

  /**
   * Clear all steps and start over
   * @returns {UATTestCaseBuilder} this for chaining
   */
  reset() {
    this.epic = '';
    this.userStory = '';
    this.acceptanceCriteria = '';
    this.steps = [];
    this.currentPhase = QuestionPhase.EPIC;
    return this;
  }

  /**
   * Get human-readable scenario summary
   * @returns {string} Scenario summary
   */
  getScenarioSummary() {
    const stepTexts = this.steps.map(s => s.raw).join(' -> ');
    return `Epic: ${this.epic}\nStory: ${this.userStory || '(not set)'}\nSteps: ${stepTexts || '(none)'}`;
  }

  /**
   * Build the complete test case object
   * @returns {Object} Test case object
   */
  build() {
    const scenario = this.steps.map(s => s.raw).join(' -> ');

    return {
      epic: this.epic,
      userStory: this.userStory,
      acceptanceCriteria: this.acceptanceCriteria,
      scenario,
      steps: this.steps.map((s, i) => ({
        ...s,
        stepNumber: i + 1
      })),
      metadata: {
        platform: this.platform,
        createdAt: new Date().toISOString(),
        stepCount: this.steps.length
      }
    };
  }

  /**
   * Export test case as CSV row
   * @returns {string} CSV line
   */
  toCSV() {
    const tc = this.build();
    const escapeCSV = (str) => {
      if (!str) return '';
      const s = String(str);
      if (s.includes(',') || s.includes('"') || s.includes('\n')) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    };

    return [
      escapeCSV(tc.epic),
      escapeCSV(tc.userStory),
      escapeCSV(tc.acceptanceCriteria),
      escapeCSV(tc.scenario),
      '', // Result
      '', // Pass/Fail
      '', // Test Record URL
      ''  // Tester Comments
    ].join(',');
  }

  /**
   * Export test case as JSON
   * @param {boolean} pretty - Pretty print JSON
   * @returns {string} JSON string
   */
  toJSON(pretty = true) {
    const tc = this.build();
    return pretty ? JSON.stringify(tc, null, 2) : JSON.stringify(tc);
  }

  /**
   * Save test case to file
   * @param {string} outputPath - Output file path
   * @param {string} format - 'csv' or 'json'
   * @returns {Object} Result with success and path
   */
  saveToFile(outputPath, format = 'json') {
    try {
      const dir = path.dirname(outputPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      let content;
      if (format === 'csv') {
        // Include header for CSV
        const header = 'Epic,User Story,Acceptance Criteria,Test Scenarios,Result,Pass/Fail,Test Record URL,Tester Comments';
        content = header + '\n' + this.toCSV();
      } else {
        content = this.toJSON();
      }

      fs.writeFileSync(outputPath, content, 'utf-8');

      return {
        success: true,
        path: outputPath,
        format,
        testCase: this.build()
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        path: outputPath
      };
    }
  }

  /**
   * Create builder from existing test case (for editing)
   * @param {Object} testCase - Existing test case object
   * @returns {UATTestCaseBuilder} New builder instance
   */
  static fromTestCase(testCase) {
    const builder = new UATTestCaseBuilder({
      platform: testCase.metadata?.platform || 'salesforce'
    });

    builder.epic = testCase.epic || '';
    builder.userStory = testCase.userStory || '';
    builder.acceptanceCriteria = testCase.acceptanceCriteria || '';
    builder.steps = testCase.steps || [];

    return builder;
  }
}

// Export for use in other modules
module.exports = UATTestCaseBuilder;
module.exports.QuestionPhase = QuestionPhase;
module.exports.ACTION_OPTIONS = ACTION_OPTIONS;
module.exports.EXPECTED_OUTCOMES = EXPECTED_OUTCOMES;
module.exports.SALESFORCE_OBJECTS = SALESFORCE_OBJECTS;
module.exports.HUBSPOT_OBJECTS = HUBSPOT_OBJECTS;
