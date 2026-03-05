# ERD Syntax

## Basic Syntax

### Entity Definition
```mermaid
erDiagram
    CUSTOMER {
        string id PK
        string name
        string email
        date created_date
    }
```

### Attribute Types
| Type | Example |
|------|---------|
| `string` | name, email |
| `int` | count, quantity |
| `float` | amount, rate |
| `date` | created_date |
| `datetime` | modified_datetime |
| `boolean` | is_active |

### Key Markers
| Marker | Meaning |
|--------|---------|
| `PK` | Primary Key |
| `FK` | Foreign Key |
| `UK` | Unique Key |

## Relationship Syntax

### Cardinality Notation
```mermaid
erDiagram
    A ||--o{ B : "one to many"
    C }o--o{ D : "many to many"
    E ||--|| F : "one to one"
    G }|--|{ H : "many required"
```

### Relationship Reference
| Symbol | Meaning |
|--------|---------|
| `\|\|` | Exactly one |
| `}o` | Zero or more |
| `\|{` | One or more |
| `o\|` | Zero or one |

### Full Syntax
```
<entity1> <relationship> <entity2> : "label"

Relationship format: <left-cardinality>--<right-cardinality>

Left side describes relationship from entity1's perspective
Right side describes relationship from entity2's perspective
```

## Salesforce Data Model Templates

### Standard Objects
```mermaid
erDiagram
    ACCOUNT ||--o{ CONTACT : has
    ACCOUNT ||--o{ OPPORTUNITY : owns
    CONTACT ||--o{ CASE : creates
    OPPORTUNITY ||--|{ OPPORTUNITY_LINE_ITEM : contains
    PRODUCT ||--o{ OPPORTUNITY_LINE_ITEM : "sold in"
    PRICEBOOK ||--|{ PRICEBOOK_ENTRY : contains
    PRODUCT ||--o{ PRICEBOOK_ENTRY : "listed in"

    ACCOUNT {
        string Id PK
        string Name
        string Industry
        string Type
    }

    CONTACT {
        string Id PK
        string AccountId FK
        string FirstName
        string LastName
        string Email
    }

    OPPORTUNITY {
        string Id PK
        string AccountId FK
        string Name
        float Amount
        string StageName
        date CloseDate
    }
```

### CPQ Data Model
```mermaid
erDiagram
    ACCOUNT ||--o{ QUOTE : "has quotes"
    OPPORTUNITY ||--o{ QUOTE : "related to"
    QUOTE ||--|{ QUOTE_LINE : contains
    PRODUCT ||--o{ QUOTE_LINE : "quoted in"
    QUOTE ||--o| ORDER : "converts to"
    ORDER ||--|{ ORDER_PRODUCT : contains

    QUOTE {
        string Id PK
        string SBQQ__Account__c FK
        string SBQQ__Opportunity2__c FK
        float SBQQ__NetAmount__c
        string SBQQ__Status__c
        date SBQQ__ExpirationDate__c
    }

    QUOTE_LINE {
        string Id PK
        string SBQQ__Quote__c FK
        string SBQQ__Product__c FK
        int SBQQ__Quantity__c
        float SBQQ__NetTotal__c
    }

    ORDER {
        string Id PK
        string SBQQ__Quote__c FK
        string Status
        date EffectiveDate
    }
```

### Service Cloud Model
```mermaid
erDiagram
    ACCOUNT ||--o{ CASE : "has cases"
    CONTACT ||--o{ CASE : "reports"
    CASE ||--o{ CASE_COMMENT : "has comments"
    CASE }o--o{ KNOWLEDGE_ARTICLE : "related to"
    USER ||--o{ CASE : "owns"
    QUEUE }o--o{ CASE : "manages"

    CASE {
        string Id PK
        string AccountId FK
        string ContactId FK
        string CaseNumber
        string Subject
        string Status
        string Priority
        string Origin
    }

    CASE_COMMENT {
        string Id PK
        string ParentId FK
        string CommentBody
        boolean IsPublished
    }
```

## HubSpot Data Model Templates

### Core CRM
```mermaid
erDiagram
    COMPANY ||--o{ CONTACT : employs
    CONTACT ||--o{ DEAL : "associated with"
    COMPANY ||--o{ DEAL : "associated with"
    CONTACT ||--o{ ENGAGEMENT : "has activities"
    DEAL ||--o{ LINE_ITEM : contains

    COMPANY {
        string id PK
        string name
        string domain
        string industry
    }

    CONTACT {
        string id PK
        string email
        string firstname
        string lastname
        string lifecyclestage
    }

    DEAL {
        string id PK
        string dealname
        float amount
        string dealstage
        date closedate
    }
```

### Marketing Objects
```mermaid
erDiagram
    CONTACT }o--o{ LIST : "member of"
    CONTACT ||--o{ FORM_SUBMISSION : submits
    CONTACT ||--o{ EMAIL_EVENT : receives
    CAMPAIGN ||--o{ EMAIL : sends
    CAMPAIGN }o--o{ CONTACT : "enrolled in"
    WORKFLOW ||--o{ CONTACT : enrolls

    LIST {
        string listId PK
        string name
        string listType
        int size
    }

    FORM_SUBMISSION {
        string id PK
        string formId FK
        string contactId FK
        datetime submittedAt
    }

    EMAIL_EVENT {
        string id PK
        string emailId FK
        string contactId FK
        string type
        datetime timestamp
    }
```

## Cross-Platform Integration Model

### SF-HubSpot Sync
```mermaid
erDiagram
    SF_ACCOUNT ||--|| HS_COMPANY : syncs
    SF_CONTACT ||--|| HS_CONTACT : syncs
    SF_OPPORTUNITY ||--|| HS_DEAL : syncs
    SF_LEAD ||--o| HS_CONTACT : "converts to"

    SYNC_MAPPING {
        string id PK
        string sf_object
        string hs_object
        string sf_id
        string hs_id
        datetime last_synced
        string sync_status
    }

    SF_ACCOUNT ||--o{ SYNC_MAPPING : tracked
    HS_COMPANY ||--o{ SYNC_MAPPING : tracked
```

## Best Practices

### Naming Conventions
```
- Use UPPERCASE for entity names
- Use snake_case for attribute names
- Include PK/FK markers for keys
- Use descriptive relationship labels
```

### Complexity Management
```
For complex diagrams:
1. Group related entities
2. Use subgraphs or separate diagrams
3. Show only key attributes
4. Use consistent relationship directions
```
