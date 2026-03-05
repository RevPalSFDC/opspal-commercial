# Authentication Patterns

## Purpose

Handle authentication flows for Salesforce, HubSpot, and other platforms using Playwright MCP. This runbook covers login procedures, session persistence, MFA handling, and token refresh patterns.

## Prerequisites

- [ ] Playwright MCP server configured
- [ ] Valid credentials for target platform
- [ ] For first-time auth: Headed browser mode capability

## Procedure

### 1. Salesforce OAuth Login

**Initial authentication (requires headed mode):**

```
1. Navigate to Salesforce login page
2. User manually completes login (including MFA)
3. Save session state for future use
```

**Automated flow (with saved session):**

```
1. Load saved session state
2. Navigate to target Salesforce URL
3. If session valid: Proceed with automation
4. If session expired: Re-authenticate
```

**Session persistence location:**
```
instances/{org-alias}/.salesforce-session.json
```

### 2. HubSpot Authentication

**Initial authentication:**

```
1. Navigate to app.hubspot.com/login
2. User manually logs in
3. Complete MFA if required
4. Save session cookies and localStorage
```

**Session file:**
```
instances/{portal-name}/.hubspot-session.json
```

### 3. First-Time Setup Pattern

**For platforms requiring manual login:**

```bash
# Environment variable to enable headed mode
export PLAYWRIGHT_HEADLESS=false

# Or in the workflow:
"Please log in manually in the browser window. Press Enter when ready."
```

**Workflow:**
```
1. Launch browser in headed mode
2. Navigate to login page
3. Pause for manual authentication
4. User completes login + MFA
5. User signals completion
6. Save session state
7. Continue with automation
```

### 4. Session Validation

**Check if session is valid before starting:**

```javascript
const { SessionManager } = require('./playwright-mcp-helper');

const sessionManager = new SessionManager();
const hasValidSession = sessionManager.hasValidSession('my-org', 'salesforce', 24);

if (!hasValidSession) {
  console.log('Session expired. Please re-authenticate.');
}
```

**Command to check:**
```bash
node scripts/lib/playwright-mcp-helper.js check-session myorg salesforce
```

### 5. Handle Session Expiry Mid-Workflow

**Detection:**
```
1. Take snapshot after navigation
2. Check for login page indicators:
   - "Log In" heading
   - "Username" field
   - "Password" field
3. If login page detected: Session expired
```

**Recovery:**
```
1. Pause workflow
2. Notify user: "Session expired. Please re-authenticate."
3. Launch headed browser for re-auth
4. User completes login
5. Save new session
6. Resume workflow from checkpoint
```

### 6. Multi-Factor Authentication (MFA)

**Salesforce MFA patterns:**
- Authenticator app code
- Email verification
- Security key
- SMS code (less common)

**Handling:**
```
1. Navigate to login
2. Enter username/password
3. Detect MFA prompt
4. Pause for manual MFA completion
5. Wait for redirect to app
6. Continue with automation
```

**Detection in snapshot:**
```
- heading "Verify Your Identity"
- textbox "Verification Code"
- button "Verify"
```

### 7. Connected App / OAuth Flow

**For API-based authentication that redirects:**

```
1. Navigate to OAuth authorization URL
2. If not logged in: Complete login first
3. Authorize connected app (may need manual click)
4. Capture callback URL with tokens
5. Store tokens for API use
```

**Tab management for OAuth popups:**
```
1. Click "Connect with Salesforce" button
2. New tab opens for OAuth
3. Use browser_tab_list to see tabs
4. Use browser_tab_select to switch to OAuth tab
5. Complete authorization
6. Switch back to original tab
```

### 8. Token Refresh Patterns

**For long-running workflows:**

```
1. Check token expiry before each operation
2. If token expires soon:
   - Refresh token if refresh_token available
   - Or re-authenticate
3. Continue with fresh token
```

**Session age check:**
```javascript
const sessionManager = new SessionManager();
const maxAgeHours = 8; // Refresh every 8 hours
const needsRefresh = !sessionManager.hasValidSession('my-org', 'salesforce', maxAgeHours);
```

### 9. Multiple Account Management

**Handling multiple orgs/portals:**

