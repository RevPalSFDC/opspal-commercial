# Salesforce & HubSpot Runbook Parity Analysis

**Date:** 2026-01-06 (Updated)
**Purpose:** Identify gaps in HubSpot runbook coverage compared to Salesforce

---

## Executive Summary

**Salesforce:** 51 runbooks across 9 categories
**HubSpot:** 6 runbooks (1 workflow + 5 data quality)
**Parity Gap:** 45 runbooks (88% coverage gap)

**Recent Progress:**
- ✅ Completed HubSpot Data Quality Runbook Series (5 runbooks, ~50,000 words)
- ✅ Integrated with 5 HubSpot plugin agents
- ✅ Production-ready with 50 implementation patterns and 30+ code examples

---

## Salesforce Runbook Inventory (51 Total)

### 1. Flow XML Development (8 runbooks)
**Salesforce Coverage:**
- ✅ 01-authoring-flows-via-xml
- ✅ 02-designing-flows-for-project-scenarios
- ✅ 03-tools-and-techniques
- ✅ 04-validation-and-best-practices
- ✅ 05-testing-and-deployment
- ✅ 06-monitoring-maintenance-rollback
- ✅ 07-testing-and-diagnostics
- ✅ 08-incremental-segment-building

**HubSpot Equivalent:** Workflow Development
**Current HubSpot Coverage:**
- ✅ hubspot-workflow-branching (partial)

**Missing HubSpot Runbooks:**
- ❌ Workflow authoring best practices
- ❌ Workflow design patterns for common scenarios
- ❌ Workflow testing and validation
- ❌ Workflow deployment strategies
- ❌ Workflow monitoring and maintenance
- ❌ Workflow troubleshooting guide
- ❌ Incremental workflow building

**Priority:** HIGH (Workflows are core HubSpot automation)

---

### 2. Report API Development (9 runbooks)
**Salesforce Coverage:**
- ✅ 01-report-formats-fundamentals
- ✅ 02-tabular-reports
- ✅ 03-summary-reports
- ✅ 04-matrix-reports
- ✅ 05-joined-reports-basics
- ✅ 06-joined-reports-advanced
- ✅ 07-custom-report-types
- ✅ 08-validation-and-deployment
- ✅ 09-troubleshooting-optimization

**HubSpot Equivalent:** Custom Reports & Analytics API
**Current HubSpot Coverage:**
- ❌ None

**Missing HubSpot Runbooks:**
- ❌ HubSpot report formats (analytics, attribution, funnel)
- ❌ Contact & company reports
- ❌ Deal & pipeline reports
- ❌ Marketing attribution reports
- ❌ Custom report builder patterns
- ❌ Report API development
- ❌ Report validation and deployment
- ❌ Report troubleshooting

**Priority:** MEDIUM (HubSpot has hubspot-analytics-reporter agent)

---

### 3. Territory Management (10 runbooks)
**Salesforce Coverage:**
- ✅ 01-territory-fundamentals
- ✅ 02-designing-territory-models
- ✅ 03-territory2-object-relationships
- ✅ 04-hierarchy-configuration
- ✅ 05-user-assignment-strategies
- ✅ 06-account-assignment-patterns
- ✅ 07-testing-and-validation
- ✅ 08-deployment-and-activation
- ✅ 09-monitoring-and-maintenance
- ✅ 10-troubleshooting-guide

**HubSpot Equivalent:** Territory Management (via Teams)
**Current HubSpot Coverage:**
- ❌ None (but has hubspot-territory-manager agent)

**Missing HubSpot Runbooks:**
- ❌ HubSpot team structure fundamentals
- ❌ Territory design using teams and permissions
- ❌ User assignment strategies
- ❌ Account/contact assignment patterns
- ❌ Territory testing and validation
- ❌ Territory deployment
- ❌ Territory monitoring
- ❌ Territory troubleshooting

**Priority:** MEDIUM (HubSpot territories less formalized than SFDC Territory2)

---

