# 02 - Asset Creation (Emails, Forms, Landing Pages)

## Overview

Marketo's Asset API enables programmatic creation of marketing assets - Emails, Forms, and Landing Pages. This eliminates manual setup and allows dynamic generation of campaign collateral.

## Email Creation

### MCP Tool: Create Email
```javascript
mcp__marketo__email_create({
  name: 'Feb Webinar Invite',
  folder: { id: 1234, type: 'Program' },
  template: 567,              // Template ID (required)
  subject: 'Join Our Webinar',
  fromName: 'Marketing Team',
  fromEmail: 'marketing@company.com',
  replyEmail: 'reply@company.com'
})
```

**Response:**
```json
{
  "success": true,
  "email": {
    "id": 2045,
    "name": "Feb Webinar Invite",
    "status": "draft",
    "folder": { "id": 1234, "type": "Program" }
  }
}
```

### REST API Endpoint
```
POST /rest/asset/v1/emails.json
Content-Type: application/x-www-form-urlencoded

name=Feb%20Webinar%20Invite&folder={"id":1234,"type":"Program"}&template=567&subject=Join%20Our%20Webinar
```

### Approve Email
```javascript
mcp__marketo__email_approve({ emailId: 2045 })
```

### Update Email Content
```javascript
mcp__marketo__email_update_content({
  emailId: 2045,
  htmlId: 'body-content',
  type: 'DynamicContent',
  value: '<p>New content here</p>'
})
```

## Form Creation

### MCP Tool: Create Form
```javascript
mcp__marketo__form_create({
  name: 'Event_Signup_Form',
  folder: { id: 1234, type: 'Program' },
  language: 'English',
  description: 'Form for event registration'
})
```

**Response:**
```json
{
  "success": true,
  "form": {
    "id": 789,
    "name": "Event_Signup_Form",
    "status": "draft"
  }
}
```

### Add Fields to Form
```javascript
// First, get available fields
const fields = await mcp__marketo__form_available_fields();

// Add required fields
await mcp__marketo__form_add_field({
  formId: 789,
  fieldId: 'Email',
  required: true,
  labelWidth: 150,
  fieldWidth: 300
});

await mcp__marketo__form_add_field({
  formId: 789,
  fieldId: 'FirstName',
  required: true
});

await mcp__marketo__form_add_field({
  formId: 789,
  fieldId: 'LastName',
  required: true
});
```

### Add Visibility Rules
```javascript
mcp__marketo__form_add_visibility_rule({
  formId: 789,
  fieldId: 'Company',
  ruleType: 'show',
  rules: [
    { field: 'Email', operator: 'contains', value: '@company.com' }
  ]
})
```

### Approve Form
```javascript
mcp__marketo__form_approve({ formId: 789 })
```

## Landing Page Creation

### MCP Tool: Create Landing Page
```javascript
mcp__marketo__landing_page_create({
  name: 'Webinar_Registration',
  folder: { id: 1234, type: 'Program' },
  template: 42,               // Template ID (required)
  title: 'Webinar Registration',
  description: 'Sign up for our February webinar'
})
```

**Response:**
```json
{
  "success": true,
  "landingPage": {
    "id": 456,
    "name": "Webinar_Registration",
    "status": "draft",
    "URL": "https://pages.company.com/webinar-registration.html"
  }
}
```

### Approve Landing Page
```javascript
mcp__marketo__landing_page_approve({ landingPageId: 456 })
```

### Add Form to Landing Page
For guided landing pages, forms are typically added via template sections. For free-form pages:
```javascript
mcp__marketo__landing_page_update_content({
  landingPageId: 456,
  contentId: 'form-section',
  type: 'Form',
  value: { formId: 789 }
})
```

## Associating Assets with Programs

### Folder Parameter Pattern
When creating assets with `folder: { id: X, type: 'Program' }`, the asset becomes **local to that program**:

```javascript
// Create email in program
await mcp__marketo__email_create({
  name: 'Welcome Email',
  folder: { id: programId, type: 'Program' },  // Program-local
  template: emailTemplateId,
  subject: '{{my.EmailSubject}}'  // Uses program token
});

// Create form in same program
await mcp__marketo__form_create({
  name: 'Signup Form',
  folder: { id: programId, type: 'Program' }
});

// Create landing page in same program
await mcp__marketo__landing_page_create({
  name: 'Registration Page',
  folder: { id: programId, type: 'Program' },
  template: lpTemplateId
});
```

### Smart Campaigns Access
Smart Campaigns within the program can reference these local assets:
- **Send Email** flow step can use the local email
- **Form fills** from the local form trigger campaigns
- **Landing page** views can be tracked

## Complete Asset Workflow

```javascript
// 1. Clone program from template
const program = await mcp__marketo__program_clone({
  programId: templateId,
  name: 'Q1 Webinar - AI Marketing',
  folder: { id: targetFolder, type: 'Folder' }
});

// 2. Update program tokens
await mcp__marketo__program_tokens_update({
  folderId: program.id,
  folderType: 'Program',
  tokens: [
    { name: 'my.WebinarTitle', type: 'text', value: 'AI in Marketing' },
    { name: 'my.EmailSubject', type: 'text', value: 'Join us: AI in Marketing' }
  ]
});

// 3. Approve email (uses tokens from program)
await mcp__marketo__email_approve({ emailId: program.emails[0].id });

// 4. Approve form
await mcp__marketo__form_approve({ formId: program.forms[0].id });

// 5. Approve landing page
await mcp__marketo__landing_page_approve({ landingPageId: program.landingPages[0].id });

// 6. Activate trigger campaign
await mcp__marketo__campaign_activate({ campaignId: program.campaigns[0].id });
```

## Template Requirements

### Email Templates
- Must have approved email template in Design Studio
- Template defines editable sections
- Get template ID via API or UI

### Form Templates
- New forms start with default fields (First, Last, Email)
- Additional fields added via `form_add_field`
- Styling controlled by form theme

### Landing Page Templates
- **Guided templates**: Predefined sections, easier to manage
- **Free-form templates**: Full flexibility, more complex
- Template defines available content areas

## Best Practices

### Asset Naming
```
[Program Name] - [Asset Type] - [Purpose]
Example: Q1 Webinar - Email - Invitation
```

### Approval Workflow
1. Create all assets in draft state
2. Configure content/fields
3. Test with sample data
4. Approve in order: Forms → Emails → Landing Pages → Campaigns

### Error Prevention
- Asset names must be unique within folder
- Templates must exist and be approved
- Forms need at least one field
- Emails need subject and from address

## Agent Routing

| Task | Agent |
|------|-------|
| Email creation/editing | `marketo-email-specialist` |
| Form building | `marketo-form-builder` |
| Landing page management | `marketo-landing-page-manager` |
| Multi-asset workflows | `marketo-automation-orchestrator` |

## Limitations

- Cannot directly set Smart Campaign flow steps via API
- Must use templates for structure
- Content sections defined by template
- Some asset types (mobile push, social) have restrictions
