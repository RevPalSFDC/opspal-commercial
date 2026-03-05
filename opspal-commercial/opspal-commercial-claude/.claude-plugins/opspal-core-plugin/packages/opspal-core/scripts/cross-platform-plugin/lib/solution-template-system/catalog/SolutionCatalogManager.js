/**
 * SolutionCatalogManager.js
 *
 * Manages the solution catalog for publishing, discovering, and installing
 * solution templates across plugin installations. Supports browsing, searching,
 * filtering, and synchronization with the shared repository.
 *
 * @module solution-template-system/catalog/SolutionCatalogManager
 */

'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Manages solution catalog operations
 */
class SolutionCatalogManager {
  constructor(options = {}) {
    // Determine plugin root - supports both installed plugin and repo development
    const pluginRoot = options.pluginRoot ||
      process.env.CLAUDE_PLUGIN_ROOT ||
      path.resolve(__dirname, '../../../..');

    // Repository root (parent of .claude-plugins)
    const repoRoot = options.repoRoot ||
      path.resolve(pluginRoot, '../..');

    this.options = {
      // Catalog at repo root (shared)
      catalogPath: options.catalogPath || path.join(repoRoot, 'solution-catalog.json'),
      sharedSolutionsDir: options.sharedSolutionsDir || path.join(repoRoot, 'solutions'),

      // Local directories (plugin level)
      localTemplatesDir: options.localTemplatesDir || path.join(pluginRoot, 'solutions/templates'),
      installedDir: options.installedDir || path.join(pluginRoot, 'solutions/installed'),

      // Repository info
      repositoryUrl: options.repositoryUrl || 'https://github.com/RevPalSFDC/opspal-plugin-internal-marketplace',

      verbose: options.verbose || false,
      ...options
    };

    this.catalog = null;
    this.searchIndex = null;
  }

  /**
   * Load the solution catalog from file
   * @returns {Object} Loaded catalog
   */
  async loadCatalog() {
    if (!fs.existsSync(this.options.catalogPath)) {
      // Return empty catalog if none exists
      this.catalog = {
        version: '1.0.0',
        updated: new Date().toISOString(),
        solutions: []
      };
      return this.catalog;
    }

    const content = fs.readFileSync(this.options.catalogPath, 'utf-8');
    this.catalog = JSON.parse(content);

    // Build search index
    this._buildSearchIndex();

    return this.catalog;
  }

  /**
   * Save the catalog to file
   */
  async saveCatalog() {
    if (!this.catalog) {
      throw new Error('No catalog loaded');
    }

    this.catalog.updated = new Date().toISOString();

    const content = JSON.stringify(this.catalog, null, 2);
    fs.writeFileSync(this.options.catalogPath, content, 'utf-8');

    if (this.options.verbose) {
      console.log(`Catalog saved to ${this.options.catalogPath}`);
    }
  }

  /**
   * Build search index for full-text search
   * @private
   */
  _buildSearchIndex() {
    this.searchIndex = new Map();

    for (const solution of this.catalog.solutions) {
      const searchableText = [
        solution.name,
        solution.description,
        ...(solution.tags || []),
        ...(solution.platforms || []),
        solution.author || ''
      ].join(' ').toLowerCase();

      this.searchIndex.set(solution.name, searchableText);
    }
  }

  /**
   * List all solutions in the catalog
   * @returns {Array} Array of solution summaries
   */
  listSolutions() {
    if (!this.catalog) {
      throw new Error('Catalog not loaded. Call loadCatalog() first.');
    }

    return this.catalog.solutions.map(s => ({
      name: s.name,
      version: s.version,
      description: s.description,
      platforms: s.platforms,
      tags: s.tags,
      complexity: s.complexity,
      author: s.author
    }));
  }

  /**
   * Search solutions by text query
   * @param {string} query - Search query
   * @returns {Array} Matching solutions
   */
  searchSolutions(query) {
    if (!this.catalog) {
      throw new Error('Catalog not loaded. Call loadCatalog() first.');
    }

    const queryLower = query.toLowerCase();
    const results = [];

    for (const solution of this.catalog.solutions) {
      const searchableText = this.searchIndex.get(solution.name);

      if (searchableText.includes(queryLower)) {
        // Calculate relevance score
        let score = 0;
        if (solution.name.toLowerCase().includes(queryLower)) score += 10;
        if (solution.description.toLowerCase().includes(queryLower)) score += 5;
        if ((solution.tags || []).some(t => t.toLowerCase().includes(queryLower))) score += 3;

        results.push({ solution, score });
      }
    }

    // Sort by relevance
    results.sort((a, b) => b.score - a.score);

    return results.map(r => r.solution);
  }

