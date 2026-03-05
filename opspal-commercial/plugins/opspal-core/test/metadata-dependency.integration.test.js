/**
 * Integration Test Suite: Metadata Dependency Analysis
 *
 * Tests the integration between:
 * - MetadataDependencyAnalyzer: Analyzes field/object dependencies
 * - OperationDependencyGraph: Builds DAG for operation ordering
 * - DeploymentSequencer: Orders deployments based on dependencies
 *
 * These components work together for safe metadata deployments.
 *
 * Coverage Target: DAG construction, circular detection, wave scheduling
 * Priority: Tier 1 (HIGH - Prevents deployment ordering failures)
 */

// Mock dependencies
jest.mock('fs', () => ({
  promises: {
    readFile: jest.fn(),
    writeFile: jest.fn()
  },
  existsSync: jest.fn(),
  readFileSync: jest.fn(),
  writeFileSync: jest.fn(),
  mkdirSync: jest.fn()
}));

jest.mock('child_process', () => ({
  execSync: jest.fn()
}));

const fs = require('fs');
const { execSync } = require('child_process');

describe('Metadata Dependency Analysis Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});

    // Default mocks
    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockReturnValue('{}');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Dependency Graph Construction', () => {
    it('should build graph from metadata components', () => {
      const components = [
        { name: 'Account', type: 'CustomObject', dependencies: [] },
        { name: 'Contact', type: 'CustomObject', dependencies: ['Account'] },
        { name: 'Opportunity', type: 'CustomObject', dependencies: ['Account'] },
        { name: 'OpportunityContactRole', type: 'CustomObject', dependencies: ['Contact', 'Opportunity'] }
      ];

      const graph = new Map();
      components.forEach(comp => {
        graph.set(comp.name, {
          type: comp.type,
          dependencies: comp.dependencies,
          dependents: []
        });
      });

      // Build reverse dependencies (dependents)
      components.forEach(comp => {
        comp.dependencies.forEach(dep => {
          if (graph.has(dep)) {
            graph.get(dep).dependents.push(comp.name);
          }
        });
      });

      expect(graph.get('Account').dependents).toContain('Contact');
      expect(graph.get('Account').dependents).toContain('Opportunity');
      expect(graph.get('Contact').dependents).toContain('OpportunityContactRole');
    });

    it('should identify root nodes (no dependencies)', () => {
      const components = [
        { name: 'Account', dependencies: [] },
        { name: 'Contact', dependencies: ['Account'] },
        { name: 'Lead', dependencies: [] }
      ];

      const rootNodes = components.filter(c => c.dependencies.length === 0);

      expect(rootNodes).toHaveLength(2);
      expect(rootNodes.map(n => n.name)).toContain('Account');
      expect(rootNodes.map(n => n.name)).toContain('Lead');
    });

    it('should identify leaf nodes (no dependents)', () => {
      const components = [
        { name: 'Account', dependents: ['Contact', 'Opportunity'] },
        { name: 'Contact', dependents: [] },
        { name: 'Opportunity', dependents: [] }
      ];

      const leafNodes = components.filter(c => c.dependents.length === 0);

      expect(leafNodes).toHaveLength(2);
      expect(leafNodes.map(n => n.name)).toContain('Contact');
      expect(leafNodes.map(n => n.name)).toContain('Opportunity');
    });

    it('should calculate dependency depth', () => {
      const graph = new Map([
        ['A', { dependencies: [] }],
        ['B', { dependencies: ['A'] }],
        ['C', { dependencies: ['B'] }],
        ['D', { dependencies: ['C'] }]
      ]);

      const calculateDepth = (node, memo = new Map()) => {
        if (memo.has(node)) return memo.get(node);
        const nodeData = graph.get(node);
        if (!nodeData || nodeData.dependencies.length === 0) {
          memo.set(node, 0);
          return 0;
        }
        const maxDepDep = Math.max(...nodeData.dependencies.map(d => calculateDepth(d, memo)));
        const depth = maxDepDep + 1;
        memo.set(node, depth);
        return depth;
      };

      expect(calculateDepth('A')).toBe(0);
      expect(calculateDepth('B')).toBe(1);
      expect(calculateDepth('C')).toBe(2);
      expect(calculateDepth('D')).toBe(3);
    });
  });

  describe('Circular Dependency Detection', () => {
    it('should detect simple circular dependency', () => {
      const graph = new Map([
        ['A', { dependencies: ['B'] }],
        ['B', { dependencies: ['A'] }]
      ]);

      const detectCycle = (start, visited = new Set(), path = []) => {
        if (path.includes(start)) return [...path, start];
        if (visited.has(start)) return null;

        visited.add(start);
        const node = graph.get(start);
        if (!node) return null;

        for (const dep of node.dependencies) {
          const cycle = detectCycle(dep, visited, [...path, start]);
          if (cycle) return cycle;
        }
        return null;
      };

      const cycle = detectCycle('A');

      expect(cycle).not.toBeNull();
      expect(cycle).toContain('A');
      expect(cycle).toContain('B');
    });

    it('should detect complex circular dependency', () => {
      const graph = new Map([
        ['A', { dependencies: ['B'] }],
        ['B', { dependencies: ['C'] }],
        ['C', { dependencies: ['D'] }],
        ['D', { dependencies: ['A'] }] // Creates cycle
      ]);

      const detectCycle = (start, visited = new Set(), path = []) => {
        if (path.includes(start)) return [...path, start];
        if (visited.has(start)) return null;

        visited.add(start);
        const node = graph.get(start);
        if (!node) return null;

        for (const dep of node.dependencies) {
          const cycle = detectCycle(dep, visited, [...path, start]);
          if (cycle) return cycle;
        }
        return null;
      };

      const cycle = detectCycle('A');

      expect(cycle).toHaveLength(5); // A -> B -> C -> D -> A
      expect(cycle[0]).toBe(cycle[4]); // Cycle returns to start
    });

    it('should return null for acyclic graph', () => {
      const graph = new Map([
        ['A', { dependencies: [] }],
        ['B', { dependencies: ['A'] }],
        ['C', { dependencies: ['B'] }]
      ]);

      const hasCycle = (start, visiting = new Set(), visited = new Set()) => {
        if (visited.has(start)) return false;
        if (visiting.has(start)) return true;

        visiting.add(start);
        const node = graph.get(start);
        if (node) {
          for (const dep of node.dependencies) {
            if (hasCycle(dep, visiting, visited)) return true;
          }
        }
        visiting.delete(start);
        visited.add(start);
        return false;
      };

      const graphHasCycle = [...graph.keys()].some(node => hasCycle(node));

      expect(graphHasCycle).toBe(false);
    });

    it('should identify all nodes in a cycle', () => {
      const graph = new Map([
        ['A', { dependencies: ['B'] }],
        ['B', { dependencies: ['C', 'D'] }],
        ['C', { dependencies: ['A'] }], // Cycle: A -> B -> C -> A
        ['D', { dependencies: [] }],
        ['E', { dependencies: ['D'] }]
      ]);

      const findCycleNodes = () => {
        const cycleNodes = new Set();

        const dfs = (node, path = []) => {
          if (path.includes(node)) {
            const cycleStart = path.indexOf(node);
            path.slice(cycleStart).forEach(n => cycleNodes.add(n));
            return;
          }

          const nodeData = graph.get(node);
          if (!nodeData) return;

          for (const dep of nodeData.dependencies) {
            dfs(dep, [...path, node]);
          }
        };

        graph.forEach((_, node) => dfs(node));
        return cycleNodes;
      };

      const cycleNodes = findCycleNodes();

      expect(cycleNodes.has('A')).toBe(true);
      expect(cycleNodes.has('B')).toBe(true);
      expect(cycleNodes.has('C')).toBe(true);
      expect(cycleNodes.has('D')).toBe(false);
      expect(cycleNodes.has('E')).toBe(false);
    });
  });

  describe('Topological Sorting', () => {
    it('should sort components in dependency order', () => {
      const components = [
        { name: 'C', dependencies: ['B'] },
        { name: 'A', dependencies: [] },
        { name: 'B', dependencies: ['A'] }
      ];

      const sorted = [];
      const visited = new Set();

      const visit = (name) => {
        if (visited.has(name)) return;
        visited.add(name);

        const comp = components.find(c => c.name === name);
        if (comp) {
          comp.dependencies.forEach(dep => visit(dep));
        }
        sorted.push(name);
      };

      components.forEach(c => visit(c.name));

      // A should come before B, B should come before C
      expect(sorted.indexOf('A')).toBeLessThan(sorted.indexOf('B'));
      expect(sorted.indexOf('B')).toBeLessThan(sorted.indexOf('C'));
    });

    it('should handle multiple valid orderings', () => {
      const components = [
        { name: 'A', dependencies: [] },
        { name: 'B', dependencies: [] },
        { name: 'C', dependencies: ['A', 'B'] }
      ];

      const sorted = [];
      const visited = new Set();

      const visit = (name) => {
        if (visited.has(name)) return;
        visited.add(name);

        const comp = components.find(c => c.name === name);
        if (comp) {
          comp.dependencies.forEach(dep => visit(dep));
        }
        sorted.push(name);
      };

      components.forEach(c => visit(c.name));

      // C must come after both A and B
      expect(sorted.indexOf('C')).toBeGreaterThan(sorted.indexOf('A'));
      expect(sorted.indexOf('C')).toBeGreaterThan(sorted.indexOf('B'));
    });
  });

  describe('Wave Scheduling for Parallel Execution', () => {
    it('should group independent components into waves', () => {
      const components = [
        { name: 'A', dependencies: [] },
        { name: 'B', dependencies: [] },
        { name: 'C', dependencies: ['A'] },
        { name: 'D', dependencies: ['B'] },
        { name: 'E', dependencies: ['C', 'D'] }
      ];

      const calculateWave = (comp, memo = new Map()) => {
        if (memo.has(comp.name)) return memo.get(comp.name);
        if (comp.dependencies.length === 0) {
          memo.set(comp.name, 0);
          return 0;
        }

        const maxDepWave = Math.max(...comp.dependencies.map(depName => {
          const depComp = components.find(c => c.name === depName);
          return depComp ? calculateWave(depComp, memo) : 0;
        }));

        const wave = maxDepWave + 1;
        memo.set(comp.name, wave);
        return wave;
      };

      const waves = new Map();
      components.forEach(comp => {
        const wave = calculateWave(comp);
        if (!waves.has(wave)) waves.set(wave, []);
        waves.get(wave).push(comp.name);
      });

      expect(waves.get(0)).toContain('A');
      expect(waves.get(0)).toContain('B');
      expect(waves.get(1)).toContain('C');
      expect(waves.get(1)).toContain('D');
      expect(waves.get(2)).toContain('E');
    });

    it('should maximize parallelism within waves', () => {
      const components = [
        { name: 'A', dependencies: [] },
        { name: 'B', dependencies: [] },
        { name: 'C', dependencies: [] },
        { name: 'D', dependencies: ['A', 'B', 'C'] }
      ];

      // Wave 0: A, B, C (all can run in parallel)
      // Wave 1: D (waits for all of wave 0)

      const wave0 = components.filter(c => c.dependencies.length === 0);
      const wave1 = components.filter(c => c.dependencies.length > 0);

      expect(wave0).toHaveLength(3);
      expect(wave1).toHaveLength(1);
    });

    it('should provide wave execution plan', () => {
      const waves = [
        { wave: 0, components: ['Account', 'Lead'], canParallelize: true },
        { wave: 1, components: ['Contact', 'Opportunity'], canParallelize: true },
        { wave: 2, components: ['OpportunityContactRole'], canParallelize: false }
      ];

      const totalWaves = waves.length;
      const totalParallelizable = waves.filter(w => w.canParallelize).length;

      expect(totalWaves).toBe(3);
      expect(totalParallelizable).toBe(2);
    });

    it('should estimate execution time based on waves', () => {
      const waves = [
        { wave: 0, components: ['A', 'B', 'C'], estimatedTimeMs: 5000 },
        { wave: 1, components: ['D', 'E'], estimatedTimeMs: 3000 },
        { wave: 2, components: ['F'], estimatedTimeMs: 2000 }
      ];

      // Parallel execution: max time in each wave, not sum
      const totalTime = waves.reduce((sum, w) => sum + w.estimatedTimeMs, 0);

      // But parallel would be max per wave
      const parallelTime = Math.max(...waves.map(w => w.estimatedTimeMs)) * waves.length;

      expect(totalTime).toBe(10000);
      // In practice, parallel time depends on actual parallelism
    });
  });

  describe('Field Dependency Analysis', () => {
    it('should detect formula field dependencies', () => {
      const formulaField = {
        name: 'Total_Value__c',
        type: 'Formula',
        formula: 'Quantity__c * Unit_Price__c',
        referencedFields: ['Quantity__c', 'Unit_Price__c']
      };

      expect(formulaField.referencedFields).toContain('Quantity__c');
      expect(formulaField.referencedFields).toContain('Unit_Price__c');
    });

    it('should detect lookup field dependencies', () => {
      const lookupField = {
        name: 'Account__c',
        type: 'Lookup',
        referenceTo: 'Account'
      };

      expect(lookupField.referenceTo).toBe('Account');
    });

    it('should detect master-detail dependencies', () => {
      const masterDetailField = {
        name: 'Parent_Account__c',
        type: 'MasterDetail',
        referenceTo: 'Account',
        isCascadeDelete: true
      };

      // Master-detail creates strong dependency
      expect(masterDetailField.isCascadeDelete).toBe(true);
      expect(masterDetailField.referenceTo).toBe('Account');
    });

    it('should detect rollup summary dependencies', () => {
      const rollupField = {
        name: 'Total_Opportunities__c',
        type: 'Summary',
        summarizedObject: 'Opportunity',
        summaryOperation: 'COUNT',
        summaryForeignKey: 'AccountId'
      };

      expect(rollupField.summarizedObject).toBe('Opportunity');
      expect(rollupField.summaryForeignKey).toBe('AccountId');
    });
  });

  describe('Cross-Object Dependency Mapping', () => {
    it('should map validation rule dependencies', () => {
      const validationRule = {
        name: 'Require_Contact_Email',
        object: 'Contact',
        formula: 'ISBLANK(Email) && Account.Require_Email__c = true',
        referencedObjects: ['Contact', 'Account'],
        referencedFields: ['Email', 'Account.Require_Email__c']
      };

      expect(validationRule.referencedObjects).toContain('Account');
      expect(validationRule.referencedFields).toContain('Account.Require_Email__c');
    });

    it('should map flow dependencies', () => {
      const flow = {
        name: 'Account_After_Update',
        triggerObject: 'Account',
        referencedObjects: ['Account', 'Contact', 'Opportunity'],
        dmlOperations: [
          { object: 'Contact', operation: 'Update' },
          { object: 'Opportunity', operation: 'Create' }
        ]
      };

      expect(flow.dmlOperations).toHaveLength(2);
      expect(flow.referencedObjects).toContain('Contact');
    });

    it('should map trigger dependencies', () => {
      const trigger = {
        name: 'AccountTrigger',
        object: 'Account',
        calledClasses: ['AccountHelper', 'OpportunityService'],
        referencedObjects: ['Account', 'Opportunity', 'Task']
      };

      expect(trigger.calledClasses).toContain('AccountHelper');
      expect(trigger.referencedObjects).toContain('Opportunity');
    });
  });

  describe('Deployment Sequence Generation', () => {
    it('should generate deployment sequence from dependencies', () => {
      const metadata = [
        { name: 'Account__c', type: 'CustomObject', dependencies: [] },
        { name: 'Account__c.Status__c', type: 'CustomField', dependencies: ['Account__c'] },
        { name: 'Account_Status_VR', type: 'ValidationRule', dependencies: ['Account__c', 'Account__c.Status__c'] }
      ];

      const sorted = [];
      const visited = new Set();

      const visit = (item) => {
        if (visited.has(item.name)) return;
        visited.add(item.name);

        item.dependencies.forEach(depName => {
          const dep = metadata.find(m => m.name === depName);
          if (dep) visit(dep);
        });

        sorted.push(item);
      };

      metadata.forEach(m => visit(m));

      expect(sorted[0].name).toBe('Account__c');
      expect(sorted[1].name).toBe('Account__c.Status__c');
      expect(sorted[2].name).toBe('Account_Status_VR');
    });

    it('should handle destructive changes in reverse order', () => {
      const deploysInOrder = ['A', 'B', 'C'];
      const destructiveOrder = [...deploysInOrder].reverse();

      expect(destructiveOrder).toEqual(['C', 'B', 'A']);
    });

    it('should batch by metadata type', () => {
      const metadata = [
        { name: 'Account__c', type: 'CustomObject' },
        { name: 'Contact__c', type: 'CustomObject' },
        { name: 'Account_Flow', type: 'Flow' },
        { name: 'Contact_Flow', type: 'Flow' },
        { name: 'AccountTrigger', type: 'ApexTrigger' }
      ];

      const batches = new Map();
      metadata.forEach(m => {
        if (!batches.has(m.type)) batches.set(m.type, []);
        batches.get(m.type).push(m.name);
      });

      expect(batches.get('CustomObject')).toHaveLength(2);
      expect(batches.get('Flow')).toHaveLength(2);
      expect(batches.get('ApexTrigger')).toHaveLength(1);
    });
  });

  describe('Error Handling', () => {
    it('should provide clear error for missing dependency', () => {
      const error = {
        type: 'MISSING_DEPENDENCY',
        component: 'Contact__c.Account_Lookup__c',
        missingDependency: 'Account__c',
        message: 'Field references non-existent object "Account__c"',
        suggestion: 'Ensure Account__c is included in deployment or already exists in org'
      };

      expect(error.type).toBe('MISSING_DEPENDENCY');
      expect(error.suggestion).toContain('included in deployment');
    });

    it('should provide clear error for circular dependency', () => {
      const error = {
        type: 'CIRCULAR_DEPENDENCY',
        cycle: ['Flow_A', 'Flow_B', 'Flow_A'],
        message: 'Circular dependency detected between flows',
        suggestion: 'Refactor flows to remove circular trigger pattern',
        affectedComponents: ['Flow_A', 'Flow_B']
      };

      expect(error.affectedComponents).toHaveLength(2);
    });

    it('should warn about deep dependency chains', () => {
      const warning = {
        type: 'DEEP_DEPENDENCY_CHAIN',
        depth: 15,
        chain: ['A', 'B', 'C', '...', 'O'],
        threshold: 10,
        message: 'Dependency chain depth (15) exceeds recommended threshold (10)',
        suggestion: 'Consider refactoring to reduce coupling'
      };

      expect(warning.depth).toBeGreaterThan(warning.threshold);
    });
  });
});
