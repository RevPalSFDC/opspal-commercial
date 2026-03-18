#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const { GovernanceController, AuditLogger } = require('./index');

function parseArgs(argv) {
  const options = {
    action: 'list',
    type: 'all',
    id: null,
    reason: null,
    minConfidence: null,
    sort: 'confidence',
    limit: 20,
    reject: false,
    olderThan: null,
    queuePath: process.env.DQ_REVIEW_QUEUE_PATH || null
  };

  const args = [...argv];
  const takeValue = (inline) => (inline !== undefined
    ? inline
    : (args[0] && !args[0].startsWith('--') ? args.shift() : undefined));
  while (args.length > 0) {
    const token = args.shift();
    if (!token.startsWith('--')) continue;

    const [flag, inlineValue] = token.split('=');
    const key = flag.replace(/^--/, '');
    const value = takeValue(inlineValue);

    switch (key) {
      case 'action':
        options.action = value ? value.toLowerCase() : options.action;
        break;
      case 'type':
        options.type = value ? value.toLowerCase() : options.type;
        break;
      case 'id':
        options.id = value || options.id;
        break;
      case 'reason':
        options.reason = value || options.reason;
        break;
      case 'min-confidence':
        options.minConfidence = value ? Number(value) : null;
        break;
      case 'sort':
        options.sort = value || options.sort;
        break;
      case 'limit':
        options.limit = value ? Number(value) : options.limit;
        break;
      case 'reject':
        options.reject = true;
        break;
      case 'older-than':
        options.olderThan = value || null;
        break;
      case 'queue':
        options.queuePath = value || options.queuePath;
        break;
      case 'help':
        options.help = true;
        break;
      default:
        break;
    }
  }

  return options;
}

function printHelp() {
  console.log(`\nReview Queue\n\nUsage:\n  node scripts/lib/governance/review-queue.js --action list [options]\n\nOptions:\n  --action list|approve|reject|bulk   Queue action (default: list)\n  --type merge|enrichment|correction  Filter by action type\n  --id review-id                      Review item ID\n  --reason text                       Rejection reason\n  --min-confidence 85                 Filter by confidence for bulk\n  --older-than 7d                     Filter by age for bulk\n  --sort confidence|date|type         Sort order (default: confidence)\n  --limit 20                          Max items to show\n  --reject                            Use with --action bulk to reject\n  --queue path                        Override queue path\n`);
}

function resolveQueuePath(explicitPath) {
  if (explicitPath) return explicitPath;
  const pluginRoot = path.resolve(__dirname, '../../..');
  const repoRoot = path.resolve(pluginRoot, '../..');
  const stateDir = process.env.DQ_STATE_DIR || path.join(repoRoot, 'reports', 'data-quality');
  return path.join(stateDir, 'review-queue.json');
}

function loadQueue(queuePath) {
  if (!fs.existsSync(queuePath)) {
    return { items: [] };
  }
  try {
    const content = JSON.parse(fs.readFileSync(queuePath, 'utf-8'));
    if (Array.isArray(content)) {
      return { items: content };
    }
    return { items: content.items || [] };
  } catch (error) {
    return { items: [] };
  }
}

function saveQueue(queuePath, queue) {
  fs.mkdirSync(path.dirname(queuePath), { recursive: true });
  fs.writeFileSync(queuePath, JSON.stringify(queue, null, 2));
}

function parseAge(value) {
  if (!value) return null;
  const match = value.match(/^(\d+)([dhm])$/i);
  if (!match) return null;

  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();
  const multipliers = { d: 86400000, h: 3600000, m: 60000 };
  return amount * (multipliers[unit] || 0);
}

function filterItems(items, options) {
  let filtered = items.filter(item => item.status === 'pending');

  if (options.type && options.type !== 'all') {
    filtered = filtered.filter(item => {
      const actionType = item.action?.type || item.action?.name || item.action?.actionType;
      return actionType === options.type;
    });
  }

  if (options.minConfidence !== null && !Number.isNaN(options.minConfidence)) {
    filtered = filtered.filter(item => (item.confidence || 0) >= options.minConfidence);
  }

  if (options.olderThan) {
    const ageMs = parseAge(options.olderThan);
    if (ageMs) {
      const cutoff = Date.now() - ageMs;
      filtered = filtered.filter(item => new Date(item.createdAt).getTime() <= cutoff);
    }
  }

  const sortKey = options.sort || 'confidence';
  filtered.sort((a, b) => {
    if (sortKey === 'date') {
      return new Date(a.createdAt) - new Date(b.createdAt);
    }
    if (sortKey === 'type') {
      const typeA = a.action?.type || '';
      const typeB = b.action?.type || '';
      return typeA.localeCompare(typeB);
    }
    return (b.confidence || 0) - (a.confidence || 0);
  });

  if (options.limit) {
    filtered = filtered.slice(0, options.limit);
  }

  return filtered;
}

function printList(items) {
  console.log(`# Review Queue`);
  console.log(`Pending Items: ${items.length}`);

  if (items.length === 0) {
    console.log('\nNo pending items.');
    return;
  }

  items.forEach(item => {
    const actionType = item.action?.type || item.action?.name || 'unknown';
    console.log(`\n- ${item.id}`);
    console.log(`  Type: ${actionType}`);
    console.log(`  Confidence: ${item.confidence || 0}`);
    console.log(`  Created: ${item.createdAt}`);
  });
}

function resolveActor() {
  return process.env.REVIEW_APPROVER || process.env.USER || 'cli-user';
}

function updateItemStatus(controller, action, options) {
  if (!options.id) {
    console.error('❌ Missing --id for approve/reject.');
    process.exit(1);
  }

  if (action === 'approve') {
    return controller.approveReview(options.id, resolveActor(), { comment: options.reason || '' });
  }

  return controller.rejectReview(options.id, resolveActor(), { reason: options.reason || 'No reason provided' });
}

function bulkUpdate(controller, items, options) {
  const results = [];
  items.forEach(item => {
    try {
      if (options.reject) {
        results.push(controller.rejectReview(item.id, resolveActor(), { reason: options.reason || 'Bulk rejection' }));
      } else {
        results.push(controller.approveReview(item.id, resolveActor(), { comment: options.reason || '' }));
      }
    } catch (error) {
      results.push({ id: item.id, error: error.message });
    }
  });
  return results;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const queuePath = resolveQueuePath(options.queuePath);
  const queue = loadQueue(queuePath);

  const auditLogger = new AuditLogger({
    storagePath: path.join(path.dirname(queuePath), 'audit-logs')
  });
  const controller = new GovernanceController({ auditLogger });
  controller._reviewQueue = queue.items;

  if (options.action === 'list') {
    const items = filterItems(queue.items, options);
    printList(items);
    auditLogger.destroy();
    return;
  }

  if (options.action === 'approve' || options.action === 'reject') {
    const updated = updateItemStatus(controller, options.action, options);
    queue.items = controller._reviewQueue;
    saveQueue(queuePath, queue);

    console.log(`✅ Review ${updated.id} marked as ${updated.status}`);
    auditLogger.destroy();
    return;
  }

  if (options.action === 'bulk') {
    const items = filterItems(queue.items, options);
    const results = bulkUpdate(controller, items, options);

    queue.items = controller._reviewQueue;
    saveQueue(queuePath, queue);

    const successCount = results.filter(r => !r.error).length;
    const failedCount = results.length - successCount;

    console.log(`✅ Processed ${successCount} items (${failedCount} failed)`);
    auditLogger.destroy();
    return;
  }

  console.error(`❌ Unknown action: ${options.action}`);
  auditLogger.destroy();
  process.exit(1);
}

main();
