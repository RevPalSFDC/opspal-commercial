# State Diagram Syntax

## Basic Syntax

### Simple States
```mermaid
stateDiagram-v2
    [*] --> Active
    Active --> Inactive
    Inactive --> Active
    Inactive --> [*]
```

### State Descriptions
```mermaid
stateDiagram-v2
    state "Long State Name" as LSN
    [*] --> LSN
    LSN --> [*]
```

### Transitions with Labels
```mermaid
stateDiagram-v2
    [*] --> Draft
    Draft --> Review : Submit
    Review --> Published : Approve
    Review --> Draft : Reject
    Published --> [*]
```

## Advanced Syntax

### Composite States
```mermaid
stateDiagram-v2
    [*] --> Active

    state Active {
        [*] --> Working
        Working --> Paused
        Paused --> Working
    }

    Active --> Inactive
    Inactive --> [*]
```

### Fork and Join
```mermaid
stateDiagram-v2
    [*] --> fork_state

    state fork_state <<fork>>
    fork_state --> State1
    fork_state --> State2

    state join_state <<join>>
    State1 --> join_state
    State2 --> join_state

    join_state --> [*]
```

### Choice (Decision)
```mermaid
stateDiagram-v2
    [*] --> Evaluate

    state Evaluate <<choice>>
    Evaluate --> Approved : if amount < $10K
    Evaluate --> Review : if amount >= $10K

    Approved --> [*]
    Review --> Approved : Approval granted
    Review --> Rejected : Approval denied
    Rejected --> [*]
```

### Notes
```mermaid
stateDiagram-v2
    [*] --> Active
    Active --> Inactive

    note right of Active
        System is operational
        All services running
    end note

    note left of Inactive
        System in maintenance
        No new requests
    end note
```

## Salesforce State Diagrams

### Lead Lifecycle
```mermaid
stateDiagram-v2
    [*] --> Open

    state Open {
        [*] --> New
        New --> Working
        Working --> Contacted
    }

    state Qualified {
        [*] --> Nurturing
        Nurturing --> Qualified_Hot
        Nurturing --> Unqualified
    }

    Open --> Qualified : Qualify
    Qualified_Hot --> Converted
    Unqualified --> [*]
    Converted --> [*]

    note right of Converted
        Creates Account,
        Contact, Opportunity
    end note
```

### Opportunity Stages
```mermaid
stateDiagram-v2
    [*] --> Qualification

    state "Active Pipeline" as AP {
        Qualification --> Discovery
        Discovery --> Proposal
        Proposal --> Negotiation
    }

    state "Closed" as C {
        Closed_Won
        Closed_Lost
    }

    Negotiation --> Closed_Won : Win
    Negotiation --> Closed_Lost : Lose

    state Closed_Won <<choice>>
    state Closed_Lost <<choice>>

    Closed_Won --> [*]
    Closed_Lost --> [*]

    AP --> Closed_Lost : Lost at any stage
```

### Case Status Flow
```mermaid
stateDiagram-v2
    [*] --> New

    state "Working" as W {
        InProgress
        OnHold
        Escalated
    }

    New --> InProgress : Assign

    state InProgress {
        [*] --> Investigating
        Investigating --> Resolving
    }

    InProgress --> OnHold : Wait for info
    OnHold --> InProgress : Info received
    InProgress --> Escalated : Escalate
    Escalated --> InProgress : Resolved by L2

    InProgress --> Resolved
    Resolved --> Closed

    state Closed <<choice>>
    Closed --> Reopened : Issue returns
    Reopened --> InProgress
    Closed --> [*]
```

### Approval Flow
```mermaid
stateDiagram-v2
    [*] --> Draft

    Draft --> Submitted : Submit

    state "Approval Process" as AP {
        Submitted --> Pending_Approval

        state Pending_Approval {
            [*] --> Level1
            Level1 --> Level2 : L1 Approved
        }
    }

    Pending_Approval --> Approved : All approved
    Pending_Approval --> Rejected : Any rejected

    Approved --> [*]
    Rejected --> Draft : Revise & resubmit
```

## HubSpot State Diagrams

### Contact Lifecycle
```mermaid
stateDiagram-v2
    [*] --> Subscriber

    Subscriber --> Lead : Engagement
    Lead --> MQL : Score threshold

    state MQL {
        [*] --> Pending_Sales
        Pending_Sales --> Accepted
        Pending_Sales --> Rejected
    }

    Accepted --> SQL : Qualified by sales
    Rejected --> Lead : Return to nurture

    SQL --> Opportunity : Deal created
    Opportunity --> Customer : Closed Won
    Opportunity --> SQL : Closed Lost

    Customer --> Evangelist : High NPS
    Customer --> [*] : Churned
```

### Deal Pipeline
```mermaid
stateDiagram-v2
    [*] --> Appointment_Scheduled

    Appointment_Scheduled --> Qualified : Meeting held
    Qualified --> Presentation : Fit confirmed
    Presentation --> Decision : Demo completed
    Decision --> Contract_Sent : Verbal yes

    state "Final Stage" as FS {
        Contract_Sent --> Closed_Won : Signed
        Contract_Sent --> Closed_Lost : No response
        Decision --> Closed_Lost : Lost
    }

    Closed_Won --> [*]
    Closed_Lost --> [*]
```

### Workflow Enrollment
```mermaid
stateDiagram-v2
    [*] --> Enrolled

    state "Active in Workflow" as AW {
        Enrolled --> Step1
        Step1 --> Wait1
        Wait1 --> Step2
        Step2 --> Wait2
        Wait2 --> Step3
    }

    Step3 --> Completed : All steps done
    AW --> Goal_Met : Goal achieved early
    AW --> Unenrolled : Manual removal

    Completed --> [*]
    Goal_Met --> [*]
    Unenrolled --> [*]
```

## Integration State Diagrams

### Sync Record State
```mermaid
stateDiagram-v2
    [*] --> Pending_Sync

    Pending_Sync --> Syncing : Batch started

    state Syncing {
        [*] --> Transforming
        Transforming --> Validating
        Validating --> Sending
    }

    Syncing --> Synced : Success
    Syncing --> Error : Failed

    Error --> Retry : Auto retry
    Retry --> Syncing : Attempt #2
    Retry --> Failed : Max retries

    Synced --> [*]
    Failed --> Manual_Review
    Manual_Review --> Pending_Sync : Fixed
    Manual_Review --> Skipped : Ignore
    Skipped --> [*]
```

### API Request Lifecycle
```mermaid
stateDiagram-v2
    [*] --> Queued

    Queued --> Processing : Dequeue

    state Processing {
        [*] --> Authenticating
        Authenticating --> Executing
        Executing --> Parsing_Response
    }

    Processing --> Success : 2xx response
    Processing --> Client_Error : 4xx response
    Processing --> Server_Error : 5xx response

    Server_Error --> Retry
    Retry --> Queued : Backoff wait
    Retry --> Failed : Max retries

    Success --> [*]
    Client_Error --> [*]
    Failed --> [*]
```
