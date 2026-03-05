# Flowchart Syntax

## Basic Syntax

### Node Shapes
```mermaid
flowchart LR
    A[Rectangle] --> B(Rounded)
    B --> C([Stadium])
    C --> D[[Subroutine]]
    D --> E[(Database)]
    E --> F((Circle))
    F --> G>Flag]
    G --> H{Diamond}
    H --> I{{Hexagon}}
    I --> J[/Parallelogram/]
    J --> K[\Trapezoid/]
```

### Shape Reference
| Shape | Syntax | Use Case |
|-------|--------|----------|
| Rectangle | `[text]` | Standard step |
| Rounded | `(text)` | Process |
| Stadium | `([text])` | Start/End |
| Diamond | `{text}` | Decision |
| Circle | `((text))` | Connector |
| Database | `[(text)]` | Data store |
| Hexagon | `{{text}}` | Preparation |
| Parallelogram | `[/text/]` | Input/Output |
| Subroutine | `[[text]]` | Subprocess |

### Link Types
```mermaid
flowchart LR
    A --> B
    A --- C
    A -.- D
    A ==> E
    A -.-> F
    A --text--> G
    A -.text.-> H
```

### Link Reference
| Link | Syntax | Description |
|------|--------|-------------|
| Arrow | `-->` | Standard flow |
| Open | `---` | Association |
| Dotted | `-.-` | Optional |
| Thick | `==>` | Emphasis |
| Dotted Arrow | `-.->` | Optional flow |
| Labeled | `--text-->` | Named connection |

## Styling

### Node Styling
```mermaid
flowchart TD
    A[Default]
    B[Styled]:::highlight

    classDef highlight fill:#f96,stroke:#333,stroke-width:2px
    classDef success fill:#9f6,stroke:#333
    classDef error fill:#f66,stroke:#333
```

### Common Style Classes
```
classDef default fill:#fff,stroke:#333,stroke-width:1px
classDef highlight fill:#f96,stroke:#333,stroke-width:2px
classDef success fill:#9f6,stroke:#333,stroke-width:1px
classDef error fill:#f66,stroke:#333,stroke-width:1px
classDef warning fill:#ff9,stroke:#333,stroke-width:1px
classDef info fill:#9cf,stroke:#333,stroke-width:1px
classDef disabled fill:#ccc,stroke:#999,stroke-width:1px,stroke-dasharray:5
```

### Subgraphs
```mermaid
flowchart TB
    subgraph Sales Process
        A[Lead] --> B[Opportunity]
        B --> C[Quote]
    end

    subgraph Fulfillment
        D[Order] --> E[Delivery]
    end

    C --> D
```

## Common Patterns

### Decision Tree
```mermaid
flowchart TD
    Start([Start]) --> Check{Qualified?}
    Check -->|Yes| Route{Deal Size}
    Check -->|No| Nurture[Add to Nurture]
    Route -->|Enterprise| AE1[Enterprise AE]
    Route -->|SMB| AE2[SMB AE]
    AE1 --> End([End])
    AE2 --> End
    Nurture --> End
```

### Process Flow with Error Handling
```mermaid
flowchart TD
    A[Start Process] --> B{Validate Input}
    B -->|Valid| C[Process Data]
    B -->|Invalid| E[Log Error]
    C --> D{Success?}
    D -->|Yes| F[Update Record]
    D -->|No| E
    E --> G[Alert Admin]
    F --> H([End])
    G --> H
```

### Parallel Processes
```mermaid
flowchart TD
    Start([Start]) --> Fork{Fork}
    Fork --> Process1[Task A]
    Fork --> Process2[Task B]
    Fork --> Process3[Task C]
    Process1 --> Join{Join}
    Process2 --> Join
    Process3 --> Join
    Join --> End([Complete])
```

## Salesforce-Specific Templates

### Lead Conversion Flow
```mermaid
flowchart TD
    Lead[Lead Created] --> Enrich{Enrichment}
    Enrich --> Score[Lead Scoring]
    Score --> MQL{MQL?}
    MQL -->|No| Nurture[Nurture Campaign]
    MQL -->|Yes| SDR[SDR Qualification]
    Nurture -.-> Score
    SDR --> Qualified{SQL?}
    Qualified -->|No| Nurture
    Qualified -->|Yes| Convert[Convert Lead]
    Convert --> Account[Account]
    Convert --> Contact[Contact]
    Convert --> Opp[Opportunity]
```

### Opportunity Stage Flow
```mermaid
flowchart LR
    subgraph Pipeline
        Q[Qualification] --> D[Discovery]
        D --> P[Proposal]
        P --> N[Negotiation]
    end

    subgraph Closed
        N --> CW[Closed Won]
        N --> CL[Closed Lost]
    end

    style CW fill:#9f6
    style CL fill:#f66
```

### Approval Process
```mermaid
flowchart TD
    Submit([Submit for Approval]) --> Check{Amount Check}
    Check -->|< $10K| Auto[Auto-Approve]
    Check -->|$10K-$50K| Mgr[Manager Approval]
    Check -->|> $50K| VP[VP Approval]

    Mgr --> MgrDec{Decision}
    VP --> VPDec{Decision}

    MgrDec -->|Approve| Approved([Approved])
    MgrDec -->|Reject| Rejected([Rejected])
    VPDec -->|Approve| Approved
    VPDec -->|Reject| Rejected
    Auto --> Approved

    style Approved fill:#9f6
    style Rejected fill:#f66
```

## HubSpot-Specific Templates

### Workflow Decision Flow
```mermaid
flowchart TD
    Enroll([Contact Enrolled]) --> Check{Lifecycle Stage}
    Check -->|Lead| LeadPath[Lead Workflow]
    Check -->|MQL| MQLPath[MQL Workflow]
    Check -->|Customer| CustPath[Customer Workflow]

    LeadPath --> Score[Score Contact]
    Score --> MQLCheck{Score > 50?}
    MQLCheck -->|Yes| SetMQL[Set MQL Stage]
    MQLCheck -->|No| WaitScore[Wait & Rescore]
    WaitScore -.-> Score

    SetMQL --> Notify[Notify Sales]
    MQLPath --> Notify
    Notify --> End([Exit])

    CustPath --> Onboard[Onboarding Sequence]
    Onboard --> End
```

### Form Submission Flow
```mermaid
flowchart TD
    Form([Form Submission]) --> Create[Create/Update Contact]
    Create --> Source{Lead Source?}
    Source -->|Organic| OrgList[Add to Organic List]
    Source -->|Paid| PaidList[Add to Paid List]
    Source -->|Referral| RefList[Add to Referral List]

    OrgList --> Email[Send Thank You Email]
    PaidList --> Email
    RefList --> Email

    Email --> Assign[Assign to Owner]
    Assign --> Task[Create Follow-up Task]
    Task --> End([Complete])
```
