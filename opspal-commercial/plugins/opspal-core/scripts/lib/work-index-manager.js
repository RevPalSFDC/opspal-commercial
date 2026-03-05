#!/usr/bin/env node

/**
 * Work Index Manager
 *
 * Core CRUD operations and CLI for managing client work request indexes.
 * Provides project memory across sessions by tracking requests, deliverables,
 * and status for each client.
 *
 * Supports dual-path resolution:
 * - New: orgs/{org}/WORK_INDEX.yaml
 * - Legacy: instances/{org}/WORK_INDEX.yaml or instances/salesforce/{org}/WORK_INDEX.yaml
 *
 * Usage:
 *   node work-index-manager.js list <org> [--status completed] [--since 2026-01]
 *   node work-index-manager.js search <query> [--org <slug>] [--type audit]
 *   node work-index-manager.js add <org> --title "..." --classification audit
 *   node work-index-manager.js update <org> <request-id> --status completed
 *   node work-index-manager.js summary <org> [--format markdown]
 *   node work-index-manager.js context <org>  # Recent work + follow-ups
 *
 * @module work-index-manager
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const {
  SCHEMA_VERSION,
  WORK_INDEX_FILE,
  CLASSIFICATION_TAXONOMY,
  STATUS_VALUES,
  generateRequestId,
  validateStatusTransition,
  validateClassification,
  validateWorkRequest,
  createEmptyWorkIndex,
  inferClassificationFromAgent
} = require('./work-index-schema');

// Try to load PathResolver
let PathResolver;
try {
  PathResolver = require('./path-resolver').PathResolver;
} catch (e) {
  PathResolver = null;
}

/**
 * WorkIndexManager class for managing client work indexes
 */
class WorkIndexManager {
  /**
   * Create a WorkIndexManager instance
   *
   * @param {Object} options - Configuration options
   * @param {string} [options.basePath] - Base path for resolution
   * @param {boolean} [options.verbose] - Enable verbose logging
   */
  constructor(options = {}) {
    this.basePath = options.basePath || process.env.CLAUDE_PLUGIN_ROOT || process.cwd();
    this.verbose = options.verbose || process.env.WORK_INDEX_VERBOSE === '1';

    if (PathResolver) {
      this.pathResolver = new PathResolver({ basePath: this.basePath, verbose: this.verbose });
    }
  }

  /**
   * Log message if verbose mode enabled
   * @private
   */
  _log(message) {
    if (this.verbose) {
      console.error(`[WorkIndexManager] ${message}`);
    }
  }

  /**
   * Resolve the path to an org's WORK_INDEX.yaml
   * Uses dual-path resolution to support both org-centric and legacy structures
   *
   * @param {string} orgSlug - Organization identifier
   * @returns {{ path: string, exists: boolean, structure: string }}
   */
  resolveWorkIndexPath(orgSlug) {
    const candidates = [];

    // Priority 1: Org-centric path
    const orgCentricPath = path.join(this.basePath, 'orgs', orgSlug, WORK_INDEX_FILE);
    candidates.push({ path: orgCentricPath, structure: 'org-centric' });

    // Priority 2: Legacy platform path (salesforce)
    const legacyPlatformPath = path.join(this.basePath, 'instances', 'salesforce', orgSlug, WORK_INDEX_FILE);
    candidates.push({ path: legacyPlatformPath, structure: 'legacy-platform' });

    // Priority 3: Legacy simple path
    const legacySimplePath = path.join(this.basePath, 'instances', orgSlug, WORK_INDEX_FILE);
    candidates.push({ path: legacySimplePath, structure: 'legacy-simple' });

    // Priority 4: Plugin-specific paths
    const pluginPath = path.join(this.basePath, '.claude-plugins', 'opspal-salesforce', 'instances', 'salesforce', orgSlug, WORK_INDEX_FILE);
    candidates.push({ path: pluginPath, structure: 'plugin' });

    // Find existing file
    for (const candidate of candidates) {
      if (fs.existsSync(candidate.path)) {
        this._log(`Found existing work index at: ${candidate.path}`);
        return { ...candidate, exists: true };
      }
    }

    // Default to org-centric for new files
    this._log(`No existing work index found, will create at: ${orgCentricPath}`);
    return { path: orgCentricPath, exists: false, structure: 'org-centric' };
  }

  /**
   * Load work index for an organization
   *
   * @param {string} orgSlug - Organization identifier
   * @returns {Object} Work index data or empty index if not found
   */
  loadWorkIndex(orgSlug) {
    const { path: indexPath, exists } = this.resolveWorkIndexPath(orgSlug);

    if (!exists) {
      this._log(`Creating new work index for ${orgSlug}`);
      return createEmptyWorkIndex(orgSlug);
    }

    try {
      const content = fs.readFileSync(indexPath, 'utf8');
      const data = yaml.load(content);

      // Validate schema version
      if (data.schema_version !== SCHEMA_VERSION) {
        this._log(`Warning: Schema version mismatch (file: ${data.schema_version}, expected: ${SCHEMA_VERSION})`);
      }

      return data;
    } catch (e) {
      console.error(`Failed to load work index for ${orgSlug}: ${e.message}`);
      return createEmptyWorkIndex(orgSlug);
    }
  }

