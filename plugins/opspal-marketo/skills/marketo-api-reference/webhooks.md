# Marketo Webhooks Guide

Complete guide for implementing Marketo webhooks for real-time integrations.

## Webhook Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    Marketo Webhook Flow                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Marketo Smart Campaign                Your Endpoint             │
│  ┌──────────────────┐                  ┌──────────────────┐     │
│  │ Trigger/Filter   │                  │ Receive POST/GET │     │
│  │ (Lead qualifies) │                  │                  │     │
│  └────────┬─────────┘                  │ Process Data     │     │
│           │                            │                  │     │
│           ▼                            │ Return Response  │     │
│  ┌──────────────────┐                  │ (optional)       │     │
│  │ Call Webhook     │ ──────────────▶  └──────────────────┘     │
│  │ (flow step)      │                                           │
│  └────────┬─────────┘                                           │
│           │                                                     │
│           ▼                                                     │
│  ┌──────────────────┐                                           │
│  │ Response Token   │  ◀───────── Response data                 │
│  │ (if configured)  │                                           │
│  └──────────────────┘                                           │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Webhook Types

| Type | Method | Use Case |
|------|--------|----------|
| **Outbound** | POST/GET | Send data to external system |
| **Response** | POST | Receive data back into Marketo |

---

## Creating Webhooks

### Via UI

1. Go to **Admin > Webhooks**
2. Click **New Webhook**
3. Configure settings:
   - Name
   - URL
   - Request Type (GET/POST)
   - Template (payload)
   - Response Mappings

### Via API

```http
POST /rest/asset/v1/webhooks.json
Authorization: Bearer {access_token}
Content-Type: application/json

{
  "name": "Lead Sync Webhook",
  "url": "https://yourapp.com/api/marketo/webhook",
  "requestType": "POST",
  "requestEncoding": "JSON",
  "responseType": "JSON",
  "folder": {
    "id": 100,
    "type": "Folder"
  },
  "template": "{ \"leadId\": {{lead.id}}, \"email\": \"{{lead.Email}}\", \"score\": {{lead.Lead Score}} }"
}
```

---

## Webhook Configuration

### Request Template (JSON)

```json
{
  "leadId": {{lead.id}},
  "email": "{{lead.Email}}",
  "firstName": "{{lead.First Name}}",
  "lastName": "{{lead.Last Name}}",
  "company": "{{lead.Company}}",
  "score": {{lead.Lead Score}},
  "source": "{{lead.Lead Source}}",
  "timestamp": "{{system.datetime}}"
}
```

### Request Template (Form-encoded)

```
leadId={{lead.id}}&email={{lead.Email}}&firstName={{lead.First Name}}
```

### Available Tokens

| Token Type | Syntax | Example |
|------------|--------|---------|
| Lead field | `{{lead.Field Name}}` | `{{lead.Email}}` |
| Company field | `{{company.Field Name}}` | `{{company.Company Name}}` |
| Trigger token | `{{trigger.Name}}` | `{{trigger.Web Page}}` |
| Program token | `{{program.Name}}` | `{{program.Name}}` |
| System token | `{{system.token}}` | `{{system.datetime}}` |
| My token | `{{my.Token Name}}` | `{{my.API Key}}` |

---

## Response Mapping

### Configure Response Attributes

Map JSON response fields to Marketo lead fields:

| Response Path | Lead Field |
|---------------|------------|
| `$.score` | Lead Score |
| `$.status` | Lead Status |
| `$.externalId` | External ID |

### Response JSON Example

```json
{
  "success": true,
  "score": 85,
  "status": "Qualified",
  "externalId": "EXT-12345",
  "recommendations": ["Product A", "Product B"]
}
```

### Response Token Usage

In subsequent flow steps:
```
{{webhook.Response.score}}
{{webhook.Response.status}}
{{webhook.Response.externalId}}
```

---

## Endpoint Implementation

### Node.js Example

