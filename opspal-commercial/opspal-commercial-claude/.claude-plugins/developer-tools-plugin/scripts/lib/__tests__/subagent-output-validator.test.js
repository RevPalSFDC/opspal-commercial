/**
 * subagent-output-validator.test.js
 *
 * Tests for Sub-Agent Output Validator CLI
 *
 * Note: This tests the CLI module which auto-executes on load.
 * We use a custom error class to halt execution when process.exit is called.
 */

// Custom error to halt execution on process.exit
class ProcessExitError extends Error {
  constructor(code) {
    super(`process.exit(${code})`);
    this.code = code;
  }
}

// Store original process values
const originalArgv = process.argv;
const originalExit = process.exit;

describe('subagent-output-validator CLI', () => {
  let consoleSpy;
  let consoleErrorSpy;

  beforeEach(() => {
    jest.resetModules();

    // Mock process.exit to throw and halt execution
    process.exit = jest.fn((code) => {
      throw new ProcessExitError(code);
    });

    // Mock console methods
    consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => {
    process.argv = originalArgv;
    process.exit = originalExit;
    consoleSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  describe('help flag handling', () => {
    it('should display help with --help flag', () => {
      process.argv = ['node', 'script.js', '--help'];

      expect(() => {
        jest.isolateModules(() => {
          require('../subagent-output-validator');
        });
      }).toThrow(ProcessExitError);

      expect(consoleSpy).toHaveBeenCalledWith('Sub-Agent Output Validator');
      expect(process.exit).toHaveBeenCalledWith(0);
    });

    it('should display help with -h flag', () => {
      process.argv = ['node', 'script.js', '-h'];

      expect(() => {
        jest.isolateModules(() => {
          require('../subagent-output-validator');
        });
      }).toThrow(ProcessExitError);

      expect(consoleSpy).toHaveBeenCalledWith('Sub-Agent Output Validator');
      expect(process.exit).toHaveBeenCalledWith(0);
    });

    it('should show usage examples in help', () => {
      process.argv = ['node', 'script.js', '--help'];

      expect(() => {
        jest.isolateModules(() => {
          require('../subagent-output-validator');
        });
      }).toThrow(ProcessExitError);

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('--agent'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('--output'));
    });
  });

  describe('argument validation', () => {
    it('should require both --agent and --output', () => {
      process.argv = ['node', 'script.js'];

      expect(() => {
        jest.isolateModules(() => {
          require('../subagent-output-validator');
        });
      }).toThrow(ProcessExitError);

      expect(consoleErrorSpy).toHaveBeenCalledWith('❌ Missing required arguments');
      expect(process.exit).toHaveBeenCalledWith(1);
    });

    it('should fail if only --agent provided', () => {
      process.argv = ['node', 'script.js', '--agent', 'test-agent'];

      expect(() => {
        jest.isolateModules(() => {
          require('../subagent-output-validator');
        });
      }).toThrow(ProcessExitError);

      expect(consoleErrorSpy).toHaveBeenCalledWith('❌ Missing required arguments');
      expect(process.exit).toHaveBeenCalledWith(1);
    });

    it('should fail if only --output provided', () => {
      process.argv = ['node', 'script.js', '--output', 'test.json'];

      expect(() => {
        jest.isolateModules(() => {
          require('../subagent-output-validator');
        });
      }).toThrow(ProcessExitError);

      expect(consoleErrorSpy).toHaveBeenCalledWith('❌ Missing required arguments');
      expect(process.exit).toHaveBeenCalledWith(1);
    });
  });
});
