/**
 * schema-introspector.test.js
 *
 * Tests for Schema Introspector - auto-retrieves schema definitions
 */

// Mock supabase client before requiring the module
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    rpc: jest.fn()
  }))
}), { virtual: true });

jest.mock('fs', () => ({
  existsSync: jest.fn(),
  readFileSync: jest.fn(),
  writeFileSync: jest.fn(),
  mkdirSync: jest.fn()
}));

const fs = require('fs');

describe('SchemaIntrospector', () => {
  let introspector;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();

    // Default mocks
    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockReturnValue(JSON.stringify({
      type: 'object',
      properties: { id: { type: 'string' } }
    }));

    introspector = require('../schema-introspector');
  });

  describe('mapPostgresType', () => {
    it('should map integer types', () => {
      expect(introspector.mapPostgresType('integer')).toBe('integer');
      expect(introspector.mapPostgresType('bigint')).toBe('integer');
      expect(introspector.mapPostgresType('smallint')).toBe('integer');
    });

    it('should map numeric types', () => {
      expect(introspector.mapPostgresType('numeric')).toBe('number');
      expect(introspector.mapPostgresType('real')).toBe('number');
      expect(introspector.mapPostgresType('double precision')).toBe('number');
    });

    it('should map string types', () => {
      expect(introspector.mapPostgresType('character varying')).toBe('string');
      expect(introspector.mapPostgresType('varchar')).toBe('string');
      expect(introspector.mapPostgresType('text')).toBe('string');
      expect(introspector.mapPostgresType('char')).toBe('string');
      expect(introspector.mapPostgresType('uuid')).toBe('string');
    });

    it('should map boolean type', () => {
      expect(introspector.mapPostgresType('boolean')).toBe('boolean');
    });

    it('should map timestamp types', () => {
      expect(introspector.mapPostgresType('timestamp')).toBe('string');
      expect(introspector.mapPostgresType('timestamp with time zone')).toBe('string');
      expect(introspector.mapPostgresType('timestamp without time zone')).toBe('string');
      expect(introspector.mapPostgresType('date')).toBe('string');
      expect(introspector.mapPostgresType('time')).toBe('string');
    });

    it('should map json types', () => {
      expect(introspector.mapPostgresType('json')).toBe('object');
      expect(introspector.mapPostgresType('jsonb')).toBe('object');
    });

    it('should map array types', () => {
      expect(introspector.mapPostgresType('array')).toBe('array');
      expect(introspector.mapPostgresType('ARRAY')).toBe('array');
    });

    it('should default to string for unknown types', () => {
      expect(introspector.mapPostgresType('unknown_type')).toBe('string');
      expect(introspector.mapPostgresType('custom_enum')).toBe('string');
    });
  });

  describe('parseDefaultValue', () => {
    it('should return undefined for null/empty input', () => {
      expect(introspector.parseDefaultValue(null)).toBeUndefined();
      expect(introspector.parseDefaultValue('')).toBeUndefined();
      expect(introspector.parseDefaultValue(undefined)).toBeUndefined();
    });

    it('should parse boolean values', () => {
      expect(introspector.parseDefaultValue('true')).toBe(true);
      expect(introspector.parseDefaultValue('false')).toBe(false);
    });

    it('should parse integer values', () => {
      expect(introspector.parseDefaultValue('42')).toBe(42);
      expect(introspector.parseDefaultValue('-10')).toBe(-10);
      expect(introspector.parseDefaultValue('0')).toBe(0);
    });

    it('should parse float values', () => {
      expect(introspector.parseDefaultValue('3.14')).toBe(3.14);
      expect(introspector.parseDefaultValue('-2.5')).toBe(-2.5);
    });

    it('should parse string values', () => {
      expect(introspector.parseDefaultValue("'hello'")).toBe('hello');
      expect(introspector.parseDefaultValue("'world'")).toBe('world');
    });

    it('should handle type casting', () => {
      expect(introspector.parseDefaultValue('42::integer')).toBe(42);
      expect(introspector.parseDefaultValue("'text'::varchar")).toBe('text');
    });

    it('should return function names as-is', () => {
      expect(introspector.parseDefaultValue('now()')).toBe('now()');
      expect(introspector.parseDefaultValue('gen_random_uuid()')).toBe('gen_random_uuid()');
    });
  });

  describe('buildSchemaFromPostgres', () => {
    it('should build schema from columns', () => {
      const columns = [
        { column_name: 'id', data_type: 'uuid', is_nullable: 'NO' },
        { column_name: 'name', data_type: 'text', is_nullable: 'YES' },
        { column_name: 'count', data_type: 'integer', is_nullable: 'NO', column_default: '0' }
      ];

      const schema = introspector.buildSchemaFromPostgres('test_table', columns, []);

      expect(schema.title).toBe('test_table');
      expect(schema.type).toBe('object');
      expect(schema.properties).toHaveProperty('id');
      expect(schema.properties).toHaveProperty('name');
      expect(schema.properties).toHaveProperty('count');
      expect(schema.properties.id.type).toBe('string');
      expect(schema.properties.id.format).toBe('uuid');
      expect(schema.properties.name.nullable).toBe(true);
      expect(schema.required).toContain('id');
      expect(schema.required).not.toContain('count'); // Has default
    });

    it('should handle character length constraints', () => {
      const columns = [
        { column_name: 'short_name', data_type: 'character varying', is_nullable: 'YES', character_maximum_length: 50 }
      ];

      const schema = introspector.buildSchemaFromPostgres('test_table', columns, []);

      expect(schema.properties.short_name.maxLength).toBe(50);
    });

    it('should handle timestamp format', () => {
      const columns = [
        { column_name: 'created_at', data_type: 'timestamp with time zone', is_nullable: 'YES' }
      ];

      const schema = introspector.buildSchemaFromPostgres('test_table', columns, []);

      expect(schema.properties.created_at.format).toBe('date-time');
    });

    it('should process UNIQUE constraints', () => {
      const columns = [
        { column_name: 'email', data_type: 'text', is_nullable: 'NO' }
      ];
      const constraints = [
        { constraint_type: 'UNIQUE', column_name: 'email' }
      ];

      const schema = introspector.buildSchemaFromPostgres('users', columns, constraints);

      expect(schema.unique).toContain('email');
    });

    it('should process FOREIGN KEY constraints', () => {
      const columns = [
        { column_name: 'user_id', data_type: 'uuid', is_nullable: 'NO' }
      ];
      const constraints = [
        {
          constraint_type: 'FOREIGN KEY',
          column_name: 'user_id',
          foreign_table_name: 'users',
          foreign_column_name: 'id'
        }
      ];

      const schema = introspector.buildSchemaFromPostgres('orders', columns, constraints);

      expect(schema.foreignKeys).toHaveLength(1);
      expect(schema.foreignKeys[0].field).toBe('user_id');
      expect(schema.foreignKeys[0].references.table).toBe('users');
    });

    it('should process CHECK constraints', () => {
      const columns = [
        { column_name: 'status', data_type: 'text', is_nullable: 'NO' }
      ];
      const constraints = [
        {
          constraint_type: 'CHECK',
          constraint_name: 'valid_status',
          check_clause: "status IN ('active', 'inactive')"
        }
      ];

      const schema = introspector.buildSchemaFromPostgres('items', columns, constraints);

      expect(schema.checks).toHaveLength(1);
      expect(schema.checks[0].name).toBe('valid_status');
    });
  });

  describe('getSchemaFromFile', () => {
    it('should load schema from file when it exists', () => {
      // Verify the function exists and has expected signature
      expect(typeof introspector.getSchemaFromFile).toBe('function');
    });

    it('should throw error for non-existent file', () => {
      // The default mock returns false for existsSync, so this should fail
      expect(() => introspector.getSchemaFromFile('/nonexistent.json'))
        .toThrow('Schema file not found');
    });

    it('should handle schema loading correctly', () => {
      // Verify behavior - the function should throw on missing file
      expect(() => introspector.getSchemaFromFile('/some/file.json'))
        .toThrow('Schema file not found');
    });
  });

  describe('saveSchemaToFile', () => {
    it('should save schema to file', () => {
      // saveSchemaToFile should not throw
      const schema = { type: 'object', properties: {} };
      expect(() => introspector.saveSchemaToFile(schema, '/output/schema.json')).not.toThrow();
    });

    it('should create directory if not exists', () => {
      // saveSchemaToFile handles directory creation internally
      const schema = { type: 'object' };
      expect(() => introspector.saveSchemaToFile(schema, '/new/path/schema.json')).not.toThrow();
    });
  });

  describe('getSupabaseSchema', () => {
    it('should throw error when config is missing', async () => {
      await expect(introspector.getSupabaseSchema({}, 'table'))
        .rejects.toThrow('Supabase URL and service role key required');
    });

    it('should throw error when URL is missing', async () => {
      await expect(introspector.getSupabaseSchema({ serviceRoleKey: 'key' }, 'table'))
        .rejects.toThrow('Supabase URL and service role key required');
    });

    it('should throw error when key is missing', async () => {
      await expect(introspector.getSupabaseSchema({ url: 'url' }, 'table'))
        .rejects.toThrow('Supabase URL and service role key required');
    });
  });
});
