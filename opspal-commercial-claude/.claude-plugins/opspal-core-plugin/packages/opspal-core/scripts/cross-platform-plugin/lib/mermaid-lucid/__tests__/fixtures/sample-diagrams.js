/**
 * Sample Mermaid Diagrams for Testing
 *
 * Collection of test fixtures covering all diagram types and directions.
 * Used by mermaid-parser-utils.test.js and lucid-layout-engine.test.js.
 *
 * @phase Phase 2 - Test foundation for LR layout fix
 */

/**
 * Flowchart samples with all directions
 */
const FLOWCHART_SAMPLES = {
  // Simple linear flowcharts
  simpleTB: `flowchart TB
    A[Start] --> B[Process] --> C[End]`,

  simpleLR: `flowchart LR
    A[Start] --> B[Process] --> C[End]`,

  simpleRL: `flowchart RL
    A[Start] --> B[Process] --> C[End]`,

  simpleBT: `flowchart BT
    A[Start] --> B[Process] --> C[End]`,

  // Branching flowcharts
  branchingTB: `flowchart TB
    A[Start] --> B{Decision}
    B -->|Yes| C[Action 1]
    B -->|No| D[Action 2]
    C --> E[End]
    D --> E`,

  branchingLR: `flowchart LR
    A[Start] --> B{Decision}
    B -->|Yes| C[Action 1]
    B -->|No| D[Action 2]
    C --> E[End]
    D --> E`,

  // Complex with multiple shapes
  complexShapes: `flowchart TB
    A[Rectangle]
    B{Diamond}
    C(Rounded)
    D((Circle))
    A --> B
    B --> C
    C --> D`,

  // Edge types
  edgeTypes: `flowchart TB
    A --> B
    B ==> C
    C -.-> D
    D --- E`,

  // With comments
  withComments: `flowchart TB
    %% This is a comment
    A[Start] --> B[Process]
    %% Another comment
    B --> C[End]`,

  // Large flowchart (15+ nodes) - triggers LR readability issues
  largeLR: `flowchart LR
    N0[Step 0] --> N1[Step 1] --> N2[Step 2] --> N3[Step 3] --> N4[Step 4]
    N4 --> N5[Step 5] --> N6[Step 6] --> N7[Step 7] --> N8[Step 8]
    N8 --> N9[Step 9] --> N10[Step 10] --> N11[Step 11] --> N12[Step 12]
    N12 --> N13[Step 13] --> N14[End]`,

  // CPQ-style process flow (common source of LR issues)
  cpqProcessFlow: `flowchart LR
    Quote[Quote Created] --> Validate{Validate}
    Validate -->|Pass| Price[Calculate Pricing]
    Validate -->|Fail| Error[Show Errors]
    Price --> Discount{Apply Discounts}
    Discount --> Approval{Needs Approval?}
    Approval -->|Yes| Submit[Submit for Approval]
    Approval -->|No| Generate[Generate Document]
    Submit --> Review{Review}
    Review -->|Approved| Generate
    Review -->|Rejected| Quote
    Generate --> Order[Create Order]`
};

/**
 * ERD samples
 */
const ERD_SAMPLES = {
  // Simple two-entity ERD
  simple: `erDiagram
    CUSTOMER ||--o{ ORDER : "places"
    CUSTOMER {
        string name
        string email PK
    }
    ORDER {
        int id PK
        date created_at
    }`,

  // Multi-entity ERD
  multiEntity: `erDiagram
    CUSTOMER ||--o{ ORDER : "places"
    ORDER ||--|{ LINE_ITEM : "contains"
    PRODUCT ||--o{ LINE_ITEM : "references"
    CUSTOMER {
        int id PK
        string name
        string email
    }
    ORDER {
        int id PK
        int customer_id FK
        date order_date
    }
    LINE_ITEM {
        int id PK
        int order_id FK
        int product_id FK
        int quantity
    }
    PRODUCT {
        int id PK
        string name
        decimal price
    }`,

  // CPQ-style ERD
  cpqSchema: `erDiagram
    Quote ||--|{ QuoteLine : "contains"
    QuoteLine }|--|| Product : "references"
    Product ||--|{ PriceBookEntry : "priced_by"
    Quote {
        string name
        decimal total_amount
        string status
    }
    QuoteLine {
        int quantity
        decimal unit_price
        decimal total_price
    }
    Product {
        string name
        string product_code
    }
    PriceBookEntry {
        decimal list_price
        boolean is_active
    }`
};

/**
 * Sequence diagram samples
 */
const SEQUENCE_SAMPLES = {
  // Simple request-response
  simple: `sequenceDiagram
    participant A as Client
    participant B as Server
    A->>B: Request
    B-->>A: Response`,

  // Multi-participant
  multiParticipant: `sequenceDiagram
    participant U as User
    participant API as API Gateway
    participant S as Service
    participant DB as Database
    U->>API: Request
    API->>S: Forward
    S->>DB: Query
    DB-->>S: Results
    S-->>API: Response
    API-->>U: Data`,

  // With autonumber
  withAutonumber: `sequenceDiagram
    autonumber
    participant A as Alice
    participant B as Bob
    A->>B: Hello Bob
    B->>A: Hello Alice
    A->>B: How are you?
    B-->>A: I'm fine, thanks!`,

  // With actors
  withActors: `sequenceDiagram
    actor User
    participant System
    User->>System: Login
    System-->>User: Session Token`
};

/**
 * State diagram samples
 */
const STATE_SAMPLES = {
  // Simple state machine
  simple: `stateDiagram-v2
    [*] --> Idle
    Idle --> Running : start
    Running --> Idle : stop
    Running --> [*] : terminate`,

  // With direction
  withDirectionLR: `stateDiagram-v2
    direction LR
    [*] --> State1
    State1 --> State2
    State2 --> [*]`,

  withDirectionTB: `stateDiagram-v2
    direction TB
    [*] --> State1
    State1 --> State2
    State2 --> [*]`,

  // Complex workflow
  workflow: `stateDiagram-v2
    [*] --> Draft
    Draft --> Pending : submit
    Pending --> Approved : approve
    Pending --> Rejected : reject
    Rejected --> Draft : revise
    Approved --> [*]`,

  // With labeled states
  withLabels: `stateDiagram-v2
    state "Waiting for input" as Waiting
    state "Processing data" as Processing
    state "Completed successfully" as Done
    [*] --> Waiting
    Waiting --> Processing : receive
    Processing --> Done : complete
    Done --> [*]`
};

/**
 * Edge cases and error scenarios
 */
const EDGE_CASES = {
  // Empty diagrams
  emptyFlowchart: 'flowchart TB',
  emptyERD: 'erDiagram',
  emptySequence: 'sequenceDiagram',
  emptyState: 'stateDiagram-v2',

  // Whitespace heavy
  whitespaceHeavy: `
    flowchart TB

        A[Start]     -->     B[End]

  `,

  // Single node
  singleNode: `flowchart TB
    A[Lonely Node]`,

  // Disconnected nodes
  disconnected: `flowchart TB
    A[Connected] --> B[Connected]
    C[Disconnected]`,

  // Very long labels
  longLabels: `flowchart TB
    A[This is a very long label that might cause layout issues] --> B[Another long label for testing purposes]`,

  // Special characters in labels
  specialChars: `flowchart TB
    A[Node with "quotes"] --> B[Node with 'apostrophes']
    B --> C[Node & ampersand]`
};

module.exports = {
  FLOWCHART_SAMPLES,
  ERD_SAMPLES,
  SEQUENCE_SAMPLES,
  STATE_SAMPLES,
  EDGE_CASES
};
