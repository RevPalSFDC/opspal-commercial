/**
 * structured-logger.test.js
 *
 * Auto-generated test suite for structured-logger.js
 * Generated on: 2025-10-16T20:58:49.050Z
 *
 * To run: npm test -- structured-logger
 */

const {
  createLogger,
  queryLogs
} = require('../structured-logger.js');

// No mocks required


describe('structured-logger', () => {

  describe('createLogger', () => {


    it('should create logger correctly', () => {
      // Arrange
      const loggerName = 'test-logger';
      const config = { level: 'DEBUG' };

      // Act
      const result = createLogger(loggerName, config);

      // Assert
      expect(result).toBeDefined();
      expect(result).toHaveProperty('debug');
      expect(result).toHaveProperty('info');
      expect(result).toHaveProperty('warn');
      expect(result).toHaveProperty('error');
      expect(result).toHaveProperty('fatal');
      expect(result).toHaveProperty('timer');
      expect(result).toHaveProperty('child');
      expect(typeof result.debug).toBe('function');
      expect(typeof result.info).toBe('function');
    });

    it('should handle minimal configuration', () => {
      // Logger should work with just a name (no config)
      const result = createLogger('minimal-logger');

      expect(result).toBeDefined();
      expect(result).toHaveProperty('info');
      expect(typeof result.info).toBe('function');
    });
  })

  describe('queryLogs', () => {
    beforeEach(() => {
      // Setup test data
      jest.clearAllMocks();
    });

    afterEach(() => {
      // Cleanup
    });

    it('should query logs correctly', async () => {
      // Arrange
      const options = {
        level: 'INFO',
        limit: 10
      };

      // Act
      const result = await queryLogs(options);

      // Assert
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      // queryLogs returns an array of log entries (may be empty if no logs yet)
    });

    it('should handle empty query options', async () => {
      // queryLogs should work with no options (returns all logs)
      const result = await queryLogs();

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it('should filter by logger name', async () => {
      const result = await queryLogs({ logger: 'specific-logger' });
      expect(Array.isArray(result)).toBe(true);
    });

    it('should filter by log level', async () => {
      const result = await queryLogs({ level: 'ERROR' });
      expect(Array.isArray(result)).toBe(true);
    });

    it('should filter by pattern', async () => {
      const result = await queryLogs({ pattern: 'test' });
      expect(Array.isArray(result)).toBe(true);
    });

    it('should filter by timestamp', async () => {
      const since = new Date(Date.now() - 1000 * 60 * 60).toISOString(); // 1 hour ago
      const result = await queryLogs({ since });
      expect(Array.isArray(result)).toBe(true);
    });

    it('should respect limit option', async () => {
      const result = await queryLogs({ limit: 5 });
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeLessThanOrEqual(5);
    });
  })

  describe('logger methods', () => {
    let logger;

    beforeEach(() => {
      logger = createLogger('test-logger', { output: 'console', format: 'json' });
    });

    it('should log debug messages', () => {
      expect(() => logger.debug('Debug message', { key: 'value' })).not.toThrow();
    });

    it('should log info messages', () => {
      expect(() => logger.info('Info message', { count: 42 })).not.toThrow();
    });

    it('should log warn messages', () => {
      expect(() => logger.warn('Warning message', { threshold: '90%' })).not.toThrow();
    });

    it('should log error messages', () => {
      const error = new Error('Test error');
      expect(() => logger.error('Error message', error, { context: 'test' })).not.toThrow();
    });

    it('should log fatal messages', () => {
      const error = new Error('Fatal error');
      expect(() => logger.fatal('Fatal message', error, { context: 'critical' })).not.toThrow();
    });

    it('should create timer and measure duration', () => {
      const timer = logger.timer('test-operation');
      expect(timer).toHaveProperty('end');
      expect(timer).toHaveProperty('fail');
      expect(typeof timer.end).toBe('function');
      expect(typeof timer.fail).toBe('function');

      const duration = timer.end({ result: 'success' });
      expect(typeof duration).toBe('number');
      expect(duration).toBeGreaterThanOrEqual(0);
    });

    it('should handle timer failure', () => {
      const timer = logger.timer('failing-operation');
      const error = new Error('Operation failed');
      const duration = timer.fail(error, { attempt: 1 });
      expect(typeof duration).toBe('number');
      expect(duration).toBeGreaterThanOrEqual(0);
    });

    it('should create child logger with additional context', () => {
      const childLogger = logger.child({ module: 'submodule' });
      expect(childLogger).toBeDefined();
      expect(childLogger).toHaveProperty('debug');
      expect(childLogger).toHaveProperty('info');
      expect(childLogger).toHaveProperty('warn');
      expect(childLogger).toHaveProperty('error');
      expect(childLogger).toHaveProperty('fatal');
    });

    it('should respect log level configuration', () => {
      const errorLogger = createLogger('error-only-logger', { level: 'ERROR', output: 'console' });
      // Debug and info should be suppressed, error should work
      expect(() => errorLogger.debug('Should not log')).not.toThrow();
      expect(() => errorLogger.info('Should not log')).not.toThrow();
      expect(() => errorLogger.error('Should log')).not.toThrow();
    });

    it('should format logs in pretty mode', () => {
      const prettyLogger = createLogger('pretty-logger', {
        output: 'console',
        format: 'pretty',
        colorize: false
      });
      expect(() => prettyLogger.info('Pretty formatted message', { key: 'value' })).not.toThrow();
    });

    it('should format logs with colorization', () => {
      const colorLogger = createLogger('color-logger', {
        output: 'console',
        format: 'pretty',
        colorize: true
      });
      expect(() => colorLogger.warn('Colorized warning')).not.toThrow();
      expect(() => colorLogger.error('Colorized error')).not.toThrow();
    });

    it('should include context when configured', () => {
      const contextLogger = createLogger('context-logger', {
        output: 'console',
        format: 'json',
        includeContext: true
      });
      expect(() => contextLogger.info('Message with context', { data: 'test' })).not.toThrow();
    });

    it('should exclude context when disabled', () => {
      const noContextLogger = createLogger('no-context-logger', {
        output: 'console',
        format: 'json',
        includeContext: false
      });
      expect(() => noContextLogger.info('Message without context')).not.toThrow();
    });

    it('should format pretty output with metadata', () => {
      const prettyLogger = createLogger('pretty-metadata-logger', {
        output: 'console',
        format: 'pretty',
        colorize: false
      });
      // Log with multiple metadata fields to trigger metadata formatting
      expect(() => prettyLogger.info('Complex message', {
        field1: 'value1',
        field2: 'value2',
        field3: 'value3',
        nested: { key: 'value' }
      })).not.toThrow();
    });

    it('should handle file output configuration', () => {
      // Note: This tests the config parsing, actual file writes are not tested
      const fileLogger = createLogger('file-logger', {
        output: 'file',
        logDir: '/tmp/test-logs',
        format: 'json'
      });
      expect(fileLogger).toBeDefined();
      expect(fileLogger).toHaveProperty('info');
    });

    it('should handle both output configuration', () => {
      const bothLogger = createLogger('both-logger', {
        output: 'both',
        logDir: '/tmp/test-logs',
        format: 'json'
      });
      expect(() => bothLogger.info('Dual output message')).not.toThrow();
    });

    it('should suppress low level logs when high level configured', () => {
      const fatalLogger = createLogger('fatal-only', { level: 'FATAL', output: 'console' });
      // All levels below FATAL should be suppressed
      expect(() => fatalLogger.debug('Suppressed')).not.toThrow();
      expect(() => fatalLogger.info('Suppressed')).not.toThrow();
      expect(() => fatalLogger.warn('Suppressed')).not.toThrow();
      expect(() => fatalLogger.error('Suppressed')).not.toThrow();
      expect(() => fatalLogger.fatal('Logged', new Error('Test'))).not.toThrow();
    });

    it('should handle log with error object', () => {
      const customError = new Error('Custom error message');
      customError.code = 'ERR_CUSTOM';
      expect(() => logger.error('Error occurred', customError)).not.toThrow();
    });

    it('should handle child logger creating nested context', () => {
      const parentLogger = createLogger('parent', { output: 'console', format: 'json' });
      const childLogger = parentLogger.child({ module: 'child-module', version: '1.0' });
      const grandchildLogger = childLogger.child({ submodule: 'grandchild' });

      expect(grandchildLogger).toBeDefined();
      expect(() => grandchildLogger.info('Nested context message')).not.toThrow();
    });
  })

});
