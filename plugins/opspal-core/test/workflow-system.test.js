/**
 * Workflow System Tests
 *
 * Tests for Phase 5: Review Workflow Enhancement
 * - ReviewQueueManager (queue management)
 * - ExplanationGenerator (human-readable explanations)
 * - AuditTrail (compliance logging)
 * - createWorkflowSystem (integrated workflow)
 */

'use strict';

const {
  ReviewQueueManager,
  ExplanationGenerator,
  AuditTrail,
  REVIEW_STATUS,
  SUGGESTED_ACTIONS,
  PRIORITY,
  SIGNAL_TEMPLATES,
  MARKET_DESCRIPTIONS,
  CONFIDENCE_LEVELS,
  DECISION_DESCRIPTIONS,
  AUDIT_EVENTS,
  DECISION_ACTIONS,
  createWorkflowSystem
} = require('../scripts/lib/workflow');

// ========== Test Data ==========

const sampleMatchResult = {
  confidence: 75,
  decision: 'REVIEW',
  market: 'healthcare',
  signals: [
    { type: 'SHARED_DOMAIN', weight: 15, value: 'acme-health.com' },
    { type: 'BASE_NAME_MATCH', weight: 20 },
    { type: 'STATE_MISMATCH', weight: -10, valueA: 'CA', valueB: 'TX' }
  ],
  recordA: { Id: 'rec1', Name: 'Acme Health - CA', State: 'CA', Domain: 'acme-health.com' },
  recordB: { Id: 'rec2', Name: 'Acme Health - TX', State: 'TX', Domain: 'acme-health.com' }
};

const highConfidenceResult = {
  confidence: 92,
  decision: 'AUTO_MERGE',
  market: 'franchise',
  signals: [
    { type: 'SHARED_DOMAIN', weight: 15, value: 'pizzapalace.com' },
    { type: 'EXACT_NAME_MATCH', weight: 25 },
    { type: 'KNOWN_FRANCHISE', weight: 20, value: 'Pizza Palace' }
  ],
  recordA: { Id: 'f1', Name: 'Pizza Palace #123', State: 'CA', Domain: 'pizzapalace.com' },
  recordB: { Id: 'f2', Name: 'Pizza Palace #456', State: 'TX', Domain: 'pizzapalace.com' }
};

const lowConfidenceResult = {
  confidence: 45,
  decision: 'NO_MATCH',
  market: 'government',
  signals: [
    { type: 'PARTIAL_NAME_MATCH', weight: 5 },
    { type: 'DIFFERENT_STATE', weight: -15, valueA: 'CA', valueB: 'NY' }
  ],
  recordA: { Id: 'g1', Name: 'City of Springfield', State: 'CA' },
  recordB: { Id: 'g2', Name: 'City of Springfield', State: 'NY' }
};

// ========== ReviewQueueManager Tests ==========

