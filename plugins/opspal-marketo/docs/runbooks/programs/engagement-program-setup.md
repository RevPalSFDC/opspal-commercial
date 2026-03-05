# Engagement Program Setup Runbook

## Purpose

Complete operational procedures for designing, building, and managing engagement programs (nurture campaigns) in Marketo.

## Overview

Engagement programs deliver automated, cadenced content to leads over time, nurturing them through the buyer journey. They differ from smart campaigns by using streams and cast scheduling.

### Engagement Program vs. Smart Campaign

| Feature | Engagement Program | Smart Campaign |
|---------|-------------------|----------------|
| Content Delivery | Streams with cadence | Flow steps |
| Scheduling | Cast-based (recurring) | Trigger or batch |
| Content Management | Drag-and-drop streams | Flow configuration |
| Exhaustion Handling | Automatic stream transition | Manual |
| Best For | Long-term nurture | Single actions |

---

## Phase 1: Nurture Strategy Design

### 1.1 Define Nurture Goals

Before building, answer these questions:

- [ ] **Target Audience**
  - Who enters this nurture?
  - What stage of buyer journey?
  - What problem are they trying to solve?

- [ ] **Desired Outcome**
  - Move to next stage (MQL, SQL)
  - Product education
  - Event registration
  - Upsell/cross-sell

- [ ] **Content Strategy**
  - Educational → Solution-aware → Product-focused
  - Number of touchpoints: ___ emails
  - Cadence: Weekly / Bi-weekly / Monthly

### 1.2 Buyer Journey Mapping

Map content to journey stages:

| Stage | Content Type | Goal | # Emails |
|-------|--------------|------|----------|
| Awareness | Industry insights, trends | Establish expertise | 2-3 |
| Consideration | Problem-focused, comparisons | Show solutions | 3-4 |
| Decision | Product benefits, case studies | Drive action | 2-3 |

### 1.3 Stream Architecture

Choose architecture based on complexity:

#### Single Stream (Simple)
```
Entry → Stream 1 → Exit/Convert
```
Best for: Simple nurtures, single journey

#### Multi-Stream (Standard)
```
Entry → Stream 1 (Awareness) → Transition → Stream 2 (Consideration) → Stream 3 (Decision) → Exit
```
Best for: Stage-based progression

#### Parallel Streams (Advanced)
```
Entry → [Persona Detection]
        ├→ Stream A (Persona 1)
        ├→ Stream B (Persona 2)
        └→ Stream C (Persona 3)
```
Best for: Persona-specific content

---

## Phase 2: Program Creation

### 2.1 Create Engagement Program

1. Marketing Activities > Select folder
2. New > New Program
3. Program Type: **Engagement**
4. Name: `[Audience] Nurture Program`
5. Channel: Nurture (or appropriate)

Or use wizard:
```
/create-nurture-program
```

### 2.2 Initial Configuration

- [ ] **Description**: Clear purpose documented
- [ ] **Channel**: Nurture or appropriate channel
- [ ] **Tags**: Add relevant tags (campaign, audience)
- [ ] **Period Cost**: Set budget for attribution

### 2.3 Folder Organization

```
Engagement Program
├── Streams (auto-created)
│   ├── Stream 1
│   ├── Stream 2
│   └── Stream 3
├── Emails
│   ├── S1-01 Welcome
│   ├── S1-02 Industry Trends
│   └── ...
├── Entry Campaign
├── Transition Rules
├── Exit Campaigns
└── Reporting
```

---

## Phase 3: Stream Configuration

### 3.1 Create Streams

For each stream needed:

1. Setup tab > Add Stream
2. Name stream: `01 - Awareness` (numbered for order)
3. Add description

Configure stream settings:

| Setting | Recommendation |
|---------|----------------|
| Cast cadence | Weekly or Bi-weekly |
| Day of week | Tuesday-Thursday |
| Time | 10am-2pm recipient time |
| Timezone | Recipient's time zone |

### 3.2 Add Content to Streams

For each stream:

1. Click stream > Add Content
2. Select email or program
3. Set activation date (or leave immediate)
4. Drag to order content

**Content Rules:**
- First 2-3 emails set the tone
- Vary content types (educational, case study, video)
- End with clear CTA
- Plan for exhaustion

### 3.3 Content Activation

Each content piece must be activated:

```javascript
mcp__marketo__engagement_stream_add_content({
  engagementProgramId: [ID],
  streamId: [STREAM_ID],
  contentId: [EMAIL_ID],
  position: 1
})
```

---

## Phase 4: Cadence Configuration

### 4.1 Set Cast Cadence

Configure when content is sent:

1. Streams tab > Click stream
2. Set Cadence button
3. Configure:

