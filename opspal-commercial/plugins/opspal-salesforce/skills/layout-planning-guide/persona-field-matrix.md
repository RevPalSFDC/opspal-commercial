# Persona-Field Priority Matrix

## Overview

This matrix shows field importance by persona for common Salesforce objects. Use these priorities when designing layouts for specific user roles.

**Priority Levels:**
- **CRITICAL (90-100)** - Must be visible and prominent
- **IMPORTANT (75-89)** - Should be visible in main sections
- **CONTEXTUAL (50-74)** - Include based on use case
- **LOW (25-49)** - Consider removing or collapsing
- **MINIMAL (0-24)** - Exclude unless specifically requested

---

## Account Fields

| Field | Sales Rep | Sales Manager | Executive | Support Agent | Support Manager | Marketing | Customer Success |
|-------|-----------|---------------|-----------|---------------|-----------------|-----------|------------------|
| Name | 100 | 100 | 100 | 100 | 100 | 100 | 100 |
| Owner | 85 | 95 | 60 | 50 | 80 | 60 | 80 |
| Industry | 80 | 85 | 90 | 40 | 40 | 85 | 75 |
| Type | 75 | 80 | 70 | 60 | 60 | 70 | 85 |
| Phone | 95 | 70 | 30 | 95 | 70 | 50 | 85 |
| Website | 70 | 50 | 40 | 50 | 40 | 80 | 60 |
| Rating | 80 | 90 | 85 | 40 | 50 | 70 | 80 |
| Annual Revenue | 85 | 90 | 95 | 30 | 40 | 75 | 90 |
| Number of Employees | 60 | 65 | 70 | 20 | 30 | 75 | 65 |
| Billing Address | 70 | 50 | 30 | 60 | 50 | 40 | 50 |
| Shipping Address | 60 | 40 | 20 | 70 | 60 | 30 | 40 |
| SLA | 40 | 50 | 40 | 95 | 95 | 30 | 70 |
| Account Source | 65 | 60 | 50 | 30 | 30 | 90 | 60 |
| Description | 50 | 40 | 35 | 60 | 50 | 55 | 50 |

---

## Contact Fields

| Field | Sales Rep | Sales Manager | Executive | Support Agent | Support Manager | Marketing | Customer Success |
|-------|-----------|---------------|-----------|---------------|-----------------|-----------|------------------|
| Name | 100 | 100 | 100 | 100 | 100 | 100 | 100 |
| Account | 95 | 90 | 85 | 95 | 90 | 85 | 95 |
| Title | 85 | 80 | 75 | 60 | 60 | 80 | 80 |
| Phone | 95 | 70 | 30 | 95 | 70 | 60 | 85 |
| Mobile | 80 | 50 | 20 | 80 | 50 | 50 | 70 |
| Email | 95 | 70 | 30 | 90 | 70 | 95 | 85 |
| Department | 60 | 70 | 50 | 50 | 50 | 70 | 65 |
| Reports To | 50 | 65 | 40 | 30 | 40 | 60 | 55 |
| Lead Source | 60 | 55 | 40 | 20 | 25 | 95 | 50 |
| Do Not Call | 90 | 75 | 40 | 90 | 85 | 85 | 80 |
| Has Opted Out of Email | 80 | 65 | 30 | 70 | 70 | 95 | 75 |
| Mailing Address | 65 | 50 | 25 | 70 | 55 | 50 | 55 |
| Owner | 70 | 85 | 50 | 50 | 75 | 55 | 75 |
| Description | 45 | 40 | 30 | 55 | 45 | 50 | 50 |

---

## Opportunity Fields

