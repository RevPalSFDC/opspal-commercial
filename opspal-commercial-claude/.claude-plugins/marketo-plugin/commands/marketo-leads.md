---
description: Query, create, update, or manage leads in Marketo
---

# /marketo-leads

Quick lead operations in Marketo.

## Usage

```
/marketo-leads [action] [options]
```

## Actions

| Action | Description |
|--------|-------------|
| `query` | Find leads by filter |
| `get` | Get lead by ID |
| `create` | Create new lead |
| `update` | Update existing lead |
| `merge` | Merge duplicate leads |
| `activities` | Get lead activity history |
| `schema` | Show lead field schema |

## Query Examples

### By Email
```
/marketo-leads query email:john@example.com

Lead Found:
───────────
ID: 123456
Email: john@example.com
Name: John Doe
Company: Acme Corp
Score: 78
```

### By Company
```
/marketo-leads query company:"Acme Corp"

Found 15 leads at Acme Corp
[Shows top 10 with pagination]
```

### By Custom Field
```
/marketo-leads query lifecycleStage:MQL

Found 234 MQLs
[Shows summary and top results]
```

## Get Lead
```
/marketo-leads get 123456

Lead Details (ID: 123456)
─────────────────────────
Email: john@example.com
First Name: John
Last Name: Doe
Company: Acme Corp
Title: Director of Marketing
Lead Score: 78
Lifecycle Stage: MQL
Created: 2024-06-15
Last Activity: 2025-01-03
```

## Create Lead
```
/marketo-leads create email:new@example.com firstName:New lastName:Lead company:"New Co"

Lead Created:
─────────────
ID: 789012
Email: new@example.com
Status: created
```

## Update Lead
```
/marketo-leads update 123456 leadScore:90 lifecycleStage:SQL

Lead Updated:
─────────────
ID: 123456
Updated Fields:
- leadScore: 78 → 90
- lifecycleStage: MQL → SQL
```

## Merge Duplicates
```
/marketo-leads merge winner:123456 losers:789012,345678

Merge Complete:
───────────────
Winner: 123456
Merged: 2 leads
Activities Transferred: 45
```

## Activity History
```
/marketo-leads activities 123456 --days 30

Recent Activities (Last 30 Days)
────────────────────────────────
2025-01-03 14:32 - Clicked Email: Q1 Newsletter
2025-01-03 10:15 - Opened Email: Q1 Newsletter
2025-01-02 09:45 - Visited Web Page: /pricing
2025-01-01 16:20 - Filled Out Form: Contact Us
...
```

## Field Schema
```
/marketo-leads schema

Lead Field Schema
─────────────────
Total Fields: 156 (89 custom)

Standard Fields:
- email (Email) - Required
- firstName (String)
- lastName (String)
...

Custom Fields:
- Lead_Score__c (Integer)
- Lifecycle_Stage__c (Picklist)
...
```

## Advanced Options

### Specify Fields
```
/marketo-leads query email:*@acme.com --fields email,firstName,lastName,leadScore
```

### Pagination
```
/marketo-leads query company:"Acme" --limit 50 --offset 100
```

### Bulk Operations
For bulk operations (>10 leads), use `marketo-lead-manager` agent:
```
Use marketo-lead-manager to bulk update all MQLs with score > 80
```

## Tips

1. **Use Quotes for Values with Spaces**
   ```
   /marketo-leads query company:"Acme Corporation Inc"
   ```

2. **Check Schema First**
   ```
   /marketo-leads schema
   # Verify field names before querying
   ```

3. **Test in Sandbox**
   ```
   /marketo-instance switch sandbox
   /marketo-leads create ...
   ```
