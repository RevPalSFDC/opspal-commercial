# Naming Conventions

## Asset Naming Standards

### Workflows
```
Format: [Type]_[Object]_[Purpose]_[Version]
Examples:
- WF_Contact_LeadScoring_v1
- WF_Deal_StageUpdate_v2
- WF_Company_Enrichment_v1

Types:
- WF: Workflow
- SEQ: Sequence
- AUTO: Automation

Reserved Prefixes:
- PROD_: Production workflows
- TEST_: Test/staging workflows
- ARCH_: Archived workflows
```

### Forms
```
Format: [Campaign/Purpose]_[Type]_[Page]_[Year]
Examples:
- LeadGen_ContactForm_Homepage_2024
- Demo_Request_Pricing_2024
- Newsletter_Signup_Blog_2024

Types:
- ContactForm: General contact
- Request: Specific request (demo, quote)
- Signup: Subscription forms
- Survey: Feedback forms
```

### Lists
```
Format: [Type]_[Criteria]_[Segment]
Examples:
- Static_Webinar_Attendees_Q1_2024
- Active_MQL_Enterprise
- Dynamic_Engaged_Last30Days

Types:
- Static: Manual membership
- Active: Dynamic membership (HubSpot term)
- Dynamic: Same as Active (common usage)

Prefixes:
- SYNC_: Synced to external system
- INT_: Internal use only
- CAMP_: Campaign-specific
```

### Email Templates
```
Format: [Type]_[Campaign]_[Variant]_[Version]
Examples:
- Nurture_Demo_Follow_Up_A_v1
- Sales_Outreach_Initial_v2
- Marketing_Newsletter_Weekly_v1

Types:
- Nurture: Automated nurture
- Sales: Sales outreach
- Marketing: Marketing communications
- Transactional: System emails
- Internal: Internal notifications
```

### Custom Properties
```
Format: [category]_[description]
Examples:
- lead_qualification_score
- deal_competitive_intel
- company_tech_stack

Categories:
- lead_: Lead-related
- deal_: Deal/opportunity
- company_: Company/account
- activity_: Activity tracking
- int_: Internal/system use
- sync_: Integration fields
```

### Reports
```
Format: [Department]_[Type]_[Frequency]_[Subject]
Examples:
- Sales_Pipeline_Weekly_Overview
- Marketing_Campaign_Monthly_Performance
- CS_Health_Daily_AtRisk

Departments:
- Sales, Marketing, CS, Ops, Exec

Types:
- Pipeline, Campaign, Health, Activity, Revenue
```

### Dashboards
```
Format: [Audience]_[Focus]_Dashboard
Examples:
- Sales_Team_Performance_Dashboard
- Executive_Revenue_Dashboard
- Marketing_Attribution_Dashboard

Audiences:
- Executive: C-level overview
- Manager: Team management
- Team: Individual contributors
- All: Company-wide
```

## Folder Organization

### Content Folders
```
/Content
├── /Blog
│   ├── /Published
│   ├── /Drafts
│   └── /Archive
├── /Landing-Pages
│   ├── /Campaigns
│   ├── /Product
│   └── /Events
├── /Emails
│   ├── /Templates
│   ├── /Campaigns
│   └── /Automated
└── /Forms
    ├── /Lead-Gen
    ├── /Feedback
    └── /Internal
```

### Workflow Folders
```
/Workflows
├── /Sales
│   ├── /Lead-Routing
│   ├── /Deal-Management
│   └── /Notifications
├── /Marketing
│   ├── /Nurture
│   ├── /Scoring
│   └── /Lifecycle
├── /Operations
│   ├── /Data-Quality
│   ├── /Integration
│   └── /Enrichment
└── /Archive
    └── /[Year]
```

## Version Control

### Version Numbering
```
Format: v[Major].[Minor]
- Major: Significant changes to logic
- Minor: Small tweaks, fixes

Examples:
- v1.0 → Initial version
- v1.1 → Minor adjustment
- v2.0 → Major logic change
```

### Change Documentation
```
Required in workflow notes:
- Date of change
- Author
- Summary of changes
- Reason for change

Example:
"2024-01-15 | J.Smith | Added delay step | Reduce email fatigue"
```

## Deprecation Process

### Archiving Workflow
1. Add "ARCHIVE_" prefix to name
2. Move to Archive folder
3. Turn off workflow
4. Document reason in notes
5. Set calendar reminder to delete after 90 days

### Retirement Checklist
- [ ] Confirm no active enrollments
- [ ] Check for dependencies
- [ ] Document in changelog
- [ ] Update related documentation
- [ ] Archive, don't delete immediately
