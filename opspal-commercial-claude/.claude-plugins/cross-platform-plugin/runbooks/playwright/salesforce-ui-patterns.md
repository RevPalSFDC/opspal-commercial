# Salesforce UI Patterns

## Purpose

Navigate and interact with Salesforce Lightning Experience and Classic UI using Playwright MCP. This runbook covers Setup navigation, record pages, Flow Builder, and common Salesforce-specific patterns.

## Prerequisites

- [ ] Authenticated Salesforce session (see [Authentication Patterns](./authentication-patterns.md))
- [ ] Target org accessible
- [ ] Appropriate permissions for target features

## Procedure

### 1. Setup Menu Navigation

**Navigate to Setup Home:**

```
Navigate to /lightning/setup/SetupOneHome/home
```

**Common Setup paths:**

| Feature | URL Path |
|---------|----------|
| Setup Home | `/lightning/setup/SetupOneHome/home` |
| Object Manager | `/lightning/setup/ObjectManager/home` |
| Users | `/lightning/setup/ManageUsers/home` |
| Profiles | `/lightning/setup/Profiles/home` |
| Permission Sets | `/lightning/setup/PermSets/home` |
| Flows | `/lightning/setup/Flows/home` |
| Apex Classes | `/lightning/setup/ApexClasses/home` |
| Connected Apps | `/lightning/setup/ConnectedApplication/home` |

**Pattern:**
```
1. Navigate to Setup path
2. Wait for "Setup" heading
3. Snapshot to see options
4. Click desired item
5. Wait for detail page
6. Snapshot to capture configuration
```

### 2. Object Manager Navigation

**Navigate to specific object:**

```
Navigate to /lightning/setup/ObjectManager/{ObjectApiName}/FieldsAndRelationships/view
```

**Common Object Manager sections:**

| Section | URL Suffix |
|---------|------------|
| Details | `/Details/view` |
| Fields & Relationships | `/FieldsAndRelationships/view` |
| Page Layouts | `/PageLayouts/view` |
| Lightning Record Pages | `/LightningRecordPages/view` |
| Validation Rules | `/ValidationRules/view` |
| Triggers | `/ApexTriggers/view` |
| Buttons & Links | `/ButtonsLinksActions/view` |

**Example - Account fields:**
```
Navigate to /lightning/setup/ObjectManager/Account/FieldsAndRelationships/view
```

### 3. Lightning Record Pages

**Navigate to record:**

```
Navigate to /lightning/r/{ObjectApiName}/{RecordId}/view
```

**Common actions on record page:**
- Edit: Click "Edit" button
- Related lists: Scroll to related section
- Actions: Click action button (dropdown)

**Pattern:**
```
1. Navigate to record
2. Wait for record name in heading
3. Snapshot to see layout
4. Click desired action
5. Wait for form/result
6. Snapshot to verify
```

### 4. Flow Builder

**Navigate to Flow:**

```
Navigate to /builder_platform_interaction/flowBuilder.app?flowId={FlowId}
```

**Flow Builder elements in snapshot:**
- Canvas area with flow elements
- Element palette
- Toolbar with Run/Debug
- Properties panel

**Pattern:**
```
1. Navigate to Flow Builder
2. Wait for canvas to load
3. Snapshot to capture flow structure
4. Screenshot for documentation
```

### 5. Report Builder

**Navigate to Report:**

```
Navigate to /lightning/r/Report/{ReportId}/view
```

**Report actions:**
- Edit: Opens report builder
- Run: Executes report
- Export: Downloads data

### 6. Dashboard Navigation

**Navigate to Dashboard:**

```
Navigate to /lightning/r/Dashboard/{DashboardId}/view
```

**Dashboard elements:**
- Components (charts, tables)
- Refresh button
- Edit button
- Running user selector

### 7. Common UI Elements

**Lightning Experience elements in snapshots:**

| Element | Snapshot Role | Common Names |
|---------|---------------|--------------|
| Global Search | combobox | "Search Salesforce" |
| App Launcher | button | "App Launcher" |
| Profile Menu | button | User's name |
| Help | button | "Help" |
| Setup Gear | button | "Setup" |
| Notifications | button | "Notifications" |

**Record page elements:**

| Element | Snapshot Role | Common Names |
|---------|---------------|--------------|
| Edit Button | button | "Edit" |
| Save Button | button | "Save" |
| Cancel | button | "Cancel" |
| Related Tab | tab | "Related" |
| Details Tab | tab | "Details" |
| Activity Tab | tab | "Activity" |

### 8. Handling Lightning Loading States

**Wait patterns for Lightning:**

```
1. Navigate to page
2. Wait for specific content (not just any text)
3. Examples:
   - Wait for record name
   - Wait for specific heading
   - Wait for table content
```

