/**
 * Tests for ResourceResolver — resolution priority and caching
 */

'use strict';

const os = require('os');
const fs = require('fs');
const path = require('path');
const { ResourceRegistry } = require('../../customization/resource-registry');
const { CustomResourceStore } = require('../../customization/custom-resource-store');
const { ResourceResolver } = require('../../customization/resource-resolver');

const PLUGIN_ROOT = path.resolve(__dirname, '../../../..');

describe('ResourceResolver', () => {
  let registry, store, resolver, tempDir;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opspal-resolver-'));
    registry = new ResourceRegistry({ pluginRoot: PLUGIN_ROOT });
    await registry.load();

    store = new CustomResourceStore({
      globalDir: path.join(tempDir, 'site'),
      orgDir: path.join(tempDir, 'tenant')
    });
    await store.ensureDirectories('both');

    resolver = new ResourceResolver({ registry, store, orgSlug: 'test-org' });
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test('resolves packaged default when no custom exists', async () => {
    const result = await resolver.resolve('brand:color-palette:default');
    expect(result).not.toBeNull();
    expect(result.record.source_type).toBe('core');
    expect(result.record.scope).toBe('global');
  });

  test('site override takes priority over packaged default', async () => {
    // Create a site-scoped override
    await store.saveRecord({
      resource_id: 'brand:color-palette:default',
      resource_type: 'brand_asset',
      scope: 'site',
      source_type: 'custom',
      schema_version: '1',
      status: 'published',
      title: 'Custom Palette',
      content: { grape: '#FF0000', indigo: '#00FF00' },
      metadata: {},
      checksum: 'sha256:custom',
      created_by: 'test',
      updated_by: 'test'
    }, 'site');

    resolver.invalidateCache();
    const result = await resolver.resolve('brand:color-palette:default');
    expect(result.record.source_type).toBe('custom');
    expect(result.content.grape).toBe('#FF0000');
  });

  test('tenant override takes priority over site override', async () => {
    // Create site override
    await store.saveRecord({
      resource_id: 'brand:color-palette:default',
      resource_type: 'brand_asset',
      scope: 'site',
      source_type: 'custom',
      schema_version: '1',
      status: 'published',
      title: 'Site Palette',
      content: { grape: '#AAAAAA' },
      metadata: {},
      checksum: 'sha256:site',
      created_by: 'test',
      updated_by: 'test'
    }, 'site');

    // Create tenant override
    await store.saveRecord({
      resource_id: 'brand:color-palette:default',
      resource_type: 'brand_asset',
      scope: 'tenant',
      source_type: 'custom',
      schema_version: '1',
      status: 'published',
      title: 'Tenant Palette',
      content: { grape: '#BBBBBB' },
      metadata: {},
      checksum: 'sha256:tenant',
      created_by: 'test',
      updated_by: 'test'
    }, 'tenant');

    resolver.invalidateCache();
    const result = await resolver.resolve('brand:color-palette:default');
    expect(result.content.grape).toBe('#BBBBBB');
  });

  test('draft records are skipped', async () => {
    await store.saveRecord({
      resource_id: 'brand:color-palette:default',
      resource_type: 'brand_asset',
      scope: 'site',
      source_type: 'custom',
      schema_version: '1',
      status: 'draft',
      title: 'Draft Palette',
      content: { grape: '#DRAFT' },
      metadata: {},
      checksum: 'sha256:draft',
      created_by: 'test',
      updated_by: 'test'
    }, 'site');

    resolver.invalidateCache();
    const result = await resolver.resolve('brand:color-palette:default');
    // Should fall through to packaged default
    expect(result.record.source_type).toBe('core');
  });

  test('archived records are skipped', async () => {
    await store.saveRecord({
      resource_id: 'brand:color-palette:default',
      resource_type: 'brand_asset',
      scope: 'site',
      source_type: 'custom',
      schema_version: '1',
      status: 'archived',
      title: 'Archived Palette',
      content: { grape: '#ARCHIVED' },
      metadata: {},
      checksum: 'sha256:archived',
      created_by: 'test',
      updated_by: 'test'
    }, 'site');

    resolver.invalidateCache();
    const result = await resolver.resolve('brand:color-palette:default');
    expect(result.record.source_type).toBe('core');
  });

  test('resolveColorPalette returns color object', async () => {
    const palette = await resolver.resolveColorPalette();
    expect(palette).toBeDefined();
    expect(palette.grape).toBe('#5F3B8C');
  });

  test('resolveLogoPath returns file path', async () => {
    const logoPath = await resolver.resolveLogoPath('main');
    expect(logoPath).toContain('revpal-logo-primary.png');
  });

  test('resolveCSSTheme returns CSS string', async () => {
    const css = await resolver.resolveCSSTheme('revpal-brand');
    expect(css).toBeDefined();
    expect(css).toContain('--brand-grape');
  });

  test('resolveTemplate returns template content', async () => {
    const result = await resolver.resolveTemplate('salesforce-audit', 'pdf-cover');
    expect(result).not.toBeNull();
    expect(result.content).toBeDefined();
  });

  test('resolve returns null for nonexistent resource', async () => {
    const result = await resolver.resolve('nonexistent:resource:id');
    expect(result).toBeNull();
  });

  test('invalidateCache clears specific resource', async () => {
    // Populate cache
    await resolver.resolve('brand:color-palette:default');
    expect(resolver._cache.has('brand:color-palette:default')).toBe(true);

    resolver.invalidateCache('brand:color-palette:default');
    expect(resolver._cache.has('brand:color-palette:default')).toBe(false);
  });

  test('invalidateCache clears all when no id specified', async () => {
    await resolver.resolve('brand:color-palette:default');
    await resolver.resolve('brand:font-set:default');

    resolver.invalidateCache();
    expect(resolver._cache.size).toBe(0);
  });
});
