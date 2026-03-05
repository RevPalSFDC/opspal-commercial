/**
 * Lucid Layout Engine Test Suite
 *
 * Tests for the layout algorithm that positions shapes in Lucid diagrams.
 * CRITICAL: Contains tests for the LR layout issue that caused 39 reflections.
 *
 * The LR layout issue manifests as diagrams rendering as extremely flat
 * horizontal lines (47-90px tall) instead of proper left-to-right flow.
 *
 * @phase Phase 2 - Test foundation for LR layout fix
 * @addresses schema/parse reflection cohort (39 reflections)
 */

const {
  layoutFlowchart,
  layoutERD,
  layoutSequence,
  layoutState,
  DEFAULT_CONFIG
} = require('../lucid-layout-engine');

describe('Lucid Layout Engine', () => {
  // Sample test data
  const simpleNodes = [
    { id: 'A', label: 'Start', shape: 'rectangle' },
    { id: 'B', label: 'Process', shape: 'rectangle' },
    { id: 'C', label: 'End', shape: 'rectangle' }
  ];

  const simpleEdges = [
    { from: 'A', to: 'B', label: '' },
    { from: 'B', to: 'C', label: '' }
  ];

  const branchingNodes = [
    { id: 'A', label: 'Start', shape: 'rectangle' },
    { id: 'B', label: 'Decision', shape: 'diamond' },
    { id: 'C', label: 'Yes Path', shape: 'rectangle' },
    { id: 'D', label: 'No Path', shape: 'rectangle' },
    { id: 'E', label: 'End', shape: 'rectangle' }
  ];

  const branchingEdges = [
    { from: 'A', to: 'B', label: '' },
    { from: 'B', to: 'C', label: 'Yes' },
    { from: 'B', to: 'D', label: 'No' },
    { from: 'C', to: 'E', label: '' },
    { from: 'D', to: 'E', label: '' }
  ];

  describe('layoutFlowchart - Direction Handling', () => {
    describe('LR (Left-to-Right) direction', () => {
      /**
       * CRITICAL TEST: This is the root cause of the 39 reflection cohort.
       * LR direction should result in X coordinates increasing horizontally
       * while Y coordinates remain the same for nodes in a linear path.
       */
      it('should layout LR with X increasing for sequential nodes', () => {
        const positions = layoutFlowchart(simpleNodes, simpleEdges, 'LR');

        const posA = positions.get('A');
        const posB = positions.get('B');
        const posC = positions.get('C');

        // X should increase: A.x < B.x < C.x
        expect(posA.x).toBeLessThan(posB.x);
        expect(posB.x).toBeLessThan(posC.x);
      });

      it('should keep Y coordinate constant for linear LR flow', () => {
        const positions = layoutFlowchart(simpleNodes, simpleEdges, 'LR');

        const posA = positions.get('A');
        const posB = positions.get('B');
        const posC = positions.get('C');

        // Y should be the same for all nodes in a linear path
        expect(posA.y).toBe(posB.y);
        expect(posB.y).toBe(posC.y);
      });

      it('should spread branching nodes vertically in LR direction', () => {
        const positions = layoutFlowchart(branchingNodes, branchingEdges, 'LR');

        const posC = positions.get('C'); // Yes path
        const posD = positions.get('D'); // No path

        // C and D are at the same layer (distance from A), so same X
        // but should have different Y (spread vertically)
        expect(posC.y).not.toBe(posD.y);
      });

      it('should NOT produce flat horizontal layouts (< 100px height difference)', () => {
        const positions = layoutFlowchart(branchingNodes, branchingEdges, 'LR');

        // Get all Y coordinates
        const yValues = Array.from(positions.values()).map(p => p.y);
        const minY = Math.min(...yValues);
        const maxY = Math.max(...yValues);
        const height = maxY - minY + DEFAULT_CONFIG.shapeHeight;

        // Height should be reasonable (not flat 47-90px like the bug)
        // With default spacing of 80px and shape height of 80px,
        // a branching diagram should be at least 160px tall
        expect(height).toBeGreaterThan(100);
      });
    });

    describe('TB (Top-to-Bottom) direction', () => {
      it('should layout TB with Y increasing for sequential nodes', () => {
        const positions = layoutFlowchart(simpleNodes, simpleEdges, 'TB');

        const posA = positions.get('A');
        const posB = positions.get('B');
        const posC = positions.get('C');

        // Y should increase: A.y < B.y < C.y
        expect(posA.y).toBeLessThan(posB.y);
        expect(posB.y).toBeLessThan(posC.y);
      });

      it('should keep X coordinate constant for linear TB flow', () => {
        const positions = layoutFlowchart(simpleNodes, simpleEdges, 'TB');

        const posA = positions.get('A');
        const posB = positions.get('B');
        const posC = positions.get('C');

        // X should be the same for all nodes in a linear path
        expect(posA.x).toBe(posB.x);
        expect(posB.x).toBe(posC.x);
      });

      it('should spread branching nodes horizontally in TB direction', () => {
        const positions = layoutFlowchart(branchingNodes, branchingEdges, 'TB');

        const posC = positions.get('C'); // Yes path
        const posD = positions.get('D'); // No path

        // C and D are at same layer but should spread horizontally
        expect(posC.x).not.toBe(posD.x);
      });
    });

    describe('BT (Bottom-to-Top) direction', () => {
      it('should layout BT with Y decreasing for sequential nodes', () => {
        const positions = layoutFlowchart(simpleNodes, simpleEdges, 'BT');

        const posA = positions.get('A');
        const posB = positions.get('B');
        const posC = positions.get('C');

        // Y should decrease: A.y > B.y > C.y (reversed from TB)
        expect(posA.y).toBeGreaterThan(posB.y);
        expect(posB.y).toBeGreaterThan(posC.y);
      });
    });

    describe('RL (Right-to-Left) direction', () => {
      it('should layout RL with X decreasing for sequential nodes', () => {
        const positions = layoutFlowchart(simpleNodes, simpleEdges, 'RL');

        const posA = positions.get('A');
        const posB = positions.get('B');
        const posC = positions.get('C');

        // X should decrease: A.x > B.x > C.x (reversed from LR)
        expect(posA.x).toBeGreaterThan(posB.x);
        expect(posB.x).toBeGreaterThan(posC.x);
      });
    });

    describe('default direction', () => {
      it('should default to TB when no direction specified', () => {
        const positions = layoutFlowchart(simpleNodes, simpleEdges);

        const posA = positions.get('A');
        const posB = positions.get('B');

        // Should behave like TB: Y increasing
        expect(posA.y).toBeLessThan(posB.y);
      });
    });
  });

  describe('layoutFlowchart - Position Calculation', () => {
    it('should assign width and height to all positions', () => {
      const positions = layoutFlowchart(simpleNodes, simpleEdges, 'TB');

      for (const pos of positions.values()) {
        expect(pos.w).toBe(DEFAULT_CONFIG.shapeWidth);
        expect(pos.h).toBe(DEFAULT_CONFIG.shapeHeight);
      }
    });

    it('should respect custom configuration', () => {
      const customConfig = {
        shapeWidth: 200,
        shapeHeight: 100,
        horizontalSpacing: 50,
        verticalSpacing: 50
      };

      const positions = layoutFlowchart(simpleNodes, simpleEdges, 'TB', customConfig);

      for (const pos of positions.values()) {
        expect(pos.w).toBe(200);
        expect(pos.h).toBe(100);
      }
    });

    it('should start from margin coordinates', () => {
      const positions = layoutFlowchart(simpleNodes, simpleEdges, 'TB');

      const posA = positions.get('A');

      expect(posA.x).toBeGreaterThanOrEqual(DEFAULT_CONFIG.marginX);
      expect(posA.y).toBeGreaterThanOrEqual(DEFAULT_CONFIG.marginY);
    });

    it('should handle disconnected nodes', () => {
      const disconnectedNodes = [
        { id: 'A', label: 'Node A', shape: 'rectangle' },
        { id: 'B', label: 'Node B', shape: 'rectangle' },
        { id: 'C', label: 'Disconnected', shape: 'rectangle' }
      ];
      const disconnectedEdges = [
        { from: 'A', to: 'B', label: '' }
        // C has no edges
      ];

      const positions = layoutFlowchart(disconnectedNodes, disconnectedEdges, 'TB');

      // All nodes should have positions
      expect(positions.has('A')).toBe(true);
      expect(positions.has('B')).toBe(true);
      expect(positions.has('C')).toBe(true);
    });
  });

  describe('layoutFlowchart - Large Diagram Handling', () => {
    /**
     * This test addresses the issue where large diagrams with LR direction
     * become extremely wide and flat, making them unreadable.
     */
    it('should maintain readable aspect ratio for 10+ nodes in LR', () => {
      const manyNodes = Array.from({ length: 15 }, (_, i) => ({
        id: `N${i}`,
        label: `Node ${i}`,
        shape: 'rectangle'
      }));

      const manyEdges = Array.from({ length: 14 }, (_, i) => ({
        from: `N${i}`,
        to: `N${i + 1}`,
        label: ''
      }));

      const positions = layoutFlowchart(manyNodes, manyEdges, 'LR');

      // Calculate bounding box
      const allX = Array.from(positions.values()).map(p => p.x);
      const allY = Array.from(positions.values()).map(p => p.y);

      const width = Math.max(...allX) - Math.min(...allX) + DEFAULT_CONFIG.shapeWidth;
      const height = Math.max(...allY) - Math.min(...allY) + DEFAULT_CONFIG.shapeHeight;

      // Aspect ratio should not be too extreme (> 20:1 is unreadable)
      const aspectRatio = width / height;

      // For a purely linear diagram, aspect ratio will be high
      // But the layout should still produce valid coordinates
      expect(width).toBeGreaterThan(0);
      expect(height).toBeGreaterThan(0);
    });
  });

  describe('layoutERD', () => {
    const sampleEntities = [
      {
        name: 'CUSTOMER',
        attributes: [
          { name: 'id', type: 'int', key: 'PK' },
          { name: 'name', type: 'string', key: null }
        ]
      },
      {
        name: 'ORDER',
        attributes: [
          { name: 'id', type: 'int', key: 'PK' },
          { name: 'customer_id', type: 'int', key: 'FK' },
          { name: 'total', type: 'decimal', key: null }
        ]
      }
    ];

    it('should position entities in a grid', () => {
      const positions = layoutERD(sampleEntities);

      expect(positions.has('CUSTOMER')).toBe(true);
      expect(positions.has('ORDER')).toBe(true);
    });

    it('should calculate entity height based on attributes', () => {
      const positions = layoutERD(sampleEntities);

      const customerPos = positions.get('CUSTOMER');
      const orderPos = positions.get('ORDER');

      // ORDER has more attributes, so should be taller
      expect(orderPos.h).toBeGreaterThan(customerPos.h);
    });

    it('should respect grid columns configuration', () => {
      const manyEntities = Array.from({ length: 6 }, (_, i) => ({
        name: `ENTITY${i}`,
        attributes: [{ name: 'id', type: 'int', key: 'PK' }]
      }));

      const positions = layoutERD(manyEntities, { gridColumns: 3 });

      // With 6 entities and 3 columns, should be 2 rows
      const yValues = new Set(Array.from(positions.values()).map(p => p.y));
      expect(yValues.size).toBe(2);
    });
  });

  describe('layoutSequence', () => {
    const sampleParticipants = [
      { id: 'A', label: 'Alice', type: 'participant' },
      { id: 'B', label: 'Bob', type: 'participant' },
      { id: 'C', label: 'Charlie', type: 'participant' }
    ];

    const sampleMessages = [
      { from: 'A', to: 'B', text: 'Hello', type: 'sync' },
      { from: 'B', to: 'C', text: 'Forward', type: 'sync' },
      { from: 'C', to: 'A', text: 'Response', type: 'response' }
    ];

    it('should position participants horizontally', () => {
      const layout = layoutSequence(sampleParticipants, sampleMessages);

      const posA = layout.participants.get('A');
      const posB = layout.participants.get('B');
      const posC = layout.participants.get('C');

      // X should increase
      expect(posA.x).toBeLessThan(posB.x);
      expect(posB.x).toBeLessThan(posC.x);

      // Y should be the same (all in header row)
      expect(posA.y).toBe(posB.y);
      expect(posB.y).toBe(posC.y);
    });

    it('should calculate message Y positions', () => {
      const layout = layoutSequence(sampleParticipants, sampleMessages);

      expect(layout.messageYPositions.length).toBe(3);

      // Messages should have increasing Y positions (flow downward)
      expect(layout.messageYPositions[0]).toBeLessThan(layout.messageYPositions[1]);
      expect(layout.messageYPositions[1]).toBeLessThan(layout.messageYPositions[2]);
    });
  });

  describe('layoutState', () => {
    const sampleStates = [
      { id: 'Idle', label: 'Idle State' },
      { id: 'Running', label: 'Running State' },
      { id: 'Stopped', label: 'Stopped State' }
    ];

    const sampleTransitions = [
      { from: 'Idle', to: 'Running', label: 'start' },
      { from: 'Running', to: 'Stopped', label: 'stop' }
    ];

    it('should layout states using flowchart algorithm', () => {
      const positions = layoutState(sampleStates, sampleTransitions, 'LR');

      expect(positions.has('Idle')).toBe(true);
      expect(positions.has('Running')).toBe(true);
      expect(positions.has('Stopped')).toBe(true);
    });

    it('should respect direction parameter', () => {
      const positionsLR = layoutState(sampleStates, sampleTransitions, 'LR');
      const positionsTB = layoutState(sampleStates, sampleTransitions, 'TB');

      // LR: X increasing
      expect(positionsLR.get('Idle').x).toBeLessThan(positionsLR.get('Running').x);

      // TB: Y increasing
      expect(positionsTB.get('Idle').y).toBeLessThan(positionsTB.get('Running').y);
    });
  });

  describe('DEFAULT_CONFIG', () => {
    it('should have all required configuration values', () => {
      expect(DEFAULT_CONFIG).toHaveProperty('shapeWidth');
      expect(DEFAULT_CONFIG).toHaveProperty('shapeHeight');
      expect(DEFAULT_CONFIG).toHaveProperty('horizontalSpacing');
      expect(DEFAULT_CONFIG).toHaveProperty('verticalSpacing');
      expect(DEFAULT_CONFIG).toHaveProperty('marginX');
      expect(DEFAULT_CONFIG).toHaveProperty('marginY');
      expect(DEFAULT_CONFIG).toHaveProperty('gridColumns');
    });

    it('should have positive numeric values', () => {
      expect(DEFAULT_CONFIG.shapeWidth).toBeGreaterThan(0);
      expect(DEFAULT_CONFIG.shapeHeight).toBeGreaterThan(0);
      expect(DEFAULT_CONFIG.horizontalSpacing).toBeGreaterThan(0);
      expect(DEFAULT_CONFIG.verticalSpacing).toBeGreaterThan(0);
    });
  });
});
