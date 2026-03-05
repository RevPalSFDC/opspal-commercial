# Manual Operation Output Template

**Version:** 1.0.0
**Created:** 2025-10-13
**Purpose:** Standardize output format when automation is not possible

---

## Template Structure

When an agent cannot automate an operation, use this format to provide maximum value to the user:

```markdown
## ✅ [Operation Name] - Ready to Execute

[Actionable code/commands here - formatted and ready to copy-paste]

---

## Why Manual Execution Required

[1-2 sentence explanation of why automation couldn't be done]

---

## How to Execute

1. [Step 1 - clear and specific]
2. [Step 2 - include where to go, what to click]
3. [Step 3 - verification step]

---

## Rollback (if needed)

[Rollback commands/code - also ready to copy-paste]
```

---

## Example: API Configuration

```markdown
## ✅ Enable Webhook - Ready to Execute

**API Endpoint Configuration:**
```json
{
  "url": "https://api.yourcompany.com/webhooks/event",
  "method": "POST",
  "headers": {
    "Authorization": "Bearer YOUR_API_TOKEN",
    "Content-Type": "application/json"
  }
}
```

---

## Why Manual Execution Required

API webhook configuration requires admin portal access which cannot be automated via API tokens.

---

## How to Execute

1. Open **Settings** → **Integrations** → **Webhooks**
2. Click **Add Webhook**
3. Paste the JSON configuration above
4. Click **Test** to verify connectivity
5. Click **Save**

---

## Verification

```bash
# Check webhook logs
curl "https://api.yourcompany.com/webhooks/logs" \
  -H "Authorization: Bearer YOUR_API_TOKEN"
```

Expected: Test webhook received within last 5 minutes
```

---

## Best Practices

### ✅ DO

1. **Lead with actionable code** (copy-paste ready)
2. **Use specific navigation paths** ("Settings → Integrations", not "go to settings")
3. **Include verification steps**
4. **Provide rollback instructions** when applicable

### ❌ DON'T

1. **Don't bury code in explanations** 
2. **Don't use vague instructions** ("configure the webhook")
3. **Don't skip verification steps**

---

**Created:** 2025-10-13
**Maintainer:** OpsPal Engineering
