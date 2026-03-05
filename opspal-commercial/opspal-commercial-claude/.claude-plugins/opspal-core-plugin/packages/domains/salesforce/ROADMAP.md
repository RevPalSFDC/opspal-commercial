# Salesforce Automation Audit - Product Roadmap

**Current Version**: v3.29.0 (Phase 1 HIGH Impact Enhancements - October 2025)

This roadmap outlines planned enhancements based on comprehensive stakeholder feedback and gap analysis.

---

## ✅ Completed Milestones

### v3.29.0 - Phase 1 HIGH Impact Enhancements (October 2025)
**Status**: ✅ SHIPPED

**Delivered**:
1. **Process Builder Field Write Extraction** - Complete PB field write parsing (410 lines)
2. **Final Writer Determination** - 13-position execution order resolution (362 lines)
3. **Recursion Risk Detection** - Static guard analysis for triggers and flows (496 lines)
4. **Scheduled Automation Detection** - CronTrigger queries and scheduled Flow parsing (411 lines)
5. **Hardcoded Artifact Scanner** - Migration blocker detection (555 lines)

**ROI**: 18-24 hours saved per audit, eliminates manual analysis

---

## 🎯 v3.30.0 - Coverage & Accuracy Enhancements (Q4 2025)

**Target Release**: November 2025
**Focus**: Close coverage gaps, improve signal quality, add actionable deliverables
**Effort**: 4-6 hours implementation + validation

### Priority 1: Critical Coverage Gaps (HIGH Impact / LOW-MEDIUM Effort)

#### 1. Platform Event-Triggered Automation (A3)
**Problem**: Off-transaction automation chains invisible in current collision analysis
**Impact**: HIGH - PE chains can write records outside user context
**Effort**: MEDIUM (3-4 hours)

**Implementation**:
- Detect Apex triggers on `__e` objects via `ApexTrigger.TableEnumOrId LIKE '%__e'`
- Identify PE-triggered Flows via `FlowDefinitionView.TriggerType = 'PlatformEvent'`
- Parse resulting record operations into Field Write Map
- Add PE cascade visualization to dependency graphs

**Deliverables**:
- `platform-event-automation-detector.js` (est. 350 lines)
- New section in Master Automation Inventory: "Platform Events"
- PE-triggered chains in CASCADE_ANALYSIS.md

**API Sources**:
- Tooling API: `ApexTrigger`, `FlowDefinitionView`
- MDAPI: Flow metadata retrieval

---

#### 2. Approvals, Assignment & Escalation Rules (A4)
**Problem**: These write fields (OwnerId, status) but aren't in collision detection
**Impact**: HIGH - Explain late-stage overwrites, routing mysteries
**Effort**: MEDIUM (3-4 hours)

**Implementation**:
- MDAPI retrieve: `ApprovalProcess`, `AssignmentRules` (Lead/Case), `AutoResponseRules`, `EscalationRules`
- Parse field updates from approval steps and final actions
- Extract `OwnerId` changes from assignment rules
- Integrate into Field Write Map with "APPROVAL" / "ASSIGNMENT" source type

**Deliverables**:
- `approval-assignment-extractor.js` (est. 400 lines)
- Field Write Map includes approval/assignment field updates
- New collision category: "APPROVAL_COLLISION"

**API Sources**:
- MDAPI: ApprovalProcess, AssignmentRules, AutoResponseRules, EscalationRules

---

#### 3. Top 10 Hotspots Executive Section (D1)
**Problem**: Stakeholders ask "where should I start?" - need prioritized view
**Impact**: HIGH - Actionable executive summary
**Effort**: LOW (1-2 hours) - uses existing data

**Implementation**:
- Score hotspots by: collision count + final-writer uncertainty + governor-risk flags + low coverage on critical path
- Generate Top 10 ranked list with one-liner "why this matters"
- Add to Executive Summary V2 as new section

**Deliverables**:
- New method in orchestrator: `generateTop10Hotspots()`
- Executive Summary section: "🔥 TOP 10 RISK HOTSPOTS"
- Each hotspot includes: rank, risk score, object.field, collision type, recommended action

**Data Sources**:
- Existing collision analysis
- Existing coverage data
- Existing recursion risk data

---

### Priority 2: Signal Quality Improvements (MEDIUM Impact / MEDIUM Effort)

#### 4. Process & Flow Complexity Metrics (B10)
**Problem**: Need to prioritize refactors by complexity, not just collision count
**Impact**: MEDIUM - Performance risk identification
**Effort**: MEDIUM (2-3 hours)

**Implementation**:
- Count per Flow: Decision nodes, Loops, Subflows, Fault connectors, Scheduled paths
- Calculate weighted complexity score: `(Decisions × 1) + (Loops × 3) + (Subflows × 2) + (Scheduled × 2)`
- Flag flows with complexity > threshold (e.g., >50)

