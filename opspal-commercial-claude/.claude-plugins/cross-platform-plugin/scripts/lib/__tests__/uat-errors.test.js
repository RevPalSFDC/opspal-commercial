/**
 * Tests for UAT Error Classes
 *
 * Tests the structured error classes for the UAT framework including:
 * - Context and suggestions handling
 * - JSON serialization
 * - Display formatting
 * - Error wrapping utilities
 */

const {
  UATError,
  UATValidationError,
  UATExecutionError,
  UATAdapterError,
  UATPreflightError,
  getSuggestionsForSalesforceError,
  wrapError
} = require('../uat-errors');

describe('UATError (Base Class)', () => {
  describe('constructor', () => {
    it('should create error with message only', () => {
      const error = new UATError('Something went wrong');
      expect(error.message).toBe('Something went wrong');
      expect(error.name).toBe('UATError');
      expect(error.suggestions).toEqual([]);
      expect(error.timestamp).toBeDefined();
    });

    it('should create error with context', () => {
      const error = new UATError('Failed', { foo: 'bar', count: 42 });
      expect(error.context).toEqual({ foo: 'bar', count: 42 });
    });

    it('should extract suggestions from context', () => {
      const error = new UATError('Failed', {
        suggestions: ['Try this', 'Or try that']
      });
      expect(error.suggestions).toEqual(['Try this', 'Or try that']);
    });

    it('should be instanceof Error', () => {
      const error = new UATError('test');
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(UATError);
    });
  });

  describe('toJSON()', () => {
    it('should serialize basic error', () => {
      const error = new UATError('Test error');
      const json = error.toJSON();

      expect(json.name).toBe('UATError');
      expect(json.message).toBe('Test error');
      expect(json.timestamp).toBeDefined();
    });

    it('should include context in JSON', () => {
      const error = new UATError('Test', { filePath: '/test.csv' });
      const json = error.toJSON();

      expect(json.context).toEqual({ filePath: '/test.csv' });
    });

    it('should include suggestions at top level', () => {
      const error = new UATError('Test', { suggestions: ['Fix it'] });
      const json = error.toJSON();

      expect(json.suggestions).toEqual(['Fix it']);
      expect(json.context).toBeUndefined(); // Empty context not included
    });

    it('should exclude suggestions from context', () => {
      const error = new UATError('Test', {
        foo: 'bar',
        suggestions: ['Fix it']
      });
      const json = error.toJSON();

      expect(json.context).toEqual({ foo: 'bar' });
      expect(json.context.suggestions).toBeUndefined();
    });
  });

  describe('toDisplayString()', () => {
    it('should format basic error', () => {
      const error = new UATError('Something failed');
      const display = error.toDisplayString();

      expect(display).toContain('❌ UATError: Something failed');
    });

    it('should include context in display', () => {
      const error = new UATError('Failed', { filePath: '/test.csv' });
      const display = error.toDisplayString();

      expect(display).toContain('📋 Context:');
      expect(display).toContain('filePath: /test.csv');
    });

    it('should include suggestions in display', () => {
      const error = new UATError('Failed', {
        suggestions: ['Try this', 'Or that']
      });
      const display = error.toDisplayString();

      expect(display).toContain('💡 Suggestions:');
      expect(display).toContain('→ Try this');
      expect(display).toContain('→ Or that');
    });
  });

  describe('hasSuggestion()', () => {
    it('should find matching suggestion', () => {
      const error = new UATError('Failed', {
        suggestions: ['Check file path', 'Use absolute path']
      });

      expect(error.hasSuggestion('file')).toBe(true);
      expect(error.hasSuggestion('absolute')).toBe(true);
      expect(error.hasSuggestion('banana')).toBe(false);
    });

    it('should be case insensitive', () => {
      const error = new UATError('Failed', {
        suggestions: ['Check FILE path']
      });

      expect(error.hasSuggestion('file')).toBe(true);
      expect(error.hasSuggestion('FILE')).toBe(true);
    });
  });

  describe('addSuggestion()', () => {
    it('should add new suggestion', () => {
      const error = new UATError('Failed');
      error.addSuggestion('Try this');

      expect(error.suggestions).toContain('Try this');
    });

    it('should not add duplicate suggestions', () => {
      const error = new UATError('Failed');
      error.addSuggestion('Try this');
      error.addSuggestion('Try this');

      expect(error.suggestions.length).toBe(1);
    });

    it('should return this for chaining', () => {
      const error = new UATError('Failed');
      const result = error.addSuggestion('A').addSuggestion('B');

      expect(result).toBe(error);
      expect(error.suggestions).toEqual(['A', 'B']);
    });
  });
});

