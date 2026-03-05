#!/usr/bin/env node

/**
 * Project Connect Repo Sync Check
 *
 * Local-first repo sync checker with optional remote fallback.
 */

const ProjectConnect = require('./project-connect');

function parseArgs(argv) {
  const parsed = {};

  for (let i = 0; i < argv.length; i += 1) {
    if (!argv[i].startsWith('--')) continue;
    const key = argv[i].slice(2);
    const value = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : true;
    parsed[key] = value;
    if (value !== true) i += 1;
  }

  return parsed;
}

function printUsage() {
  console.log(`
Project Connect Repo Sync Check

Usage:
  node project-connect-check.js --customer-id <id> [options]

Required:
  --customer-id <id>      Customer ID (for example RP-ACM123456)

Optional:
  --customer <name>       Customer name hint for remote fallback
  --aliases <list>        Comma-separated aliases for remote fallback
  --stale-hours <hours>   Local registry staleness threshold (default: 24)
  --no-remote-fallback    Disable remote GitHub fallback
  --github-org <name>     GitHub organization name
  --created-by <email>    Actor email for check history
  --verbose               Enable verbose logging
  --help                  Show this usage message
  `);
}

(async () => {
  try {
    const options = parseArgs(process.argv.slice(2));

    if (options.help === true || options.h === true) {
      printUsage();
      process.exit(0);
    }

    if (!options['customer-id']) {
      console.error('Error: --customer-id is required.');
      printUsage();
      process.exit(1);
    }

    const result = await ProjectConnect.checkRepoSyncStatus({
      customerId: options['customer-id'],
      customer: options.customer || null,
      aliases: options.aliases ? options.aliases.split(',') : [],
      staleHours: options['stale-hours'] || 24,
      remoteFallback: options['no-remote-fallback'] !== true,
      githubOrg: options['github-org'] || null,
      createdBy: options['created-by'] || null,
      verbose: options.verbose === true
    });

    console.log(JSON.stringify(result, null, 2));
    process.exit(0);
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
})();
