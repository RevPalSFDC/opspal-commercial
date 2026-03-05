#!/usr/bin/env node

/**
 * Filesystem Migration Script: System-Centric to Client-Centric Architecture
 *
 * Migrates from: instances/{platform}/{instance}/
 * To: orgs/{org_slug}/platforms/{platform}/{instance}/
 *
 * USAGE:
 *   node scripts/migrate-to-client-centric.js [options]
 *
 * OPTIONS:
 *   --dry-run           Show what would be migrated without making changes
 *   --only-org <slug>   Only migrate a specific organization
 *   --write-report      Generate detailed migration report
 *   --create-backups    Create .backup/ copies before moving
 *   --create-symlinks   Create backward-compatibility symlinks
 *   --mapping <path>    Path to instance-mappings.yaml (default: config/instance-mappings.yaml)
 *   --verbose           Enable verbose logging
 *   --help              Show help
 *
 * PHASES:
 *   1. Discovery    - Scan all instance locations, build inventory
 *   2. Validation   - Validate mapping file, detect conflicts
 *   3. Scaffolding  - Create target directory structure
 *   4. Migration    - Copy files with classification
 *   5. Metadata     - Generate org.yaml and instance.yaml files
 *   6. Symlinks     - Create backward-compatibility symlinks (optional)
 *   7. Report       - Generate migration report
 *
 * EXIT CODES:
 *   0 - Success
 *   1 - Error (validation failed, migration error)
 *   2 - Dry run completed (no changes made)
 *   3 - Partial success (some files skipped)
 */

const fs = require('fs');
const path = require('path');

// Check for yaml dependency
let yaml;
try {
  yaml = require('js-yaml');
} catch (e) {
  console.error('❌ Missing dependency: js-yaml');
  console.error('   Run: npm install js-yaml');
  process.exit(1);
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  DEFAULT_MAPPING_PATH: 'config/instance-mappings.yaml',
  TARGET_ROOT: 'orgs',
  BACKUP_DIR: '.migration-backup',
  REPORT_DIR: 'reports/migration',
  LOG_FILE: '.migration-log.json',

  // File patterns to always skip
  SKIP_PATTERNS: [
    'node_modules',
    '.git',
    '.DS_Store',
    'Thumbs.db',
    '*.tmp',
    '*.bak'
  ],

  // Directories to skip when scanning instances (not real client data)
  SKIP_INSTANCE_NAMES: [
    'salesforce',  // Generic platform folder, not a client
    'hubspot',
    'marketo',
    '.metadata-cache',
    '_templates',
    '_examples'
  ],

  // Schema versions
  ORG_SCHEMA_VERSION: '1.0.0',
  INSTANCE_SCHEMA_VERSION: '1.0.0',
  MAPPING_SCHEMA_VERSION: '1.0.0'
};

// ============================================================================
// CLASSES
// ============================================================================

class MigrationLogger {
  constructor(verbose = false) {
    this.verbose = verbose;
    this.entries = [];
  }

  info(msg) { this._log('INFO', msg); }
  warn(msg) { this._log('WARN', msg); }
  error(msg) { this._log('ERROR', msg); }
  debug(msg) { if (this.verbose) this._log('DEBUG', msg); }
  success(msg) { this._log('SUCCESS', msg); }

  _log(level, msg) {
    const entry = { timestamp: new Date().toISOString(), level, message: msg };
    this.entries.push(entry);
    const prefix = {
      INFO: '  ',
      WARN: '⚠️  ',
      ERROR: '❌ ',
      DEBUG: '🔍 ',
      SUCCESS: '✅ '
    }[level] || '  ';
    console.log(`${prefix}${msg}`);
  }

  getEntries() { return this.entries; }
}

class DiscoveryEngine {
  constructor(rootDir, logger) {
    this.rootDir = rootDir;
    this.logger = logger;
    this.inventory = { orgs: {}, files: [], conflicts: [] };
  }

  /**
   * Scan all known instance locations and build inventory
   */
  async discover() {
    this.logger.info('Phase 1: Discovery - Scanning instance locations...');

    // Extended list of locations to scan for stragglers
    const locations = [
      // Root-level instances (legacy structure)
      { path: 'instances', type: 'root' },
      { path: 'instances/salesforce', type: 'root-salesforce' },
      { path: 'instances/hubspot', type: 'root-hubspot' },
      { path: 'instances/marketo', type: 'root-marketo' },

      // Plugin instances directories (symlinked or direct)
      { path: 'plugins/opspal-salesforce/instances', type: 'plugin-salesforce' },
      { path: 'plugins/opspal-hubspot/instances', type: 'plugin-hubspot' },
      { path: 'plugins/opspal-hubspot/portals', type: 'plugin-hubspot' },
      { path: 'plugins/opspal-marketo/instances', type: 'plugin-marketo' },
      { path: 'plugins/opspal-marketo/portals', type: 'plugin-marketo' },

      // Claude-plugins symlink locations (if different from plugins/)
      { path: '.claude-plugins/opspal-salesforce/instances', type: 'plugin-salesforce' },
      { path: '.claude-plugins/opspal-hubspot/instances', type: 'plugin-hubspot' },
      { path: '.claude-plugins/opspal-hubspot/portals', type: 'plugin-hubspot' },
      { path: '.claude-plugins/opspal-marketo/instances', type: 'plugin-marketo' },
      { path: '.claude-plugins/instances', type: 'cross-plugin' }
    ];

    for (const loc of locations) {
      const fullPath = path.join(this.rootDir, loc.path);
      if (fs.existsSync(fullPath)) {
        this.logger.debug(`Scanning: ${loc.path}`);
        await this._scanLocation(fullPath, loc.type, loc.path);
      } else {
        this.logger.debug(`Location not found: ${loc.path}`);
      }
    }

    this._detectConflicts();
    this._summarize();

    return this.inventory;
  }

