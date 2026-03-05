# Form Filling and Interaction

## Purpose

Interact with web forms, buttons, dropdowns, and other UI elements using Playwright MCP. This runbook covers data entry, form submission, and complex interactions.

## Prerequisites

- [ ] Playwright MCP server configured
- [ ] Page navigated and snapshot taken
- [ ] Target form elements identified

## Procedure

### 1. Fill Text Fields

**Clear and fill a text field:**

```
Fill the "Company Name" field with "Acme Corporation"
```

**Tool Call:**
```json
{
  "tool": "mcp__playwright__browser_fill",
  "params": {
    "element": "Company Name",
    "value": "Acme Corporation"
  }
}
```

**Note:** `browser_fill` clears the field first, then enters text.

### 2. Type Text (Without Clearing)

**Append text to existing content:**

```
Type "additional text" into the Notes field
```

**Tool Call:**
```json
{
  "tool": "mcp__playwright__browser_type",
  "params": {
    "element": "Notes",
    "text": "additional text"
  }
}
```

**Use cases:**
- Adding to existing content
- Triggering autocomplete
- Character-by-character entry

### 3. Click Buttons

**Click a button:**

```
Click the "Save" button
```

**Tool Call:**
```json
{
  "tool": "mcp__playwright__browser_click",
  "params": {
    "element": "Save"
  }
}
```

**Common button patterns:**
- Submit buttons: "Save", "Submit", "Create"
- Navigation: "Next", "Previous", "Continue"
- Actions: "Delete", "Edit", "Cancel"

### 4. Select Dropdown Options

**Select from dropdown:**

```
Select "California" from the State dropdown
```

**Tool Call:**
```json
{
  "tool": "mcp__playwright__browser_select_option",
  "params": {
    "element": "State",
    "value": "California"
  }
}
```

**Alternative - click to open, then click option:**
```
1. Click the State dropdown
2. Snapshot to see options
3. Click "California" option
```

### 5. Handle Checkboxes

**Check/uncheck a checkbox:**

```
Click the "Agree to Terms" checkbox
```

**Tool Call:**
```json
{
  "tool": "mcp__playwright__browser_click",
  "params": {
    "element": "Agree to Terms"
  }
}
```

**Verify state via snapshot:**
- `checkbox "Agree to Terms" [checked]`
- `checkbox "Agree to Terms" []` (unchecked)

### 6. Handle Radio Buttons

**Select a radio option:**

```
Click the "Premium" plan option
```

**Tool Call:**
```json
{
  "tool": "mcp__playwright__browser_click",
  "params": {
    "element": "Premium"
  }
}
```

### 7. Multi-Field Form Pattern

**Fill multiple fields efficiently:**

```
Filling contact form:
1. Fill "First Name" with "John"
2. Fill "Last Name" with "Smith"
3. Fill "Email" with "john@example.com"
4. Select "Sales" from Department
5. Click "Submit"
```

**Best practice:** Snapshot before starting to identify all fields.

### 8. Handle Dynamic Forms

**For forms that change based on input:**

```
1. Snapshot - see initial form
2. Fill field that triggers change
3. Wait for form update
4. Snapshot - see new fields
5. Fill additional fields
6. Submit
```

**Example - Salesforce record type selection:**
```
1. Click "Create Account"
2. Snapshot - see record type selection
3. Click "Enterprise" record type
4. Click "Continue"
5. Wait for form to load
6. Snapshot - see Enterprise-specific fields
7. Fill required fields
```

### 9. Handle Validation Errors

**Check for and respond to errors:**

```
1. Click Submit
2. Snapshot
3. Look for error messages in snapshot
4. If errors found:
   - Identify which fields need correction
   - Fill corrected values
   - Re-submit
```

**Common error patterns:**
- `alert "Email is required"`
- `text "Please enter a valid phone number"`
- `status "Validation failed"`

### 10. File Upload

**Upload a file:**

```
Upload report.pdf to the Attachments field
```

**Tool Call:**
```json
{
  "tool": "mcp__playwright__browser_file_upload",
  "params": {
    "element": "Attachments",
    "files": ["/path/to/report.pdf"]
  }
}
```

## Validation

### Successful Form Submission

- [ ] All required fields filled
- [ ] Submit button clicked
- [ ] Success message appears
- [ ] Page navigates to expected location

### Form Interaction Quality

**Good interaction:**
- Fields found by accessible name
- Values entered correctly
- Validation passes
- Submission succeeds

**Needs debugging:**
- Fields not found (check snapshot)
- Wrong values entered
- Validation errors
- Submission fails

## Troubleshooting

### Issue: Field Not Found

**Symptoms:**
- "Element not found" error
- Wrong field filled

**Causes & Solutions:**

| Cause | Solution |
|-------|----------|
| Wrong field name | Take snapshot, use exact name |
| Field not visible | Scroll or click to reveal |
| Field in iframe | Focus iframe first |
| Dynamic field | Wait for field to appear |

### Issue: Value Not Accepted

**Symptoms:**
- Field clears after entry
- Validation error on valid input

**Causes & Solutions:**

| Cause | Solution |
|-------|----------|
| Format mismatch | Check expected format (date, phone) |
| Read-only field | Cannot edit programmatically |
| JavaScript validation | Trigger blur event |
| Autocomplete required | Type slowly, select suggestion |

### Issue: Dropdown Won't Open

**Symptoms:**
- Click doesn't show options
- Select doesn't work

**Causes & Solutions:**

| Cause | Solution |
|-------|----------|
| Custom dropdown | Click to open, then click option |
| Combobox (searchable) | Type to filter, then select |
| Loading options | Wait for options to load |

### Issue: Checkbox/Radio Won't Toggle

**Symptoms:**
- Click doesn't change state
- State reverts

**Causes & Solutions:**

| Cause | Solution |
|-------|----------|
| Label vs input | Click the label text |
| JavaScript handler | May need click on specific element |
| Disabled | Check if element is enabled |

### Issue: Submit Doesn't Work

**Symptoms:**
- Button click does nothing
- Form doesn't submit

**Causes & Solutions:**

| Cause | Solution |
|-------|----------|
| Validation failing | Check for error messages |
| Button disabled | Complete required fields |
| JavaScript error | Check console messages |
| Wrong button | Verify button name in snapshot |

## Platform-Specific Patterns

### Salesforce Lightning Forms

```
1. Navigate to record creation page
2. Snapshot - identify field layout
3. Fill fields in order (tab groups)
4. Handle lookup fields:
   - Click lookup icon
   - Type search term
   - Wait for results
   - Click result row
5. Click "Save"
6. Wait for toast message
7. Snapshot to verify
```

### HubSpot Forms

```
1. Navigate to form
2. Snapshot - identify field types
3. Fill standard fields
4. Handle property fields:
   - May need to click "Add Property"
   - Search for property
   - Enter value
5. Click "Save" or "Create"
6. Wait for success indicator
```

## Related Resources

- [Page Navigation and Snapshots](./page-navigation-and-snapshots.md)
- [Screenshot Documentation](./screenshot-documentation.md)
- [Salesforce UI Patterns](./salesforce-ui-patterns.md)
- [HubSpot UI Patterns](./hubspot-ui-patterns.md)

---

**Version**: 1.0.0
**Created**: 2025-12-03
**Author**: RevPal Engineering
