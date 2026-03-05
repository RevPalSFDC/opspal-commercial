# Phase 6: Layout Generation Test Suite
## acme-corp Sandbox Environment

**Test Environment**: ACME_SANDBOX
**Test Date**: 2025-10-18
**Pattern Version**: fieldInstance v2.0.0
**Integration Phase**: Phase 6 of 7 (Testing & Validation)

---

## Test Objectives

1. **Persona Coverage**: Validate all 7 personas generate correctly
2. **Pattern Compliance**: Verify fieldInstance v2.0.0 pattern in all layouts
3. **Quality Scoring**: Confirm quality scores meet threshold (≥85/100 target)
4. **Object Coverage**: Test across 5 key standard objects
5. **Deployment Success**: Verify layouts deploy without errors
6. **Agent Routing**: Confirm auto-agent-router correctly detects requests

---

## Test Matrix

### Persona × Object Coverage

| Persona | Contact | Account | Opportunity | Lead | Case |
|---------|---------|---------|-------------|------|------|
| **sales-rep** | ✓ | ✓ | ✓ | ✓ | - |
| **sales-manager** | - | ✓ | ✓ | ✓ | - |
| **executive** | - | ✓ | ✓ | - | - |
| **support-agent** | ✓ | - | - | - | ✓ |
| **support-manager** | - | ✓ | - | - | ✓ |
| **marketing** | ✓ | ✓ | - | ✓ | - |
| **customer-success** | ✓ | ✓ | - | - | - |

**Total Test Cases**: 17 layouts

---

## Test Cases

### Test Group 1: Marketing Persona (4 layouts)

#### TC-M1: Marketing Contact Layout
**Command**:
```bash
node scripts/lib/layout-template-engine.js \
  --object Contact \
  --persona marketing \
  --org ACME_SANDBOX \
  --output instances/acme-sandbox/phase6-tests/marketing
```

**Expected Results**:
- ✓ FlexiPage generated with fieldInstance pattern
- ✓ CompactLayout generated (4-6 fields)
- ✓ Quality score ≥ 75/100 (C+ or better)
- ✓ Marketing-specific fields included (Marketing_Stage__c, Campaign fields)
- ✓ Sections: Contact Essentials, Marketing Status, Campaign Attribution, Preferences

**Success Criteria**:
- [ ] Layout file created: `Contact_marketing_FlexiPage.flexipage-meta.xml`
- [ ] Compact layout created: `Contact_marketing_CompactLayout.compactLayout-meta.xml`
- [ ] Quality analysis generated
- [ ] All fields use `<fieldInstance>` elements
- [ ] No Dynamic Forms components (`force:recordFieldSection`)

#### TC-M2: Marketing Account Layout
**Command**:
```bash
node scripts/lib/layout-template-engine.js \
  --object Account \
  --persona marketing \
  --org ACME_SANDBOX \
  --output instances/acme-sandbox/phase6-tests/marketing
```

**Expected Results**:
- ✓ Account hierarchy and parent fields
- ✓ Campaign influence tracking
- ✓ Marketing attribution fields

#### TC-M3: Marketing Lead Layout
**Command**:
```bash
node scripts/lib/layout-template-engine.js \
  --object Lead \
  --persona marketing \
  --org ACME_SANDBOX \
  --output instances/acme-sandbox/phase6-tests/marketing
```

**Expected Results**:
- ✓ Lead source and campaign tracking
- ✓ Lead scoring and grading fields
- ✓ Conversion tracking

---

### Test Group 2: Customer Success Persona (3 layouts)

#### TC-CS1: Customer Success Contact Layout
**Command**:
```bash
node scripts/lib/layout-template-engine.js \
  --object Contact \
  --persona customer-success \
  --org ACME_SANDBOX \
  --output instances/acme-sandbox/phase6-tests/customer-success
```

**Expected Results**:
- ✓ Health score and risk indicators
- ✓ Engagement tracking fields
- ✓ Renewal and upsell opportunities

#### TC-CS2: Customer Success Account Layout
**Command**:
```bash
node scripts/lib/layout-template-engine.js \
  --object Account \
  --persona customer-success \
  --org ACME_SANDBOX \
  --output instances/acme-sandbox/phase6-tests/customer-success
```

**Expected Results**:
- ✓ ARR and contract value tracking
- ✓ Health score dashboard
- ✓ QBR and success plan tracking

---

### Test Group 3: Sales Rep Persona (4 layouts)

#### TC-SR1: Sales Rep Contact Layout
**Command**:
```bash
node scripts/lib/layout-template-engine.js \
  --object Contact \
  --persona sales-rep \
  --org ACME_SANDBOX \
  --output instances/acme-sandbox/phase6-tests/sales-rep
```

