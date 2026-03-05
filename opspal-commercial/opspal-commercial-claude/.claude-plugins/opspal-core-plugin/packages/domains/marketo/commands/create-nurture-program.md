---
description: Interactive wizard to create Marketo engagement programs (nurture streams)
argument-hint: "[--type=drip|lifecycle|onboarding] [--folder=id]"
---

# Create Nurture Program Wizard

Interactive wizard to create Marketo engagement programs (nurture streams).

## Usage

```
/create-nurture-program [--type=drip|lifecycle|onboarding] [--folder=id]
```

## Parameters

- `--type` - Nurture pattern:
  - `drip` - Time-based content delivery
  - `lifecycle` - Stage-based progression
  - `onboarding` - New customer/user onboarding
- `--folder` - Destination folder ID

## Wizard Steps

### Step 1: Program Setup
- Program name and description
- Engagement program channel
- Folder location
- Success criteria definition

### Step 2: Stream Architecture
- Number of streams
- Stream purposes
- Transition rules between streams

### Step 3: Content Planning
- Content for each stream
- Cadence configuration
- Content exhaustion strategy

### Step 4: Entry & Exit Rules
- Smart list for program entry
- Transition triggers between streams
- Exit criteria and graduation

### Step 5: Testing & Activation
- Stream testing
- Transition testing
- Activation schedule

## Example Session

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🌱 CREATE NURTURE PROGRAM WIZARD
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## Step 1: Program Setup

Program Type: Lifecycle Nurture
Program Name: 2025 - Lead Nurture - Lifecycle
Channel: Nurture
Folder: Marketing Activities > Nurture Programs

Success Metric: Program status = Engaged or MQL

## Step 2: Stream Architecture

Stream 1: Awareness
  Purpose: Top-of-funnel educational content
  Target: New leads, score < 30
  Content: Blog posts, industry guides

Stream 2: Consideration
  Purpose: Solution-focused content
  Target: Engaged leads, score 30-60
  Content: Case studies, webinars, comparisons

Stream 3: Decision
  Purpose: Conversion-focused content
  Target: Hot leads, score > 60
  Content: Demos, trials, pricing, testimonials

Transition Rules:
  - Awareness → Consideration: Score >= 30
  - Consideration → Decision: Score >= 60 OR Requested Demo
  - Any → Exit: Becomes Customer OR Unsubscribed

## Step 3: Content Configuration

Stream 1: Awareness (6 pieces)
| Order | Content | Type | Wait |
|-------|---------|------|------|
| 1 | Welcome to [Company] | Email | 0 |
| 2 | Industry Trends 2025 | Email | 7 days |
| 3 | Getting Started Guide | Email | 7 days |
| 4 | Best Practices eBook | Email | 7 days |
| 5 | Customer Success Story | Email | 7 days |
| 6 | Expert Webinar Invite | Email | 7 days |

Stream 2: Consideration (5 pieces)
| Order | Content | Type | Wait |
|-------|---------|------|------|
| 1 | Solution Overview | Email | 0 |
| 2 | ROI Calculator | Email | 5 days |
| 3 | Comparison Guide | Email | 5 days |
| 4 | Customer Testimonials | Email | 5 days |
| 5 | Live Demo Invitation | Email | 5 days |

Stream 3: Decision (4 pieces)
| Order | Content | Type | Wait |
|-------|---------|------|------|
| 1 | Free Trial Offer | Email | 0 |
| 2 | Implementation Guide | Email | 3 days |
| 3 | Pricing & Packages | Email | 3 days |
| 4 | Talk to Sales | Email | 3 days |

Cadence: Weekly casts (Tuesdays at 10 AM)
Content Exhaustion: Move to next available content

## Step 4: Entry & Exit Rules

Entry Smart List:
  Filters:
  1. Lead Status = New OR Marketing Qualified
  2. Email Address is not empty
  3. Unsubscribed = False
  4. Not Member of Program

Entry Trigger Campaign:
  Trigger: Lead is Created OR Score is Changed
  Filter: Matches entry criteria
  Flow: Add to Engagement Program (Stream: Awareness)

Exit Criteria:
  1. Becomes Customer → Exit and Add to Onboarding Program
  2. Disqualified → Exit and suppress
  3. Unsubscribed → Exit
  4. No engagement 90 days → Pause membership

## Step 5: Testing & Activation

Pre-Launch Checklist:
✅ All emails approved
✅ Stream transitions configured
✅ Entry campaign validated
✅ Exit criteria set
✅ Cadence scheduled
✅ Content exhaustion configured

Test Plan:
1. Add test lead to each stream
2. Verify email delivery
3. Test transition triggers manually
4. Validate exit criteria

Activation Schedule:
- Test Period: 7 days with internal leads
- Soft Launch: 100 leads pilot
- Full Launch: Open to all qualifying leads

Ready to create program?
[Create & Test] [Save as Draft] [Cancel]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## Nurture Patterns

### Drip Pattern
```
Lead Enters → Email 1 → Wait → Email 2 → Wait → Email 3 → ...
- Fixed sequence
- Time-based pacing
- Best for: Product education, onboarding
```

### Lifecycle Pattern
```
Awareness Stream ──(score)──→ Consideration Stream ──(score)──→ Decision Stream
- Stage-based content
- Behavior-driven transitions
- Best for: B2B lead nurturing
```

### Onboarding Pattern
```
Day 1 → Day 3 → Day 7 → Day 14 → Day 30
- Date-based sequence
- Product adoption focus
- Best for: New customer/user activation
```

## Best Practices

1. **Content**: Plan 4-6 pieces per stream minimum
2. **Cadence**: Weekly for nurture, more frequent for onboarding
3. **Transitions**: Base on behavior, not just time
4. **Exit Criteria**: Always define when leads should leave
5. **Testing**: Run 7-day pilot before full launch
6. **Monitoring**: Track stream health weekly

## Related Agent

This command uses: `marketo-program-architect`

## Related Commands

- `/marketo-audit --focus=programs` - Audit program performance
- `/create-smart-campaign` - Create supporting campaigns
