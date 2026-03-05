# HubSpot Marketplace Requirements

Complete checklist for submitting HubSpot apps to the App Marketplace.

## Submission Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    Marketplace Submission                        │
├─────────────────────────────────────────────────────────────────┤
│  1. Technical Requirements                                       │
│     ↓                                                            │
│  2. Documentation Requirements                                   │
│     ↓                                                            │
│  3. Security Review                                              │
│     ↓                                                            │
│  4. User Experience Review                                       │
│     ↓                                                            │
│  5. Listing Content                                              │
│     ↓                                                            │
│  6. HubSpot Review (~2-4 weeks)                                  │
│     ↓                                                            │
│  7. Public Listing                                               │
└─────────────────────────────────────────────────────────────────┘
```

---

## Pre-Submission Checklist

### Technical Requirements

| Requirement | Status | Notes |
|-------------|--------|-------|
| OAuth 2.0 implementation | ☐ | Required for public apps |
| HTTPS endpoints | ☐ | All URLs must be HTTPS |
| Webhook signature validation | ☐ | Verify HubSpot signatures |
| Rate limit handling | ☐ | Implement backoff |
| Error handling | ☐ | User-friendly messages |
| Scope justification | ☐ | Request only needed scopes |

### Documentation Requirements

| Requirement | Status | Notes |
|-------------|--------|-------|
| Privacy policy URL | ☐ | Public, accessible |
| Terms of service URL | ☐ | Public, accessible |
| Support documentation | ☐ | Setup guide, FAQ |
| Support contact | ☐ | Email or support portal |

### Listing Requirements

| Requirement | Status | Notes |
|-------------|--------|-------|
| App name | ☐ | Unique, descriptive |
| App logo | ☐ | 500x500px, PNG |
| Short description | ☐ | 80 characters max |
| Full description | ☐ | 3000 characters max |
| Screenshots | ☐ | 3-5 screenshots required |
| Video (optional) | ☐ | Demo video URL |
| Categories | ☐ | Select relevant categories |
| Pricing | ☐ | Free, paid, or freemium |

---

## Technical Requirements Detail

### OAuth Implementation

```javascript
// Required OAuth flow
const REQUIRED_OAUTH_FEATURES = {
  // Must use authorization code grant
  grantType: 'authorization_code',

  // Must handle token refresh
  tokenRefresh: true,

  // Must validate state parameter
  csrfProtection: true,

  // Must use HTTPS redirect URI
  httpsRedirect: true,

  // Must handle scope changes gracefully
  scopeHandling: true
};
```

### Webhook Security

```javascript
const crypto = require('crypto');

function validateHubSpotSignature(req) {
  const signature = req.headers['x-hubspot-signature'];
  const timestamp = req.headers['x-hubspot-request-timestamp'];

  // Check timestamp is recent (5 minutes)
  const now = Date.now();
  const requestTime = parseInt(timestamp);
  if (Math.abs(now - requestTime) > 300000) {
    return false;
  }

  // Compute expected signature
  const sourceString = process.env.HUBSPOT_CLIENT_SECRET +
    req.method +
    req.url +
    JSON.stringify(req.body) +
    timestamp;

  const expectedSignature = crypto
    .createHash('sha256')
    .update(sourceString)
    .digest('hex');

  return signature === expectedSignature;
}
```

### Rate Limit Handling

```javascript
async function hubspotRequestWithRetry(requestFn, maxRetries = 3) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await requestFn();
    } catch (error) {
      if (error.response?.status === 429) {
        const retryAfter = error.response.headers['retry-after'] || 10;
        await sleep(retryAfter * 1000);
        continue;
      }
      throw error;
    }
  }
  throw new Error('Max retries exceeded');
}
```

### Error Response Format

```javascript
// User-friendly error responses
const ERROR_MESSAGES = {
  'INVALID_TOKEN': 'Please reconnect your HubSpot account',
  'RATE_LIMIT': 'Too many requests. Please try again in a moment',
  'NOT_FOUND': 'The requested record was not found',
  'PERMISSION_DENIED': 'You do not have permission for this action',
  'VALIDATION_ERROR': 'Please check your input and try again'
};
```

---

## Scope Requirements

### Scope Justification

For each scope requested, you must provide:

| Scope | Business Justification |
|-------|------------------------|
| `crm.objects.contacts.read` | "Required to display customer information in our dashboard" |
| `crm.objects.contacts.write` | "Required to sync data back to HubSpot contacts" |
| `automation` | "Required to create workflows that connect to our service" |

### Minimum Scope Principle

```javascript
// ❌ BAD: Requesting unnecessary scopes
const scopes = [
  'crm.objects.contacts.read',
  'crm.objects.contacts.write',
  'crm.objects.companies.read',
  'crm.objects.companies.write',  // Not needed!
  'crm.objects.deals.read',       // Not needed!
  'crm.objects.deals.write',      // Not needed!
  'automation'                     // Not needed!
];