describe('UATValidationError', () => {
  it('should extend UATError', () => {
    const error = new UATValidationError('Invalid input');
    expect(error).toBeInstanceOf(UATError);
    expect(error).toBeInstanceOf(UATValidationError);
    expect(error.name).toBe('UATValidationError');
  });

  it('should capture errors and warnings arrays', () => {
    const error = new UATValidationError('Validation failed', {
      errors: ['Missing field', 'Invalid format'],
      warnings: ['Large file']
    });

    expect(error.errors).toEqual(['Missing field', 'Invalid format']);
    expect(error.warnings).toEqual(['Large file']);
  });

  it('should include errors in JSON', () => {
    const error = new UATValidationError('Failed', {
      errors: ['Error 1'],
      warnings: ['Warning 1']
    });
    const json = error.toJSON();

    expect(json.errors).toEqual(['Error 1']);
    expect(json.warnings).toEqual(['Warning 1']);
  });

  it('should format errors and warnings in display', () => {
    const error = new UATValidationError('Failed', {
      errors: ['Missing column'],
      warnings: ['No extension']
    });
    const display = error.toDisplayString();

    expect(display).toContain('🚫 Validation Errors:');
    expect(display).toContain('Missing column');
    expect(display).toContain('⚠️  Warnings:');
    expect(display).toContain('No extension');
  });
});

describe('UATExecutionError', () => {
  it('should extend UATError', () => {
    const error = new UATExecutionError('Step failed');
    expect(error).toBeInstanceOf(UATError);
    expect(error.name).toBe('UATExecutionError');
  });

  it('should capture step context', () => {
    const error = new UATExecutionError('Step 3 failed', {
      stepNumber: 3,
      action: 'create',
      object: 'Account',
      originalError: 'INVALID_FIELD'
    });

    expect(error.stepNumber).toBe(3);
    expect(error.action).toBe('create');
    expect(error.object).toBe('Account');
    expect(error.originalError).toBe('INVALID_FIELD');
  });

  it('should include step info in JSON', () => {
    const error = new UATExecutionError('Failed', {
      stepNumber: 5,
      action: 'verify'
    });
    const json = error.toJSON();

    expect(json.stepNumber).toBe(5);
    expect(json.action).toBe('verify');
  });

  it('should format step context in display', () => {
    const error = new UATExecutionError('Failed', {
      stepNumber: 2,
      action: 'create',
      object: 'Quote',
      originalError: 'REQUIRED_FIELD_MISSING'
    });
    const display = error.toDisplayString();

    expect(display).toContain('📍 Step 2 (create Quote)');
    expect(display).toContain('🔍 Original Error:');
    expect(display).toContain('REQUIRED_FIELD_MISSING');
  });
});

describe('UATAdapterError', () => {
  it('should extend UATError', () => {
    const error = new UATAdapterError('Query failed');
    expect(error).toBeInstanceOf(UATError);
    expect(error.name).toBe('UATAdapterError');
  });

  it('should capture platform info', () => {
    const error = new UATAdapterError('SF Error', {
      platform: 'salesforce',
      operation: 'query'
    });

    expect(error.platform).toBe('salesforce');
    expect(error.operation).toBe('query');
  });
});

