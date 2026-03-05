/**
 * plugin-publisher.test.js
 *
 * Tests for plugin publishing and version management
 *
 * To run: npm test -- plugin-publisher
 */

const {
  parseVersion,
  isValidVersion,
  compareVersions,
  bumpVersion,
  addPrerelease,
  promotePrerelease,
  isPrerelease,
  generateChangelogEntry,
  updatePluginJson,
  updateChangelog,
  findPluginJson,
  getCurrentVersion,
  validateVersionSequence,
  parseConventionalCommit,
  categorizeCommits
} = require('../plugin-publisher.js');

const fs = require('fs');
const path = require('path');

jest.mock('fs');

describe('plugin-publisher', () => {

  describe('parseVersion', () => {
    it('should parse valid semantic version', () => {
      const result = parseVersion('1.2.3');

      expect(result).toEqual({
        major: 1,
        minor: 2,
        patch: 3,
        prerelease: null,
        build: null,
        raw: '1.2.3'
      });
    });

    it('should parse version with pre-release', () => {
      const result = parseVersion('2.0.0-beta.1');

      expect(result.major).toBe(2);
      expect(result.minor).toBe(0);
      expect(result.patch).toBe(0);
      expect(result.prerelease).toBe('beta.1');
    });

    it('should parse version with build metadata', () => {
      const result = parseVersion('1.0.0+20250110');

      expect(result.major).toBe(1);
      expect(result.build).toBe('20250110');
    });

    it('should parse version with both pre-release and build', () => {
      const result = parseVersion('3.1.4-rc.2+build.123');

      expect(result.prerelease).toBe('rc.2');
      expect(result.build).toBe('build.123');
    });

    it('should return null for invalid version', () => {
      expect(parseVersion('invalid')).toBeNull();
      expect(parseVersion('1.2')).toBeNull();
      expect(parseVersion('')).toBeNull();
      expect(parseVersion(null)).toBeNull();
    });
  });

  describe('isValidVersion', () => {
    it('should validate correct semantic versions', () => {
      expect(isValidVersion('1.0.0')).toBe(true);
      expect(isValidVersion('2.3.4')).toBe(true);
      expect(isValidVersion('10.20.30')).toBe(true);
      expect(isValidVersion('1.0.0-alpha.1')).toBe(true);
      expect(isValidVersion('1.0.0+build')).toBe(true);
    });

    it('should reject invalid versions', () => {
      expect(isValidVersion('1.2')).toBe(false);
      expect(isValidVersion('v1.0.0')).toBe(false);
      expect(isValidVersion('1.0.0.0')).toBe(false);
      expect(isValidVersion('')).toBe(false);
      expect(isValidVersion(null)).toBe(false);
    });
  });

  describe('compareVersions', () => {
    it('should compare major versions correctly', () => {
      expect(compareVersions('2.0.0', '1.0.0')).toBe(1);
      expect(compareVersions('1.0.0', '2.0.0')).toBe(-1);
    });

    it('should compare minor versions correctly', () => {
      expect(compareVersions('1.5.0', '1.2.0')).toBe(1);
      expect(compareVersions('1.2.0', '1.5.0')).toBe(-1);
    });

    it('should compare patch versions correctly', () => {
      expect(compareVersions('1.0.5', '1.0.3')).toBe(1);
      expect(compareVersions('1.0.3', '1.0.5')).toBe(-1);
    });

    it('should return 0 for equal versions', () => {
      expect(compareVersions('1.2.3', '1.2.3')).toBe(0);
    });

    it('should compare pre-release versions', () => {
      expect(compareVersions('1.0.0', '1.0.0-beta.1')).toBe(1); // Release > pre-release
      expect(compareVersions('1.0.0-beta.1', '1.0.0')).toBe(-1);
      expect(compareVersions('1.0.0-beta.2', '1.0.0-beta.1')).toBe(1);
    });

    it('should return null for invalid versions', () => {
      expect(compareVersions('invalid', '1.0.0')).toBeNull();
      expect(compareVersions('1.0.0', 'invalid')).toBeNull();
    });
  });

  describe('bumpVersion', () => {
    it('should bump major version', () => {
      expect(bumpVersion('1.2.3', 'major')).toBe('2.0.0');
      expect(bumpVersion('2.0.0', 'major')).toBe('3.0.0');
    });

    it('should bump minor version', () => {
      expect(bumpVersion('1.2.3', 'minor')).toBe('1.3.0');
      expect(bumpVersion('2.5.0', 'minor')).toBe('2.6.0');
    });

    it('should bump patch version', () => {
      expect(bumpVersion('1.2.3', 'patch')).toBe('1.2.4');
      expect(bumpVersion('3.0.9', 'patch')).toBe('3.0.10');
    });

    it('should strip pre-release when bumping', () => {
      expect(bumpVersion('1.0.0-beta.1', 'patch')).toBe('1.0.1');
      expect(bumpVersion('2.0.0-rc.1', 'minor')).toBe('2.1.0');
    });

    it('should throw error for invalid version', () => {
      expect(() => bumpVersion('invalid', 'major')).toThrow('Invalid version format');
    });

    it('should throw error for invalid bump type', () => {
      expect(() => bumpVersion('1.0.0', 'invalid')).toThrow('Invalid bump type');
    });
  });

  describe('addPrerelease', () => {
    it('should add pre-release suffix', () => {
      expect(addPrerelease('1.0.0', 'alpha.1')).toBe('1.0.0-alpha.1');
      expect(addPrerelease('2.1.0', 'beta.2')).toBe('2.1.0-beta.2');
    });

    it('should replace existing pre-release', () => {
      expect(addPrerelease('1.0.0-alpha.1', 'beta.1')).toBe('1.0.0-beta.1');
    });

    it('should throw error for invalid version', () => {
      expect(() => addPrerelease('invalid', 'alpha.1')).toThrow('Invalid version');
    });
  });

  describe('promotePrerelease', () => {
    it('should remove pre-release suffix', () => {
      expect(promotePrerelease('1.0.0-beta.1')).toBe('1.0.0');
      expect(promotePrerelease('2.1.0-rc.2')).toBe('2.1.0');
    });

    it('should throw error for non-prerelease version', () => {
      expect(() => promotePrerelease('1.0.0')).toThrow('is not a pre-release');
    });

    it('should throw error for null version', () => {
      expect(() => promotePrerelease(null)).toThrow('Version is required');
    });
  });

  describe('isPrerelease', () => {
    it('should identify pre-release versions', () => {
      expect(isPrerelease('1.0.0-alpha.1')).toBe(true);
      expect(isPrerelease('2.0.0-beta.2')).toBe(true);
    });

    it('should identify release versions', () => {
      expect(isPrerelease('1.0.0')).toBe(false);
      expect(isPrerelease('2.1.3')).toBe(false);
    });

    it('should handle invalid input', () => {
      expect(isPrerelease(null)).toBe(false);
      expect(isPrerelease('')).toBe(false);
    });
  });

  describe('generateChangelogEntry', () => {
    it('should generate entry with string changes', () => {
      const result = generateChangelogEntry('1.0.0', '2025-10-10', 'Bug fixes');

      expect(result).toContain('## [1.0.0] - 2025-10-10');
      expect(result).toContain('Bug fixes');
    });

    it('should generate entry with categorized changes', () => {
      const changes = {
        added: ['New feature 1', 'New feature 2'],
        fixed: ['Bug fix 1']
      };

      const result = generateChangelogEntry('2.0.0', '2025-10-15', changes);

      expect(result).toContain('### Added');
      expect(result).toContain('- New feature 1');
      expect(result).toContain('- New feature 2');
      expect(result).toContain('### Fixed');
      expect(result).toContain('- Bug fix 1');
    });

    it('should generate default template for no changes', () => {
      const result = generateChangelogEntry('1.1.0', '2025-10-20');

      expect(result).toContain('### Added');
      expect(result).toContain('### Changed');
      expect(result).toContain('### Fixed');
    });

    it('should handle all change categories', () => {
      const changes = {
        added: ['Feature'],
        changed: ['Update'],
        deprecated: ['Old feature'],
        removed: ['Obsolete'],
        fixed: ['Bug'],
        security: ['Patch']
      };

      const result = generateChangelogEntry('3.0.0', '2025-10-25', changes);

      expect(result).toContain('### Added');
      expect(result).toContain('### Changed');
      expect(result).toContain('### Deprecated');
      expect(result).toContain('### Removed');
      expect(result).toContain('### Fixed');
      expect(result).toContain('### Security');
    });
  });

  describe('updatePluginJson', () => {
    beforeEach(() => {
      fs.existsSync.mockClear();
      fs.readFileSync.mockClear();
      fs.writeFileSync.mockClear();
    });

    it('should update version in plugin.json', () => {
      const mockContent = JSON.stringify({ name: 'test-plugin', version: '1.0.0' }, null, 2);
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(mockContent);

      const result = updatePluginJson('/path/to/plugin.json', '1.1.0');

      expect(result.oldVersion).toBe('1.0.0');
      expect(result.newVersion).toBe('1.1.0');
      expect(fs.writeFileSync).toHaveBeenCalled();
    });

    it('should throw error for missing file', () => {
      fs.existsSync.mockReturnValue(false);

      expect(() => updatePluginJson('/missing/plugin.json', '1.0.0')).toThrow('not found');
    });

    it('should throw error for invalid version', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(JSON.stringify({ version: '1.0.0' }));

      expect(() => updatePluginJson('/path/to/plugin.json', 'invalid')).toThrow('Invalid version format');
    });

    it('should default to 0.0.0 if no version in plugin.json', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(JSON.stringify({ name: 'test' }));

      const result = updatePluginJson('/path/to/plugin.json', '1.0.0');

      expect(result.oldVersion).toBe('0.0.0');
      expect(result.newVersion).toBe('1.0.0');
    });
  });

  describe('updateChangelog', () => {
    beforeEach(() => {
      fs.existsSync.mockClear();
      fs.readFileSync.mockClear();
      fs.writeFileSync.mockClear();
    });

    it('should create new changelog if not exists', () => {
      fs.existsSync.mockReturnValue(false);

      const result = updateChangelog('/path/CHANGELOG.md', '1.0.0', '2025-10-10', 'Initial release');

      expect(result.created).toBe(true);
      expect(fs.writeFileSync).toHaveBeenCalled();
      const written = fs.writeFileSync.mock.calls[0][1];
      expect(written).toContain('# Changelog');
      expect(written).toContain('## [1.0.0]');
    });

    it('should update existing changelog', () => {
      const oldContent = '# Changelog\n\nAll notable changes.\n\n## [1.0.0] - 2025-10-01\n\nFirst release\n';
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(oldContent);

      const result = updateChangelog('/path/CHANGELOG.md', '1.1.0', '2025-10-15', 'New features');

      expect(result.created).toBe(false);
      expect(fs.writeFileSync).toHaveBeenCalled();
      const written = fs.writeFileSync.mock.calls[0][1];
      expect(written).toContain('## [1.1.0] - 2025-10-15');
      expect(written).toContain('## [1.0.0] - 2025-10-01'); // Old entry preserved
    });
  });

  describe('findPluginJson', () => {
    beforeEach(() => {
      fs.existsSync.mockClear();
    });

    it('should find plugin.json in .claude-plugin directory', () => {
      fs.existsSync.mockImplementation(path => path.includes('.claude-plugin'));

      const result = findPluginJson('/path/to/plugin');

      expect(result).toContain('.claude-plugin');
      expect(result).toContain('plugin.json');
    });

    it('should find plugin.json in root if .claude-plugin not exists', () => {
      fs.existsSync.mockImplementation(path => !path.includes('.claude-plugin'));

      const result = findPluginJson('/path/to/plugin');

      expect(result).not.toContain('.claude-plugin');
      expect(result).toContain('plugin.json');
    });

    it('should throw error if plugin.json not found', () => {
      fs.existsSync.mockReturnValue(false);

      expect(() => findPluginJson('/path/to/plugin')).toThrow('plugin.json not found');
    });
  });

  describe('getCurrentVersion', () => {
    beforeEach(() => {
      fs.existsSync.mockClear();
      fs.readFileSync.mockClear();
    });

    it('should get current version from plugin.json', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(JSON.stringify({ version: '2.3.4' }));

      const result = getCurrentVersion('/path/to/plugin');

      expect(result).toBe('2.3.4');
    });

    it('should return 0.0.0 if version not set', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(JSON.stringify({ name: 'test' }));

      const result = getCurrentVersion('/path/to/plugin');

      expect(result).toBe('0.0.0');
    });
  });

  describe('validateVersionSequence', () => {
    it('should allow valid version bump', () => {
      expect(validateVersionSequence('1.0.0', '1.1.0')).toBe(true);
      expect(validateVersionSequence('2.0.0', '3.0.0')).toBe(true);
    });

    it('should throw error for downgrade', () => {
      expect(() => validateVersionSequence('2.0.0', '1.0.0')).toThrow('is less than current');
    });

    it('should allow downgrade with force option', () => {
      expect(validateVersionSequence('2.0.0', '1.0.0', { force: true })).toBe(true);
    });

    it('should throw error for same version', () => {
      expect(() => validateVersionSequence('1.0.0', '1.0.0')).toThrow('is the same as current');
    });

    it('should throw error for release to pre-release downgrade', () => {
      expect(() => validateVersionSequence('1.0.0', '1.0.0-beta.1')).toThrow('Cannot downgrade from release to pre-release');
    });

    it('should allow pre-release with version bump', () => {
      expect(validateVersionSequence('1.0.0', '1.1.0-beta.1')).toBe(true);
    });

    it('should allow release to pre-release with force', () => {
      expect(validateVersionSequence('1.0.0', '1.0.0-beta.1', { force: true })).toBe(true);
    });
  });

  describe('parseConventionalCommit', () => {
    it('should parse feat commit', () => {
      const result = parseConventionalCommit('feat: Add new feature');

      expect(result.type).toBe('feat');
      expect(result.scope).toBeNull();
      expect(result.subject).toBe('Add new feature');
      expect(result.breaking).toBe(false);
    });

    it('should parse commit with scope', () => {
      const result = parseConventionalCommit('fix(api): Resolve bug');

      expect(result.type).toBe('fix');
      expect(result.scope).toBe('api');
      expect(result.subject).toBe('Resolve bug');
    });

    it('should detect breaking changes', () => {
      const result = parseConventionalCommit('feat: New API BREAKING CHANGE: old API removed');

      expect(result.breaking).toBe(true);
    });

    it('should handle non-conventional commits', () => {
      const result = parseConventionalCommit('Regular commit message');

      expect(result.type).toBe('other');
      expect(result.subject).toBe('Regular commit message');
    });

    it('should return null for invalid input', () => {
      expect(parseConventionalCommit(null)).toBeNull();
      expect(parseConventionalCommit('')).toBeNull();
    });
  });

  describe('categorizeCommits', () => {
    it('should categorize feature commits', () => {
      const commits = ['feat: New feature', 'feat: Another feature'];
      const result = categorizeCommits(commits);

      expect(result.added).toHaveLength(2);
      expect(result.added[0]).toBe('New feature');
    });

    it('should categorize fix commits', () => {
      const commits = ['fix: Bug fix', 'fix: Another fix'];
      const result = categorizeCommits(commits);

      expect(result.fixed).toHaveLength(2);
    });

    it('should categorize breaking changes', () => {
      const commits = ['feat: New API BREAKING CHANGE: removed old'];
      const result = categorizeCommits(commits);

      expect(result.breaking).toHaveLength(1);
      expect(result.added).toHaveLength(1); // Also in added
    });

    it('should handle mixed commit types', () => {
      const commits = [
        'feat: Feature',
        'fix: Fix',
        'docs: Documentation',
        'chore: Deprecate old feature',
        'chore: Remove obsolete'
      ];

      const result = categorizeCommits(commits);

      expect(result.added).toHaveLength(1);
      expect(result.fixed).toHaveLength(1);
      expect(result.changed).toHaveLength(1);
      expect(result.deprecated).toHaveLength(1);
      expect(result.removed).toHaveLength(1);
    });

    it('should handle empty array', () => {
      const result = categorizeCommits([]);

      expect(result.added).toEqual([]);
      expect(result.fixed).toEqual([]);
    });

    it('should handle non-array input', () => {
      const result = categorizeCommits(null);

      expect(result.added).toEqual([]);
    });
  });

});
