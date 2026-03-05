/**
 * plugin-publisher.js
 *
 * Core library for plugin versioning, release preparation, and publishing.
 * Provides reusable functions for version management and release automation.
 *
 * @module plugin-publisher
 */

const fs = require('fs');
const path = require('path');

// Semantic versioning regex
const VERSION_PATTERN = /^(\d+)\.(\d+)\.(\d+)(?:-([a-zA-Z0-9.]+))?(?:\+([a-zA-Z0-9.]+))?$/;

/**
 * Parse semantic version string
 * @param {string} version - Version string (e.g., "1.2.3-beta.1")
 * @returns {object|null} Parsed version object or null if invalid
 */
function parseVersion(version) {
  if (!version || typeof version !== 'string') {
    return null;
  }

  const match = version.match(VERSION_PATTERN);
  if (!match) {
    return null;
  }

  return {
    major: parseInt(match[1]),
    minor: parseInt(match[2]),
    patch: parseInt(match[3]),
    prerelease: match[4] || null,
    build: match[5] || null,
    raw: version
  };
}

/**
 * Validate semantic version format
 * @param {string} version - Version string to validate
 * @returns {boolean} True if valid semver format
 */
function isValidVersion(version) {
  if (!version || typeof version !== 'string') {
    return false;
  }
  return VERSION_PATTERN.test(version);
}

/**
 * Compare two semantic versions
 * @param {string} version1 - First version
 * @param {string} version2 - Second version
 * @returns {number} -1 if v1 < v2, 0 if equal, 1 if v1 > v2, null if invalid
 */
function compareVersions(version1, version2) {
  const v1 = parseVersion(version1);
  const v2 = parseVersion(version2);

  if (!v1 || !v2) {
    return null;
  }

  // Compare major, minor, patch
  if (v1.major !== v2.major) return v1.major > v2.major ? 1 : -1;
  if (v1.minor !== v2.minor) return v1.minor > v2.minor ? 1 : -1;
  if (v1.patch !== v2.patch) return v1.patch > v2.patch ? 1 : -1;

  // If base versions are equal, compare pre-release
  // Release version > pre-release version
  if (v1.prerelease && !v2.prerelease) return -1;
  if (!v1.prerelease && v2.prerelease) return 1;

  // Both have pre-release, compare alphabetically
  if (v1.prerelease && v2.prerelease) {
    const cmp = v1.prerelease.localeCompare(v2.prerelease);
    return cmp > 0 ? 1 : (cmp < 0 ? -1 : 0);
  }

  return 0; // Versions are equal
}

/**
 * Bump semantic version
 * @param {string} version - Current version
 * @param {string} type - Bump type: 'major', 'minor', or 'patch'
 * @returns {string} New version string
 */
function bumpVersion(version, type) {
  const parsed = parseVersion(version);
  if (!parsed) {
    throw new Error(`Invalid version format: ${version}`);
  }

  let { major, minor, patch } = parsed;

  switch (type) {
    case 'major':
      return `${major + 1}.0.0`;
    case 'minor':
      return `${major}.${minor + 1}.0`;
    case 'patch':
      return `${major}.${minor}.${patch + 1}`;
    default:
      throw new Error(`Invalid bump type: ${type}. Use 'major', 'minor', or 'patch'.`);
  }
}

/**
 * Add pre-release suffix to version
 * @param {string} version - Base version
 * @param {string} prerelease - Pre-release suffix (e.g., "alpha.1", "beta.2")
 * @returns {string} Version with pre-release suffix
 */
function addPrerelease(version, prerelease) {
  if (!isValidVersion(version)) {
    throw new Error(`Invalid version: ${version}`);
  }

  // Remove existing pre-release if present
  const baseVersion = version.replace(/-.*$/, '');
  return `${baseVersion}-${prerelease}`;
}

/**
 * Remove pre-release suffix (promote to production)
 * @param {string} version - Pre-release version
 * @returns {string} Production version
 */
function promotePrerelease(version) {
  if (!version || typeof version !== 'string') {
    throw new Error('Version is required');
  }

  if (!version.includes('-')) {
    throw new Error(`Version ${version} is not a pre-release`);
  }

  return version.replace(/-.*$/, '');
}

/**
 * Check if version is a pre-release
 * @param {string} version - Version to check
 * @returns {boolean} True if pre-release version
 */
