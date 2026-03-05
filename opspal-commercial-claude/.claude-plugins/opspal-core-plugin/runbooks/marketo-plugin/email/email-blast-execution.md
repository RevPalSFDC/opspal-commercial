# Email Blast Execution Runbook

## Purpose

Complete operational procedures for executing one-time email blasts to targeted segments in Marketo.

## Overview

Email blasts are single-send campaigns to a defined audience, distinct from triggered or nurture emails. This runbook covers planning, setup, execution, and analysis.

### Email Blast vs. Other Email Types

| Type | Trigger | Frequency | Use Case |
|------|---------|-----------|----------|
| **Email Blast** | Manual/Scheduled | One-time | Announcements, promotions |
| **Triggered Email** | Lead action | Automatic | Welcome, confirmation |
| **Nurture Email** | Engagement program | Cadenced | Education, drip |

---

## Phase 1: Planning

### 1.1 Define Objectives

Before creating any assets:

- [ ] **Primary Goal**
  - [ ] Awareness (brand/product)
  - [ ] Engagement (content download)
  - [ ] Conversion (demo, trial, purchase)
  - [ ] Retention (customer communication)

- [ ] **Success Metrics**
  - Target open rate: ___% (benchmark: 15-25%)
  - Target click rate: ___% (benchmark: 2-5%)
  - Target conversion: ___ leads/customers

- [ ] **Send Date/Time**
  - Date: _______________
  - Time: _______________ (timezone: ___)
  - Optimal: Tue-Thu, 10am-2pm recipient time

### 1.2 Audience Definition

Define your target segment:

- [ ] **Inclusion Criteria**
  - List membership: _______________
  - Scoring threshold: _______________
  - Activity criteria: _______________
  - Demographic filters: _______________

- [ ] **Exclusion Criteria**
  - [ ] Unsubscribed
  - [ ] Hard bounced
  - [ ] Marketing suspended
  - [ ] Received email in past ___ days
  - [ ] Competitors
  - [ ] Do not contact

- [ ] **Estimated Volume**
  - Smart list count: _______________
  - After suppressions: _______________

---

## Phase 2: Program Setup

### 2.1 Create Email Program

1. Marketing Activities > Select folder
2. New > New Program
3. Program Type: **Email**
4. Name: `YYYY-MM-DD [Campaign Name] Email`
5. Channel: Email Send (or appropriate channel)

Or use wizard:
```
/create-email-program
```

### 2.2 Program Structure

```
Email Program
├── Email Asset (the actual email)
├── Smart List (audience)
├── Schedule Tab (send configuration)
└── Reporting Dashboard
```

### 2.3 Token Configuration (Optional)

Set program tokens for dynamic content:

| Token | Value |
|-------|-------|
| `{{my.Email Subject}}` | [Subject line] |
| `{{my.CTA Text}}` | [Button text] |
| `{{my.CTA URL}}` | [Destination URL] |
| `{{my.Sender Name}}` | [From name] |

---

## Phase 3: Email Asset Creation

### 3.1 Email Setup

- [ ] **Template Selection**
  - Use approved template
  - Template ID: _______________
  - Mobile responsive: Yes

- [ ] **Header Configuration**
  - From Name: _______________
  - From Email: _______________
  - Reply-To: _______________
  - Subject Line: _______________
  - Preview Text: _______________

### 3.2 Content Requirements

- [ ] **Subject Line Best Practices**
  - Under 50 characters
  - No spam trigger words
  - Personalization token (optional)
  - A/B test variant created

- [ ] **Email Body**
  - Clear headline
  - Concise copy (under 200 words)
  - Single primary CTA
  - Secondary CTA (optional)
  - Mobile optimized

- [ ] **Compliance**
  - Physical address included
  - Unsubscribe link present
  - Privacy policy link
  - CAN-SPAM compliant

### 3.3 A/B Testing (Recommended)

Configure A/B test:

- [ ] **Test Type**
  - [ ] Subject line
  - [ ] From name
  - [ ] Send time
  - [ ] Content variation

- [ ] **Test Configuration**
  - Test percentage: ___ % (recommended: 10-20%)
  - Winning metric: Open rate / Click rate
  - Test duration: ___ hours
  - Winner auto-send: Yes / No

---

## Phase 4: Audience Configuration

### 4.1 Smart List Setup

Navigate to Email Program > Smart List tab

