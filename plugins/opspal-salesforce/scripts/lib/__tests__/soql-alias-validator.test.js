/**
 * Tests for SOQL Alias Validator
 *
 * Related reflections: a8d12f3c
 */

const {
  validateSOQL,
  fixSOQL,
  suggestOptimizations,
  RESERVED_KEYWORDS
} = require('../soql-alias-validator');

describe('SOQL Alias Validator', () => {
  describe('validateSOQL', () => {
    it('should validate a simple valid query', () => {
      const result = validateSOQL('SELECT Id, Name FROM Account');
      expect(result.valid).toBe(true);
      expect(result.issues).toHaveLength(0);
    });

    it('should detect reserved keyword as alias', () => {
      const result = validateSOQL('SELECT COUNT(Id) Order FROM Account GROUP BY Type');
      expect(result.valid).toBe(false);
      expect(result.issues.some(i => i.type === 'reserved_keyword')).toBe(true);
    });

    it('should detect duplicate aliases', () => {
      const result = validateSOQL('SELECT Name n, Title n FROM Contact');
      expect(result.valid).toBe(false);
      expect(result.issues.some(i => i.type === 'duplicate_alias')).toBe(true);
    });

    it('should detect aggregate without GROUP BY', () => {
      const result = validateSOQL('SELECT COUNT(Id), Name FROM Account');
      expect(result.valid).toBe(false);
      expect(result.issues.some(i => i.type === 'missing_group_by')).toBe(true);
    });

    it('should allow aggregate with GROUP BY', () => {
      const result = validateSOQL('SELECT StageName, COUNT(Id) total FROM Opportunity GROUP BY StageName');
      expect(result.valid).toBe(true);
    });

    it('should detect self-referencing alias', () => {
      const result = validateSOQL('SELECT Name Name FROM Account');
      expect(result.valid).toBe(false);
      expect(result.issues.some(i => i.type === 'self_alias')).toBe(true);
    });
  });

  describe('fixSOQL', () => {
    it('should fix reserved keyword aliases', () => {
      const result = fixSOQL('SELECT COUNT(Id) Order FROM Account GROUP BY Type');
      expect(result.fixedQuery).toContain('order_count');
      expect(result.fixesApplied).toBeGreaterThan(0);
    });

    it('should fix duplicate aliases', () => {
      const result = fixSOQL('SELECT Name n, Title n FROM Contact');
      expect(result.fixedQuery).not.toContain(' n,');
      expect(result.fixesApplied).toBeGreaterThan(0);
    });

    it('should not modify valid queries', () => {
      const query = 'SELECT Id, Name FROM Account';
      const result = fixSOQL(query);
      expect(result.fixedQuery).toBe(query);
      expect(result.fixesApplied).toBe(0);
    });
  });

  describe('suggestOptimizations', () => {
    it('should suggest LIMIT for large queries', () => {
      const result = suggestOptimizations('SELECT Id, Name FROM Account');
      expect(result.suggestions.some(s => s.type === 'add_limit')).toBe(true);
    });

    it('should suggest indexed fields for WHERE', () => {
      const result = suggestOptimizations('SELECT Id FROM Account WHERE Description LIKE "%test%"');
      expect(result.suggestions.length).toBeGreaterThan(0);
    });

    it('should not suggest LIMIT if already present', () => {
      const result = suggestOptimizations('SELECT Id, Name FROM Account LIMIT 100');
      expect(result.suggestions.some(s => s.type === 'add_limit')).toBe(false);
    });
  });

  describe('RESERVED_KEYWORDS', () => {
    it('should include common SOQL reserved words', () => {
      expect(RESERVED_KEYWORDS).toContain('order');
      expect(RESERVED_KEYWORDS).toContain('group');
      expect(RESERVED_KEYWORDS).toContain('select');
      expect(RESERVED_KEYWORDS).toContain('limit');
    });
  });
});
