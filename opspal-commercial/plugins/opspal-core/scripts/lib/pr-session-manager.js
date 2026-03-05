#!/usr/bin/env node

/**
 * PR Session Manager
 *
 * Purpose: Link Claude Code sessions to GitHub PRs for context continuity.
 * Supports the --from-pr feature in Claude Code v2.1.27+.
 *
 * Features:
 * - Track PR → session mappings
 * - Store PR context in work index
 * - Enable resuming previous PR context
 * - Auto-link sessions when PRs are created
 *
 * Claude Code v2.1.27+ features:
 * - --from-pr flag for linking sessions to PRs
 * - Automatic PR linking via `gh pr create`
 * - Session resume with PR context
 *
 * Usage:
 *   const { PRSessionManager } = require('./pr-session-manager');
 *
 *   const manager = new PRSessionManager();
 *
 *   // Link session to PR
 *   manager.linkSession('pr-123', 'session-abc');
 *
 *   // Get session for PR
 *   const session = manager.getSessionForPR('pr-123');
 *
 * @module pr-session-manager
 * @version 1.0.0
 * @created 2026-02-04
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// =============================================================================
// CONFIGURATION
// =============================================================================

const DATA_DIR = path.join(__dirname, '../../data');
const STATE_FILE = path.join(DATA_DIR, 'pr-sessions.json');
const WORK_INDEX_DIR = path.join(__dirname, '../../../orgs');

// Maximum sessions to keep per PR
const MAX_SESSIONS_PER_PR = 10;

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    }
  } catch (e) {
    // Fresh start
  }
  return {
    pr_mappings: {},
    session_to_pr: {},
    recent_prs: [],
    stats: {
      total_prs_tracked: 0,
      total_sessions_linked: 0
    },
    version: '1.0.0'
  };
}

function saveState(state) {
  ensureDataDir();
  state.last_updated = new Date().toISOString();
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
}

function getCurrentGitInfo() {
  try {
    const branch = execSync('git rev-parse --abbrev-ref HEAD 2>/dev/null', { encoding: 'utf8' }).trim();
    const repo = execSync('git remote get-url origin 2>/dev/null', { encoding: 'utf8' }).trim();
    const commit = execSync('git rev-parse HEAD 2>/dev/null', { encoding: 'utf8' }).trim();

    // Extract owner/repo from remote URL
    const repoMatch = repo.match(/github\.com[:/]([^/]+\/[^/.]+)/);
    const repoName = repoMatch ? repoMatch[1] : null;

    return { branch, repo, repoName, commit };
  } catch (e) {
    return null;
  }
}

function getPRNumberFromBranch(branch) {
  // Check if there's an open PR for this branch
  try {
    const result = execSync(`gh pr view ${branch} --json number 2>/dev/null`, { encoding: 'utf8' });
    const data = JSON.parse(result);
    return data.number;
  } catch (e) {
    return null;
  }
}

// =============================================================================
// PR SESSION MANAGER
// =============================================================================

class PRSessionManager {
  constructor(options = {}) {
    this.stateFile = options.stateFile || STATE_FILE;
    this.state = loadState();
  }

  /**
   * Link a session to a PR
   *
   * @param {string|number} prNumber - PR number or full PR identifier
   * @param {string} sessionId - Claude Code session ID
   * @param {object} [metadata] - Additional metadata
   */
  linkSession(prNumber, sessionId, metadata = {}) {
    const prKey = String(prNumber);
    const timestamp = new Date().toISOString();
    const gitInfo = getCurrentGitInfo();

    // Initialize PR entry if needed
    if (!this.state.pr_mappings[prKey]) {
      this.state.pr_mappings[prKey] = {
        pr_number: prNumber,
        created_at: timestamp,
        repo: gitInfo?.repoName,
        branch: gitInfo?.branch,
        sessions: [],
        metadata: {}
      };
      this.state.stats.total_prs_tracked++;
    }

    // Add session
    this.state.pr_mappings[prKey].sessions.push({
      session_id: sessionId,
      linked_at: timestamp,
      commit: gitInfo?.commit,
      ...metadata
    });

    // Keep only recent sessions
    if (this.state.pr_mappings[prKey].sessions.length > MAX_SESSIONS_PER_PR) {
      this.state.pr_mappings[prKey].sessions =
        this.state.pr_mappings[prKey].sessions.slice(-MAX_SESSIONS_PER_PR);
    }

    // Reverse mapping
    this.state.session_to_pr[sessionId] = prKey;
    this.state.stats.total_sessions_linked++;

    // Update recent PRs
    this.state.recent_prs = [prKey, ...this.state.recent_prs.filter(p => p !== prKey)].slice(0, 20);

    saveState(this.state);

    return {
      pr: prKey,
      session: sessionId,
      total_sessions: this.state.pr_mappings[prKey].sessions.length
    };
  }

  /**
   * Get session(s) for a PR
   *
   * @param {string|number} prNumber - PR number
   * @returns {object} PR data with sessions
   */
  getSessionsForPR(prNumber) {
    const prKey = String(prNumber);
    const pr = this.state.pr_mappings[prKey];

    if (!pr) {
      return null;
    }

    return {
      pr_number: pr.pr_number,
      repo: pr.repo,
      branch: pr.branch,
      sessions: pr.sessions,
      latest_session: pr.sessions[pr.sessions.length - 1],
      session_count: pr.sessions.length
    };
  }

  /**
   * Get PR for a session
   *
   * @param {string} sessionId - Session ID
   * @returns {string|null} PR number
   */
  getPRForSession(sessionId) {
    return this.state.session_to_pr[sessionId] || null;
  }

  /**
   * Auto-detect and link current PR
   */
  autoLinkCurrentPR(sessionId) {
    const gitInfo = getCurrentGitInfo();
    if (!gitInfo) {
      return { linked: false, reason: 'Not in a git repository' };
    }

    const prNumber = getPRNumberFromBranch(gitInfo.branch);
    if (!prNumber) {
      return { linked: false, reason: 'No open PR for current branch' };
    }

    const result = this.linkSession(prNumber, sessionId, {
      auto_linked: true,
      branch: gitInfo.branch
    });

    return {
      linked: true,
      ...result
    };
  }

  /**
   * Generate resume command for a PR
   *
   * @param {string|number} prNumber - PR number
   * @returns {string|null} Resume command
   */
  getResumeCommand(prNumber) {
    const data = this.getSessionsForPR(prNumber);
    if (!data || !data.latest_session) {
      return null;
    }

    return `claude --resume ${data.latest_session.session_id}`;
  }

  /**
   * Update work index for org with PR data
   *
   * @param {string} orgSlug - Organization slug
   * @param {string|number} prNumber - PR number
   * @param {object} workData - Work data to add
   */
  updateWorkIndex(orgSlug, prNumber, workData) {
    const workIndexPath = path.join(WORK_INDEX_DIR, orgSlug, 'WORK_INDEX.yaml');

    if (!fs.existsSync(path.dirname(workIndexPath))) {
      return { updated: false, reason: 'Org directory not found' };
    }

    let workIndex = '';
    if (fs.existsSync(workIndexPath)) {
      workIndex = fs.readFileSync(workIndexPath, 'utf8');
    }

    // Append PR work entry (simple YAML append)
    const entry = `
# PR #${prNumber} - ${new Date().toISOString().slice(0, 10)}
- pr: ${prNumber}
  date: ${new Date().toISOString()}
  description: ${workData.description || 'PR work'}
  sessions: ${(workData.sessions || []).join(', ')}
  status: ${workData.status || 'in_progress'}
`;

    fs.writeFileSync(workIndexPath, workIndex + entry, 'utf8');

    return { updated: true, path: workIndexPath };
  }

  /**
   * Get recent PRs
   */
  getRecentPRs() {
    return this.state.recent_prs.map(prKey => {
      const pr = this.state.pr_mappings[prKey];
      return {
        pr_number: pr?.pr_number,
        repo: pr?.repo,
        branch: pr?.branch,
        session_count: pr?.sessions?.length || 0,
        latest_activity: pr?.sessions?.[pr.sessions.length - 1]?.linked_at
      };
    });
  }

  /**
   * Get status report
   */
  getStatus() {
    return {
      total_prs: this.state.stats.total_prs_tracked,
      total_sessions: this.state.stats.total_sessions_linked,
      recent_prs: this.getRecentPRs().slice(0, 5),
      last_updated: this.state.last_updated
    };
  }

  /**
   * Generate session hint for PR
   */
  getSessionHint(prNumber) {
    const data = this.getSessionsForPR(prNumber);

    if (!data) {
      return `No previous sessions for PR #${prNumber}`;
    }

    const latestSession = data.latest_session;
    const resumeCmd = this.getResumeCommand(prNumber);

    return `
PR #${prNumber} has ${data.session_count} previous session(s).
Latest session: ${latestSession.session_id}
Linked at: ${latestSession.linked_at}

To resume: ${resumeCmd}
Or: claude --from-pr ${prNumber}
    `.trim();
  }

  /**
   * Reset state
   */
  reset() {
    this.state = {
      pr_mappings: {},
      session_to_pr: {},
      recent_prs: [],
      stats: {
        total_prs_tracked: 0,
        total_sessions_linked: 0
      },
      version: '1.0.0'
    };
    saveState(this.state);
  }
}