  /**
   * Filter solutions by platform
   * @param {string} platform - Platform name (salesforce, hubspot, n8n)
   * @returns {Array} Matching solutions
   */
  filterByPlatform(platform) {
    if (!this.catalog) {
      throw new Error('Catalog not loaded. Call loadCatalog() first.');
    }

    const platformLower = platform.toLowerCase();

    return this.catalog.solutions.filter(s =>
      (s.platforms || []).some(p => p.toLowerCase() === platformLower)
    );
  }

  /**
   * Filter solutions by tag
   * @param {string} tag - Tag to filter by
   * @returns {Array} Matching solutions
   */
  filterByTag(tag) {
    if (!this.catalog) {
      throw new Error('Catalog not loaded. Call loadCatalog() first.');
    }

    const tagLower = tag.toLowerCase();

    return this.catalog.solutions.filter(s =>
      (s.tags || []).some(t => t.toLowerCase() === tagLower)
    );
  }

  /**
   * Filter solutions by complexity
   * @param {string} complexity - Complexity level (simple, moderate, complex)
   * @returns {Array} Matching solutions
   */
  filterByComplexity(complexity) {
    if (!this.catalog) {
      throw new Error('Catalog not loaded. Call loadCatalog() first.');
    }

    return this.catalog.solutions.filter(s =>
      s.complexity?.toLowerCase() === complexity.toLowerCase()
    );
  }

  /**
   * Get full details for a specific solution
   * @param {string} solutionName - Solution name
   * @returns {Object} Full solution details including manifest
   */
  async getSolutionDetails(solutionName) {
    if (!this.catalog) {
      await this.loadCatalog();
    }

    const catalogEntry = this.catalog.solutions.find(
      s => s.name.toLowerCase() === solutionName.toLowerCase()
    );

    if (!catalogEntry) {
      throw new Error(`Solution not found: ${solutionName}`);
    }

    // Load full solution.json from shared solutions directory
    const solutionPath = path.join(this.options.sharedSolutionsDir, solutionName, 'solution.json');

    if (!fs.existsSync(solutionPath)) {
      // Return catalog entry only if solution files not available locally
      return {
        catalogEntry,
        manifest: null,
        isLocal: false
      };
    }

    const content = fs.readFileSync(solutionPath, 'utf-8');
    const manifest = JSON.parse(content);

    return {
      catalogEntry,
      manifest,
      isLocal: true,
      solutionPath: path.dirname(solutionPath)
    };
  }

  /**
   * Publish a solution to the catalog
   * @param {string} localSolutionPath - Path to local solution directory
   * @param {Object} options - Publishing options
   * @returns {Object} Publication result
   */
  async publishSolution(localSolutionPath, options = {}) {
    // Load the solution manifest
    const manifestPath = path.join(localSolutionPath, 'solution.json');

    if (!fs.existsSync(manifestPath)) {
      throw new Error(`Solution manifest not found: ${manifestPath}`);
    }

    const content = fs.readFileSync(manifestPath, 'utf-8');
    const manifest = JSON.parse(content);

    // Validate manifest has required fields
    const requiredFields = ['name', 'version', 'description', 'components'];
    for (const field of requiredFields) {
      if (!manifest[field]) {
        throw new Error(`Solution manifest missing required field: ${field}`);
      }
    }

    // Load catalog if not already loaded
    if (!this.catalog) {
      await this.loadCatalog();
    }

    // Check if solution already exists
    const existingIndex = this.catalog.solutions.findIndex(
      s => s.name === manifest.name
    );

    // Create catalog entry
    const catalogEntry = {
      name: manifest.name,
      version: manifest.version,
      description: manifest.description,
      path: `./solutions/${manifest.name}`,
      platforms: Object.keys(manifest.platforms || {}),
      tags: manifest.metadata?.tags || [],
      complexity: manifest.metadata?.complexity || 'moderate',
      author: manifest.metadata?.author || options.author || 'Unknown',
      published: new Date().toISOString().split('T')[0],
      downloads: existingIndex >= 0 ? this.catalog.solutions[existingIndex].downloads : 0,
      componentCount: (manifest.components || []).length,
      parameterCount: Object.keys(manifest.parameters || {}).length
    };

    // Add platform-specific metadata
    if (manifest.platforms?.salesforce) {
      catalogEntry.requiredFeatures = manifest.platforms.salesforce.requiredFeatures;
      catalogEntry.minApiVersion = manifest.platforms.salesforce.minApiVersion;
    }

    // Copy solution files to shared solutions directory
    const targetDir = path.join(this.options.sharedSolutionsDir, manifest.name);
    await this._copyDirectory(localSolutionPath, targetDir);

    // Update catalog
    if (existingIndex >= 0) {
      this.catalog.solutions[existingIndex] = catalogEntry;
    } else {
      this.catalog.solutions.push(catalogEntry);
    }

    // Save catalog
    await this.saveCatalog();

    // Rebuild search index
    this._buildSearchIndex();

    return {
      success: true,
      action: existingIndex >= 0 ? 'updated' : 'created',
      catalogEntry,
      targetPath: targetDir
    };
  }