  /**
   * Find stragglers - instances that exist but haven't been migrated to orgs/
   */
  findStragglers() {
    const stragglers = {
      unmigrated: [],      // Exist in instances but not in orgs
      partiallyMigrated: [], // Some instances migrated, some not
      alreadyMigrated: []  // Already have corresponding org folder
    };

    // Get list of existing org slugs in orgs/
    const orgsPath = path.join(this.rootDir, CONFIG.TARGET_ROOT);
    const existingOrgs = new Set();
    if (fs.existsSync(orgsPath)) {
      fs.readdirSync(orgsPath, { withFileTypes: true })
        .filter(d => d.isDirectory() && !d.name.startsWith('.'))
        .forEach(d => existingOrgs.add(d.name));
    }

    // Helper to generate all reasonable variants of an org slug
    const getOrgVariants = (slug) => {
      const variants = new Set([slug]);

      // Remove numbers and common suffixes
      const cleaned = slug
        .replace(/\d+/g, '')        // Remove digits
        .replace(/-revpal$/i, '')   // Remove -revpal suffix
        .replace(/--+/g, '-')       // Clean up double hyphens
        .replace(/^-|-$/g, '');     // Trim leading/trailing hyphens

      if (cleaned) variants.add(cleaned);

      // First part of hyphenated name
      const firstPart = slug.split('-')[0];
      if (firstPart && firstPart.length >= 3) variants.add(firstPart);

      // Without hyphens
      variants.add(slug.replace(/-/g, ''));

      return [...variants];
    };

    // Check each discovered org against existing orgs
    for (const [orgSlug, orgData] of Object.entries(this.inventory.orgs)) {
      const orgExists = existingOrgs.has(orgSlug);
      const variants = getOrgVariants(orgSlug);
      const matchedVariant = variants.find(v => existingOrgs.has(v));
      const anyVariantExists = !!matchedVariant;

      if (!orgExists && !anyVariantExists) {
        stragglers.unmigrated.push({
          orgSlug,
          platforms: Object.keys(orgData.platforms),
          instances: Object.values(orgData.platforms).flatMap(p =>
            Object.entries(p.instances).map(([name, inst]) => ({
              name,
              sourcePaths: inst.sources.map(s => s.relativePath || s.path)
            }))
          ),
          sourcePaths: orgData.sources
        });
      } else if (orgExists) {
        // Check if all platforms are migrated
        const orgPath = path.join(orgsPath, orgSlug, 'platforms');
        const migratedPlatforms = new Set();
        if (fs.existsSync(orgPath)) {
          fs.readdirSync(orgPath, { withFileTypes: true })
            .filter(d => d.isDirectory())
            .forEach(d => migratedPlatforms.add(d.name));
        }

        const discoveredPlatforms = new Set(Object.keys(orgData.platforms));
        const missingPlatforms = [...discoveredPlatforms].filter(p => !migratedPlatforms.has(p));

        if (missingPlatforms.length > 0) {
          stragglers.partiallyMigrated.push({
            orgSlug,
            migratedPlatforms: [...migratedPlatforms],
            missingPlatforms,
            sourcePaths: orgData.sources
          });
        } else {
          stragglers.alreadyMigrated.push({
            orgSlug,
            platforms: [...migratedPlatforms]
          });
        }
      } else if (anyVariantExists) {
        // Variant exists but not exact match
        // Check if it's truly partially migrated or if all data is under the variant
        const variantPath = path.join(orgsPath, matchedVariant, 'platforms');
        const migratedPlatforms = new Set();
        if (fs.existsSync(variantPath)) {
          fs.readdirSync(variantPath, { withFileTypes: true })
            .filter(d => d.isDirectory())
            .forEach(d => migratedPlatforms.add(d.name));
        }

        const discoveredPlatforms = new Set(Object.keys(orgData.platforms));
        const allPlatformsMigrated = [...discoveredPlatforms].every(p => migratedPlatforms.has(p));

        if (allPlatformsMigrated) {
          stragglers.alreadyMigrated.push({
            orgSlug,
            matchedAs: matchedVariant,
            platforms: [...migratedPlatforms]
          });
        } else {
          stragglers.partiallyMigrated.push({
            orgSlug,
            matchedVariant,
            platforms: Object.keys(orgData.platforms),
            sourcePaths: orgData.sources
          });
        }
      }
    }

    return stragglers;
  }

  async _scanLocation(basePath, locationType, relativePath) {
    // For instance directories, only scan top-level directories as potential orgs
    // Don't recurse into subdirectories to avoid treating q2c-audit/, reports/, etc. as orgs
    let entries;
    try {
      entries = fs.readdirSync(basePath, { withFileTypes: true });
    } catch (e) {
      this.logger.warn(`Cannot read directory: ${basePath}`);
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(basePath, entry.name);
      const entryRelPath = entry.name;

      if (this._shouldSkip(entry.name)) continue;

      if (entry.isDirectory()) {
        // Check if this looks like an instance directory (top-level only)
        const instanceInfo = this._detectInstance(fullPath, entryRelPath, locationType, relativePath);
        if (instanceInfo) {
          this._addToInventory(instanceInfo);
          // Add files from this instance to inventory
          this._collectInstanceFiles(fullPath, entryRelPath, locationType);
        }
      }
    }
  }

  _collectInstanceFiles(basePath, relPath, locationType) {
    const collectRecursive = (dir, currentRelPath) => {
      let entries;
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch (e) {
        return;
      }

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const entryRelPath = path.join(currentRelPath, entry.name);

        if (this._shouldSkip(entry.name)) continue;

        if (entry.isDirectory()) {
          collectRecursive(fullPath, entryRelPath);
        } else if (entry.isFile()) {
          this.inventory.files.push({
            path: fullPath,
            relativePath: entryRelPath,
            locationType,
            size: fs.statSync(fullPath).size,
            modified: fs.statSync(fullPath).mtime
          });
        }
      }
    };

