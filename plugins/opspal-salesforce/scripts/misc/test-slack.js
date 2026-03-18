const https = require('https');
require('dotenv').config();

const webhookUrl = process.env.SLACK_WEBHOOK_URL;
console.log('Testing webhook:', webhookUrl ? 'Found' : 'Not found');

const message = {
    text: "🚀 ClaudeSFDC v2.7.2 Released!",
    blocks: [
        {
            type: "section",
            text: {
                type: "mrkdwn",
                text: "*ClaudeSFDC v2.7.2 - Security & Compliance Update*\n\n• Complete Gate Integration (21/21 agents)\n• Zero-bypass architecture\n• MCP-first enforcement\n• Production approval workflows\n• 8 YAML fixes completed\n\nGitHub Release: https://github.com/RevPalSFDC/claude-sfdc/releases/tag/v2.7.2"
            }
        }
    ]
};

const url = new URL(webhookUrl);
const options = {
    hostname: url.hostname,
    port: 443,
    path: url.pathname,
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
    }
};

const req = https.request(options, (res) => {
    console.log('Status:', res.statusCode);
    let data = '';
    res.on('data', (chunk) => data += chunk);
    res.on('end', () => {
        console.log('Response:', data);
        if (data === 'ok') {
            console.log('✅ Message sent successfully!');
        }
    });
});

req.on('error', (error) => {
    console.error('Error:', error);
});

req.write(JSON.stringify(message));
req.end();