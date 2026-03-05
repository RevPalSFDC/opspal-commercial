# Phase 2.3: Advanced Decision Rules and Conditions - PLAN

**Start Date**: 2025-10-31
**Status**: Planning
**Target**: Enable natural language decision rule creation with conditions and logic

## Objective

Extend FlowNLPModifier to parse and create decision rules with conditions from natural language instructions. This allows users to create functional decision elements, not just empty decision structures.

## Scope

### In Scope
1. Parse decision rule conditions from natural language
2. Support common operators (equals, not equals, greater than, less than, contains)
3. Create condition objects with proper structure
4. Support AND/OR condition logic
5. Link rules to connector targets
6. Validate field references and data types

### Out of Scope (Future Phases)
- Formula expressions in conditions
- Complex nested logic (parentheses grouping)
- Custom operators or functions
- Field dependency validation
- Real-time field type checking against org

## Requirements

### Functional Requirements

**FR1: Parse Single Condition Rules**
```
"Add a decision called Status_Check with rule High_Value if Amount > 10000 then Approved_Path"
```
Creates:
- Rule name: High_Value
- Condition: Amount > 10000
- Connector: Approved_Path

**FR2: Parse Multiple Condition Rules (AND)**
```
"Add a decision called Approval_Check with rule Manager_Approval if Status = 'Pending' and Amount > 5000 then Manager_Review"
```
Creates:
- Rule: Manager_Approval
- Condition logic: AND
- Conditions: Status = 'Pending', Amount > 5000
- Connector: Manager_Review

**FR3: Parse Multiple Condition Rules (OR)**
```
"Add a decision called Priority_Check with rule High_Priority if Type = 'Urgent' or Amount > 50000 then Fast_Track"
```
Creates:
- Rule: High_Priority
- Condition logic: OR
- Conditions: Type = 'Urgent', Amount > 50000
- Connector: Fast_Track

**FR4: Parse Multiple Rules on Single Decision**
```
"Add a decision called Route_Case with rule VIP if AccountType = 'Premium' then VIP_Queue and rule Standard if AccountType = 'Basic' then Standard_Queue"
```
Creates decision with 2 rules.

**FR5: Support Common Operators**
- Equals: `=`, `equals`, `is`
- Not equals: `!=`, `<>`, `not equals`, `is not`
- Greater than: `>`, `greater than`
- Less than: `<`, `less than`
- Greater or equal: `>=`, `at least`
- Less or equal: `<=`, `at most`
- Contains: `contains`
- Starts with: `starts with`
- Ends with: `ends with`

**FR6: Auto-Detect Value Types**
- Numbers: `10000`, `5.5`
- Strings: `'Pending'`, `"Approved"`
- Booleans: `true`, `false`
- Null: `null`, `blank`, `empty`

### Non-Functional Requirements

**NFR1: Performance**
- Parse complex rules in < 10ms
- No performance degradation vs Phase 2.2

**NFR2: Backward Compatibility**
- Phase 2.2 functionality fully preserved
- Decisions without rules still work

**NFR3: Error Handling**
- Clear error messages for unparseable conditions
- Validation of operator/value type compatibility
- Helpful suggestions for common mistakes

**NFR4: Test Coverage**
- 100% test pass rate
- Cover all operators and logic types
- Edge cases for value types

## Technical Design

### Architecture

```
FlowNLPModifier
    ↓ parseInstruction()
    ↓ detects "with rule" pattern
    ↓ parseRuleDefinition()
    ↓ parseCondition()
    ↓
FlowElementTemplates
    ↓ createDecision()
    ↓ createDecisionRule()
    ↓ createCondition()
```

### New Components

**1. FlowConditionParser (NEW)**
```javascript
class FlowConditionParser {
    /**
     * Parse natural language condition into Flow condition object
     * @param {string} conditionString - "Amount > 10000"
     * @returns {Object} Flow condition structure
     */
    parseCondition(conditionString)

    /**
     * Parse operator from natural language
     * @param {string} operator - ">", "equals", "contains", etc.
     * @returns {string} Flow operator (EqualTo, GreaterThan, etc.)
     */
    parseOperator(operator)

    /**
     * Auto-detect value type and create proper value structure
     * @param {string} value - "10000", "'Pending'", "true", etc.
     * @returns {Object} { type, value }
     */
    parseValue(value)

    /**
     * Validate operator is compatible with value types
     * @param {string} operator - Flow operator
     * @param {string} leftType - Left operand type
     * @param {string} rightType - Right operand type
     * @returns {boolean} Is valid
     */
    validateOperatorTypes(operator, leftType, rightType)
}
```

