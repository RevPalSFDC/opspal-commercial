'use strict';

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');
const { createHubSpotClient } = require('../../src/hubspot/client');
const { AgentError, formatUserMessage } = require('../../src/lib/errors');

async function exportJSON(client, url, outPath) {
  const res = await client.get(url, { params: { limit: 100 } });
  const dir = path.dirname(outPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(res.data, null, 2));
}

async function run() {
  const argv = yargs(hideBin(process.argv))
    .option('out', { type: 'string', demandOption: true })
    .argv;

  try {
    const client = await createHubSpotClient({});
    await exportJSON(client, '/crm/v3/schemas', path.join(argv.out, 'schemas.json'));
    await exportJSON(client, '/crm/v3/properties', path.join(argv.out, 'properties.json'));
    await exportJSON(client, '/crm/v4/associations', path.join(argv.out, 'associations.json'));
    console.log(`Exported to ${argv.out}`);
  } catch (err) {
    const msg = err instanceof AgentError ? formatUserMessage(err) : (err.stack || String(err));
    console.error(msg);
    process.exit(1);
  }
}

if (require.main === module) run();

module.exports = { run };

