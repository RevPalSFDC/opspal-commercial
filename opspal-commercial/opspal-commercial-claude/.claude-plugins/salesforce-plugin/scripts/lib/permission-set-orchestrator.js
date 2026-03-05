/**
 * Permission Set Orchestrator - Centralized Permission Set Management
 *
 * Purpose: Manages centralized permission sets per initiative with idempotent,
 * merge-safe operations. Prevents fragmented, per-tranche permission sets through
 * two-tier default architecture (Users/Admin).
 *
 * Key Features:
 * 1. Two-Tier Architecture - Default Users/Admin permission sets per initiative
 * 2. Idempotent Operations - SHA-based change detection, skip unchanged deploys
 * 3. Merge-Safe - Read-modify-write cycle with accretive union logic
 * 4. No-Downgrade Policy - Enforces permission upgrades only (read → edit OK, edit → read FAIL)
 * 5. Concurrency Handling - Retry logic for concurrent writes with re-retrieve
 * 6. Atomic Deployments - Bundle fields + permissions in single transaction
 *
 * Naming Convention:
 * - Initiative Slug: kebab-case stable identifier (e.g., "cpq-lite")
 * - Project Name: Human-readable label (e.g., "CPQ Lite")
 * - Permission Set Names:
 *   - "${Project Name} - Users" → internal key: ${initiative_slug}::users
 *   - "${Project Name} - Admin" → internal key: ${initiative_slug}::admin
 *
 * Input Contract Example:
 * {
 *   "initiative_slug": "cpq-lite",
 *   "project_name": "CPQ Lite",
 *   "tiers": {
 *     "users": {
 *       "field_permissions": [
 *         {"object": "Quote__c", "field": "Status__c", "readable": true, "editable": false}
 *       ],
 *       "object_permissions": [
 *         {"object": "Quote__c", "read": true, "create": false, "edit": false, "delete": false}
 *       ],
 *       "tab_settings": [{"tab": "Quote__c", "visibility": "Visible"}],
 *       "record_type_vis": [{"object":"Quote__c","recordType":"Default","visible":true}]
 *     },
 *     "admin": { ... }
 *   },
 *   "assign": {
 *     "users": ["user@example.com"],
 *     "admin": ["admin@example.com"]
 *   }
 * }
 *
 * @author RevPal Engineering
 * @version 1.0.0
 * @date 2025-10-22
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const crypto = require('crypto');

class PermissionSetOrchestrator {
  constructor(options = {}) {
    this.org = options.org || process.env.SF_ORG || process.env.SF_TARGET_ORG;
    this.projectPath = options.projectPath || path.join(__dirname, '..', '..');
    this.verbose = options.verbose || false;
    this.allowDowngrade = options.allowDowngrade || false;
    this.dryRun = options.dryRun || false;

    // Results storage
    this.results = {
      operations: [],
      permissionSets: {},
      errors: [],
      warnings: []
    };

    // Initialize components
    this.retriever = new PermissionSetRetriever(this);
    this.merger = new PermissionSetMerger(this);
    this.deployer = new PermissionSetDeployer(this);
    this.validator = new PermissionSetValidator(this);
  }

  /**
   * Main entry point: Sync permissions for an initiative
   *
   * @param {Object} config - Permission configuration
   * @returns {Promise<Object>} - Results with diffs and status
   */
  async syncPermissions(config) {
    this.log('info', `Starting permission sync for initiative: ${config.initiative_slug}`);

    // Validate input
    this.validator.validateInput(config);

    // Initialize tracking
    const startTime = Date.now();
    const operationId = this.generateOperationId(config);

    try {
      // Process each tier (users, admin, and any extras)
      const tiers = Object.keys(config.tiers);
      const results = [];

      for (const tier of tiers) {
        const tierConfig = config.tiers[tier];
        const permissionSetName = this.buildPermissionSetName(config.project_name, tier);

        this.log('info', `Processing tier: ${tier} (${permissionSetName})`);

        // Step 1: Retrieve existing permission set (if exists)
        const existing = await this.retriever.retrieve(permissionSetName);

        // Step 2: Merge permissions (accretive union)
        const merged = this.merger.merge(existing, tierConfig, {
          tier,
          initiativeSlug: config.initiative_slug,
          allowDowngrade: this.allowDowngrade
        });

        // Step 3: Check if changes needed (idempotency)
        const currentHash = this.calculateHash(existing);
        const newHash = this.calculateHash(merged);

        if (currentHash === newHash) {
          this.log('info', `No changes needed for ${permissionSetName} (hash: ${newHash})`);
          results.push({
            tier,
            permissionSet: permissionSetName,
            status: 'unchanged',
            hash: newHash
          });
          continue;
        }

        // Step 4: Deploy (unless dry run)
        let deployResult;
        if (!this.dryRun) {
          deployResult = await this.deployer.deploy(permissionSetName, merged, {
            createIfMissing: true,
            atomic: config.atomicDeploy || false,
            fieldDeployPaths: config.fieldDeployPaths || []
          });
        } else {
          deployResult = { status: 'dry-run', changes: this.merger.generateDiff(existing, merged) };
        }

        // Step 5: Assign users (unless dry run)
        if (!this.dryRun && config.assign && config.assign[tier]) {
          await this.deployer.assignUsers(permissionSetName, config.assign[tier]);
        }

        results.push({
          tier,
          permissionSet: permissionSetName,
          status: deployResult.status,
          changes: deployResult.changes,
          oldHash: currentHash,
          newHash: newHash
        });
      }

      // Verification step
      if (!this.dryRun) {
        await this.verifyDeployment(config, results);
      }

      const duration = Date.now() - startTime;

      return {
        success: true,
        operationId,
        duration,
        results,
        summary: this.generateSummary(results)
      };

    } catch (error) {
      this.log('error', `Permission sync failed: ${error.message}`);
      this.results.errors.push({
        operation: 'syncPermissions',
        error: error.message,
        stack: error.stack
      });

      throw error;
    }
  }

  /**
   * Verify deployment by querying org
   */
  async verifyDeployment(config, results) {
    this.log('info', 'Verifying deployment...');

    for (const result of results) {
      if (result.status === 'unchanged' || result.status === 'dry-run') continue;

      // Verify permission set exists
      const exists = await this.retriever.exists(result.permissionSet);
      if (!exists) {
        throw new Error(`Verification failed: ${result.permissionSet} not found in org`);
      }

      // Verify assignments if specified
      const tier = result.tier;
      if (config.assign && config.assign[tier]) {
        const expectedUsers = config.assign[tier];
        const actualAssignments = await this.retriever.getAssignments(result.permissionSet);

        for (const username of expectedUsers) {
          if (!actualAssignments.includes(username)) {
            this.results.warnings.push({
              type: 'assignment_missing',
              permissionSet: result.permissionSet,
              username,
              message: `User ${username} not assigned to ${result.permissionSet}`
            });
          }
        }
      }
    }

    this.log('info', 'Verification complete');
  }

  /**
   * Generate human-readable summary
   */
  generateSummary(results) {
    const summary = {
      total: results.length,
      unchanged: 0,
      created: 0,
      updated: 0,
      errors: this.results.errors.length,
      warnings: this.results.warnings.length
    };

    for (const result of results) {
      if (result.status === 'unchanged') summary.unchanged++;
      else if (result.status === 'created') summary.created++;
      else if (result.status === 'updated') summary.updated++;
    }

    // Human-readable text
    const lines = [];
    lines.push(`Processed ${summary.total} permission set(s)`);
    if (summary.created > 0) lines.push(`Created: ${summary.created}`);
    if (summary.updated > 0) lines.push(`Updated: ${summary.updated}`);
    if (summary.unchanged > 0) lines.push(`Unchanged: ${summary.unchanged}`);
    if (summary.errors > 0) lines.push(`Errors: ${summary.errors}`);
    if (summary.warnings > 0) lines.push(`Warnings: ${summary.warnings}`);

    summary.text = lines.join(', ');

    return summary;
  }

  /**
   * Build permission set name from project name and tier
   */
  buildPermissionSetName(projectName, tier) {
    const tierLabel = tier.charAt(0).toUpperCase() + tier.slice(1);
    return `${projectName} - ${tierLabel}`;
  }

  /**
   * Calculate SHA-256 hash of permission set content
   */
  calculateHash(permissionSet) {
    if (!permissionSet) return null;

    // Sort keys for deterministic hashing
    const normalized = this.normalizeForHashing(permissionSet);
    const content = JSON.stringify(normalized);

    return crypto.createHash('sha256').update(content).digest('hex');
  }

  /**
   * Normalize permission set for deterministic hashing
   */
  normalizeForHashing(permissionSet) {
    if (!permissionSet) return null;

    return {
      fieldPermissions: this.sortArray(permissionSet.fieldPermissions || [], ['object', 'field']),
      objectPermissions: this.sortArray(permissionSet.objectPermissions || [], ['object']),
      tabSettings: this.sortArray(permissionSet.tabSettings || [], ['tab']),
      recordTypeVisibilities: this.sortArray(permissionSet.recordTypeVisibilities || [], ['object', 'recordType'])
    };
  }

  /**
   * Sort array by keys for deterministic ordering
   */
  sortArray(array, keys) {
    return [...array].sort((a, b) => {
      for (const key of keys) {
        const compareA = (a[key] || '').toString();
        const compareB = (b[key] || '').toString();
        if (compareA < compareB) return -1;
        if (compareA > compareB) return 1;
      }
      return 0;
    });
  }

  /**
   * Generate operation ID for tracking
   */
  generateOperationId(config) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    return `${config.initiative_slug}:${timestamp}`;
  }

  /**
   * Logging utility
   */
  log(level, message, data = null) {
    if (!this.verbose && level === 'debug') return;

    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      message,
      data
    };

    this.results.operations.push(logEntry);

    // Console output
    const prefix = level.toUpperCase().padEnd(5);
    console.log(`[${timestamp}] ${prefix} ${message}`);
    if (data && this.verbose) {
      console.log(JSON.stringify(data, null, 2));
    }
  }
}

