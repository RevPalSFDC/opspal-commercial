# HubSpot CMS Site Launch Runbook

## Overview

This runbook provides a comprehensive pre-launch checklist and go-live process for HubSpot CMS websites. It ensures all critical elements are verified before making a site live and provides procedures for safe publishing and rollback.

**Related Command**: `/cms-launch-site`
**Related Runbook**: `01-website-build.md` (complete build before launch)

## Prerequisites

Before starting the launch process:

- [ ] Website build complete (all phases from `01-website-build.md`)
- [ ] Content approved by stakeholders
- [ ] Domain purchased and accessible
- [ ] DNS access available (or DNS admin on standby)
- [ ] Launch window scheduled (low-traffic time recommended)
- [ ] Rollback plan documented
- [ ] Team communication channels ready

## Phase 1: Pre-Launch Validation

### 1.1 Content Verification

**Agent**: `hubspot-cms-content-manager`

#### Pages
- [ ] All pages have real content (no "Lorem ipsum" or placeholder text)
- [ ] All pages have featured images where applicable
- [ ] Contact information is accurate
- [ ] Legal pages complete (Privacy Policy, Terms of Service)
- [ ] Copyright year is current
- [ ] Company name and branding consistent

#### Internal Links
- [ ] All navigation links work correctly
- [ ] All in-content links resolve
- [ ] No broken anchor links
- [ ] Breadcrumbs display correctly (if used)

#### External Links
- [ ] All external links open in new tab (`target="_blank"`)
- [ ] Social media links are correct
- [ ] Partner/vendor links are valid
- [ ] No links to staging/development environments

### 1.2 Blog Verification

**Agent**: `hubspot-cms-content-manager`

- [ ] At least one post published or scheduled
- [ ] Authors configured with bio and profile image
- [ ] Categories and tags set up
- [ ] Blog subscription form working
- [ ] RSS feed generating correctly
- [ ] Featured images on all posts
- [ ] Author attribution displaying correctly

### 1.3 Forms Verification

**Agent**: `hubspot-cms-form-manager`

For each form, verify:

| Form | Fields OK | Submission Test | Notification | Thank You |
|------|-----------|-----------------|--------------|-----------|
| Contact | [ ] | [ ] | [ ] | [ ] |
| Newsletter | [ ] | [ ] | [ ] | [ ] |
| Demo Request | [ ] | [ ] | [ ] | [ ] |
| Support | [ ] | [ ] | [ ] | [ ] |

**Verification Steps**:
1. Submit test entry for each form
2. Verify notification email received
3. Verify contact created in HubSpot CRM
4. Verify thank you message/redirect works
5. Verify GDPR consent captured (if applicable)
6. Delete test submissions after verification

### 1.4 CTAs Verification

**Agent**: `hubspot-cms-cta-manager`

- [ ] All CTAs link to correct destinations
- [ ] CTA styling matches brand guidelines
- [ ] CTAs are visible and clickable on all devices
- [ ] Click tracking enabled
- [ ] A/B tests configured (if applicable)

### 1.5 Workflows Verification

**Agent**: `hubspot-workflow-builder`

For each workflow:

| Workflow | Status | Test Run | Actions Verified |
|----------|--------|----------|------------------|
| Form → Notification | [ ] Active | [ ] | [ ] |
| Form → Lead Assignment | [ ] Active | [ ] | [ ] |
| Newsletter → Welcome | [ ] Active | [ ] | [ ] |

**Verification Steps**:
1. Trigger workflow with test submission
2. Verify all actions executed
3. Check for errors in workflow log
4. Verify email deliverability

## Phase 2: SEO Verification

**Agent**: `hubspot-seo-optimizer`

### 2.1 On-Page SEO

Run SEO audit: `/seo-audit --pre-launch`

| Page | Title (50-60 chars) | Meta Desc (150-160 chars) | H1 (Single) | Alt Text |
|------|---------------------|---------------------------|-------------|----------|
| Home | [ ] | [ ] | [ ] | [ ] |
| About | [ ] | [ ] | [ ] | [ ] |
| Services | [ ] | [ ] | [ ] | [ ] |
| Contact | [ ] | [ ] | [ ] | [ ] |
| Blog | [ ] | [ ] | [ ] | [ ] |

### 2.2 Technical SEO

