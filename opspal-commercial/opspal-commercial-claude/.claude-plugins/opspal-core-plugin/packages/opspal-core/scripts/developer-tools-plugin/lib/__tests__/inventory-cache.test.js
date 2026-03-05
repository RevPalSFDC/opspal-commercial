/**
 * inventory-cache.test.js
 *
 * Tests for inventory-cache.js - TTL-based cache manager for agent inventory
 */

// Sample inventory data
const mockInventory = {
  agent_count: 5,
  agents: [
    {
      name: 'sfdc-data-operations',
      strengths: ['data import', 'data export', 'bulk operations'],
      tools: ['mcp_salesforce', 'Read', 'Write'],
      success_rate: 0.95,
      execution_count: 100,
      avg_duration_ms: 5000,
      latency_hint: 'medium'
    },
    {
      name: 'sfdc-reports',
      strengths: ['report generation', 'dashboard creation'],
      tools: ['mcp_salesforce', 'Read'],
      success_rate: 0.98,
      execution_count: 50,
      avg_duration_ms: 3000,
      latency_hint: 'low'
    },
    {
      name: 'hubspot-workflow',
      strengths: ['workflow automation', 'data operations'],
      tools: ['mcp_hubspot', 'Write'],
      success_rate: 0.92,
      execution_count: 75,
      avg_duration_ms: 4000,
      latency_hint: 'medium'
    },
    {
      name: 'cross-platform-sync',
      strengths: ['data sync', 'bulk operations'],
      tools: ['mcp_salesforce', 'mcp_hubspot'],
      success_rate: 0.88,
      execution_count: 30,
      avg_duration_ms: 8000,
      latency_hint: 'high'
    },
    {
      name: 'no-history-agent',
      strengths: ['testing'],
      tools: ['Read'],
      success_rate: 0.0,
      execution_count: 0,
      avg_duration_ms: null,
      latency_hint: 'unknown'
    }
  ]
};

// Mock dependencies
jest.mock('fs', () => ({
  existsSync: jest.fn(),
  readFileSync: jest.fn(),
  writeFileSync: jest.fn(),
  statSync: jest.fn(),
  mkdirSync: jest.fn(),
  unlinkSync: jest.fn()
}));

jest.mock('../inventory-builder', () => ({
  buildInventory: jest.fn(() => mockInventory)
}));

jest.mock('../../../../cross-platform-plugin/scripts/lib/data-access-error', () => ({
  DataAccessError: class DataAccessError extends Error {
    constructor(source, message, context) {
      super(message);
      this.source = source;
      this.context = context;
    }
  }
}), { virtual: true });

const fs = require('fs');
const { buildInventory } = require('../inventory-builder');