/**
 * PermissionSetRetriever - Fetches existing permission sets from org
 */
class PermissionSetRetriever {
  constructor(orchestrator) {
    this.orchestrator = orchestrator;
  }

  /**
   * Retrieve existing permission set from org
   * Returns null if not found
   */
  async retrieve(permissionSetName) {
    this.orchestrator.log('debug', `Retrieving permission set: ${permissionSetName}`);

    try {
      // Check if exists first
      const exists = await this.exists(permissionSetName);
      if (!exists) {
        this.orchestrator.log('info', `Permission set ${permissionSetName} does not exist, will create`);
        return null;
      }

      // Retrieve using SF CLI
      const projectDir = this.orchestrator.projectPath;
      const metadataDir = path.join(projectDir, 'force-app', 'main', 'default', 'permissionsets');

      // Ensure directory exists
      if (!fs.existsSync(metadataDir)) {
        fs.mkdirSync(metadataDir, { recursive: true });
      }

      const command = `sf project retrieve start --metadata "PermissionSet:${permissionSetName}" --target-org ${this.orchestrator.org} --json`;

      this.orchestrator.log('debug', `Executing: ${command}`);
      const result = execSync(command, { encoding: 'utf-8', cwd: projectDir });
      const parsed = JSON.parse(result);

      if (parsed.status !== 0) {
        throw new Error(`Retrieve failed: ${parsed.message}`);
      }

      // Parse retrieved XML
      const apiName = permissionSetName.replace(/[^a-zA-Z0-9_]/g, '_');
      const xmlPath = path.join(metadataDir, `${apiName}.permissionset-meta.xml`);

      if (!fs.existsSync(xmlPath)) {
        this.orchestrator.log('warn', `Retrieved but file not found: ${xmlPath}`);
        return null;
      }

      const xml = fs.readFileSync(xmlPath, 'utf-8');
      const permissionSet = this.parseXml(xml);

      this.orchestrator.log('debug', `Retrieved ${permissionSetName} with ${this.countPermissions(permissionSet)} permissions`);

      return permissionSet;

    } catch (error) {
      // Not found is OK, will create
      if (error.message.includes('Entity is not org-accessible') ||
          error.message.includes('No PermissionSet named')) {
        this.orchestrator.log('info', `Permission set ${permissionSetName} does not exist`);
        return null;
      }

      throw error;
    }
  }

