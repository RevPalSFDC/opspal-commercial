/**
 * universal-schema-validator.test.js
 *
 * Tests for UniversalSchemaValidator - validates data against database schemas
 */

const validator = require('../universal-schema-validator');

describe('UniversalSchemaValidator', () => {
  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    console.log.mockRestore();
    console.error.mockRestore();
    console.warn.mockRestore();
  });

  describe('validateAgainstSchema', () => {
    describe('required fields', () => {
      it('should pass when all required fields present', () => {
        const schema = { required: ['name', 'email'] };
        const data = { name: 'Test', email: 'test@example.com' };

        const result = validator.validateAgainstSchema(data, schema);

        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it('should fail when required field is missing', () => {
        const schema = { required: ['name', 'email'] };
        const data = { name: 'Test' };

        const result = validator.validateAgainstSchema(data, schema);

        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('email'))).toBe(true);
      });

      it('should fail when required field is null', () => {
        const schema = { required: ['name'] };
        const data = { name: null };

        const result = validator.validateAgainstSchema(data, schema);

        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('name'))).toBe(true);
      });
    });

    describe('unknown fields', () => {
      it('should reject unknown fields by default', () => {
        const schema = { properties: { name: { type: 'string' } } };
        const data = { name: 'Test', extra: 'field' };

        const result = validator.validateAgainstSchema(data, schema);

        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('extra'))).toBe(true);
      });

      it('should allow unknown fields when allowUnknownFields is true', () => {
        const schema = { properties: { name: { type: 'string' } } };
        const data = { name: 'Test', extra: 'field' };

        const result = validator.validateAgainstSchema(data, schema, { allowUnknownFields: true });

        expect(result.valid).toBe(true);
        expect(result.warnings.some(w => w.includes('extra'))).toBe(true);
      });
    });

    describe('nullable fields', () => {
      it('should allow null for nullable fields', () => {
        const schema = { properties: { name: { type: 'string', nullable: true } } };
        const data = { name: null };

        const result = validator.validateAgainstSchema(data, schema);

        expect(result.valid).toBe(true);
      });

      it('should reject null for non-nullable fields', () => {
        const schema = { properties: { name: { type: 'string' } } };
        const data = { name: null };

        const result = validator.validateAgainstSchema(data, schema);

        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('cannot be null'))).toBe(true);
      });
    });

    describe('unique constraints', () => {
      it('should pass for unique value', () => {
        const schema = { unique: ['email'], properties: { email: { type: 'string' } } };
        const existingRecords = [{ email: 'existing@example.com' }];
        const data = { email: 'new@example.com' };

        const result = validator.validateAgainstSchema(data, schema, { existingRecords });

        expect(result.valid).toBe(true);
      });

      it('should fail for duplicate unique value', () => {
        const schema = { unique: ['email'], properties: { email: { type: 'string' } } };
        const existingRecords = [{ email: 'existing@example.com' }];
        const data = { email: 'existing@example.com' };

        const result = validator.validateAgainstSchema(data, schema, { existingRecords });

        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('Unique constraint'))).toBe(true);
      });
    });

    describe('foreign key constraints', () => {
      it('should pass when foreign key reference exists', () => {
        const schema = {
          foreignKeys: [{ field: 'user_id', references: { table: 'users', field: 'id' } }],
          properties: { user_id: { type: 'integer' } }
        };
        const referencedData = { users: [{ id: 1 }, { id: 2 }] };
        const data = { user_id: 1 };

        const result = validator.validateAgainstSchema(data, schema, { referencedData });

        expect(result.valid).toBe(true);
      });

      it('should fail when foreign key reference missing', () => {
        const schema = {
          foreignKeys: [{ field: 'user_id', references: { table: 'users', field: 'id' } }],
          properties: { user_id: { type: 'integer' } }
        };
        const referencedData = { users: [{ id: 1 }, { id: 2 }] };
        const data = { user_id: 999 };

        const result = validator.validateAgainstSchema(data, schema, { referencedData });

        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('Foreign key violation'))).toBe(true);
      });

      it('should warn when referenced data not provided in strict mode', () => {
        const schema = {
          foreignKeys: [{ field: 'user_id', references: { table: 'users', field: 'id' } }],
          properties: { user_id: { type: 'integer' } }
        };
        const data = { user_id: 1 };

        const result = validator.validateAgainstSchema(data, schema, { referencedData: {}, strict: true });

        expect(result.warnings.some(w => w.includes('Cannot validate foreign key'))).toBe(true);
      });
    });

    describe('check constraints', () => {
      it('should pass when check constraint satisfied', () => {
        const schema = {
          checks: [{ name: 'age_positive', expression: 'age > 0' }],
          properties: { age: { type: 'integer' } }
        };
        const data = { age: 25 };

        const result = validator.validateAgainstSchema(data, schema);

        expect(result.valid).toBe(true);
      });

      it('should fail when check constraint violated', () => {
        const schema = {
          checks: [{ name: 'age_positive', expression: 'age > 0' }],
          properties: { age: { type: 'integer' } }
        };
        const data = { age: -5 };

        const result = validator.validateAgainstSchema(data, schema);

        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('Check constraint failed'))).toBe(true);
      });
    });
  });

  describe('validateType', () => {
    it('should validate string type', () => {
      const result = validator.validateType('name', 'test', { type: 'string' });
      expect(result).toBeNull();
    });

    it('should reject non-string for string type', () => {
      const result = validator.validateType('name', 123, { type: 'string' });
      expect(result).toContain('must be a string');
    });

    it('should validate email format', () => {
      const result = validator.validateType('email', 'test@example.com', { type: 'string', format: 'email' });
      expect(result).toBeNull();
    });

    it('should reject invalid email', () => {
      const result = validator.validateType('email', 'invalid', { type: 'string', format: 'email' });
      expect(result).toContain('valid email');
    });

    it('should validate UUID format', () => {
      const result = validator.validateType('id', '123e4567-e89b-12d3-a456-426614174000', { type: 'string', format: 'uuid' });
      expect(result).toBeNull();
    });

    it('should reject invalid UUID', () => {
      const result = validator.validateType('id', 'not-a-uuid', { type: 'string', format: 'uuid' });
      expect(result).toContain('valid UUID');
    });

    it('should validate date-time format', () => {
      const result = validator.validateType('date', new Date().toISOString(), { type: 'string', format: 'date-time' });
      expect(result).toBeNull();
    });

    it('should reject invalid date-time', () => {
      const result = validator.validateType('date', 'not-a-date', { type: 'string', format: 'date-time' });
      expect(result).toContain('valid ISO 8601');
    });

    it('should validate integer type', () => {
      const result = validator.validateType('count', 42, { type: 'integer' });
      expect(result).toBeNull();
    });

    it('should reject float for integer type', () => {
      const result = validator.validateType('count', 3.14, { type: 'integer' });
      expect(result).toContain('must be an integer');
    });

    it('should validate number type', () => {
      const result = validator.validateType('price', 19.99, { type: 'number' });
      expect(result).toBeNull();
    });

    it('should reject NaN for number type', () => {
      const result = validator.validateType('price', NaN, { type: 'number' });
      expect(result).toContain('must be a number');
    });

    it('should validate boolean type', () => {
      const result = validator.validateType('active', true, { type: 'boolean' });
      expect(result).toBeNull();
    });

    it('should reject non-boolean for boolean type', () => {
      const result = validator.validateType('active', 'true', { type: 'boolean' });
      expect(result).toContain('must be a boolean');
    });

    it('should validate array type', () => {
      const result = validator.validateType('items', [1, 2, 3], { type: 'array' });
      expect(result).toBeNull();
    });

    it('should reject non-array for array type', () => {
      const result = validator.validateType('items', 'not-array', { type: 'array' });
      expect(result).toContain('must be an array');
    });

    it('should validate array items', () => {
      const result = validator.validateType('items', [1, 2, 3], { type: 'array', items: { type: 'integer' } });
      expect(result).toBeNull();
    });

    it('should reject invalid array items', () => {
      const result = validator.validateType('items', [1, 'two', 3], { type: 'array', items: { type: 'integer' } });
      expect(result).toContain('must be an integer');
    });

    it('should validate object type', () => {
      const result = validator.validateType('data', { key: 'value' }, { type: 'object' });
      expect(result).toBeNull();
    });

    it('should reject null for object type', () => {
      const result = validator.validateType('data', null, { type: 'object' });
      expect(result).toContain('must be an object');
    });

    it('should reject array for object type', () => {
      const result = validator.validateType('data', [1, 2], { type: 'object' });
      expect(result).toContain('must be an object');
    });

    it('should return error for unknown type', () => {
      const result = validator.validateType('field', 'value', { type: 'unknown' });
      expect(result).toContain('Unknown type');
    });
  });

  describe('validateConstraints', () => {
    describe('string constraints', () => {
      it('should validate minLength', () => {
        const errors = validator.validateConstraints('name', 'ab', { type: 'string', minLength: 3 });
        expect(errors.some(e => e.includes('at least 3'))).toBe(true);
      });

      it('should validate maxLength', () => {
        const errors = validator.validateConstraints('name', 'toolong', { type: 'string', maxLength: 5 });
        expect(errors.some(e => e.includes('at most 5'))).toBe(true);
      });

      it('should validate pattern', () => {
        const errors = validator.validateConstraints('code', 'abc', { type: 'string', pattern: '^[0-9]+$' });
        expect(errors.some(e => e.includes('pattern'))).toBe(true);
      });

      it('should validate enum', () => {
        const errors = validator.validateConstraints('status', 'invalid', { type: 'string', enum: ['active', 'inactive'] });
        expect(errors.some(e => e.includes('must be one of'))).toBe(true);
      });

      it('should pass valid enum value', () => {
        const errors = validator.validateConstraints('status', 'active', { type: 'string', enum: ['active', 'inactive'] });
        expect(errors).toHaveLength(0);
      });
    });

    describe('number constraints', () => {
      it('should validate minimum', () => {
        const errors = validator.validateConstraints('age', 5, { type: 'integer', minimum: 10 });
        expect(errors.some(e => e.includes('>= 10'))).toBe(true);
      });

      it('should validate maximum', () => {
        const errors = validator.validateConstraints('age', 150, { type: 'integer', maximum: 120 });
        expect(errors.some(e => e.includes('<= 120'))).toBe(true);
      });

      it('should validate exclusiveMinimum', () => {
        const errors = validator.validateConstraints('price', 0, { type: 'number', exclusiveMinimum: 0 });
        expect(errors.some(e => e.includes('> 0'))).toBe(true);
      });

      it('should validate exclusiveMaximum', () => {
        const errors = validator.validateConstraints('rate', 100, { type: 'number', exclusiveMaximum: 100 });
        expect(errors.some(e => e.includes('< 100'))).toBe(true);
      });
    });

    describe('array constraints', () => {
      it('should validate minItems', () => {
        const errors = validator.validateConstraints('items', [1], { type: 'array', minItems: 2 });
        expect(errors.some(e => e.includes('at least 2'))).toBe(true);
      });

      it('should validate maxItems', () => {
        const errors = validator.validateConstraints('items', [1, 2, 3, 4], { type: 'array', maxItems: 3 });
        expect(errors.some(e => e.includes('at most 3'))).toBe(true);
      });

      it('should validate uniqueItems', () => {
        const errors = validator.validateConstraints('items', [1, 2, 2, 3], { type: 'array', uniqueItems: true });
        expect(errors.some(e => e.includes('unique items'))).toBe(true);
      });

      it('should pass array with unique items', () => {
        const errors = validator.validateConstraints('items', [1, 2, 3], { type: 'array', uniqueItems: true });
        expect(errors).toHaveLength(0);
      });
    });
  });

  describe('evaluateCheckConstraint', () => {
    it('should evaluate greater than expression', () => {
      const result = validator.evaluateCheckConstraint({ age: 25 }, { expression: 'age > 18' });
      expect(result).toBe(true);
    });

    it('should evaluate greater than or equal expression', () => {
      const result = validator.evaluateCheckConstraint({ age: 18 }, { expression: 'age >= 18' });
      expect(result).toBe(true);
    });

    it('should evaluate less than expression', () => {
      const result = validator.evaluateCheckConstraint({ count: 5 }, { expression: 'count < 10' });
      expect(result).toBe(true);
    });

    it('should evaluate less than or equal expression', () => {
      const result = validator.evaluateCheckConstraint({ count: 10 }, { expression: 'count <= 10' });
      expect(result).toBe(true);
    });

    it('should evaluate IN expression', () => {
      const result = validator.evaluateCheckConstraint({ status: 'active' }, { expression: "status IN ('active', 'inactive')" });
      expect(result).toBe(true);
    });

    it('should fail IN expression for missing value', () => {
      const result = validator.evaluateCheckConstraint({ status: 'unknown' }, { expression: "status IN ('active', 'inactive')" });
      expect(result).toBe(false);
    });

    it('should return true for complex expressions', () => {
      const result = validator.evaluateCheckConstraint({}, { expression: 'complex_expression' });
      expect(result).toBe(true);
    });
  });

  describe('format validators', () => {
    it('should validate email format', () => {
      expect(validator.isValidEmail('test@example.com')).toBe(true);
      expect(validator.isValidEmail('invalid')).toBe(false);
      expect(validator.isValidEmail('no@domain')).toBe(false);
    });

    it('should validate UUID format', () => {
      expect(validator.isValidUUID('123e4567-e89b-12d3-a456-426614174000')).toBe(true);
      expect(validator.isValidUUID('not-a-uuid')).toBe(false);
    });

    it('should validate date-time format', () => {
      const validDate = new Date().toISOString();
      expect(validator.isValidDateTime(validDate)).toBe(true);
      expect(validator.isValidDateTime('2024-01-01')).toBe(false);
      expect(validator.isValidDateTime('invalid')).toBe(false);
    });
  });

  describe('batchValidate', () => {
    it('should validate multiple records', () => {
      const schema = { required: ['name'], properties: { name: { type: 'string' } } };
      const records = [
        { name: 'Record 1' },
        { name: 'Record 2' },
        { name: 'Record 3' }
      ];

      const result = validator.batchValidate(records, schema);

      expect(result.valid).toBe(true);
      expect(result.summary.total).toBe(3);
      expect(result.summary.valid).toBe(3);
      expect(result.summary.invalid).toBe(0);
    });

    it('should track invalid records', () => {
      const schema = { required: ['name'], properties: { name: { type: 'string' } } };
      const records = [
        { name: 'Valid' },
        { },  // Missing name
        { name: 'Also valid' }
      ];

      const result = validator.batchValidate(records, schema);

      expect(result.valid).toBe(false);
      expect(result.summary.valid).toBe(2);
      expect(result.summary.invalid).toBe(1);
    });

    it('should include error count', () => {
      const schema = { required: ['a', 'b'], properties: {} };
      const records = [{ }];  // Missing both a and b

      const result = validator.batchValidate(records, schema);

      expect(result.summary.totalErrors).toBe(2);
    });
  });

  describe('logValidation', () => {
    it('should log success for valid result', () => {
      validator.logValidation('Test', { valid: true, errors: [], warnings: [] });

      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('passed'));
    });

    it('should log errors for invalid result', () => {
      validator.logValidation('Test', { valid: false, errors: ['Error 1', 'Error 2'], warnings: [] });

      expect(console.error).toHaveBeenCalled();
    });

    it('should log warnings', () => {
      validator.logValidation('Test', { valid: true, errors: [], warnings: ['Warning 1'] });

      expect(console.warn).toHaveBeenCalled();
    });

    it('should log batch summary', () => {
      validator.logValidation('Batch', {
        valid: true,
        errors: [],
        warnings: [],
        summary: { total: 100, valid: 95, invalid: 5, totalErrors: 5, totalWarnings: 2 }
      });

      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Batch Validation Summary'));
    });
  });
});