// =============================================================================
// CLI INTERFACE
// =============================================================================

if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0] || 'status';

  const manager = new PRSessionManager();

  switch (command) {
    case 'link': {
      const [, prNumber, sessionId] = args;
      if (!prNumber || !sessionId) {
        console.error('Usage: node pr-session-manager.js link <pr-number> <session-id>');
        process.exit(1);
      }
      const result = manager.linkSession(prNumber, sessionId);
      console.log('\nSession linked to PR:');
      console.log(JSON.stringify(result, null, 2));
      break;
    }

    case 'auto-link': {
      const sessionId = args[1] || `session-${Date.now()}`;
      const result = manager.autoLinkCurrentPR(sessionId);
      console.log('\nAuto-link result:');
      console.log(JSON.stringify(result, null, 2));
      break;
    }

    case 'get': {
      const prNumber = args[1];
      if (!prNumber) {
        console.error('Usage: node pr-session-manager.js get <pr-number>');
        process.exit(1);
      }
      const data = manager.getSessionsForPR(prNumber);
      if (data) {
        console.log('\nPR Sessions:');
        console.log(JSON.stringify(data, null, 2));
      } else {
        console.log(`No sessions found for PR #${prNumber}`);
      }
      break;
    }

    case 'hint': {
      const prNumber = args[1];
      if (!prNumber) {
        console.error('Usage: node pr-session-manager.js hint <pr-number>');
        process.exit(1);
      }
      console.log('\n' + manager.getSessionHint(prNumber));
      break;
    }

    case 'recent': {
      const recentPRs = manager.getRecentPRs();
      console.log('\n═══════════════════════════════════════════════════════');
      console.log('  Recent PRs with Sessions');
      console.log('═══════════════════════════════════════════════════════\n');

      if (recentPRs.length === 0) {
        console.log('  No PRs tracked yet.');
      } else {
        recentPRs.forEach((pr, i) => {
          console.log(`  ${i + 1}. PR #${pr.pr_number}`);
          console.log(`     Repo: ${pr.repo || 'unknown'} | Branch: ${pr.branch || 'unknown'}`);
          console.log(`     Sessions: ${pr.session_count} | Last: ${pr.latest_activity || 'N/A'}`);
          console.log('');
        });
      }
      console.log('═══════════════════════════════════════════════════════\n');
      break;
    }

    case 'status': {
      const status = manager.getStatus();
      console.log('\n═══════════════════════════════════════════════════════');
      console.log('  PR Session Manager Status');
      console.log('═══════════════════════════════════════════════════════\n');
      console.log(`  Total PRs tracked:    ${status.total_prs}`);
      console.log(`  Total sessions linked: ${status.total_sessions}`);
      console.log(`  Last updated:          ${status.last_updated || 'Never'}`);

      if (status.recent_prs.length > 0) {
        console.log('\n  Recent PRs:');
        status.recent_prs.forEach(pr => {
          console.log(`    - PR #${pr.pr_number} (${pr.session_count} sessions)`);
        });
      }

      console.log('\n═══════════════════════════════════════════════════════\n');
      break;
    }

    case 'reset': {
      manager.reset();
      console.log('PR session manager state has been reset.');
      break;
    }

    default:
      console.log(`
PR Session Manager

Link Claude Code sessions to GitHub PRs for context continuity.

Usage: node pr-session-manager.js <command> [args]

Commands:
  link <pr> <session>   Link a session to a PR
  auto-link [session]   Auto-detect and link current PR
  get <pr>              Get sessions for a PR
  hint <pr>             Get resume hint for a PR
  recent                List recent PRs with sessions
  status                Show manager status
  reset                 Reset all data

Integration with Claude Code v2.1.27+:
  - Use 'claude --from-pr <number>' to start session linked to PR
  - Sessions automatically link when using 'gh pr create'
  - Resume PR work with 'claude --resume <session-id>'

Examples:
  node pr-session-manager.js link 123 abc-session-id
  node pr-session-manager.js auto-link
  node pr-session-manager.js hint 123
`);
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

module.exports = {
  PRSessionManager,
  getCurrentGitInfo,
  getPRNumberFromBranch
};
