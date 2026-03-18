#!/usr/bin/env node
/**
 * Quick job monitoring script
 * Usage: node monitor-bulk-job.js <job-id> [org-alias]
 */

const AsyncBulkOps = require('./lib/async-bulk-ops');
const path = require('path');
const fs = require('fs');

const args = process.argv.slice(2);
const jobId = args[0];
let orgAlias = args[1];

if (!jobId) {
    console.error('Usage: node monitor-bulk-job.js <job-id> [org-alias]');
    process.exit(1);
}

// Try to determine org alias from job metadata if not provided
if (!orgAlias) {
    const jobsDir = path.join(__dirname, './lib/.bulk-jobs');
    const metadataPath = path.join(jobsDir, `${jobId}.json`);

    if (fs.existsSync(metadataPath)) {
        const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
        orgAlias = metadata.orgAlias;
        console.log(`📂 Found job metadata, using org: ${orgAlias}\n`);
    } else {
        console.error('❌ Could not determine org alias. Please provide it as second argument.');
        process.exit(1);
    }
}

(async () => {
    const ops = new AsyncBulkOps(orgAlias);
    await ops.monitorJob(jobId, { poll: true });
})().catch(error => {
    console.error('❌ Error:', error.message);
    process.exit(1);
});