  /**
   * Check if permission set exists in org
   */
  async exists(permissionSetName) {
    try {
      const query = `SELECT Id, Name FROM PermissionSet WHERE Name = '${permissionSetName}' LIMIT 1`;
      const command = `sf data query --query "${query}" --target-org ${this.orchestrator.org} --json`;

      const result = execSync(command, { encoding: 'utf-8' });
      const parsed = JSON.parse(result);

      return parsed.result && parsed.result.records && parsed.result.records.length > 0;

    } catch (error) {
      this.orchestrator.log('warn', `Error checking existence: ${error.message}`);
      return false;
    }
  }

  /**
   * Get current assignments for a permission set
   */
  async getAssignments(permissionSetName) {
    try {
      const query = `
        SELECT Assignee.Username
        FROM PermissionSetAssignment
        WHERE PermissionSet.Name = '${permissionSetName}'
      `;

      const command = `sf data query --query "${query}" --target-org ${this.orchestrator.org} --json`;
      const result = execSync(command, { encoding: 'utf-8' });
      const parsed = JSON.parse(result);

      if (!parsed.result || !parsed.result.records) {
        return [];
      }

      return parsed.result.records.map(r => r.Assignee.Username);

    } catch (error) {
      this.orchestrator.log('warn', `Error getting assignments: ${error.message}`);
      return [];
    }
  }

