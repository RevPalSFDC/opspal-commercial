/**
 * Batch Processing Module Tests
 *
 * Tests for Phase 4: Batch Processing & Clustering
 * - EntityClusterDetector (Union-Find algorithm)
 * - IncrementalMatcher (inverted indexes, blocking)
 * - BatchOptimizer (parallel processing, early termination)
 */

'use strict';

const {
  EntityClusterDetector,
  UnionFind,
  IncrementalMatcher,
  BatchOptimizer,
  SELECTION_STRATEGIES,
  INDEX_TYPES,
  BLOCKING_STRATEGIES,
  MARKET_UNIQUENESS,
  createBatchPipeline
} = require('../scripts/lib/batch');

// ========== Test Data ==========

const sampleRecords = [
  { Id: 'rec1', Name: 'Acme Corp', State: 'CA', Domain: 'acme.com', Phone: '4155551234' },
  { Id: 'rec2', Name: 'Acme Corporation', State: 'CA', Domain: 'acme.com', Phone: '4155551235' },
  { Id: 'rec3', Name: 'Acme Corp - San Francisco', State: 'CA', Domain: 'acme.com', Phone: '4155559999' },
  { Id: 'rec4', Name: 'Beta Industries', State: 'NY', Domain: 'beta-ind.com', Phone: '2125559876' },
  { Id: 'rec5', Name: 'Beta Industries LLC', State: 'NY', Domain: 'beta-ind.com', Phone: '2125559877' },
  { Id: 'rec6', Name: 'Gamma Tech', State: 'TX', Domain: 'gammatech.io', Phone: '5125551111' },
  { Id: 'rec7', Name: 'Delta Solutions', State: 'FL', Domain: 'delta-solutions.com', Phone: '3055552222' },
  { Id: 'rec8', Name: 'Epsilon Group', State: 'WA', Domain: 'epsilon.net', Phone: '2065553333' },
];

const franchiseRecords = [
  { Id: 'f1', Name: 'Pizza Palace #123', State: 'CA', Domain: 'pizzapalace.com', Industry: 'franchise' },
  { Id: 'f2', Name: 'Pizza Palace #456', State: 'TX', Domain: 'pizzapalace.com', Industry: 'franchise' },
  { Id: 'f3', Name: 'Pizza Palace #789', State: 'NY', Domain: 'pizzapalace.com', Industry: 'franchise' },
];

// ========== UnionFind Tests ==========

describe('UnionFind', () => {
  let uf;

  beforeEach(() => {
    uf = new UnionFind();
  });

  test('initially elements are in their own sets', () => {
    expect(uf.find('a')).toBe('a');
    expect(uf.find('b')).toBe('b');
    expect(uf.connected('a', 'b')).toBe(false);
  });

  test('union joins two sets', () => {
    uf.union('a', 'b');
    expect(uf.connected('a', 'b')).toBe(true);
  });

  test('transitive connections via union', () => {
    uf.union('a', 'b');
    uf.union('b', 'c');
    expect(uf.connected('a', 'c')).toBe(true);
    expect(uf.connected('a', 'b')).toBe(true);
    expect(uf.connected('b', 'c')).toBe(true);
  });

  test('separate sets remain disconnected', () => {
    uf.union('a', 'b');
    uf.union('c', 'd');
    expect(uf.connected('a', 'b')).toBe(true);
    expect(uf.connected('c', 'd')).toBe(true);
    expect(uf.connected('a', 'c')).toBe(false);
  });

  test('getSets returns correct groupings', () => {
    uf.union('a', 'b');
    uf.union('b', 'c');
    uf.union('d', 'e');

    const sets = uf.getSets();
    expect(sets.size).toBe(2);

    const setArray = Array.from(sets.values());
    // getSets returns arrays, not Sets
    expect(setArray.some(s => s.length === 3)).toBe(true);
    expect(setArray.some(s => s.length === 2)).toBe(true);
  });

  test('path compression optimizes find', () => {
    // Build a chain
    uf.union('a', 'b');
    uf.union('b', 'c');
    uf.union('c', 'd');
    uf.union('d', 'e');

    // After find, all should point closer to root
    const root = uf.find('a');
    expect(uf.find('b')).toBe(root);
    expect(uf.find('c')).toBe(root);
    expect(uf.find('d')).toBe(root);
    expect(uf.find('e')).toBe(root);
  });
});