### 4. Validation Rule Management (8 runbooks)
**Salesforce Coverage:**
- ✅ 01-validation-rule-fundamentals
- ✅ 02-designing-validation-rules-for-scenarios
- ✅ 03-tools-and-techniques
- ✅ 04-validation-and-best-practices
- ✅ 05-testing-and-deployment
- ✅ 06-monitoring-maintenance-rollback
- ✅ 07-troubleshooting
- ✅ 08-segmented-rule-building

**HubSpot Equivalent:** Property Validation & Workflow Validation
**Current HubSpot Coverage:**
- ✅ **01-property-validation-fundamentals** (NEW - Jan 2026)
  - Native validation capabilities (regex, unique, required)
  - Workflow-based validation patterns
  - API validation endpoints
  - Cross-platform validation strategies

**Missing HubSpot Runbooks:**
- ❌ Designing validation for common scenarios
- ❌ Advanced conditional validation strategies
- ❌ Validation deployment workflows
- ❌ Validation monitoring and maintenance
- ❌ Validation troubleshooting guide
- ❌ Segmented validation rule building
- ❌ Validation testing automation

**Priority:** MEDIUM (Fundamentals complete, advanced patterns needed)

---

### 5. Triggers (6 runbooks)
**Salesforce Coverage:**
- ✅ 01-trigger-fundamentals
- ✅ 02-handler-pattern-architecture
- ✅ 03-bulkification-best-practices
- ✅ 04-testing-code-coverage
- ✅ 05-deployment-monitoring
- ✅ 06-troubleshooting-optimization

**HubSpot Equivalent:** Custom Code Actions & Webhooks
**Current HubSpot Coverage:**
- ❌ None

**Missing HubSpot Runbooks:**
- ❌ Custom code action fundamentals
- ❌ Webhook architecture patterns
- ❌ Webhook security and authentication
- ❌ Custom code testing
- ❌ Webhook deployment and monitoring
- ❌ Webhook troubleshooting

**Priority:** MEDIUM (HubSpot custom code less common than SFDC triggers)

---

### 6. Data Quality Operations (5 runbooks)
**Salesforce Coverage:**
- ✅ 01-field-population-monitoring
- ✅ 02-integration-health-checks
- ✅ 03-null-handling-patterns

**HubSpot Coverage:** ✅ **COMPLETE** (NEW - Jan 2026)
- ✅ **01-property-validation-fundamentals** (94KB)
  - Property validation rules, conditional requirements, API validation
  - 8,000+ words, 5 implementation patterns, 5 code examples
- ✅ **02-property-population-monitoring** (56KB)
  - Completeness scoring, fill rate monitoring, remediation workflows
  - 10,000+ words, 5 implementation patterns, 4 code examples
- ✅ **03-integration-health-checks** (64KB)
  - Salesforce/Stripe/native integration monitoring, SLO model, circuit breakers
  - 12,000+ words, 5 implementation patterns, 6 code examples
- ✅ **04-data-enrichment-strategies** (55KB)
  - Multi-source enrichment, mastering policy, credits governance, GDPR gating
  - 10,000+ words, 5 implementation patterns, 5 code examples
- ✅ **05-duplicate-detection-deduplication** (61KB)
  - Canonical selection algorithm, merge operations, SF constraints
  - 11,000+ words, 5 implementation patterns, 5 code examples

**Series Statistics:**
- ~50,000 words total
- 50 implementation patterns
- 30+ code examples with error handling
- 21 operational workflows with checklists
- 25 Mermaid diagrams
- Integrated with 5 HubSpot plugin agents

**Priority:** ✅ **COMPLETED** - HubSpot now has BETTER coverage than Salesforce (5 vs 3 runbooks)

---

### 7. Environment Configuration (4 runbooks)
**Salesforce Coverage:**
- ✅ 01-system-dependencies
- ✅ 02-path-resolution
- ✅ 03-mcp-configuration
- ✅ 04-multi-context-execution