function isPrerelease(version) {
  if (!version || typeof version !== 'string') {
    return false;
  }
  return version.includes('-');
}

/**
 * Generate changelog entry
 * @param {string} version - Version number
 * @param {string} date - Release date (YYYY-MM-DD)
 * @param {string|object} changes - Changes description or categorized changes
 * @returns {string} Formatted changelog entry
 */
function generateChangelogEntry(version, date, changes) {
  let entry = `## [${version}] - ${date}\n\n`;

  if (typeof changes === 'string') {
    entry += `${changes}\n`;
  } else if (typeof changes === 'object') {
    // Categorized changes
    if (changes.added && changes.added.length > 0) {
      entry += `### Added\n`;
      changes.added.forEach(item => {
        entry += `- ${item}\n`;
      });
      entry += `\n`;
    }

    if (changes.changed && changes.changed.length > 0) {
      entry += `### Changed\n`;
      changes.changed.forEach(item => {
        entry += `- ${item}\n`;
      });
      entry += `\n`;
    }

    if (changes.deprecated && changes.deprecated.length > 0) {
      entry += `### Deprecated\n`;
      changes.deprecated.forEach(item => {
        entry += `- ${item}\n`;
      });
      entry += `\n`;
    }

    if (changes.removed && changes.removed.length > 0) {
      entry += `### Removed\n`;
      changes.removed.forEach(item => {
        entry += `- ${item}\n`;
      });
      entry += `\n`;
    }

    if (changes.fixed && changes.fixed.length > 0) {
      entry += `### Fixed\n`;
      changes.fixed.forEach(item => {
        entry += `- ${item}\n`;
      });
      entry += `\n`;
    }

    if (changes.security && changes.security.length > 0) {
      entry += `### Security\n`;
      changes.security.forEach(item => {
        entry += `- ${item}\n`;
      });
      entry += `\n`;
    }
  } else {
    // Default template
    entry += `### Added\n`;
    entry += `- New features\n\n`;
    entry += `### Changed\n`;
    entry += `- Updates and improvements\n\n`;
    entry += `### Fixed\n`;
    entry += `- Bug fixes\n`;
  }

  return entry;
}

/**
 * Update version in plugin.json
 * @param {string} pluginJsonPath - Path to plugin.json
 * @param {string} newVersion - New version to set
 * @returns {object} Update result with old and new versions
 */
function updatePluginJson(pluginJsonPath, newVersion) {
  if (!fs.existsSync(pluginJsonPath)) {
    throw new Error(`plugin.json not found: ${pluginJsonPath}`);
  }

  if (!isValidVersion(newVersion)) {
    throw new Error(`Invalid version format: ${newVersion}`);
  }

  const content = fs.readFileSync(pluginJsonPath, 'utf8');
  const pluginJson = JSON.parse(content);
  const oldVersion = pluginJson.version || '0.0.0';

  pluginJson.version = newVersion;
  const newContent = JSON.stringify(pluginJson, null, 2) + '\n';

  fs.writeFileSync(pluginJsonPath, newContent, 'utf8');

  return {
    path: pluginJsonPath,
    oldVersion,
    newVersion,
    oldContent: content,
    newContent
  };
}

/**
 * Update changelog file
 * @param {string} changelogPath - Path to CHANGELOG.md
 * @param {string} version - Version number
 * @param {string} date - Release date
 * @param {string|object} changes - Changes description
 * @returns {object} Update result
 */
function updateChangelog(changelogPath, version, date, changes) {
  const entry = generateChangelogEntry(version, date, changes);

  if (!fs.existsSync(changelogPath)) {
    // Create new changelog
    const content = `# Changelog\n\nAll notable changes to this project will be documented in this file.\n\n${entry}`;
    fs.writeFileSync(changelogPath, content, 'utf8');
    return {
      path: changelogPath,
      created: true,
      oldContent: '',
      newContent: content
    };
  }

  // Update existing changelog
  const oldContent = fs.readFileSync(changelogPath, 'utf8');

  // Insert after the header (after first \n\n)
  const headerEnd = oldContent.indexOf('\n\n') + 2;
  const newContent = oldContent.slice(0, headerEnd) + entry + '\n' + oldContent.slice(headerEnd);

  fs.writeFileSync(changelogPath, newContent, 'utf8');

  return {
    path: changelogPath,
    created: false,
    oldContent,
    newContent
  };
}

