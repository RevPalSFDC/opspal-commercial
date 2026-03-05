#!/usr/bin/env node

/**
 * Runbook Versioner
 *
 * Platform-agnostic semantic versioning for runbooks.
 * Creates versioned snapshots with automatic version bump detection.
 *
 * Features:
 * - Semantic versioning (MAJOR.MINOR.PATCH)
 * - Automatic version bump detection based on content changes
 * - Version index tracking with metadata
 * - Timestamped snapshots
 * - Automatic cleanup of old versions (keeps last 30)
 *
 * Version Bump Logic:
 * - MAJOR: Breaking changes (10+ objects changed, major reorg)
 * - MINOR: New features (new workflows, objects, exceptions)
 * - PATCH: Updates (metrics changes, minor edits, same structure)
 *
 * @module runbook-framework/core/versioner
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/**
 * Semantic version object
 */
class Version {
  constructor(major, minor, patch) {
    this.major = major;
    this.minor = minor;
    this.patch = patch;
  }

  toString() {
    return `${this.major}.${this.minor}.${this.patch}`;
  }

  static parse(versionString) {
    const match = versionString.match(/^v?(\d+)\.(\d+)\.(\d+)$/);
    if (!match) {
      throw new Error(`Invalid version string: ${versionString}`);
    }
    return new Version(
      parseInt(match[1], 10),
      parseInt(match[2], 10),
      parseInt(match[3], 10)
    );
  }

  bumpMajor() {
    return new Version(this.major + 1, 0, 0);
  }

  bumpMinor() {
    return new Version(this.major, this.minor + 1, 0);
  }

  bumpPatch() {
    return new Version(this.major, this.minor, this.patch + 1);
  }
}

/**
 * Runbook Versioner - manages version history for runbooks
 */
class RunbookVersioner {
  /**
   * Create a new versioner instance
   * @param {Object} adapter - Platform adapter instance
   */
  constructor(adapter) {
    this.adapter = adapter;
    this.maxVersions = 30;
  }

  /**
   * Get the version index path
   * @returns {string} Path to VERSION_INDEX.json
   */
  getIndexPath() {
    return path.join(this.adapter.getRunbookHistoryDir(), 'VERSION_INDEX.json');
  }

