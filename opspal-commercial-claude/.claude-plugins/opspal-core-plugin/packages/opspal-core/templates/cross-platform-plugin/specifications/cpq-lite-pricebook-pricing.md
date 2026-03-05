# CPQ-Lite: Multi-Tier Pricebook and Dynamic Pricing Implementation

## Overview
Implement a lightweight CPQ solution focused on multi-tier pricebooks, dynamic pricing rules, and discount management without full Salesforce CPQ. This provides core quoting capabilities for standard product sales with tiered pricing and automated discounts.

## Business Objectives
- Enable sales reps to generate accurate quotes with correct pricing in under 2 minutes
- Support 3-tier pricing model (Standard, Partner, Enterprise) across product portfolio
- Automate discount approval workflows based on margin thresholds
- Reduce pricing errors from manual quote creation by 90%

## Scope

### In Scope
- Standard and custom pricebooks (3 tiers)
- Product catalog with tiered pricing
- Price calculation rules and formulas
- Discount schedules and approval workflows
- Quote object customization
- Basic quote line item configuration
- Integration with Opportunity for quote conversion

### Out of Scope
- Full Salesforce CPQ package
- Advanced product configuration/bundles
- Contract amendments and renewals
- Subscription billing
- Multi-currency support (can be added later)

### Assumptions
- Standard Salesforce org (not using Salesforce CPQ package)
- Less than 500 products in catalog
- Sales team of ~20 users
- 3-tier pricing model sufficient for business needs
- All pricing in USD initially

## Requirements

### REQ-001: Create Pricebook Structure
**Type**: Data
**Priority**: Critical
**Platform**: Salesforce
**Complexity**: Moderate

**Description**:
Create a 3-tier pricebook structure with Standard Pricebook, Partner Pricebook, and Enterprise Pricebook. Each pricebook will contain the same products with different price points reflecting volume discounts and relationship pricing.

**Acceptance Criteria**:
- Standard Pricebook configured as default
- Partner Pricebook created with 15% average discount vs Standard
- Enterprise Pricebook created with 25% average discount vs Standard
- All three pricebooks contain identical product entries
- Pricebook selection logic documented
- Sales profiles granted access to all pricebooks

**Dependencies**: None

**Estimated Effort**: 6 hours

**Implementation Notes**:
- Use standard Salesforce Pricebook2 object
- Create custom field on Opportunity to track pricebook tier
- Document pricebook assignment rules

---

### REQ-002: Product Catalog Setup
**Type**: Data
**Priority**: Critical
**Platform**: Salesforce
**Complexity**: Moderate

**Description**:
Set up product catalog with 50 initial products across 5 product families. Each product must have entries in all 3 pricebooks with appropriate pricing.

**Acceptance Criteria**:
- Product2 records created for 50 products
- Products organized into 5 product families (Software, Services, Hardware, Support, Training)
- Each product has standard price entry in all 3 pricebooks
- Product codes follow naming convention: [FAMILY]-[NUMBER]
- Product descriptions complete
- Active status set correctly for all products

**Dependencies**: REQ-001

**Estimated Effort**: 8 hours

**Implementation Notes**:
- Use data loader for bulk product creation
- Maintain product catalog in spreadsheet for reference
- Include product images/documentation links

---

### REQ-003: Price Calculation Fields
**Type**: Functional
**Priority**: High
**Platform**: Salesforce
**Complexity**: Moderate

**Description**:
Add custom fields to OpportunityLineItem (Quote Line) to support price calculations, discounts, and margin tracking.

**Acceptance Criteria**:
- Custom fields added: List_Price__c, Discount_Percent__c, Discount_Amount__c, Net_Price__c, Cost__c, Margin__c, Margin_Percent__c
- Formula fields calculate correctly
- Fields appear on page layout in logical order
- Read-only fields (calculated) are locked
- Field-level security set appropriately
- Fields work with standard Opportunity Products

**Dependencies**: REQ-002

**Estimated Effort**: 4 hours