- [ ] XML sitemap generated and accessible
- [ ] Robots.txt configured correctly
- [ ] Canonical URLs set on all pages
- [ ] Open Graph tags configured
- [ ] Twitter Card tags configured
- [ ] Structured data (JSON-LD) validated
- [ ] No noindex tags on pages that should be indexed

### 2.3 Broken Links Scan

```bash
# Run broken link check
# Use screaming frog or similar tool on staging URL
```

- [ ] No broken internal links (404s)
- [ ] No broken external links
- [ ] No broken image references
- [ ] All downloads accessible

## Phase 3: Technical Verification

### 3.1 Performance Testing

**Target Scores** (Lighthouse):
- Performance: 80+
- Accessibility: 90+
- Best Practices: 90+
- SEO: 90+

```bash
# Run Lighthouse on staging/preview URL
hs cms lighthouse-score https://preview.example.com
```

| Metric | Score | Target | Status |
|--------|-------|--------|--------|
| Performance | ___ | 80+ | [ ] |
| Accessibility | ___ | 90+ | [ ] |
| Best Practices | ___ | 90+ | [ ] |
| SEO | ___ | 90+ | [ ] |

### 3.2 Page Load Performance

- [ ] Page load time < 3 seconds
- [ ] Time to First Byte < 500ms
- [ ] Largest Contentful Paint < 2.5s
- [ ] Cumulative Layout Shift < 0.1
- [ ] First Input Delay < 100ms

### 3.3 Image Optimization

- [ ] No images > 500KB (unless hero/banner)
- [ ] All images properly sized (not scaled in browser)
- [ ] WebP format used where possible
- [ ] Lazy loading enabled for below-fold images
- [ ] All images have alt text

### 3.4 Responsive Design Testing

| Device | Resolution | Navigation | Forms | Images | Layout |
|--------|------------|------------|-------|--------|--------|
| Desktop | 1920x1080 | [ ] | [ ] | [ ] | [ ] |
| Laptop | 1366x768 | [ ] | [ ] | [ ] | [ ] |
| Tablet | 768x1024 | [ ] | [ ] | [ ] | [ ] |
| Mobile | 375x667 | [ ] | [ ] | [ ] | [ ] |

### 3.5 Browser Compatibility

| Browser | Navigation | Forms | Layout | JavaScript |
|---------|------------|-------|--------|------------|
| Chrome (latest) | [ ] | [ ] | [ ] | [ ] |
| Firefox (latest) | [ ] | [ ] | [ ] | [ ] |
| Safari (latest) | [ ] | [ ] | [ ] | [ ] |
| Edge (latest) | [ ] | [ ] | [ ] | [ ] |

### 3.6 Functionality Testing

- [ ] Search functionality works (if applicable)
- [ ] Filters/sorting work (if applicable)
- [ ] Interactive elements respond correctly
- [ ] No JavaScript console errors
- [ ] No browser warnings or errors
- [ ] Print stylesheet works (if needed)

## Phase 4: Analytics Verification

### 4.1 Tracking Setup

- [ ] HubSpot tracking code on all pages
- [ ] Google Analytics configured (if using)
- [ ] Google Tag Manager configured (if using)
- [ ] Conversion tracking set up
- [ ] Goals/events configured

### 4.2 Verification Tests

```javascript
// In browser console, verify HubSpot tracking
window._hsq  // Should return array

// Verify page views being tracked
// Check HubSpot Analytics > Traffic Analytics > Sources
```

- [ ] Real-time tracking showing visits
- [ ] Page views recording correctly
- [ ] Form submissions tracking
- [ ] CTA clicks tracking

## Phase 5: Domain Configuration

**Agent**: `hubspot-admin-specialist`

### 5.1 DNS Configuration

**Required DNS Records**:

| Type | Host | Value | TTL |
|------|------|-------|-----|
| CNAME | www | [HubSpot CNAME target] | 3600 |
| A | @ | [HubSpot IP address] | 3600 |

**Get HubSpot DNS values**:
1. Settings > Domains & URLs > Connect a domain
2. Follow wizard to get specific values for your portal

### 5.2 DNS Verification

```bash
# Check CNAME record
dig www.example.com CNAME +short

# Check A record
dig example.com A +short

# Check DNS propagation
# Use: https://dnschecker.org
```