  /**
   * Calculate SHA-256 hash of content
   * @param {string} content - Content to hash
   * @returns {string} Hex digest
   */
  calculateHash(content) {
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  /**
   * Load version index from disk
   * @returns {Object} Version index object
   */
  loadVersionIndex() {
    const indexPath = this.getIndexPath();

    if (!fs.existsSync(indexPath)) {
      return {
        platform: this.adapter.platform,
        identifier: this.adapter.getInstanceIdentifier(),
        current_version: null,
        versions: []
      };
    }

    try {
      return JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
    } catch (err) {
      console.warn(`Failed to parse VERSION_INDEX.json: ${err.message}`);
      return {
        platform: this.adapter.platform,
        identifier: this.adapter.getInstanceIdentifier(),
        current_version: null,
        versions: []
      };
    }
  }

  /**
   * Save version index to disk
   * @param {Object} index - Version index object
   */
  saveVersionIndex(index) {
    const historyDir = this.adapter.getRunbookHistoryDir();
    this.adapter.ensureInstancePath('runbook-history');

    const indexPath = path.join(historyDir, 'VERSION_INDEX.json');
    fs.writeFileSync(indexPath, JSON.stringify(index, null, 2), 'utf-8');
  }

  /**
   * Detect version bump type by comparing content
   * @param {string} previousContent - Previous runbook content
   * @param {string} currentContent - Current runbook content
   * @returns {string} Bump type: 'major', 'minor', or 'patch'
   */
  detectBumpType(previousContent, currentContent) {
    if (!previousContent) {
      return 'minor'; // First version
    }

    // Extract section counts for comparison
    const extractSections = (content) => {
      return {
        workflows: (content.match(/### .* \(workflow\)/gi) || []).length,
        objects: (content.match(/### .* \(object\)/gi) || []).length,
        exceptions: (content.match(/### .* \(exception\)/gi) || []).length,
        integrations: (content.match(/### .* \(integration\)/gi) || []).length,
        h2Sections: (content.match(/^## /gm) || []).length,
        h3Sections: (content.match(/^### /gm) || []).length
      };
    };

    const prev = extractSections(previousContent);
    const curr = extractSections(currentContent);

    // Check for major structural changes
    const hasBreakingChange = (
      Math.abs(prev.workflows - curr.workflows) > 5 ||
      Math.abs(prev.objects - curr.objects) > 10 ||
      Math.abs(prev.h2Sections - curr.h2Sections) > 3
    );

    if (hasBreakingChange) {
      return 'major';
    }

    // Check for new features
    const hasNewFeatures = (
      curr.workflows > prev.workflows ||
      curr.objects > prev.objects ||
      curr.exceptions > prev.exceptions ||
      curr.integrations > prev.integrations ||
      curr.h2Sections > prev.h2Sections
    );

    if (hasNewFeatures) {
      return 'minor';
    }

    // Default to patch for minor updates
    return 'patch';
  }

  /**
   * Create a versioned snapshot of the current runbook
   * @param {Object} [options] - Snapshot options
   * @param {string} [options.version] - Explicit version (e.g., '2.0.0')
   * @param {string} [options.bumpType] - Force bump type: 'major', 'minor', 'patch'
   * @param {string} [options.notes] - Version notes
   * @param {boolean} [options.force] - Create snapshot even if no changes
   * @returns {Object} Snapshot result
   */
  createSnapshot(options = {}) {
    const historyDir = this.adapter.getRunbookHistoryDir();
    const runbookPath = this.adapter.getRunbookPath();

    // Ensure history directory exists
    this.adapter.ensureInstancePath('runbook-history');

    // Load current runbook
    if (!fs.existsSync(runbookPath)) {
      throw new Error(`Runbook not found: ${runbookPath}`);
    }

    const currentContent = fs.readFileSync(runbookPath, 'utf-8');
    const currentHash = this.calculateHash(currentContent);

    // Load version index
    const index = this.loadVersionIndex();

    // Check if content has changed
    if (index.current_version) {
      const lastVersion = index.versions.find(v => v.version === index.current_version);
      if (lastVersion && lastVersion.hash === currentHash) {
        if (!options.force) {
          return {
            action: 'skipped',
            reason: 'No changes detected',
            version: index.current_version
          };
        }
      }
    }

    // Determine new version
    let newVersion;
    if (options.version) {
      // Manual version specified
      newVersion = Version.parse(options.version);
    } else if (index.current_version) {
      // Auto-detect bump type
      const previousVersionEntry = index.versions.find(v => v.version === index.current_version);
      const previousContent = previousVersionEntry
        ? fs.readFileSync(path.join(historyDir, previousVersionEntry.filename), 'utf-8')
        : null;

      const bumpType = options.bumpType || this.detectBumpType(previousContent, currentContent);
      const currentVersion = Version.parse(index.current_version);

      switch (bumpType) {
        case 'major':
          newVersion = currentVersion.bumpMajor();
          break;
        case 'minor':
          newVersion = currentVersion.bumpMinor();
          break;
        case 'patch':
        default:
          newVersion = currentVersion.bumpPatch();
          break;
      }
    } else {
      // First version
      newVersion = new Version(1, 0, 0);
    }

    // Create snapshot filename
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('.')[0];
    const filename = `RUNBOOK-v${newVersion.toString()}-${timestamp}.md`;
    const snapshotPath = path.join(historyDir, filename);

    // Copy runbook to snapshot
    fs.copyFileSync(runbookPath, snapshotPath);

    // Update version index
    const versionEntry = {
      version: `v${newVersion.toString()}`,
      filename,
      timestamp: new Date().toISOString(),
      hash: currentHash,
      size: fs.statSync(snapshotPath).size,
      platform: this.adapter.platform,
      identifier: this.adapter.getInstanceIdentifier(),
      notes: options.notes || null
    };

    index.versions.push(versionEntry);
    index.current_version = versionEntry.version;

    // Cleanup old versions (keep last N)
    if (index.versions.length > this.maxVersions) {
      const toRemove = index.versions.slice(0, index.versions.length - this.maxVersions);
      toRemove.forEach(v => {
        const oldPath = path.join(historyDir, v.filename);
        if (fs.existsSync(oldPath)) {
          fs.unlinkSync(oldPath);
        }
      });
      index.versions = index.versions.slice(-this.maxVersions);
    }

    // Save updated index
    this.saveVersionIndex(index);

    return {
      action: 'created',
      version: versionEntry.version,
      filename,
      path: snapshotPath,
      previousVersion: index.versions.length > 1
        ? index.versions[index.versions.length - 2].version
        : null
    };
  }

  /**
   * List all versions
   * @returns {Object} Version index
   */
  listVersions() {
    return this.loadVersionIndex();
  }

  /**
   * Get path to a specific version
   * @param {string} version - Version string (e.g., 'v1.2.0')
   * @returns {string|null} Path to version file or null if not found
   */
  getVersionPath(version) {
    const index = this.loadVersionIndex();
    const versionEntry = index.versions.find(v => v.version === version);

    if (!versionEntry) {
      return null;
    }

    return path.join(this.adapter.getRunbookHistoryDir(), versionEntry.filename);
  }

  /**
   * Get content of a specific version
   * @param {string} version - Version string
   * @returns {string|null} Version content or null if not found
   */
  getVersionContent(version) {
    const versionPath = this.getVersionPath(version);

    if (!versionPath || !fs.existsSync(versionPath)) {
      return null;
    }

    return fs.readFileSync(versionPath, 'utf-8');
  }

  /**
   * Get the current version string
   * @returns {string|null} Current version or null if none
   */
  getCurrentVersion() {
    const index = this.loadVersionIndex();
    return index.current_version;
  }

  /**
   * Get the previous version string
   * @returns {string|null} Previous version or null if none
   */
  getPreviousVersion() {
    const index = this.loadVersionIndex();
    if (index.versions.length < 2) {
      return null;
    }
    return index.versions[index.versions.length - 2].version;
  }
}

// Export
module.exports = RunbookVersioner;

// Also export Version class for direct use
module.exports.Version = Version;
