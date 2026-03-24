/**
 * Tests for MigrationRunner — idempotency and receipt management
 */

'use strict';

const os = require('os');
const fs = require('fs');
const path = require('path');
const { ResourceRegistry } = require('../../customization/resource-registry');
const { CustomResourceStore } = require('../../customization/custom-resource-store');
const { BackupRestore } = require('../../customization/backup-restore');
const { CustomizationAuditLog } = require('../../customization/customization-audit-log');
const { MigrationRunner } = require('../../customization/migration-runner');

const PLUGIN_ROOT = path.resolve(__dirname, '../../../..');

describe('MigrationRunner', () => {
  let runner, store, tempDir, receiptsDir;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opspal-migration-'));
    receiptsDir = path.join(tempDir, 'migrations');

    const registry = new ResourceRegistry({ pluginRoot: PLUGIN_ROOT });
    await registry.load();

    store = new CustomResourceStore({
      globalDir: path.join(tempDir, 'site')
    });
    await store.ensureDirectories('site');

    const backup = new BackupRestore({
      store,
      backupDir: path.join(tempDir, 'backups')
    });

    const auditLog = new CustomizationAuditLog({
      logDir: path.join(tempDir, 'audit')
    });

    runner = new MigrationRunner({
      registry,
      store,
      backup,
      auditLog,
      pluginRoot: PLUGIN_ROOT,
      receiptsDir
    });
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test('runAll completes without error', async () => {
    const results = await runner.runAll();
    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBeGreaterThan(0);
  });

  test('writes receipt file after completion', async () => {
    await runner.runAll();
    const receiptPath = path.join(receiptsDir, '001_flow_custom_templates.done');
    expect(fs.existsSync(receiptPath)).toBe(true);

    const receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
    expect(receipt.migration_id).toBe('001_flow_custom_templates');
    expect(receipt.completed_at).toBeDefined();
  });

  test('is idempotent — second run skips completed migrations', async () => {
    const first = await runner.runAll();
    const second = await runner.runAll();

    const completedFirst = first.filter(r => r.status === 'completed');
    const skippedSecond = second.filter(r => r.status === 'skipped');

    // All completed migrations should be skipped on second run
    for (const completed of completedFirst) {
      expect(skippedSecond.find(s => s.id === completed.id)).toBeDefined();
    }
  });

  test('dryRun does not write receipts', async () => {
    await runner.runAll({ dryRun: true });
    const receiptPath = path.join(receiptsDir, '001_flow_custom_templates.done');
    expect(fs.existsSync(receiptPath)).toBe(false);
  });

  test('dryRun does not create records in store', async () => {
    await runner.runAll({ dryRun: true });
    const records = await store.listRecords('site');
    // No records should have been migrated in dry run
    const migratedRecords = records.filter(r => r.metadata?.migratedFrom);
    expect(migratedRecords.length).toBe(0);
  });
});
