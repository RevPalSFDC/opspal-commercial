# Territory Hierarchy Design Patterns

## Pattern 1: Geographic

**Best For:**
- Field sales organizations
- Regional coverage models
- Travel optimization needed
- Localized market knowledge important

### Structure

```
Global
├── North America
│   ├── US West
│   │   ├── California
│   │   │   ├── San Francisco
│   │   │   └── Los Angeles
│   │   ├── Oregon
│   │   └── Washington
│   ├── US Central
│   │   ├── Texas
│   │   └── Illinois
│   ├── US East
│   │   ├── New York
│   │   └── Florida
│   └── Canada
│       ├── Ontario
│       └── British Columbia
├── EMEA
│   ├── UK & Ireland
│   ├── DACH (Germany, Austria, Switzerland)
│   └── France
└── APAC
    ├── ANZ (Australia, New Zealand)
    ├── Japan
    └── Southeast Asia
```

### Characteristics

| Aspect | Recommendation |
|--------|----------------|
| Depth | 3-5 levels |
| Territory Type | `Geography` or `Region` |
| Assignment Rules | BillingCountry, BillingState, BillingCity |
| Access Pattern | Read at top, Edit at leaf |

### Assignment Rule Example

```xml
<Territory2Rule>
  <developerName>US_West_California</developerName>
  <booleanFilter>1 AND 2</booleanFilter>
  <ruleItems>
    <field>BillingCountry</field>
    <operation>equals</operation>
    <value>United States</value>
  </ruleItems>
  <ruleItems>
    <field>BillingState</field>
    <operation>equals</operation>
    <value>California</value>
  </ruleItems>
</Territory2Rule>
```

### When to Choose

- Primary go-to-market is geographic
- Sales reps cover specific regions
- Local presence matters for customer relationships
- Travel time is a significant cost factor

---

## Pattern 2: Account-Based (Named Accounts)

**Best For:**
- Enterprise sales
- Strategic account focus
- Vertical/industry specialization
- High-touch sales motion

### Structure

```
Enterprise
├── Strategic Accounts
│   ├── Fortune 50
│   │   ├── Acme Corporation
│   │   └── Global Industries
│   └── Fortune 100
│       ├── Tech Giant Inc
│       └── Finance Corp
├── Major Accounts
│   ├── Financial Services
│   │   ├── Banking
│   │   └── Insurance
│   ├── Healthcare
│   │   ├── Hospitals
│   │   └── Pharma
│   └── Technology
│       ├── Software
│       └── Hardware
└── Growth Accounts
    ├── High Potential
    └── Emerging
```

### Characteristics

| Aspect | Recommendation |
|--------|----------------|
| Depth | 2-4 levels |
| Territory Type | `Account_Segment` or `Industry` |
| Assignment Rules | AnnualRevenue, Industry, Type |
| Access Pattern | All at top strategic, Edit elsewhere |

### Assignment Rule Example

```xml
<Territory2Rule>
  <developerName>Strategic_Fortune_50</developerName>
  <booleanFilter>1 AND 2</booleanFilter>
  <ruleItems>
    <field>AnnualRevenue</field>
    <operation>greaterThan</operation>
    <value>10000000000</value>
  </ruleItems>
  <ruleItems>
    <field>Type</field>
    <operation>equals</operation>
    <value>Customer;Prospect</value>
  </ruleItems>
</Territory2Rule>
```

### When to Choose

- Account size/potential is primary segmentation
- Dedicated resources for top accounts
- Industry expertise drives sales success
- Long sales cycles with multiple stakeholders

---

## Pattern 3: Hybrid (Geographic + Segment)

**Best For:**
- Large organizations with diverse models
- Multiple sales motions
- Need for geographic AND segment coverage
- Overlay team support

### Structure

```
Global
├── North America Enterprise
│   ├── NA Strategic
│   │   ├── NA Strategic East
│   │   └── NA Strategic West
│   └── NA Major
│       ├── NA Major East
│       └── NA Major West
├── North America Commercial
│   ├── US West Commercial
│   │   ├── CA Commercial
│   │   └── OR/WA Commercial
│   └── US East Commercial
│       ├── NY Commercial
│       └── FL Commercial
├── EMEA Enterprise
│   └── ... (similar structure)
└── EMEA Commercial
    └── ... (similar structure)
```

### Characteristics

| Aspect | Recommendation |
|--------|----------------|
| Depth | 3-5 levels |
| Territory Types | Multiple (`Region`, `Segment`, `Named`) |
| Assignment Rules | AnnualRevenue + Geography |
| Access Pattern | Varies by branch |

### Assignment Rule Example

