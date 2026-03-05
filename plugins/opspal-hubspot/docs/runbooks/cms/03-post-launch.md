# HubSpot CMS Post-Launch Runbook

## Overview

This runbook provides procedures for ongoing monitoring, maintenance, and optimization of a HubSpot CMS website after launch. It covers the first week, first month, and ongoing quarterly operations.

**Related Runbooks**:
- `01-website-build.md` - Initial website build
- `02-site-launch.md` - Launch process

## First 24 Hours

### Immediate Monitoring

#### Hour 1-4: Critical Verification

- [ ] Site accessible from multiple locations
- [ ] No 500/502/503 errors
- [ ] SSL certificate active
- [ ] All pages loading correctly
- [ ] Forms submitting successfully
- [ ] Analytics tracking active

#### Hour 4-12: Performance Monitoring

| Metric | Target | Actual | Status |
|--------|--------|--------|--------|
| Uptime | 100% | ___ | [ ] |
| Page Load | < 3s | ___ | [ ] |
| Error Rate | 0% | ___ | [ ] |
| Form Submissions | > 0 | ___ | [ ] |

#### Hour 12-24: User Experience

- [ ] Review user behavior in HubSpot Analytics
- [ ] Check for 404 errors in Reports
- [ ] Monitor form submission rates
- [ ] Review any support tickets or feedback
- [ ] Verify email workflows triggering

### Day 1 Checklist

```
✅ Site stable and accessible
✅ No critical errors logged
✅ Analytics tracking verified
✅ Forms working correctly
✅ Workflows executing
✅ Team notified of successful launch
✅ Monitoring alerts configured
```

## First Week

### Day 2-3: Traffic Analysis

**Agent**: `hubspot-analytics-reporter`

#### Traffic Sources Review

| Source | Sessions | Bounce Rate | Conversion |
|--------|----------|-------------|------------|
| Direct | ___ | ___ | ___ |
| Organic | ___ | ___ | ___ |
| Referral | ___ | ___ | ___ |
| Social | ___ | ___ | ___ |
| Email | ___ | ___ | ___ |

#### Page Performance

Review top 10 pages by views:

| Page | Views | Avg Time | Bounce Rate | Exit Rate |
|------|-------|----------|-------------|-----------|
| Home | ___ | ___ | ___ | ___ |
| About | ___ | ___ | ___ | ___ |
| ... | ___ | ___ | ___ | ___ |

### Day 4-5: Error Remediation

#### 404 Error Management

**Agent**: `hubspot-cms-redirect-manager`

1. Export 404 errors from HubSpot Reports
2. Analyze common patterns
3. Create redirects for valid old URLs
4. Fix internal broken links
5. Update sitemap

```javascript
// Common 404 patterns to address
const redirectsNeeded = [
  { from: '/old-page', to: '/new-page', reason: 'URL change' },
  { from: '/products/old', to: '/shop/new', reason: 'Structure change' }
];
```

#### Form Error Review

**Agent**: `hubspot-cms-form-manager`

- [ ] Review form submission errors
- [ ] Check for validation issues
- [ ] Verify notification delivery
- [ ] Test failed submissions manually

### Day 6-7: Optimization Opportunities

#### Performance Optimization

**Target improvements**:
- Largest Contentful Paint (LCP) < 2.5s
- First Input Delay (FID) < 100ms
- Cumulative Layout Shift (CLS) < 0.1

**Quick wins**:
1. Optimize remaining large images
2. Defer non-critical JavaScript
3. Enable lazy loading on more images
4. Reduce unused CSS

#### Content Optimization

**Agent**: `hubspot-seo-optimizer`

Based on initial traffic data:
- [ ] Identify underperforming pages
- [ ] Review keyword opportunities
- [ ] Plan content updates for low-traffic pages

### Week 1 Summary Report

Generate and share with stakeholders:

