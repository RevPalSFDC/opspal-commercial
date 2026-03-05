#!/usr/bin/env node

/**
 * inventory-cache.js
 *
 * TTL-based cache manager for agent INVENTORY.
 * Prevents re-parsing 156+ agents on every Supervisor invocation.
 *
 * @module inventory-cache
 */

const fs = require('fs');
const path = require('path');
const { buildInventory } = require('./inventory-builder');
const { DataAccessError } = require('../../../cross-platform-plugin/scripts/lib/data-access-error');

class InventoryCache {
  constructor(options = {}) {
    this.ttl = options.ttl || 3600000; // 1 hour default
    this.cachePath = options.cachePath ||
      path.join(process.cwd(), '.claude/agent-inventory.json');

    this.overridesPath = options.overridesPath ||
      path.join(process.cwd(), '.claude/agent-inventory-overrides.json');

    // In-memory cache
    this.cache = null;
    this.cacheTimestamp = null;
  }

  /**
   * Check if cache is still valid
   * @returns {boolean} True if cache is valid
   */
  isValid() {
    if (!this.cache || !this.cacheTimestamp) {
      return false;
    }

    const age = Date.now() - this.cacheTimestamp;
    return age < this.ttl;
  }

  /**
   * Check if cache file is fresh
   * @returns {boolean} True if file is fresh
   */
  isFileFresh() {
    try {
      if (!fs.existsSync(this.cachePath)) {
        return false;
      }

      const stats = fs.statSync(this.cachePath);
      const age = Date.now() - stats.mtimeMs;
      return age < this.ttl;
    } catch (error) {
      return false;
    }
  }

  /**
   * Load cache from file
   * @returns {object|null} Cached inventory
   */
  loadFromFile() {
    // File doesn't exist is expected (cache miss)
    if (!fs.existsSync(this.cachePath)) {
      return null;
    }

    try {
      const content = fs.readFileSync(this.cachePath, 'utf8');
      const inventory = JSON.parse(content);

      // Check if file-based cache is fresh
      if (this.isFileFresh()) {
        return inventory;
      }

      // File exists but is stale (expected cache miss)
      return null;
    } catch (error) {
      // Actual error (corrupt JSON, permission denied) - throw explicitly
      throw new DataAccessError(
        'Inventory_Cache',
        `Failed to load inventory cache from ${path.basename(this.cachePath)}: ${error.message}`,
        {
          cachePath: this.cachePath,
          originalError: error.message,
          workaround: 'Delete cache file to rebuild: rm ' + this.cachePath
        }
      );
    }
  }

  /**
   * Save inventory to cache file
   * @param {object} inventory - Inventory to cache
   */
  saveToFile(inventory) {
    try {
      const dir = path.dirname(this.cachePath);

      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(this.cachePath, JSON.stringify(inventory, null, 2));
    } catch (error) {
      console.error(`Error saving inventory cache: ${error.message}`);
    }
  }

  /**
   * Get inventory (from cache or build fresh)
   * @param {boolean} forceRefresh - Force rebuild
   * @returns {object} Agent inventory
   */
  get(forceRefresh = false) {
    // Check in-memory cache first
    if (!forceRefresh && this.isValid()) {
      return this.cache;
    }

    // Check file-based cache
    if (!forceRefresh) {
      const fileCache = this.loadFromFile();
      if (fileCache) {
        this.cache = fileCache;
        this.cacheTimestamp = Date.now();
        return this.cache;
      }
    }

    // Rebuild inventory
    console.log('Building fresh agent inventory...');
    const inventory = buildInventory();

    // Apply overrides if they exist
    const finalInventory = this.applyOverrides(inventory);

    // Update cache
    this.cache = finalInventory;
    this.cacheTimestamp = Date.now();
    this.saveToFile(finalInventory);

    console.log(`✓ Cached inventory with ${finalInventory.agent_count} agents`);

    return this.cache;
  }

  /**
   * Apply static overrides to inventory
   * @param {object} inventory - Base inventory
   * @returns {object} Inventory with overrides
   */
  applyOverrides(inventory) {
    try {
      if (!fs.existsSync(this.overridesPath)) {
        return inventory;
      }

      const overrides = JSON.parse(fs.readFileSync(this.overridesPath, 'utf8'));

      if (!overrides.overrides || !Array.isArray(overrides.overrides)) {
        return inventory;
      }

      for (const override of overrides.overrides) {
        const agent = inventory.agents.find(a => a.name === override.name);

        if (agent) {
          Object.assign(agent, override);
        }
      }

      return inventory;
    } catch (error) {
      console.error(`Error applying overrides: ${error.message}`);
      return inventory;
    }
  }

  /**
   * Find agent by name
   * @param {string} agentName - Agent name
   * @returns {object|null} Agent entry
   */
  findAgent(agentName) {
    const inventory = this.get();

    return inventory.agents.find(a => a.name === agentName) || null;
  }

  /**
   * Find agents by capability (strength)
   * @param {string} capability - Capability string
   * @param {number} limit - Max results
   * @returns {array} Matching agents
   */
  findByCapability(capability, limit = 10) {
    const inventory = this.get();
    const lowerCap = capability.toLowerCase();

    const matches = inventory.agents.filter(agent => {
      return agent.strengths.some(s => s.toLowerCase().includes(lowerCap));
    });

    // Sort by success rate and latency
    matches.sort((a, b) => {
      if (Math.abs(a.success_rate - b.success_rate) > 0.05) {
        return b.success_rate - a.success_rate;
      }

      const aDur = a.avg_duration_ms || 5000;
      const bDur = b.avg_duration_ms || 5000;
      return aDur - bDur;
    });

    return matches.slice(0, limit);
  }

