# Funnel Metrics Definitions

## TOFU (Top of Funnel) Metrics

### Website Traffic
```
Definition: Total unique visitors to website
Source: Google Analytics, HubSpot
Formula: Sum of unique sessions in period

Segments:
- Organic Traffic: From search engines
- Paid Traffic: From advertising
- Referral Traffic: From other sites
- Direct Traffic: Direct URL entry
- Social Traffic: From social platforms
```

### Lead Volume
```
Definition: New leads generated in period
Source: CRM, Marketing Automation
Formula: Count of new lead records created

Quality Tiers:
- Hot Lead: High fit + high engagement
- Warm Lead: Medium fit or engagement
- Cold Lead: Low fit and engagement
```

### Connect Rate
```
Definition: Percentage of outreach attempts that result in conversation
Formula: Conversations / Outreach Attempts × 100

Benchmark: 15% (B2B SaaS average)

Variables:
- Channel (phone, email, social)
- Time of day
- Lead source quality
- Message personalization
```

### Cost Per Lead (CPL)
```
Definition: Average cost to acquire one lead
Formula: Total Marketing Spend / Total Leads Generated

Benchmark by Industry:
- SaaS: $30-200
- Manufacturing: $50-300
- Professional Services: $100-400
- Healthcare: $150-500
```

## MOFU (Middle of Funnel) Metrics

### Marketing Qualified Lead (MQL)
```
Definition: Lead meeting marketing qualification criteria
Criteria Examples:
- Fit score >= threshold
- Engagement score >= threshold
- Specific actions taken (demo request, pricing view)

Formula: Count of leads with MQL status
```

### Sales Qualified Lead (SQL)
```
Definition: Lead accepted by sales as qualified opportunity
Criteria Examples:
- BANT qualified (Budget, Authority, Need, Timeline)
- Discovery call completed
- Sales acceptance

Formula: Count of leads with SQL status
```

### Conversation to Meeting Rate
```
Definition: Percentage of conversations resulting in scheduled meeting
Formula: Meetings Scheduled / Conversations × 100

Benchmark: 23% (B2B average)

Optimization Levers:
- Call script effectiveness
- Rep skills
- Lead quality
- Value proposition clarity
```

### Meeting to SQL Rate
```
Definition: Percentage of meetings resulting in qualified opportunity
Formula: SQLs Created / Meetings Held × 100

Benchmark: 55% (B2B average)

Optimization Levers:
- Discovery process
- Qualification criteria
- Lead quality
- Rep preparation
```

### Sales Cycle Length
```
Definition: Average time from lead to closed deal
Formula: Sum of all deal durations / Number of deals

Benchmark by Deal Size:
- <$10K: 14-30 days
- $10K-50K: 30-90 days
- $50K-100K: 90-180 days
- >$100K: 180+ days
```

## BOFU (Bottom of Funnel) Metrics

### Opportunity Volume
```
Definition: Active opportunities in pipeline
Formula: Count of open opportunities

Pipeline Coverage Ratio:
Formula: Total Pipeline Value / Quota
Target: 3x-4x quota
```

### Win Rate
```
Definition: Percentage of opportunities that close-won
Formula: Closed Won / (Closed Won + Closed Lost) × 100

Benchmark: 25% (B2B average)

Segments:
- By lead source
- By deal size
- By product line
- By sales rep
```

### Average Deal Size
```
Definition: Mean value of closed-won deals
Formula: Total Closed Won Revenue / Number of Deals

Analysis:
- Compare to target ACV
- Trend over time
- By segment/product
```

### Deal Velocity
```
Definition: Speed at which deals move through pipeline
Formula: (Win Rate × Deal Count × Average Deal Size) / Sales Cycle

Higher velocity = healthier pipeline
```

### Close Rate by Stage
```
Definition: Conversion rate at each pipeline stage
Formula: Opportunities advancing / Total at stage × 100

Example Pipeline:
- Discovery → Qualification: 70%
- Qualification → Demo: 65%
- Demo → Proposal: 60%
- Proposal → Negotiation: 75%
- Negotiation → Closed Won: 85%
```

## Cross-Stage Metrics

### Lead-to-Customer Rate
```
Definition: Percentage of leads that become customers
Formula: New Customers / Total New Leads × 100

Benchmark: 1-3% (B2B average)
```

### Cost Per Acquisition (CPA)
```
Definition: Total cost to acquire one customer
Formula: Total S&M Spend / New Customers

Components:
- Marketing spend
- Sales compensation
- Tools and technology
- Overhead
```

### Lifetime Value (LTV)
```
Definition: Total revenue from customer relationship
Formula: Average Revenue Per Account × Gross Margin × Customer Lifetime

Ratio Target:
LTV:CAC > 3:1
```

### Funnel Efficiency
```
Definition: Overall funnel health score
Formula: Weighted average of stage conversion rates

Calculation:
funnel_efficiency = (
  connect_rate × 0.15 +
  meeting_rate × 0.20 +
  sql_rate × 0.25 +
  opportunity_rate × 0.20 +
  win_rate × 0.20
) × 100
```