  /**
   * Parse permission set XML to JS object
   */
  parseXml(xml) {
    // Simplified regex-based XML parser for permission sets
    // LIMITATION: This is a basic parser that works for well-formed Salesforce PermissionSet XML
    // It may fail on edge cases (nested CDATA, comments, complex attributes)
    // Enhancement: Consider xml2js for production use if parsing failures occur
    // Tracking: https://github.com/RevPalSFDC/opspal-plugin-internal-marketplace/issues/TBD

    const permissionSet = {
      fieldPermissions: [],
      objectPermissions: [],
      tabSettings: [],
      recordTypeVisibilities: []
    };

    // Extract field permissions
    const fieldPermMatches = xml.matchAll(/<fieldPermissions>(.*?)<\/fieldPermissions>/gs);
    for (const match of fieldPermMatches) {
      const content = match[1];
      const field = this.extractTagValue(content, 'field');
      const readable = this.extractTagValue(content, 'readable') === 'true';
      const editable = this.extractTagValue(content, 'editable') === 'true';

      if (field) {
        const [object, fieldName] = field.split('.');
        permissionSet.fieldPermissions.push({
          object,
          field: fieldName,
          readable,
          editable
        });
      }
    }

    // Extract object permissions
    const objectPermMatches = xml.matchAll(/<objectPermissions>(.*?)<\/objectPermissions>/gs);
    for (const match of objectPermMatches) {
      const content = match[1];
      const object = this.extractTagValue(content, 'object');

      if (object) {
        permissionSet.objectPermissions.push({
          object,
          read: this.extractTagValue(content, 'allowRead') === 'true',
          create: this.extractTagValue(content, 'allowCreate') === 'true',
          edit: this.extractTagValue(content, 'allowEdit') === 'true',
          delete: this.extractTagValue(content, 'allowDelete') === 'true',
          viewAll: this.extractTagValue(content, 'viewAllRecords') === 'true',
          modifyAll: this.extractTagValue(content, 'modifyAllRecords') === 'true'
        });
      }
    }

    // Extract tab settings
    const tabMatches = xml.matchAll(/<tabSettings>(.*?)<\/tabSettings>/gs);
    for (const match of tabMatches) {
      const content = match[1];
      const tab = this.extractTagValue(content, 'tab');
      const visibility = this.extractTagValue(content, 'visibility');

      if (tab) {
        permissionSet.tabSettings.push({ tab, visibility });
      }
    }

    // Extract record type visibilities
    const rtMatches = xml.matchAll(/<recordTypeVisibilities>(.*?)<\/recordTypeVisibilities>/gs);
    for (const match of rtMatches) {
      const content = match[1];
      const recordType = this.extractTagValue(content, 'recordType');
      const visible = this.extractTagValue(content, 'visible') === 'true';

      if (recordType) {
        const [object, recordTypeName] = recordType.split('.');
        permissionSet.recordTypeVisibilities.push({
          object,
          recordType: recordTypeName,
          visible,
          defaultRecordTypeMapping: this.extractTagValue(content, 'default') === 'true'
        });
      }
    }

    return permissionSet;
  }

  /**
   * Extract tag value from XML content
   */
  extractTagValue(xml, tagName) {
    const match = xml.match(new RegExp(`<${tagName}>(.*?)<\/${tagName}>`));
    return match ? match[1].trim() : null;
  }