    collectRecursive(basePath, relPath);
  }

  _detectInstance(dirPath, relativePath, locationType, baseRelativePath) {
    // Heuristics to detect if a directory is an instance root
    const indicators = [
      'ENV_CONFIG.json',
      'RUNBOOK.md',
      'ORG_CONTEXT.json',
      'observations',
      'q2c-audit',
      'reflection'
    ];

    let contents;
    try {
      contents = fs.readdirSync(dirPath);
    } catch (e) {
      return null;
    }

    const hasIndicator = indicators.some(ind =>
      contents.some(c => c.includes(ind))
    );

    const dirName = path.basename(dirPath);

    if (hasIndicator || this._looksLikeOrgName(dirName)) {
      return {
        path: dirPath,
        relativePath: path.join(baseRelativePath, relativePath),
        locationType,
        name: dirName,
        platform: this._detectPlatform(relativePath, locationType, baseRelativePath),
        contents: contents.length
      };
    }

    return null;
  }

  _looksLikeOrgName(name) {
    // Skip known non-client directories
    if (CONFIG.SKIP_INSTANCE_NAMES.includes(name.toLowerCase())) {
      return false;
    }

    // Skip hidden directories
    if (name.startsWith('.')) {
      return false;
    }

    // Known org name patterns
    const knownPatterns = [
      /^acme-corp/i,
      /^gamma-corp/i,
      /^epsilon-corp/i,
      /^test-org/i,
      /^eta-corp/i,
      /^acme/i,
      /-production$/i,
      /-sandbox$/i,
      /-main$/i,
      /-dev$/i,
      /-staging$/i,
      /-revpal$/i,
      /-uat$/i
    ];

    // If it matches a known pattern, it's an org
    if (knownPatterns.some(p => p.test(name))) {
      return true;
    }

    // If it contains alphanumeric characters and optionally hyphens, and is at least 3 chars, likely an org
    if (/^[a-zA-Z][a-zA-Z0-9-]{2,}$/.test(name)) {
      return true;
    }

    return false;
  }

  _detectPlatform(relativePath, locationType, baseRelativePath) {
    const fullRelPath = path.join(baseRelativePath, relativePath);

    if (locationType === 'hubspot' || fullRelPath.includes('hubspot') || fullRelPath.includes('portals')) {
      return 'hubspot';
    }
    if (locationType === 'marketo' || fullRelPath.includes('marketo')) {
      return 'marketo';
    }
    if (fullRelPath.includes('salesforce') || locationType === 'plugin' || locationType === 'root') {
      return 'salesforce';
    }
    return 'salesforce'; // Default
  }

  _shouldSkip(name) {
    return CONFIG.SKIP_PATTERNS.some(pattern => {
      if (pattern.includes('*')) {
        const regex = new RegExp(pattern.replace(/\*/g, '.*'));
        return regex.test(name);
      }
      return name === pattern;
    });
  }

  _addToInventory(instanceInfo) {
    const orgSlug = this._deriveOrgSlug(instanceInfo.name);

    if (!this.inventory.orgs[orgSlug]) {
      this.inventory.orgs[orgSlug] = {
        slug: orgSlug,
        platforms: {},
        sources: []
      };
    }

    const org = this.inventory.orgs[orgSlug];
    if (!org.platforms[instanceInfo.platform]) {
      org.platforms[instanceInfo.platform] = { instances: {} };
    }

    const instanceName = this._deriveInstanceName(instanceInfo.name, orgSlug);
    const platform = org.platforms[instanceInfo.platform];

    if (!platform.instances[instanceName]) {
      platform.instances[instanceName] = {
        name: instanceName,
        sources: []
      };
    }

    platform.instances[instanceName].sources.push(instanceInfo);
    org.sources.push(instanceInfo.path);
  }

  _deriveOrgSlug(name) {
    // Extract org slug from instance name
    // acme-production -> acme-corp
    // gamma-corp -> gamma-corp
    // test-org -> test-org

    const parts = name.split('-');
    const envSuffixes = ['production', 'sandbox', 'main', 'dev', 'test', 'staging', 'uat'];

    // Remove environment suffix
    if (envSuffixes.includes(parts[parts.length - 1])) {
      parts.pop();
    }

    return parts.join('-') || name;
  }

  _deriveInstanceName(name, orgSlug) {
    // Extract instance name
    // acme-production -> production
    // acme-corp -> default

    if (name === orgSlug) return 'default';

    const suffix = name.replace(new RegExp(`^${orgSlug}-?`), '');
    return suffix || 'default';
  }

  _detectConflicts() {
    // Find files that exist in multiple locations with different content
    const fileMap = {};

    for (const file of this.inventory.files) {
      const key = path.basename(file.path);
      if (!fileMap[key]) fileMap[key] = [];
      fileMap[key].push(file);
    }

    for (const [name, files] of Object.entries(fileMap)) {
      if (files.length > 1) {
        // Check if sizes differ (simplified conflict detection)
        const sizes = new Set(files.map(f => f.size));
        if (sizes.size > 1) {
          this.inventory.conflicts.push({
            name,
            files,
            type: 'content_mismatch',
            resolution: 'use_newest'
          });
        }
      }
    }
  }

  _summarize() {
    const orgCount = Object.keys(this.inventory.orgs).length;
    const fileCount = this.inventory.files.length;
    const conflictCount = this.inventory.conflicts.length;

    this.logger.info(`Discovery complete: ${orgCount} orgs, ${fileCount} files, ${conflictCount} conflicts`);

    for (const [slug, org] of Object.entries(this.inventory.orgs)) {
      const platforms = Object.keys(org.platforms).join(', ');
      this.logger.debug(`  - ${slug}: ${platforms}`);
    }
  }
}

class MappingValidator {
  constructor(mappingPath, inventory, logger) {
    this.mappingPath = mappingPath;
    this.inventory = inventory;
    this.logger = logger;
    this.mapping = null;
    this.errors = [];
    this.warnings = [];
  }

  async validate() {
    this.logger.info('Phase 2: Validation - Checking mapping file...');

    // Load mapping file
    if (!fs.existsSync(this.mappingPath)) {
      this.logger.warn(`Mapping file not found: ${this.mappingPath}`);
      this.logger.info('Generating mapping from discovered inventory...');
      this.mapping = this._generateMappingFromInventory();
    } else {
      const content = fs.readFileSync(this.mappingPath, 'utf8');
      this.mapping = yaml.load(content);
    }

    // Validate structure
    this._validateStructure();

    // Validate against inventory
    this._validateAgainstInventory();

    // Report results
    if (this.errors.length > 0) {
      this.logger.error(`Validation failed with ${this.errors.length} errors`);
      this.errors.forEach(e => this.logger.error(`  - ${e}`));
      return { valid: false, mapping: null, errors: this.errors, warnings: this.warnings };
    }

    if (this.warnings.length > 0) {
      this.warnings.forEach(w => this.logger.warn(`  - ${w}`));
    }

    this.logger.success('Validation passed');
    return { valid: true, mapping: this.mapping, errors: [], warnings: this.warnings };
  }

