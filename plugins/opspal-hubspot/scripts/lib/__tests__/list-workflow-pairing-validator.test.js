/**
 * Tests for List-Workflow Pairing Validator
 *
 * Related reflections: 44f17e3e
 */

const {
  LIST_ENROLLMENT_TRIGGERS,
  LIST_MODIFYING_ACTIONS,
  extractListReferences,
  validateListExists,
  validateWorkflowListPairings,
  findOrphanedLists,
  findOrphanedWorkflows,
  generatePairingReport
} = require('../list-workflow-pairing-validator');

describe('List-Workflow Pairing Validator', () => {
  describe('extractListReferences', () => {
    it('should extract enrollment list references', () => {
      const workflow = {
        id: 'wf1',
        name: 'Test Workflow',
        enrollmentCriteria: {
          triggers: [
            { type: 'LIST_MEMBERSHIP', listId: 'list1' }
          ]
        }
      };

      const result = extractListReferences(workflow);

      expect(result.enrollmentLists).toHaveLength(1);
      expect(result.enrollmentLists[0].listId).toBe('list1');
      expect(result.allListIds).toContain('list1');
    });

    it('should extract action list references', () => {
      const workflow = {
        id: 'wf1',
        name: 'Test Workflow',
        actions: [
          { type: 'ADD_TO_LIST', listId: 'list2' },
          { type: 'REMOVE_FROM_LIST', listId: 'list3' }
        ]
      };

      const result = extractListReferences(workflow);

      expect(result.actionLists).toHaveLength(2);
      expect(result.allListIds).toContain('list2');
      expect(result.allListIds).toContain('list3');
    });

    it('should extract suppression list references', () => {
      const workflow = {
        id: 'wf1',
        name: 'Test Workflow',
        suppressionListIds: ['list4', 'list5']
      };

      const result = extractListReferences(workflow);

      expect(result.suppressionLists).toHaveLength(2);
      expect(result.allListIds).toContain('list4');
      expect(result.allListIds).toContain('list5');
    });

    it('should deduplicate list IDs', () => {
      const workflow = {
        id: 'wf1',
        name: 'Test Workflow',
        enrollmentCriteria: {
          triggers: [{ type: 'LIST_MEMBERSHIP', listId: 'list1' }]
        },
        suppressionListIds: ['list1']
      };

      const result = extractListReferences(workflow);

      expect(result.allListIds).toHaveLength(1);
    });
  });

  describe('validateListExists', () => {
    const availableLists = [
      { listId: 'list1', name: 'Active List', listType: 'DYNAMIC', deleted: false, archived: false },
      { listId: 'list2', name: 'Deleted List', listType: 'STATIC', deleted: true, archived: false },
      { listId: 'list3', name: 'Archived List', listType: 'STATIC', deleted: false, archived: true }
    ];

    it('should validate existing active list', () => {
      const result = validateListExists('list1', availableLists);

      expect(result.exists).toBe(true);
      expect(result.isActive).toBe(true);
      expect(result.listName).toBe('Active List');
      expect(result.error).toBeNull();
    });

    it('should detect deleted list', () => {
      const result = validateListExists('list2', availableLists);

      expect(result.exists).toBe(true);
      expect(result.isActive).toBe(false);
      expect(result.error).toBe('List has been deleted');
    });

    it('should detect archived list', () => {
      const result = validateListExists('list3', availableLists);

      expect(result.exists).toBe(true);
      expect(result.isActive).toBe(false);
      expect(result.error).toBe('List is archived');
    });

    it('should handle missing list', () => {
      const result = validateListExists('list99', availableLists);

      expect(result.exists).toBe(false);
      expect(result.error).toBe('List list99 not found');
    });
  });

  describe('validateWorkflowListPairings', () => {
    const availableLists = [
      { listId: 'list1', name: 'Active List', listType: 'DYNAMIC', deleted: false, archived: false },
      { listId: 'list2', name: 'Static List', listType: 'STATIC', deleted: false, archived: false }
    ];

    it('should validate workflow with existing lists', () => {
      const workflow = {
        id: 'wf1',
        name: 'Test Workflow',
        enrollmentCriteria: {
          triggers: [{ type: 'LIST_MEMBERSHIP', listId: 'list1' }]
        }
      };

      const result = validateWorkflowListPairings(workflow, availableLists);

      expect(result.valid).toBe(true);
      expect(result.issues).toHaveLength(0);
    });

    it('should detect missing list', () => {
      const workflow = {
        id: 'wf1',
        name: 'Test Workflow',
        enrollmentCriteria: {
          triggers: [{ type: 'LIST_MEMBERSHIP', listId: 'missing' }]
        }
      };

      const result = validateWorkflowListPairings(workflow, availableLists);

      expect(result.valid).toBe(false);
      expect(result.issues.some(i => i.type === 'list_not_found')).toBe(true);
    });

    it('should warn about static list enrollment', () => {
      const workflow = {
        id: 'wf1',
        name: 'Test Workflow',
        enrollmentCriteria: {
          triggers: [{ type: 'LIST_MEMBERSHIP', listId: 'list2' }]
        }
      };

      const result = validateWorkflowListPairings(workflow, availableLists);

      expect(result.valid).toBe(true);
      expect(result.warnings.some(w => w.type === 'static_list_enrollment')).toBe(true);
    });

    it('should warn about circular list operations', () => {
      const workflow = {
        id: 'wf1',
        name: 'Test Workflow',
        enrollmentCriteria: {
          triggers: [{ type: 'LIST_MEMBERSHIP', listId: 'list1' }]
        },
        actions: [
          { type: 'ADD_TO_LIST', listId: 'list1' }
        ]
      };

      const result = validateWorkflowListPairings(workflow, availableLists);

      expect(result.warnings.some(w => w.type === 'circular_list_operation')).toBe(true);
    });
  });

  describe('findOrphanedLists', () => {
    it('should find lists not used by any workflow', () => {
      const lists = [
        { listId: 'list1', name: 'Used List' },
        { listId: 'list2', name: 'Orphaned List' }
      ];

      const workflows = [
        {
          id: 'wf1',
          enrollmentCriteria: {
            triggers: [{ type: 'LIST_MEMBERSHIP', listId: 'list1' }]
          }
        }
      ];

      const result = findOrphanedLists(lists, workflows);

      expect(result.orphanedLists).toHaveLength(1);
      expect(result.orphanedLists[0].listId).toBe('list2');
    });
  });

  describe('findOrphanedWorkflows', () => {
    it('should find workflows with missing lists', () => {
      const lists = [
        { listId: 'list1', name: 'Existing List' }
      ];

      const workflows = [
        {
          id: 'wf1',
          name: 'Orphaned Workflow',
          enabled: true,
          enrollmentCriteria: {
            triggers: [{ type: 'LIST_MEMBERSHIP', listId: 'missing' }]
          }
        }
      ];

      const result = findOrphanedWorkflows(workflows, lists);

      expect(result.orphanedWorkflows).toHaveLength(1);
      expect(result.orphanedWorkflows[0].workflowId).toBe('wf1');
      expect(result.orphanedWorkflows[0].missingListIds).toContain('missing');
    });
  });

  describe('generatePairingReport', () => {
    it('should generate comprehensive report', () => {
      const lists = [
        { listId: 'list1', name: 'List 1', deleted: false, archived: false }
      ];

      const workflows = [
        {
          id: 'wf1',
          name: 'Workflow 1',
          enrollmentCriteria: {
            triggers: [{ type: 'LIST_MEMBERSHIP', listId: 'list1' }]
          }
        }
      ];

      const report = generatePairingReport(workflows, lists);

      expect(report.summary.totalWorkflows).toBe(1);
      expect(report.summary.totalLists).toBe(1);
      expect(report.workflowValidations).toHaveLength(1);
      expect(report.timestamp).toBeDefined();
    });

    it('should generate recommendations for issues', () => {
      const lists = [
        { listId: 'list1', name: 'List 1' }
      ];

      const workflows = [
        {
          id: 'wf1',
          name: 'Orphaned Workflow',
          enrollmentCriteria: {
            triggers: [{ type: 'LIST_MEMBERSHIP', listId: 'missing' }]
          }
        }
      ];

      const report = generatePairingReport(workflows, lists);

      expect(report.recommendations.length).toBeGreaterThan(0);
      expect(report.recommendations.some(r => r.priority === 'high')).toBe(true);
    });
  });

  describe('constants', () => {
    it('should export enrollment trigger types', () => {
      expect(LIST_ENROLLMENT_TRIGGERS).toContain('LIST_MEMBERSHIP');
      expect(LIST_ENROLLMENT_TRIGGERS).toContain('CONTACT_LIST_MEMBERSHIP');
    });

    it('should export list modifying action types', () => {
      expect(LIST_MODIFYING_ACTIONS).toContain('ADD_TO_LIST');
      expect(LIST_MODIFYING_ACTIONS).toContain('REMOVE_FROM_LIST');
    });
  });
});
