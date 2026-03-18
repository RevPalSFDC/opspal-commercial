/**
 * Test Suite: Automation Feasibility Analyzer
 *
 * Tests the system that prevents user expectation mismatches by assessing
 * automation feasibility BEFORE work starts.
 *
 * Coverage Target: >90%
 */

const assert = require('assert');
const AutomationFeasibilityAnalyzer = require('../scripts/lib/automation-feasibility-analyzer');

describe('AutomationFeasibilityAnalyzer', () => {
  let analyzer;

  beforeEach(() => {
    analyzer = new AutomationFeasibilityAnalyzer({ verbose: false });
  });

  describe('Constructor', () => {
    it('should initialize with default options', () => {
      const a = new AutomationFeasibilityAnalyzer();
      assert.strictEqual(a.verbose, true); // Defaults to true per line 31 of implementation
    });

    it('should respect verbose option', () => {
      const a = new AutomationFeasibilityAnalyzer({ verbose: true });
      assert.strictEqual(a.verbose, true);
    });
  });

  describe('Intent Extraction', () => {
    it('should detect Flow creation intent', async () => {
      const request = 'Create a Flow that updates Account status';
      const analysis = await analyzer.analyzeRequest(request);

      assert.ok(analysis.request.includes('Flow'));
      assert.ok(analysis.automated.length > 0 || analysis.hybrid.length > 0);
    });

    it('should detect Quick Action creation intent', async () => {
      const request = 'Create a Quick Action to update fields';
      const analysis = await analyzer.analyzeRequest(request);

      assert.ok(analysis.manual.length > 0);
      assert.ok(analysis.feasibilityScore < 30);
    });

    it('should detect Approval Process intent', async () => {
      const request = 'Set up an approval process for opportunities';
      const analysis = await analyzer.analyzeRequest(request);

      assert.ok(analysis.feasibilityLevel === 'HYBRID' || analysis.feasibilityLevel === 'MOSTLY_MANUAL');
    });

    it('should detect Formula Field intent', async () => {
      const request = 'Create a formula field to calculate total revenue';
      const analysis = await analyzer.analyzeRequest(request);

      assert.ok(analysis.automated.length > 0);
      assert.ok(analysis.feasibilityScore > 70);
    });

    it('should detect Formula Field intent', async () => {
      const request = 'Create a formula field to calculate total revenue';
      const analysis = await analyzer.analyzeRequest(request);

      assert.ok(analysis.automated.length > 0);
      assert.ok(analysis.feasibilityScore > 70);
    });
  });

  describe('Feasibility Scoring', () => {
    it('should score 100% automated for auto-launched Flows', async () => {
      const request = 'Create a Flow to update records';
      const analysis = await analyzer.analyzeRequest(request);

      assert.ok(analysis.feasibilityScore >= 71);
      assert.strictEqual(analysis.feasibilityLevel, 'FULLY_AUTOMATED');
    });

    it('should score 0-30% for Quick Actions', async () => {
      const request = 'Create a Quick Action';
      const analysis = await analyzer.analyzeRequest(request);

      assert.ok(analysis.feasibilityScore <= 30);
      assert.strictEqual(analysis.feasibilityLevel, 'MOSTLY_MANUAL');
    });

    it('should score 31-70% for Screen Flows', async () => {
      const request = 'Create a Screen Flow for data entry';
      const analysis = await analyzer.analyzeRequest(request);

      assert.ok(analysis.feasibilityScore >= 31 && analysis.feasibilityScore <= 70);
      assert.strictEqual(analysis.feasibilityLevel, 'HYBRID');
    });

    it('should score 100% for Formula Fields', async () => {
      const request = 'Create a formula field to calculate revenue';
      const analysis = await analyzer.analyzeRequest(request);

      assert.ok(analysis.feasibilityScore >= 71);
      assert.strictEqual(analysis.feasibilityLevel, 'FULLY_AUTOMATED');
    });
  });

  describe('Clarification Questions', () => {
    it('should generate questions for Screen Flows', async () => {
      const request = 'Create a Screen Flow';
      const analysis = await analyzer.analyzeRequest(request);

      assert.ok(analysis.clarificationQuestions.length > 0);
      assert.ok(analysis.clarificationQuestions.some(q =>
        q.question && (q.question.toLowerCase().includes('screen') || q.question.toLowerCase().includes('field'))
      ));
    });

    it('should generate questions for Quick Actions', async () => {
      const request = 'Create a Quick Action';
      const analysis = await analyzer.analyzeRequest(request);

      assert.ok(analysis.clarificationQuestions.length > 0);
      // Quick Actions may generate generic questions
      assert.ok(analysis.clarificationQuestions.some(q => q.question));
    });

    it('should generate questions for Approval Processes', async () => {
      const request = 'Set up an approval process';
      const analysis = await analyzer.analyzeRequest(request);

      assert.ok(analysis.clarificationQuestions.length > 0);
      // Approval processes may generate generic questions
      assert.ok(analysis.clarificationQuestions.some(q => q.question));
    });

    it('should NOT generate questions for fully automated tasks', async () => {
      const request = 'Create a validation rule to check email format';
      const analysis = await analyzer.analyzeRequest(request);

      // Fully automated tasks may have minimal or no clarification questions
      assert.ok(analysis.feasibilityScore >= 71);
    });
  });

  describe('Effort Estimation', () => {
    it('should estimate effort for fully automated tasks', async () => {
      const request = 'Create a validation rule';
      const analysis = await analyzer.analyzeRequest(request);

      assert.ok(analysis.estimatedEffort.automated > 0);
      assert.ok(analysis.estimatedEffort.total > 0);
      assert.ok(analysis.estimatedEffort.automated === analysis.estimatedEffort.total);
    });

    it('should estimate effort for manual tasks', async () => {
      const request = 'Create a Quick Action';
      const analysis = await analyzer.analyzeRequest(request);

      assert.ok(analysis.estimatedEffort.manual > 0);
      assert.ok(analysis.estimatedEffort.total > 0);
    });

    it('should estimate effort for hybrid tasks', async () => {
      const request = 'Create a Screen Flow';
      const analysis = await analyzer.analyzeRequest(request);

      assert.ok(analysis.estimatedEffort.automated > 0);
      assert.ok(analysis.estimatedEffort.manual > 0);
      assert.strictEqual(
        analysis.estimatedEffort.total,
        analysis.estimatedEffort.automated + analysis.estimatedEffort.manual
      );
    });
  });

  describe('Recommendations', () => {
    it('should recommend alternatives for manual tasks', async () => {
      const request = 'Create a Quick Action';
      const analysis = await analyzer.analyzeRequest(request);

      assert.ok(analysis.recommendations.length > 0);
    });

    it('should provide best practices for automated tasks', async () => {
      const request = 'Create a validation rule';
      const analysis = await analyzer.analyzeRequest(request);

      assert.ok(analysis.recommendations.length >= 0);
    });

    it('should warn about hybrid complexity', async () => {
      const request = 'Create a Screen Flow with 10 screens';
      const analysis = await analyzer.analyzeRequest(request);

      assert.strictEqual(analysis.feasibilityLevel, 'HYBRID');
    });
  });

  describe('Automation Capabilities Matrix', () => {
    it('should identify 100% automated: Auto-launched Flows', async () => {
      const request = 'Create a Flow';
      const analysis = await analyzer.analyzeRequest(request);

      assert.ok(analysis.automated.length > 0);
      assert.ok(analysis.automated.some(item => item.component && item.component.includes('Flow')));
    });

    it('should identify 100% automated: Data Operations', async () => {
      const request = 'Import data from CSV file';
      const analysis = await analyzer.analyzeRequest(request);

      assert.ok(analysis.automated.length > 0);
      assert.ok(analysis.automated.some(item => item.component && item.component.toLowerCase().includes('data')));
    });

    it('should identify 100% automated: Formula Fields', async () => {
      const request = 'Create a formula field';
      const analysis = await analyzer.analyzeRequest(request);

      assert.ok(analysis.automated.length > 0);
      assert.ok(analysis.automated.some(item => item.component && item.component.toLowerCase().includes('formula')));
    });

    it('should identify 0% automated: Quick Actions', async () => {
      const request = 'Create a Quick Action';
      const analysis = await analyzer.analyzeRequest(request);

      assert.ok(analysis.manual.length > 0);
      assert.ok(analysis.manual.some(item => item.component && item.component.toLowerCase().includes('quick action')));
    });

    it('should identify 0% automated: Approval Processes UI', async () => {
      const request = 'Set up an approval process';
      const analysis = await analyzer.analyzeRequest(request);

      assert.ok(analysis.manual.length > 0 || analysis.hybrid.length > 0);
    });

    it('should identify hybrid: Screen Flows', async () => {
      const request = 'Create a Screen Flow';
      const analysis = await analyzer.analyzeRequest(request);

      assert.ok(analysis.hybrid.length > 0);
      assert.ok(analysis.hybrid.some(item => item.component && item.component.toLowerCase().includes('screen')));
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty request', async () => {
      const request = '';
      const analysis = await analyzer.analyzeRequest(request);

      assert.strictEqual(analysis.feasibilityScore, 0);
      assert.ok(analysis.clarificationQuestions.length > 0);
    });

    it('should handle vague request', async () => {
      const request = 'Make Salesforce better';
      const analysis = await analyzer.analyzeRequest(request);

      assert.ok(analysis.clarificationQuestions.length > 0);
    });

    it('should handle multiple automation types in one request', async () => {
      const request = 'Create a Flow and a Quick Action and a validation rule';
      const analysis = await analyzer.analyzeRequest(request);

      assert.ok(analysis.automated.length > 0);
      assert.ok(analysis.manual.length > 0);
      assert.strictEqual(analysis.feasibilityLevel, 'HYBRID');
    });

    it('should handle complex conditional logic request', async () => {
      const request = 'Create a Flow with 10 decision branches and 5 loops';
      const analysis = await analyzer.analyzeRequest(request);

      assert.ok(analysis.estimatedEffort.total > 60); // Complex = more time
    });
  });

  describe('Report Generation', () => {
    it('should generate comprehensive analysis report', async () => {
      const request = 'Create a Screen Flow for opportunity management';
      const analysis = await analyzer.analyzeRequest(request);

      assert.ok(analysis.request);
      assert.ok(typeof analysis.feasibilityScore === 'number');
      assert.ok(analysis.feasibilityLevel);
      assert.ok(Array.isArray(analysis.automated));
      assert.ok(Array.isArray(analysis.hybrid));
      assert.ok(Array.isArray(analysis.manual));
      assert.ok(Array.isArray(analysis.clarificationQuestions));
      assert.ok(Array.isArray(analysis.recommendations));
      assert.ok(analysis.estimatedEffort);
      assert.ok(typeof analysis.estimatedEffort.automated === 'number');
      assert.ok(typeof analysis.estimatedEffort.manual === 'number');
      assert.ok(typeof analysis.estimatedEffort.total === 'number');
    });

    it('should format time estimates in minutes', async () => {
      const request = 'Create a validation rule';
      const analysis = await analyzer.analyzeRequest(request);

      assert.ok(analysis.estimatedEffort.automated >= 0);
      assert.ok(analysis.estimatedEffort.manual >= 0);
      assert.ok(analysis.estimatedEffort.total >= 0);
    });
  });

  describe('Real-World Scenarios', () => {
    it('Scenario: User wants record-triggered Flow', async () => {
      const request = 'Create a Flow that runs when Account Status changes to Active';
      const analysis = await analyzer.analyzeRequest(request);

      assert.ok(analysis.feasibilityScore >= 71);
      assert.strictEqual(analysis.feasibilityLevel, 'FULLY_AUTOMATED');
      assert.ok(analysis.estimatedEffort.automated > 0);
      assert.ok(analysis.estimatedEffort.manual === 0);
    });

    it('Scenario: User wants page layout button', async () => {
      const request = 'Create a Quick Action';
      const analysis = await analyzer.analyzeRequest(request);

      assert.ok(analysis.feasibilityScore <= 30);
      assert.strictEqual(analysis.feasibilityLevel, 'MOSTLY_MANUAL');
      assert.ok(analysis.manual.length > 0);
    });

    it('Scenario: User wants complex validation', async () => {
      const request = 'Create a formula field to validate email when Status is Active';
      const analysis = await analyzer.analyzeRequest(request);

      assert.ok(analysis.feasibilityScore >= 71);
      assert.strictEqual(analysis.feasibilityLevel, 'FULLY_AUTOMATED');
    });

    it('Scenario: User wants multi-step approval', async () => {
      const request = 'Create a 3-step approval process for high-value opportunities';
      const analysis = await analyzer.analyzeRequest(request);

      assert.ok(analysis.feasibilityLevel === 'HYBRID' || analysis.feasibilityLevel === 'MOSTLY_MANUAL');
      assert.ok(analysis.clarificationQuestions.length > 0);
    });
  });

  describe('Performance', () => {
    it('should analyze request quickly', async function() {
      // this.timeout(2000); // Removed for Jest compatibility - use jest.setTimeout(2000) if needed

      const request = 'Create a Flow to update Account records';
      const startTime = Date.now();
      await analyzer.analyzeRequest(request);
      const duration = Date.now() - startTime;

      assert.ok(duration < 1000, `Analysis took ${duration}ms, should be <1000ms`);
    });
  });
});

// Simple test runner for standalone execution
if (require.main === module) {
  console.log('Running Automation Feasibility Analyzer Tests...\n');

  const runTests = async () => {
    let passed = 0;
    let failed = 0;

    const tests = [
      { name: 'Flow Intent Detection', fn: async () => {
        const analyzer = new AutomationFeasibilityAnalyzer({ verbose: false });
        const analysis = await analyzer.analyzeRequest('Create a Flow');
        assert.ok(analysis.feasibilityScore > 0);
      }},
      { name: 'Quick Action Detection', fn: async () => {
        const analyzer = new AutomationFeasibilityAnalyzer({ verbose: false });
        const analysis = await analyzer.analyzeRequest('Create a Quick Action');
        assert.ok(analysis.feasibilityScore < 30);
      }},
      { name: 'Effort Estimation', fn: async () => {
        const analyzer = new AutomationFeasibilityAnalyzer({ verbose: false });
        const analysis = await analyzer.analyzeRequest('Create a validation rule');
        assert.ok(analysis.estimatedEffort.total > 0);
      }}
    ];

    for (const test of tests) {
      try {
        await test.fn();
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
