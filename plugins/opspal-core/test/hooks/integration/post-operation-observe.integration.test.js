'use strict';

/**
 * Integration test: post-operation-observe hook writes observations to
 * workspace-rooted org-centric path, NOT plugin install dir.
 *
 * Regression lock for reflections 28462039 + e417944f.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync, execFileSync } = require('child_process');

describe('post-operation-observe writes to workspace, not plugin install dir', () => {
  let workspace;

  beforeEach(() => {
    workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'opobs-ws-'));
    execSync('git init -q', { cwd: workspace });
    execSync('git -c user.name=t -c user.email=t@t.test commit --allow-empty -q -m init', { cwd: workspace });
  });

  afterEach(() => {
    fs.rmSync(workspace, { recursive: true, force: true });
  });

  test('writes observation JSON under workspace/orgs/slug/platforms/salesforce/org/observations/', () => {
    const repoRoot = execSync('git rev-parse --show-toplevel', { encoding: 'utf8' }).trim();
    const hookPath = path.join(repoRoot, 'plugins', 'opspal-salesforce', 'hooks', 'post-operation-observe.sh');

    expect(fs.existsSync(hookPath)).toBe(true);

    execFileSync('bash', [hookPath], {
      cwd: workspace,
      env: {
        ...process.env,
        CLAUDE_PROJECT_ROOT: workspace,
        CLAUDE_PLUGIN_ROOT: path.join(repoRoot, 'plugins', 'opspal-salesforce'),
        ORG: 'acme-prod-sandbox',
        ORG_ALIAS: 'acme-prod-sandbox',
        ORG_SLUG: 'acme',
        OPERATION_TYPE: 'deploy',
        OPERATION_CONTEXT: JSON.stringify({ objects: ['Account'], fields: [], workflows: [] }),
        CLAUDE_AGENT_NAME: 'sfdc-deployment-manager',
        DEBUG_OBSERVER: '0',
        ENABLE_AUTO_RUNBOOK: '0'
      },
      stdio: ['pipe', 'pipe', 'pipe']
    });

    const obsDir = path.join(workspace, 'orgs', 'acme', 'platforms', 'salesforce', 'acme-prod-sandbox', 'observations');
    expect(fs.existsSync(obsDir)).toBe(true);
    const files = fs.readdirSync(obsDir);
    expect(files.length).toBeGreaterThan(0);

    const doc = JSON.parse(fs.readFileSync(path.join(obsDir, files[0]), 'utf8'));
    expect(doc.org || doc.orgAlias).toBeTruthy();
  });

  test('falls back from CLAUDE_PROJECT_ROOT to git rev-parse', () => {
    const repoRoot = execSync('git rev-parse --show-toplevel', { encoding: 'utf8' }).trim();
    const hookPath = path.join(repoRoot, 'plugins', 'opspal-salesforce', 'hooks', 'post-operation-observe.sh');

    execFileSync('bash', [hookPath], {
      cwd: workspace,
      env: {
        ...process.env,
        CLAUDE_PROJECT_ROOT: '',
        CLAUDE_PLUGIN_ROOT: path.join(repoRoot, 'plugins', 'opspal-salesforce'),
        ORG: 'acme-prod-sandbox',
        ORG_ALIAS: 'acme-prod-sandbox',
        ORG_SLUG: 'acme',
        OPERATION_TYPE: 'query',
        OPERATION_CONTEXT: '{}',
        CLAUDE_AGENT_NAME: 'sfdc-query-specialist',
        DEBUG_OBSERVER: '0',
        ENABLE_AUTO_RUNBOOK: '0'
      },
      stdio: ['pipe', 'pipe', 'pipe']
    });

    const obsDir = path.join(workspace, 'orgs', 'acme', 'platforms', 'salesforce', 'acme-prod-sandbox', 'observations');
    expect(fs.existsSync(obsDir)).toBe(true);
  });
});
