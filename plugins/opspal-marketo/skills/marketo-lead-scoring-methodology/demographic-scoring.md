# Demographic Scoring Rules

## Job Title Scoring

| Title Pattern | Points | Notes |
|---------------|--------|-------|
| C-Level (CEO, CFO, CTO) | +15 | Decision maker |
| VP, Vice President | +12 | Executive buyer |
| Director | +10 | Influencer/buyer |
| Manager | +7 | Influencer |
| Senior/Lead | +5 | Practitioner |
| Analyst, Specialist | +3 | User |
| Student, Intern | -10 | Not a buyer |
| Consultant | -5 | May not buy directly |

### Batch Campaign Configuration

```yaml
Job Title Scoring Campaign:
  Smart List:
    Filter: Job Title contains
      "CEO" OR "CTO" OR "CFO" OR "Chief"
    AND Demographic Score < 15
    AND Lead was Created in past 7 days

  Flow:
    1. Change Score
       Score Name = Demographic Score
       Change = +15

  Schedule: Daily at 6:00 AM (batch)
```

## Industry Scoring

| Industry | Points | Notes |
|----------|--------|-------|
| Target Industry 1 | +10 | Primary ICP |
| Target Industry 2 | +10 | Primary ICP |
| Adjacent Industry | +5 | Secondary fit |
| Non-target Industry | 0 | Neutral |
| Competitor Industry | -100 | Exclude |

## Company Size Scoring

| Size | Points | Notes |
|------|--------|-------|
| Enterprise (1000+) | +10 | Target segment |
| Mid-Market (100-999) | +8 | Target segment |
| SMB (20-99) | +5 | Secondary |
| Small (1-19) | 0 | May not be fit |
| Unknown | 0 | Need data |

## Geographic Scoring

| Region | Points | Notes |
|--------|--------|-------|
| Primary Territory | +5 | Active sales coverage |
| Secondary Territory | +3 | Some coverage |
| No Coverage | 0 | Neutral |
| Restricted Region | -100 | Compliance exclude |

## Negative Scoring Rules

### Disqualification Triggers

| Condition | Points | Action |
|-----------|--------|--------|
| Competitor Email Domain | -100 | Mark as competitor |
| Personal Email (gmail, etc.) | -5 | B2C indicator |
| Unsubscribed | -50 | Not engaged |
| Hard Bounce | -25 | Bad data |
| Spam Complaint | -100 | Exclude |
| Job Seeker Activity | -20 | Visited careers |
| Existing Customer | 0 | Route differently |

### Competitor Detection Campaign

```yaml
Competitor Detection Campaign:
  Smart List:
    Trigger: Data Value Changes
      Attribute = Email Address
    Filter: Email Address contains
      "@competitor1.com" OR "@competitor2.com"

  Flow:
    1. Change Score
       Score Name = Demographic Score
       Change = -100
    2. Change Data Value
       Attribute = Lead Status
       New Value = Competitor
    3. Add to List: Competitors

  Schedule: Activated (trigger)
```

## Program Structure (Demographic)

```
Lead Scoring Program (continued)
├── Demographic Scoring
│   ├── 20-Job Title Scoring (Batch)
│   ├── 21-Industry Scoring (Batch)
│   ├── 22-Company Size Scoring (Batch)
│   └── 23-Geography Scoring (Batch)
└── Negative Scoring
    ├── 30-Competitor Detection (-100)
    ├── 31-Personal Email (-5)
    └── 32-Disqualification Rules
```

## Data Enrichment Integration

For leads missing demographic data:

1. **Enrichment Queue**: Flag leads missing key fields
2. **Third-Party Integration**: Use enrichment providers
3. **Re-Scoring**: Trigger demographic scoring after enrichment

```yaml
Post-Enrichment Scoring:
  Trigger: Data Value Changes
    Attribute = Company Size (enriched)

  Flow:
    1. Request Campaign = Company Size Scoring
```
