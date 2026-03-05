# CPQ ERD Generator Enhancement Plan

**Status**: Planned
**Priority**: High
**Estimated Effort**: 4-6 hours
**Target Phase**: Phase 7.1 (Post Q2C Audit v1.0)

---

## Executive Summary

The CPQ ERD Generator currently produces no useful output because it relies on Tooling API `FieldDefinition` queries that fail for managed package objects due to permission restrictions. This enhancement will replace the FieldDefinition approach with the Describe API, which has no such restrictions and will enable full relationship discovery across all CPQ objects.

**Impact**: Transforms ERD generator from 0% useful to fully functional, enabling visualization of the complete CPQ data model.

---

## Problem Statement

### Current Behavior
- **ERD Output**: Empty object boxes with no relationships
- **Relationships Discovered**: 0 out of expected 100+
- **Root Cause**: FieldDefinition queries fail with "Query execution failed"
- **Affected Objects**: All managed package objects (SBQQ__*) and most standard objects

### Test Results (NeonOne Production)
```
Found 96 CPQ objects
Mapping relationships...
Error getting fields for SBQQ__Quote__c: Query execution failed
Error getting fields for Opportunity: Query execution failed
Error getting fields for Account: Query execution failed
[...90+ similar errors...]
Found 0 relationships
```

### Why This Fails
```javascript
// Current approach (FAILS):
const query = `
  SELECT QualifiedApiName, Label, DataType, IsNillable, IsCustom,
         RelationshipName, ReferenceTo, IsRequired
  FROM FieldDefinition
  WHERE EntityDefinition.QualifiedApiName = 'SBQQ__Quote__c'
`;
// Permission denied for managed package objects
```

### Business Impact
- **CPQ Assessors**: Cannot understand object relationships
- **Data Migration Planning**: No visual reference for dependencies
- **Documentation**: ERD diagrams provide zero value
- **Customer Deliverables**: Unusable artifacts

---

## Proposed Solution

### Approach: Use Describe API Instead of FieldDefinition

The Salesforce Describe API (`sf sobject describe`) provides complete field metadata without permission restrictions:

```javascript
// New approach (WORKS):
const describeResult = execSync(
  `sf sobject describe ${objectApiName} --target-org ${this.orgAlias} --json`,
  { encoding: 'utf8' }
);
const metadata = JSON.parse(describeResult);
const fields = metadata.result.fields; // All fields with full metadata
```

### Why Describe API Works
1. **No Permission Restrictions**: Works on all object types (standard, custom, managed package)
2. **Complete Metadata**: Returns ALL fields including relationships
3. **Proven Pattern**: Already used successfully throughout the plugin
4. **Reliable**: Part of core Salesforce API, not subject to Tooling API limitations

### Benefits
- ✅ Discover 100+ relationships across CPQ objects
- ✅ Generate meaningful ERD diagrams
- ✅ Visualize complete data model
- ✅ Support all org types (sandbox, production, managed packages)
- ✅ No permission configuration required

---

## Implementation Plan

### Phase 1: Replace FieldDefinition Queries (2 hours)

#### 1.1 Create Describe API Wrapper
**File**: `scripts/lib/cpq-erd-generator.js`