// ✅ GOOD: Request only what you need
const scopes = [
  'crm.objects.contacts.read',
  'crm.objects.contacts.write',
  'crm.objects.companies.read'
];
```

### Optional Scopes

```javascript
// Use optional_scope for enhanced features
const authUrl = new URL('https://app.hubspot.com/oauth/authorize');
authUrl.searchParams.set('client_id', clientId);
authUrl.searchParams.set('redirect_uri', redirectUri);
authUrl.searchParams.set('scope', 'crm.objects.contacts.read');
authUrl.searchParams.set('optional_scope', 'automation'); // Nice-to-have
```

---

## Documentation Requirements

### Privacy Policy

Must include:

- What data you collect
- How data is used
- How data is stored
- Data retention policy
- User rights (access, deletion)
- Third-party sharing
- Contact information

### Support Documentation

Required sections:

1. **Getting Started**
   - Installation steps
   - Initial configuration
   - Connecting to HubSpot

2. **Features Guide**
   - Each feature explained
   - Screenshots/videos
   - Use cases

3. **FAQ**
   - Common questions
   - Troubleshooting
   - Known limitations

4. **Contact Support**
   - Support hours
   - Response time SLA
   - Contact methods

---

## Listing Content

### App Name Guidelines

- ✅ Descriptive: "ContactSync - Two-Way CRM Integration"
- ✅ Unique: Not similar to existing apps
- ❌ Generic: "CRM Tool"
- ❌ Misleading: "HubSpot Official Sync"

### Description Template

```markdown
## Short Description (80 chars)
Sync customer data bidirectionally between HubSpot and your CRM in real-time.

## Full Description (3000 chars max)

### What does this app do?
[Clear explanation of primary function]

### Key Features
- Feature 1: Brief description
- Feature 2: Brief description
- Feature 3: Brief description

### Who is this for?
[Target audience description]

### How it works
1. Connect your HubSpot account
2. Configure sync settings
3. Watch data flow automatically

### Requirements
- HubSpot Professional or Enterprise
- [External system] account
- [Any other requirements]

### Support
Email: support@yourapp.com
Documentation: https://yourapp.com/docs
```

### Screenshot Requirements

| Screenshot | Purpose | Dimensions |
|------------|---------|------------|
| 1. Main dashboard | Show primary value | 1920x1080 |
| 2. Configuration | Show setup process | 1920x1080 |
| 3. Integration | Show HubSpot integration | 1920x1080 |
| 4. Results | Show outcomes/benefits | 1920x1080 |
| 5. Mobile (optional) | Show mobile experience | 750x1334 |

### Categories

Select up to 3 relevant categories:

- Analytics & Reporting
- Customer Service
- E-commerce
- Email & Communications
- Integration & Connectivity
- Marketing Automation
- Sales Enablement
- Workflow Automation

---

## Security Review

### Required Security Measures

| Measure | Implementation |
|---------|----------------|
| Data encryption at rest | AES-256 |
| Data encryption in transit | TLS 1.2+ |
| Token storage | Encrypted, not plaintext |
| Audit logging | All data access logged |
| Access control | Role-based permissions |

### Security Questionnaire

Be prepared to answer:

1. How do you store OAuth tokens?
2. How do you handle data deletion requests?
3. What data do you retain and for how long?
4. How do you handle security incidents?
5. Do you share data with third parties?
6. Where is data geographically stored?

### Compliance

| Standard | Required For |
|----------|--------------|
| GDPR | EU customers |
| CCPA | California customers |
| SOC 2 | Enterprise customers (recommended) |
| HIPAA | Healthcare customers |

---

## Common Rejection Reasons

### Technical Issues

| Issue | Solution |
|-------|----------|
| HTTP endpoints | Convert to HTTPS |
| No error handling | Add user-friendly errors |
| Missing token refresh | Implement refresh flow |
| Excessive scopes | Request only needed scopes |
| No signature validation | Add webhook signature check |

### Documentation Issues

| Issue | Solution |
|-------|----------|
| Missing privacy policy | Create and publish policy |
| Broken support links | Fix all documentation links |
| No setup instructions | Create getting started guide |
| Unclear pricing | Document pricing clearly |

### Listing Issues

| Issue | Solution |
|-------|----------|
| Low-quality screenshots | Use high-res, clear images |
| Vague description | Write specific, clear copy |
| Missing category | Select appropriate categories |
| Misleading claims | Remove unsubstantiated claims |

---

## Validation Command

```bash
# Run marketplace validation
/hs-app-validate --marketplace

# Output:
# ═══════════════════════════════════════════════════════════════
# MARKETPLACE VALIDATION REPORT
# ═══════════════════════════════════════════════════════════════
#
# Technical Requirements:
# ✅ OAuth implementation
# ✅ HTTPS endpoints
# ✅ Webhook signature validation
# ⚠️ Rate limit handling (partial)
# ❌ Error messages need improvement
#
# Documentation:
# ✅ Privacy policy URL
# ✅ Terms of service URL
# ⚠️ Support docs incomplete
#
# Listing:
# ✅ App name approved
# ✅ Logo meets requirements
# ❌ Need 2 more screenshots
# ⚠️ Description could be more detailed
#
# Score: 72/100
# Recommendation: Address issues before submission
# ═══════════════════════════════════════════════════════════════
```

---

## Post-Launch

### Monitoring

- Track app installations
- Monitor error rates
- Collect user feedback
- Review support tickets

### Updates

- Submit updates through developer portal
- Major changes require re-review
- Minor updates usually auto-approved
- Communicate changes to users

### Maintaining Listing

- Respond to reviews
- Keep screenshots current
- Update documentation
- Monitor competitor listings
