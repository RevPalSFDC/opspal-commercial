# Phase 2 Layout Designer - Remediation Plan

**Date**: 2025-10-18
**Status**: 🟡 In Progress
**Test Results**: 45/100 (Grade D) → Target 85/100 (Grade B)
**Total Effort**: 16 hours
**Priority**: P0 (Required before Phase 3)

---

## Executive Summary

Phase 2 Contact layout generation test identified **5 critical implementation gaps** preventing production deployment. This plan outlines the systematic remediation approach to bring Phase 2 from 45/100 quality (Grade D) to 85/100 (Grade B) production-ready status.

**Key Insight**: All issues are **implementation bugs**, not architectural flaws. The framework design is sound; the code needs completion.

---

## Issue Inventory

| ID | Issue | Severity | Effort | Status | Target |
|----|-------|----------|--------|--------|--------|
| **001** | Field scoring too conservative | 🔴 P0 | 2h | 🟡 In Progress | Batch 1 |
| **002** | FlexiPage XML missing components | 🔴 P0 | 4h | 🟡 In Progress | Batch 1 |
| **003** | Classic Layout not generated | 🟠 P1 | 2h | ⬜ Pending | Batch 2 |
| **004** | Insufficient sections | 🟠 P1 | 3h | ⬜ Pending | Batch 2 |
| **005** | Component validation missing | 🟡 P2 | 3h | ⬜ Pending | Batch 3 |
| **006** | Re-test and validate | 🔴 P0 | 2h | ⬜ Pending | Batch 4 |

**Total**: 16 hours across 4 batches

---

## Remediation Strategy

### Batch 1: Critical Fixes (6 hours) - **IN PROGRESS**
**Goal**: Make FlexiPage deployable with adequate field coverage
**Target Score**: 75/100 (Grade B-)

#### ISSUE-001: Field Scoring Algorithm Boost
**File**: `scripts/lib/layout-rule-engine.js`
**Method**: `scorePersonaPriority()` (lines 158-175)

**Current Behavior**:
```javascript
if (fieldPriorities.criticalFields.includes(field.name)) {
    return 40; // Maximum persona score
}
```
Maximum possible total: 40 (persona) + 29 (metadata) = 69 pts → CONTEXTUAL

**Proposed Fix**:
```javascript
if (fieldPriorities.criticalFields.includes(field.name)) {
    return 65; // Boosted to ensure 90+ threshold
}
```
New total: 65 (persona) + 29 (metadata) = 94 pts → CRITICAL

**Testing**:
```bash
# Before: Name=69, Email=54, Phone=54
# After:  Name=94, Email=79, Phone=79
```

**Validation Criteria**:
- ✅ 6+ fields reach CRITICAL threshold (90-100)
- ✅ 15+ fields reach IMPORTANT threshold (75-89)
- ✅ 3-4 sections generated (instead of 1)

**Effort**: 2 hours (1h coding, 1h testing)

---

#### ISSUE-002: FlexiPage XML Component Generation
**File**: `scripts/lib/layout-template-engine.js`
**Method**: `generateFlexiPageXML()` (lines 180-220)

**Current Behavior**: Generates regions but no `<componentInstances>`

**Current Code**:
```javascript
generateFlexiPageXML(flexiPage) {
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<FlexiPage xmlns="http://soap.sforce.com/2006/04/metadata">\n';

    // Generates regions
    flexiPage.regions.forEach(region => {
        xml += `    <flexiPageRegions>\n`;
        xml += `        <name>${region.name}</name>\n`;
        xml += `        <type>Region</type>\n`;
        xml += `    </flexiPageRegions>\n`;
    });

    xml += `    <masterLabel>${flexiPage.label}</masterLabel>\n`;
    xml += `    <template>${flexiPage.template}</template>\n`;
    xml += `    <type>${flexiPage.type}</type>\n`;
    xml += '</FlexiPage>';
    return xml;
}
```