**Implementation Notes**:
- Net_Price__c = List_Price__c - Discount_Amount__c
- Margin__c = Net_Price__c - Cost__c
- Margin_Percent__c = (Margin__c / Net_Price__c) * 100

---

### REQ-004: Dynamic Pricing Rules
**Type**: Functional
**Priority**: High
**Platform**: Salesforce
**Complexity**: Complex

**Description**:
Implement automated pricing rules that apply discounts based on quantity, product family, and opportunity attributes. Rules should execute when products are added to opportunities.

**Acceptance Criteria**:
- Volume discount rule: 10% for qty 10-49, 15% for qty 50-99, 20% for qty 100+
- Product family bundle discount: 5% when 3+ different families on quote
- Strategic account discount: Additional 5% for accounts with Strategic_Account__c = true
- Rules execute via Process Builder or Flow on OpportunityLineItem create/update
- Discount amounts calculated and populated automatically
- Discount rules logged in custom Pricing_Log__c object
- No manual discount entry required for standard scenarios

**Dependencies**: REQ-003

**Estimated Effort**: 12 hours

**Implementation Notes**:
- Use Flow for better maintainability
- Create Decision Matrix custom metadata type for rule configuration
- Allow sales ops to update rules without code changes

---

### REQ-005: Discount Approval Workflow
**Type**: Functional
**Priority**: High
**Platform**: Salesforce
**Complexity**: Complex

**Description**:
Create approval workflow for discounts exceeding margin thresholds. Different approval levels based on margin percentage.

**Acceptance Criteria**:
- Automatic approval: Margin > 30%
- Sales Manager approval: Margin 20-30%
- VP Sales approval: Margin 10-20%
- SVP/CFO approval: Margin < 10%
- Approval process triggers when Opportunity stage = "Proposal"
- Email notifications sent to approvers
- Comments required for rejections
- Approval history tracked on Opportunity
- Mobile approval enabled

**Dependencies**: REQ-003, REQ-004

**Estimated Effort**: 10 hours

**Implementation Notes**:
- Use standard Salesforce Approval Process
- Configure approval matrix in custom metadata
- Set up delegated approvers for escalations

---

### REQ-006: Quote Object Customization
**Type**: Data
**Priority**: High
**Platform**: Salesforce
**Complexity**: Moderate

**Description**:
Customize standard Quote object to support CPQ-Lite workflows including quote versioning, expiration tracking, and conversion to orders.

**Acceptance Criteria**:
- Custom fields added: Quote_Version__c, Expires_On__c, Approval_Status__c, Total_Discount__c, Total_Margin__c
- Quote versioning logic implemented (auto-increment)
- Quote expiration validation rule (must be future date)
- Quote total calculations include all line items
- Quote PDF template configured with branding
- Quote conversion to Opportunity creates matching line items
- Quote status picklist values: Draft, Pending Approval, Approved, Rejected, Sent, Accepted

**Dependencies**: REQ-003

**Estimated Effort**: 8 hours

**Implementation Notes**:
- Use standard Quote object, not custom
- Quote versioning via Flow on Quote create/clone
- PDF generation uses Visualforce or standard Quote PDF

---

### REQ-007: Quote Line Item Layout
**Type**: Functional
**Priority**: Medium
**Platform**: Salesforce
**Complexity**: Simple

**Description**:
Configure Quote Line Item layout and related lists for optimal quoting workflow.

**Acceptance Criteria**:
- Quote line item related list shows: Product, Quantity, List Price, Discount %, Net Price, Margin %
- Inline editing enabled for quantity and discount fields
- Related list sorted by Product Family then Product Code
- Quick action for "Add Product" from Quote
- Roll-up summary fields on Quote show total: Amount, Discount, Margin
- Mobile layout configured

**Dependencies**: REQ-006

**Estimated Effort**: 4 hours

**Implementation Notes**:
- Use standard QuoteLineItem object
- Customize related list columns
- Test mobile layout thoroughly

---

### REQ-008: Pricing Reports and Dashboard
**Type**: Functional
**Priority**: Medium
**Platform**: Salesforce
**Complexity**: Moderate

