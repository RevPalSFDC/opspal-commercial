# Page Navigation and Snapshots

## Purpose

Navigate web pages and capture accessibility snapshots for AI-driven browser automation. Accessibility snapshots provide structured DOM understanding without brittle CSS selectors.

## Prerequisites

- [ ] Playwright MCP server configured (see [Setup](./setup-and-configuration.md))
- [ ] Target URL known
- [ ] Authentication completed if needed (see [Authentication Patterns](./authentication-patterns.md))

## Procedure

### 1. Basic Navigation

**Navigate to a URL:**

```
Use mcp__playwright__browser_navigate to go to https://example.com
```

**Tool Call:**
```json
{
  "tool": "mcp__playwright__browser_navigate",
  "params": {
    "url": "https://example.com"
  }
}
```

**Expected Result:** Page loads, returns page title and URL.

### 2. Take Accessibility Snapshot

**Capture page structure:**

```
Use mcp__playwright__browser_snapshot to capture the page structure
```

**Tool Call:**
```json
{
  "tool": "mcp__playwright__browser_snapshot",
  "params": {}
}
```

**Expected Result:** Hierarchical accessibility tree with:
- Element roles (button, link, textbox, etc.)
- Element names (visible text, aria-label)
- Element refs (for clicking/interacting)
- Nested structure

### 3. Understanding Snapshot Structure

**Example snapshot output:**

```
- document "Page Title"
  - navigation "Main Navigation"
    - link "Home" [ref=1]
    - link "Settings" [ref=2]
  - main "Content"
    - heading "Welcome" [ref=3]
    - button "Get Started" [ref=4]
    - textbox "Search" [ref=5]
```

**Key components:**
- **Role**: Element type (button, link, textbox, heading)
- **Name**: Accessible name (what's displayed or aria-label)
- **Ref**: Reference number for interaction (click, type)

### 4. Using Element References

**Click by reference:**

```
Click on the "Get Started" button [ref=4]
```

**Tool Call:**
```json
{
  "tool": "mcp__playwright__browser_click",
  "params": {
    "element": "Get Started"
  }
}
```

**Note:** You can use the element name directly - MCP matches it to the ref.

### 5. Best Practice: Snapshot → Action → Snapshot Cycle

**Recommended workflow:**

1. **Snapshot** - Understand current page state
2. **Action** - Click, type, or navigate
3. **Snapshot** - Verify result and plan next action

**Example sequence:**

```
1. Navigate to login page
2. Snapshot to find login form
3. Fill username field
4. Fill password field
5. Click login button
6. Snapshot to verify successful login
7. Proceed with authenticated workflow
```

### 6. Wait for Dynamic Content

**Wait for specific text:**

```
Wait for "Dashboard" text to appear
```

**Tool Call:**
```json
{
  "tool": "mcp__playwright__browser_wait",
  "params": {
    "text": "Dashboard",
    "timeout": 30000
  }
}
```

**Wait strategies:**
- Wait for specific text to appear
- Wait for loading indicators to disappear
- Wait for element to be visible

### 7. Handle Single-Page Applications (SPAs)

**For Salesforce Lightning, React, Angular:**

1. Navigate to URL
2. Wait for app shell to load
3. Take snapshot (may show loading state)
4. Wait for specific content
5. Take final snapshot

**Salesforce Lightning pattern:**
```
1. Navigate to Setup page
2. Wait for "Setup" heading
3. Snapshot to see menu structure
4. Click desired menu item
5. Wait for content to load
6. Snapshot to capture configuration
```

## Validation

### Successful Navigation

- [ ] Page URL matches expected
- [ ] Page title returned
- [ ] No error messages

### Successful Snapshot

- [ ] Hierarchical structure returned
- [ ] Elements have roles and names
- [ ] Interactive elements have refs
- [ ] Key page elements visible

### Quality Indicators

**Good snapshot:**
- All form fields visible with labels
- Buttons and links have descriptive names
- Navigation structure clear
- Content hierarchy logical

**Poor snapshot (needs debugging):**
- Empty or minimal structure
- Elements missing names
- Excessive nesting
- Content not rendered (SPA still loading)

## Troubleshooting

### Issue: Empty Snapshot

**Symptoms:**
- Snapshot returns minimal structure
- Missing expected elements

**Causes & Solutions:**

| Cause | Solution |
|-------|----------|
| Page still loading | Add wait before snapshot |
| SPA not rendered | Wait for specific text |
| Iframe content | Focus iframe first |
| Shadow DOM | May need JS evaluation |

### Issue: Elements Without Names

**Symptoms:**
- Elements show as "unnamed button" or similar
- Can't identify which element to click

**Causes & Solutions:**

| Cause | Solution |
|-------|----------|
| Missing aria-labels | Use position/context to identify |
| Icon-only buttons | Look for tooltip or title |
| Dynamic names | Capture surrounding context |

### Issue: Navigation Fails

**Symptoms:**
- Timeout error
- Page doesn't load

**Causes & Solutions:**

| Cause | Solution |
|-------|----------|
| Network issues | Check connectivity |
| SSL errors | Verify certificate |
| Redirects | Use final URL |
| Authentication required | Complete login first |

### Issue: Wrong Page Content

**Symptoms:**
- Snapshot shows unexpected content
- Login page instead of target

**Causes & Solutions:**

| Cause | Solution |
|-------|----------|
| Session expired | Re-authenticate |
| Redirect | Follow redirect chain |
| Permissions | Verify user access |

## Platform-Specific Patterns

### Salesforce Lightning

```
1. Navigate: /lightning/setup/ObjectManager/home
2. Wait: "Object Manager"
3. Snapshot: See list of objects
4. Click: Target object row
5. Wait: Object detail page
6. Snapshot: See fields and relationships
```

### HubSpot

```
1. Navigate: /settings/{portalId}/integrations
2. Wait: "Connected Apps"
3. Snapshot: See integration list
4. Click: Target integration
5. Wait: Detail panel
6. Snapshot: See configuration
```

## Related Resources

- [Form Filling and Interaction](./form-filling-and-interaction.md)
- [Screenshot Documentation](./screenshot-documentation.md)
- [Salesforce UI Patterns](./salesforce-ui-patterns.md)
- [HubSpot UI Patterns](./hubspot-ui-patterns.md)

---

**Version**: 1.0.0
**Created**: 2025-12-03
**Author**: RevPal Engineering