**Proposed Fix**: Add component instance generation
```javascript
generateFlexiPageXML(flexiPage) {
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<FlexiPage xmlns="http://soap.sforce.com/2006/04/metadata">\n';

    // Group components by region
    const componentsByRegion = this.groupComponentsByRegion(flexiPage.components);

    // Generate regions with component instances
    ['header', 'main', 'sidebar'].forEach(regionName => {
        const components = componentsByRegion[regionName] || [];
        if (components.length === 0) return; // Skip empty regions

        xml += `    <flexiPageRegions>\n`;

        // Add component instances
        components.forEach((component, index) => {
            xml += `        <componentInstances>\n`;
            xml += `            <componentName>${component.type}</componentName>\n`;

            // Add component-specific properties
            if (component.type === 'force:recordFieldSection') {
                xml += `            <componentInstanceProperties>\n`;
                xml += `                <name>sectionName</name>\n`;
                xml += `                <value>${component.label}</value>\n`;
                xml += `            </componentInstanceProperties>\n`;

                // Add fields
                component.fields.forEach(field => {
                    xml += `            <componentInstanceProperties>\n`;
                    xml += `                <name>field</name>\n`;
                    xml += `                <value>${field}</value>\n`;
                    xml += `            </componentInstanceProperties>\n`;
                });
            }

            xml += `        </componentInstances>\n`;
        });

        xml += `        <name>${regionName}</name>\n`;
        xml += `        <type>Region</type>\n`;
        xml += `    </flexiPageRegions>\n`;
    });

    xml += `    <masterLabel>${flexiPage.label}</masterLabel>\n`;
    xml += `    <template>${flexiPage.template}</template>\n`;
    xml += `    <type>${flexiPage.type}</type>\n`;
    xml += '</FlexiPage>';
    return xml;
}

// Helper method
groupComponentsByRegion(components) {
    const grouped = { header: [], main: [], sidebar: [] };
    components.forEach(component => {
        const region = component.region || 'main';
        grouped[region].push(component);
    });
    return grouped;
}
```

**Testing**:
```bash
# Validate XML structure
xmllint --noout Contact_sales_rep_Page.flexipage-meta.xml

# Expected components:
# - force:highlightsPanelDesktop (header)
# - runtime_sales_pathassistant:pathAssistant (header)
# - force:recordFieldSection x3-4 (main) - one per section
# - force:activityComposer (main)
# - force:relatedListSingleContainer x3 (sidebar)
```

**Validation Criteria**:
- ✅ XML passes `xmllint` validation
- ✅ All components have `<componentInstances>` elements
- ✅ Field sections include field properties
- ✅ File size >2KB (was 559 bytes)

**Effort**: 4 hours (2h coding, 1h testing, 1h edge cases)

---

### Batch 2: High Priority Enhancements (5 hours) - **PENDING**
**Goal**: Complete Phase 2 feature parity
**Target Score**: 85/100 (Grade B)

#### ISSUE-003: Classic Layout Generation
**File**: `scripts/lib/layout-template-engine.js`
**Method**: `generateClassicLayout()` (exists but not saving)

**Current Behavior**: Method generates Classic Layout object but file not written to disk

**Root Cause Analysis**:
```javascript
// In generateLayout() method
const classicLayout = this.generateClassicLayout(objectName, personaName, sections);
// ❌ Missing: Write to file
```

**Proposed Fix**:
```javascript
// In generateLayout() method (line ~140)
const result = {
    flexiPage,
    flexiPageXML: this.generateFlexiPageXML(flexiPage),
    compactLayout,
    compactLayoutXML: this.generateCompactLayoutXML(compactLayout)
};

// Add Classic Layout generation if requested
if (options.includeClassic) {
    const classicLayout = this.generateClassicLayout(objectName, personaName, sections);
    result.classicLayout = classicLayout;
    result.classicLayoutXML = this.generateClassicLayoutXML(classicLayout);
}

return result;
```