  /**
   * Save work index for an organization
   *
   * @param {string} orgSlug - Organization identifier
   * @param {Object} data - Work index data to save
   * @returns {{ success: boolean, path: string, error?: string }}
   */
  saveWorkIndex(orgSlug, data) {
    const { path: indexPath } = this.resolveWorkIndexPath(orgSlug);

    // Update timestamp
    data.last_updated = new Date().toISOString();

    // Ensure directory exists
    const dir = path.dirname(indexPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      this._log(`Created directory: ${dir}`);
    }

    try {
      const yamlContent = yaml.dump(data, {
        indent: 2,
        lineWidth: 120,
        noRefs: true,
        sortKeys: false
      });
      fs.writeFileSync(indexPath, yamlContent, 'utf8');
      this._log(`Saved work index to: ${indexPath}`);
      return { success: true, path: indexPath };
    } catch (e) {
      return { success: false, path: indexPath, error: e.message };
    }
  }

  /**
   * List all known orgs with work indexes
   *
   * @returns {string[]} Array of org slugs
   */
  listOrgs() {
    const orgs = new Set();

    // Check orgs/ directory
    const orgsDir = path.join(this.basePath, 'orgs');
    if (fs.existsSync(orgsDir)) {
      for (const entry of fs.readdirSync(orgsDir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
          const indexPath = path.join(orgsDir, entry.name, WORK_INDEX_FILE);
          if (fs.existsSync(indexPath)) {
            orgs.add(entry.name);
          }
        }
      }
    }

    // Check instances/salesforce/ directory
    const instancesDir = path.join(this.basePath, 'instances', 'salesforce');
    if (fs.existsSync(instancesDir)) {
      for (const entry of fs.readdirSync(instancesDir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
          const indexPath = path.join(instancesDir, entry.name, WORK_INDEX_FILE);
          if (fs.existsSync(indexPath)) {
            orgs.add(entry.name);
          }
        }
      }
    }

    return Array.from(orgs).sort();
  }

  /**
   * Add a new work request
   *
   * @param {string} orgSlug - Organization identifier
   * @param {Object} requestData - Request data (without id)
   * @returns {{ success: boolean, request?: Object, error?: string }}
   */
  addRequest(orgSlug, requestData) {
    const workIndex = this.loadWorkIndex(orgSlug);

    // Generate unique ID
    const today = new Date().toISOString().slice(0, 10);
    const todayRequests = workIndex.requests.filter(r =>
      r.id && r.id.startsWith(`WRK-${today.replace(/-/g, '')}`)
    );
    const sequence = todayRequests.length + 1;
    const id = generateRequestId(today, sequence);

    // Build the request
    const request = {
      id,
      request_date: today,
      ...requestData,
      status: requestData.status || 'requested'
    };

    // Validate
    const validation = validateWorkRequest(request);
    if (!validation.valid) {
      return { success: false, error: `Validation failed: ${validation.errors.join(', ')}` };
    }

    // Validate classification/sub_type combo
    if (request.classification) {
      const classValidation = validateClassification(request.classification, request.sub_type);
      if (!classValidation.valid) {
        return { success: false, error: classValidation.reason };
      }
    }

    // Add to index
    workIndex.requests.push(request);

    // Save
    const saveResult = this.saveWorkIndex(orgSlug, workIndex);
    if (!saveResult.success) {
      return { success: false, error: saveResult.error };
    }

    return { success: true, request };
  }

  /**
   * Update an existing work request
   *
   * @param {string} orgSlug - Organization identifier
   * @param {string} requestId - Request ID to update
   * @param {Object} updates - Fields to update
   * @returns {{ success: boolean, request?: Object, error?: string }}
   */
  updateRequest(orgSlug, requestId, updates) {
    const workIndex = this.loadWorkIndex(orgSlug);

    const requestIndex = workIndex.requests.findIndex(r => r.id === requestId);
    if (requestIndex === -1) {
      return { success: false, error: `Request not found: ${requestId}` };
    }

    const request = workIndex.requests[requestIndex];

    // Validate status transition if status is being changed
    if (updates.status && updates.status !== request.status) {
      const transition = validateStatusTransition(request.status, updates.status);
      if (!transition.valid) {
        return { success: false, error: transition.reason };
      }
    }

    // Validate classification if being changed
    if (updates.classification || updates.sub_type) {
      const classValidation = validateClassification(
        updates.classification || request.classification,
        updates.sub_type || request.sub_type
      );
      if (!classValidation.valid) {
        return { success: false, error: classValidation.reason };
      }
    }

    // Apply updates
    const updatedRequest = { ...request, ...updates };

    // Auto-set timestamps
    if (updates.status === 'in-progress' && !request.started_at) {
      updatedRequest.started_at = new Date().toISOString();
    }
    if (updates.status === 'completed' && !request.completed_at) {
      updatedRequest.completed_at = new Date().toISOString();
    }

    // Validate the updated request
    const validation = validateWorkRequest(updatedRequest);
    if (!validation.valid) {
      return { success: false, error: `Validation failed: ${validation.errors.join(', ')}` };
    }

    workIndex.requests[requestIndex] = updatedRequest;

    // Save
    const saveResult = this.saveWorkIndex(orgSlug, workIndex);
    if (!saveResult.success) {
      return { success: false, error: saveResult.error };
    }

    return { success: true, request: updatedRequest };
  }

