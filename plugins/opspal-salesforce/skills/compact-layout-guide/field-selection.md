# Compact Layout Field Selection

## Selection Framework

### Step 1: Identify Primary Use Case

**What do users need to know at a glance?**

| Object Role | Primary Need | Focus On |
|-------------|--------------|----------|
| Hub (Account) | Identify, navigate | Categorization, owner |
| Contact Point | Reach out | Contact methods, preferences |
| Transaction | Status check | Amount, date, status |
| Support | Priority triage | Priority, status, customer |

### Step 2: Score Candidate Fields

Rate each potential field (1-10):

| Factor | Weight | Questions |
|--------|--------|-----------|
| Identification | 3x | Does it help identify the record uniquely? |
| Actionability | 2.5x | Can users act on this (call, email, click)? |
| Frequency | 2x | How often is this needed at a glance? |
| Decision Value | 1.5x | Does seeing this help users decide what to do? |
| Space Efficiency | 1x | Is the value short enough to display? |

**Score = (ID × 3) + (Act × 2.5) + (Freq × 2) + (Decision × 1.5) + (Space × 1)**

### Step 3: Select Top 4-5

Choose highest scoring fields that:
- Don't duplicate information
- Fit in limited display space
- Cover different use cases (identify + status + action)

---

## Object-by-Object Selection

### Account

**Candidate Fields:**

| Field | ID | Action | Freq | Decision | Space | Score | Include? |
|-------|-----|--------|------|----------|-------|-------|----------|
| Phone | 2 | 10 | 8 | 5 | 8 | 55.5 | **Yes** |
| Industry | 7 | 1 | 7 | 8 | 8 | 45.5 | **Yes** |
| Owner | 5 | 3 | 6 | 6 | 7 | 39.5 | **Yes** |
| Rating | 4 | 1 | 6 | 9 | 10 | 41.0 | **Yes** |
| Type | 6 | 1 | 5 | 7 | 8 | 38.0 | Alternative |
| Annual Revenue | 3 | 1 | 4 | 8 | 4 | 29.5 | No (too long) |
| Website | 3 | 5 | 3 | 3 | 4 | 25.0 | No |
| Billing City | 4 | 1 | 3 | 2 | 7 | 23.5 | No |

**Final Selection:** Phone, Industry, Owner, Rating

---

### Contact

**Candidate Fields:**

| Field | ID | Action | Freq | Decision | Space | Score | Include? |
|-------|-----|--------|------|----------|-------|-------|----------|
| Phone | 2 | 10 | 9 | 6 | 8 | 57.0 | **Yes** |
| Email | 2 | 10 | 9 | 6 | 5 | 54.0 | **Yes** |
| Account | 8 | 3 | 7 | 5 | 6 | 44.0 | **Yes** |
| DoNotCall Indicator | 3 | 2 | 8 | 10 | 10 | 47.0 | **Yes** |
| EmailOptOut Indicator | 3 | 2 | 8 | 10 | 10 | 47.0 | **Yes** |
| Title | 5 | 1 | 5 | 4 | 6 | 28.5 | Alternative |
| Department | 4 | 1 | 4 | 3 | 6 | 24.0 | No |

**Final Selection:** Phone, Email, Account, DoNotCall Indicator (or combined indicator)

---

### Opportunity

**Candidate Fields:**

| Field | ID | Action | Freq | Decision | Space | Score | Include? |
|-------|-----|--------|------|----------|-------|-------|----------|
| Amount | 4 | 1 | 9 | 10 | 7 | 48.5 | **Yes** |
| Close Date | 3 | 1 | 9 | 10 | 8 | 48.0 | **Yes** |
| Stage | 5 | 1 | 9 | 10 | 8 | 51.0 | **Yes** |
| Account | 7 | 2 | 7 | 6 | 6 | 42.0 | **Yes** |
| Probability | 3 | 1 | 5 | 8 | 10 | 37.5 | Alternative |
| Owner | 4 | 2 | 5 | 5 | 7 | 32.0 | No (Account more useful) |
| Next Step | 2 | 1 | 6 | 7 | 3 | 29.0 | No (too long) |

**Final Selection:** Amount, Close Date, Stage, Account

---

### Lead

**Candidate Fields:**