**File Save Logic** (in agent or CLI):
```javascript
// After generation
if (result.classicLayoutXML) {
    const classicLayoutFile = path.join(
        outputDir,
        `${objectName}_${personaName}_Layout.layout-meta.xml`
    );
    fs.writeFileSync(classicLayoutFile, result.classicLayoutXML, 'utf8');
}
```

**Validation Criteria**:
- ✅ Classic Layout XML file created when `--include-classic` flag used
- ✅ XML contains all sections from FlexiPage
- ✅ Field count matches FlexiPage
- ✅ 2-column layout format

**Effort**: 2 hours (1h fix, 1h test)

---

#### ISSUE-004: Section Generation Fallback
**File**: `scripts/lib/layout-rule-engine.js`
**Method**: `generateSectionRecommendations()` (lines 290-350)

**Current Behavior**: Only creates sections for fields that meet score thresholds. If no CRITICAL/IMPORTANT fields, minimal sections generated.

**Proposed Fix**: Add persona template fallback
```javascript
generateSectionRecommendations(fieldScores, personaName) {
    const persona = this.loadPersonaTemplate(personaName);
    const sections = [];

    // Existing logic: Create sections from high-scoring fields
    const criticalFields = fieldScores.filter(f => f.priority === 'CRITICAL');
    const importantFields = fieldScores.filter(f => f.priority === 'IMPORTANT');

    // ... existing section generation ...

    // NEW: Fallback to persona template if insufficient sections
    if (sections.length < 2) {
        console.warn(`Only ${sections.length} sections generated from scoring. Using persona template fallback.`);

        const templateSections = persona.sections || persona.preferredSections;
        if (templateSections) {
            templateSections.forEach(templateSection => {
                // Match template section fields to available fields
                const sectionFields = templateSection.fields
                    .filter(fieldName => fieldScores.find(f => f.fieldName === fieldName))
                    .slice(0, 15); // Limit to 15 fields per section

                if (sectionFields.length > 0) {
                    sections.push({
                        label: templateSection.label,
                        priority: templateSection.order,
                        fields: sectionFields,
                        fieldCount: sectionFields.length,
                        reason: 'Persona template fallback (insufficient high-scoring fields)'
                    });
                }
            });
        }
    }

    return sections;
}
```

**Testing**:
```bash
# Before: 1 section ("Supplemental Information", 5 fields)
# After:  4 sections per persona template:
#   - Contact Information (9 fields)
#   - Address Information (2 fields)
#   - Additional Information (3 fields)
#   - Supplemental Information (5 fields)
```

**Validation Criteria**:
- ✅ Minimum 3 sections generated (except for very simple personas)
- ✅ Sections match persona template when scoring insufficient
- ✅ Warning logged when fallback used
- ✅ Field count 40-60 for sales-rep persona

**Effort**: 3 hours (2h implementation, 1h testing)

---

### Batch 3: Polish & Validation (3 hours) - **PENDING**
**Goal**: Production hardening
**Target Score**: 90/100 (Grade A-)

#### ISSUE-005: Component Validation
**File**: `scripts/lib/layout-template-engine.js`
**Method**: `validateComponentForObject()` (NEW)

**Problem**: Path component included for Contact without validating it's applicable