**Deliverables**:
- New columns in Master Automation Inventory: "Complexity Score", "Complexity Rating"
- New report: `FLOW_COMPLEXITY_ANALYSIS.md` with Top 10 most complex flows
- Complexity-based recommendations in Executive Summary

**Data Sources**:
- Existing Flow XML parsing (flow-xml-parser.js)

---

#### 5. Duplicate & Matching Rules Visibility (A5)
**Problem**: Rules block automation, explain "why automation didn't run"
**Impact**: MEDIUM - Explains DML failures, blocked flows
**Effort**: MEDIUM (2-3 hours)

**Implementation**:
- MDAPI retrieve: `MatchingRule`, `DuplicateRule`
- Report status (active/inactive), scope (all records/owner), action (block/allow/alert)
- Tag impacted objects in inventory

**Deliverables**:
- `duplicate-matching-rule-detector.js` (est. 250 lines)
- New report: `DUPLICATE_MATCHING_RULES.md`
- Executive Summary note: "⚠️ 5 objects have blocking duplicate rules"

**API Sources**:
- MDAPI: MatchingRule, DuplicateRule

---

#### 6. Paused & Time-Based Actions (A6)
**Problem**: Pending writes = future collisions not visible today
**Impact**: MEDIUM - Explain delayed overwrites
**Effort**: MEDIUM (2-3 hours)

**Implementation**:
- Query `FlowInterview` for `Status = 'Paused'` (if available via API)
- Count paused interviews per flow/object
- Parse PB scheduled action nodes from XML
- List next fire times for paused actions

**Deliverables**:
- Enhancement to `scheduled-automation-detector.js` (+150 lines)
- New section in SCHEDULED_AUTOMATION_CALENDAR.md: "Paused Actions"
- Count of pending writes in Executive Summary

**API Sources**:
- REST API: `FlowInterview` (if available)
- Flow XML: scheduled action nodes

---

### Priority 3: Actionable Deliverables (HIGH Impact / LOW Effort)

#### 7. Remediation Backlog CSV (D2)
**Problem**: Need actionable task list for implementation teams
**Impact**: HIGH - Direct input to sprint planning
**Effort**: LOW (1 hour) - flatten existing collision data

**Implementation**:
- Flatten FIELD_WRITE_MAP_COLLISIONS.md into CSV
- Columns: Rank, Object, Field, Collision Type, Severity, Final Writer, Recommended Action, Effort (S/M/L), Status (Open/In Progress/Resolved)
- Sort by priority score

**Deliverables**:
- `REMEDIATION_BACKLOG.csv` (sortable/filterable in Excel)
- Import-ready format for Jira/Asana

**Data Sources**:
- Existing collision analysis results

---

### Priority 4: Advanced Analysis (MEDIUM Impact / MEDIUM Effort)

#### 8. Coverage Alignment (B9)
**Problem**: 136 units with coverage, but which are on critical paths?
**Impact**: MEDIUM - Focus test improvements
**Effort**: MEDIUM (2-3 hours)

**Implementation**:
- Crosswalk classes called by triggers or invoked by flows with coverage data
- Identify "critical path" classes (< 75% coverage) by call graph depth
- Include ApexOrgWideCoverage and namespace coverage deltas

**Deliverables**:
- New section in APEX_CODE_COVERAGE.md: "Critical Path Coverage Gaps"
- List of high-risk classes: low coverage + high call frequency

**Data Sources**:
- Existing coverage data
- Existing cascade/dependency analysis

---

#### 9. Security Posture Deep-Dive (B12)
**Problem**: Apex security captured, but Flow record visibility not analyzed
**Impact**: MEDIUM - Complete security audit
**Effort**: MEDIUM (2 hours)

**Implementation**:
- Parse Flow Get/Update Records elements for "Enforce record visibility" setting
- Add security notes column: "with sharing + stripInaccessible", "Flow enforces access", etc.
- Flag flows without record visibility enforcement as potential security gaps

**Deliverables**:
- New column in Master Automation Inventory: "Security Notes"
- New report section: "Security Posture Summary"

**Data Sources**:
- Flow XML metadata (element-level configuration)
- Existing Apex security analysis

---

#### 10. Test Quality Signals (B13)
**Problem**: Coverage % ≠ quality; need to flag bad test patterns
**Impact**: MEDIUM - Improve test suite effectiveness
**Effort**: MEDIUM (2-3 hours)

**Implementation**:
- Scan test classes for anti-patterns:
  - `@isTest(SeeAllData=true)` - risky data dependency
  - Missing `System.assert*` calls - tests without assertions
  - Empty `catch` blocks - swallowed errors
  - Log-only patterns: `System.debug` without asserts
- Count violations per pattern

**Deliverables**:
- New report: `TEST_QUALITY_ANALYSIS.md`
- Counts: classes with SeeAllData, missing asserts, empty catches
- Executive Summary: "⚠️ 15 test classes have quality issues"

**Data Sources**:
- Existing Apex body retrieval
- Pattern matching on test class code

---

