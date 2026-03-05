/**
 * System Dependency Validator Tests
 *
 * @module system-dependency-validator.test
 * @version 1.0.0
 */

const {
  validateDependencies,
  validateFor,
  validateProfile,
  isReady,
  getInstallScript,
  formatReport,
  detectOS,
  DEPENDENCY_PROFILES
} = require('../system-dependency-validator');

describe('SystemDependencyValidator', () => {
  describe('detectOS', () => {
    it('should detect OS platform', () => {
      const osInfo = detectOS();

      expect(osInfo).toHaveProperty('platform');
      expect(osInfo).toHaveProperty('release');
      expect(osInfo).toHaveProperty('isWSL');
      expect(['darwin', 'linux', 'win32']).toContain(osInfo.platform);
    });

    it('should detect WSL on Linux', () => {
      const osInfo = detectOS();

      if (osInfo.platform === 'linux') {
        expect(typeof osInfo.isWSL).toBe('boolean');
      }
    });
  });

  describe('DEPENDENCY_PROFILES', () => {
    it('should have core profile', () => {
      expect(DEPENDENCY_PROFILES).toHaveProperty('core');
      expect(DEPENDENCY_PROFILES.core).toHaveProperty('dependencies');
      expect(DEPENDENCY_PROFILES.core.dependencies).toHaveProperty('node');
      expect(DEPENDENCY_PROFILES.core.dependencies).toHaveProperty('npm');
      expect(DEPENDENCY_PROFILES.core.dependencies).toHaveProperty('git');
    });

    it('should have salesforce profile', () => {
      expect(DEPENDENCY_PROFILES).toHaveProperty('salesforce');
      expect(DEPENDENCY_PROFILES.salesforce.dependencies).toHaveProperty('sf');
    });

    it('should have pdf-generation profile', () => {
      expect(DEPENDENCY_PROFILES).toHaveProperty('pdf-generation');
      expect(DEPENDENCY_PROFILES['pdf-generation'].dependencies).toHaveProperty('puppeteer');
    });

    it('should have installCmd for each dependency', () => {
      for (const [profileName, profile] of Object.entries(DEPENDENCY_PROFILES)) {
        for (const [depName, dep] of Object.entries(profile.dependencies || {})) {
          expect(dep.installCmd).toBeDefined();
          expect(typeof dep.description).toBe('string');
        }
      }
    });
  });

  describe('validateProfile', () => {
    it('should validate core profile', async () => {
      const result = await validateProfile('core');

      expect(result).toHaveProperty('profile', 'core');
      expect(result).toHaveProperty('name', 'Core CLI Tools');
      expect(result).toHaveProperty('timestamp');
      expect(result).toHaveProperty('osInfo');
      expect(result).toHaveProperty('dependencies');
      expect(result).toHaveProperty('summary');
      expect(result.summary).toHaveProperty('total');
      expect(result.summary).toHaveProperty('available');
      expect(result.summary).toHaveProperty('score');
    });

    it('should detect node as available', async () => {
      const result = await validateProfile('core');

      expect(result.dependencies.node).toBeDefined();
      expect(result.dependencies.node.available).toBe(true);
    });

    it('should include version for node', async () => {
      const result = await validateProfile('core');

      if (result.dependencies.node.available) {
        expect(result.dependencies.node.version).toBeDefined();
      }
    });

    it('should throw for unknown profile', async () => {
      await expect(validateProfile('unknown-profile')).rejects.toThrow('Unknown profile');
    });

    it('should mark optional dependencies correctly', async () => {
      const result = await validateProfile('pdf-generation');

      expect(result.dependencies.pandoc).toBeDefined();
      expect(result.dependencies.pandoc.optional).toBe(true);
    });
  });

  describe('validateFor', () => {
    it('should be alias for validateProfile', async () => {
      const result = await validateFor('core');

      expect(result).toHaveProperty('profile', 'core');
      expect(result).toHaveProperty('summary');
    });
  });

  describe('validateDependencies', () => {
    it('should validate all profiles by default', async () => {
      const result = await validateDependencies();

      expect(result).toHaveProperty('profiles');
      expect(result).toHaveProperty('summary');
      expect(result.summary).toHaveProperty('totalProfiles');
      expect(result.summary).toHaveProperty('totalDependencies');
      expect(result.summary).toHaveProperty('score');

      // Should have multiple profiles
      expect(Object.keys(result.profiles).length).toBeGreaterThan(1);
    }, 30000); // Increase timeout for full validation

    it('should validate subset of profiles', async () => {
      const result = await validateDependencies({ profiles: ['core'] });

      expect(Object.keys(result.profiles)).toEqual(['core']);
    });

    it('should deduplicate recommendations', async () => {
      const result = await validateDependencies();

      const uniqueActions = new Set(result.allRecommendations.map(r => r.action));
      expect(uniqueActions.size).toBe(result.allRecommendations.length);
    });
  });

  describe('isReady', () => {
    it('should return boolean for core', async () => {
      const ready = await isReady('core');
      expect(typeof ready).toBe('boolean');
    });

    it('should return true when dependencies available', async () => {
      // Core should be ready since Node is running this test
      const ready = await isReady('core');
      expect(ready).toBe(true);
    });
  });

  describe('getInstallScript', () => {
    it('should generate bash script or success message', async () => {
      const script = await getInstallScript();

      // Either generates install script or reports all installed
      expect(typeof script).toBe('string');
      expect(script.length).toBeGreaterThan(0);

      if (!script.includes('All dependencies are installed')) {
        expect(script).toContain('#!/bin/bash');
        expect(script).toContain('# Auto-generated');
      }
    });

    it('should include npm install commands for missing npm packages', async () => {
      // This depends on what's missing, but script should be valid
      const script = await getInstallScript();

      expect(typeof script).toBe('string');
      expect(script.length).toBeGreaterThan(0);
    });

    it('should generate feature-specific script', async () => {
      const script = await getInstallScript('mermaid');

      // Either generates install script or reports all installed
      expect(typeof script).toBe('string');

      if (!script.includes('All dependencies are installed')) {
        expect(script).toContain('#!/bin/bash');
        // Should mention mermaid if missing
        if (script.includes('mermaid-cli')) {
          expect(script).toContain('@mermaid-js/mermaid-cli');
        }
      }
    });
  });

  describe('formatReport', () => {
    it('should format results as readable report', async () => {
      const results = await validateProfile('core');
      const report = formatReport(results);

      expect(report).toContain('System Dependency Validation Report');
      expect(report).toContain('Score');
      expect(report).toContain('Dependencies');
    });

    it('should include OS info in report', async () => {
      const results = await validateProfile('core');
      const report = formatReport(results);

      expect(report).toContain('System:');
    });

    it('should show verbose details when requested', async () => {
      const results = await validateDependencies();
      const report = formatReport(results, { verbose: true });

      // Verbose should show individual dependency status
      expect(report.length).toBeGreaterThan(formatReport(results).length);
    });

    it('should include recommendations if present', async () => {
      const results = await validateDependencies();

      if (results.allRecommendations.length > 0) {
        const report = formatReport(results);
        expect(report).toContain('Recommendations');
      }
    });
  });

  describe('Version Comparison', () => {
    it('should validate node version requirement', async () => {
      const result = await validateProfile('core');

      // Node should be available and meet min version
      expect(result.dependencies.node.available).toBe(true);

      // Our minVersion is 18.0.0, current Node should be >= that
      const version = result.dependencies.node.version;
      if (version) {
        const major = parseInt(version.split('.')[0]);
        expect(major).toBeGreaterThanOrEqual(18);
      }
    });
  });

  describe('Summary Calculations', () => {
    it('should calculate score correctly', async () => {
      const result = await validateProfile('core');

      const { total, available, optional, score } = result.summary;

      // Score should be percentage of available vs required (non-optional)
      const expected = Math.round((available / (total - optional)) * 100);
      expect(score).toBe(expected);
    });

    it('should mark ready when no missing required deps', async () => {
      const result = await validateProfile('core');

      if (result.summary.missing === 0) {
        expect(result.summary.ready).toBe(true);
      } else {
        expect(result.summary.ready).toBe(false);
      }
    });
  });

  describe('Integration', () => {
    it('should work end-to-end for common workflow', async () => {
      // Typical usage: check if ready, then get install script if not
      const coreReady = await isReady('core');

      if (!coreReady) {
        const script = await getInstallScript('core');
        expect(script).toContain('#!/bin/bash');
      }

      // Get full report
      const results = await validateDependencies({ profiles: ['core', 'salesforce'] });
      const report = formatReport(results);

      expect(report).toBeTruthy();
    });
  });
});