  /**
   * Scan org folder to discover existing work files for backfill
   *
   * @param {string} orgSlug - Organization identifier
   * @returns {{ discovered: Array, orgPath: string, exists: boolean }}
   */
  scanOrgFolder(orgSlug) {
    const discovered = [];

    // Find the org folder
    const orgPaths = [
      path.join(this.basePath, 'orgs', orgSlug),
      path.join(this.basePath, 'instances', 'salesforce', orgSlug),
      path.join(this.basePath, 'instances', orgSlug)
    ];

    let orgPath = null;
    for (const p of orgPaths) {
      if (fs.existsSync(p)) {
        orgPath = p;
        break;
      }
    }

    if (!orgPath) {
      return { discovered: [], orgPath: null, exists: false };
    }

    // Classification patterns (by filename/path)
    const classificationPatterns = [
      { pattern: /cpq|q2c|quote/i, classification: 'audit', subType: 'cpq-assessment' },
      { pattern: /revops|revenue.?ops|pipeline/i, classification: 'audit', subType: 'revops-audit' },
      { pattern: /automation|flow|trigger/i, classification: 'audit', subType: 'automation-audit' },
      { pattern: /security|permission|profile/i, classification: 'audit', subType: 'security-audit' },
      { pattern: /data.?quality|dedup|duplicate/i, classification: 'audit', subType: 'data-quality-audit' },
      { pattern: /discovery|metadata/i, classification: 'audit', subType: 'discovery' },
      { pattern: /executive|summary|report/i, classification: 'report', subType: 'executive-report' },
      { pattern: /dashboard/i, classification: 'report', subType: 'custom-dashboard' },
      { pattern: /field.?dictionary|data.?dictionary/i, classification: 'configuration', subType: 'field-config' },
      { pattern: /migration|import|export/i, classification: 'migration', subType: 'data-import' },
      { pattern: /config|setup/i, classification: 'configuration', subType: 'field-config' }
    ];

    // Content-based classification patterns (for smarter detection)
    const contentPatterns = [
      { keywords: ['SBQQ', 'CPQ', 'quote line', 'price rule', 'discount schedule', 'product bundle'], classification: 'audit', subType: 'cpq-assessment' },
      { keywords: ['pipeline', 'forecast', 'sales process', 'opportunity stage', 'win rate', 'conversion rate'], classification: 'audit', subType: 'revops-audit' },
      { keywords: ['flow', 'process builder', 'workflow rule', 'trigger', 'automation'], classification: 'audit', subType: 'automation-audit' },
      { keywords: ['permission set', 'profile', 'field-level security', 'sharing rule', 'role hierarchy'], classification: 'audit', subType: 'security-audit' },
      { keywords: ['duplicate', 'merge', 'data quality', 'completeness', 'validity'], classification: 'audit', subType: 'data-quality-audit' },
      { keywords: ['executive summary', 'key findings', 'recommendations', 'BLUF', 'bottom line'], classification: 'report', subType: 'executive-report' },
      { keywords: ['dashboard', 'chart', 'component', 'visualization'], classification: 'report', subType: 'custom-dashboard' },
      { keywords: ['field dictionary', 'data dictionary', 'field metadata', 'field description'], classification: 'configuration', subType: 'field-config' },
      { keywords: ['migration', 'data load', 'import', 'export', 'ETL'], classification: 'migration', subType: 'data-import' }
    ];

    /**
     * Read file content and classify based on keywords
     * @param {string} filePath - Full path to file
     * @param {string} ext - File extension
     * @returns {{ classification: string, subType: string } | null}
     */
    const classifyFromContent = (filePath, ext) => {
      // Only read text-based files
      if (!['.md', '.txt', '.json', '.yaml', '.yml'].includes(ext)) {
        return null;
      }

      try {
        // Read first 100 lines (limit content to avoid large file issues)
        const content = fs.readFileSync(filePath, 'utf8');
        const lines = content.split('\n').slice(0, 100);
        const sample = lines.join(' ').toLowerCase();

        // Check each content pattern
        for (const { keywords, classification, subType } of contentPatterns) {
          const matchCount = keywords.filter(kw => sample.includes(kw.toLowerCase())).length;
          // Require at least 2 keyword matches for content-based classification
          if (matchCount >= 2) {
            return { classification, subType };
          }
        }
      } catch (e) {
        // Silently fail - content classification is a bonus
      }

      return null;
    };

    // Scan for files recursively (limit depth to avoid huge scans)
    const scanDir = (dir, depth = 0) => {
      if (depth > 3) return; // Max 3 levels deep

      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          const relativePath = path.relative(orgPath, fullPath);

          // Skip hidden and system folders
          if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;

          if (entry.isDirectory()) {
            scanDir(fullPath, depth + 1);
          } else if (entry.isFile()) {
            // Only process relevant file types
            const ext = path.extname(entry.name).toLowerCase();
            if (!['.md', '.pdf', '.json', '.yaml', '.yml', '.csv', '.html'].includes(ext)) continue;

            // Skip work index itself
            if (entry.name === 'WORK_INDEX.yaml') continue;

            // Try to classify the file (filename-based first, content-based as fallback)
            let classification = 'audit';
            let subType = 'discovery';
            let classifiedBy = 'default';

            const fileNameLower = entry.name.toLowerCase();
            const relPathLower = relativePath.toLowerCase();

            // First: try filename/path-based classification
            for (const { pattern, classification: cls, subType: st } of classificationPatterns) {
              if (pattern.test(fileNameLower) || pattern.test(relPathLower)) {
                classification = cls;
                subType = st;
                classifiedBy = 'filename';
                break;
              }
            }

            // Second: if still generic (discovery), try content-based classification
            if (subType === 'discovery' && ['.md', '.txt', '.json', '.yaml', '.yml'].includes(ext)) {
              const contentResult = classifyFromContent(fullPath, ext);
              if (contentResult) {
                classification = contentResult.classification;
                subType = contentResult.subType;
                classifiedBy = 'content';
              }
            }

            // Extract date from filename or use file mtime
            let date = null;
            const dateMatch = entry.name.match(/(\d{4}[-_]?\d{2}[-_]?\d{2})/);
            if (dateMatch) {
              date = dateMatch[1].replace(/_/g, '-');
            } else {
              try {
                const stats = fs.statSync(fullPath);
                date = stats.mtime.toISOString().slice(0, 10);
              } catch (e) {
                date = new Date().toISOString().slice(0, 10);
              }
            }

            // Generate title from filename
            const title = entry.name
              .replace(/\.[^.]+$/, '')  // Remove extension
              .replace(/[-_]/g, ' ')     // Replace separators
              .replace(/\d{4}[-_]?\d{2}[-_]?\d{2}/g, '')  // Remove dates
              .replace(/\s+/g, ' ')      // Collapse spaces
              .trim()
              || entry.name;

            discovered.push({
              file: relativePath,
              title: title,
              classification: classification,
              sub_type: subType,
              date: date,
              fullPath: fullPath,
              classified_by: classifiedBy
            });
          }
        }
      } catch (e) {
        this._log(`Error scanning ${dir}: ${e.message}`);
      }
    };

    scanDir(orgPath);

    return { discovered, orgPath, exists: true };
  }

  /**
   * Initialize/backfill work index from discovered files
   *
   * @param {string} orgSlug - Organization identifier
   * @param {Object} options - Options
   * @param {boolean} [options.dryRun] - Preview only, don't save
   * @param {boolean} [options.rescan] - Overwrite existing entries for same files
   * @returns {{ success: boolean, added: Array, skipped: Array, error?: string }}
   */
  initFromScan(orgSlug, options = {}) {
    const { dryRun = false, rescan = false } = options;

    // Scan the org folder
    const scan = this.scanOrgFolder(orgSlug);

    if (!scan.exists) {
      return {
        success: false,
        error: `Org folder not found for: ${orgSlug}`,
        added: [],
        skipped: []
      };
    }

    if (scan.discovered.length === 0) {
      return {
        success: true,
        added: [],
        skipped: [],
        orgPath: scan.orgPath,
        message: 'No files found to backfill'
      };
    }

    // Load existing work index (or create new)
    const workIndex = this.loadWorkIndex(orgSlug);

    // Track which files are already in the index
    const existingFiles = new Set();
    for (const req of workIndex.requests) {
      if (req.deliverables) {
        for (const d of req.deliverables) {
          if (d.file) existingFiles.add(d.file);
        }
      }
      // Also check if the file was used as a source
      if (req.source_file) existingFiles.add(req.source_file);
    }

    const added = [];
    const skipped = [];

    for (const item of scan.discovered) {
      // Skip if already tracked (unless rescan)
      if (existingFiles.has(item.file) && !rescan) {
        skipped.push({ file: item.file, reason: 'Already tracked' });
        continue;
      }

      // Generate ID
      const sequence = workIndex.requests.filter(r =>
        r.id && r.id.startsWith(`WRK-${item.date.replace(/-/g, '')}`)
      ).length + added.filter(a =>
        a.request_date === item.date
      ).length + 1;
      const id = generateRequestId(item.date, sequence);

      const request = {
        id: id,
        request_date: item.date,
        title: item.title,
        classification: item.classification,
        sub_type: item.sub_type,
        status: 'completed',  // Backfilled items are assumed complete
        completed_at: item.date + 'T12:00:00Z',
        source_file: item.file,
        deliverables: [{
          file: item.file,
          type: path.extname(item.file).slice(1).toUpperCase() || 'FILE'
        }],
        _backfilled: true,  // Mark as backfilled
        _backfill_date: new Date().toISOString()
      };

      added.push(request);

      if (!dryRun) {
        workIndex.requests.push(request);
      }
    }

    // Save if not dry run
    if (!dryRun && added.length > 0) {
      const saveResult = this.saveWorkIndex(orgSlug, workIndex);
      if (!saveResult.success) {
        return { success: false, error: saveResult.error, added: [], skipped };
      }
    }

    return {
      success: true,
      added,
      skipped,
      orgPath: scan.orgPath,
      dryRun
    };
  }

  /**
   * Add a session reference to a work request (auto-capture only)
   *
   * @param {string} orgSlug - Organization identifier
   * @param {string} requestId - Request ID
   * @param {Object} sessionData - Session data { session_id, type?, summary? }
   * @returns {{ success: boolean, error?: string }}
   */
  addSession(orgSlug, requestId, sessionData) {
    const workIndex = this.loadWorkIndex(orgSlug);

    const request = workIndex.requests.find(r => r.id === requestId);
    if (!request) {
      return { success: false, error: `Request not found: ${requestId}` };
    }

    if (!request.sessions) {
      request.sessions = [];
    }

    // Check for duplicate session
    if (request.sessions.some(s => s.session_id === sessionData.session_id)) {
      this._log(`Session ${sessionData.session_id} already exists, skipping`);
      return { success: true };
    }

    request.sessions.push({
      session_id: sessionData.session_id,
      date: new Date().toISOString().slice(0, 10),
      type: sessionData.type || (request.sessions.length === 0 ? 'initial' : 'continuation'),
      summary: sessionData.summary || ''
    });

    const saveResult = this.saveWorkIndex(orgSlug, workIndex);
    return { success: saveResult.success, error: saveResult.error };
  }

  /**
   * List work requests for an organization
   *
   * @param {string} orgSlug - Organization identifier
   * @param {Object} filters - Filter options
   * @param {string} [filters.status] - Filter by status
   * @param {string} [filters.classification] - Filter by classification
   * @param {string} [filters.since] - Filter by date (YYYY-MM or YYYY-MM-DD)
   * @param {number} [filters.limit] - Maximum results
   * @returns {Object[]} Filtered list of requests
   */
  listRequests(orgSlug, filters = {}) {
    const workIndex = this.loadWorkIndex(orgSlug);
    let requests = [...workIndex.requests];

    // Filter by status
    if (filters.status) {
      requests = requests.filter(r => r.status === filters.status);
    }

    // Filter by classification
    if (filters.classification) {
      requests = requests.filter(r => r.classification === filters.classification);
    }

    // Filter by date
    if (filters.since) {
      requests = requests.filter(r => r.request_date >= filters.since);
    }

    // Sort by date descending
    requests.sort((a, b) => b.request_date.localeCompare(a.request_date));

    // Apply limit
    if (filters.limit) {
      requests = requests.slice(0, filters.limit);
    }

    return requests;
  }

  /**
   * Search work requests across orgs
   *
   * @param {string} query - Search query
   * @param {Object} options - Search options
   * @param {string} [options.org] - Limit to specific org
   * @param {string} [options.classification] - Filter by classification
   * @returns {Object[]} Matching requests with org context
   */
  searchRequests(query, options = {}) {
    const queryLower = query.toLowerCase();
    const results = [];

    const orgs = options.org ? [options.org] : this.listOrgs();

    for (const orgSlug of orgs) {
      const workIndex = this.loadWorkIndex(orgSlug);

      for (const request of workIndex.requests) {
        // Filter by classification if specified
        if (options.classification && request.classification !== options.classification) {
          continue;
        }

        // Search in title, abstract, tags, key_findings
        const searchFields = [
          request.title,
          request.abstract,
          ...(request.tags || []),
          ...(request.key_findings || [])
        ].filter(Boolean).join(' ').toLowerCase();

        if (searchFields.includes(queryLower)) {
          results.push({ org: orgSlug, ...request });
        }
      }
    }

    // Sort by date descending
    results.sort((a, b) => b.request_date.localeCompare(a.request_date));

    return results;
  }

  /**
   * Get recent work and follow-ups for context loading
   *
   * @param {string} orgSlug - Organization identifier
   * @param {Object} options - Options
   * @param {number} [options.recentLimit=5] - Number of recent items
   * @returns {{ recent: Object[], followUps: Object[], inProgress: Object[] }}
   */
  getContext(orgSlug, options = {}) {
    const recentLimit = options.recentLimit || 5;
    const workIndex = this.loadWorkIndex(orgSlug);

    // Get recent completed work
    const recent = workIndex.requests
      .filter(r => r.status === 'completed')
      .sort((a, b) => b.request_date.localeCompare(a.request_date))
      .slice(0, recentLimit);

    // Get items needing follow-up
    const followUps = workIndex.requests.filter(r =>
      r.status === 'follow-up-needed' ||
      (r.follow_up_actions && r.follow_up_actions.length > 0 && r.status !== 'completed')
    );

    // Get in-progress items
    const inProgress = workIndex.requests.filter(r => r.status === 'in-progress');

    return { recent, followUps, inProgress };
  }

  /**
   * Generate a summary report for an organization
   *
   * @param {string} orgSlug - Organization identifier
   * @param {Object} options - Options
   * @param {string} [options.format='markdown'] - Output format (markdown|json)
   * @param {string} [options.since] - Filter by date
   * @returns {string} Summary report
   */
  generateSummary(orgSlug, options = {}) {
    const format = options.format || 'markdown';
    const workIndex = this.loadWorkIndex(orgSlug);

    let requests = [...workIndex.requests];
    if (options.since) {
      requests = requests.filter(r => r.request_date >= options.since);
    }

    // Calculate stats
    const stats = {
      total: requests.length,
      byStatus: {},
      byClassification: {},
      totalHours: 0
    };

    for (const request of requests) {
      stats.byStatus[request.status] = (stats.byStatus[request.status] || 0) + 1;
      stats.byClassification[request.classification] = (stats.byClassification[request.classification] || 0) + 1;
      if (request.actual_hours) {
        stats.totalHours += request.actual_hours;
      }
    }

    if (format === 'json') {
      return JSON.stringify({
        org: orgSlug,
        period: options.since ? `Since ${options.since}` : 'All time',
        stats,
        requests: requests.slice(0, 20) // Last 20
      }, null, 2);
    }

    // Markdown format
    let md = `# Work Summary: ${orgSlug}\n\n`;
    md += `**Period**: ${options.since ? `Since ${options.since}` : 'All time'}\n`;
    md += `**Total Requests**: ${stats.total}\n`;
    md += `**Total Hours**: ${stats.totalHours.toFixed(1)}\n\n`;

    md += `## By Status\n\n`;
    for (const [status, count] of Object.entries(stats.byStatus)) {
      md += `- ${STATUS_VALUES[status]?.label || status}: ${count}\n`;
    }

    md += `\n## By Classification\n\n`;
    for (const [classification, count] of Object.entries(stats.byClassification)) {
      md += `- ${CLASSIFICATION_TAXONOMY[classification]?.label || classification}: ${count}\n`;
    }

    md += `\n## Recent Work\n\n`;
    const recent = requests.slice(0, 10);
    for (const request of recent) {
      md += `### ${request.title}\n`;
      md += `- **ID**: ${request.id}\n`;
      md += `- **Date**: ${request.request_date}\n`;
      md += `- **Status**: ${request.status}\n`;
      md += `- **Classification**: ${request.classification}${request.sub_type ? ` / ${request.sub_type}` : ''}\n`;
      if (request.abstract) {
        md += `- **Summary**: ${request.abstract}\n`;
      }
      md += '\n';
    }

    return md;
  }

  /**
   * Find the most recent in-progress request for potential session linking
   *
   * @param {string} orgSlug - Organization identifier
   * @returns {Object|null} Most recent in-progress request or null
   */
  findActiveRequest(orgSlug) {
    const workIndex = this.loadWorkIndex(orgSlug);

    const active = workIndex.requests
      .filter(r => r.status === 'in-progress')
      .sort((a, b) => {
        const aDate = a.started_at || a.request_date;
        const bDate = b.started_at || b.request_date;
        return bDate.localeCompare(aDate);
      });

    return active[0] || null;
  }
}

