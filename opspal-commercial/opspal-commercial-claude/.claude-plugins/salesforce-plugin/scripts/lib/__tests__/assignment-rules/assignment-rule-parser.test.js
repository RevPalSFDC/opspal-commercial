/**
 * Unit Tests for Assignment Rule Parser
 *
 * Tests XML parsing, criteria extraction, assignee identification,
 * rule evaluation order, validation, and XML building.
 *
 * Target Coverage: 80%+
 */

const {
  parseRuleMetadata,
  extractCriteria,
  identifyAssigneeType,
  getRuleEvaluationOrder,
  generateRuleSummary,
  validateRuleStructure,
  buildAssignmentRuleXML
} = require('../../assignment-rule-parser');

describe('assignment-rule-parser', () => {
  // Sample valid XML for testing
  const validXML = `<?xml version="1.0" encoding="UTF-8"?>
<AssignmentRules xmlns="http://soap.sforce.com/2006/04/metadata">
    <fullName>Lead</fullName>
    <assignmentRule>
        <active>true</active>
        <name>Lead_Assign_Healthcare_CA</name>
        <ruleEntry>
            <order>1</order>
            <criteriaItems>
                <field>Industry</field>
                <operation>equals</operation>
                <value>Healthcare</value>
            </criteriaItems>
            <criteriaItems>
                <field>State</field>
                <operation>equals</operation>
                <value>CA</value>
            </criteriaItems>
            <assignedTo>00G1234567890ABC</assignedTo>
            <assignedToType>Queue</assignedToType>
        </ruleEntry>
        <ruleEntry>
            <order>2</order>
            <assignedTo>0051234567890DEF</assignedTo>
            <assignedToType>User</assignedToType>
        </ruleEntry>
    </assignmentRule>
</AssignmentRules>`;

  describe('parseRuleMetadata', () => {
    test('should parse valid XML successfully', () => {
      const result = parseRuleMetadata(validXML);

      expect(result).toHaveProperty('objectType', 'Lead');
      expect(result).toHaveProperty('assignmentRules');
      expect(result.assignmentRules).toHaveLength(1);
      expect(result.assignmentRules[0].name).toBe('Lead_Assign_Healthcare_CA');
      expect(result.assignmentRules[0].active).toBe(true);
      expect(result.assignmentRules[0].entries).toHaveLength(2);
    });

    test('should extract entries correctly', () => {
      const result = parseRuleMetadata(validXML);
      const entries = result.assignmentRules[0].entries;

      expect(entries[0].order).toBe(1);
      expect(entries[0].assignedTo).toBe('00G1234567890ABC');
      expect(entries[0].assignedToType).toBe('Queue');
      expect(entries[0].criteriaItems).toHaveLength(2);

      expect(entries[1].order).toBe(2);
      expect(entries[1].assignedTo).toBe('0051234567890DEF');
      expect(entries[1].assignedToType).toBe('User');
    });

    test('should extract criteria items correctly', () => {
      const result = parseRuleMetadata(validXML);
      const criteria = result.assignmentRules[0].entries[0].criteriaItems;

      expect(criteria[0]).toEqual({
        field: 'Industry',
        operation: 'equals',
        value: 'Healthcare',
        valueField: null
      });

      expect(criteria[1]).toEqual({
        field: 'State',
        operation: 'equals',
        value: 'CA',
        valueField: null
      });
    });

    test('should throw error for invalid XML', () => {
      expect(() => parseRuleMetadata('<invalid>xml</invalid>')).toThrow();
    });

    test('should throw error for null input', () => {
      expect(() => parseRuleMetadata(null)).toThrow('Invalid input');
    });

    test('should throw error for empty string', () => {
      expect(() => parseRuleMetadata('')).toThrow('Invalid input');
    });

    test('should throw error for non-string input', () => {
      expect(() => parseRuleMetadata(123)).toThrow('Invalid input');
    });

    test('should parse rule with formula criteria', () => {
      const xmlWithFormula = `<?xml version="1.0" encoding="UTF-8"?>
<AssignmentRules xmlns="http://soap.sforce.com/2006/04/metadata">
    <fullName>Lead</fullName>
    <assignmentRule>
        <active>true</active>
        <name>Formula_Rule</name>
        <ruleEntry>
            <order>1</order>
            <formula>TEXT(Industry) = "Healthcare" AND State = "CA"</formula>
            <assignedTo>00G1234567890ABC</assignedTo>
            <assignedToType>Queue</assignedToType>
        </ruleEntry>
    </assignmentRule>
</AssignmentRules>`;

      const result = parseRuleMetadata(xmlWithFormula);
      expect(result.assignmentRules[0].entries[0].formula).toBe('TEXT(Industry) = "Healthcare" AND State = "CA"');
    });

    test('should parse rule with booleanFilter', () => {
      const xmlWithFilter = `<?xml version="1.0" encoding="UTF-8"?>
<AssignmentRules xmlns="http://soap.sforce.com/2006/04/metadata">
    <fullName>Lead</fullName>
    <assignmentRule>
        <active>true</active>
        <name>Filter_Rule</name>
        <ruleEntry>
            <order>1</order>
            <booleanFilter>1 OR 2</booleanFilter>
            <criteriaItems>
                <field>Industry</field>
                <operation>equals</operation>
                <value>Healthcare</value>
            </criteriaItems>
            <criteriaItems>
                <field>Industry</field>
                <operation>equals</operation>
                <value>Technology</value>
            </criteriaItems>
            <assignedTo>00G1234567890ABC</assignedTo>
            <assignedToType>Queue</assignedToType>
        </ruleEntry>
    </assignmentRule>
</AssignmentRules>`;

      const result = parseRuleMetadata(xmlWithFilter);
      expect(result.assignmentRules[0].entries[0].booleanFilter).toBe('1 OR 2');
    });

    test('should parse rule with emailTemplate', () => {
      const xmlWithEmail = `<?xml version="1.0" encoding="UTF-8"?>
<AssignmentRules xmlns="http://soap.sforce.com/2006/04/metadata">
    <fullName>Lead</fullName>
    <assignmentRule>
        <active>true</active>
        <name>Email_Rule</name>
        <ruleEntry>
            <order>1</order>
            <assignedTo>00G1234567890ABC</assignedTo>
            <assignedToType>Queue</assignedToType>
            <emailTemplate>00X1234567890ABC</emailTemplate>
        </ruleEntry>
    </assignmentRule>
</AssignmentRules>`;

      const result = parseRuleMetadata(xmlWithEmail);
      expect(result.assignmentRules[0].entries[0].emailTemplate).toBe('00X1234567890ABC');
    });

    test('should parse rule with disableRule flag', () => {
      const xmlWithDisable = `<?xml version="1.0" encoding="UTF-8"?>
<AssignmentRules xmlns="http://soap.sforce.com/2006/04/metadata">
    <fullName>Lead</fullName>
    <assignmentRule>
        <active>true</active>
        <name>Disable_Rule</name>
        <ruleEntry>
            <order>1</order>
            <assignedTo>00G1234567890ABC</assignedTo>
            <assignedToType>Queue</assignedToType>
            <disableRule>true</disableRule>
        </ruleEntry>
    </assignmentRule>
</AssignmentRules>`;

      const result = parseRuleMetadata(xmlWithDisable);
      expect(result.assignmentRules[0].entries[0].disableRule).toBe(true);
    });

    test('should parse multiple assignment rules', () => {
      const xmlMultiple = `<?xml version="1.0" encoding="UTF-8"?>
<AssignmentRules xmlns="http://soap.sforce.com/2006/04/metadata">
    <fullName>Lead</fullName>
    <assignmentRule>
        <active>true</active>
        <name>Rule_1</name>
        <ruleEntry>
            <order>1</order>
            <assignedTo>00G1111111111111</assignedTo>
            <assignedToType>Queue</assignedToType>
        </ruleEntry>
    </assignmentRule>
    <assignmentRule>
        <active>false</active>
        <name>Rule_2</name>
        <ruleEntry>
            <order>1</order>
            <assignedTo>00G2222222222222</assignedTo>
            <assignedToType>Queue</assignedToType>
        </ruleEntry>
    </assignmentRule>
</AssignmentRules>`;

      const result = parseRuleMetadata(xmlMultiple);
      expect(result.assignmentRules).toHaveLength(2);
      expect(result.assignmentRules[0].name).toBe('Rule_1');
      expect(result.assignmentRules[0].active).toBe(true);
      expect(result.assignmentRules[1].name).toBe('Rule_2');
      expect(result.assignmentRules[1].active).toBe(false);
    });
  });

  describe('extractCriteria', () => {
    test('should extract criteria from rule entry', () => {
      const parsed = parseRuleMetadata(validXML);
      const entry = parsed.assignmentRules[0].entries[0];
      const criteria = extractCriteria(entry);

      expect(criteria).toHaveLength(2);
      expect(criteria[0]).toEqual({
        field: 'Industry',
        operator: 'equals',
        value: 'Healthcare',
        isFieldReference: false
      });
      expect(criteria[1]).toEqual({
        field: 'State',
        operator: 'equals',
        value: 'CA',
        isFieldReference: false
      });
    });

    test('should return empty array for null input', () => {
      expect(extractCriteria(null)).toEqual([]);
    });

    test('should return empty array for entry with no criteria', () => {
      expect(extractCriteria({ criteriaItems: [] })).toEqual([]);
    });

    test('should handle criteria with valueField', () => {
      const entry = {
        criteriaItems: [
          {
            field: 'State',
            operation: 'equals',
            valueField: 'BillingState'
          }
        ]
      };

      const criteria = extractCriteria(entry);
      expect(criteria[0]).toEqual({
        field: 'State',
        operator: 'equals',
        value: 'BillingState',
        isFieldReference: true
      });
    });

    test('should default to equals operator if not specified', () => {
      const entry = {
        criteriaItems: [
          {
            field: 'Status',
            value: 'Open'
          }
        ]
      };

      const criteria = extractCriteria(entry);
      expect(criteria[0].operator).toBe('equals');
    });
  });

  describe('identifyAssigneeType', () => {
    test('should identify User (005 prefix)', () => {
      expect(identifyAssigneeType('0051234567890ABC')).toBe('User');
      expect(identifyAssigneeType('005123456789012')).toBe('User');
    });

    test('should identify Queue (00G prefix)', () => {
      expect(identifyAssigneeType('00G1234567890ABC')).toBe('Queue');
      expect(identifyAssigneeType('00G123456789012')).toBe('Queue');
    });

    test('should identify Role (00E prefix)', () => {
      expect(identifyAssigneeType('00E1234567890ABC')).toBe('Role');
      expect(identifyAssigneeType('00E123456789012')).toBe('Role');
    });

    test('should identify Territory (0TM prefix)', () => {
      expect(identifyAssigneeType('0TM1234567890ABC')).toBe('Territory');
      expect(identifyAssigneeType('0TM123456789012')).toBe('Territory');
    });

    test('should return Unknown for unrecognized prefix', () => {
      expect(identifyAssigneeType('0011234567890ABC')).toBe('Unknown');
      expect(identifyAssigneeType('XXX1234567890ABC')).toBe('Unknown');
    });

    test('should return Unknown for null input', () => {
      expect(identifyAssigneeType(null)).toBe('Unknown');
    });

    test('should return Unknown for undefined input', () => {
      expect(identifyAssigneeType(undefined)).toBe('Unknown');
    });

    test('should return Unknown for non-string input', () => {
      expect(identifyAssigneeType(12345)).toBe('Unknown');
    });

    test('should handle 18-character IDs (case-safe)', () => {
      expect(identifyAssigneeType('0051234567890ABCDE')).toBe('User');
      expect(identifyAssigneeType('00G1234567890ABCDE')).toBe('Queue');
    });
  });

  describe('getRuleEvaluationOrder', () => {
    test('should sort entries by order number', () => {
      const rule = {
        entries: [
          { order: 3, name: 'Third' },
          { order: 1, name: 'First' },
          { order: 2, name: 'Second' }
        ]
      };

      const sorted = getRuleEvaluationOrder(rule);
      expect(sorted[0].order).toBe(1);
      expect(sorted[1].order).toBe(2);
      expect(sorted[2].order).toBe(3);
    });

    test('should return empty array for null input', () => {
      expect(getRuleEvaluationOrder(null)).toEqual([]);
    });

    test('should return empty array for rule with no entries', () => {
      expect(getRuleEvaluationOrder({ entries: [] })).toEqual([]);
    });

    test('should handle entries with same order number', () => {
      const rule = {
        entries: [
          { order: 1, name: 'First' },
          { order: 1, name: 'Also First' },
          { order: 2, name: 'Second' }
        ]
      };

      const sorted = getRuleEvaluationOrder(rule);
      expect(sorted).toHaveLength(3);
      expect(sorted[0].order).toBe(1);
      expect(sorted[1].order).toBe(1);
      expect(sorted[2].order).toBe(2);
    });

    test('should not mutate original array', () => {
      const rule = {
        entries: [
          { order: 2, name: 'Second' },
          { order: 1, name: 'First' }
        ]
      };

      const sorted = getRuleEvaluationOrder(rule);
      expect(rule.entries[0].order).toBe(2); // Original unchanged
      expect(sorted[0].order).toBe(1); // Sorted result
    });
  });

  describe('generateRuleSummary', () => {
    test('should generate complete summary', () => {
      const parsed = parseRuleMetadata(validXML);
      const rule = parsed.assignmentRules[0];
      const summary = generateRuleSummary(rule);

      expect(summary.ruleName).toBe('Lead_Assign_Healthcare_CA');
      expect(summary.isActive).toBe(true);
      expect(summary.totalEntries).toBe(2);
      expect(summary.assigneeBreakdown.users).toBe(1);
      expect(summary.assigneeBreakdown.queues).toBe(1);
    });

    test('should return null for null input', () => {
      expect(generateRuleSummary(null)).toBeNull();
    });

    test('should count assignee types correctly', () => {
      const rule = {
        name: 'Test Rule',
        active: true,
        entries: [
          { assignedTo: '0051111111111111', assignedToType: 'User' },
          { assignedTo: '0052222222222222', assignedToType: 'User' },
          { assignedTo: '00G1111111111111', assignedToType: 'Queue' },
          { assignedTo: '00E1111111111111', assignedToType: 'Role' },
          { assignedTo: '0TM1111111111111', assignedToType: 'Territory' }
        ]
      };

      const summary = generateRuleSummary(rule);
      expect(summary.assigneeBreakdown.users).toBe(2);
      expect(summary.assigneeBreakdown.queues).toBe(1);
      expect(summary.assigneeBreakdown.roles).toBe(1);
      expect(summary.assigneeBreakdown.territories).toBe(1);
    });

    test('should detect formula entries', () => {
      const rule = {
        name: 'Formula Rule',
        active: true,
        entries: [
          { assignedTo: '00G1111111111111', formula: 'Industry = "Tech"' }
        ]
      };

      const summary = generateRuleSummary(rule);
      expect(summary.hasFormulaEntries).toBe(true);
    });

    test('should detect boolean filters', () => {
      const rule = {
        name: 'Filter Rule',
        active: true,
        entries: [
          { assignedTo: '00G1111111111111', booleanFilter: '1 OR 2' }
        ]
      };

      const summary = generateRuleSummary(rule);
      expect(summary.hasBooleanFilters).toBe(true);
    });

    test('should count disabled entries', () => {
      const rule = {
        name: 'Disabled Rule',
        active: true,
        entries: [
          { assignedTo: '00G1111111111111', disableRule: true },
          { assignedTo: '00G2222222222222', disableRule: false },
          { assignedTo: '00G3333333333333' }
        ]
      };

      const summary = generateRuleSummary(rule);
      expect(summary.disabledEntries).toBe(1);
    });
  });

  describe('validateRuleStructure', () => {
    test('should return no issues for valid rule', () => {
      const parsed = parseRuleMetadata(validXML);
      const rule = parsed.assignmentRules[0];
      const issues = validateRuleStructure(rule);

      expect(issues).toHaveLength(0);
    });

    test('should detect missing rule name', () => {
      const rule = {
        active: true,
        entries: []
      };

      const issues = validateRuleStructure(rule);
      expect(issues).toContainEqual(
        expect.objectContaining({
          severity: 'critical',
          field: 'name',
          message: 'Rule name is required'
        })
      );
    });

    test('should warn about no entries', () => {
      const rule = {
        name: 'Empty Rule',
        active: true,
        entries: []
      };

      const issues = validateRuleStructure(rule);
      expect(issues).toContainEqual(
        expect.objectContaining({
          severity: 'warning',
          field: 'entries',
          message: 'Rule has no entries'
        })
      );
    });

    test('should detect missing order', () => {
      const rule = {
        name: 'Test Rule',
        entries: [
          { assignedTo: '00G1111111111111' }
        ]
      };

      const issues = validateRuleStructure(rule);
      expect(issues).toContainEqual(
        expect.objectContaining({
          severity: 'critical',
          message: 'Entry order is required'
        })
      );
    });

    test('should detect missing assignee', () => {
      const rule = {
        name: 'Test Rule',
        entries: [
          { order: 1, criteriaItems: [] }
        ]
      };

      const issues = validateRuleStructure(rule);
      expect(issues).toContainEqual(
        expect.objectContaining({
          severity: 'critical',
          message: 'Entry must have an assignee'
        })
      );
    });

    test('should warn about entry with no criteria or formula', () => {
      const rule = {
        name: 'Test Rule',
        entries: [
          { order: 1, assignedTo: '00G1111111111111', criteriaItems: [] }
        ]
      };

      const issues = validateRuleStructure(rule);
      expect(issues).toContainEqual(
        expect.objectContaining({
          severity: 'warning',
          message: expect.stringContaining('will match all records')
        })
      );
    });

    test('should detect duplicate order numbers', () => {
      const rule = {
        name: 'Test Rule',
        entries: [
          { order: 1, assignedTo: '00G1111111111111', criteriaItems: [{}] },
          { order: 1, assignedTo: '00G2222222222222', criteriaItems: [{}] }
        ]
      };

      const issues = validateRuleStructure(rule);
      const duplicateIssues = issues.filter(i => i.message.includes('Duplicate order'));
      expect(duplicateIssues.length).toBeGreaterThan(0);
    });

    test('should return critical issue for null rule', () => {
      const issues = validateRuleStructure(null);
      expect(issues).toContainEqual(
        expect.objectContaining({
          severity: 'critical',
          message: 'Assignment rule is null or undefined'
        })
      );
    });
  });

  describe('buildAssignmentRuleXML', () => {
    test('should build valid XML from parsed data', () => {
      const ruleData = {
        objectType: 'Lead',
        assignmentRules: [
          {
            name: 'Test Rule',
            active: true,
            entries: [
              {
                order: 1,
                criteriaItems: [
                  {
                    field: 'Industry',
                    operation: 'equals',
                    value: 'Healthcare'
                  }
                ],
                assignedTo: '00G1234567890ABC',
                assignedToType: 'Queue'
              }
            ]
          }
        ]
      };

      const xml = buildAssignmentRuleXML(ruleData);

      expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
      expect(xml).toContain('<AssignmentRules xmlns="http://soap.sforce.com/2006/04/metadata">');
      expect(xml).toContain('<fullName>Lead</fullName>');
      expect(xml).toContain('<name>Test Rule</name>');
      expect(xml).toContain('<active>true</active>');
      expect(xml).toContain('<order>1</order>');
      expect(xml).toContain('<field>Industry</field>');
      expect(xml).toContain('<operation>equals</operation>');
      expect(xml).toContain('<value>Healthcare</value>');
      expect(xml).toContain('<assignedTo>00G1234567890ABC</assignedTo>');
    });

    test('should escape XML special characters', () => {
      const ruleData = {
        objectType: 'Lead',
        assignmentRules: [
          {
            name: 'Test & Rule <Special>',
            active: true,
            entries: [
              {
                order: 1,
                criteriaItems: [
                  {
                    field: 'Description',
                    operation: 'contains',
                    value: 'Test & "Special" <Value>'
                  }
                ],
                assignedTo: '00G1234567890ABC',
                assignedToType: 'Queue'
              }
            ]
          }
        ]
      };

      const xml = buildAssignmentRuleXML(ruleData);

      expect(xml).toContain('Test &amp; Rule &lt;Special&gt;');
      expect(xml).toContain('Test &amp; &quot;Special&quot; &lt;Value&gt;');
    });

    test('should handle formula entries', () => {
      const ruleData = {
        objectType: 'Lead',
        assignmentRules: [
          {
            name: 'Formula Rule',
            active: true,
            entries: [
              {
                order: 1,
                formula: 'TEXT(Industry) = "Healthcare"',
                assignedTo: '00G1234567890ABC',
                assignedToType: 'Queue'
              }
            ]
          }
        ]
      };

      const xml = buildAssignmentRuleXML(ruleData);

      expect(xml).toContain('<formula>TEXT(Industry) = &quot;Healthcare&quot;</formula>');
    });

    test('should handle boolean filters', () => {
      const ruleData = {
        objectType: 'Lead',
        assignmentRules: [
          {
            name: 'Filter Rule',
            active: false,
            entries: [
              {
                order: 1,
                booleanFilter: '1 OR 2',
                criteriaItems: [
                  { field: 'Status', operation: 'equals', value: 'Open' }
                ],
                assignedTo: '00G1234567890ABC',
                assignedToType: 'Queue'
              }
            ]
          }
        ]
      };

      const xml = buildAssignmentRuleXML(ruleData);

      expect(xml).toContain('<active>false</active>');
      expect(xml).toContain('<booleanFilter>1 OR 2</booleanFilter>');
    });

    test('should throw error for missing objectType', () => {
      expect(() => buildAssignmentRuleXML({})).toThrow('objectType is required');
    });

    test('should throw error for null input', () => {
      expect(() => buildAssignmentRuleXML(null)).toThrow('objectType is required');
    });

    test('should round-trip parse and build', () => {
      const parsed = parseRuleMetadata(validXML);
      const rebuilt = buildAssignmentRuleXML(parsed);
      const reparsed = parseRuleMetadata(rebuilt);

      expect(reparsed.objectType).toBe(parsed.objectType);
      expect(reparsed.assignmentRules[0].name).toBe(parsed.assignmentRules[0].name);
      expect(reparsed.assignmentRules[0].active).toBe(parsed.assignmentRules[0].active);
      expect(reparsed.assignmentRules[0].entries.length).toBe(parsed.assignmentRules[0].entries.length);
    });
  });
});
