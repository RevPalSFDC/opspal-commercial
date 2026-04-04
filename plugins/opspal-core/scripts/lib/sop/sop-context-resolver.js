#!/usr/bin/env node
'use strict';

/**
 * SOP Context Resolver
 *
 * Resolves org slug, work item identity, Asana targets, and work classification.
 * Priority: overrides > event payload > env vars > CWD detection > .asana-links.json
 * Returns a canonical ResolvedContext used by the evaluator and executors.
 * Never throws — missing fields are null with detection_source noting gaps.
 *
 * @module sop-context-resolver
 * @version 1.0.0
 */

const fs = require('fs');
const path = require('path');

class SopContextResolver {
  constructor(options = {}) {
    this.pluginRoot = options.pluginRoot || process.env.CLAUDE_PLUGIN_ROOT || process.cwd();
    this.workIndexManager = options.workIndexManager || null;
    this.verbose = options.verbose || false;
  }

  /**
   * Resolve context for an SOP event.
   *
   * @param {Object} event - Canonical SOP event
   * @param {Object} [overrides={}] - Explicit caller-supplied values (highest priority)
   * @returns {Object} ResolvedContext
   */
  resolve(event, overrides = {}) {
    const gaps = [];

    // 1. Resolve org slug
    const orgSlug = this._resolveOrgSlug(event, overrides);
    if (!orgSlug) gaps.push('org_slug');

    // 2. Resolve scope (from overrides, event, or config)
    const scope = overrides.scope || event.scope || this._inferScope(orgSlug);

    // 3. Load Asana links
    const asanaLinks = orgSlug ? this._loadAsanaLinks(orgSlug) : null;

    // 4. Hydrate work item
    const workItem = this._hydrateWorkItem(event, overrides, asanaLinks, orgSlug);
    if (!workItem) gaps.push('work_item');

    // 5. Determine detection source
    const detectionSource = overrides.org_slug ? 'overrides' :
      (event.payload && event.payload.org_slug) ? 'event' :
        process.env.ORG_SLUG ? 'env' :
          this._detectFromCwd() ? 'cwd' :
            asanaLinks ? 'asana-links' : 'none';

    return {
      org_slug: orgSlug,
      scope,
      work_item: workItem,
      asana_links: asanaLinks,
      detection_source: detectionSource,
      gaps,
      resolved_at: new Date().toISOString()
    };
  }

  // --- Private methods ---

  _resolveOrgSlug(event, overrides) {
    // Priority chain
    if (overrides.org_slug) return overrides.org_slug;
    if (event.payload && event.payload.org_slug) return event.payload.org_slug;
    if (process.env.ORG_SLUG) return process.env.ORG_SLUG;
    if (process.env.CLIENT_ORG) return process.env.CLIENT_ORG;
    if (process.env.SF_TARGET_ORG) return process.env.SF_TARGET_ORG;

    // CWD detection: match /orgs/{slug}/
    return this._detectFromCwd();
  }

  _detectFromCwd() {
    try {
      const cwd = process.cwd();
      const match = cwd.match(/\/orgs\/([^/]+)/);
      return match ? match[1] : null;
    } catch {
      return null;
    }
  }

  _inferScope(orgSlug) {
    // Simple heuristic: if org slug looks like revpal-internal, use that scope
    if (!orgSlug) return 'global';
    if (orgSlug === 'revpal' || orgSlug === 'revpal-internal') return 'revpal-internal';
    return 'client-delivery';
  }

  _loadAsanaLinks(orgSlug) {
    const candidates = [
      path.join(process.cwd(), '.asana-links.json'),
      path.join(this.pluginRoot, '..', '..', 'orgs', orgSlug, '.asana-links.json'),
      path.join(process.cwd(), 'orgs', orgSlug, '.asana-links.json')
    ];

    for (const candidate of candidates) {
      try {
        if (fs.existsSync(candidate)) {
          return JSON.parse(fs.readFileSync(candidate, 'utf8'));
        }
      } catch {
        // Continue to next candidate
      }
    }

    return null;
  }

  _hydrateWorkItem(event, overrides, asanaLinks, orgSlug) {
    const workItem = {
      work_id: overrides.work_id || (event.payload && event.payload.work_id) || null,
      org_slug: orgSlug,
      classification: overrides.classification ||
        (event.payload && event.payload.classification) || null,
      sub_type: overrides.sub_type || (event.payload && event.payload.sub_type) || null,
      title: overrides.title || (event.payload && event.payload.title) || null,
      source: event.source || 'unknown',
      status: overrides.status || (event.payload && event.payload.status) || null,
      external_refs: {}
    };

    // Merge Asana refs from links file
    if (asanaLinks && asanaLinks.projects && asanaLinks.projects.length > 0) {
      workItem.external_refs.asana_project_gid = asanaLinks.projects[0].gid;
    }

    // Merge explicit external refs
    if (overrides.asana_task_gid) {
      workItem.external_refs.asana_task_gid = overrides.asana_task_gid;
    }
    if (overrides.asana_project_gid) {
      workItem.external_refs.asana_project_gid = overrides.asana_project_gid;
    }

    // Try to hydrate from work index if we have an org and a manager
    if (orgSlug && this.workIndexManager && !workItem.work_id) {
      try {
        const recent = this.workIndexManager.getInProgress(orgSlug);
        if (recent) {
          workItem.work_id = recent.id || workItem.work_id;
          workItem.classification = workItem.classification || recent.classification;
          workItem.sub_type = workItem.sub_type || recent.sub_type;
          workItem.title = workItem.title || recent.title;
          workItem.status = workItem.status || recent.status;
        }
      } catch {
        // Work index not available — not fatal
      }
    }

    // Return null if we have essentially nothing
    if (!workItem.work_id && !workItem.classification && !workItem.title) {
      return null;
    }

    return workItem;
  }
}

module.exports = { SopContextResolver };
