#!/usr/bin/env node

const https = require('https');

const webhookUrl = process.argv[2] || process.env.SLACK_WEBHOOK_URL;

if (!webhookUrl) {
  console.error('Usage: node test-slack-simple.js <webhook-url>');
  process.exit(1);
}

const message = {
  text: "✅ Slack webhook test successful!",
  blocks: [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: "🎉 *OpsPal Plugin Marketplace*\n\nWebhook is configured and working correctly!"
      }
    }
  ]
};

const payload = JSON.stringify(message);
const url = new URL(webhookUrl);

console.log('Testing webhook:', url.hostname + url.pathname);
console.log('Payload size:', payload.length, 'bytes');

const options = {
  hostname: url.hostname,
  port: 443,
  path: url.pathname + url.search,
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload)
  }
};

const req = https.request(options, (res) => {
  console.log('Status Code:', res.statusCode);
  console.log('Headers:', JSON.stringify(res.headers, null, 2));

  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log('Response:', data || '(empty)');

    if (res.statusCode === 200) {
      console.log('\n✅ SUCCESS: Message sent to Slack!');
    } else if (res.statusCode === 302) {
      console.log('\n⚠️  REDIRECT: Following redirect...');
      if (res.headers.location) {
        console.log('Redirect to:', res.headers.location);
      }
    } else {
      console.log('\n❌ FAILED:', res.statusCode);
    }
  });
});

req.on('error', (error) => {
  console.error('❌ Request error:', error.message);
  process.exit(1);
});

req.write(payload);
req.end();
