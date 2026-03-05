/**
 * readme-generator.test.js
 *
 * Tests for README generator functionality
 *
 * To run: npm test -- readme-generator
 */

const {
  parseAgentFrontmatter,
  extractAgentExample,
  extractAgentMetadata,
  extractScriptMetadata,
  extractCommandMetadata,
  generateFeaturesSection,
  generateAgentsSection,
  generateScriptsSection,
  generateCommandsSection,
  generateReadme,
  writeReadme
} = require('../readme-generator.js');

const fs = require('fs');
const path = require('path');

// Mock fs for testing
jest.mock('fs');

describe('readme-generator', () => {

  describe('parseAgentFrontmatter', () => {
    it('should parse valid YAML frontmatter', () => {
      const content = `---
name: test-agent
description: A test agent
tools: Read, Write
model: sonnet
---

Content here`;

      const result = parseAgentFrontmatter(content);

      expect(result).toBeDefined();
      expect(result.name).toBe('test-agent');
      expect(result.description).toBe('A test agent');
      expect(result.tools).toBe('Read, Write');
      expect(result.model).toBe('sonnet');
    });

    it('should handle null or undefined content', () => {
      expect(parseAgentFrontmatter(null)).toBeNull();
      expect(parseAgentFrontmatter(undefined)).toBeNull();
      expect(parseAgentFrontmatter('')).toBeNull();
    });

    it('should return null for content without frontmatter', () => {
      const content = 'Just some regular content';
      expect(parseAgentFrontmatter(content)).toBeNull();
    });

    it('should handle empty frontmatter', () => {
      const content = `---

---

Content`;
      const result = parseAgentFrontmatter(content);
      expect(result).toEqual({});
    });

    it('should skip lines without colons', () => {
      const content = `---
name: test-agent
invalid line here
description: Test
---`;

      const result = parseAgentFrontmatter(content);
      expect(result.name).toBe('test-agent');
      expect(result.description).toBe('Test');
      expect(result).not.toHaveProperty('invalid');
    });
  });

  describe('extractAgentExample', () => {
    it('should extract example from Example section', () => {
      const content = `# Agent

## Example

\`\`\`yaml
key: value
test: example
\`\`\`

More content`;

      const result = extractAgentExample(content);
      expect(result).toContain('key: value');
      expect(result).toContain('test: example');
    });

    it('should extract example from Usage section', () => {
      const content = `# Agent

## Usage

\`\`\`bash
command --option
\`\`\``;

      const result = extractAgentExample(content);
      expect(result).toContain('command --option');
    });

    it('should return null if no example found', () => {
      const content = '# Agent\n\nNo examples here';
      expect(extractAgentExample(content)).toBeNull();
    });

    it('should handle null or undefined content', () => {
      expect(extractAgentExample(null)).toBeNull();
      expect(extractAgentExample(undefined)).toBeNull();
    });
  });

  describe('extractAgentMetadata', () => {
    beforeEach(() => {
      fs.readFileSync.mockClear();
    });

    it('should extract complete agent metadata', () => {
      const mockContent = `---
name: test-agent
description: Test agent description
tools: Read, Write, Grep
model: sonnet
---

## Example

\`\`\`yaml
test: data
\`\`\``;

      fs.readFileSync.mockReturnValue(mockContent);

      const result = extractAgentMetadata('/path/to/test-agent.md');

      expect(result.name).toBe('test-agent');
      expect(result.description).toBe('Test agent description');
      expect(result.tools).toBe('Read, Write, Grep');
      expect(result.model).toBe('sonnet');
      expect(result.example).toContain('test: data');
    });

    it('should handle missing frontmatter gracefully', () => {
      fs.readFileSync.mockReturnValue('# Agent\n\nNo frontmatter here');

      const result = extractAgentMetadata('/path/to/agent.md');

      expect(result.name).toBe('agent');
      expect(result.description).toBe('No description available');
      expect(result.tools).toBe('Not specified');
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
 * @usage node test-script.js --option
 * @example node test-script.js --help
 * @example node test-script.js --verbose
 */

const script = 'code';`;

      fs.readFileSync.mockReturnValue(mockContent);

      const result = extractScriptMetadata('/path/to/test-script.js');

      expect(result.name).toBe('test-script.js');
      expect(result.purpose).toBe('Test script for validation');
      expect(result.usage).toContain('node test-script.js --option');
      expect(result.examples).toHaveLength(2);
      expect(result.examples[0]).toContain('--help');
    });

    it('should handle scripts without JSDoc', () => {
      fs.readFileSync.mockReturnValue('const x = 1;');

      const result = extractScriptMetadata('/path/to/simple.js');

      expect(result.name).toBe('simple.js');
      expect(result.purpose).toBe('No description available');
      expect(result.examples).toEqual([]);
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
      expect(result.filename).toBe('test-command');
      expect(result.description).toBe('This is a test command description.');
      expect(result.path).toBe('./commands/test-command.md');
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

  describe('generateFeaturesSection', () => {
    it('should generate complete features section', () => {
      const plugin = { name: 'test-plugin' };
      const metadata = {
        agents: [
          { name: 'agent-1', description: 'First agent' },
          { name: 'agent-2', description: 'Second agent' }
        ],
        scripts: [
          { name: 'script-1.js', purpose: 'First script' }
        ],
        commands: [
          { name: '/cmd1', description: 'First command' }
        ]
      };

      const result = generateFeaturesSection(plugin, metadata);

      expect(result).toContain('## Features');
      expect(result).toContain('### Agents');
      expect(result).toContain('**agent-1**: First agent');
      expect(result).toContain('### Scripts');
      expect(result).toContain('**script-1.js**: First script');
      expect(result).toContain('### Commands');
      expect(result).toContain('**/cmd1**: First command');
    });

    it('should handle empty metadata', () => {
      const plugin = { name: 'test-plugin' };
      const metadata = { agents: [], scripts: [], commands: [] };

      const result = generateFeaturesSection(plugin, metadata);

      expect(result).toContain('## Features');
      expect(result).not.toContain('### Agents');
      expect(result).not.toContain('### Scripts');
    });
  });

  describe('generateAgentsSection', () => {
    it('should generate agents section with examples', () => {
      const agents = [
        {
          name: 'test-agent',
          description: 'Test description',
          tools: 'Read, Write',
          example: 'key: value'
        }
      ];

      const result = generateAgentsSection(agents);

      expect(result).toContain('## Agents');
      expect(result).toContain('### test-agent');
      expect(result).toContain('**Description:** Test description');
      expect(result).toContain('**Tools:** Read, Write');
      expect(result).toContain('```');
      expect(result).toContain('key: value');
    });

    it('should handle agents without examples', () => {
      const agents = [
        {
          name: 'simple-agent',
          description: 'Simple',
          tools: 'Read',
          example: null
        }
      ];

      const result = generateAgentsSection(agents);

      expect(result).toContain('### simple-agent');
      expect(result).not.toContain('**Example:**');
    });

    it('should return empty string for no agents', () => {
      expect(generateAgentsSection([])).toBe('');
      expect(generateAgentsSection(null)).toBe('');
    });
  });

  describe('generateScriptsSection', () => {
    it('should generate scripts section with examples', () => {
      const scripts = [
        {
          name: 'test.js',
          purpose: 'Test script',
          usage: 'node test.js --flag',
          examples: ['node test.js --help', 'node test.js --verbose']
        }
      ];

      const result = generateScriptsSection(scripts, 'my-plugin');

      expect(result).toContain('## Scripts');
      expect(result).toContain('### test.js');
      expect(result).toContain('**Purpose:** Test script');
      expect(result).toContain('node test.js --flag');
      expect(result).toContain('**Examples:**');
      expect(result).toContain('--help');
      expect(result).toContain('--verbose');
    });

    it('should generate default usage if not provided', () => {
      const scripts = [
        {
          name: 'simple.js',
          purpose: 'Simple script',
          usage: null,
          examples: []
        }
      ];

      const result = generateScriptsSection(scripts, 'test-plugin');

      expect(result).toContain('node .claude-plugins/test-plugin/scripts/simple.js');
    });

    it('should return empty string for no scripts', () => {
      expect(generateScriptsSection([], 'plugin')).toBe('');
      expect(generateScriptsSection(null, 'plugin')).toBe('');
    });
  });

  describe('generateCommandsSection', () => {
    it('should generate commands section', () => {
      const commands = [
        {
          name: '/test',
          filename: 'test',
          description: 'Test command',
          path: './commands/test.md'
        }
      ];

      const result = generateCommandsSection(commands);

      expect(result).toContain('## Commands');
      expect(result).toContain('### /test');
      expect(result).toContain('Test command');
      expect(result).toContain('[commands/test.md](./commands/test.md)');
    });

    it('should return empty string for no commands', () => {
      expect(generateCommandsSection([])).toBe('');
      expect(generateCommandsSection(null)).toBe('');
    });
  });

  describe('writeReadme', () => {
    beforeEach(() => {
      fs.writeFileSync.mockClear();
    });

    it('should write README to plugin directory', () => {
      const pluginPath = '/path/to/plugin';
      const readme = '# Test README\n\nContent here';

      const result = writeReadme(pluginPath, readme);

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        '/path/to/plugin/README.md',
        readme,
        'utf8'
      );
      expect(result).toBe('/path/to/plugin/README.md');
    });
  });

  describe('generateReadme', () => {
    beforeEach(() => {
      fs.existsSync.mockClear();
      fs.readFileSync.mockClear();
      fs.readdirSync.mockClear();
    });

    it('should throw error when plugin.json is missing', () => {
      fs.existsSync.mockReturnValue(false);

      expect(() => generateReadme('/path/to/plugin')).toThrow('Plugin manifest not found');
    });

    it('should generate README from plugin components', () => {
      const mockManifest = JSON.stringify({
        name: 'test-plugin',
        version: '1.0.0',
        description: 'A test plugin'
      });

      const mockAgent = `---
name: test-agent
description: Test agent
tools: Read
---

# Test Agent`;

      fs.existsSync.mockImplementation((p) => {
        if (p.includes('plugin.json')) return true;
        if (p.includes('agents')) return true;
        if (p.includes('scripts')) return false;
        if (p.includes('commands')) return false;
        return false;
      });

      fs.readFileSync.mockImplementation((p) => {
        if (p.includes('plugin.json')) return mockManifest;
        if (p.includes('.md')) return mockAgent;
        return '';
      });

      fs.readdirSync.mockImplementation((p) => {
        if (p.includes('agents')) return ['test-agent.md'];
        return [];
      });

      const result = generateReadme('/path/to/plugin');

      expect(result).toContain('test-plugin');
      expect(result).toContain('Test Plugin'); // Title case
    });
  });

});
