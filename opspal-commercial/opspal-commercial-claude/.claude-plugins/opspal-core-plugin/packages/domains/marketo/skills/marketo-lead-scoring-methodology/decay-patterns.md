# Score Decay Patterns

## Inactivity Decay Schedule

| Inactivity Period | Points | Notes |
|-------------------|--------|-------|
| 30 days no activity | -5 | Light decay |
| 60 days no activity | -10 | Medium decay |
| 90 days no activity | -15 | Heavy decay |
| 180 days no activity | -25 | Significant decay |

## 30-Day Decay Campaign

```yaml
30-Day Inactivity Decay:
  Smart List:
    Filter: Not Was Sent Email in past 30 days
    AND: Not Opened Email in past 30 days
    AND: Not Visited Web Page in past 30 days
    AND: Not Filled Out Form in past 30 days
    AND: Behavior Score > 0
    AND: NOT in Static List "Recently Decayed 30"

  Flow:
    1. Change Score
       Score Name = Behavior Score
       Change = -5
    2. Add to List = "Recently Decayed 30"
    3. Wait = 30 days
    4. Remove from List = "Recently Decayed 30"

  Schedule: Weekly on Monday 5:00 AM (batch)
```

## 90-Day Decay Campaign

```yaml
90-Day Inactivity Decay:
  Smart List:
    Filter: Not Opened Email in past 90 days
    AND: Not Visited Web Page in past 90 days
    AND: Not Filled Out Form in past 90 days
    AND: Behavior Score > 0
    AND: NOT in Static List "Recently Decayed 90"

  Flow:
    1. Change Score
       Score Name = Behavior Score
       Change = -15
    2. Add to List = "Recently Decayed 90"
    3. Interesting Moment
       Type = Milestone
       Description = "90-day inactivity - significant decay applied"
    4. Wait = 90 days
    5. Remove from List = "Recently Decayed 90"

  Schedule: Weekly on Monday 6:00 AM (batch)
```

## Decay Program Structure

```
Lead Scoring Program
└── Score Decay
    ├── 40-30 Day Decay (-5)
    ├── 41-60 Day Decay (-10)
    └── 42-90 Day Decay (-15)
```

## Decay Best Practices

### Do's

1. **Use static lists** to prevent multiple decay applications
2. **Stagger batch runs** to avoid queue congestion
3. **Set minimum score floors** (don't decay below 0)
4. **Log interesting moments** for decay milestones
5. **Exclude recent MQLs** from aggressive decay

### Don'ts

1. **Don't decay demographic scores** - fit doesn't change
2. **Don't apply decay during active nurtures** - confuses engagement signals
3. **Don't use daily decay** - too aggressive
4. **Don't forget wait steps** between decay cycles

## Decay Exclusions

Exclude these leads from decay:

```yaml
Decay Exclusion Criteria:
  - Lead Status in [MQL, SQL, Opportunity]
  - Lead is in Active Nurture Program
  - Lead Created in past 30 days
  - Lead is Customer
```

## Re-Engagement Recovery

When decayed leads re-engage:

```yaml
Re-Engagement Detection:
  Trigger: Opens Email
  OR Trigger: Visits Web Page
  OR Trigger: Fills Out Form

  Filter: In Static List "Recently Decayed"

  Flow:
    1. Remove from List "Recently Decayed 30"
    2. Remove from List "Recently Decayed 90"
    3. Interesting Moment
       Description = "Re-engaged after inactivity period"
```

## Decay Impact on MQL

When scores decay below MQL threshold:

```yaml
MQL Decay Handling:
  Scenario: Lead was MQL, now decayed below threshold

  Check:
    - Current Score < MQL Threshold
    - Lead Status = MQL
    - Not yet SQL or Opportunity

  Actions:
    1. Change Lead Status: Recycled
    2. Remove from Sales Queue
    3. Return to Nurture Program
    4. Log: MQL Decayed
```