**Include Filters:**
```
Filter 1: Member of Smart List = [Target List]
  OR
Filter 1: [Your criteria filters]

Filter 2: Email Address is not empty
Filter 3: Email Invalid = False
Filter 4: Email Suspended = False
Filter 5: Unsubscribed = False
```

**Exclude Filters (Add More):**
```
Filter 6: Member of List is not [Competitors]
Filter 7: Member of List is not [Do Not Email]
Filter 8: Email Bounced is not Hard
Filter 9: Not Was Sent Email in past [X] days
```

### 4.2 Communication Limits

Verify communication limits are respected:

- Admin > Communication Limits
- Default: Max emails per day/week
- Your program's eligibility: _______________

### 4.3 Volume Verification

Run smart list count:

```javascript
mcp__marketo__campaign_get_leads({
  campaignId: [EMAIL_PROGRAM_ID],
  includeCount: true
})
```

- [ ] Volume is as expected: _______________
- [ ] No unexpected segment (too large/small)
- [ ] Suppression working correctly

---

## Phase 5: Pre-Send Checklist

### 5.1 Content Review

- [ ] **Copy Proofread**
  - No spelling errors
  - Grammar correct
  - Brand voice consistent

- [ ] **Links Tested**
  - All links working
  - UTM parameters added
  - Landing pages approved

- [ ] **Tokens Verified**
  - All tokens render correctly
  - Fallback values configured
  - No {{token}} showing in preview

- [ ] **Images Loading**
  - Images display correctly
  - Alt text present
  - Optimized file sizes

### 5.2 Technical Review

- [ ] **Email Approved**
  - Status: Approved (not Draft)
  - No pending changes

- [ ] **Deliverability Check**
  - Run spam score test
  - Score acceptable (< 5)
  - No blacklisted elements

- [ ] **Render Testing**
  - Desktop clients (Outlook, Gmail, Apple Mail)
  - Mobile clients (iOS, Android)
  - Web clients (Gmail web, Outlook web)

### 5.3 Sample Sends

Send test emails:

```javascript
mcp__marketo__email_send_sample({
  emailId: [EMAIL_ID],
  emailAddress: 'test@yourdomain.com'
})
```

- [ ] Test sent to self
- [ ] Test sent to stakeholder
- [ ] All variations tested (A/B)
- [ ] Mobile test received

### 5.4 Stakeholder Approval

- [ ] Content approved by: _______________
- [ ] Send date approved by: _______________
- [ ] Legal/compliance approved (if required)

---

## Phase 6: Scheduling & Execution

### 6.1 Schedule Configuration

Navigate to Email Program > Schedule tab

- [ ] **Send Type**
  - [ ] Send Now
  - [ ] Schedule for later: Date ___ Time ___

- [ ] **Recipient Time Zone**
  - [ ] Send in recipient's time zone
  - [ ] Send in single time zone: ___

- [ ] **Head Start** (for large sends)
  - [ ] Enable head start (starts processing early)

### 6.2 Final Confirmation

Before clicking "Approve Program":

| Check | Status |
|-------|--------|
| Email approved | ✓ |
| Smart list finalized | ✓ |
| Send date/time correct | ✓ |
| A/B test configured | ✓ |
| Stakeholder approved | ✓ |

### 6.3 Approve & Schedule

1. Click "Approve Program"
2. Confirm send details in dialog
3. Click "Approve" to finalize

**Post-Approval:**
- Program status changes to "Scheduled"
- Entry in scheduled sends calendar
- Notification sent (if configured)

Run pre-flight check:
```
/marketo-preflight email-send --target=[EMAIL_PROGRAM_ID]
```

---

## Phase 7: Post-Send Monitoring

### 7.1 Immediate Monitoring (First 2 Hours)

Watch for issues:

- [ ] **Delivery Started**
  - Check program dashboard
  - Emails entering queue

- [ ] **Bounce Rate**
  - Normal: < 2%
  - Warning: 2-5%
  - Critical: > 5% (pause if possible)

- [ ] **Complaint Rate**
  - Normal: < 0.1%
  - Warning: > 0.1%
  - Critical: > 0.5%

### 7.2 Same-Day Metrics (After 4-6 Hours)

| Metric | Your Result | Benchmark |
|--------|-------------|-----------|
| Delivered | ___% | > 95% |
| Opened | ___% | 15-25% |
| Clicked | ___% | 2-5% |
| Bounced | ___% | < 2% |
| Unsubscribed | ___% | < 0.5% |

### 7.3 Full Metrics (After 48 Hours)

