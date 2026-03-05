# HubSpot UI Patterns

## Purpose

Navigate and interact with HubSpot portal UI using Playwright MCP. This runbook covers Settings navigation, Workflow canvas, CMS editor, and common HubSpot-specific patterns.

## Prerequisites

- [ ] Authenticated HubSpot session (see [Authentication Patterns](./authentication-patterns.md))
- [ ] Portal access with appropriate permissions
- [ ] Portal ID known

## Procedure

### 1. Portal Navigation Structure

**Base URL pattern:**
```
https://app.hubspot.com/{section}/{portalId}/{path}
```

**Main sections:**

| Section | URL Pattern |
|---------|-------------|
| Contacts | `/contacts/{portalId}` |
| Companies | `/contacts/{portalId}/companies` |
| Deals | `/contacts/{portalId}/deals` |
| Tickets | `/contacts/{portalId}/tickets` |
| Marketing | `/marketing/{portalId}` |
| Sales | `/sales-products/{portalId}` |
| Service | `/service/{portalId}` |
| Reports | `/reports-dashboard/{portalId}` |
| Automation | `/workflows/{portalId}` |
| Settings | `/settings/{portalId}` |

### 2. Settings Navigation

**Navigate to Settings:**

```
Navigate to https://app.hubspot.com/settings/{portalId}
```

**Common Settings paths:**

| Feature | Settings Path |
|---------|---------------|
| General | `/settings/{portalId}/general` |
| Users & Teams | `/settings/{portalId}/users` |
| Account Defaults | `/settings/{portalId}/account-defaults` |
| Properties | `/settings/{portalId}/properties` |
| Integrations | `/settings/{portalId}/integrations` |
| Connected Apps | `/settings/{portalId}/integrations/installed` |
| Private Apps | `/settings/{portalId}/integrations/private-apps` |
| Notifications | `/settings/{portalId}/notifications` |

**Pattern:**
```
1. Navigate to Settings section
2. Wait for settings panel to load
3. Snapshot to see options
4. Click specific setting
5. Wait for detail to load
6. Snapshot to capture configuration
```

### 3. Workflow Canvas Navigation

**Navigate to Workflows:**

```
Navigate to https://app.hubspot.com/workflows/{portalId}
```

**Workflow detail:**

```
Navigate to https://app.hubspot.com/workflows/{portalId}/platform/flow/{workflowId}/edit
```

**Canvas elements in snapshot:**
- Trigger node (enrollment)
- Action nodes (email, delay, etc.)
- Branch nodes (if/then)
- Goal node (optional)
- Connection lines

**Pattern:**
```
1. Navigate to workflow list
2. Click specific workflow
3. Wait for canvas to load
4. Snapshot canvas structure
5. Screenshot for documentation
```

### 4. Properties Management

**Navigate to Properties:**

```
Navigate to https://app.hubspot.com/property-settings/{portalId}/properties
```

**Object-specific properties:**

| Object | Query Parameter |
|--------|-----------------|
| Contacts | `?type=0-1` |
| Companies | `?type=0-2` |
| Deals | `?type=0-3` |
| Tickets | `?type=0-5` |

**Pattern:**
```
1. Navigate to Properties
2. Select object type
3. Snapshot property list
4. Click property name for details
5. Snapshot property configuration
```

### 5. CMS Page Editor

**Navigate to Pages:**

```
Navigate to https://app.hubspot.com/website/{portalId}/pages
```

**Page editor:**

```
Navigate to https://app.hubspot.com/content/{portalId}/edit/{pageId}
```

**Editor elements:**
- Content modules
- Settings panel
- Preview toggle
- Publish button

### 6. Reports and Dashboards

**Navigate to Reports:**

```
Navigate to https://app.hubspot.com/reports-dashboard/{portalId}
```

**Dashboard detail:**

```
Navigate to https://app.hubspot.com/reports-dashboard/{portalId}/view/{dashboardId}
```

**Elements:**
- Report widgets
- Date range selector
- Filter controls
- Edit/Share buttons

### 7. Common UI Elements

**HubSpot navigation in snapshots:**

| Element | Snapshot Role | Common Names |
|---------|---------------|--------------|
| Global Search | combobox | "Search" |
| Settings Gear | link | "Settings" |
| Notifications | button | "Notifications" |
| Help | button | "Help" |
| Profile | button | User's name/email |
| Portal Switcher | button | Portal name |

**Form elements:**

| Element | Snapshot Role | Common Names |
|---------|---------------|--------------|
| Save Button | button | "Save", "Save changes" |
| Cancel | button | "Cancel" |
| Create | button | "Create", "Create new" |
| Delete | button | "Delete" |
| Export | button | "Export" |

### 8. Salesforce Integration Settings

**Navigate to SF Integration:**

```
Navigate to https://app.hubspot.com/integrations-settings/{portalId}/installed/salesforce/settings
```

**Key settings pages:**
- Sync Settings
- Field Mappings
- Inclusion Lists
- Sync Health