// CLI execution
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];

  const manager = new WorkIndexManager({
    verbose: process.env.WORK_INDEX_VERBOSE === '1'
  });

  // Parse flags
  function getFlag(name, defaultValue = null) {
    const index = args.indexOf(`--${name}`);
    if (index === -1) return defaultValue;
    return args[index + 1] || defaultValue;
  }

  function hasFlag(name) {
    return args.includes(`--${name}`);
  }

  switch (command) {
    case 'list': {
      const org = args[1];
      if (!org) {
        console.error('Usage: node work-index-manager.js list <org> [--status <status>] [--since <date>]');
        process.exit(1);
      }

      const filters = {
        status: getFlag('status'),
        classification: getFlag('type'),
        since: getFlag('since'),
        limit: getFlag('limit') ? parseInt(getFlag('limit')) : null
      };

      const requests = manager.listRequests(org, filters);

      if (hasFlag('json')) {
        console.log(JSON.stringify(requests, null, 2));
      } else {
        console.log(`Work requests for ${org}:\n`);
        if (requests.length === 0) {
          console.log('  (no requests found)');
        } else {
          for (const r of requests) {
            console.log(`  ${r.id}: ${r.title}`);
            console.log(`    Status: ${r.status} | Classification: ${r.classification}`);
            if (r.abstract) console.log(`    ${r.abstract.slice(0, 80)}...`);
            console.log('');
          }
        }
      }
      break;
    }

    case 'search': {
      const query = args[1];
      if (!query) {
        console.error('Usage: node work-index-manager.js search <query> [--org <org>] [--type <classification>]');
        process.exit(1);
      }

      const options = {
        org: getFlag('org'),
        classification: getFlag('type')
      };

      const results = manager.searchRequests(query, options);

      if (hasFlag('json')) {
        console.log(JSON.stringify(results, null, 2));
      } else {
        console.log(`Search results for "${query}":\n`);
        if (results.length === 0) {
          console.log('  (no matches found)');
        } else {
          for (const r of results) {
            console.log(`  [${r.org}] ${r.id}: ${r.title}`);
            console.log(`    Status: ${r.status} | Date: ${r.request_date}`);
            console.log('');
          }
        }
      }
      break;
    }

    case 'add': {
      const org = args[1];
      const title = getFlag('title');
      const classification = getFlag('classification');

      if (!org || !title || !classification) {
        console.error('Usage: node work-index-manager.js add <org> --title "..." --classification <type> [--sub-type <subtype>] [--abstract "..."]');
        process.exit(1);
      }

      const requestData = {
        title,
        classification,
        sub_type: getFlag('sub-type'),
        abstract: getFlag('abstract'),
        platforms: getFlag('platforms') ? getFlag('platforms').split(',') : [],
        tags: getFlag('tags') ? getFlag('tags').split(',') : []
      };

      const result = manager.addRequest(org, requestData);

      if (result.success) {
        console.log(`Created work request: ${result.request.id}`);
        console.log(JSON.stringify(result.request, null, 2));
      } else {
        console.error(`Failed to create request: ${result.error}`);
        process.exit(1);
      }
      break;
    }

    case 'update': {
      const org = args[1];
      const requestId = args[2];

      if (!org || !requestId) {
        console.error('Usage: node work-index-manager.js update <org> <request-id> --status <status> [--abstract "..."]');
        process.exit(1);
      }

      const updates = {};
      if (getFlag('status')) updates.status = getFlag('status');
      if (getFlag('abstract')) updates.abstract = getFlag('abstract');
      if (getFlag('title')) updates.title = getFlag('title');

      if (Object.keys(updates).length === 0) {
        console.error('No updates specified');
        process.exit(1);
      }

      const result = manager.updateRequest(org, requestId, updates);

      if (result.success) {
        console.log(`Updated request: ${requestId}`);
        console.log(JSON.stringify(result.request, null, 2));
      } else {
        console.error(`Failed to update: ${result.error}`);
        process.exit(1);
      }
      break;
    }

    case 'summary': {
      const org = args[1];
      if (!org) {
        console.error('Usage: node work-index-manager.js summary <org> [--format markdown|json] [--since <date>]');
        process.exit(1);
      }

      const options = {
        format: getFlag('format', 'markdown'),
        since: getFlag('since')
      };

      console.log(manager.generateSummary(org, options));
      break;
    }

    case 'context': {
      const org = args[1];
      if (!org) {
        console.error('Usage: node work-index-manager.js context <org>');
        process.exit(1);
      }

      const context = manager.getContext(org);

      if (hasFlag('json')) {
        console.log(JSON.stringify(context, null, 2));
      } else {
        if (context.inProgress.length > 0) {
          console.log('In Progress:');
          for (const r of context.inProgress) {
            console.log(`  - ${r.id}: ${r.title}`);
          }
          console.log('');
        }

        if (context.followUps.length > 0) {
          console.log('Follow-ups Needed:');
          for (const r of context.followUps) {
            console.log(`  - ${r.id}: ${r.title}`);
            if (r.follow_up_actions) {
              for (const action of r.follow_up_actions) {
                console.log(`      -> ${action}`);
              }
            }
          }
          console.log('');
        }

        if (context.recent.length > 0) {
          console.log('Recent Work:');
          for (const r of context.recent) {
            console.log(`  - ${r.id}: ${r.title} (${r.request_date})`);
          }
        }

        if (context.inProgress.length === 0 && context.followUps.length === 0 && context.recent.length === 0) {
          console.log('No work history found for this org.');
        }
      }
      break;
    }

    case 'orgs': {
      const orgs = manager.listOrgs();
      if (hasFlag('json')) {
        console.log(JSON.stringify(orgs, null, 2));
      } else {
        console.log('Organizations with work indexes:');
        if (orgs.length === 0) {
          console.log('  (none found)');
        } else {
          for (const org of orgs) {
            console.log(`  - ${org}`);
          }
        }
      }
      break;
    }

    case 'dashboard': {
      // Generate a summary dashboard across all orgs
      const orgs = manager.listOrgs();

      if (orgs.length === 0) {
        console.log('No work indexes found. Use `/work-index init <org>` to create one.');
        break;
      }

      // Collect stats across all orgs
      const stats = {
        totalOrgs: orgs.length,
        totalRequests: 0,
        byStatus: {},
        byClassification: {},
        recentWork: [],
        pendingFollowUps: []
      };

      for (const orgSlug of orgs) {
        const workIndex = manager.loadWorkIndex(orgSlug);

        for (const r of workIndex.requests) {
          stats.totalRequests++;
          stats.byStatus[r.status] = (stats.byStatus[r.status] || 0) + 1;
          stats.byClassification[r.classification] = (stats.byClassification[r.classification] || 0) + 1;

          // Track recent work (last 30 days)
          const requestDate = new Date(r.request_date);
          const daysAgo = Math.floor((Date.now() - requestDate) / (1000 * 60 * 60 * 24));
          if (daysAgo <= 30) {
            stats.recentWork.push({ org: orgSlug, ...r });
          }

          // Track pending follow-ups
          if (r.status === 'follow-up-needed' || r.status === 'in-progress') {
            stats.pendingFollowUps.push({ org: orgSlug, ...r });
          }
        }
      }

      // Sort recent work by date
      stats.recentWork.sort((a, b) => b.request_date.localeCompare(a.request_date));
      stats.recentWork = stats.recentWork.slice(0, 10);

      if (hasFlag('json')) {
        console.log(JSON.stringify(stats, null, 2));
      } else {
        console.log('');
        console.log('╔════════════════════════════════════════════════════════════╗');
        console.log('║           WORK INDEX DASHBOARD                             ║');
        console.log('╚════════════════════════════════════════════════════════════╝');
        console.log('');
        console.log(`Organizations: ${stats.totalOrgs}    Total Requests: ${stats.totalRequests}`);
        console.log('');

        console.log('─── By Status ────────────────────────────────────────────────');
        for (const [status, count] of Object.entries(stats.byStatus)) {
          const icon = status === 'completed' ? '✅' : status === 'in-progress' ? '🔄' : status === 'follow-up-needed' ? '⚠️' : '📋';
          console.log(`  ${icon} ${status}: ${count}`);
        }
        console.log('');

        console.log('─── By Classification ────────────────────────────────────────');
        for (const [cls, count] of Object.entries(stats.byClassification)) {
          console.log(`  • ${cls}: ${count}`);
        }
        console.log('');

        if (stats.pendingFollowUps.length > 0) {
          console.log('─── Needs Attention ──────────────────────────────────────────');
          for (const r of stats.pendingFollowUps.slice(0, 5)) {
            const icon = r.status === 'in-progress' ? '🔄' : '⚠️';
            console.log(`  ${icon} [${r.org}] ${r.id}: ${r.title}`);
          }
          if (stats.pendingFollowUps.length > 5) {
            console.log(`  ... and ${stats.pendingFollowUps.length - 5} more`);
          }
          console.log('');
        }

        if (stats.recentWork.length > 0) {
          console.log('─── Recent Work (30 days) ────────────────────────────────────');
          for (const r of stats.recentWork) {
            console.log(`  • [${r.org}] ${r.title} (${r.request_date})`);
          }
          console.log('');
        }

        console.log('══════════════════════════════════════════════════════════════');
      }
      break;
    }

    case 'init': {
      const org = args[1];
      if (!org) {
        console.error('Usage: node work-index-manager.js init <org> [--dry-run] [--rescan] [--interactive]');
        process.exit(1);
      }

      const dryRun = hasFlag('dry-run');
      const rescan = hasFlag('rescan');
      const interactive = hasFlag('interactive') || hasFlag('i');

      if (dryRun) {
        console.log('DRY RUN - No changes will be made\n');
      }

      // If interactive mode, run the interactive flow (wrapped in async IIFE)
      if (interactive) {
        (async () => {
          const readline = require('readline');
          const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
          });

          const question = (prompt) => new Promise(resolve => rl.question(prompt, resolve));

          console.log(`Interactive mode - scanning org folder for: ${org}\n`);

          // First do a scan
          const scan = manager.scanOrgFolder(org);
          if (!scan.exists) {
            console.error(`Error: Org folder not found for: ${org}`);
            rl.close();
            process.exit(1);
          }

          if (scan.discovered.length === 0) {
            console.log('No files found to index.');
            rl.close();
            return;
          }

          console.log(`Found ${scan.discovered.length} files. Let's review each one.\n`);
          console.log('Commands: [Enter] accept, [s]kip, [c]hange classification, [q]uit\n');

          const accepted = [];
          const classifications = Object.keys(CLASSIFICATION_TAXONOMY);
          let quit = false;

          for (let i = 0; i < scan.discovered.length; i++) {
            if (quit) break;
            const file = scan.discovered[i];
            console.log(`\n[${i + 1}/${scan.discovered.length}] ${file.file}`);
            console.log(`  Title: ${file.title}`);
            console.log(`  Classification: ${file.classification}/${file.sub_type} (${file.classified_by || 'auto'})`);

            const answer = await question('  Action [Enter/s/c/q]: ');

            if (answer.toLowerCase() === 'q') {
              console.log('\nQuitting...');
              quit = true;
              break;
            } else if (answer.toLowerCase() === 's') {
              console.log('  Skipped.');
              continue;
            } else if (answer.toLowerCase() === 'c') {
              console.log(`  Classifications: ${classifications.join(', ')}`);
              const newClass = await question('  New classification: ');
              if (classifications.includes(newClass)) {
                const subTypes = CLASSIFICATION_TAXONOMY[newClass]?.sub_types || [];
                console.log(`  Sub-types: ${subTypes.join(', ')}`);
                const newSubType = await question('  New sub-type: ');
                file.classification = newClass;
                file.sub_type = subTypes.includes(newSubType) ? newSubType : subTypes[0] || newSubType;
                console.log(`  Changed to: ${file.classification}/${file.sub_type}`);
              } else {
                console.log('  Invalid classification, keeping original.');
              }
            }

            // Accept the entry
            accepted.push(file);
            console.log('  Accepted.');
          }

          rl.close();

          if (accepted.length === 0) {
            console.log('\nNo entries accepted.');
            return;
          }

          console.log(`\n${dryRun ? 'Would add' : 'Adding'} ${accepted.length} entries...`);

          if (!dryRun) {
            // Load or create work index and add entries
            const loadResult = manager.load(org);
            const workIndex = loadResult || createEmptyWorkIndex(org);

            for (const file of accepted) {
              const requestId = generateRequestId(new Date(file.date));
              const entry = {
                id: requestId,
                title: file.title,
                classification: file.classification,
                sub_type: file.sub_type,
                status: 'completed',
                request_date: file.date,
                deliverables: [{
                  name: path.basename(file.file),
                  type: path.extname(file.file).slice(1) || 'unknown',
                  path: file.file
                }],
                sessions: [],
                metadata: { source: 'init-interactive' }
              };

              workIndex.work_requests.push(entry);
              console.log(`  + ${entry.id}: ${entry.title}`);
            }

            manager.save(org, workIndex);
            console.log(`\n✅ Work index updated for ${org}`);
          }
        })();
        break;
      }

      // Non-interactive mode (original behavior)
      console.log(`Scanning org folder for: ${org}\n`);

      const result = manager.initFromScan(org, { dryRun, rescan });

      if (!result.success) {
        console.error(`Error: ${result.error}`);
        process.exit(1);
      }

      if (hasFlag('json')) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(`Org folder: ${result.orgPath}\n`);

        if (result.added.length > 0) {
          console.log(`${dryRun ? 'Would add' : 'Added'} ${result.added.length} entries:\n`);
          for (const entry of result.added) {
            console.log(`  + ${entry.id}: ${entry.title}`);
            console.log(`    Classification: ${entry.classification}/${entry.sub_type}`);
            console.log(`    File: ${entry.source_file}\n`);
          }
        } else {
          console.log('No new entries to add.');
        }

        if (result.skipped.length > 0) {
          console.log(`\nSkipped ${result.skipped.length} files (already tracked):`);
          for (const skip of result.skipped.slice(0, 5)) {
            console.log(`  - ${skip.file}`);
          }
          if (result.skipped.length > 5) {
            console.log(`  ... and ${result.skipped.length - 5} more`);
          }
        }

        if (!dryRun && result.added.length > 0) {
          console.log(`\n✅ Work index updated for ${org}`);
        }
      }
      break;
    }

    default:
      console.log('Work Index Manager');
      console.log('\nUsage:');
      console.log('  node work-index-manager.js list <org> [--status <status>] [--since <date>]');
      console.log('  node work-index-manager.js search <query> [--org <org>] [--type <classification>]');
      console.log('  node work-index-manager.js add <org> --title "..." --classification <type>');
      console.log('  node work-index-manager.js update <org> <request-id> --status <status>');
      console.log('  node work-index-manager.js summary <org> [--format markdown|json]');
      console.log('  node work-index-manager.js context <org>');
      console.log('  node work-index-manager.js orgs');
      console.log('  node work-index-manager.js dashboard');
      console.log('  node work-index-manager.js init <org> [--dry-run] [--rescan] [--interactive]');
      console.log('\nDashboard:');
      console.log('  dashboard - Show work summary across all orgs');
      console.log('\nBackfill:');
      console.log('  init    - Scan org folder and backfill work index from discovered files');
      console.log('            Use --dry-run to preview, --rescan to re-process existing files');
      console.log('            Use --interactive (-i) to review each file before adding');
      console.log('\nAdd --json flag to most commands for JSON output.');
  }
}

module.exports = {
  WorkIndexManager
};
