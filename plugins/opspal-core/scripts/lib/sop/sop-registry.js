#!/usr/bin/env node
'use strict';

/**
 * SOP Registry
 *
 * Loads and caches SOP policy and mapping YAML files from config/sop/ layers.
 * Schema-validates via ajv. Supports layered priority: org > scope > global.
 * Skips policies with unsupported schema_version.
 *
 * @module sop-registry
 * @version 1.0.0
 */

const fs = require('fs');
const path = require('path');

const SUPPORTED_SCHEMA_VERSIONS = ['1.0.0'];
const DEFAULT_CACHE_TTL = 300000; // 5 minutes

const LAYER_PRIORITY = {
  'org': 3,
  'revpal-internal': 2,
  'client-delivery': 2,
  'global': 1
};

class SopRegistry {
  constructor(options = {}) {
    this.sopConfigDir = options.sopConfigDir || path.join(__dirname, '../../../config/sop');
    this.schemasDir = options.schemasDir || path.join(__dirname, '../../../schemas');
    this.cacheTTL = options.cacheTTL || DEFAULT_CACHE_TTL;
    this.shouldValidate = options.validate !== false;
    this.verbose = options.verbose || false;

    // Stores
    this._policies = new Map();      // id -> { policy, layer, file, loadedAt }
    this._mappings = new Map();      // id -> { mapping, file, loadedAt }
    this._templates = new Map();     // ref -> { template, file }
    this._loadedAt = 0;
    this._warnings = [];

    // Schema validators (lazy-loaded)
    this._policyValidator = null;
    this._mappingValidator = null;
  }

  /**
   * Load all policy, mapping, and template files from config/sop/.
   * @returns {Object} { policies: number, mappings: number, templates: number, warnings: string[] }
   */
  load() {
    this._policies.clear();
    this._mappings.clear();
    this._templates.clear();
    this._warnings = [];

    this._initValidators();

    // Load policy layers
    this._loadLayer('global', path.join(this.sopConfigDir, 'global'));
    this._loadLayer('revpal-internal', path.join(this.sopConfigDir, 'revpal-internal'));
    this._loadLayer('client-delivery', path.join(this.sopConfigDir, 'client-delivery'));
    this._loadOrgOverrides(path.join(this.sopConfigDir, 'orgs'));

    // Load mappings
    this._loadMappings(path.join(this.sopConfigDir, 'mappings'));

    // Load templates
    this._loadTemplates(path.join(this.sopConfigDir, 'templates'));

    this._loadedAt = Date.now();

    return {
      policies: this._policies.size,
      mappings: this._mappings.size,
      templates: this._templates.size,
      warnings: [...this._warnings]
    };
  }

  /**
   * Get policies matching an event type and scope, respecting layer priority.
   * Returns only enabled policies with supported schema versions.
   *
   * @param {string} eventType - e.g., 'work.started'
   * @param {string} [scope] - e.g., 'client-delivery'
   * @param {string} [orgSlug] - for org-level overrides
   * @returns {Object[]} Ordered array of policy records
   */
  getPoliciesForEvent(eventType, scope, orgSlug) {
    this._ensureFresh();

    const candidates = [];

    for (const [id, entry] of this._policies) {
      const p = entry.policy;

      if (!p.enabled) continue;
      if (p.event !== eventType) continue;
      if (p.mode === 'off') continue;

      // Scope filtering
      if (scope && p.scope !== 'global' && p.scope !== scope) continue;

      // Org override matching
      if (entry.layer === 'org' && entry.orgSlug !== orgSlug) continue;

      candidates.push(entry);
    }

    // Sort by layer priority (desc), then policy priority (desc), then id (asc)
    candidates.sort((a, b) => {
      const layerA = LAYER_PRIORITY[a.layer] || 0;
      const layerB = LAYER_PRIORITY[b.layer] || 0;
      if (layerB !== layerA) return layerB - layerA;

      const prioA = a.policy.priority || 50;
      const prioB = b.policy.priority || 50;
      if (prioB !== prioA) return prioB - prioA;

      return a.policy.id.localeCompare(b.policy.id);
    });

    return candidates.map(e => e.policy);
  }

  /**
   * Get a mapping definition by id.
   * @param {string} mappingRef
   * @returns {Object|null}
   */
  getMapping(mappingRef) {
    this._ensureFresh();
    const entry = this._mappings.get(mappingRef);
    return entry ? entry.mapping : null;
  }

  /**
   * Get a template fragment by ref.
   * @param {string} templateRef
   * @returns {Object|null}
   */
  getTemplate(templateRef) {
    this._ensureFresh();
    const entry = this._templates.get(templateRef);
    return entry ? entry.template : null;
  }

  /**
   * Get all loaded policies (for review/validation commands).
   * @returns {Object[]}
   */
  getAllPolicies() {
    this._ensureFresh();
    const result = [];
    for (const [, entry] of this._policies) {
      result.push({ ...entry.policy, _layer: entry.layer, _file: entry.file });
    }
    return result;
  }

  /**
   * Get all loaded mappings.
   * @returns {Object[]}
   */
  getAllMappings() {
    this._ensureFresh();
    const result = [];
    for (const [, entry] of this._mappings) {
      result.push({ ...entry.mapping, _file: entry.file });
    }
    return result;
  }

  /**
   * Get accumulated warnings from the last load.
   * @returns {string[]}
   */
  getWarnings() {
    return [...this._warnings];
  }