**Proposed Fix**: Add component validation
```javascript
validateComponentForObject(componentType, objectName) {
    const objectDescribe = this.getObjectDescribe(objectName);

    // Validate Path component
    if (componentType === 'runtime_sales_pathassistant:pathAssistant') {
        // Path requires a status/stage picklist field
        const hasStatusField = objectDescribe.fields.some(f =>
            (f.name === 'Status' || f.name.includes('Stage')) &&
            f.type === 'picklist'
        );

        if (!hasStatusField) {
            return {
                valid: false,
                reason: `Path component requires Status or Stage picklist field. ${objectName} does not have one.`,
                alternative: 'force:highlightsPanelDesktop'
            };
        }
    }

    // Validate Knowledge component
    if (componentType === 'forceCommunity:knowledgeOneArticle') {
        if (objectName !== 'Case') {
            return {
                valid: false,
                reason: 'Knowledge component only applicable to Case object',
                alternative: null
            };
        }
    }

    // Validate Chatter feed
    if (componentType === 'force:feedPanel') {
        if (!objectDescribe.feedEnabled) {
            return {
                valid: false,
                reason: `${objectName} does not have Chatter feed enabled`,
                alternative: null
            };
        }
    }

    return { valid: true };
}

// Use in component selection
selectComponents(objectName, personaName) {
    const persona = this.loadPersonaTemplate(personaName);
    const components = [];

    persona.components.required.forEach(componentType => {
        const validation = this.validateComponentForObject(componentType, objectName);

        if (validation.valid) {
            components.push({ type: componentType, region: 'header' });
        } else {
            console.warn(`Skipping ${componentType}: ${validation.reason}`);
            if (validation.alternative) {
                console.log(`Using alternative: ${validation.alternative}`);
                components.push({ type: validation.alternative, region: 'header' });
            }
        }
    });

    return components;
}
```

**Validation Criteria**:
- ✅ Path component only included for objects with Status/Stage picklist
- ✅ Knowledge component only for Case object
- ✅ Chatter feed only when feedEnabled=true
- ✅ Clear warnings logged for skipped components

**Effort**: 3 hours (2h implementation, 1h testing all standard objects)

---

### Batch 4: Re-Test & Validate (2 hours) - **PENDING**
**Goal**: Confirm all fixes work end-to-end

#### Re-Test Protocol

**Test 1: Contact - Sales Rep** (original failing test)
```bash
/design-layout --object Contact --persona sales-rep --org peregrine-main --include-classic --verbose
```

**Expected Results**:
- ✅ 6+ CRITICAL fields (Name, AccountId, Email, Phone, Title, OwnerId)
- ✅ 15+ IMPORTANT fields
- ✅ 3-4 sections generated
- ✅ 40-60 total fields
- ✅ Valid FlexiPage XML with component instances
- ✅ Valid CompactLayout XML
- ✅ Valid Classic Layout XML
- ✅ Quality score 85-90/100 (Grade B to A-)

**Test 2: Opportunity - Sales Rep**
```bash
/design-layout --object Opportunity --persona sales-rep --org peregrine-main --include-classic
```

**Expected Results**:
- ✅ Path component included (Opportunity has Stage picklist)
- ✅ 4 sections per object template
- ✅ Quality score 85-90/100

**Test 3: Case - Support Agent**
```bash
/design-layout --object Case --persona support-agent --org peregrine-main
```

**Expected Results**:
- ✅ Knowledge component included (Case-specific)
- ✅ Conditional SLA section
- ✅ Quality score 85-90/100

**Test 4: Lead - Sales Manager**
```bash
/design-layout --object Lead --persona sales-manager --org peregrine-main
```

**Expected Results**:
- ✅ More fields than sales-rep (70-90 vs 40-60)
- ✅ Report chart components in sidebar
- ✅ Quality score 85-90/100

**Effort**: 2 hours (30 min per test)

---

## Success Criteria

### Phase 2 Production-Ready Definition

**Must Have** (Batch 1-2):
- ✅ Field scoring produces 6+ CRITICAL fields for all personas
- ✅ FlexiPage XML valid and deployable
- ✅ CompactLayout XML valid and deployable
- ✅ Classic Layout XML generated when requested
- ✅ 3-4 sections generated for standard personas
- ✅ Quality score 85/100 or higher (Grade B)

**Should Have** (Batch 3):
- ✅ Component validation prevents invalid components
- ✅ Quality score 90/100 or higher (Grade A-)

**Nice to Have** (Future):
- Usage data integration (field scoring boost)
- Custom object support
- Multi-persona layouts

---

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Fixes introduce new bugs | Medium | High | Comprehensive test suite (4 objects, 4 personas) |
| XML validation fails in org | Low | High | Use xmllint and validate against Salesforce schema |
| Field scoring over-corrects | Medium | Medium | Test with multiple personas and objects |
| Performance degradation | Low | Low | Scoring already takes 18s for 182 fields (acceptable) |