| Setting | Options | Recommendation |
|---------|---------|----------------|
| Frequency | Daily/Weekly/Monthly | Weekly |
| Day | Mon-Sun | Tue-Thu |
| Time | Hour:Minute | 10:00 AM |
| Timezone | Fixed or Recipient | Recipient |

```javascript
mcp__marketo__engagement_stream_set_cadence({
  engagementProgramId: [ID],
  streamId: [STREAM_ID],
  cadence: {
    recurrence: 'weekly',
    day: 'tuesday',
    time: '10:00',
    timezone: 'recipient'
  }
})
```

### 4.2 Cadence Best Practices

| Audience | Recommended Cadence | Notes |
|----------|---------------------|-------|
| Cold leads | Monthly | Don't overwhelm |
| Warm leads | Bi-weekly | Maintain engagement |
| Hot leads | Weekly | Keep momentum |
| Customers | Monthly | Stay connected |

### 4.3 Communication Limits

Engagement programs respect communication limits:

- Admin > Communication Limits
- Default limits apply
- Override per stream if needed

---

## Phase 5: Entry & Exit Rules

### 5.1 Entry Campaign

Create smart campaign for program entry:

**Campaign Name:** `Add to Nurture`

**Smart List:**
```
Filter 1: Form filled out
  OR
Filter 1: Lead Source = [Value]
  OR
Filter 1: Lead Score >= [Threshold]

AND

Filter 2: Not Member of Engagement Program
Filter 3: Unsubscribed = False
Filter 4: Email Address is not empty
```

**Flow:**
```
1. Change Engagement Program Status:
   - Program: [This Program]
   - New Status: Member

2. Change Engagement Program Cadence:
   - Program: [This Program]
   - Cadence: Normal

3. Change Engagement Program Stream:
   - Program: [This Program]
   - New Stream: Stream 1 (Awareness)
```

### 5.2 Exit Campaigns

Create exit triggers for various scenarios:

#### Exit: Became Customer
**Smart List:**
- Trigger: Lead Status changed to Customer

**Flow:**
1. Change Engagement Program Status: Exhausted
2. Add to List: Nurture Completers
3. Add to Customer Nurture (optional)

#### Exit: Unsubscribed
**Smart List:**
- Trigger: Unsubscribes from Email
- Program: is This Program

**Flow:**
1. Change Engagement Program Cadence: Paused

#### Exit: Sales Engaged
**Smart List:**
- Trigger: SFDC Activity Created (Call/Meeting)

**Flow:**
1. Change Engagement Program Cadence: Paused
2. Wait: 30 days
3. Choice: If still open opportunity
   - Keep paused
   - Else: Resume cadence

### 5.3 Pause Logic

Implement smart pause conditions:

**Pause Triggers:**
- Sales actively working lead
- Lead requested contact
- High-value activity detected

**Resume Conditions:**
- 30+ days since sales activity
- Opportunity closed lost
- Lead marked for re-nurture

---

## Phase 6: Transition Rules

### 6.1 Stream Transition Campaigns

Configure automatic progression between streams:

**Campaign Name:** `Transition: Awareness → Consideration`

**Smart List:**
```
Filter 1: Member of Engagement Program = Stream 1
Filter 2: Exhausted all content in Stream 1
  OR
Filter 2: Email Clicked: [Key CTA Email]
  OR
Filter 2: Lead Score >= [Threshold]
```

**Flow:**
```
1. Change Engagement Program Stream:
   - Program: [This Program]
   - New Stream: Stream 2 (Consideration)

2. Add Interesting Moment:
   - Type: Milestone
   - Description: "Progressed to Consideration stage"
```

### 6.2 Transition Rule Types

Configure rules in Setup > Transition Rules:

| Type | Trigger | Use Case |
|------|---------|----------|
| Exhaustion | All content consumed | Auto-progress |
| Engagement | Specific action | Behavior-based |
| Score | Threshold reached | Qualification |
| Time | Days in stream | Time-based |

```javascript
mcp__marketo__engagement_transition_rules({
  engagementProgramId: [ID],
  rules: [
    {
      fromStream: 'stream1',
      toStream: 'stream2',
      trigger: 'exhausted'
    }
  ]
})
```

### 6.3 Avoid Transition Gaps

Ensure no dead ends:

- [ ] All streams have transition rules
- [ ] Final stream has clear exit path
- [ ] Exhaustion handling configured

---

## Phase 7: Testing & Validation

### 7.1 Content Validation

For each email in the program:

- [ ] Email approved
- [ ] Subject line finalized
- [ ] Tokens rendering
- [ ] Links working
- [ ] Mobile responsive
- [ ] Unsubscribe present

