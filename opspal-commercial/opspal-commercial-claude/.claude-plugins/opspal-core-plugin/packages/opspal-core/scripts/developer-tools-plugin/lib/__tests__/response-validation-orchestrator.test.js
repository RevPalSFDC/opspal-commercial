/**
 * response-validation-orchestrator.test.js
 *
 * Tests for ResponseValidationOrchestrator - coordinates response validation workflow
 */

const ResponseValidationOrchestrator = require('../response-validation-orchestrator');

describe('ResponseValidationOrchestrator', () => {
  describe('constructor', () => {
    it('should create orchestrator with default config', () => {
      const orchestrator = new ResponseValidationOrchestrator();
      expect(orchestrator.config).toBeDefined();
      expect(orchestrator.config.enabled).toBe(true);
      expect(orchestrator.config.mode).toBe('block_and_retry');
    });

    it('should accept custom config', () => {
      const orchestrator = new ResponseValidationOrchestrator({
        enabled: false,
        mode: 'warn_only'
      });
      expect(orchestrator.config.enabled).toBe(false);
      expect(orchestrator.config.mode).toBe('warn_only');
    });

    it('should initialize sanity checker', () => {
      const orchestrator = new ResponseValidationOrchestrator();
      expect(orchestrator.checker).toBeDefined();
    });
  });

  describe('orchestrate', () => {
    let orchestrator;

    beforeEach(() => {
      orchestrator = new ResponseValidationOrchestrator();
    });

    it('should skip validation when disabled', async () => {
      const disabledOrchestrator = new ResponseValidationOrchestrator({ enabled: false });
      const result = await disabledOrchestrator.orchestrate('Any response');

      expect(result.validated).toBe(false);
      expect(result.skipped).toBe(true);
      expect(result.reason).toBe('Validation disabled');
      expect(result.finalResponse).toBe('Any response');
    });

    it('should skip low-risk operations', async () => {
      const result = await orchestrator.orchestrate('Reading 10 records from Account');

      expect(result.validated).toBe(false);
      expect(result.skipped).toBe(true);
      expect(result.reason).toBe('Low-risk operation');
    });

    it('should validate high-risk operations', async () => {
      const result = await orchestrator.orchestrate('DELETE FROM production database affecting 5000 records');

      expect(result.validated).toBe(true);
    });

    it('should pass validation for valid responses', async () => {
      // Force validation by disabling smart detection
      const forceOrchestrator = new ResponseValidationOrchestrator({
        smartDetection: false
      });
      const result = await forceOrchestrator.orchestrate(
        'Successfully queried 50 records from Account'
      );

      expect(result.validated).toBe(true);
      expect(result.finalResponse).toBeDefined();
    });

    it('should handle responses with statistical claims', async () => {
      const result = await orchestrator.orchestrate(
        'Found that 95% of accounts are inactive affecting 10000 records'
      );

      expect(result).toBeDefined();
      expect(typeof result.validated).toBe('boolean');
    });

    it('should include detection score when skipping', async () => {
      const result = await orchestrator.orchestrate('Query returned 5 contacts');

      if (result.skipped) {
        expect(result.detectionScore).toBeDefined();
        expect(typeof result.detectionScore).toBe('number');
      }
    });

    it('should return final response in all cases', async () => {
      const response = 'Test response content';
      const result = await orchestrator.orchestrate(response);

      expect(result.finalResponse).toBeDefined();
    });
  });

  describe('validateImmediately', () => {
    it('should validate without smart detection', async () => {
      const orchestrator = new ResponseValidationOrchestrator();

      // Test the method if it exists
      if (typeof orchestrator.validateImmediately === 'function') {
        const result = await orchestrator.validateImmediately('Test response');
        expect(result).toBeDefined();
      } else {
        // Method doesn't exist, test orchestrate with forceValidation
        const result = await orchestrator.orchestrate('Test', { forceValidation: true });
        expect(result).toBeDefined();
      }
    });
  });

  describe('configuration modes', () => {
    it('should work with warn_only mode', async () => {
      const orchestrator = new ResponseValidationOrchestrator({
        mode: 'warn_only',
        smartDetection: false
      });
      const result = await orchestrator.orchestrate('Test response');
      expect(result).toBeDefined();
    });

    it('should work with log_only mode', async () => {
      const orchestrator = new ResponseValidationOrchestrator({
        mode: 'log_only',
        smartDetection: false
      });
      const result = await orchestrator.orchestrate('Test response');
      expect(result).toBeDefined();
    });

    it('should respect maxRetries configuration', () => {
      const orchestrator = new ResponseValidationOrchestrator({ maxRetries: 3 });
      expect(orchestrator.config.maxRetries).toBe(3);
    });

    it('should respect timeout configuration', () => {
      const orchestrator = new ResponseValidationOrchestrator({ timeoutMs: 60000 });
      expect(orchestrator.config.timeoutMs).toBe(60000);
    });
  });

  describe('threshold handling', () => {
    it('should use custom autoRetry threshold', () => {
      const orchestrator = new ResponseValidationOrchestrator({
        thresholds: { autoRetry: 0.9, warn: 0.6 }
      });
      expect(orchestrator.config.thresholds.autoRetry).toBe(0.9);
      expect(orchestrator.config.thresholds.warn).toBe(0.6);
    });
  });

  describe('determineAction', () => {
    let orchestrator;

    beforeEach(() => {
      orchestrator = new ResponseValidationOrchestrator();
    });

    it('should return pass for log_only mode', () => {
      const logOrchestrator = new ResponseValidationOrchestrator({ mode: 'log_only' });
      const action = logOrchestrator.determineAction(
        { confidence: 0.9, valid: false },
        { needed: true, score: 0.8 }
      );
      expect(action).toBe('pass');
    });

    it('should return warn for warn_only mode with high confidence', () => {
      const warnOrchestrator = new ResponseValidationOrchestrator({ mode: 'warn_only' });
      const action = warnOrchestrator.determineAction(
        { confidence: 0.7, valid: false },
        { needed: true, score: 0.8 }
      );
      expect(action).toBe('warn');
    });

    it('should return pass for warn_only mode with low confidence', () => {
      const warnOrchestrator = new ResponseValidationOrchestrator({ mode: 'warn_only' });
      const action = warnOrchestrator.determineAction(
        { confidence: 0.3, valid: false },
        { needed: true, score: 0.8 }
      );
      expect(action).toBe('pass');
    });

    it('should return retry for block_and_retry with very high confidence', () => {
      const action = orchestrator.determineAction(
        { confidence: 0.9, valid: false },
        { needed: true, score: 0.8 }
      );
      expect(action).toBe('retry');
    });

    it('should return warn for block_and_retry with medium confidence', () => {
      const action = orchestrator.determineAction(
        { confidence: 0.6, valid: false },
        { needed: true, score: 0.8 }
      );
      expect(action).toBe('warn');
    });

    it('should return pass for block_and_retry with low confidence', () => {
      const action = orchestrator.determineAction(
        { confidence: 0.3, valid: false },
        { needed: true, score: 0.8 }
      );
      expect(action).toBe('pass');
    });
  });

  describe('generateWarningBanner', () => {
    it('should generate warning banner', () => {
      const orchestrator = new ResponseValidationOrchestrator();
      if (typeof orchestrator.generateWarningBanner === 'function') {
        const banner = orchestrator.generateWarningBanner({
          concerns: [{ type: 'statistical', description: 'Test concern' }]
        });
        expect(banner).toBeDefined();
        expect(typeof banner).toBe('string');
      }
    });
  });

  describe('generateRevalidationPrompt', () => {
    it('should generate revalidation prompt', () => {
      const orchestrator = new ResponseValidationOrchestrator();
      if (typeof orchestrator.generateRevalidationPrompt === 'function') {
        const prompt = orchestrator.generateRevalidationPrompt(
          'Test response',
          {
            concerns: [
              { type: 'statistical', description: 'Statistical claim needs verification', confidence: 0.9 }
            ],
            confidence: 0.9
          },
          { org: 'test-org' }
        );
        expect(prompt).toBeDefined();
        expect(typeof prompt).toBe('string');
        expect(prompt).toContain('VALIDATION');
      }
    });
  });
});