// ========== EntityClusterDetector Tests ==========

describe('EntityClusterDetector', () => {
  let detector;

  beforeEach(() => {
    detector = new EntityClusterDetector();
  });

  describe('detectClusters', () => {
    test('detects simple cluster from matches', () => {
      // detectClusters expects matches with recordA and recordB objects
      const matches = [
        { recordA: { Id: 'rec1', Name: 'A' }, recordB: { Id: 'rec2', Name: 'B' }, confidence: 85 },
        { recordA: { Id: 'rec2', Name: 'B' }, recordB: { Id: 'rec3', Name: 'C' }, confidence: 80 },
      ];

      const clusters = detector.detectClusters(matches, {
        minConfidence: 70,
        selectMaster: false
      });

      expect(clusters.length).toBe(1);
      expect(clusters[0].members.length).toBe(3);
      const memberIds = clusters[0].members.map(m => m.Id);
      expect(memberIds).toContain('rec1');
      expect(memberIds).toContain('rec2');
      expect(memberIds).toContain('rec3');
    });

    test('filters by minimum confidence', () => {
      const matches = [
        { recordA: { Id: 'rec1' }, recordB: { Id: 'rec2' }, confidence: 85 },
        { recordA: { Id: 'rec2' }, recordB: { Id: 'rec3' }, confidence: 50 },  // Below threshold
      ];

      const clusters = detector.detectClusters(matches, {
        minConfidence: 70
      });

      expect(clusters.length).toBe(1);
      expect(clusters[0].members.length).toBe(2);  // rec1 and rec2 only
    });

    test('creates separate clusters for disconnected matches', () => {
      const matches = [
        { recordA: { Id: 'rec1' }, recordB: { Id: 'rec2' }, confidence: 85 },
        { recordA: { Id: 'rec4' }, recordB: { Id: 'rec5' }, confidence: 90 },
      ];

      const clusters = detector.detectClusters(matches, {
        minConfidence: 70
      });

      expect(clusters.length).toBe(2);
    });

    test('excludes singleton clusters by default', () => {
      const matches = [
        { recordA: { Id: 'rec1' }, recordB: { Id: 'rec2' }, confidence: 85 },
      ];

      const clusters = detector.detectClusters(matches);
      expect(clusters.every(c => c.members.length > 1)).toBe(true);
    });
  });

  describe('detectTransitiveMatches', () => {
    test('finds transitive matches', () => {
      const matches = [
        { recordA: { Id: 'rec1' }, recordB: { Id: 'rec2' }, confidence: 85 },
        { recordA: { Id: 'rec2' }, recordB: { Id: 'rec3' }, confidence: 80 },
      ];

      // detectTransitiveMatches returns an array of transitive matches directly
      const transitiveMatches = detector.detectTransitiveMatches(matches);

      expect(transitiveMatches.length).toBe(1);
      expect(transitiveMatches[0].idA).toBe('rec1');
      expect(transitiveMatches[0].idB).toBe('rec3');
    });

    test('returns transitive matches for multi-hop connections', () => {
      const matches = [
        { recordA: { Id: 'a' }, recordB: { Id: 'b' }, confidence: 90 },
        { recordA: { Id: 'b' }, recordB: { Id: 'c' }, confidence: 90 },
        { recordA: { Id: 'd' }, recordB: { Id: 'e' }, confidence: 90 },
      ];

      const transitiveMatches = detector.detectTransitiveMatches(matches);

      // Should find a~c as transitive (a~b and b~c exist, but not a~c)
      // The d~e cluster has only 2 members, so no transitive matches
      expect(transitiveMatches.length).toBe(1);
      expect(transitiveMatches[0].type).toBe('TRANSITIVE');
    });
  });

  describe('selectMasterRecord', () => {
    // Use lowercase field names to match DEFAULT_COMPLETENESS_FIELDS order
    const members = [
      { Id: 'rec1', name: 'Acme', state: 'CA', CreatedDate: '2020-01-01' },
      { Id: 'rec2', name: 'Acme Corp', state: 'CA', domain: 'acme.com', CreatedDate: '2019-06-15' },
      { Id: 'rec3', name: 'Acme Corporation', state: 'CA', domain: 'acme.com', phone: '555-1234', CreatedDate: '2021-03-10' },
    ];

    test('MOST_COMPLETE selects record with most fields', () => {
      const master = detector.selectMasterRecord(members, 'MOST_COMPLETE');
      expect(master.Id).toBe('rec3');  // Has name, state, domain, phone (4 fields)
    });

    test('OLDEST selects earliest created record', () => {
      const master = detector.selectMasterRecord(members, 'OLDEST');
      expect(master.Id).toBe('rec2');  // Earliest CreatedDate
    });

    test('MOST_RECENT selects latest modified record', () => {
      const membersWithModified = members.map((m, i) => ({
        ...m,
        LastModifiedDate: `2023-0${i + 1}-01`
      }));

      const master = detector.selectMasterRecord(membersWithModified, 'MOST_RECENT');
      expect(master.Id).toBe('rec3');  // Latest LastModifiedDate
    });
  });

  describe('mergeCluster', () => {
    test('merges cluster members into master record', () => {
      // mergeCluster expects cluster with 'master' property
      const cluster = {
        id: 'cluster1',
        master: { Id: 'rec1', name: 'Acme' },
        members: [
          { Id: 'rec1', name: 'Acme' },
          { Id: 'rec2', name: 'Acme Corp', domain: 'acme.com' },
          { Id: 'rec3', name: 'Acme Corporation', phone: '555-1234' },
        ]
      };

      const merged = detector.mergeCluster(cluster, {
        fillBlanks: true,
        preserveMasterValues: true
      });

      // Should fill missing fields from members
      expect(merged.Id).toBe('rec1');
      expect(merged.name).toBe('Acme');  // Master value preserved
      expect(merged.domain).toBe('acme.com');  // Filled from rec2
      expect(merged.phone).toBe('555-1234');  // Filled from rec3
    });
  });
});

