#!/usr/bin/env node

/**
 * Runbook Projection Renderer
 *
 * Turns structured runbook entry stores into human-readable markdown
 * per scope. Projections are write-only artifacts for human consumption;
 * the entry store JSON is the source of truth.
 *
 * Output paths:
 *   instances/{org}/runbooks/projections/{scopeType}/{runbookId}.md
 *
 * Usage (programmatic):
 *   const { renderProjection, renderAllProjections } = require('./runbook-render-projection');
 *   renderProjection('acme-prod', 'workflow-lead-routing');
 *
 * @module runbook-render-projection
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { loadRegistry } = require('./runbook-registry');
const { loadEntries, SECTION_ORDER } = require('./runbook-entry-store');

// Specificity order for org-projection deduplication (most specific first)
const SPECIFICITY_RANK = {
  'sub-agent': 0, 'workflow': 1, 'solution': 2,
  'project': 3, 'platform': 4, 'org': 5
};

// ── Path resolution ────────────────────────────────────────────────────────

function _detectPluginRoot() {
  return process.env.CLAUDE_PLUGIN_ROOT || path.resolve(__dirname, '../..');
}

function _getProjectionPath(org, scopeType, runbookId, pluginRoot) {
  const base = pluginRoot || _detectPluginRoot();
  return path.join(base, 'instances', org, 'runbooks', 'projections', scopeType, `${runbookId}.md`);
}

// ── Entry rendering ────────────────────────────────────────────────────────

function _renderEntry(entry) {
  const prefixes = [];
  if (entry.validationStatus === 'proposed') prefixes.push('[PROPOSED]');
  if (entry.lifecycleStatus === 'stale') prefixes.push('[STALE]');
  const prefixStr = prefixes.length > 0 ? prefixes.join(' ') + ' ' : '';

  const confidenceBadge = `★${(entry.confidence * 100).toFixed(0)}%`;

  let md = `### ${prefixStr}${entry.title} ${confidenceBadge}\n\n`;
  md += `${entry.summary}\n`;

  if (entry.details) {
    md += `\n${entry.details}\n`;
  }

  if (entry.evidence && entry.evidence.length > 0) {
    const ev = entry.evidence[0];
    const evText = ev.text ? `${ev.text} — ` : '';
    md += `\n> Evidence: ${evText}${ev.source} (${ev.timestamp})\n`;
  }

  const meta = [];
  meta.push(`**Seen**: ${entry.recurrenceCount}x`);
  meta.push(`**First**: ${_formatDate(entry.firstSeenAt)}`);
  meta.push(`**Last**: ${_formatDate(entry.lastSeenAt)}`);
  md += `\n${meta.join(' | ')}\n`;

  const tags = [];
  if (entry.relatedObjects && entry.relatedObjects.length > 0) {
    tags.push(`**Objects**: ${entry.relatedObjects.join(', ')}`);
  }
  if (entry.sourceAgents && entry.sourceAgents.length > 0) {
    tags.push(`**Agents**: ${entry.sourceAgents.join(', ')}`);
  }
  if (tags.length > 0) {
    md += `${tags.join(' | ')}\n`;
  }

  return md;
}

function _formatDate(isoString) {
  if (!isoString) return 'N/A';
  return isoString.split('T')[0];
}

// ── Section rendering ──────────────────────────────────────────────────────

function _renderSection(sectionName, entries) {
  if (!entries || entries.length === 0) return '';

  // Sort: active before proposed, then by confidence descending
  const sorted = [...entries].sort((a, b) => {
    const statusOrder = { active: 0, proposed: 1, deprecated: 2, superseded: 3 };
    const statusDiff = (statusOrder[a.validationStatus] || 9) - (statusOrder[b.validationStatus] || 9);
    if (statusDiff !== 0) return statusDiff;
    return b.confidence - a.confidence;
  });

  let md = `## ${sectionName}\n\n`;
  for (const entry of sorted) {
    md += _renderEntry(entry) + '\n---\n\n';
  }

  return md;
}

// ── Header rendering ───────────────────────────────────────────────────────

function _renderHeader(metadata, entryStore) {
  const activeCount = entryStore.entries.filter(e => e.validationStatus === 'active').length;
  const proposedCount = entryStore.entries.filter(e => e.validationStatus === 'proposed').length;

  let md = `# ${metadata.title || metadata.id} — Scoped Runbook\n\n`;
  md += `**Scope**: ${metadata.scopeType} / ${metadata.scopeKey}\n`;
  md += `**Last Updated**: ${_formatDate(entryStore.updatedAt)}\n`;
  md += `**Entries**: ${activeCount} active, ${proposedCount} proposed\n`;

  if (metadata.linkedWorkflows && metadata.linkedWorkflows.length > 0) {
    md += `**Workflows**: ${metadata.linkedWorkflows.join(', ')}\n`;
  }
  if (metadata.linkedObjects && metadata.linkedObjects.length > 0) {
    md += `**Objects**: ${metadata.linkedObjects.join(', ')}\n`;
  }

  md += '\n---\n\n';
  return md;
}

// ── Exported functions ─────────────────────────────────────────────────────

/**
 * Render a markdown projection for a single scoped runbook.
 *
 * @param {string} org
 * @param {string} runbookId
 * @param {string} [pluginRoot]
 * @returns {string} File path written
 */
