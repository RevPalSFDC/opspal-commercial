# Behavioral Scoring Rules

## Email Engagement Scoring

| Activity | Points | Trigger Type | Notes |
|----------|--------|--------------|-------|
| Email Delivered | 0 | - | No score |
| Email Opened | +1 | Trigger | First open only |
| Email Clicked | +3 | Trigger | Any link click |
| Email Clicked Multiple | +5 | Trigger | 3+ clicks same email |
| Unsubscribed | -50 | Trigger | Penalty |
| Hard Bounce | -25 | Trigger | Invalid email |
| Soft Bounce (3x) | -10 | Trigger | Delivery issues |

### Campaign Configuration

```yaml
Email Click Campaign (+3):
  Smart List:
    Trigger: Clicks Link in Email
      Email = is any
      Link = is any
    Filter: NOT Competitor (static list)

  Flow:
    1. Change Score
       Score Name = Behavior Score
       Change = +3
    2. Change Data Value
       Attribute = Last Engagement Date
       New Value = {{system.dateTime}}

  Schedule: Activated (runs on trigger)
```

## Web Activity Scoring

| Activity | Points | Trigger Type | Notes |
|----------|--------|--------------|-------|
| Visits Web Page | +1 | Trigger | General page |
| Visits Pricing Page | +10 | Trigger | High intent |
| Visits Demo Page | +15 | Trigger | High intent |
| Visits Careers Page | -20 | Trigger | Likely job seeker |
| Time on Site > 5 min | +5 | Trigger | Engaged visitor |
| Multiple Sessions/Week | +3 | Batch | Recurring interest |

### High-Intent Page Campaign

```yaml
Pricing Page Visit (+10):
  Smart List:
    Trigger: Visits Web Page
      Web Page = contains "/pricing"
    Filter: NOT Known Visitor in last 1 day

  Flow:
    1. Change Score
       Score Name = Behavior Score
       Change = +10
    2. Interesting Moment
       Type = Web
       Description = "Visited pricing page - high intent signal"

  Schedule: Activated (runs on trigger)
```

## Form Activity Scoring

| Activity | Points | Trigger Type | Notes |
|----------|--------|--------------|-------|
| Contact Us Form | +20 | Trigger | Direct inquiry |
| Demo Request | +25 | Trigger | Highest intent |
| Content Download | +10 | Trigger | Engaged |
| Newsletter Signup | +5 | Trigger | Low commitment |
| Webinar Registration | +15 | Trigger | Event interest |
| Free Trial Signup | +30 | Trigger | Product interest |

## Event/Content Scoring

| Activity | Points | Trigger Type | Notes |
|----------|--------|--------------|-------|
| Webinar Attended | +25 | Trigger | Active engagement |
| Webinar No-Show | 0 | Trigger | Registered counts |
| eBook Downloaded | +10 | Trigger | Content engagement |
| Case Study Downloaded | +15 | Trigger | Consideration stage |
| ROI Calculator Used | +20 | Trigger | Decision stage |
| Competitive Comparison | +15 | Trigger | Active evaluation |

## Content Scoring Hierarchy

Recommended tiered approach:

| Stage | Content Type | Points |
|-------|--------------|--------|
| Awareness | Blog, eBook | +10 |
| Interest | Whitepaper | +15 |
| Consideration | Case Study | +20 |
| Decision | ROI Calculator, Pricing | +25 |

## Program Structure

```
Lead Scoring Program (Default Type)
├── Behavioral Scoring
│   ├── Email Engagement
│   │   ├── 01-Email Opened (+1)
│   │   ├── 02-Email Clicked (+3)
│   │   ├── 03-Email Clicked Multiple (+5)
│   │   ├── 04-Unsubscribed (-50)
│   │   └── 05-Hard Bounce (-25)
│   ├── Web Activity
│   │   ├── 06-Web Page Visit (+1)
│   │   ├── 07-Pricing Page (+10)
│   │   ├── 08-Demo Page (+15)
│   │   └── 09-Careers Page (-20)
│   ├── Form Activity
│   │   ├── 10-Contact Us (+20)
│   │   ├── 11-Demo Request (+25)
│   │   └── 12-Content Download (+10)
│   └── Events
│       ├── 13-Webinar Attended (+25)
│       └── 14-Event Attended (+25)
```
