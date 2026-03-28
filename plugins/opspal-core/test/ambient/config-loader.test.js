'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

describe('ambient config loader', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    jest.resetModules();
  });

  test('applies runtime environment overrides', () => {
    const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ambient-config-home-'));
    process.env.HOME = tempHome;
    process.env.AMBIENT_REFLECT_MODE = 'manual_only';
    process.env.AMBIENT_REFLECT_DEBUG = '1';
    process.env.AMBIENT_REFLECT_FORCE_FLUSH = '1';

    jest.isolateModules(() => {
      const { loadConfig } = require('../../scripts/lib/ambient/config-loader');
      const config = loadConfig();

      expect(config.mode).toBe('manual_only');
      expect(config.debug).toBe(true);
      expect(config.forceFlush).toBe(true);
      expect(config.paths.ambientDir).toBe(path.join(tempHome, '.claude', 'ambient-reflections'));
      expect(fs.existsSync(config.paths.ambientDir)).toBe(true);
    });
  });
});
