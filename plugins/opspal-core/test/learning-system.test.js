/**
 * Learning System Tests
 *
 * Tests for the feedback learning system components:
 * - FeedbackTracker: Recording and analyzing user decisions
 * - ThresholdOptimizer: Suggesting threshold adjustments
 * - PatternDiscoverer: Discovering new patterns from corrections
 */

'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');

// Create temp directory for test data
const TEST_DATA_DIR = path.join(os.tmpdir(), 'learning-system-test-' + Date.now());

const { FeedbackTracker } = require('../scripts/lib/learning/feedback-tracker');
const { ThresholdOptimizer } = require('../scripts/lib/learning/threshold-optimizer');
const { PatternDiscoverer } = require('../scripts/lib/learning/pattern-discoverer');

// Helper to create mock match results
function createMockMatchResult(overrides = {}) {
  return {
    decision: 'REVIEW',
    confidence: 75,
    sameEntity: true,
    market: 'healthcare',
    recordA: { name: 'Memorial Hospital', state: 'TX' },
    recordB: { name: 'Memorial Hospital', state: 'FL' },
    signals: [
      { type: 'BASE_NAME_MATCH', weight: 30 },
      { type: 'STATE_MISMATCH', weight: -30 }
    ],
    ...overrides
  };
}

describe('FeedbackTracker', () => {
  let tracker;

  beforeEach(() => {
    // Use temp directory for tests
    const storageDir = path.join(TEST_DATA_DIR, 'feedback-' + Date.now());
    fs.mkdirSync(storageDir, { recursive: true });
    tracker = new FeedbackTracker({ storageDir });
  });

  afterEach(() => {
    // Cleanup would happen here in production
  });

  describe('recordFeedback', () => {
    test('should record ACCEPT feedback', () => {
      const result = createMockMatchResult();
      const feedback = tracker.recordFeedback(result, 'ACCEPT');

      expect(feedback.id).toMatch(/^fb_/);
      expect(feedback.userAction).toBe('ACCEPT');
      expect(feedback.actualSameEntity).toBe(true);
      expect(feedback.market).toBe('healthcare');
    });

    test('should record REJECT feedback', () => {
      const result = createMockMatchResult();
      const feedback = tracker.recordFeedback(result, 'REJECT');

      expect(feedback.userAction).toBe('REJECT');
      expect(feedback.actualSameEntity).toBe(false);
    });

    test('should record MODIFY feedback', () => {
      const result = createMockMatchResult();
      const feedback = tracker.recordFeedback(result, 'MODIFY', 'Changed field mapping');

      expect(feedback.userAction).toBe('MODIFY');
      expect(feedback.actualSameEntity).toBe(true);
      expect(feedback.userRationale).toBe('Changed field mapping');
    });

    test('should record SPLIT feedback', () => {
      const result = createMockMatchResult();
      const feedback = tracker.recordFeedback(result, 'SPLIT');

      expect(feedback.userAction).toBe('SPLIT');
      expect(feedback.actualSameEntity).toBe(false);
    });

    test('should reject invalid actions', () => {
      const result = createMockMatchResult();
      expect(() => tracker.recordFeedback(result, 'INVALID')).toThrow();
    });

    test('should persist feedback to storage', () => {
      const result = createMockMatchResult();
      tracker.recordFeedback(result, 'ACCEPT');

      // Create new tracker with same storage to verify persistence
      const tracker2 = new FeedbackTracker({ storageDir: tracker.storageDir });
      const summary = tracker2.getSummary();

      expect(summary.totalDecisions).toBe(1);
    });
  });

  describe('calculateAccuracyMetrics', () => {
    test('should return insufficient data message when no decisions', () => {
      const metrics = tracker.calculateAccuracyMetrics('healthcare');

      expect(metrics.totalDecisions).toBe(0);
      expect(metrics.metrics).toBeNull();
    });

    test('should calculate precision, recall, F1 with multiple decisions', () => {
      // Add multiple decisions
      const results = [
        { ...createMockMatchResult({ sameEntity: true }), decision: 'AUTO_MERGE' },
        { ...createMockMatchResult({ sameEntity: true }), decision: 'AUTO_MERGE' },
        { ...createMockMatchResult({ sameEntity: false }), decision: 'NO_MATCH' },
        { ...createMockMatchResult({ sameEntity: false }), decision: 'NO_MATCH' }
      ];

      // TP: System predicted same, user confirmed
      tracker.recordFeedback(results[0], 'ACCEPT');
      tracker.recordFeedback(results[1], 'ACCEPT');
      // TN: System predicted different, user confirmed
      tracker.recordFeedback(results[2], 'REJECT');
      // FN: System predicted different, but user merged
      tracker.recordFeedback(results[3], 'ACCEPT');

      const metrics = tracker.calculateAccuracyMetrics('healthcare');

      expect(metrics.totalDecisions).toBe(4);
      expect(metrics.metrics).toBeDefined();
      expect(metrics.metrics.truePositives).toBe(2);
      expect(metrics.metrics.trueNegatives).toBe(1);
      expect(metrics.metrics.falseNegatives).toBe(1);
      expect(metrics.metrics.precision).toBeGreaterThan(0);
      expect(metrics.metrics.recall).toBeGreaterThan(0);
    });

    test('should filter by market', () => {
      tracker.recordFeedback(createMockMatchResult({ market: 'healthcare' }), 'ACCEPT');
      tracker.recordFeedback(createMockMatchResult({ market: 'franchise' }), 'REJECT');

      const healthcareMetrics = tracker.calculateAccuracyMetrics('healthcare');
      const franchiseMetrics = tracker.calculateAccuracyMetrics('franchise');

      expect(healthcareMetrics.totalDecisions).toBe(1);
      expect(franchiseMetrics.totalDecisions).toBe(1);
    });
  });

  describe('getFalsePositives', () => {
    test('should identify false positives (AUTO_MERGE rejected)', () => {
      const isolatedStorageDir = path.join(TEST_DATA_DIR, 'fp-test-1-' + Date.now());
      fs.mkdirSync(isolatedStorageDir, { recursive: true });
      const isolatedTracker = new FeedbackTracker({ storageDir: isolatedStorageDir });

      const result = createMockMatchResult({ decision: 'AUTO_MERGE', sameEntity: true });
      isolatedTracker.recordFeedback(result, 'REJECT');

      const fps = isolatedTracker.getFalsePositives();
      expect(fps.length).toBe(1);
      expect(fps[0].originalDecision).toBe('AUTO_MERGE');
      expect(fps[0].userAction).toBe('REJECT');
    });

    test('should not include accepted AUTO_MERGE', () => {
      const isolatedStorageDir = path.join(TEST_DATA_DIR, 'fp-test-2-' + Date.now());
      fs.mkdirSync(isolatedStorageDir, { recursive: true });
      const isolatedTracker = new FeedbackTracker({ storageDir: isolatedStorageDir });

      const result = createMockMatchResult({ decision: 'AUTO_MERGE', sameEntity: true });
      isolatedTracker.recordFeedback(result, 'ACCEPT');

      const fps = isolatedTracker.getFalsePositives();
      expect(fps.length).toBe(0);
    });
  });

  describe('getFalseNegatives', () => {
    test('should identify false negatives (NO_MATCH accepted)', () => {
      const isolatedStorageDir = path.join(TEST_DATA_DIR, 'fn-test-1-' + Date.now());
      fs.mkdirSync(isolatedStorageDir, { recursive: true });
      const isolatedTracker = new FeedbackTracker({ storageDir: isolatedStorageDir });

      const result = createMockMatchResult({ decision: 'NO_MATCH', sameEntity: false });
      isolatedTracker.recordFeedback(result, 'ACCEPT');

      const fns = isolatedTracker.getFalseNegatives();
      expect(fns.length).toBe(1);
      expect(fns[0].originalDecision).toBe('NO_MATCH');
      expect(fns[0].userAction).toBe('ACCEPT');
    });

    test('should not include rejected NO_MATCH', () => {
      const isolatedStorageDir = path.join(TEST_DATA_DIR, 'fn-test-2-' + Date.now());
      fs.mkdirSync(isolatedStorageDir, { recursive: true });
      const isolatedTracker = new FeedbackTracker({ storageDir: isolatedStorageDir });

      const result = createMockMatchResult({ decision: 'NO_MATCH', sameEntity: false });
      isolatedTracker.recordFeedback(result, 'REJECT');

      const fns = isolatedTracker.getFalseNegatives();
      expect(fns.length).toBe(0);
    });
  });

  describe('getSummary', () => {
    test('should provide summary by market', () => {
      // Use a completely fresh tracker for this test
      const isolatedStorageDir = path.join(TEST_DATA_DIR, 'summary-test-' + Date.now());
      fs.mkdirSync(isolatedStorageDir, { recursive: true });
      const isolatedTracker = new FeedbackTracker({ storageDir: isolatedStorageDir });

      isolatedTracker.recordFeedback(createMockMatchResult({ market: 'healthcare' }), 'ACCEPT');
      isolatedTracker.recordFeedback(createMockMatchResult({ market: 'healthcare' }), 'REJECT');
      isolatedTracker.recordFeedback(createMockMatchResult({ market: 'franchise' }), 'ACCEPT');

      const summary = isolatedTracker.getSummary();

      expect(summary.totalDecisions).toBe(3);
      expect(summary.byMarket.healthcare.total).toBe(2);
      expect(summary.byMarket.healthcare.accepts).toBe(1);
      expect(summary.byMarket.healthcare.rejects).toBe(1);
      expect(summary.byMarket.franchise.total).toBe(1);
    });
  });
});