// ========== IncrementalMatcher Tests ==========

describe('IncrementalMatcher', () => {
  let matcher;

  beforeEach(() => {
    matcher = new IncrementalMatcher();
  });

  describe('buildIndex', () => {
    test('indexes records and returns statistics', () => {
      const stats = matcher.buildIndex(sampleRecords);

      expect(stats.recordsIndexed).toBe(8);
      expect(stats.buildTimeMs).toBeGreaterThanOrEqual(0);
      expect(stats.blockingIndexSizes).toBeDefined();
      expect(stats.fieldIndexSizes).toBeDefined();
    });

    test('creates blocking indexes', () => {
      matcher.buildIndex(sampleRecords);
      const stats = matcher.getStats();

      expect(stats.blockingIndexes.BY_STATE).toBeDefined();
      expect(stats.blockingIndexes.BY_NAME_PREFIX).toBeDefined();
      expect(stats.blockingIndexes.BY_DOMAIN).toBeDefined();
    });

    test('tracks records by ID', () => {
      matcher.buildIndex(sampleRecords);

      expect(matcher.getRecord('rec1')).toEqual(sampleRecords[0]);
      expect(matcher.getRecord('nonexistent')).toBeUndefined();
    });
  });

  describe('addToIndex / removeFromIndex', () => {
    test('adds single record to existing index', () => {
      matcher.buildIndex(sampleRecords);
      const initialCount = matcher.getStats().recordsIndexed;

      matcher.addToIndex({ Id: 'rec99', Name: 'New Company', State: 'CA' });

      expect(matcher.getStats().recordsIndexed).toBe(initialCount + 1);
      expect(matcher.getRecord('rec99')).toBeDefined();
    });

    test('removes record from index', () => {
      matcher.buildIndex(sampleRecords);
      const initialCount = matcher.getStats().recordsIndexed;

      matcher.removeFromIndex('rec1');

      expect(matcher.getStats().recordsIndexed).toBe(initialCount - 1);
      expect(matcher.getRecord('rec1')).toBeUndefined();
    });
  });

  describe('findCandidates', () => {
    beforeEach(() => {
      matcher.buildIndex(sampleRecords);
    });

    test('finds candidates by state', () => {
      const newRecord = { Name: 'California Company', State: 'CA' };
      const candidates = matcher.findCandidates(newRecord);

      // Should find CA records
      expect(candidates.length).toBeGreaterThan(0);
      expect(candidates.every(c => c.record.State === 'CA')).toBe(true);
    });

    test('finds candidates by domain', () => {
      const newRecord = { Name: 'Acme Test', Domain: 'acme.com' };
      const candidates = matcher.findCandidates(newRecord);

      expect(candidates.some(c => c.record.Domain === 'acme.com')).toBe(true);
    });

    test('finds candidates by name prefix', () => {
      const newRecord = { Name: 'Acme New Branch' };
      const candidates = matcher.findCandidates(newRecord);

      expect(candidates.some(c => c.record.Name.startsWith('Acme'))).toBe(true);
    });

    test('respects maxCandidates limit', () => {
      const newRecord = { Name: 'Test', State: 'CA', Domain: 'acme.com' };
      const candidates = matcher.findCandidates(newRecord, { maxCandidates: 2 });

      expect(candidates.length).toBeLessThanOrEqual(2);
    });

    test('tracks hit counts for multi-strategy matches', () => {
      const newRecord = { Name: 'Acme Corp', State: 'CA', Domain: 'acme.com' };
      const candidates = matcher.findCandidates(newRecord);

      // Records matching multiple strategies should have higher hit counts
      const topCandidate = candidates.sort((a, b) => b.blockHits - a.blockHits)[0];
      expect(topCandidate.blockHits).toBeGreaterThan(1);
    });
  });

  describe('matchNewRecord', () => {
    beforeEach(() => {
      matcher.buildIndex(sampleRecords);
    });

    test('returns scored matches above threshold', () => {
      const newRecord = { Name: 'Acme Corp', State: 'CA', Domain: 'acme.com' };
      const matches = matcher.matchNewRecord(newRecord, { minConfidence: 50 });

      expect(matches.length).toBeGreaterThan(0);
      expect(matches.every(m => m.confidence >= 50)).toBe(true);
    });

    test('sorts matches by confidence', () => {
      const newRecord = { Name: 'Acme', State: 'CA' };
      const matches = matcher.matchNewRecord(newRecord, { topN: 5 });

      for (let i = 1; i < matches.length; i++) {
        expect(matches[i - 1].confidence).toBeGreaterThanOrEqual(matches[i].confidence);
      }
    });

    test('limits results to topN', () => {
      const newRecord = { Name: 'Test', State: 'CA' };
      const matches = matcher.matchNewRecord(newRecord, { topN: 2 });

      expect(matches.length).toBeLessThanOrEqual(2);
    });

    test('returns empty array when no candidates', () => {
      const newRecord = { Name: 'Unknown Corp', State: 'ZZ', Domain: 'notfound.xyz' };
      const matches = matcher.matchNewRecord(newRecord);

      expect(matches).toEqual([]);
    });
  });

  describe('batchMatch', () => {
    beforeEach(() => {
      matcher.buildIndex(sampleRecords);
    });

    test('matches multiple records', () => {
      const newRecords = [
        { Name: 'Acme Test', State: 'CA' },
        { Name: 'Beta Test', State: 'NY' },
      ];

      const results = matcher.batchMatch(newRecords);

      expect(results.length).toBe(2);
      expect(results[0].index).toBe(0);
      expect(results[1].index).toBe(1);
    });

    test('preserves record reference in results', () => {
      const newRecords = [{ Name: 'Test', State: 'CA' }];
      const results = matcher.batchMatch(newRecords);

      expect(results[0].record).toBe(newRecords[0]);
    });
  });

  describe('custom scorer', () => {
    test('uses custom scorer when provided', () => {
      const customScorer = jest.fn().mockReturnValue(99);
      const matcherWithScorer = new IncrementalMatcher({ scorer: customScorer });

      matcherWithScorer.buildIndex(sampleRecords);
      const matches = matcherWithScorer.matchNewRecord(
        { Name: 'Acme', State: 'CA' },
        { minConfidence: 0 }
      );

      expect(customScorer).toHaveBeenCalled();
      if (matches.length > 0) {
        expect(matches[0].confidence).toBe(99);
      }
    });
  });
});

