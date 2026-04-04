#!/usr/bin/env node
'use strict';

/**
 * SOP Mapping Resolver
 *
 * Resolves mapping_ref to one-to-many MappedTarget[] arrays.
 * Classification-based routing from config/sop/mappings/.
 * Deliberately separate from evaluator logic — mapping expansion
 * is a distinct concern that can be tested and swapped independently.
 *
 * @module sop-mapping-resolver
 * @version 1.0.0
 */

class SopMappingResolver {
  constructor(options = {}) {
    this.registry = options.registry; // SopRegistry instance
  }

  /**
   * Resolve a mapping reference to an array of targets.
   *
   * @param {string} mappingRef - Mapping id from policy
   * @param {Object} resolvedContext - From SopContextResolver
   * @returns {Object[]} MappedTarget[] — may be empty if no match
   */
  resolve(mappingRef, resolvedContext) {
    if (!mappingRef || !this.registry) return [];

    const mapping = this.registry.getMapping(mappingRef);
    if (!mapping) return [];

    const targets = mapping.targets || [];
    const classification = resolvedContext.work_item && resolvedContext.work_item.classification;
    const subType = resolvedContext.work_item && resolvedContext.work_item.sub_type;
    const scope = resolvedContext.scope;
    const orgSlug = resolvedContext.org_slug;

    const matched = [];

    for (const target of targets) {
      if (this._matchesTarget(target, classification, subType, scope, orgSlug)) {
        matched.push({
          asana_project_gid: target.asana_project_gid,
          asana_section_gid: target.asana_section_gid || null,
          board_name: target.board_name || null,
          field_defaults: target.field_defaults || null,
          classification_match: classification || null
        });
      }
    }

    return matched;
  }

  /**
   * Resolve all mappings and return a summary (for /sop-review).
   * @returns {Object[]}
   */
  resolveAll() {
    if (!this.registry) return [];

    const allMappings = this.registry.getAllMappings();
    return allMappings.map(m => ({
      id: m.id,
      target_count: (m.targets || []).length,
      targets: (m.targets || []).map(t => ({
        board_name: t.board_name,
        project_gid: t.asana_project_gid,
        classifications: t.match_criteria && t.match_criteria.classification || ['*']
      }))
    }));
  }

  // --- Private ---

  _matchesTarget(target, classification, subType, scope, orgSlug) {
    const criteria = target.match_criteria;

    // No criteria = matches everything
    if (!criteria) return true;

    // Classification filter
    if (criteria.classification && criteria.classification.length > 0) {
      if (!classification || !criteria.classification.includes(classification)) {
        return false;
      }
    }

    // Sub-type filter
    if (criteria.sub_type && criteria.sub_type.length > 0) {
      if (!subType || !criteria.sub_type.includes(subType)) {
        return false;
      }
    }

    // Scope filter
    if (criteria.scope && criteria.scope !== scope) {
      return false;
    }

    // Org filter
    if (criteria.org_slug && criteria.org_slug !== orgSlug) {
      return false;
    }

    return true;
  }
}

module.exports = { SopMappingResolver };