  /**
   * Find agents by tool
   * @param {string} tool - Tool name
   * @param {number} limit - Max results
   * @returns {array} Matching agents
   */
  findByTool(tool, limit = 10) {
    const inventory = this.get();

    const matches = inventory.agents.filter(agent => {
      return agent.tools.includes(tool);
    });

    matches.sort((a, b) => b.success_rate - a.success_rate);

    return matches.slice(0, limit);
  }

  /**
   * Get agents sorted by performance
   * @param {number} limit - Max results
   * @returns {array} Top performing agents
   */
  getTopPerformers(limit = 20) {
    const inventory = this.get();

    // Filter agents with execution history
    const withHistory = inventory.agents.filter(a => a.execution_count > 0);

    // Sort by success rate first, then by speed
    withHistory.sort((a, b) => {
      if (Math.abs(a.success_rate - b.success_rate) > 0.05) {
        return b.success_rate - a.success_rate;
      }

      return (a.avg_duration_ms || 10000) - (b.avg_duration_ms || 10000);
    });

    return withHistory.slice(0, limit);
  }

  /**
   * Get cache statistics
   * @returns {object} Cache stats
   */
  getStats() {
    return {
      cached: this.cache !== null,
      valid: this.isValid(),
      agentCount: this.cache ? this.cache.agent_count : 0,
      cacheAge: this.cacheTimestamp ? Date.now() - this.cacheTimestamp : null,
      ttl: this.ttl,
      cachePath: this.cachePath
    };
  }

  /**
   * Clear cache
   */
  clear() {
    this.cache = null;
    this.cacheTimestamp = null;

    try {
      if (fs.existsSync(this.cachePath)) {
        fs.unlinkSync(this.cachePath);
      }
    } catch (error) {
      console.error(`Error clearing cache file: ${error.message}`);
    }
  }

  /**
   * Refresh cache (force rebuild)
   * @returns {object} Fresh inventory
   */
  refresh() {
    return this.get(true);
  }
}

// Singleton instance
let instance = null;

/**
 * Get singleton instance
 * @param {object} options - Cache options
 * @returns {InventoryCache} Cache instance
 */
function getInstance(options) {
  if (!instance) {
    instance = new InventoryCache(options);
  }
  return instance;
}

/**
 * CLI interface
 */
if (require.main === module) {
  const cache = new InventoryCache();
  const command = process.argv[2] || 'stats';

  switch (command) {
    case 'get':
      const inventory = cache.get();
      console.log(JSON.stringify(inventory, null, 2));
      break;

    case 'refresh':
      console.log('Refreshing inventory cache...');
      cache.refresh();
      console.log('✓ Cache refreshed');
      break;

    case 'clear':
      cache.clear();
      console.log('✓ Cache cleared');
      break;

    case 'stats':
      const stats = cache.getStats();
      console.log('\nInventory Cache Statistics:');
      console.log(`  Cached: ${stats.cached}`);
      console.log(`  Valid: ${stats.valid}`);
      console.log(`  Agent Count: ${stats.agentCount}`);
      console.log(`  Cache Age: ${stats.cacheAge ? Math.round(stats.cacheAge / 1000) + 's' : 'N/A'}`);
      console.log(`  TTL: ${Math.round(stats.ttl / 1000)}s`);
      console.log(`  Cache Path: ${stats.cachePath}`);
      break;

    case 'find':
      const query = process.argv[3];
      if (!query) {
        console.log('Usage: inventory-cache.js find <capability>');
        break;
      }

      const matches = cache.findByCapability(query);
      console.log(`\nAgents with capability "${query}":\n`);

      matches.forEach(agent => {
        console.log(`${agent.name}`);
        console.log(`  Success: ${(agent.success_rate * 100).toFixed(1)}% | Latency: ${agent.latency_hint}`);
        console.log(`  Strengths: ${agent.strengths.slice(0, 3).join(', ')}`);
        console.log('');
      });
      break;

    case 'top':
      const limit = parseInt(process.argv[3]) || 20;
      const top = cache.getTopPerformers(limit);

      console.log(`\nTop ${limit} Performing Agents:\n`);

      top.forEach((agent, i) => {
        console.log(`${i + 1}. ${agent.name}`);
        console.log(`   Success: ${(agent.success_rate * 100).toFixed(1)}% | Avg: ${agent.avg_duration_ms}ms`);
        console.log(`   Executions: ${agent.execution_count}`);
        console.log('');
      });
      break;

    default:
      console.log('Inventory Cache Manager');
      console.log('');
      console.log('Commands:');
      console.log('  get                  - Get cached inventory (JSON)');
      console.log('  refresh              - Force rebuild cache');
      console.log('  clear                - Clear cache');
      console.log('  stats                - Show cache statistics');
      console.log('  find <capability>    - Find agents by capability');
      console.log('  top [limit]          - Show top performing agents');
      console.log('');
      console.log('Examples:');
      console.log('  node inventory-cache.js stats');
      console.log('  node inventory-cache.js find "data operations"');
      console.log('  node inventory-cache.js top 10');
  }
}

module.exports = InventoryCache;
module.exports.getInstance = getInstance;