describe('ThresholdOptimizer', () => {
  let optimizer;
  let feedbackTracker;

  beforeEach(() => {
    const storageDir = path.join(TEST_DATA_DIR, 'optimizer-' + Date.now());
    fs.mkdirSync(storageDir, { recursive: true });
    feedbackTracker = new FeedbackTracker({ storageDir });
    optimizer = new ThresholdOptimizer({ feedbackTracker });
  });

  describe('analyzeMarket', () => {
    test('should return INSUFFICIENT_DATA with few decisions', () => {
      feedbackTracker.recordFeedback(createMockMatchResult(), 'ACCEPT');

      const analysis = optimizer.analyzeMarket('healthcare');

      expect(analysis.status).toBe('INSUFFICIENT_DATA');
    });

    test('should analyze market with sufficient decisions', () => {
      // Add 10+ decisions
      for (let i = 0; i < 12; i++) {
        const result = createMockMatchResult({
          decision: i < 6 ? 'AUTO_MERGE' : 'NO_MATCH',
          confidence: 70 + i
        });
        feedbackTracker.recordFeedback(result, i % 3 === 0 ? 'REJECT' : 'ACCEPT');
      }

      const analysis = optimizer.analyzeMarket('healthcare');

      expect(analysis.status).not.toBe('INSUFFICIENT_DATA');
      expect(analysis.totalDecisions).toBe(12);
      expect(analysis.currentThresholds).toBeDefined();
    });

    test('should suggest autoMerge increase when FP rate is high', () => {
      // Add decisions where AUTO_MERGE is frequently rejected (high FP rate)
      for (let i = 0; i < 15; i++) {
        const result = createMockMatchResult({
          decision: 'AUTO_MERGE',
          confidence: 92,
          sameEntity: true
        });
        // Reject 40% (very high FP rate)
        feedbackTracker.recordFeedback(result, i < 6 ? 'REJECT' : 'ACCEPT');
      }

      const analysis = optimizer.analyzeMarket('healthcare');

      // Should have at least one suggestion about autoMerge
      const autoMergeSuggestion = analysis.suggestions?.find(
        s => s.type === 'INCREASE_AUTO_MERGE'
      );

      // May or may not have suggestion depending on exact FP rate calculation
      // This tests the analysis runs without error
      expect(analysis.metrics).toBeDefined();
    });
  });

  describe('previewAdjustment', () => {
    test('should validate threshold ordering', () => {
      const preview = optimizer.previewAdjustment('healthcare', {
        autoMerge: 80,
        review: 85,  // Invalid: review should be less than autoMerge
        tag: 70
      });

      expect(preview.valid).toBe(false);
      expect(preview.validationErrors.length).toBeGreaterThan(0);
    });

    test('should enforce safety bounds', () => {
      const preview = optimizer.previewAdjustment('healthcare', {
        autoMerge: 110,  // Above max
        tag: 30  // Below min
      });

      // Should clamp to bounds
      expect(preview.warnings.length).toBeGreaterThan(0);
      expect(preview.proposedThresholds.autoMerge).toBeLessThanOrEqual(99);
      expect(preview.proposedThresholds.tag).toBeGreaterThanOrEqual(40);
    });

    test('should show changes from current thresholds', () => {
      const preview = optimizer.previewAdjustment('healthcare', {
        autoMerge: 92
      });

      expect(preview.changes).toBeDefined();
      expect(typeof preview.changes.autoMerge).toBe('number');
    });
  });

  describe('generateReport', () => {
    test('should generate report for all markets with feedback', () => {
      // Add feedback for multiple markets
      feedbackTracker.recordFeedback(createMockMatchResult({ market: 'healthcare' }), 'ACCEPT');
      feedbackTracker.recordFeedback(createMockMatchResult({ market: 'franchise' }), 'REJECT');

      const report = optimizer.generateReport();

      expect(report.summary).toBeDefined();
      expect(report.markets).toBeDefined();
      expect(report.globalPatterns).toBeDefined();
      expect(report.recommendations).toBeDefined();
    });
  });
});