Run complete analysis:

```javascript
mcp__marketo__analytics_email_report({
  emailId: [EMAIL_ID],
  metrics: ['sent', 'delivered', 'opened', 'clicked', 'bounced', 'unsubscribed']
})
```

---

## Phase 8: Analysis & Reporting

### 8.1 Performance Analysis

#### Email Metrics

| Metric | Result | vs. Benchmark | vs. Previous |
|--------|--------|---------------|--------------|
| Total Sent | | | |
| Delivered | % | | |
| Unique Opens | % | | |
| Unique Clicks | % | | |
| Click-to-Open | % | | |
| Unsubscribes | % | | |
| Bounces | % | | |

#### A/B Test Results (If Applicable)

| Version | Subject | Opens | Clicks | Winner |
|---------|---------|-------|--------|--------|
| A | | % | % | |
| B | | % | % | |

### 8.2 Engagement Analysis

Top performing elements:

- **Best performing links:**
  1. _______________
  2. _______________
  3. _______________

- **Engagement by segment:**
  - [Segment A]: ___% open, ___% click
  - [Segment B]: ___% open, ___% click

- **Device breakdown:**
  - Desktop: ___%
  - Mobile: ___%
  - Tablet: ___%

### 8.3 Conversion Tracking

Track downstream conversions:

- [ ] Landing page visits from email
- [ ] Form fills from email
- [ ] Opportunities influenced
- [ ] Revenue attributed

---

## Troubleshooting

### Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| Low delivery | Authentication issues | Check SPF/DKIM |
| Low opens | Poor subject line | A/B test subjects |
| Low clicks | Weak CTA | Improve CTA visibility |
| High bounces | List quality | Clean list, verify emails |
| High unsubscribes | Irrelevant content | Improve targeting |
| Delayed sends | Large volume | Use head start |

### Emergency Procedures

**Stop a Scheduled Send:**
1. Marketing Activities > Program
2. Program Actions > Unapprove Program
3. Confirm cancellation

**Stop an In-Progress Send:**
1. Marketing Activities > Program
2. Program Actions > Abort Program
3. Note: Already sent emails cannot be recalled

**Send Correction Email:**
1. Create new email with correction
2. Target: Sent email, opened or clicked
3. Send with apology/correction message

---

## Quick Commands

```bash
# Create email program wizard
/create-email-program

# Pre-flight validation
/marketo-preflight email-send --target=PROGRAM_ID

# Check API usage before send
/api-usage

# View email logs
/marketo-logs --filter=email-send --program=PROGRAM_ID
```

---

## Related Resources

- **Agent**: `marketo-email-specialist`
- **Script**: `scripts/lib/email-program-builder.js`
- **Command**: `/create-email-program`
- **Runbook**: `campaign-activation-checklist.md`
- **Template**: Email templates in Design Studio

---

## Appendix: Email Checklist Template

### Pre-Send Checklist

```markdown
## Email: [Campaign Name]
## Send Date: [Date]
## Owner: [Name]

### Content
- [ ] Subject line finalized
- [ ] Preview text set
- [ ] Body copy approved
- [ ] All links tested
- [ ] Images loading
- [ ] Tokens rendering
- [ ] CTA working

### Technical
- [ ] Email approved in Marketo
- [ ] Smart list finalized
- [ ] Suppressions active
- [ ] Send time confirmed
- [ ] A/B test configured

### Compliance
- [ ] Unsubscribe link present
- [ ] Physical address included
- [ ] Privacy policy linked

### Approvals
- [ ] Content owner: _______ Date: _______
- [ ] Marketing ops: _______ Date: _______
- [ ] Legal (if needed): _______ Date: _______

### Go/No-Go
- [ ] **APPROVED TO SEND**
```

---

## Appendix: Subject Line Templates

### Announcement
- "Introducing: [New Feature/Product]"
- "Big news: [Announcement]"
- "[Company] just launched [Feature]"

### Promotional
- "Last chance: [Offer] ends [Date]"
- "[Discount]% off - this week only"
- "Your exclusive [Offer]"

### Content
- "[First Name], check out our latest [Content Type]"
- "The [Topic] guide you've been waiting for"
- "[Number] ways to [Achieve Goal]"

### Event
- "You're invited: [Event Name]"
- "Join us for [Event] on [Date]"
- "[Event] registration is open"

### Re-engagement
- "We miss you, [First Name]"
- "It's been a while..."
- "What have you missed?"