```javascript
const express = require('express');
const crypto = require('crypto');

const app = express();
app.use(express.json());

// Webhook endpoint
app.post('/api/marketo/webhook', (req, res) => {
  // Validate signature (if configured)
  const signature = req.headers['x-marketo-signature'];
  if (!validateSignature(req.body, signature)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  const { leadId, email, firstName, lastName, score } = req.body;

  // Process the lead data
  console.log(`Received lead: ${email} (ID: ${leadId})`);

  // Perform your business logic
  const processedData = processLead({ leadId, email, firstName, lastName, score });

  // Return response (mapped back to Marketo)
  res.json({
    success: true,
    score: processedData.newScore,
    status: processedData.status,
    externalId: processedData.externalId,
    processedAt: new Date().toISOString()
  });
});

function validateSignature(body, signature) {
  const secret = process.env.MARKETO_WEBHOOK_SECRET;
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(body))
    .digest('hex');
  return signature === expectedSignature;
}

function processLead(lead) {
  // Your business logic here
  return {
    newScore: lead.score + 10,
    status: lead.score > 50 ? 'Qualified' : 'Nurture',
    externalId: `EXT-${lead.leadId}`
  };
}

app.listen(3000);
```

### Python Example

```python
from flask import Flask, request, jsonify
import hmac
import hashlib
import os

app = Flask(__name__)

@app.route('/api/marketo/webhook', methods=['POST'])
def webhook():
    # Validate signature
    signature = request.headers.get('X-Marketo-Signature')
    if not validate_signature(request.json, signature):
        return jsonify({'error': 'Invalid signature'}), 401

    data = request.json
    lead_id = data.get('leadId')
    email = data.get('email')
    score = data.get('score', 0)

    # Process lead
    new_score = score + 10
    status = 'Qualified' if score > 50 else 'Nurture'
    external_id = f'EXT-{lead_id}'

    # Return response
    return jsonify({
        'success': True,
        'score': new_score,
        'status': status,
        'externalId': external_id
    })

def validate_signature(body, signature):
    secret = os.environ.get('MARKETO_WEBHOOK_SECRET', '').encode()
    expected = hmac.new(secret, str(body).encode(), hashlib.sha256).hexdigest()
    return hmac.compare_digest(signature or '', expected)

if __name__ == '__main__':
    app.run(port=3000)
```

---

## Webhook in Smart Campaigns

### Flow Step Configuration

```
Flow:
1. Wait: 5 minutes
2. Call Webhook: "Lead Sync Webhook"
3. Change Data Value:
   - Attribute: External ID
   - New Value: {{webhook.Response.externalId}}
4. Change Lead Score:
   - Change: {{webhook.Response.score}}
```

### Using Response Tokens

```
If webhook.Response.status = "Qualified"
Then:
  - Add to List: "Qualified Leads"
  - Send Email: "Welcome Qualified"
Else:
  - Add to List: "Nurture Leads"
  - Send Email: "Nurture Sequence Start"
```

---

## Error Handling

### Webhook Error Codes

| Scenario | Marketo Behavior |
|----------|------------------|
| HTTP 2xx | Success |
| HTTP 4xx | Fail, no retry |
| HTTP 5xx | Fail, retry (up to 3 times) |
| Timeout (30s) | Fail, retry |
| Invalid JSON response | Response mapping fails |

### Implementing Retry Logic

```javascript
app.post('/api/marketo/webhook', async (req, res) => {
  const requestId = req.headers['x-marketo-request-id'];

  try {
    // Check for duplicate (idempotency)
    if (await isDuplicateRequest(requestId)) {
      return res.json({ success: true, message: 'Already processed' });
    }

    // Process request
    const result = await processWebhook(req.body);

    // Mark as processed
    await markRequestProcessed(requestId);

    res.json(result);
  } catch (error) {
    console.error(`Webhook error (${requestId}):`, error);

    // Return 500 to trigger Marketo retry
    res.status(500).json({
      error: 'Processing failed',
      retryable: true
    });
  }
});
```