  /**
   * Force cache invalidation.
   */
  invalidateCache() {
    this._loadedAt = 0;
  }

  // --- Private methods ---

  _ensureFresh() {
    if (this._loadedAt === 0 || (Date.now() - this._loadedAt) > this.cacheTTL) {
      this.load();
    }
  }

  _initValidators() {
    if (this._policyValidator) return;

    try {
      const Ajv = require('ajv');
      const ajv = new Ajv({ allErrors: true });

      const policySchemaPath = path.join(this.schemasDir, 'sop-policy.schema.json');
      const mappingSchemaPath = path.join(this.schemasDir, 'sop-mapping.schema.json');

      if (fs.existsSync(policySchemaPath)) {
        const schema = JSON.parse(fs.readFileSync(policySchemaPath, 'utf8'));
        this._policyValidator = ajv.compile(schema);
      }
      if (fs.existsSync(mappingSchemaPath)) {
        const schema = JSON.parse(fs.readFileSync(mappingSchemaPath, 'utf8'));
        this._mappingValidator = ajv.compile(schema);
      }
    } catch (e) {
      this._warn(`Schema validator initialization failed: ${e.message}`);
    }
  }

  _loadLayer(layer, dirPath) {
    if (!fs.existsSync(dirPath)) return;

    const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.yaml') || f.endsWith('.yml'));

    for (const file of files) {
      try {
        const filePath = path.join(dirPath, file);
        const policy = this._parseYaml(filePath);
        if (!policy || !policy.id) {
          this._warn(`Policy file ${file} in ${layer} has no id, skipping`);
          continue;
        }

        // Schema version check
        const sv = policy.schema_version || '1.0.0';
        if (!SUPPORTED_SCHEMA_VERSIONS.includes(sv)) {
          this._warn(`Policy ${policy.id} uses schema_version ${sv} which is not supported. Update opspal-core to load this policy.`);
          continue;
        }

        // Schema validation
        if (this.shouldValidate && this._policyValidator) {
          const valid = this._policyValidator(policy);
          if (!valid) {
            const errors = this._policyValidator.errors.map(e => `${e.instancePath} ${e.message}`).join('; ');
            this._warn(`Policy ${policy.id} failed schema validation: ${errors}`);
            continue;
          }
        }

        this._policies.set(policy.id, { policy, layer, file: path.join(dirPath, file), loadedAt: Date.now() });
      } catch (e) {
        this._warn(`Failed to load policy ${file} from ${layer}: ${e.message}`);
      }
    }
  }

  _loadOrgOverrides(dirPath) {
    if (!fs.existsSync(dirPath)) return;

    const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.yaml') || f.endsWith('.yml'));

    for (const file of files) {
      try {
        const filePath = path.join(dirPath, file);
        const orgSlug = path.basename(file, path.extname(file));
        const content = this._parseYaml(filePath);

        // Org files can contain multiple policies under a `policies` key
        const policies = content.policies || (content.id ? [content] : []);

        for (const policy of policies) {
          if (!policy.id) continue;

          const sv = policy.schema_version || '1.0.0';
          if (!SUPPORTED_SCHEMA_VERSIONS.includes(sv)) {
            this._warn(`Org override ${policy.id} (${orgSlug}) uses unsupported schema_version ${sv}`);
            continue;
          }

          this._policies.set(policy.id, {
            policy,
            layer: 'org',
            orgSlug,
            file: filePath,
            loadedAt: Date.now()
          });
        }
      } catch (e) {
        this._warn(`Failed to load org override ${file}: ${e.message}`);
      }
    }
  }

  _loadMappings(dirPath) {
    if (!fs.existsSync(dirPath)) return;

    const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.yaml') || f.endsWith('.yml'));

    for (const file of files) {
      try {
        const filePath = path.join(dirPath, file);
        const mapping = this._parseYaml(filePath);
        if (!mapping || !mapping.id) {
          this._warn(`Mapping file ${file} has no id, skipping`);
          continue;
        }

        if (this.shouldValidate && this._mappingValidator) {
          const valid = this._mappingValidator(mapping);
          if (!valid) {
            const errors = this._mappingValidator.errors.map(e => `${e.instancePath} ${e.message}`).join('; ');
            this._warn(`Mapping ${mapping.id} failed validation: ${errors}`);
            continue;
          }
        }

        this._mappings.set(mapping.id, { mapping, file: filePath, loadedAt: Date.now() });
      } catch (e) {
        this._warn(`Failed to load mapping ${file}: ${e.message}`);
      }
    }
  }

  _loadTemplates(dirPath) {
    if (!fs.existsSync(dirPath)) return;

    const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.yaml') || f.endsWith('.yml'));

    for (const file of files) {
      try {
        const filePath = path.join(dirPath, file);
        const template = this._parseYaml(filePath);
        const ref = template.ref || path.basename(file, path.extname(file));
        this._templates.set(ref, { template, file: filePath });
      } catch (e) {
        this._warn(`Failed to load template ${file}: ${e.message}`);
      }
    }
  }

  _parseYaml(filePath) {
    const yaml = require('js-yaml');
    const content = fs.readFileSync(filePath, 'utf8');
    return yaml.load(content);
  }

  _warn(message) {
    this._warnings.push(message);
    if (this.verbose) {
      process.stderr.write(`[sop-registry] WARNING: ${message}\n`);
    }
  }
}

module.exports = { SopRegistry, SUPPORTED_SCHEMA_VERSIONS, LAYER_PRIORITY };