function renderProjection(org, runbookId, pluginRoot) {
  const registry = loadRegistry(org, pluginRoot);
  const metadata = registry.runbooks.find(r => r.id === runbookId);
  if (!metadata) {
    throw new Error(`Runbook ${runbookId} not found in registry for org ${org}`);
  }

  const entryStore = loadEntries(org, runbookId, pluginRoot);

  // Filter to active/proposed entries only
  const visibleEntries = entryStore.entries.filter(
    e => ['active', 'proposed'].includes(e.validationStatus)
  );

  // Group by section in canonical order
  let markdown = _renderHeader(metadata, entryStore);

  for (const sectionName of SECTION_ORDER) {
    const sectionEntries = visibleEntries.filter(e => e.section === sectionName);
    markdown += _renderSection(sectionName, sectionEntries);
  }

  // Any entries in sections not in SECTION_ORDER
  const knownSections = new Set(SECTION_ORDER);
  const otherEntries = visibleEntries.filter(e => !knownSections.has(e.section));
  if (otherEntries.length > 0) {
    markdown += _renderSection('Other', otherEntries);
  }

  // Write to projection path
  const projectionPath = _getProjectionPath(org, metadata.scopeType, runbookId, pluginRoot);
  const dir = path.dirname(projectionPath);
  fs.mkdirSync(dir, { recursive: true });

  const tmp = projectionPath + '.tmp';
  fs.writeFileSync(tmp, markdown, 'utf-8');
  fs.renameSync(tmp, projectionPath);

  return projectionPath;
}

/**
 * Render projections for all non-archived runbooks in an org.
 *
 * @param {string} org
 * @param {string} [pluginRoot]
 * @returns {{ runbookId: string, filePath?: string, success: boolean, error?: string }[]}
 */
function renderAllProjections(org, pluginRoot) {
  const registry = loadRegistry(org, pluginRoot);
  const nonArchived = registry.runbooks.filter(r => r.status !== 'archived');
  const results = [];

  for (const runbook of nonArchived) {
    try {
      const filePath = renderProjection(org, runbook.id, pluginRoot);
      results.push({ runbookId: runbook.id, filePath, success: true });
    } catch (err) {
      results.push({ runbookId: runbook.id, error: err.message, success: false });
    }
  }

  return results;
}

/**
 * Render an aggregated org-level projection combining entries from all scoped runbooks.
 * Deduplicates entries across scopes, keeping the most specific version.
 *
 * @param {string} org
 * @param {string} [pluginRoot]
 * @returns {string} File path written
 */
function renderOrgProjection(org, pluginRoot) {
  const registry = loadRegistry(org, pluginRoot);
  const nonArchived = registry.runbooks.filter(r => r.status !== 'archived');

  // Collect all visible entries with their scope metadata
  const allTaggedEntries = [];
  for (const runbook of nonArchived) {
    const store = loadEntries(org, runbook.id, pluginRoot);
    const visible = store.entries.filter(
      e => ['active', 'proposed'].includes(e.validationStatus)
    );
    for (const entry of visible) {
      allTaggedEntries.push({
        entry,
        scopeType: runbook.scopeType,
        runbookId: runbook.id
      });
    }
  }

  // Deduplicate: for entries with tokenSimilarity >= 0.8, keep the more specific one
  const { tokenSimilarity } = require('./string-similarity');
  const deduped = [];
  const used = new Set();

  // Sort by specificity (most specific first) so we prefer specific scopes
  allTaggedEntries.sort((a, b) =>
    (SPECIFICITY_RANK[a.scopeType] ?? 5) - (SPECIFICITY_RANK[b.scopeType] ?? 5)
  );

  for (let i = 0; i < allTaggedEntries.length; i++) {
    if (used.has(i)) continue;
    const current = allTaggedEntries[i];
    // Check if any later entry is a duplicate
    for (let j = i + 1; j < allTaggedEntries.length; j++) {
      if (used.has(j)) continue;
      const other = allTaggedEntries[j];
      if (tokenSimilarity(current.entry.summary, other.entry.summary) >= 0.8) {
        used.add(j); // skip the less-specific duplicate
      }
    }
    deduped.push(current.entry);
  }

  // Build org-level markdown
  let markdown = `# ${org} — Aggregated Org Runbook\n\n`;
  markdown += `**Last Updated**: ${_formatDate(new Date().toISOString())}\n`;
  markdown += `**Scoped Runbooks**: ${nonArchived.length}\n`;
  markdown += `**Total Entries**: ${deduped.length}\n\n---\n\n`;

  for (const sectionName of SECTION_ORDER) {
    const sectionEntries = deduped.filter(e => e.section === sectionName);
    markdown += _renderSection(sectionName, sectionEntries);
  }

  const knownSections = new Set(SECTION_ORDER);
  const otherEntries = deduped.filter(e => !knownSections.has(e.section));
  if (otherEntries.length > 0) {
    markdown += _renderSection('Other', otherEntries);
  }

  // Write to org projection path
  const projectionPath = _getProjectionPath(org, 'org', `org-${org}`, pluginRoot);
  const dir = path.dirname(projectionPath);
  fs.mkdirSync(dir, { recursive: true });

  const tmp = projectionPath + '.tmp';
  fs.writeFileSync(tmp, markdown, 'utf-8');
  fs.renameSync(tmp, projectionPath);

  return projectionPath;
}

// ── Exports ────────────────────────────────────────────────────────────────

module.exports = {
  renderProjection,
  renderAllProjections,
  renderOrgProjection
};
