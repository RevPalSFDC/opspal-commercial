/**
 * Smart List Snapshot Manager
 *
 * Captures snapshots of Smart List rules for campaigns or Smart List assets.
 * Intended for backup, diffing, and audit workflows.
 *
 * @module smart-list-snapshot-manager
 * @version 1.0.0
 */

'use strict';

const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');
const rateLimitManager = require('./rate-limit-manager');

const DEFAULT_BATCH_SIZE = 200;

function buildSnapshotRoot(portal) {
  return path.join('instances', portal, 'observability', 'smart-lists');
}

function buildSnapshotId(label) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return label ? `${timestamp}__${label}` : timestamp;
}

function hashRules(rules) {
  const payload = rules ? JSON.stringify(rules) : '';
  return crypto.createHash('sha256').update(payload).digest('hex');
}

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function listAllCampaigns(listArgs = {}) {
  const campaigns = [];
  let nextPageToken;

  do {
    await rateLimitManager.waitIfNeeded();
    const result = await globalThis.mcp__marketo__campaign_list({
      batchSize: DEFAULT_BATCH_SIZE,
      nextPageToken,
      ...listArgs
    });

    if (!result.success) {
      throw new Error('Failed to list campaigns for snapshot');
    }

    campaigns.push(...(result.campaigns || []));
    nextPageToken = result.nextPageToken || null;
  } while (nextPageToken);

  return campaigns;
}

async function snapshotCampaignSmartLists(portal, options = {}) {
  const {
    label,
    includeRules = true,
    campaignFilters = {}
  } = options;

  if (!portal) {
    throw new Error('Portal is required for smart list snapshots');
  }

  const snapshotId = buildSnapshotId(label);
  const snapshotRoot = buildSnapshotRoot(portal);
  const snapshotDir = path.join(snapshotRoot, snapshotId);
  await ensureDir(snapshotDir);

  const campaigns = await listAllCampaigns(campaignFilters);
  const items = [];
  const errors = [];

  for (const campaign of campaigns) {
    try {
      await rateLimitManager.waitIfNeeded();
      const smartListResult = await globalThis.mcp__marketo__campaign_get_smart_list({
        campaignId: campaign.id,
        includeRules
      });

      const rules = smartListResult.rules || null;

      items.push({
        campaignId: campaign.id,
        campaignName: campaign.name,
        campaignType: campaign.type,
        programId: campaign.folder?.id || null,
        programType: campaign.folder?.type || null,
        smartListId: smartListResult.smartListId || null,
        rules,
        rulesHash: hashRules(rules),
        triggerCount: (smartListResult.triggers || []).length,
        filterCount: (smartListResult.filters || []).length,
        capturedAt: new Date().toISOString()
      });
    } catch (error) {
      errors.push({
        campaignId: campaign.id,
        campaignName: campaign.name,
        error: error.message
      });
    }
  }

  const snapshot = {
    metadata: {
      type: 'campaign-smart-lists',
      portal,
      snapshotId,
      generatedAt: new Date().toISOString(),
      includeRules,
      campaignCount: campaigns.length,
      capturedCount: items.length,
      errorCount: errors.length,
      campaignFilters
    },
    items,
    errors
  };

  const outputPath = path.join(snapshotDir, 'campaign-smart-lists.json');
  await fs.writeFile(outputPath, JSON.stringify(snapshot, null, 2));

  return {
    snapshotDir,
    snapshotId,
    outputPath,
    captured: items.length,
    errors
  };
}

async function snapshotSmartListAssets(portal, options = {}) {
  const { label, includeRules = true, listFilters = {} } = options;

  if (!portal) {
    throw new Error('Portal is required for smart list snapshots');
  }

  const snapshotId = buildSnapshotId(label);
  const snapshotRoot = buildSnapshotRoot(portal);
  const snapshotDir = path.join(snapshotRoot, snapshotId);
  await ensureDir(snapshotDir);

  const smartLists = [];
  let offset = 0;
  let more = true;

  while (more) {
    await rateLimitManager.waitIfNeeded();
    const result = await globalThis.mcp__marketo__smart_list_list({
      maxReturn: DEFAULT_BATCH_SIZE,
      offset,
      ...listFilters
    });

    if (!result.success) {
      throw new Error('Failed to list smart list assets');
    }

    smartLists.push(...(result.smartLists || []));
    more = Boolean(result.moreResult);
    offset += DEFAULT_BATCH_SIZE;
  }

  const items = [];
  const errors = [];

  for (const smartList of smartLists) {
    try {
      await rateLimitManager.waitIfNeeded();
      const smartListResult = await globalThis.mcp__marketo__smart_list_get({
        smartListId: smartList.id,
        includeRules
      });

      const rules = smartListResult.rules || null;

      items.push({
        smartListId: smartList.id,
        smartListName: smartList.name,
        folderId: smartList.folder?.id || null,
        folderType: smartList.folder?.type || null,
        rules,
        rulesHash: hashRules(rules),
        capturedAt: new Date().toISOString()
      });
    } catch (error) {
      errors.push({
        smartListId: smartList.id,
        smartListName: smartList.name,
        error: error.message
      });
    }
  }

  const snapshot = {
    metadata: {
      type: 'smart-list-assets',
      portal,
      snapshotId,
      generatedAt: new Date().toISOString(),
      includeRules,
      smartListCount: smartLists.length,
      capturedCount: items.length,
      errorCount: errors.length,
      listFilters
    },
    items,
    errors
  };

  const outputPath = path.join(snapshotDir, 'smart-list-assets.json');
  await fs.writeFile(outputPath, JSON.stringify(snapshot, null, 2));

  return {
    snapshotDir,
    snapshotId,
    outputPath,
    captured: items.length,
    errors
  };
}

async function diffSnapshots(snapshotPathA, snapshotPathB) {
  const rawA = await fs.readFile(snapshotPathA, 'utf8');
  const rawB = await fs.readFile(snapshotPathB, 'utf8');

  const snapshotA = JSON.parse(rawA);
  const snapshotB = JSON.parse(rawB);

  const mapA = new Map(snapshotA.items.map(item => [item.campaignId || item.smartListId, item]));
  const mapB = new Map(snapshotB.items.map(item => [item.campaignId || item.smartListId, item]));

  const added = [];
  const removed = [];
  const changed = [];

  for (const [id, itemB] of mapB.entries()) {
    const itemA = mapA.get(id);
    if (!itemA) {
      added.push({ id, name: itemB.campaignName || itemB.smartListName });
      continue;
    }

    if (itemA.rulesHash !== itemB.rulesHash) {
      changed.push({
        id,
        name: itemB.campaignName || itemB.smartListName,
        fromHash: itemA.rulesHash,
        toHash: itemB.rulesHash
      });
    }
  }

  for (const [id, itemA] of mapA.entries()) {
    if (!mapB.has(id)) {
      removed.push({ id, name: itemA.campaignName || itemA.smartListName });
    }
  }

  return {
    snapshotA: snapshotA.metadata,
    snapshotB: snapshotB.metadata,
    added,
    removed,
    changed
  };
}

module.exports = {
  snapshotCampaignSmartLists,
  snapshotSmartListAssets,
  diffSnapshots
};