describe('UATPreflightError', () => {
  it('should extend UATError', () => {
    const error = new UATPreflightError('Pre-flight failed');
    expect(error).toBeInstanceOf(UATError);
    expect(error.name).toBe('UATPreflightError');
  });

  it('should capture blockers and checks', () => {
    const error = new UATPreflightError('Failed', {
      blockers: ['Not authenticated'],
      checks: [
        { name: 'Auth', passed: false, message: 'No session' },
        { name: 'Perms', passed: true, message: 'OK' }
      ]
    });

    expect(error.blockers).toEqual(['Not authenticated']);
    expect(error.checks.length).toBe(2);
  });

  it('should format checks in display', () => {
    const error = new UATPreflightError('Failed', {
      blockers: ['Auth failed'],
      checks: [
        { name: 'Authentication', passed: false, message: 'Not logged in' },
        { name: 'Permissions', passed: true, message: 'CRUD OK' }
      ]
    });
    const display = error.toDisplayString();

    expect(display).toContain('🚧 Blockers:');
    expect(display).toContain('Auth failed');
    expect(display).toContain('📋 Pre-flight Checks:');
    expect(display).toContain('✗ Authentication: Not logged in');
    expect(display).toContain('✓ Permissions: CRUD OK');
  });
});

describe('getSuggestionsForSalesforceError()', () => {
  it('should suggest field fixes for INVALID_FIELD', () => {
    const suggestions = getSuggestionsForSalesforceError(
      'INVALID_FIELD: No such column CustomField__c',
      { object: 'Account' }
    );

    expect(suggestions).toContainEqual(expect.stringContaining('field exists on Account'));
    expect(suggestions).toContainEqual(expect.stringContaining('sf sobject describe'));
  });

  it('should suggest permission fixes for INSUFFICIENT_ACCESS', () => {
    const suggestions = getSuggestionsForSalesforceError(
      'INSUFFICIENT_ACCESS_OR_READONLY',
      {}
    );

    expect(suggestions).toContainEqual(expect.stringContaining('permissions'));
    expect(suggestions).toContainEqual(expect.stringContaining('profile/permission set'));
  });

  it('should suggest login for session errors', () => {
    const suggestions = getSuggestionsForSalesforceError(
      'Session expired',
      { orgAlias: 'my-sandbox' }
    );

    expect(suggestions).toContainEqual(expect.stringContaining('sf org login web'));
    expect(suggestions).toContainEqual(expect.stringContaining('my-sandbox'));
  });

  it('should suggest required fields for REQUIRED_FIELD_MISSING', () => {
    const suggestions = getSuggestionsForSalesforceError(
      'REQUIRED_FIELD_MISSING: Name',
      {}
    );

    expect(suggestions).toContainEqual(expect.stringContaining('required fields'));
  });

  it('should return empty array for unknown errors', () => {
    const suggestions = getSuggestionsForSalesforceError('Some random error', {});
    expect(Array.isArray(suggestions)).toBe(true);
  });
});

describe('wrapError()', () => {
  it('should return UATError instances unchanged', () => {
    const original = new UATValidationError('Already UAT');
    const wrapped = wrapError(original);

    expect(wrapped).toBe(original);
  });

  it('should add context to existing UATError', () => {
    const original = new UATError('Test');
    const wrapped = wrapError(original, { extra: 'info' });

    expect(wrapped.context.extra).toBe('info');
  });

  it('should wrap regular Error as UATError', () => {
    const original = new Error('Regular error');
    const wrapped = wrapError(original);

    expect(wrapped).toBeInstanceOf(UATError);
    expect(wrapped.message).toBe('Regular error');
  });

  it('should create UATAdapterError for Salesforce context', () => {
    const original = new Error('INVALID_FIELD');
    const wrapped = wrapError(original, { platform: 'salesforce' });

    expect(wrapped).toBeInstanceOf(UATAdapterError);
    expect(wrapped.platform).toBe('salesforce');
    expect(wrapped.suggestions.length).toBeGreaterThan(0);
  });

  it('should create UATExecutionError when stepNumber present', () => {
    const original = new Error('Step error');
    const wrapped = wrapError(original, { stepNumber: 5 });

    expect(wrapped).toBeInstanceOf(UATExecutionError);
    expect(wrapped.stepNumber).toBe(5);
  });

  it('should handle string errors', () => {
    const wrapped = wrapError('String error', {});
    expect(wrapped).toBeInstanceOf(UATError);
  });
});
