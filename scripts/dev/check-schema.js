#!/usr/bin/env node

const https = require('https');
require('dotenv').config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hostname = SUPABASE_URL.replace('https://', '').replace('http://', '');

// Just fetch one record to see the structure
const options = {
  hostname,
  port: 443,
  path: '/rest/v1/reflections?limit=1',
  method: 'GET',
  headers: {
    'apikey': SUPABASE_SERVICE_ROLE_KEY,
    'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    'Accept': 'application/json'
  }
};

const req = https.request(options, (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    if (res.statusCode >= 200 && res.statusCode < 300) {
      const records = JSON.parse(data);
      if (records.length > 0) {
        console.log('Available columns:');
        console.log(Object.keys(records[0]));
        console.log('\nSample record structure:');
        console.log(JSON.stringify(records[0], null, 2));
      } else {
        console.log('No records found');
      }
    } else {
      console.error(`HTTP ${res.statusCode}: ${data}`);
    }
  });
});

req.on('error', (e) => {
  console.error(`Error: ${e.message}`);
});

req.end();
