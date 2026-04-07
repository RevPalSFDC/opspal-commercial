#!/usr/bin/env node

/**
 * Session Preflight (Fast Subset)
 *
 * Lightweight (<4s) environment check for SessionStart hook.
 * Only runs fast, non-blocking checks:
 *   - SF auth quick check (if SF_TARGET_ORG set)
 *   - HubSpot token quick check (if token set)
 *   - Marketo cache expiry check (file-based, no API call)
 *   - Critical deps (jq, node version)
 *   - Plugin version cache check (no API call)
 *
 * Outputs JSON suitable for SessionStart hook systemMessage.
 * Outputs nothing if all checks pass (to avoid noisy sessions).
 *
 * @module session-preflight
 * @version 1.0.0
 */

const { loadCheckers, runCheckers, runRemediation } = require('./env-preflight-engine');

async function main() {
  const checkers = loadCheckers({ quick: true });
  const { results, totalDurationMs } = await runCheckers(checkers, { quick: true });

  // Auto-fix safe issues in background (e.g., npm install for missing packages).
  // Spawn detached so the session-start hook isn't blocked by slow installs.
  const fixable = results.filter(r =>
    (r.status === 'fail' || r.status === 'warn') && r.autoFixable && r.remediation && (!r.fixTier || r.fixTier === 'safe')
  );
  if (fixable.length > 0) {
    const { spawn } = require('child_process');
    for (const issue of fixable) {
      try {
        const child = spawn('sh', ['-c', issue.remediation], {
          stdio: 'ignore', detached: true, env: { ...process.env, NO_COLOR: '1' }
        });
        child.unref();
      } catch { /* best-effort */ }
    }
  }

  // Report issues (fixes are running in background, will resolve by next session)
  const issues = results.filter(r => r.status === 'fail' || r.status === 'warn');

  if (issues.length === 0) {
    // All clear - output nothing so hook stays silent
    process.exit(0);
  }

  // Format as concise warning block
  const lines = ['Environment issues detected:'];
  for (const issue of issues) {
    const icon = issue.status === 'fail' ? '✗' : '⚠';
    lines.push(`  ${icon} ${issue.name}: ${issue.message}`);
    if (issue.remediation) {
      lines.push(`    Fix: ${issue.remediation}`);
    }
  }
  lines.push(`Run /envcheck for full diagnostics.`);

  // Output as JSON for the SessionStart hook
  console.log(JSON.stringify({
    systemMessage: lines.join('\n'),
  }));
}

main().catch(() => {
  // Session preflight must never block session start
  process.exit(0);
});
