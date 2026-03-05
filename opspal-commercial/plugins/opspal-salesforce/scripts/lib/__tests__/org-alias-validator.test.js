/**
 * Tests for Org Alias Validator
 *
 * Related reflections: c44fe70e
 */

const {
  ALIAS_PATTERNS,
  findSimilarAliases,
  detectOrgType
} = require('../org-alias-validator');

// Mock execSync for tests that don't need actual org connection
jest.mock('child_process', () => ({
  execSync: jest.fn(),
  spawnSync: jest.fn()
}));

describe('Org Alias Validator', () => {
  describe('ALIAS_PATTERNS', () => {
    it('should match production patterns', () => {
      expect(ALIAS_PATTERNS.production.test('prod')).toBe(true);
      expect(ALIAS_PATTERNS.production.test('production')).toBe(true);
      expect(ALIAS_PATTERNS.production.test('prd')).toBe(true);
      expect(ALIAS_PATTERNS.production.test('live')).toBe(true);
      expect(ALIAS_PATTERNS.production.test('main')).toBe(true);
    });

    it('should match sandbox patterns', () => {
      expect(ALIAS_PATTERNS.sandbox.test('sandbox')).toBe(true);
      expect(ALIAS_PATTERNS.sandbox.test('dev')).toBe(true);
      expect(ALIAS_PATTERNS.sandbox.test('test')).toBe(true);
      expect(ALIAS_PATTERNS.sandbox.test('qa')).toBe(true);
      expect(ALIAS_PATTERNS.sandbox.test('uat')).toBe(true);
      expect(ALIAS_PATTERNS.sandbox.test('staging')).toBe(true);
      expect(ALIAS_PATTERNS.sandbox.test('dev-feature1')).toBe(true);
    });

    it('should match scratch org patterns', () => {
      expect(ALIAS_PATTERNS.scratch.test('scratch')).toBe(true);
      expect(ALIAS_PATTERNS.scratch.test('so')).toBe(true);
      expect(ALIAS_PATTERNS.scratch.test('scratchorg')).toBe(true);
      expect(ALIAS_PATTERNS.scratch.test('scratch-feature')).toBe(true);
    });
  });

  describe('findSimilarAliases', () => {
    const mockOrgs = [
      { alias: 'prod', username: 'user@prod.org' },
      { alias: 'sandbox', username: 'user@sandbox.org' },
      { alias: 'dev', username: 'user@dev.org' },
      { alias: 'dev-feature', username: 'user@dev-feature.org' }
    ];

    it('should find similar aliases for typos', () => {
      const similar = findSimilarAliases('prdo', mockOrgs);
      expect(similar).toContain('prod');
    });

    it('should find similar aliases for close matches', () => {
      const similar = findSimilarAliases('devv', mockOrgs);
      expect(similar).toContain('dev');
    });

    it('should return empty array for completely different input', () => {
      const similar = findSimilarAliases('xyz123', mockOrgs);
      expect(similar).toHaveLength(0);
    });

    it('should limit results to 3', () => {
      const manyOrgs = [
        { alias: 'test1' },
        { alias: 'test2' },
        { alias: 'test3' },
        { alias: 'test4' },
        { alias: 'test5' }
      ];
      const similar = findSimilarAliases('test', manyOrgs);
      expect(similar.length).toBeLessThanOrEqual(3);
    });
  });

  describe('detectOrgType', () => {
    it('should detect production orgs', () => {
      const result = detectOrgType('prod');
      expect(result.type).toBe('production');
      expect(result.confidence).toBe('high');
      expect(result.warnings).toContain('This appears to be a production org - exercise caution');
    });

    it('should detect sandbox orgs', () => {
      const result = detectOrgType('dev-sandbox');
      expect(result.type).toBe('sandbox');
      expect(result.confidence).toBe('high');
    });

    it('should detect scratch orgs', () => {
      const result = detectOrgType('scratch-feature');
      expect(result.type).toBe('scratch');
      expect(result.confidence).toBe('high');
      expect(result.warnings).toContain('Scratch orgs are temporary and may expire');
    });

    it('should return unknown for unrecognized patterns', () => {
      const result = detectOrgType('my-custom-org');
      expect(result.type).toBe('unknown');
      expect(result.confidence).toBe('low');
    });
  });
});
