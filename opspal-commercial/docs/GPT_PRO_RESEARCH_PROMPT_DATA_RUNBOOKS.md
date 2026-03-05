# GPT Pro Research Prompt: HubSpot Data Quality & Validation Runbooks

**Context:** This is a research request for developing 5 comprehensive technical runbooks for HubSpot data quality and validation operations. These runbooks will be used by AI agents and RevOps consultants at RevPal to perform consistent, high-quality HubSpot implementations.

---

## Research Scope

You are tasked with deep research for **5 HubSpot Data Quality & Validation Runbooks**:

1. **Property Validation Fundamentals**
2. **Property Population Monitoring & Data Completeness**
3. **Integration Health Checks (Salesforce Sync, Stripe, and Native Integrations)**
4. **Data Enrichment Strategies & Automation**
5. **Duplicate Detection, Deduplication, and Merge Operations**

---

## Background: RevPal Plugin Ecosystem

**What We Do:**
- RevPal provides AI-powered RevOps consulting for Salesforce and HubSpot
- We have 221 specialized AI agents across 9 plugins
- We've built 51 comprehensive runbooks for Salesforce operations
- We need parity for HubSpot with 80+ runbooks total

**Current HubSpot Infrastructure:**
- 44 specialized agents (hubspot-workflow-builder, hubspot-data-hygiene-specialist, etc.)
- Validation Framework (5-stage error prevention system)
- Living Runbook System (agents consult org-specific runbooks before operations)
- Sub-Agent Utilization Booster (automatic routing to specialized agents)

**Why Runbooks Matter:**
- Agents use runbooks to understand platform-specific patterns
- Reduce errors by 40-80% through documented best practices
- Enable faster operations (30-60% time savings)
- Ensure consistent quality across customer engagements

**Existing Salesforce Equivalents:**
We have comprehensive Salesforce runbooks covering:
- Field population monitoring (3 runbooks)
- Validation rule management (8 runbooks)
- Data quality operations (3 runbooks)
- Integration health checks (2 runbooks)

---

## Your Research Mission

For EACH of the 5 runbooks, conduct **comprehensive research** and provide:

### A. HubSpot Platform Research (Primary Focus)

#### 1. Official HubSpot Capabilities
- **API Endpoints**: Document all relevant REST API endpoints with:
  - Exact endpoint URLs
  - Request/response schemas
  - Rate limits and quotas
  - Required scopes/permissions
  - Pagination patterns
  - Error codes and handling

- **HubSpot UI Capabilities**: Document built-in features:
  - Where in HubSpot UI to access features
  - Settings locations (Settings > Data Management, etc.)
  - Built-in validation tools
  - Native reporting capabilities
  - Workflow actions available

- **HubSpot CLI**: If applicable, document CLI commands:
  - Installation and setup
  - Relevant commands for this topic
  - Output formats

- **Property System**: For validation/monitoring runbooks:
  - Property types and constraints
  - Calculated properties
  - Dependent properties
  - Property groups
  - Internal vs external properties
  - Historical tracking capabilities

#### 2. HubSpot Best Practices & Official Guidance
Search HubSpot Knowledge Base, Developer Docs, and Community:
- Official recommendations from HubSpot
- Common pitfalls and gotchas
- Performance considerations
- Scalability limits
- Deprecation warnings

#### 3. Real-World Implementation Patterns
Research how consultants and developers actually implement these operations:
- Common workflows and automations
- Integration patterns
- Custom code solutions (when necessary)
- Third-party tools used
- Workarounds for platform limitations

---

### B. Technical Requirements Analysis

#### 1. Data Structures
- What objects are involved? (Contacts, Companies, Deals, Custom Objects)
- What properties are commonly validated/monitored?
- What relationships matter?
- What are the data dependencies?

#### 2. Validation Rules & Constraints
- What can be validated natively in HubSpot?
- What requires custom code or workflows?
- What are the technical limitations?
- What are the governor limits?

#### 3. Error Scenarios & Edge Cases
- What commonly goes wrong?
- What are the failure modes?
- How do you detect issues?
- What are recovery strategies?