describe('ReviewQueueManager', () => {
  let queue;

  beforeEach(() => {
    queue = new ReviewQueueManager();
  });

  describe('addToQueue', () => {
    test('adds match result to pending queue', () => {
      const item = queue.addToQueue(sampleMatchResult);

      expect(item.id).toBeDefined();
      expect(item.status).toBe(REVIEW_STATUS.PENDING);
      expect(item.matchResult).toBe(sampleMatchResult);
      expect(item.context).toBeDefined();
      expect(item.priority).toBeDefined();
      expect(item.suggestedAction).toBeDefined();
    });

    test('assigns correct priority for healthcare market', () => {
      const item = queue.addToQueue(sampleMatchResult);
      // Healthcare with borderline confidence should be CRITICAL or HIGH
      expect([PRIORITY.CRITICAL, PRIORITY.HIGH]).toContain(item.priority);
    });

    test('assigns lower priority for franchise market', () => {
      const item = queue.addToQueue({
        ...highConfidenceResult,
        confidence: 75,
        decision: 'REVIEW'
      });
      expect([PRIORITY.HIGH, PRIORITY.MEDIUM]).toContain(item.priority);
    });

    test('gathers context for the match', () => {
      const item = queue.addToQueue(sampleMatchResult);

      expect(item.context.signals).toBeDefined();
      expect(item.context.marketPolicy).toBeDefined();
      expect(item.context.dataQuality).toBeDefined();
      expect(item.context.riskFactors).toBeDefined();
    });

    test('calls onItemAdded callback', () => {
      const callback = jest.fn();
      queue = new ReviewQueueManager({ onItemAdded: callback });

      const item = queue.addToQueue(sampleMatchResult);

      expect(callback).toHaveBeenCalledWith(item);
    });

    test('updates statistics', () => {
      queue.addToQueue(sampleMatchResult);
      const stats = queue.getStats();

      expect(stats.totalAdded).toBe(1);
      expect(stats.byMarket.healthcare.added).toBe(1);
    });
  });

  describe('suggested actions', () => {
    test('suggests MERGE for high confidence', () => {
      const result = { ...sampleMatchResult, confidence: 85 };
      const item = queue.addToQueue(result);
      expect(item.suggestedAction).toBe(SUGGESTED_ACTIONS.MERGE);
    });

    test('suggests SKIP for low confidence', () => {
      const item = queue.addToQueue(lowConfidenceResult);
      expect(item.suggestedAction).toBe(SUGGESTED_ACTIONS.SKIP);
    });

    test('suggests INVESTIGATE when conflicting signals', () => {
      const item = queue.addToQueue(sampleMatchResult);
      // Has STATE_MISMATCH with negative weight
      expect([SUGGESTED_ACTIONS.INVESTIGATE, SUGGESTED_ACTIONS.FLAG]).toContain(item.suggestedAction);
    });
  });

  describe('getNextItems', () => {
    beforeEach(() => {
      queue.addToQueue(sampleMatchResult);
      queue.addToQueue({ ...highConfidenceResult, confidence: 75, decision: 'REVIEW' });
      queue.addToQueue({ ...lowConfidenceResult, confidence: 55, decision: 'REVIEW' });
    });

    test('returns items sorted by priority', () => {
      const items = queue.getNextItems({ limit: 10 });

      expect(items.length).toBe(3);
      // Lower priority number = higher priority
      for (let i = 1; i < items.length; i++) {
        expect(items[i - 1].priority).toBeLessThanOrEqual(items[i].priority);
      }
    });

    test('respects limit', () => {
      const items = queue.getNextItems({ limit: 2 });
      expect(items.length).toBe(2);
    });

    test('filters by market', () => {
      const items = queue.getNextItems({ market: 'healthcare' });
      expect(items.every(i => i.matchResult.market === 'healthcare')).toBe(true);
    });

    test('filters by priority', () => {
      const items = queue.getNextItems({ priority: PRIORITY.CRITICAL });
      expect(items.every(i => i.priority === PRIORITY.CRITICAL)).toBe(true);
    });
  });

  describe('claimItem / releaseItem', () => {
    test('moves item to in-progress when claimed', () => {
      const added = queue.addToQueue(sampleMatchResult);
      const claimed = queue.claimItem(added.id, 'user123');

      expect(claimed.status).toBe(REVIEW_STATUS.IN_PROGRESS);
      expect(claimed.assignee).toBe('user123');
      expect(claimed.claimedAt).toBeDefined();
      expect(queue.getStats().queueSizes.pending).toBe(0);
      expect(queue.getStats().queueSizes.inProgress).toBe(1);
    });

    test('moves item back to pending when released', () => {
      const added = queue.addToQueue(sampleMatchResult);
      queue.claimItem(added.id, 'user123');
      const released = queue.releaseItem(added.id);

      expect(released.status).toBe(REVIEW_STATUS.PENDING);
      expect(released.assignee).toBeNull();
      expect(queue.getStats().queueSizes.pending).toBe(1);
      expect(queue.getStats().queueSizes.inProgress).toBe(0);
    });

    test('throws error for non-existent item', () => {
      expect(() => queue.claimItem('nonexistent', 'user123')).toThrow();
    });
  });

  describe('completeReview', () => {
    test('moves item to completed with decision', () => {
      const added = queue.addToQueue(sampleMatchResult);
      queue.claimItem(added.id, 'user123');

      const completed = queue.completeReview(added.id, {
        decision: DECISION_ACTIONS.MERGE,
        rationale: 'Same company, different locations'
      });

      expect(completed.status).toBe(REVIEW_STATUS.COMPLETED);
      expect(completed.decision).toBe(DECISION_ACTIONS.MERGE);
      expect(completed.reviewerRationale).toBe('Same company, different locations');
      expect(completed.completedAt).toBeDefined();
    });

    test('tracks review time', () => {
      const added = queue.addToQueue(sampleMatchResult);
      queue.claimItem(added.id, 'user123');

      const completed = queue.completeReview(added.id, {
        decision: DECISION_ACTIONS.SKIP
      });

      expect(completed.reviewTimeMs).toBeGreaterThanOrEqual(0);
    });

    test('updates statistics', () => {
      const added = queue.addToQueue(sampleMatchResult);
      queue.claimItem(added.id, 'user123');
      queue.completeReview(added.id, { decision: DECISION_ACTIONS.MERGE });

      const stats = queue.getStats();
      expect(stats.totalCompleted).toBe(1);
      expect(stats.byDecision[DECISION_ACTIONS.MERGE]).toBe(1);
    });

    test('calls onItemCompleted callback', () => {
      const callback = jest.fn();
      queue = new ReviewQueueManager({ onItemCompleted: callback });

      const added = queue.addToQueue(sampleMatchResult);
      queue.claimItem(added.id, 'user123');
      const completed = queue.completeReview(added.id, { decision: DECISION_ACTIONS.SKIP });

      expect(callback).toHaveBeenCalledWith(completed);
    });
  });

  describe('deferItem / escalateItem', () => {
    test('defers item with reason', () => {
      const added = queue.addToQueue(sampleMatchResult);
      const deferred = queue.deferItem(added.id, {
        reason: 'Need more information',
        deferUntil: '2026-02-01'
      });

      expect(deferred.status).toBe(REVIEW_STATUS.DEFERRED);
      expect(deferred.deferReason).toBe('Need more information');
      expect(queue.getStats().queueSizes.deferred).toBe(1);
    });

    test('escalates item to senior reviewer', () => {
      const added = queue.addToQueue(sampleMatchResult);
      const escalated = queue.escalateItem(added.id, {
        reason: 'Complex compliance question',
        escalateTo: 'senior_reviewer'
      });

      expect(escalated.status).toBe(REVIEW_STATUS.ESCALATED);
      expect(escalated.priority).toBe(PRIORITY.CRITICAL);
      expect(queue.getStats().queueSizes.escalated).toBe(1);
    });
  });

  describe('searchItems', () => {
    beforeEach(() => {
      queue.addToQueue(sampleMatchResult);
      queue.addToQueue({ ...highConfidenceResult, confidence: 75, decision: 'REVIEW' });
    });

    test('searches by market', () => {
      const items = queue.searchItems({ market: 'healthcare' });
      expect(items.length).toBe(1);
      expect(items[0].matchResult.market).toBe('healthcare');
    });

    test('searches by confidence range', () => {
      const items = queue.searchItems({ confidence: [70, 80] });
      expect(items.length).toBe(2);
    });

    test('searches by status', () => {
      const items = queue.searchItems({ status: REVIEW_STATUS.PENDING });
      expect(items.every(i => i.status === REVIEW_STATUS.PENDING)).toBe(true);
    });
  });

  describe('exportState / importState', () => {
    test('exports and imports queue state', () => {
      queue.addToQueue(sampleMatchResult);
      queue.addToQueue(highConfidenceResult);

      const exported = queue.exportState();

      const newQueue = new ReviewQueueManager();
      newQueue.importState(exported);

      expect(newQueue.getStats().queueSizes.pending).toBe(2);
    });
  });
});

