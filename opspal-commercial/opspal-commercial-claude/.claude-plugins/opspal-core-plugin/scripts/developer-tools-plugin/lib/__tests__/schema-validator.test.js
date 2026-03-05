/**
 * schema-validator.test.js
 *
 * Test suite for schema-validator.js
 * Generated on: 2025-10-16T20:58:49.050Z
 * Updated: 2025-10-16 - Add mocks and real test data
 *
 * To run: npm test -- schema-validator
 */

const {
  validateBeforeUpdate,
  validateBeforeInsert,
  validateColumnExists
} = require('../schema-validator.js');

// Mock schema-discovery module
jest.mock('../schema-discovery.js', () => ({
  discoverSchema: jest.fn().mockResolvedValue({
    tableName: 'reflections',
    columns: {
      id: { dataType: 'uuid', isNullable: false },
      created_at: { dataType: 'timestamp', isNullable: false },
      user_email: { dataType: 'text', isNullable: true },
      data: { dataType: 'jsonb', isNullable: false },
      reflection_status: { dataType: 'text', isNullable: false }
    },
    primaryKey: 'id',
    discovered_at: '2025-10-16T20:00:00.000Z'
  }),
  validateColumn: jest.fn(async (tableName, columnName, options = {}) => {
    const validColumns = ['id', 'created_at', 'user_email', 'data', 'reflection_status'];
    const exists = validColumns.includes(columnName);

    if (!exists && options.throwOnMissing) {
      const error = new Error(`Column '${columnName}' does not exist in table '${tableName}'`);
      error.name = 'SchemaDiscoveryError';
      throw error;
    }

    return exists;
  }),
  getSafeUpdateData: jest.fn(async (tableName, updateData) => {
    const validColumns = ['id', 'created_at', 'user_email', 'data', 'reflection_status'];
    const safeData = {};
    const skipped = [];

    for (const [key, value] of Object.entries(updateData)) {
      if (validColumns.includes(key)) {
        safeData[key] = value;
      } else {
        skipped.push(key);
      }
    }

    return { safeData, skipped };
  })
}));

// Mock structured logger
jest.mock('../structured-logger', () => ({
  createLogger: jest.fn(() => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }))
}));

describe('schema-validator', () => {

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('validateBeforeUpdate', () => {
    it('should validate update data with all valid columns', async () => {
      // Arrange
      const tableName = 'reflections';
      const updateData = {
        reflection_status: 'under_review',
        user_email: 'test@example.com'
      };

      // Act
      const result = await validateBeforeUpdate(tableName, updateData);

      // Assert
      expect(result).toBeDefined();
      expect(result).toHaveProperty('validatedData');
      expect(result).toHaveProperty('skippedColumns');
      expect(result).toHaveProperty('isValid');
      expect(result.isValid).toBe(true);
      expect(result.validatedData).toEqual(updateData);
      expect(result.skippedColumns).toHaveLength(0);
    });

    it('should throw error for invalid columns when throwOnInvalid=true', async () => {
      // Arrange
      const tableName = 'reflections';
      const updateData = {
        reflection_status: 'under_review',
        invalid_column: 'test value'
      };

      // Act & Assert
      await expect(validateBeforeUpdate(tableName, updateData, { throwOnInvalid: true }))
        .rejects.toThrow('Invalid columns in update for reflections: invalid_column');
    });

    it('should remove invalid columns when removeInvalid=true', async () => {
      // Arrange
      const tableName = 'reflections';
      const updateData = {
        reflection_status: 'under_review',
        invalid_column: 'test value'
      };

      // Act
      const result = await validateBeforeUpdate(tableName, updateData, {
        throwOnInvalid: false,
        removeInvalid: true
      });

      // Assert
      expect(result).toBeDefined();
      expect(result.isValid).toBe(false);
      expect(result.validatedData).toHaveProperty('reflection_status');
      expect(result.validatedData).not.toHaveProperty('invalid_column');
      expect(result.skippedColumns).toContain('invalid_column');
    });

    it('should handle empty update data', async () => {
      // Arrange
      const tableName = 'reflections';
      const updateData = {};

      // Act
      const result = await validateBeforeUpdate(tableName, updateData);

      // Assert
      expect(result).toBeDefined();
      expect(result.isValid).toBe(true);
      expect(result.validatedData).toEqual({});
      expect(result.skippedColumns).toHaveLength(0);
    });
  })

  describe('validateBeforeInsert', () => {
    it('should validate insert data with all valid columns', async () => {
      // Arrange
      const tableName = 'reflections';
      const insertData = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        created_at: '2025-10-16T20:00:00.000Z',
        user_email: 'test@example.com',
        data: { summary: 'Test reflection' },
        reflection_status: 'new'
      };

      // Act
      const result = await validateBeforeInsert(tableName, insertData);

      // Assert
      expect(result).toBeDefined();
      expect(result.isValid).toBe(true);
      expect(result.validatedData).toEqual(insertData);
      expect(result.skippedColumns).toHaveLength(0);
    });

    it('should throw error for invalid columns in insert data', async () => {
      // Arrange
      const tableName = 'reflections';
      const insertData = {
        id: '123',
        invalid_field: 'should not exist'
      };

      // Act & Assert
      await expect(validateBeforeInsert(tableName, insertData))
        .rejects.toThrow('Invalid columns in update for reflections: invalid_field');
    });

    it('should handle partial insert data', async () => {
      // Arrange
      const tableName = 'reflections';
      const insertData = {
        user_email: 'test@example.com',
        data: { summary: 'Partial data' }
      };

      // Act
      const result = await validateBeforeInsert(tableName, insertData, { throwOnInvalid: false });

      // Assert
      expect(result).toBeDefined();
      expect(result.isValid).toBe(true);
      expect(result.validatedData).toEqual(insertData);
    });
  })

  describe('validateColumnExists', () => {
    it('should return true for existing column', async () => {
      // Arrange
      const tableName = 'reflections';
      const columnName = 'user_email';

      // Act
      const result = await validateColumnExists(tableName, columnName);

      // Assert
      expect(result).toBe(true);
    });

    it('should throw error for non-existent column', async () => {
      // Arrange
      const tableName = 'reflections';
      const columnName = 'nonexistent_column';

      // Act & Assert
      await expect(validateColumnExists(tableName, columnName))
        .rejects.toThrow(`Column 'nonexistent_column' does not exist in table 'reflections'`);
    });

    it('should validate primary key column', async () => {
      // Arrange
      const tableName = 'reflections';
      const columnName = 'id';

      // Act
      const result = await validateColumnExists(tableName, columnName);

      // Assert
      expect(result).toBe(true);
    });
  })

});