#### 4. Performance Considerations
- API call volume for typical operations
- Bulk operation limits
- Workflow execution limits
- Time to completion for common tasks

---

### C. Integration-Specific Research (for Runbook #3)

For the **Integration Health Checks** runbook, deeply research:

#### Salesforce Integration
- Bidirectional sync mechanics
- Field mapping patterns
- Conflict resolution strategies
- Sync frequency and quotas
- Error detection and alerting
- Historical sync data access
- Sync health monitoring API endpoints

#### Stripe Integration (Payments)
- Payment syncing patterns
- Subscription data sync
- Invoice and customer sync
- Error handling for failed payments
- Webhook configuration
- Retry logic

#### Other Native Integrations
- Zoom, Gmail, Outlook, LinkedIn
- What data syncs?
- What can go wrong?
- How to monitor health?

---

### D. Comparison with Salesforce

For context, compare HubSpot capabilities to Salesforce equivalents:

| Capability | Salesforce | HubSpot | Notes |
|------------|-----------|---------|-------|
| Validation Rules | Native, formula-based | Workflow-based or API | |
| Field Tracking | Field History Tracking | Property History | |
| Data Quality Tools | Data.com, Einstein | Native enrichment | |
| Integration Monitoring | Platform Events | Webhooks + API | |
| Deduplication | Native merge API | Manual + API | |

**What's Different in HubSpot?**
- Where HubSpot is stronger/weaker than Salesforce
- Unique capabilities in HubSpot
- Gaps that require workarounds

---

### E. Operational Workflows

For EACH runbook, document typical operational workflows:

#### Pre-Operation Checklist
- What to verify before starting
- Prerequisites and dependencies
- Required permissions
- Data backup considerations

#### Step-by-Step Procedures
- Numbered steps for common operations
- Decision trees for conditional logic
- Expected outcomes at each step
- Validation checkpoints

#### Post-Operation Validation
- How to verify success
- What to monitor
- Rollback procedures
- Documentation requirements

---

### F. Troubleshooting & Common Issues

Research and document:

#### Frequent Problems
- Top 10 issues consultants encounter
- Error messages and meanings
- Symptoms and root causes

#### Diagnostic Procedures
- How to identify the issue
- What data to collect
- Where to look for logs

#### Resolution Steps
- Step-by-step fixes
- When to escalate to HubSpot support
- Workarounds for known limitations

---

## Specific Research Questions by Runbook

### Runbook 1: Property Validation Fundamentals

**Key Research Questions:**
1. What are ALL property types in HubSpot and their validation constraints?
   - Single-line text, multi-line text, number, date, dropdown, radio, checkbox, multiple checkboxes, file
   - Length limits, character restrictions, format requirements

2. How do you enforce required properties?
   - Native "required field" settings vs workflow enforcement
   - Form submission validation vs API validation
   - Conditional requirements (required if X is true)

3. What validation happens automatically vs must be custom-built?
   - Email format validation (native)
   - Phone number formatting (native)
   - URL validation (native)
   - Custom business logic (requires workflows)

4. How do you validate dependent properties?
   - Example: If "Country" = "USA", then "State" is required
   - Workflow patterns for conditional validation

5. What are the API endpoints for property validation?
   - Validate before create/update
   - Bulk validation
   - Validation error response formats

6. How do you handle validation in different contexts?
   - Forms (marketing/CMS)
   - Workflows
   - API imports
   - Manual data entry
   - Sales tools (sequences, templates)

7. What are common validation patterns RevOps teams need?
   - Email domain validation (corporate vs personal)
   - Phone number standardization
   - Company name normalization
   - Revenue/amount field validation
   - Date logic (renewal date must be future)

8. How do you audit existing validation coverage?
   - Which properties have validation?
   - Which are required but not enforced?
   - Validation rule documentation

**Expected Deliverables:**
- Complete property type reference with validation constraints
- Decision matrix: When to use native validation vs workflows vs API
- 10+ validation pattern templates (email domain, phone format, etc.)
- Validation testing checklist
- API code examples (Node.js preferred)

---

### Runbook 2: Property Population Monitoring & Data Completeness