  _validateStructure() {
    if (!this.mapping.version) {
      this.warnings.push('Missing version in mapping file');
      this.mapping.version = CONFIG.MAPPING_SCHEMA_VERSION;
    }

    if (!this.mapping.orgs) {
      this.errors.push('Missing "orgs" section in mapping file');
      return;
    }

    for (const [slug, org] of Object.entries(this.mapping.orgs)) {
      if (!org.platforms) {
        this.warnings.push(`Org "${slug}" has no platforms defined`);
        continue;
      }

      for (const [platform, config] of Object.entries(org.platforms)) {
        if (!config.instances) {
          this.warnings.push(`Org "${slug}" platform "${platform}" has no instances`);
        }
      }
    }
  }

  _validateAgainstInventory() {
    // Check that all discovered orgs are in mapping
    for (const slug of Object.keys(this.inventory.orgs)) {
      if (!this.mapping.orgs[slug]) {
        this.warnings.push(`Discovered org "${slug}" not in mapping - will use auto-generated mapping`);
        this.mapping.orgs[slug] = this._generateOrgMapping(slug);
      }
    }
  }

  _generateMappingFromInventory() {
    const mapping = {
      version: CONFIG.MAPPING_SCHEMA_VERSION,
      generated_at: new Date().toISOString(),
      orgs: {},
      file_classification: this._getDefaultClassification()
    };

    for (const slug of Object.keys(this.inventory.orgs)) {
      mapping.orgs[slug] = this._generateOrgMapping(slug);
    }

    return mapping;
  }

  _generateOrgMapping(slug) {
    const org = this.inventory.orgs[slug];
    const mapping = {
      display_name: this._slugToDisplayName(slug),
      slug,
      aliases: [],
      platforms: {}
    };

    if (!org) return mapping;

    for (const [platform, config] of Object.entries(org.platforms)) {
      mapping.platforms[platform] = { instances: {} };

      for (const [instanceName, instance] of Object.entries(config.instances)) {
        mapping.platforms[platform].instances[instanceName] = {
          display_name: this._slugToDisplayName(instanceName),
          environment_type: this._guessEnvironmentType(instanceName),
          source_paths: instance.sources.map(s => s.relativePath || s.path),
          priority: 1
        };
      }
    }

    return mapping;
  }

  _slugToDisplayName(slug) {
    return slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  }

  _guessEnvironmentType(name) {
    if (/prod/i.test(name)) return 'production';
    if (/sandbox/i.test(name)) return 'sandbox';
    if (/test/i.test(name)) return 'test';
    if (/dev/i.test(name)) return 'development';
    if (/main/i.test(name)) return 'sandbox';
    if (/uat/i.test(name)) return 'uat';
    if (/staging/i.test(name)) return 'staging';
    return 'production';
  }

  _getDefaultClassification() {
    return {
      rules: [
        { pattern: 'q2c-audit*/', destination: 'projects/{basename}', category: 'audit' },
        { pattern: 'revops-audit*/', destination: 'projects/{basename}', category: 'audit' },
        { pattern: 'observations/', destination: 'data/observations', category: 'data' },
        { pattern: 'reflection*.json', destination: 'data/reflections', category: 'data' },
        { pattern: 'ENV_CONFIG.json', destination: 'configs', category: 'config' },
        { pattern: 'RUNBOOK.md', destination: 'configs', category: 'config' },
        { pattern: 'ORG_CONTEXT.json', destination: 'configs', category: 'config' },
        { pattern: '*.flexipage-meta.xml', destination: 'projects/{parent_dir}', category: 'metadata' },
        { pattern: 'reports/', destination: 'reports', category: 'report' }
      ]
    };
  }
}

class MigrationEngine {
  constructor(options, mapping, inventory, logger) {
    this.options = options;
    this.mapping = mapping;
    this.inventory = inventory;
    this.logger = logger;
    this.results = {
      created_dirs: [],
      moved_files: [],
      created_metadata: [],
      created_symlinks: [],
      skipped: [],
      errors: []
    };
  }

  async execute() {
    if (this.options.dryRun) {
      this.logger.info('=== DRY RUN MODE - No changes will be made ===');
    }

    // Phase 3: Create scaffolding
    await this._createScaffolding();

    // Phase 4: Migrate files
    await this._migrateFiles();

    // Phase 5: Generate metadata
    await this._generateMetadata();

    // Phase 6: Create symlinks (optional)
    if (this.options.createSymlinks) {
      await this._createSymlinks();
    }

    return this.results;
  }

  async _createScaffolding() {
    this.logger.info('Phase 3: Scaffolding - Creating directory structure...');

    for (const [orgSlug, orgConfig] of Object.entries(this.mapping.orgs)) {
      if (this.options.onlyOrg && this.options.onlyOrg !== orgSlug) continue;

      const orgPath = path.join(this.options.rootDir, CONFIG.TARGET_ROOT, orgSlug);

      // Create org-level directories
      const orgDirs = [
        orgPath,
        path.join(orgPath, '_meta'),
        path.join(orgPath, 'analysis', 'discovery'),
        path.join(orgPath, 'analysis', 'audits'),
        path.join(orgPath, 'analysis', 'reporting'),
        path.join(orgPath, 'planning', 'roadmaps'),
        path.join(orgPath, 'planning', 'architecture'),
        path.join(orgPath, 'planning', 'proposals'),
        path.join(orgPath, 'delivery', 'cross-platform')
      ];

      for (const dir of orgDirs) {
        this._mkdir(dir);
      }

      // Create platform/instance directories
      for (const [platform, platformConfig] of Object.entries(orgConfig.platforms || {})) {
        for (const [instanceName, instanceConfig] of Object.entries(platformConfig.instances || {})) {
          const instancePath = path.join(orgPath, 'platforms', platform, instanceName);

          const instanceDirs = [
            instancePath,
            path.join(instancePath, '_meta'),
            path.join(instancePath, 'projects'),
            path.join(instancePath, 'configs'),
            path.join(instancePath, 'data'),
            path.join(instancePath, 'reports')
          ];

          for (const dir of instanceDirs) {
            this._mkdir(dir);
          }
        }
      }
    }
  }