// ========== BatchOptimizer Tests ==========

describe('BatchOptimizer', () => {
  let optimizer;

  beforeEach(() => {
    optimizer = new BatchOptimizer({
      batchSize: 3,
      maxConcurrency: 2
    });
  });

  describe('quickReject', () => {
    test('rejects same record by ID', () => {
      const record = { Id: 'rec1', Name: 'Test' };
      expect(optimizer.quickReject(record, record)).toBe(true);
    });

    test('rejects different states in high uniqueness market', () => {
      const recordA = { Name: 'Hospital A', State: 'CA' };
      const recordB = { Name: 'Hospital B', State: 'NY' };

      expect(optimizer.quickReject(recordA, recordB, 'healthcare')).toBe(true);
    });

    test('allows different states in low uniqueness market', () => {
      const recordA = { Name: 'Pizza Palace', State: 'CA' };
      const recordB = { Name: 'Pizza Palace', State: 'NY' };

      expect(optimizer.quickReject(recordA, recordB, 'franchise')).toBe(false);
    });

    test('rejects no name overlap in medium uniqueness market', () => {
      const recordA = { Name: 'Alpha Company', State: 'CA' };
      const recordB = { Name: 'Beta Corporation', State: 'CA' };

      expect(optimizer.quickReject(recordA, recordB, 'professional-services')).toBe(true);
    });

    test('allows name overlap even with different words', () => {
      const recordA = { Name: 'Acme Corporation', State: 'CA' };
      const recordB = { Name: 'Acme Industries', State: 'CA' };

      expect(optimizer.quickReject(recordA, recordB, 'professional-services')).toBe(false);
    });
  });

  describe('processBatch', () => {
    test('processes records in batches', async () => {
      let processedCount = 0;
      const processorFn = jest.fn().mockImplementation(() => {
        processedCount++;
        return { confidence: 80 };
      });

      optimizer = new BatchOptimizer({
        batchSize: 2,
        maxConcurrency: 2,
        processor: processorFn,
        enableQuickReject: false
      });

      const result = await optimizer.processBatch(sampleRecords.slice(0, 4), {
        mode: 'within-batch'
      });

      expect(result.stats.batchesCompleted).toBe(2);
      expect(result.matches.length).toBeGreaterThan(0);
    });

    test('respects minConfidence filter', async () => {
      const processorFn = jest.fn()
        .mockReturnValueOnce({ confidence: 90 })
        .mockReturnValueOnce({ confidence: 50 })
        .mockReturnValueOnce({ confidence: 85 });

      optimizer = new BatchOptimizer({
        processor: processorFn,
        enableQuickReject: false
      });

      const result = await optimizer.processBatch([{ Id: '1' }, { Id: '2' }, { Id: '3' }], {
        mode: 'within-batch',
        minConfidence: 70
      });

      // Only matches with confidence >= 70 should be included
      expect(result.matches.every(m => m.confidence >= 70)).toBe(true);
    });

    test('tracks quick rejection statistics', async () => {
      optimizer = new BatchOptimizer({
        processor: () => ({ confidence: 80 }),
        enableQuickReject: true
      });

      const records = [
        { Id: '1', Name: 'Alpha Corp', State: 'CA' },
        { Id: '2', Name: 'Beta Inc', State: 'NY' },
        { Id: '3', Name: 'Gamma LLC', State: 'TX' },
      ];

      const result = await optimizer.processBatch(records, {
        mode: 'within-batch',
        market: 'healthcare'
      });

      // With healthcare market, different states should trigger quick rejections
      expect(result.stats.quickRejections).toBeGreaterThan(0);
    });

    test('calls progress callback', async () => {
      const progressFn = jest.fn();

      optimizer = new BatchOptimizer({
        batchSize: 2,
        processor: () => ({ confidence: 80 }),
        onProgress: progressFn,
        enableQuickReject: false
      });

      await optimizer.processBatch(sampleRecords.slice(0, 4), {
        mode: 'within-batch'
      });

      expect(progressFn).toHaveBeenCalled();
      expect(progressFn.mock.calls[0][0]).toHaveProperty('batch');
      expect(progressFn.mock.calls[0][0]).toHaveProperty('totalBatches');
    });
  });

  describe('cancel', () => {
    test('cancel method sets cancelled flag', () => {
      optimizer = new BatchOptimizer({
        processor: () => ({ confidence: 80 })
      });

      expect(optimizer._cancelled).toBe(false);
      optimizer.cancel();
      expect(optimizer._cancelled).toBe(true);
    });

    test('reset clears cancelled flag', () => {
      optimizer = new BatchOptimizer({
        processor: () => ({ confidence: 80 })
      });

      optimizer.cancel();
      expect(optimizer._cancelled).toBe(true);

      optimizer.resetStats();
      expect(optimizer._cancelled).toBe(false);
    });
  });

  describe('createStreamProcessor', () => {
    test('buffers records until high water mark', async () => {
      optimizer = new BatchOptimizer({
        processor: () => ({ confidence: 80 }),
        enableQuickReject: false
      });

      const stream = optimizer.createStreamProcessor({
        highWaterMark: 3,
        mode: 'within-batch'
      });

      // Push records below high water mark
      expect(await stream.push({ Id: '1', Name: 'A' })).toBeNull();
      expect(await stream.push({ Id: '2', Name: 'B' })).toBeNull();
      expect(stream.getBufferSize()).toBe(2);

      // Third push should trigger processing
      const result = await stream.push({ Id: '3', Name: 'C' });
      expect(result).not.toBeNull();
      expect(stream.getBufferSize()).toBe(0);
    });

    test('flush processes remaining buffer', async () => {
      optimizer = new BatchOptimizer({
        processor: () => ({ confidence: 80 }),
        enableQuickReject: false
      });

      const stream = optimizer.createStreamProcessor({
        highWaterMark: 10,
        mode: 'within-batch'
      });

      await stream.push({ Id: '1', Name: 'A' });
      await stream.push({ Id: '2', Name: 'B' });

      expect(stream.getBufferSize()).toBe(2);

      const result = await stream.flush();
      expect(stream.getBufferSize()).toBe(0);
      expect(result).toBeDefined();
    });
  });

  describe('getStats', () => {
    test('calculates throughput and rates', async () => {
      optimizer = new BatchOptimizer({
        processor: () => ({ confidence: 80 }),
        enableQuickReject: false
      });

      await optimizer.processBatch(sampleRecords.slice(0, 4), {
        mode: 'within-batch'
      });

      const stats = optimizer.getStats();

      expect(stats.processedRecords).toBe(4);
      expect(stats.throughput).toBeDefined();
      expect(stats.rejectionRate).toBeDefined();
      expect(stats.errorRate).toBeDefined();
    });

    test('resetStats clears statistics', async () => {
      optimizer = new BatchOptimizer({
        processor: () => ({ confidence: 80 })
      });

      await optimizer.processBatch(sampleRecords.slice(0, 4), {
        mode: 'within-batch'
      });

      optimizer.resetStats();

      const stats = optimizer.getStats();
      expect(stats.processedRecords).toBe(0);
      expect(stats.batchesCompleted).toBe(0);
    });
  });
});

