# Object-Specific Layout Guidance

## Account

### Business Context

Account is typically the hub of customer information - a 360-degree view connecting Contacts, Opportunities, Cases, and Activities. Most users arrive at Account to understand the full customer picture.

### Recommended Sections

| Section | Fields | Rationale |
|---------|--------|-----------|
| **Account Details** | Name, Owner, Industry, Rating, Type, Parent Account | Core identification and categorization |
| **Address Information** | Billing Address, Shipping Address | Physical location data |
| **Additional Info** | SLA, Account Source, Annual Revenue, Number of Employees | Business context and metrics |
| **System Information** | Created Date, Last Modified Date, Last Activity | Audit trail (optional, often collapsed) |

### Related Lists (Priority Order)

1. **Contacts** - Most common navigation from Account
2. **Opportunities** - Pipeline and revenue visibility
3. **Cases** (if applicable) - Support history
4. **Activities** - Recent engagement
5. **Notes & Attachments** - Documentation

### Compact Layout

**Recommended Fields (4):**
1. Phone - Enable one-click calling
2. Industry - Quick categorization
3. Owner - Know who to contact
4. Rating (or Type) - Priority indicator

### Default Tab

**Related** - Users typically navigate to Account to see connected records (Contacts, Opportunities). Opening to Related tab saves one click for the most common workflow.

### Persona Variations

| Persona | Emphasis |
|---------|----------|
| Sales Rep | Annual Revenue, Rating, Active Opportunities count |
| Support Agent | SLA, Primary Contact, Open Cases count |
| Executive | Revenue metrics, Account Tier |
| Customer Success | Health Score, Renewal Date, Adoption metrics |

---

## Contact

### Business Context

Contact represents individuals - the people users communicate with. Quick access to contact methods (Phone, Email) and communication preferences (opt-outs) is critical.

### Recommended Sections

| Section | Fields | Rationale |
|---------|--------|-----------|
| **Contact Details** | Name, Title, Account, Department, Reports To | Identity and organizational context |
| **Contact Information** | Phone, Mobile, Email, Assistant | Communication channels |
| **Address** | Mailing Address | Physical location |
| **Preferences** | Do Not Call, Has Opted Out of Email, Fax Opt Out | Compliance-critical indicators |
| **Additional Info** | Lead Source, Owner, Description | Acquisition and context |

### Related Lists (Priority Order)

1. **Opportunities** (for sales users) - Deals involving this contact
2. **Cases** (for support users) - Support history
3. **Activities** - Communication history
4. **Campaign History** (for marketing) - Marketing engagement

### Compact Layout

**Recommended Fields (4-5):**
1. Phone - Enable calling
2. Email - Enable emailing
3. Account - Context
4. DoNotCall Indicator (formula) - Compliance visibility
5. HasOptedOutOfEmail Indicator (formula) - Email compliance

**Visual Indicators Pattern:**
Create formula fields that show icons for opt-out status:
```
// DoNotCall_Indicator__c (Formula - Text)
IF(DoNotCall,
   IMAGE("/img/samples/flag_red.gif", "Do Not Call", 16, 16),
   IMAGE("/img/samples/flag_green.gif", "OK to Call", 16, 16)
)
```

### Default Tab

**Details** - Users typically come to Contact to view or update contact information, not to see related records.

### Persona Variations

| Persona | Emphasis |
|---------|----------|
| Sales Rep | Decision-maker indicators, Last Contacted Date |
| Support Agent | Preferred Contact Method, SLA (from Account) |
| Marketing | Email status, Campaign membership |
| Customer Success | Role in renewal, Product usage contact |

---

## Opportunity

### Business Context

Opportunity drives sales process - it's where deals are tracked, amounts are set, and stages are progressed. Users need quick access to update Stage, Amount, and Close Date.

### Recommended Sections

| Section | Fields | Rationale |
|---------|--------|-----------|
| **Opportunity Details** | Name, Stage, Amount, Close Date, Owner | Core deal information |
| **Opportunity Information** | Type, Lead Source, Campaign, Probability | Classification and attribution |
| **Key Contacts** | Primary Contact, Contact Role | Decision-makers |
| **Key Dates** | Created Date, Last Activity Date, Next Step | Timeline and actions |
| **System Information** | Forecast Category, Last Modified | Forecasting and audit |

### Related Lists (Priority Order)

1. **Products (Opportunity Line Items)** - What's being sold
2. **Quotes** - Pricing proposals
3. **Contact Roles** - Stakeholders
4. **Activities** - Engagement history
5. **Files** - Proposals, contracts

### Compact Layout

**Recommended Fields (4):**
1. Amount - Deal size
2. Close Date - Urgency
3. Stage - Current status
4. Account - Customer context

### Default Tab

**Details** - Users frequently update Opportunity fields (especially Stage). Starting on Details enables immediate editing.