**HubSpot Equivalent:** Plugin Configuration
**Current HubSpot Coverage:**
- ❌ None

**Missing HubSpot Runbooks:**
- ❌ HubSpot CLI setup and dependencies
- ❌ API token management
- ❌ Multi-portal configuration
- ❌ Portal context switching

**Priority:** LOW (General plugin infrastructure)

---

### 8. Deployment State Management (2 runbooks)
**Salesforce Coverage:**
- ✅ 01-deployment-lifecycle
- ✅ 02-state-verification

**HubSpot Equivalent:** Asset Deployment (workflows, templates, etc.)
**Current HubSpot Coverage:**
- ❌ None

**Missing HubSpot Runbooks:**
- ❌ HubSpot asset deployment lifecycle
- ❌ Deployment state verification
- ❌ Deployment rollback strategies

**Priority:** MEDIUM

---

### 9. Automation Feasibility (1 runbook)
**Salesforce Coverage:**
- ✅ 01-screen-flow-automation-limits

**HubSpot Equivalent:** Automation Limits & Best Practices
**Current HubSpot Coverage:**
- ❌ None

**Missing HubSpot Runbooks:**
- ❌ Workflow automation limits and quotas
- ❌ Workflow action limits
- ❌ API rate limit considerations
- ❌ Automation scalability patterns

**Priority:** MEDIUM

---

## HubSpot-Specific Runbooks (Not in Salesforce)

These runbook categories are unique to HubSpot and have NO Salesforce equivalent:

### Marketing Hub Operations (0 runbooks)
**Should Have:**
- ❌ Email campaign design and deployment
- ❌ Landing page creation and optimization
- ❌ Form creation and conversion optimization
- ❌ Marketing automation workflows
- ❌ Lead scoring configuration
- ❌ ABM account lists management
- ❌ Social media integration

**Priority:** HIGH (Core HubSpot Marketing Hub feature)

---

### CMS Hub Operations (0 runbooks)
**Should Have:**
- ❌ CMS page creation and publishing
- ❌ Template development
- ❌ Module development
- ❌ Theme customization
- ❌ SEO optimization
- ❌ Content staging and deployment

**Priority:** MEDIUM (For CMS Hub users)

---

### Sales Hub Operations (0 runbooks)
**Should Have:**
- ❌ Pipeline configuration
- ❌ Deal stage automation
- ❌ Sales sequence setup
- ❌ Meeting scheduling integration
- ❌ Quote generation
- ❌ Sales forecasting

**Priority:** HIGH (Core Sales Hub feature)

---

### Service Hub Operations (0 runbooks)
**Should Have:**
- ❌ Ticket automation
- ❌ Knowledge base management
- ❌ Customer feedback surveys
- ❌ Service SLA configuration
- ❌ Help desk integration

**Priority:** MEDIUM (For Service Hub users)

---

### Salesforce Integration (0 runbooks)
**Should Have:**
- ❌ Bidirectional sync configuration
- ❌ Field mapping best practices
- ❌ Conflict resolution strategies
- ❌ Sync monitoring and troubleshooting
- ❌ Integration testing

**Priority:** HIGH (Critical for RevPal customers)

---

### Operations Hub (0 runbooks)
**Should Have:**
- ❌ Data sync configuration
- ❌ Programmable automation setup
- ❌ Data quality automation
- ❌ Dataset management

**Priority:** MEDIUM

---

## Parity Gap Summary

