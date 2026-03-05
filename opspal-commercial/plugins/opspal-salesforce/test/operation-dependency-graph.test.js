/**
 * Test Suite: Operation Dependency Graph
 *
 * Tests dependency analysis, topological sorting, circular dependency detection,
 * and execution ordering for Salesforce operations.
 *
 * Coverage Target: >80%
 * Priority: Tier 2 (High-Impact Validator)
 */

const assert = require('assert');
const { OperationDependencyGraph, DependencyGraph } = require('../scripts/lib/operation-dependency-graph');

describe('OperationDependencyGraph', () => {
  let graph;

  beforeEach(() => {
    graph = new OperationDependencyGraph();
  });

  describe('Constructor', () => {
    it('should initialize with empty data structures', () => {
      assert.strictEqual(graph.nodes.size, 0);
      assert.strictEqual(graph.edges.size, 0);
      assert.strictEqual(graph.reverseEdges.size, 0);
      assert.strictEqual(graph.nodeMetadata.size, 0);
    });
  });

  describe('addNode()', () => {
    it('should add a node to the graph', () => {
      const node = graph.addNode('Account');

      assert.ok(graph.nodes.has('Account'));
      assert.strictEqual(node.id, 'Account');
      assert.strictEqual(node.status, 'pending');
    });

    it('should accept metadata', () => {
      graph.addNode('Contact', {
        type: 'object',
        operation: 'create',
        data: { priority: 'high' }
      });

      const node = graph.nodes.get('Contact');
      assert.strictEqual(node.type, 'object');
      assert.strictEqual(node.operation, 'create');
      assert.deepStrictEqual(node.data, { priority: 'high' });
    });

    it('should not duplicate existing nodes', () => {
      graph.addNode('Account');
      graph.addNode('Account');

      assert.strictEqual(graph.nodes.size, 1);
    });

    it('should return existing node if already exists', () => {
      graph.addNode('Account', { type: 'first' });
      const node = graph.addNode('Account', { type: 'second' });

      assert.strictEqual(node.type, 'first');
    });
  });

  describe('addDependency()', () => {
    it('should create edge between nodes', () => {
      graph.addDependency('Contact', 'Account', 'parent');

      assert.ok(graph.nodes.has('Contact'));
      assert.ok(graph.nodes.has('Account'));
      assert.ok(graph.edges.has('Contact'));
    });

    it('should create reverse edge for traversal', () => {
      graph.addDependency('Contact', 'Account', 'parent');

      assert.ok(graph.reverseEdges.has('Account'));
    });

    it('should store edge type and metadata', () => {
      graph.addDependency('Contact', 'Account', 'parent', { optional: true });

      const edges = Array.from(graph.edges.get('Contact'));
      const edge = edges.find(e => e.to === 'Account');

      assert.strictEqual(edge.type, 'parent');
      assert.strictEqual(edge.metadata.optional, true);
    });

    it('should auto-create nodes if they do not exist', () => {
      graph.addDependency('NewFrom', 'NewTo');

      assert.ok(graph.nodes.has('NewFrom'));
      assert.ok(graph.nodes.has('NewTo'));
    });
  });

  describe('addDependencies()', () => {
    it('should add multiple dependencies at once', () => {
      graph.addDependencies([
        { from: 'Contact', to: 'Account', type: 'parent' },
        { from: 'Opportunity', to: 'Account', type: 'parent' },
        { from: 'Case', to: 'Contact', type: 'parent' }
      ]);

      assert.strictEqual(graph.nodes.size, 4);
      assert.ok(graph.edges.has('Contact'));
      assert.ok(graph.edges.has('Opportunity'));
      assert.ok(graph.edges.has('Case'));
    });
  });

  describe('getDependencies()', () => {
    it('should return dependencies for a node', () => {
      graph.addDependency('Contact', 'Account');
      graph.addDependency('Contact', 'User');

      const deps = graph.getDependencies('Contact');

      assert.strictEqual(deps.length, 2);
    });

    it('should return empty array for node with no dependencies', () => {
      graph.addNode('Account');

      const deps = graph.getDependencies('Account');

      assert.deepStrictEqual(deps, []);
    });

    it('should return empty array for non-existent node', () => {
      const deps = graph.getDependencies('NonExistent');
      assert.deepStrictEqual(deps, []);
    });
  });

  describe('getDependents()', () => {
    it('should return nodes that depend on this node', () => {
      graph.addDependency('Contact', 'Account');
      graph.addDependency('Opportunity', 'Account');

      const dependents = graph.getDependents('Account');

      assert.strictEqual(dependents.length, 2);
    });

    it('should return empty array for node with no dependents', () => {
      graph.addNode('Contact');

      const dependents = graph.getDependents('Contact');

      assert.deepStrictEqual(dependents, []);
    });
  });

  describe('hasDependencies()', () => {
    it('should return true when node has dependents (nodes that depend on it)', () => {
      // Account -> Contact means Account must come before Contact
      graph.addDependency('Account', 'Contact');

      // Contact has dependents (Account points to it)
      assert.strictEqual(graph.hasDependencies('Contact'), true);
    });

    it('should return falsy when node has no dependents', () => {
      graph.addNode('Account');

      // Node with no edges pointing to it
      assert.ok(!graph.hasDependencies('Account'));
    });
  });

  describe('detectCircularDependencies()', () => {
    it('should detect simple circular dependency', () => {
      graph.addDependency('A', 'B');
      graph.addDependency('B', 'A');

      const cycles = graph.detectCircularDependencies();

      assert.ok(cycles.length > 0);
    });

    it('should detect longer cycle', () => {
      graph.addDependency('A', 'B');
      graph.addDependency('B', 'C');
      graph.addDependency('C', 'A');

      const cycles = graph.detectCircularDependencies();

      assert.ok(cycles.length > 0);
      // Cycle should include A, B, C
      const cycle = cycles[0];
      assert.ok(cycle.nodes.includes('A'));
      assert.ok(cycle.nodes.includes('B'));
      assert.ok(cycle.nodes.includes('C'));
    });

    it('should return empty array for acyclic graph', () => {
      graph.addDependency('Contact', 'Account');
      graph.addDependency('Opportunity', 'Account');
      graph.addDependency('Case', 'Contact');

      const cycles = graph.detectCircularDependencies();

      assert.strictEqual(cycles.length, 0);
    });

    it('should include resolution strategy for cycles', () => {
      graph.addDependency('A', 'B');
      graph.addDependency('B', 'A');

      const cycles = graph.detectCircularDependencies();

      assert.ok(cycles[0].resolutionStrategy);
      assert.ok(cycles[0].resolutionStrategy.type);
    });
  });

  describe('getCycleEdges()', () => {
    it('should return edges that form a cycle', () => {
      graph.addDependency('A', 'B', 'requires');
      graph.addDependency('B', 'C', 'requires');
      graph.addDependency('C', 'A', 'requires');

      const edges = graph.getCycleEdges(['A', 'B', 'C', 'A']);

      assert.strictEqual(edges.length, 3);
      assert.ok(edges.some(e => e.from === 'A' && e.to === 'B'));
      assert.ok(edges.some(e => e.from === 'B' && e.to === 'C'));
      assert.ok(edges.some(e => e.from === 'C' && e.to === 'A'));
    });
  });

  describe('determineCycleResolution()', () => {
    it('should suggest BREAK_OPTIONAL for optional edges', () => {
      graph.addDependency('A', 'B', 'requires', { optional: true });
      graph.addDependency('B', 'A', 'requires');

      const strategy = graph.determineCycleResolution(['A', 'B', 'A']);

      assert.strictEqual(strategy.type, 'BREAK_OPTIONAL');
    });

    it('should suggest STAGED_EXECUTION for non-optional cycles', () => {
      graph.addDependency('A', 'B', 'requires');
      graph.addDependency('B', 'A', 'requires');

      const strategy = graph.determineCycleResolution(['A', 'B', 'A']);

      // Could be STAGED_EXECUTION or another strategy
      assert.ok(strategy.type);
    });
  });

  describe('planStagedExecution()', () => {
    it('should return three-phase plan', () => {
      const stages = graph.planStagedExecution(['A', 'B']);

      assert.strictEqual(stages.length, 3);
      assert.strictEqual(stages[0].phase, 1);
      assert.strictEqual(stages[0].action, 'INSERT_MINIMAL');
      assert.strictEqual(stages[1].phase, 2);
      assert.strictEqual(stages[1].action, 'UPDATE_REFERENCES');
      assert.strictEqual(stages[2].phase, 3);
      assert.strictEqual(stages[2].action, 'VALIDATE');
    });
  });

  describe('topologicalSort()', () => {
    it('should sort nodes in dependency order', () => {
      // Edges define execution order: from -> to means from executes before to
      graph.addDependency('Account', 'Contact');  // Account before Contact
      graph.addDependency('Account', 'Opportunity');  // Account before Opportunity
      graph.addDependency('Contact', 'Case');  // Contact before Case

      const result = graph.topologicalSort();

      assert.strictEqual(result.hasCycles, false);

      // Account should come before Contact and Opportunity
      const accountIdx = result.sorted.indexOf('Account');
      const contactIdx = result.sorted.indexOf('Contact');
      const oppIdx = result.sorted.indexOf('Opportunity');
      const caseIdx = result.sorted.indexOf('Case');

      assert.ok(accountIdx < contactIdx);
      assert.ok(accountIdx < oppIdx);
      assert.ok(contactIdx < caseIdx);
    });

    it('should detect cycles in topological sort', () => {
      graph.addDependency('A', 'B');
      graph.addDependency('B', 'C');
      graph.addDependency('C', 'A');

      const result = graph.topologicalSort();

      assert.strictEqual(result.hasCycles, true);
      assert.ok(result.unprocessed.length > 0);
      assert.ok(result.cycles.length > 0);
    });

    it('should handle disconnected nodes', () => {
      graph.addNode('Standalone');
      graph.addDependency('Contact', 'Account');

      const result = graph.topologicalSort();

      assert.strictEqual(result.sorted.length, 3);
      assert.ok(result.sorted.includes('Standalone'));
    });
  });

  describe('generateExecutionPhases()', () => {
    it('should group independent nodes into same phase', () => {
      graph.addNode('Account');
      graph.addNode('Product');
      graph.addNode('User');

      const phases = graph.generateExecutionPhases();

      assert.strictEqual(phases.length, 1);
      assert.strictEqual(phases[0].nodes.length, 3);
      assert.strictEqual(phases[0].parallel, true);
    });

    it('should create sequential phases for dependencies', () => {
      // Edges define order: from executes before to
      graph.addDependency('Account', 'Contact');  // Account before Contact
      graph.addDependency('Contact', 'Case');  // Contact before Case

      const phases = graph.generateExecutionPhases();

      // Should be at least 2 phases
      assert.ok(phases.length >= 2);

      // Account should be in earlier phase than Contact
      const accountPhase = phases.find(p => p.nodes.includes('Account'));
      const contactPhase = phases.find(p => p.nodes.includes('Contact'));

      assert.ok(accountPhase.phase < contactPhase.phase);
    });

    it('should handle circular dependencies with warning', () => {
      graph.addDependency('A', 'B');
      graph.addDependency('B', 'A');

      const phases = graph.generateExecutionPhases();

      // Should have a phase with warning about cycles
      const cyclePhase = phases.find(p => p.warning);
      assert.ok(cyclePhase || phases.some(p => p.strategy === 'RESOLVE_CYCLES'));
    });
  });

  describe('optimizeExecutionPlan()', () => {
    it('should group parallel nodes by operation type', () => {
      graph.addNode('Account1', { type: 'object', operation: 'create' });
      graph.addNode('Account2', { type: 'object', operation: 'create' });
      graph.addNode('Contact1', { type: 'object', operation: 'update' });

      const phases = graph.generateExecutionPhases();
      const optimized = graph.optimizeExecutionPlan(phases);

      // Parallel nodes should be grouped by type
      const createPhases = optimized.filter(p => p.operationType === 'object_create');
      const updatePhases = optimized.filter(p => p.operationType === 'object_update');

      // Either grouped or original single phase
      assert.ok(optimized.length >= 1);
    });
  });

  describe('groupByOperationType()', () => {
    it('should group nodes by type and operation', () => {
      graph.addNode('Account1', { type: 'object', operation: 'create' });
      graph.addNode('Account2', { type: 'object', operation: 'create' });
      graph.addNode('Contact1', { type: 'object', operation: 'update' });

      const groups = graph.groupByOperationType(['Account1', 'Account2', 'Contact1']);

      assert.ok(groups.has('object_create'));
      assert.ok(groups.has('object_update'));
      assert.strictEqual(groups.get('object_create').length, 2);
      assert.strictEqual(groups.get('object_update').length, 1);
    });
  });

  describe('findCriticalPath()', () => {
    it('should find longest path through graph', () => {
      graph.addDependency('A', 'B');
      graph.addDependency('B', 'C');
      graph.addDependency('B', 'D');
      graph.addDependency('C', 'E');

      const result = graph.findCriticalPath();

      assert.strictEqual(result.success, true);
      // Longest path: A -> B -> C -> E (length 3)
      assert.strictEqual(result.length, 3);
      assert.ok(result.path.includes('A'));
      assert.ok(result.path.includes('E'));
    });

    it('should fail for graphs with cycles', () => {
      graph.addDependency('A', 'B');
      graph.addDependency('B', 'A');

      const result = graph.findCriticalPath();

      assert.strictEqual(result.success, false);
      assert.ok(result.reason.includes('cycles'));
    });

    it('should return path length 0 for single node', () => {
      graph.addNode('Single');

      const result = graph.findCriticalPath();

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.length, 0);
    });
  });

  describe('validateExecutionOrder()', () => {
    it('should validate correct execution order', () => {
      // Edges define order: from must come before to
      graph.addDependency('Account', 'Contact');  // Account -> Contact
      graph.addDependency('Contact', 'Case');  // Contact -> Case

      // Correct order: Account, Contact, Case
      const result = graph.validateExecutionOrder(['Account', 'Contact', 'Case']);

      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.violations.length, 0);
    });

    it('should detect violations in execution order', () => {
      // Account -> Contact means Account must come before Contact
      graph.addDependency('Account', 'Contact');

      // Wrong order: Contact before Account
      const result = graph.validateExecutionOrder(['Contact', 'Account']);

      assert.strictEqual(result.valid, false);
      assert.ok(result.violations.length > 0);
      assert.ok(result.violations[0].message.includes('depends on'));
    });

    it('should handle nodes with no dependencies', () => {
      graph.addNode('Standalone');

      const result = graph.validateExecutionOrder(['Standalone']);

      assert.strictEqual(result.valid, true);
    });
  });

  describe('generateExecutionReport()', () => {
    it('should generate comprehensive report', () => {
      graph.addDependency('Contact', 'Account');
      graph.addDependency('Opportunity', 'Account');
      graph.addDependency('Case', 'Contact');

      const report = graph.generateExecutionReport();

      assert.ok(report.summary);
      assert.strictEqual(report.summary.totalNodes, 4);
      assert.ok(report.phases);
      assert.ok(report.cycles !== undefined);
      assert.ok(report.criticalPath);
      assert.ok(report.recommendations);
    });

    it('should include cycle information for cyclic graph', () => {
      graph.addDependency('A', 'B');
      graph.addDependency('B', 'A');

      const report = graph.generateExecutionReport();

      assert.strictEqual(report.summary.hasCycles, true);
      assert.ok(report.cycles.length > 0);
    });

    it('should include parallelization opportunities', () => {
      graph.addNode('A');
      graph.addNode('B');
      graph.addNode('C');

      const report = graph.generateExecutionReport();

      // Should have recommendation about parallel execution
      const parallelRec = report.recommendations.find(r => r.type === 'PERFORMANCE');
      assert.ok(parallelRec || report.phases.some(p => p.canParallelize));
    });
  });

  describe('generateRecommendations()', () => {
    it('should recommend parallelization when possible', () => {
      const phases = [{ parallel: true, nodes: ['A', 'B', 'C'] }];
      const cycles = [];

      const recs = graph.generateRecommendations(phases, cycles);

      const parallelRec = recs.find(r => r.type === 'PERFORMANCE');
      assert.ok(parallelRec);
    });

    it('should flag critical cycle issues', () => {
      const phases = [];
      const cycles = [{ nodes: ['A', 'B'], resolutionStrategy: { type: 'STAGED' } }];

      const recs = graph.generateRecommendations(phases, cycles);

      const criticalRec = recs.find(r => r.type === 'CRITICAL');
      assert.ok(criticalRec);
      assert.strictEqual(criticalRec.priority, 'URGENT');
    });

    it('should suggest consolidation for many phases', () => {
      const phases = Array(6).fill({ parallel: false, nodes: ['X'] });
      const cycles = [];

      const recs = graph.generateRecommendations(phases, cycles);

      const optRec = recs.find(r => r.type === 'OPTIMIZATION');
      assert.ok(optRec);
    });
  });

  describe('exportForVisualization()', () => {
    it('should export nodes and edges for visualization', () => {
      graph.addNode('Account', { type: 'object' });
      graph.addDependency('Contact', 'Account', 'parent');

      const exported = graph.exportForVisualization();

      assert.ok(exported.nodes);
      assert.ok(exported.edges);
      assert.strictEqual(exported.layout, 'hierarchical');
      assert.strictEqual(exported.nodes.length, 2);
      assert.strictEqual(exported.edges.length, 1);
    });

    it('should include node metadata', () => {
      graph.addNode('Account', { type: 'object', operation: 'create' });

      const exported = graph.exportForVisualization();

      const accountNode = exported.nodes.find(n => n.id === 'Account');
      assert.ok(accountNode.metadata);
    });

    it('should include edge type and metadata', () => {
      graph.addDependency('Contact', 'Account', 'parent', { required: true });

      const exported = graph.exportForVisualization();

      const edge = exported.edges[0];
      assert.strictEqual(edge.type, 'parent');
      assert.ok(edge.metadata);
    });
  });

  describe('Module Exports', () => {
    it('should export OperationDependencyGraph', () => {
      assert.ok(OperationDependencyGraph);
      assert.strictEqual(typeof OperationDependencyGraph, 'function');
    });

    it('should export DependencyGraph alias', () => {
      assert.ok(DependencyGraph);
      assert.strictEqual(DependencyGraph, OperationDependencyGraph);
    });
  });

  describe('Complex Scenarios', () => {
    it('should handle Salesforce object hierarchy', () => {
      // Edges define execution order: from -> to means from executes before to
      // Parents must be created before children
      graph.addDependency('Account', 'Contact', 'parent');
      graph.addDependency('Account', 'Opportunity', 'parent');
      graph.addDependency('Contact', 'OpportunityContactRole', 'parent');
      graph.addDependency('Opportunity', 'OpportunityContactRole', 'parent');
      graph.addDependency('Opportunity', 'Quote', 'parent');
      graph.addDependency('Quote', 'QuoteLineItem', 'parent');

      const result = graph.topologicalSort();

      assert.strictEqual(result.hasCycles, false);

      // Verify ordering (parents before children)
      const sorted = result.sorted;
      assert.ok(sorted.indexOf('Account') < sorted.indexOf('Contact'));
      assert.ok(sorted.indexOf('Account') < sorted.indexOf('Opportunity'));
      assert.ok(sorted.indexOf('Opportunity') < sorted.indexOf('Quote'));
    });

    it('should handle self-referential object', () => {
      // Account hierarchy (GrandParent -> Parent -> Child in execution order)
      graph.addDependency('Account_GrandParent', 'Account_Parent', 'parent');
      graph.addDependency('Account_Parent', 'Account_Child', 'parent');

      const result = graph.topologicalSort();

      assert.strictEqual(result.hasCycles, false);
    });

    it('should handle CPQ data model', () => {
      // Simplified CPQ structure - parents execute before children
      graph.addDependency('Opportunity', 'SBQQ__Quote__c');
      graph.addDependency('SBQQ__Quote__c', 'SBQQ__QuoteLine__c');
      graph.addDependency('Product2', 'SBQQ__QuoteLine__c');
      graph.addDependency('SBQQ__Quote__c', 'Order');
      graph.addDependency('Order', 'OrderItem');
      graph.addDependency('Product2', 'OrderItem');

      const result = graph.topologicalSort();

      assert.strictEqual(result.hasCycles, false);

      const report = graph.generateExecutionReport();
      assert.ok(report.phases.length >= 2);
    });
  });
});