---

## Rollout Plan

### Phase 1: Fix & Test (Current - Oct 18)
1. ✅ Complete Batch 1 fixes (6 hours)
2. ✅ Complete Batch 2 fixes (5 hours)
3. ✅ Complete Batch 3 fixes (3 hours)
4. ✅ Run full test suite (2 hours)

**Deliverable**: Phase 2 v3.13.1 (patch release)

### Phase 2: User Testing (Oct 19-22)
1. Deploy CompactLayouts to peregrine-main sandbox
2. Deploy FlexiPages to peregrine-main sandbox
3. Assign to test users from each persona
4. Collect feedback via /reflect

**Deliverable**: User feedback and refinements

### Phase 3: Documentation Update (Oct 23)
1. Update LAYOUT_DESIGNER_PHASE2_COMPLETE.md
2. Update agent documentation (sfdc-layout-generator.md)
3. Update command documentation (design-layout.md)
4. Add troubleshooting section with common issues

**Deliverable**: Complete Phase 2 documentation

### Phase 4: Phase 3 Planning (Oct 24+)
1. Begin Phase 3 implementation (automated deployment)
2. Add validation gates
3. Add rollback capability

---

## Tracking & Metrics

### Implementation Progress

| Batch | Issues | Hours | Status | Completion |
|-------|--------|-------|--------|------------|
| Batch 1 | 001, 002 | 6h | 🟡 In Progress | 0% |
| Batch 2 | 003, 004 | 5h | ⬜ Pending | 0% |
| Batch 3 | 005 | 3h | ⬜ Pending | 0% |
| Batch 4 | Re-test | 2h | ⬜ Pending | 0% |

**Total**: 0 of 16 hours complete (0%)

### Quality Score Progression

| Milestone | Score | Grade | Status |
|-----------|-------|-------|--------|
| Initial Test | 45/100 | D | ✅ Complete |
| Batch 1 Complete | 75/100 | B- | ⬜ Target |
| Batch 2 Complete | 85/100 | B | ⬜ Target |
| Batch 3 Complete | 90/100 | A- | ⬜ Target |

---

## Next Actions

**Immediate** (Next 2 hours):
1. ✅ Fix ISSUE-001: Field scoring boost
2. ⬜ Test field scoring with Contact object
3. ⬜ Verify 6+ CRITICAL fields, 3-4 sections

**Today** (Next 6 hours):
4. ⬜ Fix ISSUE-002: FlexiPage XML generation
5. ⬜ Test FlexiPage XML validation
6. ⬜ Deploy CompactLayout to peregrine-main

**This Week** (Next 8 hours):
7. ⬜ Fix ISSUE-003: Classic Layout
8. ⬜ Fix ISSUE-004: Section fallback
9. ⬜ Fix ISSUE-005: Component validation
10. ⬜ Run full test suite (4 objects × 4 personas)

---

## Appendix: Code Locations

### Files Requiring Changes

| File | Lines | Changes | Effort |
|------|-------|---------|--------|
| `layout-rule-engine.js` | 158-175, 290-350 | ISSUE-001, ISSUE-004 | 5h |
| `layout-template-engine.js` | 140-145, 180-220 | ISSUE-002, ISSUE-003, ISSUE-005 | 9h |
| Test all objects | N/A | Validation | 2h |

### Testing Checklist

- [ ] Unit tests for field scoring
- [ ] Unit tests for section generation
- [ ] Unit tests for XML generation
- [ ] Integration test: Contact/sales-rep
- [ ] Integration test: Opportunity/sales-rep
- [ ] Integration test: Case/support-agent
- [ ] Integration test: Lead/sales-manager
- [ ] XML validation with xmllint
- [ ] Deployment test to peregrine-main
- [ ] Quality score validation (85+)

---

**Plan Status**: 🟡 Active
**Last Updated**: 2025-10-18
**Next Review**: After Batch 1 completion
**Owner**: Phase 2 Implementation Team