// ========== ExplanationGenerator Tests ==========

describe('ExplanationGenerator', () => {
  let explainer;

  beforeEach(() => {
    explainer = new ExplanationGenerator();
  });

  describe('explain', () => {
    test('generates full explanation for match result', () => {
      const explanation = explainer.explain(sampleMatchResult);

      expect(explanation).toContain('Match Analysis');
      expect(explanation).toContain('Acme Health');
      expect(explanation).toContain('75%');
      expect(explanation).toContain('Evidence');
    });

    test('includes market context when available', () => {
      const explanation = explainer.explain(sampleMatchResult, {
        includeContext: true
      });

      expect(explanation).toContain('Healthcare');
      expect(explanation).toContain('HIGH risk');
    });

    test('includes recommendation section', () => {
      const explanation = explainer.explain(sampleMatchResult, {
        includeRecommendation: true
      });

      expect(explanation).toContain('Recommendation');
    });

    test('handles verbose mode with comparison table', () => {
      const explanation = explainer.explain(sampleMatchResult, {
        verbose: true
      });

      expect(explanation).toContain('Field Comparison');
      expect(explanation).toContain('Record A');
      expect(explanation).toContain('Record B');
    });
  });

  describe('explainBrief', () => {
    test('generates one-liner explanation', () => {
      const brief = explainer.explainBrief(sampleMatchResult);

      expect(brief).toBeDefined();
      expect(brief.length).toBeLessThan(200);
      expect(brief).toContain('75%');
    });

    test('includes decision icon', () => {
      const brief = explainer.explainBrief(highConfidenceResult);
      expect(brief).toContain('✅');
    });
  });

  describe('describeSignal', () => {
    test('describes positive signal with template', () => {
      const signal = { type: 'SHARED_DOMAIN', weight: 15, value: 'example.com' };
      const description = explainer.describeSignal(signal);

      expect(description).toContain('🌐');
      expect(description).toContain('example.com');
    });

    test('describes negative signal with template', () => {
      const signal = { type: 'STATE_MISMATCH', weight: -10, valueA: 'CA', valueB: 'NY' };
      const description = explainer.describeSignal(signal);

      expect(description).toContain('CA');
      expect(description).toContain('NY');
    });

    test('handles string signals', () => {
      const description = explainer.describeSignal('SHARED_DOMAIN');
      expect(description).toContain('🌐');
    });

    test('handles unknown signal types', () => {
      const signal = { type: 'UNKNOWN_SIGNAL', weight: 5 };
      const description = explainer.describeSignal(signal);
      expect(description).toContain('Unknown Signal');
    });
  });

  describe('describeMarket', () => {
    test('describes known market', () => {
      const description = explainer.describeMarket('healthcare');
      expect(description).toContain('Healthcare');
      expect(description).toContain('HIGH risk');
    });

    test('handles unknown market', () => {
      const description = explainer.describeMarket('unknown_market');
      expect(description).toContain('Unknown market');
    });
  });

  describe('generateComparisonTable', () => {
    test('generates markdown table', () => {
      const table = explainer.generateComparisonTable(
        sampleMatchResult.recordA,
        sampleMatchResult.recordB
      );

      expect(table).toContain('| Field |');
      expect(table).toContain('| Name |');
      expect(table).toContain('| State |');
    });

    test('indicates matching fields', () => {
      const table = explainer.generateComparisonTable(
        { Name: 'Same', State: 'CA' },
        { Name: 'Same', State: 'NY' }
      );

      expect(table).toContain('✓');  // Name match
      expect(table).toContain('✗');  // State mismatch
    });
  });

  describe('interpretConfidence', () => {
    test('interprets very high confidence', () => {
      const interpretation = explainer.interpretConfidence(95);
      expect(interpretation.level).toBe('Very High');
    });

    test('interprets moderate confidence', () => {
      const interpretation = explainer.interpretConfidence(70);
      expect(interpretation.level).toBe('Moderate');
    });

    test('interprets low confidence', () => {
      const interpretation = explainer.interpretConfidence(52);
      expect(interpretation.level).toBe('Low');
    });
  });

  describe('generateRecommendation', () => {
    test('generates recommendation with rationale', () => {
      const rec = explainer.generateRecommendation(sampleMatchResult);

      expect(rec.action).toBeDefined();
      expect(rec.rationale).toBeDefined();
      expect(rec.positiveSignals).toBeDefined();
      expect(rec.negativeSignals).toBeDefined();
    });

    test('includes market warning for high-risk markets', () => {
      const rec = explainer.generateRecommendation(sampleMatchResult);
      expect(rec.rationale).toContain('Healthcare');
    });
  });
});