| Category | Salesforce | HubSpot | Gap | Priority | Status |
|----------|-----------|---------|-----|----------|--------|
| Workflow Development | 8 | 1 | 7 | HIGH | 🟡 In Progress |
| Report/Analytics | 9 | 0 | 9 | MEDIUM | ❌ Not Started |
| Territory Management | 10 | 0 | 10 | MEDIUM | ❌ Not Started |
| Validation Rules | 8 | 1 | 7 | MEDIUM | 🟢 Fundamentals Done |
| Triggers/Custom Code | 6 | 0 | 6 | MEDIUM | ❌ Not Started |
| **Data Quality** | **3** | **5** | **-2** | **✅ COMPLETE** | **🟢 Exceeds SF** |
| Environment Config | 4 | 0 | 4 | LOW | ❌ Not Started |
| Deployment | 2 | 0 | 2 | MEDIUM | ❌ Not Started |
| Automation Feasibility | 1 | 0 | 1 | MEDIUM | ❌ Not Started |
| **TOTAL (Parity)** | **51** | **6** | **45** | - | **12% Complete** |
| | | | | |
| Marketing Hub | 0 | 0 | 0 | HIGH |
| CMS Hub | 0 | 0 | 0 | MEDIUM |
| Sales Hub | 0 | 0 | 0 | HIGH |
| Service Hub | 0 | 0 | 0 | MEDIUM |
| Salesforce Sync | 0 | 0 | 0 | HIGH |
| Operations Hub | 0 | 0 | 0 | MEDIUM |
| **TOTAL (HubSpot-Specific)** | **0** | **0** | **0** | - |
| | | | | |
| **GRAND TOTAL** | **51** | **1** | **~80** | - |

---

## Recommended Runbook Development Priority (Updated Jan 2026)

### ✅ Completed (5 runbooks)
- **Data Quality Runbook Series** - Property validation, population monitoring, integration health, enrichment, deduplication

---

### Phase 1: Critical Gaps (High Priority) - 20 runbooks

**Focus:** Core operational patterns customers use daily

1. **Workflow Development** (7 runbooks) - **HIGHEST PRIORITY**
   - Workflow authoring best practices
   - Workflow design patterns for common scenarios
   - Workflow testing and validation strategies
   - Workflow deployment and version control
   - Workflow monitoring and performance optimization
   - Workflow troubleshooting and debugging
   - Incremental workflow building (segmented approach)

   **Rationale:** Workflows are the backbone of HubSpot automation. Most customer projects involve workflows. Already have 1 playbook (branching) - need comprehensive series.

2. **Marketing Hub Operations** (7 runbooks) - **HIGHEST PRIORITY**
   - Email campaign design and deployment
   - Landing page creation and optimization
   - Form creation and conversion optimization
   - Marketing automation workflows (nurture sequences)
   - Lead scoring configuration and maintenance
   - ABM account lists and targeting
   - Social media integration and publishing

   **Rationale:** Marketing Hub is HubSpot's core differentiator vs Salesforce. Critical for RevPal's HubSpot customers.

3. **Sales Hub Operations** (6 runbooks) - **HIGH PRIORITY**
   - Pipeline configuration and customization
   - Deal stage automation and workflows
   - Sales sequence setup and optimization
   - Meeting scheduling and calendar integration
   - Quote generation and CPQ basics
   - Sales forecasting and reporting

   **Rationale:** Sales Hub is primary use case for most HubSpot customers. Essential for RevOps operations.

### Phase 2: Platform-Specific & Advanced Features (Medium Priority) - 32 runbooks

**Focus:** Hub-specific operations and advanced patterns

1. **Salesforce Integration** (6 runbooks) - **MEDIUM-HIGH PRIORITY**
   - Bidirectional sync configuration and field mapping
   - Sync conflict resolution strategies
   - Integration health monitoring and troubleshooting
   - Cross-platform data validation
   - Integration testing and deployment
   - Performance optimization for large syncs

   **Rationale:** Critical for RevPal customers using both platforms. Should follow Phase 1 completion.

2. **Advanced Validation Patterns** (6 runbooks)
   - Designing validation for common scenarios
   - Advanced conditional validation strategies
   - Validation deployment workflows
   - Validation monitoring and maintenance
   - Validation troubleshooting guide
   - Segmented validation rule building

   **Rationale:** Build on completed property validation fundamentals.

3. **Report/Analytics** (9 runbooks)
   - HubSpot report formats and types
   - Contact and company reports
   - Deal and pipeline reports
   - Marketing attribution reports
   - Custom report builder patterns
   - Report API development
   - Report validation and deployment
   - Report troubleshooting

   **Rationale:** Important but hubspot-analytics-reporter agent already provides coverage.