```xml
<Territory2Rule>
  <developerName>NA_Enterprise_West</developerName>
  <booleanFilter>(1 AND 2) AND (3 OR 4)</booleanFilter>
  <ruleItems>
    <field>AnnualRevenue</field>
    <operation>greaterThan</operation>
    <value>50000000</value>
  </ruleItems>
  <ruleItems>
    <field>BillingCountry</field>
    <operation>equals</operation>
    <value>United States;Canada</value>
  </ruleItems>
  <ruleItems>
    <field>BillingState</field>
    <operation>equals</operation>
    <value>California;Oregon;Washington</value>
  </ruleItems>
  <ruleItems>
    <field>BillingCountry</field>
    <operation>equals</operation>
    <value>Canada</value>
  </ruleItems>
</Territory2Rule>
```

### When to Choose

- Organization has both enterprise and commercial teams
- Different sales motions by segment
- Geographic coverage still matters
- Need flexibility for growth/change

---

## Pattern 4: Product/Solution

**Best For:**
- Solution selling
- Product specialists
- Overlay/specialist teams
- Cross-functional sales

### Structure

```
Solutions
├── Cloud Platform
│   ├── Infrastructure
│   │   ├── Compute
│   │   └── Storage
│   └── Platform Services
│       ├── Database
│       └── AI/ML
├── Applications
│   ├── CRM
│   ├── ERP
│   └── HCM
├── Security
│   ├── Identity
│   ├── Data Protection
│   └── Threat Detection
└── Services
    ├── Implementation
    └── Managed Services
```

### Characteristics

| Aspect | Recommendation |
|--------|----------------|
| Depth | 2-4 levels |
| Territory Type | `Product` or `Solution` |
| Assignment Rules | Product interest, Industry |
| Access Pattern | Read at top, Edit at specialty |

### When to Choose

- Product expertise is the differentiator
- Specialists support generalist reps
- Complex solution portfolio
- Multi-product cross-sell/upsell strategy

---

## Pattern 5: Customer Lifecycle

**Best For:**
- Customer success focus
- Renewal/expansion model
- Stage-based coverage

### Structure

```
Customer Lifecycle
├── New Business
│   ├── Inbound Leads
│   └── Outbound Prospecting
├── Onboarding
│   ├── Implementation
│   └── Training
├── Growth
│   ├── Upsell
│   └── Cross-sell
└── Retention
    ├── Renewals
    └── At-Risk
```

### When to Choose

- Strong focus on customer lifecycle
- Different teams for acquisition vs. retention
- Expansion revenue is significant
- Customer success is a strategic priority

---

## Territory Type Priority Guidelines

Priority determines assignment when account matches multiple rules:

| Priority | Type | Example |
|----------|------|---------|
| 1 (Highest) | Named/Strategic | Specific named accounts |
| 2-3 | Enterprise Segment | Fortune 500, Large Enterprise |
| 4-5 | Mid-Market | Growth, Core |
| 6-7 | Commercial/SMB | Small Business |
| 8-9 | Geographic | Region, Country |
| 10+ (Lowest) | Overlay | Specialist, Product |

**Rule:** Lower priority number = higher precedence

---

## Access Level Design by Pattern

### Geographic Pattern

| Level | Account | Opportunity | Case |
|-------|---------|-------------|------|
| Global | Read | Read | Read |
| Region | Edit | Read | Read |
| Country | Edit | Edit | Read |
| State/City | Edit | Edit | Edit |

### Account-Based Pattern

| Level | Account | Opportunity | Case |
|-------|---------|-------------|------|
| Strategic | All | Edit | Edit |
| Major | Edit | Edit | Edit |
| Growth | Edit | Edit | Read |

### Hybrid Pattern

| Level | Account | Opportunity | Case |
|-------|---------|-------------|------|
| Enterprise Root | Read | Read | Read |
| Commercial Root | Read | Read | Read |
| Region + Segment | Edit | Edit | Read |
| Leaf Territory | Edit | Edit | Edit |

---

## Multi-Assignment Considerations

Accounts can be in multiple territories. Use cases:

1. **Geographic + Overlay**: Account in regional territory + product specialist territory
2. **Primary + Secondary**: Main territory + backup coverage territory
3. **Shared Accounts**: Large accounts with multiple rep coverage

### Conflict Resolution

When account in multiple territories:
- Territory2Type.Priority determines "winning" territory for reports
- All assigned users get access per their territory's access levels
- Opportunity Territory2Id typically set to highest priority territory

---

## Design Decision Checklist

- [ ] What is the primary sales motion? (geographic, account, solution)
- [ ] How deep should the hierarchy be? (2-5 levels)
- [ ] What territory types are needed?
- [ ] How should assignment rules prioritize?
- [ ] What access levels at each tier?
- [ ] Will accounts be in multiple territories?
- [ ] How will overlay teams be handled?
- [ ] How will the structure evolve/scale?
