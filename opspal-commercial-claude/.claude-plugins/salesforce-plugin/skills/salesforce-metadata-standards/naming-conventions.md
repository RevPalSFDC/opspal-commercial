# Salesforce Naming Conventions

## Objects

### Custom Objects

| Category | Pattern | Example | Notes |
|----------|---------|---------|-------|
| Business Entity | `{Entity}__c` | `Invoice__c` | Primary business concept |
| Process Object | `{Process}_{Entity}__c` | `Approval_Request__c` | Process-specific data |
| Integration Object | `{System}_{Entity}__c` | `ERP_Order__c` | External system staging |
| Junction Object | `{Parent1}_{Parent2}__c` | `Account_Campaign__c` | Many-to-many relationships |

### Naming Rules

- **Underscores**: Use underscores between words, not camelCase
- **Length**: Max 40 characters for API name
- **Uniqueness**: Must be unique across the org
- **Avoid**: Abbreviations (unless universal), numbers as prefixes, special characters

### Label vs API Name

| API Name | Label | When Different |
|----------|-------|----------------|
| `Billing_Schedule__c` | `Billing Schedule` | Always different (label has spaces) |
| `Revenue_Recognition__c` | `Rev Rec Entry` | Business prefers shorter label |
| `Legacy_Account_Id__c` | `Account ID (Legacy)` | Label provides context |

---

## Fields

### Standard Patterns

| Field Type | Pattern | Example |
|------------|---------|---------|
| Text | `{Description}__c` | `Company_Website__c` |
| Number | `{Metric}__c` | `Annual_Revenue__c` |
| Currency | `{Amount}_{Type}__c` | `Total_Contract_Value__c` |
| Percent | `{Rate}_{Pct}__c` | `Discount_Rate_Pct__c` |
| Date | `{Event}_{Date}__c` | `Contract_Start_Date__c` |
| DateTime | `{Event}_{DateTime}__c` | `Last_Activity_DateTime__c` |
| Checkbox | `Is_{Condition}__c` | `Is_Active__c` |
| Picklist | `{Category}__c` | `Lead_Source__c` |

### Lookup Fields

| Relationship | Pattern | Example |
|--------------|---------|---------|
| Master-Detail | `{Parent}__c` | `Account__c` (on child object) |
| Lookup | `{Related}__c` | `Primary_Contact__c` |
| Self-Reference | `Parent_{Object}__c` | `Parent_Account__c` |

### Formula Fields

| Output Type | Pattern | Example |
|-------------|---------|---------|
| Calculated Value | `{Output}_Calc__c` | `Days_Open_Calc__c` |
| Derived Flag | `Is_{Condition}_Flag__c` | `Is_Overdue_Flag__c` |
| Display Value | `{Field}_Display__c` | `Status_Display__c` |

### Rollup Summary Fields

| Calculation | Pattern | Example |
|-------------|---------|---------|
| Sum | `Total_{Child}_{Field}__c` | `Total_Line_Amount__c` |
| Count | `{Child}_Count__c` | `Contacts_Count__c` |
| Min/Max | `{Min/Max}_{Child}_{Field}__c` | `Max_Opportunity_Amount__c` |

---

## Flows

### Record-Triggered Flows

```
{Object}_{Action}_{Timing}
```

| Component | Options | Example |
|-----------|---------|---------|
| Object | Object API name | `Account`, `Opportunity` |
| Action | `Create`, `Update`, `Delete`, `Enrich`, `Validate` | |
| Timing | `Before`, `After`, `BeforeAfter` | |

**Examples:**
- `Account_Enrich_AfterInsert`
- `Opportunity_Validate_BeforeUpdate`
- `Case_Escalate_AfterCreate`

### Screen Flows

```
{Process}_{Purpose}
```

**Examples:**
- `Lead_Qualification_Wizard`
- `Case_Escalation_Request`
- `Contract_Amendment_Form`

### Scheduled Flows

```
{Frequency}_{Process}
```

**Examples:**
- `Daily_Lead_Aging`
- `Weekly_Pipeline_Snapshot`
- `Monthly_Invoice_Generation`

### Subflows

```
Sub_{Parent}_{Function}
```

**Examples:**
- `Sub_Account_GetHierarchy`
- `Sub_Opportunity_CalculateROI`

---

## Validation Rules

### Pattern

```
{Object}_{Target}_{Rule}
```

| Component | Description | Example |
|-----------|-------------|---------|
| Object | Object name | `Account`, `Contact` |
| Target | Field(s) or process | `Amount`, `Status`, `Escalation` |
| Rule | What's validated | `Required`, `Range`, `Format` |

**Examples:**
- `Opportunity_Amount_Required`
- `Contact_Email_Format`
- `Case_Escalation_ManagerRequired`
- `Account_Industry_ValidPicklist`

### Naming Best Practices

- **Descriptive**: Name should indicate what the rule enforces
- **Consistent**: Use same pattern across all objects
- **Searchable**: Include object name for filtering

---

## Permission Sets

### Two-Tier Architecture

**Tier 1 (Foundational):**
```
{SecurityLevel}_{Object}_{AccessType}
```

Examples:
- `Standard_Account_Read`
- `Standard_Account_Edit`
- `Elevated_Opportunity_FullAccess`

**Tier 2 (Role-Based):**
```
{Role}_{Department}
```

Examples:
- `Sales_Rep`
- `Sales_Manager`
- `Service_Agent`
- `Finance_Analyst`

---

## Apex Classes

### Patterns

| Type | Pattern | Example |
|------|---------|---------|
| Trigger Handler | `{Object}TriggerHandler` | `AccountTriggerHandler` |
| Service Class | `{Domain}Service` | `BillingService` |
| Selector | `{Object}Selector` | `OpportunitySelector` |
| Domain | `{Object}s` (plural) | `Accounts`, `Opportunities` |
| Controller | `{Page}Controller` | `InvoicePageController` |
| Batch | `{Process}Batch` | `LeadCleanupBatch` |
| Schedulable | `{Process}Scheduler` | `DailyReportScheduler` |
| Test | `{ClassUnderTest}Test` | `AccountTriggerHandlerTest` |

### Package Prefixes

For managed packages, use consistent namespace:
- `revpal__Invoice__c`
- `revpal__BillingService`

---

## Lightning Components

### LWC

| Type | Pattern | Example |
|------|---------|---------|
| Component | `camelCase` | `accountDetails` |
| Parent | `{feature}Container` | `invoiceContainer` |
| Child | `{feature}Item` | `invoiceLineItem` |
| Utility | `{function}Util` | `dateFormatUtil` |

### Aura (Legacy)

| Type | Pattern | Example |
|------|---------|---------|
| Component | `PascalCase` | `AccountDetails` |
| Event | `{action}Event` | `RecordSelectedEvent` |

---

## Reports and Dashboards

### Reports

```
{Object}_{Audience}_{Purpose}
```

Examples:
- `Opportunity_Sales_Pipeline`
- `Case_Service_OpenByPriority`
- `Lead_Marketing_ConversionRates`

### Dashboards

```
{Audience}_{Purpose}_Dashboard
```

Examples:
- `Sales_Executive_Dashboard`
- `Service_Manager_Dashboard`
- `Marketing_Campaign_Dashboard`

### Report Folders

```
{Department}_{Visibility}
```

Examples:
- `Sales_Team_Reports`
- `Executive_Private_Reports`
- `Marketing_Shared_Reports`
