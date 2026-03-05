# Asset Creation Patterns

Quick reference for creating emails, forms, and landing pages via API.

## Asset Types

| Asset | Create Tool | Approve Tool | Template Required |
|-------|-------------|--------------|-------------------|
| Email | `email_create` | `email_approve` | Yes |
| Form | `form_create` | `form_approve` | No |
| Landing Page | `landing_page_create` | `landing_page_approve` | Yes |

## Email Creation

```javascript
// Create email
const email = await mcp__marketo__email_create({
  name: 'Feb Webinar Invite',
  folder: { id: 1234, type: 'Program' },
  template: 567,
  subject: 'Join Our Webinar',
  fromName: 'Marketing Team',
  fromEmail: 'marketing@company.com'
});

// Approve email
await mcp__marketo__email_approve({ emailId: email.result[0].id });
```

## Form Creation

```javascript
// Create form
const form = await mcp__marketo__form_create({
  name: 'Event_Signup_Form',
  folder: { id: 1234, type: 'Program' },
  language: 'English'
});

// Add fields
await mcp__marketo__form_add_field({
  formId: form.result[0].id,
  fieldId: 'Email',
  required: true
});

await mcp__marketo__form_add_field({
  formId: form.result[0].id,
  fieldId: 'FirstName',
  required: true
});

// Approve form
await mcp__marketo__form_approve({ formId: form.result[0].id });
```

## Landing Page Creation

```javascript
// Create landing page
const lp = await mcp__marketo__landing_page_create({
  name: 'Webinar_Registration',
  folder: { id: 1234, type: 'Program' },
  template: 42,
  title: 'Webinar Registration'
});

// Approve landing page
await mcp__marketo__landing_page_approve({
  landingPageId: lp.result[0].id
});
```

## Approval Order

**Critical**: Assets must be approved in dependency order:

```
1. Forms (no dependencies)
2. Emails (may use tokens from program)
3. Landing Pages (may embed forms)
4. Campaigns (reference all above)
```

## Folder Pattern

When creating assets in a program:
```javascript
folder: { id: programId, type: 'Program' }  // Program-local asset
```

When creating assets in a shared folder:
```javascript
folder: { id: folderId, type: 'Folder' }    // Shared asset
```

## Asset Naming Convention

```
[Program Name] - [Asset Type] - [Purpose]
Example: Q1 Webinar - Email - Invitation
```

## Error Prevention

- Asset names must be unique within folder
- Templates must exist and be approved
- Forms need at least one field
- Emails need subject and from address
