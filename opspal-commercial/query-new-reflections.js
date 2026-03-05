#!/usr/bin/env node

const https = require('https');
const fs = require('fs');
const path = require('path');

// Load environment variables from .env file
require('dotenv').config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Error: Missing required environment variables');
  console.error('Required: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const hostname = SUPABASE_URL.replace('https://', '').replace('http://', '');

const options = {
  hostname,
  port: 443,
  path: '/rest/v1/reflections?reflection_status=eq.new&select=id,org,created_at,data,roi_annual_value,reflection_status&order=created_at.desc',
  method: 'GET',
  headers: {
    'apikey': SUPABASE_SERVICE_ROLE_KEY,
    'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    'Accept': 'application/json'
  }
};

console.error('Querying Supabase for reflections with status=new...');

const req = https.request(options, (res) => {
  let data = '';

  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    if (res.statusCode >= 200 && res.statusCode < 300) {
      const reflections = JSON.parse(data);
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

      const output = {
        total_reflections: reflections.length,
        query_timestamp: new Date().toISOString(),
        query_filter: "reflection_status = 'new'",
        reflections: reflections.map(r => ({
          id: r.id,
          org: r.org,
          created_at: r.created_at,
          data: r.data,
          roi_annual_value: r.roi_annual_value,
          reflection_status: r.reflection_status
        }))
      };

      // Create reports directory if it doesn't exist
      const reportsDir = path.join(__dirname, 'reports');
      if (!fs.existsSync(reportsDir)) {
        fs.mkdirSync(reportsDir, { recursive: true });
      }

      // Save to file
      const outputFile = path.join(reportsDir, `open-reflections-${timestamp}.json`);
      fs.writeFileSync(outputFile, JSON.stringify(output, null, 2));

      console.error(`✓ Query successful`);
      console.error(`✓ Found ${reflections.length} reflections with status='new'`);
      console.error(`✓ Results saved to: ${outputFile}`);
      console.error('');

      // Output summary to stdout
      console.log(JSON.stringify({
        total_reflections: output.total_reflections,
        query_timestamp: output.query_timestamp,
        output_file: outputFile,
        sample_reflection_ids: reflections.slice(0, 5).map(r => r.id)
      }, null, 2));
    } else {
      console.error(`HTTP ${res.statusCode}: ${data}`);
      process.exit(1);
    }
  });
});

req.on('error', (e) => {
  console.error(`Error: ${e.message}`);
  process.exit(1);
});

req.end();
