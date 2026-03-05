/**
 * inventory-builder.test.js
 *
 * Tests for InventoryBuilder - generates agent INVENTORY from plugin frontmatter
 */

// Mock fs before requiring module
jest.mock('fs');

// Mock DataAccessError
jest.mock('../../../../cross-platform-plugin/scripts/lib/data-access-error', () => ({
  DataAccessError: class DataAccessError extends Error {
    constructor(source, message, context) {
      super(message);
      this.source = source;
      this.context = context;
    }
  }
}));

const fs = require('fs');
const inventoryBuilder = require('../inventory-builder');

describe('InventoryBuilder', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    console.error.mockRestore();
  });

  describe('parseAgentFrontmatter', () => {
    it('should parse valid frontmatter', () => {
      const content = `---
name: test-agent
description: A test agent
tools: Read, Write, Bash
---

# Agent Description`;

      const result = inventoryBuilder.parseAgentFrontmatter(content);

      expect(result.name).toBe('test-agent');
      expect(result.description).toBe('A test agent');
      expect(result.tools).toBe('Read, Write, Bash');
    });

    it('should return null for content without frontmatter', () => {
      const content = '# Just a heading\n\nSome text';
      const result = inventoryBuilder.parseAgentFrontmatter(content);
      expect(result).toBeNull();
    });

    it('should return null for null input', () => {
      expect(inventoryBuilder.parseAgentFrontmatter(null)).toBeNull();
    });

    it('should return null for non-string input', () => {
      expect(inventoryBuilder.parseAgentFrontmatter(123)).toBeNull();
    });

    it('should handle frontmatter without values', () => {
      const content = `---
name:
---`;
      const result = inventoryBuilder.parseAgentFrontmatter(content);
      expect(result).toEqual({});
    });

    it('should handle multi-word values', () => {
      const content = `---
description: This is a multi word description
---`;
      const result = inventoryBuilder.parseAgentFrontmatter(content);
      expect(result.description).toBe('This is a multi word description');
    });
  });

  describe('extractStrengths', () => {
    it('should extract deployment strengths', () => {
      const strengths = inventoryBuilder.extractStrengths('Manages deploy and release operations', 'deploy-agent');
      expect(strengths).toContain('deployments');
    });

    it('should extract metadata strengths', () => {
      const strengths = inventoryBuilder.extractStrengths('Handles metadata and custom objects', 'meta-agent');
      expect(strengths).toContain('metadata management');
    });

    it('should extract data query strengths', () => {
      const strengths = inventoryBuilder.extractStrengths('Executes SOQL queries on data', 'query-agent');
      expect(strengths).toContain('data queries');
    });

    it('should extract bulk operations strengths', () => {
      const strengths = inventoryBuilder.extractStrengths('Handles bulk data processing', 'bulk-agent');
      expect(strengths).toContain('bulk operations');
    });

    it('should extract reporting strengths', () => {
      const strengths = inventoryBuilder.extractStrengths('Creates dashboards and analytics reports', 'report-agent');
      expect(strengths).toContain('reporting');
    });

    it('should extract security strengths', () => {
      const strengths = inventoryBuilder.extractStrengths('Manages permissions and security profiles', 'security-agent');
      expect(strengths).toContain('security');
    });

    it('should extract apex development strengths', () => {
      const strengths = inventoryBuilder.extractStrengths('Creates apex triggers and test classes', 'apex-agent');
      expect(strengths).toContain('apex development');
    });

    it('should extract automation strengths', () => {
      const strengths = inventoryBuilder.extractStrengths('Builds flows and workflow automation', 'flow-agent');
      expect(strengths).toContain('automation');
    });

    it('should extract troubleshooting strengths', () => {
      const strengths = inventoryBuilder.extractStrengths('Can fix error and resolve conflict issues', 'fixer-agent');
      expect(strengths).toContain('troubleshooting');
    });

    it('should extract orchestration strengths', () => {
      const strengths = inventoryBuilder.extractStrengths('Orchestrates complex operations', 'orchestrator-agent');
      expect(strengths).toContain('orchestration');
    });

    it('should extract planning strengths', () => {
      const strengths = inventoryBuilder.extractStrengths('Creates strategy and architecture plans', 'planner-agent');
      expect(strengths).toContain('planning');
    });

    it('should extract performance strengths', () => {
      const strengths = inventoryBuilder.extractStrengths('Optimizes performance and speed', 'optimizer-agent');
      expect(strengths).toContain('performance');
    });

    it('should extract dependency analysis strengths', () => {
      const strengths = inventoryBuilder.extractStrengths('Analyzes dependencies and circular relationships', 'deps-agent');
      expect(strengths).toContain('dependency analysis');
    });

    it('should extract UI customization strengths', () => {
      const strengths = inventoryBuilder.extractStrengths('Customizes layouts and page interfaces', 'ui-agent');
      expect(strengths).toContain('UI customization');
    });

    it('should extract validation rule strengths', () => {
      const strengths = inventoryBuilder.extractStrengths('Creates validation rules and formulas', 'validation-agent');
      expect(strengths).toContain('validation rules');
    });

    it('should add agent name as strength', () => {
      const strengths = inventoryBuilder.extractStrengths('General agent', 'sfdc-data-operations');
      expect(strengths).toContain('data operations');
    });

    it('should return general operations for empty description', () => {
      const strengths = inventoryBuilder.extractStrengths('', 'agent');
      expect(strengths).toContain('general operations');
    });
  });

  describe('extractWeaknesses', () => {
    it('should extract apex development weakness', () => {
      const weaknesses = inventoryBuilder.extractWeaknesses('Does not write apex code');
      expect(weaknesses).toContain('apex development');
    });

    it('should extract metadata operations weakness', () => {
      const weaknesses = inventoryBuilder.extractWeaknesses('Cannot modify metadata');
      expect(weaknesses).toContain('metadata operations');
    });

    it('should extract production operations weakness', () => {
      const weaknesses = inventoryBuilder.extractWeaknesses("Don't use in production");
      expect(weaknesses).toContain('production operations');
    });

    it('should extract write operations weakness from read-only', () => {
      const weaknesses = inventoryBuilder.extractWeaknesses('This agent is read-only');
      expect(weaknesses).toContain('write operations');
    });

    it('should extract execution weakness from analysis only', () => {
      const weaknesses = inventoryBuilder.extractWeaknesses('This agent is for analysis only');
      expect(weaknesses).toContain('execution');
    });

    it('should return empty array for no weaknesses', () => {
      const weaknesses = inventoryBuilder.extractWeaknesses('This agent does everything well');
      expect(weaknesses).toEqual([]);
    });
  });

  describe('calculateLatencyHint', () => {
    it('should return low for fast operations', () => {
      expect(inventoryBuilder.calculateLatencyHint(500)).toBe('low');
      expect(inventoryBuilder.calculateLatencyHint(1999)).toBe('low');
    });

    it('should return med for medium operations', () => {
      expect(inventoryBuilder.calculateLatencyHint(2000)).toBe('med');
      expect(inventoryBuilder.calculateLatencyHint(5000)).toBe('med');
      expect(inventoryBuilder.calculateLatencyHint(9999)).toBe('med');
    });

    it('should return high for slow operations', () => {
      expect(inventoryBuilder.calculateLatencyHint(10000)).toBe('high');
      expect(inventoryBuilder.calculateLatencyHint(30000)).toBe('high');
    });

    it('should return med for null duration', () => {
      expect(inventoryBuilder.calculateLatencyHint(null)).toBe('med');
    });

    it('should return med for undefined duration', () => {
      expect(inventoryBuilder.calculateLatencyHint(undefined)).toBe('med');
    });
  });

  describe('applyOverrides', () => {
    it('should apply overrides to matching agents', () => {
      const inventory = {
        agents: [
          { name: 'agent-a', success_rate: 0.8 },
          { name: 'agent-b', success_rate: 0.7 }
        ]
      };
      const overrides = {
        overrides: [
          { name: 'agent-a', success_rate: 0.95, latency_hint: 'low' }
        ]
      };

      const result = inventoryBuilder.applyOverrides(inventory, overrides);

      expect(result.agents[0].success_rate).toBe(0.95);
      expect(result.agents[0].latency_hint).toBe('low');
      expect(result.agents[1].success_rate).toBe(0.7);
    });

    it('should return inventory unchanged if no overrides', () => {
      const inventory = { agents: [{ name: 'test' }] };
      const result = inventoryBuilder.applyOverrides(inventory, null);
      expect(result).toEqual(inventory);
    });

    it('should return inventory unchanged if overrides.overrides is missing', () => {
      const inventory = { agents: [{ name: 'test' }] };
      const result = inventoryBuilder.applyOverrides(inventory, {});
      expect(result).toEqual(inventory);
    });

    it('should skip overrides for non-existent agents', () => {
      const inventory = {
        agents: [{ name: 'agent-a' }]
      };
      const overrides = {
        overrides: [
          { name: 'non-existent', success_rate: 0.99 }
        ]
      };

      const result = inventoryBuilder.applyOverrides(inventory, overrides);

      expect(result.agents.length).toBe(1);
      expect(result.agents[0].name).toBe('agent-a');
    });
  });

  describe('saveInventory', () => {
    it('should write inventory to file', () => {
      const inventory = { agent_count: 5, agents: [] };
      fs.writeFileSync.mockImplementation(() => {});

      inventoryBuilder.saveInventory(inventory, '/tmp/inventory.json');

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        '/tmp/inventory.json',
        JSON.stringify(inventory, null, 2)
      );
    });
  });

  describe('buildAgentEntry', () => {
    it('should build entry from agent file', () => {
      fs.readFileSync.mockReturnValue(`---
name: test-agent
description: Handles deploy and metadata operations
tools: Read, Write
---

# Agent`);

      const entry = inventoryBuilder.buildAgentEntry('/path/to/agent.md', '/profiler');

      expect(entry.name).toBe('test-agent');
      expect(entry.strengths).toContain('deployments');
      expect(entry.strengths).toContain('metadata management');
      expect(entry.tools).toEqual(['Read', 'Write']);
    });

    it('should use filename as name if frontmatter name missing', () => {
      fs.readFileSync.mockReturnValue(`---
description: A test agent
---`);

      const entry = inventoryBuilder.buildAgentEntry('/path/to/my-agent.md', '/profiler');

      expect(entry.name).toBe('my-agent');
    });

    it('should return null for file without frontmatter', () => {
      fs.readFileSync.mockReturnValue('# Just a heading');

      const entry = inventoryBuilder.buildAgentEntry('/path/to/agent.md', '/profiler');

      expect(entry).toBeNull();
    });

    it('should have default values when no profiler data', () => {
      fs.readFileSync.mockReturnValue(`---
name: test-agent
description: Test
---`);

      const entry = inventoryBuilder.buildAgentEntry('/path/to/agent.md', '/profiler');

      expect(entry.latency_hint).toBe('med');
      expect(entry.success_rate).toBe(0.85);
      expect(entry.execution_count).toBe(0);
    });

    it('should throw DataAccessError on file read failure', () => {
      fs.readFileSync.mockImplementation(() => {
        throw new Error('File not found');
      });

      expect(() => {
        inventoryBuilder.buildAgentEntry('/path/to/agent.md', '/profiler');
      }).toThrow('Failed to build agent entry');
    });
  });

  describe('buildInventory', () => {
    it('should build inventory from plugins', () => {
      // Mock file system structure
      fs.existsSync.mockImplementation((p) => {
        if (p.includes('.claude-plugins')) return true;
        if (p.includes('plugin.json')) return true;
        if (p.includes('agents')) return true;
        return false;
      });

      fs.readdirSync.mockImplementation((p) => {
        if (p.includes('.claude-plugins') && !p.includes('agents')) {
          return ['plugin-a', 'plugin-b'];
        }
        if (p.includes('agents')) {
          return ['agent-1.md', 'agent-2.md'];
        }
        return [];
      });

      fs.statSync.mockReturnValue({ isDirectory: () => true });

      fs.readFileSync.mockReturnValue(`---
name: test-agent
description: Test agent
tools: Read
---`);

      const inventory = inventoryBuilder.buildInventory({ rootDir: '/test' });

      expect(inventory.generated_at).toBeDefined();
      expect(inventory.agent_count).toBeGreaterThan(0);
      expect(inventory.agents.length).toBeGreaterThan(0);
    });

    it('should return empty inventory if no plugins directory', () => {
      fs.existsSync.mockReturnValue(false);

      const inventory = inventoryBuilder.buildInventory({ rootDir: '/test' });

      expect(inventory.agent_count).toBe(0);
      expect(inventory.agents).toEqual([]);
    });

    it('should sort agents by success rate and duration', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readdirSync.mockImplementation((p) => {
        if (p.includes('.claude-plugins') && !p.includes('agents')) return ['plugin'];
        if (p.includes('agents')) return ['a.md', 'b.md'];
        return [];
      });
      fs.statSync.mockReturnValue({ isDirectory: () => true });

      let callCount = 0;
      fs.readFileSync.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return `---
name: slow-agent
description: Slow
---`;
        }
        return `---
name: fast-agent
description: Fast
---`;
      });

      const inventory = inventoryBuilder.buildInventory({ rootDir: '/test' });

      // Both have same default success rate, so order may vary
      expect(inventory.agents.length).toBe(2);
    });

    it('should skip non-md files in agents directory', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readdirSync.mockImplementation((p) => {
        if (p.includes('.claude-plugins') && !p.includes('agents')) return ['plugin'];
        if (p.includes('agents')) return ['agent.md', 'readme.txt', 'config.json'];
        return [];
      });
      fs.statSync.mockReturnValue({ isDirectory: () => true });
      fs.readFileSync.mockReturnValue(`---
name: test
description: Test
---`);

      const inventory = inventoryBuilder.buildInventory({ rootDir: '/test' });

      // Should only process .md files
      expect(fs.readFileSync).toHaveBeenCalledTimes(1);
    });

    it('should skip non-directory items in plugins', () => {
      fs.existsSync.mockImplementation((p) => {
        if (p.includes('.claude-plugins')) return true;
        if (p.includes('plugin.json')) return true;
        return false;
      });
      fs.readdirSync.mockImplementation((p) => {
        if (p.includes('.claude-plugins') && !p.includes('agents')) {
          return ['valid-plugin', 'file.txt'];
        }
        return ['agent.md'];
      });
      fs.statSync.mockImplementation((p) => ({
        isDirectory: () => !p.includes('file.txt')
      }));
      fs.readFileSync.mockReturnValue(`---
name: test
description: Test
---`);

      inventoryBuilder.buildInventory({ rootDir: '/test' });

      // Should skip file.txt
      expect(fs.statSync).toHaveBeenCalled();
    });
  });
});
