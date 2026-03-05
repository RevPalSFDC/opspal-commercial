#!/usr/bin/env node

/**
 * Approval Queue Monitor
 *
 * Periodically lists pending approvals for operational visibility.
 */

const HumanInTheLoopController = require('./human-in-the-loop-controller');

const args = process.argv.slice(2);
let intervalSeconds = 60;
let runOnce = false;
let envLabel = null;

for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  if (arg === '--interval') intervalSeconds = parseInt(args[++i], 10);
  else if (arg === '--once') runOnce = true;
  else if (!arg.startsWith('--') && !envLabel) envLabel = arg;
}

if (!Number.isFinite(intervalSeconds) || intervalSeconds <= 0) {
  intervalSeconds = 60;
}

const controller = new HumanInTheLoopController({ verbose: false });

function renderSummary(approvals) {
  const label = envLabel ? ` (${envLabel})` : '';
  const timestamp = new Date().toISOString();
  if (!approvals.length) {
    console.log(`[${timestamp}] No pending approvals${label}`);
    return;
  }

  const byRisk = approvals.reduce((acc, approval) => {
    acc[approval.riskLevel] = (acc[approval.riskLevel] || 0) + 1;
    return acc;
  }, {});

  console.log(`[${timestamp}] Pending approvals${label}: ${approvals.length}`);
  Object.entries(byRisk).forEach(([risk, count]) => {
    console.log(`  - ${risk}: ${count}`);
  });
}

function checkQueue() {
  try {
    const approvals = controller.listPendingApprovals();
    renderSummary(approvals);
  } catch (error) {
    console.error(`Approval queue monitor error: ${error.message}`);
  }
}

if (runOnce) {
  checkQueue();
  process.exit(0);
}

checkQueue();
setInterval(checkQueue, intervalSeconds * 1000);