  _mkdir(dirPath) {
    if (this.options.dryRun) {
      this.logger.debug(`Would create directory: ${dirPath}`);
      this.results.created_dirs.push({ path: dirPath, dryRun: true });
      return;
    }

    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
      this.results.created_dirs.push({ path: dirPath, dryRun: false });
      this.logger.debug(`Created: ${dirPath}`);
    }
  }

  async _migrateFiles() {
    this.logger.info('Phase 4: Migration - Copying files...');

    for (const [orgSlug, orgData] of Object.entries(this.inventory.orgs)) {
      if (this.options.onlyOrg && this.options.onlyOrg !== orgSlug) continue;

      for (const [platform, platformData] of Object.entries(orgData.platforms)) {
        for (const [instanceName, instanceData] of Object.entries(platformData.instances)) {
          for (const source of instanceData.sources) {
            await this._migrateInstance(orgSlug, platform, instanceName, source);
          }
        }
      }
    }
  }

  async _migrateInstance(orgSlug, platform, instanceName, source) {
    const targetBase = path.join(this.options.rootDir, CONFIG.TARGET_ROOT, orgSlug, 'platforms', platform, instanceName);

    this.logger.debug(`Migrating: ${source.path} -> ${targetBase}`);

    const files = this._getAllFiles(source.path);

    for (const file of files) {
      const relativePath = path.relative(source.path, file);
      const classification = this._classifyFile(relativePath);
      const targetPath = path.join(targetBase, classification.destination, relativePath);

      await this._copyFile(file, targetPath, classification);
    }
  }

  _getAllFiles(dir, files = []) {
    if (!fs.existsSync(dir)) return files;

    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (e) {
      return files;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (this._shouldSkip(entry.name)) continue;

      if (entry.isDirectory()) {
        this._getAllFiles(fullPath, files);
      } else {
        files.push(fullPath);
      }
    }

    return files;
  }

  _shouldSkip(name) {
    return CONFIG.SKIP_PATTERNS.some(pattern => {
      if (pattern.includes('*')) {
        const regex = new RegExp(pattern.replace(/\*/g, '.*'));
        return regex.test(name);
      }
      return name === pattern;
    });
  }

  _classifyFile(relativePath) {
    const rules = this.mapping.file_classification?.rules || [];
    const basename = path.basename(relativePath);
    const dirname = path.dirname(relativePath);
    const parentDir = path.basename(dirname);

    for (const rule of rules) {
      if (this._matchesPattern(relativePath, rule.pattern) || this._matchesPattern(basename, rule.pattern)) {
        let destination = rule.destination
          .replace('{basename}', basename.replace(/[\/\\]/g, ''))
          .replace('{parent_dir}', parentDir)
          .replace('{dirname}', dirname);

        return { destination, category: rule.category };
      }
    }

    // Default classification
    if (/\.(json|yaml|yml)$/.test(basename)) {
      return { destination: 'data', category: 'data' };
    }
    if (/\.(md|txt)$/.test(basename)) {
      return { destination: 'configs', category: 'documentation' };
    }
    if (/\.(xml)$/.test(basename)) {
      return { destination: 'projects', category: 'metadata' };
    }

    return { destination: 'data/uncategorized', category: 'uncategorized' };
  }

  _matchesPattern(filePath, pattern) {
    // Convert glob pattern to regex
    const regexPattern = pattern
      .replace(/\*\*/g, '.*')
      .replace(/\*/g, '[^/]*')
      .replace(/\//g, '[\\/]');

    const regex = new RegExp(regexPattern, 'i');
    return regex.test(filePath);
  }

  async _copyFile(sourcePath, targetPath, classification) {
    if (this.options.dryRun) {
      this.logger.debug(`Would copy: ${sourcePath} -> ${targetPath}`);
      this.results.moved_files.push({
        source: sourcePath,
        target: targetPath,
        category: classification.category,
        dryRun: true
      });
      return;
    }

    try {
      // Create target directory
      const targetDir = path.dirname(targetPath);
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }

      // Check for conflicts
      if (fs.existsSync(targetPath)) {
        const sourceStats = fs.statSync(sourcePath);
        const targetStats = fs.statSync(targetPath);

        if (sourceStats.mtime > targetStats.mtime) {
          // Source is newer, backup target and replace
          if (this.options.createBackups) {
            const backupPath = targetPath + '.bak.' + Date.now();
            fs.renameSync(targetPath, backupPath);
          }
        } else {
          // Target is newer or same, skip
          this.results.skipped.push({
            source: sourcePath,
            target: targetPath,
            reason: 'target_newer_or_same'
          });
          return;
        }
      }

      // Copy file (preserving original)
      fs.copyFileSync(sourcePath, targetPath);

      this.results.moved_files.push({
        source: sourcePath,
        target: targetPath,
        category: classification.category,
        dryRun: false
      });

      this.logger.debug(`Copied: ${path.basename(sourcePath)}`);

    } catch (error) {
      this.results.errors.push({
        source: sourcePath,
        target: targetPath,
        error: error.message
      });
      this.logger.error(`Failed to copy ${sourcePath}: ${error.message}`);
    }
  }

  async _generateMetadata() {
    this.logger.info('Phase 5: Metadata - Generating org.yaml and instance.yaml...');

    for (const [orgSlug, orgConfig] of Object.entries(this.mapping.orgs)) {
      if (this.options.onlyOrg && this.options.onlyOrg !== orgSlug) continue;

      // Generate org.yaml
      await this._generateOrgYaml(orgSlug, orgConfig);

      // Generate instance.yaml for each instance
      for (const [platform, platformConfig] of Object.entries(orgConfig.platforms || {})) {
        for (const [instanceName, instanceConfig] of Object.entries(platformConfig.instances || {})) {
          await this._generateInstanceYaml(orgSlug, platform, instanceName, instanceConfig);
        }
      }
    }
  }

  async _generateOrgYaml(orgSlug, orgConfig) {
    const orgYaml = {
      schema_version: CONFIG.ORG_SCHEMA_VERSION,
      org_slug: orgSlug,
      display_name: orgConfig.display_name || this._slugToDisplayName(orgSlug),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),

      business: {
        industry: orgConfig.industry || null,
        company_size: null,
        primary_contact: orgConfig.primary_contact || { name: null, email: null },
        tags: orgConfig.tags || [],
        notes: null
      },

      platforms: {},

      relationships: {
        salesforce_hubspot_sync: false,
        salesforce_marketo_sync: false,
        primary_crm: 'salesforce'
      },

      migration: {
        migrated_at: new Date().toISOString(),
        migration_version: '1.0.0',
        source_locations: orgConfig.platforms ?
          Object.values(orgConfig.platforms).flatMap(p =>
            Object.values(p.instances || {}).flatMap(i => i.source_paths || [])
          ) : [],
        files_migrated: this.results.moved_files.filter(f => f.target?.includes(`/${orgSlug}/`)).length,
        files_skipped: this.results.skipped.filter(f => f.target?.includes(`/${orgSlug}/`)).length,
        conflicts_resolved: 0
      }
    };

    // Populate platform summary
    for (const [platform, platformConfig] of Object.entries(orgConfig.platforms || {})) {
      const instances = Object.keys(platformConfig.instances || {});
      orgYaml.platforms[platform] = {
        instance_count: instances.length,
        primary_instance: instances[0] || null
      };
    }

    const targetPath = path.join(this.options.rootDir, CONFIG.TARGET_ROOT, orgSlug, '_meta', 'org.yaml');
    await this._writeYaml(targetPath, orgYaml, 'org.yaml');
  }

  async _generateInstanceYaml(orgSlug, platform, instanceName, instanceConfig) {
    // Try to load existing ENV_CONFIG.json for platform IDs
    let envConfig = {};
    const envConfigPath = path.join(this.options.rootDir, CONFIG.TARGET_ROOT, orgSlug, 'platforms', platform, instanceName, 'configs', 'ENV_CONFIG.json');
    if (fs.existsSync(envConfigPath)) {
      try {
        envConfig = JSON.parse(fs.readFileSync(envConfigPath, 'utf8'));
      } catch (e) {
        this.logger.debug(`Could not parse ENV_CONFIG.json: ${e.message}`);
      }
    }

    const instanceYaml = {
      schema_version: CONFIG.INSTANCE_SCHEMA_VERSION,
      instance_name: instanceName,
      display_name: instanceConfig.display_name || this._slugToDisplayName(instanceName),
      platform,
      org_slug: orgSlug,
      environment_type: instanceConfig.environment_type || 'unknown',

      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      last_activity_at: new Date().toISOString(),

      platform_ids: {
        salesforce: platform === 'salesforce' ? {
          org_id: envConfig?.salesforce?.orgId || instanceConfig.org_id || null,
          instance_url: null,
          api_version: '62.0'
        } : null,
        hubspot: platform === 'hubspot' ? {
          portal_id: envConfig?.hubspot?.portalId || null,
          hub_id: null
        } : null,
        marketo: platform === 'marketo' ? {
          munchkin_id: null
        } : null
      },

      config: envConfig?.[platform] || {},

      quirks: {
        label_overrides: envConfig?.salesforce?.labelCustomizations || {},
        api_limitations: [],
        known_issues: []
      },

      assessments: this._findAssessments(orgSlug, platform, instanceName),

      migration: {
        migrated_at: new Date().toISOString(),
        source_paths: instanceConfig.source_paths || [],
        files_migrated: this.results.moved_files.filter(f =>
          f.target?.includes(path.join(orgSlug, 'platforms', platform, instanceName))
        ).length,
        original_structure_preserved: true
      }
    };

    const targetPath = path.join(this.options.rootDir, CONFIG.TARGET_ROOT, orgSlug, 'platforms', platform, instanceName, '_meta', 'instance.yaml');
    await this._writeYaml(targetPath, instanceYaml, 'instance.yaml');
  }

  _findAssessments(orgSlug, platform, instanceName) {
    const assessments = [];
    const projectsPath = path.join(this.options.rootDir, CONFIG.TARGET_ROOT, orgSlug, 'platforms', platform, instanceName, 'projects');

    if (fs.existsSync(projectsPath)) {
      let projects;
      try {
        projects = fs.readdirSync(projectsPath, { withFileTypes: true });
      } catch (e) {
        return assessments;
      }

      for (const project of projects) {
        if (project.isDirectory()) {
          const match = project.name.match(/^(q2c-audit|revops-audit|security-audit|automation-audit)(?:-(.*))?$/);
          if (match) {
            assessments.push({
              type: match[1],
              date: this._extractDate(project.name) || new Date().toISOString().split('T')[0],
              path: `projects/${project.name}`
            });
          }
        }
      }
    }

    return assessments;
  }

  _extractDate(name) {
    const match = name.match(/(\d{4}-\d{2}-\d{2})/);
    return match ? match[1] : null;
  }

  async _writeYaml(filePath, content, type) {
    if (this.options.dryRun) {
      this.logger.debug(`Would create ${type}: ${filePath}`);
      this.results.created_metadata.push({ path: filePath, type, dryRun: true });
      return;
    }

    const yamlContent = yaml.dump(content, {
      indent: 2,
      lineWidth: 120,
      noRefs: true,
      sortKeys: false
    });

    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(filePath, yamlContent, 'utf8');
    this.results.created_metadata.push({ path: filePath, type, dryRun: false });
    this.logger.debug(`Created ${type}: ${filePath}`);
  }

  async _createSymlinks() {
    this.logger.info('Phase 6: Symlinks - Creating backward-compatibility symlinks...');

    for (const [orgSlug, orgConfig] of Object.entries(this.mapping.orgs)) {
      if (this.options.onlyOrg && this.options.onlyOrg !== orgSlug) continue;

      for (const [platform, platformConfig] of Object.entries(orgConfig.platforms || {})) {
        for (const [instanceName, instanceConfig] of Object.entries(platformConfig.instances || {})) {
          await this._createInstanceSymlinks(orgSlug, platform, instanceName, instanceConfig);
        }
      }
    }
  }

  async _createInstanceSymlinks(orgSlug, platform, instanceName, instanceConfig) {
    const newPath = path.join(this.options.rootDir, CONFIG.TARGET_ROOT, orgSlug, 'platforms', platform, instanceName);

    // Create symlinks from source paths to new location
    for (const sourcePath of (instanceConfig.source_paths || [])) {
      const fullSourcePath = path.join(this.options.rootDir, sourcePath);

      if (this.options.dryRun) {
        this.logger.debug(`Would create symlink: ${fullSourcePath} -> ${newPath}`);
        this.results.created_symlinks.push({
          source: fullSourcePath,
          target: newPath,
          dryRun: true
        });
        continue;
      }

      // Skip if source path doesn't exist or is same as new path
      if (fullSourcePath === newPath) continue;

      // Create parent directory for symlink
      const parentDir = path.dirname(fullSourcePath);
      if (!fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true });
      }

      // Remove existing directory/symlink if it exists
      if (fs.existsSync(fullSourcePath)) {
        const stats = fs.lstatSync(fullSourcePath);
        if (stats.isSymbolicLink()) {
          fs.unlinkSync(fullSourcePath);
        } else {
          // Skip - don't replace real directories with symlinks
          this.logger.debug(`Skipping symlink - real directory exists: ${fullSourcePath}`);
          continue;
        }
      }

      try {
        fs.symlinkSync(newPath, fullSourcePath, 'junction');
        this.results.created_symlinks.push({
          source: fullSourcePath,
          target: newPath,
          dryRun: false
        });
        this.logger.debug(`Created symlink: ${fullSourcePath} -> ${newPath}`);
      } catch (error) {
        this.logger.warn(`Failed to create symlink: ${error.message}`);
      }
    }
  }

  _slugToDisplayName(slug) {
    return slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  }
}