**2. Enhanced FlowElementTemplates**
```javascript
// Add to existing FlowElementTemplates class

/**
 * Create condition object
 * @param {Object} config - { field, operator, value, valueType }
 * @returns {Object} Flow condition structure
 */
createCondition(config)
```

**3. Enhanced FlowNLPModifier**
```javascript
// Add to existing FlowNLPModifier class

/**
 * Parse rule definition from natural language
 * @param {string} ruleString - "if Amount > 10000 then Approved_Path"
 * @returns {Object} { name, conditions, conditionLogic, target }
 */
parseRuleDefinition(ruleString)

/**
 * Parse multiple conditions connected by AND/OR
 * @param {string} conditionsString - "Status = 'Pending' and Amount > 5000"
 * @returns {Array} Array of condition objects
 */
parseConditions(conditionsString)
```

### Data Structures

**Flow Condition Object**:
```javascript
{
    leftValueReference: 'Amount',  // Field reference
    operator: 'GreaterThan',       // Flow operator
    rightValue: {                  // Value structure
        numberValue: 10000
    }
}
```

**Flow Decision Rule Object**:
```javascript
{
    name: 'High_Value',
    label: 'High Value',
    conditionLogic: 'and',         // or 'or', or custom '1 AND (2 OR 3)'
    conditions: [
        {
            leftValueReference: 'Amount',
            operator: 'GreaterThan',
            rightValue: { numberValue: 10000 }
        }
    ],
    connector: {
        targetReference: 'Approved_Path'
    }
}
```

## Implementation Plan

### Step 1: Create FlowConditionParser
- [ ] Create `scripts/lib/flow-condition-parser.js`
- [ ] Implement operator mapping
- [ ] Implement value type detection
- [ ] Implement condition parsing
- [ ] Add validation logic

### Step 2: Enhance FlowElementTemplates
- [ ] Add `createCondition()` method
- [ ] Enhance `createDecisionRule()` to use parsed conditions
- [ ] Add condition validation

### Step 3: Enhance FlowNLPModifier
- [ ] Add rule pattern detection in `parseInstruction()`
- [ ] Implement `parseRuleDefinition()`
- [ ] Implement `parseConditions()`
- [ ] Integrate with FlowConditionParser
- [ ] Update `parseElementOptions()` to handle rules

### Step 4: Create Test Suite
- [ ] Create `test/flow-condition-parser.test.js`
- [ ] Create `test/flow-nlp-modifier-phase2.3.test.js`
- [ ] Test all operators
- [ ] Test AND/OR logic
- [ ] Test value type detection
- [ ] Test multiple rules
- [ ] Test edge cases

### Step 5: Documentation
- [ ] Create `PHASE_2.3_COMPLETE.md`
- [ ] Update FlowNLPModifier usage examples
- [ ] Document operator mappings
- [ ] Document value type detection rules

## Operator Mappings

| Natural Language | Flow Operator | Value Types |
|------------------|---------------|-------------|
| `=`, `equals`, `is` | `EqualTo` | Any |
| `!=`, `<>`, `not equals`, `is not` | `NotEqualTo` | Any |
| `>`, `greater than` | `GreaterThan` | Number, Date |
| `<`, `less than` | `LessThan` | Number, Date |
| `>=`, `at least` | `GreaterThanOrEqualTo` | Number, Date |
| `<=`, `at most` | `LessThanOrEqualTo` | Number, Date |
| `contains` | `Contains` | String |
| `starts with` | `StartsWith` | String |
| `ends with` | `EndsWith` | String |
| `is null`, `is blank`, `is empty` | `IsNull` | Any |
| `is not null`, `is not blank` | `IsNull` (with NOT logic) | Any |

## Value Type Detection Rules