#### 11. Data-Volume Heuristics (B14)
**Problem**: Need to flag patterns that struggle at scale (LDV orgs)
**Impact**: MEDIUM - Performance risk for high-volume orgs
**Effort**: MEDIUM (2 hours)

**Implementation**:
- Detect patterns in Apex/Flow:
  - Loops over `Get Records (all)`
  - SOQL without selective filters (`SELECT * FROM`, no WHERE clause on indexed fields)
  - `LIKE '%term%'` patterns (non-selective)
- Add "LDV Risk" flag per asset

**Deliverables**:
- New column in Master Automation Inventory: "LDV Risk"
- New report section: "Large Data Volume Risk Patterns"

**Data Sources**:
- Flow XML: Get Records configuration
- Apex SOQL string parsing

---

#### 12. Namespace Blast Radius (B15)
**Problem**: Quantify dependency depth for package impact analysis
**Impact**: MEDIUM - Change risk assessment
**Effort**: MEDIUM (2 hours)

**Implementation**:
- Using existing dependency graph, compute downstream dependents per package/class
- Rank by "impact if changed/removed" (count of dependent classes × avg complexity)
- List packages by blast radius score

**Deliverables**:
- New report: `NAMESPACE_BLAST_RADIUS.md`
- Table: Namespace, Downstream Dependents, Blast Radius Score, Risk Level

**Data Sources**:
- Existing cascade analysis
- Existing dependency graph

---

#### 13. Run-Book Hooks (D4)
**Problem**: Need reproducible test cases for critical collisions
**Impact**: MEDIUM - Faster remediation validation
**Effort**: MEDIUM (3 hours)

**Implementation**:
- For each CRITICAL collision, generate:
  - Apex anonymous snippet to create test record
  - Sample field values that trigger collision
  - Expected outcome after remediation
- Add to collision report as "Safe Test" section

**Deliverables**:
- New section in FIELD_WRITE_MAP_COLLISIONS.md: "🧪 Safe Test" per collision
- Copy-paste ready Apex anonymous blocks

**Data Sources**:
- Existing collision analysis
- Object field metadata

---

## 📊 Release Roadmap Summary

| Release | Target Date | Key Features | Total Effort | ROI |
|---------|-------------|--------------|--------------|-----|
| **v3.29.0** | ✅ Oct 2025 | PB writes, Final writer, Recursion, Scheduled, Hardcoded IDs | ✅ Complete | 18-24 hrs/audit |
| **v3.30.0** | Nov 2025 | Platform Events, Approvals, Top 10 Hotspots | 4-6 hours | +10-12 hrs/audit |
| **v3.31.0** | Dec 2025 | Complexity metrics, Duplicate rules, Paused actions, Remediation CSV | 6-8 hours | +8-10 hrs/audit |
| **v3.32.0** | Q1 2026 | Coverage alignment, Security deep-dive, Test quality, LDV heuristics | 8-10 hours | +6-8 hrs/audit |
| **v3.33.0** | Q1 2026 | Namespace blast radius, Run-book hooks | 5 hours | +4-5 hrs/audit |

**Cumulative ROI by v3.33.0**: 46-59 hours saved per audit (vs. manual analysis baseline)

---

## 🎯 Success Metrics

### Quantitative
- **Time Savings**: Hours saved per audit vs. manual analysis baseline
- **Coverage**: % of Salesforce automation types analyzed
- **Accuracy**: % of collisions with deterministic "final writer" answer
- **Actionability**: % of findings with specific remediation steps

### Qualitative
- **User Feedback**: "Fewer N/A mysteries", "Know what wins for every field", "Actionable backlog"
- **Deployment Success**: Reduced post-deployment incidents due to pre-analysis
- **Stakeholder Confidence**: Willingness to act on audit recommendations

---

## 🔄 Continuous Improvement

**Feedback Loop**:
1. User submits session reflection via `/reflect` command
2. Reflection stored in Supabase database
3. Cohort detection identifies common pain points
4. Fix plans generated with 5-Why root cause analysis
5. Asana tasks created for high-priority improvements
6. Fixes deployed in next release

**How to Submit Feedback**:
```bash
# After any audit session
/reflect
```

Your feedback directly shapes this roadmap!

---

## 📖 Version History

- **v3.29.0** (Oct 2025): Phase 1 HIGH Impact Enhancements - PB writes, Final writer, Recursion, Scheduled, Hardcoded IDs
- **v3.28.2** (Oct 2025): Validation rule formulas, Flow entry criteria, Layout field matrices
- **v3.25.0** (Sep 2025): Living Runbook System integration
- **v3.24.2** (Sep 2025): Workflow and Flow field operations extraction (Tier 3)
- **v3.24.1** (Sep 2025): Collision categorization and impact-based severity (Tier 2)

---

**Last Updated**: October 22, 2025
**Maintained By**: RevPal Engineering
**Repository**: https://github.com/RevPalSFDC/opspal-plugin-internal-marketplace
