'use strict';

require('dotenv').config();
const { createHubSpotClient } = require('../../src/hubspot/client');

(async () => {
  try {
    const client = await createHubSpotClient({});
    const res = await client.get('/integrations/v1/me');
    console.log('OK', { appId: res.data.applicationId, scopes: res.data.scopes });
    process.exit(0);
  } catch (e) {
    console.error('FAILED', e.response ? e.response.data : e.stack || String(e));
    process.exit(1);
  }
})();

