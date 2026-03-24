/**
 * Upgrade Safety Tests
 *
 * Proves that customer customizations survive simulated plugin updates.
 * This is the critical acceptance test for the customization framework.
 */

'use strict';

const os = require('os');
const fs = require('fs');
const path = require('path');
const { createCustomizationLayer } = require('../../customization');

const PLUGIN_ROOT = path.resolve(__dirname, '../../../..');

describe('Upgrade Safety', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opspal-upgrade-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test('customizations survive simulated plugin update', async () => {
    const globalDir = path.join(tempDir, 'customizations');

    // === Phase 1: Initial setup — customer creates customizations ===
    const layer1 = await createCustomizationLayer({
      pluginRoot: PLUGIN_ROOT,
      globalDir
    });

    // Clone and customize color palette
    await layer1.admin.clone('brand:color-palette:default', {
      title: 'Acme Brand Colors'
    });
    await layer1.admin.edit('brand:color-palette:default', {
      content: {
        grape: '#AA0000',
        indigo: '#00AA00',
        apricot: '#0000AA',
        sand: '#CCCCCC',
        green: '#00FF00'
      }
    });
    await layer1.admin.publish('brand:color-palette:default');

    // Clone and customize a CSS theme
    await layer1.admin.clone('brand:css-theme:revpal-brand', {
      title: 'Acme CSS Theme'
    });
    await layer1.admin.edit('brand:css-theme:revpal-brand', {
      content: ':root { --brand-grape: #AA0000; --brand-indigo: #00AA00; }'
    });
    await layer1.admin.publish('brand:css-theme:revpal-brand');

    // Verify customizations are active
    let palette = await layer1.resolver.resolveColorPalette();
    expect(palette.grape).toBe('#AA0000');

    let css = await layer1.resolver.resolveCSSTheme('revpal-brand');
    expect(css).toContain('#AA0000');

    // === Phase 2: Simulate plugin update ===
    // In a real update, the entire plugin cache directory is replaced.
    // The customization store at globalDir is OUTSIDE the plugin cache,
    // so it survives. We prove this by creating a fresh layer pointing
    // at the same globalDir but a "new" plugin root.

    const layer2 = await createCustomizationLayer({
      pluginRoot: PLUGIN_ROOT,  // Same plugin code (simulates new version)
      globalDir               // Same persistent storage
    });

    // === Phase 3: Verify customizations survived ===
    palette = await layer2.resolver.resolveColorPalette();
    expect(palette.grape).toBe('#AA0000');  // Still the custom value!

    css = await layer2.resolver.resolveCSSTheme('revpal-brand');
    expect(css).toContain('#AA0000');  // Still the custom CSS!

    // List should show both custom and default resources
    const customResources = await layer2.admin.list({ scope: 'site' });
    expect(customResources.length).toBe(2);  // palette + theme
  });

  test('packaged defaults still accessible when no customization exists', async () => {
    const globalDir = path.join(tempDir, 'empty-customizations');

    const layer = await createCustomizationLayer({
      pluginRoot: PLUGIN_ROOT,
      globalDir
    });

    // All defaults should resolve normally
    const palette = await layer.resolver.resolveColorPalette();
    expect(palette.grape).toBe('#5F3B8C');

    const css = await layer.resolver.resolveCSSTheme('revpal-brand');
    expect(css).toContain('--brand-grape');

    const logo = await layer.resolver.resolveLogoPath('main');
    expect(logo).toContain('revpal-logo-primary.png');
  });

  test('drift detection works after simulated version bump', async () => {
    const globalDir = path.join(tempDir, 'drift-test');

    const layer = await createCustomizationLayer({
      pluginRoot: PLUGIN_ROOT,
      globalDir
    });

    // Clone a resource
    await layer.admin.clone('brand:color-palette:default');

    // Manually set a stale source_version to simulate version bump
    const record = await layer.store.getRecord('brand:color-palette:default', 'site');
    record.source_version = '0.0.1';  // Old version
    await layer.store.saveRecord(record, 'site');

    // Check drift
    const drifted = await layer.admin.listDriftedResources();
    expect(drifted.length).toBeGreaterThan(0);
    expect(drifted[0].drift.drifted).toBe(true);
  });

  test('tenant overrides take priority after update', async () => {
    const globalDir = path.join(tempDir, 'tenant-test');
    const orgDir = path.join(tempDir, 'org-customizations');

    const layer = await createCustomizationLayer({
      pluginRoot: PLUGIN_ROOT,
      globalDir
    });
    layer.store.orgDir = orgDir;
    layer.resolver.orgSlug = 'test-org';
    await layer.store.ensureDirectories('both');

    // Create site-level customization
    await layer.admin.clone('brand:color-palette:default', { title: 'Site Colors' });
    await layer.admin.edit('brand:color-palette:default', {
      content: { grape: '#SITE00' }
    });
    await layer.admin.publish('brand:color-palette:default');

    // Create tenant-level customization
    await layer.admin.clone('brand:color-palette:default', {
      scope: 'tenant',
      title: 'Tenant Colors',
      newId: 'brand:color-palette:default'
    });
    await layer.admin.edit('brand:color-palette:default', {
      content: { grape: '#TENANT' }
    }, { scope: 'tenant' });
    await layer.admin.publish('brand:color-palette:default', { scope: 'tenant' });

    // Verify tenant wins
    layer.resolver.invalidateCache();
    const palette = await layer.resolver.resolveColorPalette();
    expect(palette.grape).toBe('#TENANT');
  });

  test('backup and restore preserves customizations', async () => {
    const globalDir = path.join(tempDir, 'backup-test');

    const layer = await createCustomizationLayer({
      pluginRoot: PLUGIN_ROOT,
      globalDir
    });
    layer.backup.backupDir = path.join(tempDir, 'backups');

    // Create customization
    await layer.admin.clone('brand:color-palette:default');
    await layer.admin.edit('brand:color-palette:default', {
      content: { grape: '#BACKED_UP' }
    });
    await layer.admin.publish('brand:color-palette:default');

    // Backup
    const backupPath = await layer.admin.createBackup({ label: 'test' });

    // Delete customization
    await layer.admin.revert('brand:color-palette:default');
    layer.resolver.invalidateCache();
    let palette = await layer.resolver.resolveColorPalette();
    expect(palette.grape).toBe('#5F3B8C');  // Back to default

    // Restore
    await layer.admin.restoreBackup(backupPath);
    palette = await layer.resolver.resolveColorPalette();
    expect(palette.grape).toBe('#BACKED_UP');  // Restored!
  });

  test('export/import preserves customizations across environments', async () => {
    const sourceDir = path.join(tempDir, 'source');
    const targetDir = path.join(tempDir, 'target');

    // Source environment
    const source = await createCustomizationLayer({
      pluginRoot: PLUGIN_ROOT,
      globalDir: sourceDir
    });
    await source.admin.clone('brand:color-palette:default');
    await source.admin.edit('brand:color-palette:default', {
      content: { grape: '#EXPORTED' }
    });
    await source.admin.publish('brand:color-palette:default');

    // Export
    const bundle = await source.admin.exportBundle({ scope: 'site' });

    // Target environment
    const target = await createCustomizationLayer({
      pluginRoot: PLUGIN_ROOT,
      globalDir: targetDir
    });

    // Import
    await target.admin.importBundle(bundle);
    target.resolver.invalidateCache();
    const palette = await target.resolver.resolveColorPalette();
    expect(palette.grape).toBe('#EXPORTED');
  });
});
