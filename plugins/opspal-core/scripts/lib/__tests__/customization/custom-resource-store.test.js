/**
 * Tests for CustomResourceStore
 */

'use strict';

const os = require('os');
const fs = require('fs');
const path = require('path');
const { CustomResourceStore } = require('../../customization/custom-resource-store');

describe('CustomResourceStore', () => {
  let store;
  let tempDir;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opspal-store-'));
    store = new CustomResourceStore({
      globalDir: path.join(tempDir, 'site'),
      orgDir: path.join(tempDir, 'tenant')
    });
    await store.ensureDirectories('both');
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const makeRecord = (id, overrides = {}) => ({
    resource_id: id,
    resource_type: 'template',
    scope: 'site',
    source_type: 'custom',
    source_resource_id: null,
    source_version: null,
    source_checksum: null,
    schema_version: '1',
    status: 'published',
    title: `Test Resource ${id}`,
    content: { foo: 'bar' },
    storage_uri: null,
    metadata: {},
    checksum: 'sha256:test',
    created_by: 'test',
    updated_by: 'test',
    ...overrides
  });

  test('ensureDirectories creates directory structure', () => {
    expect(fs.existsSync(path.join(tempDir, 'site', 'assets'))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, 'tenant', 'assets'))).toBe(true);
  });

  test('saveRecord creates and retrieves a record', async () => {
    const record = makeRecord('test:resource:1');
    await store.saveRecord(record, 'site');

    const retrieved = await store.getRecord('test:resource:1', 'site');
    expect(retrieved).not.toBeNull();
    expect(retrieved.resource_id).toBe('test:resource:1');
    expect(retrieved.title).toBe('Test Resource test:resource:1');
  });

  test('saveRecord updates existing record', async () => {
    const record = makeRecord('test:resource:2');
    await store.saveRecord(record, 'site');

    record.title = 'Updated Title';
    await store.saveRecord(record, 'site');

    const retrieved = await store.getRecord('test:resource:2', 'site');
    expect(retrieved.title).toBe('Updated Title');
  });

  test('saveRecord sets timestamps', async () => {
    const record = makeRecord('test:resource:ts');
    const saved = await store.saveRecord(record, 'site');

    expect(saved.created_at).toBeDefined();
    expect(saved.updated_at).toBeDefined();
  });

  test('deleteRecord removes a record', async () => {
    const record = makeRecord('test:resource:del');
    await store.saveRecord(record, 'site');

    const deleted = await store.deleteRecord('test:resource:del', 'site');
    expect(deleted).toBe(true);

    const retrieved = await store.getRecord('test:resource:del', 'site');
    expect(retrieved).toBeNull();
  });

  test('deleteRecord returns false for nonexistent', async () => {
    const deleted = await store.deleteRecord('nonexistent', 'site');
    expect(deleted).toBe(false);
  });

  test('listRecords returns all records', async () => {
    await store.saveRecord(makeRecord('test:a'), 'site');
    await store.saveRecord(makeRecord('test:b'), 'site');
    await store.saveRecord(makeRecord('test:c'), 'site');

    const all = await store.listRecords('site');
    expect(all.length).toBe(3);
  });

  test('listRecords filters by resource_type', async () => {
    await store.saveRecord(makeRecord('test:x', { resource_type: 'brand_asset' }), 'site');
    await store.saveRecord(makeRecord('test:y', { resource_type: 'template' }), 'site');

    const brandAssets = await store.listRecords('site', { resource_type: 'brand_asset' });
    expect(brandAssets.length).toBe(1);
    expect(brandAssets[0].resource_id).toBe('test:x');
  });

  test('listRecords filters by status', async () => {
    await store.saveRecord(makeRecord('test:draft', { status: 'draft' }), 'site');
    await store.saveRecord(makeRecord('test:published', { status: 'published' }), 'site');

    const drafts = await store.listRecords('site', { status: 'draft' });
    expect(drafts.length).toBe(1);
  });

  test('saveAsset stores binary and returns uri', async () => {
    const buffer = Buffer.from('PNG fake content');
    const uri = await store.saveAsset(buffer, 'logo.png', 'site');

    expect(uri).toContain('logo.png');
    expect(fs.existsSync(uri)).toBe(true);

    const read = await store.readAsset(uri);
    expect(read.toString()).toBe('PNG fake content');
  });

  test('deleteAsset removes file', async () => {
    const buffer = Buffer.from('test');
    const uri = await store.saveAsset(buffer, 'test.bin', 'site');

    const deleted = await store.deleteAsset(uri);
    expect(deleted).toBe(true);
    expect(fs.existsSync(uri)).toBe(false);
  });

  test('tenant and site scopes are independent', async () => {
    await store.saveRecord(makeRecord('shared:id', { title: 'Site Version' }), 'site');
    await store.saveRecord(makeRecord('shared:id', { title: 'Tenant Version' }), 'tenant');

    const site = await store.getRecord('shared:id', 'site');
    const tenant = await store.getRecord('shared:id', 'tenant');

    expect(site.title).toBe('Site Version');
    expect(tenant.title).toBe('Tenant Version');
  });

  test('atomic write produces valid JSON', async () => {
    // Write many records to stress the atomic write
    for (let i = 0; i < 20; i++) {
      await store.saveRecord(makeRecord(`stress:${i}`), 'site');
    }

    const indexPath = path.join(tempDir, 'site', 'index.json');
    const content = fs.readFileSync(indexPath, 'utf8');
    const parsed = JSON.parse(content);
    expect(parsed.length).toBe(20);
  });

  test('getRecord returns null for nonexistent scope dir', async () => {
    const emptyStore = new CustomResourceStore({
      globalDir: path.join(tempDir, 'nonexistent')
    });
    const result = await emptyStore.getRecord('any', 'site');
    expect(result).toBeNull();
  });
});