**Key Research Questions:**
1. How do you measure data completeness in HubSpot?
   - Native "property activity" reporting
   - Custom reports for null/empty detection
   - API queries for completeness scoring

2. What are the completeness metrics that matter?
   - Contact completeness (email, phone, company, lifecycle stage)
   - Company completeness (domain, industry, revenue, employee count)
   - Deal completeness (amount, close date, stage, owner)

3. How do you monitor property population over time?
   - Trend analysis (are fields getting more complete?)
   - Cohort analysis (are new records more complete?)
   - Source analysis (which sources provide complete data?)

4. What automation can improve completeness?
   - Workflows to prompt sales reps to fill missing data
   - Enrichment integrations (Clearbit, ZoomInfo)
   - Lead scoring penalties for incomplete records

5. How do you identify which properties are most critical?
   - Usage analysis (which properties are used in workflows, reports)
   - Business impact scoring
   - Segmentation requirements

6. What are the API patterns for completeness monitoring?
   - Batch queries for property population
   - Filtering for empty/null values
   - Aggregation for completeness scores

7. How do you alert on data quality degradation?
   - Completeness drops below threshold
   - Critical properties not populated
   - Data quality SLAs

8. Integration-specific completeness:
   - Salesforce sync: Which fields sync, which don't?
   - Form submissions: Default completeness levels
   - API imports: Validation before import

**Expected Deliverables:**
- Completeness scoring formula and implementation
- Top 20 critical properties by object (Contact, Company, Deal)
- Automated monitoring workflow templates
- Completeness dashboard design (what to track)
- API query examples for completeness analysis
- Alert threshold recommendations

---

### Runbook 3: Integration Health Checks (Salesforce, Stripe, Native)

**Key Research Questions:**

#### Salesforce Sync
1. What are the technical mechanics of HubSpot-Salesforce sync?
   - Bidirectional field mapping
   - Sync frequency and triggers
   - Conflict resolution (last write wins? manual resolution?)
   - Object mapping (Contact→Lead/Contact, Company→Account, Deal→Opportunity)

2. How do you monitor sync health?
   - API endpoints for sync status
   - Sync error logs (where are they? API access?)
   - Sync history queries
   - Failed sync detection

3. What are common sync errors and causes?
   - Field mapping mismatches (type differences)
   - Required field missing in target system
   - Picklist value not found
   - Duplicate detection conflicts
   - API rate limit exceeded
   - Permission errors

4. How do you validate field mappings?
   - Bidirectional mapping validation
   - Data type compatibility checks
   - Picklist value alignment
   - Formula field handling

5. What are the sync limitations and quotas?
   - Daily sync limits
   - API call consumption
   - Field mapping limits
   - Objects that can/cannot sync

6. How do you test sync before production?
   - Sandbox sync setup
   - Test data patterns
   - Rollback procedures

#### Stripe Integration
1. What data syncs from Stripe to HubSpot?
   - Customers → Companies/Contacts
   - Subscriptions → Deals or custom objects
   - Invoices → Line items
   - Payment methods

2. How is payment data kept in sync?
   - Real-time webhooks vs batch sync
   - Failed payment handling
   - Subscription lifecycle (trial, active, canceled, past_due)

3. What are common Stripe sync issues?
   - Webhook delivery failures
   - Data mapping inconsistencies
   - Currency handling
   - Tax calculation mismatches

4. How do you monitor Stripe sync health?
   - Webhook delivery monitoring
   - API health checks
   - Data freshness validation
   - Revenue reconciliation

#### Native Integrations (Zoom, Gmail, Outlook, LinkedIn)
1. What data syncs from each integration?
2. How do you verify integration health?
3. What are common failure modes?
4. How do you re-authenticate when tokens expire?

**Expected Deliverables:**
- Integration health check checklist (15+ checks per integration)
- Sync error code reference with resolution steps
- Monitoring dashboard design (what metrics to track)
- API query examples for sync status
- Automated health check workflow templates
- Troubleshooting decision tree for sync issues
- Field mapping validation scripts

---

### Runbook 4: Data Enrichment Strategies & Automation

