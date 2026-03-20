#!/usr/bin/env node
'use strict';

/**
 * OpsPal Status Line for Claude Code
 *
 * Designed for semi-technical RevOps users. Shows:
 *   Line 1: [Model] OpsPal · <Platform>     $cost · duration
 *   Line 2: Context bar with color thresholds + lines changed
 *
 * Install: Add to ~/.claude/settings.json:
 *   { "statusLine": { "type": "command", "command": "node ~/.claude/plugins/marketplaces/.../scripts/opspal-statusline.js" } }
 */

let input = '';
process.stdin.on('data', chunk => input += chunk);
process.stdin.on('end', () => {
  try {
    const data = JSON.parse(input);
    const lines = buildStatusLine(data);
    lines.forEach(line => console.log(line));
  } catch {
    console.log('OpsPal');
  }
});

function buildStatusLine(data) {
  // -- Colors (RevPal brand-adjacent for terminal) --
  const GRAPE    = '\x1b[38;2;95;59;140m';   // #5F3B8C - primary brand
  const APRICOT  = '\x1b[38;2;233;149;96m';  // #E99560 - accent
  const GREEN    = '\x1b[38;2;111;191;115m';  // #6FBF73 - success/low usage
  const YELLOW   = '\x1b[33m';                // warning/medium usage
  const RED      = '\x1b[31m';                // danger/high usage
  const DIM      = '\x1b[2m';
  const BOLD     = '\x1b[1m';
  const RESET    = '\x1b[0m';

  // -- Model --
  const model = data.model?.display_name || 'Claude';

  // -- Platform detection from agent name, cwd, or project dir --
  const platform = detectPlatform(data);

  // -- Cost --
  const cost = data.cost?.total_cost_usd || 0;
  const costStr = cost < 0.01 ? '--' : `$${cost.toFixed(2)}`;

  // -- Duration --
  const durationMs = data.cost?.total_duration_ms || 0;
  const mins = Math.floor(durationMs / 60000);
  const secs = Math.floor((durationMs % 60000) / 1000);
  const durationStr = durationMs < 1000 ? '--' : `${mins}m ${secs}s`;

  // -- Context bar --
  const pct = Math.floor(data.context_window?.used_percentage || 0);
  const barWidth = 20;
  const filled = Math.floor(pct * barWidth / 100);
  const barColor = pct >= 80 ? RED : pct >= 60 ? YELLOW : GREEN;
  const bar = barColor + '\u2588'.repeat(filled) + DIM + '\u2591'.repeat(barWidth - filled) + RESET;

  // -- Lines changed --
  const added = data.cost?.total_lines_added || 0;
  const removed = data.cost?.total_lines_removed || 0;
  const linesStr = (added || removed)
    ? `${GREEN}+${added}${RESET} ${DIM}/${RESET} ${APRICOT}-${removed}${RESET} lines`
    : '';

  // -- Worktree indicator --
  const worktree = data.worktree?.name ? `${DIM}wt:${data.worktree.name}${RESET} ` : '';

  // -- Build lines --
  const line1Parts = [
    `${GRAPE}${BOLD}[${model}]${RESET}`,
    `${BOLD}OpsPal${RESET}`,
    platform ? `${DIM}\u00b7${RESET} ${platform}` : '',
    worktree,
    `${DIM}${costStr} \u00b7 ${durationStr}${RESET}`
  ].filter(Boolean);

  // Space the cost/duration to the right conceptually by joining with spaces
  const line1 = line1Parts.join('  ');

  const contextLabel = `${pct}% context`;
  const line2Parts = [bar, contextLabel, linesStr].filter(Boolean);
  const line2 = line2Parts.join('  ');

  return [line1, line2];
}

/**
 * Detect which platform the user is working in.
 * Checks agent name first, then workspace path patterns.
 * Also detects environment (Production/Sandbox) from path conventions
 * and the SF_TARGET_ORG environment variable.
 */
function detectPlatform(data) {
  const agent = (data.agent?.name || '').toLowerCase();
  const cwd = (data.workspace?.current_dir || data.cwd || '').toLowerCase();
  const projectDir = (data.workspace?.project_dir || '').toLowerCase();
  const searchStr = `${agent} ${cwd} ${projectDir}`;

  let platform = '';
  if (/salesforce|sfdc|sf-/.test(searchStr))      platform = 'Salesforce';
  else if (/hubspot|hs-/.test(searchStr))          platform = 'HubSpot';
  else if (/marketo|mkto/.test(searchStr))         platform = 'Marketo';
  else if (/gtm|territory|quota/.test(searchStr))  platform = 'GTM Planning';
  else if (/monday/.test(searchStr))               platform = 'Monday.com';
  else if (/okr/.test(searchStr))                  platform = 'OKRs';
  else if (/data.hygiene|dedup/.test(searchStr))   platform = 'Data Hygiene';

  if (!platform) return '';

  // Detect environment tier from path and env vars
  const env = detectEnvironment(cwd, platform);
  return env ? `${platform} (${env})` : platform;
}

/**
 * Detect environment tier: Production, Sandbox, UAT, etc.
 *
 * Sources checked in priority order:
 *   1. Workspace path segments (orgs/acme/platforms/salesforce/production/)
 *   2. SF_TARGET_ORG env var for Salesforce orgs
 *   3. HUBSPOT_PORTAL_ID naming conventions
 */
function detectEnvironment(cwd, platform) {
  // -- Path-based detection (works for all platforms) --
  // Matches path segments like /production/, /sandbox/, /staging/, /uat/, /dev/
  const prodPattern = /\/(production|prod)\//;
  const sandboxPattern = /\/(sandbox|sbx|dev|develop)\//;
  const uatPattern = /\/(uat|qa|test|staging)\//;

  if (prodPattern.test(cwd))    return 'Prod';
  if (sandboxPattern.test(cwd)) return 'Sandbox';
  if (uatPattern.test(cwd))     return 'UAT';

  // -- Salesforce org alias detection via SF_TARGET_ORG --
  if (platform === 'Salesforce') {
    const orgAlias = (process.env.SF_TARGET_ORG || '').toLowerCase();
    if (orgAlias) {
      if (/prod|production|live/.test(orgAlias))          return 'Prod';
      if (/sandbox|sbx|dev|partial|full/.test(orgAlias))  return 'Sandbox';
      if (/uat|qa|test|staging/.test(orgAlias))            return 'UAT';
    }
  }

  // -- HubSpot: check for sandbox portal indicators --
  if (platform === 'HubSpot') {
    const portalId = (process.env.HUBSPOT_PORTAL_ID || '').toLowerCase();
    if (/sandbox|test|dev/.test(portalId)) return 'Sandbox';
  }

  // -- Marketo: check for instance type --
  if (platform === 'Marketo') {
    const instance = (process.env.MARKETO_INSTANCE || '').toLowerCase();
    if (/sandbox|test|dev/.test(instance)) return 'Sandbox';
  }

  return '';
}