- [ ] CNAME record pointing to HubSpot
- [ ] A record configured (for apex domain)
- [ ] DNS propagated (may take up to 48 hours)

### 5.3 SSL Certificate

- [ ] SSL certificate provisioned by HubSpot
- [ ] HTTPS working correctly
- [ ] HTTP redirects to HTTPS
- [ ] No mixed content warnings
- [ ] Certificate valid and not expiring soon

```bash
# Verify SSL
curl -I https://example.com

# Check for mixed content (browser dev tools)
# Console should show no mixed content warnings
```

### 5.4 Domain Verification

```bash
# Verify domain resolves
dig example.com +short

# Verify site accessible
curl -I https://example.com

# Verify HubSpot tracking present
curl -s https://example.com | grep "hs-script"
```

## Phase 6: Publishing Process

### 6.1 Governed Publishing (Content Staging)

If using content staging for controlled launch:

**Step 1: Final Stakeholder Review**
- [ ] All staged pages approved by stakeholders
- [ ] Content changes verified in preview environment
- [ ] Approval chain completed and documented

**Step 2: Schedule Launch**
1. Go to **Content > Content Staging**
2. Select all approved pages for launch
3. Review changes summary one final time
4. Set publish time (or publish immediately)

**Step 3: Execute Publish**
1. Click **Publish to Production**
2. Confirm replacement of live pages
3. Monitor publish progress bar
4. Wait for completion confirmation

**Step 4: Immediate Verification**
- [ ] All pages replaced successfully
- [ ] No errors in staging log
- [ ] Live site reflects all changes
- [ ] Navigation updated correctly

### 6.2 Standard Publishing (Direct)

If publishing directly without staging:

**Step 1: Final Review**
- [ ] All pages in draft state reviewed
- [ ] Content approved internally

**Step 2: Publish Pages**

**Option A: Individual Publishing**
1. Open each page in editor
2. Click **Publish**
3. Verify live page loads correctly

**Option B: Bulk Publishing**
1. Go to **Marketing > Website > Website Pages**
2. Select all pages to publish
3. Click **More > Publish**
4. Confirm bulk publish action

**Step 3: Immediate Verification**
- [ ] All pages live
- [ ] No 404 errors
- [ ] Navigation working

### 6.3 Redirects Verification

**Agent**: `hubspot-cms-redirect-manager`

- [ ] All planned redirects created
- [ ] Old URL → New URL mappings tested
- [ ] No redirect chains (max 1 hop)
- [ ] No redirect loops

```bash
# Test redirects
curl -I https://example.com/old-page
# Should return 301 and Location header
```

## Phase 7: Post-Launch Verification

### 7.1 Immediate Checks (Within 1 Hour)

**Functional Verification**:
- [ ] Visit all main pages on live domain
- [ ] Submit test form (delete test contact after)
- [ ] Click all navigation links
- [ ] Test on actual mobile device
- [ ] Verify search works (if applicable)
- [ ] Check for console errors (browser dev tools)

**Technical Verification**:
- [ ] SSL working (green lock in browser)
- [ ] No mixed content warnings
- [ ] All images loading
- [ ] Page speed acceptable
- [ ] No JavaScript errors

**Analytics Verification**:
- [ ] HubSpot showing real-time visits
- [ ] Google Analytics recording (if applicable)
- [ ] Form submissions tracking
- [ ] CTA clicks tracking

**Workflow Verification**:
- [ ] Form submission triggered workflow
- [ ] Notification email received
- [ ] Contact created in HubSpot CRM

### 7.2 Search Engine Notification

After successful launch:

1. **Google Search Console**:
   - Submit sitemap: `https://example.com/sitemap.xml`
   - Request indexing for key pages

2. **Bing Webmaster Tools**:
   - Submit sitemap
   - Verify site ownership

3. **HubSpot**:
   - Verify sitemap in Settings > Domains & URLs > Sitemap

### 7.3 Third-Party Integrations

Verify all integrations working:
- [ ] CRM sync (if separate from HubSpot)
- [ ] Email marketing integration
- [ ] Chat/support widgets
- [ ] Social media pixels
- [ ] Advertising pixels (Google Ads, Facebook, etc.)

## Phase 8: Monitoring Setup

### 8.1 Uptime Monitoring

Set up monitoring with UptimeRobot, Pingdom, or similar:

**Configure monitors**:
- URL: `https://example.com`
- Check interval: 5 minutes
- Alert method: Email + SMS for critical
- Expected status: 200

**Alerts to configure**:
- Site down (immediate)
- SSL certificate expiring (7 days)
- Slow response time (> 3 seconds)

### 8.2 Error Monitoring

**HubSpot**:
- Check for 404 errors: Reports > Website Analytics > Performance
- Set up dashboard for monitoring

**Google Search Console**:
- Monitor Coverage report for errors
- Check Mobile Usability report

### 8.3 Performance Monitoring

- [ ] Set baseline Lighthouse scores
- [ ] Schedule weekly performance checks
- [ ] Monitor Core Web Vitals in Search Console

## Phase 9: Stakeholder Communication

### 9.1 Launch Announcement Template

```
Subject: Website Launch Complete - [domain]

Hi Team,

I'm pleased to announce that our new website is now live at:
https://[domain]

Key updates:
- [List 3-5 major changes/features]

Please take a moment to:
1. Visit the site and explore
2. Report any issues to [contact email]
3. Share feedback by [date]

Technical contacts:
- Website issues: [email]
- Content updates: [email]

Thank you for your support during this project!

Best,
[Name]
```

### 9.2 Issue Reporting Process

Share this template with team:

```
Subject: [URGENT/NORMAL] Website Issue - [Brief Description]

Page/URL: [URL where issue occurs]
Issue Type: [Bug/Content/Design/Functionality]
Browser/Device: [Chrome/Safari/Mobile/etc.]

Description:
[Detailed description of the issue]

Steps to Reproduce:
1. Go to [URL]
2. [Action taken]
3. [Expected vs Actual result]

Screenshot: [Attach if applicable]

Priority: [Critical/High/Medium/Low]
```

## Phase 10: Rollback Procedures

### 10.1 Quick Rollback (Content Staging)

If using Content Staging:

1. Go to **Content > Content Staging**
2. Find previous version in version history
3. Select pages to revert
4. Click **Restore Previous Version**
5. Publish restored version

### 10.2 Manual Rollback

For individual pages:

1. Open page in editor
2. Click **Actions > Revisions**
3. Find previous working version
4. Click **Restore**
5. Republish page

### 10.3 Emergency Unpublish

For critical issues requiring immediate removal:

1. Go to affected page
2. Click **Actions > Unpublish**
3. Set up redirect to maintenance page if needed
4. Investigate and fix issue
5. Republish when resolved

### 10.4 DNS Rollback

If domain-level issues:

1. Update DNS to point to previous hosting
2. Allow propagation (can take hours)
3. Investigate HubSpot configuration
4. Re-point DNS when resolved

## Launch Day Checklist Summary

### Pre-Launch (Morning)
- [ ] Final content review complete
- [ ] All forms tested
- [ ] All workflows active
- [ ] SEO audit passing
- [ ] Performance acceptable
- [ ] DNS configured and propagated
- [ ] SSL working

### Launch Window
- [ ] Publish all pages
- [ ] Verify no errors
- [ ] Test all major functionality
- [ ] Submit sitemap to search engines
- [ ] Activate monitoring

### Post-Launch (Same Day)
- [ ] All pages accessible
- [ ] Forms working
- [ ] Analytics tracking
- [ ] Workflows executing
- [ ] No console errors
- [ ] Mobile working
- [ ] Send launch announcement

### Day 1 Complete
- [ ] 24-hour monitoring review
- [ ] Error log reviewed
- [ ] Traffic baseline established
- [ ] Stakeholder feedback collected
- [ ] Any immediate fixes deployed

## Related Documentation

- `01-website-build.md` - Website build process
- `03-post-launch.md` - Ongoing maintenance
- `/cms-launch-site` - Launch wizard command
- `/cms-build-site` - Build wizard command

## Agents Used in This Runbook

| Phase | Agent |
|-------|-------|
| Content Verification | `hubspot-cms-content-manager` |
| Forms Verification | `hubspot-cms-form-manager` |
| CTAs Verification | `hubspot-cms-cta-manager` |
| Workflows | `hubspot-workflow-builder` |
| SEO | `hubspot-seo-optimizer` |
| Redirects | `hubspot-cms-redirect-manager` |
| Domain/Admin | `hubspot-admin-specialist` |
