'use strict';

require('dotenv').config();
const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');
const { createHubSpotClient } = require('../../src/hubspot/client');
const { AgentError, formatUserMessage } = require('../../src/lib/errors');
const fs = require('fs');

async function planAndApply({ dryRun, migrationPath }) {
  const migrate = require(`../../${migrationPath}`);
  const client = await createHubSpotClient({});
  const plan = await migrate.plan(client);
  console.log('Plan:');
  plan.steps.forEach((s, i) => console.log(`${i + 1}. ${s.description}`));

  if (dryRun) {
    console.log('\nDry run mode. No changes applied.');
    return { applied: false, steps: plan.steps.length };
  }
  const token = process.env.APPROVAL_TOKEN;
  if (!token) {
    throw new AgentError('APPROVAL_REQUIRED', 'Missing APPROVAL_TOKEN env var. Refusing to apply changes.', {
      hint: 'Set APPROVAL_TOKEN to a valid approval value or run in dry-run.',
    });
  }
  const result = await migrate.up(client);
  return { applied: true, result };
}

async function run() {
  const argv = yargs(hideBin(process.argv))
    .option('migration', { type: 'string', demandOption: true })
    .option('apply', { type: 'boolean', default: false })
    .argv;

  try {
    const exists = fs.existsSync(argv.migration);
    if (!exists) throw new AgentError('MIGRATION_NOT_FOUND', `Missing migration file: ${argv.migration}`);
    const res = await planAndApply({ dryRun: !argv.apply, migrationPath: argv.migration });
    console.log(JSON.stringify(res, null, 2));
  } catch (err) {
    const msg = err instanceof AgentError ? formatUserMessage(err) : (err.stack || String(err));
    console.error(msg);
    process.exit(1);
  }
}

if (require.main === module) run();

module.exports = { run, planAndApply };
