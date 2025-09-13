'use strict';

require('dotenv').config();
const { createHubSpotClient } = require('../../src/hubspot/client');
const { AgentError, formatUserMessage } = require('../../src/lib/errors');

async function getScopesAndPortal(client) {
  // /oauth/v1/access-tokens/:token returns scopes & hub_id
  const token = (await require('../../src/hubspot/client').buildTokenManagerFromEnv().getAccessToken());
  const res = await client.get(`/oauth/v1/access-tokens/${token}`);
  return {
    hubId: res.data.hub_id,
    scopes: res.data.scopes || [],
    user: res.data.user,
  };
}

async function getSubscriptionInfo(client) {
  // HubSpot public APIs don’t expose a simple tier endpoint; we infer capability by feature checks.
  // Try listing schemas to confirm custom object capability.
  try {
    await client.get('/crm/v3/schemas', { params: { limit: 1 } });
    return { customObjectsSupported: true };
  } catch (err) {
    const status = err.response && err.response.status;
    if (status === 403) return { customObjectsSupported: false };
    throw err;
  }
}

async function preflight() {
  // Lazy-load yargs to avoid ESM issues in tests
  const out = {
    status: 'UNKNOWN',
    portal: {},
    checks: [],
    blockers: [],
    recommendations: [],
  };

  try {
    const client = await createHubSpotClient({});
    const [scopesInfo, subInfo] = await Promise.all([
      getScopesAndPortal(client),
      getSubscriptionInfo(client),
    ]);

    out.portal.hubId = scopesInfo.hubId;
    out.portal.scopes = scopesInfo.scopes;
    out.portal.user = scopesInfo.user;
    out.portal.customObjectsSupported = subInfo.customObjectsSupported;

    // Check required scopes for schema/associations
    const requiredScopes = ['crm.objects.schemas.read', 'crm.objects.schemas.write'];
    const missing = requiredScopes.filter(s => !scopesInfo.scopes.includes(s));
    if (missing.length) {
      out.blockers.push({ code: 'MISSING_SCOPES', missing });
      out.recommendations.push('Re-install app with required scopes: ' + missing.join(', '));
    }
    if (!subInfo.customObjectsSupported) {
      out.blockers.push({ code: 'NO_CUSTOM_OBJECT_SUPPORT' });
      out.recommendations.push('Upgrade subscription or enable custom objects for this portal.');
    }

    // Platform-specific rule: property groups required for custom objects
    out.checks.push({ code: 'CUSTOM_OBJECT_PROPERTY_GROUP_RULE', status: 'REQUIRED' });

    out.status = out.blockers.length ? 'FAIL' : 'PASS';
    return out;
  } catch (err) {
    const msg = err instanceof AgentError ? formatUserMessage(err) : (err.stack || String(err));
    throw new Error(msg);
  }
}

async function run() {
  // CLI wrapper
  const { hideBin } = require('yargs/helpers');
  const yargs = require('yargs/yargs');
  const argv = yargs(hideBin(process.argv))
    .option('json', { type: 'boolean', default: false })
    .argv;
  try {
    const out = await preflight();
    if (argv.json) {
      console.log(JSON.stringify(out, null, 2));
    } else {
      console.log('Preflight Summary');
      console.log('-----------------');
      console.log(`Portal: ${out.portal.hubId}`);
      console.log(`Custom Objects Supported: ${out.portal.customObjectsSupported}`);
      console.log(`Scopes: ${out.portal.scopes.join(', ')}`);
      if (out.blockers.length) {
        console.log('\nBLOCKERS:');
        out.blockers.forEach(b => console.log(`- ${b.code}: ${JSON.stringify(b)}`));
        console.log('\nOptions:');
        console.log('- A) Fix access (scopes/subscription) and re-run');
        console.log('- B) Skip custom object work (not recommended)');
        console.log('- C) Abort and open ACR with alternatives');
      } else {
        console.log('\nStatus: PASS');
      }
    }
    process.exit(out.blockers.length ? 2 : 0);
  } catch (err) {
    console.error(err.message || err);
    process.exit(1);
  }
}

if (require.main === module) run();

module.exports = { run, preflight };
