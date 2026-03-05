/**
 * catalog-builder.test.js
 *
 * Tests for marketplace catalog builder functionality
 *
 * To run: npm test -- catalog-builder
 */

const {
  scanPlugins,
  extractPluginMetadata,
  buildCatalog,
  searchCatalog,
  filterByDomain,
  generateStatistics,
  generateMarkdown,
  generateCSV,
  writeCatalog,
  parseAgentFrontmatter,
  extractAgentMetadata,
  extractScriptMetadata,
  extractCommandMetadata
} = require('../catalog-builder.js');

const fs = require('fs');
const path = require('path');

// Mock fs for testing
jest.mock('fs');

describe('catalog-builder', () => {

  describe('scanPlugins', () => {
    beforeEach(() => {
      fs.existsSync.mockClear();
      fs.readdirSync.mockClear();
      fs.statSync.mockClear();
    });

    it('should scan and return valid plugin directories', () => {
      const rootDir = '/marketplace';
      fs.existsSync.mockImplementation((p) => {
        if (p === '/marketplace/.claude-plugins') return true;
        if (p.endsWith('plugin.json')) return true;
        return false;
      });
      fs.readdirSync.mockReturnValue(['plugin1', 'plugin2', 'not-a-plugin']);
      fs.statSync.mockImplementation((p) => ({
        isDirectory: () => !p.includes('not-a-plugin')
      }));

      const result = scanPlugins(rootDir);

      expect(result).toHaveLength(2);
      expect(result[0]).toContain('plugin1');
      expect(result[1]).toContain('plugin2');
    });

    it('should return empty array if .claude-plugins does not exist', () => {
      fs.existsSync.mockReturnValue(false);

      const result = scanPlugins('/marketplace');

      expect(result).toEqual([]);
    });

    it('should filter out directories without plugin.json', () => {
      fs.existsSync.mockImplementation((p) => {
        if (p === '/marketplace/.claude-plugins') return true;
        if (p.includes('plugin1') && p.endsWith('plugin.json')) return true;
        if (p.includes('plugin2') && p.endsWith('plugin.json')) return false;
        return false;
      });
      fs.readdirSync.mockReturnValue(['plugin1', 'plugin2']);
      fs.statSync.mockReturnValue({ isDirectory: () => true });

      const result = scanPlugins('/marketplace');

      expect(result).toHaveLength(1);
      expect(result[0]).toContain('plugin1');
    });
  });

  describe('parseAgentFrontmatter', () => {
    it('should parse valid YAML frontmatter', () => {
      const content = `---
name: test-agent
description: Test agent
tools: Read, Write
model: sonnet
---

Content here`;

      const result = parseAgentFrontmatter(content);

      expect(result).toBeDefined();
      expect(result.name).toBe('test-agent');
      expect(result.description).toBe('Test agent');
      expect(result.tools).toBe('Read, Write');
      expect(result.model).toBe('sonnet');
    });

    it('should return null for null or undefined content', () => {
      expect(parseAgentFrontmatter(null)).toBeNull();
      expect(parseAgentFrontmatter(undefined)).toBeNull();
      expect(parseAgentFrontmatter('')).toBeNull();
    });

    it('should return null for content without frontmatter', () => {
      const content = 'Just regular content';
      expect(parseAgentFrontmatter(content)).toBeNull();
    });
  });

  describe('extractAgentMetadata', () => {
    beforeEach(() => {
      fs.readFileSync.mockClear();
    });

    it('should extract agent metadata', () => {
      const mockContent = `---
name: test-agent
description: Test agent description
tools: Read, Write
model: sonnet
---

Content`;

      fs.readFileSync.mockReturnValue(mockContent);

      const result = extractAgentMetadata('/path/to/test-agent.md');

      expect(result.name).toBe('test-agent');
      expect(result.description).toBe('Test agent description');
      expect(result.tools).toBe('Read, Write');
      expect(result.model).toBe('sonnet');
    });

    it('should handle file read errors', () => {
      fs.readFileSync.mockImplementation(() => {
        throw new Error('File not found');
      });

      const result = extractAgentMetadata('/path/to/missing.md');

      expect(result.name).toBe('missing');
      expect(result.description).toBe('Error reading agent file');
      expect(result.error).toBe('File not found');
    });
  });

  describe('extractScriptMetadata', () => {
    beforeEach(() => {
      fs.readFileSync.mockClear();
    });

    it('should extract script metadata from JSDoc', () => {
      const mockContent = `/**
 * @description Test script for validation
 */

const script = 'code';`;

      fs.readFileSync.mockReturnValue(mockContent);

      const result = extractScriptMetadata('/path/to/test-script.js');

      expect(result.name).toBe('test-script.js');
      expect(result.purpose).toBe('Test script for validation');
    });

    it('should handle scripts without JSDoc', () => {
      fs.readFileSync.mockReturnValue('const x = 1;');

      const result = extractScriptMetadata('/path/to/simple.js');

      expect(result.name).toBe('simple.js');
      expect(result.purpose).toBe('No description available');
    });

    it('should handle file read errors', () => {
      fs.readFileSync.mockImplementation(() => {
        throw new Error('Permission denied');
      });

      const result = extractScriptMetadata('/path/to/error.js');

      expect(result.purpose).toBe('Error reading script file');
      expect(result.error).toBe('Permission denied');
    });
  });

  describe('extractCommandMetadata', () => {
    beforeEach(() => {
      fs.readFileSync.mockClear();
    });

    it('should extract command metadata', () => {
      const mockContent = `---
name: test-command
---

This is a test command description.

More details here.`;

      fs.readFileSync.mockReturnValue(mockContent);

      const result = extractCommandMetadata('/path/to/test-command.md');

      expect(result.name).toBe('/test-command');
      expect(result.description).toBe('This is a test command description.');
    });

    it('should handle commands without frontmatter', () => {
      const mockContent = 'Simple command description.';
      fs.readFileSync.mockReturnValue(mockContent);

      const result = extractCommandMetadata('/path/to/simple.md');

      expect(result.description).toBe('Simple command description.');
    });

    it('should handle file read errors', () => {
      fs.readFileSync.mockImplementation(() => {
        throw new Error('File error');
      });

      const result = extractCommandMetadata('/path/to/error.md');

      expect(result.description).toBe('Error reading command file');
      expect(result.error).toBe('File error');
    });
  });

  describe('extractPluginMetadata', () => {
    beforeEach(() => {
      fs.existsSync.mockClear();
      fs.readFileSync.mockClear();
      fs.readdirSync.mockClear();
    });

    it('should extract complete plugin metadata', () => {
      const pluginJson = {
        name: 'test-plugin',
        version: '1.0.0',
        description: 'Test plugin',
        author: { name: 'Test Author' },
        dependencies: {}
      };

      fs.existsSync.mockImplementation((p) => {
        if (p.includes('plugin.json')) return true;
        if (p.includes('agents')) return true;
        if (p.includes('scripts')) return true;
        if (p.includes('commands')) return true;
        return false;
      });

      fs.readFileSync.mockImplementation((p) => {
        if (p.includes('plugin.json')) {
          return JSON.stringify(pluginJson);
        }
        if (p.includes('agent')) {
          return `---\nname: test-agent\ndescription: Test\n---`;
        }
        if (p.includes('script')) {
          return `/** @description Test */`;
        }
        if (p.includes('command')) {
          return 'Test command';
        }
        return '';
      });

      fs.readdirSync.mockImplementation((p) => {
        if (p.includes('agents')) return ['agent1.md'];
        if (p.includes('scripts')) return ['script1.js'];
        if (p.includes('commands')) return ['command1.md'];
        return [];
      });

      const result = extractPluginMetadata('/path/to/test-plugin');

      expect(result.name).toBe('test-plugin');
      expect(result.version).toBe('1.0.0');
      expect(result.agentCount).toBe(1);
      expect(result.scriptCount).toBe(1);
      expect(result.commandCount).toBe(1);
      expect(result.agents).toHaveLength(1);
      expect(result.scripts).toHaveLength(1);
      expect(result.commands).toHaveLength(1);
    });

    it('should return null if plugin.json does not exist', () => {
      fs.existsSync.mockReturnValue(false);

      const result = extractPluginMetadata('/path/to/plugin');

      expect(result).toBeNull();
    });

    it('should handle JSON parse errors', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue('invalid json');

      const result = extractPluginMetadata('/path/to/plugin');

      expect(result.description).toBe('Error reading plugin manifest');
      expect(result.error).toBeDefined();
    });
  });

  describe('buildCatalog', () => {
    beforeEach(() => {
      fs.existsSync.mockClear();
      fs.readFileSync.mockClear();
      fs.readdirSync.mockClear();
      fs.statSync.mockClear();
    });

    it('should build complete catalog', () => {
      // Mock scanPlugins behavior
      fs.existsSync.mockImplementation((p) => {
        if (p.includes('.claude-plugins')) return true;
        if (p.includes('plugin.json')) return true;
        return false;
      });

      fs.readdirSync.mockImplementation((p) => {
        if (p.includes('.claude-plugins')) return ['plugin1', 'plugin2'];
        return [];
      });

      fs.statSync.mockReturnValue({ isDirectory: () => true });

      fs.readFileSync.mockImplementation((p) => {
        if (p.includes('plugin.json')) {
          const name = p.includes('plugin1') ? 'plugin1' : 'plugin2';
          return JSON.stringify({
            name,
            version: '1.0.0',
            description: `${name} description`
          });
        }
        return '';
      });

      const result = buildCatalog('/marketplace');

      expect(result.summary.totalPlugins).toBe(2);
      expect(result.plugins).toHaveLength(2);
      expect(result.generated).toBeDefined();
      expect(result.version).toBe('1.0.0');
    });

    it('should calculate correct summary statistics', () => {
      fs.existsSync.mockImplementation((p) => {
        if (p.endsWith('.claude-plugins')) return true;
        if (p.includes('plugin.json')) return true;
        if (p.endsWith('agents')) return true;
        return false;
      });

      fs.readdirSync.mockImplementation((p) => {
        if (p.endsWith('.claude-plugins')) return ['plugin1'];
        if (p.endsWith('agents')) return ['agent1.md', 'agent2.md'];
        return [];
      });

      fs.statSync.mockReturnValue({ isDirectory: () => true });

      fs.readFileSync.mockImplementation((p) => {
        if (p.includes('plugin.json')) {
          return JSON.stringify({
            name: 'plugin1',
            version: '1.0.0',
            description: 'Test'
          });
        }
        if (p.includes('agent') && p.endsWith('.md')) {
          return `---
name: test-agent
description: Test agent
---`;
        }
        return '';
      });

      const result = buildCatalog('/marketplace');

      expect(result.summary.totalAgents).toBe(2);
    });
  });

  describe('searchCatalog', () => {
    const mockCatalog = {
      plugins: [
        {
          name: 'salesforce-plugin',
          agents: [
            { name: 'metadata-manager', description: 'Manages metadata' },
            { name: 'query-specialist', description: 'SOQL queries' }
          ],
          scripts: [
            { name: 'deploy.js', purpose: 'Deploy metadata' }
          ],
          commands: [
            { name: '/deploy', description: 'Deploy to org' }
          ]
        }
      ]
    };

    it('should search agents by name', () => {
      const result = searchCatalog(mockCatalog, 'metadata');

      expect(result.count).toBeGreaterThan(0);
      expect(result.results[0].type).toBe('agent');
      expect(result.results[0].name).toBe('metadata-manager');
    });

    it('should search scripts by purpose', () => {
      const result = searchCatalog(mockCatalog, 'deploy');

      expect(result.count).toBeGreaterThan(0);
      const scriptResult = result.results.find(r => r.type === 'script');
      expect(scriptResult).toBeDefined();
      expect(scriptResult.name).toBe('deploy.js');
    });

    it('should search commands', () => {
      const result = searchCatalog(mockCatalog, 'deploy');

      expect(result.count).toBeGreaterThan(0);
      const commandResult = result.results.find(r => r.type === 'command');
      expect(commandResult).toBeDefined();
      expect(commandResult.name).toBe('/deploy');
    });

    it('should be case insensitive', () => {
      const result = searchCatalog(mockCatalog, 'METADATA');

      expect(result.count).toBeGreaterThan(0);
    });

    it('should return empty results for null or invalid input', () => {
      expect(searchCatalog(null, 'test').count).toBe(0);
      expect(searchCatalog(mockCatalog, null).count).toBe(0);
      expect(searchCatalog(mockCatalog, '').count).toBe(0);
    });
  });

  describe('filterByDomain', () => {
    const mockCatalog = {
      summary: { totalPlugins: 3, totalAgents: 10, totalScripts: 20, totalCommands: 5 },
      plugins: [
        { name: 'salesforce-plugin', agentCount: 5, scriptCount: 10, commandCount: 2, description: 'SF plugin' },
        { name: 'hubspot-plugin', agentCount: 3, scriptCount: 5, commandCount: 1, description: 'HS plugin' },
        { name: 'developer-tools-plugin', agentCount: 2, scriptCount: 5, commandCount: 2, description: 'Dev tools' }
      ]
    };

    it('should filter by salesforce domain', () => {
      const result = filterByDomain(mockCatalog, 'salesforce');

      expect(result.plugins).toHaveLength(1);
      expect(result.plugins[0].name).toBe('salesforce-plugin');
      expect(result.summary.totalAgents).toBe(5);
    });

    it('should filter by hubspot domain', () => {
      const result = filterByDomain(mockCatalog, 'hubspot');

      expect(result.plugins).toHaveLength(1);
      expect(result.plugins[0].name).toBe('hubspot-plugin');
    });

    it('should filter by developer domain', () => {
      const result = filterByDomain(mockCatalog, 'developer');

      expect(result.plugins).toHaveLength(1);
      expect(result.plugins[0].name).toBe('developer-tools-plugin');
    });

    it('should return original catalog for null or invalid domain', () => {
      expect(filterByDomain(null, 'test')).toBeNull();
      expect(filterByDomain(mockCatalog, null)).toEqual(mockCatalog);
    });

    it('should update summary statistics', () => {
      const result = filterByDomain(mockCatalog, 'salesforce');

      expect(result.summary.totalPlugins).toBe(1);
      expect(result.summary.totalAgents).toBe(5);
      expect(result.summary.totalScripts).toBe(10);
      expect(result.summary.totalCommands).toBe(2);
    });

    it('should mark catalog as filtered', () => {
      const result = filterByDomain(mockCatalog, 'salesforce');

      expect(result.filtered).toBeDefined();
      expect(result.filtered.domain).toBe('salesforce');
    });
  });

  describe('generateStatistics', () => {
    const mockCatalog = {
      summary: { totalPlugins: 2, totalAgents: 10, totalScripts: 20, totalCommands: 5 },
      plugins: [
        { name: 'salesforce-plugin', version: '1.0.0', agentCount: 5, scriptCount: 10, commandCount: 2 },
        { name: 'hubspot-plugin', version: '1.0.0', agentCount: 5, scriptCount: 10, commandCount: 3 }
      ]
    };

    it('should generate complete statistics', () => {
      const result = generateStatistics(mockCatalog);

      expect(result.summary).toBeDefined();
      expect(result.byPlugin).toHaveLength(2);
      expect(result.byDomain).toBeDefined();
      expect(result.averages).toBeDefined();
    });

    it('should calculate correct averages', () => {
      const result = generateStatistics(mockCatalog);

      expect(result.averages.agentsPerPlugin).toBe('5.0');
      expect(result.averages.scriptsPerPlugin).toBe('10.0');
      expect(result.averages.commandsPerPlugin).toBe('2.5');
    });

    it('should group plugins by domain', () => {
      const result = generateStatistics(mockCatalog);

      expect(result.byDomain.salesforce).toBeDefined();
      expect(result.byDomain.salesforce.pluginCount).toBe(1);
      expect(result.byDomain.hubspot).toBeDefined();
      expect(result.byDomain.hubspot.pluginCount).toBe(1);
    });

    it('should handle empty catalog', () => {
      const result = generateStatistics({ plugins: [] });

      expect(result.averages).toBeDefined();
    });

    it('should return empty object for null catalog', () => {
      const result = generateStatistics(null);

      expect(result).toEqual({});
    });
  });

  describe('generateMarkdown', () => {
    const mockCatalog = {
      generated: new Date('2025-01-01').toISOString(),
      summary: { totalPlugins: 1, totalAgents: 2, totalScripts: 1, totalCommands: 1 },
      plugins: [
        {
          name: 'test-plugin',
          version: '1.0.0',
          description: 'Test plugin',
          agentCount: 2,
          scriptCount: 1,
          commandCount: 1,
          agents: [
            { name: 'agent1', description: 'Agent 1' },
            { name: 'agent2', description: 'Agent 2' }
          ],
          scripts: [
            { name: 'script1.js', purpose: 'Script 1' }
          ],
          commands: [
            { name: '/command1', description: 'Command 1' }
          ]
        }
      ]
    };

    it('should generate markdown catalog', () => {
      const result = generateMarkdown(mockCatalog);

      expect(result).toContain('# OpsPal Plugin Marketplace Catalog');
      expect(result).toContain('## Summary');
      expect(result).toContain('Total Plugins');
      expect(result).toContain('Total Agents');
    });

    it('should include plugin information', () => {
      const result = generateMarkdown(mockCatalog);

      expect(result).toContain('test-plugin');
      expect(result).toContain('v1.0.0');
      expect(result).toContain('Test plugin');
    });

    it('should include agents', () => {
      const result = generateMarkdown(mockCatalog);

      expect(result).toContain('agent1');
      expect(result).toContain('Agent 1');
    });

    it('should include scripts', () => {
      const result = generateMarkdown(mockCatalog);

      expect(result).toContain('script1.js');
    });

    it('should include commands', () => {
      const result = generateMarkdown(mockCatalog);

      expect(result).toContain('/command1');
    });

    it('should return empty string for null catalog', () => {
      const result = generateMarkdown(null);

      expect(result).toBe('');
    });

    it('should truncate long agent lists', () => {
      const largeCatalog = {
        ...mockCatalog,
        plugins: [
          {
            ...mockCatalog.plugins[0],
            agents: Array(10).fill(0).map((_, i) => ({
              name: `agent${i}`,
              description: `Agent ${i}`
            }))
          }
        ]
      };

      const result = generateMarkdown(largeCatalog);

      expect(result).toContain('more');
    });
  });

  describe('generateCSV', () => {
    const mockCatalog = {
      plugins: [
        {
          name: 'test-plugin',
          version: '1.0.0',
          description: 'Test plugin description',
          agentCount: 2,
          scriptCount: 1,
          commandCount: 1
        },
        {
          name: 'another-plugin',
          version: '2.0.0',
          description: 'Another plugin',
          agentCount: 3,
          scriptCount: 2,
          commandCount: 2
        }
      ]
    };

    it('should generate CSV catalog', () => {
      const result = generateCSV(mockCatalog);

      expect(result).toContain('Plugin,Version,Description,Agents,Scripts,Commands');
      expect(result).toContain('test-plugin');
      expect(result).toContain('1.0.0');
    });

    it('should escape commas in descriptions', () => {
      const catalog = {
        plugins: [
          {
            name: 'test',
            version: '1.0.0',
            description: 'Has, commas, here',
            agentCount: 1,
            scriptCount: 1,
            commandCount: 1
          }
        ]
      };

      const result = generateCSV(catalog);

      expect(result).toContain('Has; commas; here');
    });

    it('should include all plugin data', () => {
      const result = generateCSV(mockCatalog);

      expect(result).toContain('2,1,1');
    });

    it('should return empty string for null catalog', () => {
      const result = generateCSV(null);

      expect(result).toBe('');
    });
  });

  describe('writeCatalog', () => {
    beforeEach(() => {
      fs.writeFileSync.mockClear();
    });

    it('should write catalog to file', () => {
      const content = '# Catalog\n\nContent here';
      const filePath = '/output/catalog.md';

      const result = writeCatalog(filePath, content);

      expect(fs.writeFileSync).toHaveBeenCalledWith(filePath, content, 'utf8');
      expect(result).toBe(filePath);
    });
  });

});