### Persona Variations

| Persona | Emphasis |
|---------|----------|
| Sales Rep | Next Step, Sales Path, Activities |
| Sales Manager | Forecast Category, Probability, Team Member |
| Executive | Amount, Stage, Win/Loss metrics |
| Marketing | Campaign attribution, Lead Source |

### Special Components

- **Path Component** - Show sales stages visually
- **Guidance for Success** - Stage-specific tips
- **Key Fields** - Highlight fields needed for current stage

---

## Quote

### Business Context

Quote formalizes pricing and terms. Users need to see status, totals, and expiration at a glance. Quote Lines are critical related data.

### Recommended Sections

| Section | Fields | Rationale |
|---------|--------|-----------|
| **Quote Details** | Quote Name/Number, Opportunity, Account, Status | Identification and linkage |
| **Pricing** | Subtotal, Discount, Tax, Total Price, Grand Total | Financial summary |
| **Addresses** | Billing Address, Shipping Address | Delivery information |
| **Terms** | Expiration Date, Description, Contract Terms | Legal context |
| **System** | Owner, Created Date, Syncing | Process information |

### Related Lists (Priority Order)

1. **Quote Line Items** - Essential - the actual products/services
2. **Quote Documents/PDFs** - Generated quote documents
3. **Activities** - Communication about the quote
4. **Files** - Supporting materials

### Compact Layout

**Recommended Fields (4):**
1. Status - Current state (Draft, Needs Review, Approved)
2. Total Price / Grand Total - Deal value
3. Expiration Date - Urgency indicator
4. Opportunity - Deal context

### Default Tab

**Details** - Users need to see and update quote information, especially during approval processes.

### Persona Variations

| Persona | Emphasis |
|---------|----------|
| Sales Rep | Discount limits, Approval status, Expiration |
| Sales Manager | Approval history, Margin/Discount analysis |
| Finance | Tax, Terms, Payment schedule |
| Operations | Shipping, Delivery dates |

### CPQ Considerations

If using Salesforce CPQ (SBQQ):
- Quote object may be `SBQQ__Quote__c` with custom label
- Additional pricing fields: SBQQ__NetAmount__c, SBQQ__ListAmount__c
- Approval status fields: SBQQ__Status__c
- Always check org for custom labels (e.g., "Quote" → "Order Form")

---

## Quote Line Item

### Business Context

Quote Line Items are detail records - usually viewed in context of their parent Quote. Individual record pages are less common but needed for editing specific lines.

### Recommended Sections

| Section | Fields | Rationale |
|---------|--------|-----------|
| **Product Details** | Product, Description, Quantity, Unit Price | What's being quoted |
| **Pricing** | List Price, Discount, Total Price | Financial details |
| **Service Info** | Service Date, Line Number | Delivery and ordering |

### Related Lists

Quote Line Items typically don't have related lists - they are the related list of Quote.

### Compact Layout

**Recommended Fields (3):**
1. Product - What this line is for
2. Quantity - How many
3. Total Price - Line total

### Default Tab

**Details** - When users do access a Quote Line record directly, it's to view or edit the line details.

### Persona Variations

| Persona | Emphasis |
|---------|----------|
| Sales Rep | Discount, Unit Price, Description |
| Finance | Revenue recognition dates, Cost |
| Operations | Service Date, Delivery requirements |

### CPQ Considerations

If using Salesforce CPQ:
- Object may be `SBQQ__QuoteLine__c`
- Additional fields: SBQQ__NetPrice__c, SBQQ__PartnerPrice__c
- Bundle structure: SBQQ__RequiredBy__c (parent bundle)
- Subscription terms: SBQQ__SubscriptionTerm__c

---

## Custom Objects

### General Approach

For custom objects not covered above:

1. **Identify the object's role:**
   - Is it a primary record (like Account)?
   - Is it a detail record (like Quote Line)?
   - Is it a junction object?

2. **Determine primary users:**
   - Which personas interact with this object?
   - What's their primary task?

3. **Apply standard patterns:**
   - Master-detail children: Minimal layout, viewed via related list
   - Primary records: Full layout with related lists
   - Junction objects: Usually minimal, navigation-focused

4. **Section organization:**
   - **Record Identity** - Name, Owner, key identifiers
   - **Business Data** - Core business fields
   - **Related Context** - Lookup fields, master record info
   - **System/Audit** - Dates, created by (often collapsed)

### Layout Complexity Guidelines

| Object Type | Fields on Layout | Related Lists | Compact Fields |
|-------------|------------------|---------------|----------------|
| Primary (Account-like) | 30-50 | 4-8 | 4-5 |
| Supporting (Contact-like) | 20-35 | 2-5 | 3-4 |
| Detail (Line Item-like) | 10-20 | 0-2 | 3 |
| Junction | 5-10 | 0-1 | 2-3 |