```
instances/
├── production-org/
│   └── .salesforce-session.json
├── sandbox-org/
│   └── .salesforce-session.json
├── hubspot-main/
│   └── .hubspot-session.json
└── hubspot-test/
    └── .hubspot-session.json
```

**Switching contexts:**
```
1. Clear current session from browser
2. Load session for target instance
3. Navigate to target platform
4. Verify correct account in snapshot
```

### 10. Logout / Session Cleanup

**Explicit logout:**

```
1. Navigate to logout URL
2. Clear stored session file
3. Ready for new authentication
```

**Salesforce logout URL:**
```
{instance}/secur/logout.jsp
```

**Session cleanup:**
```javascript
const sessionManager = new SessionManager();
sessionManager.clearSession('my-org', 'salesforce');
```

## Validation

### Authentication Success Indicators

**Salesforce:**
- [ ] Lightning Experience header visible
- [ ] User name in profile menu
- [ ] No login form in snapshot

**HubSpot:**
- [ ] Portal navigation visible
- [ ] Account/portal name shown
- [ ] Settings accessible

### Session Quality Checklist

- [ ] Session file exists
- [ ] Session age < 24 hours (configurable)
- [ ] Navigation succeeds without login redirect
- [ ] API calls work (if applicable)

## Troubleshooting

### Issue: Login Page After Session Load

**Symptoms:**
- Session loaded but redirected to login
- "Session expired" message

**Causes & Solutions:**

| Cause | Solution |
|-------|----------|
| Session too old | Re-authenticate |
| Password changed | Re-authenticate with new password |
| Session invalidated | Check for forced logout |
| Wrong instance | Verify org/portal URL |

### Issue: MFA Always Required

**Symptoms:**
- MFA prompt on every login
- Session doesn't persist MFA state

**Causes & Solutions:**

| Cause | Solution |
|-------|----------|
| MFA policy | This is expected behavior |
| New device | Complete MFA, session will persist |
| Session policy | Check platform security settings |

### Issue: OAuth Popup Blocked

**Symptoms:**
- OAuth window doesn't open
- Button click does nothing

**Causes & Solutions:**

| Cause | Solution |
|-------|----------|
| Popup blocker | Use headed mode for OAuth |
| Wrong click target | Verify button in snapshot |
| Security policy | Check Connected App settings |

### Issue: Session File Corrupted

**Symptoms:**
- JSON parse error
- Session won't load

**Causes & Solutions:**

| Cause | Solution |
|-------|----------|
| Incomplete save | Delete and re-authenticate |
| Manual edit error | Delete and re-authenticate |
| Disk error | Check filesystem |

## Platform-Specific Details

### Salesforce

**Login URLs:**
```
Production: https://login.salesforce.com
Sandbox: https://test.salesforce.com
Custom Domain: https://{domain}.my.salesforce.com
```

**Session contents:**
- Cookies (sid, oid, etc.)
- localStorage (Lightning state)
- sessionStorage (transient data)

**Session duration:**
- Default: 2-12 hours (configurable)
- Refresh: On activity
- Absolute timeout: 12-24 hours

### HubSpot

**Login URL:**
```
https://app.hubspot.com/login
```

**Session contents:**
- Cookies (hubspot*, analytics*)
- localStorage (user preferences)

**Session duration:**
- Default: 2 weeks with activity
- Idle timeout: 30 minutes - 24 hours

## Security Considerations

- **Never commit session files** - Add to .gitignore
- **Limit session duration** - Use reasonable max age
- **Use sandbox for testing** - Avoid production credentials
- **Secure storage** - Protect session files
- **Audit access** - Monitor who uses automated login

## Related Resources

- [Setup and Configuration](./setup-and-configuration.md)
- [Page Navigation and Snapshots](./page-navigation-and-snapshots.md)
- [Salesforce UI Patterns](./salesforce-ui-patterns.md)
- [HubSpot UI Patterns](./hubspot-ui-patterns.md)
- [Playwright MCP Helper](../../scripts/lib/playwright-mcp-helper.js)

---

**Version**: 1.0.0
**Created**: 2025-12-03
**Author**: RevPal Engineering