```markdown
# Week 1 Website Performance Report

## Overview
- Launch Date: [date]
- Total Sessions: [number]
- Total Page Views: [number]
- Conversion Rate: [%]

## Key Metrics
- Uptime: [%]
- Average Load Time: [seconds]
- Bounce Rate: [%]
- Form Submissions: [number]

## Issues Resolved
- [list of 404s fixed]
- [list of bugs fixed]

## Recommendations
- [optimization opportunities]

## Next Week Focus
- [priorities]
```

## First Month

### Week 2-3: Content & SEO Monitoring

#### Search Console Integration

1. Verify site in Google Search Console
2. Submit updated sitemap
3. Monitor indexing status
4. Track search impressions

| Metric | Week 1 | Week 2 | Week 3 | Week 4 |
|--------|--------|--------|--------|--------|
| Impressions | ___ | ___ | ___ | ___ |
| Clicks | ___ | ___ | ___ | ___ |
| CTR | ___ | ___ | ___ | ___ |
| Position | ___ | ___ | ___ | ___ |

#### Content Performance

**Agent**: `hubspot-cms-content-manager`

**Blog Performance** (if applicable):
- Total posts published: ___
- Average views per post: ___
- Top performing post: ___
- Engagement rate: ___

**Landing Page Performance**:
- Total conversions: ___
- Conversion rate: ___
- Best performing: ___

### Week 2-3: User Feedback Analysis

#### Feedback Collection

- [ ] Review support tickets
- [ ] Analyze chat conversations
- [ ] Monitor social mentions
- [ ] Survey stakeholders
- [ ] Review analytics behavior flow

#### Common Feedback Categories

| Category | Count | Priority | Action |
|----------|-------|----------|--------|
| Navigation issues | ___ | ___ | ___ |
| Content gaps | ___ | ___ | ___ |
| Form problems | ___ | ___ | ___ |
| Mobile issues | ___ | ___ | ___ |
| Speed complaints | ___ | ___ | ___ |

### Week 4: Month 1 Review

#### Key Performance Indicators

| KPI | Target | Actual | Status |
|-----|--------|--------|--------|
| Total Sessions | ___ | ___ | [ ] |
| Unique Visitors | ___ | ___ | [ ] |
| Page Views | ___ | ___ | [ ] |
| Bounce Rate | < 50% | ___ | [ ] |
| Avg Session Duration | > 2 min | ___ | [ ] |
| Pages/Session | > 2 | ___ | [ ] |
| Form Conversion Rate | > 2% | ___ | [ ] |
| Lead Generation | ___ | ___ | [ ] |

#### Month 1 Report Template

```markdown
# Month 1 Website Performance Report

## Executive Summary
[2-3 sentences on overall performance]

## Traffic Overview
- Sessions: [number] (+/- vs target)
- Users: [number]
- Page Views: [number]

## Acquisition Analysis
[breakdown by source]

## Engagement Metrics
- Bounce Rate: [%]
- Avg Session: [time]
- Pages/Session: [number]

## Conversions
- Form Submissions: [number]
- Conversion Rate: [%]
- Lead Quality: [assessment]

## Technical Performance
- Uptime: [%]
- Load Time: [seconds]
- Core Web Vitals: [summary]

## Top Content
1. [page] - [views]
2. [page] - [views]
3. [page] - [views]

## Issues & Resolutions
- [summary of issues fixed]

## Recommendations for Month 2
1. [recommendation]
2. [recommendation]
3. [recommendation]
```

## Ongoing Operations

### Monthly Monitoring Tasks

#### Technical Health

**Frequency**: Weekly check, monthly report

```bash
# Performance audit
hs cms lighthouse-score https://example.com

# Check for 404s
# HubSpot > Reports > Website Analytics > 404 Errors
```

Checklist:
- [ ] Run Lighthouse audit
- [ ] Review 404 error log
- [ ] Check SSL certificate expiry
- [ ] Verify backup status
- [ ] Review security alerts
- [ ] Test all forms
- [ ] Verify analytics tracking

#### Content Health

**Agent**: `hubspot-cms-content-manager`