  /**
   * Install a solution from the catalog to local installed directory
   * @param {string} solutionName - Solution name
   * @param {Object} options - Installation options
   * @returns {Object} Installation result
   */
  async installSolution(solutionName, options = {}) {
    // Get solution details
    const details = await this.getSolutionDetails(solutionName);

    if (!details.catalogEntry) {
      throw new Error(`Solution not found in catalog: ${solutionName}`);
    }

    // Source path (from shared solutions directory)
    const sourcePath = path.join(this.options.sharedSolutionsDir, solutionName);

    if (!fs.existsSync(sourcePath)) {
      throw new Error(
        `Solution files not available locally. Sync the repository first.\n` +
        `Repository: ${this.options.repositoryUrl}`
      );
    }

    // Target path (local installed directory)
    const targetPath = path.join(this.options.installedDir, solutionName);

    // Check if already installed
    if (fs.existsSync(targetPath) && !options.force) {
      const existingManifest = JSON.parse(
        fs.readFileSync(path.join(targetPath, 'solution.json'), 'utf-8')
      );

      if (existingManifest.version === details.catalogEntry.version) {
        return {
          success: true,
          action: 'already_installed',
          version: existingManifest.version,
          installedPath: targetPath
        };
      }
    }

    // Copy solution files
    await this._copyDirectory(sourcePath, targetPath);

    // Increment download count
    const catalogEntry = this.catalog.solutions.find(s => s.name === solutionName);
    if (catalogEntry) {
      catalogEntry.downloads = (catalogEntry.downloads || 0) + 1;
      await this.saveCatalog();
    }

    return {
      success: true,
      action: 'installed',
      version: details.catalogEntry.version,
      installedPath: targetPath,
      parameters: details.manifest?.parameters || {}
    };
  }

  /**
   * Check if a solution is installed locally
   * @param {string} solutionName - Solution name
   * @returns {Object} Installation status
   */
  isInstalled(solutionName) {
    const installedPath = path.join(this.options.installedDir, solutionName);
    const manifestPath = path.join(installedPath, 'solution.json');

    if (!fs.existsSync(manifestPath)) {
      return { installed: false };
    }

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

    return {
      installed: true,
      version: manifest.version,
      path: installedPath
    };
  }

  /**
   * Get all installed solutions
   * @returns {Array} List of installed solutions
   */
  getInstalledSolutions() {
    if (!fs.existsSync(this.options.installedDir)) {
      return [];
    }

    const installed = [];
    const dirs = fs.readdirSync(this.options.installedDir, { withFileTypes: true });

    for (const dir of dirs) {
      if (!dir.isDirectory()) continue;

      const manifestPath = path.join(this.options.installedDir, dir.name, 'solution.json');

      if (fs.existsSync(manifestPath)) {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
        installed.push({
          name: manifest.name,
          version: manifest.version,
          description: manifest.description,
          path: path.join(this.options.installedDir, dir.name)
        });
      }
    }

    return installed;
  }

  /**
   * Sync catalog with remote repository
   * @returns {Object} Sync result
   */
  async syncCatalog() {
    // This would typically involve git pull or API fetch
    // For now, just reload the catalog from disk
    await this.loadCatalog();

    return {
      success: true,
      solutionCount: this.catalog.solutions.length,
      lastUpdated: this.catalog.updated
    };
  }

