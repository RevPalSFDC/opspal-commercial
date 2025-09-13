#!/usr/bin/env node

/**
 * Test Filmhub HubSpot Connection
 */

const https = require('https');

// Check for API key
const apiKey = process.env.HUBSPOT_API_KEY_FILMHUB || process.env.HUBSPOT_API_KEY;
const accessToken = process.env.HUBSPOT_ACCESS_TOKEN_FILMHUB || process.env.HUBSPOT_ACCESS_TOKEN;
const portalId = '39560118';

if (!apiKey && !accessToken) {
    console.error('❌ No API credentials found!');
    console.error('Please set HUBSPOT_API_KEY_FILMHUB or HUBSPOT_ACCESS_TOKEN_FILMHUB in your .env file');
    process.exit(1);
}

console.log('🧪 Testing Filmhub HubSpot connection...');
console.log('Portal ID:', portalId);
console.log('Auth method:', accessToken ? 'Access Token' : 'API Key');

// Test API connection
const options = {
    hostname: 'api.hubapi.com',
    path: '/crm/v3/objects/contacts?limit=1',
    method: 'GET',
    headers: {}
};

// Set authentication header
if (accessToken) {
    options.headers['Authorization'] = `Bearer ${accessToken}`;
} else {
    options.path += `&hapikey=${apiKey}`;
}

const req = https.request(options, (res) => {
    let data = '';
    
    res.on('data', (chunk) => {
        data += chunk;
    });
    
    res.on('end', () => {
        if (res.statusCode === 200) {
            console.log('✅ Connection successful!');
            const response = JSON.parse(data);
            console.log('Total contacts:', response.total || 0);
        } else if (res.statusCode === 401) {
            console.error('❌ Authentication failed!');
            console.error('Please check your API credentials');
        } else {
            console.error('❌ Connection failed!');
            console.error('Status:', res.statusCode);
            console.error('Response:', data);
        }
    });
});

req.on('error', (error) => {
    console.error('❌ Connection error:', error.message);
});

req.end();
