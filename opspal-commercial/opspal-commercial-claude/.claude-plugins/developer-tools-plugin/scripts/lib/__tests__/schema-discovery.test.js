/**
 * schema-discovery.test.js
 *
 * Test suite for schema-discovery.js PUBLIC API
 * Generated on: 2025-10-16T20:58:49.050Z
 * Updated: 2025-10-16 - Focus on public API only
 *
 * To run: npm test -- schema-discovery
 */

const {
  discoverSchema,
  validateColumn,
  validateColumns,
  getSafeUpdateData,
  clearCache,
  generateSchemaDoc,
  SchemaDiscoveryError
} = require('../schema-discovery.js');

// Mock Supabase
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    rpc: jest.fn().mockResolvedValue({
      data: [
        { column_name: 'id', data_type: 'uuid', is_nullable: 'NO', column_default: 'gen_random_uuid()', is_identity: 'YES' },
        { column_name: 'created_at', data_type: 'timestamp', is_nullable: 'NO', column_default: 'now()' },
        { column_name: 'user_email', data_type: 'text', is_nullable: 'YES', column_default: null },
        { column_name: 'data', data_type: 'jsonb', is_nullable: 'NO', column_default: null },
        { column_name: 'reflection_status', data_type: 'text', is_nullable: 'NO', column_default: "'new'" }
      ],
      error: null
    }),
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        limit: jest.fn(() => ({
          single: jest.fn().mockResolvedValue({
            data: {
              id: '123',
              created_at: '2025-10-16',
              user_email: 'test@example.com',
              data: {},
              reflection_status: 'new'
            },
            error: null
          })
        }))
      }))
    }))
  }))
}));

// Mock fs for cache operations
jest.mock('fs/promises', () => ({
  readFile: jest.fn().mockResolvedValue('{}'),
  writeFile: jest.fn().mockResolvedValue(),
  mkdir: jest.fn().mockResolvedValue()
}));

// Mock structured logger
jest.mock('../structured-logger', () => ({
  createLogger: jest.fn(() => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    timer: jest.fn(() => ({
      end: jest.fn(),
      fail: jest.fn()
    }))
  }))
}));