| Pattern | Type | Example |
|---------|------|---------|
| Numeric (no quotes) | Number | `10000`, `5.5`, `-100` |
| Quoted string | String | `'Pending'`, `"Approved"` |
| `true` / `false` | Boolean | `true`, `false` |
| `null`, `blank`, `empty` | Null | `null` |
| Unquoted (not number/bool) | Field reference | `AccountName`, `Today` |

## Example Outputs

### Simple Rule
**Input**:
```
Add a decision called Amount_Check with rule High_Value if Amount > 10000 then Large_Deal_Path
```

**Output** (Flow XML):
```xml
<decisions>
    <name>Amount_Check</name>
    <label>Amount Check</label>
    <defaultConnectorLabel>Default</defaultConnectorLabel>
    <rules>
        <name>High_Value</name>
        <label>High Value</label>
        <conditionLogic>and</conditionLogic>
        <conditions>
            <leftValueReference>Amount</leftValueReference>
            <operator>GreaterThan</operator>
            <rightValue>
                <numberValue>10000</numberValue>
            </rightValue>
        </conditions>
        <connector>
            <targetReference>Large_Deal_Path</targetReference>
        </connector>
    </rules>
</decisions>
```

### Multiple Conditions (AND)
**Input**:
```
Add a decision called Approval_Check with rule Needs_Manager if Status = 'Pending' and Amount > 5000 then Manager_Review
```

**Output**:
```xml
<rules>
    <name>Needs_Manager</name>
    <label>Needs Manager</label>
    <conditionLogic>and</conditionLogic>
    <conditions>
        <leftValueReference>Status</leftValueReference>
        <operator>EqualTo</operator>
        <rightValue>
            <stringValue>Pending</stringValue>
        </rightValue>
    </conditions>
    <conditions>
        <leftValueReference>Amount</leftValueReference>
        <operator>GreaterThan</operator>
        <rightValue>
            <numberValue>5000</numberValue>
        </rightValue>
    </conditions>
    <connector>
        <targetReference>Manager_Review</targetReference>
    </connector>
</rules>
```

### Multiple Rules
**Input**:
```
Add a decision called Route_Lead with rule Hot if Rating = 'Hot' then Sales_Team and rule Warm if Rating = 'Warm' then Marketing_Team
```

**Output**: Decision with 2 rules, each with own conditions and connectors.

## Success Criteria

- [ ] All operators supported (9 total)
- [ ] AND/OR condition logic working
- [ ] Multiple rules on single decision working
- [ ] Value type auto-detection accurate
- [ ] 100% test pass rate (target: 20+ tests)
- [ ] Backward compatibility with Phase 2.2
- [ ] Performance < 10ms per rule parsing
- [ ] Clear error messages for invalid syntax

## Risks & Mitigations

**Risk 1**: Complex condition parsing may be error-prone
- **Mitigation**: Comprehensive test suite, clear error messages, gradual complexity increase

**Risk 2**: Value type detection may be ambiguous
- **Mitigation**: Clear rules, prefer explicit quotes for strings, good defaults

**Risk 3**: Operator compatibility validation may miss edge cases
- **Mitigation**: Conservative validation, allow overrides, document limitations

**Risk 4**: Multiple rule parsing may conflict with other patterns
- **Mitigation**: Careful regex ordering, keyword detection, test coverage

## Dependencies

- FlowElementTemplates (Phase 2.2) ✅
- FlowXMLParser (Phase 2.1) ✅
- FlowNLPModifier (Phase 2.2) ✅

## Timeline Estimate

- **Step 1** (FlowConditionParser): 1-2 hours
- **Step 2** (Enhance Templates): 30 minutes
- **Step 3** (Enhance NLP Modifier): 1-2 hours
- **Step 4** (Testing): 1-2 hours
- **Step 5** (Documentation): 30 minutes

**Total**: 4-7 hours for complete implementation

## Notes

- Start with simple single-condition rules, then add complexity
- Focus on common operators first (=, !=, >, <)
- Ensure excellent error messages to guide users
- Consider adding operator suggestions for typos
- Document limitations clearly (no formulas, no nested logic yet)

---

**Status**: Ready to implement
**Next Action**: Create FlowConditionParser class
