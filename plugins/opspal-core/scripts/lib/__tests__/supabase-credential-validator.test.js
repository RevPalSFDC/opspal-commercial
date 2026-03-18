/**
 * Tests for Supabase Credential Validator
 *
 * Related reflections: db09cc94
 */

const {
  REQUIRED_VARS,
  OPTIONAL_VARS,
  checkEnvironment,
  checkEnvFile,
  generateExampleEnv
} = require('../supabase-credential-validator');

describe('Supabase Credential Validator', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('REQUIRED_VARS', () => {
    it('should include essential variables', () => {
      expect(REQUIRED_VARS).toContain('SUPABASE_URL');
      expect(REQUIRED_VARS).toContain('SUPABASE_SERVICE_ROLE_KEY');
    });
  });

  describe('OPTIONAL_VARS', () => {
    it('should include optional variables', () => {
      expect(OPTIONAL_VARS).toContain('SUPABASE_ANON_KEY');
      expect(OPTIONAL_VARS).toContain('SUPABASE_JWT_SECRET');
    });
  });

  describe('checkEnvironment', () => {
    it('should return valid when all required vars present', () => {
      process.env.SUPABASE_URL = 'https://test.supabase.co';
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRlc3QiLCJyb2xlIjoic2VydmljZV9yb2xlIiwiaWF0IjoxNjQwMDAwMDAwLCJleHAiOjE5NTU2MDAwMDB9.test_signature';

      const result = checkEnvironment();

      expect(result.valid).toBe(true);
      expect(result.missing).toHaveLength(0);
    });

    it('should return invalid when required vars missing', () => {
      delete process.env.SUPABASE_URL;
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;

      const result = checkEnvironment();

      expect(result.valid).toBe(false);
      expect(result.missing).toContain('SUPABASE_URL');
      expect(result.missing).toContain('SUPABASE_SERVICE_ROLE_KEY');
    });

    it('should warn about invalid URL format', () => {
      process.env.SUPABASE_URL = 'invalid-url';
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test';

      const result = checkEnvironment();

      expect(result.warnings.some(w => w.includes('URL format'))).toBe(true);
    });

    it('should warn about invalid JWT format', () => {
      process.env.SUPABASE_URL = 'https://test.supabase.co';
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'not-a-jwt';

      const result = checkEnvironment();

      expect(result.warnings.some(w => w.includes('valid JWT'))).toBe(true);
    });

    it('should warn about spaces in key', () => {
      process.env.SUPABASE_URL = 'https://test.supabase.co';
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'eyJ key with spaces';

      const result = checkEnvironment();

      expect(result.warnings.some(w => w.includes('spaces'))).toBe(true);
    });

    it('should warn about short key', () => {
      process.env.SUPABASE_URL = 'https://test.supabase.co';
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'eyJshort';

      const result = checkEnvironment();

      expect(result.warnings.some(w => w.includes('too short'))).toBe(true);
    });

    it('should track optional vars', () => {
      process.env.SUPABASE_URL = 'https://test.supabase.co';
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRlc3QiLCJyb2xlIjoic2VydmljZV9yb2xlIiwiaWF0IjoxNjQwMDAwMDAwLCJleHAiOjE5NTU2MDAwMDB9.test';
      process.env.SUPABASE_ANON_KEY = 'anon-key';

      const result = checkEnvironment();

      expect(result.optional.SUPABASE_ANON_KEY.present).toBe(true);
      expect(result.optional.SUPABASE_JWT_SECRET.present).toBe(false);
    });
  });

  describe('checkEnvFile', () => {
    it('should return not found for missing file', () => {
      const result = checkEnvFile('/nonexistent/path/.env');

      expect(result.found).toBe(false);
      expect(result.suggestions.length).toBeGreaterThan(0);
    });

    it('should suggest creating .env when not found', () => {
      const result = checkEnvFile('/nonexistent/path/.env');

      expect(result.suggestions.some(s => s.includes('Create'))).toBe(true);
    });
  });

  describe('generateExampleEnv', () => {
    it('should generate valid example content', () => {
      const content = generateExampleEnv();

      expect(content).toContain('SUPABASE_URL=');
      expect(content).toContain('SUPABASE_SERVICE_ROLE_KEY=');
      expect(content).toContain('Required');
      expect(content).toContain('Optional');
    });

    it('should include placeholder URLs', () => {
      const content = generateExampleEnv();

      expect(content).toContain('supabase.co');
    });
  });
});