### 7.2 Test Membership

Add test lead to program:

1. Find test lead
2. Add to engagement program
3. Change to normal cadence
4. Force cast (if available)

Verify:
- [ ] Lead added to correct stream
- [ ] First email sent
- [ ] Activity logged

### 7.3 Transition Testing

Test stream transitions:

1. Create test lead
2. Complete all content in Stream 1
3. Verify automatic transition to Stream 2
4. Check interesting moment logged

### 7.4 Exit Testing

Test exit scenarios:

- [ ] Unsubscribe pauses correctly
- [ ] Customer conversion exits
- [ ] Manual exit removes from cadence

---

## Phase 8: Activation & Monitoring

### 8.1 Activation Checklist

Before activating:

- [ ] All emails approved
- [ ] Streams configured with content
- [ ] Cadence set for each stream
- [ ] Entry campaign active
- [ ] Exit campaigns active
- [ ] Transition rules configured
- [ ] Test leads processed successfully

### 8.2 Activate Program

1. Setup tab > Engagement Program Actions
2. Activate Program
3. Confirm activation

**Post-Activation:**
- Program status: Active
- Casts will begin at next scheduled time
- Entry campaign adds new members

### 8.3 Monitoring Dashboard

Track these metrics:

| Metric | Definition | Target |
|--------|------------|--------|
| Members | Total in program | Growth |
| Exhausted | Completed all content | < 30% |
| Paused | On hold | < 10% |
| Cast Volume | Emails per cast | Stable |
| Engagement Score | Opens + clicks | Trending up |

### 8.4 Engagement Score

Monitor program engagement:

- High: 50+ (very engaged)
- Medium: 25-49 (moderately engaged)
- Low: < 25 (needs attention)

---

## Troubleshooting

### Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| No emails sending | Program inactive | Activate program |
| Wrong stream | Entry flow error | Check entry campaign |
| Skipping content | Content inactive | Activate content |
| No transition | Rule not met | Check trigger criteria |
| Low engagement | Content mismatch | Review content relevance |

### Diagnostic Queries

Check member status:
```javascript
mcp__marketo__program_get({
  programId: [ID],
  includeMembers: true
})
```

Review cast history:
- Engagement Program > Results tab
- Filter by date range
- Check email performance

---

## Quick Commands

```bash
# Create engagement program wizard
/create-nurture-program

# Pre-flight validation
/marketo-preflight engagement --target=PROGRAM_ID

# Monitor engagement metrics
/marketo-logs --filter=engagement --program=PROGRAM_ID

# Check API usage
/api-usage
```

---

## Related Resources

- **Agent**: `marketo-program-architect`
- **Script**: `scripts/lib/engagement-program-builder.js`
- **Command**: `/create-nurture-program`
- **Runbook**: `trigger-campaign-best-practices.md`

---

## Appendix: Content Planning Template

### Stream Content Plan

```markdown
## Stream: [Stream Name]
## Goal: [What this stream achieves]
## Audience: [Who receives this content]
## Cadence: [Weekly/Bi-weekly]

### Content Sequence

| # | Email Name | Subject | Type | CTA |
|---|------------|---------|------|-----|
| 1 | Welcome | Welcome to [Company] | Introduction | Learn more |
| 2 | Industry Trends | [Topic] trends for 2025 | Educational | Read article |
| 3 | Problem Focus | Are you facing [Problem]? | Problem-aware | Download guide |
| 4 | Solution Intro | How [Company] solves [Problem] | Solution | See demo |
| 5 | Case Study | How [Customer] achieved [Result] | Proof | View case study |

### Transition Criteria
- Progress to next stream when:
  - [ ] All content exhausted
  - [ ] Clicked CTA in Email 5
  - [ ] Score increased by 25+ points
```

---

## Appendix: Engagement Program Checklist

```markdown
## Program: [Name]
## Launch Date: [Date]
## Owner: [Name]

### Strategy
- [ ] Audience defined
- [ ] Goals documented
- [ ] Content mapped to journey
- [ ] Cadence determined

### Setup
- [ ] Program created
- [ ] Streams configured
- [ ] All emails created
- [ ] All emails approved

### Configuration
- [ ] Cadence set for each stream
- [ ] Entry campaign created
- [ ] Exit campaigns created
- [ ] Transition rules configured

### Testing
- [ ] Test lead added
- [ ] First email received
- [ ] Transition tested
- [ ] Exit tested

### Launch
- [ ] Program activated
- [ ] Entry campaign activated
- [ ] Monitoring plan in place
- [ ] First cast confirmed

### Go/No-Go
- [ ] **APPROVED TO LAUNCH**
```