  /**
   * Get catalog statistics
   * @returns {Object} Catalog stats
   */
  getStats() {
    if (!this.catalog) {
      throw new Error('Catalog not loaded. Call loadCatalog() first.');
    }

    const platforms = new Set();
    const tags = new Set();
    let totalDownloads = 0;

    for (const solution of this.catalog.solutions) {
      (solution.platforms || []).forEach(p => platforms.add(p));
      (solution.tags || []).forEach(t => tags.add(t));
      totalDownloads += solution.downloads || 0;
    }

    const complexityCounts = {
      simple: this.filterByComplexity('simple').length,
      moderate: this.filterByComplexity('moderate').length,
      complex: this.filterByComplexity('complex').length
    };

    return {
      totalSolutions: this.catalog.solutions.length,
      platforms: Array.from(platforms),
      tags: Array.from(tags),
      totalDownloads,
      complexityCounts,
      lastUpdated: this.catalog.updated
    };
  }

  /**
   * Format solution list for display
   * @param {Array} solutions - Solutions to format
   * @param {Object} options - Formatting options
   * @returns {string} Formatted output
   */
  formatSolutionList(solutions, options = {}) {
    if (solutions.length === 0) {
      return 'No solutions found.';
    }

    const lines = [];

    // Header
    lines.push(`Solution Catalog (${solutions.length} solution${solutions.length !== 1 ? 's' : ''})`);
    lines.push('');
    lines.push('Name                  Version  Platform     Complexity  Tags');
    lines.push('─'.repeat(68));

    // Solutions
    for (const s of solutions) {
      const name = (s.name || '').padEnd(20).slice(0, 20);
      const version = (s.version || '').padEnd(7).slice(0, 7);
      const platform = ((s.platforms || []).join(',') || '').padEnd(11).slice(0, 11);
      const complexity = (s.complexity || '').padEnd(10).slice(0, 10);
      const tags = (s.tags || []).slice(0, 3).join(', ');

      lines.push(`${name}  ${version}  ${platform}  ${complexity}  ${tags}`);
    }

    return lines.join('\n');
  }

  /**
   * Format solution details for display
   * @param {Object} details - Solution details from getSolutionDetails
   * @returns {string} Formatted output
   */
  formatSolutionDetails(details) {
    const { catalogEntry, manifest } = details;
    const lines = [];

    lines.push(`Solution: ${catalogEntry.name} (v${catalogEntry.version})`);
    lines.push('─'.repeat(40));
    lines.push('');
    lines.push('Description:');
    lines.push(`  ${catalogEntry.description}`);
    lines.push('');
    lines.push(`Platforms: ${(catalogEntry.platforms || []).join(', ')}`);
    lines.push(`Complexity: ${catalogEntry.complexity || 'Unknown'}`);
    lines.push(`Author: ${catalogEntry.author || 'Unknown'}`);
    lines.push(`Published: ${catalogEntry.published || 'Unknown'}`);
    lines.push(`Downloads: ${catalogEntry.downloads || 0}`);

    if (manifest) {
      // Components
      lines.push('');
      lines.push(`Components (${(manifest.components || []).length}):`);
      for (const comp of manifest.components || []) {
        lines.push(`  • ${comp.id} (${comp.type})`);
      }

      // Parameters
      const params = Object.entries(manifest.parameters || {});
      lines.push('');
      lines.push(`Parameters (${params.length}):`);
      for (const [name, config] of params) {
        const required = config.required ? 'REQUIRED' : `default: ${config.default}`;
        lines.push(`  • ${name} (${config.type}) - ${required}`);
      }

      // Prerequisites
      if (manifest.preDeployChecks?.length > 0) {
        lines.push('');
        lines.push('Prerequisites:');
        for (const check of manifest.preDeployChecks) {
          lines.push(`  • ${check.message}`);
        }
      }
    }

    return lines.join('\n');
  }

  /**
   * Copy a directory recursively
   * @private
   */
  async _copyDirectory(src, dest) {
    // Create destination directory
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }

    const entries = fs.readdirSync(src, { withFileTypes: true });

    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);

      if (entry.isDirectory()) {
        await this._copyDirectory(srcPath, destPath);
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
    }
  }
}

module.exports = SolutionCatalogManager;