**Description**:
Create reports and dashboard for sales leadership to monitor pricing effectiveness, discount trends, and margin analysis.

**Acceptance Criteria**:
- Report: Quotes by Pricebook Tier (last 90 days)
- Report: Average Discount by Product Family
- Report: Margin Analysis by Sales Rep
- Report: Approval Times by Approval Level
- Dashboard with 6 components showing key pricing metrics
- Dashboard refreshes daily
- Shared with Sales Management and Sales Ops
- Export to Excel capability enabled

**Dependencies**: REQ-006, REQ-007

**Estimated Effort**: 6 hours

**Implementation Notes**:
- Use matrix reports for discount analysis
- Add trend charts for historical view
- Schedule email delivery to leadership weekly

---

### REQ-009: Product Pricing Data Migration
**Type**: Data
**Priority**: Critical
**Platform**: Salesforce
**Complexity**: Complex

**Description**:
Migrate existing pricing data from spreadsheets into Salesforce pricebooks and product catalog.

**Acceptance Criteria**:
- Data mapping document created from existing pricing sheets
- Product master data validated (no duplicates, naming consistent)
- Test migration completed in sandbox
- All 50 products loaded with 3 price points each (150 pricebook entries)
- Data validation: All prices positive, Enterprise < Partner < Standard
- Cost data migrated for margin calculations
- Production migration completed successfully
- Rollback plan documented

**Dependencies**: REQ-001, REQ-002

**Estimated Effort**: 12 hours

**Implementation Notes**:
- Use Data Loader for pricebook entries (many-to-many)
- Validate data quality before production load
- Keep backup of source spreadsheets

---

### REQ-010: Sales User Training Materials
**Type**: Documentation
**Priority**: High
**Platform**: Salesforce
**Complexity**: Simple

**Description**:
Create training materials and quick reference guides for sales team on new quoting process.

**Acceptance Criteria**:
- Step-by-step guide: "Creating a Quote in CPQ-Lite"
- Quick reference card: Pricebook selection rules
- Video walkthrough: Adding products and applying discounts
- FAQ document addressing common pricing scenarios
- Training session conducted with sales team
- Feedback collected and incorporated
- Documentation stored in Salesforce Files

**Dependencies**: REQ-007

**Estimated Effort**: 6 hours

**Implementation Notes**:
- Include screenshots in guides
- Create 5-minute video tutorial
- Offer live Q&A session

---

### REQ-011: UAT and Testing
**Type**: Testing
**Priority**: Critical
**Platform**: Salesforce
**Complexity**: Moderate

**Description**:
Complete comprehensive testing of all CPQ-Lite functionality with sales team participation.

**Acceptance Criteria**:
- Test plan created covering all requirements
- Unit tests for all pricing formulas (10+ scenarios)
- Integration tests for approval workflows
- UAT with 5 sales reps completing real quotes
- Edge cases tested (zero qty, 100% discount, negative margin)
- Performance tested (quotes with 50+ line items)
- Mobile app tested on iOS and Android
- All critical/high bugs resolved before production
- UAT sign-off from Sales VP

**Dependencies**: REQ-001 through REQ-010

**Estimated Effort**: 16 hours

**Implementation Notes**:
- Use sandbox for all testing
- Document all test scenarios
- Create test accounts/opportunities for UAT

---

### REQ-012: Production Deployment
**Type**: Deployment
**Priority**: Critical
**Platform**: Salesforce
**Complexity**: Moderate

**Description**:
Deploy all CPQ-Lite components to production environment following change management process.

**Acceptance Criteria**:
- Change set created with all metadata
- Dependencies validated (no missing components)
- Deployment to production successful
- Post-deployment validation: Create test quote end-to-end
- Data migration completed (products and pricing)
- User permissions activated
- Rollback plan ready and tested
- Go-live communication sent to sales team

**Dependencies**: REQ-011

**Estimated Effort**: 6 hours

**Implementation Notes**:
- Schedule deployment for weekend
- Have admin on standby for issues
- Monitor first day usage closely

---

## Technical Details

### Platforms
- Salesforce (Production org: production-alias)
- Salesforce (Sandbox: uat-sandbox)

