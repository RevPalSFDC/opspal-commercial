---
name: cms-launch-site
description: Pre-launch checklist and go-live wizard for HubSpot CMS websites
argument-hint: "[options]"
arguments:
  - name: domain
    description: "The domain to launch (e.g., example.com)"
    required: false
  - name: governed
    description: "Using content staging/approval workflow"
    required: false
    default: "false"
invocations:
  - /cms-launch-site
  - /cms-launch-site --domain example.com
  - /cms-launch-site --governed true
---

# CMS Launch Site Command

Pre-launch checklist and go-live wizard for HubSpot CMS websites.

## Overview

This command guides you through the website launch process:
1. Pre-launch validation
2. Content verification
3. Technical checks
4. Domain/DNS confirmation
5. Publishing execution
6. Post-launch verification
7. Stakeholder notification

## Pre-Launch Checklist

### Content Verification

**Pages**
- [ ] All pages have content (no placeholder text)
- [ ] All pages have featured images where needed
- [ ] All internal links work correctly
- [ ] All external links open in new tab
- [ ] Contact information is accurate
- [ ] Legal pages (privacy, terms) are complete

**Blog**
- [ ] At least one post published (or ready)
- [ ] Authors configured with bio and image
- [ ] Categories/tags set up
- [ ] Subscription working

**Forms**
- [ ] All forms tested (submit test entries)
- [ ] Notifications configured and working
- [ ] Thank you messages/redirects working
- [ ] GDPR consent configured (if required)

**CTAs**
- [ ] All CTAs link to correct destinations
- [ ] CTA styling matches brand
- [ ] Click tracking enabled

**Workflows**
- [ ] Form submission workflows active
- [ ] Notification emails working
- [ ] Lead assignment configured
- [ ] Test run completed

### SEO Verification

**Agent: `hubspot-seo-optimizer`**

Run pre-launch SEO check:

```
/seo-audit --pre-launch
```

**Checklist:**
- [ ] All pages have unique titles (50-60 chars)
- [ ] All pages have unique meta descriptions (150-160 chars)
- [ ] All pages have single H1
- [ ] All images have alt text
- [ ] XML sitemap generated
- [ ] Robots.txt configured
- [ ] No broken links (run scan)

### Technical Verification

**Performance**

```bash
# Run Lighthouse audit on staging/preview
hs cms lighthouse-score https://preview.example.com

# Target scores:
# Performance: 80+
# Accessibility: 90+
# Best Practices: 90+
# SEO: 90+
```

- [ ] Lighthouse Performance score 80+
- [ ] Lighthouse Accessibility score 90+
- [ ] Page load time < 3 seconds
- [ ] Images optimized (no files > 500KB)

**Responsiveness**
- [ ] Desktop (1920x1080) renders correctly
- [ ] Tablet (768x1024) renders correctly
- [ ] Mobile (375x667) renders correctly
- [ ] Navigation works on all devices
- [ ] Forms usable on mobile

**Browser Compatibility**
- [ ] Chrome - working
- [ ] Firefox - working
- [ ] Safari - working
- [ ] Edge - working

### Analytics Verification

- [ ] HubSpot tracking code present on all pages
- [ ] Google Analytics configured (if using)
- [ ] Conversion tracking set up
- [ ] Goals/events configured

## Domain Configuration

{% if domain %}
### Domain: {{ domain }}
{% else %}
### Domain Configuration Required
{% endif %}

**HubSpot Domain Setup:**

1. Go to **Settings > Domains & URLs**
2. Verify domain is connected
3. Check DNS configuration

**DNS Records Required:**

| Type | Host | Value |
|------|------|-------|
| CNAME | www | [HubSpot target] |
| A | @ | [HubSpot IP] |

**SSL Certificate:**
- [ ] SSL certificate provisioned
- [ ] HTTPS working correctly
- [ ] HTTP redirects to HTTPS

**Verification Commands:**

```bash
# Check DNS resolution
dig {{ domain }} +short

# Check SSL
curl -I https://{{ domain }}

# Verify HubSpot tracking
curl -s https://{{ domain }} | grep "hs-script"
```

## Publishing Process

{% if governed == "true" %}

### Governed Publishing (Content Staging)

Using Content Staging for controlled launch:

**Step 1: Final Review**
- [ ] All staged pages approved by stakeholders
- [ ] All content changes verified in preview
- [ ] Approval chain completed