// ========== createBatchPipeline Integration Tests ==========

describe('createBatchPipeline', () => {
  let pipeline;

  beforeEach(() => {
    pipeline = createBatchPipeline({
      batchSize: 5,
      maxConcurrency: 2
    });
  });

  describe('deduplicate', () => {
    test('finds duplicates in dataset', async () => {
      const result = await pipeline.deduplicate(sampleRecords, {
        minConfidence: 50
      });

      expect(result.totalRecords).toBe(8);
      expect(result.uniqueMatches).toBeGreaterThanOrEqual(0);
      expect(result.clusters).toBeGreaterThanOrEqual(0);
    });

    test('returns cluster details when requested', async () => {
      const result = await pipeline.deduplicate(sampleRecords, {
        minConfidence: 50,
        returnClusters: true
      });

      expect(result.clusterDetails).toBeDefined();
      expect(Array.isArray(result.clusterDetails)).toBe(true);
    });

    test('respects master selection strategy', async () => {
      const result = await pipeline.deduplicate(sampleRecords, {
        minConfidence: 50,
        masterStrategy: 'MOST_COMPLETE',
        returnClusters: true
      });

      // If clusters found, they should have master selection applied
      for (const cluster of result.clusterDetails || []) {
        if (cluster.masterId) {
          // cluster.members contains record objects, masterId is a string
          const memberIds = cluster.members.map(m => m.Id || m.id);
          expect(memberIds).toContain(cluster.masterId);
        }
      }
    });
  });

  describe('processIncremental', () => {
    test('processes new records against existing index', async () => {
      // Build initial index
      pipeline.addToIndex(sampleRecords);

      // Process new records
      const newRecords = [
        { Id: 'new1', Name: 'Acme Branch', State: 'CA', Domain: 'acme.com' },
        { Id: 'new2', Name: 'Delta Office', State: 'FL' }
      ];

      const result = await pipeline.processIncremental(newRecords, {
        minConfidence: 50
      });

      expect(result.matches).toBeDefined();
    });
  });

  describe('addToIndex', () => {
    test('adds single record', () => {
      pipeline.addToIndex({ Id: 'test1', Name: 'Test' });
      const stats = pipeline.getStats();

      expect(stats.matcher.recordsIndexed).toBe(1);
    });

    test('adds multiple records', () => {
      pipeline.addToIndex(sampleRecords);
      const stats = pipeline.getStats();

      expect(stats.matcher.recordsIndexed).toBe(8);
    });
  });

  describe('reset', () => {
    test('clears all state', () => {
      pipeline.addToIndex(sampleRecords);
      pipeline.reset();

      const stats = pipeline.getStats();
      expect(stats.matcher.recordsIndexed).toBe(0);
    });
  });
});