// ========== AuditTrail Tests ==========

describe('AuditTrail', () => {
  let audit;

  beforeEach(() => {
    audit = new AuditTrail({
      enableIntegrityCheck: true
    });
  });

  describe('logDecision', () => {
    test('logs decision with full context', () => {
      const entry = audit.logDecision(sampleMatchResult, DECISION_ACTIONS.MERGE, {
        user: 'user123',
        rationale: 'Same company'
      });

      expect(entry.id).toBeDefined();
      expect(entry.eventType).toBe(AUDIT_EVENTS.DECISION_MADE);
      expect(entry.data.action).toBe(DECISION_ACTIONS.MERGE);
      expect(entry.data.user).toBe('user123');
      expect(entry.data.rationale).toBe('Same company');
    });

    test('sanitizes match result data', () => {
      const entry = audit.logDecision(sampleMatchResult, DECISION_ACTIONS.SKIP);

      expect(entry.data.matchResult.confidence).toBeDefined();
      expect(entry.data.matchResult.decision).toBeDefined();
      // Should not contain full record details
      expect(entry.data.matchResult.recordA.Domain).toBeUndefined();
    });

    test('includes chain hash for integrity', () => {
      const entry = audit.logDecision(sampleMatchResult, DECISION_ACTIONS.MERGE);

      expect(entry.hash).toBeDefined();
      expect(entry.prevHash).toBeDefined();
    });

    test('updates statistics', () => {
      audit.logDecision(sampleMatchResult, DECISION_ACTIONS.MERGE);
      const stats = audit.getStats();

      expect(stats.totalEvents).toBe(1);
      expect(stats.byAction[DECISION_ACTIONS.MERGE]).toBe(1);
      expect(stats.byMarket.healthcare).toBe(1);
    });
  });

  describe('logMerge', () => {
    test('logs merge operation', () => {
      const entry = audit.logMerge({
        masterId: 'rec1',
        survivorIds: ['rec2'],
        mergedFields: ['Name', 'Domain'],
        originalRecords: [sampleMatchResult.recordA, sampleMatchResult.recordB]
      });

      expect(entry.eventType).toBe(AUDIT_EVENTS.RECORD_MERGED);
      expect(entry.data.masterId).toBe('rec1');
      expect(entry.data.survivorIds).toContain('rec2');
    });
  });

  describe('logConfigChange', () => {
    test('logs threshold change', () => {
      const entry = audit.logConfigChange('threshold', {
        previous: { autoMerge: 85 },
        current: { autoMerge: 90 },
        markets: ['healthcare']
      });

      expect(entry.eventType).toBe(AUDIT_EVENTS.THRESHOLD_CHANGED);
      expect(entry.data.previousValue.autoMerge).toBe(85);
      expect(entry.data.newValue.autoMerge).toBe(90);
    });
  });

  describe('logBatchProcess', () => {
    test('logs batch processing results', () => {
      const entry = audit.logBatchProcess({
        totalRecords: 1000,
        matches: 150,
        autoMerged: 50,
        sentToReview: 75,
        skipped: 25,
        processingTime: 5000
      });

      expect(entry.eventType).toBe(AUDIT_EVENTS.BATCH_PROCESSED);
      expect(entry.data.totalRecords).toBe(1000);
    });
  });

  describe('query', () => {
    beforeEach(() => {
      audit.logDecision(sampleMatchResult, DECISION_ACTIONS.MERGE, { user: 'user1' });
      audit.logDecision(highConfidenceResult, DECISION_ACTIONS.AUTO_MERGE, { user: 'system', automated: true });
      audit.logDecision(lowConfidenceResult, DECISION_ACTIONS.SKIP, { user: 'user2' });
    });

    test('queries by event type', () => {
      const results = audit.query({ eventType: AUDIT_EVENTS.DECISION_MADE });
      expect(results.length).toBe(3);
    });

    test('queries by action', () => {
      const results = audit.query({ action: DECISION_ACTIONS.MERGE });
      expect(results.length).toBe(1);
    });

    test('queries by user', () => {
      const results = audit.query({ user: 'user1' });
      expect(results.length).toBe(1);
    });

    test('queries by market', () => {
      const results = audit.query({ market: 'healthcare' });
      expect(results.length).toBe(1);
    });

    test('queries automated only', () => {
      const results = audit.query({ automated: true });
      expect(results.length).toBe(1);
    });

    test('respects limit', () => {
      const results = audit.query({ limit: 2 });
      expect(results.length).toBe(2);
    });
  });

  describe('verifyIntegrity', () => {
    test('verifies intact chain', () => {
      audit.logDecision(sampleMatchResult, DECISION_ACTIONS.MERGE);
      audit.logDecision(highConfidenceResult, DECISION_ACTIONS.SKIP);

      const result = audit.verifyIntegrity();

      expect(result.verified).toBe(true);
      expect(result.issues.length).toBe(0);
    });

    test('detects tampered entries', () => {
      audit.logDecision(sampleMatchResult, DECISION_ACTIONS.MERGE);

      // Tamper with the entry
      audit.logs[0].data.action = 'TAMPERED';

      const result = audit.verifyIntegrity();

      expect(result.verified).toBe(false);
      expect(result.issues.length).toBeGreaterThan(0);
    });
  });

  describe('exportLog', () => {
    test('exports log with statistics', () => {
      audit.logDecision(sampleMatchResult, DECISION_ACTIONS.MERGE);
      audit.logDecision(highConfidenceResult, DECISION_ACTIONS.SKIP);

      const exported = audit.exportLog();

      expect(exported.exportId).toBeDefined();
      expect(exported.totalEntries).toBe(2);
      expect(exported.statistics).toBeDefined();
      expect(exported.integrityHash).toBeDefined();
    });

    test('exports to CSV format', () => {
      audit.logDecision(sampleMatchResult, DECISION_ACTIONS.MERGE);

      const exported = audit.exportLog({ format: 'csv' });

      expect(exported.format).toBe('csv');
      expect(exported.content).toContain('ID,Timestamp');
    });
  });

  describe('getRecordHistory', () => {
    test('returns history for a record', () => {
      audit.logDecision(sampleMatchResult, DECISION_ACTIONS.MERGE);
      audit.logDecision({
        ...sampleMatchResult,
        recordB: { Id: 'rec3', Name: 'Other' }
      }, DECISION_ACTIONS.SKIP);

      const history = audit.getRecordHistory('rec1');

      expect(history.length).toBe(2);
    });
  });

  describe('getUserActivity', () => {
    test('returns user activity summary', () => {
      audit.logDecision(sampleMatchResult, DECISION_ACTIONS.MERGE, { user: 'user1' });
      audit.logDecision(highConfidenceResult, DECISION_ACTIONS.SKIP, { user: 'user1' });
      audit.logDecision(lowConfidenceResult, DECISION_ACTIONS.FLAG, { user: 'user2' });

      const activity = audit.getUserActivity('user1');

      expect(activity.totalActions).toBe(2);
      expect(activity.byAction[DECISION_ACTIONS.MERGE]).toBe(1);
      expect(activity.byAction[DECISION_ACTIONS.SKIP]).toBe(1);
    });
  });
});

