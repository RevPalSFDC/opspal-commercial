# Lead Routing Rules

## Assignment Methods

### Round-Robin Assignment

```yaml
Round Robin Configuration:
  queue_name: MQL_Assignment_Queue
  assignment_field: Lead Owner ID

  members:
    - name: Sales Rep 1
      sfdc_id: 005xx000001
      weight: 1
      max_daily: 20
      territories: [West, Southwest]

    - name: Sales Rep 2
      sfdc_id: 005xx000002
      weight: 1
      max_daily: 20
      territories: [East, Southeast]

    - name: Sales Rep 3
      sfdc_id: 005xx000003
      weight: 0.5  # Part-time or ramping
      max_daily: 10
      territories: [Central]

  rules:
    - skip_on_pto: true
    - cap_enforcement: soft  # warn vs block
    - timezone_aware: true
```

### Territory-Based Assignment

```yaml
Territory Rules:
  - territory: West
    criteria:
      - State: in [CA, WA, OR, NV, AZ]
    owner: 005xx000001
    fallback: Round Robin

  - territory: East
    criteria:
      - State: in [NY, NJ, PA, MA, CT]
    owner: 005xx000002
    fallback: Round Robin

  - territory: Enterprise
    criteria:
      - Number of Employees: >= 1000
    owner: Enterprise_Team_Queue
    fallback: null  # Must be routed to enterprise

  - territory: Default
    criteria:
      - always: true
    owner: Round Robin Queue
```

### Account-Based Assignment

```yaml
Account-Based Rules:
  # Named accounts - match to account owner
  named_accounts:
    match_field: Company Name
    sfdc_lookup: Account.Name
    assignment: Account.Owner.Id
    priority: 1

  # Industry specialization
  industry_routing:
    - industry: Healthcare
      owner: Healthcare_Specialist_ID
      priority: 2

    - industry: Financial Services
      owner: FinServ_Specialist_ID
      priority: 2

  # Default assignment
  default:
    method: territory_round_robin
    priority: 3
```

## Assignment Flow Logic

### Decision Tree

```
1. Is this an existing SFDC Lead/Contact?
   ├── YES → Sync updates to existing owner
   └── NO → Continue to assignment

2. Is Company a Named Account?
   ├── YES → Assign to Account Owner
   └── NO → Continue

3. Is Lead Enterprise segment?
   ├── YES → Assign to Enterprise Queue
   └── NO → Continue

4. Match Territory by State/Country?
   ├── YES → Assign to Territory Owner
   └── NO → Continue

5. Match Industry Specialization?
   ├── YES → Assign to Specialist
   └── NO → Round Robin default queue
```

### Assignment Campaign Logic

```yaml
Campaign: Lead Assignment Router
Type: Trigger Campaign

Smart List:
  Trigger: Lead Status is changed
  Filter: Lead Status = MQL
  Filter: Lead Owner is empty OR Lead Owner = Default Queue

Flow Steps:
  1. Choice: Company is Named Account
     - Yes: Change Owner to SFDC Account Owner
     - No: Go to next step

  2. Choice: Number of Employees >= 1000
     - Yes: Change Owner to Enterprise Queue
     - No: Go to next step

  3. Choice: State in [CA, WA, OR, NV, AZ]
     - Yes: Change Owner to West Rep
     - No: Go to next step

  4. Choice: State in [NY, NJ, PA, MA, CT]
     - Yes: Change Owner to East Rep
     - No: Go to next step

  5. Default: Change Owner to Round Robin Queue
```

## Capacity Management

### Rep Capacity Rules

```javascript
const capacityManagement = {
  // Daily caps by rep
  dailyCaps: {
    SDR: 25,
    AE_SMB: 15,
    AE_MM: 10,
    AE_ENT: 5
  },

  // Queue overflow handling
  overflow: {
    action: 'next_in_queue',
    notify: 'manager',
    threshold: 0.9  // 90% of cap
  },

  // PTO handling
  outOfOffice: {
    check_calendar: true,
    redistribute: true,
    notify_admin: true
  }
};
```

### Load Balancing

```yaml
Load Balancing Rules:
  method: weighted_round_robin

  factors:
    - current_open_leads: weight -0.3
    - weekly_capacity_remaining: weight 0.4
    - territory_match: weight 0.3

  rebalancing:
    frequency: daily
    threshold: 20%  # Variance before rebalance
    notification: manager
```

## Assignment Verification

### Post-Assignment Checks

```yaml
Verification Campaign:
  Trigger: Lead Owner is changed
  Wait: 5 minutes

  Checks:
    - Owner exists in SFDC: Alert if not
    - Owner is active: Reassign if inactive
    - Owner has capacity: Log if over cap

  Actions:
    - Log assignment to Interesting Moments
    - Update Assignment Timestamp field
    - Trigger Sales Alert if all checks pass
```
