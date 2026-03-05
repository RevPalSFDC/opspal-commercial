/**
 * task-tool-invoker.test.js
 *
 * Tests for TaskToolInvoker - real Task tool integration for sub-agent execution
 */

const path = require('path');
const os = require('os');

// Mock child_process
jest.mock('child_process', () => ({
  exec: jest.fn()
}));

// Mock fs
jest.mock('fs', () => ({
  existsSync: jest.fn(),
  mkdirSync: jest.fn(),
  writeFileSync: jest.fn(),
  readFileSync: jest.fn(),
  readdirSync: jest.fn(),
  statSync: jest.fn(),
  unlinkSync: jest.fn()
}));

// Mock util
jest.mock('util', () => ({
  promisify: jest.fn((fn) => (...args) => Promise.resolve({ stdout: 'test output', stderr: '' }))
}));

const fs = require('fs');
const { TaskToolInvoker, createRealAgentInvoker, createHybridInvoker } = require('../task-tool-invoker');

describe('TaskToolInvoker', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    fs.existsSync.mockReturnValue(false);
    fs.readdirSync.mockReturnValue([]);
    fs.statSync.mockReturnValue({ isDirectory: () => true, mtimeMs: Date.now() });
  });

  describe('constructor', () => {
    it('should create invoker with default options', () => {
      const invoker = new TaskToolInvoker();
      expect(invoker.outputDir).toContain('supervisor-tasks');
      expect(invoker.verbose).toBe(false);
    });

    it('should accept custom output directory', () => {
      const customDir = '/tmp/custom-tasks';
      const invoker = new TaskToolInvoker({ outputDir: customDir });
      expect(invoker.outputDir).toBe(customDir);
    });

    it('should accept verbose option', () => {
      const invoker = new TaskToolInvoker({ verbose: true });
      expect(invoker.verbose).toBe(true);
    });

    it('should create output directory if not exists', () => {
      fs.existsSync.mockReturnValue(false);
      new TaskToolInvoker({ outputDir: '/tmp/test-dir' });
      expect(fs.mkdirSync).toHaveBeenCalledWith('/tmp/test-dir', { recursive: true });
    });

    it('should not create output directory if exists', () => {
      fs.existsSync.mockReturnValue(true);
      new TaskToolInvoker({ outputDir: '/tmp/existing-dir' });
      expect(fs.mkdirSync).not.toHaveBeenCalled();
    });
  });

  describe('_buildPrompt', () => {
    let invoker;

    beforeEach(() => {
      invoker = new TaskToolInvoker();
    });

    it('should build prompt with action', () => {
      const prompt = invoker._buildPrompt('test-agent', { action: 'analyze' });
      expect(prompt).toContain('Action: analyze');
    });

    it('should build prompt with target', () => {
      const prompt = invoker._buildPrompt('test-agent', { target: '/path/to/file' });
      expect(prompt).toContain('Target: /path/to/file');
    });

    it('should build prompt with description', () => {
      const prompt = invoker._buildPrompt('test-agent', { description: 'Test description' });
      expect(prompt).toContain('Test description');
    });

    it('should build prompt with multiple inputs', () => {
      const prompt = invoker._buildPrompt('test-agent', {
        action: 'validate',
        target: '/test',
        description: 'Validate test'
      });
      expect(prompt).toContain('Action: validate');
      expect(prompt).toContain('Target: /test');
      expect(prompt).toContain('Validate test');
    });

    it('should include additional parameters', () => {
      const prompt = invoker._buildPrompt('test-agent', {
        action: 'test',
        customParam: 'custom-value',
        anotherParam: 42
      });
      expect(prompt).toContain('Additional parameters:');
      expect(prompt).toContain('customParam: custom-value');
      expect(prompt).toContain('anotherParam: 42');
    });

    it('should handle empty inputs', () => {
      const prompt = invoker._buildPrompt('test-agent', {});
      expect(prompt).toBe('');
    });
  });

  describe('_getAgentPath', () => {
    let invoker;

    beforeEach(() => {
      invoker = new TaskToolInvoker();
    });

    it('should find agent in developer-tools-plugin', () => {
      fs.existsSync.mockImplementation((path) =>
        path.includes('developer-tools-plugin') && path.includes('test-agent')
      );

      const result = invoker._getAgentPath('test-agent');
      expect(result).toContain('developer-tools-plugin');
      expect(result).toContain('test-agent.md');
    });

    it('should return null when agent not found', () => {
      fs.existsSync.mockReturnValue(false);
      fs.readdirSync.mockReturnValue([]);

      const result = invoker._getAgentPath('non-existent-agent');
      expect(result).toBeNull();
    });

    it('should search multiple plugin directories', () => {
      fs.existsSync.mockImplementation((path) => {
        if (path.includes('plugins') && !path.includes('.md')) return true;
        return false;
      });
      fs.readdirSync.mockReturnValue(['salesforce-plugin', 'hubspot-plugin']);
      fs.statSync.mockReturnValue({ isDirectory: () => true });

      invoker._getAgentPath('some-agent');
      // Verify it searched through plugins
      expect(fs.readdirSync).toHaveBeenCalled();
    });
  });

  describe('getTaskLogs', () => {
    let invoker;

    beforeEach(() => {
      invoker = new TaskToolInvoker({ outputDir: '/tmp/test' });
    });

    it('should return null when log file not found', () => {
      fs.existsSync.mockReturnValue(false);

      const result = invoker.getTaskLogs('task-123');
      expect(result).toBeNull();
    });

    it('should return parsed logs when file exists', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(JSON.stringify({
        success: true,
        output: 'test result'
      }));

      const result = invoker.getTaskLogs('task-123');
      expect(result).toEqual({ success: true, output: 'test result' });
    });
  });

  describe('cleanup', () => {
    let invoker;

    beforeEach(() => {
      invoker = new TaskToolInvoker({ outputDir: '/tmp/cleanup-test' });
    });

    it('should cleanup old files', () => {
      const oldTime = Date.now() - (25 * 60 * 60 * 1000); // 25 hours ago
      fs.readdirSync.mockReturnValue(['old-file.json', 'new-file.json']);
      fs.statSync
        .mockReturnValueOnce({ mtimeMs: oldTime })
        .mockReturnValueOnce({ mtimeMs: Date.now() });

      const cleaned = invoker.cleanup();
      expect(cleaned).toBe(1);
      expect(fs.unlinkSync).toHaveBeenCalledTimes(1);
    });

    it('should respect custom maxAgeMs', () => {
      const recentTime = Date.now() - (30 * 60 * 1000); // 30 minutes ago
      fs.readdirSync.mockReturnValue(['file.json']);
      fs.statSync.mockReturnValue({ mtimeMs: recentTime });

      // Default 24 hours - should not delete
      let cleaned = invoker.cleanup();
      expect(cleaned).toBe(0);

      // Custom 15 minutes - should delete
      cleaned = invoker.cleanup(15 * 60 * 1000);
      expect(cleaned).toBe(1);
    });

    it('should handle empty directory', () => {
      fs.readdirSync.mockReturnValue([]);
      const cleaned = invoker.cleanup();
      expect(cleaned).toBe(0);
    });
  });

  describe('invoke', () => {
    let invoker;

    beforeEach(() => {
      invoker = new TaskToolInvoker({ outputDir: '/tmp/invoke-test' });
    });

    it('should return result with task metadata', async () => {
      fs.existsSync.mockReturnValue(true);

      const result = await invoker.invoke('test-agent', { action: 'test' });

      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('duration_ms');
      expect(result).toHaveProperty('task_id');
      expect(result).toHaveProperty('agent', 'test-agent');
    });

    it('should include error on failure', async () => {
      fs.existsSync.mockReturnValue(false);

      const result = await invoker.invoke('missing-agent', {});

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
});

describe('createRealAgentInvoker', () => {
  it('should create a function', () => {
    const invoker = createRealAgentInvoker();
    expect(typeof invoker).toBe('function');
  });

  it('should accept options', () => {
    const invoker = createRealAgentInvoker({
      outputDir: '/tmp/custom',
      verbose: true
    });
    expect(typeof invoker).toBe('function');
  });
});

describe('createHybridInvoker', () => {
  it('should create a function', () => {
    const invoker = createHybridInvoker();
    expect(typeof invoker).toBe('function');
  });

  it('should use mock for non-real agents', async () => {
    const invoker = createHybridInvoker({ realAgents: [] });
    const result = await invoker('mock-agent', {});

    expect(result.success).toBe(true);
    expect(result.output).toContain('Mock result');
    expect(result.agent).toBe('mock-agent');
  });

  it('should support wildcard for real agents', async () => {
    fs.existsSync.mockReturnValue(true);
    const invoker = createHybridInvoker({ realAgents: ['*'] });

    const result = await invoker('any-agent', {});
    // Even with wildcard, it goes through real invoker
    expect(result).toHaveProperty('agent', 'any-agent');
  });

  it('should use mock by default', async () => {
    const invoker = createHybridInvoker();
    const result = await invoker('some-agent', {});

    expect(result.success).toBe(true);
    expect(result.output).toContain('Mock result');
  });
});