class ReportGenerator {
  constructor(results, inventory, logger, options) {
    this.results = results;
    this.inventory = inventory;
    this.logger = logger;
    this.options = options;
  }

  async generate(outputPath) {
    this.logger.info('Phase 7: Report - Generating migration report...');

    const report = {
      metadata: {
        generated_at: new Date().toISOString(),
        tool_version: '1.0.0',
        dry_run: this.results.moved_files[0]?.dryRun || false
      },

      summary: {
        total_orgs: Object.keys(this.inventory.orgs).length,
        total_files_scanned: this.inventory.files.length,
        total_files_migrated: this.results.moved_files.length,
        total_files_skipped: this.results.skipped.length,
        total_errors: this.results.errors.length,
        total_directories_created: this.results.created_dirs.length,
        total_metadata_files_created: this.results.created_metadata.length,
        total_symlinks_created: this.results.created_symlinks.length
      },

      orgs_migrated: Object.keys(this.inventory.orgs).map(slug => ({
        slug,
        platforms: Object.keys(this.inventory.orgs[slug].platforms),
        instances: Object.values(this.inventory.orgs[slug].platforms).flatMap(p =>
          Object.keys(p.instances)
        ),
        file_count: this.results.moved_files.filter(f => f.target?.includes(`/${slug}/`)).length
      })),

      files_by_category: this._groupByCategory(),

      conflicts_resolved: this.inventory.conflicts,

      errors: this.results.errors,

      skipped: this.results.skipped.slice(0, 50), // First 50 for brevity

      directories_created: this.results.created_dirs.map(d => d.path),

      next_steps: [
        'Review migration report for any errors or skipped files',
        'Verify org.yaml and instance.yaml metadata accuracy',
        'Test agent operations with new paths',
        'Update path references in CLAUDE.md if needed',
        'Remove original instance directories after validation (optional)'
      ]
    };

    if (!this.options.dryRun) {
      // Write JSON report
      const jsonPath = path.join(outputPath, 'migration-report.json');
      fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2), 'utf8');

