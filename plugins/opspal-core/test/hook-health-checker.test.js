'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

function createExecutable(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
  fs.chmodSync(filePath, 0o755);
}

function runChecker(projectRoot, homeDir) {
  const checkerPath = path.join(__dirname, '..', 'scripts', 'lib', 'hook-health-checker.js');
  return spawnSync('node', [
    checkerPath,
    '--quick',
    '--format',
    'json',
    '--project-root',
    projectRoot
  ], {
    encoding: 'utf8',
    env: {
      ...process.env,
      HOME: homeDir
    }
  });
}

describe('hook health checker configuration discovery', () => {
  test('does not degrade when settings.json already provides hook configuration', () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hook-health-project-'));
    const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'hook-health-home-'));
    const settingsPath = path.join(tempRoot, '.claude', 'settings.json');
    const hookPath = path.join(tempRoot, '.claude', 'hooks', 'test-hook.sh');

    createExecutable(hookPath, '#!/usr/bin/env bash\nexit 0\n');
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
    fs.writeFileSync(settingsPath, JSON.stringify({
      hooks: {
        PostToolUse: [
          {
            matcher: '*',
            hooks: [
              {
                type: 'command',
                command: 'bash .claude/hooks/test-hook.sh'
              }
            ]
          }
        ]
      }
    }, null, 2), 'utf8');

    try {
      const result = runChecker(tempRoot, tempHome);
      const summary = JSON.parse(result.stdout);
      const missingProjectHooks = summary.results.find(
        (entry) => entry.message === 'No project-level hooks.json found'
      );
      const settingsCoverage = summary.results.find(
        (entry) => entry.message === 'No project-level hooks.json found (settings-based hook configuration is present)'
      );

      expect(result.status).toBe(0);
      expect(summary.status).toBe('HEALTHY');
      expect(missingProjectHooks).toBeUndefined();
      expect(settingsCoverage?.status).toBe('HEALTHY');
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
      fs.rmSync(tempHome, { recursive: true, force: true });
    }
  });

  test('still degrades when no project hooks.json or settings-based hooks exist', () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hook-health-project-'));
    const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'hook-health-home-'));

    fs.mkdirSync(path.join(tempRoot, '.claude'), { recursive: true });
    fs.writeFileSync(path.join(tempRoot, '.claude', 'settings.json'), JSON.stringify({ hooks: {} }, null, 2), 'utf8');

    try {
      const result = runChecker(tempRoot, tempHome);
      const summary = JSON.parse(result.stdout);
      const missingProjectHooks = summary.results.find(
        (entry) => entry.message === 'No project-level hooks.json found'
      );

      expect(result.status).toBe(2);
      expect(summary.status).toBe('UNHEALTHY');
      expect(missingProjectHooks?.status).toBe('DEGRADED');
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
      fs.rmSync(tempHome, { recursive: true, force: true });
    }
  });

  test('does not flag shared scripts across different matchers as duplicate registrations', () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hook-health-project-'));
    const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'hook-health-home-'));
    const settingsPath = path.join(tempRoot, '.claude', 'settings.json');
    const hookPath = path.join(tempRoot, '.claude', 'hooks', 'shared-hook.sh');

    createExecutable(hookPath, '#!/usr/bin/env bash\nexit 0\n');
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
    fs.writeFileSync(settingsPath, JSON.stringify({
      hooks: {
        PreToolUse: [
          {
            matcher: 'Bash',
            hooks: [
              {
                type: 'command',
                command: 'bash .claude/hooks/shared-hook.sh'
              }
            ]
          },
          {
            matcher: 'Write',
            hooks: [
              {
                type: 'command',
                command: 'bash .claude/hooks/shared-hook.sh'
              }
            ]
          }
        ]
      }
    }, null, 2), 'utf8');

    try {
      const result = runChecker(tempRoot, tempHome);
      const summary = JSON.parse(result.stdout);
      const duplicateRegistration = summary.results.find(
        (entry) => entry.message.includes('duplicate hook registration')
      );

      expect(result.status).toBe(0);
      expect(summary.status).toBe('HEALTHY');
      expect(duplicateRegistration).toBeUndefined();
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
      fs.rmSync(tempHome, { recursive: true, force: true });
    }
  });

  test('allows intentionally mirrored UserPromptSubmit hooks across project and global settings', () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hook-health-project-'));
    const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'hook-health-home-'));
    const projectSettingsPath = path.join(tempRoot, '.claude', 'settings.json');
    const globalSettingsPath = path.join(tempHome, '.claude', 'settings.json');
    const hookPath = path.join(tempRoot, '.claude', 'hooks', 'user-hook.sh');

    createExecutable(hookPath, '#!/usr/bin/env bash\nexit 0\n');
    fs.mkdirSync(path.dirname(projectSettingsPath), { recursive: true });
    fs.mkdirSync(path.dirname(globalSettingsPath), { recursive: true });

    const mirroredSettings = {
      hooks: {
        UserPromptSubmit: [
          {
            matcher: '*',
            hooks: [
              {
                type: 'command',
                command: `bash ${hookPath}`
              }
            ]
          }
        ]
      }
    };

    fs.writeFileSync(projectSettingsPath, JSON.stringify(mirroredSettings, null, 2), 'utf8');
    fs.writeFileSync(globalSettingsPath, JSON.stringify(mirroredSettings, null, 2), 'utf8');

    try {
      const result = runChecker(tempRoot, tempHome);
      const summary = JSON.parse(result.stdout);
      const intentionalMirror = summary.results.find(
        (entry) => entry.message.includes('user-level output hooks intentionally mirrored')
      );
      const duplicateRegistration = summary.results.find(
        (entry) => entry.message.includes('duplicate hook registration')
      );

      expect(result.status).toBe(0);
      expect(summary.status).toBe('HEALTHY');
      expect(intentionalMirror?.status).toBe('HEALTHY');
      expect(duplicateRegistration).toBeUndefined();
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
      fs.rmSync(tempHome, { recursive: true, force: true });
    }
  });

  test('still degrades when non-UserPrompt hooks are duplicated across project and global settings', () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hook-health-project-'));
    const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'hook-health-home-'));
    const projectSettingsPath = path.join(tempRoot, '.claude', 'settings.json');
    const globalSettingsPath = path.join(tempHome, '.claude', 'settings.json');
    const hookPath = path.join(tempRoot, '.claude', 'hooks', 'post-hook.sh');

    createExecutable(hookPath, '#!/usr/bin/env bash\nexit 0\n');
    fs.mkdirSync(path.dirname(projectSettingsPath), { recursive: true });
    fs.mkdirSync(path.dirname(globalSettingsPath), { recursive: true });

    const mirroredSettings = {
      hooks: {
        PostToolUse: [
          {
            matcher: '*',
            hooks: [
              {
                type: 'command',
                command: `bash ${hookPath}`
              }
            ]
          }
        ]
      }
    };

    fs.writeFileSync(projectSettingsPath, JSON.stringify(mirroredSettings, null, 2), 'utf8');
    fs.writeFileSync(globalSettingsPath, JSON.stringify(mirroredSettings, null, 2), 'utf8');

    try {
      const result = runChecker(tempRoot, tempHome);
      const summary = JSON.parse(result.stdout);
      const duplicateRegistration = summary.results.find(
        (entry) => entry.message.includes('duplicate hook registration')
      );

      expect(result.status).toBe(1);
      expect(summary.status).toBe('DEGRADED');
      expect(duplicateRegistration?.status).toBe('DEGRADED');
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
      fs.rmSync(tempHome, { recursive: true, force: true });
    }
  });
});
