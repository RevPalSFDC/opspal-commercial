'use strict';

/**
 * Integration test: post-operation-observe hook writes observations to
 * workspace-rooted org-centric path, NOT plugin install dir.
 *
 * Regression lock for reflections 28462039 + e417944f.
 *
 * Three distinct workspace-resolution paths are tested:
 *   1. CLAUDE_PROJECT_ROOT env var — explicit override, ignores cwd and git
 *   2. git rev-parse fallback — no CLAUDE_PROJECT_ROOT, cwd is a subdirectory
 *      inside the git repo; git rev-parse returns the repo root (parent), not cwd
 *   3. cwd last-resort — no CLAUDE_PROJECT_ROOT, not inside any git repo
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync, execFileSync } = require('child_process');

const repoRoot = execSync('git rev-parse --show-toplevel', { encoding: 'utf8' }).trim();
const hookPath = path.join(repoRoot, 'plugins', 'opspal-salesforce', 'hooks', 'post-operation-observe.sh');

/** Shared env boilerplate for all three tests. */
function baseEnv(overrides) {
  return {
    ...process.env,
    ORG: 'acme-prod-sandbox',
    ORG_ALIAS: 'acme-prod-sandbox',
    ORG_SLUG: 'acme',
    OPERATION_CONTEXT: JSON.stringify({ objects: ['Account'], fields: [], workflows: [] }),
    CLAUDE_AGENT_NAME: 'sfdc-deployment-manager',
    CLAUDE_PLUGIN_ROOT: path.join(repoRoot, 'plugins', 'opspal-salesforce'),
    DEBUG_OBSERVER: '0',
    ENABLE_AUTO_RUNBOOK: '0',
    ...overrides,
  };
}

/** Expected observations dir for the acme/acme-prod-sandbox pair under a given root. */
function obsDir(root) {
  return path.join(root, 'orgs', 'acme', 'platforms', 'salesforce', 'acme-prod-sandbox', 'observations');
}

describe('post-operation-observe writes to workspace, not plugin install dir', () => {
  expect(fs.existsSync(hookPath)).toBe(true);

  // ──────────────────────────────────────────────────────────────────────────
  // Test 1: CLAUDE_PROJECT_ROOT path
  // ──────────────────────────────────────────────────────────────────────────
  test('CLAUDE_PROJECT_ROOT path — observation lands at CLAUDE_PROJECT_ROOT, not cwd', () => {
    // Two distinct temp dirs: one for cwd, one for CLAUDE_PROJECT_ROOT.
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'opobs-cwd-'));
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opobs-root-'));

    try {
      execFileSync('bash', [hookPath], {
        cwd,
        env: baseEnv({
          CLAUDE_PROJECT_ROOT: projectRoot,
          OPERATION_TYPE: 'deploy',
        }),
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      const dir = obsDir(projectRoot);
      expect(fs.existsSync(dir)).toBe(true);

      // Must NOT land in cwd
      expect(fs.existsSync(obsDir(cwd))).toBe(false);

      const files = fs.readdirSync(dir);
      expect(files.length).toBeGreaterThan(0);

      const doc = JSON.parse(fs.readFileSync(path.join(dir, files[0]), 'utf8'));
      expect(doc.org).toBe('acme-prod-sandbox');
      expect(doc.operation).toBeTruthy();
      expect(typeof doc.timestamp).toBe('string');
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
      fs.rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Test 2: git rev-parse fallback path
  // ──────────────────────────────────────────────────────────────────────────
  test('git rev-parse fallback — observation lands at git repo root, not cwd subdirectory', () => {
    // Create a git repo (workspace root) then run the hook from a subdir.
    // git rev-parse --show-toplevel will return the workspace root, NOT the subdir.
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'opobs-ws-'));
    const subdir = path.join(workspace, 'subdir');
    fs.mkdirSync(subdir);

    try {
      execSync('git init -q', { cwd: workspace });
      execSync('git -c user.name=t -c user.email=t@t.test commit --allow-empty -q -m init', { cwd: workspace });

      execFileSync('bash', [hookPath], {
        cwd: subdir, // hook runs from subdirectory
        env: baseEnv({
          CLAUDE_PROJECT_ROOT: '', // explicitly unset so git fallback activates
          OPERATION_TYPE: 'query',
        }),
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      // Observation must be under workspace root (git toplevel), NOT subdir
      const dir = obsDir(workspace);
      expect(fs.existsSync(dir)).toBe(true);

      // Must NOT land under subdir
      expect(fs.existsSync(obsDir(subdir))).toBe(false);

      const files = fs.readdirSync(dir);
      expect(files.length).toBeGreaterThan(0);

      const doc = JSON.parse(fs.readFileSync(path.join(dir, files[0]), 'utf8'));
      expect(doc.org).toBe('acme-prod-sandbox');
      expect(doc.operation).toBeTruthy();
      expect(typeof doc.timestamp).toBe('string');
    } finally {
      fs.rmSync(workspace, { recursive: true, force: true });
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Test 3: cwd last-resort fallback path
  // ──────────────────────────────────────────────────────────────────────────
  test('cwd last-resort — observation lands at cwd when no CLAUDE_PROJECT_ROOT and no git repo', () => {
    // A temp dir that is NOT a git repo.
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'opobs-nogit-'));

    try {
      execFileSync('bash', [hookPath], {
        cwd,
        env: baseEnv({
          CLAUDE_PROJECT_ROOT: '', // explicitly unset
          OPERATION_TYPE: 'metadata-operation',
        }),
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      const dir = obsDir(cwd);
      expect(fs.existsSync(dir)).toBe(true);

      const files = fs.readdirSync(dir);
      expect(files.length).toBeGreaterThan(0);

      const doc = JSON.parse(fs.readFileSync(path.join(dir, files[0]), 'utf8'));
      expect(doc.org).toBe('acme-prod-sandbox');
      expect(doc.operation).toBeTruthy();
      expect(typeof doc.timestamp).toBe('string');
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });
});