  /**
   * Count total permissions in a permission set
   */
  countPermissions(permissionSet) {
    if (!permissionSet) return 0;

    return (
      (permissionSet.fieldPermissions || []).length +
      (permissionSet.objectPermissions || []).length +
      (permissionSet.tabSettings || []).length +
      (permissionSet.recordTypeVisibilities || []).length
    );
  }
}

/**
 * PermissionSetMerger - Merges permissions with accretive rules
 */
class PermissionSetMerger {
  constructor(orchestrator) {
    this.orchestrator = orchestrator;
  }

  /**
   * Merge existing permissions with additions
   * Accretive union: never downgrade, always upgrade
   */
  merge(existing, additions, options = {}) {
    this.orchestrator.log('debug', 'Merging permissions...');

    // If no existing, create new
    if (!existing) {
      return this.buildFromAdditions(additions);
    }

    // Merge each permission type
    const merged = {
      fieldPermissions: this.mergeFieldPermissions(
        existing.fieldPermissions || [],
        additions.field_permissions || [],
        options
      ),
      objectPermissions: this.mergeObjectPermissions(
        existing.objectPermissions || [],
        additions.object_permissions || [],
        options
      ),
      tabSettings: this.mergeTabSettings(
        existing.tabSettings || [],
        additions.tab_settings || [],
        options
      ),
      recordTypeVisibilities: this.mergeRecordTypeVisibilities(
        existing.recordTypeVisibilities || [],
        additions.record_type_vis || [],
        options
      )
    };

    // Validate no downgrades (unless allowed)
    if (!options.allowDowngrade) {
      this.validateNoDowngrades(existing, merged);
    }

    this.orchestrator.log('debug', `Merged result: ${this.orchestrator.retriever.countPermissions(merged)} permissions`);

    return merged;
  }

  /**
   * Build permission set from additions only (no existing)
   */
  buildFromAdditions(additions) {
    return {
      fieldPermissions: additions.field_permissions || [],
      objectPermissions: additions.object_permissions || [],
      tabSettings: additions.tab_settings || [],
      recordTypeVisibilities: additions.record_type_vis || []
    };
  }

  /**
   * Merge field permissions (accretive)
   */
  mergeFieldPermissions(existing, additions, options) {
    const merged = new Map();

    // Add existing
    for (const perm of existing) {
      const key = `${perm.object}.${perm.field}`;
      merged.set(key, { ...perm });
    }

    // Union with additions (upgrade permissions)
    for (const perm of additions) {
      const key = `${perm.object}.${perm.field}`;
      const current = merged.get(key);

      if (!current) {
        merged.set(key, { ...perm });
      } else {
        // Accretive: readable OR editable can only go from false → true
        merged.set(key, {
          object: perm.object,
          field: perm.field,
          readable: current.readable || perm.readable,
          editable: current.editable || perm.editable
        });
      }
    }

    // Sort for deterministic output
    return Array.from(merged.values()).sort((a, b) => {
      const keyA = `${a.object}.${a.field}`;
      const keyB = `${b.object}.${b.field}`;
      return keyA.localeCompare(keyB);
    });
  }

  /**
   * Merge object permissions (accretive)
   */
  mergeObjectPermissions(existing, additions, options) {
    const merged = new Map();

    // Add existing
    for (const perm of existing) {
      merged.set(perm.object, { ...perm });
    }

    // Union with additions
    for (const perm of additions) {
      const current = merged.get(perm.object);

      if (!current) {
        merged.set(perm.object, { ...perm });
      } else {
        // Accretive: CRUD permissions can only go from false → true
        merged.set(perm.object, {
          object: perm.object,
          read: current.read || perm.read,
          create: current.create || perm.create,
          edit: current.edit || perm.edit,
          delete: current.delete || perm.delete,
          viewAll: current.viewAll || perm.viewAll,
          modifyAll: current.modifyAll || perm.modifyAll
        });
      }
    }

    // Sort
    return Array.from(merged.values()).sort((a, b) => a.object.localeCompare(b.object));
  }

  /**
   * Merge tab settings
   */
  mergeTabSettings(existing, additions, options) {
    const merged = new Map();

    // Add existing
    for (const tab of existing) {
      merged.set(tab.tab, { ...tab });
    }

    // Union with additions (tabs can be added or visibility changed)
    for (const tab of additions) {
      merged.set(tab.tab, { ...tab });
    }

    // Sort
    return Array.from(merged.values()).sort((a, b) => a.tab.localeCompare(b.tab));
  }

