# Smart Campaign API Error Code Reference

## Error Response Format

```json
{
  "success": false,
  "errors": [
    {
      "code": "610",
      "message": "Requested resource not found"
    }
  ],
  "requestId": "a33a#161d9c0dcf3"
}
```

---

## Authentication Errors

### 601 - Access Token Invalid

**Cause**: The access token is malformed or invalid.

**Recovery**:
1. Obtain new token via OAuth flow
2. Retry request with new token

**Code Pattern**:
```javascript
if (error.code === 601) {
  const newToken = await refreshAccessToken();
  return retryRequest(newToken);
}
```

### 602 - Access Token Expired

**Cause**: The access token has expired (typically after 1 hour).

**Recovery**:
1. Refresh the access token
2. Retry the request

**Code Pattern**:
```javascript
if (error.code === 602) {
  await tokenManager.refresh();
  return retryRequest();
}
```

---

## Rate Limit Errors

### 606 - Rate Limit Exceeded

**Cause**: Exceeded 100 calls in 20 seconds.

**Recovery**:
1. Wait 20 seconds (or until window resets)
2. Implement exponential backoff
3. Retry request

**Code Pattern**:
```javascript
if (error.code === 606) {
  await sleep(20000); // Wait 20 seconds
  return retryRequest();
}
```

### 607 - Daily Quota Exceeded

**Cause**: Exceeded 50,000 daily API calls.

**Recovery**:
1. Stop all operations
2. Wait until quota resets at midnight
3. Optimize API usage

**Code Pattern**:
```javascript
if (error.code === 607) {
  throw new Error('Daily quota exceeded - operations suspended');
}
```

### 615 - Concurrent Request Limit

**Cause**: More than 10 simultaneous requests.

**Recovery**:
1. Serialize requests
2. Reduce concurrency
3. Implement request queue

**Code Pattern**:
```javascript
if (error.code === 615) {
  await sleep(1000);
  return retryRequest();
}
```

---

## Resource Errors

### 610 - Resource Not Found

**Cause**: The requested campaign ID does not exist.

**Recovery**:
1. Verify the campaign ID
2. Check if campaign was deleted
3. Search by name if ID unknown

**Code Pattern**:
```javascript
if (error.code === 610) {
  // Campaign doesn't exist - check by name
  const campaigns = await listCampaigns({ name: campaignName });
  if (campaigns.length === 0) {
    throw new Error(`Campaign not found: ${campaignId}`);
  }
}
```

### 611 - System Error

**Cause**: Internal Marketo system error.

**Recovery**:
1. Retry with exponential backoff
2. If persistent, contact Marketo support
3. Check Marketo status page

**Code Pattern**:
```javascript
if (error.code === 611) {
  for (let i = 0; i < 3; i++) {
    await sleep(1000 * Math.pow(2, i));
    const result = await retryRequest();
    if (result.success) return result;
  }
}
```

---

## Asset Errors

### 709 - Asset Modification Blocked

**Causes**:
- Campaign is active (cannot delete active campaigns)
- Campaign is system campaign (cannot modify/delete)
- Operation blocked by validation

**Recovery**:
1. Deactivate campaign before deleting
2. Check if system campaign (`isSystem: true`)
3. Verify campaign state

**Code Pattern**:
```javascript
if (error.code === 709) {
  const campaign = await getCampaign(campaignId);
  if (campaign.isActive) {
    await deactivateCampaign(campaignId);
    return retryRequest();
  }
  if (campaign.isSystem) {
    throw new Error('Cannot modify system campaign');
  }
}
```

### 710 - Invalid Folder

**Causes**:
- Folder ID does not exist
- Folder type incorrect
- No permission to folder

**Recovery**:
1. Verify folder ID exists
2. Check folder type is "Folder" or "Program"
3. Verify workspace permissions

**Code Pattern**:
```javascript
if (error.code === 710) {
  // Validate folder exists
  const folder = await getFolder(folderId);
  if (!folder) {
    throw new Error(`Folder not found: ${folderId}`);
  }
}
```

### 711 - Name Already Exists

**Cause**: A campaign with this name already exists in the target folder.

**Recovery**:
1. Use a unique name
2. Add timestamp or suffix
3. Check existing campaigns first

**Code Pattern**:
```javascript
if (error.code === 711) {
  const uniqueName = `${name} - ${Date.now()}`;
  return createCampaign({ ...params, name: uniqueName });
}
```

---

## Validation Errors

### 1001 - Invalid Input

**Cause**: Missing or malformed required parameter.

**Common Issues**:
- Missing required field (name, folder)
- Invalid folder JSON format
- Invalid date format

**Recovery**:
1. Check all required parameters
2. Validate JSON formatting
3. Verify date is ISO 8601

### 1006 - Invalid Request

**Cause**: Request body or parameters invalid.

**Recovery**:
1. Check Content-Type header
2. Verify parameter encoding
3. Review API documentation

---

## Error Handling Best Practices

### Retry Strategy

```javascript
const RETRY_CONFIG = {
  maxAttempts: 3,
  initialDelay: 1000,
  backoffMultiplier: 2,
  maxDelay: 30000
};

async function withRetry(operation) {
  for (let attempt = 0; attempt < RETRY_CONFIG.maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (!isRetryable(error)) throw error;

      const delay = Math.min(
        RETRY_CONFIG.initialDelay * Math.pow(RETRY_CONFIG.backoffMultiplier, attempt),
        RETRY_CONFIG.maxDelay
      );
      await sleep(delay);
    }
  }
}

function isRetryable(error) {
  const retryableCodes = [601, 602, 606, 611, 615];
  return retryableCodes.includes(error.code);
}
```

### Error Classification

| Category | Codes | Action |
|----------|-------|--------|
| Auth | 601, 602 | Refresh token, retry |
| Rate Limit | 606 | Wait 20s, retry |
| Quota | 607 | Stop operations |
| Concurrent | 615 | Serialize, retry |
| Not Found | 610 | Verify ID |
| System | 611 | Retry with backoff |
| Validation | 709, 710, 711 | Fix input, retry |

---

## Debugging Tips

1. **Log Request IDs**: Every response includes `requestId` - log it for support tickets
2. **Check Success Field**: Always check `success: true` before processing
3. **Handle Warnings**: Check `warnings` array even on success
4. **Monitor Rate Limits**: Track API usage proactively
5. **Test in Sandbox**: Validate operations in sandbox before production
