# HubSpot Marketplace Submission Guide

Complete guide for submitting apps to the HubSpot App Marketplace.

## Overview

The HubSpot App Marketplace allows developers to distribute apps to HubSpot customers. Apps undergo review by the Ecosystem Quality team before listing.

## Pre-Submission Requirements

### App Information

| Requirement | Description |
|-------------|-------------|
| App Name | Clear, descriptive name (no "HubSpot" in name) |
| Description | What the app does, who it's for |
| App Icon | 512x512 PNG, transparent background |
| Screenshots | 1280x800 PNG, showing key features |
| Demo Video | Optional but recommended (2-5 minutes) |
| Support URL | Where users get help |
| Privacy Policy | Required for data access |
| Terms of Service | Required for marketplace |

### Technical Requirements

| Requirement | Details |
|-------------|---------|
| OAuth Scopes | Minimum necessary scopes |
| Error Handling | Graceful error states |
| Loading States | Clear loading indicators |
| Mobile Support | Responsive on all devices |
| Accessibility | WCAG compliance |
| Performance | Fast load times (<3s) |

## Validation Process

### Run Validation

```bash
# Validate app for marketplace
hs project validate

# Checks performed:
# - Required files present
# - Manifest schema valid
# - OAuth scopes appropriate
# - App cards render
# - Settings pages work
```

### Common Validation Issues

**Missing required files:**
```
Error: app.json not found
Fix: Ensure app.json exists in project root
```

**Invalid manifest:**
```
Error: Invalid scope 'crm.objects.all'
Fix: Use specific scopes like 'crm.objects.contacts.read'
```

**Card rendering issues:**
```
Error: Card 'my-card' failed to render
Fix: Check React component for errors
```

## Submission Checklist

### App Configuration

- [ ] App name follows guidelines
- [ ] Description clearly explains value
- [ ] Icon meets specifications
- [ ] Screenshots show key features
- [ ] Category correctly selected
- [ ] Pricing tier appropriate

### Technical Quality

- [ ] `hs project validate` passes
- [ ] All app cards render correctly
- [ ] Settings page saves/loads properly
- [ ] Error states display correctly
- [ ] Loading states show properly
- [ ] Works on mobile devices

### Security

- [ ] Minimum OAuth scopes requested
- [ ] No sensitive data in logs
- [ ] API keys stored in secrets
- [ ] Error messages safe (no stack traces)
- [ ] Input validation implemented

### Documentation

- [ ] Setup guide complete
- [ ] Feature documentation accurate
- [ ] FAQ section helpful
- [ ] Support contact visible
- [ ] Privacy policy linked
- [ ] Terms of service linked

## OAuth Scopes

### Scope Best Practices

1. **Request minimum scopes** - Only what's needed
2. **Justify each scope** - Be ready to explain
3. **Use granular scopes** - Not broad access
4. **Document usage** - Where each scope is used

### Common Scopes

| Scope | Purpose |
|-------|---------|
| `crm.objects.contacts.read` | Read contact data |
| `crm.objects.contacts.write` | Create/update contacts |
| `crm.objects.companies.read` | Read company data |
| `crm.objects.deals.read` | Read deal data |
| `crm.schemas.custom.read` | Read custom objects |
| `settings.users.read` | Read user info |

### Scope Documentation

Include in submission:

```markdown
## Scopes Requested

### crm.objects.contacts.read
- Used to display contact information in app cards
- Required for sync feature to read contact data

### crm.objects.contacts.write
- Used when users click "Update Contact" button
- Only writes user-initiated changes
```

## Review Process

### Timeline

1. **Submission** - App submitted via Developer Portal
2. **Initial Review** (1-3 days) - Basic requirements check
3. **Technical Review** (3-7 days) - Functionality testing
4. **Final Review** (1-2 days) - Final approval/feedback
5. **Listing** - App goes live on marketplace

### Review Criteria

**Functionality:**
- Does the app work as described?
- Are all features functional?
- Does it handle errors gracefully?

**User Experience:**
- Is the UI intuitive?
- Are loading states clear?
- Is the app responsive?

**Security:**
- Are scopes appropriate?
- Is data handled safely?
- Are credentials secure?

**Documentation:**
- Is setup guide clear?
- Are features documented?
- Is support accessible?

## Common Rejection Reasons

### Technical Issues

| Issue | Resolution |
|-------|------------|
| App card doesn't render | Fix React component errors |
| Settings don't save | Check serverless function |
| Excessive scopes | Remove unnecessary scopes |
| Poor error handling | Add ErrorState components |
| Missing loading states | Add LoadingSpinner |

### Documentation Issues

| Issue | Resolution |
|-------|------------|
| Unclear description | Rewrite with value proposition |
| Missing screenshots | Add key feature screenshots |
| No setup guide | Create step-by-step guide |
| Missing privacy policy | Add privacy policy page |

### UX Issues

| Issue | Resolution |
|-------|------------|
| Not mobile responsive | Test and fix responsive design |
| Poor accessibility | Follow WCAG guidelines |
| Confusing navigation | Simplify UI flow |
| Slow performance | Optimize API calls |

## Submission Steps

### 1. Prepare App

```bash
# Final validation
hs project validate

# Deploy to production account
hs project upload --account=production
```

### 2. Submit via Developer Portal

1. Go to developer.hubspot.com
2. Navigate to your app
3. Click "Submit for Review"
4. Complete submission form
5. Upload required assets
6. Submit for review

### 3. Respond to Feedback

If review feedback received:

1. Address all issues
2. Update app with fixes
3. Re-deploy
4. Respond in portal
5. Re-submit for review

### 4. Post-Approval

After approval:

1. Verify listing appearance
2. Test install flow
3. Monitor for issues
4. Respond to user feedback

## Marketplace Listing Optimization

### Title and Description

```
Good: "Sales Pipeline Insights - Deal Analytics & Forecasting"
Bad: "HubSpot CRM Tool for Sales" (includes HubSpot)
```

### Screenshots

1. **First screenshot** - Most impactful feature
2. **Flow screenshots** - Show user journey
3. **Results screenshot** - Show value delivered
4. **Settings screenshot** - Show configurability

### Category Selection

Choose the most specific applicable category:
- Sales
- Marketing
- Service
- Productivity
- Analytics
- Integration

## App Updates

### Submitting Updates

```bash
# Make changes
# Test thoroughly
# Deploy
hs project upload --account=production

# Submit update via Developer Portal
# May require re-review if scope changes
```

### Review Requirements for Updates

| Change Type | Review Required |
|-------------|-----------------|
| Bug fixes | Usually no |
| New features | Usually yes |
| Scope changes | Always yes |
| UI changes | Sometimes |
| Major version | Usually yes |

## Support Resources

### Documentation
- [HubSpot Developer Docs](https://developers.hubspot.com)
- [App Marketplace Guidelines](https://developers.hubspot.com/docs/api/app-marketplace)
- [UI Extensions Reference](https://developers.hubspot.com/docs/apps/developer-platform)

### Support Channels
- Developer Slack Community
- Developer Forum
- Support Tickets
- Office Hours

### Testing Resources
- Developer Sandbox
- Test Accounts
- Review Guidelines