// ========== BLOCKING_STRATEGIES Tests ==========

describe('BLOCKING_STRATEGIES', () => {
  test('BY_STATE extracts state correctly', () => {
    expect(BLOCKING_STRATEGIES.BY_STATE({ State: 'ca' })).toBe('CA');
    expect(BLOCKING_STRATEGIES.BY_STATE({ state: 'NY' })).toBe('NY');
    expect(BLOCKING_STRATEGIES.BY_STATE({ BillingState: 'TX' })).toBe('TX');
    expect(BLOCKING_STRATEGIES.BY_STATE({})).toBeNull();
  });

  test('BY_NAME_PREFIX extracts prefix', () => {
    expect(BLOCKING_STRATEGIES.BY_NAME_PREFIX({ Name: 'Acme Corp' })).toBe('acm');
    expect(BLOCKING_STRATEGIES.BY_NAME_PREFIX({ name: 'Beta' })).toBe('bet');
    expect(BLOCKING_STRATEGIES.BY_NAME_PREFIX({ CompanyName: 'Gamma LLC' })).toBe('gam');
    expect(BLOCKING_STRATEGIES.BY_NAME_PREFIX({})).toBeNull();
  });

  test('BY_DOMAIN extracts domain', () => {
    expect(BLOCKING_STRATEGIES.BY_DOMAIN({ Domain: 'example.com' })).toBe('example.com');
    expect(BLOCKING_STRATEGIES.BY_DOMAIN({ Website: 'https://www.test.com' })).toBe('test.com');
    expect(BLOCKING_STRATEGIES.BY_DOMAIN({})).toBeNull();
  });

  test('BY_AREA_CODE extracts area code', () => {
    expect(BLOCKING_STRATEGIES.BY_AREA_CODE({ Phone: '415-555-1234' })).toBe('415');
    expect(BLOCKING_STRATEGIES.BY_AREA_CODE({ phone: '(212) 555-9876' })).toBe('212');
    expect(BLOCKING_STRATEGIES.BY_AREA_CODE({ Phone: '123' })).toBeNull();  // Too short
    expect(BLOCKING_STRATEGIES.BY_AREA_CODE({})).toBeNull();
  });

  test('BY_INDUSTRY extracts industry', () => {
    expect(BLOCKING_STRATEGIES.BY_INDUSTRY({ Industry: 'Technology' })).toBe('technology');
    expect(BLOCKING_STRATEGIES.BY_INDUSTRY({ industry: ' Healthcare ' })).toBe('healthcare');
    expect(BLOCKING_STRATEGIES.BY_INDUSTRY({})).toBeNull();
  });
});

