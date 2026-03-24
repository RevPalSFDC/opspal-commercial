/**
 * Tests for ExportImportService — round-trip fidelity
 */

'use strict';

const os = require('os');
const fs = require('fs');
const path = require('path');
const { CustomResourceStore } = require('../../customization/custom-resource-store');
const { ExportImportService } = require('../../customization/export-import-service');
const { CustomizationAuditLog } = require('../../customization/customization-audit-log');

describe('ExportImportService', () => {
  let service, store, tempDir;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opspal-export-'));

    store = new CustomResourceStore({
      globalDir: path.join(tempDir, 'site')
    });
    await store.ensureDirectories('site');

    const auditLog = new CustomizationAuditLog({ logDir: path.join(tempDir, 'audit') });

    service = new ExportImportService({
      store,
      registry: { getPluginVersion: () => '1.0.0' },
      auditLog
    });
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const makeRecord = (id) => ({
    resource_id: id,
    resource_type: 'template',
    scope: 'site',
    source_type: 'custom',
    source_resource_id: null,
    source_version: null,
    source_checksum: null,
    schema_version: '1',
    status: 'published',
    title: `Resource ${id}`,
    content: { test: true, id },
    storage_uri: null,
    metadata: { subType: 'test' },
    checksum: 'sha256:test',
    created_by: 'test',
    updated_by: 'test'
  });

  test('export produces valid bundle structure', async () => {
    await store.saveRecord(makeRecord('test:1'), 'site');
    await store.saveRecord(makeRecord('test:2'), 'site');

    const bundle = await service.exportBundle({ scope: 'site' });

    expect(bundle.format_version).toBe('1');
    expect(bundle.exported_at).toBeDefined();
    expect(bundle.resource_count).toBe(2);
    expect(bundle.resources.length).toBe(2);
  });

  test('round-trip: export then import preserves data', async () => {
    await store.saveRecord(makeRecord('test:roundtrip'), 'site');

    const bundle = await service.exportBundle({ scope: 'site' });

    // Import into a fresh store
    const freshDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opspal-fresh-'));
    const freshStore = new CustomResourceStore({
      globalDir: path.join(freshDir, 'site')
    });
    await freshStore.ensureDirectories('site');

    const freshService = new ExportImportService({
      store: freshStore,
      registry: { getPluginVersion: () => '1.0.0' }
    });

    const result = await freshService.importBundle(bundle);
    expect(result.imported).toBe(1);

    const imported = await freshStore.getRecord('test:roundtrip', 'site');
    expect(imported).not.toBeNull();
    expect(imported.content.test).toBe(true);
    expect(imported.title).toBe('Resource test:roundtrip');

    fs.rmSync(freshDir, { recursive: true, force: true });
  });

  test('import with binary assets', async () => {
    // Save a record with an asset
    const assetBuffer = Buffer.from('fake PNG content');
    const uri = await store.saveAsset(assetBuffer, 'test-logo.png', 'site');
    await store.saveRecord({ ...makeRecord('test:asset'), storage_uri: uri }, 'site');

    const bundle = await service.exportBundle({ scope: 'site' });
    expect(Object.keys(bundle.assets).length).toBe(1);

    // Import into fresh store
    const freshDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opspal-fresh2-'));
    const freshStore = new CustomResourceStore({
      globalDir: path.join(freshDir, 'site')
    });
    await freshStore.ensureDirectories('site');

    const freshService = new ExportImportService({
      store: freshStore,
      registry: { getPluginVersion: () => '1.0.0' }
    });

    const result = await freshService.importBundle(bundle);
    expect(result.imported).toBe(1);

    const imported = await freshStore.getRecord('test:asset', 'site');
    expect(imported.storage_uri).toBeDefined();
    expect(fs.existsSync(imported.storage_uri)).toBe(true);

    const content = fs.readFileSync(imported.storage_uri, 'utf8');
    expect(content).toBe('fake PNG content');

    fs.rmSync(freshDir, { recursive: true, force: true });
  });

  test('import skips existing records by default', async () => {
    await store.saveRecord(makeRecord('test:existing'), 'site');

    const bundle = {
      format_version: '1',
      resources: [{ ...makeRecord('test:existing'), _exportScope: 'site', title: 'Should Not Overwrite' }],
      assets: {}
    };

    const result = await service.importBundle(bundle);
    expect(result.skipped).toBe(1);

    const record = await store.getRecord('test:existing', 'site');
    expect(record.title).toBe('Resource test:existing');
  });

  test('import overwrites when onConflict=overwrite', async () => {
    await store.saveRecord(makeRecord('test:overwrite'), 'site');

    const bundle = {
      format_version: '1',
      resources: [{ ...makeRecord('test:overwrite'), _exportScope: 'site', title: 'Overwritten' }],
      assets: {}
    };

    const result = await service.importBundle(bundle, { onConflict: 'overwrite' });
    expect(result.imported).toBe(1);

    const record = await store.getRecord('test:overwrite', 'site');
    expect(record.title).toBe('Overwritten');
  });

  test('dryRun does not write records', async () => {
    const bundle = {
      format_version: '1',
      resources: [{ ...makeRecord('test:dryrun'), _exportScope: 'site' }],
      assets: {}
    };

    const result = await service.importBundle(bundle, { dryRun: true });
    expect(result.imported).toBe(1);

    const record = await store.getRecord('test:dryrun', 'site');
    expect(record).toBeNull();
  });

  test('exportToFile and importFromFile work', async () => {
    await store.saveRecord(makeRecord('test:file'), 'site');

    const filePath = path.join(tempDir, 'bundle.json');
    await service.exportToFile(filePath);
    expect(fs.existsSync(filePath)).toBe(true);

    // Clear store
    await store.deleteRecord('test:file', 'site');

    const result = await service.importFromFile(filePath);
    expect(result.imported).toBe(1);
  });
});