      // Write Markdown summary
      const mdPath = path.join(outputPath, 'MIGRATION_SUMMARY.md');
      const markdown = this._generateMarkdown(report);
      fs.writeFileSync(mdPath, markdown, 'utf8');

      this.logger.success(`Reports written to: ${outputPath}`);
    } else {
      this.logger.info(`Would write report to: ${outputPath}`);
    }

    return report;
  }

  _groupByCategory() {
    const groups = {};

    for (const file of this.results.moved_files) {
      const cat = file.category || 'uncategorized';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(file.target);
    }

    return Object.entries(groups).map(([category, files]) => ({
      category,
      count: files.length
    }));
  }

  _generateMarkdown(report) {
    return `# Filesystem Migration Report

**Generated**: ${report.metadata.generated_at}
**Mode**: ${report.metadata.dry_run ? 'DRY RUN' : 'LIVE MIGRATION'}

## Summary

| Metric | Count |
|--------|-------|
| Organizations Migrated | ${report.summary.total_orgs} |
| Files Scanned | ${report.summary.total_files_scanned} |
| Files Migrated | ${report.summary.total_files_migrated} |
| Files Skipped | ${report.summary.total_files_skipped} |
| Errors | ${report.summary.total_errors} |
| Directories Created | ${report.summary.total_directories_created} |
| Metadata Files Created | ${report.summary.total_metadata_files_created} |

## Organizations Migrated

${report.orgs_migrated.map(org => `### ${org.slug}
- Platforms: ${org.platforms.join(', ')}
- Instances: ${org.instances.join(', ')}
- Files: ${org.file_count}
`).join('\n')}

## Files by Category

| Category | Count |
|----------|-------|
${report.files_by_category.map(c => `| ${c.category} | ${c.count} |`).join('\n')}

${report.errors.length > 0 ? `## Errors

${report.errors.map(e => `- **${e.source}**: ${e.error}`).join('\n')}` : ''}

${report.conflicts_resolved.length > 0 ? `## Conflicts Resolved

${report.conflicts_resolved.map(c => `- **${c.name}**: ${c.type} - resolved via ${c.resolution}`).join('\n')}` : ''}

## Next Steps

${report.next_steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}

---
*This report was generated by the filesystem migration script.*
`;
  }
}

// ============================================================================
// MAIN ENTRY POINT
// ============================================================================