describe('schema-discovery', () => {

  beforeEach(() => {
    jest.clearAllMocks();
    // Set required environment variables
    process.env.SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
    process.env.SUPABASE_ANON_KEY = 'test-anon-key';
  });

  describe('discoverSchema', () => {
    it('should discover schema for a table', async () => {
      // Arrange
      const tableName = 'reflections';

      // Act
      const result = await discoverSchema(tableName);

      // Assert
      expect(result).toBeDefined();
      expect(result).toHaveProperty('tableName', 'reflections');
      expect(result).toHaveProperty('columns');
      expect(result.columns).toHaveProperty('id');
      expect(result.columns).toHaveProperty('created_at');
      expect(result.columns).toHaveProperty('data');
      expect(result).toHaveProperty('primaryKey');
      expect(result).toHaveProperty('discovered_at');
    });

    it('should use cache when useCache option is true', async () => {
      // Arrange
      const tableName = 'reflections';

      // Act - First call populates cache
      await discoverSchema(tableName);
      // Second call should use cache
      const result = await discoverSchema(tableName, { useCache: true });

      // Assert
      expect(result).toBeDefined();
      expect(result).toHaveProperty('tableName', 'reflections');
    });

    it('should bypass cache when useCache option is false', async () => {
      // Arrange
      const tableName = 'reflections';

      // Act
      const result = await discoverSchema(tableName, { useCache: false });

      // Assert
      expect(result).toBeDefined();
      expect(result).toHaveProperty('tableName', 'reflections');
    });
  })

  describe('validateColumn', () => {
    it('should validate existing column', async () => {
      // Arrange
      const tableName = 'reflections';
      const columnName = 'data';

      // Act
      const result = await validateColumn(tableName, columnName);

      // Assert
      expect(result).toBe(true);
    });

    it('should throw error for non-existent column when throwOnMissing=true', async () => {
      // Arrange
      const tableName = 'reflections';
      const columnName = 'nonexistent_column';

      // Act & Assert
      await expect(validateColumn(tableName, columnName, { throwOnMissing: true }))
        .rejects.toThrow(SchemaDiscoveryError);
    });

    it('should return false for non-existent column when throwOnMissing=false', async () => {
      // Arrange
      const tableName = 'reflections';
      const columnName = 'nonexistent_column';

      // Act
      const result = await validateColumn(tableName, columnName, { throwOnMissing: false });

      // Assert
      expect(result).toBe(false);
    });
  })

  describe('validateColumns', () => {
    it('should validate multiple existing columns', async () => {
      // Arrange
      const tableName = 'reflections';
      const columnNames = ['id', 'data', 'created_at'];

      // Act
      const result = await validateColumns(tableName, columnNames);

      // Assert
      expect(result).toBeDefined();
      expect(result).toHaveProperty('valid');
      expect(result).toHaveProperty('invalid');
      expect(result.valid).toEqual(expect.arrayContaining(['id', 'data', 'created_at']));
      expect(result.invalid).toHaveLength(0);
    });

    it('should identify invalid columns', async () => {
      // Arrange
      const tableName = 'reflections';
      const columnNames = ['id', 'nonexistent_column'];

      // Act
      const result = await validateColumns(tableName, columnNames, { throwOnMissing: false });

      // Assert
      expect(result).toBeDefined();
      expect(result.valid).toContain('id');
      expect(result.invalid).toContain('nonexistent_column');
    });

    it('should throw error when invalid columns found and throwOnMissing=true', async () => {
      // Arrange
      const tableName = 'reflections';
      const columnNames = ['id', 'nonexistent_column'];

      // Act & Assert
      await expect(validateColumns(tableName, columnNames, { throwOnMissing: true }))
        .rejects.toThrow(SchemaDiscoveryError);
    });
  })

  describe('getSafeUpdateData', () => {
    it('should filter update data to only existing columns', async () => {
      // Arrange
      const tableName = 'reflections';
      const updateData = {
        id: '123',
        data: { test: 'value' },
        nonexistent_column: 'should be filtered out'
      };

      // Act
      const result = await getSafeUpdateData(tableName, updateData);

      // Assert
      expect(result).toBeDefined();
      expect(result).toHaveProperty('safeData');
      expect(result).toHaveProperty('skipped');
      expect(result.safeData).toHaveProperty('id');
      expect(result.safeData).toHaveProperty('data');
      expect(result.safeData).not.toHaveProperty('nonexistent_column');
      expect(result.skipped).toContain('nonexistent_column');
    });

    it('should return all data when all columns exist', async () => {
      // Arrange
      const tableName = 'reflections';
      const updateData = {
        id: '123',
        data: { test: 'value' }
      };

      // Act
      const result = await getSafeUpdateData(tableName, updateData);

      // Assert
      expect(result.safeData).toEqual(updateData);
      expect(result.skipped).toHaveLength(0);
    });
  })

  describe('clearCache', () => {
    it('should clear cache for specific table', async () => {
      // Arrange
      const tableName = 'reflections';
      await discoverSchema(tableName); // Populate cache

      // Act
      await clearCache(tableName);

      // Assert - No error should be thrown
      expect(true).toBe(true);
    });

    it('should clear entire cache when no table specified', async () => {
      // Arrange
      await discoverSchema('reflections'); // Populate cache
      await discoverSchema('users'); // Populate another cache

      // Act
      await clearCache();

      // Assert - No error should be thrown
      expect(true).toBe(true);
    });
  })

  describe('generateSchemaDoc', () => {
    it('should generate markdown documentation for schema', async () => {
      // Arrange
      const tableName = 'reflections';

      // Act
      const result = await generateSchemaDoc(tableName);

      // Assert
      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
      expect(result).toContain('# reflections Table Schema');
      expect(result).toContain('## Columns');
      expect(result).toContain('| Column | Type | Nullable | Default |');
      expect(result).toContain('Primary Key');
      expect(result).toContain('Total Columns');
    });

    it('should include column information in documentation', async () => {
      // Arrange
      const tableName = 'reflections';

      // Act
      const result = await generateSchemaDoc(tableName);

      // Assert
      expect(result).toContain('id');
      expect(result).toContain('created_at');
      expect(result).toContain('data');
      expect(result).toContain('uuid');
      expect(result).toContain('jsonb');
    });
  })

  describe('SchemaDiscoveryError', () => {
    it('should create error with message and details', () => {
      // Arrange
      const message = 'Test error';
      const details = { tableName: 'test', columnName: 'test_col' };

      // Act
      const error = new SchemaDiscoveryError(message, details);

      // Assert
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(SchemaDiscoveryError);
      expect(error.message).toBe(message);
      expect(error.details).toEqual(details);
      expect(error.name).toBe('SchemaDiscoveryError');
    });
  })

});