### Logging Best Practices

```javascript
function logWebhook(req, res, result) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    requestId: req.headers['x-marketo-request-id'],
    leadId: req.body.leadId,
    email: req.body.email,
    responseStatus: res.statusCode,
    responseBody: result,
    processingTime: Date.now() - req.startTime
  };

  console.log(JSON.stringify(logEntry));
  // Also send to your logging service
}
```

---

## Security

### Signature Validation

Configure webhook signature in Marketo:

1. Go to **Admin > Webhooks**
2. Edit webhook
3. Set **Signature Secret**

Validate in your endpoint:

```javascript
function validateMarketoSignature(body, signature, secret) {
  const payload = typeof body === 'string' ? body : JSON.stringify(body);
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(signature || ''),
    Buffer.from(expectedSignature)
  );
}
```

### IP Allowlisting

Marketo sends webhooks from specific IP ranges. Whitelist these in your firewall:

- Check Marketo's documentation for current IP ranges
- Use WAF rules to restrict access
- Combine with signature validation

### HTTPS Requirements

- Always use HTTPS endpoints
- Use valid SSL certificates
- Avoid self-signed certificates in production

---

## Testing Webhooks

### Test Endpoint

```bash
# Test with curl
curl -X POST https://yourapp.com/api/marketo/webhook \
  -H "Content-Type: application/json" \
  -H "X-Marketo-Signature: test-signature" \
  -d '{
    "leadId": 12345,
    "email": "test@example.com",
    "firstName": "Test",
    "lastName": "User",
    "score": 50
  }'
```

### Marketo Test Flow

1. Create test smart campaign
2. Add specific lead to trigger
3. Watch webhook activity log
4. Verify response mapping

### Debug Mode

```javascript
app.post('/api/marketo/webhook', (req, res) => {
  // Log full request for debugging
  console.log('=== WEBHOOK REQUEST ===');
  console.log('Headers:', JSON.stringify(req.headers, null, 2));
  console.log('Body:', JSON.stringify(req.body, null, 2));
  console.log('======================');

  // Process and respond
  const response = { success: true, debug: true };
  console.log('Response:', JSON.stringify(response, null, 2));
  res.json(response);
});
```

---

## Common Use Cases

### Lead Enrichment

```json
// Request
{
  "leadId": {{lead.id}},
  "email": "{{lead.Email}}",
  "company": "{{lead.Company}}"
}

// Response
{
  "companySize": "500-1000",
  "industry": "Technology",
  "revenue": "$10M-$50M",
  "enrichmentScore": 85
}
```

### Lead Scoring

```json
// Request
{
  "leadId": {{lead.id}},
  "email": "{{lead.Email}}",
  "pageViews": {{lead.Number of Page Views}},
  "emailOpens": {{lead.Number of Email Opens}}
}

// Response
{
  "calculatedScore": 75,
  "tier": "A",
  "recommendation": "MQL"
}
```

### CRM Sync

```json
// Request
{
  "leadId": {{lead.id}},
  "email": "{{lead.Email}}",
  "firstName": "{{lead.First Name}}",
  "lastName": "{{lead.Last Name}}",
  "action": "sync"
}

// Response
{
  "crmId": "00Q000000012345",
  "syncStatus": "created",
  "syncTimestamp": "2025-01-15T10:30:00Z"
}
```

---

## Troubleshooting

### Webhook Not Firing

1. Check smart campaign is active
2. Verify trigger conditions
3. Check webhook is not paused
4. Review campaign activity log

### Response Not Mapping

1. Verify JSON structure matches mapping
2. Check response content-type is application/json
3. Validate JSON syntax
4. Check for null values in response

### Timeout Issues

1. Optimize endpoint performance
2. Implement async processing
3. Return quick acknowledgment
4. Process in background