**Expected Results**:
- ✓ Decision maker and role tracking
- ✓ Communication preferences
- ✓ Opportunity relationships

#### TC-SR2: Sales Rep Account Layout
#### TC-SR3: Sales Rep Opportunity Layout
#### TC-SR4: Sales Rep Lead Layout

---

### Test Group 4: Sales Manager Persona (3 layouts)

#### TC-SM1: Sales Manager Account Layout
#### TC-SM2: Sales Manager Opportunity Layout
#### TC-SM3: Sales Manager Lead Layout

---

### Test Group 5: Executive Persona (2 layouts)

#### TC-EX1: Executive Account Layout
#### TC-EX2: Executive Opportunity Layout

---

### Test Group 6: Support Agent Persona (2 layouts)

#### TC-SA1: Support Agent Contact Layout
#### TC-SA2: Support Agent Case Layout

---

### Test Group 7: Support Manager Persona (2 layouts)

#### TC-SM1: Support Manager Account Layout
#### TC-SM2: Support Manager Case Layout

---

## Validation Checklist (Per Layout)

### Pattern Compliance
- [ ] Uses fieldInstance pattern (v2.0.0)
- [ ] No Dynamic Forms components
- [ ] Facet hierarchy correct (8 levels)
- [ ] Field Facets → Column Wrappers → Columns Container → Field Sections → Detail Tab → Tabs → Main Region
- [ ] Sidebar region with related lists

### Quality Scoring
- [ ] Overall score ≥ 75/100 (minimum acceptable)
- [ ] Overall score ≥ 85/100 (target)
- [ ] Field Organization: 15-25 points
- [ ] User Experience: 15-25 points
- [ ] Performance: 12-20 points
- [ ] Accessibility: 10-15 points
- [ ] Best Practices: 10-15 points

### Persona Alignment
- [ ] Fields match persona template
- [ ] Section names appropriate for persona
- [ ] Field priority correct (critical → nice-to-have)
- [ ] CompactLayout fields relevant to persona

### XML Structure
- [ ] Valid XML (no syntax errors)
- [ ] Correct namespace (http://soap.sforce.com/2006/04/metadata)
- [ ] API version v62.0
- [ ] Template: flexipage:recordHomeTemplateDesktop
- [ ] Type: RecordPage

### Deployment Readiness
- [ ] File naming convention correct
- [ ] No hardcoded IDs
- [ ] No org-specific references
- [ ] Package.xml compatible

---

## Agent Routing Tests

### AR-T1: Layout Generation Detection
**Input**: "create Contact layout for marketing users"
**Expected**: Routes to `sfdc-layout-generator`, persona=marketing, object=Contact

### AR-T2: Layout Analysis Detection
**Input**: "analyze the Contact layout quality"
**Expected**: Routes to `sfdc-layout-analyzer`

### AR-T3: Persona Alias Detection
**Input**: "generate Account layout for CSM"
**Expected**: Routes to `sfdc-layout-generator`, persona=customer-success

### AR-T4: Multi-word Persona Detection
**Input**: "create Opportunity layout for account executives"
**Expected**: Routes to `sfdc-layout-generator`, persona=sales-rep

---

## Performance Metrics

### Target Metrics
- **Generation Time**: < 5 seconds per layout
- **Quality Score**: ≥ 85/100 average
- **Pattern Compliance**: 100% fieldInstance usage
- **Deployment Success**: 100% (0 errors)

### Actual Metrics (To be measured)
- Generation Time: _________
- Average Quality Score: _________
- Pattern Compliance: _________
- Deployment Success Rate: _________

---

## Known Limitations

1. **Custom Fields**: Test orgs may not have all expected custom fields (Marketing_Stage__c, Health_Score__c, etc.)
2. **RecordTypes**: Some layouts may reference record types that don't exist
3. **Related Lists**: Custom objects in related lists may not exist

**Mitigation**: Tests focus on pattern structure and standard fields. Custom field presence is noted but not critical for pattern validation.

---

## Success Criteria (Phase 6)

Phase 6 is successful if:
- [ ] All 17 test layouts generate without errors
- [ ] Average quality score ≥ 80/100
- [ ] 100% of layouts use fieldInstance pattern
- [ ] 0 Dynamic Forms components detected
- [ ] All 4 agent routing tests pass
- [ ] Test validation report created

---

## Test Execution Log

### Execution Start Time: _________
### Execution End Time: _________
### Total Duration: _________

### Summary
- Layouts Generated: _____ / 17
- Quality Score Average: _____
- Pattern Compliance: _____
- Routing Tests Passed: _____ / 4

---

**Next Steps**: After Phase 6 completion, proceed to Phase 7 (Communication) to create migration guide and update CHANGELOG.