| Field | ID | Action | Freq | Decision | Space | Score | Include? |
|-------|-----|--------|------|----------|-------|-------|----------|
| Company | 8 | 2 | 8 | 6 | 6 | 45.0 | **Yes** |
| Status | 5 | 1 | 9 | 9 | 8 | 48.0 | **Yes** |
| Phone | 2 | 10 | 7 | 5 | 8 | 49.5 | **Yes** |
| Rating | 4 | 1 | 7 | 9 | 10 | 42.5 | **Yes** |
| Email | 2 | 10 | 6 | 4 | 5 | 43.0 | Alternative |
| Industry | 5 | 1 | 5 | 6 | 8 | 33.5 | No |
| Lead Source | 3 | 1 | 4 | 5 | 7 | 27.0 | No |

**Final Selection:** Company, Status, Phone, Rating

---

### Case

**Candidate Fields:**

| Field | ID | Action | Freq | Decision | Space | Score | Include? |
|-------|-----|--------|------|----------|-------|-------|----------|
| Priority | 3 | 1 | 9 | 10 | 10 | 48.5 | **Yes** |
| Status | 4 | 1 | 9 | 10 | 8 | 49.5 | **Yes** |
| Contact | 6 | 3 | 7 | 6 | 6 | 40.5 | **Yes** |
| Account | 7 | 2 | 7 | 6 | 6 | 42.0 | **Yes** |
| Subject | 8 | 1 | 6 | 5 | 3 | 35.0 | No (too long) |
| Owner | 4 | 2 | 5 | 5 | 7 | 32.0 | Alternative |

**Final Selection:** Priority, Status, Contact, Account

---

### Quote

**Candidate Fields:**

| Field | ID | Action | Freq | Decision | Space | Score | Include? |
|-------|-----|--------|------|----------|-------|-------|----------|
| Status | 5 | 1 | 9 | 10 | 8 | 50.0 | **Yes** |
| Grand Total | 4 | 1 | 9 | 10 | 6 | 47.5 | **Yes** |
| Expiration Date | 3 | 1 | 8 | 10 | 8 | 45.5 | **Yes** |
| Opportunity | 6 | 2 | 7 | 6 | 5 | 38.0 | **Yes** |
| Discount | 3 | 1 | 5 | 7 | 8 | 33.0 | Alternative |
| Account | 5 | 2 | 5 | 4 | 6 | 31.0 | No (Opp has context) |

**Final Selection:** Status, Grand Total, Expiration Date, Opportunity

---

### Quote Line Item

**Candidate Fields:**

| Field | ID | Action | Freq | Decision | Space | Score | Include? |
|-------|-----|--------|------|----------|-------|-------|----------|
| Product | 9 | 1 | 8 | 6 | 5 | 46.5 | **Yes** |
| Quantity | 5 | 1 | 8 | 8 | 10 | 45.5 | **Yes** |
| Total Price | 4 | 1 | 8 | 9 | 7 | 44.0 | **Yes** |
| Unit Price | 3 | 1 | 5 | 6 | 7 | 30.5 | Alternative |
| Discount | 3 | 1 | 4 | 6 | 8 | 29.0 | No |

**Final Selection:** Product, Quantity, Total Price

---

## Custom Object Selection Guide

For custom objects not listed above:

### Step 1: Classify the Object

| Object Type | Example | Primary Compact Focus |
|-------------|---------|----------------------|
| Master | Account-like parent | Identification + Owner |
| Detail | Line item, child | Key value + Quantity |
| Transaction | Order, Invoice | Status + Amount + Date |
| Reference | Product, Price Book | Name + Category |
| Junction | Many-to-many link | Both related records |

### Step 2: Apply Type-Specific Patterns

**Master Objects:**
- Name (usually automatic)
- Categorization field (Type, Industry, Category)
- Owner or responsible party
- Key metric (Revenue, Value)

**Detail Objects:**
- Parent reference
- Key value (Amount, Quantity)
- Status if applicable

**Transaction Objects:**
- Status (Draft, Submitted, Approved)
- Amount/Value
- Date (Due, Expiration, Close)
- Related party (Account, Contact)

**Reference Objects:**
- Category/Type
- Active status
- Key identifier

### Step 3: Validate Selection

- [ ] Does it fit in ~5 fields?
- [ ] Does each field serve a different purpose?
- [ ] Can users quickly identify the record?
- [ ] Are actionable fields (Phone, Email) included if relevant?
- [ ] Are status/compliance indicators visible?

---

## Field Types to Avoid

| Field Type | Issue | Alternative |
|------------|-------|-------------|
| Long Text | Truncates awkwardly | Use short summary field |
| Rich Text | Doesn't render | Use plain text |
| Formula (long) | May truncate | Create compact formula |
| Lookup (nested) | Shows ID not name | Include directly |
| Multi-select Picklist | May be too long | Create summary formula |
