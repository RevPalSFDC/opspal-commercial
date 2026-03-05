/**
 * environment-detector.test.js
 *
 * Tests for Environment Detector module
 * Covers detection of Claude Desktop vs CLI environments
 */

const path = require('path');
const os = require('os');

// Create mock functions that persist across module resets
const mockExistsSync = jest.fn();
const mockStatSync = jest.fn();
const mockReadFileSync = jest.fn();

jest.mock('fs', () => ({
  existsSync: mockExistsSync,
  statSync: mockStatSync,
  readFileSync: mockReadFileSync
}));

const fs = require('fs');

// Store original env and homedir
const originalEnv = process.env;
const originalHomedir = os.homedir;

describe('Environment Detector', () => {
  let detector;

  beforeEach(() => {
    // Clear mock call history
    mockExistsSync.mockReset();
    mockStatSync.mockReset();
    mockReadFileSync.mockReset();

    // Default to returning false for existsSync
    mockExistsSync.mockReturnValue(false);

    jest.resetModules();

    // Reset environment
    process.env = { ...originalEnv };
    delete process.env.CLAUDE_ENV;
    delete process.env.CLAUDE_CLI;
    delete process.env.CLAUDE_DESKTOP;

    // Mock os.homedir using spyOn
    jest.spyOn(os, 'homedir').mockReturnValue('/home/testuser');

    // Fresh import for each test
    detector = require('../environment-detector');
  });

  afterEach(() => {
    os.homedir.mockRestore?.();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('detectEnvironment', () => {
    describe('Environment Variable Detection', () => {
      it('should detect CLI from CLAUDE_ENV', () => {
        process.env.CLAUDE_ENV = 'CLI';

        const result = detector.detectEnvironment();

        expect(result.environment).toBe('CLI');
        expect(result.detectionMethod).toBe('env_var');
        expect(result.confidence).toBe('high');
      });

      it('should detect DESKTOP from CLAUDE_ENV', () => {
        process.env.CLAUDE_ENV = 'DESKTOP';

        const result = detector.detectEnvironment();

        expect(result.environment).toBe('DESKTOP');
        expect(result.detectionMethod).toBe('env_var');
        expect(result.confidence).toBe('high');
      });

      it('should handle lowercase CLAUDE_ENV values', () => {
        process.env.CLAUDE_ENV = 'desktop';

        const result = detector.detectEnvironment();

        expect(result.environment).toBe('DESKTOP');
      });

      it('should detect CLI from legacy CLAUDE_CLI=true', () => {
        process.env.CLAUDE_CLI = 'true';

        const result = detector.detectEnvironment();

        expect(result.environment).toBe('CLI');
        expect(result.detectionMethod).toBe('env_var');
        expect(result.confidence).toBe('high');
      });

      it('should detect DESKTOP from legacy CLAUDE_DESKTOP=true', () => {
        process.env.CLAUDE_DESKTOP = 'true';

        const result = detector.detectEnvironment();

        expect(result.environment).toBe('DESKTOP');
        expect(result.detectionMethod).toBe('env_var');
        expect(result.confidence).toBe('high');
      });
    });

    describe('Config File Detection', () => {
      it('should detect CLI from config.json presence', () => {
        mockExistsSync.mockImplementation((p) => {
          return p.includes('config.json') && !p.includes('desktop');
        });

        const result = detector.detectEnvironment();

        expect(result.environment).toBe('CLI');
        expect(result.detectionMethod).toBe('config_file');
        expect(result.confidence).toBe('medium');
      });

      it('should detect DESKTOP from claude_desktop_config.json presence', () => {
        mockExistsSync.mockImplementation((p) => {
          return p.includes('claude_desktop_config.json');
        });

        const result = detector.detectEnvironment();

        expect(result.environment).toBe('DESKTOP');
        expect(result.detectionMethod).toBe('config_file');
        expect(result.confidence).toBe('medium');
      });

      it('should use most recent config when both exist', () => {
        mockExistsSync.mockReturnValue(true);
        mockStatSync.mockImplementation((p) => {
          if (p.includes('desktop')) {
            return { mtime: new Date('2025-01-02') };
          }
          return { mtime: new Date('2025-01-01') };
        });

        const result = detector.detectEnvironment();

        expect(result.environment).toBe('DESKTOP');
        expect(result.confidence).toBe('low');
      });

      it('should prefer CLI when both configs exist and CLI is newer', () => {
        mockExistsSync.mockReturnValue(true);
        mockStatSync.mockImplementation((p) => {
          if (p.includes('desktop')) {
            return { mtime: new Date('2025-01-01') };
          }
          return { mtime: new Date('2025-01-02') };
        });

        const result = detector.detectEnvironment();

        expect(result.environment).toBe('CLI');
        expect(result.confidence).toBe('low');
      });

      it('should fallback to CLI when stat fails for both configs', () => {
        mockExistsSync.mockReturnValue(true);
        mockStatSync.mockImplementation(() => {
          throw new Error('Stat failed');
        });

        const result = detector.detectEnvironment();

        expect(result.environment).toBe('CLI');
        expect(result.detectionMethod).toBe('fallback');
        expect(result.confidence).toBe('low');
      });
    });

    describe('Unknown Environment', () => {
      it('should return UNKNOWN when no configs found', () => {
        mockExistsSync.mockReturnValue(false);

        const result = detector.detectEnvironment();

        expect(result.environment).toBe('UNKNOWN');
        expect(result.mcpConfigPath).toBeNull();
        expect(result.detectionMethod).toBe('fallback');
        expect(result.confidence).toBe('low');
      });
    });
  });

  describe('getMCPConfigPath', () => {
    it('should return desktop config path for DESKTOP', () => {
      const result = detector.getMCPConfigPath('DESKTOP');

      expect(result).toBe('/home/testuser/.claude/claude_desktop_config.json');
    });

    it('should return CLI config path for CLI', () => {
      const result = detector.getMCPConfigPath('CLI');

      expect(result).toBe('/home/testuser/.claude/config.json');
    });

    it('should return null for unknown environment', () => {
      const result = detector.getMCPConfigPath('UNKNOWN');

      expect(result).toBeNull();
    });

    it('should return null for invalid input', () => {
      expect(detector.getMCPConfigPath('INVALID')).toBeNull();
      expect(detector.getMCPConfigPath(null)).toBeNull();
      expect(detector.getMCPConfigPath(undefined)).toBeNull();
    });
  });

  describe('getProjectMCPConfigPath', () => {
    it('should return path when .mcp.json exists', () => {
      mockExistsSync.mockImplementation((p) => p.includes('.mcp.json'));

      const result = detector.getProjectMCPConfigPath('/project/root');

      expect(result).toBe('/project/root/.mcp.json');
    });

    it('should return null when .mcp.json does not exist', () => {
      mockExistsSync.mockReturnValue(false);

      const result = detector.getProjectMCPConfigPath('/project/root');

      expect(result).toBeNull();
    });

    it('should use cwd when no project root provided', () => {
      mockExistsSync.mockImplementation((p) => p.includes('.mcp.json'));

      const result = detector.getProjectMCPConfigPath();

      expect(result).not.toBeNull();
      expect(result).toContain('.mcp.json');
    });
  });

  describe('validateMCPConfig', () => {
    it('should validate existing valid JSON config', () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue('{"mcpServers": {}}');

      const result = detector.validateMCPConfig('/path/to/config.json');

      expect(result.valid).toBe(true);
      expect(result.error).toBeNull();
    });

    it('should fail for null config path', () => {
      const result = detector.validateMCPConfig(null);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('No config path provided');
    });

    it('should fail for non-existent file', () => {
      mockExistsSync.mockReturnValue(false);

      const result = detector.validateMCPConfig('/path/to/missing.json');

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Config file does not exist');
    });

    it('should fail for invalid JSON', () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue('not valid json {');

      const result = detector.validateMCPConfig('/path/to/invalid.json');

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid JSON');
    });

    it('should handle read errors', () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockImplementation(() => {
        throw new Error('Permission denied');
      });

      const result = detector.validateMCPConfig('/path/to/protected.json');

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid JSON');
    });
  });

  describe('getEnvironmentReport', () => {
    it('should return complete environment report', () => {
      process.env.CLAUDE_ENV = 'CLI';
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue('{}');

      const result = detector.getEnvironmentReport();

      expect(result.environment).toBe('CLI');
      expect(result.detectionMethod).toBe('env_var');
      expect(result.confidence).toBe('high');
      expect(result.configValidation).toBeDefined();
      expect(result.timestamp).toBeDefined();
      expect(result.homeDir).toBe('/home/testuser');
      expect(result.cwd).toBeDefined();
    });

    it('should include config validation status', () => {
      process.env.CLAUDE_ENV = 'DESKTOP';
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue('{"valid": true}');

      // Re-import to get fresh env
      jest.resetModules();
      jest.spyOn(os, 'homedir').mockReturnValue('/home/testuser');
      const freshDetector = require('../environment-detector');

      const result = freshDetector.getEnvironmentReport();

      expect(result.configValidation.valid).toBe(true);
    });

    it('should handle missing project config', () => {
      process.env.CLAUDE_ENV = 'CLI';
      mockExistsSync.mockImplementation((p) => {
        // Only config.json exists, not .mcp.json
        if (p.endsWith('.mcp.json')) return false;
        return true;
      });
      mockReadFileSync.mockReturnValue('{}');

      const result = detector.getEnvironmentReport();

      expect(result.projectMCPConfig).toBeNull();
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty environment variable', () => {
      process.env.CLAUDE_ENV = '';
      mockExistsSync.mockReturnValue(false);

      // Re-import to get fresh env
      jest.resetModules();
      jest.spyOn(os, 'homedir').mockReturnValue('/home/testuser');
      const freshDetector = require('../environment-detector');

      const result = freshDetector.detectEnvironment();

      expect(result.environment).toBe('UNKNOWN');
    });

    it('should handle invalid CLAUDE_ENV value', () => {
      process.env.CLAUDE_ENV = 'INVALID_VALUE';
      mockExistsSync.mockReturnValue(false);

      // Re-import to get fresh env
      jest.resetModules();
      jest.spyOn(os, 'homedir').mockReturnValue('/home/testuser');
      const freshDetector = require('../environment-detector');

      const result = freshDetector.detectEnvironment();

      // Should fall through to config file detection
      expect(result.environment).toBe('UNKNOWN');
    });

    it('should prioritize env var over config file', () => {
      process.env.CLAUDE_ENV = 'CLI';
      mockExistsSync.mockReturnValue(true);
      mockStatSync.mockReturnValue({ mtime: new Date() });

      const result = detector.detectEnvironment();

      // Env var should take precedence
      expect(result.environment).toBe('CLI');
      expect(result.detectionMethod).toBe('env_var');
    });

    it('should handle path with spaces in homedir', () => {
      // Re-import with different homedir
      jest.resetModules();
      jest.spyOn(os, 'homedir').mockReturnValue('/home/user with spaces');
      process.env.CLAUDE_ENV = 'CLI';

      const freshDetector = require('../environment-detector');
      const result = freshDetector.detectEnvironment();

      expect(result.mcpConfigPath).toContain('user with spaces');
    });
  });
});
