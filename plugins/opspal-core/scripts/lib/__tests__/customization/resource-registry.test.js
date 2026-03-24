/**
 * Tests for ResourceRegistry
 */

'use strict';

const path = require('path');
const { ResourceRegistry } = require('../../customization/resource-registry');

const PLUGIN_ROOT = path.resolve(__dirname, '../../../..');

describe('ResourceRegistry', () => {
  let registry;

  beforeAll(async () => {
    registry = new ResourceRegistry({ pluginRoot: PLUGIN_ROOT });
    await registry.load();
  });

  test('loads without error', () => {
    expect(registry.loaded).toBe(true);
  });

  test('reads plugin version', () => {
    const version = registry.getPluginVersion();
    expect(version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  test('registers brand color palette', async () => {
    const palette = await registry.get('brand:color-palette:default');
    expect(palette).not.toBeNull();
    expect(palette.resource_type).toBe('brand_asset');
    expect(palette.source_type).toBe('core');
    expect(palette.status).toBe('published');
    expect(palette.content).toBeDefined();
    expect(palette.content.grape).toBe('#5F3B8C');
  });

  test('registers brand font set', async () => {
    const fonts = await registry.get('brand:font-set:default');
    expect(fonts).not.toBeNull();
    expect(fonts.content.headings).toBe('Montserrat');
    expect(fonts.content.body).toBe('Figtree');
  });

  test('registers logo assets', async () => {
    const primary = await registry.get('brand:logo:primary');
    expect(primary).not.toBeNull();
    expect(primary.resource_type).toBe('brand_asset');
    expect(primary.storage_uri).toContain('revpal-logo-primary.png');
  });

  test('registers PDF cover templates', async () => {
    const cover = await registry.get('template:pdf-cover:salesforce-audit');
    expect(cover).not.toBeNull();
    expect(cover.resource_type).toBe('template');
    expect(cover.metadata.subType).toBe('pdf-cover');
  });

  test('registers CSS themes', async () => {
    const theme = await registry.get('brand:css-theme:revpal-brand');
    expect(theme).not.toBeNull();
    expect(theme.metadata.subType).toBe('css-theme');
  });

  test('list() returns all resources', async () => {
    const all = await registry.list();
    expect(all.length).toBeGreaterThan(10);
  });

  test('list() filters by resource type', async () => {
    const brandAssets = await registry.list('brand_asset');
    expect(brandAssets.every(r => r.resource_type === 'brand_asset')).toBe(true);

    const templates = await registry.list('template');
    expect(templates.every(r => r.resource_type === 'template')).toBe(true);
  });

  test('has() returns correct results', async () => {
    expect(await registry.has('brand:color-palette:default')).toBe(true);
    expect(await registry.has('nonexistent:resource:id')).toBe(false);
  });

  test('computeChecksum() returns sha256 hash', async () => {
    const checksum = await registry.computeChecksum('brand:color-palette:default');
    expect(checksum).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  test('all core resources have scope=global and source_type=core', async () => {
    const all = await registry.list();
    for (const r of all) {
      expect(r.scope).toBe('global');
      expect(r.source_type).toBe('core');
    }
  });
});
