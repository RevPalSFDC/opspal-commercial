# Webinar Campaign Launch Runbook

## Purpose

End-to-end operational procedures for launching webinar campaigns in Marketo with Salesforce integration.

## Timeline Overview

| Timing | Phase | Key Actions |
|--------|-------|-------------|
| 4 weeks before | Planning | Define objectives, select date, create content |
| 2-3 weeks before | Setup | Clone template, configure program, build assets |
| 1-2 weeks before | Launch | Send invitations, monitor registrations |
| Day of | Execution | Final reminders, attendance tracking |
| 1-3 days after | Follow-up | Post-event automation, lead routing |

---

## Phase 1: Pre-Webinar Planning (4 weeks before)

### 1.1 Define Webinar Details

- [ ] **Title and Topic**
  - Clear, compelling title (50 chars max for email subjects)
  - Topic aligned with buyer journey stage
  - Keywords for searchability

- [ ] **Date and Time Selection**
  - Optimal times: Tue-Thu, 10am-2pm local
  - Avoid holidays and major events
  - Consider global audience time zones

- [ ] **Target Audience**
  - Define ICP (industry, title, company size)
  - Segment for personalization
  - Exclusion criteria (competitors, existing customers)

- [ ] **Success Metrics**
  - Registration target: ___
  - Attendance goal: ___ (typically 35-45% of registrations)
  - Pipeline influence target: $___

### 1.2 Provider Setup

- [ ] **Create Event in Webinar Platform**
  - Zoom / GoToWebinar / Webex
  - Configure registration settings
  - Enable practice session
  - Record event ID: _______________

- [ ] **Integration Verification**
  - Admin > LaunchPoint > Check provider active
  - Test connection via API
  - Verify registration sync enabled

---

## Phase 2: Program Setup (2-3 weeks before)

### 2.1 Clone Webinar Template

```
/launch-webinar --template=[TEMPLATE_ID]
```

Or manually:
1. Marketing Activities > Templates > Webinar Master
2. Clone > Name: `YYYY-MM-DD [Webinar Topic]`
3. Destination: Programs > [Year] > Webinars

- [ ] **Template Assets Verified**
  - [ ] 7 email templates present
  - [ ] 2 landing pages present
  - [ ] 1 registration form present
  - [ ] 8+ smart campaigns present

### 2.2 Token Configuration

Update program-level tokens (My Tokens tab):

| Token | Example Value |
|-------|---------------|
| `{{my.Webinar Title}}` | Q1 Product Innovation Webinar |
| `{{my.Webinar Date}}` | January 15, 2025 |
| `{{my.Webinar Time}}` | 2:00 PM EST |
| `{{my.Webinar Timezone}}` | Eastern Time |
| `{{my.Duration}}` | 60 minutes |
| `{{my.Host Name}}` | Jane Smith |
| `{{my.Host Title}}` | VP of Product |
| `{{my.Join URL}}` | https://zoom.us/j/123456789 |
| `{{my.Add to Calendar Link}}` | [Generated ICS link] |

### 2.3 Provider Integration

Connect Marketo program to webinar provider:

1. Program > Setup > Event Partner
2. Select provider (Zoom/GoTo/Webex)
3. Enter Event ID from provider
4. Configure sync settings:
   - [ ] Registration sync: Enabled
   - [ ] Attendance sync: Enabled
   - [ ] Sync frequency: 15 minutes

Verify with:
```javascript
mcp__marketo__program_get({ programId: [ID], includeAssets: true })
```

### 2.4 Salesforce Campaign Sync

Link program to SFDC campaign for attribution:

1. Program > Setup > Salesforce Campaign Sync
2. Select/Create SFDC Campaign
3. Configure status mapping:

| Marketo Status | SFDC Status | Responded |
|----------------|-------------|-----------|
| Not in Program | - | - |
| Invited | Sent | No |
| Registered | Responded | Yes |
| Attended | Attended | Yes |
| No Show | No Show | No |
| Attended On-Demand | Attended On-Demand | Yes |

Or use command:
```
/sync-program-to-sfdc --program=[ID] --direction=bidirectional
```

---

## Phase 3: Asset Preparation (2 weeks before)

### 3.1 Landing Page Setup

- [ ] **Registration Page**
  - Update headline and copy
  - Add speaker photos/bios
  - Include agenda details
  - Verify form embedded correctly
  - Test on mobile devices