Monthly content tasks:
- [ ] Review and update outdated content
- [ ] Publish new blog posts (target: ___ per month)
- [ ] Update legal pages if needed
- [ ] Refresh case studies/testimonials
- [ ] Check and fix broken links
- [ ] Update copyright year (January only)

#### SEO Maintenance

**Agent**: `hubspot-seo-optimizer`

Monthly SEO tasks:
- [ ] Review Search Console performance
- [ ] Update meta descriptions for low-CTR pages
- [ ] Add new pages to sitemap
- [ ] Check for duplicate content
- [ ] Review and update internal linking
- [ ] Monitor keyword rankings

### Quarterly Reviews

#### Q1, Q2, Q3, Q4 Checklist

**Performance Review**:
- [ ] Compare traffic to previous quarter
- [ ] Analyze conversion trends
- [ ] Review top/bottom performing pages
- [ ] Assess goal completion rates

**Technical Review**:
- [ ] Full security audit
- [ ] Theme updates needed?
- [ ] Plugin/integration updates
- [ ] Performance optimization
- [ ] Mobile experience audit

**Content Review**:
- [ ] Content audit for relevance
- [ ] Identify content gaps
- [ ] Plan content calendar
- [ ] Review and update CTAs
- [ ] Refresh imagery

**User Experience Review**:
- [ ] Analyze user flow
- [ ] Review heat maps (if available)
- [ ] A/B test opportunities
- [ ] Form optimization
- [ ] Navigation improvements

### Annual Planning

#### Year-End Review

**Comprehensive annual audit**:

1. **Traffic Analysis**
   - Year-over-year comparison
   - Source breakdown
   - Mobile vs desktop trends
   - Geographic distribution

2. **Conversion Analysis**
   - Total leads generated
   - Lead quality assessment
   - Funnel performance
   - Revenue attribution

3. **Content Performance**
   - Best performing content
   - Content to retire/update
   - Content gap analysis
   - Keyword coverage

4. **Technical Assessment**
   - Performance trends
   - Security incidents
   - Platform updates needed
   - Integration health

#### Next Year Planning

Based on annual review:

1. **Goals Setting**
   - Traffic targets
   - Conversion targets
   - Content targets
   - Technical improvements

2. **Resource Planning**
   - Content calendar
   - Development roadmap
   - Training needs
   - Budget allocation

3. **Major Initiatives**
   - Site redesign (if needed)
   - New features
   - New integrations
   - Platform upgrades

## Monitoring Tools Setup

### Uptime Monitoring

**Recommended**: UptimeRobot, Pingdom, StatusCake

Configuration:
```
Monitor Type: HTTPS
URL: https://example.com
Interval: 5 minutes
Alert Contacts: [email], [SMS for critical]
Alert Threshold: 1 failure
```

### Performance Monitoring

**Google PageSpeed Insights API** (optional automation):
```javascript
// Weekly performance check script
const urls = [
  'https://example.com',
  'https://example.com/blog',
  'https://example.com/contact'
];

// Run lighthouse for each URL
// Store results for trending
```

### Error Alerting

**HubSpot Alerts**:
1. Set up 404 error threshold alert
2. Configure form failure notifications
3. Enable workflow failure alerts

### Analytics Dashboards

**Agent**: `hubspot-analytics-reporter`

Create dashboards for:
1. **Daily Operations** - Real-time traffic, form submissions
2. **Weekly Review** - Traffic trends, top pages, conversions
3. **Monthly Executive** - KPIs, goals, trends
4. **Quarterly Analysis** - Deep dive, comparisons

## Incident Response

### Severity Levels

| Level | Description | Response Time | Escalation |
|-------|-------------|---------------|------------|
| P1 - Critical | Site down, major function broken | 15 minutes | Immediate |
| P2 - High | Significant feature broken | 1 hour | Same day |
| P3 - Medium | Minor feature issue | 4 hours | Next day |
| P4 - Low | Cosmetic/minor issue | 24 hours | Weekly |

### P1 Response Procedure