### Data Volume
- Small (< 1,000 records)
- 50 products
- 150 pricebook entries (3 per product)
- Expected 200 quotes/month

### Objects Used
- Product2 (Standard)
- Pricebook2 (Standard)
- PricebookEntry (Standard)
- Quote (Standard)
- QuoteLineItem (Standard)
- OpportunityLineItem (Standard, with customization)
- Pricing_Log__c (Custom, for audit trail)

### Automation
- Flow: Product pricing automation
- Process Builder: Quote version increment
- Approval Process: Discount approvals
- Formula Fields: Margin calculations

### Complexity Assessment
- Moderate: Some automation, standard objects with customization, approval workflows

### Security Requirements
- Pricing data: Internal use only
- Discount approval: Manager+ visibility
- Margin data: VP Sales+ visibility
- FLS configured per role

## Timeline

### Milestones
- **Week 1**: Foundation (REQ-001, REQ-002, REQ-003)
- **Week 2**: Pricing Rules (REQ-004, REQ-005, REQ-006)
- **Week 3**: Configuration & Reporting (REQ-007, REQ-008, REQ-009)
- **Week 4**: Testing & Deployment (REQ-010, REQ-011, REQ-012)

### Start Date
2025-11-01

### Target Completion
2025-11-29

### Critical Deadlines
- Week 1 Review: 2025-11-08
- UAT Start: 2025-11-22
- Production Deployment: 2025-11-29

## Stakeholders

### Project Owner
VP Sales

### Technical Lead
Salesforce Administrator

### End Users
Sales Team (20 users)
Sales Operations (2 users)

### Approvers
- VP Sales - Functional approval
- IT Director - Technical approval
- Finance Director - Pricing/margin approval

## Success Criteria

### Functional Success
- [ ] All 12 requirements implemented per acceptance criteria
- [ ] Sales team can create quotes in under 2 minutes
- [ ] Pricing errors reduced by 90% (tracked first month)
- [ ] Discount approval cycle time under 24 hours
- [ ] UAT completed with stakeholder approval

### Technical Success
- [ ] All pricing formulas tested with 100% accuracy
- [ ] Approval workflows processing correctly
- [ ] Performance: Quote with 50 line items loads in <3 seconds
- [ ] Mobile app fully functional
- [ ] Security review completed

### Business Success
- [ ] Deployment completed on schedule
- [ ] All 20 sales reps trained
- [ ] Documentation delivered
- [ ] 100% quote accuracy in first week
- [ ] Sales velocity maintained or improved

## Risks & Mitigation

### Identified Risks
1. **Risk**: Pricing data migration reveals inconsistencies in source data
   - **Impact**: High
   - **Probability**: Medium
   - **Mitigation**: Complete data audit 2 weeks before migration, clean data in spreadsheet first, allocate 4 hours buffer time

2. **Risk**: Sales team resistance to new quoting process
   - **Impact**: High
   - **Probability**: Medium
   - **Mitigation**: Early user involvement in UAT, excellent training materials, dedicated support first 2 weeks

3. **Risk**: Complex discount scenarios not covered by automated rules
   - **Impact**: Medium
   - **Probability**: High
   - **Mitigation**: Manual override capability, escalation process documented, collect scenarios in first month for future automation

4. **Risk**: Approval workflow delays quote turnaround
   - **Impact**: Medium
   - **Probability**: Low
   - **Mitigation**: Set up delegated approvers, mobile approval enabled, SLA monitoring

## Appendices

### References
- Existing pricing spreadsheet: [Link]
- Pricebook selection rules: [Link]
- Product catalog master: [Link]

### Glossary
- **CPQ-Lite**: Lightweight Configure-Price-Quote solution using standard Salesforce objects
- **Pricebook Tier**: Level of pricing (Standard, Partner, Enterprise)
- **Net Price**: Final price after discounts applied
- **Margin**: Difference between net price and cost

---

**Template Version**: 1.0 (CPQ-Lite)
**Last Updated**: 2025-10-25
**Created By**: RevPal Engineering
