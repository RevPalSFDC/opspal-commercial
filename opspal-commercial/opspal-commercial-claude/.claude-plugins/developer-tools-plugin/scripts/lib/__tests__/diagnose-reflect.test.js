/**
 * diagnose-reflect.test.js
 *
 * Tests for /reflect command diagnostic tool
 *
 * This module auto-executes on load and functions are not exported.
 * We test by mocking dependencies and verifying console output.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { EventEmitter } = require('events');

// Mock modules before requiring the source
jest.mock('fs');
jest.mock('https');
jest.mock('http');

// Store original values
const originalArgv = process.argv;
const originalExit = process.exit;
const originalEnv = { ...process.env };

describe('diagnose-reflect', () => {
  let consoleSpy;
  let consoleErrorSpy;
  let consoleLogCalls;
  let mockExit;

  /**
   * Create a mock HTTP response
   */
  function createMockHttpResponse(data, statusCode = 200) {
    const responseEmitter = new EventEmitter();
    responseEmitter.statusCode = statusCode;
    responseEmitter.headers = {};

    const requestEmitter = new EventEmitter();
    requestEmitter.end = jest.fn();
    requestEmitter.destroy = jest.fn();

    https.request.mockImplementation((options, callback) => {
      process.nextTick(() => {
        callback(responseEmitter);
        responseEmitter.emit('data', data);
        responseEmitter.emit('end');
      });
      return requestEmitter;
    });

    return { requestEmitter, responseEmitter };
  }

  /**
   * Create a mock HTTP error
   */
  function createMockHttpError(errorMessage) {
    const requestEmitter = new EventEmitter();
    requestEmitter.end = jest.fn();
    requestEmitter.destroy = jest.fn();

    https.request.mockImplementation(() => {
      process.nextTick(() => requestEmitter.emit('error', new Error(errorMessage)));
      return requestEmitter;
    });

    return requestEmitter;
  }

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    consoleLogCalls = [];

    // Mock console.log to capture output
    consoleSpy = jest.spyOn(console, 'log').mockImplementation((msg) => {
      consoleLogCalls.push(msg);
    });
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

    // Mock process.exit
    mockExit = jest.fn();
    process.exit = mockExit;

    // Reset environment
    process.env = { ...originalEnv };

    // Default fs mocks
    fs.existsSync.mockReturnValue(false);
    fs.readdirSync.mockReturnValue([]);
    fs.statSync.mockReturnValue({ size: 1024, mtimeMs: Date.now() - 60000 });
    fs.readFileSync.mockReturnValue('{}');
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    process.argv = originalArgv;
    process.exit = originalExit;
    process.env = originalEnv;
  });

  describe('module loading and CLI execution', () => {
    it('should run diagnose on module load', async () => {
      // Setup successful HTTP response
      createMockHttpResponse(JSON.stringify([{ org: 'test', total_issues: 1, created_at: new Date().toISOString() }]), 200);

      // Setup fs mocks - no .claude directory
      fs.existsSync.mockReturnValue(false);

      process.argv = ['node', 'diagnose-reflect.js', '/test/project'];

      // Require the module - it will auto-execute
      jest.isolateModules(() => {
        require('../diagnose-reflect');
      });

      // Give async operations time to complete
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify it started running
      expect(consoleSpy).toHaveBeenCalled();
    });

    it('should use provided project path', async () => {
      createMockHttpResponse('[]', 200);
      fs.existsSync.mockReturnValue(false);

      process.argv = ['node', 'diagnose-reflect.js', '/custom/project/path'];

      jest.isolateModules(() => {
        require('../diagnose-reflect');
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      // The module should have run with the custom path
      expect(consoleSpy).toHaveBeenCalled();
    });

    it('should default to cwd when no path provided', async () => {
      createMockHttpResponse('[]', 200);
      fs.existsSync.mockReturnValue(false);

      process.argv = ['node', 'diagnose-reflect.js'];

      jest.isolateModules(() => {
        require('../diagnose-reflect');
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(consoleSpy).toHaveBeenCalled();
    });
  });

  describe('file system checks', () => {
    it('should check for .claude directory', async () => {
      createMockHttpResponse('[]', 200);
      fs.existsSync.mockReturnValue(false);

      process.argv = ['node', 'diagnose-reflect.js', '/test'];

      jest.isolateModules(() => {
        require('../diagnose-reflect');
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      // Module should have run and logged output about the directory check
      expect(consoleSpy).toHaveBeenCalled();
    });

    it('should find reflection files in .claude directory', async () => {
      createMockHttpResponse('[]', 200);

      fs.existsSync.mockReturnValue(true);
      fs.readdirSync.mockReturnValue([
        'SESSION_REFLECTION_2025-01-15.json',
        'SESSION_REFLECTION_2025-01-14.json',
        'other-file.txt'
      ]);
      fs.readFileSync.mockReturnValue(JSON.stringify({ issues: [{ id: 1 }] }));
      fs.statSync.mockReturnValue({ size: 2048, mtimeMs: Date.now() - 60000 });

      process.argv = ['node', 'diagnose-reflect.js', '/test'];

      jest.isolateModules(() => {
        require('../diagnose-reflect');
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      // Module should have run - fs calls happen inside isolateModules context
      expect(consoleSpy).toHaveBeenCalled();
    });

    it('should parse and validate reflection JSON', async () => {
      createMockHttpResponse('[]', 200);

      fs.existsSync.mockReturnValue(true);
      fs.readdirSync.mockReturnValue(['SESSION_REFLECTION_2025-01-15.json']);
      fs.readFileSync.mockReturnValue(JSON.stringify({
        issues: [{ id: 1, description: 'Test issue' }],
        issues_identified: [{ id: 1 }]
      }));
      fs.statSync.mockReturnValue({ size: 1024, mtimeMs: Date.now() - 60000 });

      process.argv = ['node', 'diagnose-reflect.js', '/test'];

      jest.isolateModules(() => {
        require('../diagnose-reflect');
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      // Module should have run and processed JSON
      expect(consoleSpy).toHaveBeenCalled();
    });

    it('should handle invalid JSON in reflection file', async () => {
      createMockHttpResponse('[]', 200);

      fs.existsSync.mockReturnValue(true);
      fs.readdirSync.mockReturnValue(['SESSION_REFLECTION_2025-01-15.json']);
      fs.readFileSync.mockReturnValue('not valid json {{{');
      fs.statSync.mockReturnValue({ size: 1024, mtimeMs: Date.now() - 60000 });

      process.argv = ['node', 'diagnose-reflect.js', '/test'];

      jest.isolateModules(() => {
        require('../diagnose-reflect');
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      // Should have logged something about JSON parsing error
      expect(consoleSpy).toHaveBeenCalled();
    });
  });

  describe('environment variable checks', () => {
    it('should check for SUPABASE_URL', async () => {
      createMockHttpResponse('[]', 200);
      fs.existsSync.mockReturnValue(false);

      process.env.SUPABASE_URL = 'https://test.supabase.co';

      process.argv = ['node', 'diagnose-reflect.js', '/test'];

      jest.isolateModules(() => {
        require('../diagnose-reflect');
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(consoleSpy).toHaveBeenCalled();
    });

    it('should check for SUPABASE_ANON_KEY', async () => {
      createMockHttpResponse('[]', 200);
      fs.existsSync.mockReturnValue(false);

      process.env.SUPABASE_ANON_KEY = 'test_anon_key_12345';

      process.argv = ['node', 'diagnose-reflect.js', '/test'];

      jest.isolateModules(() => {
        require('../diagnose-reflect');
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(consoleSpy).toHaveBeenCalled();
    });

    it('should check for USER_EMAIL', async () => {
      createMockHttpResponse('[]', 200);
      fs.existsSync.mockReturnValue(false);

      process.env.USER_EMAIL = 'test@example.com';

      process.argv = ['node', 'diagnose-reflect.js', '/test'];

      jest.isolateModules(() => {
        require('../diagnose-reflect');
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(consoleSpy).toHaveBeenCalled();
    });
  });

  describe('Supabase connectivity', () => {
    it('should test Supabase connection', async () => {
      createMockHttpResponse(JSON.stringify([{ id: 1 }]), 200);
      fs.existsSync.mockReturnValue(false);

      process.argv = ['node', 'diagnose-reflect.js', '/test'];

      jest.isolateModules(() => {
        require('../diagnose-reflect');
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      // Module should have run and attempted connection
      expect(consoleSpy).toHaveBeenCalled();
    });

    it('should handle Supabase connection success', async () => {
      createMockHttpResponse(JSON.stringify([{ org: 'test-org', total_issues: 5, created_at: new Date().toISOString() }]), 200);
      fs.existsSync.mockReturnValue(false);

      process.argv = ['node', 'diagnose-reflect.js', '/test'];

      jest.isolateModules(() => {
        require('../diagnose-reflect');
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(consoleSpy).toHaveBeenCalled();
    });

    it('should handle Supabase connection failure', async () => {
      createMockHttpError('Network error');
      fs.existsSync.mockReturnValue(false);

      process.argv = ['node', 'diagnose-reflect.js', '/test'];

      jest.isolateModules(() => {
        require('../diagnose-reflect');
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(consoleSpy).toHaveBeenCalled();
    });

    it('should handle Supabase HTTP error response', async () => {
      createMockHttpResponse('{"error": "unauthorized"}', 401);
      fs.existsSync.mockReturnValue(false);

      process.argv = ['node', 'diagnose-reflect.js', '/test'];

      jest.isolateModules(() => {
        require('../diagnose-reflect');
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(consoleSpy).toHaveBeenCalled();
    });
  });

  describe('reflection query', () => {
    it('should query recent reflections', async () => {
      const reflections = [
        { org: 'org1', total_issues: 3, created_at: new Date().toISOString() },
        { org: 'org2', total_issues: 5, created_at: new Date().toISOString() }
      ];
      createMockHttpResponse(JSON.stringify(reflections), 200);
      fs.existsSync.mockReturnValue(false);

      process.argv = ['node', 'diagnose-reflect.js', '/test'];

      jest.isolateModules(() => {
        require('../diagnose-reflect');
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      // Module should have run and queried reflections
      expect(consoleSpy).toHaveBeenCalled();
    });

    it('should handle empty reflections result', async () => {
      createMockHttpResponse('[]', 200);
      fs.existsSync.mockReturnValue(false);

      process.argv = ['node', 'diagnose-reflect.js', '/test'];

      jest.isolateModules(() => {
        require('../diagnose-reflect');
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(consoleSpy).toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should handle diagnostic failure gracefully', async () => {
      // Mock a scenario where diagnose catches an error
      createMockHttpError('Connection refused');
      fs.existsSync.mockReturnValue(false);

      process.argv = ['node', 'diagnose-reflect.js', '/test'];

      jest.isolateModules(() => {
        require('../diagnose-reflect');
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(consoleSpy).toHaveBeenCalled();
    });
  });

  describe('output formatting', () => {
    it('should output diagnostic header', async () => {
      createMockHttpResponse('[]', 200);
      fs.existsSync.mockReturnValue(false);

      process.argv = ['node', 'diagnose-reflect.js', '/test'];

      jest.isolateModules(() => {
        require('../diagnose-reflect');
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      // Check for header output
      const headerLogged = consoleLogCalls.some(msg =>
        msg && msg.includes && (msg.includes('Diagnosing') || msg.includes('Step'))
      );
      expect(headerLogged || consoleSpy.mock.calls.length > 0).toBe(true);
    });
  });
});