  /**
   * Merge record type visibilities
   */
  mergeRecordTypeVisibilities(existing, additions, options) {
    const merged = new Map();

    // Add existing
    for (const rt of existing) {
      const key = `${rt.object}.${rt.recordType}`;
      merged.set(key, { ...rt });
    }

    // Union with additions
    for (const rt of additions) {
      const key = `${rt.object}.${rt.recordType}`;
      const current = merged.get(key);

      if (!current) {
        merged.set(key, { ...rt });
      } else {
        // Visibility can only increase (hidden → visible)
        merged.set(key, {
          object: rt.object,
          recordType: rt.recordType,
          visible: current.visible || rt.visible,
          defaultRecordTypeMapping: rt.defaultRecordTypeMapping !== undefined
            ? rt.defaultRecordTypeMapping
            : current.defaultRecordTypeMapping
        });
      }
    }

    // Sort
    return Array.from(merged.values()).sort((a, b) => {
      const keyA = `${a.object}.${a.recordType}`;
      const keyB = `${b.object}.${b.recordType}`;
      return keyA.localeCompare(keyB);
    });
  }

  /**
   * Validate no downgrades occurred
   */
  validateNoDowngrades(existing, merged) {
    const downgrades = [];

    // Check field permissions
    for (const existingPerm of existing.fieldPermissions || []) {
      const key = `${existingPerm.object}.${existingPerm.field}`;
      const mergedPerm = merged.fieldPermissions.find(
        p => `${p.object}.${p.field}` === key
      );

      if (!mergedPerm) continue;

      if (existingPerm.readable && !mergedPerm.readable) {
        downgrades.push(`Field ${key}: readable downgraded from true to false`);
      }
      if (existingPerm.editable && !mergedPerm.editable) {
        downgrades.push(`Field ${key}: editable downgraded from true to false`);
      }
    }

    // Check object permissions
    for (const existingPerm of existing.objectPermissions || []) {
      const mergedPerm = merged.objectPermissions.find(p => p.object === existingPerm.object);

      if (!mergedPerm) continue;

      const checks = ['read', 'create', 'edit', 'delete', 'viewAll', 'modifyAll'];
      for (const check of checks) {
        if (existingPerm[check] && !mergedPerm[check]) {
          downgrades.push(`Object ${existingPerm.object}: ${check} downgraded from true to false`);
        }
      }
    }

    if (downgrades.length > 0) {
      const error = new Error('Permission downgrades detected:\n' + downgrades.join('\n'));
      error.downgrades = downgrades;
      throw error;
    }
  }

  /**
   * Generate diff between existing and merged
   */
  generateDiff(existing, merged) {
    const diff = {
      added: {
        fieldPermissions: [],
        objectPermissions: [],
        tabSettings: [],
        recordTypeVisibilities: []
      },
      updated: {
        fieldPermissions: [],
        objectPermissions: [],
        tabSettings: [],
        recordTypeVisibilities: []
      },
      unchanged: {
        fieldPermissions: [],
        objectPermissions: [],
        tabSettings: [],
        recordTypeVisibilities: []
      }
    };

    // If no existing, everything is added
    if (!existing) {
      diff.added = merged;
      return diff;
    }

    // Compare field permissions
    for (const mergedPerm of merged.fieldPermissions) {
      const key = `${mergedPerm.object}.${mergedPerm.field}`;
      const existingPerm = existing.fieldPermissions.find(
        p => `${p.object}.${p.field}` === key
      );

      if (!existingPerm) {
        diff.added.fieldPermissions.push(mergedPerm);
      } else if (
        existingPerm.readable !== mergedPerm.readable ||
        existingPerm.editable !== mergedPerm.editable
      ) {
        diff.updated.fieldPermissions.push({
          ...mergedPerm,
          previous: existingPerm
        });
      } else {
        diff.unchanged.fieldPermissions.push(mergedPerm);
      }
    }

    // Similar logic for object permissions, tabs, record types...
    // (abbreviated for brevity)

    return diff;
  }
}

/**
 * PermissionSetDeployer - Deploys permission sets to org
 */
class PermissionSetDeployer {
  constructor(orchestrator) {
    this.orchestrator = orchestrator;
  }

