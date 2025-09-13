'use strict';

require('dotenv').config();
const { createHubSpotClient } = require('../../src/hubspot/client');
const { AgentError, formatUserMessage } = require('../../src/lib/errors');

async function run() {
  try {
    const client = await createHubSpotClient({});
    // Validate custom object support
    let supportsCustomObjects = true;
    try {
      await client.get('/crm/v3/schemas', { params: { limit: 1 } });
    } catch (e) {
      if (e.response && e.response.status === 403) supportsCustomObjects = false; else throw e;
    }
    if (!supportsCustomObjects) {
      throw new AgentError('NO_CUSTOM_OBJECT_SUPPORT', 'This portal does not support custom objects', {
        remediation: 'Upgrade subscription or enable feature. See DECISION_GATES.md.',
      });
    }
    console.log('Platform validation PASS');
  } catch (err) {
    const msg = err instanceof AgentError ? formatUserMessage(err) : (err.stack || String(err));
    console.error(msg);
    process.exit(2);
  }
}

if (require.main === module) run();

module.exports = { run };