**Detection:**
```
If snapshot shows:
- "Loading..." text
- Spinner elements
- Empty content areas

Then: Wait and re-snapshot
```

### 9. Modal/Dialog Handling

**Common modals:**
- Edit record form
- Create record form
- Confirmation dialogs
- Lookup search

**Pattern:**
```
1. Click button that opens modal
2. Wait for modal to appear
3. Snapshot to see modal content
4. Fill form fields
5. Click save/confirm
6. Wait for modal to close
7. Snapshot to verify result
```

### 10. Lookup Field Interaction

**Pattern for lookup fields:**

```
1. Click lookup field icon (search icon)
2. Wait for search dialog
3. Type search term
4. Wait for results
5. Click result row
6. Verify field populated
```

**In snapshot:**
```
- textbox "Account Name"
- button "Search Accounts"
- listbox "Recent Items"
```

### 11. Related List Navigation

**Accessing related records:**

```
1. Scroll to Related tab/section
2. Find related list heading
3. Click "View All" or specific record
4. Wait for related list page/record
```

### 12. Classic Mode (Fallback)

**If Classic UI is required:**

```
Navigate to /{ObjectPrefix}/{RecordId}
Example: /001/xxx (Account)
```

**Classic elements:**
- Different layout structure
- Tab-based navigation
- Sidebar with recent items

## Validation

### Successful Navigation

- [ ] Page loads without errors
- [ ] Expected content visible in snapshot
- [ ] No "Insufficient Privileges" message
- [ ] Not redirected to login

### UI Quality Indicators

**Good state:**
- Content fully rendered
- No loading indicators
- Interactive elements accessible
- Form fields enabled

**Needs wait:**
- Loading spinners present
- Skeleton screens visible
- Content areas empty
- Buttons disabled

## Troubleshooting

### Issue: "Insufficient Privileges"

**Symptoms:**
- Error message displayed
- Page doesn't load

**Causes & Solutions:**

| Cause | Solution |
|-------|----------|
| Missing permission | Check profile/permission set |
| Object access denied | Grant object CRUD |
| Field-level security | Update FLS settings |
| Sharing rules | Check record access |

### Issue: Lightning Page Not Loading

**Symptoms:**
- Blank page
- Continuous loading

**Causes & Solutions:**

| Cause | Solution |
|-------|----------|
| JavaScript error | Check console messages |
| Network timeout | Increase wait time |
| Component error | Check error logs |
| Session expired | Re-authenticate |

### Issue: Record Not Found

**Symptoms:**
- "Record not found" error
- Redirect to error page

**Causes & Solutions:**

| Cause | Solution |
|-------|----------|
| Wrong ID | Verify record ID |
| Record deleted | Check recycle bin |
| No access | Verify sharing access |
| Wrong org | Confirm org instance |

### Issue: Setup Menu Empty

**Symptoms:**
- Setup loads but features missing
- Limited options

**Causes & Solutions:**

| Cause | Solution |
|-------|----------|
| User permissions | Need "Customize Application" |
| Profile restrictions | Check Setup access |
| Edition limitations | Feature may not exist |

## Common Workflows

### CPQ Configuration Capture

```
1. Navigate to Setup > Installed Packages
2. Screenshot: "cpq-package-version"
3. Navigate to Products tab
4. Screenshot: "cpq-product-catalog"
5. Navigate to Price Books
6. Screenshot: "cpq-price-books"
7. Navigate to CPQ Settings
8. Screenshot: "cpq-settings"
```

### Permission Set Analysis

```
1. Navigate to Setup > Permission Sets
2. Screenshot: "permission-sets-list"
3. Click specific permission set
4. Screenshot: "ps-{name}-overview"
5. Click "Object Settings"
6. Screenshot: "ps-{name}-objects"
7. Click "System Permissions"
8. Screenshot: "ps-{name}-system"
```

### Flow Documentation

```
1. Navigate to Setup > Flows
2. Screenshot: "flows-list"
3. Click specific flow
4. Wait for Flow Builder
5. Screenshot: "flow-{name}-canvas"
6. Click key elements
7. Screenshot each: "flow-{name}-{element}"
```

## Related Resources

- [Authentication Patterns](./authentication-patterns.md)
- [Page Navigation and Snapshots](./page-navigation-and-snapshots.md)
- [Screenshot Documentation](./screenshot-documentation.md)
- [Form Filling and Interaction](./form-filling-and-interaction.md)
- [Salesforce Plugin Documentation](../../../salesforce-plugin/CLAUDE.md)

---

**Version**: 1.0.0
**Created**: 2025-12-03
**Author**: RevPal Engineering