**Step 2: Schedule Launch**
1. Go to **Content > Content Staging**
2. Select all approved pages
3. Review changes summary
4. Set publish time (or publish immediately)

**Step 3: Execute Publish**
1. Click **Publish to Production**
2. Confirm replacement of live pages
3. Monitor publish progress

**Step 4: Verify**
- [ ] All pages replaced successfully
- [ ] No errors in staging log
- [ ] Live site reflects changes

{% else %}

### Standard Publishing (Direct)

**Step 1: Final Review**
- [ ] All pages in draft reviewed
- [ ] Content approved (internally)

**Step 2: Publish Pages**

For each page:
1. Open page in editor
2. Click **Publish**
3. Verify live page loads correctly

Or bulk publish:
1. Go to **Website Pages**
2. Select all ready pages
3. Click **Publish** (bulk action)

**Step 3: Verify**
- [ ] All pages live
- [ ] No 404 errors
- [ ] Navigation working

{% endif %}

## Post-Launch Verification

### Immediate Checks (Within 1 Hour)

**Functionality:**
- [ ] Visit all main pages on live domain
- [ ] Submit a test form
- [ ] Click all navigation links
- [ ] Test on mobile device
- [ ] Verify analytics tracking (check real-time)
- [ ] Check for console errors (browser dev tools)

**Technical:**
- [ ] SSL working (green lock in browser)
- [ ] No mixed content warnings
- [ ] All images loading
- [ ] Page speed acceptable

**Workflows:**
- [ ] Form submission triggered workflow
- [ ] Notification email received
- [ ] Contact created in HubSpot

### Monitoring (First 24 Hours)

**Set up monitoring:**

1. **Uptime Monitor**
   - Configure UptimeRobot, Pingdom, or similar
   - Monitor: https://{{ domain }}
   - Alert: email/SMS on downtime

2. **Error Tracking**
   - Check HubSpot for 404 errors
   - Review browser console logs
   - Monitor form submission errors

3. **Analytics**
   - Verify traffic recording
   - Check for tracking issues
   - Monitor page performance

### Week 1 Tasks

- [ ] Review daily traffic reports
- [ ] Check for 404 errors and create redirects
- [ ] Monitor form submissions
- [ ] Review workflow execution
- [ ] Gather user feedback
- [ ] Fix any reported issues

## Stakeholder Communication

### Launch Announcement Template

```
Subject: Website Launch Complete - {{ domain }}

Hi Team,

I'm pleased to announce that our new website is now live at:
https://{{ domain }}

Key updates:
- [List major changes/features]

Please take a moment to:
1. Visit the site and explore
2. Report any issues to [contact]
3. Share feedback by [date]

Technical contacts:
- Issues: [email]
- Content updates: [email]

Thank you for your support during this project!

Best,
[Name]
```

### Issue Reporting Template

```
Subject: [URGENT/NORMAL] Website Issue - [Brief Description]

**Page/URL:** [URL]
**Issue Type:** [Bug/Content/Design/Functionality]
**Browser/Device:** [Chrome/Safari/Mobile]

**Description:**
[Detailed description]

**Steps to Reproduce:**
1. Go to [URL]
2. [Action]
3. [Expected vs Actual result]

**Screenshot:** [Attach if applicable]

**Priority:** [Critical/High/Medium/Low]
```

## Rollback Procedure

If critical issues are found after launch:

### Quick Rollback (Content Staging)

1. Go to **Content > Content Staging**
2. Find previous versions
3. Revert affected pages
4. Publish rollback

### Manual Rollback

1. Identify affected pages
2. Access revision history
3. Restore previous version
4. Republish

### Emergency Unpublish

1. Go to affected page
2. Click **Actions > Unpublish**
3. Redirect to alternative page if needed

## Post-Launch Runbook

See `docs/runbooks/cms/03-post-launch.md` for ongoing maintenance procedures.

## Related Commands

- `/cms-build-site` - Build site wizard
- `/cms-audit-pages` - Page audit
- `/seo-audit` - SEO audit
- `/workflow-audit` - Workflow audit

## Launch Complete

Once all checks pass:

- [ ] Website live on {{ domain or "[domain]" }}
- [ ] All functionality verified
- [ ] Monitoring in place
- [ ] Team notified
- [ ] Documentation updated

**Congratulations on your launch!**