**Key Research Questions:**
1. What are HubSpot's native enrichment capabilities?
   - Company insights (automatic company data enrichment)
   - Breeze Intelligence (AI-powered enrichment)
   - Prospects tool
   - Website visitor identification

2. What third-party enrichment integrations work with HubSpot?
   - Clearbit
   - ZoomInfo
   - 6sense
   - Demandbase
   - Custom APIs (Apollo, Hunter.io)

3. How do you automate enrichment workflows?
   - Trigger enrichment on record creation
   - Scheduled enrichment for stale data
   - Conditional enrichment (only if missing data)
   - Batch enrichment for existing records

4. What properties should be enriched?
   - Contact: Job title, seniority, department, phone, social profiles
   - Company: Industry, size, revenue, technology stack, funding
   - Deal: Competitive intelligence, buying signals

5. How do you measure enrichment effectiveness?
   - Before/after completeness scores
   - Enrichment accuracy validation
   - Cost per enriched record
   - Impact on conversion rates

6. What are the data quality considerations?
   - Overwriting existing data (when to replace vs preserve)
   - Enrichment data staleness
   - Multiple source conflicts
   - Data provenance tracking

7. How do you handle enrichment failures?
   - No data found
   - Low confidence matches
   - API errors
   - Rate limit exceeded

8. What are the API patterns for enrichment?
   - Batch enrichment
   - Real-time enrichment
   - Webhook-triggered enrichment
   - Manual trigger workflows

**Expected Deliverables:**
- Enrichment source comparison matrix (Clearbit vs ZoomInfo vs native)
- Enrichment workflow templates (5+ scenarios)
- Property priority list (which to enrich first)
- Enrichment ROI calculation framework
- API integration examples for top 3 enrichment sources
- Data overwrite decision logic
- Enrichment monitoring dashboard design

---

### Runbook 5: Duplicate Detection, Deduplication, and Merge Operations

**Key Research Questions:**
1. How does HubSpot detect duplicates?
   - Automatic duplicate detection rules
   - Detection criteria (email, company domain, phone, name)
   - Custom duplicate rules
   - API duplicate detection

2. What are HubSpot's native deduplication capabilities?
   - Manual merge in UI
   - Bulk merge limitations
   - API merge endpoints
   - Merge preview functionality

3. How do you design a comprehensive deduplication strategy?
   - Detection criteria (exact match vs fuzzy match)
   - Similarity scoring algorithms
   - Canonical record selection (which record to keep)
   - Data merge rules (for each property)

4. What are the technical mechanics of merging?
   - Primary record selection
   - Property value resolution (keep primary, keep secondary, concatenate, keep most recent)
   - Association preservation (contacts, deals, tickets)
   - Activity history merging
   - Email subscription status handling

5. How do you prevent duplicate creation?
   - Form submission de-duplication
   - API import de-duplication
   - Workflow de-duplication checks
   - Integration duplicate handling (Salesforce sync)

6. What are the risks and safety measures for deduplication?
   - Data loss prevention
   - Accidental merges (undo capabilities?)
   - Backup before merge
   - Dry-run/preview functionality
   - Audit logging

7. How do you handle complex duplicate scenarios?
   - Multiple potential matches (3+ duplicates)
   - Cross-object duplicates (Contact and Company)
   - Partial matches (similar but not identical)
   - Merged records that need un-merging

8. What are the API endpoints and patterns?
   - Search for duplicates
   - Merge via API
   - Batch deduplication
   - Duplicate detection configuration

**Expected Deliverables:**
- Duplicate detection criteria matrix (by object)
- Canonical record selection algorithm
- Property merge logic decision tree (20+ common properties)
- Deduplication workflow templates (manual and automated)
- Safety checklist (10+ pre-merge validations)
- API code examples for merge operations
- Duplicate prevention strategies (5+ scenarios)
- Rollback/undo procedures

---

## Research Sources to Consult

### Primary Sources (Authoritative)
1. **HubSpot Developer Documentation**
   - https://developers.hubspot.com/docs/api/overview
   - REST API reference
   - Webhooks documentation
   - OAuth and authentication

2. **HubSpot Knowledge Base**
   - https://knowledge.hubspot.com/
   - Product guides
   - Best practices
   - Feature documentation