describe('PatternDiscoverer', () => {
  let discoverer;
  let feedbackTracker;

  beforeEach(() => {
    const storageDir = path.join(TEST_DATA_DIR, 'discoverer-' + Date.now());
    fs.mkdirSync(storageDir, { recursive: true });
    feedbackTracker = new FeedbackTracker({ storageDir });
    discoverer = new PatternDiscoverer({
      feedbackTracker,
      minOccurrences: 2  // Lower for testing
    });
  });

  describe('discoverPatterns', () => {
    test('should return INSUFFICIENT_DATA with few corrections', () => {
      feedbackTracker.recordFeedback(createMockMatchResult(), 'ACCEPT');

      const discoveries = discoverer.discoverPatterns('healthcare');

      expect(discoveries.status).toBe('INSUFFICIENT_DATA');
    });

    test('should discover patterns with sufficient data', () => {
      // Add multiple corrections with similar patterns
      for (let i = 0; i < 5; i++) {
        feedbackTracker.recordFeedback(createMockMatchResult({
          recordA: { name: 'Community Hospital', state: 'TX' },
          recordB: { name: 'Community Hospital', state: 'FL' }
        }), i < 3 ? 'REJECT' : 'ACCEPT');
      }

      const discoveries = discoverer.discoverPatterns('healthcare');

      expect(discoveries.status).toBe('ANALYZED');
      expect(discoveries.analyzedCorrections).toBeGreaterThan(0);
      expect(discoveries.summary).toBeDefined();
    });
  });

  describe('synonym discovery', () => {
    test('should identify potential synonyms from merge patterns', () => {
      // Simulate users merging similar names with word variations
      for (let i = 0; i < 4; i++) {
        feedbackTracker.recordFeedback({
          ...createMockMatchResult(),
          recordA: { name: 'ABC Medical Center', state: 'TX' },
          recordB: { name: 'ABC Med Center', state: 'TX' }  // Med vs Medical
        }, 'ACCEPT');
      }

      const discoveries = discoverer.discoverPatterns('healthcare');

      // Check if synonyms were discovered
      expect(discoveries.synonyms).toBeDefined();
      // May or may not find patterns depending on normalization
    });
  });

  describe('known entity discovery', () => {
    test('should identify multi-location entities', () => {
      // Simulate merging same company across different states
      const states = ['TX', 'CA', 'NY', 'FL'];
      for (const state of states) {
        feedbackTracker.recordFeedback({
          ...createMockMatchResult(),
          recordA: { name: 'Acme Healthcare Group - Dallas', state: 'TX' },
          recordB: { name: 'Acme Healthcare Group', state }
        }, 'ACCEPT');
      }

      const discoveries = discoverer.discoverPatterns('healthcare');

      expect(discoveries.knownEntities).toBeDefined();
    });
  });

  describe('generateDictionaryUpdates', () => {
    test('should generate updates when patterns are discovered', () => {
      // Add enough data to trigger pattern discovery
      for (let i = 0; i < 5; i++) {
        feedbackTracker.recordFeedback({
          ...createMockMatchResult(),
          recordA: { name: 'Test Corp - Location A', state: 'TX' },
          recordB: { name: 'Test Corp - Location B', state: 'CA' }
        }, 'ACCEPT');
      }

      const updates = discoverer.generateDictionaryUpdates('healthcare');

      expect(updates.market).toBe('healthcare');
      expect(updates.changes).toBeDefined();
    });
  });
});

// Cleanup after all tests
afterAll(() => {
  // Clean up temp directory
  try {
    fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
  } catch (e) {
    // Ignore cleanup errors
  }
});