/**
 * Find plugin.json in plugin directory
 * @param {string} pluginDir - Plugin directory path
 * @returns {string} Path to plugin.json
 */
function findPluginJson(pluginDir) {
  const claudePluginPath = path.join(pluginDir, '.claude-plugin', 'plugin.json');
  const rootPath = path.join(pluginDir, 'plugin.json');

  if (fs.existsSync(claudePluginPath)) {
    return claudePluginPath;
  } else if (fs.existsSync(rootPath)) {
    return rootPath;
  } else {
    throw new Error('plugin.json not found');
  }
}

/**
 * Get current version from plugin directory
 * @param {string} pluginDir - Plugin directory path
 * @returns {string} Current version
 */
function getCurrentVersion(pluginDir) {
  const pluginJsonPath = findPluginJson(pluginDir);
  const pluginJson = JSON.parse(fs.readFileSync(pluginJsonPath, 'utf8'));
  return pluginJson.version || '0.0.0';
}

/**
 * Validate version sequence (new version should be greater than old)
 * @param {string} oldVersion - Current version
 * @param {string} newVersion - New version
 * @param {object} options - Validation options
 * @returns {boolean} True if valid sequence
 */
function validateVersionSequence(oldVersion, newVersion, options = {}) {
  const comparison = compareVersions(newVersion, oldVersion);

  if (comparison === null) {
    throw new Error(`Invalid version format: ${oldVersion} or ${newVersion}`);
  }

  if (comparison === 0) {
    throw new Error(`Version ${newVersion} is the same as current ${oldVersion}`);
  }

  // Check for pre-release downgrade (from release to pre-release)
  if (!isPrerelease(oldVersion) && isPrerelease(newVersion)) {
    // Base versions must be different
    const oldBase = oldVersion.replace(/-.*$/, '');
    const newBase = newVersion.replace(/-.*$/, '');

    if (oldBase === newBase && !options.force) {
      throw new Error(`Cannot downgrade from release to pre-release without version bump`);
    }
  }

  if (comparison < 0) {
    if (!options.allowDowngrade && !options.force) {
      throw new Error(`Version ${newVersion} is less than current ${oldVersion}`);
    }
  }

  return true;
}

/**
 * Parse git commit message for conventional commit format
 * @param {string} message - Commit message
 * @returns {object} Parsed commit info
 */
function parseConventionalCommit(message) {
  if (!message || typeof message !== 'string') {
    return null;
  }

  // Match: type(scope): subject
  const match = message.match(/^(feat|fix|docs|style|refactor|perf|test|chore|build|ci)(\([^)]+\))?: (.+)$/);

  if (!match) {
    return {
      type: 'other',
      scope: null,
      subject: message.trim(),
      breaking: message.includes('BREAKING CHANGE')
    };
  }

  return {
    type: match[1],
    scope: match[2] ? match[2].slice(1, -1) : null,
    subject: match[3],
    breaking: message.includes('BREAKING CHANGE')
  };
}

/**
 * Categorize commits for changelog
 * @param {array} commits - Array of commit messages
 * @returns {object} Categorized changes
 */
function categorizeCommits(commits) {
  const categories = {
    added: [],
    changed: [],
    deprecated: [],
    removed: [],
    fixed: [],
    security: [],
    breaking: []
  };

  if (!Array.isArray(commits)) {
    return categories;
  }

  commits.forEach(message => {
    const parsed = parseConventionalCommit(message);
    if (!parsed) return;

    const item = parsed.subject;

    if (parsed.breaking) {
      categories.breaking.push(item);
    }

    switch (parsed.type) {
      case 'feat':
        categories.added.push(item);
        break;
      case 'fix':
        categories.fixed.push(item);
        break;
      case 'docs':
      case 'style':
      case 'refactor':
      case 'perf':
        categories.changed.push(item);
        break;
      case 'chore':
        if (item.toLowerCase().includes('deprecat')) {
          categories.deprecated.push(item);
        } else if (item.toLowerCase().includes('remove')) {
          categories.removed.push(item);
        } else {
          categories.changed.push(item);
        }
        break;
    }
  });

  return categories;
}

// Public API
module.exports = {
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
};