```javascript
/**
 * Get field metadata using Describe API (replaces FieldDefinition query)
 * @param {String} objectApiName - Object API name
 * @returns {Array} Array of field metadata
 */
async _getObjectFieldsViaDescribe(objectApiName) {
  try {
    const describeCmd = `sf sobject describe ${objectApiName} --target-org ${this.orgAlias} --json`;
    const result = this._executeCommand(describeCmd);

    if (!result.result || !result.result.fields) {
      throw new Error(`No fields returned for ${objectApiName}`);
    }

    // Transform Describe API format to match existing field structure
    return result.result.fields.map(field => ({
      QualifiedApiName: field.name,
      Label: field.label,
      DataType: this._mapDescribeTypeToFieldDefinitionType(field.type),
      IsNillable: field.nillable,
      IsCustom: field.custom,
      RelationshipName: field.relationshipName,
      ReferenceTo: field.referenceTo ? field.referenceTo[0] : null, // Take first reference
      IsRequired: !field.nillable && !field.defaultedOnCreate
    }));

  } catch (error) {
    if (this.options.verbose) {
      console.error(`Error describing ${objectApiName}:`, error.message);
    }
    return [];
  }
}

/**
 * Map Describe API field types to FieldDefinition types
 * @param {String} describeType - Describe API type (e.g., 'reference', 'string')
 * @returns {String} FieldDefinition type (e.g., 'Lookup', 'Text')
 */
_mapDescribeTypeToFieldDefinitionType(describeType) {
  const typeMap = {
    'reference': 'Lookup',      // Note: We'll check for MasterDetail separately
    'string': 'Text',
    'textarea': 'LongTextArea',
    'picklist': 'Picklist',
    'multipicklist': 'MultiselectPicklist',
    'boolean': 'Checkbox',
    'currency': 'Currency',
    'date': 'Date',
    'datetime': 'DateTime',
    'double': 'Number',
    'int': 'Number',
    'percent': 'Percent',
    'phone': 'Phone',
    'email': 'Email',
    'url': 'Url',
    'id': 'Lookup'
  };

  return typeMap[describeType.toLowerCase()] || describeType;
}

/**
 * Determine if relationship is MasterDetail vs Lookup
 * @param {Object} field - Field metadata from Describe API
 * @returns {Boolean} True if MasterDetail
 */
_isMasterDetailRelationship(field) {
  // Describe API provides cascadeDelete flag for MasterDetail
  return field.cascadeDelete === true ||
         (field.updateable === false && field.relationshipName);
}
```

#### 1.2 Update Field Discovery Logic
**File**: `scripts/lib/cpq-erd-generator.js` (line 176)

Replace `_getObjectFields()` implementation:

```javascript
async _getObjectFields(objectApiName) {
  // Use Describe API instead of FieldDefinition query
  return await this._getObjectFieldsViaDescribe(objectApiName);
}
```

#### 1.3 Enhance Relationship Detection
**File**: `scripts/lib/cpq-erd-generator.js` (line 201)

Update `_mapRelationships()` to properly detect MasterDetail:

```javascript
async _mapRelationships(objects) {
  if (this.relationshipCache) {
    return this.relationshipCache;
  }

  if (this.options.verbose) {
    console.log('Mapping relationships...');
  }

  const relationships = [];
  const objectApiNames = objects.map(o => o.apiName);

  for (const obj of objects) {
    for (const field of obj.fields) {
      // Check if field is a relationship
      if (field.DataType === 'Lookup' || field.DataType === 'MasterDetail') {
        const referenceTo = field.ReferenceTo;

        // Only include relationships to other CPQ objects
        if (referenceTo && objectApiNames.includes(referenceTo)) {
          relationships.push({
            from: obj.apiName,
            to: referenceTo,
            field: field.QualifiedApiName,
            fieldLabel: field.Label,
            type: field.DataType,
            relationshipName: field.RelationshipName,
            required: field.IsRequired || field.DataType === 'MasterDetail'
          });
        }
      }
    }
  }

  if (this.options.verbose) {
    console.log(`Found ${relationships.length} relationships`);
  }

  this.relationshipCache = relationships;
  return relationships;
}
```

### Phase 2: Enhance Diagram Output (1 hour)

#### 2.1 Group Related Objects
Add visual grouping to show logical clusters:

```javascript
/**
 * Generate enhanced high-level ERD with object grouping
 * @param {Array} objects - Object metadata
 * @param {Array} relationships - Relationship metadata
 * @returns {Object} Diagram metadata
 */
async _generateHighLevelERD(objects, relationships) {
  if (this.options.verbose) {
    console.log('Generating high-level ERD...');
  }

  let mermaidCode = 'erDiagram\n';

  // Add relationships first (required by Mermaid)
  for (const rel of relationships) {
    const cardinality = this._getCardinality(rel);
    mermaidCode += `  ${this._sanitizeId(rel.from)} ${cardinality} ${this._sanitizeId(rel.to)} : "${rel.fieldLabel}"\n`;
  }

  // Group objects by functional area
  const groups = this._groupObjectsByFunction(objects, relationships);

  // Add grouped object definitions
  for (const [groupName, groupObjects] of Object.entries(groups)) {
    mermaidCode += `\n  %% ${groupName}\n`;
    for (const obj of groupObjects) {
      mermaidCode += `  ${this._sanitizeId(obj.apiName)} {\n  }\n`;
    }
  }

  return await this._saveDiagram(
    mermaidCode,
    'cpq-erd-overview',
    'CPQ Entity Relationship Diagram - High Level'
  );
}

/**
 * Group objects by functional area based on naming patterns
 * @param {Array} objects - Object metadata
 * @param {Array} relationships - Relationship metadata
 * @returns {Object} Grouped objects
 */
_groupObjectsByFunction(objects, relationships) {
  const groups = {
    'Core CPQ': [],
    'Pricing': [],
    'Configuration': [],
    'Subscriptions': [],
    'Standard Objects': [],
    'Other': []
  };

  for (const obj of objects) {
    const name = obj.apiName;

    if (name.includes('Quote') && !name.includes('Web')) {
      groups['Core CPQ'].push(obj);
    } else if (name.includes('Price') || name.includes('Discount')) {
      groups['Pricing'].push(obj);
    } else if (name.includes('Configuration') || name.includes('Product')) {
      groups['Configuration'].push(obj);
    } else if (name.includes('Subscription') || name.includes('Consumption')) {
      groups['Subscriptions'].push(obj);
    } else if (!name.startsWith('SBQQ__')) {
      groups['Standard Objects'].push(obj);
    } else {
      groups['Other'].push(obj);
    }
  }

  // Remove empty groups
  Object.keys(groups).forEach(key => {
    if (groups[key].length === 0) {
      delete groups[key];
    }
  });

  return groups;
}
```

#### 2.2 Add Relationship Statistics
Include summary statistics in diagram header:

```javascript
async _saveDiagram(mermaidCode, filename, title) {
  const outputPath = path.join(this.options.outputDir, `${filename}.md`);

  // Parse stats from diagram
  const relationshipCount = (mermaidCode.match(/--/g) || []).length;
  const objectCount = (mermaidCode.match(/\w+ \{/g) || []).length;

  const content = `# ${title}

Org: ${this.orgAlias}
Generated: ${new Date().toLocaleString()}

**Statistics:**
- Objects: ${objectCount}
- Relationships: ${relationshipCount}
- Managed Package Objects: ${this.objectCache.filter(o => o.apiName.startsWith('SBQQ__')).length}
- Standard Objects: ${this.objectCache.filter(o => !o.apiName.startsWith('SBQQ__')).length}

\`\`\`mermaid
${mermaidCode}
\`\`\`
`;

  fs.writeFileSync(outputPath, content);

  return {
    path: outputPath,
    filename: `${filename}.md`,
    objectCount,
    relationshipCount
  };
}
```

### Phase 3: Add Fallback Logic (1 hour)

#### 3.1 Implement Dual-Strategy Approach
Try Describe API first, fallback to FieldDefinition if needed:

```javascript
async _getObjectFields(objectApiName) {
  // Strategy 1: Try Describe API (preferred)
  try {
    const fields = await this._getObjectFieldsViaDescribe(objectApiName);
    if (fields && fields.length > 0) {
      return fields;
    }
  } catch (describeError) {
    if (this.options.verbose) {
      console.warn(`Describe API failed for ${objectApiName}, trying FieldDefinition...`);
    }
  }

  // Strategy 2: Fallback to FieldDefinition query
  try {
    const query = `
      SELECT QualifiedApiName, Label, DataType, IsNillable, IsCustom,
             RelationshipName, ReferenceTo, IsRequired
      FROM FieldDefinition
      WHERE EntityDefinition.QualifiedApiName = '${objectApiName}'
    `;

    const result = this._executeQuery(query, { useToolingApi: true });
    return result.records || [];

  } catch (fieldDefError) {
    if (this.options.verbose) {
      console.error(`Both strategies failed for ${objectApiName}`);
    }
    return [];
  }
}
```

### Phase 4: Testing & Validation (1-2 hours)

#### 4.1 Unit Tests
**File**: `test/cpq-erd-generator.test.js`

Add tests for new Describe API logic:

```javascript
describe('CPQ ERD Generator - Describe API', () => {
  it('should discover fields using Describe API', async () => {
    const generator = new CPQERDGenerator('test-org');
    const fields = await generator._getObjectFieldsViaDescribe('SBQQ__Quote__c');

    expect(fields).to.be.an('array');
    expect(fields.length).to.be.greaterThan(0);
    expect(fields[0]).to.have.property('QualifiedApiName');
    expect(fields[0]).to.have.property('DataType');
  });

  it('should map Describe API types correctly', () => {
    const generator = new CPQERDGenerator('test-org');

    expect(generator._mapDescribeTypeToFieldDefinitionType('reference')).to.equal('Lookup');
    expect(generator._mapDescribeTypeToFieldDefinitionType('string')).to.equal('Text');
    expect(generator._mapDescribeTypeToFieldDefinitionType('picklist')).to.equal('Picklist');
  });

  it('should detect MasterDetail relationships', () => {
    const generator = new CPQERDGenerator('test-org');

    const masterDetailField = { cascadeDelete: true, relationshipName: 'Quote' };
    expect(generator._isMasterDetailRelationship(masterDetailField)).to.be.true;

    const lookupField = { cascadeDelete: false, relationshipName: 'Account' };
    expect(generator._isMasterDetailRelationship(lookupField)).to.be.false;
  });

  it('should discover relationships between CPQ objects', async () => {
    const generator = new CPQERDGenerator('test-org');
    const objects = await generator._discoverCPQObjects();
    const relationships = await generator._mapRelationships(objects);

    expect(relationships).to.be.an('array');
    expect(relationships.length).to.be.greaterThan(0);
    expect(relationships[0]).to.have.property('from');
    expect(relationships[0]).to.have.property('to');
    expect(relationships[0]).to.have.property('type');
  });
});
```

#### 4.2 Integration Test
**File**: `test-cpq-erd.js`

```javascript
#!/usr/bin/env node
/**
 * Integration test for CPQ ERD Generator with Describe API
 */