async function main() {
  const args = process.argv.slice(2);

  // Parse arguments
  const options = {
    dryRun: args.includes('--dry-run'),
    onlyOrg: args.includes('--only-org') ? args[args.indexOf('--only-org') + 1] : null,
    writeReport: args.includes('--write-report'),
    createBackups: args.includes('--create-backups'),
    createSymlinks: args.includes('--create-symlinks'),
    findStragglers: args.includes('--find-stragglers'),
    mappingPath: args.includes('--mapping') ? args[args.indexOf('--mapping') + 1] : CONFIG.DEFAULT_MAPPING_PATH,
    verbose: args.includes('--verbose'),
    help: args.includes('--help'),
    rootDir: process.cwd()
  };

  if (options.help) {
    console.log(`
Filesystem Migration: System-Centric to Client-Centric

USAGE:
  node scripts/migrate-to-client-centric.js [options]

OPTIONS:
  --dry-run           Show what would be migrated without making changes
  --only-org <slug>   Only migrate a specific organization
  --write-report      Generate detailed migration report
  --create-backups    Create .backup/ copies before moving
  --create-symlinks   Create backward-compatibility symlinks
  --find-stragglers   Identify instances not yet migrated to orgs/
  --mapping <path>    Path to instance-mappings.yaml
  --verbose           Enable verbose logging
  --help              Show this help

EXAMPLES:
  # Find unmigrated instances (stragglers)
  node scripts/migrate-to-client-centric.js --find-stragglers

  # Dry run to see what would happen
  node scripts/migrate-to-client-centric.js --dry-run --verbose

  # Migrate only one org
  node scripts/migrate-to-client-centric.js --only-org acme-corp --write-report

  # Full migration with backups
  node scripts/migrate-to-client-centric.js --create-backups --write-report
`);
    process.exit(0);
  }

  const logger = new MigrationLogger(options.verbose);

  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  Filesystem Migration: System-Centric → Client-Centric');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');

  try {
    // Phase 1: Discovery
    const discovery = new DiscoveryEngine(options.rootDir, logger);
    const inventory = await discovery.discover();

    // Handle --find-stragglers mode
    if (options.findStragglers) {
      const stragglers = discovery.findStragglers();

      console.log('');
      console.log('═══════════════════════════════════════════════════════════════');
      console.log('  Straggler Analysis: Unmigrated Instances');
      console.log('═══════════════════════════════════════════════════════════════');
      console.log('');

      if (stragglers.unmigrated.length === 0) {
        console.log('✅ No unmigrated instances found!');
      } else {
        console.log(`❗ Found ${stragglers.unmigrated.length} unmigrated org(s):`);
        console.log('');

        for (const org of stragglers.unmigrated) {
          console.log(`  📁 ${org.orgSlug}`);
          console.log(`     Platforms: ${org.platforms.join(', ')}`);
          for (const inst of org.instances) {
            console.log(`     └─ ${inst.name}`);
            for (const src of inst.sourcePaths.slice(0, 2)) {
              console.log(`        └─ ${src}`);
            }
            if (inst.sourcePaths.length > 2) {
              console.log(`        └─ ... and ${inst.sourcePaths.length - 2} more`);
            }
          }
          console.log('');
        }

        console.log('To migrate these instances, run:');
        for (const org of stragglers.unmigrated) {
          console.log(`  node scripts/migrate-to-client-centric.js --only-org ${org.orgSlug} --write-report`);
        }
      }

      if (stragglers.partiallyMigrated.length > 0) {
        console.log('');
        console.log(`⚠️  Found ${stragglers.partiallyMigrated.length} partially migrated org(s):`);
        for (const org of stragglers.partiallyMigrated) {
          console.log(`  📁 ${org.orgSlug}`);
          if (org.matchedVariant) {
            console.log(`     Matched variant: ${org.matchedVariant}`);
          }
          if (org.migratedPlatforms) {
            console.log(`     Migrated: ${org.migratedPlatforms.join(', ')}`);
          }
          if (org.missingPlatforms) {
            console.log(`     Missing: ${org.missingPlatforms.join(', ')}`);
          }
        }
      }

      if (stragglers.alreadyMigrated.length > 0) {
        console.log('');
        console.log(`✅ ${stragglers.alreadyMigrated.length} org(s) already migrated:`);
        for (const org of stragglers.alreadyMigrated) {
          console.log(`  📁 ${org.orgSlug} (${org.platforms.join(', ')})`);
        }
      }

      console.log('');
      console.log('═══════════════════════════════════════════════════════════════');
      process.exit(0);
    }

    // Phase 2: Validation
    const validator = new MappingValidator(
      path.join(options.rootDir, options.mappingPath),
      inventory,
      logger
    );
    const validation = await validator.validate();

    if (!validation.valid) {
      logger.error('Validation failed. Fix errors and retry.');
      process.exit(1);
    }

    // Phases 3-6: Migration
    const migrator = new MigrationEngine(options, validation.mapping, inventory, logger);
    const results = await migrator.execute();

    // Phase 7: Report
    if (options.writeReport || options.dryRun) {
      const reportDir = path.join(options.rootDir, CONFIG.REPORT_DIR);
      if (!options.dryRun) {
        fs.mkdirSync(reportDir, { recursive: true });
      }

      const reporter = new ReportGenerator(results, inventory, logger, options);
      await reporter.generate(reportDir);
    }

    // Summary
    console.log('');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('  Migration Summary');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`  Directories created: ${results.created_dirs.length}`);
    console.log(`  Files migrated: ${results.moved_files.length}`);
    console.log(`  Metadata files created: ${results.created_metadata.length}`);
    console.log(`  Files skipped: ${results.skipped.length}`);
    console.log(`  Errors: ${results.errors.length}`);
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('');

    if (options.dryRun) {
      logger.info('DRY RUN complete. No changes were made.');
      process.exit(2);
    }

    if (results.errors.length > 0) {
      logger.warn('Migration completed with errors. Review the report.');
      process.exit(3);
    }

    logger.success('Migration completed successfully!');
    process.exit(0);

  } catch (error) {
    logger.error(`Fatal error: ${error.message}`);
    if (options.verbose) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// Run
main().catch(err => {
  console.error('Unhandled error:', err);
  process.exit(1);
});

module.exports = {
  DiscoveryEngine,
  MappingValidator,
  MigrationEngine,
  ReportGenerator,
  CONFIG
};