// ========== createWorkflowSystem Integration Tests ==========

describe('createWorkflowSystem', () => {
  let workflow;

  beforeEach(() => {
    workflow = createWorkflowSystem();
  });

  describe('processMatchResult', () => {
    test('auto-merges high confidence results', () => {
      const result = workflow.processMatchResult(highConfidenceResult);

      expect(result.workflowAction).toBe('AUTO_MERGE');
      expect(result.reviewItem).toBeNull();
    });

    test('sends medium confidence to review', () => {
      const result = workflow.processMatchResult(sampleMatchResult);

      expect(result.workflowAction).toBe('REVIEW');
      expect(result.reviewItem).toBeDefined();
      expect(result.reviewItem.id).toBeDefined();
    });

    test('auto-skips low confidence results', () => {
      const result = workflow.processMatchResult(lowConfidenceResult);

      expect(result.workflowAction).toBe('AUTO_SKIP');
    });

    test('includes brief explanation', () => {
      const result = workflow.processMatchResult(sampleMatchResult);

      expect(result.explanation).toBeDefined();
      expect(result.explanation.length).toBeGreaterThan(0);
    });
  });

  describe('explain', () => {
    test('generates full explanation', () => {
      const explanation = workflow.explain(sampleMatchResult);

      expect(explanation).toContain('Match Analysis');
      expect(explanation).toContain('Evidence');
    });
  });

  describe('completeReview', () => {
    test('completes review and logs to audit', () => {
      const processed = workflow.processMatchResult(sampleMatchResult);
      const completed = workflow.completeReview(processed.reviewItem.id, {
        decision: DECISION_ACTIONS.MERGE,
        rationale: 'Same company'
      });

      expect(completed.status).toBe(REVIEW_STATUS.COMPLETED);

      // Check audit trail has the decision
      const auditStats = workflow.audit.getStats();
      expect(auditStats.totalEvents).toBeGreaterThan(0);
    });

    test('logs merge when decision is MERGE', () => {
      const processed = workflow.processMatchResult(sampleMatchResult);
      workflow.completeReview(processed.reviewItem.id, {
        decision: DECISION_ACTIONS.MERGE
      });

      const mergeEvents = workflow.audit.query({ eventType: AUDIT_EVENTS.RECORD_MERGED });
      expect(mergeEvents.length).toBe(1);
    });
  });

  describe('processBatch', () => {
    test('processes batch of results', () => {
      const results = [
        highConfidenceResult,
        sampleMatchResult,
        lowConfidenceResult
      ];

      const summary = workflow.processBatch(results);

      expect(summary.total).toBe(3);
      expect(summary.autoMerged).toBe(1);
      expect(summary.sentToReview).toBe(1);
      expect(summary.autoSkipped).toBe(1);
      expect(summary.processingTime).toBeGreaterThanOrEqual(0);
    });

    test('logs batch processing to audit', () => {
      const results = [highConfidenceResult, sampleMatchResult];
      workflow.processBatch(results);

      const batchEvents = workflow.audit.query({ eventType: AUDIT_EVENTS.BATCH_PROCESSED });
      expect(batchEvents.length).toBe(1);
    });
  });

  describe('getDashboardData', () => {
    test('returns dashboard data', () => {
      workflow.processMatchResult(sampleMatchResult);
      workflow.processMatchResult(highConfidenceResult);

      const dashboard = workflow.getDashboardData();

      expect(dashboard.queue).toBeDefined();
      expect(dashboard.queue.pending).toBeGreaterThanOrEqual(0);
      expect(dashboard.decisions).toBeDefined();
      expect(dashboard.pendingByPriority).toBeDefined();
    });
  });

  describe('exportComplianceReport', () => {
    test('exports compliance report with integrity check', () => {
      workflow.processMatchResult(sampleMatchResult);
      workflow.processMatchResult(highConfidenceResult);

      const report = workflow.exportComplianceReport();

      expect(report.exportId).toBeDefined();
      expect(report.integrityCheck).toBeDefined();
      expect(report.integrityCheck.verified).toBe(true);
      expect(report.queueStatus).toBeDefined();
    });
  });
});