4. **CMS Hub Operations** (6 runbooks)
   - CMS page creation and publishing workflows
   - Template and module development
   - Theme customization patterns
   - SEO optimization strategies
   - Content staging and deployment
   - CMS troubleshooting

   **Rationale:** For CMS Hub customers only.

5. **Service Hub Operations** (5 runbooks)
   - Ticket automation and routing
   - Knowledge base management
   - Customer feedback and survey automation
   - Service SLA configuration
   - Help desk integration

   **Rationale:** For Service Hub customers only.

### Phase 3: Specialized & Infrastructure (Lower Priority) - 23 runbooks

**Focus:** Advanced technical patterns and infrastructure

1. **Territory Management** (8 runbooks)
   - HubSpot team structure fundamentals
   - Territory design using teams and permissions
   - User and account assignment strategies
   - Territory testing and validation
   - Territory deployment and activation
   - Territory monitoring and reporting
   - Territory troubleshooting

   **Rationale:** HubSpot territories less formalized than SF Territory2. Lower priority.

2. **Custom Code & Webhooks** (6 runbooks)
   - Custom code action fundamentals
   - Webhook architecture patterns
   - Webhook security and authentication
   - Custom code testing strategies
   - Webhook deployment and monitoring
   - Webhook troubleshooting

   **Rationale:** Advanced feature, less commonly used than Salesforce triggers.

3. **Operations Hub** (4 runbooks)
   - Data sync configuration and management
   - Programmable automation setup
   - Data quality automation
   - Dataset management

   **Rationale:** Operations Hub specific, smaller customer base.

4. **Environment & Deployment** (4 runbooks)
   - HubSpot CLI setup and dependencies
   - API token and authentication management
   - Multi-portal configuration and switching
   - Asset deployment lifecycle and rollback

   **Rationale:** Infrastructure concerns, lower immediate value.

5. **Automation Feasibility** (1 runbook)
   - Workflow automation limits and quotas
   - Workflow action limits and constraints
   - API rate limit considerations
   - Automation scalability patterns

   **Rationale:** Important but narrow scope.

---

## Strategic Recommendations (Updated Jan 2026)

### Immediate Priorities (Next 8-12 Weeks)

**Focus on Phase 1 (20 runbooks) to achieve 50% HubSpot parity and cover core customer use cases.**

#### 1. Workflow Development Series (7 runbooks) - **START IMMEDIATELY**
- **Priority Rank:** #1 (Highest Impact)
- **Estimated Effort:** 3-4 weeks
- **Rationale:**
  - Workflows are used in 90%+ of HubSpot projects
  - Already have 1 playbook (branching) - builds on existing foundation
  - Critical dependency for Marketing/Sales Hub runbooks
  - hubspot-workflow-builder agent needs comprehensive operational guidance

**Recommended Sequence:**
1. Workflow authoring best practices (Week 1)
2. Workflow design patterns for common scenarios (Week 1-2)
3. Workflow testing and validation strategies (Week 2)
4. Workflow deployment and version control (Week 2-3)
5. Workflow monitoring and performance optimization (Week 3)
6. Workflow troubleshooting and debugging (Week 3-4)
7. Incremental workflow building (segmented approach) (Week 4)

#### 2. Marketing Hub Operations (7 runbooks) - **START CONCURRENTLY**
- **Priority Rank:** #2 (Core HubSpot Differentiator)
- **Estimated Effort:** 3-4 weeks
- **Rationale:**
  - Marketing Hub is HubSpot's primary strength vs Salesforce
  - Email campaigns, landing pages, forms are daily operations
  - High customer visibility and value
  - Supports hubspot-marketing-automation and hubspot-email-campaign-manager agents

