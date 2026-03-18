# Sequence Diagram Syntax

## Basic Syntax

### Participants
```mermaid
sequenceDiagram
    participant U as User
    participant A as Application
    participant S as Salesforce
    participant H as HubSpot
```

### Message Types
```mermaid
sequenceDiagram
    A->>B: Solid line with arrowhead
    A-->>B: Dotted line with arrowhead
    A-xB: Solid line with cross
    A--xB: Dotted line with cross
    A-)B: Solid line with open arrow (async)
    A--)B: Dotted line with open arrow (async)
```

### Message Reference
| Arrow | Syntax | Meaning |
|-------|--------|---------|
| Solid arrow | `->>` | Synchronous request |
| Dotted arrow | `-->>` | Synchronous response |
| Solid async | `-)` | Async message |
| Dotted async | `--)` | Async response |
| Cross | `-x` | Failed message |

## Activation and Notes

### Activation Boxes
```mermaid
sequenceDiagram
    participant C as Client
    participant S as Server

    C->>S: Request
    activate S
    S-->>C: Response
    deactivate S
```

### Notes
```mermaid
sequenceDiagram
    participant A
    participant B

    Note left of A: Note on left
    Note right of B: Note on right
    Note over A: Note over single
    Note over A,B: Note spanning both
```

### Loops and Conditionals
```mermaid
sequenceDiagram
    participant C as Client
    participant S as Server

    loop Every 5 seconds
        C->>S: Heartbeat
        S-->>C: Ack
    end

    alt Success
        S-->>C: Data
    else Failure
        S-->>C: Error
    end

    opt Optional Step
        C->>S: Optional request
    end
```

## Common Integration Patterns

### REST API Call
```mermaid
sequenceDiagram
    participant Client
    participant Auth as Auth Server
    participant API

    Client->>Auth: Request Token
    Auth-->>Client: Access Token

    Client->>API: GET /resource (with token)
    activate API
    API-->>Client: 200 OK (data)
    deactivate API
```

### OAuth 2.0 Flow
```mermaid
sequenceDiagram
    participant User
    participant App
    participant AuthServer as Authorization Server
    participant API as Resource Server

    User->>App: Click Login
    App->>AuthServer: Authorization Request
    AuthServer->>User: Login Page
    User->>AuthServer: Credentials
    AuthServer->>App: Authorization Code
    App->>AuthServer: Exchange Code for Token
    AuthServer-->>App: Access Token + Refresh Token
    App->>API: Request with Access Token
    API-->>App: Protected Resource
```

### Webhook Processing
```mermaid
sequenceDiagram
    participant Source as Source System
    participant Webhook as Webhook Endpoint
    participant Queue as Message Queue
    participant Processor
    participant Target as Target System

    Source->>Webhook: POST /webhook (event)
    activate Webhook
    Webhook->>Queue: Enqueue message
    Webhook-->>Source: 200 OK (immediate)
    deactivate Webhook

    Queue->>Processor: Dequeue message
    activate Processor
    Processor->>Target: Process & update
    Target-->>Processor: Confirm
    deactivate Processor
```

## Salesforce Integration Patterns

### API Callout
```mermaid
sequenceDiagram
    participant Trigger as Apex Trigger
    participant Future as @future Method
    participant External as External API

    Trigger->>Future: callExternalAPI()
    Note right of Future: Async execution

    Future->>External: POST /api/data
    activate External
    External-->>Future: Response
    deactivate External

    Future->>Salesforce: Update record
```

### Platform Event Flow
```mermaid
sequenceDiagram
    participant Apex
    participant PE as Platform Event
    participant Trigger as Event Trigger
    participant Flow as Salesforce Flow

    Apex->>PE: Publish Event
    PE->>Trigger: Fire Trigger
    PE->>Flow: Fire Flow Trigger

    par Trigger Processing
        Trigger->>Apex: Execute Handler
    and Flow Processing
        Flow->>Salesforce: Execute Actions
    end
```

### Composite API
```mermaid
sequenceDiagram
    participant Client
    participant SF as Salesforce

    Client->>SF: POST /composite
    activate SF
    Note right of SF: Begin Transaction

    SF->>SF: Create Account
    SF->>SF: Create Contact
    SF->>SF: Create Opportunity

    alt All Success
        SF-->>Client: 200 OK (all IDs)
    else Any Failure
        SF->>SF: Rollback All
        SF-->>Client: 400 Error (details)
    end
    deactivate SF
```

## HubSpot Integration Patterns

### CRM Sync
```mermaid
sequenceDiagram
    participant SF as Salesforce
    participant Sync as Sync Engine
    participant HS as HubSpot

    SF->>Sync: Record Updated (webhook)
    activate Sync
    Sync->>Sync: Map Fields
    Sync->>HS: Search for match
    alt Found
        HS-->>Sync: Existing record
        Sync->>HS: PATCH /objects/contacts/{id}
    else Not Found
        Sync->>HS: POST /objects/contacts
    end
    HS-->>Sync: Confirm
    deactivate Sync
```

### Workflow Automation
```mermaid
sequenceDiagram
    participant Form as HubSpot Form
    participant WF as Workflow Engine
    participant HS as HubSpot CRM
    participant Email as Email Service
    participant Slack

    Form->>WF: Form Submission
    activate WF

    WF->>HS: Create/Update Contact
    HS-->>WF: Contact ID

    par Notifications
        WF->>Email: Send Welcome Email
        Email-->>WF: Sent
    and
        WF->>Slack: Notify Sales
        Slack-->>WF: Delivered
    end

    WF->>HS: Create Task
    deactivate WF
```

### Bidirectional Sync
```mermaid
sequenceDiagram
    participant SF as Salesforce
    participant Middleware
    participant HS as HubSpot

    Note over SF,HS: SF to HS Sync
    SF->>Middleware: Outbound Message
    Middleware->>Middleware: Transform
    Middleware->>HS: Update Contact
    HS-->>Middleware: Confirm

    Note over SF,HS: HS to SF Sync
    HS->>Middleware: Webhook
    Middleware->>Middleware: Transform
    Middleware->>SF: REST API Update
    SF-->>Middleware: Confirm

    Note over SF,HS: Conflict Resolution
    opt Last Write Wins
        Middleware->>Middleware: Compare timestamps
    end
```