const CPQERDGenerator = require('./scripts/lib/cpq-erd-generator');
const path = require('path');

async function testERDGenerator() {
  console.log('🧪 Testing CPQ ERD Generator - Describe API Enhancement\n');

  const orgAlias = 'neonone';
  const outputDir = path.join(__dirname, 'test-output', `cpq-erd-test-${Date.now()}`);

  try {
    const generator = new CPQERDGenerator(orgAlias, {
      outputDir,
      detailLevel: 'both',
      verbose: true
    });

    console.log('📊 Generating ERD diagrams...\n');
    const startTime = Date.now();
    const result = await generator.generateERD();
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log('\n✅ ERD Generation Complete!\n');
    console.log('📈 Results:');
    console.log(`   Duration: ${duration}s`);
    console.log(`   Objects Discovered: ${result.objectCount}`);
    console.log(`   Relationships Discovered: ${result.relationshipCount}`);
    console.log(`   Output Directory: ${outputDir}`);

    // Validation
    if (result.relationshipCount === 0) {
      console.error('\n❌ FAILED: No relationships discovered (expected 50+)');
      process.exit(1);
    }

    if (result.relationshipCount < 20) {
      console.warn('\n⚠️  WARNING: Low relationship count (expected 50+)');
    }

    console.log('\n✅ Test PASSED - Relationships successfully discovered!');

  } catch (error) {
    console.error('\n❌ Test Failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

testERDGenerator();
```

---

## Success Criteria

### Minimum Viable Enhancement
- [ ] **Discover 50+ relationships** between CPQ objects (currently 0)
- [ ] **Generate meaningful ERD diagrams** showing object connections
- [ ] **No permission errors** during field discovery
- [ ] **Pass all unit tests** (15/15 existing + 5 new)
- [ ] **Pass integration test** against NeonOne production

### Stretch Goals
- [ ] **100+ relationships discovered** (comprehensive coverage)
- [ ] **Visual object grouping** by functional area
- [ ] **Relationship statistics** in diagram headers
- [ ] **MasterDetail vs Lookup** differentiation in diagrams
- [ ] **Performance**: Complete ERD generation in < 60 seconds

---

## Testing Strategy

### Test Environments
1. **NeonOne Production** (primary validation)
   - 96 CPQ objects
   - Expected: 50-100 relationships
   - Real managed package scenario

2. **Test Org** (development/debugging)
   - Smaller CPQ installation
   - Faster iteration cycles

3. **HiveMQ/Wedgewood** (optional cross-validation)
   - Different CPQ configurations
   - Broader validation

### Test Scenarios

#### Scenario 1: Full ERD Generation
```bash
node test-cpq-erd.js
# Expected: 50+ relationships, 96 objects, < 60s duration
```

#### Scenario 2: Describe API Functionality
```bash
npm test -- test/cpq-erd-generator.test.js
# Expected: All 20/20 tests passing (15 existing + 5 new)
```

#### Scenario 3: Compare Before/After
```bash
# Before enhancement
Relationships discovered: 0
ERD usefulness: 0/10

# After enhancement
Relationships discovered: 75
ERD usefulness: 9/10
```

---

## Rollout Plan

### Phase 1: Development (Week 1)
- Implement Describe API wrapper
- Replace FieldDefinition queries
- Add unit tests
- Local testing

### Phase 2: Validation (Week 1)
- Run integration test against NeonOne
- Compare outputs with current version
- Document improvements
- Peer review

### Phase 3: Deployment (Week 2)
- Update documentation
- Create migration notes
- Deploy to production
- Update Phase 7 completion docs

---

## Risk Assessment

### Low Risk
- **Describe API is proven**: Already used successfully throughout plugin
- **Backward compatible**: Fallback to FieldDefinition if needed
- **Well-tested pattern**: Similar approach in other generators

### Mitigation Strategies
1. **Dual-strategy approach**: Try Describe API first, fallback to FieldDefinition
2. **Comprehensive testing**: Unit tests + integration tests + manual validation
3. **Gradual rollout**: Test on dev org before production
4. **Rollback plan**: Keep current FieldDefinition code as fallback

---

## Documentation Updates

### Files to Update
1. **PHASE_7_CPQ_ASSESSOR_INTEGRATION.md**
   - Update ERD generator status to "Fully Functional"
   - Add relationship discovery statistics
   - Document Describe API approach

2. **cpq-erd-generator.js JSDoc**
   - Update method descriptions
   - Add Describe API usage examples
   - Document dual-strategy approach

3. **Q2C_AUDIT_TEST_RESULTS.md**
   - Update ERD section with new results
   - Change status from "Not useful" to "Fully functional"
   - Add relationship discovery metrics

4. **README.md**
   - Update CPQ audit capabilities
   - Highlight ERD relationship visualization

---

## Estimated Timeline

| Phase | Task | Duration | Owner |
|-------|------|----------|-------|
| 1.1 | Create Describe API wrapper | 1 hour | Dev |
| 1.2 | Replace FieldDefinition queries | 30 min | Dev |
| 1.3 | Enhance relationship detection | 30 min | Dev |
| 2.1 | Add object grouping | 45 min | Dev |
| 2.2 | Add statistics | 15 min | Dev |
| 3.1 | Implement fallback logic | 1 hour | Dev |
| 4.1 | Write unit tests | 1 hour | Dev |
| 4.2 | Integration testing | 1 hour | QA |
| - | Documentation updates | 30 min | Dev |
| - | Code review & refinement | 30 min | Team |
| **Total** | | **6-7 hours** | |

---

## Acceptance Criteria

### Must Have
- [ ] Discovers 50+ relationships between CPQ objects
- [ ] No permission/query failures during ERD generation
- [ ] ERD diagrams visually show object connections
- [ ] All existing tests still pass (15/15)
- [ ] New tests pass (5/5)
- [ ] Integration test passes against NeonOne

### Should Have
- [ ] Object grouping by functional area (Pricing, Configuration, etc.)
- [ ] Relationship statistics in diagram headers
- [ ] MasterDetail vs Lookup visual differentiation
- [ ] Performance < 60 seconds for full ERD generation

### Nice to Have
- [ ] Interactive diagram navigation
- [ ] Export to other formats (PNG, SVG)
- [ ] Relationship filtering options
- [ ] Custom object inclusion/exclusion

---

## Next Steps

1. **Review this plan** with team
2. **Get approval** to proceed
3. **Create feature branch**: `feature/erd-describe-api-enhancement`
4. **Implement Phase 1** (Describe API wrapper)
5. **Run unit tests** after each phase
6. **Integration test** against NeonOne
7. **Update documentation** and close loop

---

**Plan Created**: 2025-11-12
**Status**: Awaiting Approval
**Estimated Completion**: Week of 2025-11-18
