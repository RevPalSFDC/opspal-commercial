/**
 * supabase-jsonb-wrapper.test.js
 *
 * Auto-generated test suite for supabase-jsonb-wrapper.js
 * Generated on: 2025-10-16T20:58:49.052Z
 *
 * To run: npm test -- supabase-jsonb-wrapper
 */

const {
  wrapForSupabase,
  validatePayload,
  findSchemaFile,
  parseSupabaseError,
  unwrapFromSupabase
} = require('../supabase-jsonb-wrapper.js');

jest.mock('@supabase/supabase-js');
jest.mock('fs'); // Mock fs for findSchemaFile tests

describe('supabase-jsonb-wrapper', () => {

  describe('wrapForSupabase', () => {

    it('should wrap payload correctly', () => {
      // Arrange
      const tableName = 'reflections';
      const payload = { summary: 'Test reflection', issues: [] };
      const options = { userEmail: 'test@example.com', validate: false };

      // Act
      const result = wrapForSupabase(tableName, payload, options);

      // Assert
      expect(result).toBeDefined();
      expect(result).toHaveProperty('data');
      expect(result.data).toEqual(payload);
      expect(result).toHaveProperty('created_at');
      expect(result).toHaveProperty('user_email', 'test@example.com');
      expect(result).toHaveProperty('reflection_status', 'new');
    });

    it('should throw error for invalid tableName', () => {
      expect(() => wrapForSupabase(null, {})).toThrow('tableName is required');
      expect(() => wrapForSupabase('', {})).toThrow('tableName is required');
    });

    it('should throw error for invalid payload', () => {
      expect(() => wrapForSupabase('test', null)).toThrow('payload is required');
      expect(() => wrapForSupabase('test', 'not an object')).toThrow('payload is required');
    });

    it('should add org field when provided', () => {
      // Arrange
      const tableName = 'reflections';
      const payload = { summary: 'Test' };
      const options = { org: 'test-org', validate: false };

      // Act
      const result = wrapForSupabase(tableName, payload, options);

      // Assert
      expect(result).toHaveProperty('org', 'test-org');
    });

    it('should not add org field when not provided', () => {
      // Arrange
      const tableName = 'reflections';
      const payload = { summary: 'Test' };
      const options = { validate: false };

      // Act
      const result = wrapForSupabase(tableName, payload, options);

      // Assert
      expect(result).not.toHaveProperty('org');
    });

    it('should add reflection-specific fields for reflections table', () => {
      // Arrange
      const tableName = 'reflections';
      const payload = {
        summary: 'Test',
        plugin_name: 'my-plugin',
        plugin_version: '1.0.0'
      };
      const options = { validate: false };

      // Act
      const result = wrapForSupabase(tableName, payload, options);

      // Assert
      expect(result).toHaveProperty('reflection_status', 'new');
      expect(result.data).toHaveProperty('plugin_name', 'my-plugin');
      expect(result.data).toHaveProperty('plugin_version', '1.0.0');
    });
  })

  describe('validatePayload', () => {
    const fs = require('fs');

    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('should validate payload structure', () => {
      // Arrange
      const tableName = 'reflections';
      const payload = {
        summary: 'Test summary',
        issues: [],
        plugin_name: 'test-plugin'
      };

      // Act & Assert - validatePayload returns void on success, throws on error
      expect(() => validatePayload(tableName, payload)).not.toThrow();
    });

    it('should handle null tableName gracefully', () => {
      // validatePayload is forgiving - logs warning and returns
      const payload = { summary: 'Test' };
      expect(() => validatePayload(null, payload)).not.toThrow();
    });

    it('should handle null payload gracefully', () => {
      // validatePayload is forgiving - logs warning and returns
      expect(() => validatePayload('reflections', null)).not.toThrow();
    });

    it('should throw error on missing required fields', () => {
      // Setup mock to return a schema with required fields
      fs.existsSync = jest.fn().mockReturnValue(true);
      fs.readFileSync = jest.fn().mockReturnValue(JSON.stringify({
        required: ['name', 'email'],
        properties: {}
      }));

      // Act & Assert - missing required fields should throw
      expect(() => validatePayload('test_table', { name: 'Test' }))
        .toThrow('Missing required fields');
    });

    it('should throw error on invalid field type', () => {
      // Setup mock with type validation
      fs.existsSync = jest.fn().mockReturnValue(true);
      fs.readFileSync = jest.fn().mockReturnValue(JSON.stringify({
        required: [],
        properties: {
          count: { type: 'number' }
        }
      }));

      // Act & Assert - invalid type should throw
      expect(() => validatePayload('test_table', { count: 'not-a-number' }))
        .toThrow('Invalid type for field');
    });

    it('should validate string type correctly', () => {
      fs.existsSync = jest.fn().mockReturnValue(true);
      fs.readFileSync = jest.fn().mockReturnValue(JSON.stringify({
        required: [],
        properties: {
          name: { type: 'string' }
        }
      }));

      expect(() => validatePayload('test', { name: 'valid string' })).not.toThrow();
    });

    it('should validate number type correctly', () => {
      fs.existsSync = jest.fn().mockReturnValue(true);
      fs.readFileSync = jest.fn().mockReturnValue(JSON.stringify({
        required: [],
        properties: {
          count: { type: 'number' }
        }
      }));

      expect(() => validatePayload('test', { count: 42 })).not.toThrow();
    });

    it('should validate boolean type correctly', () => {
      fs.existsSync = jest.fn().mockReturnValue(true);
      fs.readFileSync = jest.fn().mockReturnValue(JSON.stringify({
        required: [],
        properties: {
          active: { type: 'boolean' }
        }
      }));

      expect(() => validatePayload('test', { active: true })).not.toThrow();
    });

    it('should validate array type correctly', () => {
      fs.existsSync = jest.fn().mockReturnValue(true);
      fs.readFileSync = jest.fn().mockReturnValue(JSON.stringify({
        required: [],
        properties: {
          items: { type: 'array' }
        }
      }));

      expect(() => validatePayload('test', { items: [1, 2, 3] })).not.toThrow();
    });

    it('should validate object type correctly', () => {
      fs.existsSync = jest.fn().mockReturnValue(true);
      fs.readFileSync = jest.fn().mockReturnValue(JSON.stringify({
        required: [],
        properties: {
          metadata: { type: 'object' }
        }
      }));

      expect(() => validatePayload('test', { metadata: { key: 'value' } })).not.toThrow();
    });

    it('should validate null type correctly', () => {
      fs.existsSync = jest.fn().mockReturnValue(true);
      fs.readFileSync = jest.fn().mockReturnValue(JSON.stringify({
        required: [],
        properties: {
          deletedAt: { type: 'null' }
        }
      }));

      expect(() => validatePayload('test', { deletedAt: null })).not.toThrow();
    });

    it('should skip validation for unknown types', () => {
      fs.existsSync = jest.fn().mockReturnValue(true);
      fs.readFileSync = jest.fn().mockReturnValue(JSON.stringify({
        required: [],
        properties: {
          custom: { type: 'unknown_type' }
        }
      }));

      // Unknown types should pass validation
      expect(() => validatePayload('test', { custom: 'anything' })).not.toThrow();
    });

    it('should handle schema file read errors gracefully', () => {
      fs.existsSync = jest.fn().mockReturnValue(true);
      fs.readFileSync = jest.fn().mockImplementation(() => {
        throw new Error('Read error');
      });

      // Should not throw, just log warning
      expect(() => validatePayload('test', { data: 'test' })).not.toThrow();
    });
  })


  describe('findSchemaFile', () => {
    it('should return schema file path when found', () => {
      // Arrange
      const fs = require('fs');
      fs.existsSync = jest.fn().mockReturnValue(true);

      const tableName = 'reflections';

      // Act
      const result = findSchemaFile(tableName);

      // Assert
      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
      expect(result).toContain('reflections');
    });

    it('should return null when schema file not found', () => {
      // Arrange
      const fs = require('fs');
      fs.existsSync = jest.fn().mockReturnValue(false);

      const tableName = 'nonexistent_table';

      // Act
      const result = findSchemaFile(tableName);

      // Assert
      expect(result).toBeNull();
    });
  })

  describe('parseSupabaseError', () => {
    it('should parse check constraint violation errors', () => {
      // Arrange
      const error = {
        message: 'new row for relation "reflections" violates check constraint "valid_status"'
      };

      // Act
      const result = parseSupabaseError(error);

      // Assert
      expect(result).toBeDefined();
      expect(result).toContain('Data validation failed');
      expect(result).toContain('valid_status');
    });

    it('should parse foreign key constraint errors', () => {
      // Arrange
      const error = {
        message: 'insert or update on table "reflections" violates foreign key constraint'
      };

      // Act
      const result = parseSupabaseError(error);

      // Assert
      expect(result).toContain('violates foreign key');
    });

    it('should handle generic errors', () => {
      // Arrange
      const error = { message: 'Something went wrong' };

      // Act
      const result = parseSupabaseError(error);

      // Assert
      expect(result).toContain('Supabase error');
      expect(result).toContain('Something went wrong');
    });

    it('should handle errors without message property', () => {
      // Arrange
      const error = { error: 'Unknown error' };

      // Act
      const result = parseSupabaseError(error);

      // Assert
      expect(result).toBeDefined();
      expect(result).toContain('Unknown error');
    });

    it('should parse duplicate key errors', () => {
      // Arrange
      const error = {
        message: 'duplicate key value violates unique constraint "reflections_pkey"'
      };

      // Act
      const result = parseSupabaseError(error);

      // Assert
      expect(result).toContain('Duplicate entry');
      expect(result).toContain('reflections_pkey');
    });

    it('should parse column does not exist errors', () => {
      // Arrange
      const error = {
        message: 'column "invalid_column" does not exist'
      };

      // Act
      const result = parseSupabaseError(error);

      // Assert
      expect(result).toContain('Invalid column');
      expect(result).toContain('invalid_column');
    });

    it('should parse permission denied errors', () => {
      // Arrange
      const error = {
        message: 'permission denied for table reflections'
      };

      // Act
      const result = parseSupabaseError(error);

      // Assert
      expect(result).toContain('Permission denied');
      expect(result).toContain('check API key');
    });

    it('should handle null error', () => {
      // Act
      const result = parseSupabaseError(null);

      // Assert
      expect(result).toBe('Unknown error');
    });

    it('should handle errors with details property', () => {
      // Arrange
      const error = { details: 'Detailed error message' };

      // Act
      const result = parseSupabaseError(error);

      // Assert
      expect(result).toContain('Detailed error message');
    });
  })

  describe('unwrapFromSupabase', () => {
    it('should unwrap data from Supabase row format', () => {
      // Arrange
      const row = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        created_at: '2025-10-16T20:00:00.000Z',
        user_email: 'test@example.com',
        reflection_status: 'new',
        data: {
          summary: 'Test reflection summary',
          issues: [{ type: 'error', description: 'Test issue' }],
          plugin_name: 'test-plugin',
          plugin_version: '1.0.0'
        }
      };

      // Act
      const result = unwrapFromSupabase(row);

      // Assert
      expect(result).toBeDefined();
      // Should contain metadata
      expect(result).toHaveProperty('id', '123e4567-e89b-12d3-a456-426614174000');
      expect(result).toHaveProperty('created_at', '2025-10-16T20:00:00.000Z');
      expect(result).toHaveProperty('user_email', 'test@example.com');
      expect(result).toHaveProperty('reflection_status', 'new');
      // Should contain flattened data
      expect(result).toHaveProperty('summary', 'Test reflection summary');
      expect(result).toHaveProperty('issues');
      expect(result.issues).toHaveLength(1);
      expect(result).toHaveProperty('plugin_name', 'test-plugin');
      expect(result).toHaveProperty('plugin_version', '1.0.0');
      // Should NOT have nested data property
      expect(result).not.toHaveProperty('data');
    });

    it('should handle null row', () => {
      // Act
      const result = unwrapFromSupabase(null);

      // Assert
      expect(result).toBeNull();
    });

    it('should handle undefined row', () => {
      // Act
      const result = unwrapFromSupabase(undefined);

      // Assert
      expect(result).toBeNull();
    });

    it('should handle row without data property', () => {
      // Arrange
      const row = {
        id: '123',
        created_at: '2025-10-16T20:00:00.000Z'
      };

      // Act
      const result = unwrapFromSupabase(row);

      // Assert
      expect(result).toBeDefined();
      expect(result).toHaveProperty('id', '123');
      expect(result).toHaveProperty('created_at', '2025-10-16T20:00:00.000Z');
    });
  })

});