| Field | Sales Rep | Sales Manager | Executive | Support Agent | Support Manager | Marketing | Customer Success |
|-------|-----------|---------------|-----------|---------------|-----------------|-----------|------------------|
| Name | 100 | 100 | 100 | 70 | 70 | 85 | 95 |
| Account | 95 | 95 | 90 | 80 | 75 | 80 | 95 |
| Stage | 100 | 100 | 95 | 50 | 50 | 70 | 85 |
| Amount | 95 | 100 | 100 | 40 | 40 | 75 | 90 |
| Close Date | 95 | 100 | 95 | 40 | 40 | 65 | 85 |
| Probability | 70 | 90 | 85 | 20 | 20 | 50 | 60 |
| Owner | 80 | 95 | 70 | 40 | 60 | 50 | 75 |
| Type | 75 | 80 | 70 | 40 | 40 | 75 | 80 |
| Lead Source | 65 | 60 | 50 | 20 | 20 | 95 | 55 |
| Campaign | 55 | 50 | 45 | 15 | 15 | 100 | 45 |
| Forecast Category | 60 | 95 | 90 | 15 | 15 | 40 | 55 |
| Next Step | 90 | 85 | 60 | 30 | 30 | 40 | 70 |
| Description | 60 | 50 | 40 | 40 | 40 | 50 | 55 |
| Contact | 85 | 75 | 50 | 60 | 50 | 65 | 80 |
| Created Date | 50 | 60 | 55 | 30 | 35 | 70 | 50 |
| Last Activity Date | 75 | 85 | 60 | 40 | 50 | 50 | 70 |

---

## Quote Fields

| Field | Sales Rep | Sales Manager | Executive | Support Agent | Support Manager | Marketing | Customer Success |
|-------|-----------|---------------|-----------|---------------|-----------------|-----------|------------------|
| Quote Name/Number | 100 | 100 | 100 | 60 | 60 | 50 | 85 |
| Opportunity | 95 | 90 | 80 | 50 | 50 | 45 | 85 |
| Account | 90 | 85 | 80 | 70 | 65 | 55 | 90 |
| Status | 100 | 95 | 90 | 60 | 65 | 40 | 85 |
| Total Price | 95 | 100 | 100 | 50 | 50 | 50 | 90 |
| Discount | 85 | 95 | 80 | 30 | 35 | 35 | 70 |
| Tax | 70 | 75 | 60 | 40 | 40 | 25 | 55 |
| Grand Total | 90 | 95 | 95 | 45 | 45 | 45 | 85 |
| Expiration Date | 95 | 90 | 75 | 40 | 45 | 35 | 80 |
| Contact | 80 | 70 | 50 | 55 | 50 | 40 | 75 |
| Billing Address | 75 | 60 | 40 | 50 | 45 | 30 | 55 |
| Shipping Address | 70 | 55 | 35 | 55 | 50 | 25 | 50 |
| Description | 60 | 50 | 40 | 45 | 40 | 35 | 50 |
| Owner | 70 | 90 | 60 | 40 | 70 | 35 | 70 |
| Syncing | 65 | 70 | 45 | 25 | 30 | 20 | 45 |

---

## Quote Line Item Fields

| Field | Sales Rep | Sales Manager | Executive | Support Agent | Support Manager | Marketing | Customer Success |
|-------|-----------|---------------|-----------|---------------|-----------------|-----------|------------------|
| Product | 100 | 100 | 90 | 60 | 55 | 50 | 90 |
| Quantity | 95 | 95 | 85 | 50 | 50 | 40 | 85 |
| Unit Price | 90 | 95 | 80 | 40 | 40 | 35 | 80 |
| Discount | 85 | 95 | 75 | 30 | 35 | 30 | 70 |
| Total Price | 90 | 95 | 90 | 45 | 45 | 40 | 85 |
| Description | 60 | 50 | 40 | 45 | 40 | 35 | 55 |
| Service Date | 65 | 60 | 50 | 70 | 65 | 30 | 75 |
| Line Number | 50 | 55 | 30 | 30 | 35 | 20 | 40 |

---

## Using This Matrix

### For Layout Design

1. **Filter by persona** - Get the column for your target user role
2. **Sort by priority** - Focus on CRITICAL and IMPORTANT fields first
3. **Apply object context** - Consider the object's role in user workflow

### For Multi-Persona Layouts

When a layout serves multiple personas:
1. Calculate average priority across relevant personas
2. Include fields with average ≥ 70
3. Use visibility rules for persona-specific fields ≥ 85 for one but <50 for others

### For Custom Fields

Apply similar scoring based on:
- **Business criticality** - How important to the business process?
- **Usage frequency** - How often is this field viewed/edited?
- **Decision impact** - Does this field drive user decisions?

Example scoring formula for custom fields:
```
Priority = (Business Criticality × 0.4) +
           (Usage Frequency × 0.35) +
           (Decision Impact × 0.25)
```