**Pattern for scraping sync settings:**
```
1. Navigate to SF integration settings
2. Wait for settings to load
3. Snapshot sync direction settings
4. Screenshot: "hs-sf-sync-direction"
5. Navigate to field mappings
6. Click "Export" if available
7. Screenshot: "hs-sf-field-mappings"
```

### 9. Handling Dynamic Content

**Wait patterns for HubSpot:**

```
1. Navigate to page
2. Wait for specific element:
   - Page title
   - Main content heading
   - Table rows
3. Snapshot when content loaded
```

**Detection of loading state:**
```
If snapshot shows:
- "Loading" text
- Skeleton placeholders
- Empty tables

Then: Wait and re-snapshot
```

### 10. Modal/Sidebar Handling

**Common modals:**
- Create record forms
- Edit property dialogs
- Confirmation prompts
- Filter panels (sidebars)

**Pattern:**
```
1. Click button that opens modal
2. Wait for modal/sidebar
3. Snapshot to see form
4. Fill required fields
5. Click confirm/save
6. Wait for closure
7. Snapshot result
```

### 11. List Views and Tables

**Navigating lists:**

```
1. Navigate to list view (Contacts, Deals, etc.)
2. Wait for table to load
3. Snapshot to see columns and data
4. Use filters if needed:
   - Click "Add filter"
   - Select property
   - Set filter value
5. Snapshot filtered view
```

**Pagination:**
```
1. Scroll to bottom for more records
2. Or click page numbers
3. Or use "Show X per page" dropdown
```

### 12. Email Campaign Editor

**Navigate to Marketing Email:**

```
Navigate to https://app.hubspot.com/email/{portalId}/edit/{emailId}
```

**Editor elements:**
- Drag-drop modules
- Content editing
- Settings panel
- Preview/Test buttons
- Send/Schedule options

## Validation

### Successful Navigation

- [ ] Portal ID in URL matches expected
- [ ] Content loads without errors
- [ ] Permissions allow access
- [ ] Not redirected to login

### UI Quality Indicators

**Good state:**
- Tables populated with data
- Forms enabled and interactive
- No error banners
- Navigation functional

**Needs wait:**
- Loading indicators
- Skeleton screens
- Empty content areas
- Disabled buttons

## Troubleshooting

### Issue: "You don't have access"

**Symptoms:**
- Access denied message
- Redirect to different page

**Causes & Solutions:**

| Cause | Solution |
|-------|----------|
| User permissions | Check user role |
| Super admin required | Contact admin |
| Feature not in plan | Check subscription |
| Team restrictions | Verify team membership |

### Issue: Portal Not Found

**Symptoms:**
- "Portal not found" error
- Redirect to portal selector

**Causes & Solutions:**

| Cause | Solution |
|-------|----------|
| Wrong portal ID | Verify portal ID |
| Access revoked | Check with admin |
| Portal deleted | Confirm portal exists |
| Session wrong portal | Re-authenticate |

### Issue: Settings Not Loading

**Symptoms:**
- Blank settings panel
- Continuous loading

**Causes & Solutions:**

| Cause | Solution |
|-------|----------|
| Network issue | Check connectivity |
| JavaScript error | Check console |
| Permission issue | Verify settings access |
| Browser cache | Clear cache |

### Issue: Workflow Canvas Empty

**Symptoms:**
- Canvas doesn't render
- Elements missing

**Causes & Solutions:**

| Cause | Solution |
|-------|----------|
| Workflow deleted | Verify workflow exists |
| Canvas loading | Wait longer |
| Browser issue | Refresh or re-navigate |
| Large workflow | Allow more load time |

## Common Workflows

### Salesforce Sync Configuration Capture

```
1. Navigate to Settings > Integrations
2. Screenshot: "hs-integrations-list"
3. Click Salesforce
4. Wait for settings to load
5. Screenshot: "hs-sf-overview"
6. Click "Sync Settings"
7. Screenshot: "hs-sf-sync-settings"
8. Click "Field Mappings"
9. Screenshot: "hs-sf-field-mappings"
10. Click "Inclusion Lists"
11. Screenshot: "hs-sf-inclusion-lists"
```

### Workflow Documentation

```
1. Navigate to Workflows
2. Screenshot: "hs-workflows-list"
3. Click specific workflow
4. Wait for canvas
5. Screenshot: "hs-workflow-{name}-canvas"
6. Click enrollment trigger
7. Screenshot: "hs-workflow-{name}-enrollment"
8. Document each action node
```

### Property Audit

```
1. Navigate to Settings > Properties
2. Select "Contacts"
3. Screenshot: "hs-contact-properties"
4. Export properties (if available)
5. Select "Companies"
6. Screenshot: "hs-company-properties"
7. Select "Deals"
8. Screenshot: "hs-deal-properties"
```

## Related Resources

- [Authentication Patterns](./authentication-patterns.md)
- [Page Navigation and Snapshots](./page-navigation-and-snapshots.md)
- [Screenshot Documentation](./screenshot-documentation.md)
- [Form Filling and Interaction](./form-filling-and-interaction.md)
- [HubSpot Plugin Documentation](../../../hubspot-plugin/CLAUDE.md)

---

**Version**: 1.0.0
**Created**: 2025-12-03
**Author**: RevPal Engineering