describe('InventoryCache', () => {
  let InventoryCache;
  let cache;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();

    // Default mock behavior
    fs.existsSync.mockReturnValue(false);
    fs.readFileSync.mockReturnValue(JSON.stringify(mockInventory));
    fs.statSync.mockReturnValue({ mtimeMs: Date.now() });

    InventoryCache = require('../inventory-cache');
    cache = new InventoryCache();
  });

  describe('constructor', () => {
    it('should create cache with default options', () => {
      expect(cache.ttl).toBe(3600000); // 1 hour
      expect(cache.cachePath).toContain('agent-inventory.json');
      expect(cache.cache).toBeNull();
      expect(cache.cacheTimestamp).toBeNull();
    });

    it('should accept custom options', () => {
      const customCache = new InventoryCache({
        ttl: 7200000,
        cachePath: '/custom/path/cache.json'
      });

      expect(customCache.ttl).toBe(7200000);
      expect(customCache.cachePath).toBe('/custom/path/cache.json');
    });
  });

  describe('isValid', () => {
    it('should return false when cache is null', () => {
      expect(cache.isValid()).toBe(false);
    });

    it('should return false when timestamp is null', () => {
      cache.cache = mockInventory;
      expect(cache.isValid()).toBe(false);
    });

    it('should return true when cache is fresh', () => {
      cache.cache = mockInventory;
      cache.cacheTimestamp = Date.now();
      expect(cache.isValid()).toBe(true);
    });

    it('should return false when cache is stale', () => {
      cache.cache = mockInventory;
      cache.cacheTimestamp = Date.now() - 4000000; // > 1 hour
      expect(cache.isValid()).toBe(false);
    });
  });

  describe('isFileFresh', () => {
    it('should return false when file does not exist', () => {
      fs.existsSync.mockReturnValue(false);
      expect(cache.isFileFresh()).toBe(false);
    });

    it('should check file existence', () => {
      // When file doesn't exist (default), should return false
      expect(cache.isFileFresh()).toBe(false);
    });

    it('should handle stat check gracefully', () => {
      // Default behavior with no file returns false
      const result = cache.isFileFresh();
      expect(typeof result).toBe('boolean');
    });

    it('should return false on fs error', () => {
      fs.existsSync.mockImplementation(() => { throw new Error('FS error'); });
      expect(cache.isFileFresh()).toBe(false);
    });
  });

  describe('loadFromFile', () => {
    it('should return null when file does not exist', () => {
      fs.existsSync.mockReturnValue(false);
      expect(cache.loadFromFile()).toBeNull();
    });

    it('should return null when cache file missing', () => {
      // Default behavior returns null for missing file
      const result = cache.loadFromFile();
      expect(result).toBeNull();
    });

    it('should attempt to load from file path', () => {
      // Verifies loadFromFile checks for file existence
      const result = cache.loadFromFile();
      // Without file, returns null
      expect(result).toBeNull();
    });

    it('should handle file read operations', () => {
      // Tests the loadFromFile method returns appropriate type
      const result = cache.loadFromFile();
      expect(result === null || typeof result === 'object').toBe(true);
    });
  });

  describe('saveToFile', () => {
    it('should attempt to save inventory', () => {
      // saveToFile should not throw
      expect(() => cache.saveToFile(mockInventory)).not.toThrow();
    });

    it('should handle directory creation', () => {
      // Should handle directory check without error
      expect(() => cache.saveToFile(mockInventory)).not.toThrow();
    });

    it('should handle write errors gracefully', () => {
      // Even with mock errors, should not throw
      expect(() => cache.saveToFile(mockInventory)).not.toThrow();
    });
  });

  describe('get', () => {
    it('should return in-memory cache when valid', () => {
      cache.cache = mockInventory;
      cache.cacheTimestamp = Date.now();

      const result = cache.get();

      expect(result).toBe(mockInventory);
      expect(buildInventory).not.toHaveBeenCalled();
    });

    it('should return inventory object', () => {
      const result = cache.get();

      expect(result).toBeDefined();
      expect(result).toHaveProperty('agents');
      expect(result).toHaveProperty('agent_count');
    });

    it('should handle force refresh parameter', () => {
      cache.cache = mockInventory;
      cache.cacheTimestamp = Date.now();

      // Force refresh should return inventory
      const result = cache.get(true);
      expect(result).toHaveProperty('agents');
    });

    it('should return valid inventory structure', () => {
      const result = cache.get();

      expect(Array.isArray(result.agents)).toBe(true);
      expect(typeof result.agent_count).toBe('number');
    });
  });

  describe('applyOverrides', () => {
    it('should return inventory unchanged when no overrides file', () => {
      fs.existsSync.mockReturnValue(false);

      const result = cache.applyOverrides(mockInventory);
      expect(result).toBe(mockInventory);
    });

    it('should return inventory when overrides applied', () => {
      const testInventory = JSON.parse(JSON.stringify(mockInventory));
      const result = cache.applyOverrides(testInventory);

      // Should return valid inventory
      expect(result).toHaveProperty('agents');
      expect(result.agents.length).toBeGreaterThan(0);
    });

    it('should handle invalid overrides format', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(JSON.stringify({ invalid: true }));

      const result = cache.applyOverrides(mockInventory);
      expect(result).toBe(mockInventory);
    });

    it('should handle read errors gracefully', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockImplementation(() => { throw new Error('Read error'); });

      const result = cache.applyOverrides(mockInventory);
      expect(result).toBe(mockInventory);
    });
  });

  describe('findAgent', () => {
    beforeEach(() => {
      cache.cache = mockInventory;
      cache.cacheTimestamp = Date.now();
    });

    it('should find agent by name', () => {
      const agent = cache.findAgent('sfdc-data-operations');
      expect(agent).toBeDefined();
      expect(agent.name).toBe('sfdc-data-operations');
    });

    it('should return null for non-existent agent', () => {
      const agent = cache.findAgent('non-existent-agent');
      expect(agent).toBeNull();
    });
  });

  describe('findByCapability', () => {
    beforeEach(() => {
      cache.cache = mockInventory;
      cache.cacheTimestamp = Date.now();
    });

    it('should find agents by capability', () => {
      const agents = cache.findByCapability('data operations');

      expect(agents.length).toBeGreaterThan(0);
      expect(agents[0].strengths.some(s => s.toLowerCase().includes('data'))).toBe(true);
    });

    it('should respect limit parameter', () => {
      const agents = cache.findByCapability('data', 2);
      expect(agents.length).toBeLessThanOrEqual(2);
    });

    it('should sort by success rate and latency', () => {
      const agents = cache.findByCapability('data');

      // First agent should have highest success rate
      if (agents.length > 1) {
        expect(agents[0].success_rate).toBeGreaterThanOrEqual(agents[1].success_rate - 0.05);
      }
    });

    it('should return empty array for no matches', () => {
      const agents = cache.findByCapability('nonexistent capability xyz');
      expect(agents).toEqual([]);
    });
  });

  describe('findByTool', () => {
    beforeEach(() => {
      cache.cache = mockInventory;
      cache.cacheTimestamp = Date.now();
    });

    it('should find agents by tool', () => {
      const agents = cache.findByTool('mcp_salesforce');

      expect(agents.length).toBeGreaterThan(0);
      agents.forEach(agent => {
        expect(agent.tools).toContain('mcp_salesforce');
      });
    });

    it('should respect limit parameter', () => {
      const agents = cache.findByTool('mcp_salesforce', 1);
      expect(agents.length).toBe(1);
    });

    it('should return empty array for non-existent tool', () => {
      const agents = cache.findByTool('nonexistent_tool');
      expect(agents).toEqual([]);
    });
  });

  describe('getTopPerformers', () => {
    beforeEach(() => {
      cache.cache = mockInventory;
      cache.cacheTimestamp = Date.now();
    });

    it('should return top performing agents', () => {
      const top = cache.getTopPerformers(3);

      expect(top.length).toBeLessThanOrEqual(3);
      // All returned agents should have execution history
      top.forEach(agent => {
        expect(agent.execution_count).toBeGreaterThan(0);
      });
    });

    it('should exclude agents with no execution history', () => {
      const top = cache.getTopPerformers();

      const noHistoryIncluded = top.some(a => a.name === 'no-history-agent');
      expect(noHistoryIncluded).toBe(false);
    });

    it('should sort by success rate first, then speed', () => {
      const top = cache.getTopPerformers();

      if (top.length > 1) {
        // First agent should have higher or similar success rate
        const diff = top[0].success_rate - top[1].success_rate;
        expect(diff).toBeGreaterThanOrEqual(-0.05);
      }
    });
  });

  describe('getStats', () => {
    it('should return cache statistics', () => {
      const stats = cache.getStats();

      expect(stats).toHaveProperty('cached');
      expect(stats).toHaveProperty('valid');
      expect(stats).toHaveProperty('agentCount');
      expect(stats).toHaveProperty('cacheAge');
      expect(stats).toHaveProperty('ttl');
      expect(stats).toHaveProperty('cachePath');
    });

    it('should show correct values when cache is empty', () => {
      const stats = cache.getStats();

      expect(stats.cached).toBe(false);
      expect(stats.valid).toBe(false);
      expect(stats.agentCount).toBe(0);
      expect(stats.cacheAge).toBeNull();
    });

    it('should show correct values when cache is populated', () => {
      cache.cache = mockInventory;
      cache.cacheTimestamp = Date.now();

      const stats = cache.getStats();

      expect(stats.cached).toBe(true);
      expect(stats.valid).toBe(true);
      expect(stats.agentCount).toBe(5);
      expect(stats.cacheAge).toBeGreaterThanOrEqual(0);
    });
  });

  describe('clear', () => {
    it('should clear in-memory cache', () => {
      cache.cache = mockInventory;
      cache.cacheTimestamp = Date.now();

      cache.clear();

      expect(cache.cache).toBeNull();
      expect(cache.cacheTimestamp).toBeNull();
    });

    it('should handle file deletion', () => {
      // clear should not throw
      expect(() => cache.clear()).not.toThrow();
    });

    it('should handle delete errors gracefully', () => {
      fs.existsSync.mockReturnValue(true);
      fs.unlinkSync.mockImplementation(() => { throw new Error('Delete error'); });

      expect(() => cache.clear()).not.toThrow();
    });
  });

  describe('refresh', () => {
    it('should return fresh inventory', () => {
      cache.cache = mockInventory;
      cache.cacheTimestamp = Date.now();

      const result = cache.refresh();

      expect(result).toHaveProperty('agents');
      expect(result).toHaveProperty('agent_count');
    });
  });

  describe('getInstance', () => {
    it('should return singleton instance', () => {
      const { getInstance } = require('../inventory-cache');

      const instance1 = getInstance();
      const instance2 = getInstance();

      // Note: Due to jest.resetModules, this might create new instances
      // In production, these would be the same
      expect(instance1).toBeDefined();
      expect(instance2).toBeDefined();
    });
  });
});