// ========== Constants Tests ==========

describe('Constants', () => {
  test('REVIEW_STATUS has all expected values', () => {
    expect(REVIEW_STATUS.PENDING).toBe('PENDING');
    expect(REVIEW_STATUS.IN_PROGRESS).toBe('IN_PROGRESS');
    expect(REVIEW_STATUS.COMPLETED).toBe('COMPLETED');
    expect(REVIEW_STATUS.DEFERRED).toBe('DEFERRED');
    expect(REVIEW_STATUS.ESCALATED).toBe('ESCALATED');
  });

  test('PRIORITY has correct ordering', () => {
    expect(PRIORITY.CRITICAL).toBeLessThan(PRIORITY.HIGH);
    expect(PRIORITY.HIGH).toBeLessThan(PRIORITY.MEDIUM);
    expect(PRIORITY.MEDIUM).toBeLessThan(PRIORITY.LOW);
  });

  test('SIGNAL_TEMPLATES has common signals', () => {
    expect(SIGNAL_TEMPLATES.SHARED_DOMAIN).toBeDefined();
    expect(SIGNAL_TEMPLATES.BASE_NAME_MATCH).toBeDefined();
    expect(SIGNAL_TEMPLATES.STATE_MISMATCH).toBeDefined();
  });

  test('MARKET_DESCRIPTIONS has major markets', () => {
    expect(MARKET_DESCRIPTIONS.healthcare).toBeDefined();
    expect(MARKET_DESCRIPTIONS.franchise).toBeDefined();
    expect(MARKET_DESCRIPTIONS.government).toBeDefined();
  });

  test('CONFIDENCE_LEVELS covers full range', () => {
    expect(CONFIDENCE_LEVELS.VERY_HIGH.min).toBeGreaterThanOrEqual(90);
    expect(CONFIDENCE_LEVELS.VERY_LOW.min).toBe(0);
  });

  test('AUDIT_EVENTS has all event types', () => {
    expect(AUDIT_EVENTS.DECISION_MADE).toBeDefined();
    expect(AUDIT_EVENTS.RECORD_MERGED).toBeDefined();
    expect(AUDIT_EVENTS.BATCH_PROCESSED).toBeDefined();
  });

  test('DECISION_ACTIONS has all actions', () => {
    expect(DECISION_ACTIONS.MERGE).toBe('MERGE');
    expect(DECISION_ACTIONS.SKIP).toBe('SKIP');
    expect(DECISION_ACTIONS.AUTO_MERGE).toBe('AUTO_MERGE');
  });
});