3. **HubSpot Community**
   - https://community.hubspot.com/
   - Real-world problems and solutions
   - User discussions
   - Feature requests and limitations

4. **HubSpot Academy**
   - https://academy.hubspot.com/
   - Certification courses
   - Training videos
   - Implementation guides

### Secondary Sources (Industry Knowledge)
1. **RevOps Blogs & Publications**
   - Winning by Design
   - RevOps Co-op
   - SaaStr
   - OpenView Partners

2. **HubSpot Partner Ecosystem**
   - Implementation partner case studies
   - Integration partner documentation
   - Solution provider best practices

3. **GitHub & Code Examples**
   - Open source HubSpot libraries
   - Integration examples
   - Workflow templates

4. **Stack Overflow & Developer Forums**
   - Common coding problems
   - API usage patterns
   - Workarounds for limitations

---

## Output Format Requirements

For EACH of the 5 runbooks, provide your research in this structure:

### 1. Executive Summary (300-500 words)
- What is this runbook about?
- Why does it matter for RevOps?
- What are the key capabilities in HubSpot?
- What are the major limitations or gotchas?

### 2. Platform Capabilities Reference (Comprehensive)

#### A. Native HubSpot Features
Table format:
| Feature | Location | Capabilities | Limitations | API Access |
|---------|----------|--------------|-------------|-----------|
| ... | ... | ... | ... | ... |

#### B. API Endpoints
For each relevant endpoint:
```
Endpoint: GET/POST/PATCH /crm/v3/objects/{objectType}
Purpose: [what it does]
Required Scopes: [OAuth scopes needed]
Rate Limit: [requests per second]
Request Schema: [JSON structure]
Response Schema: [JSON structure]
Error Codes: [common errors]
Code Example: [Node.js snippet]
```

#### C. Workflow Actions
List all relevant workflow actions with:
- Action name
- When to use it
- Configuration options
- Limitations

### 3. Technical Implementation Patterns (5-10 patterns)

For each pattern:
```markdown
**Pattern: [Name]**
Use Case: [When to use this]
Prerequisites: [What's needed]
Steps:
1. [Step 1]
2. [Step 2]
3. [Step 3]
Validation: [How to verify success]
Edge Cases: [What can go wrong]
Code Example: [If applicable]
```

### 4. Operational Workflows (3-5 workflows)

For each workflow:
```markdown
**Workflow: [Name]**

Pre-Operation Checklist:
- [ ] [Requirement 1]
- [ ] [Requirement 2]

Steps:
1. [Detailed step 1]
   - Expected outcome: [what you should see]
   - If error: [troubleshooting step]
2. [Detailed step 2]
   ...

Post-Operation Validation:
- [ ] [Validation check 1]
- [ ] [Validation check 2]

Rollback Procedure:
[How to undo if needed]
```

### 5. Troubleshooting Guide

```markdown
**Issue: [Problem Description]**
Symptoms:
- [Symptom 1]
- [Symptom 2]

Root Causes:
1. [Cause 1]: [How to identify]
2. [Cause 2]: [How to identify]

Resolution Steps:
1. [Step 1]
2. [Step 2]

Prevention:
[How to avoid in future]
```

### 6. API Code Examples

Provide working code examples in **Node.js** for:
- Most common operations (3-5 examples)
- Error handling patterns
- Batch operations
- Authentication

### 7. Best Practices & Recommendations (10+ practices)

Numbered list of specific, actionable recommendations:
1. **[Practice]**: [Why it matters] - [How to implement]
2. ...

### 8. Comparison with Salesforce

```markdown
| Capability | Salesforce | HubSpot | Winner | Notes |
|------------|-----------|---------|--------|-------|
| [Feature 1] | [How SFDC does it] | [How HS does it] | [SFDC/HS/Tie] | [Key differences] |
```

### 9. Common Pitfalls & Gotchas (10+ gotchas)

```markdown
**Gotcha: [Issue]**
What Happens: [Problem description]
Why It Happens: [Root cause]
How to Avoid: [Prevention]
How to Fix: [Solution if it happens]
```