1. **Acknowledge** (0-5 min)
   - Confirm incident
   - Notify stakeholders
   - Begin diagnosis

2. **Diagnose** (5-15 min)
   - Check HubSpot status page
   - Review recent changes
   - Identify root cause

3. **Mitigate** (15-30 min)
   - Implement fix or workaround
   - Rollback if necessary
   - Restore service

4. **Communicate** (ongoing)
   - Update stakeholders
   - Document timeline
   - Plan prevention

5. **Post-Mortem** (within 48 hours)
   - Root cause analysis
   - Prevention measures
   - Documentation update

### Common Issues & Resolution

| Issue | Quick Resolution |
|-------|------------------|
| Site slow | Check HubSpot status, clear CDN cache |
| Forms not submitting | Check form configuration, notifications |
| 404 errors spike | Review recent URL changes, add redirects |
| Analytics not tracking | Verify tracking code, check blockers |
| SSL warning | Check certificate status in HubSpot |
| Email not sending | Check workflow status, email settings |

## Content Freshness Guidelines

### Update Frequency

| Content Type | Review Frequency | Update Triggers |
|--------------|------------------|-----------------|
| Homepage | Quarterly | Major campaigns, rebrand |
| Product/Service | Monthly | Features, pricing changes |
| Blog posts | Per traffic | Low engagement, outdated info |
| Legal pages | Annually | Policy changes, regulations |
| Team page | As needed | New hires, departures |
| Contact info | As needed | Address, phone, email changes |

### Content Expiry Indicators

**Flag content for review when**:
- Traffic declining for 3+ months
- Bounce rate > 70%
- Contains outdated information
- References deprecated features
- Links are broken
- Images are outdated

## Security Maintenance

### Monthly Security Tasks

- [ ] Review user access (remove former employees)
- [ ] Check for suspicious form submissions
- [ ] Verify HTTPS enforcement
- [ ] Review connected apps/integrations
- [ ] Check for unauthorized content changes

### Annual Security Audit

- [ ] Full access audit
- [ ] Permission review
- [ ] Integration security check
- [ ] Compliance verification (GDPR, CCPA)
- [ ] Security policy review

## Documentation Maintenance

### What to Document

- All configuration changes
- New pages added
- URL changes (with redirects)
- Form modifications
- Workflow changes
- Integration updates
- Incident responses
- Performance improvements

### Documentation Location

```
/docs/
├── changelog/
│   └── YYYY-MM-changes.md
├── incidents/
│   └── YYYY-MM-DD-incident.md
├── runbooks/
│   ├── 01-website-build.md
│   ├── 02-site-launch.md
│   └── 03-post-launch.md
└── architecture/
    └── site-structure.md
```

## Agents Used in Ongoing Operations

| Task | Agent |
|------|-------|
| Content updates | `hubspot-cms-content-manager` |
| SEO monitoring | `hubspot-seo-optimizer` |
| Analytics reports | `hubspot-analytics-reporter` |
| Form management | `hubspot-cms-form-manager` |
| Redirect management | `hubspot-cms-redirect-manager` |
| Workflow monitoring | `hubspot-workflow-builder` |
| Theme updates | `hubspot-cms-theme-manager` |

## Related Commands

- `/cms-audit-pages` - Audit all pages
- `/seo-audit` - Run SEO audit
- `/workflow-audit` - Audit workflows
- `/data-quality` - Check data quality

## Appendix: Monitoring Checklist Templates

### Daily (5 minutes)
- [ ] Site accessible
- [ ] No critical errors in dashboard
- [ ] Form submissions received

### Weekly (30 minutes)
- [ ] Traffic review
- [ ] 404 errors check
- [ ] Form performance
- [ ] Blog performance

### Monthly (2 hours)
- [ ] Full performance audit
- [ ] Content review
- [ ] SEO check
- [ ] Security review
- [ ] Stakeholder report

### Quarterly (4 hours)
- [ ] Comprehensive audit
- [ ] Strategy review
- [ ] Goal assessment
- [ ] Planning session
