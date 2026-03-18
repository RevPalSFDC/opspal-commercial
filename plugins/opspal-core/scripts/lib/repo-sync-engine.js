#!/usr/bin/env node

/**
 * Repo Sync Engine - Core git sync logic for project-connected orgs
 *
 * Provides safe, conservative git operations for repos cloned by project-connect.
 * All repos live at orgs/{slug}/.repo/ with symlinks mapping content to the org root.
 *
 * Usage:
 *   const sync = require('./lib/repo-sync-engine');
 *   const st = sync.status('peregrine', { workspaceRoot: '/path/to/workspace' });
 *   sync.pull('peregrine', { workspaceRoot: '/path/to/workspace' });
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

/**
 * Resolve the workspace root by scanning upward for orgs/ or using explicit path.
 */
function resolveWorkspaceRoot(opts = {}) {
  if (opts.workspaceRoot) return opts.workspaceRoot;

  // Check $PWD
  if (fs.existsSync(path.join(process.cwd(), 'orgs'))) return process.cwd();

  // Git toplevel
  try {
    const toplevel = execSync('git rev-parse --show-toplevel', { encoding: 'utf8', timeout: 5000 }).trim();
    if (fs.existsSync(path.join(toplevel, 'orgs'))) return toplevel;
  } catch { /* not in git */ }

  return null;
}

/**
 * Resolve the .repo/ path for a given org slug
 */
function repoPath(orgSlug, opts = {}) {
  const root = resolveWorkspaceRoot(opts);
  if (!root) throw new Error('Could not find workspace root (no orgs/ directory)');
  const p = path.join(root, 'orgs', orgSlug, '.repo');
  if (!fs.existsSync(p)) {
    throw new Error(`No .repo/ found for org "${orgSlug}" at ${p}`);
  }
  return p;
}

/**
 * Run a git command in the org's .repo/ directory
 */
function git(orgSlug, cmd, opts = {}) {
  const cwd = repoPath(orgSlug, opts);
  const timeout = opts.timeout || 30000;
  try {
    return execSync(`git ${cmd}`, {
      cwd,
      encoding: 'utf8',
      timeout,
      stdio: ['pipe', 'pipe', 'pipe']
    }).trim();
  } catch (err) {
    if (opts.throwOnError !== false) {
      throw new Error(`git ${cmd} failed in ${cwd}: ${err.stderr || err.message}`);
    }
    return null;
  }
}

/**
 * Get sync status for an org's repo
 */
function status(orgSlug, opts = {}) {
  git(orgSlug, 'fetch origin', { ...opts, throwOnError: false, timeout: 15000 });

  const branch = git(orgSlug, 'rev-parse --abbrev-ref HEAD', opts);
  const statusOutput = git(orgSlug, 'status --porcelain', opts);
  const clean = statusOutput === '';

  let ahead = 0, behind = 0;
  const tracking = git(orgSlug, `rev-parse --abbrev-ref ${branch}@{upstream}`, { ...opts, throwOnError: false });

  if (tracking) {
    const counts = git(orgSlug, `rev-list --left-right --count ${branch}...${tracking}`, opts);
    if (counts) {
      const parts = counts.split(/\s+/);
      ahead = parseInt(parts[0], 10) || 0;
      behind = parseInt(parts[1], 10) || 0;
    }
  }

  const diverged = ahead > 0 && behind > 0;
  const conflicts = statusOutput
    .split('\n')
    .filter(line => line.match(/^(UU|AA|DD|AU|UA|DU|UD)\s/))
    .map(line => line.substring(3));

  let lastFetch = null;
  const fetchHeadPath = path.join(repoPath(orgSlug, opts), '.git', 'FETCH_HEAD');
  if (fs.existsSync(fetchHeadPath)) {
    lastFetch = fs.statSync(fetchHeadPath).mtime.toISOString();
  }

  return { clean, branch, ahead, behind, diverged, conflicts, needsPull: behind > 0, needsPush: ahead > 0, lastFetch };
}

/**
 * Pull latest changes (fast-forward only by default)
 */
function pull(orgSlug, opts = {}) {
  const { autoStash = false } = opts;
  const st = status(orgSlug, opts);

  if (st.conflicts.length > 0) {
    return { success: false, pulled: false, stashed: false, message: `Unresolved merge conflicts: ${st.conflicts.join(', ')}` };
  }

  if (st.diverged) {
    return { success: false, pulled: false, stashed: false, message: `Branch "${st.branch}" has diverged (${st.ahead} ahead, ${st.behind} behind). Manual resolution required.` };
  }

  if (!st.needsPull) {
    return { success: true, pulled: false, stashed: false, message: 'Already up to date' };
  }

  let stashed = false;
  if (!st.clean) {
    if (!autoStash) {
      return { success: false, pulled: false, stashed: false, message: 'Working tree is dirty. Use autoStash: true or commit/stash manually.' };
    }
    git(orgSlug, 'stash push -m "repo-sync-engine auto-stash"', opts);
    stashed = true;
  }

  try {
    git(orgSlug, 'pull --ff-only origin ' + st.branch, opts);
  } catch (err) {
    if (stashed) git(orgSlug, 'stash pop', { ...opts, throwOnError: false });
    return { success: false, pulled: false, stashed, message: `Pull failed: ${err.message}` };
  }

  if (stashed) {
    const popResult = git(orgSlug, 'stash pop', { ...opts, throwOnError: false });
    if (popResult === null) {
      return { success: true, pulled: true, stashed: true, message: 'Pulled successfully but stash pop had conflicts. Resolve manually.' };
    }
  }

  return { success: true, pulled: true, stashed, message: `Pulled ${st.behind} commit(s) from origin/${st.branch}` };
}

/**
 * Push local commits to remote
 */
function push(orgSlug, opts = {}) {
  const st = status(orgSlug, opts);

  if (!st.needsPush) return { success: true, pushed: false, message: 'Nothing to push' };
  if (st.diverged) return { success: false, pushed: false, message: `Branch "${st.branch}" has diverged. Pull and resolve conflicts first.` };

  try {
    git(orgSlug, `push origin ${st.branch}`, opts);
    return { success: true, pushed: true, message: `Pushed ${st.ahead} commit(s) to origin/${st.branch}` };
  } catch (err) {
    return { success: false, pushed: false, message: `Push failed: ${err.message}` };
  }
}

/**
 * Stage all changes, commit, and push
 */
function commitAndPush(orgSlug, message, opts = {}) {
  if (!message) return { success: false, committed: false, pushed: false, message: 'Commit message is required' };

  const st = status(orgSlug, opts);
  if (st.clean) return { success: true, committed: false, pushed: false, message: 'Nothing to commit' };
  if (st.conflicts.length > 0) return { success: false, committed: false, pushed: false, message: `Cannot commit with unresolved conflicts: ${st.conflicts.join(', ')}` };

  try {
    git(orgSlug, 'add -A', opts);
    git(orgSlug, `commit -m "${message.replace(/"/g, '\\"')}"`, opts);
  } catch (err) {
    return { success: false, committed: false, pushed: false, message: `Commit failed: ${err.message}` };
  }

  const pushResult = push(orgSlug, opts);
  return {
    success: pushResult.success,
    committed: true,
    pushed: pushResult.pushed,
    message: pushResult.success ? `Committed and pushed: ${message}` : `Committed locally but push failed: ${pushResult.message}`
  };
}

module.exports = { status, pull, push, commitAndPush, repoPath, resolveWorkspaceRoot };
