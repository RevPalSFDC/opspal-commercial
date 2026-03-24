/**
 * Tests for SourceLineageTracker — drift detection
 */

'use strict';

const os = require('os');
const fs = require('fs');
const path = require('path');
const { ResourceRegistry } = require('../../customization/resource-registry');
const { CustomResourceStore } = require('../../customization/custom-resource-store');
const { SourceLineageTracker } = require('../../customization/source-lineage-tracker');

const PLUGIN_ROOT = path.resolve(__dirname, '../../../..');

describe('SourceLineageTracker', () => {
  let registry, store, tracker, tempDir;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opspal-lineage-'));
    registry = new ResourceRegistry({ pluginRoot: PLUGIN_ROOT });
    await registry.load();

    store = new CustomResourceStore({
      globalDir: path.join(tempDir, 'site')
    });
    await store.ensureDirectories('site');

    tracker = new SourceLineageTracker({ registry, store });
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test('recordClone populates lineage fields', async () => {
    const sourceRecord = await registry.get('brand:color-palette:default');
    const customRecord = { resource_id: 'brand:color-palette:default' };

    await tracker.recordClone(customRecord, sourceRecord);

    expect(customRecord.source_resource_id).toBe('brand:color-palette:default');
    expect(customRecord.source_version).toBeDefined();
    expect(customRecord.source_checksum).toBeDefined();
  });

  test('checkDrift returns not drifted for matching checksum', async () => {
    const sourceRecord = await registry.get('brand:color-palette:default');
    const customRecord = {
      resource_id: 'brand:color-palette:default',
      source_resource_id: 'brand:color-palette:default',
      source_version: registry.getPluginVersion(),
      source_checksum: sourceRecord.checksum
    };

    const drift = await tracker.checkDrift(customRecord);
    expect(drift.drifted).toBe(false);
  });

  test('checkDrift detects checksum change', async () => {
    const customRecord = {
      resource_id: 'brand:color-palette:default',
      source_resource_id: 'brand:color-palette:default',
      source_version: registry.getPluginVersion(),
      source_checksum: 'sha256:old-checksum-that-doesnt-match'
    };

    const drift = await tracker.checkDrift(customRecord);
    expect(drift.drifted).toBe(true);
    expect(drift.reason).toBe('checksum_changed');
  });

  test('checkDrift detects version change', async () => {
    const sourceRecord = await registry.get('brand:color-palette:default');
    const customRecord = {
      resource_id: 'brand:color-palette:default',
      source_resource_id: 'brand:color-palette:default',
      source_version: '0.0.1',  // Old version
      source_checksum: sourceRecord.checksum
    };

    const drift = await tracker.checkDrift(customRecord);
    expect(drift.drifted).toBe(true);
    expect(drift.reason).toBe('version_changed');
  });

  test('checkDrift handles missing source', async () => {
    const customRecord = {
      resource_id: 'test:custom',
      source_resource_id: 'nonexistent:resource:id',
      source_version: '1.0.0',
      source_checksum: 'sha256:any'
    };

    const drift = await tracker.checkDrift(customRecord);
    expect(drift.drifted).toBe(true);
    expect(drift.reason).toBe('source_removed');
  });

  test('checkDrift returns not drifted for resources without source', async () => {
    const customRecord = {
      resource_id: 'test:original',
      source_resource_id: null
    };

    const drift = await tracker.checkDrift(customRecord);
    expect(drift.drifted).toBe(false);
  });

  test('listDriftedResources finds drifted records', async () => {
    // Save a custom record with a stale checksum
    await store.saveRecord({
      resource_id: 'brand:color-palette:default',
      resource_type: 'brand_asset',
      scope: 'site',
      source_type: 'custom',
      source_resource_id: 'brand:color-palette:default',
      source_version: registry.getPluginVersion(),
      source_checksum: 'sha256:stale-checksum',
      schema_version: '1',
      status: 'published',
      title: 'Stale Resource',
      content: {},
      metadata: {},
      checksum: 'sha256:test',
      created_by: 'test',
      updated_by: 'test'
    }, 'site');

    const drifted = await tracker.listDriftedResources('site');
    expect(drifted.length).toBeGreaterThan(0);
    expect(drifted[0].record.resource_id).toBe('brand:color-palette:default');
    expect(drifted[0].drift.drifted).toBe(true);
  });
});