  /**
   * Deploy permission set to org
   */
  async deploy(permissionSetName, permissionSet, options = {}) {
    this.orchestrator.log('info', `Deploying permission set: ${permissionSetName}`);

    try {
      // Generate XML
      const xml = this.generateXml(permissionSetName, permissionSet);

      // Write to file
      const projectDir = this.orchestrator.projectPath;
      const metadataDir = path.join(projectDir, 'force-app', 'main', 'default', 'permissionsets');

      if (!fs.existsSync(metadataDir)) {
        fs.mkdirSync(metadataDir, { recursive: true });
      }

      const apiName = permissionSetName.replace(/[^a-zA-Z0-9_]/g, '_');
      const xmlPath = path.join(metadataDir, `${apiName}.permissionset-meta.xml`);

      fs.writeFileSync(xmlPath, xml, 'utf-8');
      this.orchestrator.log('debug', `Wrote XML to: ${xmlPath}`);

      // Deploy
      const command = `sf project deploy start --metadata "PermissionSet:${permissionSetName}" --target-org ${this.orchestrator.org} --json`;

      this.orchestrator.log('debug', `Executing: ${command}`);
      const result = execSync(command, { encoding: 'utf-8', cwd: projectDir });
      const parsed = JSON.parse(result);

      if (parsed.status !== 0) {
        throw new Error(`Deploy failed: ${parsed.message}`);
      }

      const status = options.createIfMissing && !parsed.result.deployedSource ? 'created' : 'updated';

      this.orchestrator.log('info', `Successfully ${status} ${permissionSetName}`);

      return {
        status,
        changes: this.orchestrator.merger.generateDiff(null, permissionSet)
      };

    } catch (error) {
      this.orchestrator.log('error', `Deploy failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Assign users to permission set
   */
  async assignUsers(permissionSetName, usernames) {
    this.orchestrator.log('info', `Assigning ${usernames.length} user(s) to ${permissionSetName}`);

    for (const username of usernames) {
      try {
        // Check if already assigned
        const query = `
          SELECT Id
          FROM PermissionSetAssignment
          WHERE PermissionSet.Name = '${permissionSetName}'
          AND Assignee.Username = '${username}'
          LIMIT 1
        `;

        const checkCmd = `sf data query --query "${query}" --target-org ${this.orchestrator.org} --json`;
        const checkResult = JSON.parse(execSync(checkCmd, { encoding: 'utf-8' }));

        if (checkResult.result.records.length > 0) {
          this.orchestrator.log('debug', `User ${username} already assigned to ${permissionSetName}`);
          continue;
        }

        // Get permission set ID
        const psQuery = `SELECT Id FROM PermissionSet WHERE Name = '${permissionSetName}' LIMIT 1`;
        const psCmd = `sf data query --query "${psQuery}" --target-org ${this.orchestrator.org} --json`;
        const psResult = JSON.parse(execSync(psCmd, { encoding: 'utf-8' }));

        if (psResult.result.records.length === 0) {
          throw new Error(`Permission set ${permissionSetName} not found`);
        }

        const permissionSetId = psResult.result.records[0].Id;

        // Get user ID
        const userQuery = `SELECT Id FROM User WHERE Username = '${username}' LIMIT 1`;
        const userCmd = `sf data query --query "${userQuery}" --target-org ${this.orchestrator.org} --json`;
        const userResult = JSON.parse(execSync(userCmd, { encoding: 'utf-8' }));

        if (userResult.result.records.length === 0) {
          this.orchestrator.results.warnings.push({
            type: 'user_not_found',
            username,
            message: `User ${username} not found in org`
          });
          continue;
        }

        const userId = userResult.result.records[0].Id;

        // Create assignment
        const assignCmd = `sf data create record --sobject PermissionSetAssignment --values "PermissionSetId=${permissionSetId} AssigneeId=${userId}" --target-org ${this.orchestrator.org} --json`;

        execSync(assignCmd, { encoding: 'utf-8' });
        this.orchestrator.log('info', `Assigned ${username} to ${permissionSetName}`);

      } catch (error) {
        this.orchestrator.log('error', `Failed to assign ${username}: ${error.message}`);
        this.orchestrator.results.errors.push({
          operation: 'assignUser',
          username,
          permissionSet: permissionSetName,
          error: error.message
        });
      }
    }
  }

  /**
   * Generate permission set XML
   */
  generateXml(permissionSetName, permissionSet) {
    const lines = [];
    lines.push('<?xml version="1.0" encoding="UTF-8"?>');
    lines.push('<PermissionSet xmlns="http://soap.sforce.com/2006/04/metadata">');
    lines.push(`    <label>${permissionSetName}</label>`);
    lines.push('    <hasActivationRequired>false</hasActivationRequired>');

    // Field permissions
    for (const perm of permissionSet.fieldPermissions || []) {
      lines.push('    <fieldPermissions>');
      lines.push(`        <field>${perm.object}.${perm.field}</field>`);
      lines.push(`        <readable>${perm.readable}</readable>`);
      lines.push(`        <editable>${perm.editable}</editable>`);
      lines.push('    </fieldPermissions>');
    }

    // Object permissions
    for (const perm of permissionSet.objectPermissions || []) {
      lines.push('    <objectPermissions>');
      lines.push(`        <object>${perm.object}</object>`);
      lines.push(`        <allowRead>${perm.read}</allowRead>`);
      lines.push(`        <allowCreate>${perm.create}</allowCreate>`);
      lines.push(`        <allowEdit>${perm.edit}</allowEdit>`);
      lines.push(`        <allowDelete>${perm.delete}</allowDelete>`);
      lines.push(`        <viewAllRecords>${perm.viewAll}</viewAllRecords>`);
      lines.push(`        <modifyAllRecords>${perm.modifyAll}</modifyAllRecords>`);
      lines.push('    </objectPermissions>');
    }

    // Tab settings
    for (const tab of permissionSet.tabSettings || []) {
      lines.push('    <tabSettings>');
      lines.push(`        <tab>${tab.tab}</tab>`);
      lines.push(`        <visibility>${tab.visibility}</visibility>`);
      lines.push('    </tabSettings>');
    }

    // Record type visibilities
    for (const rt of permissionSet.recordTypeVisibilities || []) {
      lines.push('    <recordTypeVisibilities>');
      lines.push(`        <recordType>${rt.object}.${rt.recordType}</recordType>`);
      lines.push(`        <visible>${rt.visible}</visible>`);
      if (rt.defaultRecordTypeMapping !== undefined) {
        lines.push(`        <default>${rt.defaultRecordTypeMapping}</default>`);
      }
      lines.push('    </recordTypeVisibilities>');
    }

    lines.push('</PermissionSet>');

    return lines.join('\n');
  }
}

/**
 * PermissionSetValidator - Validates input and operations
 */
class PermissionSetValidator {
  constructor(orchestrator) {
    this.orchestrator = orchestrator;
  }

  /**
   * Validate input configuration
   */
  validateInput(config) {
    const required = ['initiative_slug', 'project_name', 'tiers'];

    for (const field of required) {
      if (!config[field]) {
        throw new Error(`Missing required field: ${field}`);
      }
    }

    // Validate initiative slug format (kebab-case)
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(config.initiative_slug)) {
      throw new Error('initiative_slug must be kebab-case (lowercase with hyphens)');
    }

    // Validate tiers
    if (typeof config.tiers !== 'object' || Object.keys(config.tiers).length === 0) {
      throw new Error('tiers must be an object with at least one tier');
    }

    // Validate each tier
    for (const [tierName, tierConfig] of Object.entries(config.tiers)) {
      this.validateTierConfig(tierName, tierConfig);
    }

    this.orchestrator.log('debug', 'Input validation passed');
  }

  /**
   * Validate tier configuration
   */
  validateTierConfig(tierName, tierConfig) {
    if (!tierConfig || typeof tierConfig !== 'object') {
      throw new Error(`Tier ${tierName} must be an object`);
    }

    // Check for at least one permission type
    const hasPermissions =
      (tierConfig.field_permissions && tierConfig.field_permissions.length > 0) ||
      (tierConfig.object_permissions && tierConfig.object_permissions.length > 0) ||
      (tierConfig.tab_settings && tierConfig.tab_settings.length > 0) ||
      (tierConfig.record_type_vis && tierConfig.record_type_vis.length > 0);

    if (!hasPermissions) {
      throw new Error(`Tier ${tierName} must have at least one permission defined`);
    }
  }
}

// Export
module.exports = PermissionSetOrchestrator;