- [ ] **Confirmation Page**
  - Clear "You're registered" message
  - Calendar add buttons
  - Social share buttons

- [ ] **Approval Status**
  ```javascript
  mcp__marketo__landing_page_approve({ landingPageId: [LP_ID] })
  ```

### 3.2 Form Configuration

- [ ] **Required Fields**
  - First Name
  - Last Name
  - Email Address
  - Company
  - Job Title (recommended)

- [ ] **Progressive Profiling**
  - Configure fields to show on repeat visits
  - 3-5 fields visible at a time

- [ ] **Hidden Fields**
  - UTM parameters
  - Lead source
  - Program ID

### 3.3 Email Assets

| Email | Purpose | Send Time |
|-------|---------|-----------|
| Invitation 1 | Initial invite | 2 weeks before |
| Invitation 2 | Reminder to non-registered | 1 week before |
| Confirmation | Auto on registration | Immediate |
| Reminder 1 | Reminder to registered | 1 week before |
| Reminder 2 | Reminder to registered | 1 day before |
| Reminder 3 | Reminder to registered | 1 hour before |
| Follow-up Attended | Post-event for attendees | 1 day after |
| Follow-up No Show | Post-event for no-shows | 1 day after |

For each email:
- [ ] Subject line A/B testing configured
- [ ] Preview text optimized
- [ ] Tokens rendering correctly
- [ ] Links tested
- [ ] Unsubscribe present
- [ ] Physical address included

---

## Phase 4: Smart Campaign Configuration

### 4.1 Invitation Campaign

**Smart List:**
- Member of Smart List: [Target Audience]
- NOT Member of Program (Status: Any)
- NOT Member of List: Unsubscribed
- Email Address NOT contains: competitor.com

**Flow:**
1. Send Email: Invitation 1
2. Wait: 1 week
3. Send Email: Invitation 2 (if not registered)

- [ ] **Qualification Rules**: Each lead can run once

### 4.2 Registration Trigger

**Smart List:**
- Trigger: Fills Out Form
- Form: [Registration Form]
- Web Page: [Registration LP]

**Flow:**
1. Change Program Status: Registered
2. Send Email: Confirmation
3. Add to List: [Webinar Name] Registrants

- [ ] **Qualification Rules**: Each lead can run once

### 4.3 Reminder Campaigns

For each reminder (1 week, 1 day, 1 hour):

**Smart List:**
- Program Status: Registered
- NOT Webinar Attended = True (provider field)

**Flow:**
1. Send Email: Reminder [N]

**Schedule:**
- Run at specific date/time
- Relative to event date

### 4.4 Post-Event Campaigns

#### Attended Path:
**Smart List:**
- Program Status: Attended

**Flow:**
1. Send Email: Thank You - Attended
2. Interesting Moment: "Attended [Webinar Name]"
3. Add to List: Webinar Attendees
4. Change Score: +15 (behavioral)

#### No-Show Path:
**Smart List:**
- Program Status: No Show

**Flow:**
1. Send Email: Sorry We Missed You
2. Add to List: Webinar No-Shows
3. Change Score: -5 (decay)

---

## Phase 5: Launch Invitation (1-2 weeks before)

### 5.1 Pre-Send Checklist

- [ ] **Audience Size**
  - Smart list count: ___
  - Within expected range
  - No unexpected filters

- [ ] **Email Verification**
  - Send sample to test account
  - All tokens rendering
  - All links working
  - Mobile preview checked

- [ ] **Suppression Active**
  - Unsubscribed excluded
  - Bounced excluded
  - Communication limit respected

### 5.2 Activate Campaigns

```
/marketo-preflight campaign-activate --target=[CAMPAIGN_ID]
```

Activation order:
1. Registration trigger (activate first)
2. Reminder campaigns (schedule)
3. Invitation campaign (schedule or activate)
4. Post-event campaigns (activate, will wait for status change)

### 5.3 Monitor Registrations

Track daily:
- Registration count
- Registration rate (% of invited)
- Email performance (opens, clicks)
- Landing page conversion

Dashboard:
```javascript
mcp__marketo__analytics_program_report({
  programId: [ID],
  metrics: ['registrations', 'attendance', 'pipeline']
})
```

---

## Phase 6: Event Execution (Day of)

### 6.1 Pre-Event Checks (2 hours before)

- [ ] **Final Reminder Sent**
  - 1-hour reminder delivered
  - No delivery errors