### 10. Research Confidence Assessment

For each section, rate your confidence:
- ✅ **HIGH**: Official HubSpot documentation confirmed
- ⚠️ **MEDIUM**: Based on community knowledge, needs validation
- ❓ **LOW**: Inference or assumption, requires testing

### 11. Open Questions & Gaps

List anything you couldn't find authoritative information about:
- [ ] [Question 1]
- [ ] [Question 2]

---

## Research Quality Standards

### Depth Requirements
- Cite specific HubSpot documentation pages (include URLs)
- Provide exact API endpoint paths and methods
- Include code examples that actually work (tested if possible)
- Document version numbers (API versions, UI features)
- Note any recent changes or deprecations

### Breadth Requirements
- Cover ALL relevant HubSpot objects (Contact, Company, Deal, Ticket, Custom Objects)
- Include multiple implementation approaches (UI, API, Workflows)
- Address different user personas (admin, developer, consultant)
- Consider different HubSpot tiers (Starter, Professional, Enterprise)

### Accuracy Requirements
- Cross-reference multiple sources when possible
- Flag unverified claims clearly
- Distinguish between "HubSpot recommends" vs "common practice"
- Note any conflicting information found
- Indicate when workarounds are needed vs native support

---

## Timeline & Deliverables

**Research Timeline:**
- Research Phase: 2-3 weeks (deep research for all 5 runbooks)
- Documentation Phase: 1-2 weeks (format into runbook structure)
- Review Phase: 1 week (RevPal SME validation)

**Expected Output:**
For EACH runbook (5 total):
- Research document: 5,000-8,000 words
- Code examples: 10-15 working snippets
- Workflow diagrams: 3-5 visual workflows (Mermaid or text descriptions)
- API reference: Complete endpoint documentation
- Troubleshooting guide: 15+ common issues with resolutions

**Total Research Volume:** 25,000-40,000 words across all 5 runbooks

---

## Success Criteria

Your research will be considered complete when:

1. **Comprehensiveness**: All research questions answered with citations
2. **Actionability**: Enough detail for an AI agent or consultant to execute
3. **Accuracy**: Information verified from multiple authoritative sources
4. **Practicality**: Includes real-world examples and common scenarios
5. **Troubleshooting**: Addresses what goes wrong and how to fix it
6. **Code Quality**: All code examples are syntactically correct and follow best practices
7. **Completeness**: No major gaps or unanswered questions

---

## Research Deliverable Format

Submit your research as **5 separate documents** (one per runbook):

1. `01_property_validation_fundamentals_research.md`
2. `02_property_population_monitoring_research.md`
3. `03_integration_health_checks_research.md`
4. `04_data_enrichment_strategies_research.md`
5. `05_duplicate_detection_deduplication_research.md`

Each document should follow the "Output Format Requirements" structure above.

---

## Additional Context

**Why This Matters:**
These runbooks will be used by 44 HubSpot agents and RevPal consultants to deliver consistent, high-quality implementations for customers. Poor documentation leads to errors, delays, and customer dissatisfaction. Your thorough research will directly impact the quality of RevPal's HubSpot services.

**Audience:**
- Primary: AI agents (need precise, executable instructions)
- Secondary: RevOps consultants (need context and best practices)
- Tertiary: RevPal customers (may reference for self-service)

**Constraints:**
- Must work across HubSpot tiers (Starter, Professional, Enterprise)
- Must be maintainable (document versioning, changelog)
- Must be testable (include validation steps)

---

## Questions for GPT Pro Researcher

If you need clarification during research, document these questions:
1. What HubSpot tier should I optimize for? (Answer: Professional tier as baseline)
2. Should I include deprecated features? (Answer: Note them but don't recommend)
3. What depth for third-party integrations? (Answer: Cover top 3 per category)
4. How much code vs UI instructions? (Answer: 60% API, 40% UI)

---

## Begin Your Research

You are now ready to conduct comprehensive research for these 5 HubSpot data quality and validation runbooks. Prioritize authoritative sources, document everything, and deliver research that enables RevPal to build world-class HubSpot operational capabilities.

**Good luck, and thank you for your thorough research!**
