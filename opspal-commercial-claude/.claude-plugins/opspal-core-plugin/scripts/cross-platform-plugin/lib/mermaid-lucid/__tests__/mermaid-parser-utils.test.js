/**
 * Mermaid Parser Utilities Test Suite
 *
 * Tests for the Mermaid syntax parser that extracts nodes, edges, and metadata
 * from various diagram types (flowchart, ERD, sequence, state).
 *
 * These tests ensure proper parsing of Mermaid syntax to prevent schema/parse
 * errors that were causing 39 reflections in the cohort analysis.
 *
 * @phase Phase 2 - Test foundation for LR layout fix
 * @addresses schema/parse reflection cohort (39 reflections)
 */

const {
  parseFlowchart,
  parseERD,
  parseSequence,
  parseState,
  detectDiagramType
} = require('../mermaid-parser-utils');

describe('Mermaid Parser Utilities', () => {
  describe('parseFlowchart', () => {
    describe('direction detection', () => {
      it('should detect TB direction', () => {
        const result = parseFlowchart(`
          flowchart TB
            A --> B
        `);
        expect(result.direction).toBe('TB');
      });

      it('should detect TD direction (alias for TB)', () => {
        const result = parseFlowchart(`
          flowchart TD
            A --> B
        `);
        expect(result.direction).toBe('TD');
      });

      it('should detect LR direction', () => {
        const result = parseFlowchart(`
          flowchart LR
            A --> B
        `);
        expect(result.direction).toBe('LR');
      });

      it('should detect RL direction', () => {
        const result = parseFlowchart(`
          flowchart RL
            A --> B
        `);
        expect(result.direction).toBe('RL');
      });

      it('should detect BT direction', () => {
        const result = parseFlowchart(`
          flowchart BT
            A --> B
        `);
        expect(result.direction).toBe('BT');
      });

      it('should default to TB when direction not specified', () => {
        const result = parseFlowchart(`
          flowchart
            A --> B
        `);
        expect(result.direction).toBe('TB');
      });
    });

    describe('node parsing', () => {
      it('should parse rectangle nodes with square brackets', () => {
        const result = parseFlowchart(`
          flowchart TB
            A[Rectangle Node]
        `);
        expect(result.nodes).toContainEqual(
          expect.objectContaining({
            id: 'A',
            label: 'Rectangle Node',
            shape: 'rectangle'
          })
        );
      });

      it('should parse diamond nodes with curly braces', () => {
        const result = parseFlowchart(`
          flowchart TB
            A{Decision}
        `);
        expect(result.nodes).toContainEqual(
          expect.objectContaining({
            id: 'A',
            label: 'Decision',
            shape: 'diamond'
          })
        );
      });

      it('should parse rounded rectangle nodes with parentheses', () => {
        const result = parseFlowchart(`
          flowchart TB
            A(Rounded)
        `);
        expect(result.nodes).toContainEqual(
          expect.objectContaining({
            id: 'A',
            label: 'Rounded',
            shape: 'roundedRectangle'
          })
        );
      });

      it('should create default rectangle nodes for undefined nodes in edges', () => {
        const result = parseFlowchart(`
          flowchart TB
            A --> B
        `);
        expect(result.nodes.length).toBe(2);
        expect(result.nodes[0].shape).toBe('rectangle');
        expect(result.nodes[1].shape).toBe('rectangle');
      });

      it('should handle multiple nodes on multiple lines', () => {
        const result = parseFlowchart(`
          flowchart TB
            A[Start]
            B{Decision}
            C(End)
        `);
        expect(result.nodes.length).toBe(3);
      });
    });

    describe('edge parsing', () => {
      it('should parse simple edges with arrow', () => {
        const result = parseFlowchart(`
          flowchart TB
            A --> B
        `);
        expect(result.edges).toContainEqual(
          expect.objectContaining({
            from: 'A',
            to: 'B',
            type: 'normal'
          })
        );
      });

      it('should parse labeled edges', () => {
        const result = parseFlowchart(`
          flowchart TB
            A -->|Yes| B
        `);
        expect(result.edges).toContainEqual(
          expect.objectContaining({
            from: 'A',
            to: 'B',
            label: 'Yes'
          })
        );
      });

      it('should parse thick edges with double equals', () => {
        const result = parseFlowchart(`
          flowchart TB
            A ==> B
        `);
        expect(result.edges).toContainEqual(
          expect.objectContaining({
            from: 'A',
            to: 'B',
            type: 'thick'
          })
        );
      });

      it('should parse dotted edges', () => {
        const result = parseFlowchart(`
          flowchart TB
            A -.-> B
        `);
        expect(result.edges).toContainEqual(
          expect.objectContaining({
            from: 'A',
            to: 'B',
            type: 'dotted'
          })
        );
      });

      it('should handle multiple edges', () => {
        const result = parseFlowchart(`
          flowchart TB
            A --> B
            B --> C
            A --> C
        `);
        expect(result.edges.length).toBe(3);
      });
    });

    describe('edge cases', () => {
      it('should skip comment lines', () => {
        const result = parseFlowchart(`
          flowchart TB
            %% This is a comment
            A --> B
        `);
        expect(result.nodes.length).toBe(2);
        expect(result.edges.length).toBe(1);
      });

      it('should handle empty input gracefully', () => {
        const result = parseFlowchart('flowchart TB');
        expect(result.direction).toBe('TB');
        expect(result.nodes).toEqual([]);
        expect(result.edges).toEqual([]);
      });

      it('should handle whitespace-heavy input', () => {
        const result = parseFlowchart(`

          flowchart TB

            A --> B

        `);
        expect(result.nodes.length).toBe(2);
        expect(result.edges.length).toBe(1);
      });
    });
  });

  describe('parseERD', () => {
    it('should parse entity definitions', () => {
      const result = parseERD(`
        erDiagram
          CUSTOMER {
            string name
            string email PK
          }
      `);
      expect(result.entities).toContainEqual(
        expect.objectContaining({
          name: 'CUSTOMER',
          attributes: expect.arrayContaining([
            expect.objectContaining({ name: 'name', type: 'string' }),
            expect.objectContaining({ name: 'email', type: 'string', key: 'PK' })
          ])
        })
      );
    });

    it('should parse relationships', () => {
      const result = parseERD(`
        erDiagram
          CUSTOMER ||--o{ ORDER : "places"
      `);
      expect(result.relationships).toContainEqual(
        expect.objectContaining({
          from: 'CUSTOMER',
          to: 'ORDER',
          label: 'places'
        })
      );
    });

    it('should parse relationship cardinality', () => {
      const result = parseERD(`
        erDiagram
          CUSTOMER ||--o{ ORDER : "places"
      `);
      expect(result.relationships[0].cardinality).toEqual({
        from: expect.any(String),
        to: expect.any(String)
      });
    });

    it('should handle entities without explicit attributes', () => {
      const result = parseERD(`
        erDiagram
          CUSTOMER ||--o{ ORDER : "places"
      `);
      expect(result.entities.length).toBe(2);
    });
  });

  describe('parseSequence', () => {
    it('should parse participant declarations', () => {
      const result = parseSequence(`
        sequenceDiagram
          participant A as Alice
          participant B as Bob
      `);
      expect(result.participants).toContainEqual(
        expect.objectContaining({
          id: 'A',
          label: 'Alice',
          type: 'participant'
        })
      );
    });

    it('should parse actor declarations', () => {
      const result = parseSequence(`
        sequenceDiagram
          actor U as User
      `);
      expect(result.participants).toContainEqual(
        expect.objectContaining({
          id: 'U',
          label: 'User',
          type: 'actor'
        })
      );
    });

    it('should parse messages', () => {
      const result = parseSequence(`
        sequenceDiagram
          A->>B: Hello
      `);
      expect(result.messages).toContainEqual(
        expect.objectContaining({
          from: 'A',
          to: 'B',
          text: 'Hello'
        })
      );
    });

    it('should detect autonumber', () => {
      const result = parseSequence(`
        sequenceDiagram
          autonumber
          A->>B: Hello
      `);
      expect(result.autonumber).toBe(true);
    });

    it('should auto-create participants from messages', () => {
      const result = parseSequence(`
        sequenceDiagram
          A->>B: Hello
      `);
      expect(result.participants.length).toBe(2);
    });
  });

  describe('parseState', () => {
    it('should parse state definitions', () => {
      const result = parseState(`
        stateDiagram-v2
          state "Idle State" as Idle
      `);
      expect(result.states).toContainEqual(
        expect.objectContaining({
          id: 'Idle',
          label: 'Idle State'
        })
      );
    });

    it('should parse state transitions', () => {
      const result = parseState(`
        stateDiagram-v2
          Idle --> Running : start
      `);
      expect(result.transitions).toContainEqual(
        expect.objectContaining({
          from: 'Idle',
          to: 'Running',
          label: 'start'
        })
      );
    });

    it('should handle start/end states', () => {
      const result = parseState(`
        stateDiagram-v2
          [*] --> Idle
          Running --> [*]
      `);
      expect(result.transitions).toContainEqual(
        expect.objectContaining({
          from: 'start',
          to: 'Idle'
        })
      );
      expect(result.transitions).toContainEqual(
        expect.objectContaining({
          from: 'Running',
          to: 'end'
        })
      );
    });

    it('should parse direction', () => {
      const result = parseState(`
        stateDiagram-v2
          direction TB
          Idle --> Running
      `);
      expect(result.direction).toBe('TB');
    });

    it('should default direction to LR', () => {
      const result = parseState(`
        stateDiagram-v2
          Idle --> Running
      `);
      expect(result.direction).toBe('LR');
    });
  });

  describe('detectDiagramType', () => {
    it('should detect flowchart type', () => {
      expect(detectDiagramType('flowchart TB\n  A --> B')).toBe('flowchart');
    });

    it('should detect graph as flowchart type', () => {
      expect(detectDiagramType('graph TD\n  A --> B')).toBe('flowchart');
    });

    it('should detect ERD type', () => {
      expect(detectDiagramType('erDiagram\n  CUSTOMER')).toBe('erd');
    });

    it('should detect sequence diagram type', () => {
      expect(detectDiagramType('sequenceDiagram\n  A->>B: Hello')).toBe('sequence');
    });

    it('should detect state diagram type', () => {
      expect(detectDiagramType('stateDiagram-v2\n  Idle --> Running')).toBe('state');
    });

    it('should return unknown for unrecognized types', () => {
      expect(detectDiagramType('random text\n  more text')).toBe('unknown');
    });

    it('should be case-insensitive', () => {
      expect(detectDiagramType('FLOWCHART TB\n  A --> B')).toBe('flowchart');
      expect(detectDiagramType('ERDIAGRAM\n  CUSTOMER')).toBe('erd');
    });
  });
});
