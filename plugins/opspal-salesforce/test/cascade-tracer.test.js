/**
 * Test Suite: Cascade Tracer
 *
 * Tests automation chain analysis, circular dependency detection,
 * performance estimation, and cascade risk scoring.
 *
 * Coverage Target: >85%
 * Priority: Tier 2 (Used by automation-audit-v2-orchestrator)
 */

const assert = require('assert');
const CascadeTracer = require('../scripts/lib/cascade-tracer');

// Helper: Create a minimal dependency graph
function createGraph(nodes = [], edges = []) {
  return { nodes, edges };
}

// Helper: Create a node
function createNode(id, name, type, object = null, processType = null, lastModified = null) {
  return { id, name, type, object, processType, lastModified };
}

// Helper: Create an edge
function createEdge(from, to, edgeType = 'invokes') {
  return { from, to, type: edgeType };
}

describe('CascadeTracer', () => {
  describe('Constructor', () => {
    it('should initialize with a dependency graph', () => {
      const graph = createGraph();
      const tracer = new CascadeTracer(graph);
      assert.strictEqual(tracer.graph, graph);
      assert.deepStrictEqual(tracer.cascades, []);
      assert.deepStrictEqual(tracer.circularDependencies, []);
    });

    it('should accept null graph', () => {
      const tracer = new CascadeTracer(null);
      assert.strictEqual(tracer.graph, null);
    });

    it('should accept undefined graph', () => {
      const tracer = new CascadeTracer(undefined);
      assert.strictEqual(tracer.graph, undefined);
    });
  });

  describe('buildCascades()', () => {
    it('should handle empty graph', () => {
      const tracer = new CascadeTracer(createGraph([], []));
      tracer.buildCascades();
      assert.deepStrictEqual(tracer.cascades, []);
    });

    it('should handle null graph', () => {
      const tracer = new CascadeTracer(null);
      tracer.buildCascades();
      assert.deepStrictEqual(tracer.cascades, []);
    });

    it('should handle graph with missing nodes property', () => {
      const tracer = new CascadeTracer({ edges: [] });
      tracer.buildCascades();
      assert.deepStrictEqual(tracer.cascades, []);
    });

    it('should handle graph with missing edges property', () => {
      const tracer = new CascadeTracer({ nodes: [] });
      tracer.buildCascades();
      assert.deepStrictEqual(tracer.cascades, []);
    });

    it('should identify ApexTrigger as entry point', () => {
      const nodes = [
        createNode('t1', 'AccountTrigger', 'ApexTrigger', 'Account'),
        createNode('c1', 'AccountHelper', 'ApexClass', 'Account')
      ];
      const edges = [createEdge('t1', 'c1')];
      const tracer = new CascadeTracer(createGraph(nodes, edges));
      tracer.buildCascades();

      assert.strictEqual(tracer.cascades.length, 1);
      assert.strictEqual(tracer.cascades[0].entry, 'AccountTrigger');
      assert.strictEqual(tracer.cascades[0].entryType, 'ApexTrigger');
    });

    it('should identify Scheduled Flow as entry point', () => {
      const nodes = [
        createNode('f1', 'ScheduledCleanup', 'Flow', 'Account', 'Scheduled'),
        createNode('c1', 'CleanupHelper', 'ApexClass', 'Account')
      ];
      const edges = [createEdge('f1', 'c1')];
      const tracer = new CascadeTracer(createGraph(nodes, edges));
      tracer.buildCascades();

      assert.strictEqual(tracer.cascades.length, 1);
      assert.strictEqual(tracer.cascades[0].entry, 'ScheduledCleanup');
    });

    it('should not create cascade for single-node entry point', () => {
      const nodes = [
        createNode('t1', 'AccountTrigger', 'ApexTrigger', 'Account')
      ];
      const tracer = new CascadeTracer(createGraph(nodes, []));
      tracer.buildCascades();

      assert.strictEqual(tracer.cascades.length, 0);
    });

    it('should calculate hops correctly', () => {
      const nodes = [
        createNode('t1', 'Trigger1', 'ApexTrigger', 'Account'),
        createNode('c1', 'Class1', 'ApexClass', 'Account'),
        createNode('f1', 'Flow1', 'Flow', 'Account')
      ];
      const edges = [
        createEdge('t1', 'c1'),
        createEdge('c1', 'f1')
      ];
      const tracer = new CascadeTracer(createGraph(nodes, edges));
      tracer.buildCascades();

      assert.strictEqual(tracer.cascades[0].hops, 3);
    });

    it('should extract unique objects from cascade', () => {
      const nodes = [
        createNode('t1', 'Trigger1', 'ApexTrigger', 'Account'),
        createNode('c1', 'Class1', 'ApexClass', 'Opportunity'),
        createNode('f1', 'Flow1', 'Flow', 'Account')
      ];
      const edges = [
        createEdge('t1', 'c1'),
        createEdge('c1', 'f1')
      ];
      const tracer = new CascadeTracer(createGraph(nodes, edges));
      tracer.buildCascades();

      assert.deepStrictEqual(tracer.cascades[0].objects, ['Account', 'Opportunity']);
    });

    it('should extract unique types from cascade', () => {
      const nodes = [
        createNode('t1', 'Trigger1', 'ApexTrigger', 'Account'),
        createNode('c1', 'Class1', 'ApexClass', 'Account'),
        createNode('f1', 'Flow1', 'Flow', 'Account')
      ];
      const edges = [
        createEdge('t1', 'c1'),
        createEdge('c1', 'f1')
      ];
      const tracer = new CascadeTracer(createGraph(nodes, edges));
      tracer.buildCascades();

      assert.deepStrictEqual(tracer.cascades[0].types, ['ApexTrigger', 'ApexClass', 'Flow']);
    });
  });

  describe('traceCascade()', () => {
    it('should trace single-hop cascade', () => {
      const nodes = [
        createNode('t1', 'Trigger1', 'ApexTrigger', 'Account'),
        createNode('c1', 'Class1', 'ApexClass', 'Account')
      ];
      const edges = [createEdge('t1', 'c1')];
      const tracer = new CascadeTracer(createGraph(nodes, edges));

      const chain = tracer.traceCascade(nodes[0], [], new Set());
      assert.strictEqual(chain.length, 2);
    });

    it('should trace multi-hop cascade', () => {
      const nodes = [
        createNode('t1', 'Trigger1', 'ApexTrigger', 'Account'),
        createNode('c1', 'Class1', 'ApexClass', 'Account'),
        createNode('c2', 'Class2', 'ApexClass', 'Account'),
        createNode('f1', 'Flow1', 'Flow', 'Account')
      ];
      const edges = [
        createEdge('t1', 'c1'),
        createEdge('c1', 'c2'),
        createEdge('c2', 'f1')
      ];
      const tracer = new CascadeTracer(createGraph(nodes, edges));

      const chain = tracer.traceCascade(nodes[0], [], new Set());
      assert.strictEqual(chain.length, 4);
    });

    it('should stop at already visited node (cycle prevention)', () => {
      const nodes = [
        createNode('t1', 'Trigger1', 'ApexTrigger', 'Account'),
        createNode('c1', 'Class1', 'ApexClass', 'Account')
      ];
      const edges = [
        createEdge('t1', 'c1'),
        createEdge('c1', 't1') // Cycle back
      ];
      const tracer = new CascadeTracer(createGraph(nodes, edges));

      const chain = tracer.traceCascade(nodes[0], [], new Set());
      // Should not infinite loop
      assert.ok(chain.length >= 2);
    });

    it('should handle node with no outgoing edges', () => {
      const nodes = [
        createNode('t1', 'Trigger1', 'ApexTrigger', 'Account')
      ];
      const tracer = new CascadeTracer(createGraph(nodes, []));

      const chain = tracer.traceCascade(nodes[0], [], new Set());
      assert.strictEqual(chain.length, 1);
    });

    it('should only follow invokes edge type', () => {
      const nodes = [
        createNode('t1', 'Trigger1', 'ApexTrigger', 'Account'),
        createNode('c1', 'Class1', 'ApexClass', 'Account'),
        createNode('c2', 'Class2', 'ApexClass', 'Account')
      ];
      const edges = [
        createEdge('t1', 'c1', 'invokes'),
        createEdge('t1', 'c2', 'references') // Different type
      ];
      const tracer = new CascadeTracer(createGraph(nodes, edges));

      const chain = tracer.traceCascade(nodes[0], [], new Set());
      assert.strictEqual(chain.length, 2);
      assert.strictEqual(chain[1].id, 'c1');
    });
  });

  describe('detectCircularDependencies()', () => {
    it('should detect no cycles in acyclic graph', () => {
      const nodes = [
        createNode('t1', 'Trigger1', 'ApexTrigger', 'Account'),
        createNode('c1', 'Class1', 'ApexClass', 'Account')
      ];
      const edges = [createEdge('t1', 'c1')];
      const tracer = new CascadeTracer(createGraph(nodes, edges));
      tracer.detectCircularDependencies();

      assert.strictEqual(tracer.circularDependencies.length, 0);
    });

    it('should detect simple cycle (A -> B -> A)', () => {
      const nodes = [
        createNode('a', 'NodeA', 'ApexClass', 'Account'),
        createNode('b', 'NodeB', 'ApexClass', 'Account')
      ];
      const edges = [
        createEdge('a', 'b'),
        createEdge('b', 'a')
      ];
      const tracer = new CascadeTracer(createGraph(nodes, edges));
      tracer.detectCircularDependencies();

      assert.ok(tracer.circularDependencies.length > 0);
    });

    it('should detect self-loop (A -> A)', () => {
      const nodes = [
        createNode('a', 'NodeA', 'ApexClass', 'Account')
      ];
      const edges = [createEdge('a', 'a')];
      const tracer = new CascadeTracer(createGraph(nodes, edges));
      tracer.detectCircularDependencies();

      assert.ok(tracer.circularDependencies.length > 0);
    });

    it('should detect longer cycle (A -> B -> C -> A)', () => {
      const nodes = [
        createNode('a', 'NodeA', 'ApexClass', 'Account'),
        createNode('b', 'NodeB', 'ApexClass', 'Account'),
        createNode('c', 'NodeC', 'ApexClass', 'Account')
      ];
      const edges = [
        createEdge('a', 'b'),
        createEdge('b', 'c'),
        createEdge('c', 'a')
      ];
      const tracer = new CascadeTracer(createGraph(nodes, edges));
      tracer.detectCircularDependencies();

      assert.ok(tracer.circularDependencies.length > 0);
      assert.strictEqual(tracer.circularDependencies[0].severity, 'CRITICAL');
    });

    it('should handle null graph', () => {
      const tracer = new CascadeTracer(null);
      tracer.detectCircularDependencies();
      assert.deepStrictEqual(tracer.circularDependencies, []);
    });

    it('should handle graph with null edges', () => {
      const tracer = new CascadeTracer({ nodes: [], edges: null });
      tracer.detectCircularDependencies();
      assert.deepStrictEqual(tracer.circularDependencies, []);
    });

    it('should include recommendation in circular dependency', () => {
      const nodes = [
        createNode('a', 'NodeA', 'ApexClass', 'Account'),
        createNode('b', 'NodeB', 'ApexClass', 'Account')
      ];
      const edges = [
        createEdge('a', 'b'),
        createEdge('b', 'a')
      ];
      const tracer = new CascadeTracer(createGraph(nodes, edges));
      tracer.detectCircularDependencies();

      assert.ok(tracer.circularDependencies[0].recommendation.includes('static flags'));
    });
  });

  describe('selectRepresentativeExamples()', () => {
    it('should return empty array for no cascades', () => {
      const tracer = new CascadeTracer(createGraph([], []));
      tracer.cascades = [];
      const examples = tracer.selectRepresentativeExamples(5);
      assert.deepStrictEqual(examples, []);
    });

    it('should select longest chain first', () => {
      const tracer = new CascadeTracer(createGraph([], []));
      tracer.cascades = [
        { id: '1', name: 'Cascade1', hops: 2, riskScore: 30, objects: [], chain: [] },
        { id: '2', name: 'Cascade2', hops: 5, riskScore: 40, objects: [], chain: [] },
        { id: '3', name: 'Cascade3', hops: 3, riskScore: 50, objects: [], chain: [] }
      ];
      const examples = tracer.selectRepresentativeExamples(5);

      assert.strictEqual(examples[0].id, '2');
      assert.strictEqual(examples[0].exampleType, 'LONGEST_CHAIN');
    });

    it('should select highest risk second', () => {
      const tracer = new CascadeTracer(createGraph([], []));
      tracer.cascades = [
        { id: '1', name: 'Cascade1', hops: 5, riskScore: 30, objects: [], chain: [] },
        { id: '2', name: 'Cascade2', hops: 2, riskScore: 90, objects: [], chain: [] },
        { id: '3', name: 'Cascade3', hops: 3, riskScore: 50, objects: [], chain: [] }
      ];
      const examples = tracer.selectRepresentativeExamples(5);

      assert.strictEqual(examples[1].id, '2');
      assert.strictEqual(examples[1].exampleType, 'HIGHEST_RISK');
    });

    it('should select CPQ cascade when Quote object present', () => {
      const tracer = new CascadeTracer(createGraph([], []));
      tracer.cascades = [
        { id: '1', name: 'AccountCascade', hops: 5, riskScore: 90, objects: ['Account'], chain: [] },
        { id: '2', name: 'QuoteCascade', hops: 2, riskScore: 30, objects: ['Quote', 'Opportunity'], chain: [] },
        { id: '3', name: 'CPQCascade', hops: 3, riskScore: 50, objects: ['SBQQ__Quote__c'], chain: [] }
      ];
      const examples = tracer.selectRepresentativeExamples(5);

      const cpqExample = examples.find(e => e.exampleType === 'CPQ_CRITICAL_PATH');
      assert.ok(cpqExample);
      assert.ok(cpqExample.objects.some(o => o.includes('Quote') || o.includes('SBQQ')));
    });

    it('should select Lead conversion cascade', () => {
      const tracer = new CascadeTracer(createGraph([], []));
      tracer.cascades = [
        { id: '1', name: 'AccountCascade', hops: 5, riskScore: 90, objects: ['Account'], chain: [] },
        { id: '2', name: 'ContactCascade', hops: 2, riskScore: 80, objects: ['Contact'], chain: [] },
        { id: '3', name: 'LeadCascade', hops: 3, riskScore: 50, objects: ['Lead', 'Opportunity'], chain: [] }
      ];
      const examples = tracer.selectRepresentativeExamples(5);

      const leadExample = examples.find(e => e.exampleType === 'LEAD_CONVERSION');
      assert.ok(leadExample);
    });

    it('should select post-close cascade (Case/Support)', () => {
      const tracer = new CascadeTracer(createGraph([], []));
      tracer.cascades = [
        { id: '1', name: 'AccountCascade', hops: 5, riskScore: 90, objects: ['Account'], chain: [] },
        { id: '2', name: 'ContactCascade', hops: 4, riskScore: 80, objects: ['Contact'], chain: [] },
        { id: '3', name: 'LeadCascade', hops: 3, riskScore: 70, objects: ['Lead'], chain: [] },
        { id: '4', name: 'CaseCascade', hops: 2, riskScore: 50, objects: ['Case', 'Support'], chain: [] }
      ];
      const examples = tracer.selectRepresentativeExamples(5);

      const postCloseExample = examples.find(e => e.exampleType === 'POST_CLOSE');
      assert.ok(postCloseExample);
    });

    it('should fill remaining slots with high risk cascades', () => {
      const tracer = new CascadeTracer(createGraph([], []));
      tracer.cascades = [
        { id: '1', name: 'AccountCascade', hops: 5, riskScore: 90, objects: ['Account'], chain: [] },
        { id: '2', name: 'ContactCascade', hops: 4, riskScore: 80, objects: ['Contact'], chain: [] },
        { id: '3', name: 'TaskCascade', hops: 3, riskScore: 70, objects: ['Task'], chain: [] },
        { id: '4', name: 'EventCascade', hops: 2, riskScore: 60, objects: ['Event'], chain: [] }
      ];
      const examples = tracer.selectRepresentativeExamples(5);

      const additionalRisk = examples.filter(e => e.exampleType === 'ADDITIONAL_RISK');
      assert.ok(additionalRisk.length > 0);
    });

    it('should not exceed requested count', () => {
      const tracer = new CascadeTracer(createGraph([], []));
      tracer.cascades = Array(10).fill(null).map((_, i) => ({
        id: String(i),
        name: `Cascade${i}`,
        hops: i + 1,
        riskScore: (i + 1) * 10,
        objects: ['Account'],
        chain: []
      }));
      const examples = tracer.selectRepresentativeExamples(3);

      assert.strictEqual(examples.length, 3);
    });
  });

  describe('estimatePerformance()', () => {
    it('should calculate DML for ApexTrigger', () => {
      const tracer = new CascadeTracer(createGraph([], []));
      const cascade = {
        chain: [createNode('t1', 'Trigger1', 'ApexTrigger', 'Account')]
      };
      const result = tracer.estimatePerformance(cascade);

      assert.strictEqual(result.totalDML, 3);
      assert.strictEqual(result.totalSOQL, 2);
    });

    it('should calculate DML for ApexClass', () => {
      const tracer = new CascadeTracer(createGraph([], []));
      const cascade = {
        chain: [createNode('c1', 'Class1', 'ApexClass', 'Account')]
      };
      const result = tracer.estimatePerformance(cascade);

      assert.strictEqual(result.totalDML, 2);
      assert.strictEqual(result.totalSOQL, 1);
    });

    it('should calculate DML for Flow', () => {
      const tracer = new CascadeTracer(createGraph([], []));
      const cascade = {
        chain: [createNode('f1', 'Flow1', 'Flow', 'Account')]
      };
      const result = tracer.estimatePerformance(cascade);

      assert.strictEqual(result.totalDML, 1);
      assert.strictEqual(result.totalSOQL, 1);
    });

    it('should calculate DML for Workflow', () => {
      const tracer = new CascadeTracer(createGraph([], []));
      const cascade = {
        chain: [{ id: 'w1', name: 'Workflow1', type: 'ProcessBuilder', processType: 'Workflow' }]
      };
      const result = tracer.estimatePerformance(cascade);

      assert.strictEqual(result.totalDML, 1);
      assert.strictEqual(result.totalSOQL, 0);
    });

    it('should aggregate across chain', () => {
      const tracer = new CascadeTracer(createGraph([], []));
      const cascade = {
        chain: [
          createNode('t1', 'Trigger1', 'ApexTrigger', 'Account'),
          createNode('c1', 'Class1', 'ApexClass', 'Account'),
          createNode('f1', 'Flow1', 'Flow', 'Account')
        ]
      };
      const result = tracer.estimatePerformance(cascade);

      // Trigger: 3 DML + Class: 2 DML + Flow: 1 DML = 6
      assert.strictEqual(result.totalDML, 6);
      // Trigger: 2 SOQL + Class: 1 SOQL + Flow: 1 SOQL = 4
      assert.strictEqual(result.totalSOQL, 4);
    });

    it('should calculate governor limit pressure', () => {
      const tracer = new CascadeTracer(createGraph([], []));
      const cascade = {
        chain: [createNode('t1', 'Trigger1', 'ApexTrigger', 'Account')]
      };
      const result = tracer.estimatePerformance(cascade);

      assert.ok(result.governorLimitPressure);
      assert.ok(result.governorLimitPressure.dml >= 0);
      assert.ok(result.governorLimitPressure.soql >= 0);
      assert.ok(result.governorLimitPressure.heap >= 0);
      assert.ok(result.governorLimitPressure.cpu >= 0);
      assert.ok(result.governorLimitPressure.overall >= 0);
    });

    it('should assign HIGH risk for pressure > 70%', () => {
      const tracer = new CascadeTracer(createGraph([], []));
      // Create chain with many components to exceed 70% pressure
      const cascade = {
        chain: Array(50).fill(null).map((_, i) =>
          createNode(`t${i}`, `Trigger${i}`, 'ApexTrigger', 'Account')
        )
      };
      const result = tracer.estimatePerformance(cascade);

      assert.strictEqual(result.riskLevel, 'HIGH');
    });

    it('should assign LOW risk for pressure < 40%', () => {
      const tracer = new CascadeTracer(createGraph([], []));
      const cascade = {
        chain: [createNode('f1', 'Flow1', 'Flow', 'Account')]
      };
      const result = tracer.estimatePerformance(cascade);

      assert.strictEqual(result.riskLevel, 'LOW');
    });
  });

  describe('generatePerformanceNotes()', () => {
    it('should warn about high DML usage', () => {
      const tracer = new CascadeTracer(createGraph([], []));
      const notes = tracer.generatePerformanceNotes(120, 10, 50);

      assert.ok(notes.includes('High DML usage'));
      assert.ok(notes.includes('150 limit'));
    });

    it('should warn about high SOQL usage', () => {
      const tracer = new CascadeTracer(createGraph([], []));
      const notes = tracer.generatePerformanceNotes(10, 60, 50);

      assert.ok(notes.includes('High SOQL usage'));
      assert.ok(notes.includes('100 limit'));
    });

    it('should warn about critical governor risk', () => {
      const tracer = new CascadeTracer(createGraph([], []));
      const notes = tracer.generatePerformanceNotes(10, 10, 80);

      assert.ok(notes.includes('CRITICAL'));
      assert.ok(notes.includes('async processing'));
    });

    it('should note moderate risk', () => {
      const tracer = new CascadeTracer(createGraph([], []));
      const notes = tracer.generatePerformanceNotes(10, 10, 50);

      assert.ok(notes.includes('Moderate'));
      assert.ok(notes.includes('monitor'));
    });

    it('should note low risk', () => {
      const tracer = new CascadeTracer(createGraph([], []));
      const notes = tracer.generatePerformanceNotes(5, 5, 20);

      assert.ok(notes.includes('Low'));
      assert.ok(notes.includes('safe'));
    });
  });

  describe('calculateCascadeRisk()', () => {
    it('should increase risk for longer chains', () => {
      const tracer = new CascadeTracer(createGraph([], []));

      const shortChain = [createNode('t1', 'T1', 'ApexTrigger', 'Account')];
      const longChain = Array(5).fill(null).map((_, i) =>
        createNode(`t${i}`, `T${i}`, 'ApexTrigger', 'Account')
      );

      const shortRisk = tracer.calculateCascadeRisk(shortChain);
      const longRisk = tracer.calculateCascadeRisk(longChain);

      assert.ok(longRisk > shortRisk);
    });

    it('should increase risk for mixed automation types', () => {
      const tracer = new CascadeTracer(createGraph([], []));

      const sameType = [
        createNode('t1', 'T1', 'ApexTrigger', 'Account'),
        createNode('t2', 'T2', 'ApexTrigger', 'Account')
      ];
      const mixedType = [
        createNode('t1', 'T1', 'ApexTrigger', 'Account'),
        createNode('c1', 'C1', 'ApexClass', 'Account'),
        createNode('f1', 'F1', 'Flow', 'Account')
      ];

      const sameRisk = tracer.calculateCascadeRisk(sameType);
      const mixedRisk = tracer.calculateCascadeRisk(mixedType);

      assert.ok(mixedRisk > sameRisk);
    });

    it('should increase risk for critical objects', () => {
      const tracer = new CascadeTracer(createGraph([], []));

      const normalObject = [createNode('t1', 'T1', 'ApexTrigger', 'Task')];
      const criticalObject = [createNode('t1', 'T1', 'ApexTrigger', 'Opportunity')];

      const normalRisk = tracer.calculateCascadeRisk(normalObject);
      const criticalRisk = tracer.calculateCascadeRisk(criticalObject);

      assert.ok(criticalRisk > normalRisk);
    });

    it('should increase risk for SBQQ (CPQ) objects', () => {
      const tracer = new CascadeTracer(createGraph([], []));

      const cpqChain = [createNode('t1', 'T1', 'ApexTrigger', 'SBQQ__Quote__c')];
      const normalChain = [createNode('t1', 'T1', 'ApexTrigger', 'Task')];

      const cpqRisk = tracer.calculateCascadeRisk(cpqChain);
      const normalRisk = tracer.calculateCascadeRisk(normalChain);

      assert.ok(cpqRisk > normalRisk);
    });

    it('should increase risk for cross-object cascades', () => {
      const tracer = new CascadeTracer(createGraph([], []));

      const singleObject = [
        createNode('t1', 'T1', 'ApexTrigger', 'Account'),
        createNode('t2', 'T2', 'ApexTrigger', 'Account')
      ];
      const multiObject = [
        createNode('t1', 'T1', 'ApexTrigger', 'Account'),
        createNode('t2', 'T2', 'ApexTrigger', 'Opportunity'),
        createNode('t3', 'T3', 'ApexTrigger', 'Quote'),
        createNode('t4', 'T4', 'ApexTrigger', 'Contract')
      ];

      const singleRisk = tracer.calculateCascadeRisk(singleObject);
      const multiRisk = tracer.calculateCascadeRisk(multiObject);

      assert.ok(multiRisk > singleRisk);
    });

    it('should cap risk at 100', () => {
      const tracer = new CascadeTracer(createGraph([], []));

      // Create worst-case scenario
      const extremeChain = Array(10).fill(null).map((_, i) =>
        createNode(`t${i}`, `T${i}`, i % 3 === 0 ? 'ApexTrigger' : i % 3 === 1 ? 'ApexClass' : 'Flow',
          ['Account', 'Opportunity', 'Quote', 'Contract', 'SBQQ__Quote__c'][i % 5])
      );

      const risk = tracer.calculateCascadeRisk(extremeChain);
      assert.ok(risk <= 100);
    });

    it('should handle null object in chain', () => {
      const tracer = new CascadeTracer(createGraph([], []));

      const chain = [
        createNode('t1', 'T1', 'ApexTrigger', null),
        createNode('t2', 'T2', 'ApexTrigger', 'Account')
      ];

      // Should not throw
      const risk = tracer.calculateCascadeRisk(chain);
      assert.ok(typeof risk === 'number');
    });
  });

  describe('generateCascadeName()', () => {
    it('should return "Empty Cascade" for empty chain', () => {
      const tracer = new CascadeTracer(createGraph([], []));
      const name = tracer.generateCascadeName([]);
      assert.strictEqual(name, 'Empty Cascade');
    });

    it('should generate name for single object', () => {
      const tracer = new CascadeTracer(createGraph([], []));
      const chain = [
        createNode('t1', 'T1', 'ApexTrigger', 'Account'),
        createNode('c1', 'C1', 'ApexClass', 'Account')
      ];
      const name = tracer.generateCascadeName(chain);

      assert.strictEqual(name, 'Account Automation Chain');
    });

    it('should generate name for 2-3 objects with arrow notation', () => {
      const tracer = new CascadeTracer(createGraph([], []));
      const chain = [
        createNode('t1', 'T1', 'ApexTrigger', 'Lead'),
        createNode('c1', 'C1', 'ApexClass', 'Opportunity')
      ];
      const name = tracer.generateCascadeName(chain);

      assert.strictEqual(name, 'Lead → Opportunity Flow');
    });

    it('should generate abbreviated name for many objects', () => {
      const tracer = new CascadeTracer(createGraph([], []));
      const chain = [
        createNode('t1', 'T1', 'ApexTrigger', 'Lead'),
        createNode('c1', 'C1', 'ApexClass', 'Account'),
        createNode('c2', 'C2', 'ApexClass', 'Opportunity'),
        createNode('f1', 'F1', 'Flow', 'Contract')
      ];
      const name = tracer.generateCascadeName(chain);

      assert.ok(name.includes('Lead'));
      assert.ok(name.includes('Contract'));
      assert.ok(name.includes('...'));
      assert.ok(name.includes('4 objects'));
    });
  });

  describe('extractObjects()', () => {
    it('should return unique objects', () => {
      const tracer = new CascadeTracer(createGraph([], []));
      const chain = [
        createNode('t1', 'T1', 'ApexTrigger', 'Account'),
        createNode('c1', 'C1', 'ApexClass', 'Account'),
        createNode('f1', 'F1', 'Flow', 'Opportunity')
      ];
      const objects = tracer.extractObjects(chain);

      assert.deepStrictEqual(objects, ['Account', 'Opportunity']);
    });

    it('should filter out null/undefined objects', () => {
      const tracer = new CascadeTracer(createGraph([], []));
      const chain = [
        createNode('t1', 'T1', 'ApexTrigger', 'Account'),
        createNode('c1', 'C1', 'ApexClass', null),
        createNode('f1', 'F1', 'Flow', undefined)
      ];
      const objects = tracer.extractObjects(chain);

      assert.deepStrictEqual(objects, ['Account']);
    });

    it('should return empty array for empty chain', () => {
      const tracer = new CascadeTracer(createGraph([], []));
      const objects = tracer.extractObjects([]);
      assert.deepStrictEqual(objects, []);
    });
  });

  describe('extractTypes()', () => {
    it('should return unique types', () => {
      const tracer = new CascadeTracer(createGraph([], []));
      const chain = [
        createNode('t1', 'T1', 'ApexTrigger', 'Account'),
        createNode('t2', 'T2', 'ApexTrigger', 'Account'),
        createNode('f1', 'F1', 'Flow', 'Account')
      ];
      const types = tracer.extractTypes(chain);

      assert.deepStrictEqual(types, ['ApexTrigger', 'Flow']);
    });

    it('should return empty array for empty chain', () => {
      const tracer = new CascadeTracer(createGraph([], []));
      const types = tracer.extractTypes([]);
      assert.deepStrictEqual(types, []);
    });
  });

  describe('generateStatistics()', () => {
    it('should generate stats for empty cascades', () => {
      const tracer = new CascadeTracer(createGraph([], []));
      tracer.cascades = [];
      tracer.circularDependencies = [];

      const stats = tracer.generateStatistics();

      assert.strictEqual(stats.totalCascades, 0);
      assert.strictEqual(stats.avgChainLength, 0);
      assert.strictEqual(stats.maxChainLength, 0);
      assert.strictEqual(stats.circularDependencies, 0);
    });

    it('should calculate average chain length', () => {
      const tracer = new CascadeTracer(createGraph([], []));
      tracer.cascades = [
        { hops: 2, riskScore: 30 },
        { hops: 4, riskScore: 50 },
        { hops: 6, riskScore: 70 }
      ];
      tracer.circularDependencies = [];

      const stats = tracer.generateStatistics();

      assert.strictEqual(stats.avgChainLength, 4); // (2+4+6)/3 = 4
    });

    it('should find max chain length', () => {
      const tracer = new CascadeTracer(createGraph([], []));
      tracer.cascades = [
        { hops: 2, riskScore: 30 },
        { hops: 8, riskScore: 50 },
        { hops: 4, riskScore: 70 }
      ];
      tracer.circularDependencies = [];

      const stats = tracer.generateStatistics();

      assert.strictEqual(stats.maxChainLength, 8);
    });

    it('should count risk categories', () => {
      const tracer = new CascadeTracer(createGraph([], []));
      tracer.cascades = [
        { hops: 2, riskScore: 20 },  // Low
        { hops: 3, riskScore: 35 },  // Low
        { hops: 4, riskScore: 50 },  // Medium
        { hops: 5, riskScore: 65 },  // Medium
        { hops: 6, riskScore: 80 },  // High
        { hops: 7, riskScore: 95 }   // High
      ];
      tracer.circularDependencies = [{ cycle: 'A → B → A' }];

      const stats = tracer.generateStatistics();

      assert.strictEqual(stats.lowRiskCascades, 2);
      assert.strictEqual(stats.mediumRiskCascades, 2);
      assert.strictEqual(stats.highRiskCascades, 2);
      assert.strictEqual(stats.circularDependencies, 1);
    });
  });

  describe('trace()', () => {
    it('should complete full trace workflow', () => {
      const nodes = [
        createNode('t1', 'AccountTrigger', 'ApexTrigger', 'Account'),
        createNode('c1', 'AccountHelper', 'ApexClass', 'Account'),
        createNode('f1', 'AccountFlow', 'Flow', 'Opportunity')
      ];
      const edges = [
        createEdge('t1', 'c1'),
        createEdge('c1', 'f1')
      ];
      const tracer = new CascadeTracer(createGraph(nodes, edges));

      const results = tracer.trace();

      assert.ok(results.totalCascades >= 0);
      assert.ok(Array.isArray(results.circularDependencies));
      assert.ok(Array.isArray(results.representativeExamples));
      assert.ok(results.statistics);
    });

    it('should include performance estimates in examples', () => {
      const nodes = [
        createNode('t1', 'Trigger1', 'ApexTrigger', 'Account'),
        createNode('c1', 'Class1', 'ApexClass', 'Account')
      ];
      const edges = [createEdge('t1', 'c1')];
      const tracer = new CascadeTracer(createGraph(nodes, edges));

      const results = tracer.trace();

      if (results.representativeExamples.length > 0) {
        assert.ok(results.representativeExamples[0].performanceEstimate);
        assert.ok(results.representativeExamples[0].performanceEstimate.totalDML !== undefined);
      }
    });

    it('should handle empty graph gracefully', () => {
      const tracer = new CascadeTracer(createGraph([], []));

      const results = tracer.trace();

      assert.strictEqual(results.totalCascades, 0);
      assert.deepStrictEqual(results.circularDependencies, []);
      assert.deepStrictEqual(results.representativeExamples, []);
    });

    it('should detect circular dependencies during trace', () => {
      const nodes = [
        createNode('t1', 'Trigger1', 'ApexTrigger', 'Account'),
        createNode('c1', 'Class1', 'ApexClass', 'Account')
      ];
      const edges = [
        createEdge('t1', 'c1'),
        createEdge('c1', 't1')
      ];
      const tracer = new CascadeTracer(createGraph(nodes, edges));

      const results = tracer.trace();

      assert.ok(results.circularDependencies.length > 0);
    });
  });

  describe('generateSummaryReport()', () => {
    it('should generate markdown report', () => {
      const tracer = new CascadeTracer(createGraph([], []));
      const results = {
        statistics: {
          totalCascades: 5,
          avgChainLength: 3,
          maxChainLength: 7,
          circularDependencies: 1,
          highRiskCascades: 2,
          mediumRiskCascades: 2,
          lowRiskCascades: 1
        },
        circularDependencies: [
          {
            cycle: 'A → B → A',
            objects: ['Account', 'Opportunity'],
            impact: 'Infinite loop risk',
            recommendation: 'Add static flags'
          }
        ],
        representativeExamples: [
          {
            exampleType: 'LONGEST_CHAIN',
            name: 'Test Cascade',
            chain: [{ name: 'Trigger1' }, { name: 'Class1' }],
            objects: ['Account'],
            hops: 5,
            riskScore: 60,
            performanceEstimate: {
              totalDML: 5,
              totalSOQL: 3,
              estimatedHeapKB: 100,
              estimatedCPUms: 500,
              governorLimitPressure: { dml: 3, soql: 3, heap: 2, cpu: 5 },
              riskLevel: 'MEDIUM',
              notes: 'Moderate risk'
            }
          }
        ]
      };

      const report = tracer.generateSummaryReport(results);

      assert.ok(report.includes('# Automation Cascade Analysis'));
      assert.ok(report.includes('Total Cascades'));
      assert.ok(report.includes('Circular Dependencies'));
      assert.ok(report.includes('Representative Cascade Examples'));
      assert.ok(report.includes('Performance Estimate'));
    });

    it('should include circular dependency section when present', () => {
      const tracer = new CascadeTracer(createGraph([], []));
      const results = {
        statistics: { totalCascades: 0, avgChainLength: 0, maxChainLength: 0, circularDependencies: 1, highRiskCascades: 0, mediumRiskCascades: 0, lowRiskCascades: 0 },
        circularDependencies: [
          {
            cycle: 'A → B → A',
            objects: ['Account'],
            impact: 'Infinite loop',
            recommendation: 'Fix it'
          }
        ],
        representativeExamples: []
      };

      const report = tracer.generateSummaryReport(results);

      assert.ok(report.includes('Circular Dependencies (CRITICAL)'));
      assert.ok(report.includes('A → B → A'));
    });

    it('should omit circular dependency section when empty', () => {
      const tracer = new CascadeTracer(createGraph([], []));
      const results = {
        statistics: { totalCascades: 0, avgChainLength: 0, maxChainLength: 0, circularDependencies: 0, highRiskCascades: 0, mediumRiskCascades: 0, lowRiskCascades: 0 },
        circularDependencies: [],
        representativeExamples: []
      };

      const report = tracer.generateSummaryReport(results);

      assert.ok(!report.includes('Circular Dependencies (CRITICAL)'));
    });
  });

  describe('Edge Cases', () => {
    it('should handle node with undefined type', () => {
      const tracer = new CascadeTracer(createGraph([], []));
      const cascade = {
        chain: [{ id: '1', name: 'Unknown', type: undefined, object: 'Account' }]
      };

      // Should not throw
      const result = tracer.estimatePerformance(cascade);
      assert.ok(result);
    });

    it('should handle missing edge target node', () => {
      const nodes = [
        createNode('t1', 'Trigger1', 'ApexTrigger', 'Account')
      ];
      const edges = [
        createEdge('t1', 'nonexistent')
      ];
      const tracer = new CascadeTracer(createGraph(nodes, edges));

      // Should not throw
      tracer.buildCascades();
    });

    it('should handle lastModified date comparison', () => {
      const tracer = new CascadeTracer(createGraph([], []));
      const recentDate = new Date().toISOString();
      const oldDate = '2020-01-01T00:00:00Z';

      const recentChain = [
        createNode('t1', 'T1', 'ApexTrigger', 'Account', null, recentDate),
        createNode('t2', 'T2', 'ApexTrigger', 'Account', null, recentDate)
      ];
      const oldChain = [
        createNode('t1', 'T1', 'ApexTrigger', 'Account', null, oldDate),
        createNode('t2', 'T2', 'ApexTrigger', 'Account', null, oldDate)
      ];

      const recentRisk = tracer.calculateCascadeRisk(recentChain);
      const oldRisk = tracer.calculateCascadeRisk(oldChain);

      // Recent modifications should increase risk slightly
      assert.ok(recentRisk >= oldRisk);
    });
  });
});