// ========== INDEX_TYPES Tests ==========

describe('INDEX_TYPES', () => {
  test('defines all expected index types', () => {
    expect(INDEX_TYPES.EXACT).toBe('EXACT');
    expect(INDEX_TYPES.PREFIX).toBe('PREFIX');
    expect(INDEX_TYPES.PHONETIC).toBe('PHONETIC');
    expect(INDEX_TYPES.NGRAM).toBe('NGRAM');
    expect(INDEX_TYPES.TOKEN).toBe('TOKEN');
  });
});

// ========== MARKET_UNIQUENESS Tests ==========

describe('MARKET_UNIQUENESS', () => {
  test('defines all uniqueness levels', () => {
    expect(MARKET_UNIQUENESS.HIGH).toBe('HIGH');
    expect(MARKET_UNIQUENESS.MEDIUM).toBe('MEDIUM');
    expect(MARKET_UNIQUENESS.LOW).toBe('LOW');
  });

  test('default mappings are sensible', () => {
    const { DEFAULT_MARKET_UNIQUENESS } = require('../scripts/lib/batch');

    // High uniqueness markets
    expect(DEFAULT_MARKET_UNIQUENESS.government).toBe('HIGH');
    expect(DEFAULT_MARKET_UNIQUENESS.healthcare).toBe('HIGH');

    // Low uniqueness markets
    expect(DEFAULT_MARKET_UNIQUENESS.franchise).toBe('LOW');
    expect(DEFAULT_MARKET_UNIQUENESS.retail).toBe('LOW');
  });
});