- [ ] **Provider Ready**
  - Webinar room accessible
  - Recording enabled
  - Practice session complete

- [ ] **Registration Sync**
  - Marketo registrants synced to provider
  - Any manual adds completed

### 6.2 During Event

- [ ] **Attendance Tracking**
  - Provider auto-updating attendance
  - Monitor Marketo sync (15-min intervals)

- [ ] **Real-time Issues**
  - Watch for duplicate registrations
  - Handle late joiners

### 6.3 Post-Event (within 2 hours)

- [ ] **Force Sync**
  - Trigger manual attendance sync if needed
  - Verify status updates in Marketo

- [ ] **Upload Recording**
  - Save recording from provider
  - Upload to hosting platform
  - Update thank-you email with link

---

## Phase 7: Post-Event Follow-up (1-3 days after)

### 7.1 Attendance Verification

Check final counts:
- [ ] Total registered: ___
- [ ] Attended: ___ (__%)
- [ ] No-show: ___ (__%)
- [ ] SFDC campaign synced

### 7.2 Follow-up Execution

- [ ] **Attended Email Sent**
  - Recording link included
  - Additional resources
  - CTA for next step

- [ ] **No-Show Email Sent**
  - On-demand recording offer
  - Reschedule option
  - Empathetic messaging

### 7.3 Lead Routing

For high-engagement attendees:
- [ ] MQL check triggered
- [ ] Sales alert sent
- [ ] SFDC task created (optional)

For standard attendees:
- [ ] Added to nurture stream
- [ ] Score updated

### 7.4 On-Demand Setup (optional)

- [ ] Create landing page for on-demand viewing
- [ ] Update form for on-demand registration
- [ ] Create trigger for on-demand viewers
- [ ] Configure on-demand follow-up

---

## Metrics & Reporting

### Key Metrics to Track

| Metric | Formula | Benchmark |
|--------|---------|-----------|
| Registration Rate | Registrations / Invites Sent | 5-15% |
| Attendance Rate | Attended / Registered | 35-45% |
| Engagement Rate | Engaged / Attended | 60-80% |
| MQL Rate | MQLs / Attended | 5-15% |
| Pipeline Influence | Pipeline $ / Program Cost | 5-10x |

### Post-Event Report

Generate within 1 week:
```javascript
mcp__marketo__analytics_program_report({
  programId: [ID],
  metrics: ['registration', 'attendance', 'engagement', 'pipeline', 'revenue']
})
```

---

## Troubleshooting

### Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| Registrations not syncing | Provider connection lost | Check LaunchPoint, reconnect |
| Attendance not updating | Sync delay | Wait 15 min, force sync |
| Duplicate registrations | Multiple form submissions | Enable duplicate prevention |
| Emails not sending | Campaign inactive | Verify activation status |
| Wrong status in SFDC | Mapping mismatch | Review status mapping |

### Emergency Procedures

**Accidental mass email:**
1. Deactivate campaign immediately
2. Check how many sent
3. Send correction email if needed
4. Document incident

**Registration form broken:**
1. Check form is embedded correctly
2. Verify landing page approved
3. Test in incognito window
4. Check form validation rules

---

## Quick Commands

```bash
# Launch webinar wizard
/launch-webinar --template=1234 --date=2025-01-15 --provider=zoom

# Pre-flight validation
/marketo-preflight webinar --target=PROGRAM_ID

# Monitor sync status
/monitor-sync --program=PROGRAM_ID

# Check API usage
/api-usage
```

---

## Related Resources

- **Agent**: `marketo-webinar-orchestrator`
- **Script**: `scripts/lib/webinar-program-builder.js`
- **Command**: `/launch-webinar`
- **Template**: Webinar Master Template (ID: [TEMPLATE_ID])
- **Checklist**: This document

---

## Appendix: Email Subject Line Ideas

### Invitation
- "Join us: [Topic] Webinar on [Date]"
- "You're invited: [Topic] - Live on [Date]"
- "[First Name], learn [Key Benefit] in 60 minutes"

### Reminder
- "Starts in 1 week: [Webinar Title]"
- "Tomorrow: Don't miss [Webinar Title]"
- "Starting in 1 hour - Join now"

### Follow-up
- "Thanks for attending! Here's the recording"
- "Sorry we missed you - watch on demand"
- "[First Name], your webinar recording is ready"
