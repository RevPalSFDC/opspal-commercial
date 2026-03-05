const fs = require('fs');
const os = require('os');
const path = require('path');

jest.mock('../scripts/lib/github-repo-manager');

const GitHubRepoManager = require('../scripts/lib/github-repo-manager');
const ProjectConnect = require('../scripts/project-connect');
const ProjectConnectRegistry = require('../scripts/lib/project-connect-registry');

describe('ProjectConnect.checkRepoSyncStatus', () => {
  let tmpRoot;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'project-connect-check-'));
    GitHubRepoManager.mockReset();
    GitHubRepoManager.mockImplementation(() => ({
      findRepo: jest.fn().mockResolvedValue({ exists: false })
    }));
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('returns fresh local status without remote fallback', async () => {
    const registry = new ProjectConnectRegistry({ repoRoot: tmpRoot });
    registry.recordCheckResult({
      customerId: 'RP-LOCAL0001',
      customer: 'Local Corp',
      synced: true,
      source: 'local',
      repoName: 'revpal-rp-local0001-local-corp',
      repoUrl: 'https://github.com/revpal/revpal-rp-local0001-local-corp'
    });

    const result = await ProjectConnect.checkRepoSyncStatus({
      customerId: 'RP-LOCAL0001',
      repoRoot: tmpRoot,
      staleHours: 24
    });

    expect(result.synced).toBe(true);
    expect(result.source).toBe('local');
    expect(result.usedRemoteFallback).toBe(false);
    expect(GitHubRepoManager).not.toHaveBeenCalled();
  });

  it('uses remote fallback when local state is missing and persists outcome', async () => {
    GitHubRepoManager.mockImplementation(() => ({
      findRepo: jest.fn().mockResolvedValue({
        exists: true,
        name: 'revpal-rp-rem0001-remote-corp',
        url: 'https://github.com/revpal/revpal-rp-rem0001-remote-corp'
      })
    }));

    const result = await ProjectConnect.checkRepoSyncStatus({
      customerId: 'RP-REM0001',
      customer: 'Remote Corp',
      repoRoot: tmpRoot,
      staleHours: 24
    });

    expect(result.synced).toBe(true);
    expect(result.source).toBe('remote');
    expect(result.usedRemoteFallback).toBe(true);
    expect(result.repo).toEqual({
      name: 'revpal-rp-rem0001-remote-corp',
      url: 'https://github.com/revpal/revpal-rp-rem0001-remote-corp'
    });

    const registry = new ProjectConnectRegistry({ repoRoot: tmpRoot });
    const local = registry.getRepoSyncStatus({ customerId: 'RP-REM0001', staleAfterHours: 24 });
    expect(local.synced).toBe(true);
    expect(local.found).toBe(true);
  });
});
