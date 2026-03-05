---
description: Interactive wizard to create Marketo email programs with A/B testing
argument-hint: "[--template=id] [--folder=id]"
---

# Create Email Program Wizard

Interactive wizard to create Marketo email programs with A/B testing and scheduling.

## Usage

```
/create-email-program [--template=id] [--folder=id]
```

## Parameters

- `--template` - Email template ID to use
- `--folder` - Destination folder ID

## Wizard Steps

### Step 1: Program Setup
- Program name (with date and campaign identifier)
- Description and goals
- Channel selection
- Folder location

### Step 2: Audience Configuration
- Smart list criteria
- Suppression lists
- Communication limits check

### Step 3: Email Asset Creation
- Select or create email template
- Configure email content
- Set subject line and from address
- Add tokens for personalization

### Step 4: A/B Test Setup (Optional)
- Test type: Subject line, From address, or Content
- Sample size and winner criteria
- Test duration

### Step 5: Schedule Configuration
- Send date and time
- Recipient timezone handling
- Head start settings

### Step 6: Review & Approve
- Program checklist validation
- Compliance review
- Approval workflow

## Example Session

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📧 CREATE EMAIL PROGRAM WIZARD
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## Step 1: Program Setup

Program Name: 2025-12-Q4 Newsletter - December Edition
Channel: Email Blast
Description: Monthly newsletter for Q4 2025

Folder: Marketing Activities > Newsletters > 2025

## Step 2: Audience

Smart List:
  Filters:
  1. Email Address is not empty
  2. Unsubscribed = False
  3. Email Invalid = False
  4. Member of List: Newsletter Subscribers

Suppression:
  - Recent Email Sends (last 3 days)
  - Hard Bounces List

Estimated Audience: 25,450 leads

⚠️ Communication Limit Check:
   - 2,340 leads hit weekly limit
   - Will be automatically suppressed

## Step 3: Email Asset

Template: Standard Newsletter Template (ID: 1234)
From Name: {{company.name}}
From Email: newsletter@company.com
Reply-To: marketing@company.com

Subject Line: December Newsletter: Year in Review
Preview Text: Check out our top stories from 2025...

Tokens Used:
  - {{lead.firstName}}
  - {{lead.company}}
  - {{my.newsletterDate}}

✅ All tokens have default values

## Step 4: A/B Test

Test Type: Subject Line
Sample Size: 15% (3,818 leads)
Winner Criteria: Highest Open Rate
Test Duration: 4 hours

Variant A: December Newsletter: Year in Review
Variant B: 🎄 December Newsletter: Year in Review
Variant C: Your December Newsletter is Here!

## Step 5: Schedule

Send Date: December 15, 2025
Send Time: 10:00 AM
Timezone: Recipient's timezone

Head Start: Enabled (for large sends)

Timeline:
  - A/B Test starts: 6:00 AM
  - Winner selected: 10:00 AM
  - Full send: 10:00 AM onwards

## Step 6: Review & Approve

Program Checklist:
✅ Email approved
✅ Smart list configured
✅ Suppression lists added
✅ A/B test configured
✅ Schedule set
✅ Communication limits checked

Compliance:
✅ Unsubscribe link present
✅ Physical address present
✅ From address valid
✅ Subject line not deceptive

Ready to approve and schedule?
[Approve & Schedule] [Save as Draft] [Cancel]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## A/B Test Types

| Test Type | What's Tested | Winner Criteria Options |
|-----------|---------------|------------------------|
| Subject Line | Different subjects | Open Rate, Click Rate |
| From Address | Sender name/email | Open Rate, Click Rate |
| Whole Email | Different content | Open Rate, Click Rate, Engagement Score |
| Send Time | Different times | Open Rate |

## Best Practices

1. **Naming**: Include date and campaign identifier
2. **Audience**: Always check communication limits
3. **Suppression**: Include recent sends and bounces
4. **A/B Testing**: Use 10-15% sample size, 4+ hour duration
5. **Scheduling**: Send during business hours in recipient timezone
6. **Tokens**: Always set default values

## Related Agent

This command uses: `marketo-email-specialist`

## Related Commands

- `/marketo-preflight email-send` - Validate before sending
- `/marketo-audit --focus=emails` - Audit email performance