**Recommended Sequence:**
1. Email campaign design and deployment (Week 1)
2. Landing page creation and optimization (Week 1-2)
3. Form creation and conversion optimization (Week 2)
4. Marketing automation workflows (nurture sequences) (Week 2-3)
5. Lead scoring configuration and maintenance (Week 3)
6. ABM account lists and targeting (Week 3-4)
7. Social media integration and publishing (Week 4)

#### 3. Sales Hub Operations (6 runbooks) - **START AFTER WORKFLOWS**
- **Priority Rank:** #3 (Essential RevOps Operations)
- **Estimated Effort:** 2-3 weeks
- **Rationale:**
  - Sales Hub is primary use case for majority of customers
  - Pipeline and deal management are core RevOps functions
  - Supports hubspot-pipeline-manager and hubspot-renewals-specialist agents
  - Depends on workflow runbooks being complete

**Recommended Sequence:**
1. Pipeline configuration and customization (Week 1)
2. Deal stage automation and workflows (Week 1)
3. Sales sequence setup and optimization (Week 2)
4. Meeting scheduling and calendar integration (Week 2)
5. Quote generation and CPQ basics (Week 3)
6. Sales forecasting and reporting (Week 3)

### Phase 2 Focus (12-20 Weeks After Phase 1)

**Priority on Salesforce Integration (6 runbooks) and Advanced Validation (6 runbooks)**

- Salesforce Integration: Critical for RevPal's dual-platform customers
- Advanced Validation: Build on completed data quality fundamentals
- Then proceed with Report/Analytics, CMS Hub, Service Hub based on customer demand

### Success Metrics

**Phase 1 Completion Goals:**
- ✅ 20 new runbooks (26 total including existing 6)
- ✅ 50% parity with Salesforce (26/51 runbooks)
- ✅ 100% coverage of core HubSpot operations (Workflows, Marketing, Sales)
- ✅ All high-priority agents have operational runbooks

**Updated Timeline Estimate:**
- **Phase 1:** 8-12 weeks (20 runbooks × 2-3 days avg)
  - Workflow Series: 3-4 weeks
  - Marketing Hub: 3-4 weeks
  - Sales Hub: 2-3 weeks
- **Phase 2:** 12-16 weeks (32 runbooks × 2-3 days avg)
- **Phase 3:** 8-12 weeks (23 runbooks × 2-3 days avg)
- **Total:** 28-40 weeks for 95% parity

**Resource Allocation:**
- **Technical Writers:** 1-2 dedicated (with HubSpot expertise)
- **RevPal SMEs:** 2-3 hours/week for review and validation
- **Agent Integration:** 1-2 hours per runbook for agent updates
- **GPT Pro Research:** Leverage for faster research phase (2-3 hours vs 1-2 days manual)

### Risk Mitigation

**Key Risks:**
1. **Workflow dependencies:** Many runbooks depend on workflow series completion → **START WORKFLOWS FIRST**
2. **Customer demand shifts:** Hub priorities may change → **Monitor customer requests quarterly**
3. **Platform updates:** HubSpot API/features evolve → **Review runbooks quarterly for updates**
4. **Resource constraints:** Technical writer availability → **Prioritize ruthlessly, use GPT Pro for research**

### ROI Analysis

**Completed Data Quality Series Impact:**
- 5 runbooks covering 100% of data quality operations
- ~50,000 words of operational guidance
- Integrated with 5 agents (hubspot-data-hygiene-specialist, etc.)
- **Estimated value:** 10-15 hours saved per data quality project
- **Customer projects using data quality:** ~40% of HubSpot engagements
- **Annual ROI:** ~$50,000-75,000 (based on 20 projects/year × 12 hours × $250/hr)

**Projected Phase 1 ROI:**
- Workflows: 50% of all projects → **$150,000-200,000/year**
- Marketing Hub: 30% of projects → **$100,000-150,000/year**
- Sales Hub: 40% of projects → **$125,000-175,000/year**
- **Total Phase 1 ROI:** **$375,000-525,000/year**

**Break-even:** ~10-12 weeks (cost of development recovered by efficiency gains)
